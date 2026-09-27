// Live integration tests against the OntoMorph sandbox and HOLON (PRD §48 "Integration tests").
// Skipped unless RUN_LIVE=1, because they need network access and real API keys:
//   RUN_LIVE=1 npm run test:live
import { describe, expect, it } from "vitest";
import { Trace } from "@/server/trace";

const live = process.env.RUN_LIVE === "1";
const DAVID = "5a4d0000-0000-0000-0000-000000000102";

describe.skipIf(!live)("MediTwin → OntoMorph DTP + HOLON (live)", () => {
  it("mints sandbox grants and loads David's twin with HOLON reference ranges", async () => {
    const { loadTwin } = await import("@/server/twin-service");
    const view = await loadTwin(new Trace("test"), DAVID, { fresh: true });
    expect(view.events.length).toBeGreaterThan(5);
    const hba1c = view.events.flatMap((e) => e.measurements).find((m) => m.key === "hba1c");
    expect(hba1c?.reference?.source).toBeTruthy();
    expect(hba1c?.status).toBe("ABOVE");
    expect(view.systems.find((s) => s.id === "metabolic")?.anatomy.every((o) => o.verified)).toBe(true);
  }, 60_000);

  it("resolves a LOINC concept through HOLON", async () => {
    const { resolveConcept } = await import("@/server/ontomorph/holon");
    const concept = await resolveConcept(new Trace("test"), "LOINC", "4548-4");
    expect(concept?.conceptName).toMatch(/A1c/);
  }, 30_000);

  it("runs the full analysis loop and returns a cited, safe explanation", async () => {
    const { analyzeTwin } = await import("@/server/twin-service");
    const result = await analyzeTwin(new Trace("test"), DAVID, [
      { id: "increased_thirst", severity: "moderate", durationDays: 14 },
      { id: "frequent_urination", severity: "moderate", durationDays: 14 },
    ]);
    expect(result.primary?.type).toBe("ATTENTION");
    expect(result.explanation.safety.passed).toBe(true);
    expect(result.anatomy.map((o) => o.organ)).toContain("pancreas");
  }, 90_000);
});
