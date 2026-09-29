// MediTwin assistant: the parts that don't depend on a model, shared by the server and the browser.
//
// The assistant answers questions about a person's own twin in plain language. Around the model:
// - emergencies are recognised from reviewed phrases before any model call (content.ts);
// - the model only sees a compact brief of the twin, without name or email;
// - every sentence passes the safety layer before it is streamed to the person (SentenceGuard);
// - actions (check symptoms, save a reading) are proposed by deterministic parsing, and only run
//   when the person confirms them.

import { SYMPTOM_BY_ID, matchSymptomText } from "./content";
import { ENTRY_TYPE_BY_ID, validateEntry } from "./entry-catalog";
import { checkSafety } from "./safety";
import { isOutOfRange, seriesFor } from "./series";
import type { CareGuidance, SignalType, SymptomInput, TimelineEvent, TwinView } from "./types";
import { longDate, rangeText } from "@/lib/format";

// ---- Languages -------------------------------------------------------------------------------------

export type AssistantLanguage = "en" | "pcm" | "yo" | "ha" | "ig";

export const LANGUAGES: { id: AssistantLanguage; label: string; native: string; speech: string; beta?: boolean }[] = [
  { id: "en", label: "English", native: "English", speech: "en-NG" },
  { id: "pcm", label: "Pidgin", native: "Naijá", speech: "en-NG" },
  { id: "yo", label: "Yoruba", native: "Yorùbá", speech: "yo-NG", beta: true },
  { id: "ha", label: "Hausa", native: "Hausa", speech: "ha-NG", beta: true },
  { id: "ig", label: "Igbo", native: "Igbo", speech: "ig-NG", beta: true },
];

export const LANGUAGE_BY_ID = new Map(LANGUAGES.map((l) => [l.id, l]));

/** Opening message, written by MediTwin (not the model). */
export function greeting(language: AssistantLanguage, name: string | null) {
  const n = name ? ` ${name}` : "";
  switch (language) {
    case "pcm": return `How far${n}! I be your MediTwin assistant. Ask me about your test results, how your body dey feel, or how to prepare for doctor visit. I dey explain things, I no dey diagnose.`;
    case "yo": return `Ẹ n lẹ${n}! Èmi ni olùrànlọ́wọ́ MediTwin rẹ. Béèrè nípa àbájáde àyẹ̀wò rẹ, bí ara rẹ ṣe ń ṣe, tàbí bí o ṣe lè múra sílẹ̀ fún dókítà. Mo ń ṣàlàyé, mi ò ṣe àyẹ̀wò àìsàn.`;
    case "ha": return `Sannu${n}! Ni ne mataimakin MediTwin naka. Tambaye ni game da sakamakon gwaje-gwajenka, yadda jikinka yake ji, ko yadda za ka shirya ganin likita. Ina bayani ne, ba na gano cuta.`;
    case "ig": return `Ndewo${n}! Abụ m onye enyemaka MediTwin gị. Jụọ m gbasara nsonaazụ ule gị, otú ahụ gị na-adị, ma ọ bụ otú ị ga-esi jikere ịhụ dọkịta. M na-akọwa, anaghị m achọpụta ọrịa.`;
    default: return `Hi${n}! I'm your MediTwin assistant. Ask me about your results, how you're feeling, or how to get ready for a doctor's visit. I explain what your twin shows. I don't diagnose.`;
  }
}

// ---- Wire format -----------------------------------------------------------------------------------

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type AssistantAction =
  | { kind: "symptom_check"; symptoms: { id: string; label: string; quote: string }[] }
  | { kind: "log_result"; typeId: string; label: string; values: Record<string, number>; unit: string; display: string }
  | { kind: "open"; view: "summary" | "mydata" | "timeline" | "overview"; label: string };

/** One line of the NDJSON stream from /assistant routes. */
export type AssistantEvent =
  | { type: "text"; delta: string }
  | { type: "urgent"; guidance: CareGuidance; ruleId: string }
  | { type: "blocked"; text: string }
  | { type: "actions"; actions: AssistantAction[] }
  | { type: "done"; source: "MODEL_INFERRED" | "SYSTEM_GENERATED"; generator: string; removed: number }
  | { type: "error"; message: string };

export const MAX_TURNS = 16;
export const MAX_MESSAGE_CHARS = 1200;

// ---- Streaming safety ------------------------------------------------------------------------------

/** Replaces an answer when the safety layer removes too much of it. */
export const BLOCKED_TEXT =
  "I can't answer that safely here. I can explain your results and symptoms, but questions about diagnoses or changing medicines need a healthcare professional who knows you. Would it help to prepare a visit summary to take with you?";

/**
 * Releases model text one complete sentence (or line) at a time, and only after the sentence has
 * passed the safety layer. A sentence that fails is dropped, so it never reaches the screen.
 */
export class SentenceGuard {
  private buffer = "";
  removed = 0;
  readonly violations: string[] = [];

