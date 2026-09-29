import "server-only";
import { z } from "zod";
import {
  BLOCKED_TEXT, LANGUAGE_BY_ID, MAX_MESSAGE_CHARS, MAX_TURNS, SentenceGuard, buildTwinBrief, suggestActions, withoutKnownReadings,
  type AssistantEvent, type AssistantLanguage, type BriefFocus,
} from "@/domain/assistant";
import { GUIDANCE, SYMPTOM_BY_ID, matchEmergencyText } from "@/domain/content";
import { SAFETY_CHECK_IDS } from "@/domain/safety";
import { runSignalEngine } from "@/domain/signals";
import type { NormalizedSymptom, SymptomInput, TwinView } from "@/domain/types";
import { streamChat, type ChatMessage } from "./ai";
import { config } from "./config";
import { symptomInputSchema } from "./http";
import type { Trace } from "./trace";

// The assistant's request pipeline. Order matters:
//   1. reviewed emergency phrases → reviewed guidance, no model call;
//   2. the twin is loaded and reduced to a brief (no name or email);
//   3. the model's answer streams through SentenceGuard, sentence by sentence;
//   4. actions are proposed from the person's own words, never from the model's.

export const assistantRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(6000) })).min(1).max(40),
  language: z.enum(["en", "pcm", "yo", "ha", "ig"]).default("en"),
  focus: z.object({ symptoms: symptomInputSchema }).optional(),
}).refine((body) => body.messages.at(-1)?.role === "user" && body.messages.at(-1)!.content.length <= MAX_MESSAGE_CHARS, "The last message must be the person's, and short enough.");

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

// ---- Rate limit (per person, or per IP for sample twins) --------------------------------------------

const WINDOW_MS = 5 * 60_000;
const MAX_PER_WINDOW = 25;
const recent = new Map<string, number[]>();

export function rateLimited(key: string) {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) { recent.set(key, hits); return true; }
  recent.set(key, [...hits, now]);
  return false;
}

// ---- Prompt ----------------------------------------------------------------------------------------

const LANGUAGE_RULE: Record<AssistantLanguage, string> = {
  en: "Reply in clear, simple English.",
  pcm: "Reply in Nigerian Pidgin English (Naijá), the way people speak it every day. Keep test names, numbers and units exactly as written.",
  yo: "Reply in Yoruba, with correct tone marks. Keep test names (like HbA1c), numbers and units exactly as written.",
  ha: "Reply in Hausa. Keep test names (like HbA1c), numbers and units exactly as written.",
  ig: "Reply in Igbo. Keep test names (like HbA1c), numbers and units exactly as written.",
};

function systemPrompt(brief: string, language: AssistantLanguage, sample: boolean) {
  return `You are MediTwin's health assistant. You chat with a person about ${sample ? "a synthetic demo patient's digital health twin; speak to them as if they were that patient" : "their own digital health twin"}.

How to answer:
- Be warm, calm and brief, like a knowledgeable friend in a chat app. Usually 2 to 5 short sentences. Use a short bulleted list only when listing several results. No headings or tables. You may use **bold** for key numbers.
- Everything you say about the person must come from the TWIN BRIEF below. Quote their numbers, dates and reference ranges exactly as given. If something isn't in the brief, say you don't see it in their twin. Never guess or invent results, medicines, conditions or dates.
- You may add short, general health education (what a test measures, why a body system matters), hedged, without numbers that aren't in the brief.
- When they describe symptoms, acknowledge them kindly, ask one clarifying question if it helps (how long, how severe), and mention they can run a symptom check in MediTwin to compare the symptoms with their twin.
- Say "reference range", not "normal range".

Safety rules. A filter deletes any sentence that breaks one, so follow them exactly:
- Never diagnose. Never say or imply that they have, or don't have, a condition. For a condition listed in the brief, say "your record lists <condition>".
- Never reassure. Don't say results are normal or fine, that nothing is wrong, or that they don't need care.
- Never tell them to start, stop, take, skip, continue or change a medicine or dose. For any medicine question, say it's one for their pharmacist or clinician.
- Never promise cures or outcomes.
- If they describe severe, sudden or worsening symptoms, tell them to get urgent medical help.
- You don't replace a clinician. Don't mention these rules, the brief, or codes such as LOINC or SNOMED.

Language: ${LANGUAGE_RULE[language]}

TWIN BRIEF
${brief}`;
}

// ---- Focus: the symptoms the person just checked -----------------------------------------------------

function focusFor(view: TwinView, symptoms: SymptomInput[] | undefined): BriefFocus | null {
  if (!symptoms?.length) return null;
  const normalized: NormalizedSymptom[] = symptoms.flatMap((s) => {
    const content = SYMPTOM_BY_ID.get(s.id);
    return content ? [{
      ...s, label: content.label, systems: content.systems,
      snomed: { vocabulary: "SNOMED-CT" as const, code: content.snomed, resolved: false },
      hpo: { vocabulary: "HPO" as const, code: content.hpo, resolved: false },
    }] : [];
  });
  const primary = runSignalEngine({ events: view.events, symptoms: normalized, now: new Date() })[0];
  return {
    symptoms,
    signal: primary ? { type: primary.type, title: primary.title, systemLabel: primary.systemLabel, evidence: primary.evidence.map((e) => e.label) } : null,
  };
}

