import { describe, expect, it } from "vitest";
import { MEASUREMENT_FIELDS, RED_FLAGS, SYMPTOMS, SYSTEMS, TEST_NAME_LOINC, matchSymptomText } from "@/domain/content";
import { buildTemplateExplanation } from "@/domain/explanations";
import { doseMismatch, evaluateAgainstRange, extractMeasurements } from "@/domain/normalize";
import { guidanceFor, runSignalEngine } from "@/domain/signals";
import { FIXTURE_NOW, davidEvents, graceEvents, holonRange, symptom } from "./helpers";

describe("reference range comparison (FR-007)", () => {
  it("flags the PRD example: fasting glucose 6.1 mmol/L against HOLON's mg/dL range", () => {
    const result = evaluateAgainstRange(6.1, "mmol/L", "2345-7", holonRange("2345-7"));
    expect(result.status).toBe("ABOVE");
    expect(result.compared).toEqual({ value: 109.9, unit: "mg/dL" });
  });

  it("treats a value inside the range as within it", () => {
    expect(evaluateAgainstRange(5.2, "%", "4548-4", holonRange("4548-4")).status).toBe("WITHIN");
    expect(evaluateAgainstRange(3.2, "%", "4548-4", holonRange("4548-4")).status).toBe("BELOW");
  });

  it("matches unit aliases such as bpm and /min without converting", () => {
    expect(evaluateAgainstRange(82, "bpm", "8867-4", holonRange("8867-4"))).toEqual({ status: "WITHIN", compared: undefined });
  });

  it("refuses to compare when no approved conversion exists", () => {
    expect(evaluateAgainstRange(7.1, "mmol/mol", "4548-4", holonRange("4548-4")).status).toBe("UNIT_MISMATCH");
  });

  it("never invents a range when HOLON has none", () => {
    expect(evaluateAgainstRange(156, "mg/dL", "97507-8", null).status).toBe("NO_REFERENCE");
  });
});

describe("twin normalization (FR-005, FR-006)", () => {
  it("extracts panel analytes individually instead of the duplicated top-level value", () => {
    const lipid = graceEvents().find((e) => e.title === "Lipid Panel")!;
    expect(lipid.measurements.map((m) => m.key).sort()).toEqual(["hdl", "ldl", "total_cholesterol", "triglycerides"]);
  });

  it("identifies fasting glucose by test name and maps it to LOINC 2345-7", () => {
    const glucose = davidEvents().find((e) => e.title === "Fasting Plasma Glucose")!;
    expect(glucose.measurements[0]).toMatchObject({ key: "fasting_glucose", loinc: "2345-7", value: 142, status: "ABOVE", recordedRange: "70-99" });
  });

  it("splits a blood pressure vital sign into systolic, diastolic and heart rate", () => {
    const event = { id: "e", twinId: "t", eventType: "vital_sign", occurredAt: "2026-09-01T00:00:00Z", title: "Blood Pressure", data: { unit: "mmHg", systolic: 132, diastolic: 84, heartRate: 71 } };
    expect(extractMeasurements(event).map((m) => [m.key, m.unit])).toEqual([["systolic_bp", "mmHg"], ["diastolic_bp", "mmHg"], ["heart_rate", "bpm"]]);
  });

  it("recognises symptoms recorded in a twin (FR-009)", () => {
    expect(matchSymptomText("Polyuria and increased thirst").map((s) => s.id).sort()).toEqual(["frequent_urination", "increased_thirst"]);
    expect(matchSymptomText("Shortness of breath on exertion").map((s) => s.id)).toEqual(["shortness_of_breath"]);
  });

  it("notices when a medication label and its RxNorm code disagree on strength", () => {
    expect(doseMismatch("Metformin 1000mg", "1000mg", "metformin hydrochloride 500 MG Oral Tablet")).toBe(true);
    expect(doseMismatch("Amlodipine 5mg", "5mg", "amlodipine 5 MG Oral Tablet")).toBe(false);
    expect(doseMismatch("Metformin 1000mg", "1000mg", undefined)).toBe(false);
  });
});

