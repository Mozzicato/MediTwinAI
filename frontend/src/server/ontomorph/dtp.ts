import "server-only";
import { config } from "../config";
import type { Trace } from "../trace";
import type { DtpEvent } from "@/domain/normalize";

// Thin client for the OntoMorph Digital Twin Platform. Routes, headers and the `{ data }` envelope
// mirror @ontomorph/dtp-sdk (X-DTP-API-Key + a patient grant token as the bearer).
//
// Sample twins come from the sandbox host (synthetic, isolated from real patients). A person's own
// twin is reached on the production host with the grant token they issued to MediTwin.

export class DtpError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
  }
}

export interface SandboxGrant {
  grantToken: string;
  twinId: string;
  grantId: string;
  expiresIn: number;
}

export interface GrantClaims {
  twinId: string;
  systems: string[] | null;
  eventTypes: string[] | null;
  expiresAt: string;
}

/** A grant-authorised handle on one twin. `host` defaults to the sandbox. */
export interface TwinAccess {
  grantToken: string;
  twinId: string;
  host?: string;
}

async function call<T>(path: string, init: { method?: "GET" | "POST" | "PATCH"; bearer?: string; body?: unknown; timeoutMs?: number; host?: string } = {}): Promise<T> {
  if (!config.ontomorphApiKey) throw new DtpError("ONTOMORPH_API_KEY is not configured", "NOT_CONFIGURED", 0);
  const headers: Record<string, string> = { Accept: "application/json", "X-DTP-API-Key": config.ontomorphApiKey };
  if (init.bearer) headers.Authorization = `Bearer ${init.bearer}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${init.host ?? config.ontomorphSandboxUrl}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? config.requestTimeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    throw new DtpError(timeout ? "The digital twin service timed out" : "The digital twin service is unreachable", timeout ? "TIMEOUT" : "NETWORK_ERROR", 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new DtpError(body?.error?.message ?? `HTTP ${response.status}`, body?.error?.code ?? "INTERNAL_ERROR", response.status);
  }
  return (await response.json() as { data: T }).data;
}

// Grant tokens are valid for `expiresIn` seconds; re-mint shortly before expiry.
let grantCache: { expires: number; grants: SandboxGrant[] } | undefined;

export async function sandboxGrants(trace: Trace): Promise<SandboxGrant[]> {
  if (grantCache && grantCache.expires > Date.now()) {
    trace.record({ service: "DTP", operation: "sandbox grants", status: "cached", ms: 0, detail: `${grantCache.grants.length} twins` });
    return grantCache.grants;
  }
  const grants = await trace.step("DTP", "sandbox grants", () => call<SandboxGrant[]>("/grants"),
    (result) => ({ status: "ok", detail: `${result.length} twins` }));
  const shortest = Math.min(...grants.map((g) => g.expiresIn), 3600);
  grantCache = { expires: Date.now() + (shortest - 60) * 1000, grants };
  return grants;
}

/** Decode (without verifying) the grant JWT. The platform verifies it on every data request. */
export function decodeGrant(token: string): GrantClaims {
  const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : null);
  return {
    twinId: String(payload.twin_id),
    systems: list(payload.systems),
    eventTypes: list(payload.event_types),
    expiresAt: new Date(Number(payload.exp) * 1000).toISOString(),
  };
}

export async function grantFor(trace: Trace, twinId: string) {
  const grant = (await sandboxGrants(trace)).find((g) => g.twinId === twinId);
  if (!grant) throw new DtpError("No sandbox grant is available for this twin", "NOT_FOUND", 404);
  return grant;
}

/** Sandbox grant tokens are issued to a sandbox subject; everything else is a real, production grant. */
export function hostForToken(token: string) {
  const sub = (() => { try { return String(JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")).sub ?? ""); } catch { return ""; } })();
  return sub.includes("sandbox") ? { host: config.ontomorphSandboxUrl, environment: "sandbox" as const } : { host: config.ontomorphApiUrl, environment: "production" as const };
}

export async function listEvents(trace: Trace, grant: TwinAccess): Promise<DtpEvent[]> {
  return trace.step("DTP", "twin events", () =>
    call<DtpEvent[]>(`/provider/twins/${encodeURIComponent(grant.twinId)}/events?limit=200`, { bearer: grant.grantToken, host: grant.host }),
  (events) => ({ status: "ok", detail: `${events.length} events` }));
}

export interface SimulationWire {
  jobId: string;
  status: string;
  scalar_outputs?: Record<string, unknown> | null;
  disclaimer?: string | null;
}

export async function simulate(trace: Trace, grant: TwinAccess, simulationType: string, params: Record<string, unknown>) {
  return trace.step("DTP", `simulate ${simulationType} (${String(params.intervention)})`, () =>
    call<SimulationWire>(`/provider/twins/${encodeURIComponent(grant.twinId)}/simulations`, {
      method: "POST", bearer: grant.grantToken, body: { simulationType, params }, timeoutMs: 30_000, host: grant.host,
    }));
}

/** Write a finding back onto the twin as a clinical note (twin.flag in the SDK). */
export async function flagEvent(trace: Trace, grant: TwinAccess, system: string, flag: { title: string; description: string; data: Record<string, unknown> }) {
  return trace.step("DTP", `flag ${system}`, () =>
    call<DtpEvent>(`/provider/twins/${encodeURIComponent(grant.twinId)}/events`, {
      method: "POST",
      bearer: grant.grantToken,
      host: grant.host,
      body: { eventType: "clinical_note", occurredAt: new Date().toISOString(), title: flag.title, description: flag.description, data: { ...flag.data, system } },
    }));
}

/** Write a health event (e.g. a result the person entered) onto their twin. */
export async function writeEvent(trace: Trace, grant: TwinAccess, event: { eventType: string; occurredAt: string; title: string; data: Record<string, unknown> }) {
  return trace.step("DTP", `write ${event.eventType}`, () =>
    call<DtpEvent>(`/provider/twins/${encodeURIComponent(grant.twinId)}/events`, { method: "POST", bearer: grant.grantToken, host: grant.host, body: event }));
}

// ---- Twins owned by MediTwin's account (created per user with the API key, no grant needed) ----

export interface PlatformTwinProfile {
  age: number;
  sex: "male" | "female" | "intersex";
  heightCm: number;
  weightKg: number;
  bmi: number;
  skinTone: "I" | "II" | "III" | "IV" | "V" | "VI";
  ancestry: string;
}

export async function createTwin(trace: Trace, displayName: string, profile: PlatformTwinProfile) {
  return trace.step("DTP", "create twin", () =>
    call<{ id: string; createdAt: string }>("/twins", { method: "POST", host: config.ontomorphApiUrl, body: { displayName, personalisationProfile: profile } }));
}

export async function updateTwin(trace: Trace, twinId: string, displayName: string, profile: PlatformTwinProfile) {
  return trace.step("DTP", "update twin profile", () =>
    call<{ id: string }>(`/twins/${encodeURIComponent(twinId)}`, { method: "PATCH", host: config.ontomorphApiUrl, body: { displayName, personalisationProfile: profile } }));
}

export async function listOwnedEvents(trace: Trace, twinId: string): Promise<DtpEvent[]> {
  return trace.step("DTP", "twin events", () =>
    call<DtpEvent[]>(`/twins/${encodeURIComponent(twinId)}/events?limit=200`, { host: config.ontomorphApiUrl }),
  (events) => ({ status: "ok", detail: `${events.length} events` }));
}

export async function writeOwnedEvent(trace: Trace, twinId: string, event: { eventType: string; occurredAt: string; title: string; description?: string; data: Record<string, unknown> }) {
  return trace.step("DTP", `write ${event.eventType}`, () =>
    call<DtpEvent>(`/twins/${encodeURIComponent(twinId)}/events`, { method: "POST", host: config.ontomorphApiUrl, body: event }));
}
