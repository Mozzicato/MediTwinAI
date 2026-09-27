// Measurements a person can add to their own record (reviewed content, like content.ts).
// Each entry becomes a twin-shaped health event, so it flows through exactly the same
// normalization, HOLON lookups and signal engine as data from an OntoMorph twin.

import type { SystemId } from "./types";

export interface EntryField {
  key: string;
  label: string;
  /** Allowed units; the first is the default. Conversions live in content.ts UNIT_CONVERSIONS. */
  units: string[];
  /** Plausibility limits in the default unit, to catch typos (not clinical thresholds). */
  min: number;
  max: number;
}

export interface EntryType {
  id: string;
  label: string;
  system: SystemId;
  eventType: "lab_result" | "vital_sign";
  loinc?: string;
  fields: EntryField[];
  help: string;
}

export const ENTRY_TYPES: EntryType[] = [
  { id: "hba1c", label: "HbA1c", system: "metabolic", eventType: "lab_result", loinc: "4548-4", help: "Average blood sugar over about 3 months, from a blood test.",
    fields: [{ key: "value", label: "HbA1c", units: ["%"], min: 3, max: 20 }] },
  { id: "fasting_glucose", label: "Fasting glucose", system: "metabolic", eventType: "lab_result", loinc: "2345-7", help: "Blood sugar after not eating for at least 8 hours.",
    fields: [{ key: "value", label: "Glucose", units: ["mg/dL", "mmol/L"], min: 20, max: 700 }] },
  { id: "blood_pressure", label: "Blood pressure", system: "cardiovascular", eventType: "vital_sign", help: "Top (systolic) and bottom (diastolic) numbers from a cuff reading.",
    fields: [
      { key: "systolic", label: "Systolic", units: ["mmHg"], min: 60, max: 260 },
      { key: "diastolic", label: "Diastolic", units: ["mmHg"], min: 30, max: 160 },
    ] },
  { id: "heart_rate", label: "Resting heart rate", system: "cardiovascular", eventType: "vital_sign", help: "Beats per minute while resting.",
    fields: [{ key: "heartRate", label: "Heart rate", units: ["bpm"], min: 25, max: 250 }] },
  { id: "bmi", label: "Body mass index", system: "metabolic", eventType: "vital_sign", help: "Weight in kg divided by height in metres squared.",
    fields: [{ key: "bmi", label: "BMI", units: ["kg/m2"], min: 10, max: 80 }] },
  { id: "total_cholesterol", label: "Total cholesterol", system: "cardiovascular", eventType: "lab_result", loinc: "2093-3", help: "From a lipid panel.",
    fields: [{ key: "value", label: "Total cholesterol", units: ["mg/dL", "mmol/L"], min: 50, max: 600 }] },
  { id: "ldl", label: "LDL cholesterol", system: "cardiovascular", eventType: "lab_result", loinc: "13457-7", help: "\"Bad\" cholesterol, from a lipid panel.",
    fields: [{ key: "value", label: "LDL", units: ["mg/dL", "mmol/L"], min: 10, max: 500 }] },
  { id: "hdl", label: "HDL cholesterol", system: "cardiovascular", eventType: "lab_result", loinc: "2085-9", help: "\"Good\" cholesterol, from a lipid panel.",
    fields: [{ key: "value", label: "HDL", units: ["mg/dL", "mmol/L"], min: 5, max: 200 }] },
  { id: "triglycerides", label: "Triglycerides", system: "cardiovascular", eventType: "lab_result", loinc: "2571-8", help: "Blood fats, from a lipid panel.",
    fields: [{ key: "value", label: "Triglycerides", units: ["mg/dL", "mmol/L"], min: 10, max: 5000 }] },
  { id: "creatinine", label: "Creatinine", system: "renal", eventType: "lab_result", loinc: "2160-0", help: "Kidney function marker, from a blood test.",
    fields: [{ key: "value", label: "Creatinine", units: ["mg/dL", "µmol/L"], min: 0.1, max: 20 }] },
  { id: "alt", label: "ALT (liver enzyme)", system: "metabolic", eventType: "lab_result", loinc: "1742-6", help: "Liver enzyme, from a blood test.",
    fields: [{ key: "value", label: "ALT", units: ["U/L"], min: 1, max: 5000 }] },
  { id: "tsh", label: "TSH (thyroid)", system: "metabolic", eventType: "lab_result", loinc: "3016-3", help: "Thyroid-stimulating hormone, from a blood test.",
    fields: [{ key: "value", label: "TSH", units: ["mIU/L"], min: 0.001, max: 200 }] },
  { id: "wbc", label: "White blood cells", system: "oncology_genomic", eventType: "lab_result", loinc: "6690-2", help: "From a complete blood count.",
    fields: [{ key: "value", label: "WBC", units: ["10*3/uL"], min: 0.1, max: 200 }] },
];

export const ENTRY_TYPE_BY_ID = new Map(ENTRY_TYPES.map((t) => [t.id, t]));

// Units a person may enter in, converted before comparison with a HOLON range.
export const ENTRY_UNIT_FACTORS: Record<string, Record<string, number>> = {
  "2345-7": { "mmol/l": 18.016 },
  "2093-3": { "mmol/l": 38.67 },
  "13457-7": { "mmol/l": 38.67 },
  "2085-9": { "mmol/l": 38.67 },
  "2571-8": { "mmol/l": 88.57 },
  "2160-0": { "µmol/l": 1 / 88.42, "umol/l": 1 / 88.42 },
};

export interface EntryValues { [fieldKey: string]: number }

/** Validate an entry against the catalog. Returns a user-facing error, or null when valid. */
export function validateEntry(type: EntryType, values: EntryValues, unit: string): string | null {
  const field = type.fields[0];
  if (!field.units.includes(unit)) return `Choose one of: ${field.units.join(", ")}.`;
  for (const f of type.fields) {
    const v = values[f.key];
    if (typeof v !== "number" || !Number.isFinite(v)) return `Enter a number for ${f.label}.`;
    // Plausibility limits are defined in the default unit; convert rough-check other units.
    const factor = unit === f.units[0] || !type.loinc ? 1 : ENTRY_UNIT_FACTORS[type.loinc]?.[unit.toLowerCase()] ?? 1;
    const comparable = v * factor;
    if (comparable < f.min || comparable > f.max) return `${f.label} of ${v} ${unit} looks unlikely. Check the value and unit.`;
  }
  if (type.id === "blood_pressure" && values.systolic <= values.diastolic) return "Systolic should be higher than diastolic.";
  return null;
}

/** Build the twin-shaped `data` object for an entry. */
export function entryEventData(type: EntryType, values: EntryValues, unit: string): Record<string, unknown> {
  if (type.eventType === "vital_sign") {
    return { system: type.system, unit: type.fields.length > 1 ? "mmHg" : unit, ...values };
  }
  return { system: type.system, testName: type.label, loinc_code: type.loinc, loinc_display: type.label, value: values.value, unit };
}
