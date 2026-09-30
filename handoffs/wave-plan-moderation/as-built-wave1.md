# Moderation wave 1 — as built

What wave 1 actually shipped, read off the code on `main` (5c1c8c1, 85683bf, f537aee, acf9ad4, 9213929, c097306). Wave 2 builds screens against this.
Where the code and the plan disagree, the code wins.

**Migration status.** `supabase/migrations/20260923090000_moderation_foundation.sql` is applied to the LOCAL test copy only. Production does not have
it. Every shape below was read from the local database or from the route that writes it.

**Shared gate.** Every `/api/admin/*` route calls `requirePlatformAdmin()` (`src/lib/auth/require-platform-admin.ts`). Signed out → 401
`{ok:false,error:"Unauthorized",code:"unauthorized"}`. Signed in, not an admin → 403 `{ok:false,error:"Forbidden",code:"platform_admin_only"}`. Same
403 when the service role is not configured. Every other admin error is `adminFail(status, code, error)` → `{ok:false, error, code}`.

**429 has no `code`.** `tooManyRequests` answers `{ok:false, error:"<sentence>"}` with a `retry-after` header. Reads: 240 per 10 min, per admin, per
route key. Writes: 60 per 10 min on ONE shared key `admin-write:<id>`, so the budget is across all moderation writes. Club hide/verify keep their own
keys at 30 per 10 min.

**Server page gate.** `requirePlatformAdminPage(path)` → returns the admin's user id; signed out redirects to `/auth/login?next=<path>`, anyone else
gets `notFound()`. Wave 2's screens use this. `/admin/page.tsx` still has its own inline check that `redirect("/campus")`s — converting it is wave 2's
job (batch F).

---

## 1. The admin API

### GET /api/admin/reports?status=&cursor=&limit=
`status` is `open` | `actioned` | `dismissed` (default `open`). `limit` caps at 25. `cursor` is the shared follow keyset (`created_at desc, id desc`).

200: `{ok:true, groups:[…], next_cursor: string|null}`. One group per reported thing:

- `target.type` — `post|comment|message|user|channel|org|event`.
- `target.id` — uuid.
- `target.snapshot` — jsonb or null. The reported row's text/media as of the moment the report was filed, plus `owner_handle` / `owner_name` when the
  reported thing isn't a person.
- `target.live.exists` — false when the row is gone from its table.
- `target.live.removed` — `removed_at` is set. Always false for `user`, `org`, `event`, `channel`.
- `target.live.hidden` — already out of sight for ordinary students: a hidden club's post/event, a private or hidden-club chat or message, a comment
  whose PARENT POST was removed. For `type:"user"` it means "a restriction is in force on them".
- `target.live.hiddenKnown` — true for every type except `user`; for `user` it is false when the restriction read failed. **A false here means "we
  could not tell", never "visible".**
- `owner` — `null`, or `{id, handle|null, name|null, restriction, restrictionKnown}`. `restriction` is the `ActiveRestriction` object or null;
  `restrictionKnown:false` means the read failed.
- `reports[]` — up to 20, newest first: `{id, reason, details, reporterHandle, createdAt}`. `reason` is the picker CODE (`reports.reason_code`);
  `details` is the student's own words (`reports.reason`), `""` when empty. `reporterHandle` is a handle or null — no reporter id, name or email on
  any path.
- `openCount` — open reports on this target counted across every status, so it is right on the actioned tab.

Paging is over reports, not targets, so one target can appear on two pages with the same `openCount` and the same list. **Key groups by
`${type}:${id}` and let the duplicate collapse.**

Errors: 400 `invalid_status`, 400 `invalid_cursor`, 401, 403, 429, 500 `request_failed`. Logs nothing to `moderation_actions` (it is a read).

### POST /api/admin/reports/resolve
Body `{reportIds: string[] (1–100 uuids), resolution: "actioned"|"dismissed", note?: string (≤2000)}`. 200: `{ok:true, resolved, unchanged, missing,
logged}` — counts, all numbers. Already-resolved rows are left exactly as they were and counted in `unchanged`; ids that don't exist are `missing`.
Idempotent. Errors: 400 `invalid_body`, 401, 403, 404 `not_found` (none of the ids exist), 429, 500 `request_failed`. Logs one `moderation_actions`
row when `resolved > 0`: action `report_action` or `report_dismiss`, `meta {report_ids, resolution, resolved, unchanged, missing}`.