  push(delta: string): string {
    this.buffer += delta;
    let cut = -1;
    for (const match of this.buffer.matchAll(/[.!?](?=\s)|\n/g)) cut = match.index + 1;
    if (cut <= 0) return "";
    const ready = this.buffer.slice(0, cut);
    this.buffer = this.buffer.slice(cut);
    return this.check(ready);
  }

  flush(): string {
    const rest = this.buffer;
    this.buffer = "";
    return this.check(rest);
  }

  private check(text: string): string {
    return text.split(/(?<=[.!?])(?=\s)|(?<=\n)/).map((piece) => {
      if (!piece.trim()) return piece;
      const result = checkSafety([piece.replace(/\*\*/g, "")]);
      if (result.passed) return piece;
      this.removed += 1;
      this.violations.push(...result.violations.map((v) => v.ruleId));
      return piece.endsWith("\n") ? "\n" : "";
    }).join("");
  }
}

// ---- Deterministic actions -------------------------------------------------------------------------

function reading(typeId: string, values: Record<string, number>, unit: string): AssistantAction | null {
  const type = ENTRY_TYPE_BY_ID.get(typeId);
  if (!type || validateEntry(type, values, unit)) return null;
  const display = `${type.fields.map((f) => values[f.key]).join("/")} ${unit}`;
  return { kind: "log_result", typeId, label: type.label, values, unit, display };
}

/** Readings a person typed in a message, e.g. "my BP was 150/95" or "HbA1c 7.2%". */
export function parseReadings(text: string): AssistantAction[] {
  const out: AssistantAction[] = [];
  const bp = text.match(/\b(?:bp|blood pressure|pressure)\b[^0-9\n]{0,25}(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})/i);
  if (bp) out.push(reading("blood_pressure", { systolic: Number(bp[1]), diastolic: Number(bp[2]) }, "mmHg")!);
  const a1c = text.match(/\b(?:hba1c|a1c)\b[^0-9\n]{0,20}(\d{1,2}(?:\.\d{1,2})?)/i);
  if (a1c) out.push(reading("hba1c", { value: Number(a1c[1]) }, "%")!);
  const glucose = text.match(/\bfasting\b[^0-9\n]{0,30}(\d{1,3}(?:\.\d{1,2})?)\s*(mg\/?dl|mmol(?:\/l)?)?/i);
  if (glucose) {
    const value = Number(glucose[1]);
    const unit = glucose[2] ? (/mmol/i.test(glucose[2]) ? "mmol/L" : "mg/dL") : value < 35 ? "mmol/L" : "mg/dL";
    out.push(reading("fasting_glucose", { value }, unit)!);
  }
  const pulse = text.match(/\b(?:heart rate|pulse|resting hr)\b[^0-9\n]{0,20}(\d{2,3})/i);
  if (pulse) out.push(reading("heart_rate", { heartRate: Number(pulse[1]) }, "bpm")!);
  return out.filter(Boolean);
}

// Which measurement (and field) each loggable type shows up as in the twin.
const READING_KEYS: Record<string, [measurementKey: string, field: string]> = {
  hba1c: ["hba1c", "value"],
  fasting_glucose: ["fasting_glucose", "value"],
  blood_pressure: ["systolic_bp", "systolic"],
  heart_rate: ["heart_rate", "heartRate"],
};

/**
 * Drop readings the twin already holds (same value within 60 days), so asking "what does my
 * glucose of 118 mean?" doesn't offer to save 118 again.
 */
export function withoutKnownReadings(actions: AssistantAction[], events: TimelineEvent[], now = new Date()): AssistantAction[] {
  const recent = events.filter((e) => now.getTime() - new Date(e.occurredAt).getTime() < 60 * 86_400_000).flatMap((e) => e.measurements);
  return actions.filter((a) => {
    if (a.kind !== "log_result") return true;
    const [key, field] = READING_KEYS[a.typeId] ?? [];
    return !recent.some((m) => m.key === key && m.value === a.values[field]);
  });
}

/** Actions to offer after an answer. Only the person's own message is parsed, never the model's. */
export function suggestActions(message: string, options: { canLog: boolean }): AssistantAction[] {
  const actions: AssistantAction[] = [];
  const lower = message.toLowerCase();
  const symptoms = matchSymptomText(message).map((s) => ({
    id: s.id, label: s.label, quote: s.synonyms.filter((p) => lower.includes(p)).sort((a, b) => b.length - a.length)[0] ?? s.label,
  }));
  if (symptoms.length) actions.push({ kind: "symptom_check", symptoms });
  if (options.canLog) actions.push(...parseReadings(message));
  if (/\b(?:doctor|clinic|appointment|visit|hospital|gp|nurse|pharmacist)\b/i.test(message)) {
    actions.push({ kind: "open", view: "summary", label: "Prepare a visit summary" });
  }
  return actions;
}

// ---- Twin brief ------------------------------------------------------------------------------------

