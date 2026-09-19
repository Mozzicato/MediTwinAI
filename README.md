# MediTwin AI

Phase 1 web prototype for a synthetic health twin. The current scenario is David, a synthetic 28-year-old patient with a fasting glucose result above its demo reference range and structured symptom context.

MediTwin does not diagnose, prescribe, or replace a healthcare professional.

## Run locally

Start the API in one terminal:

```powershell
$env:PYTHONPATH = "$PWD\backend"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Start the frontend in a second terminal:

```powershell
Set-Location frontend
npm.cmd run dev -- --port 3000
```

Open `http://localhost:3000`.

The Next.js app also includes same-origin synthetic API routes for the complete demo flow, so it runs by itself without FastAPI. Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` only when developing against the Python API.

## Deploy To Vercel

1. Push this repository to GitHub.
2. Import it in Vercel and set **Root Directory** to `frontend`.
3. Leave `NEXT_PUBLIC_API_BASE_URL` unset to use the Vercel-hosted synthetic API routes.
4. Deploy. The app has no required environment variables for the synthetic prototype.

Do not add `ONTOMORPH_API_KEY`, `HOLON_API_KEY`, or LLM credentials to browser-visible `NEXT_PUBLIC_*` variables.

## Validation

```powershell
Set-Location frontend
npm.cmd run build

$env:PYTHONPATH = "$PWD\backend"
python -m unittest discover -s "$PWD\backend\tests" -p "test_*.py"
```

## Current API

- `GET /api/demo/patient`
- `GET /api/twin`, `/api/twin/systems`, `/api/twin/events`
- `GET /api/health-events/{event_id}`
- `POST /api/symptoms`
- `GET /api/signals`, `POST /api/signals/analyze`
- `POST /api/explanations`
- `GET /api/anatomy/{system}`

The API returns synthetic demo data. The anatomy route explicitly reports unavailable because an OntoMorph visualization has not been configured.

## Integration Boundary

Keep external credentials server-side in `.env`; it is ignored by Git. Start from `.env.example` for variable names. The current UI intentionally does not claim that OntoMorph or HOLON is connected. Before enabling a live connection, add server-side adapters that authenticate with the documented API, normalize returned data, preserve source provenance, and return graceful errors for unavailable services.