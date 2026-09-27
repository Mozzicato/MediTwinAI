// Shared MediTwin data model. Used by server routes and the browser, so it must stay free of
// server-only imports.

/** Where a piece of information came from (PRD 4.4). */
export type SourceType =
  | "TWIN_RECORD" // OntoMorph DTP twin event
  | "ONTOLOGY_DERIVED" // HOLON concept / mapping / phenotype similarity
  | "CLINICAL_REFERENCE" // HOLON reference range
  | "USER_PROVIDED" // entered in this session
  | "SYSTEM_GENERATED" // MediTwin deterministic engine or reviewed content
  | "MODEL_INFERRED"; // LLM output that passed validation

export type Vocabulary = "LOINC" | "RxNorm" | "SNOMED-CT" | "HPO" | "FMA" | "ICD-10";

export interface Concept {
  vocabulary: Vocabulary;
  code: string;
  /** Name returned by HOLON when resolved. */
  name?: string;
  holonId?: number;
  resolved: boolean;
}

export interface ReferenceRange {
  low: number | null;
  high: number | null;
  unit: string;
  label: string;
  /** Publisher of the range as reported by HOLON, e.g. "CLSI C28-A3 / WHO 2025". */
  source: string;
  loinc: string;
}

export type RangeStatus = "ABOVE" | "BELOW" | "WITHIN" | "NO_REFERENCE" | "UNIT_MISMATCH";

export interface Measurement {
  key: string;
  label: string;
  value: number;
  unit: string;
  loinc?: string;
  concept?: Concept;
  reference: ReferenceRange | null;
  /** The value converted into the reference range's unit, when a conversion was needed. */
  compared?: { value: number; unit: string };
  status: RangeStatus;
  /** Range printed on the original lab record, kept for provenance. */
  recordedRange?: string;
  occurredAt: string;
  eventId: string;
}

export type SystemId =
  | "metabolic"
  | "cardiovascular"
  | "respiratory"
  | "nervous"
  | "renal"
  | "dental_oral"
  | "oncology_genomic"
  | "administrative";

export interface TimelineEvent {
  id: string;
  occurredAt: string;
  eventType: string;
  category: string;
  title: string;
  system: SystemId | string;
  summary: string;
  measurements: Measurement[];
  concepts: Concept[];
  sourcePlugin: string;
  attention: boolean;
  /** Set when MediTwin itself wrote this event back to the twin. */
  meditwinFlag?: boolean;
}

export interface OrganTarget {
  organ: OrganId;
  label: string;
  fma: string;
  holonName?: string;
  verified: boolean;
  rationale: string;
}

export type OrganId =
  | "brain"
  | "lungs"
  | "trachea"
  | "heart"
  | "liver"
  | "stomach"
  | "pancreas"
  | "kidneys"
  | "bladder"
  | "breast"
  | "teeth";

export type SystemStatus = "URGENT" | "ATTENTION" | "INFORMATION" | "CLEAR" | "NO_DATA";

export interface SystemSummary {
  id: SystemId | string;
  label: string;
  eventCount: number;
  status: SystemStatus;
  outOfRange: number;
  anatomy: OrganTarget[];
  anatomyNote?: string;
}

export interface MedicationRecord {
  eventId: string;
  label: string;
  rxnorm?: string;
  holonName?: string;
  holonId?: number;
  /** True when the dose on the twin label differs from the strength of the coded RxNorm product. */
  labelCodeMismatch: boolean;
}

export interface InteractionScreen {
  checked: boolean;
  drugCount: number;
  pairs: { a: string; b: string; description: string; severity?: string }[];
  note: string;
}

export interface Persona {
  twinId: string;
  name: string;
  age: number;
  sex: "male" | "female";
  headline: string;
  featured?: boolean;
}

export interface TraceEntry {
  service: "DTP" | "HOLON" | "ENGINE" | "AI" | "CONTENT";
  operation: string;
  status: "ok" | "cached" | "not_found" | "error" | "skipped";
  ms: number;
  detail?: string;
}

export interface TwinView {
  persona: Persona;
  twinId: string;
  grant: { systems: string[] | null; eventTypes: string[] | null; expiresAt: string };
  events: TimelineEvent[];
  systems: SystemSummary[];
  medications: MedicationRecord[];
  interactions: InteractionScreen;
  recordedConditions: string[];
  baselineSignals: HealthSignal[];
  simulations: SimulationType[];
  fetchedAt: string;
  trace: TraceEntry[];
}

// ---- Symptoms, signals, explanations -------------------------------------------------------

export type Severity = "mild" | "moderate" | "severe";

export interface SymptomInput {
  id: string;
  severity: Severity;
  durationDays: number;
  /** Original user wording, when the symptom came from free text (FR-009). */
  userWording?: string;
}

export interface NormalizedSymptom extends SymptomInput {
  label: string;
  snomed: Concept;
  hpo: Concept;
  systems: SystemId[];
}

export type EvidenceKind =
  | "MEASUREMENT"
  | "TREND"
  | "REPORTED_SYMPTOM"
  | "RECORDED_SYMPTOM"
  | "RECORDED_CONDITION"
  | "PHENOTYPE_MATCH"
  | "RED_FLAG"
  | "ADDITIONAL_RESULTS";

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  label: string;
  detail: string;
  source: SourceType;
  system?: string;
}

export type SignalType = "URGENT" | "ATTENTION" | "INFORMATION";

export interface HealthSignal {
  id: string;
  type: SignalType;
  severity: "LOW" | "MODERATE" | "HIGH";
  system: string;
  systemLabel: string;
  title: string;
  ruleId: string;
  rule: string;
  evidence: EvidenceItem[];
  source: "SYSTEM_GENERATED";
}

export interface ExplanationBlock {
  text: string;
  evidenceIds: string[];
}

export interface Explanation {
  headline: string;
  paragraphs: ExplanationBlock[];
  questions: ExplanationBlock[];
  disclaimer: string;
  /** MODEL_INFERRED when the AI wrote it and it passed validation, otherwise SYSTEM_GENERATED. */
  source: "MODEL_INFERRED" | "SYSTEM_GENERATED";
  generator: string;
  safety: { passed: boolean; checks: string[]; fallbackReason?: string };
}

export interface CareGuidance {
  level: SignalType | "NONE";
  title: string;
  steps: string[];
  seekUrgentCareIf: string[];
  contentId: string;
}

export interface AnalysisResult {
  twinId: string;
  symptoms: NormalizedSymptom[];
  signals: HealthSignal[];
  primary: HealthSignal | null;
  explanation: Explanation;
  guidance: CareGuidance;
  anatomy: OrganTarget[];
  phenotype: { score: number; matchedWith: string; recordedAt: string } | null;
  trace: TraceEntry[];
}

// ---- Simulation -----------------------------------------------------------------------------

export type SimulationType = "hba1c_trajectory" | "ldl_trajectory";
export type SimulationIntervention = "lifestyle" | "no_change";

export interface SimulationRun {
  intervention: SimulationIntervention;
  outputs: Record<string, unknown>;
  disclaimer: string;
}

export interface SimulationComparison {
  type: SimulationType;
  durationMonths: number;
  baseline: { label: string; value: number; unit: string } | null;
  runs: SimulationRun[];
  trace: TraceEntry[];
}
