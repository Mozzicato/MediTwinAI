import "server-only";
import { createHmac, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { db, isDatabaseConfigured } from "@/server/db";

export type SessionUser = { id: string; email: string };

const sessionSecret = process.env.LOCAL_AUTH_SESSION_SECRET ?? "local-development-only-change-me";
export const SESSION_COOKIE = "meditwin_local_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function isLocalAuthConfigured() {
  const hasSessionSecret = process.env.NODE_ENV !== "production" || Boolean(process.env.LOCAL_AUTH_SESSION_SECRET);
  return hasSessionSecret && isDatabaseConfigured();
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
  const user = { id: randomUUID(), email: normalizedEmail, passwordHash: hashPassword(password) };
  try {
    await (await db()).execute({ sql: "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)", args: [user.id, user.email, user.passwordHash] });
    return { id: user.id, email: user.email };
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) return null;
    throw error;
  }
}

export async function authenticateLocalUser(email: string, password: string): Promise<SessionUser | null> {
  const result = await (await db()).execute({ sql: "SELECT id, email, password_hash FROM users WHERE email = ?", args: [email.trim().toLowerCase()] });
  const user = result.rows[0];
  if (!user || typeof user.id !== "string" || typeof user.email !== "string" || typeof user.password_hash !== "string" || !passwordsMatch(password, user.password_hash)) return null;
  return { id: user.id, email: user.email };
}

export async function userExists(id: string) {
  const result = await (await db()).execute({ sql: "SELECT 1 FROM users WHERE id = ?", args: [id] });
  return result.rows.length > 0;
}

/** Session token: base64url(JSON{id,email,exp}).signature */
export function createSession(user: SessionUser) {
  const value = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 })).toString("base64url");
  return `${value}.${signature(value)}`;
}

export function readSession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [value, tokenSignature] = token.split(".");
  if (!value || !tokenSignature) return null;
  const expected = signature(value);
  if (expected.length !== tokenSignature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(tokenSignature))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as SessionUser & { exp?: number };
    if (!parsed.id || !parsed.email || (parsed.exp && parsed.exp < Date.now())) return null;
    return { id: parsed.id, email: parsed.email };
  } catch {
    return null;
  }
}

// Best-effort brute-force protection: 8 failed attempts per email+IP per 15 minutes.
const attempts = new Map<string, { count: number; resetAt: number }>();
export function tooManyAttempts(key: string) {
  const entry = attempts.get(key);
  return Boolean(entry && entry.resetAt > Date.now() && entry.count >= 8);
}
export function recordFailedAttempt(key: string) {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < Date.now()) attempts.set(key, { count: 1, resetAt: Date.now() + 15 * 60_000 });
  else entry.count += 1;
}
export function clearAttempts(key: string) {
  attempts.delete(key);
}
