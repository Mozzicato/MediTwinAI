import fixture from "../src/domain/__fixtures__/sandbox-twins.json";
import { SYMPTOM_BY_ID } from "@/domain/content";
import { buildTimelineEvent, evaluateAgainstRange, extractConcepts, extractMeasurements, type DtpEvent } from "@/domain/normalize";
import type { Measurement, NormalizedSymptom, ReferenceRange, Severity, TimelineEvent } from "@/domain/types";

// Reference ranges exactly as HOLON returned them for these LOINC codes (captured 2026-09-27).
const HOLON_RANGES: Record<string, [number, number, string]> = {
  "4548-4": [4.0, 5.6, "%"],
  "2345-7": [70, 100, "mg/dL"],
  "39156-5": [18.5, 24.9, "kg/m2"],
  "13457-7": [0, 100, "mg/dL"],
  "2571-8": [0, 150, "mg/dL"],
  "2093-3": [0, 200, "mg/dL"],
  "8480-6": [90, 120, "mm[Hg]"],
  "8462-4": [60, 80, "mm[Hg]"],
  "8867-4": [60, 100, "/min"],
};

export function holonRange(loinc: string): ReferenceRange | null {
  const r = HOLON_RANGES[loinc];
  return r ? { low: r[0], high: r[1], unit: r[2], label: loinc, source: "CLSI C28-A3 / WHO 2025", loinc } : null;
}

export function normalizeFixture(events: DtpEvent[]): TimelineEvent[] {
  return events.map((event) => {
    const measurements: Measurement[] = extractMeasurements(event).map((m) => {
      const reference = m.loinc ? holonRange(m.loinc) : null;
      return { ...m, reference, ...evaluateAgainstRange(m.value, m.unit, m.loinc, reference) };
    });
    return buildTimelineEvent(event, measurements, extractConcepts(event));
  });
}

export const davidEvents = () => normalizeFixture(fixture.metabolic as DtpEvent[]);
export const graceEvents = () => normalizeFixture(fixture.cardiovascular as DtpEvent[]);

/** "Now" for the fixture: two days after the latest captured event. */
export const FIXTURE_NOW = new Date("2026-09-27T12:00:00Z");

export function symptom(id: string, severity: Severity = "moderate", durationDays = 14): NormalizedSymptom {
  const content = SYMPTOM_BY_ID.get(id);
  if (!content) throw new Error(`Unknown symptom ${id}`);
  return {
    id, severity, durationDays, label: content.label, systems: content.systems,
    snomed: { vocabulary: "SNOMED-CT", code: content.snomed, resolved: true },
    hpo: { vocabulary: "HPO", code: content.hpo, resolved: true },
  };
}
