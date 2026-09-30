# Session 31 handoff — Profile shell, storage, global-feed flag, docs notes (2026-05-03)

## Purpose

Close-out for the next chat or solo session: **what might be missing**, **how to see work as you ship**, **git / deploy**, and **where the journal + local docs live**.

### Who runs which step (agent labels)

Use one primary agent per chunk so two agents don’t edit the same files at once.

| Label | Meaning |
|--------|--------|
| **`[Claude Code]`** | Sidebar Claude: best for **ship loops**, multi-file P1 work, gstack skills (`/ship`, review, browse QA). Default for long sessions on Max. |
| **`[Cursor]`** | Cursor chat/agent: best when you’re **already in a thread** here, small targeted fixes, or quick questions with repo context. |
| **`[Either]`** | Fine in **either** tool; pick whichever you have open. |
| **`[You]`** | **Human / dashboard** — Vercel env UI, Supabase org/console clicks, secrets, approvals, interactive `supabase login`. |

---

## 1) Anything missing from previous steps?

### Still true from Session 30

- **`/profile` (Next)** was a stub moving toward **P1-007**; Session 31 work replaces much of that with the **HTML profile bridge** + APIs — verify end-to-end after deploy.
- **P1-006** behaviors (post-login → profile, gates, `next=` sanitization) should stay intact; regression-test login, onboarding complete, school verify.

### Ops / data

- **Supabase:** If you use profile uploads (avatar, banner, resume), ensure migration  
  `supabase/migrations/20260503120000_profile_extension_storage.sql` is applied on the linked project (`supabase db push` or SQL Editor). Without it, uploads return “bucket not found.”
- **Vercel env:** Mirror `.env.example` / `.env.local` for production (`NEXT_PUBLIC_*`, `SUPABASE_SERVICE_ROLE_KEY`, Resend, R2, etc.). Optional: `NEXT_PUBLIC_SHOW_GLOBAL_FEED=true` only when you want the **global `/feed`** nav item + page; omit for campus-first (default).

### Local-only paths (not in `git push`)

- **`DOCS/`** and **`handoffs/`** are **`.gitignore`d** — they do not deploy with Vercel. Keep **handoffs** and **DOCS** in your normal backup (Conductor, Dropbox, separate commit in a private notes repo, etc.). **`public/journal/vibe_journal.html`** *is* tracked and ships with the site.

### Product clarity (recorded in `DOCS/PHASE_1.md` + `DOCS/LEARNINGS.md` locally)

- **Signed-in `/campus`** = thin “You’re in” **Next** page until **Stage 4 / 7 / 9** (P1-015–019, P1-024+, P1-029–030) and **P1-008** port/wire work. Full prototype remains **`public/html/campus.html`** for anon rewrites.
- **Global feed vs campus:** no auto-merge of campus posts into global; **`NEXT_PUBLIC_SHOW_GLOBAL_FEED`** + `src/lib/feature-flags.ts`. Details in local **LEARNINGS** § Product / feeds.

---

## 2) Seeing work while you ship it

| Approach | Use for |
|----------|---------|
| **`npm run dev`** | Fast iteration on App Router + APIs; use a logged-in browser profile. |
| **Vercel Preview Deployments** | Push a **branch** or open a **PR** — Vercel gives a unique preview URL per commit/branch without touching production. |
| **`git push origin main`** | Production on the usual Vercel project (~30s). |
| **Feature flags** | e.g. `NEXT_PUBLIC_SHOW_GLOBAL_FEED` — ship code dark, flip env when ready. |
| **Supabase branches** (optional) | Separate DB for risky migrations if you upgrade plan / workflow. |

**Practical habit:** one logical change per commit (or per PR), smoke **login → onboarding → profile → campus** on preview before merging.

---

## 3) Commits and deploys you need

### Current git snapshot (as of handoff write)

