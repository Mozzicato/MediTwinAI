// Pure normalization of OntoMorph DTP health events into MediTwin's internal model (FR-002, FR-005).
// No network access here: HOLON lookups are injected by the server service so this stays testable.

import {
  LOINC_KEY, MEASUREMENT_FIELDS, TEST_NAME_LOINC, UNIT_CONVERSIONS, canonicalUnit, matchSymptomText, type MeasurementContent,
} from "./content";
import type { Concept, Measurement, RangeStatus, ReferenceRange, TimelineEvent } from "./types";

/** Wire shape of a DTP health event (clinical fields live inside `data`). */
export interface DtpEvent {
  id: string;
  twinId: string;
  eventType: string;
  occurredAt: string;
  title: string;
  description?: string;
  data: Record<string, unknown>;
  source?: { plugin?: string | null };
}

const CATEGORY_LABELS: Record<string, string> = {
  lab_result: "Lab result", vital_sign: "Vital sign", device_reading: "Device reading", symptom: "Symptom",
  medication: "Medication", diagnosis: "Recorded diagnosis", clinical_note: "Clinical note", immunisation: "Immunisation",
  encounter: "Visit", care_plan: "Care plan", imaging: "Imaging", referral: "Referral", allergy: "Allergy",
  family_history: "Family history", social_history: "Social history", procedure: "Procedure", biopsy_result: "Biopsy",
  staging: "Staging", tumour_registration: "Tumour registration", treatment_cycle: "Treatment", implant_device: "Implanted device",
  dental: "Dental", wound_photo: "Wound check", insurance: "Insurance", advance_directive: "Advance directive", emergency_info: "Emergency info",
};

