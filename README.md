# MediTwin AI

MediTwin is a health-context application designed to organize structured health information, symptoms, clinical evidence, and appropriate next-step guidance without diagnosing users.

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

The Next.js app includes same-origin synthetic API routes for the demo flow. Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` only when developing against the Python API.

## Demo Deployment

1. Push this repository to GitHub.
2. Import it in Vercel and set **Root Directory** to `frontend`.
3. Leave `NEXT_PUBLIC_API_BASE_URL` unset to use the Vercel-hosted synthetic API routes.
4. Deploy with `MEDITWIN_APP_MODE=demo` for the synthetic scenario.

Do not add `ONTOMORPH_API_KEY`, `HOLON_API_KEY`, or LLM credentials to browser-visible `NEXT_PUBLIC_*` variables.

## Clinical Mode

Set `MEDITWIN_APP_MODE=clinical` only in a controlled production environment. The app then fails closed: it does not load synthetic records and displays an activation screen until the server-side clinical configuration is complete.

Clinical mode is not a production clearance. Review [docs/CLINICAL_LAUNCH.md](docs/CLINICAL_LAUNCH.md) before collecting or processing any real health information.

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

In demo mode the API returns synthetic data. The anatomy route explicitly reports unavailable because an OntoMorph visualization has not been configured.

## Integration Boundary

Keep external credentials server-side in `.env`; it is ignored by Git. Start from `.env.example` for variable names. The current UI intentionally does not claim that OntoMorph or HOLON is connected. Before enabling a live connection, add authenticated server-side adapters, a production data model, consent, authorization, source provenance, and graceful external-service error handling.