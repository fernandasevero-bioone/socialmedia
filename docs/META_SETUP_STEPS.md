# Meta App — Click-by-Click Setup (Facebook + Instagram)

Goal: create the Meta developer app and get the **App ID** + **App Secret** so
Claude can wire up real publishing. Meta changes this UI often, so wording may
differ slightly — the concepts below stay the same.

> One app covers BOTH Facebook and Instagram.

---

## Phase 0 — Before you click (prerequisites)
- A personal **Facebook account** (used only to own the developer app).
- A **Facebook Page** for a Bio-One location (for testing).
- An **Instagram Business or Creator** account, **linked to that Page**
  (Instagram app → Settings → Account type → switch to Business; then link the
  Facebook Page). Personal IG accounts cannot be posted to via API.
- A **Meta Business Portfolio** (a.k.a. Business Manager) — free at
  business.facebook.com. Create one for Bio-One if you don't have it.
- Your app's **public URL**. Use your Render URL once deployed
  (e.g. `https://bio-one-social-hub.onrender.com`). You can fill this in later.

---

## Phase 1 — Create the app
1. Go to **developers.facebook.com**.
2. Top-right: **Log In** with your Facebook account.
3. If first time: click **Get Started**, accept the developer terms, verify
   your account (it may ask for a phone number / email confirmation).
4. Top-right menu **My Apps** → **Create App**.
5. **App details:** enter an **App name** (e.g. `Bio-One Social Hub`) and a
   **contact email**. Click **Next**.
6. **Use cases:** Meta asks "What do you want your app to do?" Select
   **"Other"** and continue (this gives access to all products), OR if it lists
   them, pick the ones about managing a Page and Instagram. Click **Next**.
7. **App type:** choose **Business**. Click **Next**.
8. **Business portfolio:** attach the Bio-One Business Portfolio (or do it
   later). Click **Create app** and re-enter your password if prompted.
9. You're now on the **App Dashboard**.

---

## Phase 2 — Basic settings (URLs, icon, policies)
1. Left sidebar: **App settings → Basic**.
2. Fill in:
   - **App Domains:** your domain, e.g. `bio-one-social-hub.onrender.com`
   - **Privacy Policy URL:** `https://<your-url>/privacy.html`
   - **User Data Deletion:** choose "Data Deletion Instructions URL" and enter
     `https://<your-url>/data-deletion.html`
   - **App Icon:** upload the Bio-One logo (1024×1024)
   - **Category:** Business and Pages
3. Click **Save changes**.
4. **⭐ Copy two values from this page and send them to Claude:**
   - **App ID** (shown at the top — not secret)
   - **App Secret** (click **Show**, enter your password) — **treat this like a
     password.** Claude stores it in `config/platforms.env`, which is never
     committed to GitHub.

---

## Phase 3 — Add the products
1. Left sidebar: **Add Product** (or "Products" → +).
2. Add **Facebook Login** → **Set up**.
   - Go to **Facebook Login → Settings**.
   - Under **Valid OAuth Redirect URIs**, add:
     `https://<your-url>/oauth/meta/callback`  *(Claude will confirm this exact
     path when building the connect flow.)*
   - Save.
3. Add **Instagram** (may appear as "Instagram Graph API" or "Instagram") →
   **Set up**. This enables publishing to the linked IG Business account.

---

## Phase 4 — Permissions (what we'll request)
Under **App Review → Permissions and Features** (or "Use cases"), you'll see
these. You don't have to submit yet — just know these are the ones we need:
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`  ← publish to Facebook Pages
- `instagram_basic`
- `instagram_content_publish`  ← publish to Instagram
- `business_management`

With **Standard Access** (no review), these already work for people who have a
**role** on the app — so we can fully test before submitting.

## Phase 5 — Add a tester (test real posting now)
1. Left sidebar: **App roles → Roles** (or "Roles").
2. **Add People** → add yourself (and any pilot franchisee) as **Administrator**
   or **Tester**, using their Facebook account.
3. They accept the invite (notifications on facebook.com or
   developers.facebook.com). Now the app can post to *their* Page/IG in test
   mode while full review runs later.

---

## What to send Claude when Phase 2 is done
1. **App ID**
2. **App Secret**
3. Your live **app URL** (so I set the exact redirect URI)

Then I implement the "Connect Facebook/Instagram" button (OAuth), the publish
calls, store tokens encrypted, and flip the platforms to live. After that, a
pilot location can post for real; App Review unlocks it for everyone.