export function categoryLabel(eventType: string) {
  return CATEGORY_LABELS[eventType] ?? eventType.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Pull every numeric measurement MediTwin knows how to interpret out of one event. */
export function extractMeasurements(event: DtpEvent): Omit<Measurement, "reference" | "status" | "concept">[] {
  const data = event.data ?? {};
  const eventUnit = str(data.unit) ?? "";
  const base = { occurredAt: event.occurredAt, eventId: event.id };
  const found: Omit<Measurement, "reference" | "status" | "concept">[] = [];
  const push = (content: MeasurementContent, value: number, unit: string, recordedRange?: string) =>
    found.push({ ...base, key: content.key, label: content.label, loinc: content.loinc, value, unit, recordedRange });

  const loinc = str(data.loinc_code);
  const value = num(data.value);
  const testName = str(data.testName)?.toLowerCase();

  // A lab panel lists its analytes as separate fields; its top-level `value` duplicates one of them.
  const isPanel = testName === "lipid panel" || testName === "cbc";
  if (!isPanel && value !== null && event.eventType === "lab_result") {
    const byName = testName ? TEST_NAME_LOINC[testName] : undefined;
    const content = byName ?? (loinc ? LOINC_KEY[loinc] ?? { key: `loinc_${loinc}`, label: str(data.loinc_display) ?? event.title, loinc } : undefined);
    if (content) push({ ...content, loinc: loinc ?? content.loinc }, value, eventUnit, str(data.referenceRange));
  }

  for (const [field, content] of Object.entries(MEASUREMENT_FIELDS)) {
    const fieldValue = num(data[field]);
    if (fieldValue === null) continue;
    // Panel-level units (e.g. "g/dL" on a CBC) only describe some analytes, so catalog units win.
    push(content, fieldValue, content.unit ?? eventUnit, undefined);
  }

  if (event.eventType === "device_reading" && value !== null && str(data.device) === "peak_flow_meter") {
    push({ key: "peak_flow", label: "Peak expiratory flow", loinc: "19935-6" }, value, eventUnit || "L/min");
  }
  return found;
}

/** Compare a value with a HOLON reference range, converting units only where the content set allows it. */
export function evaluateAgainstRange(
  value: number, unit: string, loinc: string | undefined, range: ReferenceRange | null,
): { status: RangeStatus; compared?: { value: number; unit: string } } {
  if (!range || (range.low === null && range.high === null)) return { status: "NO_REFERENCE" };
  const from = canonicalUnit(unit);
  const to = canonicalUnit(range.unit);
  let comparable = value;
  let compared: { value: number; unit: string } | undefined;
  if (from && from !== to) {
    const conversion = loinc ? UNIT_CONVERSIONS[loinc]?.find((c) => c.from === from && c.to === to) : undefined;
    if (!conversion) return { status: "UNIT_MISMATCH" };
    const converted = value * conversion.factor;
    comparable = Math.abs(converted) >= 10 ? Math.round(converted * 10) / 10 : Math.round(converted * 100) / 100;
    compared = { value: comparable, unit: range.unit };
  }
  if (range.high !== null && comparable > range.high) return { status: "ABOVE", compared };
  if (range.low !== null && comparable < range.low) return { status: "BELOW", compared };
  return { status: "WITHIN", compared };
}

/** Codes present on an event that HOLON can resolve. */
export function extractConcepts(event: DtpEvent): Concept[] {
  const data = event.data ?? {};
  const concepts: Concept[] = [];
  const loinc = str(data.loinc_code);
  if (loinc) concepts.push({ vocabulary: "LOINC", code: loinc, resolved: false });
  const rx = str(data.rxNorm);
  if (rx) concepts.push({ vocabulary: "RxNorm", code: rx, resolved: false });
  const icd = str(data.icdCode);
  if (icd) concepts.push({ vocabulary: "ICD-10", code: icd, resolved: false });
  if (event.eventType === "symptom") {
    for (const symptom of matchSymptomText(`${str(data.symptom) ?? ""} ${event.title}`)) {
      concepts.push({ vocabulary: "SNOMED-CT", code: symptom.snomed, resolved: false });
    }
  }
  return concepts;
}

function formatValue(value: number, unit: string) {
  return `${value}${unit ? ` ${unit}` : ""}`;
}

/** One-line human summary for the timeline. Clinical codes stay out of it on purpose (PRD 4.3). */
export function summarizeEvent(event: DtpEvent, measurements: Measurement[]): string {
  const data = event.data ?? {};
  if (event.eventType === "vital_sign" && num(data.systolic) !== null) {
    return `${data.systolic}/${data.diastolic} mmHg${num(data.heartRate) !== null ? ` · heart rate ${data.heartRate} bpm` : ""}`;
  }
  if (event.eventType === "device_reading" && str(data.device) === "CGM") {
    return `Average ${data.averageValue} ${data.unit ?? ""} · ${data.timeInRangePct}% of time in range`;
  }
  if (measurements.length === 1) return formatValue(measurements[0].value, measurements[0].unit);
  if (measurements.length > 1) return measurements.slice(0, 4).map((m) => `${m.label} ${formatValue(m.value, m.unit)}`).join(" · ");
  const parts = [str(data.dosage), str(data.frequency), str(data.status), str(data.severity), str(data.note), str(data.findings),
    str(data.reason), str(data.condition) && `${data.condition}${num(data.ageAtOnset) ? ` at ${data.ageAtOnset}` : ""}`,
    str(data.reaction) && `reaction: ${data.reaction}`, str(data.alert), num(data.durationDays) !== null ? `${data.durationDays} days` : undefined]
    .filter(Boolean);
  return parts.slice(0, 3).join(" · ") || categoryLabel(event.eventType);
}

export function buildTimelineEvent(event: DtpEvent, measurements: Measurement[], concepts: Concept[]): TimelineEvent {
  const data = event.data ?? {};
  return {
    id: event.id,
    occurredAt: event.occurredAt,
    eventType: event.eventType,
    category: categoryLabel(event.eventType),
    title: event.title,
    system: str(data.system) ?? "unspecified",
    summary: summarizeEvent(event, measurements),
    measurements,
    concepts,
    sourcePlugin: event.source?.plugin ?? "unknown",
    attention: measurements.some((m) => m.status === "ABOVE" || m.status === "BELOW"),
    meditwinFlag: Boolean((data as { meditwin?: unknown }).meditwin),
  };
}

/** Extract the product strength ("500 MG") from an RxNorm name and compare it with the twin label dose. */
export function doseMismatch(label: string, dosage: string | undefined, holonName: string | undefined): boolean {
  if (!holonName) return false;
  const coded = holonName.match(/(\d+(?:\.\d+)?)\s*MG\b/i)?.[1];
  const recorded = (dosage ?? label).match(/(\d+(?:\.\d+)?)\s*mg\b/i)?.[1];
  return Boolean(coded && recorded && Number(coded) !== Number(recorded));
}
