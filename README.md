# MediTwin

**Understand your health. See your body differently.**

MediTwin is a personal health-context layer built on the OntoMorph platform. It reads a patient's **OntoMorph digital twin**, resolves every record through **HOLON** clinical knowledge, runs a **deterministic signal engine**, shows the affected anatomy in **3D**, and explains the result in plain language with **every sentence citing its evidence** (AI via Groq or Claude). It ends with reviewed care guidance.

It follows one principle from the PRD:

> Data → clinical context → health signal → explanation → appropriate next step, not symptoms → AI diagnosis.

MediTwin does not diagnose, prescribe, or replace a healthcare professional. The demo uses synthetic OntoMorph sandbox twins only.

## What it does

| | Feature | Platform |
|---|---|---|
| 🧬 | Loads live synthetic twins (5 personas) with grant-token auth | DTP `GET /grants`, `GET /provider/twins/:id/events` |
| 📚 | Resolves LOINC, RxNorm, SNOMED CT, HPO and FMA codes to concepts | HOLON `/concepts` |
| 📏 | Compares every measurement with an age/sex-aware reference range, with approved unit conversion (e.g. 6.1 mmol/L → 109.9 mg/dL) | HOLON `/reference-ranges/loinc` |
| ⚖️ | Deterministic signal engine: named rules (`SIG-ATT-01`, `RF-CHEST-01`, …), symptom→measurement relevance, trends, red flags | MediTwin |
| 🔁 | Detects recurring symptoms by comparing today's report with symptoms already in the twin | HOLON `/phenotype/match` |
| 🫀 | 3D anatomy: only FMA structures verified live in HOLON light up | HOLON FMA + react-three-fiber |
| ✍️ | Plain-language explanation. An LLM (Groq `openai/gpt-oss-120b` by default, or Claude) writes it from structured evidence with strict JSON output; uncited paragraphs are dropped, a safety layer blocks diagnoses, medication instructions and false reassurance, and a reviewed template is used on any failure | Groq / Claude (optional) |
| 🚑 | Red-flag symptoms bypass the AI and go straight to reviewed emergency guidance | MediTwin content set |
| 📈 | What-if projection on the twin's own results (non-medication scenarios only) | DTP `twin.simulate` |
| 💊 | Medication check: RxNorm label/code strength mismatch plus HOLON interaction screen | HOLON `/interactions/check-list` |
| ✍️→🧬 | Write the signal back onto the twin as a clinical note, recomputed server-side and de-duplicated per day | DTP `twin.flag` |
| 🗒️ | Printable visit summary for the next appointment | MediTwin |
| 🔍 | Integration trace: every DTP/HOLON/AI call and engine step, with latency | MediTwin |
| 🎬 | Guided 7-step demo that follows PRD §43 and narrates from live data | MediTwin |

## Run locally

Requires Node 20+ (tested on 24).

```powershell
Set-Location frontend
Copy-Item ..\.env.example .env.local   # then fill in ONTOMORPH_API_KEY and HOLON_API_KEY
npm install
npm run dev
```

Open <http://localhost:3000> and click **Explore Demo Twin → Start guided demo**.

`GROQ_API_KEY` (or `ANTHROPIC_API_KEY`, which takes priority) is optional. Without one, explanations come from the reviewed templates and free-text symptoms are keyword-matched. The UI labels which path produced each explanation, and falls back to the template on any AI failure, including rate limits.

## Checks

```powershell
Set-Location frontend
npm run typecheck      # Next route types + tsc
npm run lint
npm test               # 55 unit tests: engine, normalization, safety ("AI tests" from PRD §48)
npm run test:live      # live integration tests against OntoMorph DTP sandbox + HOLON (needs keys)
npm run build
```

## Deploy (Vercel)