describe("signal engine (FR-010, FR-011)", () => {
  it("produces the PRD's attention signal for David's twin plus reported symptoms", () => {
    const [signal] = runSignalEngine({ events: davidEvents(), symptoms: [symptom("increased_thirst"), symptom("frequent_urination"), symptom("fatigue")], now: FIXTURE_NOW });
    expect(signal).toMatchObject({ type: "ATTENTION", severity: "MODERATE", system: "metabolic", ruleId: "SIG-ATT-01" });
    const ids = signal.evidence.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(["m:hba1c", "m:fasting_glucose", "t:hba1c", "s:increased_thirst", "s:frequent_urination"]));
  });

  it("only uses measurements relevant to the symptoms as supporting evidence", () => {
    const [signal] = runSignalEngine({ events: davidEvents(), symptoms: [symptom("increased_thirst")], now: FIXTURE_NOW });
    const measurements = signal.evidence.filter((e) => e.kind === "MEASUREMENT").map((e) => e.id);
    expect(measurements).not.toContain("m:ldl");
    expect(signal.evidence.find((e) => e.kind === "ADDITIONAL_RESULTS")?.detail).toContain("LDL cholesterol");
  });

  it("counts a recently recorded twin symptom as context even before the user reports anything", () => {
    const [signal] = runSignalEngine({ events: davidEvents(), symptoms: [], now: FIXTURE_NOW });
    expect(signal.type).toBe("ATTENTION");
    expect(signal.evidence.some((e) => e.kind === "RECORDED_SYMPTOM")).toBe(true);
  });

  it("drops to an information signal once recorded symptoms are outside the context window", () => {
    const [signal] = runSignalEngine({ events: davidEvents(), symptoms: [], now: new Date("2027-03-01T00:00:00Z") });
    expect(signal).toMatchObject({ type: "INFORMATION", ruleId: "SIG-INF-01" });
  });

  it("raises severity when a relevant symptom is severe", () => {
    const [signal] = runSignalEngine({ events: davidEvents(), symptoms: [symptom("increased_thirst", "severe")], now: FIXTURE_NOW });
    expect(signal.severity).toBe("HIGH");
  });

  it("does not create an attention signal from an unrelated symptom", () => {
    const signals = runSignalEngine({ events: graceEvents(), symptoms: [symptom("wheezing")], now: FIXTURE_NOW });
    expect(signals.find((s) => s.system === "cardiovascular")?.type).toBe("INFORMATION");
    expect(signals.find((s) => s.system === "respiratory")).toMatchObject({ ruleId: "SIG-INF-02" });
  });

  it("escalates chest pain with breathlessness to URGENT regardless of twin data", () => {
    const signals = runSignalEngine({ events: [], symptoms: [symptom("chest_pain"), symptom("shortness_of_breath", "mild")], now: FIXTURE_NOW });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ type: "URGENT", ruleId: "RF-CHEST-01" });
    expect(guidanceFor(signals[0]).steps[0]).toContain("emergency");
  });

  it("escalates severe chest pain on its own", () => {
    expect(runSignalEngine({ events: [], symptoms: [symptom("chest_pain", "severe")], now: FIXTURE_NOW })[0].ruleId).toBe("RF-CHEST-02");
  });

  it("returns no signal when nothing is out of range and nothing is reported", () => {
    const signals = runSignalEngine({ events: davidEvents().filter((e) => !e.attention && e.eventType !== "symptom"), symptoms: [], now: FIXTURE_NOW });
    expect(signals).toEqual([]);
    expect(guidanceFor(null).level).toBe("NONE");
  });

  it("does not add a symptoms-only signal for symptoms a stronger signal already covers", () => {
    const signals = runSignalEngine({ events: davidEvents(), symptoms: [symptom("frequent_urination")], now: FIXTURE_NOW });
    expect(signals.map((s) => s.ruleId)).toEqual(["SIG-ATT-01"]);
  });
});

describe("reviewed template explanations (FR-012, FR-013)", () => {
  it("cites evidence for every paragraph and says it is not a diagnosis", () => {
    const [signal] = runSignalEngine({ events: davidEvents(), symptoms: [symptom("increased_thirst")], now: FIXTURE_NOW });
    const explanation = buildTemplateExplanation(signal);
    const known = new Set(signal.evidence.map((e) => e.id));
    for (const p of explanation.paragraphs) {
      expect(p.evidenceIds.length).toBeGreaterThan(0);
      expect(p.evidenceIds.every((id) => known.has(id))).toBe(true);
    }
    expect(explanation.safety.passed).toBe(true);
    expect(explanation.disclaimer).toContain("not a diagnosis");
    expect(explanation.paragraphs[0].text).toContain("HbA1c");
  });

  it("lower-cases symptom names mid-sentence but keeps acronyms such as HbA1c", () => {
    const [signal] = runSignalEngine({ events: davidEvents(), symptoms: [symptom("increased_thirst"), symptom("frequent_urination")], now: FIXTURE_NOW });
    const text = buildTemplateExplanation(signal).paragraphs.map((p) => p.text).join(" ");
    expect(text).toContain("you reported increased thirst and frequent urination today");
    expect(text).toContain("Your latest HbA1c result");
  });

  it("passes the safety layer for every signal type", () => {
    const cases = [
      runSignalEngine({ events: davidEvents(), symptoms: [symptom("fatigue")], now: FIXTURE_NOW })[0],
      runSignalEngine({ events: davidEvents(), symptoms: [], now: new Date("2027-03-01T00:00:00Z") })[0],
      runSignalEngine({ events: [], symptoms: [symptom("headache")], now: FIXTURE_NOW })[0],
      runSignalEngine({ events: [], symptoms: [symptom("chest_pain", "severe")], now: FIXTURE_NOW })[0],
      null,
    ];
    for (const signal of cases) expect(buildTemplateExplanation(signal).safety.passed).toBe(true);
  });

  it("asks no clinician questions for urgent signals, where the only step is emergency care", () => {
    const [signal] = runSignalEngine({ events: [], symptoms: [symptom("chest_pain", "severe")], now: FIXTURE_NOW });
    expect(buildTemplateExplanation(signal).questions).toEqual([]);
  });
});

describe("content set integrity", () => {
  const knownKeys = new Set([...Object.values(MEASUREMENT_FIELDS), ...Object.values(TEST_NAME_LOINC)].map((m) => m.key).concat("peak_flow"));

  it("links symptoms only to measurement keys the normalizer can produce", () => {
    for (const s of SYMPTOMS) for (const key of s.relatedMeasurements) expect(knownKeys, `${s.id} → ${key}`).toContain(key);
  });

  it("uses only catalog symptoms in red-flag rules", () => {
    const ids = new Set(SYMPTOMS.map((s) => s.id));
    for (const rule of RED_FLAGS) for (const id of [...rule.all, ...(rule.any ?? [])]) expect(ids).toContain(id);
  });

  it("gives every mapped organ an FMA code", () => {
    for (const system of Object.values(SYSTEMS)) for (const organ of system.organs) expect(organ.fma).toMatch(/^\d+$/);
  });
});
