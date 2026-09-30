# Session 28 — Phase 1 kickoff · P1-001 + P1-002 · Supabase + Cloudflare R2 · Vercel Hobby deploy unblock

End-of-session state for picking up cold in Session 29. Franky drove dashboard clicks (Supabase, Cloudflare, Vercel env vars); Cursor/Composer shipped foundation code and git commits.

**Live prod:** https://vibe-mocha-iota.vercel.app  
**Repo:** https://github.com/FrankyCazares-Vibe/vibe (private)

---

## What shipped (code + infra)

### P1-001 — Supabase project setup + env + connection ✅
- **Supabase:** New project (healthy). Automatic RLS on new tables **enabled** (per Franky).
- **Code:** `@supabase/supabase-js`, `src/lib/supabase.ts` (`createSupabaseClient()`), `.env.example` entries for `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Smoke:** `GET /api/health/supabase` — hits Auth API (`/auth/v1/health`), returns `{ ok: true, authHealth: … GoTrue … }`.
- **Git:** `.gitignore` — `!.env.example` so the template commits safely.

### P1-002 — Cloudflare R2 + storage helpers ✅
- **Cloudflare:** GitHub signup; R2 subscription added; bucket **`vibe-clips`**; **Account API token**, Object Read & Write, scoped (recommended least-privilege: specific bucket).
- **Code:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `src/lib/r2.ts` — `getR2S3Client()`, `signClipPutUrl` / `signClipGetUrl` (keys must start with `clips/` — never raw URLs in DB per PHASE_1).
- **Smoke:** `GET /api/health/r2` — `HeadBucket`; `{ ok: true }` when `R2_*` env vars set.

### Env conventions (locked)
- **Server-only:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` — never `NEXT_PUBLIC_*`.
- **Client-safe:** only Supabase URL + **anon** public key under `NEXT_PUBLIC_*`.

---

## Git history notes

- **One commit per ticket** maintained: `chore(P1-001): …`, `chore(P1-002): …`.
- **Force-push:** Hobby deployments were **Blocked** — error: *commit author did not have contributing access*. Root cause: `git` author (`Franky Cazares <fracazar@iu.edu>`) did not match Vercel’s allowed GitHub identity; **`fracazar@iu.edu` cannot be added to GitHub** (already tied to another account).
- **Fix:** `git config user.email "FGCazares04@gmail.com"` → `git commit --amend --reset-author` → `git push --force-with-lease`. Subsequent deploys show author **FrankyCazares-Vibe** and **Ready**.
- **Head commits:** After amend, **P1-002** tip is **`8e3de48`** on `main` (same tree as former `0f7f2ea`, new hash).

---

## Security action items for Franky (do not skip)

1. **`NEXT_PUBLIC_SUPABASE_ANON_KEY` must be the anon key**, never **service_role**. Service role bypasses RLS and must stay server-only. If service_role was ever pasted into `NEXT_PUBLIC_*` or committed: **rotate** keys in Supabase (Project Settings → API), fix `.env.local` + **Vercel**, redeploy.
2. **R2 secret + Supabase keys:** treat as production secrets — never paste into chat, never commit `.env.local`.

---

## Vercel / deploy hygiene

- **Production env vars:** All **`NEXT_PUBLIC_SUPABASE_*`** and all **`R2_*`** added on Vercel; redeploy after changes.
- **Git-connected deploy:** Works once commit author matches allowed Hobby identity.
- **CLI fallback:** `npx vercel --prod` still works if Git deploy stalls (used successfully earlier in Phase 1 setup).

---

## Not started yet (explicit scope boundaries)

- **P1-005** — DB schema tables (next dependency gate after ops baseline).
- **P1-003** — Resend (next ticket in Stage 1 order).
- **P1-004** — Sentry.

---

## Reference docs

- Build spec: `DOCS/PHASE_1.md` (local / gitignored in workshop — backup separately).
- Prior session: `handoffs/2026-04-29-session-27-github-deploy-and-phase-1-spec.md`
- Product journal (committed): `public/journal/vibe_journal.html` — Session 28 logged in DEFAULT_DATA.

---

## How to brief the next chat

- Phase 1 Stage 1: **P1-001 and P1-002 done.** Prod URLs: `/api/health/supabase` and `/api/health/r2` both **`ok: true`** when env is correct.
- **Pick up at P1-003** (Resend) unless reordering; schema remains **P1-005**.
- **Git:** push from repo with **`user.email`** = verified Gmail on **FrankyCazares-Vibe** to avoid Hobby blocks.
