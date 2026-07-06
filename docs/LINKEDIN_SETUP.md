# LinkedIn — Click-by-Click Setup (Company Page publishing)

Goal: create the LinkedIn developer app and get the **Client ID** + **Client
Secret** so the app can let each franchisee connect their own LinkedIn
account and publish to the Company Page(s) THEY administer.

> Franchisees connect their own Pages — corporate only sets up the developer
> app once. Same model as Meta.

---

## Phase 0 — Prerequisites
- A **LinkedIn account** for you (the app owner).
- The **Bio-One LinkedIn Company Page**, with you as **Super Admin** (needed
  to verify the app). Franchisees need admin on *their own* location Pages —
  that's checked when they connect, not during setup.

## Phase 1 — Create the app
1. Go to **developer.linkedin.com** → **Create app** (sign in first).
2. Fill in:
   - **App name:** `Bio-One Social Hub`
   - **LinkedIn Page:** select the Bio-One Inc. Company Page (type to search)
   - **Privacy policy URL:** `https://bio-one-social-hub.onrender.com/privacy.html`
   - **App logo:** the Bio-One mark
3. Agree to terms → **Create app**.

## Phase 2 — Verify the app
1. On the app page, open the **Settings** tab → find **Verify** next to the
   company Page.
2. Click **Verify** → it generates a verification URL → open it while logged
   in as a Bio-One Page admin → **Approve**.
   (This proves the app belongs to Bio-One. Required before API access.)

## Phase 3 — Add the OAuth redirect
1. App page → **Auth** tab.
2. Under **OAuth 2.0 settings → Authorized redirect URLs**, add:
   `https://bio-one-social-hub.onrender.com/oauth/linkedin/callback`
3. Save.
4. **⭐ Copy from this Auth tab and send to Claude (via Render env vars):**
   - **Client ID**
   - **Client Secret** (treat like a password — goes in Render's Environment,
     never in code)

## Phase 4 — Request API access (the slow part)
1. App page → **Products** tab.
2. Find **Community Management API** → **Request access**.
3. Fill out their access form (use case: *"Franchise marketing tool —
   franchisees publish approved marketing content to the LinkedIn Company
   Pages they administer."*). LinkedIn reviews this — typically days to a
   couple of weeks, and may require company verification.
4. While waiting, also add **"Share on LinkedIn"** and **"Sign In with
   LinkedIn using OpenID Connect"** if listed — they're instant-approval and
   useful for testing login.

## Phase 5 — Send Claude the credentials
Add in **Render → Environment**:
- `LINKEDIN_CLIENT_ID` = (from Auth tab)
- `LINKEDIN_CLIENT_SECRET` = (from Auth tab)

Once set (and deployed), the LinkedIn row in **My Accounts** switches from
demo to real: franchisees click Connect → approve on LinkedIn → the app finds
the Company Pages they administer → they publish/schedule like Facebook.

## Notes
- **Personal profiles:** LinkedIn heavily restricts posting to personal
  profiles via API. Company/location **Pages** are the supported path.
- **What franchisees need:** admin role on their location's LinkedIn Page.
  If a location has no Page, they create one free on LinkedIn first.
