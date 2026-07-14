# Bombay Rent

Crowdsourced map of **actual rents paid** across Mumbai & Navi Mumbai — anonymous, free, no brokers. Inspired by the concept behind bengaluru.rent (independent implementation).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase keys configured the app runs in **demo mode**: the map shows generated sample pins and anything you add is kept in your browser's localStorage.

## Go live (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the contents of `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local` and fill in the URL + anon key from **Project Settings → API**.
4. Restart `npm run dev` — the demo badge disappears and pins are shared by everyone.

## How it works

- **Map**: MapLibre GL with free OpenStreetMap tiles (no API key, $0).
- **Privacy**: coordinates are rounded to ~100 m before saving; no account, no name, no phone number for rent pins.
- **Stats**: the side panel computes median rent/deposit per BHK for pins in the current viewport.
- **Demo vs live**: `lib/data.ts` switches automatically based on env vars.

## Matching (Phase 2)

- **List my flat** / **Find a flat** buttons (or just click the map). Contacts are write-only through the anon API — RLS has no select policy, so they can never be read from the browser.
- **Instant match preview**: seekers immediately see anonymized matching flats within 2.5 km (orange dots) via the `match_preview` security-definer RPC. The original bengaluru.rent only emails next day.
- **Daily matcher**: `GET /api/match` (Vercel cron, 9:00 IST) calls `find_new_matches()` with the service role key, notifies both sides of each other's contact (email via SES/Resend + optional SMS via SNS — see Notifications below), and delivers the 1-km area alerts. Set `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and the notification env vars from `.env.example`.
- **Moderation**: the 🚩 flag button on any pin or To-Let spot calls the `report_pin` / `report_tolet` RPC; 3 reports auto-hide it (one flag per browser).
- **Trains & Metro overlay**: real OSM geometry for Western / Central / Harbour / Trans-Harbour / Vasai–Diva / Nerul–Uran lines + all Metro lines and 178 stations (`public/data/*.geojson`).

## Roadmap

- [x] Phase 1 — rent transparency map
- [x] Phase 2 — listings + seekers + instant match preview + daily match emails
- [x] Local train line overlays (Western / Central / Harbour / Trans-Harbour + Metro)
- [x] Report-pin moderation (3 reports auto-hides)
- [x] To-Let board photo uploads + Superheroes board
- [x] Pin detail card: ratings, comments, 1-km "flat opened" email alerts
- [x] SMS + SES notifications (see below)
- [ ] Rent outlier flagging (3× area median, per bengaluru.rent's approach)
- [ ] SEO locality pages ("2BHK rent in Andheri West")
- [ ] Green cover overlay (Sentinel-2)

## Abuse protection

The anon key is **read-only** (schema v4). Every write — pins, listings,
seekers, To-Let spots, ratings, comments, alerts, reports — goes through
`POST /api/submit`, which:

1. **Rate-limits per IP** via the `consume_rate_limit` RPC (e.g. 5 pins/hour,
   30 ratings/hour; limits live in `app/api/submit/route.ts`). IPs are stored
   as salted hashes and log rows are purged after 24h by the daily cron.
2. **Verifies Cloudflare Turnstile** on the four submission forms when
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` are set (free at
   dash.cloudflare.com → Turnstile). Without keys the captcha is skipped and
   rate limits alone apply.
3. Whitelists columns per write type, and only accepts To-Let photo URLs from
   our own storage bucket (which itself enforces ≤2MB JPEG).

This means live mode now **requires `SUPABASE_SERVICE_ROLE_KEY`** in
`.env.local` / Vercel — without it, reads work but submissions fail with a
clear error.

## Notifications (email + SMS)

`GET /api/match` sends every notification through `lib/notify.ts`:

- **Email** — AWS **SES** when `AWS_REGION` + `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`
  are set (sender in `MATCH_FROM_EMAIL` must be a verified SES identity, and the
  account must be out of the SES sandbox to email arbitrary addresses).
  Falls back to **Resend** (`RESEND_API_KEY`) when AWS isn't configured.
- **SMS** — AWS **SNS**, only when `SMS_ENABLED=true` *and* AWS creds are set.
  10-digit numbers are normalized to `+91…`. **India caveat:** delivering SMS to
  Indian numbers legally requires DLT registration (register on a telecom DLT
  portal, then configure the Entity ID / Template IDs and sender ID in SNS →
  Text messaging preferences). Until that's done, expect deliveries to Indian
  numbers to be blocked by carriers. Also check the default SNS spend limit
  ($1/month) in the SNS console.

Matches SMS both sides their counterpart's contact; the 1-km area alerts are
email-only (we only collect an email for those).

## Deploy

Push to GitHub and import into [Vercel](https://vercel.com) — copy the env vars
from `.env.example` into the Vercel project settings (the two `NEXT_PUBLIC_*`
ones are the minimum; add the server-side ones for matching + notifications).
Free tier is plenty to start.
