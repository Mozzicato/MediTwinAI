// Deterministic health-signal engine (FR-010, FR-011).
//
// The LLM never classifies anything. Every signal is produced by a named rule over structured
// evidence, and every evidence item records where it came from.

import {
  GUIDANCE, RECORDED_SYMPTOM_WINDOW_DAYS, RED_FLAGS, SYMPTOM_BY_ID, SYSTEM_WARNING_SIGNS, matchSymptomText, systemLabel,
} from "./content";
import type {
  CareGuidance, EvidenceItem, HealthSignal, Measurement, NormalizedSymptom, SignalType, TimelineEvent,
} from "./types";

export interface EngineInput {
  events: TimelineEvent[];
  symptoms: NormalizedSymptom[];
  now: Date;
}

const SIGNAL_ORDER: Record<SignalType, number> = { URGENT: 0, ATTENTION: 1, INFORMATION: 2 };
const DAY_MS = 86_400_000;

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatRange(m: Measurement) {
  const r = m.reference;
  if (!r) return "";
  if (r.low !== null && r.high !== null) return `${r.low}–${r.high} ${r.unit}`;
  return r.high !== null ? `below ${r.high} ${r.unit}` : `above ${r.low} ${r.unit}`;
}

const isOutOfRange = (m: Measurement) => m.status === "ABOVE" || m.status === "BELOW";

/** Latest reading per measurement key, plus its history (oldest first), grouped by body system. */
export function measurementHistory(events: TimelineEvent[]) {
  const byKey = new Map<string, { system: string; readings: Measurement[] }>();
  for (const event of events) {
    for (const m of event.measurements) {
      const entry = byKey.get(m.key) ?? { system: String(event.system), readings: [] };
      entry.readings.push(m);
      byKey.set(m.key, entry);
    }
  }
  for (const entry of byKey.values()) entry.readings.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return byKey;
}

function distanceFromRange(m: Measurement) {
  const value = m.compared?.value ?? m.value;
  const r = m.reference;
  if (!r) return 0;
  if (r.high !== null && value > r.high) return value - r.high;
  if (r.low !== null && value < r.low) return r.low - value;
  return 0;
}

function measurementEvidence(m: Measurement, system: string): EvidenceItem {
  const shown = m.compared ? `${m.value} ${m.unit} (${m.compared.value} ${m.compared.unit})` : `${m.value} ${m.unit}`;
  return {
    id: `m:${m.key}`,
    kind: "MEASUREMENT",
    label: `${m.label} ${m.status === "ABOVE" ? "above" : "below"} reference range`,
    detail: `${shown} on ${formatDate(m.occurredAt)}. HOLON reference ${formatRange(m)} (${m.reference?.source}).`,
    source: "CLINICAL_REFERENCE",
    system,
  };
}

function trendEvidence(readings: Measurement[], system: string): EvidenceItem | null {
  if (readings.length < 2 || !readings.at(-1)?.reference) return null;
  const first = readings[0];
  const last = readings.at(-1)!;
  const before = distanceFromRange(first);
  const after = distanceFromRange(last);
  if (before === after) return null;
  const direction = after < before ? "moving toward" : "moving away from";
  return {
    id: `t:${last.key}`,
    kind: "TREND",
    label: `${last.label} ${direction} the reference range`,
    detail: `${first.value} ${first.unit} on ${formatDate(first.occurredAt)} → ${last.value} ${last.unit} on ${formatDate(last.occurredAt)}.`,
    source: "TWIN_RECORD",
    system,
  };
}

function reportedEvidence(symptom: NormalizedSymptom): EvidenceItem {
  const wording = symptom.userWording ? ` You described it as “${symptom.userWording}”.` : "";
  return {
    id: `s:${symptom.id}`,
    kind: "REPORTED_SYMPTOM",
    label: `${symptom.label} (reported today)`,
    detail: `${symptom.severity[0].toUpperCase()}${symptom.severity.slice(1)}, for about ${symptom.durationDays} day${symptom.durationDays === 1 ? "" : "s"}.${wording}`,
    source: "USER_PROVIDED",
  };
}

