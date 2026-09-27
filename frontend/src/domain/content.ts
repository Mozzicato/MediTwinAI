// MediTwin reviewed content set (demo version).
//
// Everything here is curated, versioned data rather than model output: symptom codes, which twin
// fields map to which LOINC codes, which anatomy belongs to which body system, red-flag rules and
// care-guidance text. The LLM never decides any of this (PRD FR-011, FR-015, FR-017).
//
// Status: demo content, not yet reviewed by a licensed clinician. Clinical mode is blocked until it is.

import type { OrganId, Persona, SignalType, SystemId } from "./types";

export const CONTENT_VERSION = "meditwin-content-2026.09-demo";

// ---- Personas ------------------------------------------------------------------------------
// OntoMorph sandbox twins carry no demographics. MediTwin attaches clearly labelled demo personas
// so that age/sex-aware HOLON reference lookups have an input.

export const PERSONAS: Persona[] = [
  { twinId: "5a4d0000-0000-0000-0000-000000000102", name: "David", age: 28, sex: "male", headline: "Metabolic health, recurring thirst", featured: true },
  { twinId: "5a4d0000-0000-0000-0000-000000000101", name: "Grace", age: 56, sex: "female", headline: "Blood pressure and cholesterol follow-up" },
  { twinId: "5a4d0000-0000-0000-0000-000000000104", name: "Tunde", age: 34, sex: "male", headline: "Asthma and dental care" },
  { twinId: "5a4d0000-0000-0000-0000-000000000105", name: "Emeka", age: 72, sex: "male", headline: "Pacemaker and care records" },
  { twinId: "5a4d0000-0000-0000-0000-000000000103", name: "Ngozi", age: 47, sex: "female", headline: "Breast cancer treatment journey" },
];

export function personaFor(twinId: string, index = 0): Persona {
  return PERSONAS.find((persona) => persona.twinId === twinId) ?? {
    twinId, name: `Sandbox twin ${index + 1}`, age: 40, sex: "female", headline: "Synthetic sandbox twin",
  };
}

// ---- Body systems and anatomy ---------------------------------------------------------------

interface OrganContent { organ: OrganId; label: string; fma: string; rationale: string }

export const SYSTEMS: Record<string, { label: string; organs: OrganContent[]; note?: string }> = {
  metabolic: {
    label: "Metabolic",
    organs: [
      { organ: "pancreas", label: "Pancreas", fma: "7198", rationale: "Makes insulin, the hormone that moves glucose out of the blood." },
      { organ: "liver", label: "Liver", fma: "7197", rationale: "Stores glucose and releases it back into the blood between meals." },
      { organ: "kidneys", label: "Kidneys", fma: "7203", rationale: "Filter the blood. When glucose is high they can pass more water, which is linked to thirst and frequent urination." },
    ],
  },
  cardiovascular: {
    label: "Cardiovascular",
    organs: [{ organ: "heart", label: "Heart", fma: "7088", rationale: "Pumps blood through the body. Blood pressure and cholesterol readings describe the load on the heart and vessels." }],
  },
  respiratory: {
    label: "Respiratory",
    organs: [
      { organ: "lungs", label: "Lungs", fma: "7195", rationale: "Exchange oxygen and carbon dioxide. Peak-flow readings measure how quickly air can leave them." },
      { organ: "trachea", label: "Trachea", fma: "7394", rationale: "The main airway that carries air to the lungs." },
    ],
  },
  nervous: {
    label: "Nervous",
    organs: [{ organ: "brain", label: "Brain", fma: "50801", rationale: "Headache and dizziness are experienced through the nervous system." }],
  },
  renal: {
    label: "Kidney & urinary",
    organs: [
      { organ: "kidneys", label: "Kidneys", fma: "7203", rationale: "Filter waste and water from the blood." },
      { organ: "bladder", label: "Urinary bladder", fma: "15900", rationale: "Stores urine before it leaves the body." },
    ],
  },
  dental_oral: {
    label: "Dental & oral",
    organs: [{ organ: "teeth", label: "Teeth", fma: "12516", rationale: "Dental records in this twin describe a treated tooth." }],
  },
  oncology_genomic: {
    label: "Oncology",
    organs: [{ organ: "breast", label: "Breast", fma: "9601", rationale: "Imaging, biopsy and procedure records in this twin refer to breast tissue." }],
  },
  administrative: {
    label: "Care records",
    organs: [],
    note: "Administrative records such as insurance and advance directives have no anatomical location.",
  },
};