### POST /api/admin/content/remove
Body `{type: "post"|"comment"|"message", id: uuid, reason: string (required, ≤500), reportIds?: uuid[] (≤100)}`. 200: `{ok:true, changed: boolean,
resolvedReports: number, logged: boolean}`. Idempotent — already removed is `changed:false` and still closes reports. It also closes the reports it
answers as `actioned`: the named ids, or every open report on this content when none are named. **Only reports about THIS content are ever touched.**
Errors: 400 `invalid_body`, 401, 403, 404 `not_found`, 429, 500 `request_failed`. Logs `post_remove` / `comment_remove` / `message_remove` with `meta
{changed, already_removed, resolved_reports, resolved_report_ids, author_id}`.

### POST /api/admin/content/restore
Body `{type, id, reason?: string (≤500, log only)}`. 200: `{ok:true, changed, logged}`. Idempotent. **It does not reopen the reports.** Errors: same
list as remove. Logs `*_restore` with `meta {author_id, previous_reason, removed_at}`.

### GET /api/admin/users?q=&cursor=&limit=
`q` matches handle or name (ILIKE); a `q` containing `@` is matched EXACTLY against `email` and `school_email` and returns at most one account with
`next_cursor: null`. `limit` caps at 25. 200: `{ok:true, users:[{id, handle, name, school_verified, restriction, restrictionKnown, openReportCount}],
next_cursor}`. **No email is ever returned.** The search text is never logged or echoed. Errors: 400 `invalid_cursor`, 401, 403, 429, 500
`request_failed`.

### GET /api/admin/users/[id]
200: `{ok:true, user:{id, handle, name, school_verified, is_platform_admin, createdAt, restriction, openReportCount}, restrictions:[…], actions:[…]}`.
`restrictions` is up to 50 `account_restrictions` rows, newest first, with columns `id, key_kind, kind, starts_at, ends_at, reason_code, note,
created_by, created_at, lifted_at, lifted_by`. **`identity_key` is never returned.** `note` IS returned here — it is the private admin note. `actions`
is up to 50 merged log rows: the `target_type='user'` rows about them PLUS every takedown of their own posts/comments/messages (matched on
`meta->>author_id`), newest first, each with `actorHandle` added. `is_platform_admin` is there so the screen can grey out Restrict. Errors: 400
`invalid_id`, 401, 403, 404 `not_found`, 429, 500 `request_failed`. A failed restriction read is fatal here (500), deliberately.

### POST /api/admin/users/[id]/restrict
Body `{kind: "suspension"|"ban", days?: number, reasonCode: string, note?: string (≤2000)}`. `days` is required and 1–365 for a suspension; sending
`days` with a ban is a 400. `reasonCode` is checked for SHAPE only (`/^[a-z][a-z0-9_]{1,39}$/`) — there is no allow-list in the route or in the
column, so the picker must send one of `RESTRICTION_REASON_CODES` or the student reads the generic fallback. 200: `{ok:true, kind, endsAt:
string|null, restrictionId, incomplete: string[], logged}`. `incomplete` names the steps that failed after the rows landed: `"app_metadata"`,
`"auth_ban"`, `"billing"`. **A partial apply is a 200, not an error — the student IS restricted; name the step to retry.** Errors: 400 `invalid_body`,
400 `invalid_id`, 401, 403 `cannot_restrict_self`, 403 `cannot_restrict_admin`, 403 `already_restricted`, 404 `not_found`, 409 `no_identity`, 429, 503
`not_configured`, 500 `request_failed`. One restriction at a time: lift before changing. Logs `user_suspend` / `user_ban` with `meta {handle, days,
ends_at, restriction_id, has_note, incomplete}` — never the note itself.

### POST /api/admin/users/[id]/lift
Body `{note?: string}` — optional, an empty POST is fine. 200: `{ok:true, lifted: number, incomplete: string[], logged}`. Idempotent: lifting nothing
is `lifted: 0` and writes no log row. Errors: 400 `invalid_id`, 401, 403, 404 `not_found`, 429, 503 `not_configured`, 500 `request_failed`. Logs
`user_lift` with `meta {handle, lifted, has_note, incomplete}`. Lifting does not bring a cancelled Vibe+ subscription back.

### GET /api/admin/actions?cursor=&limit=
The whole moderation log, newest first. `limit` caps at 50. 200: `{ok:true, actions:[{id, actorId, actorHandle, action, targetType, targetId,
reportId, reason, meta, createdAt}], next_cursor}`. `actorHandle` is null when the moderator's account is gone. Errors: 400 `invalid_cursor`, 401,
403, 429, 500 `request_failed`.

