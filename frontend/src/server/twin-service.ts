import "server-only";
import { PERSONAS, SYMPTOM_BY_ID, SYSTEMS, personaFor, systemLabel } from "@/domain/content";
import { buildTemplateExplanation } from "@/domain/explanations";
import {
  buildTimelineEvent, doseMismatch, evaluateAgainstRange, extractConcepts, extractMeasurements, type DtpEvent,
} from "@/domain/normalize";
import { guidanceFor, recentRecordedSymptoms, runSignalEngine } from "@/domain/signals";
import type {
  AnalysisResult, Concept, EvidenceItem, InteractionScreen, Measurement, MedicationRecord, NormalizedSymptom,
  OrganTarget, Persona, ReferenceRange, SimulationComparison, SimulationIntervention, SimulationType, SymptomInput,
  SystemStatus, SystemSummary, TwinView,
} from "@/domain/types";
import { explainWithAi } from "./ai";
import { DtpError, decodeGrant, flagEvent, grantFor, listEvents, sandboxGrants, simulate } from "./ontomorph/dtp";
import { HolonUnavailableError, checkInteractions, phenotypeMatch, referenceRanges, resolveConcept, type HolonRange } from "./ontomorph/holon";
import type { Trace } from "./trace";

// ---- Twin list ---------------------------------------------------------------------------------

export async function listTwins(trace: Trace): Promise<Persona[]> {
  const grants = await sandboxGrants(trace);
  const personas = grants.map((grant, index) => personaFor(grant.twinId, index));
  const order = (p: Persona) => { const i = PERSONAS.findIndex((known) => known.twinId === p.twinId); return i === -1 ? 99 : i; };
  return personas.sort((a, b) => order(a) - order(b));
}

// ---- HOLON helpers that degrade gracefully -------------------------------------------------------

/** Run a HOLON lookup; if HOLON is unavailable, record it once and return the fallback (PRD 38). */
async function soft<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HolonUnavailableError) return fallback;
    throw error;
  }
}

async function resolve(trace: Trace, concept: Concept): Promise<Concept> {
  const found = await soft(() => resolveConcept(trace, concept.vocabulary, concept.code), null);
  return found ? { ...concept, name: found.conceptName, holonId: found.conceptId, resolved: true } : concept;
}

function pickRange(ranges: HolonRange[], persona: Persona, loinc: string): ReferenceRange | null {
  const fits = ranges.filter((r) =>
    (!r.sex || r.sex.toLowerCase() === persona.sex)
    && (r.ageMinYears === null || persona.age >= r.ageMinYears)
    && (r.ageMaxYears === null || persona.age <= r.ageMaxYears));
  // Prefer the most specific range: sex- and age-stratified entries first.
  const best = fits.sort((a, b) => Number(Boolean(b.sex)) - Number(Boolean(a.sex)) || Number(b.ageMinYears !== null) - Number(a.ageMinYears !== null))[0];
  if (!best) return null;
  const n = (value: string | null) => (value === null || value === "" ? null : Number(value));
  return { low: n(best.lowValue), high: n(best.highValue), unit: best.unit, label: best.interpretation, source: best.source, loinc };
}

async function anatomyFor(trace: Trace, system: string): Promise<OrganTarget[]> {
  const organs = SYSTEMS[system]?.organs ?? [];
  return Promise.all(organs.map(async (organ) => {
    const concept = await resolve(trace, { vocabulary: "FMA", code: organ.fma, resolved: false });
    return { organ: organ.organ, label: organ.label, fma: organ.fma, holonName: concept.name, verified: concept.resolved, rationale: organ.rationale };
  }));
}

// ---- Twin loading --------------------------------------------------------------------------------

const TWIN_CACHE_MS = 60_000;
const twinCache = new Map<string, { expires: number; view: TwinView }>();

