# VidiSprint — AI short-form video studio

Turn one idea into a scripted, voiced, captioned and published video for TikTok, Instagram Reels and YouTube Shorts.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind · Framer Motion · Radix primitives · Prisma + PostgreSQL (Supabase) · NextAuth v5 · Stripe · Anthropic Claude · ElevenLabs · Remotion.

## Features

| Module | What it does |
|---|---|
| **Auth & workspaces** | Email/password + Google sign-in, per-user brand workspace with colors, fonts, caption preset, default voice, watermark, tone-of-voice. |
| **AI script generator** | Topic / niche / URL → hook, 3 alternative hooks, scenes with b-roll queries and on-screen text, CTA, hashtags, calibrated virality / hook / retention / clarity scores. Structured output via Claude. |
| **Voiceover engine** | 12 curated ElevenLabs voices with word-level timestamps, audition any line, stability/speed controls, background music library with ducking. Offline fallback keeps the pipeline testable without keys. |
| **Studio** | Real-time Remotion preview, timeline with scene blocks and playhead, inline script editing (versioned), 6 kinetic caption systems with full styling, b-roll upload with Ken Burns motion, animated backgrounds. Debounced autosave. |
| **Render queue** | DB-backed job queue with atomic claiming, retries, stale-lock recovery, live progress steps. Local `@remotion/renderer` worker or Remotion Lambda. S3-compatible or local storage. |
| **Publishing hub** | OAuth for TikTok (Content Posting API), YouTube (resumable upload), Instagram (Reels container). Post now or schedule; processed by the worker. Tokens encrypted at rest (AES-256-GCM). |
| **Billing** | Stripe subscriptions (Creator / Pro / Agency, monthly or yearly) + one-time credit packs. Idempotent webhooks, monthly credit refills, atomic credit ledger with automatic refunds on failure. Plan gates: watermark, resolution, premium voices, scheduling, account limits. |

## Quick start (local)

```bash
cp .env.example .env          # fill in at least DATABASE_URL, DIRECT_URL, AUTH_SECRET
npm install
npm run db:push               # sync tables for local iteration (or `db:deploy` to apply the committed migration)
npm run db:seed               # optional demo account: demo@vidisprint.com / demo1234
npm run dev                   # http://localhost:3000
npm run worker                # in a second terminal: renders + scheduled posts
```

## Deploying (Vercel + Supabase)

