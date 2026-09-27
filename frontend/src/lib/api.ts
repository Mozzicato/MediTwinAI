import type { AnalysisResult, Persona, SimulationComparison, SimulationType, SymptomInput, TraceEntry, TwinView } from "@/domain/types";

// Browser-side calls to MediTwin's own API. The browser never talks to OntoMorph, HOLON or the AI provider
// directly, and never sees their credentials (FR-002, PRD 45).

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly trace: TraceEntry[] = []) {
    super(message);
  }
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, body === undefined ? { cache: "no-store" } : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
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
  me: async () => {
    const response = await fetch(`${apiBase}/api/auth/me`, { cache: "no-store" });
    return response.ok ? ((await response.json()) as { user: AuthUser | null }).user : null;
  },
  auth: (action: "signin" | "signup", email: string, password: string) => request<{ user: AuthUser }>(`/api/auth/${action}`, { email, password }),
  signOut: () => fetch(`${apiBase}/api/auth/signout`, { method: "POST" }),
};