- **`main` is ahead of `origin/main` by 1 commit** — likely `869e3fe` journal v4.2 / Session 30 only. **Push** that so GitHub and Vercel history match your machine.
- **Large uncommitted working tree** — profile APIs (`profile-bootstrap`, `profile-sync`, `profile-upload`, `profile`), `profile-html-bridge`, `nav-identity-chip`, `feature-flags`, middleware, auth routes, HTML prototypes, migration file, removal of `profile-main.tsx`, etc.

### Suggested sequence

1. **`[Either]`** **`git status`** — review the full list.
2. **`[Claude Code]`** (or **`[Either]`**) **`npx tsc --noEmit`** and **`npm run lint`** (or your CI script) before commit — Claude Code fits a full pre-commit pass + fix loop on Max.
3. **`[Claude Code]`** **Commit strategy (pick one):**
   - **Single milestone commit:** e.g. `feat(profile): bridge, uploads, feed flag, middleware` — fast, one deploy.
   - **Split commits (better for bisect):** e.g. `feat(api): profile bootstrap/sync/upload` → `feat(profile): html bridge + nav chip` → `feat(flags): global feed deferred to campus` → `chore(html): prototype sync` → `chore(db): profiles storage migration`.
4. **`[Claude Code]`** **`git push origin main`** — triggers production deploy if the project is wired to `main` (or use your `/ship` / PR flow if that’s team standard).
5. **`[You]`** + **`[Either]`** **Post-deploy:** **`[You]`** confirm Vercel build green + env vars if anything new shipped; **`[Either]`** hit `/api/health/*`, sign-in flow, one upload if bucket exists.

**Ops before uploads:** **`[You]`** apply migration on the linked Supabase project (`db push` / SQL Editor) per §1; agents can run CLI only after you’re logged in / linked.

---

## 4) Product journal

- **Canonical tracked file:** `public/journal/vibe_journal.html`  
- **Session 31** should appear there as **v4.3** (hero, version row, session log, `sessionCount: 31`, `lastUpdated: May 3, 2026`) — updated in the same commit batch as this handoff or immediately after.
- Remind viewers: journal script **overwrites localStorage** on load with `DEFAULT_DATA` — that is intentional for “latest shipped narrative” in the repo copy.

---

## Key files touched this arc (for the next implementer)

| Area | Paths |
|------|--------|
| Global feed flag | `src/lib/feature-flags.ts`, `src/app/feed/page.tsx`, `src/components/LeftNav.tsx`, `getAppShellHomeHref()` consumers (`campus-home`, `home-landing`, `profile-html-bridge`) |
| Profile | `src/app/profile/page.tsx`, `profile-html-bridge.tsx`, `src/app/api/me/profile-*`, `src/lib/profile/*`, `src/components/nav-identity-chip.tsx` |
| Storage | `supabase/migrations/20260503120000_profile_extension_storage.sql`, `.env.example` notes |
| Auth / gates | `src/lib/auth/*`, `middleware.ts`, `verify-school`, `onboarding-complete`, school-email request |
| HTML prototypes | `public/html/*.html`, shared JS |

---

## Next session should pick up

1. **`[Claude Code]`** **Commit + push** the Session 31 bundle; **`[You]`** confirm Vercel green if the dashboard is the source of truth.
2. **`[Claude Code]`** **P1-007** continuation — profile data model, RLS, any remaining stub gaps vs `public/html/profile.html` (multi-file, good default for Max).
3. **`[Claude Code]`** **P1-008** — clean URLs / how signed-in users should load `campus.html` richness vs Next placeholders (per `DOCS/PHASE_1.md`).
4. **`[Claude Code]`** (or **`[Either]`**) Optional: **E2E** or scripted checklist for profile upload + onboarding + campus gate — Claude Code + browse/QA skills is a natural fit.
5. **`[Cursor]`** Use Cursor for **small follow-ups** on the same day (one file, linter nits) if you’re already in a Cursor thread; hand the **milestone** back to Claude Code when scope grows.

---

## Related

- `handoffs/2026-05-01-session-30-auth-onboarding-routing.md`
- Local: `DOCS/PHASE_1.md`, `DOCS/LEARNINGS.md` (gitignored)
