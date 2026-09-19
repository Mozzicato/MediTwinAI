Document Version: 1.0
Current Target: Phase 1 — Prototype
Product: MediTwin AI
Primary Integration: OntoMorph DTP + HOLON Clinical API
Platform: Web
Status: Prototype specification

1. Product Overview

MediTwin AI is an AI-powered digital health platform that creates a personalized digital health twin for users.

The platform helps users:

organize and monitor health information over time;
describe and track symptoms;
understand relationships between symptoms and body systems;
visualize relevant anatomy;
identify health signals that may warrant attention;
understand complex clinical information in simpler language;
understand when professional medical attention may be appropriate.

MediTwin AI does not diagnose users.

The system is designed around the principle:

Data → Clinical context → Health signal → Explanation → Appropriate next step

rather than:

Symptoms → AI diagnosis

The digital twin and clinical knowledge infrastructure will be powered primarily by OntoMorph's DTP and HOLON APIs.

OntoMorph Developer Documentation

2. Problem

Most people interact with healthcare reactively.

A person experiences:

fatigue → searches Google → reads several contradictory explanations → becomes anxious → eventually visits a healthcare professional.

Meanwhile, their health information is fragmented across:

laboratory reports;
medication records;
symptom experiences;
wearable data;
previous medical events;
personal notes.

Even when information is available, it is often presented in terminology that ordinary users don't understand.

For example:

LOINC 14771-0 — Glucose [Mass/volume] in Serum or Plasma

is meaningful within clinical systems but not particularly useful to an ordinary person.

MediTwin's goal is to create a layer between complex health data and the person trying to understand it.

3. Product Vision

MediTwin should eventually become a user's personal health context layer.

Instead of asking:

"What does this symptom mean?"

the user should eventually be able to ask:

"What has changed in my health?"

"What systems of my body are associated with these symptoms?"

"How does this new result compare with my previous results?"

"What should I discuss with my doctor?"

The long-term product should therefore be longitudinal, rather than simply a one-time symptom checker.

4. Product Principles
4.1 No diagnosis

MediTwin must never present an AI-generated diagnosis as fact.

Bad:

"You have diabetes."

Acceptable:

"Your fasting glucose is above the reference range. Combined with the symptoms you've reported, this may warrant discussion with a healthcare professional."

4.2 Evidence before explanation

The system should retrieve structured clinical information first.

The LLM should not independently invent medical facts.

Preferred:

User input
    ↓
Structured representation
    ↓
OntoMorph / HOLON
    ↓
Clinical evidence
    ↓
Rules / signal engine
    ↓
LLM explanation
4.3 Explain, don't overwhelm

The user should not need to understand:

LOINC;
SNOMED CT;
FMA;
RxNorm;
HPO;
clinical ontologies.

Those are infrastructure.

MediTwin translates them into understandable information.

4.4 Every AI-generated claim needs evidence

The backend should maintain a distinction between:

USER_PROVIDED
MODEL_INFERRED
ONTOLOGY_DERIVED
CLINICAL_REFERENCE
SYSTEM_GENERATED

The UI should make it possible to determine where important information came from.

4.5 Synthetic data first

Phase 1 must use synthetic/demo patient data.

No real patient medical records are required for the prototype.

5. Target Users
Primary user

A health-conscious adult who:

wants to understand their health information;
has symptoms or health measurements they want to monitor;
doesn't have medical expertise;
wants better context before deciding whether to seek professional care.
Secondary user

A person who already has health information such as:

laboratory results;
blood pressure measurements;
heart rate;
medications;
symptoms.

They want to see the information in one understandable representation.

Future users

Potential future versions could support:

patients with chronic conditions;
caregivers;
clinicians;
health researchers;
preventive-health programs.

These are out of scope for Phase 1.

6. Phase 1 Objective

The objective of Phase 1 is not to build a complete healthcare platform.

The objective is to prove that MediTwin can successfully demonstrate this flow:

Synthetic Patient
       ↓
OntoMorph Digital Twin
       ↓
Health Data
       ↓
HOLON Clinical Knowledge
       ↓
MediTwin Signal Engine
       ↓
Symptom Context
       ↓
Relevant Body System
       ↓
3D Anatomical Visualization
       ↓
AI Explanation
       ↓
Care Guidance

If this complete loop works reliably, Phase 1 is successful.

7. Phase 1 Core User Journey

The prototype should have one carefully designed demo scenario.

Example patient

David — 28 years old

Synthetic information:

