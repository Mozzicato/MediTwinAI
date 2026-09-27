// Live: a signed-in person connects an OntoMorph twin with a grant token and analyses their data.
// Uses a sandbox grant (synthetic twin) and a throwaway local database. Run with `npm run test:live`.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const live = process.env.RUN_LIVE === "1";
if (live) {
  process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "meditwin-live-")), "live.db").replace(/\\/g, "/")}`;
  process.env.DATA_ENCRYPTION_KEY = "live-test-only-key";
}

describe.skipIf(!live)("personal account with a connected OntoMorph twin (live)", () => {
  it("connects a grant token, merges twin data with the person's own entries, and analyses", async () => {
    const { createLocalUser } = await import("@/lib/local-auth");
    const service = await import("@/server/personal/service");
    const { sandboxGrants } = await import("@/server/ontomorph/dtp");
    const { Trace } = await import("@/server/trace");

    const user = (await createLocalUser(`live-${Date.now()}@example.com`, "a long test password"))!;
    await service.saveProfile(user, { firstName: "Test", birthYear: 1996, sex: "male" });

    const grant = (await sandboxGrants(new Trace("test"))).find((g) => g.twinId.endsWith("102"))!;
    const connected = await service.connectTwin(new Trace("test"), user, grant.grantToken);
    expect(connected).toMatchObject({ environment: "sandbox", twinId: grant.twinId });
    expect(connected.eventCount).toBeGreaterThan(5);

    await service.addEntry(new Trace("test"), user, { typeId: "fasting_glucose", values: { value: 6.8 }, unit: "mmol/L", occurredAt: new Date().toISOString(), syncToTwin: false });
    const view = await service.personalView(new Trace("test"), user);
    expect(view.personal?.connection).toMatchObject({ connected: true, status: "ok" });
    const glucose = view.events.flatMap((e) => e.measurements).filter((m) => m.key === "fasting_glucose");
    expect(glucose.length).toBeGreaterThanOrEqual(2); // twin reading + the person's own entry share one history
    expect(glucose.find((m) => m.unit === "mmol/L")).toMatchObject({ status: "ABOVE", compared: { unit: "mg/dL" } });
    expect(view.simulations).toContain("hba1c_trajectory");

    const result = await service.analyzePersonal(new Trace("test"), user, [{ id: "increased_thirst", severity: "moderate", durationDays: 10 }]);
    expect(result.primary?.type).toBe("ATTENTION");
    expect(result.explanation.safety.passed).toBe(true);

    await expect(service.connectTwin(new Trace("test"), user, `${grant.grantToken.slice(0, -4)}abcd`)).rejects.toMatchObject({ status: 400 });
    await service.deleteAccount(user);
  }, 120_000);
});