export function systemLabel(system: string) {
  return SYSTEMS[system]?.label ?? system.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// ---- Symptom catalog (FR-008, FR-009) -------------------------------------------------------

export interface SymptomContent {
  id: string;
  label: string;
  snomed: string;
  hpo: string;
  systems: SystemId[];
  /** Measurement keys this symptom is clinically relevant to, used by rule SIG-ATT-01. */
  relatedMeasurements: string[];
  /** Lower-case phrases used for keyword matching and for recognising symptoms recorded in a twin. */
  synonyms: string[];
}

export const SYMPTOMS: SymptomContent[] = [
  { id: "fatigue", label: "Fatigue", snomed: "84229001", hpo: "0012378", systems: ["metabolic"], relatedMeasurements: ["hba1c", "fasting_glucose", "cgm_average_glucose", "hemoglobin"], synonyms: ["fatigue", "tired", "exhausted", "no energy", "lack of energy", "worn out", "sleepy"] },
  { id: "increased_thirst", label: "Increased thirst", snomed: "17173007", hpo: "0001959", systems: ["metabolic"], relatedMeasurements: ["hba1c", "fasting_glucose", "cgm_average_glucose"], synonyms: ["increased thirst", "thirst", "thirsty", "polydipsia", "always drinking", "dry mouth"] },
  { id: "frequent_urination", label: "Frequent urination", snomed: "28442001", hpo: "0000103", systems: ["metabolic", "renal"], relatedMeasurements: ["hba1c", "fasting_glucose", "cgm_average_glucose"], synonyms: ["frequent urination", "polyuria", "urinating", "peeing", "pee a lot", "up at night to pee", "bathroom a lot", "passing urine"] },
  { id: "blurred_vision", label: "Blurred vision", snomed: "111516008", hpo: "0000622", systems: ["metabolic", "nervous"], relatedMeasurements: ["hba1c", "fasting_glucose", "cgm_average_glucose", "systolic_bp"], synonyms: ["blurred vision", "blurry vision", "blurry", "vision is blurred"] },
  { id: "headache", label: "Headache", snomed: "25064002", hpo: "0002315", systems: ["nervous", "cardiovascular"], relatedMeasurements: ["systolic_bp", "diastolic_bp"], synonyms: ["headache", "head hurts", "migraine", "head pain"] },
  { id: "chest_pain", label: "Chest pain", snomed: "29857009", hpo: "0100749", systems: ["cardiovascular"], relatedMeasurements: ["systolic_bp", "diastolic_bp", "heart_rate", "ldl", "total_cholesterol"], synonyms: ["chest pain", "chest tightness", "tight chest", "pain in my chest", "chest pressure"] },
  { id: "shortness_of_breath", label: "Shortness of breath", snomed: "267036007", hpo: "0002094", systems: ["respiratory", "cardiovascular"], relatedMeasurements: ["peak_flow", "peak_flow_pct", "heart_rate", "hemoglobin"], synonyms: ["shortness of breath", "short of breath", "breathless", "dyspnea", "dyspnoea", "can't breathe", "hard to breathe", "out of breath"] },
  { id: "dizziness", label: "Dizziness", snomed: "404640003", hpo: "0002321", systems: ["nervous", "cardiovascular"], relatedMeasurements: ["systolic_bp", "diastolic_bp", "heart_rate", "fasting_glucose"], synonyms: ["dizziness", "dizzy", "lightheaded", "light-headed", "vertigo", "room spinning"] },
  { id: "palpitations", label: "Palpitations", snomed: "80313002", hpo: "0001962", systems: ["cardiovascular"], relatedMeasurements: ["heart_rate"], synonyms: ["palpitations", "heart racing", "racing heart", "pounding heart", "fluttering"] },
  { id: "wheezing", label: "Wheezing", snomed: "56018004", hpo: "0030828", systems: ["respiratory"], relatedMeasurements: ["peak_flow", "peak_flow_pct"], synonyms: ["wheezing", "wheeze", "whistling breath"] },
  { id: "cough", label: "Cough", snomed: "49727002", hpo: "0012735", systems: ["respiratory"], relatedMeasurements: ["peak_flow", "peak_flow_pct"], synonyms: ["cough", "coughing"] },
  { id: "nausea", label: "Nausea", snomed: "422587007", hpo: "0002018", systems: ["metabolic"], relatedMeasurements: ["fasting_glucose", "hba1c"], synonyms: ["nausea", "nauseous", "feel sick", "queasy", "want to vomit"] },
];

export const SYMPTOM_BY_ID = new Map(SYMPTOMS.map((symptom) => [symptom.id, symptom]));

/** Recognise a symptom recorded in a twin event (e.g. data.symptom = "polyuria"). */
export function matchSymptomText(text: string): SymptomContent[] {
  const lower = text.toLowerCase();
  return SYMPTOMS.filter((symptom) => symptom.synonyms.some((phrase) => containsPhrase(lower, phrase)));
}

function containsPhrase(text: string, phrase: string) {
  return new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(text);
}

// ---- Measurement catalog (FR-006, FR-007) ---------------------------------------------------
// Maps fields found in OntoMorph twin events onto LOINC codes. Reference ranges are never stored
// here: they are fetched from HOLON per LOINC code.

export interface MeasurementContent {
  key: string;
  label: string;
  loinc?: string;
  unit?: string;
}

/** Fields of a twin event's `data` object that hold a numeric measurement, keyed by field name. */
export const MEASUREMENT_FIELDS: Record<string, MeasurementContent> = {
  systolic: { key: "systolic_bp", label: "Systolic blood pressure", loinc: "8480-6" },
  diastolic: { key: "diastolic_bp", label: "Diastolic blood pressure", loinc: "8462-4" },
  heartRate: { key: "heart_rate", label: "Heart rate", loinc: "8867-4", unit: "bpm" },
  bmi: { key: "bmi", label: "Body mass index", loinc: "39156-5", unit: "kg/m2" },
  weightKg: { key: "body_weight", label: "Body weight", loinc: "29463-7", unit: "kg" },
  ldl: { key: "ldl", label: "LDL cholesterol", loinc: "13457-7" },
  hdl: { key: "hdl", label: "HDL cholesterol", loinc: "2085-9" },
  triglycerides: { key: "triglycerides", label: "Triglycerides", loinc: "2571-8" },
  totalCholesterol: { key: "total_cholesterol", label: "Total cholesterol", loinc: "2093-3" },
  wbc: { key: "wbc", label: "White blood cells", loinc: "6690-2", unit: "10*3/uL" },
  rbc: { key: "rbc", label: "Red blood cells", loinc: "789-8", unit: "10*6/uL" },
  hemoglobin: { key: "hemoglobin", label: "Haemoglobin", loinc: "718-7", unit: "g/dL" },
  platelets: { key: "platelets", label: "Platelets", loinc: "777-3", unit: "10*3/uL" },
  ejectionFraction: { key: "ejection_fraction", label: "Ejection fraction", loinc: "10230-1", unit: "%" },
  percentPredicted: { key: "peak_flow_pct", label: "Peak flow (% predicted)", unit: "%" },
  averageValue: { key: "cgm_average_glucose", label: "Average glucose (CGM)", loinc: "97507-8" },
  timeInRangePct: { key: "cgm_time_in_range", label: "Time in glucose range (CGM)", unit: "%" },
};

/** Single-value lab results identified by test name when the record carries no LOINC code. */
export const TEST_NAME_LOINC: Record<string, MeasurementContent> = {
  "fasting glucose": { key: "fasting_glucose", label: "Fasting glucose", loinc: "2345-7" },
  hba1c: { key: "hba1c", label: "HbA1c", loinc: "4548-4" },
};

/** Plain-language names for LOINC-coded values (PRD 4.3: codes are infrastructure). */
export const LOINC_PLAIN_LABEL: Record<string, string> = {
  "4548-4": "HbA1c",
  "2345-7": "Fasting glucose",
  "13457-7": "LDL cholesterol",
  "8480-6": "Systolic blood pressure",
  "8462-4": "Diastolic blood pressure",
};

// Units treated as identical when comparing a twin value with a HOLON range.
const UNIT_ALIASES: Record<string, string> = {
  "bpm": "/min", "beats/min": "/min", "/min": "/min",
  "mmhg": "mm[hg]", "mm[hg]": "mm[hg]",
  "kg/m2": "kg/m2", "kg/m^2": "kg/m2",
  "mg/dl": "mg/dl", "mmol/l": "mmol/l", "%": "%", "u/l": "u/l", "miu/l": "miu/l",
  "10*3/ul": "10*3/ul", "10^3/ul": "10*3/ul", "10*6/ul": "10*6/ul", "g/dl": "g/dl", "kg": "kg",
};

export function canonicalUnit(unit: string) {
  const lower = unit.trim().toLowerCase();
  return UNIT_ALIASES[lower] ?? lower;
}

/** Unit conversions MediTwin is allowed to perform, keyed by LOINC code. */
export const UNIT_CONVERSIONS: Record<string, { from: string; to: string; factor: number }[]> = {
  // Glucose: 1 mmol/L = 18.016 mg/dL
  "2345-7": [{ from: "mmol/l", to: "mg/dl", factor: 18.016 }],
  "97507-8": [{ from: "mmol/l", to: "mg/dl", factor: 18.016 }],
};

// ---- Signal rules (FR-011) -----------------------------------------------------------------

/** Twin-recorded symptoms count as current context for this many days. */
export const RECORDED_SYMPTOM_WINDOW_DAYS = 45;

export interface RedFlagRule {
  id: string;
  description: string;
  all: string[];
  any?: string[];
  minSeverity?: "severe";
  system: SystemId;
  guidanceId: string;
}

export const RED_FLAGS: RedFlagRule[] = [
  { id: "RF-CHEST-01", description: "Chest pain together with breathlessness, dizziness or nausea", all: ["chest_pain"], any: ["shortness_of_breath", "dizziness", "nausea", "palpitations"], system: "cardiovascular", guidanceId: "urgent-chest" },
  { id: "RF-CHEST-02", description: "Severe chest pain", all: ["chest_pain"], minSeverity: "severe", system: "cardiovascular", guidanceId: "urgent-chest" },
  { id: "RF-RESP-01", description: "Severe shortness of breath", all: ["shortness_of_breath"], minSeverity: "severe", system: "respiratory", guidanceId: "urgent-breathing" },
];

// ---- Care guidance (FR-015) ------------------------------------------------------------------

export interface GuidanceContent {
  id: string;
  level: SignalType | "NONE";
  title: string;
  steps: string[];
  seekUrgentCareIf: string[];
}

const GENERAL_URGENT = [
  "Chest pain, pressure or tightness",
  "Severe difficulty breathing",
  "Fainting, confusion or sudden weakness on one side of the body",
];

export const SYSTEM_WARNING_SIGNS: Record<string, string[]> = {
  metabolic: ["Repeated vomiting or you can't keep fluids down", "Deep or fast breathing, or a fruity smell on the breath", "Unusual drowsiness or confusion"],
  cardiovascular: ["Chest pain spreading to the arm, jaw or back", "A very fast or irregular heartbeat with dizziness", "Sudden severe headache with high blood pressure"],
  respiratory: ["Lips or fingertips turning blue or grey", "Breathlessness that stops you speaking in full sentences", "Reliever inhaler not helping"],
};

export const GUIDANCE: Record<string, GuidanceContent> = {
  "urgent-chest": {
    id: "urgent-chest", level: "URGENT", title: "Get emergency help now",
    steps: [
      "Call your local emergency number, or go to the nearest emergency department now.",
      "Don't drive yourself. Ask someone to take you or wait for an ambulance.",
      "If you're with someone, tell them what you're feeling.",
    ],
    seekUrgentCareIf: [],
  },
  "urgent-breathing": {
    id: "urgent-breathing", level: "URGENT", title: "Get emergency help now",
    steps: [
      "Call your local emergency number, or go to the nearest emergency department now.",
      "Sit upright and try to stay calm while you wait for help.",
      "If you've been prescribed a reliever inhaler, follow the plan your clinician gave you.",
    ],
    seekUrgentCareIf: [],
  },
  attention: {
    id: "attention", level: "ATTENTION", title: "Consider talking to a healthcare professional soon",
    steps: [
      "These findings appear together, so it's worth booking an appointment in the coming days rather than waiting for a routine check.",
      "Bring the visit summary from MediTwin so your clinician can see the measurements and symptoms in one place.",
      "Keep a note of when symptoms happen and whether they change.",
    ],
    seekUrgentCareIf: GENERAL_URGENT,
  },
  information: {
    id: "information", level: "INFORMATION", title: "Mention this at your next routine visit",
    steps: [
      "Nothing here points to an urgent change, but these results are outside their reference range.",
      "It's reasonable to bring them up at your next scheduled appointment.",
      "Come back and check your symptoms if anything new appears.",
    ],
    seekUrgentCareIf: GENERAL_URGENT,
  },
  none: {
    id: "none", level: "NONE", title: "No signal from the information available",
    steps: [
      "MediTwin didn't find measurements outside their reference ranges that relate to what you selected.",
      "This isn't the same as a clean bill of health. If you're worried, speak to a healthcare professional.",
    ],
    seekUrgentCareIf: GENERAL_URGENT,
  },
};

export const DISCLAIMER =
  "This is not a diagnosis. MediTwin explains how your records and symptoms relate to each other. It doesn't replace a healthcare professional.";
