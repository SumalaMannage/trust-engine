# Trust Engine web

Next.js frontend for Trust Engine. It builds to a static export in `web/out/`, which the FastAPI backend serves at `/` (see `mount_web` in `app/main.py`) and `Dockerfile.web` bundles into one container.

## Run locally

```bash
# backend (repo root), with CORS open for the dev server
ALLOWED_ORIGINS=http://localhost:3000 uvicorn app.main:app --reload --port 8000

# frontend
cd web
cp .env.example .env.local
npm install
npm run dev        # http://localhost:3000
```

## Build

```bash
npm run build      # writes web/out
```

Then start the backend from the repo root and open http://localhost:8000 to see the built site served by FastAPI.

## Static export rules

- No API routes, server actions, middleware or `next/image` optimization.
- Pages that call the API are Client Components (`"use client"`).
- No dynamic routes like `/result/[id]`; keep results in client state.
- Don't use paths the API owns: `/v1/*`, `/health`, `/healthz`, `/docs`, `/openapi.json`.
- Keep `trailingSlash: true` in `next.config.ts` so reloading `/check` works.

## Structure

```
src/
  app/                  routes: / (Check), /result/, /records/
  styles/tokens.css     design tokens (colors, type, spacing, radius)
  components/
    ui/                 Button, fields, DirectionToggle, Tag, Banner, Card/InfoCard, Disclosure
    result/             VerdictCard, EvidenceCard, ActionsList, ImageReadCard, SourceThread
    profile/            SupplierCard
    layout/             AppHeader, PageIntro, PageFooter
  features/
    check/              CheckScreen (thread builder, checking, recovery), ItemCard, CheckStates
    result/             ResultView
    records/            RecordsView
  lib/
    api/                types (mirror app/schemas.py) and fetch client with error mapping
    thread.ts           ordered thread items -> API request, validation, source summary
    session.ts          last result (sessionStorage) and in-memory thread
    image.ts            HEIC/type/size checks, resize, base64
    labels.ts           owner-facing words for API values
    examples.ts         demo scenarios matching data/profile_demo_bakery.json
```

The verdict always comes from the backend. The UI never computes or changes it.

`npm run build` also runs `scripts/flatten-segments.mjs`, which works around a Next 16.4 static-export
naming mismatch for prefetch files (otherwise every link prefetch 404s behind FastAPI).