### The club routes (pre-existing, rewired in 9213929). `[slug]` is the org HANDLE, not a slug column.
- `GET /api/admin/orgs` → `{ok:true, orgs:[…]}` with `hidden`, `hidden_at`, `join_policy`, `audience`, `member_count`, `dormant`. Up to 500. Hidden
  clubs stay listed here and only here. 500 `load_failed`.
- `POST …/[slug]/verify` body `{verified: boolean}` → `{ok:true, org:{id,handle,verified}, logged}`. 400 `invalid_body`, 404 `not_found`, 500
  `update_failed`. Logs `org_verify` / `org_unverify`.
- `POST …/[slug]/hide` body `{hidden: boolean}` → `{ok:true, org:{id,handle,hidden_at}, hidden, revoked_invites, changed, logged}`. Same errors.
  Hiding revokes pending invites and deletes their notifications; unhiding does not bring them back. Logs `org_hide` / `org_unhide`.

---

## 2. POST /api/me/reports — the only way a report is filed

Body (snake_case is canonical; camelCase aliases are read too): `{target_type, target_id, reason_code, reason?}` — aliases `targetType`, `targetId`,
`reasonCode`, `details`.

- `target_type`: `post`, `comment`, `message`, `user`, `channel`, `org`, `event` (the widened CHECK).
- `reason_code`: exactly `spam`, `harassment`, `sexual`, `hate`, `self_harm`, `other`.
- `reason`: the student's own words, trimmed to 1000 characters. Optional.

200: `{ok:true}` — and nothing else, including for a duplicate. 400 `{ok:false,error:"…"}` (no `code`): `Invalid target_type`, `Invalid target_id`,
`Invalid reason_code`, `You can't report yourself`, `You can't report something of your own`. 401 Unauthorized · 403 `terms_required` or
`account_restricted` (an UNVERIFIED student may report; a restricted one may not) · 404 `{ok:false,error:"That's not there anymore"}` when the
reporter's own RLS can't see the target · 429 · 500 `Request failed`.

**Before the migration (production today):** the row is still filed, without `target_owner_id` and `target_snapshot`. A report on a `comment`, `org`
or `event` hits the old `target_type` CHECK and comes back **400 `{ok:false, error:"You can't report that yet. Try again after the next update."}`** —
not a 500. The queue, the dedupe and the open-count all degrade honestly in that window.

A second open report by the same student on the same thing answers 200 and writes nothing (`reports_one_open_per_reporter_target`, a partial unique
index on `status='open'`). Every new report emails every platform admin, throttled to one per target per 60 minutes.

---

## 3. The error codes every screen must handle

The table lives twice and must be changed together: `src/lib/feedback/failure-copy.ts` (TS) and `vibeFeedbackInit` in `public/html/_persistence.js`
(static pages). Both already say, word for word:

| status + code | sentence shown | action |
| --- | --- | --- |
| 401 | `You've been signed out. Sign in and try again.` | Sign in → `/auth/login?next=…` |
| 403 `terms_required` | `Accept the Terms first, then try again.` | Review Terms → `/auth/terms?next=…` |
| 403 `school_email_required` | `Verify your school email to post.` | Verify → `/auth/school-email?next=…` |
| 403 `account_restricted` | `Your account is restricted.` | See details → `/account/suspended` |
| 403 `school_email_restricted` | `This school email can't be used on Vibe. Questions: help@connectvibe.app` | none |
| 403 `plus_required` | `That's a Vibe+ feature.` | See Vibe+ → `/plus?next=…` |
| 422 `content_blocked` | `That includes words that aren't allowed on Vibe. Edit it and try again.` | none; carries `field` |
| 503 `restriction_check_failed` | the server's own sentence, passed through | none |
| 429 | `You're going a little fast.` + a retry line | none |

`content_blocked` also returns `field` — the input to point at. A scalar answers `"bio"`, `"name"`, `"headline"`; a list answers the row too:
`"work_experience[1]"`, `"interests[3]"`. Never repeat the matched word anywhere on screen — the API never sends it. The 503 body for
`restriction_check_failed` is `We can't check this school email right now. Try again in a few minutes.`

---

## 4. What "removed" means in the database

Three columns, added to `posts`, `post_comments` and `messages`: `removed_at timestamptz`, `removed_by uuid`, `removed_reason text`. Nothing is
deleted.

