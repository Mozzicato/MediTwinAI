# MediTwin

**Understand your health. See your body differently.**

MediTwin is a personal health twin built on the OntoMorph platform. When someone signs up, MediTwin **creates their own OntoMorph digital twin** automatically. They add their results and check in on how they feel, and MediTwin then:

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
| Account with informed consent and a short profile (name, birth year, sex, height, weight, skin type) | Turso/libSQL, scrypt passwords, signed HTTP-only 7-day sessions, sign-in rate limiting |
| **Your own OntoMorph twin, created automatically** at sign-up and kept in step with your profile | DTP `POST /twins`, `PATCH /twins/:id` with MediTwin's platform key; nothing for the user to set up |
| **Add your own results**: HbA1c, glucose, blood pressure, heart rate, BMI, lipids, creatinine, ALT, TSH, WBC | LOINC-coded catalog, unit conversion (mmol/L ↔ mg/dL, µmol/L), plausibility checks; written to your twin (`POST /twins/:id/events`), with an encrypted copy in MediTwin that syncs automatically if OntoMorph is unavailable |
| **Symptom check-ins that remember** | Every check-in is saved; recent ones count as history, so recurring symptoms are recognised (plus HOLON phenotype similarity) |
| Health view, timeline, 3D anatomy, cited explanation, care guidance, what-if, visit summary | Same engine as the sample twins, run on *your* data |
| **Save a signal to your twin** | DTP `twin.flag` with your grant |
| **Export all your data** (decrypted JSON) and **delete your account** | Full deletion of profile, results, check-ins, twin connection and activity log |

### Platform integration
| Feature | Platform |
|---|---|
| Personal twins created and updated per user | DTP `POST/PATCH /twins`, `GET/POST /twins/:id/events` |
| Sample twins via sandbox grants | DTP `GET /grants`, `/provider/twins/:id/events` |
| Concepts for LOINC, RxNorm, SNOMED CT, HPO and FMA | HOLON `/concepts` |
| Age/sex-aware reference ranges | HOLON `/reference-ranges/loinc` |
| Recurring-symptom similarity | HOLON `/phenotype/match` |
| Medication interaction screen | HOLON `/interactions/check-list` |
| What-if trajectories on sample twins (non-medication scenarios only) | DTP simulations |
| Plain-language explanations and free-text symptom mapping (strict JSON, citation + safety checks, template fallback) | Groq `openai/gpt-oss-120b` or Claude |

## Privacy and security

- **Encryption at rest.** Health content (results, notes, check-ins, profile) is encrypted with AES-256-GCM before it's written. The database stores only ciphertext plus ids and timestamps.
- **Minimal data.** No ID numbers or medical-record numbers. The AI provider receives only the evidence, age and sex, never name or email.
- **Consent recorded** with version and timestamp. An audit log of account actions (without health values) is included in the export.
- **Access control.** Every personal route checks a signed session and that the account still exists. Cross-origin writes are refused. Secrets never reach the browser.
- **User control.** Data export and permanent deletion are available in *Account & privacy*.

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
| `ONTOMORPH_API_KEY` | OntoMorph DTP: sample twins and connected personal twins |
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
npm run test:live   # live: OntoMorph sandbox + HOLON + AI
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

## Known platform issue

OntoMorph's production events endpoint currently returns `500 PLATFORM_ENCRYPTION_KEY not configured` for newly created twins. MediTwin handles this: twins are still created, results are kept (encrypted) in MediTwin and synced to the twin automatically once OntoMorph fixes it. Ask the organisers to set that key on their side.

## Before scaling to the public

The product works end to end. For a wide public launch you should also:

- add email verification and password reset (needs an email provider)
- get a legal review of the privacy notice for your jurisdictions (e.g. NDPA, GDPR, HIPAA where relevant)
- have a licensed clinician review the content set in `domain/content.ts`

See [docs/CLINICAL_LAUNCH.md](docs/CLINICAL_LAUNCH.md).

More: [docs/SUBMISSION.md](docs/SUBMISSION.md) · [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) · [PRD.MD](PRD.MD)
