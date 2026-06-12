# Bio-One Social Hub

A franchisee social-media publishing tool for Bio-One. Each franchisee
connects **their own** social accounts, browses a corporate-curated content
library, tweaks the caption for their location, and publishes (now or
scheduled) to Facebook, Instagram, LinkedIn, TikTok, and Pinterest.

Built to the **Bio-One Brand Guidelines V3.0 (July 2023)** — palette,
gradient rules, and Roboto typography are taken directly from the guide.

## Run it

```bash
npm start          # → http://localhost:3000
```

## Deploy it (Render, free tier)

The repo includes `render.yaml`, so you can stand it up on a public URL:

1. Push the code to GitHub (already done on the dev branch).
2. Go to **render.com**, sign up (free), and connect your GitHub.
3. **New → Blueprint**, pick this repo. Render reads `render.yaml` and creates
   the web service. Click **Apply / Deploy**.
4. After a few minutes you get a URL like `https://bio-one-social-hub.onrender.com`.

**Free-tier caveats (by design, not bugs):**
- **Data resets** — no persistent disk, so sign-ups, uploaded designs, and
  scheduled posts are wiped when the service sleeps or redeploys.
- **Sleeps when idle** — first visit after ~15 min wakes it (~30–60s cold
  start). While asleep the scheduler is paused, so scheduled posts only fire
  once someone wakes the app.
- To fix both, upgrade to a paid instance + disk (see the commented block in
  `render.yaml`) and set `DATA_DIR` — a small storage tweak makes data persist.

Publishing stays in **demo mode** until each platform's API is approved.

No dependencies to install — it runs on the Node standard library.

**Demo logins** (password `demo`):
- `modesto@biooneinc.com` — a franchisee
- `corporate@biooneinc.com` — corporate admin (sees the **Admin** tab to manage the library)

## What works today (demo mode)

- ✅ Franchisee login with per-tenant isolation (you only ever see your own
  accounts + history — verified server-side on every request)
- ✅ **Self-serve accounts** — franchisees create their own login (always a
  franchisee role, never admin), with salted scrypt password hashing and a
  full forgot/reset-password flow (reset links are shown in-app in demo
  mode; wire an email provider for production)
- ✅ Connect / disconnect each of the 6 platforms
- ✅ Content library with 8 starter posts, filterable by category
- ✅ **Corporate-managed categories** — corporate adds/renames/deletes the
  categories (Admin tab); renames cascade to existing posts. Franchisees use
  them as a filter in the Content Library
- ✅ Caption editor with live preview + per-platform character-limit warnings
  (e.g. X's 280-char cap)
- ✅ Publish now or schedule
- ✅ **Auto-publishing scheduler** — a background loop checks every 30s and
  actually publishes scheduled posts when their day & time arrive (per-platform
  captions and all). If an account was disconnected in the meantime, that send
  is marked failed and the franchisee is emailed. (Demo: in-process interval;
  production should use a durable job queue / cron. Tune with the
  `SCHEDULER_INTERVAL_MS` env var.)
- ✅ **Multiple images/videos per post** — corporate builds a template with one
  or many media (first = cover); franchisees publish them as a set
- ✅ **Per-platform captions** — one shared caption by default; toggle
  "Customize caption per platform" to tailor each network
- ✅ **Analytics** — per-franchisee activity: published/scheduled counts,
  success vs. failed sends, posts by category and by platform
- ✅ **Failure email notifications** — if a platform fails to publish, the
  franchisee is emailed (demo mode logs to corporate's Notifications panel;
  wire an email provider for real delivery)
- ✅ **Sign-ups list** — corporate sees every franchisee who registered
- ✅ **Calendar** — franchisees see their scheduled (and published) posts on a
  month view, with platform + time on each day; click a scheduled post to
  edit its caption, reschedule it, or cancel it (published posts are
  view-only)
- ✅ **Download a design** — franchisees can save any corporate library design
  to their computer with one click (the ⬇ button on each library card)
- ✅ History feed with per-platform status
- ✅ **Admin section** (corporate accounts only): add / edit / delete library
  posts, upload post images, and choose which platforms each post supports —
  all from the UI, no code changes needed

Publishing is **simulated** in demo mode so the whole experience is usable
before any platform API is approved.

## Architecture

```
server.js              Dependency-free HTTP server + JSON API
lib/auth.js            Login + sessions (swap for real SSO)
lib/store.js           Persistence (swap for Postgres)
lib/providers/*.js     One file per platform — same interface, demo + live
data/library.json      The corporate content library (edit freely)
public/                Front-end (brand.css, index.html, app.js)
```

The provider pattern is the key: each platform implements `connect()` and
`publish()`. Demo mode returns simulated success; going live means filling in
the documented `TODO(live)` in that one file. **Nothing else changes.**

## Taking platforms live

Each platform gatekeeps "post on a user's behalf" behind its own developer
program and review. See the header comment in each `lib/providers/*.js` for
exact scopes and endpoints. Summary:

| Platform | Approval needed | Notes |
|----------|-----------------|-------|
| Facebook | Meta App Review (`pages_manage_posts`) | Posts to Pages |
| Instagram | Meta App Review (`instagram_content_publish`) | Business/Creator acct linked to a FB Page; image required |
| LinkedIn | Community Management API | Company Pages (personal profiles restricted) |
| TikTok | Content Posting API audit | Pre-audit posts go to drafts only |
| Pinterest | Standard access request | Pins require an image |

Set credentials in `config/platforms.env` (see `.example`) and flip
`liveReady: true` in each provider's `meta()` as approval clears.

## Next steps (suggested)

1. Drop in real Canva-exported post graphics from the Bio-One Branding kit.
2. Move `lib/store.js` to Postgres and `lib/auth.js` to your real SSO.
3. Add a scheduler (cron / job queue) to fire scheduled posts.
4. Begin platform approvals — Facebook/Instagram (Meta) is the highest-value
   starting point for most franchisees.
