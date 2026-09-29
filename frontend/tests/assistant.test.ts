import { describe, expect, it } from "vitest";
import { SentenceGuard, buildTwinBrief, parseReadings, starterPrompts, suggestActions, withoutKnownReadings } from "@/domain/assistant";
import { matchEmergencyText } from "@/domain/content";
import type { TwinView } from "@/domain/types";
import { davidEvents } from "./helpers";

function stream(guard: SentenceGuard, text: string, chunk = 7) {
  let out = "";
  for (let i = 0; i < text.length; i += chunk) out += guard.push(text.slice(i, i + chunk));
  return out + guard.flush();
}

describe("assistant emergency gate", () => {
  it.each([
    ["I have chest pain and I'm short of breath", "RF-TEXT-CHEST"],
    ["crushing chest pain since this morning", "RF-TEXT-CHEST"],
    ["my dad can't breathe properly", "RF-TEXT-BREATH"],
    ["her face is drooping and she has slurred speech", "RF-TEXT-STROKE"],
    ["I want to kill myself", "RF-TEXT-CRISIS"],
  ])("routes %j to reviewed guidance", (text, id) => {
    expect(matchEmergencyText(text)?.id).toBe(id);
  });

  it.each([
    "What does my HbA1c mean?",
    "I've been tired and thirsty for two weeks",
    "Is my blood pressure getting better?",
    "I had chest pain last year, is that in my record?",
  ])("lets %j through to the assistant", (text) => {
    expect(matchEmergencyText(text)).toBeNull();
  });
});

describe("SentenceGuard", () => {
  it("streams safe text unchanged, sentence by sentence", () => {
    const text = "Your HbA1c is 7.1 % on 6 Sept 2026.\nIt is above the reference range of 4.0–5.6 %. That's worth raising with your clinician.";
    const guard = new SentenceGuard();
    expect(stream(guard, text)).toBe(text);
    expect(guard.removed).toBe(0);
  });

  it("drops an unsafe sentence before it is released", () => {
    const guard = new SentenceGuard();
    const out = stream(guard, "Your HbA1c is above its reference range. You have diabetes. Bring this up at your next visit.");
    expect(out).not.toMatch(/you have diabetes/i);
    expect(out).toContain("Bring this up at your next visit.");
    expect(guard.removed).toBe(1);
    expect(guard.violations).toContain("NO_DEFINITIVE_DIAGNOSIS");
  });

  it("catches unsafe bullet points and bold text", () => {
    const guard = new SentenceGuard();
    const out = stream(guard, "A few things:\n- **Stop taking metformin** for now\n- Keep a symptom diary\n");
    expect(out).not.toMatch(/metformin/i);
    expect(out).toContain("- Keep a symptom diary");
    expect(guard.removed).toBe(1);
  });

  it("holds back an unfinished sentence until it is complete", () => {
    const guard = new SentenceGuard();
    expect(guard.push("Your results look")).toBe("");
    expect(guard.push(" normal. ")).toBe("");
    expect(guard.removed).toBe(1);
  });
});

describe("assistant actions", () => {
  it("reads blood pressure, HbA1c, fasting glucose and pulse from a message", () => {
    const actions = parseReadings("My BP was 150/95, hba1c 7.2%, fasting sugar 6.1 mmol and pulse 88");
    expect(actions).toEqual([
      expect.objectContaining({ kind: "log_result", typeId: "blood_pressure", values: { systolic: 150, diastolic: 95 }, unit: "mmHg" }),
      expect.objectContaining({ typeId: "hba1c", values: { value: 7.2 }, unit: "%" }),
      expect.objectContaining({ typeId: "fasting_glucose", values: { value: 6.1 }, unit: "mmol/L" }),
      expect.objectContaining({ typeId: "heart_rate", values: { heartRate: 88 }, unit: "bpm" }),
    ]);
  });

  it("doesn't offer to save a reading the twin already holds", () => {
    const events = davidEvents();
    const hba1c = events.flatMap((e) => e.measurements).filter((m) => m.key === "hba1c").sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
    const asked = parseReadings(`What does my HbA1c of ${hba1c.value} mean? My pulse is 72`);
    expect(withoutKnownReadings(asked, events, new Date(hba1c.occurredAt)).map((a) => a.kind === "log_result" && a.typeId)).toEqual(["heart_rate"]);
  });

  it("ignores implausible readings", () => {
    expect(parseReadings("my blood pressure is 15/9")).toEqual([]);
  });

  it("offers a symptom check with the person's own words, and never logs for sample twins", () => {
    const actions = suggestActions("I'm always thirsty and my BP was 140/90. Should I see a doctor?", { canLog: false });
    expect(actions.map((a) => a.kind)).toEqual(["symptom_check", "open"]);
    const check = actions[0];
    expect(check.kind === "symptom_check" && check.symptoms[0]).toMatchObject({ id: "increased_thirst", quote: "thirsty" });
  });
});

describe("twin brief", () => {
  const view: TwinView = {
    persona: { twinId: "t", name: "David", age: 28, sex: "male", headline: "" },
    twinId: "t", grant: { systems: null, eventTypes: null, expiresAt: "" }, events: davidEvents(),
    systems: [], medications: [], interactions: { checked: false, drugCount: 0, pairs: [], note: "" },
    recordedConditions: [], baselineSignals: [], simulations: [], fetchedAt: "", trace: [],
  };

  it("includes the results and reference ranges, but not the person's name", () => {
    const brief = buildTwinBrief(view);
    expect(brief).toContain("28-year-old male");
    expect(brief).toMatch(/HbA1c: 7\.1 %.*above the reference range 4–5\.6 %/);
    expect(brief).not.toContain("David");
  });

  it("builds conversation starters from out-of-range results", () => {
    expect(starterPrompts(view)[0]).toMatch(/^What does my .+ mean\?$/);
  });
});