1. **Supabase** — new project → Project Settings → Database → copy the *Transaction pooler* string into `DATABASE_URL` and the *Session/direct* string into `DIRECT_URL`. Optionally create a public Storage bucket and grab its S3-compatible credentials (Storage → S3 Connection) for `S3_*`.
2. **Vercel** — import this repo, set the environment variables from `.env.example` in Project Settings → Environment Variables (`AUTH_SECRET`, `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY` — generate each with `openssl rand -base64 32` / `openssl rand -hex 32`). `npm run build` runs `prisma migrate deploy` automatically, so the committed migration in `prisma/migrations/` applies on first deploy.
3. **Rendering** — the committed `vercel.json` cron (`/api/jobs/process`, once daily — Vercel's free Hobby plan caps crons at one run/day) is only a safety-net trigger, not the real render path. Vercel's serverless functions cannot host the always-on Chromium process Remotion needs. Two options:
   - Run `npm run worker` on a separate always-on host (Railway, Render, Fly.io, a small VPS) pointed at the same `DATABASE_URL`/`STORAGE_DRIVER=s3`.
   - Or set `RENDER_ENGINE=lambda` and deploy a Remotion Lambda function (`npx remotion lambda functions deploy`, `npx remotion lambda sites create src/remotion/index.ts`) so rendering happens on AWS instead.
   Without either, render jobs stay queued forever — everything else (auth, scripts, editor) still works.
4. **Storage** — set `STORAGE_DRIVER=s3` in production; the local disk driver doesn't persist across serverless deploys.

Everything boots without third-party keys. Modules show a "not configured" state until you add them:

| Variable | Enables |
|---|---|
| `ANTHROPIC_API_KEY` | AI script generation (`claude-opus-5` by default) |
| `ELEVENLABS_API_KEY` | Real voiceovers with word-level alignment (otherwise a silent placeholder with estimated timing is produced) |
| `PEXELS_API_KEY` | One-click b-roll: portrait stock clips matched to each scene's AI-suggested query (manual upload still works without it) |
| `PIXABAY_API_KEY` | Second, independent stock catalog merged into every search — optional, fills gaps Pexels leaves empty on narrow subjects |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | Checkout, portal, subscriptions, credit packs |
| `TIKTOK_*`, `YOUTUBE_*`, `INSTAGRAM_*` | Social account connection and publishing |
| `STORAGE_DRIVER=s3` + `S3_*` | Cloud storage for audio/video (defaults to `./storage`, served through `/api/files`) |
| `RENDER_ENGINE=lambda` + `REMOTION_*` | Remotion Lambda instead of the local worker |
| `REMOTION_BROWSER_EXECUTABLE` | Reuse an installed `chrome-headless-shell` for local renders instead of letting Remotion download one |

## Architecture

```
src/
  app/
    (marketing)/          landing page
    (auth)/               sign-in, sign-up
    (app)/                dashboard, projects, scripts, voices, studio/[id], exports, brand, billing, settings
    api/
      auth/[...nextauth]  NextAuth handlers
      stripe/webhook      Stripe events (idempotent via StripeEvent table)
      jobs/process        cron entry: one render + due posts (Bearer CRON_SECRET)
      renders/[id]        progress polling
      social/[platform]/  OAuth connect + callback
      voice/preview       free voice audition
      assets/upload       b-roll / logo upload
      projects/[id]/captions  SRT export
  lib/
    ai/script-generator   Claude structured output + heuristic rescoring
    tts/                  ElevenLabs + offline fallback, voice catalog
    captions/             char→word alignment, pagination, SRT, presets
    render/               composition props, queue, engines (local/lambda), worker tick
    publish/              OAuth flows, platform publishers, scheduler
    credits.ts            atomic ledger (charge / grant / reset / refund)
    plans.ts              plan matrix, credit costs
    stripe.ts             checkout, portal, price mapping
  remotion/               ShortVideo composition: background, layers, kinetic captions, on-screen text, watermark
  server/actions/         server actions (typed ActionResult, credit-safe)
  components/             UI primitives, layout, feature components
scripts/worker.ts         long-running render + publish worker
prisma/schema.prisma      users, workspaces, projects, scripts, voiceovers, assets, render jobs, social accounts, publish jobs, credit ledger
```

### Credit flow
Every billable action charges **before** the work runs (conditional `UPDATE … WHERE credits >= amount`, so concurrent requests can't overdraw) and **refunds** automatically if the upstream call or render fails. Scripts cost 1, voiceovers 2 per 30 s, renders 8 / 12 / 24 for 720p / 1080p / 4K.

### Rendering
`enqueueRender` snapshots the full composition props into `RenderJob.inputProps`. Workers claim jobs atomically, bundle the Remotion project once per process, render with headless Chromium, upload the MP4 + thumbnail, and mark the job complete. Progress is streamed to the studio via `/api/renders/[id]`.

- **Local worker:** `npm run worker` (any Node host with Chromium — Remotion installs it on first run).
- **Serverless:** point a cron at `/api/jobs/process` (see `vercel.json`) — suited for light volume.
- **Scale:** `RENDER_ENGINE=lambda` after `npx remotion lambda functions deploy` and `npx remotion lambda sites create src/remotion/index.ts`.

### Stripe setup
1. Create products/prices for Creator, Pro, Agency (monthly + yearly) and three one-time credit packs; paste the price ids into `.env`.
2. `stripe listen --forward-to localhost:3000/api/stripe/webhook` for local testing; in production add the endpoint with events `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run worker` | Render + publish worker |
| `npm run db:push` / `db:migrate` / `db:deploy` / `db:studio` | Prisma |
| `npm run db:seed` | Demo data |
| `npm run remotion:studio` | Open the composition in Remotion Studio |
| `npm run typecheck` / `lint` | Quality gates |
