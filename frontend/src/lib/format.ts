import type { Measurement, SourceType, SystemStatus } from "@/domain/types";

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** UCUM units as people write them, e.g. mm[Hg] → mmHg. */
export const displayUnit = (unit: string) => unit.replace("mm[Hg]", "mmHg");

export function rangeText(m: Measurement) {
  const r = m.reference;
  if (!r) return null;
  const unit = displayUnit(r.unit);
  if (r.low !== null && r.high !== null) return `${r.low}–${r.high} ${unit}`;
  return r.high !== null ? `< ${r.high} ${unit}` : `> ${r.low} ${unit}`;
}

export const STATUS_TEXT: Record<Measurement["status"], string> = {
  ABOVE: "Above reference",
  BELOW: "Below reference",
  WITHIN: "Within reference",
  NO_REFERENCE: "No HOLON reference",
  UNIT_MISMATCH: "Units not comparable",
};

export const SYSTEM_STATUS_TEXT: Record<SystemStatus, string> = {
  URGENT: "Urgent",
  ATTENTION: "Attention",
  INFORMATION: "Information",
  CLEAR: "No current signal",
  NO_DATA: "No recent data",
};

export const SOURCE_TEXT: Record<SourceType, string> = {
  TWIN_RECORD: "Your digital twin",
  ONTOLOGY_DERIVED: "HOLON ontology",
  CLINICAL_REFERENCE: "Clinical reference",
  USER_PROVIDED: "You reported",
  SYSTEM_GENERATED: "MediTwin rules",
  MODEL_INFERRED: "AI (checked)",
};

export function ms(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${value} ms`;
}
