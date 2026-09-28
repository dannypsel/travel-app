# Travel web

React 19 + TypeScript + Vite + Tailwind 3 frontend for the Travel app.

## Screens

1. **Calendar** — month calendar with prev/next navigation; multi-month trips render as bars spanning month boundaries; every timestamp shown in both the trip's destination timezone and home `America/Los_Angeles`.
2. **Timeline** — pick a trip → day-by-day timeline of bookings/events in time order.
3. **Daily plan** — one day's bookings/events with emoji category labels (✈️ 🍽️ 🏨 🎉 🚗 📌).
4. **Bookings** — bookings board with full fields + Add flight / Add hotel / Add event forms. Cents-per-point is displayed but visually deprioritized at the bottom of flight details.
5. **Budget** — set trip budget, add manual expenses, daily pacing: daily allowance = (budget − flights/hotels fixed costs) ÷ days, with per-day spent vs allowance and over/under indicators.

No react-router — single page with tab navigation. All data goes through the backend at `VITE_BACKEND_URL` with the Supabase JWT in the `Authorization` header; the frontend never touches Supabase tables directly (Supabase JS is used for auth only).

## App icons

`public/icons/` contains simple generated placeholders (brand-blue square + ✈ glyph): `apple-touch-icon.png` (180×180), `icon-192.png`, `icon-512.png`, plus maskable variants. Replace with real artwork before shipping.

## Local dev

```sh
npm install
npm run dev
```

Needs `.env` (copy `.env.example`) with `VITE_BACKEND_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and the backend running on port 8001 (see `scripts/local-dev.sh`).
