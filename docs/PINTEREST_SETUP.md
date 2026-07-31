# Pinterest — Click-by-Click Setup (create Pins, API v5)

Goal: create the Pinterest developer app and get the **App ID** + **App Secret**
so each franchisee can connect their own Pinterest account and publish Pins.

---

## Phase 0 — Prerequisites
- A **Pinterest business account** for you (convert a personal account free at
  pinterest.com → Settings → "Convert to business," or create a new one).
- Each franchisee needs their own Pinterest account with at least one **board**
  (Pins are saved to a board).

## Phase 1 — Create the app
1. Go to **developers.pinterest.com** → log in → **My apps** → **Create app**
   (a.k.a. "Connect app").
2. Fill in app name (`Bio-One Social Hub`), description, and the required URLs:
   - **Privacy policy:** `https://bio-one-social-hub.onrender.com/privacy.html`
   - **Terms:** `https://bio-one-social-hub.onrender.com/terms.html`

## Phase 2 — Redirect URI + scopes
1. In the app settings → **Redirect URIs**, add:
   `https://bio-one-social-hub.onrender.com/oauth/pinterest/callback`
2. Scopes the app uses: `boards:read`, `pins:read`, `pins:write`,
   `user_accounts:read`.

## Phase 3 — Grab credentials
From the app page copy:
- **App ID**
- **App secret**

## Phase 4 — Access tiers
- New apps start with **Trial access** — enough to connect your own account and
  test publishing immediately.
- To roll out to all franchisees, request **Standard access** (production) from
  the app dashboard. Pinterest reviews it (lighter than Meta/TikTok). Use case:
  *"Franchise marketing tool — franchisees publish approved marketing images to
  their own Pinterest boards."*

## Phase 5 — Go live in the app
Add in **Render → Environment**:
- `PINTEREST_APP_ID`
- `PINTEREST_APP_SECRET`

Bump `REDEPLOY` and deploy. Pinterest flips from demo to real: franchisees
click Connect → approve → the app uses their first board → they publish/schedule
Pins like the other platforms.

## Notes
- **Pins require an image** — text/video-only posts aren't supported by
  Pinterest. Franchisees should publish image posts to Pinterest.
- The app currently pins to the franchisee's **first board**. If you want a
  board picker later, ask Claude — it's a small add.
- **Deleting** a Pin from the app removes it from Pinterest too.