**Who can still see the row.** Its AUTHOR, always — that is what carries the "Removed by Vibe moderators" notice and the reason. Nobody else, admins
included, through any ordinary client: the SELECT policies are `(removed_at is null AND …) OR user_id = auth.uid()`. The admin API sees it only
because it reads with the service role. A student cannot clear their own `removed_at`, but the lock differs per table: on `posts` it is the column ACL
(`authenticated` has no UPDATE on the three columns); on `post_comments` and `messages` it is RLS (neither table has an UPDATE policy at all, so no
UPDATE ever passes — the column grants there do exist). The migration asserts both. Do not add an UPDATE policy to either table.

**Removing a post takes its thread with it.** `post_comments_select_authenticated` runs the post's own policy through an EXISTS, so a comment under a
removed post is invisible to everyone but its own author. That is what `live.hidden` on a reported comment is telling you.

**Counts that exclude a removed row:** `post_engagement_counts` (likes, reposts), `comment_like_counts`, and `record_post_view` — which returns false
rather than counting a view. All three also exclude content whose author is restricted (`user_visible`).

---

## 5. What "restricted" means

Two kinds, one table (`account_restrictions`). `kind` is `suspension` or `ban` (CHECK). A suspension MUST have `ends_at` (CHECK); a ban has `ends_at:
null` and never ends. A ban also tears down Stripe/Vibe+ with no refund; a suspension leaves billing running. "In force" = `lifted_at is null AND
starts_at <= now() AND (ends_at is null OR ends_at > now())`. An expired suspension needs no job — it simply stops matching.

**Neither one stops sign-in.** GoTrue's own ban is never set; restricting AND lifting both clear it. What makes a ban stick is `identity_key` — an
HMAC of the canonicalised school address (`+tags` stripped) — which school-email verification tests, so the same school email can't be verified onto a
new account.

**What the proxy does** (`src/proxy.ts`, off `app_metadata.restriction`, which GoTrue returns fresh each request):
- GET / HEAD / OPTIONS always pass. A restriction stops writing, not reading.
- Any non-GET `/api/*` → 403 `{ok:false,error:"Your account is restricted",code:"account_restricted"}`, EXCEPT `/api/auth/logout`, `DELETE /api/me`,
  `/api/billing/portal`, `/api/me/block`, `/api/me/mute`.
- Any page → 307 to `/account/suspended`, EXCEPT `/account/suspended`, `/legal` and `/legal/*`, `/auth/callback`, `/auth/confirm`, and asset requests
  by extension.
- Anything unreadable in the mirror counts as still in force.

**Still allowed to a restricted student:** read anything, sign out, delete their own account, block, mute, read the legal pages. Blocks and mutes are
gated by neither helper, deliberately.

**`/account/suspended`** reads `getActiveRestriction(user.id)` first (the row is the only place the reason lives) and falls back to
`app_metadata.restriction`. Three states: `restricted` (the notice — paused vs closed, the end date formatted in Indiana time, the plain reason line
from `restrictionReasonLine`, the appeal address `help@connectvibe.app`, links to Terms and Privacy, and Sign out / Delete account); `lifted` (row
says free, mirror says restricted — an honest panel with no link to campus, because nothing a browser does clears server-side `app_metadata`); `none`
(redirects to `/campus`). The admin `note` is NEVER shown to the student.

---

## 6. What a screen may call

`src/lib/moderation/reports.ts` — **pure, no `server-only`, safe in a client component.** `REPORT_TARGET_TYPES`, `REPORT_REASON_CODES`,
`REPORT_STATUSES`, `RESTRICTION_REASON_CODES` (arrays); `isReportTargetType(v)`, `isReportReasonCode(v)`, `isReportStatus(v)`,
`isRestrictionReasonCode(v)` (guards); `reportTargetLabel(t): string`, `reportReasonLabel(c): string`, `restrictionReasonLine(c): string`;
`reportReasonOptions(): {code,label}[]`, `restrictionReasonOptions(): {code,line}[]`; `RESTRICTION_REASON_FALLBACK`. Restriction reason codes: `spam`,
`harassment`, `sexual`, `hate`, `self_harm`, `impersonation`, `ban_evasion`.

`src/lib/moderation/access.ts` — **`server-only`.** `getActiveRestriction(userId)` → `{ok:true,restriction:ActiveRestriction|null} |
{ok:false,error}`; `requireNotRestricted(userId)` and `requireCanPublish(userId)` → `NextResponse | null`; `accountRestrictedResponse()`,
`schoolEmailRequiredResponse()`, `contentBlockedResponse(field?)`; `restrictionIdentityKey(canonical)`, `isRestrictionPepperConfigured()`,
`restrictionForSchoolIdentity(email)`, `schoolIdentityConflict(email, excludeUserId)`. Types `RestrictionKind`, `ActiveRestriction`,
`RestrictionLookup`, `IdentityRestrictionCheck`, `SchoolIdentityConflict`.