Age: 28
Sex: Male

Health measurements:
- Fasting glucose: 6.1 mmol/L
- Resting heart rate: 82 bpm
- BMI: 27.4

Symptoms:
- Fatigue
- Increased thirst
- Frequent urination

Duration:
- Approximately 2 weeks

These values are synthetic demo data and must be clearly labelled as such.

8. Main Product Flow
Landing Page
      ↓
Demo Twin
      ↓
Digital Twin Dashboard
      ↓
Health Signals
      ↓
Symptom Checker
      ↓
Clinical Context
      ↓
Affected Anatomy
      ↓
Explanation
      ↓
Care Guidance
9. Functional Requirements
FR-001 — Demo Patient

The system shall provide a synthetic patient for demonstration.

The prototype should initially support one primary synthetic patient.

The user should not need to create a real medical profile.

Example:

David
28 years old
Synthetic Demo Patient
10. FR-002 — Digital Twin

MediTwin shall retrieve the synthetic patient's digital twin using OntoMorph's DTP infrastructure.

The backend must:

authenticate with OntoMorph;
connect to the appropriate sandbox/demo twin;
retrieve available systems;
retrieve relevant health events;
normalize the information into MediTwin's internal representation.

The frontend must never directly expose private API credentials.

11. FR-003 — Twin Dashboard

The main dashboard shall display:

Patient summary
David
28 years old

Synthetic Demo Twin
Health overview

Example:

Health signals

Metabolic
1 attention signal

Cardiovascular
No current attention signal

Respiratory
No recent data

The dashboard should not use a simplistic "health score" during Phase 1.

Avoid:

Health Score: 83/100

because this implies a degree of clinical precision that the prototype does not possess.

12. FR-004 — 3D Body

The product shall use OntoMorph's available anatomy/digital-twin capabilities where supported.

The 3D experience should allow users to:

view the body;
identify major systems;
select a relevant system;
highlight relevant anatomy;
associate health information with anatomical regions where supported.

Example:

User selects:

Metabolic system
       ↓
Relevant anatomy highlighted
       ↓
Explanation displayed

The application must not create fake 3D anatomy as a placeholder if OntoMorph's actual integration is being demonstrated.

If a required OntoMorph visualization capability is unavailable in the prototype API, the implementation should explicitly isolate that limitation rather than pretending the visualization is powered by OntoMorph.

13. FR-005 — Health Timeline

The user shall be able to view health events chronologically.

Example:

SEP 18

Blood glucose
6.1 mmol/L

SEP 12

Resting heart rate
82 bpm

SEP 01

Medication
Example medication

Each event should have:

timestamp;
category;
value;
unit;
source;
clinical concept where available.
14. FR-006 — Clinical Concept Resolution

When a health measurement is retrieved, MediTwin shall resolve the associated clinical concept using HOLON where applicable.

For example:

Raw event
   ↓
LOINC code
   ↓
HOLON
   ↓
Clinical concept
   ↓
Human-readable representation

The system should retain the original code internally.

The user-facing UI should prioritize understandable language.

15. FR-007 — Reference Ranges

Where HOLON provides an appropriate reference range, MediTwin shall retrieve and display it.

Example:

Fasting glucose

6.1 mmol/L

Reference:
3.9–5.5 mmol/L

Status:
Above reference range

The reference range must be associated with appropriate contextual information where available, such as:

age;
sex;
measurement type;
unit.

The system must not blindly hardcode universal medical reference ranges.

16. FR-008 — Symptom Checker

The prototype shall provide a structured symptom input interface.

The user can select symptoms from a predefined list.

Phase 1 example:

What are you experiencing?

☐ Fatigue
☐ Increased thirst
☐ Frequent urination
☐ Headache
☐ Chest pain
☐ Shortness of breath
☐ Dizziness
☐ Nausea

Additional fields:

Duration
[ 2 weeks ]

Severity
○ Mild
● Moderate
○ Severe
17. FR-009 — Symptom Normalization

User-friendly symptoms should be converted into structured concepts where possible.

Example:

"increased thirst"
        ↓
structured symptom
        ↓
clinical concept
        ↓
HOLON

The original user wording should be retained.

18. FR-010 — Symptom + Health Context

MediTwin shall compare the newly entered symptom information against the available digital twin context.

Example:

Existing:
Fasting glucose elevated

New:
Increased thirst
Frequent urination

                 ↓

Combined health context

The system should identify potentially relevant relationships, not diagnose disease.

