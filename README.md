# Travel

A barebones, self-hosted travel app: itineraries, booking tracking, and trip
budgets — without paying for the 80% of a full travel planner you never use.

Stack: React 19 + TypeScript + Vite + Tailwind 3 frontend, Python FastAPI
backend, Supabase (shared with the budget app — all tables prefixed
`travel_`). Deployed on AWS Lambda behind a Function URL with the frontend on
S3 + CloudFront — ~$0/month, no background workers, manual refresh only.

## V1 scope

- **Itinerary + booking tracking** — flights (confirmation, ticket number,
  seat, bags, cancellation/change deadline, points cost + currency, cash paid,
  whose loyalty account, cents-per-point), hotels (room type, free-night
  certs, resort fees, cancellation deadline), events.
- **Dual-timezone month calendar** — every timestamp shown in both the trip's
  destination timezone and home time (PST, `America/Los_Angeles`), with
  prev/next month navigation and multi-month trips as spanning bars.
- **Daily plan** — day-by-day timeline of bookings/events in time order, with
  emoji category labels (✈️ flight, 🍽️ food, 🏨 hotel, 🎉 fun, 🚗 transport,
  📌 other).
- **Trip budget with daily pacing** — set a trip budget, add manual expenses,
  daily allowance = (budget − flights/hotels fixed costs) ÷ trip days, with
  per-day spent vs. allowance over/under indicators.
- **Email import** (Delta-first) — booking confirmation emails get parsed into
  draft bookings for review (see below).

Out of scope for v1: points/credits optimization, itinerary auto-planning,
sharing, offline sync, push notifications.

## Email import design

There is no Gmail integration in the service itself — Gmail reading is done
by your agent (its Gmail skill), not by this backend. The flow:

1. **Trigger** — either the agent's daily cron scans for new travel booking
   emails, or you manually trigger it: just tell your agent "check email"
   right after booking (booking confirmation email arrives → agent parses +
   drafts immediately, live in the conversation).
2. **Parser endpoint** — the agent hands the raw email to the backend:
   `POST /refresh` with `{subject, from, body_text, body_html?}`. The
   backend runs the Delta-first parser (in `api/parser.py`) and responds
   `{status: "parsed" | "needs_review", booking_draft: {...},
   missing_fields: [...]}`.
3. **Review queue** — parsed emails land in `travel_import_queue` as drafts.
   The agent tells you what's missing; you fill in the personal bits (whose
   loyalty account, card used, points/cash split) in the app and confirm or
   discard. Parsing is never perfect — the review step is permanent.
4. Manual add-flight / add-hotel / add-event forms remain as the fallback.

The service never touches your inbox; it only accepts raw email content in
the request body.

## Architecture

```
web (React SPA, S3 + CloudFront)
  │  VITE_BACKEND_URL — Lambda Function URL
  │  Authorization: Bearer <Supabase JWT> on every data call
  ▼
api (FastAPI + Mangum, Lambda container image, arm64)
  │  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — service-role bypasses RLS
  ▼
Supabase (shared project with the budget app; tables prefixed travel_)
```

- **Lambda ~$0**: manual refresh only — no scheduler, no webhooks, no
  background email digest. The API runs only when called. Deploys are a
  container image push to ECR + Lambda code update.
- **Auth**: the Function URL uses auth type NONE (browsers can't sign AWS
  requests); the app does its own auth — every data endpoint requires the
  Supabase JWT, `GET /health` is the only public endpoint.
- **Migrations** live in `supabase/` at the repo root (one-time
  `supabase link` + `supabase db push` from here).

## Local dev

Prereqs: Node 20+, Python 3.12, a Supabase Cloud dev project with the
migrations pushed (see `deploy/SETUP.md` step 8 for the shape of it).

```bash
# 1. From the repo root: supabase link --project-ref <dev-ref> && supabase db push
# 2. Copy api/.env.example to api/.env and fill in the Supabase keys
# 3. Run once: npm install inside web/
# 4. Then:
./scripts/local-dev.sh
```

That starts the backend on `http://localhost:8001` (`uvicorn api:app` from
`api/`) and the web app on `http://localhost:5174` with
`VITE_BACKEND_URL=http://localhost:8001`. Ctrl-C stops both. No Docker.

## Deploy

One-time AWS console steps (ECR, Lambda, Function URL, S3, CloudFront, IAM,
Supabase keys): [`deploy/SETUP.md`](deploy/SETUP.md).

Every deploy after that:

```bash
S3_BUCKET=<bucket> CLOUDFRONT_DIST_ID=<dist-id> \
VITE_SUPABASE_URL=https://<ref>.supabase.co \
VITE_SUPABASE_ANON_KEY=<anon-key> \
./deploy/deploy.sh
```

Pipeline: build `linux/arm64` image → push to ECR (`travel-api`) → update
Lambda (`travel-api`) → read Function URL → build web with the URL baked in →
`s3 sync` → CloudFront invalidation.

## Phone delivery (iOS "Add to Home Screen")

No native wrapper in v1 — the phone app is the web app added to the home
screen as a PWA in **standalone** display mode (vite-plugin-pwa manifest:
name "Travel", short_name "Travel", display "standalone").

To be home-screen-ready, `web/` must include:

- `index.html` head: `<meta name="apple-mobile-web-app-capable"
  content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style"
  content="black-translucent">`, `<meta name="mobile-web-app-capable"
  content="yes">`, a `<meta name="theme-color">`, an
  `<meta name="viewport">` with `viewport-fit=cover`, and
  `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`.
- Real PNG icons in `web/public/icons/`: `apple-touch-icon.png` (180×180),
  `icon-192.png`, `icon-512.png` (plus maskable variants if easy). The
  placeholders shipping with v1 are solid brand color with a ✈️ glyph —
  **replace them with real artwork before any public use.**
- Safe-area CSS: the app shell pads with `env(safe-area-inset-*)` so content
  isn't hidden under the notch / home indicator when launched from the
  home screen.

Since the phone loads the live CloudFront URL, web deployments appear
instantly — there is nothing to rebuild for phone delivery.

## Repo layout

```
api/            FastAPI service (lambda_handler.py, api.py, parser.py, pacing.py)
web/            React 19 + Vite + Tailwind frontend
supabase/      migrations (all tables prefixed travel_)
deploy/        deploy.sh + SETUP.md (one-time AWS setup)
scripts/       local-dev.sh (uvicorn + vite, no Docker)
```
