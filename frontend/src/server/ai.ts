import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { DISCLAIMER, SYMPTOMS, matchSymptomText } from "@/domain/content";
import { SAFETY_CHECK_IDS, checkSafety } from "@/domain/safety";
import type { Explanation, HealthSignal, Persona } from "@/domain/types";
import { config } from "./config";
import type { Trace } from "./trace";

// The language model turns structured evidence into plain language (FR-012) and maps free-text
// symptom descriptions onto the reviewed catalog (FR-009). It never classifies signals, chooses
// care guidance, or sees anything beyond the evidence the deterministic engine selected (FR-017).
//
// Provider: Claude when ANTHROPIC_API_KEY is set, otherwise Groq when GROQ_API_KEY is set.
// Both return schema-constrained JSON, and both go through the same citation and safety checks.

const anthropic = config.llm.provider === "claude" ? new Anthropic({ timeout: 25_000, maxRetries: 1 }) : null;

type Generated<T> = { ok: true; data: T; model: string } | { ok: false; reason: string };

/** Ask the configured model for JSON matching `schema`. Never throws. */
async function generate<T>(trace: Trace, operation: string, schema: z.ZodType<T>, system: string, user: string, maxTokens: number): Promise<Generated<T>> {
  if (config.llm.provider === "claude" && anthropic) return generateWithClaude(trace, operation, schema, system, user, maxTokens);
  if (config.llm.provider === "groq") return generateWithGroq(trace, operation, schema, system, user, maxTokens);
  return { ok: false, reason: "No AI provider is configured on this deployment" };
}

async function generateWithClaude<T>(trace: Trace, operation: string, schema: z.ZodType<T>, system: string, user: string, maxTokens: number): Promise<Generated<T>> {
  try {
    const response = await trace.step("AI", operation, () =>
      anthropic!.beta.messages.parse({
        model: config.llm.model,
        max_tokens: maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "low", format: betaZodOutputFormat(schema) },
        system,
        messages: [{ role: "user", content: user }],
      }),
    (result) => ({ status: result.stop_reason === "refusal" ? "error" : "ok", detail: `${result.model}, ${result.usage.output_tokens} output tokens` }));
    if (response.stop_reason === "refusal") return { ok: false, reason: "The AI declined the request" };
    if (response.stop_reason === "max_tokens") return { ok: false, reason: "The AI's answer was cut off" };
    if (!response.parsed_output) return { ok: false, reason: "The AI's answer did not match the expected format" };
    return { ok: true, data: response.parsed_output, model: response.model };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { ok: false, reason: "The AI is rate limited right now" };
    if (error instanceof Anthropic.APIConnectionError) return { ok: false, reason: "The AI could not be reached" };
    if (error instanceof Anthropic.APIError) return { ok: false, reason: `The AI returned an error (${error.status ?? "unknown"})` };
    return { ok: false, reason: "The AI's answer could not be read" };
  }
}

interface GroqResponse {
  model: string;
  choices: { message: { content: string | null }; finish_reason: string }[];
  usage?: { completion_tokens?: number };
  error?: { message?: string };
}

/** Groq's OpenAI-compatible chat completions with strict JSON-schema output. */
async function generateWithGroq<T>(trace: Trace, operation: string, schema: z.ZodType<T>, system: string, user: string, maxTokens: number): Promise<Generated<T>> {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  let response: GroqResponse;
  try {
    response = await trace.step("AI", operation, async () => {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.llm.groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.llm.model,
          max_completion_tokens: maxTokens,
          reasoning_effort: "low",
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          response_format: { type: "json_schema", json_schema: { name: "meditwin_output", strict: true, schema: jsonSchema } },
        }),
        signal: AbortSignal.timeout(25_000),
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({})) as GroqResponse;
      if (!res.ok) throw new Error(`Groq ${res.status}${body.error?.message ? `: ${body.error.message.slice(0, 120)}` : ""}`);
      return body;
    }, (result) => ({ status: "ok", detail: `${result.model} via Groq, ${result.usage?.completion_tokens ?? "?"} output tokens` }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("429")) return { ok: false, reason: "The AI is rate limited right now" };
    return { ok: false, reason: message.startsWith("Groq") ? "The AI returned an error" : "The AI could not be reached" };
  }
  const choice = response.choices?.[0];
  if (!choice?.message.content) return { ok: false, reason: "The AI returned an empty answer" };
  if (choice.finish_reason === "length") return { ok: false, reason: "The AI's answer was cut off" };
  let json: unknown;
  try { json = JSON.parse(choice.message.content); } catch { return { ok: false, reason: "The AI's answer was not valid JSON" }; }
  const parsed = schema.safeParse(json);
  return parsed.success ? { ok: true, data: parsed.data, model: response.model } : { ok: false, reason: "The AI's answer did not match the expected format" };
}

// ---- Streaming chat (assistant) -----------------------------------------------------------------

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatStreamResult = { model: string; stopReason: "end" | "length" | "refusal" };

