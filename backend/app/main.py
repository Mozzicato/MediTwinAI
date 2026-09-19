from datetime import date
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="MediTwin API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

PATIENT = {"id": "demo-david", "name": "David", "age": 28, "sex": "male", "synthetic": True}
GLUCOSE_EVENT = {
    "id": "event-glucose-2026-09-18",
    "patient_id": "demo-david",
    "timestamp": "2026-09-18T09:00:00Z",
    "name": "Fasting glucose",
    "value": 6.1,
    "unit": "mmol/L",
    "concept_code": "14771-0",
    "concept_system": "LOINC",
    "reference": {"lower": 3.9, "upper": 5.5, "unit": "mmol/L", "context": "demo clinical reference"},
    "source": "SYNTHETIC_DEMO",
}
EVENTS = [
    GLUCOSE_EVENT,
    {"id": "event-heart-rate-2026-09-12", "patient_id": "demo-david", "timestamp": "2026-09-12T09:00:00Z", "name": "Resting heart rate", "value": 82, "unit": "bpm", "source": "SYNTHETIC_DEMO"},
    {"id": "event-medication-2026-09-01", "patient_id": "demo-david", "timestamp": "2026-09-01T09:00:00Z", "name": "Medication event", "value": "Example medication", "source": "SYNTHETIC_DEMO"},
]
NORMALIZED_SYMPTOMS = {"fatigue": "fatigue", "increased thirst": "polydipsia", "frequent urination": "polyuria"}


class SymptomInput(BaseModel):
    names: list[str] = Field(min_length=1, max_length=8)
    duration: str = Field(max_length=80)
    severity: Literal["mild", "moderate", "severe"]


class SignalAnalysisInput(BaseModel):
    names: list[str] = Field(max_length=8)
    duration: str = Field(max_length=80)
    severity: Literal["mild", "moderate", "severe"]


class ExplanationInput(BaseModel):
    event_id: str
    symptom_names: list[str] = Field(max_length=8)


@app.get("/api/demo/patient")
def get_demo_patient():
    return PATIENT


@app.get("/api/twin")
def get_twin():
    return {
        "patient": PATIENT,
        "integration": {
            "mode": "synthetic_demo",
            "ontomorph_status": "not_configured",
            "message": "Synthetic demo data is active. Configure a server-side OntoMorph adapter before claiming live twin retrieval.",
        },
    }


@app.get("/api/twin/systems")
def get_systems():
    return [
        {"name": "Metabolic", "signal_count": 1, "status": "ATTENTION"},
        {"name": "Cardiovascular", "signal_count": 0, "status": "NO_ATTENTION"},
        {"name": "Respiratory", "signal_count": 0, "status": "NO_RECENT_DATA"},
    ]


@app.get("/api/twin/events")
def get_events():
    return EVENTS


@app.get("/api/health-events/{event_id}")
def get_health_event(event_id: str):
    event = next((item for item in EVENTS if item["id"] == event_id), None)
    if event is None:
        raise HTTPException(status_code=404, detail="Health event not found")
    return event


@app.post("/api/symptoms")
def normalize_symptoms(payload: SymptomInput):
    return {
        "patient_id": PATIENT["id"],
        "symptoms": [
            {"name": name, "concept": NORMALIZED_SYMPTOMS.get(name.lower()), "source": "USER_PROVIDED"}
            for name in payload.names
        ],
        "duration": payload.duration,
        "severity": payload.severity,
    }


@app.post("/api/signals/analyze")
def analyze_signal(payload: SignalAnalysisInput):
    normalized_names = {name.lower() for name in payload.names}
    relevant_symptoms = normalized_names.intersection(NORMALIZED_SYMPTOMS)
    glucose_above_reference = GLUCOSE_EVENT["value"] > GLUCOSE_EVENT["reference"]["upper"]
    evidence = ["fasting_glucose_above_reference"] if glucose_above_reference else []
    evidence.extend(NORMALIZED_SYMPTOMS[name] for name in relevant_symptoms)
    signal_type = "ATTENTION" if glucose_above_reference and relevant_symptoms else "INFORMATION"
    return {
        "id": f"signal-{date.today().isoformat()}",
        "type": signal_type,
        "severity": "MODERATE" if signal_type == "ATTENTION" else "LOW",
        "system": "Metabolic",
        "evidence": evidence,
        "source": "SYSTEM_GENERATED",
        "disclaimer": "This deterministic signal is not a diagnosis and does not replace professional medical advice.",
    }


@app.get("/api/signals")
def get_signals():
    return [
        analyze_signal(
            SignalAnalysisInput(
                names=["Fatigue", "Increased thirst", "Frequent urination"],
                duration="2 weeks",
                severity="moderate",
            )
        )
    ]


@app.post("/api/explanations")
def create_explanation(payload: ExplanationInput):
    event = get_health_event(payload.event_id)
    if event["id"] != GLUCOSE_EVENT["id"]:
        raise HTTPException(status_code=422, detail="No reviewed explanation template is available for this event")
    if payload.symptom_names:
        explanation_text = (
            "Your fasting glucose result is above the reference range associated with this demo measurement. "
            "The symptoms you reported can occur for several different reasons. Together, these findings may be worth "
            "discussing with a healthcare professional. This information does not establish a diagnosis."
        )
    else:
        explanation_text = (
            "Your fasting glucose result is above the reference range associated with this demo measurement. "
            "A single result can have several explanations and does not establish a diagnosis. Consider discussing "
            "this result with a healthcare professional if you have questions or concerns."
        )
    return {
        "text": explanation_text,
        "evidence": [
            {"type": "SYNTHETIC_DEMO", "label": "Fasting glucose result"},
            {"type": "CLINICAL_REFERENCE", "label": "Reference range: 3.9 - 5.5 mmol/L"},
            *[{"type": "USER_PROVIDED", "label": symptom} for symptom in payload.symptom_names],
        ],
        "disclaimer": "This explanation is not medical advice and does not replace a healthcare professional.",
        "source": "SYSTEM_GENERATED",
    }


@app.get("/api/anatomy/{system}")
def get_anatomy(system: str):
    return {"system": system, "available": False, "message": "No OntoMorph anatomy visualization is configured for this demo."}