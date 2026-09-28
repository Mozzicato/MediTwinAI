import "server-only";
import { randomUUID } from "node:crypto";
import type { CheckIn, ManualEntry, Profile } from "@/domain/types";
import { decryptJson, encryptJson } from "../crypto";
import { db } from "../db";

// Persistence for a person's own data. Every health value, note, symptom and grant token is
// encrypted before it is written; only ids, timestamps and routing fields are stored in clear.

export const CONSENT_VERSION = "2026-09-v2";

const now = () => new Date().toISOString();

export async function audit(userId: string, action: string, detail?: string) {
  await (await db()).execute({ sql: "INSERT INTO audit_log (id, user_id, at, action, detail) VALUES (?, ?, ?, ?, ?)", args: [randomUUID(), userId, now(), action, detail ?? null] });
}

// ---- Profile & consent ------------------------------------------------------------------------

export async function getProfile(userId: string): Promise<{ profile: Profile; consent: { version: string; at: string } } | null> {
  const row = (await (await db()).execute({ sql: "SELECT payload_enc, consent_version, consented_at FROM profiles WHERE user_id = ?", args: [userId] })).rows[0];
  if (!row) return null;
  return { profile: decryptJson<Profile>(String(row.payload_enc)), consent: { version: String(row.consent_version), at: String(row.consented_at) } };
}

export async function saveProfile(userId: string, profile: Profile) {
  const existing = await getProfile(userId);
  const consentedAt = existing?.consent.at ?? now();
  await (await db()).execute({
    sql: `INSERT INTO profiles (user_id, payload_enc, consent_version, consented_at, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET payload_enc = excluded.payload_enc, updated_at = excluded.updated_at`,
    args: [userId, encryptJson(profile), CONSENT_VERSION, consentedAt, now()],
  });
  await audit(userId, existing ? "profile.updated" : "consent.given", existing ? undefined : CONSENT_VERSION);
}

// ---- The person's OntoMorph twin (created by MediTwin with its platform key) ---------------------

export async function getPlatformTwin(userId: string): Promise<{ twinId: string; createdAt: string } | null> {
  const row = (await (await db()).execute({ sql: "SELECT twin_id, created_at FROM platform_twins WHERE user_id = ?", args: [userId] })).rows[0];
  return row ? { twinId: String(row.twin_id), createdAt: String(row.created_at) } : null;
}

export async function savePlatformTwin(userId: string, twinId: string, createdAt: string) {
  await (await db()).execute({ sql: "INSERT OR REPLACE INTO platform_twins (user_id, twin_id, created_at) VALUES (?, ?, ?)", args: [userId, twinId, createdAt] });
  await audit(userId, "twin.created");
}

// ---- Manual entries --------------------------------------------------------------------------------

type EntryPayload = Pick<ManualEntry, "typeId" | "values" | "unit" | "note">;

export async function listEntries(userId: string): Promise<ManualEntry[]> {
  const rows = (await (await db()).execute({ sql: "SELECT id, occurred_at, payload_enc, twin_event_id, created_at FROM health_entries WHERE user_id = ? ORDER BY occurred_at DESC", args: [userId] })).rows;
  return rows.map((r) => ({ id: String(r.id), occurredAt: String(r.occurred_at), createdAt: String(r.created_at), twinEventId: r.twin_event_id ? String(r.twin_event_id) : null, ...decryptJson<EntryPayload>(String(r.payload_enc)) }));
}

export async function addEntry(userId: string, entry: EntryPayload & { occurredAt: string; twinEventId?: string | null }): Promise<ManualEntry> {
  const id = randomUUID();
  const createdAt = now();
  const payload: EntryPayload = { typeId: entry.typeId, values: entry.values, unit: entry.unit, note: entry.note };
  await (await db()).execute({
    sql: "INSERT INTO health_entries (id, user_id, occurred_at, payload_enc, twin_event_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [id, userId, entry.occurredAt, encryptJson(payload), entry.twinEventId ?? null, createdAt],
  });
  await audit(userId, "entry.added", entry.typeId);
  return { id, occurredAt: entry.occurredAt, createdAt, twinEventId: entry.twinEventId ?? null, ...payload };
}

export async function markEntrySynced(userId: string, id: string, twinEventId: string) {
  await (await db()).execute({ sql: "UPDATE health_entries SET twin_event_id = ? WHERE id = ? AND user_id = ?", args: [twinEventId, id, userId] });
}

export async function deleteEntry(userId: string, id: string) {
  const result = await (await db()).execute({ sql: "DELETE FROM health_entries WHERE id = ? AND user_id = ?", args: [id, userId] });
  if (result.rowsAffected) await audit(userId, "entry.deleted");
  return result.rowsAffected > 0;
}

// ---- Symptom check-ins ------------------------------------------------------------------------------

export async function listCheckins(userId: string, limit = 50): Promise<CheckIn[]> {
  const rows = (await (await db()).execute({ sql: "SELECT id, created_at, payload_enc FROM checkins WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", args: [userId, limit] })).rows;
  return rows.map((r) => ({ id: String(r.id), createdAt: String(r.created_at), ...decryptJson<Omit<CheckIn, "id" | "createdAt">>(String(r.payload_enc)) }));
}

export async function addCheckin(userId: string, checkin: Omit<CheckIn, "id" | "createdAt">) {
  await (await db()).execute({ sql: "INSERT INTO checkins (id, user_id, created_at, payload_enc) VALUES (?, ?, ?, ?)", args: [randomUUID(), userId, now(), encryptJson(checkin)] });
  await audit(userId, "checkin.saved", checkin.signal?.ruleId ?? "no_signal");
}

// ---- Export & deletion ------------------------------------------------------------------------------

export async function exportAll(userId: string, email: string) {
  const [profile, twin, entries, checkins] = await Promise.all([getProfile(userId), getPlatformTwin(userId), listEntries(userId), listCheckins(userId, 10_000)]);
  const auditRows = (await (await db()).execute({ sql: "SELECT at, action, detail FROM audit_log WHERE user_id = ? ORDER BY at", args: [userId] })).rows;
  await audit(userId, "data.exported");
  return {
    exportedAt: now(), account: { email }, profile: profile?.profile ?? null, consent: profile?.consent ?? null,
    ontomorphTwin: twin,
    entries, checkins, activity: auditRows.map((r) => ({ at: r.at, action: r.action, detail: r.detail })),
  };
}

/** Permanently delete the account and everything MediTwin stores about it. */
export async function deleteAccount(userId: string) {
  const client = await db();
  await client.batch([
    { sql: "DELETE FROM checkins WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM health_entries WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM platform_twins WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM profiles WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM audit_log WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM users WHERE id = ?", args: [userId] },
  ], "write");
}
