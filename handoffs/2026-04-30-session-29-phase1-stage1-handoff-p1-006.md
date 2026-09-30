# Session 29 (continuation) — Phase 1 Stage 1 complete · P1-003 → P1-005 · Handoff for P1-006

**Purpose:** Cold-start brief for a **new chat** to implement **P1-006** (auth + `.edu` + password reset + sessions). Stage 1 foundation tickets are **done in repo + verified**.

**Live prod:** https://vibe-mocha-iota.vercel.app  
**Repo:** https://github.com/FrankyCazares-Vibe/vibe (private)  
**Spec:** `DOCS/PHASE_1.md` (Stage 1 table + P1-006 row)

---

## TL;DR for the next agent

1. **Read:** `DOCS/PHASE_1.md` (P1-006 row + Otto/email notes).  
2. **Heed:** `AGENTS.md` — Next.js **16.x** differs from older docs; check `node_modules/next/dist/docs/` when APIs are unclear.  
3. **Implement:** **P1-006** — Supabase Auth flows wired into Next.js, `.edu` verification story, password reset via **Resend**, session handling; depends on **P1-005** (schema) ✅ and **P1-003** (Resend) ✅.  
4. **Do not re-run** the full Phase 1 schema migration on Supabase if tables already exist — you’ll get `relation "users" already exists`. Verify with `pg_tables` / Table Editor instead.

---

## What shipped (Stage 1 — all ✅)

| ID | What | Key paths / smoke |
|----|------|-------------------|
| **P1-001** | Supabase client + env template | `src/lib/supabase.ts`, `GET /api/health/supabase` |
| **P1-002** | Cloudflare R2 clip URLs | `src/lib/r2.ts`, `GET /api/health/r2`, DB stores **`clips/...` keys only** |
| **P1-003** | Resend baseline | `src/lib/resend.ts`, `GET /api/health/resend` |
| **P1-004** | Sentry Next.js App Router | `withSentryConfig` in `next.config.ts`, `src/instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/lib/sentry-config.ts`, `src/app/global-error.tsx`, `GET /api/health/sentry` |
| **P1-005** | Schema + RLS + profile trigger | `supabase/migrations/20260430190000_phase1_initial_schema.sql` — **applied** in Supabase SQL Editor; **`public.users.id`** references **`auth.users(id)`**; **`handle_new_user`** trigger on **`auth.users`** |

### Git tip-of-`main` (Session 29 era)

```
57cc1ef feat(P1-005): Supabase Phase 1 tables, RLS, auth.users profile trigger
a858743 feat(P1-004): Sentry for Next.js App Router + /api/health/sentry
bd7f9b0 feat(P1-003): Resend client + /api/health/resend with send-only key probe
```

---

## Health endpoints (prod + local)

| Route | Meaning |
|-------|---------|
| `/api/health/supabase` | Supabase Auth reachable |
| `/api/health/r2` | R2 bucket head OK |
| `/api/health/resend` | Resend key OK (**send-only** keys: domains API restricted → treated as OK when Resend returns that scope message) |
| `/api/health/sentry` | `NEXT_PUBLIC_SENTRY_DSN` set |

---

## Environment variables (checklist)

**Local:** `.env.local` (never commit). **Vercel:** Production (+ Preview if needed).

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — **anon only**, never `service_role` in `NEXT_PUBLIC_*`.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` — server-only.
- `RESEND_API_KEY` — server-only; optional commented `RESEND_FROM` in `.env.example` for when mail sends (P1-006+).
- `NEXT_PUBLIC_SENTRY_DSN` — public DSN per Sentry Next.js SDK.

Template: `.env.example`.

---

## Resend / Sentry gotchas (already learned)

- **Resend:** “Sending access” keys cannot call Domains API; health route treats the specific **“restricted…only send emails”** response as **`ok: true`** (key is valid).  
- **Deploy:** New API routes must be **committed + pushed** — local-only files produced **404 on Vercel** until pushed (happened with `/api/health/resend`).  
- **Sentry:** Wizard CLI **not** required — manual SDK already in tree; paste **DSN** only.

---

## Supabase schema (P1-005) — applied

**Migration file:** `supabase/migrations/20260430190000_phase1_initial_schema.sql`

**Tables in `public`:** `users`, `posts`, `bookmark_collections`, `bookmarks`, `connections`, `orgs`, `org_members`, `channels`, `channel_members`, `messages`, `events`, `rsvps`, `reminders`.

**Verify:**

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

If user sees **`relation "users" already exists`** on re-run — schema is already there; **do not** paste the full migration again unless resetting a dev DB.

**Trigger syntax:** file uses `EXECUTE PROCEDURE public.handle_new_user()`; if Postgres complains, try `EXECUTE FUNCTION` (same body).

**RLS:** enabled on all Phase 1 tables; policies are **Phase 1 bootstrap** — **P1-006 / P1-022** may tighten (especially messaging/orgs).

---

## Explicit next: P1-006 (from PHASE_1)

**Title:** Auth flow — signup, login, `.edu` verification, password reset, session handling.

**Depends on:** P1-005 ✅, P1-003 ✅.

**Likely workstreams (split commits as usual):**

- Supabase Auth config (email confirmation, redirect URLs, Site URL for prod + localhost).
- Next.js **middleware or server session** pattern with `@supabase/ssr` / cookie helpers (confirm against **Next 16** docs in-repo).
- Sign up / sign in UI or routes (minimal first — can bridge to existing `public/html/*` later per P1-008 URL polish).
- **`.edu` verification:** `school_email`, `school_verified` on `public.users` — flow may combine Supabase metadata + Resend + manual or magic-link step (spec in PHASE_1).
- **Password reset:** hook Supabase reset emails through **Resend** if overriding templates (per stack decision in PHASE_1 — Supabase built-in email called unreliable; align with Resend).
- Ensure **`handle_new_user`** stays compatible (duplicate inserts, handle uniqueness).

---

## Security reminders

- Rotate any keys ever pasted into chat or screenshots.  
- **Service role** key stays server-only / Supabase secrets — never browser env.

---

## Optional housekeeping (not blocking P1-006)

- `public/journal/vibe_journal.html` — may have local edits uncommitted; sync session narrative when convenient.  
- ESLint: pre-existing issue in `LyraConstellation.tsx` (purity / `Math.random`); `npm run build` passes.

---

## How to brief the next chat (copy-paste)

> Read `handoffs/2026-04-30-session-29-phase1-stage1-handoff-p1-006.md` and `DOCS/PHASE_1.md`. Phase 1 Stage 1 is complete (P1-001–P1-005). Schema is applied in Supabase. Implement **P1-006**: Supabase Auth + `.edu` verification + password reset + sessions in Next.js 16, using existing Resend/R2/health patterns. Follow `AGENTS.md` for Next docs location.
