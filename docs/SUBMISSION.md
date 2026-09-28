# MediTwin: hackathon submission

## One line

MediTwin turns an OntoMorph digital twin into a calm, evidence-cited explanation of what's happening in your body and what to do next. It never diagnoses.

## The problem

People meet health information in pieces: a lab PDF, a medication list, a symptom they've had for two weeks. The data is coded (LOINC 4548-4, RxNorm 861007), and the usual next step is a search engine and a lot of worry. Symptom checkers make it worse by jumping from symptoms straight to diagnoses.

## What MediTwin does

1. **Reads the twin.** It mints a sandbox grant and pulls the patient's events from the OntoMorph DTP: labs, vitals, CGM readings, symptoms, medications and diagnoses.
2. **Adds clinical context through HOLON.** Every code is resolved to a concept, and every measurement is compared with a HOLON reference range. Units are converted only where the content set allows it. Nothing is hard-coded.
3. **Takes symptoms without a chat box.** The person picks from a structured list, or describes them in their own words. An LLM (Groq gpt-oss-120b) maps the description to the catalog, and each match must quote the person's words. Symptoms become SNOMED CT and HPO concepts.
4. **Decides with rules, not AI.** A deterministic engine combines twin data and new symptoms into a named signal (`SIG-ATT-01`: out-of-range measurement + a symptom relevant to it). Red flags such as chest pain with breathlessness short-circuit to `URGENT`. HOLON phenotype similarity notices when today's symptoms repeat ones already in the twin.
5. **Shows the body.** The signal maps to FMA anatomy concepts verified live in HOLON, and those structures light up on a 3D body.
6. **Explains, with citations.** The LLM writes the explanation from the evidence only. Paragraphs that don't cite real evidence are removed, and a safety layer blocks diagnoses, medication instructions and false reassurance. If anything fails, a reviewed template is shown and the UI says so.
7. **Gives a next step.** Care guidance and emergency advice come from a reviewed content set, never from the model.
8. **Closes the loop.** The person can run a what-if projection (`twin.simulate`, lifestyle vs no change), write the signal back to the twin as a clinical note (`twin.flag`), and print a visit summary for their clinician.

## A real product, not only a demo

Anyone can create an account, give informed consent, and build their own health twin:
- get their own OntoMorph digital twin, created automatically at sign-up
- add their own lab and vital results (LOINC-coded, unit-converted, written to their twin)
- run symptom check-ins that are remembered, so recurring symptoms are recognised

Health data is AES-256-GCM encrypted at rest. People can export everything or delete their account at any time. Sample twins remain available for anyone who wants to try it first.

## Who it's for

- **Primary:** health-conscious adults and people living with a long-term condition who want to understand their own results and decide when to seek care.
- **Next:** caregivers, and clinicians receiving a structured pre-visit summary (roadmap Phase 5).

## Platform components used

| Component | How MediTwin uses it |
|---|---|
| DTP twin creation | Creates each user's own twin at sign-up (`POST /twins`) and keeps its profile updated |
| DTP sandbox grants | Mints grant tokens for the five synthetic sample twins (`GET /grants`), cached until expiry |
| DTP twin events | Grant-scoped event list, normalized into measurements, concepts and a timeline |
| DTP simulation | `hba1c_trajectory` / `ldl_trajectory` on the twin's own baseline, non-medication scenarios only |
| DTP flag (write-back) | Saves the deterministic signal onto the twin as a `clinical_note` |
| HOLON concepts | LOINC, RxNorm, SNOMED CT, HPO, FMA resolution |
| HOLON reference ranges | Age/sex-aware ranges by LOINC, with publisher shown |
| HOLON phenotype match | Recurring-symptom detection against twin-recorded symptoms |
| HOLON interactions | Medication list screen |
| HOLON FMA anatomy | Only verified anatomy is highlighted in 3D |
| AI (Groq gpt-oss-120b, or Claude) | Evidence-to-plain-language explanations and free-text symptom mapping, behind citation and safety checks |

## Why it's safe to demo

- Rules decide and AI explains. The model never classifies a signal or chooses guidance.
- 55 unit tests cover the engine, unit conversion, content integrity, and PRD §48 "AI tests" ("Do I have diabetes?", "Can I stop my medication?", "Am I healthy?"…). Every unsafe answer is blocked.
- Live integration tests exercise DTP and HOLON end to end.
- No invented data, no hard-coded ranges, no fake OntoMorph integration. When a service is down, the UI says so.
- Clinical mode fails closed.

## Try it

Open the deployment → **Explore Demo Twin** → **Start guided demo**. No sign-up is needed.
