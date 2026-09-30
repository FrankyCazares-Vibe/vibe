# Session 53 handoff — hardening sprint A1–A4 + server-side redaction (2026-09-04 → 06)

Picked up §4-A1 from the Session 52 handoff. Orchestrator mode: the main
loop read the report, designed the contract, applied the migration and
ran the data moves; two subagents wrote the server and client code (one
follow-up message each). A2 ran the next day as an 18-agent ultracode workflow (lib → 4 endpoint groups → 3 adversarial lenses each → completeness critic) plus two follow-up agents. **A1–A4 and server-side redaction are done and live. A5 (dashboard toggles) and A6 (lawyer) are Franky's; next engineering pickup is §B: re-run the sentinel at this milestone, then §C.**

## §1 — What shipped (commit `9b7c7d1`, migration `20260904100000` applied live)

| Area | Before | After |
|------|--------|-------|
| Bucket | Resumes in public, world-listable `profiles` | Private bucket `resumes`, `public=false`, **no** `storage.objects` policies → service role only |
| DB value | Permanent public URL in `users.resume_url` / `resume_docs[].url` | Proxy path `/api/resume/<uid>/resume-<uuid>.<ext>` (external pasted links still allowed as-is) |
| Read path | Browser fetched the public URL forever | `GET /api/resume/<key>`: signed-in → owner, or (key ∈ owner row refs AND no block either way) → 307 to a **300 s** signed URL; `?json=1` returns `{ok,url,expiresIn}` for pdf.js. 401 anon, 404 otherwise, 120 req / 10 min per user |
| Write path | `profile-upload` kind=resume wrote the public bucket with the user client | Service role → `resumes`; response `url` is the proxy path. Desktop `data:` uploads (profile-sync) go the same way |
| Validation | Sanitizer accepted any http(s) | `normalizeResumeRef(value, ownerId)` on READ and WRITE (profile-sync, `PATCH /api/me/profile`, onboarding-complete, normalize-profile-view). Needed because `authenticated` can UPDATE these columns straight through PostgREST |
| Orphans | Repeated uploads left 35 un-referenced PDFs public | profile-sync deletes keys a save un-references (own prefix only, best effort) |
| Listing | `profiles_public_read` let the anon key enumerate every folder | Replaced by owner-only SELECT; avatars/banners/post images still serve by public URL |
| Anonymous bootstrap | Already stripped resume fields | Still stripped (defense in depth) — verified live |

Clients: `src/lib/profile/resolve-resume-url.ts` + an inline twin in
`public/html/profile.html` resolve the proxy path once via `?json=1` before
pdf.js (range requests then hit Supabase directly; signed URLs send
`access-control-allow-origin: *` and support Range — verified with curl).
`<img>`, `<iframe>` (onboarding preview) and "Open original" ride the 307.
`ResumeViewerMobile`, `pdfjs-cdn.ts` updated; `ProfileMobile`,
`OnboardingMobile`, `onboarding.html` needed no change (URL is opaque).

Two traps caught in review:
- Desktop `saveProfileToStorage` only kept `data:`/http(s) URLs — it would
  have dropped every proxy-path doc on the first edit and synced
  `resume_url: null`. Fixed.
- The proxy originally applied row-membership to the owner too, which
  would have 404'd the onboarding preview right after upload (row not
  saved yet). Owner may fetch any key under their own prefix now.
- Bonus: desktop adopts the server key after sync instead of re-sending
  the `data:` URL (and re-uploading up to 8 MB) on every later edit.

## §2 — Migration record (all against prod, all verified)

1. Migration applied via management API (curl — Python urllib gets a
   Cloudflare 1010 block) + `schema_migrations` row.
2. `node scripts/migrate-resumes-to-private.mjs --copy` → 39/39 objects
   (4 referenced + 35 orphans; orphans moved too so nothing un-redacted
   stayed public — unreachable via the proxy since no row references them).
3. Deploy `9b7c7d1`; waited for `/api/resume/<key>` to answer 401.
4. `--rewrite` → 3 rows; `--cleanup` → 39/39 public copies deleted.
5. Final state: `profiles` has 0 resume objects, `resumes` has 39, 0 rows
   with legacy URLs, dry run clean. Old public URL → 400; private bucket
   public path → 400; route anon → 401 (both modes); bad key → 404;
   traversal → 403; anon bootstrap → no resume refs; anon bucket list → `[]`.

