# MediTwin

**Understand your health. See your body differently.**

MediTwin is a personal health twin built on the OntoMorph platform. People create an account, connect their own **OntoMorph digital twin** (records from providers, Apple/Google Health, uploaded lab reports) and/or add results themselves, and check in on how they feel. MediTwin then:

- resolves every record through **HOLON** clinical knowledge
- runs a **deterministic signal engine**
- shows the affected anatomy in **3D**
- explains the result in plain language, with **every sentence citing its evidence**
- ends with reviewed care guidance and a visit summary

> Data → clinical context → health signal → explanation → appropriate next step, not symptoms → AI diagnosis.

MediTwin gives health information, not medical advice or diagnosis. Sample twins (synthetic OntoMorph sandbox data) let anyone try it without signing up.

## What it does

### For a signed-in person
| Feature | How |
|---|---|
| Account with informed consent, profile (first name, birth year, sex) | Turso/libSQL, scrypt passwords, signed HTTP-only 7-day sessions, sign-in rate limiting |
| **Connect your own OntoMorph twin** by pasting the grant token you issue in OntoMorph | Token verified live against OntoMorph (production or sandbox) and stored encrypted; expiry and revocation detected |
| **Add your own results**: HbA1c, glucose, blood pressure, heart rate, BMI, lipids, creatinine, ALT, TSH, WBC | LOINC-coded catalog, unit conversion (mmol/L ↔ mg/dL, µmol/L), plausibility checks; optionally written to your twin |
| **Symptom check-ins that remember** | Every check-in is saved; recent ones count as history, so recurring symptoms are recognised (plus HOLON phenotype similarity) |
| Health view, timeline, 3D anatomy, cited explanation, care guidance, what-if, visit summary | Same engine as the sample twins, run on *your* data |
| **Save a signal to your twin** | DTP `twin.flag` with your grant |
| **Export all your data** (decrypted JSON) and **delete your account** | Full deletion of profile, results, check-ins, twin connection and activity log |

### Platform integration
| Feature | Platform |
|---|---|
| Twin events via patient grant tokens (production + sandbox) | DTP `GET/POST /provider/twins/:id/events` |
| Concepts for LOINC, RxNorm, SNOMED CT, HPO and FMA | HOLON `/concepts` |
| Age/sex-aware reference ranges | HOLON `/reference-ranges/loinc` |
| Recurring-symptom similarity | HOLON `/phenotype/match` |
| Medication interaction screen | HOLON `/interactions/check-list` |
| What-if trajectories (non-medication scenarios only) | DTP simulations |
| Plain-language explanations and free-text symptom mapping (strict JSON, citation + safety checks, template fallback) | Groq `openai/gpt-oss-120b` or Claude |

## Privacy and security

- **Encryption at rest.** Health content (results, notes, check-ins, profile, grant tokens) is encrypted with AES-256-GCM before it's written. The database stores only ciphertext plus ids and timestamps.
- **Minimal data.** No ID numbers or medical-record numbers. The AI provider receives only the evidence, age and sex, never name or email.
- **Consent recorded** with version and timestamp. An audit log of account actions (without health values) is included in the export.
- **Access control.** Every personal route checks a signed session and that the account still exists. Cross-origin writes are refused. Secrets never reach the browser.
- **User control.** Data export and permanent deletion are available in *Account & privacy*. OntoMorph access can be revoked at the source.

## Run locally

Requires Node 20+ (tested on 24).

```powershell
Set-Location frontend
Copy-Item ..\.env.example .env.local   # fill in the keys (see below)
npm install
npm run dev
```

Open <http://localhost:3000>. Choose **Create your health twin**, or **Try a sample twin** for no sign-up.

## Environment variables (server-side only)

| Variable | Needed for |
|---|---|
| `ONTOMORPH_API_KEY` (alias `DTP_LIVE_PERSONAL`) | OntoMorph DTP: sample twins and connected personal twins |
| `HOLON_API_KEY` | Clinical concepts, reference ranges, anatomy |
| `DATABASE_URL`, `TURSO_AUTH_TOKEN` | Accounts and personal data (Turso) |
| `LOCAL_AUTH_SESSION_SECRET` | Signing sessions (long random value) |
| `DATA_ENCRYPTION_KEY` | Encrypting health data. **Generate once and never change it**, or stored data becomes unreadable |
| `GROQ_API_KEY` or `ANTHROPIC_API_KEY` | AI explanations (optional; reviewed templates otherwise) |
| `MEDITWIN_APP_MODE` | `demo` (default) or `clinical` (fail-closed gate) |

Never prefix any of these with `NEXT_PUBLIC_`.

## Checks

```powershell
Set-Location frontend
npm run typecheck
npm run lint
npm test            # 57 tests: engine, safety, normalization, and the full account journey on a throwaway local DB
npm run test:live   # live: OntoMorph + HOLON + AI, including connecting a twin with a real grant token
npm run build
```

## Deploy (Vercel)

1. Import the repository and set **Root Directory** to `frontend`.
2. Add the environment variables above.
3. Deploy. The database schema is created automatically on first use.

## Architecture

```
Browser (Next.js client)
   │  /api/twins/*            sample twins (no account)
   │  /api/me/*               the signed-in person's own data
   ▼
Route handlers ── server/http.ts, server/session.ts   gate, validation, auth, error wording
   ├─ server/twin-service.ts      buildView / analyzeView / simulate / flag (shared by both modes)
   ├─ server/personal/service.ts  twin connection, entries, check-ins, export, deletion
   ├─ server/personal/store.ts    encrypted persistence (server/db.ts + server/crypto.ts)
   ├─ server/ontomorph/dtp.ts     grants, events, writes, simulations (production + sandbox hosts)
   ├─ server/ontomorph/holon.ts   concepts, ranges, phenotype, interactions (cached)
   └─ server/ai.ts                Groq/Claude → citation check → safety check
domain/   (pure, unit-tested)     content set, entry catalog, normalization, signal engine, safety, templates
```

## Before scaling to the public

The product works end to end. For a wide public launch you should also:

- register MediTwin as an app in OntoMorph so people can grant it access from their OntoMorph account
- add email verification and password reset (needs an email provider)
- get a legal review of the privacy notice for your jurisdictions (e.g. NDPA, GDPR, HIPAA where relevant)
- have a licensed clinician review the content set in `domain/content.ts`

See [docs/CLINICAL_LAUNCH.md](docs/CLINICAL_LAUNCH.md).

More: [docs/SUBMISSION.md](docs/SUBMISSION.md) · [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) · [PRD.MD](PRD.MD)