/** Symptoms recorded in the twin recently enough to count as current context. */
export function recentRecordedSymptoms(events: TimelineEvent[], now: Date) {
  return events
    .filter((e) => e.eventType === "symptom" && now.getTime() - new Date(e.occurredAt).getTime() <= RECORDED_SYMPTOM_WINDOW_DAYS * DAY_MS)
    .map((event) => ({ event, matches: matchSymptomText(event.title) }));
}

export function runSignalEngine({ events, symptoms, now }: EngineInput): HealthSignal[] {
  const signals: HealthSignal[] = [];
  const reportedIds = new Set(symptoms.map((s) => s.id));

  // 1. Red flags: reviewed rules that short-circuit to URGENT regardless of twin data.
  for (const rule of RED_FLAGS) {
    const hasAll = rule.all.every((id) => reportedIds.has(id));
    const hasAny = !rule.any || rule.any.some((id) => reportedIds.has(id));
    const severe = !rule.minSeverity || rule.all.some((id) => symptoms.find((s) => s.id === id)?.severity === "severe");
    if (!(hasAll && hasAny && severe)) continue;
    const involved = symptoms.filter((s) => rule.all.includes(s.id) || rule.any?.includes(s.id));
    signals.push({
      id: `signal-${rule.id}`, type: "URGENT", severity: "HIGH", system: rule.system, systemLabel: systemLabel(rule.system),
      title: "Possible emergency warning signs", ruleId: rule.id, rule: rule.description, source: "SYSTEM_GENERATED",
      evidence: [
        { id: `rf:${rule.id}`, kind: "RED_FLAG", label: rule.description, detail: `Matched reviewed red-flag rule ${rule.id}.`, source: "SYSTEM_GENERATED" },
        ...involved.map(reportedEvidence),
      ],
    });
  }
  if (signals.length) return signals.filter((s, i, all) => all.findIndex((o) => o.ruleId === s.ruleId) === i);

  // 2. Per-system context: out-of-range measurements + related symptoms.
  const history = measurementHistory(events);
  const recorded = recentRecordedSymptoms(events, now);
  const systems = new Set<string>([...events.map((e) => String(e.system)), ...symptoms.flatMap((s) => s.systems)]);

  for (const system of systems) {
    const reportedHere = symptoms.filter((s) => s.systems.includes(system as never));
    const recordedHere = recorded.filter(({ event, matches }) => event.system === system && matches.length > 0);
    // Measurements the reported or recorded symptoms are clinically relevant to (reviewed content).
    const relevantKeys = new Set([
      ...reportedHere.flatMap((s) => SYMPTOM_BY_ID.get(s.id)?.relatedMeasurements ?? []),
      ...recordedHere.flatMap(({ matches }) => matches.flatMap((m) => m.relatedMeasurements)),
    ]);

    const latestOut = [...history.values()]
      .filter(({ system: s, readings }) => s === system && isOutOfRange(readings.at(-1)!))
      .sort((a, b) => b.readings.at(-1)!.occurredAt.localeCompare(a.readings.at(-1)!.occurredAt));
    const related = latestOut.filter(({ readings }) => relevantKeys.has(readings.at(-1)!.key));
    const unrelated = latestOut.filter(({ readings }) => !relevantKeys.has(readings.at(-1)!.key));
    const evidenceFor = (group: typeof latestOut) => [
      ...group.map(({ readings }) => measurementEvidence(readings.at(-1)!, system)),
      ...group.map(({ readings }) => trendEvidence(readings, system)).filter((t): t is EvidenceItem => t !== null),
    ];

    const reported = reportedHere.map(reportedEvidence);
    const recordedEvidence = recordedHere.map(({ event }): EvidenceItem => ({
      id: `rs:${event.id}`, kind: "RECORDED_SYMPTOM", label: `${event.title} (recorded in twin)`,
      detail: `Recorded on ${formatDate(event.occurredAt)}${event.summary ? ` · ${event.summary}` : ""}.`, source: "TWIN_RECORD", system,
    }));
    const conditions = events
      .filter((e) => e.eventType === "diagnosis" && e.system === system)
      .map((e): EvidenceItem => ({
        id: `c:${e.id}`, kind: "RECORDED_CONDITION", label: `${e.title} (on record)`,
        detail: `Recorded by a clinician in the twin on ${formatDate(e.occurredAt)}. MediTwin did not make this diagnosis.`, source: "TWIN_RECORD", system,
      }));
    const additional = (group: typeof latestOut): EvidenceItem[] => group.length ? [{
      id: "x:other-results", kind: "ADDITIONAL_RESULTS", source: "CLINICAL_REFERENCE", system,
      label: `${group.length} other result${group.length === 1 ? " is" : "s are"} outside the reference range`,
      detail: `${group.map(({ readings }) => readings.at(-1)!.label).join(", ")}. Not linked to the symptoms above, so not used for this signal.`,
    }] : [];
    const label = systemLabel(system);

    if (related.length && (reported.length || recordedEvidence.length)) {
      const severe = reportedHere.some((s) => s.severity === "severe");
      signals.push({
        id: `signal-${system}-attention`, type: "ATTENTION", severity: severe ? "HIGH" : "MODERATE", system, systemLabel: label,
        title: `${label}: findings worth attention`, ruleId: "SIG-ATT-01",
        rule: "A latest measurement is outside its HOLON reference range and a symptom relevant to that measurement is reported or recently recorded.",
        evidence: [...evidenceFor(related), ...reported, ...recordedEvidence, ...conditions, ...additional(unrelated)], source: "SYSTEM_GENERATED",
      });
    } else if (latestOut.length) {
      signals.push({
        id: `signal-${system}-information`, type: "INFORMATION", severity: "LOW", system, systemLabel: label,
        title: `${label}: results outside reference range`, ruleId: "SIG-INF-01",
        rule: "A latest measurement is outside its HOLON reference range, without a symptom relevant to it.",
        evidence: [...evidenceFor(latestOut.slice(0, 4)), ...reported, ...conditions, ...additional(latestOut.slice(4))], source: "SYSTEM_GENERATED",
      });
    } else if (reported.length) {
      signals.push({
        id: `signal-${system}-symptoms`, type: "INFORMATION", severity: "LOW", system, systemLabel: label,
        title: `${label}: symptoms without related measurements`, ruleId: "SIG-INF-02",
        rule: "Symptoms were reported, but the twin has no out-of-range measurements for this body system.",
        evidence: [...reported, ...conditions], source: "SYSTEM_GENERATED",
      });
    }
  }

  // A symptoms-only signal adds nothing when a stronger signal already accounts for every symptom in it.
  const covered = new Set(signals.filter((s) => s.ruleId !== "SIG-INF-02").flatMap((s) => s.evidence.map((e) => e.id)));
  const useful = signals.filter((s) => s.ruleId !== "SIG-INF-02" || s.evidence.some((e) => e.kind === "REPORTED_SYMPTOM" && !covered.has(e.id)));

  return useful.sort((a, b) =>
    SIGNAL_ORDER[a.type] - SIGNAL_ORDER[b.type]
    || b.evidence.filter((e) => e.kind === "REPORTED_SYMPTOM").length - a.evidence.filter((e) => e.kind === "REPORTED_SYMPTOM").length
    || b.evidence.length - a.evidence.length);
}

export function guidanceFor(signal: HealthSignal | null): CareGuidance {
  if (!signal) return { ...GUIDANCE.none, contentId: GUIDANCE.none.id };
  if (signal.type === "URGENT") {
    const rule = RED_FLAGS.find((r) => r.id === signal.ruleId);
    const content = GUIDANCE[rule?.guidanceId ?? "urgent-chest"];
    return { ...content, contentId: content.id };
  }
  const content = signal.type === "ATTENTION" ? GUIDANCE.attention : GUIDANCE.information;
  return {
    ...content,
    contentId: content.id,
    seekUrgentCareIf: [...(SYSTEM_WARNING_SIGNS[signal.system] ?? []), ...content.seekUrgentCareIf],
  };
}

export function symptomLabel(id: string) {
  return SYMPTOM_BY_ID.get(id)?.label ?? id;
}
