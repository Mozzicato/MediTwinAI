import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Application-level AES-256-GCM encryption for health content at rest. The database only ever
// sees ciphertext for values, notes, symptoms and grant tokens.
//
// Key: DATA_ENCRYPTION_KEY (preferred), otherwise derived from LOCAL_AUTH_SESSION_SECRET.
// Changing the key makes existing records unreadable, so set it once and keep it safe.

const VERSION = "v1";

function key(): Buffer {
  const secret = process.env.DATA_ENCRYPTION_KEY ?? process.env.LOCAL_AUTH_SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("DATA_ENCRYPTION_KEY is required in production.");
  return Buffer.from(hkdfSync("sha256", secret ?? "local-development-only-change-me", "meditwin", "health-data-v1", 32));
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptJson<T>(payload: string): T {
  const [version, iv, tag, body] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !body) throw new Error("Unrecognised encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}
