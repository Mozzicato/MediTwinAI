import { createHmac, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { createClient, type Client } from "@libsql/client";

type SessionUser = { id: string; email: string };

const sessionSecret = process.env.LOCAL_AUTH_SESSION_SECRET ?? "local-development-only-change-me";
const databaseUrl = process.env.DATABASE_URL;
const databaseToken = process.env.TURSO_AUTH_TOKEN ?? process.env.TURSO_DATABASE_TOKEN ?? process.env.TOKEN;
let client: Client | undefined;
let initialized: Promise<void> | undefined;

export function isLocalAuthConfigured() {
  const hasSessionSecret = process.env.NODE_ENV !== "production" || Boolean(process.env.LOCAL_AUTH_SESSION_SECRET);
  return hasSessionSecret && Boolean(databaseUrl && databaseToken);
}

function getClient() {
  if (!databaseUrl || !databaseToken) throw new Error("Turso database configuration is missing.");
  client ??= createClient({ url: databaseUrl, authToken: databaseToken });
  return client;
}

async function ensureUsersTable() {
  initialized ??= getClient().execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).then(() => undefined);
  await initialized;
}

function hashPassword(password: string) {
  const salt = randomUUID();
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function passwordsMatch(password: string, passwordHash: string) {
  const [salt, storedHash] = passwordHash.split(":");
  if (!salt || !storedHash) return false;
  const calculated = scryptSync(password, salt, 64).toString("hex");
  if (storedHash.length !== calculated.length) return false;
  return timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(calculated, "hex"));
}

function signature(value: string) {
  return createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

export async function createLocalUser(email: string, password: string): Promise<SessionUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  await ensureUsersTable();
  const user = { id: randomUUID(), email: normalizedEmail, passwordHash: hashPassword(password) };
  try {
    await getClient().execute({
      sql: "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
      args: [user.id, user.email, user.passwordHash],
    });
    return { id: user.id, email: user.email };
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) return null;
    throw error;
  }
}

export async function authenticateLocalUser(email: string, password: string): Promise<SessionUser | null> {
  await ensureUsersTable();
  const result = await getClient().execute({
    sql: "SELECT id, email, password_hash FROM users WHERE email = ?",
    args: [email.trim().toLowerCase()],
  });
  const user = result.rows[0];
  if (!user || typeof user.id !== "string" || typeof user.email !== "string" || typeof user.password_hash !== "string" || !passwordsMatch(password, user.password_hash)) return null;
  return { id: user.id, email: user.email };
}

export function createSession(user: SessionUser) {
  const value = Buffer.from(JSON.stringify(user)).toString("base64url");
  return `${value}.${signature(value)}`;
}

export function readSession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [value, tokenSignature] = token.split(".");
  if (!value || !tokenSignature || signature(value) !== tokenSignature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as SessionUser;
    return parsed.id && parsed.email ? parsed : null;
  } catch {
    return null;
  }
}