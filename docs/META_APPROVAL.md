# Meta (Facebook + Instagram) — App Approval Checklist

Plain-English guide to getting Bio-One Social Hub approved to publish to real
Facebook Pages and Instagram accounts. Facebook and Instagram share **one**
Meta app and **one** review, which is why we start here.

> This is business/account setup, not coding. Once Meta approves, Claude flips
> one switch in the code (`liveReady: true` + credentials) and real posting
> turns on — no rebuild.

---

## 0. The end goal
A franchisee connects their Facebook Page + linked Instagram, clicks Publish in
the app, and the post really appears on their accounts.

## 1. Prerequisites (gather these first)
- [ ] A **Facebook account** to own the developer app (ideally a Bio-One admin's).
- [ ] A **Meta Business Portfolio** (formerly "Business Manager") for Bio-One —
      free at business.facebook.com. Used for business verification.
- [ ] The app must be **live on a public https URL** (your Render URL works).
- [ ] A **Privacy Policy page** at a public URL (required). *Claude can draft one.*
- [ ] A **Data Deletion** instructions URL (required). *Claude can add this.*
- [ ] Each test franchisee's **Instagram must be a Business or Creator account**,
      and **connected to a Facebook Page** (personal IG accounts can't be posted
      to via the API — this is a Meta rule, not our app).

## 2. Create the app
1. Go to **developers.facebook.com** → log in → **My Apps → Create App**.
2. Choose the **Business** app type.
3. Name it (e.g., "Bio-One Social Hub"), attach it to the Bio-One Business
   Portfolio.

## 3. Add the products
- **Facebook Login** (so franchisees can connect their account).
- **Instagram** publishing (listed as "Instagram Graph API" / "Instagram API
  with Facebook Login" depending on Meta's current naming).

## 4. Request these permissions
For publishing on a user's behalf, the app needs (names may vary slightly):
- `pages_show_list` — see which Pages the franchisee manages
- `pages_read_engagement`
- `pages_manage_posts` — **publish to Facebook Pages**
- `instagram_basic`
- `instagram_content_publish` — **publish to Instagram**
- `business_management` (often required)

## 5. Business Verification
- [ ] In the Business Portfolio → **Security Center**, complete **Business
      Verification** (legal business name, address, and a document like a
      business license or utility bill, plus a phone/email confirmation).
- Advanced (production) access to the publishing permissions is only granted to
  **verified** businesses. Start this early — it can take a few days.

## 6. Submit for App Review
Meta will ask you to prepare, for **each** publishing permission:
- [ ] **App icon** (the Bio-One mark) and a short app description.
- [ ] **Privacy Policy URL** and **Data Deletion URL**.
- [ ] **App category** (e.g., Business/Pages).
- [ ] A **screen recording** showing a real user logging in and the app using
      that permission to publish a post. *Claude can help script this demo.*
- [ ] **Step-by-step test instructions** + a test login so Meta's reviewer can
      reproduce it.
- [ ] A clear written explanation of **why** the app needs each permission
      ("franchisees publish marketing posts to their own Pages/IG").

## 7. Timeline & cost
- **Cost:** Meta charges nothing for the app or review. (Unlike X/Twitter.)
- **Timeline:** business verification a few days; app review typically a few
  days to ~2 weeks, sometimes with a round of follow-up questions.

---

## Shortcut: test REAL posting before full approval
You don't have to wait for full review to prove real posting works:
- In the app's **App Roles**, add a pilot franchisee as an **Admin / Developer /
  Tester**.
- With **Standard Access** (no review needed), the app can publish to the
  accounts of people who have a role on the app.
- So one pilot location can post for real immediately, while full review (which
  unlocks it for *all* franchisees) runs in parallel.

## What Claude does once you're approved
1. You give me the **App ID**, **App Secret**, and redirect URL (kept secret,
   in `config/platforms.env`).
2. I implement the OAuth connect flow + the real publish calls in
   `lib/providers/facebook.js` and `lib/providers/instagram.js` (the TODOs are
   already marked there).
3. I flip `liveReady: true`. Demo mode → real posting. No other changes.

## After Meta: the other platforms
Same idea, separately, when you want them:
- **LinkedIn** — Company Pages; Community Management API review.
- **Pinterest** — request standard access (pins need an image).
- **TikTok** — Content Posting API audit (before audit, posts go to drafts).
- **X** — skipped (paid API).
