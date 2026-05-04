# Vibe — manual QA checklist

Phase 1 smoke test. Walk through this on a Vercel preview (or `npm run dev`) before merging anything that touches auth, the profile bridge, storage uploads, or the campus gate.

Each box is one observable assertion. If something fails, file it in `handoffs/` and pause the deploy.

---

## 0. Setup

- [ ] Pick a clean browser profile / private window so you start signed out.
- [ ] Confirm migrations are applied:
  - `supabase/migrations/20260430190000_phase1_initial_schema.sql`
  - `supabase/migrations/20260503120000_profile_extension_storage.sql`
- [ ] Confirm Vercel env has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Resend keys, R2 keys (if exercising clip uploads).
- [ ] Decide flag state: with or without `NEXT_PUBLIC_SHOW_GLOBAL_FEED=true`. Test both at least once per release.

## 1. Anonymous browsing — clean URLs (P1-008)

- [ ] `/` renders the React landing (`HomeLanding`).
- [ ] `/feed` rewrites to `public/html/feed.html` (HTML prototype loads, no redirect).
- [ ] `/network`, `/campus`, `/messages` rewrite the same way.
- [ ] `/opportunities` and `/otto` rewrite to their HTML prototypes (always static, even signed in).
- [ ] `/html/feed.html` (and `/html/network.html`, `/html/campus.html`, `/html/messages.html`, `/html/opportunities.html`, `/html/otto.html`, `/html/landing.html`) **redirect** to the clean URL — no 404, no double-rendering.
- [ ] `/html/profile.html?user=maya` redirects to `/profile/maya`.
- [ ] `/profile/maya` rewrites to the static profile prototype with the slug propagated.
- [ ] `/profile` (no auth) redirects to `/auth/login?next=%2Fprofile`.

## 2. Signup → school verify → Otto → profile (campus gate)

Use a fresh email you control. The path is **email confirm → school email verify → Otto → profile**.

- [ ] Sign up with personal email at `/auth/signup`. Land on the "check your inbox" screen.
- [ ] Open the email confirmation link in the same browser. After Supabase exchange you land on `/auth/school-email?account_verified=1`.
- [ ] Try to open `/campus` directly: it redirects to `/auth/school-email` (school not verified yet).
- [ ] Submit a `.edu` school email, get the verify email, click the link.
- [ ] After clicking, you arrive on `/onboarding` (Otto). The bridge full-navigates to `/html/onboarding.html` with query params preserved.
- [ ] Try `/campus` mid-onboarding: still redirects to `/onboarding` until Otto saves answers.
- [ ] Finish Otto. Confirm POST to `/api/me/onboarding-complete` returns `{ ok: true, next: "/profile" }` or `/profile?otto=1`.
- [ ] Land on `/profile`. The HTML profile loads with the prefilled name/headline from Otto.
- [ ] Reload `/campus`. The "School email verified" banner shows once (driven by `?school_verified=1`); refresh again, banner disappears.

## 3. /feed flag behavior

Sign in for both passes.

**With `NEXT_PUBLIC_SHOW_GLOBAL_FEED=true`:**
- [ ] `/feed` renders the empty Feed page in `CampusAppShell`.
- [ ] Left nav shows the "Feed" item.
- [ ] `getAppShellHomeHref()` consumers (campus home, profile bridge fallback) point to `/feed`.

**Without the flag (default):**
- [ ] `/feed` 302/307 redirects to `/campus` at the middleware layer (no Feed page mount).
- [ ] Left nav hides the "Feed" item.
- [ ] Campus home and profile bridge fallback link to `/campus`.

## 4. Profile upload + sync (P1-007)

Signed in, on `/profile` (the HTML bridge).

- [ ] Avatar upload: pick a JPG ≤6MB → preview replaces the avatar within ~1s. Network panel shows `POST /api/me/profile-upload` 200, then a profile sync.
- [ ] Banner upload: pick an image; cover swap is immediate. Switching to a gradient picker writes `banner_gradient` and clears `banner_url`.
- [ ] Resume upload: pick a PDF ≤8MB. The portfolio link surface updates to "Resume" (or "Portfolio" for image uploads).
- [ ] Edit name / tagline / bio inline → debounced sync hits `POST /api/me/profile-sync` 200.
- [ ] Edit interests/skills/work experience → sync 200; reload the page, values persist.
- [ ] Hit `/api/me/profile-bootstrap` directly while signed in — JSON includes the saved fields under `vibeUser`.
- [ ] Sign out, hit `/api/me/profile-bootstrap` — returns 401.
- [ ] If the storage bucket isn't applied yet, an upload returns the human-readable "bucket not found" message (not a raw stack trace).

## 5. Edge cases

- [ ] Cookies blocked / different in-app browser: opening the school-email confirm link in a Mail.app browser still lands on `/onboarding` without bouncing through login.
- [ ] `?next=` sanitizer: `/auth/login?next=https%3A%2F%2Fevil.example.com` does **not** redirect off-site after login; it falls back to `DEFAULT_POST_LOGIN_PATH`.
- [ ] Handle uniqueness: PATCH `/api/me/profile` with another user's `handle` returns 409 with the friendly message.
- [ ] Signed-in user opens `/html/profile.html` (no `app=1`): redirects to `/profile`.
- [ ] Signed-in user opens `/profile/maya`: hits the React `[handle]` stub (P1-011 placeholder). Anonymous gets the HTML prototype.

## 6. Post-deploy smoke (production only)

- [ ] Build is green in Vercel.
- [ ] `https://vibe-mocha-iota.vercel.app/` loads the React landing.
- [ ] Run §1 + §3 against production.
- [ ] Verify Sentry (when wired) records no spike of new errors in the 5 minutes after promotion.

---

## Notes

- This is observation-only. If you want to automate the same path later, bring up `gstack` headless browser (`/qa-only` or `/qa`) and replay the §1, §3, §4 sections — the assertions map cleanly to one navigation per check.
- Prefer reporting failures by attaching the failing step number, not a paraphrase, so the next run can compare apples-to-apples.
