// Personal-account flow against a throwaway local libSQL file (no network, no production data).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(path.join(tmpdir(), "meditwin-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db").replace(/\\/g, "/")}`;
process.env.DATA_ENCRYPTION_KEY = "test-only-encryption-key";
process.env.HOLON_API_KEY = "";
process.env.ONTOMORPH_API_KEY = "";
process.env.DTP_LIVE_PERSONAL = "";
process.env.GROQ_API_KEY = "";
process.env.ANTHROPIC_API_KEY = "";

type Modules = {
  auth: typeof import("@/lib/local-auth");
  service: typeof import("@/server/personal/service");
  db: typeof import("@/server/db");
  trace: typeof import("@/server/trace");
};
let m: Modules;

beforeAll(async () => {
  m = {
    auth: await import("@/lib/local-auth"),
    service: await import("@/server/personal/service"),
    db: await import("@/server/db"),
    trace: await import("@/server/trace"),
  };
});
// Best effort: on Windows the native driver can hold the file briefly; the OS temp dir is cleaned anyway.
afterAll(() => { m?.db.closeDb(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

const newTrace = () => new m.trace.Trace("test");

describe("personal accounts", () => {
  it("runs the full journey: sign up → consent → entries → check-ins → export → delete", async () => {
    const user = (await m.auth.createLocalUser("Ada@Example.com", "correct horse battery"))!;
    expect(user.email).toBe("ada@example.com");
    expect(await m.auth.createLocalUser("ada@example.com", "another password")).toBeNull();
    expect(await m.auth.authenticateLocalUser("ada@example.com", "wrong password")).toBeNull();
    expect(await m.auth.authenticateLocalUser("ada@example.com", "correct horse battery")).toEqual(user);

    // A view before onboarding asks the person to finish setup.
    await expect(m.service.personalView(newTrace(), user)).rejects.toMatchObject({ status: 409 });
    await expect(m.service.saveProfile(user, { firstName: "Ada", birthYear: new Date().getUTCFullYear() - 5, sex: "female" })).rejects.toMatchObject({ status: 400 });
    await m.service.saveProfile(user, { firstName: "Ada", birthYear: 1990, sex: "female" });

    // Entries are validated against the catalog.
    await expect(m.service.addEntry(newTrace(), user, { typeId: "hba1c", values: { value: 70 }, unit: "%", occurredAt: new Date().toISOString(), syncToTwin: false }))
      .rejects.toMatchObject({ status: 400 });
    const { entry, sync } = await m.service.addEntry(newTrace(), user, { typeId: "hba1c", values: { value: 7.4 }, unit: "%", occurredAt: "2026-09-01T09:00:00Z", note: "Clinic lab", syncToTwin: true });
    expect(sync.status).toBe("skipped");
    await m.service.addEntry(newTrace(), user, { typeId: "blood_pressure", values: { systolic: 128, diastolic: 82 }, unit: "mmHg", occurredAt: "2026-09-10T09:00:00Z", syncToTwin: false });

    // Health content is encrypted at rest.
    const client = await m.db.db();
    const raw = (await client.execute({ sql: "SELECT payload_enc FROM health_entries WHERE id = ?", args: [entry.id] })).rows[0];
    expect(String(raw.payload_enc)).toMatch(/^v1\./);
    expect(String(raw.payload_enc)).not.toContain("hba1c");
    expect(String(raw.payload_enc)).not.toContain("Clinic lab");

    // The person's own entries flow through the standard pipeline.
    const view = await m.service.personalView(newTrace(), user);
    expect(view.persona.name).toBe("Ada");
    expect(view.personal?.entries).toHaveLength(2);
    const hba1c = view.events.flatMap((e) => e.measurements).find((mm) => mm.key === "hba1c");
    expect(hba1c).toMatchObject({ value: 7.4, loinc: "4548-4", status: "NO_REFERENCE" }); // HOLON disabled in this test
    expect(view.events.flatMap((e) => e.measurements).map((mm) => mm.key)).toEqual(expect.arrayContaining(["systolic_bp", "diastolic_bp"]));

    // Analysing saves a check-in, and the next analysis sees it as an earlier check-in.
    const symptoms = [{ id: "increased_thirst", severity: "moderate" as const, durationDays: 7 }];
    const first = await m.service.analyzePersonal(newTrace(), user, symptoms);
    expect(first.primary?.ruleId).toBe("SIG-INF-02");
    const second = await m.service.analyzePersonal(newTrace(), user, symptoms);
    expect(second.primary?.evidence.some((e) => e.label.includes("your earlier check-in"))).toBe(true);
    expect((await m.service.personalView(newTrace(), user)).personal?.checkins).toHaveLength(2);

    // Features that need a twin say so.
    await expect(m.service.simulatePersonal(newTrace(), user, "hba1c_trajectory", 6)).rejects.toMatchObject({ status: 409 });
    await expect(m.service.connectTwin(newTrace(), user, "not-a-token")).rejects.toMatchObject({ status: 400 });

    // Export is complete and decrypted.
    const exported = await m.service.exportData(user);
    expect(exported.profile).toEqual({ firstName: "Ada", birthYear: 1990, sex: "female" });
    expect(exported.entries).toHaveLength(2);
    expect(exported.checkins).toHaveLength(2);
    expect(exported.activity.map((a) => a.action)).toEqual(expect.arrayContaining(["consent.given", "entry.added", "checkin.saved"]));

    // Deleting an entry, then the account, removes everything.
    await m.service.deleteEntry(user, entry.id);
    await expect(m.service.deleteEntry(user, entry.id)).rejects.toMatchObject({ status: 404 });
    await m.service.deleteAccount(user);
    expect(await m.auth.userExists(user.id)).toBe(false);
    for (const table of ["profiles", "health_entries", "checkins", "twin_connections", "audit_log"]) {
      const count = (await client.execute({ sql: `SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, args: [user.id] })).rows[0];
      expect(Number(count.n), table).toBe(0);
    }
  }, 30_000);

  it("rejects tampered and expired sessions", () => {
    const token = m.auth.createSession({ id: "u1", email: "a@b.co" });
    expect(m.auth.readSession(token)).toEqual({ id: "u1", email: "a@b.co" });
    expect(m.auth.readSession(`${token}x`)).toBeNull();
    const [value] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ id: "admin", email: "a@b.co" })).toString("base64url");
    expect(m.auth.readSession(`${forged}.${token.split(".")[1]}`)).toBeNull();
    expect(value.length).toBeGreaterThan(10);
  });
});