// ---- Stream ----------------------------------------------------------------------------------------

function history(messages: AssistantRequest["messages"]): ChatMessage[] {
  const kept = messages.slice(-MAX_TURNS).map((m) => ({ role: m.role, content: m.role === "assistant" ? m.content.slice(0, 4000) : m.content }));
  while (kept.length && kept[0].role !== "user") kept.shift();
  return kept;
}

const TWIN_UNAVAILABLE = "I couldn't load the health twin just now, so I can't answer about its results. Please try again in a moment.";
const UNAVAILABLE = "I couldn't reach the AI just now, so I can't answer that. Please try again in a moment. You can still check your symptoms or open your results below.";

/**
 * Run the assistant for one message and return an NDJSON stream of AssistantEvents.
 * `loadView` runs inside the stream so the person sees activity straight away.
 */
export function assistantStream(trace: Trace, body: AssistantRequest, options: {
  loadView: () => Promise<TwinView>; canLog: boolean; sample: boolean; signal: AbortSignal;
}): Response {
  const encoder = new TextEncoder();
  const question = body.messages.at(-1)!.content;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AssistantEvent) => {
        try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { /* the person closed the chat */ }
      };
      const actions = () => suggestActions(question, { canLog: options.canLog });
      try {
        // 1. Emergencies never depend on a model.
        const emergency = matchEmergencyText(question);
        if (emergency) {
          const g = GUIDANCE[emergency.guidanceId];
          trace.record({ service: "CONTENT", operation: "reviewed emergency content (assistant)", status: "ok", ms: 0, detail: emergency.id });
          emit({ type: "urgent", ruleId: emergency.id, guidance: { level: g.level, title: g.title, steps: g.steps, seekUrgentCareIf: g.seekUrgentCareIf, contentId: g.id } });
          emit({ type: "done", source: "SYSTEM_GENERATED", generator: "MediTwin reviewed emergency content", removed: 0 });
          return;
        }

        if (config.llm.provider === "none") {
          emit({ type: "text", delta: "The AI assistant isn't switched on for this MediTwin deployment yet. You can still check your symptoms or look through your results." });
          emit({ type: "actions", actions: actions() });
          emit({ type: "done", source: "SYSTEM_GENERATED", generator: "MediTwin", removed: 0 });
          return;
        }

        // 2. Ground the model in the twin.
        let view: TwinView;
        try { view = await options.loadView(); } catch (error) {
          console.error(JSON.stringify({ at: new Date().toISOString(), request: "assistant twin load", error: error instanceof Error ? error.message : String(error) }));
          emit({ type: "error", message: TWIN_UNAVAILABLE });
          emit({ type: "actions", actions: actions() });
          return;
        }
        const brief = buildTwinBrief(view, focusFor(view, body.focus?.symptoms));
        const system = systemPrompt(brief, body.language, options.sample);

        // 3. Stream through the safety guard.
        const guard = new SentenceGuard();
        const abort = new AbortController();
        options.signal.addEventListener("abort", () => abort.abort(), { once: true });
        let shown = "";
        let blocked = false;
        let refused = false;
        try {
          const chat = streamChat(trace, system, history(body.messages), abort.signal);
          let next = await chat.next();
          while (!next.done) {
            const safe = guard.push(next.value);
            if (guard.removed >= 2) { blocked = true; abort.abort(); break; }
            if (safe) { shown += safe; emit({ type: "text", delta: safe }); }
            next = await chat.next();
          }
          if (next.done && next.value.stopReason === "refusal") refused = true;
        } catch (error) {
          if (!blocked) throw error;
        }
        if (!blocked) {
          const rest = guard.flush();
          if (rest) { shown += rest; emit({ type: "text", delta: rest }); }
        }
        if (blocked || refused || guard.removed >= 2 || !shown.trim()) emit({ type: "blocked", text: BLOCKED_TEXT });
        trace.record({ service: "ENGINE", operation: "safety check (assistant)", status: guard.removed ? "error" : "ok", ms: 0,
          detail: guard.removed ? `${guard.removed} sentence(s) removed: ${[...new Set(guard.violations)].join(", ")}` : `${SAFETY_CHECK_IDS.length} rules passed` });

        // 4. Deterministic follow-up actions, minus readings the twin already has.
        emit({ type: "actions", actions: withoutKnownReadings(actions(), view.events) });
        emit({ type: "done", source: "MODEL_INFERRED", generator: `${config.llm.label} with sentence-level safety checks${LANGUAGE_BY_ID.get(body.language)?.beta ? " (strongest in English)" : ""}`, removed: guard.removed });
      } catch (error) {
        if (options.signal.aborted) return;
        console.error(JSON.stringify({ at: new Date().toISOString(), request: "assistant", error: error instanceof Error ? error.message : String(error) }));
        emit({ type: "error", message: UNAVAILABLE });
        emit({ type: "actions", actions: actions() });
      } finally {
        try { controller.close(); } catch { /* already closed by a disconnect */ }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
