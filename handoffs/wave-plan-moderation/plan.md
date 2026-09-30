# Moderation v1 — plan and contract (2026-09-22, session 64)

Source of truth for two waves of parallel batches. Code against THIS doc, not another batch's
in-progress file. Where a plan critic's note names your batch, it overrides this doc.

Grounding: the six research maps in
`/private/tmp/claude-501/-Users-franciscocazares-vibe/acc23a42-bc9f-46c5-90c9-5aae080aada9/scratchpad/research_result.json`
(keys: reports, admin, bans, stores — read the one your batch touches), `handoffs/wave-plan-week1/rulings.md`
(standing rules), memory's security model (grants not routes are the boundary; service role for
privileged writes; rate limiters AFTER validation).

## Franky's decisions (2026-09-22) — do not reopen

1. **Suspensions lock the student out; permanent bans survive re-signup.** A suspended or banned
   student sees `/account/suspended` (end date or "permanent", plain reason, appeal address), can
   sign out, read the legal pages and delete their account, and nothing else. Their profile, posts
   and comments are hidden from everyone else while restricted. A ban is keyed on a keyed hash
   (HMAC) of the CANONICAL school email, so deleting the account and signing up again can't
   re-verify that school email.
2. **Removed content shows its author a notice** ("Removed by Vibe moderators" + the reason); it is
   gone for everyone else; it is kept as evidence (soft removal), restorable by an admin.
3. **All three founders moderate** (`is_platform_admin` is already true for frankycazares, james, cqo
   in production — no grant change). **Every new report emails all platform admins.**
4. **Posting, commenting, reposting, messaging, creating chats/events and sending connection requests
   require a verified school email.** Unverified accounts can still sign up, browse, follow clubs,
   like, block, mute and report. (Production: 6 of 20 accounts unverified, none has ever posted,
   commented or messaged.)
5. **Scope:** report anything (comments, messages, group chats, clubs, events — with a reason picker
   everywhere), a word filter on posts/comments/bios/names/messages, Community Guidelines + Child
   Safety pages, a Help/Contact row in Settings. **Contact address: help@connectvibe.app** (Franky adds
   the Cloudflare Email Routing rule; alerts don't depend on it).
6. **Terms text:** the 24-hour review commitment and "zero tolerance" wording go into the Community
   Guidelines page now and into the Terms at the legal-publish step. Do NOT edit the live Terms or
   bump `TERMS_VERSION` in this work.
7. A ban also stops Vibe+ billing (delete the Stripe customer, no refund) — same helper as account
   deletion. A suspension leaves billing alone. A restricted club owner's club is left alone (other
   officers keep running it; an admin can hide the club separately).

## Shared contract

### Error codes (every write route and every client speaks these)
| Status | `code` | When | Student-facing line (failure-copy) |
|---|---|---|---|
| 403 | `terms_required` | existing | existing |
| 403 | `school_email_required` | publishing without a verified school email | "Verify your school email to post." + action "Verify" → `/auth/school-email` (check the real path) |
| 403 | `account_restricted` | a restriction is in force | "Your account is restricted." + action → `/account/suspended` |
| 422 | `content_blocked` | the word filter matched | "That includes words that aren't allowed on Vibe. Edit it and try again." (+ `field` when a form has several) |
Body shape: `{ ok: false, code, error, field? }`. Never echo the matched word.

### Access helpers — `src/lib/moderation/access.ts` (server-only)
- `requireNotRestricted(userId): Promise<NextResponse | null>` = Terms recorded AND no restriction in
  force. For: profile edits (onboarding must keep working unverified), likes, follows, RSVPs,
  saves, views and reports (unverified students CAN report; restricted ones can't — the proxy
  already stops them). Blocks and mutes stay open to everyone signed in, restricted included (the
  proxy exempts them: a restricted student can still protect themselves).
- `requireCanPublish(userId): Promise<NextResponse | null>` = the above AND `school_verified`.
  For: posts (publish + edit), comments, reposts, messages, channel/DM/group creation, events create
  and edit, connection requests.
- Both do ONE service-role read of `users` (terms columns, school_verified) plus the restriction
  check (below), and return the 403 bodies above. `requireTermsAccepted` stays exported and unchanged
  for any route that isn't migrated.
- `getActiveRestriction(userId)` reads `account_restrictions` (user_id, lifted_at null, starts_at <=
  now, ends_at null or > now); newest wins; ban beats suspension.

### Identity — `src/lib/auth/school-email-domains.ts` + `src/lib/moderation/identity.ts`
- `canonicalSchoolIdentity(email)`: lowercase, trim, strip `+tag` from the local part, fold any
  subdomain into its allowlisted registrable school domain (e.g. `x@mail.iu.edu` → `x@iu.edu`).
