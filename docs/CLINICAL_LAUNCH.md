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

Do not activate patient access until every item above has an accountable owner and written approval. The current codebase intentionally does not implement real-patient ingestion, authentication, consent, persistence, or vendor adapters; it is blocked in clinical mode until those components exist.