1. Import the repository and set **Root Directory** to `frontend`.
2. Add server-side environment variables: `ONTOMORPH_API_KEY`, `HOLON_API_KEY`, optionally `GROQ_API_KEY` (or `ANTHROPIC_API_KEY`), and `MEDITWIN_APP_MODE=demo`.
3. Optionally add `DATABASE_URL`, `TURSO_AUTH_TOKEN` and `LOCAL_AUTH_SESSION_SECRET` to enable demo accounts. The demo itself has no registration wall.

Never put any key in a `NEXT_PUBLIC_*` variable. The browser only talks to MediTwin's own `/api/*` routes.

## Architecture

```
Browser (Next.js client)
   │  /api/twins, /api/twins/:id, /analyze, /simulate, /flag, /api/symptoms/interpret
   ▼
Next.js route handlers ── src/server/http.ts      clinical-mode gate, validation, PRD error wording
   │
   ├─ src/server/twin-service.ts                  orchestration + per-request Trace
   │     ├─ ontomorph/dtp.ts    grants · events · simulate · flag   (X-DTP-API-Key + grant bearer)
   │     ├─ ontomorph/holon.ts  concepts · ranges · phenotype · interactions (cached 12 h)
   │     └─ ai.ts               Groq or Claude: schema-constrained JSON → citation check → safety check
   │
   └─ src/domain/  (pure, framework-free, unit-tested)
         content.ts       reviewed content set: symptoms, LOINC map, anatomy map, red flags, guidance
         normalize.ts     DTP event → measurements, concepts, timeline; range comparison
         signals.ts       deterministic signal engine + guidance selection
         safety.ts        FR-016 safety rules
         explanations.ts  reviewed-template explanations
```

The published `@ontomorph/dtp-sdk` package currently ships without its compiled source, so `dtp.ts` and `holon.ts` are small typed clients that mirror the SDKs' documented routes, headers and `{ data }` envelopes.

### Honesty boundaries

- **No invented data.** If the twin can't be reached, MediTwin says so and shows nothing in its place. If HOLON has no range, the UI says "No HOLON reference" rather than using a hard-coded one.
- **Anatomy.** The OntoMorph sandbox returns no 3D asset (`animation: null`), so the body is a schematic rendered by MediTwin and labelled as such. Which structures light up comes only from FMA concepts that HOLON verified.
- **Personas.** Sandbox twins carry no demographics. Names, ages and sex are demo labels added by MediTwin, used only for age/sex-aware range lookups.

## PRD Phase 1 acceptance test

| PRD check | Where |
|---|---|
| Demo patient loads, no registration wall | Landing → Explore Demo Twin |
| OntoMorph authentication, twin, systems, events | `dtp.ts`, Overview, Timeline |
| HOLON concept resolution + reference ranges | Measurement drawer, `holon.ts` |
| Timeline renders | Health timeline |
| Symptoms entered and normalized (SNOMED CT + HPO, original wording kept) | Symptom check |
| Deterministic structured signal | `signals.ts`, `tests/domain.test.ts` |
| Anatomy mapping (FMA, verified) + 3D display | Overview, Health context |
| Explanation generated from retrieved evidence, no diagnosis | `ai.ts`, `explanations.ts`, `safety.ts` |
| Care guidance from reviewed content | `content.ts` → Health context |
| API errors handled | `http.ts`, PRD-worded messages, "Try again" |
| No secrets reach the frontend | `server-only` modules, no `NEXT_PUBLIC_` keys |
| Completes without developer intervention | Guided demo |

## Clinical mode

`MEDITWIN_APP_MODE=clinical` fails closed: no sandbox data is served and an activation screen is shown until production identity, storage, integrations and a clinically approved content set are configured. It is a safety gate, not a clearance. Read [docs/CLINICAL_LAUNCH.md](docs/CLINICAL_LAUNCH.md).

More: [docs/SUBMISSION.md](docs/SUBMISSION.md) (hackathon description) · [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) (3-minute video script) · [PRD.MD](PRD.MD)
