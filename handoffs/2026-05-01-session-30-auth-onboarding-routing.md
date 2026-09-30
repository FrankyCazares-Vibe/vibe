# Session 30 handoff — Auth, onboarding, and post-login routing (2026-05-01)

## Purpose

Capture the end state after tightening **P1-006** so new and returning users land in sensible places: **verify → Otto (static) → persisted onboarding → profile by default**, with **no bypass** of Otto or school verification on gated app surfaces, and **no `?next=/feed` loops** after login.

## Intended user journeys

| Case | Expected path |
|------|----------------|
| New signup | Sign up → confirm email → `/onboarding` bridge → static Otto (`public/html/onboarding.html`) → `POST /api/me/onboarding-complete` → if school verified: **`/profile`**, else `/auth/school-email` |
| Returning user (session valid, onboarding + school done) | Login → **`/profile`** (or explicit safe `next` if provided) |
| Unauthenticated hit on campus / feed / etc. | Redirect to **`/auth/login`** without preserving a broken `next` from the gate |
| Otto not saved (e.g. API 401 in embedded browser) | Cannot use campus/feed/profile shell until onboarding API succeeds; user is pushed back through login → onboarding |

## Key implementation files

- **`src/lib/auth/email-confirm-redirect.ts`** — Post-confirm redirect; `DEFAULT_POST_LOGIN_PATH = "/profile"`.
- **`src/lib/auth/post-login.ts`** — `isOttoOnboardingComplete`, `getPostLoginDestination` (explicit `next`, then Otto → school-email → default profile).
- **`src/lib/auth/login-next.ts`** — `sanitizeLoginNextParam` (drops `/feed`, `/campus` as login targets).
- **`src/app/auth/login/page.tsx`** — Uses sanitized `next`.
- **`src/lib/auth/campus-access.ts`** — `enforceCampusAccess`, `enforceSchoolEmailPage`; unauthenticated: login **without** `next` from these gates.
- **`src/app/onboarding/page.tsx`** — Bridge to static onboarding path.
- **`public/html/onboarding.html`** — `completeOnboarding` → `POST /api/me/onboarding-complete`; on failure → `/auth/login?next=/onboarding`.
- **`src/app/api/me/onboarding-complete/route.ts`** — Persists `otto_answers`; JSON `next` toward profile or school-email.
- **`middleware.ts`** — Session refresh only (no special-case HTML onboarding redirect).
- **`src/app/auth/signup/page.tsx`** — Copy + paths toward onboarding where applicable.
- **`src/app/auth/school-email/layout.tsx`** — Server gate for school-email step.
- **`src/app/profile/page.tsx`**, **`src/app/profile/profile-main.tsx`** — Stub UI + `enforceCampusAccess("/profile")` + school-verified banner.
- **`src/components/LeftNav.tsx`** — Logo → `/profile`; active route uses prefix matching.
- **Gated routes** (each calls `enforceCampusAccess` or equivalent): `campus`, `feed`, `profile`, `network`, `messages` page entrypoints.

## Product note

**`/profile` in the Next.js app is still a stub** (“profile grid and edit flow are next”) until **P1-007** ships real Supabase-backed profile UI. The empty state is expected.

## Next session should pick up

1. **P1-007** — Profile reads/writes against `public.users` (and related tables per `DOCS/PHASE_1.md`).
2. **P1-008** — URL polish / rewrites as in the spec.
3. Optional hardening: E2E or manual QA matrix for **password reset**, **email confirm** deep links, and **in-app browsers** (Instagram, etc.) hitting the onboarding API.

## Journal

Product journal bumped to **v4.2 / Session 30** in `public/journal/vibe_journal.html` (canonical `DEFAULT_DATA` + static hero/sidebar seeds).

## Related

- Prior auth brief: `handoffs/2026-04-30-session-29-phase1-stage1-handoff-p1-006.md`
- Spec: `DOCS/PHASE_1.md`