const CHAT_TIMEOUT_MS = 45_000;

/**
 * Stream a chat answer as plain text deltas. Throws if the provider can't be reached; the caller
 * decides what the person sees. Records one trace entry when the stream ends.
 */
export async function* streamChat(trace: Trace, system: string, messages: ChatMessage[], signal: AbortSignal): AsyncGenerator<string, ChatStreamResult> {
  const started = performance.now();
  const combined = AbortSignal.any([signal, AbortSignal.timeout(CHAT_TIMEOUT_MS)]);
  let result: ChatStreamResult | null = null;
  try {
    result = config.llm.provider === "claude" && anthropic
      ? yield* streamClaude(system, messages, combined)
      : yield* streamGroq(system, messages, combined);
    return result;
  } finally {
    trace.record({ service: "AI", operation: "assistant answer", status: result && result.stopReason !== "refusal" ? "ok" : "error", ms: Math.round(performance.now() - started),
      detail: result ? `${result.model}${config.llm.provider === "groq" ? " via Groq" : ""}, ${result.stopReason}` : "stream did not complete" });
  }
}

async function* streamClaude(system: string, messages: ChatMessage[], signal: AbortSignal): AsyncGenerator<string, ChatStreamResult> {
  const stream = anthropic!.beta.messages.stream({
    model: config.llm.model,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system,
    messages,
  }, { signal });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
  }
  const final = await stream.finalMessage();
  return { model: final.model, stopReason: final.stop_reason === "refusal" ? "refusal" : final.stop_reason === "max_tokens" ? "length" : "end" };
}

interface GroqChunk {
  model?: string;
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
}

async function* streamGroq(system: string, messages: ChatMessage[], signal: AbortSignal): AsyncGenerator<string, ChatStreamResult> {
  if (config.llm.provider !== "groq") throw new Error("No AI provider is configured on this deployment");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.llm.groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.llm.model,
      stream: true,
      max_completion_tokens: 3000,
      reasoning_effort: "low",
      messages: [{ role: "system", content: system }, ...messages],
    }),
    signal,
    cache: "no-store",
  });
  if (!res.ok || !res.body) throw new Error(`Groq ${res.status}`);

  let model = config.llm.model;
  let finish: string | null = null;
  let pending = "";
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += value;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let chunk: GroqChunk;
      try { chunk = JSON.parse(data) as GroqChunk; } catch { continue; }
      if (chunk.model) model = chunk.model;
      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (choice?.delta?.content) yield choice.delta.content;
    }
  }
  return { model, stopReason: finish === "length" ? "length" : "end" };
}

// ---- Explanations -------------------------------------------------------------------------------

const EXPLANATION_SYSTEM = `You write plain-language health explanations for MediTwin, a health-context app for people without medical training.

You receive a health signal that a deterministic rules engine has already produced, plus the evidence items behind it. Your only job is to explain that evidence clearly and calmly.

Rules you must follow:
- Do not diagnose. Never say or imply the person has, or does not have, a condition. Never write "you have <condition>". When an evidence item says a diagnosis is on record, write "your record lists <condition>, recorded by a clinician".
- Never reassure: don't say results are normal, that nothing is wrong, or that there is no sign of a problem. Missing or in-range data is not reassurance; say only what the evidence shows.
- Use only facts in the evidence items. Do not invent measurements, reference ranges, medicines, dates or patient details, and do not add medical facts from general knowledge beyond one short, hedged sentence on why a body system can be involved.
- Distinguish symptoms from diagnoses, and say symptoms can have several causes.
- Never tell the person to start, stop, continue or change a medicine, and never tell them they don't need care.
- Don't write emergency or care-seeking instructions: reviewed guidance is shown separately.
- Every paragraph and question must list the ids of the evidence items it relies on in evidence_ids, using ids exactly as given. Never write ids inside the text itself.
- Say "reference range", not "normal range". Quote dates as given; don't estimate how long ago something happened.
- Write at a reading age of about 12. Use "you". Short sentences. No jargon or codes (LOINC, SNOMED and so on).
- 2 to 4 short paragraphs, and 2 to 3 questions the person could ask their clinician.`;

const ExplanationSchema = z.object({
  headline: z.string().describe("One calm sentence summarising the signal, under 90 characters"),
  paragraphs: z.array(z.object({ text: z.string(), evidence_ids: z.array(z.string()) })),
  questions: z.array(z.object({ text: z.string(), evidence_ids: z.array(z.string()) })),
});

