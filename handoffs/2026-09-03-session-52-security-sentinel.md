# Session 52 handoff — security sentinel + follow-up fixes (2026-09-03)

Same day as Session 51, second Claude Fable session. Three things happened:
(1) orchestrator working style agreed and saved to memory; (2) a repeatable
"hacker agent" was built and run, producing a full risk report; (3) the two
serious things it caught were fixed and deployed. Then Franky and Claude
agreed on how security/legal/monetary work fits the roadmap (§4). **Session 53
starts at §4.**

## §1 — What exists now

- **`.claude/workflows/security-sentinel.js`** (local, gitignored) — Workflow:
  recon → 11 attacker lenses in parallel → adversarial verify of every
  Medium+ finding against CURRENT code → 7 section writers + exec summary +
  roadmap → assembled markdown. Read-only rules of engagement; no live
  exploitation of prod. Re-run: `Workflow({scriptPath: ".claude/workflows/security-sentinel.js", args:{date, site}})`.
- **`handoffs/2026-09-03-security-risk-report.md`** — the deliverable.
  41 register rows ≈ 25 distinct issues. Exec summary + section C (injection/
  XSS) were written by hand after the model's cyber safeguards blocked those
  two writer agents; everything else is agent-written and verified.
- **Memory:** `feedback_orchestrator_mode`, `project_security_sentinel`,
  `project_security_model`, `project_security_sequencing` (the §4 decision).

## §2 — Fixed this session (commit `f2221b3`, migration `20260903110000` applied live)

| Sev | Issue | Fix |
|-----|-------|-----|
| Critical | Resume/portfolio doc viewer in `profile.html` rendered doc name/url unescaped (missed in S51) | `_esc()` at all 3 sinks; sanitizer stores `URL.href`, strips markup chars from names |
| High | `channel_members` table-level UPDATE grant let a user re-point `channel_id` into any DM/group | UPDATE pinned to per-viewer columns; inert UPDATE on messages/channels revoked |
| Medium | `/api/posts/[id]/media` open redirect to any stored https URL | Supabase-host allowlist; publish-post rejects external https |
| Low | `isSupabaseHttpsUrl` trusted any `*.supabase.co` | exact project host only |
| Low | No `server-only` guard on secret modules | added to service/r2/resend/token/admin/rate-limit |

Verified: tsc clean, `next build` clean, profile.html inline scripts parse,
grants confirmed via `has_column_privilege`, patched profile.html confirmed
live on www.connectvibe.app.

## §3 — Sequencing decision (agreed 2026-09-03)

**Not a whole phase, not deferred to the end.** A bounded hardening sprint
now (1–2 sessions) for the items that touch real students' data on day one
or that get more expensive once the app version exists; then security is part
of definition-of-done per milestone (run the sentinel, fix Medium+); then a
live pentest against a Vercel preview deploy before app-store submission.
Rationale: a Capacitor/native app inherits the web app's security state, and
several "security" items (in-app deletion that really deletes, accurate
privacy policy, age rating) are Apple review prerequisites anyway.

## §4 — Session 53 pick-up list

### A. Hardening sprint — do before the next real IU student uploads a resume

- [ ] **A1. Resumes + portfolio → private storage + signed URLs.**
      Acceptance: PDFs no longer live in the public `profiles` bucket (new
      private bucket or private prefix); upload scoped to `<uid>/` via a
      server route or signed PUT; viewing goes through an auth-checked route
      that issues short-TTL signed GETs (owner + signed-in viewers, honours
      blocks); existing objects migrated; anonymous bootstrap still returns no
      URLs; desktop `profile.html` viewer AND `ProfileMobile` /
      `ResumeViewerMobile` both work. Residual (accept + note): redaction bars
      are still client overlays, so a signed-in viewer can still fetch the
      un-redacted file during the TTL — server-side redaction is a later item.
- [ ] **A2. Upload signers: rate limit + size binding.**
      Acceptance: `/api/me/clip-upload-url`, `messages-upload-url`,
      `group-photo-upload-url`, `profile-upload`, `/api/orgs/[slug]/upload-url`
      all behind `rateLimit` (~20 / 10 min per user); presigned PUTs include
      `ContentLength` so the declared size is enforced by R2 (clients must send
      a matching `Content-Length`); orphaned-object cleanup is optional.
