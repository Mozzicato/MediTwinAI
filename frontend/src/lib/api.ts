import type { AnalysisResult, ManualEntry, Persona, Profile, SimulationComparison, SimulationType, SymptomInput, TraceEntry, TwinView } from "@/domain/types";

// Browser-side calls to MediTwin's own API. The browser never talks to OntoMorph, HOLON or the AI provider
// directly, and never sees their credentials (FR-002, PRD 45).

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly trace: TraceEntry[] = []) {
    super(message);
  }
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

async function request<T>(path: string, body?: unknown, method?: "POST" | "PUT" | "DELETE"): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, body === undefined && !method ? { cache: "no-store" } : {
      method: method ?? "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("We couldn't reach MediTwin. Check your connection and try again.", 0);
  }
  const payload = await response.json().catch(() => null) as (T & { detail?: string; trace?: TraceEntry[] }) | null;
  if (!response.ok || !payload) throw new ApiError(payload?.detail ?? "Something went wrong. Please try again.", response.status, payload?.trace ?? []);
  return payload;
}

export type Readiness = { mode: "demo" | "clinical"; ready: boolean; missing: string[]; integrations?: { dtp: boolean; holon: boolean; ai: string | null } };
export type AuthUser = { id: string; email: string };

export const api = {
  readiness: () => fetch(`${apiBase}/api/clinical-readiness`, { cache: "no-store" }).then((r) => r.json() as Promise<Readiness>),
  twins: () => request<{ twins: Persona[]; trace: TraceEntry[] }>("/api/twins"),
  twin: (id: string, fresh = false) => request<TwinView>(`/api/twins/${id}${fresh ? "?fresh=1" : ""}`),
  analyze: (id: string, symptoms: SymptomInput[]) => request<AnalysisResult>(`/api/twins/${id}/analyze`, { symptoms }),
  simulate: (id: string, type: SimulationType, durationMonths: number) => request<SimulationComparison>(`/api/twins/${id}/simulate`, { type, durationMonths }),
  flag: (id: string, symptoms: SymptomInput[]) =>
    request<{ status: "created" | "exists" | "no_signal"; eventId?: string; occurredAt?: string; trace: TraceEntry[] }>(`/api/twins/${id}/flag`, { symptoms }),
  interpret: (text: string) =>
    request<{ matches: { id: string; quote: string }[]; method: "MODEL_INFERRED" | "KEYWORD"; note?: string }>("/api/symptoms/interpret", { text }),
  session: async () => {
    const response = await fetch(`${apiBase}/api/auth/me`, { cache: "no-store" });
    if (!response.ok) return { user: null, accountsEnabled: false };
    return (await response.json()) as { user: AuthUser | null; accountsEnabled: boolean };
  },
  auth: (action: "signin" | "signup", email: string, password: string) => request<{ user: AuthUser }>(`/api/auth/${action}`, { email, password }),
  signOut: () => fetch(`${apiBase}/api/auth/signout`, { method: "POST" }),
};

export type Onboarding = { email: string; profile: Profile | null; consent: { version: string; at: string } | null; consentVersion: string };
export type EntryInput = { typeId: string; values: Record<string, number>; unit: string; occurredAt: string; note?: string; syncToTwin: boolean };

/** The signed-in person's own data. */
export const me = {
  onboarding: () => request<Onboarding>("/api/me/profile"),
  saveProfile: (profile: Profile) => request<Onboarding>("/api/me/profile", { ...profile, consent: true }, "PUT"),
  view: () => request<TwinView>("/api/me/view"),
  connectTwin: (grantToken: string) =>
    request<{ twinId: string; environment: "production" | "sandbox"; eventCount: number; expiresAt: string }>("/api/me/twin", { grantToken }),
  disconnectTwin: () => request<{ ok: true }>("/api/me/twin", undefined, "DELETE"),
  addEntry: (entry: EntryInput) =>
    request<{ entry: ManualEntry; sync: { status: "synced" | "skipped" | "failed"; message?: string } }>("/api/me/entries", entry),
  deleteEntry: (id: string) => request<{ ok: true }>(`/api/me/entries/${id}`, undefined, "DELETE"),
  analyze: (symptoms: SymptomInput[]) => request<AnalysisResult>("/api/me/analyze", { symptoms }),
  simulate: (type: SimulationType, durationMonths: number) => request<SimulationComparison>("/api/me/simulate", { type, durationMonths }),
  flag: (symptoms: SymptomInput[]) =>
    request<{ status: "created" | "exists" | "no_signal"; eventId?: string; occurredAt?: string; trace: TraceEntry[] }>("/api/me/flag", { symptoms }),
  deleteAccount: (confirmEmail: string) => request<{ ok: true }>("/api/me/account", { confirmEmail }, "DELETE"),
  exportUrl: `${apiBase}/api/me/export`,
};