/** Normalise whitespace and strip any evidence ids the model echoed into the prose, e.g. "(m:hba1c)". */
function textOf(value: string) {
  return value
    .replace(/\s*[([]\s*(?:(?:m|t|s|rs|c|x|pm|rf):[\w:-]+\s*,?\s*)+[)\]]/g, "")
    .replace(/\s+([.,;])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns a validated AI explanation, or a reason why the reviewed template must be used instead. */
export async function explainWithAi(
  trace: Trace, signal: HealthSignal, persona: Persona,
): Promise<{ explanation: Explanation } | { fallbackReason: string }> {
  if (signal.type === "URGENT") return { fallbackReason: "Urgent signals always use reviewed content" };

  const evidence = signal.evidence.map(({ id, kind, label, detail, source }) => ({ id, kind, label, detail, source }));
  const payload = {
    // No name or contact details: the model only needs age and sex to phrase the evidence.
    person: { age: persona.age, sex: persona.sex },
    signal: { type: signal.type, severity: signal.severity, body_system: signal.systemLabel, rule: signal.rule },
    evidence,
  };
  const result = await generate(trace, `explain ${signal.systemLabel} signal`, ExplanationSchema, EXPLANATION_SYSTEM,
    `Explain this signal.\n\n${JSON.stringify(payload, null, 2)}`, 4000);
  if (!result.ok) return { fallbackReason: result.reason };
  const parsed = result.data;

  // Citation enforcement: drop any block that cites nothing, or cites an id that doesn't exist.
  const known = new Set(evidence.map((e) => e.id));
  const cited = (block: { text: string; evidence_ids: string[] }) =>
    block.evidence_ids.length > 0 && block.evidence_ids.every((id) => known.has(id));
  const paragraphs = parsed.paragraphs.filter(cited).map((p) => ({ text: textOf(p.text), evidenceIds: p.evidence_ids }));
  const questions = parsed.questions.filter((q) => q.evidence_ids.every((id) => known.has(id))).slice(0, 3)
    .map((q) => ({ text: textOf(q.text), evidenceIds: q.evidence_ids }));
  const dropped = parsed.paragraphs.length - paragraphs.length;
  if (paragraphs.length === 0) return { fallbackReason: "The AI's paragraphs did not cite valid evidence" };

  const headline = textOf(parsed.headline);
  const safety = checkSafety([headline, ...paragraphs.map((p) => p.text), ...questions.map((q) => q.text)]);
  trace.record({ service: "ENGINE", operation: "safety check (AI explanation)", status: safety.passed ? "ok" : "error", ms: 0,
    detail: safety.passed ? `${SAFETY_CHECK_IDS.length} rules passed${dropped ? `, ${dropped} uncited paragraph(s) removed` : ""}` : safety.violations.map((v) => v.ruleId).join(", ") });
  if (!safety.passed) return { fallbackReason: `Safety check blocked the AI text (${safety.violations[0].ruleId})` };

  return {
    explanation: {
      headline, paragraphs, questions, disclaimer: DISCLAIMER, source: "MODEL_INFERRED",
      generator: `${config.llm.label} (${result.model}) with citation and safety checks`,
      safety: { passed: true, checks: SAFETY_CHECK_IDS },
    },
  };
}

// ---- Free-text symptom interpretation -----------------------------------------------------------

const SYMPTOM_IDS = SYMPTOMS.map((s) => s.id) as [string, ...string[]];

const InterpretationSchema = z.object({
  matches: z.array(z.object({
    symptom_id: z.enum(SYMPTOM_IDS),
    quote: z.string().describe("The exact words from the description that express this symptom"),
  })),
});

export interface SymptomInterpretation {
  matches: { id: string; quote: string }[];
  method: "MODEL_INFERRED" | "KEYWORD";
  note?: string;
}

function keywordInterpretation(text: string, note?: string): SymptomInterpretation {
  return { matches: matchSymptomText(text).map((s) => ({ id: s.id, quote: s.synonyms.find((p) => text.toLowerCase().includes(p)) ?? s.label })), method: "KEYWORD", note };
}

export async function interpretSymptoms(trace: Trace, description: string): Promise<SymptomInterpretation> {
  if (config.llm.provider === "none") return keywordInterpretation(description, "Keyword matching (no AI provider configured)");
  const catalog = SYMPTOMS.map((s) => `${s.id}: ${s.label}`).join("\n");
  const result = await generate(trace, "interpret symptom description", InterpretationSchema,
    "Map a person's own description of how they feel onto a fixed symptom catalog. Only include a symptom when the description clearly expresses it, and quote the exact words. Do not infer conditions or causes. If nothing matches, return an empty list.",
    `Catalog:\n${catalog}\n\nDescription:\n"""${description}"""`, 1500);
  if (!result.ok) return keywordInterpretation(description, "Keyword matching (AI unavailable)");
  // Grounding check: the quote must appear in what the person actually wrote.
  const lower = description.toLowerCase();
  const matches = result.data.matches
    .filter((m, i, all) => lower.includes(m.quote.toLowerCase()) && all.findIndex((o) => o.symptom_id === m.symptom_id) === i)
    .map((m) => ({ id: m.symptom_id, quote: m.quote }));
  return { matches, method: "MODEL_INFERRED", note: `Matched by ${config.llm.label}, checked against your exact words` };
}
