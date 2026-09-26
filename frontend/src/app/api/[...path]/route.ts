import { NextRequest, NextResponse } from "next/server";
import { getClinicalReadiness, isClinicalMode } from "@/lib/clinical-config";

const patient = { id: "demo-david", name: "David", age: 28, sex: "male", synthetic: true };
const glucoseEvent = {
  id: "event-glucose-2026-09-18", patient_id: "demo-david", timestamp: "2026-09-18T09:00:00Z",
  name: "Fasting glucose", value: 6.1, unit: "mmol/L", concept_code: "14771-0", concept_system: "LOINC",
  reference: { lower: 3.9, upper: 5.5, unit: "mmol/L", context: "demo clinical reference" }, source: "SYNTHETIC_DEMO",
};
const events = [
  glucoseEvent,
  { id: "event-heart-rate-2026-09-12", patient_id: "demo-david", timestamp: "2026-09-12T09:00:00Z", name: "Resting heart rate", value: 82, unit: "bpm", source: "SYNTHETIC_DEMO" },
  { id: "event-medication-2026-09-01", patient_id: "demo-david", timestamp: "2026-09-01T09:00:00Z", name: "Medication event", value: "Example medication", source: "SYNTHETIC_DEMO" },
];
const normalizedSymptoms: Record<string, string> = { fatigue: "fatigue", "increased thirst": "polydipsia", "frequent urination": "polyuria" };

type SymptomPayload = { names?: string[]; duration?: string; severity?: string };

function signalFor(names: string[]) {
  const relevant = names.map((name) => name.toLowerCase()).filter((name) => normalizedSymptoms[name]);
  const attention = glucoseEvent.value > glucoseEvent.reference.upper && relevant.length > 0;
  return {
    id: "signal-demo", type: attention ? "ATTENTION" : "INFORMATION", severity: attention ? "MODERATE" : "LOW",
    system: "Metabolic", evidence: ["fasting_glucose_above_reference", ...relevant.map((name) => normalizedSymptoms[name])],
    source: "SYSTEM_GENERATED", disclaimer: "This deterministic signal is not a diagnosis and does not replace professional medical advice.",
  };
}

function explanationFor(symptomNames: string[]) {
  const text = symptomNames.length
    ? "Your fasting glucose result is above the reference range associated with this demo measurement. The symptoms you reported can occur for several different reasons. Together, these findings may be worth discussing with a healthcare professional. This information does not establish a diagnosis."
    : "Your fasting glucose result is above the reference range associated with this demo measurement. A single result can have several explanations and does not establish a diagnosis. Consider discussing this result with a healthcare professional if you have questions or concerns.";
  return {
    text,
    evidence: [{ type: "SYNTHETIC_DEMO", label: "Fasting glucose result" }, { type: "CLINICAL_REFERENCE", label: "Reference range: 3.9 - 5.5 mmol/L" }, ...symptomNames.map((label) => ({ type: "USER_PROVIDED", label }))],
    disclaimer: "This explanation is not medical advice and does not replace a healthcare professional.", source: "SYSTEM_GENERATED",
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (isClinicalMode()) {
    return NextResponse.json({ detail: "Clinical data access is not activated.", readiness: getClinicalReadiness() }, { status: 503 });
  }
  const { path } = await params;
  const endpoint = path.join("/");
  if (endpoint === "demo/patient") return NextResponse.json(patient);
  if (endpoint === "twin") return NextResponse.json({ patient, integration: { mode: "synthetic_demo", ontomorph_status: "not_configured", message: "Synthetic demo data is active. Configure a server-side OntoMorph adapter before claiming live twin retrieval." } });
  if (endpoint === "twin/events") return NextResponse.json(events);
  if (endpoint === "twin/systems") return NextResponse.json([{ name: "Metabolic", signal_count: 1, status: "ATTENTION" }, { name: "Cardiovascular", signal_count: 0, status: "NO_ATTENTION" }, { name: "Respiratory", signal_count: 0, status: "NO_RECENT_DATA" }]);
  if (endpoint === "signals") return NextResponse.json([signalFor(["Fatigue", "Increased thirst", "Frequent urination"])]);
  if (endpoint === "anatomy/metabolic") return NextResponse.json({ system: "metabolic", available: false, message: "No OntoMorph anatomy visualization is configured for this demo." });
  if (endpoint.startsWith("health-events/")) {
    const event = events.find((item) => item.id === path[1]);
    return event ? NextResponse.json(event) : NextResponse.json({ detail: "Health event not found" }, { status: 404 });
  }
  return NextResponse.json({ detail: "Not found" }, { status: 404 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (isClinicalMode()) {
    return NextResponse.json({ detail: "Clinical data access is not activated.", readiness: getClinicalReadiness() }, { status: 503 });
  }
  const { path } = await params;
  const endpoint = path.join("/");
  const payload = await request.json() as SymptomPayload & { event_id?: string; symptom_names?: string[] };
  if (endpoint === "signals/analyze") return NextResponse.json(signalFor(payload.names ?? []));
  if (endpoint === "symptoms") return NextResponse.json({ patient_id: patient.id, symptoms: (payload.names ?? []).map((name) => ({ name, concept: normalizedSymptoms[name.toLowerCase()] ?? null, source: "USER_PROVIDED" })), duration: payload.duration, severity: payload.severity });
  if (endpoint === "explanations") {
    if (payload.event_id !== glucoseEvent.id) return NextResponse.json({ detail: "No reviewed explanation template is available for this event" }, { status: 422 });
    return NextResponse.json(explanationFor(payload.symptom_names ?? []));
  }
  return NextResponse.json({ detail: "Not found" }, { status: 404 });
}