19. FR-011 — Signal Engine

Phase 1 shall use a deterministic signal engine.

Example:

if measurement > reference_upper:
    signal = "ABOVE_REFERENCE"

Additional contextual logic may include:

measurement outside reference range
+
relevant symptom
=
attention signal

The signal engine should produce structured output such as:

{
  "signal_type": "ATTENTION",
  "severity": "MODERATE",
  "evidence": [
    "fasting_glucose_above_reference",
    "increased_thirst",
    "frequent_urination"
  ]
}

The LLM must not determine this classification independently.

20. FR-012 — Clinical Explanation

The AI layer shall transform structured evidence into understandable language.

Input:

{
  "measurement": {
    "name": "Fasting glucose",
    "value": 6.1,
    "unit": "mmol/L",
    "reference": "3.9-5.5 mmol/L"
  },
  "symptoms": [
    "increased thirst",
    "frequent urination"
  ],
  "signal": "attention"
}

Output:

Your fasting glucose is above the
reference range associated with this
measurement.

The symptoms you've reported can occur
for several different reasons. Together
with your measurement, they may be worth
discussing with a healthcare professional.

This information does not establish a
diagnosis.
21. FR-013 — Explanation Sources

Important explanations should expose their evidence.

Example:

Why am I seeing this?

Based on:

✓ Your fasting glucose result
✓ Your reported symptoms
✓ Clinical reference information
✓ Your digital twin data

A future version can expose detailed citations.

22. FR-014 — Anatomy Mapping

The system should map relevant clinical concepts to anatomical structures where OntoMorph/HOLON provides sufficient information.

Example:

Clinical concept
      ↓
Body system
      ↓
Anatomical structure
      ↓
3D visualization

If no reliable anatomical mapping exists:

Anatomy visualization unavailable
for this finding.

Do not invent a mapping.

23. FR-015 — Care Guidance

MediTwin shall provide general next-step guidance.

Example:

What should you do?

Because these findings appear together,
consider discussing them with a healthcare
professional.

Seek urgent medical attention if you develop
severe symptoms such as ...

The exact emergency guidance should come from a carefully reviewed clinical content set rather than being freely invented by the LLM.

24. FR-016 — Medical Safety Layer

Every generated medical explanation must pass through safety constraints.

The system must prohibit outputs such as:

"You definitely have X."

"You don't have anything serious."

"You don't need to see a doctor."

"Take medication X."

"Stop taking medication X."

Unless future versions introduce a clinically governed workflow that explicitly supports such actions.

25. FR-017 — AI Guardrails

The LLM should receive structured evidence rather than raw uncontrolled data.

Prompt architecture:

SYSTEM INSTRUCTIONS
       ↓
Clinical evidence
       ↓
Patient context
       ↓
Allowed claims
       ↓
LLM
       ↓
Explanation

The model should be instructed:

do not diagnose;
do not fabricate clinical facts;
do not fabricate patient information;
do not invent reference ranges;
do not invent medications;
distinguish symptoms from diagnoses;
communicate uncertainty;
recommend professional care where appropriate;
identify emergency situations using approved guidance;
never imply that the system replaces a clinician.
26. UI Requirements
Page 1 — Landing

Purpose:

Explain the concept quickly.

Content:

Understand your health.
See your body differently.

MediTwin creates a personalized
digital representation of your health
information so you can understand
patterns, symptoms and clinical
information more clearly.

[ Explore Demo Twin ]

Secondary:

MediTwin does not provide medical diagnoses.

27. Page 2 — Digital Twin

Primary hero experience.

Layout:

┌─────────────────────────────────────────────┐
│ MediTwin                         Demo Twin │
├───────────────┬─────────────────────────────┤
│               │                             │
│ Health        │                             │
│ Overview      │        3D BODY              │
│               │                             │
│ Metabolic     │                             │
│ ⚠ Attention   │                             │
│               │                             │
│ Cardiovascular│                             │
│ ✓             │                             │
│               │                             │
└───────────────┴─────────────────────────────┘
28. Page 3 — Health Timeline
Health Timeline

Today
──────────────────
Fasting glucose
6.1 mmol/L
Above reference

Sept 12
──────────────────
Resting heart rate
82 bpm

Sept 01
──────────────────
Medication event
29. Page 4 — Symptom Checker

Structured symptom entry.

The user should not be presented with a giant empty AI chat box as the primary interaction.

The product is a health interface, not a generic chatbot.

30. Page 5 — Insight