- School-email verification REFUSES an address whose canonical form is already verified on another
  account (403 `school_email_taken`, existing copy if one exists) — closes the `+2` loophole.
- `restrictionIdentityKey(canonical)`: HMAC-SHA256 with `RESTRICTION_PEPPER` (server-only env, >= 32
  chars), hex. No pepper → restricting fails closed (admin sees "not configured"); verification
  still proceeds if and only if there are zero active `key_kind='school'` rows, else 503.

### Database — one migration `20260923090000_moderation_foundation.sql` (written; applied to the
test copy by acceptance; production needs Franky's yes)
- `reports`: add `status` ('open'|'actioned'|'dismissed', default 'open'), `resolved_by` (users,
  on delete set null), `resolved_at`, `resolution_note` (<= 2000), `target_owner_id` (uuid),
  `target_snapshot` jsonb (text, handles, media urls at report time), `admin_alerted_at`. Widen
  `target_type` to post, comment, user, message, channel, org, event. Keep `reason` codes as they are
  and add missing ones only if the CHECK lacks them (read it). Unique partial index
  (reporter_id, target_type, target_id) where status = 'open'. DROP the student INSERT policy and
  revoke INSERT from anon/authenticated: the route inserts with the service role.
- `moderation_actions` (append-only log): id, actor_id (users, set null), action
  ('report_dismiss','report_action','post_remove','post_restore','comment_remove','comment_restore',
  'message_remove','message_restore','org_hide','org_unhide','org_verify','org_unverify',
  'user_suspend','user_ban','user_lift'), target_type, target_id, report_id (nullable), reason,
  meta jsonb, created_at. RLS on, no policies, no client grants; a trigger refuses UPDATE/DELETE.
- `posts`, `post_comments`, `messages`: `removed_at`, `removed_by`, `removed_reason`. Posts/comments
  SELECT policies hide removed rows from everyone but their author; messages hide removed rows from
  everyone (the sender's client shows a stub from its own send state is NOT required — sender sees
  "Removed by Vibe moderators" only if cheap). Counts (post_engagement_counts, comment counts, feed)
  exclude removed rows.
- `account_restrictions`: id, identity_key (text), key_kind ('school'|'personal'), user_id (users,
  ON DELETE SET NULL), kind ('suspension'|'ban'), starts_at, ends_at (null = permanent; required for
  suspension), reason_code, note (private), created_by, lifted_at, lifted_by, created_at. Service role
  only. Indexes on user_id and identity_key where lifted_at is null.
- Helpers (SECURITY DEFINER STABLE, search_path '', GRANT EXECUTE to anon/authenticated/service_role —
  standing rule): `public.is_restricted_now()` (auth.uid() has a restriction in force; false for anon),
  `public.can_publish_now()` (has_recorded_consent() AND school_verified AND NOT is_restricted_now()).
  AND `can_publish_now()` into the INSERT (and UPDATE where present) policies of posts, post_comments,
  post_reposts, messages, channels, events, connections; AND `NOT is_restricted_now()` into
  users_update_self, rsvps, post_likes? (likes are service-role only already — skip), org_followers
  insert. Leave blocks, mutes, bookmarks, reminders, reports (service role now) open.
- Restricted students' content hidden from others: posts/comments/profile reads exclude authors with
  a restriction in force — via the SELECT policies calling a helper `public.user_visible(uid)` (true
  unless that user has a restriction in force), and via service-role routes checking the same.
- Post-check in the transaction + the standing-rule count. Rollback block. Pre-flight gate comment:
  20260922150000 present (renumber if the billing migration hasn't gone to production first — the
  billing one is test-copy-only today, so production order will be decided at apply time).

### Word filter — `src/lib/moderation/text-filter.ts` (pure, node --test)
`checkText(text): { ok: true } | { ok: false, category: 'slur'|'threat'|'sexual_minor' }`.
Normalize (lowercase, strip accents/zero-width, collapse repeats, leetspeak map, ignore separators
between letters) and match a curated list with word boundaries (avoid the Scunthorpe problem: test
"assessment", "Dickinson", "grape", "therapist"). The list lives in `text-filter-list.ts` as encoded
terms (not plain-readable in the diff is fine but not required). Applied to: post content, comment
text, message text, bio, tagline, name, handle (handles already validated elsewhere — add), club
names/descriptions when created. Reject with 422 `content_blocked`. No auto-report in v1.