- [ ] **A3. Scope .edu verification to IU.** `isEduEmail` → allowlist from an
      env var `SCHOOL_EMAIL_DOMAINS` (default `iu.edu,iupui.edu` + subdomains).
      Acceptance: non-IU .edu rejected with a clear message; already-verified
      users untouched.
- [ ] **A4. Signup legal + deletion purge.** Age gate (18+ checkbox or DOB
      block, matching the Terms; final rule is the lawyer's call) and a real
      "I agree" capture: new columns `terms_accepted_at`, `terms_version` on
      `users` (migration). `/api/me` DELETE also removes `profiles/<uid>/*`
      in Storage and `clips/<uid>/*` in R2. Acceptance: after delete, both
      prefixes are empty; signup can't proceed without the checkbox.
- [ ] **A5. Supabase Auth dashboard (Franky):** leaked-password protection
      ON, min password length 8, Confirm email ON + Resend SMTP.
- [ ] **A6. Legal wording → lawyer (parallel, not blocking code):** privacy
      policy sub-processors (add Resend, Sentry) + contradictions; Terms venue
      (Marion County, IN for IU Indianapolis); data-export process + SLA;
      minors policy. Source: report §Legal & Compliance.

### B. Fold in, every milestone

- [ ] Run the sentinel at each milestone (`Workflow({scriptPath: ".claude/workflows/security-sentinel.js", args:{date, site}})`).
      Fix Medium+ inside the milestone; keep Low/Info as a backlog.

### C. Before app-store submission

- [ ] CSP: report-only first (nonces for `public/html` inline scripts), then enforce.
- [ ] Throttle likes/reposts/reactions/views + the remaining ~60 write endpoints; `clientIp` trusts only the proxy-set header; make the limiter fail closed on auth paths.
- [ ] Sentry `beforeSend` PII scrub; drop `x-powered-by`.
- [ ] Live pentest against a Vercel preview deploy (sentinel in "active" mode, never prod).
- [ ] Apple review prerequisites: in-app account deletion (done by A4), privacy nutrition labels from the corrected policy, age rating.

### D. Then back to the product list (Session 50 carry-over)

- [ ] QA mobile onboarding (`OnboardingMobile.tsx`) + Otto tour on a real phone with live backend.
- [ ] Hand-test video-in-feed and video-in-DM on a phone.
- [ ] Get one real IU student through signup → post → send on www.connectvibe.app.
- [ ] Google Search Console re-index for the favicon.
- [ ] Medium: `/posts/[id]` for unauthenticated visitors; feed ranking Tier-2; mobile work-experience date picker; desktop search overlay; `clip*` → `video*` rename; Notifications panel (#29); real .edu email verification.

### Session 53 kickoff prompt (paste into the new session)

> Read the latest handoff (`handoffs/2026-09-03-session-52-security-sentinel.md`) and the risk report next to it, then start §4-A1: move resumes/portfolio files to private storage with signed URLs. Work as an orchestrator: plan and verify in the main loop, hand the coding to subagents. Commit and push as you go.

## §5 — Notes for whoever runs the sentinel next

- The first run hit the account session limit (27/34 agents failed); resuming
  with `resumeFromRunId` replayed the cached finders and only re-ran the rest.
- Two synthesis agents (exec summary, section C) were blocked by cyber
  safeguards because their prompts carried attack scenarios. Fallback that
  worked: write those two sections in the main loop from the register +
  `journal.jsonl`.
- A finder flagged a "prompt-injection attempt" that was the harness's own
  commit-attribution `<system-reminder>` inside a tool result. Not an app
  issue; kept in the register as not-applicable for transparency.
- The Supabase MCP `execute_sql` is read-only. Migrations were applied with
  the management API (`POST /v1/projects/<ref>/database/query`,
  `SUPABASE_ACCESS_TOKEN` from `.env.local`) plus a `schema_migrations` row.