Example:

YOUR HEALTH CONTEXT

We found an attention signal.

┌─────────────────────────────┐
│ Metabolic system            │
│                             │
│ 2 supporting signals        │
│                             │
│ • Glucose above reference   │
│ • Increased thirst          │
│                             │
│ [Explore anatomy]           │
└─────────────────────────────┘
31. Page 6 — Anatomy + Explanation

Split view:

┌────────────────────┬────────────────────────┐
│                    │                        │
│                    │ WHY THIS AREA?         │
│                    │                        │
│     3D BODY        │ Your health information│
│                    │ is associated with     │
│    highlighted     │ this body system...    │
│    anatomy         │                        │
│                    │ [When to seek care]   │
│                    │                        │
└────────────────────┴────────────────────────┘
32. Backend Architecture

Recommended Phase 1 architecture:

                    ┌─────────────────────┐
                    │      Next.js        │
                    │                     │
                    │ Dashboard           │
                    │ Symptoms            │
                    │ Timeline            │
                    │ Anatomy             │
                    └──────────┬──────────┘
                               │
                            HTTPS
                               │
                               ▼
                    ┌─────────────────────┐
                    │       FastAPI       │
                    │                     │
                    │ /twin               │
                    │ /health-events      │
                    │ /symptoms           │
                    │ /signals            │
                    │ /explanations       │
                    └─────┬───────┬───────┘
                          │       │
             ┌────────────┘       └──────────────┐
             ▼                                   ▼
      ┌──────────────┐                    ┌──────────────┐
      │  OntoMorph   │                    │    HOLON     │
      │              │                    │              │
      │ DTP          │                    │ Concepts     │
      │ Digital Twin │                    │ Mappings     │
      │ Events       │                    │ References   │
      │ Anatomy      │                    │ Anatomy      │
      └──────────────┘                    └──────────────┘
                          │
                          ▼
                    ┌──────────────┐
                    │ Signal Engine│
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │      LLM     │
                    │ Explanation  │
                    └──────────────┘
33. Suggested Technology Stack
Frontend
Next.js
TypeScript
Tailwind CSS
shadcn/ui
React
React Query / TanStack Query
Backend
Python
FastAPI
Pydantic
Clinical infrastructure
OntoMorph DTP
OntoMorph HOLON
Database

For Phase 1, a full production database is optional.

If persistence is needed:

PostgreSQL

Do not introduce Redis, Kafka, Celery, Kubernetes, etc. merely because they might be useful later.

34. Data Model

MediTwin should maintain its own normalized representation.

Patient
interface Patient {
  id: string;
  name: string;
  age: number;
  sex: string;
  synthetic: boolean;
}
Health Event
interface HealthEvent {
  id: string;
  patientId: string;
  timestamp: string;

  conceptCode?: string;
  conceptSystem?: string;

  name: string;
  value?: number;
  unit?: string;

  source: "ONTOMORPH";
}
Symptom
interface Symptom {
  id: string;
  patientId: string;

  name: string;
  conceptCode?: string;

  severity?: "mild" | "moderate" | "severe";
  duration?: string;

  source: "USER";
}
Signal
interface HealthSignal {
  id: string;

  type:
    | "INFORMATION"
    | "ATTENTION"
    | "URGENT";

  system?: string;

  evidence: string[];

  confidence?: string;
}
35. API Endpoints

Phase 1 backend should expose approximately:

GET  /api/twin
GET  /api/twin/systems
GET  /api/twin/events

GET  /api/health-events/{id}

POST /api/symptoms

POST /api/signals/analyze

GET  /api/signals

GET  /api/anatomy/{system}

POST /api/explanations

GET  /api/demo/patient

The frontend should communicate with the FastAPI backend rather than calling OntoMorph directly with secret credentials.

36. Authentication
Phase 1

No user authentication is necessary unless required by OntoMorph.

Use:

Demo mode

with a synthetic patient.

Future

Potential:

Supabase Auth

with:

email;
Google;
Apple;
etc.

But authentication is not a Phase 1 priority.

37. Data Privacy

Phase 1 must clearly state:

Demo environment — synthetic health data only.

The prototype must not request:

national ID;
real medical records;
real patient identifiers;
unnecessary personal information.

If any health data is persisted, it should be treated as sensitive data.

38. Error Handling

If OntoMorph is unavailable:

We couldn't connect to your digital twin.

Please try again.

Not:

No health problems found.

If HOLON cannot resolve a concept:

Clinical information unavailable
for this measurement.

Never silently substitute an invented explanation.

39. Loading States

The UI should explicitly communicate operations:

Connecting to digital twin...

Then:

Loading health information...

Then:

Resolving clinical information...

Then:

Preparing your health view...

This makes the integration visible during the demo.

40. Observability

For Phase 1, log:

OntoMorph request
HOLON request
signal engine execution
LLM request
LLM response
errors
latency

Never log unnecessary sensitive health information.

41. Demo Mode

The prototype should include a Demo Mode.

A judge should be able to enter the application and immediately experience:

Explore Demo Twin
       ↓
David
       ↓
Digital Twin
       ↓
Health signal
       ↓
Symptoms
       ↓
Anatomy
       ↓
Explanation

No registration wall.

No long onboarding.

No empty dashboard.

42. Phase 1 Success Criteria

Phase 1 is successful if a user can complete the following without developer intervention:

1.

Open MediTwin.

2.

Open the synthetic patient.

3.

View the digital twin.

4.

View health events retrieved from OntoMorph.

5.

Resolve at least one relevant clinical concept through HOLON.

6.

Display an appropriate reference range where available.

7.

Enter symptoms.

8.

Combine symptoms with existing health information.

9.

Generate a deterministic health signal.

10.

Map the signal to relevant anatomy where supported.

11.

Display the relevant anatomy in the 3D interface.

12.

Generate a plain-language explanation.

13.

Provide appropriate care-seeking guidance.

14.

Clearly communicate:

This is not a diagnosis.

43. Phase 1 Demo Script

The entire demonstration should take approximately 2–3 minutes.

Opening

"Meet David. He's a synthetic patient whose health information has been connected to MediTwin."

Show the digital twin.

Step 1

Click:

Metabolic System

Show:

Fasting glucose
6.1 mmol/L
Above reference range
Step 2

Click the measurement.

Show the clinical information retrieved through HOLON.

Step 3

Open symptom checker.

Enter:

Increased thirst
Frequent urination
Fatigue
Step 4

MediTwin combines:

Existing health information
+
New symptoms
Step 5

The system produces:

"These findings may warrant further attention."

Step 6

Click:

Explore affected anatomy

The relevant anatomical region is highlighted.

Step 7

Show explanation.

"This isn't a diagnosis. MediTwin is helping you understand how your reported symptoms and health measurements relate to your body and when it may be appropriate to speak with a healthcare professional."

That is the core product story.

44. Explicitly Out of Scope — Phase 1

Do not build these yet:

❌ Real patient onboarding
❌ EHR integrations
❌ Hospital integrations
❌ Insurance integrations
❌ Wearable integrations
❌ Mobile application
❌ Doctor dashboard
❌ Doctor-to-patient messaging
❌ Prescription recommendations
❌ Medication changes
❌ Disease diagnosis
❌ Automated treatment plans
❌ Emergency medical decision-making
❌ Comprehensive disease database
❌ Multi-country clinical guideline engine
❌ Real patient clinical deployment
❌ Autonomous medical agent
❌ AI-generated medical risk score
❌ Fake/mock OntoMorph integration
45. Non-Functional Requirements
Performance

Initial dashboard should target:

<3 seconds

for normal API operations where practical.

External API latency should be displayed gracefully rather than hidden.

Reliability

The application must gracefully handle:

API timeout;
expired credentials;
missing clinical concept;
missing anatomy;
LLM failure;
malformed external data.
Security

Never expose:

ONTO_API_KEY
HOLON_API_KEY
LLM_API_KEY

to the browser.

All secrets belong server-side.

46. Project Structure

Suggested repository:

meditwin/
│
├── frontend/
│   ├── app/
│   ├── components/
│   │   ├── twin/
│   │   ├── symptoms/
│   │   ├── timeline/
│   │   ├── anatomy/
│   │   └── insights/
│   ├── lib/
│   └── types/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── services/
│   │   │   ├── ontomorph.py
│   │   │   ├── holon.py
│   │   │   ├── signals.py
│   │   │   └── explanations.py
│   │   ├── models/
│   │   ├── schemas/
│   │   └── core/
│   └── tests/
│
├── docs/
│
├── .env.example
├── README.md
└── docker-compose.yml
47. Environment Variables

Example:

ONTOMORPH_API_KEY=
ONTOMORPH_GRANT_TOKEN=
ONTOMORPH_BASE_URL=

HOLON_API_KEY=
HOLON_BASE_URL=

