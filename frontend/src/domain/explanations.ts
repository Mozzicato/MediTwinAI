// Reviewed-template explanations (FR-012). Used when no AI provider is configured, when an AI
// response fails validation, and always for URGENT signals, which never go to the LLM.

import { CONTENT_VERSION, DISCLAIMER } from "./content";
import { SAFETY_CHECK_IDS, checkSafety } from "./safety";
import type { EvidenceItem, Explanation, ExplanationBlock, HealthSignal } from "./types";

const QUESTIONS: Record<string, string[]> = {
  metabolic: [
    "Could these symptoms be connected to my recent glucose results?",
    "Is it worth rechecking my HbA1c or glucose sooner than planned?",
    "What changes in how I feel should prompt me to get in touch before my next visit?",
  ],
  cardiovascular: [
    "Are my recent blood pressure and cholesterol readings where you'd like them to be?",
    "Could these symptoms be related to my heart or blood vessels?",
    "What should prompt me to seek care urgently?",
  ],
  respiratory: [
    "Do my peak-flow readings suggest my breathing has changed?",
    "Could these symptoms be related to my asthma plan?",
    "When should I seek urgent help for breathing symptoms?",
  ],
};

const GENERIC_QUESTIONS = [
  "Which of these results matter most for me right now?",
  "Is there anything I should monitor at home?",
  "When would you like to see me again?",
];

function listJoin(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Lower-case a leading word for mid-sentence use, leaving acronyms such as "HbA1c" or "LDL" intact. */
function lowerFirst(text: string) {
  return /^[A-Z][a-z]*(?=\s|$)/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function block(text: string, evidence: EvidenceItem[]): ExplanationBlock {
  return { text, evidenceIds: evidence.map((e) => e.id) };
}

export function buildTemplateExplanation(signal: HealthSignal | null, fallbackReason?: string): Explanation {
  const paragraphs: ExplanationBlock[] = [];
  let headline = "No health signal from the information available";
  const byKind = (kind: EvidenceItem["kind"]) => signal?.evidence.filter((e) => e.kind === kind) ?? [];

  if (!signal) {
    paragraphs.push({ text: "MediTwin didn't find measurements outside their reference ranges that relate to the symptoms you selected. That isn't the same as a clean bill of health, so if you're worried, speak to a healthcare professional.", evidenceIds: [] });
  } else if (signal.type === "URGENT") {
    const redFlag = byKind("RED_FLAG");
    const reported = byKind("REPORTED_SYMPTOM");
    headline = "Some of what you reported can be a sign of an emergency";
    paragraphs.push(block(`You reported ${listJoin(reported.map((e) => lowerFirst(e.label.replace(" (reported today)", ""))))}. MediTwin's reviewed safety rules treat this combination as a possible emergency warning sign.`, [...redFlag, ...reported]));
    paragraphs.push({ text: "Because of that, MediTwin doesn't try to interpret your records any further. It's a precaution: only a clinician can work out what is causing these symptoms.", evidenceIds: redFlag.map((e) => e.id) });
  } else {
    const measurements = byKind("MEASUREMENT");
    const trends = byKind("TREND");
    const reported = byKind("REPORTED_SYMPTOM");
    const recorded = byKind("RECORDED_SYMPTOM");
    const conditions = byKind("RECORDED_CONDITION");
    headline = signal.type === "ATTENTION"
      ? `We found a ${signal.systemLabel.toLowerCase()} signal worth attention`
      : signal.ruleId === "SIG-INF-02" ? "Your symptoms, in context" : `Some ${signal.systemLabel.toLowerCase()} results are outside their reference range`;

    for (const m of measurements.slice(0, 3)) {
      const name = m.label.replace(/ (above|below) reference range$/, "");
      const trend = trends.find((t) => t.id === m.id.replace(/^m:/, "t:"));
      const trendText = trend ? ` It has been ${trend.label.includes("toward") ? "moving toward" : "moving away from"} that range: ${trend.detail}` : "";
      paragraphs.push(block(`Your latest ${lowerFirst(name)} result is ${m.label.includes("above") ? "above" : "below"} its reference range: ${m.detail}${trendText}`, trend ? [m, trend] : [m]));
    }

    if (reported.length || recorded.length) {
      const parts: string[] = [];
      if (reported.length) parts.push(`you reported ${listJoin(reported.map((e) => lowerFirst(e.label.replace(" (reported today)", ""))))} today`);
      if (recorded.length) parts.push(`${recorded.every((e) => e.label.endsWith("(your earlier check-in)")) ? "you reported" : "your twin recorded"} ${listJoin(recorded.map((e) => `“${e.label.replace(/ \((recorded in twin|your earlier check-in)\)$/, "")}”`))} recently`);
      paragraphs.push(block(`In addition, ${listJoin(parts)}. Symptoms like these can happen for several different reasons.`, [...reported, ...recorded]));
    }

    if (signal.type === "ATTENTION") {
      paragraphs.push(block("Seen together, these findings may be worth discussing with a healthcare professional. They don't establish a diagnosis on their own.", [...measurements, ...reported, ...recorded]));
    } else if (signal.ruleId === "SIG-INF-01") {
      paragraphs.push(block("A result outside a reference range can have several explanations, and a single reading doesn't establish a diagnosis. It's reasonable to bring it up at your next routine appointment.", measurements));
    } else {
      paragraphs.push(block("Your twin doesn't have out-of-range measurements for this body system, so MediTwin has nothing to connect these symptoms to. If they continue or worry you, a healthcare professional can help.", reported));
    }

    if (conditions.length) {
      paragraphs.push(block(`Your record already lists ${listJoin(conditions.map((e) => lowerFirst(e.label.replace(" (on record)", ""))))}, recorded by a clinician. Your care team is best placed to say how these findings relate to it.`, conditions));
    }
  }

  const questionTexts = signal && signal.type !== "URGENT" ? (QUESTIONS[signal.system] ?? GENERIC_QUESTIONS) : [];
  const questions = questionTexts.map((text) => ({ text, evidenceIds: [] }));
  const safety = checkSafety([headline, ...paragraphs.map((p) => p.text), ...questions.map((q) => q.text)]);
  return {
    headline,
    paragraphs,
    questions,
    disclaimer: DISCLAIMER,
    source: "SYSTEM_GENERATED",
    generator: `Reviewed template (${CONTENT_VERSION})`,
    safety: { passed: safety.passed, checks: SAFETY_CHECK_IDS, fallbackReason },
  };
}
