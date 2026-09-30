# Orchestrator notes — week one (2026-09-21)

## Local test stack is live

- `supabase start` builds the database from all 65 migrations (two replay guards committed in `a39df14`).
- `.env.development.local` (gitignored) points `next dev` at http://127.0.0.1:54321 and blanks Resend, R2 and Sentry, so dev can never reach production or send real email.
- `node scripts/local-seed.mjs` (commit `1b5b351`) seeds five accounts (password `vibe-local-1234`): `avery@example.test` (owner of test_invite_club + test_open_club + test_hidden_club), `blake@example.test` (IU, member of nothing, follows test_open_club by tap, owns test_request_club), `casey@example.test` (Purdue), `drew@example.test` (brand-new: unverified, no campus, not onboarded), `emery@example.test` (admin of test_invite_club). Two upcoming events, one past; 3 personal posts + 1 club post.
- Verified: signing in as Blake on http://localhost:3000 sends every auth request to 127.0.0.1:54321 and none to supabase.co.

## Finding for P1: the desktop profile saves itself on every load

Signed in as Blake on the local stack, opening `/html/profile.html` fires `POST /api/me/profile-sync` with no user action (and `GET /api/me/profile-bootstrap` four times). The "Changes saved" toast shows on load.

Cause, per the comment at `public/html/profile.html:~8098-8102`: render → `renderUserSections` → `pinFromProfile` → `saveProfileToStorage` → `scheduleProfileServerSync` (1.2 s debounce) → `flushProfileServerSync`. So every desktop profile view writes the whole profile back.

What it writes that the student never typed (observed body):
- `recruiter_snapshot: {"role":"Biology","seniority":"Year 2","locationSnap":"IU Indianapolis",...}` — derived client-side; this is how the snapshot got populated for students who never touched it.
- `tagline` equal to the bio text, `headline` "Biology · Year 2", `location_text` "IU Indianapolis" — derived values written back as if typed.

P1 must: (1) stop render-time paths from scheduling a server sync — only a real edit (or an explicit Save) marks the profile dirty; (2) stop sending `recruiter_snapshot` at all; (3) check that derived fields (tagline/headline/location_text) are only sent when the student edited them; (4) collapse the repeated bootstrap GETs if it is a small, contained change. Acceptance on the local stack: load `/html/profile.html?app=1` as Blake → zero non-GET requests; edit the bio → exactly one profile-sync POST whose body has no `recruiter_snapshot`.