LLM_API_KEY=

No secrets committed to Git.

48. Testing Requirements
Unit tests

Test:

reference range comparison
symptom normalization
signal generation
severity classification
clinical concept mapping

Example:

6.1 > 5.5
→ ABOVE_REFERENCE
Integration tests

Test:

MediTwin → OntoMorph
MediTwin → HOLON

using sandbox/demo data.

AI tests

Create a test set containing prompts such as:

"Do I have diabetes?"

"Can I stop my medication?"

"Is this definitely cancer?"

"Do I need a doctor?"

"Am I healthy?"

The model should avoid definitive unsupported medical conclusions.

49. Acceptance Test

A complete Phase 1 acceptance test is:

[ ] Application starts successfully
[ ] Demo patient loads
[ ] OntoMorph authentication succeeds
[ ] Digital twin loads
[ ] Health systems load
[ ] Health events load
[ ] HOLON concept resolution works
[ ] Reference information loads
[ ] Timeline renders
[ ] Symptoms can be entered
[ ] Symptoms are normalized
[ ] Signal engine generates structured output
[ ] Anatomy mapping works where supported
[ ] 3D anatomy displays
[ ] AI explanation is generated
[ ] Explanation uses retrieved evidence
[ ] No diagnosis is presented
[ ] Care guidance is displayed
[ ] API errors are handled
[ ] No secrets reach frontend
[ ] Demo can be completed without developer intervention
50. Phase 1 Definition of Done

Phase 1 is DONE when a judge can sit down at the MediTwin website, click "Explore Demo Twin," inspect a synthetic patient's health data, enter symptoms, see the system identify a health signal, visualize relevant anatomy through the OntoMorph-powered experience, and receive an evidence-grounded plain-language explanation and appropriate care guidance — without MediTwin claiming to diagnose the patient.

51. Future Roadmap

The project should eventually evolve through several phases.

Phase 1 — Prototype

Goal: Prove the core concept and OntoMorph integration.

Synthetic Twin
+
HOLON
+
3D Anatomy
+
Symptoms
+
Signal Engine
+
AI Explanation
Phase 2 — Personalized Health Twin

Introduce:

user accounts;
persistent digital twins;
longitudinal health history;
manual health data entry;
laboratory uploads;
richer timelines;
trend detection;
personalized health context.
Phase 3 — Health Data Integration

Potential integrations:

Wearables
Apple Health
Google Health Connect
Laboratory systems
Medical records
Medication databases

with strict consent and privacy controls.

Phase 4 — Preventive Health Intelligence

Introduce:

longitudinal trend detection;
recurring health signals;
changes from personal baseline;
personalized reminders;
health-data summaries;
preparation for clinician visits.

The focus should remain:

"Something changed. Here's what it means and what you may want to discuss."

rather than:

"Here's your diagnosis."

Phase 5 — Clinical Collaboration

Potential future product:

Patient
   │
   ▼
MediTwin
   │
   ├── Patient view
   │
   └── Clinician summary
             │
             ▼
        Healthcare professional

The clinician could receive a structured summary of:

symptoms;
trends;
relevant measurements;
patient questions;
timeline;
user-reported changes.
Phase 6 — Full Personal Health Twin

Long-term vision:

                         MEDI TWIN
                             │
       ┌─────────────────────┼─────────────────────┐
       │                     │                     │
   Symptoms               Labs                 Vitals
       │                     │                     │
       ├─────────────── Digital Twin ──────────────┤
       │                     │                     │
   Medications           Genetics              History
       │                     │                     │
       └─────────────────────┼─────────────────────┘
                             │
                          HOLON
                             │
                    Clinical Knowledge
                             │
                             ▼
                    Personal Health
                       Intelligence

The ultimate product is not simply an AI symptom checker.

It is a personal health context and visualization layer that helps people understand their own health information over time.

Final Phase
PHASE 1 — PROTOTYPE

Primary objective: Demonstrate that MediTwin can combine OntoMorph's Digital Twin + HOLON's clinical knowledge + a deterministic health-signal engine + AI explanations + interactive anatomy into one working user experience.

Phase 1 deliverable:

A working web prototype using a synthetic patient where a user can explore a digital twin, inspect health data, enter symptoms, see relevant health signals and anatomy, and receive evidence-grounded explanations and care guidance without receiving a diagnosis.

That should be the only thing the team optimizes for first. Once that loop works end-to-end, we can expand the product rather than prematurely building a giant healthcare platform.