### Reports — `POST /api/me/reports` (existing path; keep accepting the body shapes today's clients send)
Body `{ targetType, targetId, reason, details? }`. Order: auth → validate → `requireNotRestricted` →
rate limit (existing, after validation) → target exists and is visible to the reporter (service role +
the same visibility rules; hidden clubs count as missing) → snapshot + target_owner_id → insert (a
duplicate open report = success) → alert admins (below) → 200 `{ ok: true }`. Self-reports refused (400).

### Admin alerts — `src/lib/moderation/alerts.ts`
On a NEW open report for a target with no alert in the last 60 minutes: email every
`is_platform_admin` user's auth email via the existing Resend helper (`src/lib/email/*`, read it),
subject "New report on Vibe", body: target type, reason, count of open reports on it, link to
`/admin?tab=reports`. No reported text in the email. Failure never fails the report.

### Admin API (all `requirePlatformAdmin`, service role, each write logs one moderation_actions row,
rate limited 60/10 min per admin)
- `GET /api/admin/reports?status=open|actioned|dismissed&cursor=` → grouped by target: `{ target:
  {type,id,snapshot,live:{exists,removed,hidden}}, owner:{id,handle,name,restriction}, reports:
  [{id,reason,details,reporterHandle,createdAt}], openCount }`.
- `POST /api/admin/reports/resolve` `{ reportIds, resolution: 'actioned'|'dismissed', note? }`.
- `POST /api/admin/content/remove` and `/restore` `{ type: 'post'|'comment'|'message', id, reason,
  reportIds? }` (remove also resolves those reports as actioned).
- `GET /api/admin/users?q=` (handle, name or email; returns id, handle, name, school_verified,
  restriction, open report count) and `GET /api/admin/users/[id]` (restriction history, recent actions).
- `POST /api/admin/users/[id]/restrict` `{ kind: 'suspension'|'ban', days? (1-365, suspension only),
  reasonCode, note? }` and `POST /api/admin/users/[id]/lift` `{ note? }`: rows keyed on the school
  identity (and the personal email as key_kind 'personal'), mirror to auth `app_metadata.restriction =
  {kind, ends_at}`, ban → GoTrue `ban_duration` '876000h' + delete Stripe customer (reuse the
  account-deletion helper) + sign-out of all sessions if the admin API supports it; lift reverses
  app_metadata and GoTrue ban. Admins can't restrict themselves or another admin.
- Existing `/api/admin/orgs/[slug]/hide` and `/verify` log moderation_actions too.
- `GET /api/admin/actions?cursor=` → the log, newest first.

### Enforcement points
- `src/proxy.ts`: if the session user's `app_metadata.restriction` is in force → page requests go to
  `/account/suspended` (exempt: that page, `/auth/*`, `/legal/*`, logout, static assets); non-GET
  `/api/*` → 403 `account_restricted` (exempt: DELETE /api/me, logout, /api/billing/portal, the block
  and mute routes). Cheap: no DB read in the proxy. The mirror in app_metadata can lag a restriction
  lifted or expired: the proxy compares `ends_at` to now itself, so an expired suspension frees the
  student without an admin action.
- Write routes use the helpers above (the table in the research map `bans` lists them).
- School-email request + confirm + confirm-code: canonical duplicate check; refuse a restricted
  identity with 403 `school_email_restricted` ("This school email can't be used on Vibe. Questions:
  help@connectvibe.app").
- Login page: `user_banned` → "This account can't sign in. If you think this is a mistake, email
  help@connectvibe.app."
- `DELETE /api/me` keeps working for restricted accounts; restrictions survive (user_id set null).

## Waves (file ownership is exclusive within a wave)
- **Wave 1 — foundation (5 batches):** A migration · B `src/lib/moderation/*` + identity in
  school-email-domains.ts + text filter + tests · C content write routes (publish, post PATCH,
  comments, reposts, messages, threads/channels, events, connections, profile-sync, me/profile,
  me/reports) · D auth-side (proxy, school-email routes, login page, /account/suspended page,
  failure-copy) · E admin API routes + require-platform-admin page variant.
- **Wave 2 — surfaces (5 batches):** F /admin UI (tabs Reports · Clubs · Users · Log) · G React report
  entry points + reason picker + author "removed" stubs (campus-home, CampusMobile, PostViewerMobile,
  org page, events, phone messages) · H vanilla report entry points + stubs + school_email_required /
  account_restricted handling (_safetyActions.js, _postViewer.js, messages.html, profile.html) ·
  I legal pages (/legal/community, /legal/child-safety, LegalLayout nav, Settings Help row desktop +
  phone) · J composers' verify-your-email prompts wherever a React composer doesn't already route
  refusals through describeFailure.
