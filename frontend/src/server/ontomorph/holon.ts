import "server-only";
import { config } from "../config";
import type { Trace } from "../trace";
import type { Vocabulary } from "@/domain/types";

// Thin client for the OntoMorph HOLON clinical-knowledge API. Paths and auth mirror
// @ontomorph/holon-client (Authorization: Bearer <HOLON_API_KEY>).

export interface HolonConcept {
  conceptId: number;
  vocabularyId: string;
  conceptCode: string;
  conceptName: string;
  domainId: string;
}

export interface HolonRange {
  lowValue: string | null;
  highValue: string | null;
  unit: string;
  interpretation: string;
  source: string;
  sex: string | null;
  ageMinYears: number | null;
  ageMaxYears: number | null;
}

export interface PhenotypeMatch {
  score: number;
  maxScore: number;
  normalizedScore: number;
}

export interface InteractionList {
  totalDrugs: number;
  totalInteractions: number;
  pairs: { drugA?: number; drugB?: number; description?: string; severity?: string; [key: string]: unknown }[];
}

export class HolonUnavailableError extends Error {}

// HOLON vocabulary identifiers differ from display names.
const VOCABULARY_IDS: Record<Vocabulary, string> = {
  LOINC: "LOINC", RxNorm: "RxNorm", "SNOMED-CT": "SNOMED-CT", HPO: "HPO", FMA: "FMA", "ICD-10": "ICD10CM",
};

const TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { expires: number; value: unknown }>();

async function request<T>(path: string, init?: { body?: unknown }): Promise<{ value: T | null; cached: boolean }> {
  const cacheKey = `${path}|${init?.body ? JSON.stringify(init.body) : ""}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return { value: hit.value as T | null, cached: true };
  if (!config.holonApiKey) throw new HolonUnavailableError("HOLON_API_KEY is not configured");

  let response: Response;
  try {
    response = await fetch(`${config.holonBaseUrl}${path}`, {
      method: init?.body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${config.holonApiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(config.requestTimeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    throw new HolonUnavailableError(error instanceof Error && error.name === "TimeoutError" ? "HOLON request timed out" : "HOLON is unreachable");
  }
  // HOLON answers 404 for codes it has no record of: that is a valid, cacheable "not found".
  if (response.status === 404) {
    cache.set(cacheKey, { expires: Date.now() + TTL_MS, value: null });
    return { value: null, cached: false };
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { code?: string } | null;
    throw new HolonUnavailableError(`HOLON ${response.status}${body?.code ? ` ${body.code}` : ""}`);
  }
  const value = await response.json() as T;
  cache.set(cacheKey, { expires: Date.now() + TTL_MS, value });
  return { value, cached: false };
}

const statusOf = (result: { value: unknown; cached: boolean }) =>
  ({ status: result.cached ? "cached" as const : result.value === null ? "not_found" as const : "ok" as const });

export async function resolveConcept(trace: Trace, vocabulary: Vocabulary, code: string) {
  const params = new URLSearchParams({ code, system: VOCABULARY_IDS[vocabulary] });
  const result = await trace.step("HOLON", `concept ${vocabulary} ${code}`,
    () => request<{ concept: HolonConcept }>(`/concepts?${params}`), statusOf);
  return result.value?.concept ?? null;
}

export async function referenceRanges(trace: Trace, loinc: string, age: number, sex: string) {
  const params = new URLSearchParams({ age: String(age), sex });
  const result = await trace.step("HOLON", `reference range LOINC ${loinc}`,
    () => request<{ ranges: HolonRange[] }>(`/reference-ranges/loinc/${encodeURIComponent(loinc)}?${params}`), statusOf);
  return result.value?.ranges ?? [];
}

export async function phenotypeMatch(trace: Trace, termsA: number[], termsB: number[]) {
  const result = await trace.step("HOLON", "phenotype similarity",
    () => request<PhenotypeMatch>("/phenotype/match", { body: { termsA: termsA.map(String), termsB: termsB.map(String) } }), statusOf);
  return result.value;
}

export async function checkInteractions(trace: Trace, conceptIds: number[]) {
  const result = await trace.step("HOLON", `interaction screen (${conceptIds.length} drugs)`,
    () => request<InteractionList>("/interactions/check-list", { body: { drugIds: conceptIds.map(String) } }), statusOf);
  return result.value;
}