export interface BriefFocus {
  symptoms: SymptomInput[];
  signal: { type: SignalType; title: string; systemLabel: string; evidence: string[] } | null;
}

/**
 * Everything the model may know about the person, as short plain text. No name, email or ids.
 * Kept small so each answer starts quickly.
 */
export function buildTwinBrief(view: TwinView, focus?: BriefFocus | null): string {
  const lines: string[] = [];
  const p = view.persona;
  lines.push(`Person: ${p.age}-year-old ${p.sex}.${view.personal ? "" : " (Synthetic demo patient.)"}`);
  lines.push(`Today: ${longDate(new Date().toISOString())}.`);

  if (view.systems.length) {
    lines.push("", "Body systems in the twin:");
    for (const s of view.systems) lines.push(`- ${s.label}: ${s.status === "CLEAR" ? "no current signal" : s.status.toLowerCase().replace("_", " ")}, ${s.eventCount} records, ${s.outOfRange} results outside reference range`);
  }

  const series = seriesFor(view.events).slice(0, 14);
  if (series.length) {
    lines.push("", "Latest results (newest reading per test):");
    for (const s of series) {
      const m = s.latest;
      const range = rangeText(m);
      const status = isOutOfRange(m) ? `${m.status === "ABOVE" ? "above" : "below"} the reference range ${range}` : m.status === "WITHIN" ? `within the reference range ${range}` : "no reference range available";
      const earlier = s.history.slice(-4, -1).reverse().map((h) => `${h.value} ${h.unit} on ${longDate(h.occurredAt)}`);
      lines.push(`- ${m.label}: ${m.value} ${m.unit} on ${longDate(m.occurredAt)}, ${status}${earlier.length ? `. Earlier: ${earlier.join("; ")}` : ""}`);
    }
  } else {
    lines.push("", "No measurements in the twin yet.");
  }

  if (view.recordedConditions.length) lines.push("", `Conditions listed in the record by a clinician: ${view.recordedConditions.join(", ")}.`);
  if (view.medications.length) lines.push("", `Medicines on record: ${view.medications.map((m) => m.label).join(", ")}.`);
  if (view.baselineSignals.length) {
    lines.push("", "Signals from MediTwin's reviewed rules (not diagnoses):");
    for (const s of view.baselineSignals) lines.push(`- ${s.systemLabel}, ${s.type.toLowerCase()}: ${s.title}`);
  }

  const checkins = view.personal?.checkins.slice(0, 5) ?? [];
  if (checkins.length) {
    lines.push("", "Recent symptom check-ins in MediTwin:");
    for (const c of checkins) {
      const symptoms = c.symptoms.map((s) => `${SYMPTOM_BY_ID.get(s.id)?.label ?? s.id} (${s.severity}, ~${s.durationDays} days)`).join(", ");
      lines.push(`- ${longDate(c.createdAt)}: ${symptoms}${c.signal ? `. Rules gave ${c.signal.type.toLowerCase()} signal: ${c.signal.title}` : ". No signal"}`);
    }
  }

  const other = view.events.filter((e) => e.measurements.length === 0 && e.sourcePlugin !== "meditwin.checkin")
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 8);
  if (other.length) {
    lines.push("", "Other recent records:");
    for (const e of other) lines.push(`- ${longDate(e.occurredAt)}: ${e.title} (${e.category})${e.summary ? `. ${e.summary.slice(0, 140)}` : ""}`);
  }

  if (focus && focus.symptoms.length) {
    const symptoms = focus.symptoms.map((s) => `${SYMPTOM_BY_ID.get(s.id)?.label ?? s.id} (${s.severity}, ~${s.durationDays} days${s.userWording ? `, in their words "${s.userWording}"` : ""})`).join(", ");
    lines.push("", `Symptoms the person just checked in MediTwin: ${symptoms}.`);
    lines.push(focus.signal
      ? `MediTwin's rules gave a ${focus.signal.type.toLowerCase()} signal (${focus.signal.systemLabel}): ${focus.signal.title}. Evidence: ${focus.signal.evidence.join("; ")}.`
      : "MediTwin's rules found no signal linking these symptoms to the twin's results.");
  }
  return lines.join("\n");
}

/** Conversation starters built from what is actually in the twin. */
export function starterPrompts(view: TwinView | null): string[] {
  if (!view) return [];
  const out: string[] = [];
  const flagged = seriesFor(view.events).filter((s) => isOutOfRange(s.latest)).slice(0, 2);
  for (const s of flagged) out.push(`What does my ${s.latest.label} of ${s.latest.value} ${s.latest.unit} mean?`);
  if (view.events.length) out.push("Summarise my health twin in simple words");
  if (flagged.some((s) => s.history.length > 1)) out.push("Are my results getting better or worse?");
  out.push("What should I ask my doctor at my next visit?");
  out.push("I've been really tired and thirsty lately");
  return out.slice(0, 4);
}