export async function loadTwin(trace: Trace, twinId: string, options: { fresh?: boolean } = {}): Promise<TwinView> {
  const hit = twinCache.get(twinId);
  if (!options.fresh && hit && hit.expires > Date.now()) {
    trace.record({ service: "DTP", operation: "twin view", status: "cached", ms: 0, detail: `${hit.view.events.length} events` });
    return hit.view;
  }

  const grants = await sandboxGrants(trace);
  const index = grants.findIndex((g) => g.twinId === twinId);
  if (index === -1) throw new DtpError("This twin isn't available in the OntoMorph sandbox", "NOT_FOUND", 404);
  const grant = grants[index];
  const persona = personaFor(twinId, index);
  const claims = decodeGrant(grant.grantToken);
  const raw = await listEvents(trace, grant);

  // Resolve everything HOLON can tell us, in parallel and de-duplicated.
  const extracted = raw.map((event) => ({ event, measurements: extractMeasurements(event), concepts: extractConcepts(event) }));
  const loincs = [...new Set(extracted.flatMap((e) => e.measurements.map((m) => m.loinc).filter((l): l is string => Boolean(l))))];
  const conceptKeys = new Map<string, Concept>();
  for (const e of extracted) for (const c of e.concepts) conceptKeys.set(`${c.vocabulary}|${c.code}`, c);
  for (const loinc of loincs) conceptKeys.set(`LOINC|${loinc}`, { vocabulary: "LOINC", code: loinc, resolved: false });
  const systemsPresent = [...new Set(raw.map((e) => String(e.data?.system ?? "unspecified")))];

  const [rangeEntries, conceptEntries, anatomyEntries] = await Promise.all([
    Promise.all(loincs.map(async (loinc) => [loinc, pickRange(await soft(() => referenceRanges(trace, loinc, persona.age, persona.sex), []), persona, loinc)] as const)),
    Promise.all([...conceptKeys].map(async ([key, concept]) => [key, await resolve(trace, concept)] as const)),
    Promise.all(systemsPresent.map(async (system) => [system, await anatomyFor(trace, system)] as const)),
  ]);
  const ranges = new Map(rangeEntries);
  const concepts = new Map(conceptEntries);
  const anatomy = new Map(anatomyEntries);

  const events = extracted.map(({ event, measurements, concepts: eventConcepts }) => {
    const evaluated: Measurement[] = measurements.map((m) => {
      const reference = m.loinc ? ranges.get(m.loinc) ?? null : null;
      const { status, compared } = evaluateAgainstRange(m.value, m.unit, m.loinc, reference);
      return { ...m, reference, status, compared, concept: m.loinc ? concepts.get(`LOINC|${m.loinc}`) : undefined };
    });
    return buildTimelineEvent(event, evaluated, eventConcepts.map((c) => concepts.get(`${c.vocabulary}|${c.code}`) ?? c));
  }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  trace.record({ service: "ENGINE", operation: "normalize events", status: "ok", ms: 0,
    detail: `${events.reduce((n, e) => n + e.measurements.length, 0)} measurements, ${concepts.size} concepts` });

  const medications = medicationRecords(raw, concepts);
  const interactions = await screenInteractions(trace, medications);
  const baselineSignals = runSignalEngine({ events, symptoms: [], now: new Date() });
  trace.record({ service: "ENGINE", operation: "baseline signals", status: "ok", ms: 0, detail: `${baselineSignals.length} signal(s)` });

  const systems: SystemSummary[] = systemsPresent.map((system) => {
    const systemEvents = events.filter((e) => e.system === system);
    const signal = baselineSignals.find((s) => s.system === system);
    const status: SystemStatus = signal ? signal.type : systemEvents.length ? "CLEAR" : "NO_DATA";
    return {
      id: system, label: systemLabel(system), eventCount: systemEvents.length, status,
      outOfRange: new Set(systemEvents.flatMap((e) => e.measurements.filter((m) => m.status === "ABOVE" || m.status === "BELOW").map((m) => m.key))).size,
      anatomy: anatomy.get(system) ?? [], anatomyNote: SYSTEMS[system]?.note ?? (anatomy.get(system)?.length ? undefined : "Anatomy visualization unavailable for this body system."),
    };
  }).sort((a, b) => ["URGENT", "ATTENTION", "INFORMATION", "CLEAR", "NO_DATA"].indexOf(a.status) - ["URGENT", "ATTENTION", "INFORMATION", "CLEAR", "NO_DATA"].indexOf(b.status));

  const keys = new Set(events.flatMap((e) => e.measurements.map((m) => m.key)));
  const simulations: SimulationType[] = [];
  if (keys.has("hba1c")) simulations.push("hba1c_trajectory");
  if (keys.has("ldl")) simulations.push("ldl_trajectory");

  const view: TwinView = {
    persona, twinId, grant: { systems: claims.systems, eventTypes: claims.eventTypes, expiresAt: claims.expiresAt },
    events, systems, medications, interactions,
    recordedConditions: events.filter((e) => e.eventType === "diagnosis").map((e) => e.title),
    baselineSignals, simulations, fetchedAt: new Date().toISOString(), trace: [],
  };
  twinCache.set(twinId, { expires: Date.now() + TWIN_CACHE_MS, view });
  return view;
}

function medicationRecords(raw: DtpEvent[], concepts: Map<string, Concept>): MedicationRecord[] {
  return raw.filter((e) => e.eventType === "medication").map((event) => {
    const rxnorm = typeof event.data.rxNorm === "string" ? event.data.rxNorm : undefined;
    const concept = rxnorm ? concepts.get(`RxNorm|${rxnorm}`) : undefined;
    return {
      eventId: event.id, label: event.title, rxnorm, holonName: concept?.name, holonId: concept?.holonId,
      labelCodeMismatch: doseMismatch(event.title, typeof event.data.dosage === "string" ? event.data.dosage : undefined, concept?.name),
    };
  });
}

async function screenInteractions(trace: Trace, medications: MedicationRecord[]): Promise<InteractionScreen> {
  const ids = medications.map((m) => m.holonId).filter((id): id is number => typeof id === "number");
  if (ids.length < 2) {
    return { checked: false, drugCount: ids.length, pairs: [], note: ids.length ? "Only one coded medicine is on record, so there is nothing to screen." : "No coded medicines are on record." };
  }
  const result = await soft(() => checkInteractions(trace, ids), null);
  if (!result) return { checked: false, drugCount: ids.length, pairs: [], note: "HOLON's interaction screen is unavailable right now." };
  const nameOf = (id?: number) => medications.find((m) => m.holonId === id)?.label ?? String(id ?? "");
  return {
    checked: true, drugCount: result.totalDrugs,
    pairs: result.pairs.map((p) => ({ a: nameOf(p.drugA), b: nameOf(p.drugB), description: String(p.description ?? "Interaction listed"), severity: p.severity })),
    note: result.totalInteractions
      ? "HOLON lists interactions between some of these medicines. Check with a pharmacist or prescriber before changing anything."
      : "HOLON lists no interactions between these medicines. That isn't a guarantee, so keep your pharmacist informed.",
  };
}

// ---- Analysis ------------------------------------------------------------------------------------

async function normalizeSymptoms(trace: Trace, input: SymptomInput[]): Promise<NormalizedSymptom[]> {
  const known = input.filter((s) => SYMPTOM_BY_ID.has(s.id));
  return Promise.all(known.map(async (s) => {
    const content = SYMPTOM_BY_ID.get(s.id)!;
    const [snomed, hpo] = await Promise.all([
      resolve(trace, { vocabulary: "SNOMED-CT", code: content.snomed, resolved: false }),
      resolve(trace, { vocabulary: "HPO", code: content.hpo, resolved: false }),
    ]);
    return { ...s, label: content.label, snomed, hpo, systems: content.systems };
  }));
}

async function phenotypeEvidence(trace: Trace, view: TwinView, symptoms: NormalizedSymptom[]) {
  const recorded = recentRecordedSymptoms(view.events, new Date()).filter((r) => r.matches.length);
  const reportedIds = symptoms.map((s) => s.hpo.holonId).filter((id): id is number => typeof id === "number");
  if (!recorded.length || !reportedIds.length) return null;
  const target = recorded[0];
  const recordedIds = (await Promise.all(target.matches.map((m) => resolve(trace, { vocabulary: "HPO", code: m.hpo, resolved: false }))))
    .map((c) => c.holonId).filter((id): id is number => typeof id === "number");
  if (!recordedIds.length) return null;
  const match = await soft(() => phenotypeMatch(trace, reportedIds, recordedIds), null);
  if (!match) return null;
  return { score: Math.min(1, Math.round(match.normalizedScore * 100) / 100), matchedWith: target.event.title, recordedAt: target.event.occurredAt, system: String(target.event.system) };
}

export async function analyzeTwin(trace: Trace, twinId: string, input: SymptomInput[]): Promise<AnalysisResult> {
  const view = await loadTwin(trace, twinId);
  const symptoms = await normalizeSymptoms(trace, input);
  const signals = runSignalEngine({ events: view.events, symptoms, now: new Date() });
  trace.record({ service: "ENGINE", operation: "signal engine", status: "ok", ms: 0, detail: signals.map((s) => `${s.ruleId}:${s.type}`).join(", ") || "no signal" });

  const phenotype = await phenotypeEvidence(trace, view, symptoms);
  const primary = signals[0] ?? null;
  if (primary && phenotype && phenotype.system === primary.system && phenotype.score >= 0.4 && primary.type !== "URGENT") {
    const evidence: EvidenceItem = {
      id: "pm:recorded", kind: "PHENOTYPE_MATCH", source: "ONTOLOGY_DERIVED", system: primary.system,
      label: `Today's symptoms resemble symptoms recorded before (similarity ${phenotype.score.toFixed(2)})`,
      detail: `HOLON phenotype similarity between what you reported and “${phenotype.matchedWith}”. 1.00 means the same symptoms.`,
    };
    primary.evidence.push(evidence);
  }

  let explanation = buildTemplateExplanation(primary);
  if (primary && primary.type !== "URGENT") {
    const ai = await explainWithAi(trace, primary, view.persona);
    explanation = "explanation" in ai ? ai.explanation : buildTemplateExplanation(primary, ai.fallbackReason);
    if (!("explanation" in ai)) trace.record({ service: "CONTENT", operation: "reviewed template explanation", status: "ok", ms: 0, detail: ai.fallbackReason });
  } else if (primary?.type === "URGENT") {
    trace.record({ service: "CONTENT", operation: "reviewed emergency content", status: "ok", ms: 0, detail: primary.ruleId });
  }

  const anatomy = primary ? await anatomyFor(trace, primary.system) : [];
  return {
    twinId, symptoms, signals, primary, explanation, guidance: guidanceFor(primary), anatomy,
    phenotype: phenotype ? { score: phenotype.score, matchedWith: phenotype.matchedWith, recordedAt: phenotype.recordedAt } : null,
    trace: trace.entries,
  };
}

// ---- Simulation and write-back ------------------------------------------------------------------

export async function simulateTwin(trace: Trace, twinId: string, type: SimulationType, durationMonths: number): Promise<SimulationComparison> {
  const view = await loadTwin(trace, twinId);
  const grant = await grantFor(trace, twinId);
  // Only non-medication scenarios are offered: MediTwin must not suggest medication changes (FR-016).
  // The LDL model only supports statin changes besides no_change, so it runs as a current-course projection.
  const interventions: SimulationIntervention[] = type === "hba1c_trajectory" ? ["no_change", "lifestyle"] : ["no_change"];
  const runs = await Promise.all(interventions.map(async (intervention) => {
    const result = await simulate(trace, grant, type, { intervention, duration_months: durationMonths });
    return { intervention, outputs: result.scalar_outputs ?? {}, disclaimer: result.disclaimer ?? "Projection only." };
  }));
  const key = type === "hba1c_trajectory" ? "hba1c" : "ldl";
  const latest = view.events.flatMap((e) => e.measurements).filter((m) => m.key === key).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  return {
    type, durationMonths, runs, trace: trace.entries,
    baseline: latest ? { label: latest.label, value: latest.value, unit: latest.unit } : null,
  };
}

export async function flagSignal(trace: Trace, twinId: string, input: SymptomInput[]) {
  const view = await loadTwin(trace, twinId, { fresh: true });
  const symptoms = await normalizeSymptoms(trace, input);
  const primary = runSignalEngine({ events: view.events, symptoms, now: new Date() })[0];
  if (!primary) return { status: "no_signal" as const };

  // One MediTwin note per system per day keeps the shared sandbox twins tidy.
  const recent = view.events.find((e) => e.meditwinFlag && e.system === primary.system && Date.now() - new Date(e.occurredAt).getTime() < 86_400_000);
  if (recent) return { status: "exists" as const, eventId: recent.id, occurredAt: recent.occurredAt };

  const grant = await grantFor(trace, twinId);
  const created = await flagEvent(trace, grant, primary.system, {
    title: `MediTwin signal: ${primary.systemLabel} ${primary.type.toLowerCase()}`,
    description: `${primary.rule} Evidence: ${primary.evidence.map((e) => e.label).join("; ")}. Generated by MediTwin's deterministic signal engine. Not a diagnosis.`,
    data: { meditwin: { signalType: primary.type, severity: primary.severity, ruleId: primary.ruleId, evidenceIds: primary.evidence.map((e) => e.id), symptoms: symptoms.map((s) => s.id) } },
  });
  twinCache.delete(twinId);
  return { status: "created" as const, eventId: created.id, occurredAt: created.occurredAt };
}