`src/lib/moderation/actions.ts` — **`server-only`.** `restrictUser(args: RestrictArgs)`, `liftRestriction(args: LiftArgs)`, `removeContent(args:
RemoveContentArgs)`, `restoreContent(args: RestoreContentArgs)`, `logModerationAction(service, entry)`. Types `RestrictionStep`,
`RestrictionFailureCode`, `RestrictResult`, `LiftResult`, `ModerationAction`, `ModerationLogEntry`, `ModerationContentType`, `ContentFailureCode`,
`RemoveContentResult`, `RestoreContentResult`. Note: the two content routes carry their OWN inline copy of remove/restore today. `removeContent` and
`restoreContent` have no caller. Change both halves together, or move the route onto the helper.

`src/lib/moderation/text-filter.ts` — pure. `checkText(text)` → `{ok:true} | {ok:false, category}`; `sameStoredText(next, previous)`;
`checkChangedText(next, previous)`. `FilterCategory` is `slur | threat | sexual_minor`, from `text-filter-list.ts` (`filterTerms()`).
`src/lib/moderation/profile-filter.ts` — `suspectProfileFields(values)`, `blockedAgainstStored(values, stored, suspects)`,
`blockedProfileField(service, userId, values)` → the `field` string for the 422.

`src/lib/moderation/identity.ts` — pure. `canonicalIdentity(email)`, `canonicalSchoolIdentity(email)`, `restrictionIdentityKeyWith(pepper,
canonical)`, `isUsablePepper(p)`, `RestrictionPepperError`, `MIN_RESTRICTION_PEPPER_LENGTH` (32), `IDENTITY_KEY_LABEL`.

`src/lib/moderation/alerts.ts` — `server-only`. `alertAdminsOfReport(alert: ReportAlert)` → `{sent, skipped}`. Never throws.

---

## 7. What wave 2 must not do

1. **Never insert into `reports` directly.** `anon` and `authenticated` have NO grants on `reports`, `account_restrictions` or `moderation_actions`.
   Only the service role reaches them. File through `POST /api/me/reports`.
2. **Never import `access.ts`, `actions.ts`, `alerts.ts` or `require-platform-admin.ts` from a client component.** They are `server-only` and pull in
   the service client. `reports.ts`, `text-filter.ts` and `identity.ts` are pure and safe.
3. **Never treat `restrictionKnown:false` or `hiddenKnown:false` as "not restricted" / "visible".** Say you don't know. That distinction is what stops
   someone being banned twice.
4. **Never write `moderation_actions` from a screen.** The table refuses UPDATE and DELETE (trigger), so a wrong row can never be corrected. Let the
   routes log.
5. **Never show `account_restrictions.note` or `identity_key` to a student.** The note is admin-only; the key is never returned by any route.
6. **Never repeat the filtered word** — it isn't in the 422 body, and it must not be reconstructed.
7. **Never stack a restriction.** `already_restricted` is a 403; lift, then set the new one.
8. **Don't assume `/admin` is gated the same way.** Until batch F converts it, `/admin/page.tsx` redirects a non-admin to `/campus` while
   `requirePlatformAdminPage` 404s them.
9. **Don't build the reports screen against a production database that can take comment/org/event reports.** Until the migration is applied there,
   those come back 400 with the "try again after the next update" line, and `status` / `target_owner_id` / `target_snapshot` do not exist.

**Known gaps, session 64 §8** (`handoffs/2026-09-22-session-64-stripe-redaction-and-moderation.md`). The moderation-adjacent ones: blocked students
can still comment on, save or repost the blocker's posts, and `save` has no rate limit or Terms check; `GET /api/users/[handle]/posts` leaks
hidden-club posts to signed-out visitors through a service-role read; the posts media route has no author exemption; `post_engagement_counts` and
`comment_like_counts` leave platform admins out of the hidden-club rule; `record_post_view` still counts a view on someone else's draft. The rest of
§8 is unrelated to moderation.

**Also open, from the code rather than §8:** `RESTRICTION_PEPPER` does not exist in this project yet — it must be in `.env.development.local` for
local acceptance and in Vercel BEFORE the admin routes ship, or every restrict call answers 503 `not_configured`. The `moderation_alert` email kind is
widened by the same migration, so until it lands in production each admin alert costs one refused send-log insert (the email still sends). The header
comment in `alerts.ts` still says the kind is not accepted — stale; the code and the local CHECK both allow it.
