# TikTok — Click-by-Click Setup (Content Posting API)

Goal: create the TikTok developer app and get the **Client Key** + **Client
Secret** so each franchisee can connect their own TikTok account and publish
from Bio-One Social Hub.

> ⚠️ Two TikTok-specific things to know up front:
> 1. **Domain verification is required** to publish media by URL — you host a
>    small file we provide (or Claude adds a route).
> 2. **Until TikTok audits your app**, posts publish as **PRIVATE** (visible
>    only to the account owner). Public posting unlocks after the audit. The
>    app handles this automatically and tells the user when a post went out
>    private.

---

## Phase 0 — Prerequisites
- A TikTok account for you (app owner).
- Each franchisee needs their own TikTok account (any type works to connect;
  a Business account is recommended).

## Phase 1 — Create the app
1. Go to **developers.tiktok.com** → **Manage apps** → **Connect an app**
   (sign in / register as a developer first; may require email + org info).
2. Give it a name (`Bio-One Social Hub`), description, and app icon (Bio-One logo).

## Phase 2 — Add the Content Posting API + Login Kit
1. In the app, **Add products**:
   - **Login Kit** (for the connect/OAuth flow)
   - **Content Posting API** (for publishing)
2. Under **Content Posting API**, enable **"Direct Post."**

## Phase 3 — Redirect URI + scopes
1. In **Login Kit** settings → **Redirect URI**, add:
   `https://bio-one-social-hub.onrender.com/oauth/tiktok/callback`
2. Make sure these **scopes** are requested/enabled:
   `user.info.basic`, `video.publish`, `video.upload`

## Phase 4 — Verify your domain (needed for publishing by URL)
1. In the app settings → **URL properties / Domain verification**, add
   `bio-one-social-hub.onrender.com`.
2. TikTok gives you a **verification method** — usually a **TXT record** or a
   **file to host**. If it's a file, send it to Claude and I'll add a route so
   `https://bio-one-social-hub.onrender.com/<file>` serves it. If it's a TXT
   DNS record, that only works once you're on a custom domain you control.
   *(Tell me which method TikTok shows and I'll handle our side.)*

## Phase 5 — Grab credentials
From the app's **Basic information** / **Credentials**:
- **Client Key**
- **Client Secret**

## Phase 6 — Submit for audit (unlocks public posting)
1. Complete the app's review/audit submission (use case: *"Franchise marketing
   tool — franchisees publish approved marketing videos/images to their own
   TikTok accounts."*).
2. Provide the test login + a screencast (same as Meta): sign in → connect
   TikTok → publish.

## Phase 7 — Go live in the app
Add in **Render → Environment**:
- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`

Then bump `REDEPLOY` and deploy. TikTok flips from demo to real. Even before
the audit finishes you can test: posts will publish **privately** to the
connected account, and the app will note that until the audit clears.

## Notes
- **Tokens:** TikTok access tokens last ~24h; the app auto-refreshes them
  behind the scenes using the stored refresh token — no franchisee action.
- **Deleting:** TikTok does **not** allow deleting posts via API. In-app
  delete removes it from Bio-One Social Hub and tells the user to delete it
  in the TikTok app.