Script is idempotent — re-run with no flags any time for a health report.


## §2b — A2: uploads size-bound and rate-limited (commit `876e540`, migration `20260904110000` applied live after the deploy)

| Area | Before | After |
|------|--------|-------|
| R2 presigned PUTs (clips, message media, group photos, org assets) | `sizeBytes` validated but not bound; a client could PUT any length | `lib/r2.ts` signers REQUIRE `contentLength` (positive safe integer) → `ContentLength` on `PutObjectCommand` → `X-Amz-SignedHeaders=content-length;host`. R2 403s any body whose length ≠ declared. Proven live with the scratchpad `r2-presign-check.mjs --live` (5-byte OK, 6-byte 403, undersized 403, cleaned) |
| Rate limits | none on any upload route | `upload:<route>:<uid>` via `rateLimit`: clip / messages / group-photo / org-upload-url 20 per 10 min; profile-upload 30; profile-sync 20 **only** when the body carries an inline `data:` avatar/banner/resume |
| `profiles` bucket writes | user cookie client + owner INSERT/UPDATE/DELETE storage policies → any signed-in user could PUT via the Storage REST API with the anon key, skipping every route cap | service role only (`profile-upload`, `storage-upload.ts`); policies dropped by 20260904110000 (only `profiles_select_own` + `public=true` remain). Deploy-order constraint: code first, then migration — done in that order |
| Size checks | `Number.isFinite` | `Number.isSafeInteger`; "Invalid file size" vs "too large" split |
| Desktop re-upload churn | avatar / cover `data:` URLs re-sent on every later edit (the DOM is the page's real state) | `_adoptServerMediaRefs` swaps the DOM to the server's https URL after each sync (mirrors the resume adoption) |

Clients: no changes needed — every caller PUTs the same File it declared (`sizeBytes: file.size`, `body: file`). SDK surprise: `@aws-sdk/s3-request-presigner` marks `content-type` unsignable, so Content-Type was never and still is not enforced by the signature; type validation stays in the routes.

Verified live after deploy + migration: policies = `profiles_select_own` only; anon direct upload to `profiles` / `resumes` → 400; anon upload routes → 401; public avatar read → 200; `next build` + tsc clean.

Not verified (needs a session): a real clip / DM photo / org logo upload end-to-end after the binding (expected fine), and a 429 after 21 signer calls. Low notes from verifiers: a couple of clients show a generic "Upload failed" on 429/403; `applyLogoFromInput` can double-upload a logo if a debounced save fires mid-upload (one extra object, not per flush).


## §2c — A3: school-email verification scoped to IU (commit `df4858c`)

- New client-safe helpers `src/lib/auth/school-email-domains.ts`: `parseSchoolEmailDomains` / `schoolEmailDomains()` (env `SCHOOL_EMAIL_DOMAINS`, comma list, trim/lowercase/strip `@ . *`, dedupe; blank → default `iu.edu, iupui.edu`), `schoolEmailHost` (exactly one `@`, ASCII host regex, punycode rejected, trailing dot stripped), `isSchoolEmail` (host === domain or subdomain), `normalizeSchoolEmail`, `schoolEmailDomainsLabel` ("@iu.edu or @iupui.edu"). `school-email-token.ts` re-exports; `isEduEmail` kept as deprecated.
- Request route: canonical address, 400 `Use your IU email address (@iu.edu or @iupui.edu).` for other hosts. Confirm route: re-checks the allowlist AFTER the idempotent already-verified branch (a 48 h token minted for a non-IU address before the deploy cannot verify; existing verified rows never modified).
- School-email page copy/placeholder say IU. No migration. Env var not set on Vercel (default applies); add `indiana.edu` there if Bloomington users are expected.
- Verified by a 3-agent workflow (bypass + regression lenses clean; 25-case proof against the real module). Low, pre-existing: request endpoint reveals whether an address is already linked (409 vs 200).


## §2d — Server-side redaction (commit `db67ae8`, migration `20260905100000` applied live after the deploy)

Closes the A1 residual: non-owner viewers only ever receive a derivative with the bars burned in, and never receive bar geometry.

| Piece | What it does |
|------|--------------|
| `src/lib/profile/resume-redact.ts` | `renderRedactedDocument({bytes, contentType, bars})`. PDF: PDFium (`@hyzyla/pdfium` WASM) rasterises each page (Letter → 1275×1650, cap 20 pages, serial), bars painted opaque black into the RGBA buffer (floor/ceil-snapped), `sharp` JPEG q85, `pdf-lib` re-wraps an image-only PDF at the source page size in points. Images: sharp decode (EXIF applied) → paint → same format. Throws on any failure. |
| `resume-storage.ts` `resolveResumeKeyForViewer(ownerRow, key)` | docIndex from the same portfolio order the clients use (`resume_docs`, else `[resume_url]`); no bars → original key; else `<uid>/redacted/<sha256(key|canonical bars)[:20]>.<ext>` — list-checked, rendered + uploaded (upsert) on first view. Never falls back to the original. `purgeRedactedDerivatives(uid)` used by profile-sync when docs/bars change. |
| `GET /api/resume/[...path]` | non-owner → derivative signed; render failure → 503 `Document is being prepared` (+ retry-after 5); owner path unchanged; `runtime nodejs`, `maxDuration 60`. |
| `users/[handle]/bootstrap` | row read with the service role for everyone; signed-in non-owners get `resume_redactions: []`; external-link docs that carry bars are hidden (can't redact a file we don't host); `resume_url` nulled when the portfolio is docs-based. |
| Migration `20260905100000` | `REVOKE SELECT (resume_url, resume_docs, resume_redactions) ON users FROM authenticated` — the route strip was bypassable via PostgREST; all readers are service-role now; UPDATE grants stay (cookie-client writes use return=minimal). **Deploy order: code first, then migration** (done in that order). |
| Desktop `profile.html` | `.doc-page-wrap` follows the real page aspect (`--page-aspect` from the rasterised image, `object-fit: fill`) instead of a forced 8.5/11 centre-crop — bars on non-Letter pages now match the server and mobile. Visitors' stale bars reset. |
| Mobile | visitors get `bars=[]`, `editable=false`; "Open original" → "Open file" (opens the derivative). |
| `next.config.ts` | `serverExternalPackages: ['@hyzyla/pdfium','sharp','pdf-lib']`, `outputFileTracingIncludes` for the 3.9 MB `pdfium.wasm`. Deps pinned exactly. |

How it was built: bake-off workflow (pdfjs-dist + @napi-rs/canvas vs PDFium-WASM + pure JS, both on the founder's real resume) → WASM chosen (no native binary, one asset, built-in fallback fonts; pdf.js renders tofu if `disableFontFace` is ever false). Then an 11-agent workflow: lib → wiring + clients → security / geometry / regression lenses → fix → critic. Round 1 found the two Highs above (column grant bypass, Letter-crop geometry); round 2 clean; critic added the `resume_url`/`resume_docs` grant leak.

Proof: `scratchpad/redact-proof.mjs` (run with cwd = repo, `node --conditions=react-server`) renders the founder's doc 0 with the row's real bars: 68 ms warm, pixels inside bars 0,0,0, output PDF 0 fonts / 0 text operators. Render stack decision recorded in memory.

Residuals (accepted, documented in the route comment): owner still gets the original; a signed URL to an original minted before bars were added stays valid ≤ 300 s; a hosted key duplicated in two `resume_docs` slots resolves to the first; owners who drew bars on non-Letter pages from desktop before this change should re-check them (they were stored against a cropped box).

Not verified live (needs a second account): first view of a redacted doc as a viewer on prod — the wasm must be traced into the lambda or viewers get 503 (owner path unaffected). A4 must purge `resumes/<uid>/redacted/*` too — Supabase `list()` is non-recursive, so purge the subfolder explicitly.


## §2e — A4: consent capture + deletion purge (commit `0f39bcc`; migrations `20260906100000`, `20260906120000` applied before deploy; `20260906110000`, `20260906130000` applied after)

**Consent model**
- Signup checkbox (18+ AND Terms + Privacy, one attestation) → `signUp options.data { terms_version, age_attested: true }` → `handle_new_user()` stamps `terms_version`, `terms_accepted_at`, `age_attested_at` only when BOTH are present and well-formed; also inserts a `terms_acceptances` row (source `signup`).
- `public.terms_acceptances` = append-only ledger (RLS on, no policies, service-role only, cascades on account delete). `/api/me/accept-terms` (interstitial) inserts a row then stamps the users row.
- `hasRecordedConsent(row)` (lib/legal/terms.ts) = all three columns + `terms_version === TERMS_VERSION` ("2026-05-07", the Terms effective date). Bumping `TERMS_VERSION` re-prompts everyone; the DB predicate `has_recorded_consent()` only checks "any recorded consent", so a bump never blocks writes at the DB layer.
- Gates: server pages (onboarding, classic onboarding, every `enforceCampusAccess` page, school-email layout) → `/auth/terms?next=…`; APIs → 403 `{code:"terms_required"}` via `requireTermsAccepted` on every content/identity write (posts, comments, reposts, messages, threads, events, orgs, uploads, profile writes, handle, reports, reminders, personal events, school-email request, onboarding-complete, profile-bootstrap); static shells + both onboarding clients follow the 403. `/settings` is deliberately NOT gated so a user who declines can still delete (link on the interstitial). Reads and light social actions (like, follow, RSVP) stay open by design.
- DB boundary (20260906130000): `has_recorded_consent()` AND-ed into INSERT policies for posts, post_comments, post_reposts, events, channels, messages (both) and the posts UPDATE policy. `otto_answers` UPDATE revoked from authenticated (20260906110000); onboarding-complete writes it via service role.
- All 8 existing users had NULL consent → they see the interstitial once.

**Deletion**: `DELETE /api/me` → `purgeUserUploads(uid)`: `profiles/<uid>/**` (recursive; posts/, posters/, logos/), `resumes/<uid>/**` (incl. redacted/), R2 `clips/<uid>/*` (`deleteR2Prefix`, guard `^clips/<uuid>/$`), R2 keys of messages the user authored (`deleteR2Keys`, guard `^messages/<uuid>/…`) → then `auth.admin.deleteUser` (33 FKs cascade, 4 SET NULL) → sign out. Purge failure = 500 and NO deletion (idempotent retry). Proof: `scratchpad/purge-proof.mjs` (seed fake prefixes → purge → all zero, controls survive).

**Verified live**: consent columns + ledger service-role only (has_column_privilege / has_table_privilege false for authenticated and anon); trigger has consent logic and inserts history; EXECUTE grants intact; after the post-deploy migrations: policies carry `has_recorded_consent()`, `otto_answers` UPDATE false.

**For the lawyer (A6)** — what we record: attestation checkbox text, server timestamp, Terms version. Not recorded: DOB, IP, user agent, the rendered copy. What survives deletion: provider backups for their retention window, Supabase auth audit log entries, Resend email logs, org/channel rows the user authored (owner set to NULL), report bodies they filed (reporter set to NULL), rate-limit counters (expire in a day). Decide: Privacy Policy versioning; whether consent records should outlive the account (today: cascade); handle reuse after deletion.

**Residuals (Low)**: settings handle-change shows the raw 403 text without a link (campus pages redirect anyway); `post_reposts_update_own` / `events_update_creator` are not consent-predicated at the DB (routes are); a heavy account with thousands of objects could exceed the function duration (purge is idempotent, retry works); deletion is refused in any environment without R2 configured (fail-closed by design).


## §2f — A5: Supabase Auth settings (2026-09-06)

Read and changed through the management API (`GET/PATCH /v1/projects/<ref>/config/auth`):
- `password_min_length` 6 → **8** (briefly 12, reverted 2026-09-07 at Franky's request); client-side max 20 on signup + update-password (no server max exists in Supabase Auth). UI hints + `supabase/config.toml` synced.
- `password_hibp_enabled` (leaked-password protection) → **blocked: HTTP 402 "available on Pro Plans and up"**. The org `Vibe` is on the **free** plan (`GET /v1/organizations/<id>` → plan: free). Franky's decision 2026-09-06: **stay on Free for now**, so HIBP is deferred; once upgraded the one-line PATCH `{"password_hibp_enabled": true}` (or the dashboard toggle) finishes it.
- Confirm email is OFF (`mailer_autoconfirm: true`), no custom SMTP, built-in mailer limited to 2 emails/hour (`rate_limit_email_sent: 2`). Do NOT flip Confirm email before SMTP is configured or signups stall.
- **Completed 2026-09-06:** Franky configured Resend SMTP in the dashboard; the agent verified via API (host smtp.resend.com, port 465, user resend, sender noreply@connectvibe.app, password set), raised `rate_limit_email_sent` to 30, applied branded templates + subjects via `PATCH /config/auth` (source: scratchpad `auth-templates-final.json`; expiry copy matches `mailer_otp_exp` = 3600 s), and Franky turned Confirm email ON (`mailer_autoconfirm: false` verified). First test email landed in Gmail spam → cause: no DMARC; Franky enabled Cloudflare DMARC (`v=DMARC1; p=none; rua=…dmarc-reports.cloudflare.net`) — DKIM (`resend._domainkey`) and SPF/MX on `send.connectvibe.app` were already present. Second test sent after DMARC; inbox placement pending Franky's confirmation.
- **Closed 2026-09-07:** Cloudflare Email Routing enabled — MX route1/2/3.mx.cloudflare.net + apex SPF `v=spf1 include:_spf.mx.cloudflare.net ~all` added by Cloudflare; rule `hello@connectvibe.app` → fgcazares04@gmail.com (verified destination); Resend's `send.` records untouched. Test sent via Resend API. HIBP deferred (Free plan).
- Original dashboard steps, for reference: Auth → SMTP Settings → enable custom SMTP: host `smtp.resend.com`, port `465`, username `resend`, password = Resend API key (same key as `RESEND_API_KEY`), sender email `noreply@connectvibe.app`, sender name `Vibe` (domain already verified in Resend — the app sends school-verification mail through it). Then Auth → Rate limits → emails sent per hour to ~30. Then Auth → Providers → Email → **Confirm email ON**. The signup page already handles the no-session-after-signup case ("Check this inbox…"), and `getAuthEmailCallbackUrl` handles the confirmation redirect.


## §2g — A6: legal drafts written (2026-09-07), awaiting Franky + reviewer

- Drafts in `handoffs/legal-drafts/`: `2026-09-07-privacy-policy.md` (~6.8k words), `2026-09-07-terms-of-service.md` (~5.8k words), `2026-09-07-reviewer-questions.md` (one page, six questions). Produced by a 13-agent workflow (3 readers incl. a code data inventory → 2 writers → 3 lenses → revision → reviewer sheet) plus a 9-agent second revision (3 editor passes, claims-vs-code + consistency lenses). Every factual claim was checked against the code; the drafts disclose today's behaviour and mark fixes as **[DECISION: …]** (founder/product) or **[REVIEWER: …]** (counsel).
- Orchestrator decisions applied: no "mobile app" language; no breach-notice day count (reviewer confirms Ind. Code 24-4.9); signed-link TTLs stated as in code (resumes 300 s; post/org media 3600 s; message media/group photos 300 s); events only by verified-org owners/admins; RSVP status incl. "no" visible to all signed-in users; no ban list exists (disclosed in both docs); only the Terms carry a version.
- Product backlog the drafts surfaced (each is a [DECISION] "fix in code, then simplify"): image-post deletion leaves the image file; per-message deletion leaves media; no comment deletion UI (DB policy already allows it); replaced avatars/banners/logos linger; no retention window for notifications / profile views / reports; message/channel report entry points missing in UI; the post share-link preview exposes author + 137 chars + poster frame to anonymous visitors.
- Known open wording gap (Medium, left for reviewer): Terms §4 license-survival sentence vs §9 surviving records (orgs/channels/reports).
- **To publish:** Franky resolves the [DECISION] markers (or accepts defaults), reviewer answers the six questions, then a code change replaces `src/app/legal/privacy/page.tsx` + `terms/page.tsx` with the final text, sets `effectiveDate` to the publish date and bumps `TERMS_VERSION` in `src/lib/legal/terms.ts` to the same date in the SAME deploy — otherwise nobody is re-prompted. No migration needed.


## §2h — IU-wide campuses (commit `91e322a`, 2026-09-07) — no migration

**Why:** IU issues @iu.edu university-wide, so A3's allowlist proves IU membership, NOT campus. Franky's decision: Vibe is **IU-wide**, campus is **self-declared** (`users.school`, canonical label), never verified → a relevance filter and ranking signal, **never a privacy boundary**.

| Surface | Rule | Where |
|---|---|---|
| Orgs, events | **Hard scope** to viewer's campus; `?campus=<id>` / `?campus=all`; no campus set → show everything | `lib/iu/campus-scope.ts`, `api/orgs/route.ts`, `api/orgs/[slug]/route.ts`, `api/events/route.ts` |
| Feed, people | **Rank only** — same-campus ×1.35 (below the ×1.6 follow boost); inert when no campus | `api/feed/route.ts`, `api/me/suggested-connections/route.ts` |
| Badge | campus label, else `"IU verified"` (was rendering the literal `"iu.edu"`) | `lib/iu/campuses.ts` `campusBadgeLabel`, `build-vibe-user-v1.ts` |
| Pickers | onboarding (desktop + mobile), profile editor (desktop + mobile), Settings `CampusCard` | 5 client files |

- Storage is the **label** (not the id) because existing code compares `school` with equality and renders it directly. `orgs.school` and `users.school` both predate this and are already in the column grants — **no migration**.
- **Campus-less rows appear in EVERY campus view** (`school.eq."<label>",school.eq."",school.is.null`) so the 5 live orgs (all `school=''`) don't vanish.
- Events take their campus from the **org**, falling back to the creator for org-less events; two queries merged because PostgREST can't OR across two embedded relations. Org-id resolution uses the **service client** so private orgs' events aren't silently dropped; the events themselves still read under the viewer's RLS.
- Clients **omit** `school` unless the user touched the picker, so a stale tab can't blank a campus set elsewhere.

**Two latent bugs this fixed** (both from reading an unpopulated column as a filter): `/api/events` fell back to `creator_id = you` when `school` was empty (you only saw your own events); `/api/me/suggested-connections` tier 3 was gated on the viewer *having* a school, so it returned nothing for all 8 users.

**Known follow-up:** `src/lib/iu/majors.ts` is IU **Indianapolis**-specific (Herron, no Jacobs). A Bloomington student now picks a campus but still gets the Indianapolis school/major list. Needs per-campus taxonomies, or a generic fallback.

## §3 — Not yet verified / accepted residuals

- [ ] **Signed-in smoke test (Franky, phone + desktop):** open own profile →
      resume renders; view another user's resume; onboarding upload preview;
      desktop `/profile` viewer + redaction bars still line up. No session
      was available to the agent, so this is the one path not exercised live.
- (Closed by §2d) Redaction bars are burned in server-side for viewers.
- 35 orphaned objects now sit in private `resumes`. **Add to A4:** account
  deletion must purge `resumes/<uid>/*` as well as `profiles/<uid>/*` and
  `clips/<uid>/*`. Optional one-off: purge keys no row references.
- Pre-existing split unchanged: desktop syncs only `resumePortfolio[0]` as
  `resume_url`; mobile writes `resume_docs`. Bootstrap prefers `resume_docs`.
- A direct `/html/profile.html` visit with a pre-migration localStorage cache
  posts the old public URL once; the server maps it to the key. Self-heals.
- (A2 done) `profile-upload` and every other upload route are now rate-limited.

## §4 — Pick-up list (A1–A4 done)

- [x] A1 private resumes + signed URLs.
- [x] A2 upload signers: rate limit + size binding, plus `profiles` writes server-only.
- [x] A3 scope .edu verification to IU via `SCHOOL_EMAIL_DOMAINS`.
- [x] A4 signup legal + deletion purge (incl. `resumes/<uid>/redacted/*` and message media).
- [x] A5 Supabase Auth: min length 8, Resend SMTP, rate limit 30/h, branded templates, Confirm email ON, DMARC added. HIBP deferred (Free plan). hello@ now forwards to Gmail via Cloudflare Email Routing.
- [~] A6 legal wording: code-accurate drafts written (see §2g); Franky decisions + reviewer questions pending; publish = replace pages + bump TERMS_VERSION.
- Then §B (sentinel per milestone), §C (before app store), §D (product list).

### Session kickoff prompt

> Read the latest handoff (`handoffs/2026-09-04-session-53-private-resumes.md`). The hardening sprint A1–A4 is done. Next: re-run the security sentinel against the current code as the milestone check (`Workflow({scriptPath: ".claude/workflows/security-sentinel.js", args:{date, site}})`), fix any Medium+, then start §C (throttle likes/reposts/reactions/views and the remaining write endpoints; CSP report-only; Sentry PII scrub; drop x-powered-by). Orchestrator mode with ultracode workflows; commit and push as you go.
