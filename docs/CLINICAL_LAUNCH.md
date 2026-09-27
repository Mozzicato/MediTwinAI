# Clinical Launch Requirements

`MEDITWIN_APP_MODE=clinical` is a fail-closed deployment mode. It blocks all synthetic API routes until the server-side configuration check succeeds. It is a safety gate, not evidence of regulatory or clinical readiness.

## Before Any Real Health Data

- Select an identity provider with MFA, account recovery, session revocation, and verified email controls.
- Implement authenticated authorization for every patient, event, symptom, signal, and explanation request. Never accept a patient identifier from the browser as authorization.
- Select a production database with encryption in transit and at rest, backups, access controls, retention rules, deletion workflows, and data-export workflows.
- Implement consent capture, withdrawal, privacy notices, audit events, security monitoring, incident response, and support escalation.
- Complete a threat model, penetration test, dependency scanning, and secret-management review.
- Obtain legal and privacy review for the jurisdictions and entities that will process the data.

## Clinical Integration Requirements

- Verify OntoMorph DTP sandbox and production contracts, authentication, schema versioning, error behavior, rate limits, and data-processing terms.
- Verify HOLON concept, reference-range, and anatomy mappings with clinically governed content. Do not use hard-coded ranges in clinical mode.
- Persist source provenance and timestamp for every transformed record.
- Require a reviewed content set for care guidance and escalation messaging. Do not use an unrestricted LLM to determine diagnosis, urgency, medication changes, or reference ranges.
- Establish human clinical governance for safety review, change control, monitoring, and incident handling.

## Release Gate

Do not activate patient access until every item above has an accountable owner and written approval. Set `CLINICAL_CONTENT_APPROVAL_ID` only once the reviewed content set (`frontend/src/domain/content.ts`: symptom codes, symptom→measurement relevance, anatomy mapping, red-flag rules and care guidance) has been signed off by a licensed clinician.

The current codebase implements OntoMorph DTP and HOLON adapters for the **sandbox** only (`frontend/src/server/ontomorph`). It intentionally does not implement real-patient grant issuance, identity, consent, persistence of health data, or production DTP access. Clinical mode stays blocked until those components exist.
