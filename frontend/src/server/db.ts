import "server-only";
import { createClient, type Client } from "@libsql/client";

// One libSQL client (Turso in production, a local file in tests) and an idempotent schema.
// Health content is never stored in plain text: see crypto.ts.

const databaseUrl = process.env.DATABASE_URL;
const databaseToken = process.env.TURSO_AUTH_TOKEN;

let client: Client | undefined;
let ready: Promise<void> | undefined;

export function isDatabaseConfigured() {
  return Boolean(databaseUrl && (databaseUrl.startsWith("file:") || databaseToken));
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payload_enc TEXT NOT NULL,
    consent_version TEXT NOT NULL,
    consented_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS platform_twins (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    twin_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS health_entries (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    occurred_at TEXT NOT NULL,
    payload_enc TEXT NOT NULL,
    twin_event_id TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS health_entries_user ON health_entries(user_id, occurred_at)`,
  `CREATE TABLE IF NOT EXISTS checkins (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    payload_enc TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS checkins_user ON checkins(user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    at TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT
  )`,
];

export async function db(): Promise<Client> {
  if (!isDatabaseConfigured()) throw new Error("Database is not configured (DATABASE_URL and TURSO_AUTH_TOKEN).");
  client ??= createClient({ url: databaseUrl!, authToken: databaseUrl!.startsWith("file:") ? undefined : databaseToken });
  ready ??= client.batch(SCHEMA, "write").then(() => undefined).catch((error) => { ready = undefined; throw error; });
  await ready;
  return client;
}

/** Close the connection (tests; lets Windows release a local database file). */
export function closeDb() {
  client?.close();
  client = undefined;
  ready = undefined;
}
