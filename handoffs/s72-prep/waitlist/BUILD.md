# Vibe waitlist + access codes: what to build (Oct 3, 2026)

Branch `landing-night`, worktree `.../scratchpad/landing`. Local stack only. No commit, no push, nothing in
production. This file replaces PLAN.md wherever the two differ. The founder's decisions win over both.

## 0. What changed from PLAN.md, and why

| PLAN.md said | Build this instead | Why |
|---|---|---|
| Invite link `/join?t=<token>` | **Access code** `VIBE-XXXX-XXXX`, typed once in an "Access code" field on `/auth/signup`. The email button opens `/auth/signup?access_code=VIBE-XXXX-XXXX` | Founder decision 2 |
| Button link `?code=` (founder's example) | The URL parameter is **`access_code`**, never `code` | supabase-js treats any `?code=` as a PKCE sign-in callback when a code verifier is in storage (`node_modules/@supabase/auth-js/dist/module/GoTrueClient.js`, `_isPKCECallback`): it would try to exchange the access code as a session code and can wipe the verifier an in-flight confirmation email needs |
| The hook only checks; `handle_new_user` marks the invite used; "a race: log it, don't fail it" | The hook **claims** the code in one atomic UPDATE; `handle_new_user` marks it redeemed | GoTrue runs the hook OUTSIDE the transaction that creates the user (`checkTX` refuses to run inside one; `internal/api/hooks.go` v2.189.0). So the hook's own writes commit on their own, and "check only" lets two people race one code into two accounts |
| Survey, cohort tab, `user_active_days`, `pmf_responses`, heartbeat move | **Not in this build** | Founder decision 6 |
| Invite chain | **Off, not built** | Founder decision 6 |
| Campus field, "declined" state, `/waitlist/leave` page | Dropped. Leaving is a button on `/waitlist/confirm` | Founder's form list (decision 3) has no campus; fewer pages |
| Token in `?t=` | **`?token=`** | `src/lib/sentry-config.ts` already scrubs `token` (and `code`) from URLs and JSON; `t` would reach Sentry |
| 5 form posts an hour per network | **30 an hour per network** | Campus Wi-Fi puts a whole tabling table behind one address; per-address, global and email-budget limits do the real work |
| `invited_by_user_id`, `declined_at`, `campus_id` columns | Not created | Out of scope |
| Code generator in batch B | The **shared, pure** modules (`access-code.ts`, `form.ts`, `types.ts`, `signup-open.ts`) are in batch **A** | B and C run in parallel and both import them; the SQL normaliser in A must match the TS one byte for byte |

## 1. Facts checked for this file (GoTrue v2.189.0 = the local auth image; read from its source at that tag)

- **Payload.** `{"metadata":{uuid,time,name:"before-user-created",ip_address},"user":<the full user model>}`. The user
  model has `email` (already lowercased), `user_metadata` (= `options.data` from `supabase.auth.signUp`, verbatim) and
  `app_metadata` (`provider`, `providers`). So `event->'user'->'user_metadata'->>'access_code'` carries the code.
- **When it runs.** Only when the email has NO account yet: `signup.go` calls it only if `user == nil`. An existing
  address, confirmed or not, never reaches the hook. Password rules are checked before it.
- **Which paths run it.** Public sign-up, `generateLink` type signup/invite, `inviteUserByEmail`, anonymous, OAuth/SSO/
  web3. **`admin.createUser` does NOT** (`admin.go` has no call). So `scripts/demo-seed.mjs`, `scripts/local-seed.mjs`
  and `scripts/seed-review-accounts.mjs` keep working with sign-up closed. Prove it once locally (test E6), because
  production's hosted GoTrue may be a newer version.
- **Its transaction.** Own statement, committed on its own, before the user's insert transaction starts. Timeout 2 s.
  If the user insert then fails (Auth email cap → 429, email send error → 500), the hook's writes stay.
- **Refusal shape.** Return `{"error":{"http_code":403,"message":"..."}}`. supabase-js sends the 2024-01-01 API header,
  so the response is HTTP 403 `{"code":"unknown","message":"..."}`: in the page `err.status === 403`,
  `err.code === "unknown"`, `err.message` = our message. A function that raises gives HTTP 500
  ("Error running hook URI"), i.e. the page's "Something went wrong": the gate fails closed.
- **Enumeration.** No new leak. Today a sign-up with an existing confirmed address already answers differently
  (production returns a user with `identities: []`, and the page shows its "maybe you have an account" view;
  locally it is 422 `user_already_exists`). The hook only runs for new addresses, so it adds nothing to that.
- **Local auth container:** `GOTRUE_MAILER_AUTOCONFIRM=true` (no confirmation emails), no hook configured.
- **SQL hashing:** `encode(sha256(convert_to('7KQ2M9XD','UTF8')),'hex')` =
  `28260557126c16ecfa20c77a89f2da7961bbe4132ee6fc5f5c506b8595f3d165`, same as Node. Built in, no extension.
- **Local migrations:** applied with `docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1
  -f - < file`. The local `supabase_migrations.schema_migrations` stops at `20260926100000` (20 later files were applied
  by hand, unrecorded; S71 L30). Record the two new files with `insert into supabase_migrations.schema_migrations
  (version, name) values (...) on conflict do nothing` (the production recipe's row). Never `supabase db reset`,
  never `supabase migration up`.

## 2. The design in plain terms

1. **The list.** `/waitlist` takes an IU or Purdue school email plus a few answers. The reply is always the same.
   An email with one button confirms the spot; opening the link changes nothing, tapping the button confirms.
2. **Picking.** Founders open `/admin?tab=waitlist`, filter, tick up to 25 confirmed people, name the batch and press
   "Send codes". Each person gets an email with a code and a button. Officers who wrote in are added by hand
   ("Add someone") and can get a code at once, confirmed or not.
3. **The code.** `VIBE-` + 8 Crockford base32 characters (alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, 40 bits),
   shown as `VIBE-7KQ2-M9XD`. Typing is forgiving: case, spaces, hyphens and the `VIBE` prefix are ignored, and
   O→0, I→1, L→1. Only its SHA-256 (of the 8 normalised characters) is stored. Valid 14 days, once. A founder can
   send a new one at any time; the old one dies.
4. **The gate.** A Postgres function, `public.hook_waitlist_gate(event jsonb)`, is Supabase Auth's before-user-created
   hook. In order: sign-up open → allow. Email on `signup_allowlist` → allow. No code → refuse. Code not 8 valid
   characters, or unknown → refuse. Otherwise one UPDATE claims the code for this email (allowed when unclaimed, when
   claimed by the same email, or when the claim is older than 15 minutes) → allow. Else refuse as expired, used or
   in use. Then `handle_new_user()` (same transaction as the new account) marks the code redeemed with the new user
   id. A failure inside that new block is a WARNING, never an error, so it can never block an account.
5. **The switch.** `app_settings` row `signup_open` (jsonb `true`/`false`). Read by the hook, by the site's buttons
   (server, 30-second memo) and by `public.signup_is_open()` (callable by anyone; it is public information).
   Production starts `false`. Locally it is set `true` after applying, so other sessions and the seeds see no change.
6. **Email.** Two new kinds, `waitlist_confirm` and `waitlist_invite`, through `sendLogged()` and Resend, reply-to
   `hello@connectvibe.app`. With no Resend key outside production, the email is not sent; one
   `[waitlist-email:dev]` line in the dev-server log prints the kind, a masked address and the link (and the code),
   so the flow can be finished by hand. A daily budget (`WAITLIST_EMAIL_DAILY_CAP`, default 40, trailing 24 h,
   counted from `email_sends`) protects the Resend free tier's 100 a day, which Supabase Auth's own mail also spends.
7. **Full addresses.** The admin list shows `f*****@iu.edu`. "Show email" works only for user ids listed in
   `app_settings.waitlist_email_viewers` (production: Franky only) and writes a `waitlist_reveal` log row.

### What a refused sign-up looks like (the page maps the reason; it never shows the raw message)
Hook messages start with a machine tag: `[vibe:<reason>] <plain sentence>`. Reasons and the page's copy:

| reason | page says (keeps every field filled, focuses the code field) |
|---|---|
| `access_code_required` | "Vibe is opening in waves. Enter the access code from your invite email." + "No code yet? Join the waitlist" |
| `access_code_invalid` | "We don't recognise that access code. Check it against your invite email." |
| `access_code_expired` | "That access code has expired. Reply to your invite email and we'll send a new one." |
| `access_code_used` | "That access code has already been used to make an account. Not you? Reply to your invite email." |
| `access_code_in_use` | "That code is being used with a different email right now. Use the same email, or try again in 15 minutes." |

Only someone who holds a real code can tell these apart, and 40 random bits can't be guessed through GoTrue's
per-IP sign-up rate limit (about 10^10 tries per hit with ~100 live codes). Accepted risk: if the `waitlist` table itself leaked, unspent codes could be
brute-forced offline from their hashes in minutes. They create one account each and expire in 14 days.

### People already part-way through sign-up
| Who | What happens |
|---|---|
| Has an account (any state: unconfirmed, no school email, mid-Otto) | Nothing changes. The hook never runs for an existing address; resend and re-sign-up with the same address still resend the confirmation |
| On the sign-up form when the gate turns on | Their submit gets the `access_code_required` copy and the waitlist link |
| Typed a wrong account email, then "Start over" with the right one | The code was spent on the first (unconfirmed) account. The page says "used"; a founder sends a new code. Rare; accepted for the pilot |
| Account creation failed after the hook allowed it (Auth email cap) | The claim stays; retrying with the same email works at once, another email after 15 minutes |
| Deleted their account, wants back in | Needs a code (or the switch open). Bans still hold at the school-email step |
| App Review pair | Only sign in. The hook never runs at sign-in. The seed script puts both addresses on the allowlist anyway |

## 3. Fixed interfaces (B and C build against these; nobody renames them)

### 3a. Tables (migration `20261003100000_waitlist.sql`). RLS on, no policies, `revoke all ... from anon, authenticated`
**`public.waitlist`**
| column | type / rule |
|---|---|
| `id` | uuid pk default `gen_random_uuid()` |
| `email` | text not null, lowercase, 3-254 chars, one `@`. The address mail goes to (`normalizeSchoolEmail` form for school addresses) |
| `email_key` | text not null **unique**. `canonicalSchoolIdentity(email)` (src/lib/moderation/identity.ts: `+tags` and subdomains folded) or, for a non-school address added by a founder, the lowercased address. One person, one row |
| `school_system` | text null, `in ('iu','purdue')` |
| `origin` | text not null default `'form'`, `in ('form','founder')` |
| `name` | text not null, 1-80 |
| `class_year` | smallint null, 1-5 (the onboarding scale: 1st..4th year, 5 = 5th+/grad; null = prefer not to say) |
| `major` | text null, ≤80 |
| `clubs` | text null, ≤200 |
| `is_officer` | boolean not null default false |
| `officer_club` | text null, ≤80 |
| `wish` | text null, ≤280 |
| `source` | text null, `~ '^[a-z0-9_-]{1,40}$'` |
| `age_attested_at`, `consent_invite_at` | timestamptz null; check: `origin = 'founder' or (both not null)` |
| `consent_news_at` | timestamptz null |
| `notice_version` | text null |
| `manage_token_hash` | text null **unique**, `~ '^[0-9a-f]{64}$'` (SHA-256 hex of the `?token=` value; rotated by every email to this row) |
| `confirm_sent_at`, `confirmed_at` | timestamptz null |
| `code_hash` | text null **unique**, 64 hex |
| `code_issued_at`, `code_expires_at`, `code_claimed_at` | timestamptz null |
| `code_claimed_email` | text null |
| `invited_by`, `added_by` | uuid null → `public.users(id)` on delete set null |
| `batch` | text null, `~ '^[a-z0-9-]{1,40}$'` |
| `invite_count` | int not null default 0 |
| `redeemed_at` | timestamptz null |
| `redeemed_user_id` | uuid null → `public.users(id)` on delete set null |
| `created_at`, `updated_at` | timestamptz not null default now() |

Index on `created_at desc`. Founder-added rows get `confirmed_at = now()` at insert.

**`public.signup_allowlist`**: `email` text pk (`= lower(email)`), `reason` text not null `in ('review','founder','manual')`,
`note` text null ≤200, `created_at` timestamptz not null default now().

**`public.app_settings`**: `key` text pk, `value` jsonb not null, `updated_at` timestamptz not null default now(),
`updated_by` uuid null. Seed rows: `('signup_open','false')`, `('waitlist_email_viewers','[]')` (a jsonb array of user
id strings). Header comment: "Launch = `update public.app_settings set value = 'true'::jsonb, updated_at = now() where
key = 'signup_open';`".

**Changed rules (same migration):** `email_sends_kind_check` gains `'waitlist_confirm','waitlist_invite'`;
`moderation_actions_action_check` gains `'waitlist_invite','waitlist_add','waitlist_remove','waitlist_reveal'`;
`moderation_actions_target_type_check` gains `'waitlist'`. Each is dropped and recreated by name, after a pre-check
that the current definition equals today's local one (pasted in the file) and aborts otherwise, so a newer production
rule is never silently narrowed.

### 3b. Functions. All `set search_path = ''`, fully qualified names, `revoke all ... from public` first
| function | security | who may execute | contract |
|---|---|---|---|
| `public.signup_is_open() returns boolean` | definer, stable | anon, authenticated, service_role | `coalesce((select value = 'true'::jsonb from public.app_settings where key = 'signup_open'), false)` |
| `public.waitlist_normalize_code(p_code text) returns text` | invoker, immutable | service_role | uppercase; drop every char not in `[0-9A-Z]`; if 12 long and starts `VIBE`, drop those 4; `translate(v,'OIL','011')`; return it if it matches `^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$`, else null. Never raises |
| `public.waitlist_code_hash(p_code text) returns text` | invoker, immutable | service_role | `encode(sha256(convert_to(normalised,'UTF8')),'hex')`, null when the code is invalid |
| `public.waitlist_issue_code(p_id uuid, p_code text, p_actor uuid, p_batch text, p_single boolean) returns jsonb` | definer | service_role | `p_single = false` (batch): needs `confirmed_at` not null and `code_hash` null. `p_single = true` (one row, a founder's explicit "send code"): any row, replaces any old code. Sets `code_hash`, `code_issued_at = now()`, `code_expires_at = now() + 14 days`, clears `code_claimed_*` and `redeemed_at`, `invited_by = p_actor`, `batch = coalesce(nullif(p_batch,''), batch)`, `invite_count + 1`, `updated_at`. Returns `{"ok":true,"email","name","expires_at"}` or `{"ok":false,"reason":"not_found"\|"not_confirmed"\|"already_invited"\|"bad_code"\|"code_taken"}` (`code_taken` = unique clash; caller retries with a new code) |
| `public.waitlist_revoke_code(p_id uuid, p_code text) returns boolean` | definer | service_role | Undo for a failed send: clears the code fields and `invite_count - 1` where `id = p_id and code_hash = hash(p_code) and redeemed_at is null` |
| `public.hook_waitlist_gate(event jsonb) returns jsonb` | definer, volatile | **supabase_auth_admin only** (revoke from anon, authenticated, service_role) | Section 2 item 4. `user_metadata.vibe_gate_probe = true` makes it treat the switch as closed (stricter only; it never opens anything) so tests can run without touching the shared switch. Refusals: `{"error":{"http_code":403,"message":"[vibe:<reason>] <sentence>"}}` |
| `public.handle_new_user()` | unchanged | unchanged | Same body, plus one block after the Terms insert: if `raw_user_meta_data->>'access_code'` is non-blank, `update public.waitlist set redeemed_at = now(), redeemed_user_id = NEW.id, updated_at = now() where code_hash = public.waitlist_code_hash(code) and redeemed_at is null and (code_claimed_email is null or code_claimed_email = lower(NEW.email))`, inside `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING ... END`. Pre-check: md5 of today's `pg_get_functiondef` must match the value pasted in the file |

The hook and the `handle_new_user` change live in the second file, `20261003110000_waitlist_gate.sql`.
Metadata the code travels in: `options.data.access_code` (string). It stays, spent, in the account's
`user_metadata` and in `auth.identities.identity_data` (GoTrue copies `options.data` there); it is dead, so that is
harmless. Don't try to strip it.

### 3c. Shared TypeScript contract (batch A writes, B and C import; no `server-only`, no `node:` imports, relative extensionless imports, erasable TS, like `send-log-core.ts`)
`src/lib/waitlist/access-code.ts`
- `ACCESS_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"`, `ACCESS_CODE_LENGTH = 8`, `ACCESS_CODE_TTL_DAYS = 14`
- `ACCESS_CODE_URL_PARAM = "access_code"`, `ACCESS_CODE_METADATA_KEY = "access_code"`, `GATE_PROBE_METADATA_KEY = "vibe_gate_probe"`
- `generateAccessCode(random?: (n: number) => Uint8Array): string` → `"VIBE-XXXX-XXXX"`; default random is
  `crypto.getRandomValues` (Web Crypto, works in browser and Node); each byte `& 31` (unbiased: 256 is a multiple of 32)
- `normalizeAccessCode(input: string): string | null` (8 chars; the SQL rules exactly), `formatAccessCode(normalized: string): string`

`src/lib/waitlist/form.ts`
- `WAITLIST_NOTICE_VERSION = "2026-10-03"`, `WAITLIST_LIMITS = { name: 80, major: 80, clubs: 200, officerClub: 80, wish: 280, source: 40, email: 254 }`
- `WAITLIST_YEAR_OPTIONS` (`""` Prefer not to say, `"1"`..`"5"` with the onboarding labels)
- `type WaitlistFormInput = { email: string; name: string; classYear: number | null; major?: string; clubs?: string; isOfficer: boolean; officerClub?: string; wish?: string; consentAge: boolean; consentInvite: boolean; consentNews: boolean; source?: string; website?: string }` (`website` = honeypot)
- `parseWaitlistForm(raw: unknown): { ok: true; value: WaitlistFormValue } | { ok: false; field: keyof WaitlistFormInput | "form"; error: string }`
  (trims, strips control characters, enforces limits and `schoolEmailRejection(email, { context: "request" })`;
  `consentAge` and `consentInvite` must be true; a bad `source` becomes null, never an error)
- `cleanSource(raw: string | null | undefined): string | null`

`src/lib/waitlist/types.ts`
- `type WaitlistStatus = "unconfirmed" | "waiting" | "invited" | "expired" | "joined"` and
  `deriveWaitlistStatus(row: { confirmed_at; code_hash | has_code; code_expires_at; redeemed_at }, now: Date): WaitlistStatus`
  (joined if redeemed; else invited/expired if a code exists; else waiting if confirmed; else unconfirmed)
- `type WaitlistPublicState = "unconfirmed" | "confirm_expired" | "waiting" | "invited" | "invite_expired" | "joined" | "unknown"`
- `type GateRefusal = "access_code_required" | "access_code_invalid" | "access_code_expired" | "access_code_used" | "access_code_in_use"`
  and `parseGateRefusal(err: { status?: number; message?: string }): GateRefusal | null` (403 and `^\[vibe:(reason)\]`)
- `parseSignupOverride(value: string | null | undefined, nodeEnv: string | undefined): boolean | null` (`?signup=open|closed`,
  honoured only when `nodeEnv !== "production"`; for the local browser pass)
- `WAITLIST_CONFIRM_PATH = "/waitlist/confirm"`, `WAITLIST_PATH = "/waitlist"`, `SIGNUP_PATH = "/auth/signup"`
- The route request/response types in 3d, exported under the names given there.

`src/lib/waitlist/signup-open.ts` (`import "server-only"`): `isSignupOpen(override?: boolean | null): Promise<boolean>`.
Override wins when not null. Else `service.rpc("signup_is_open")`, memoised per server instance for 30 s; no service
key, an error or a non-boolean → `false`. No Next cache API (plain module memo; nothing to re-learn in Next 16).

### 3d. Routes (batch B writes; batch C calls). All JSON. Admin errors use `adminFail(status, code, error)`
Public (no session needed; restricted accounts are already refused by the proxy for writes):

| route | body | answers | limits / notes |
|---|---|---|---|
| `POST /api/waitlist` | `WaitlistFormInput` | 200 `{ok:true}` for EVERY well-formed submit (new, duplicate, confirmed, member, honeypot, per-address limit, budget spent). 400 `{ok:false, field, error}` (input only). 429 via `tooManyRequests` | Before answering: validation, `waitlist-net:<clientNetworkKey>` 30/h, `waitlist-global` 300/h `failClosed`. Everything else in `after()`: per-address `waitlist-email:<recipientRateKey>` 3/day; account check (users `school_email` or `email` equals the address → do nothing); select by `email_key`: none → insert + confirm email; unconfirmed → new token + confirm email, answers NOT overwritten; confirmed/invited/joined → nothing. Budget spent → row saved, no email, `console.warn` |
| `POST /api/waitlist/status` | `{token}` | 200 `{ok:true, state: WaitlistPublicState}`; unknown → `{ok:false, state:"unknown"}` | Read only. `waitlist-token-net` 60/h. `confirm_expired` = unconfirmed and `confirm_sent_at` older than 7 days |
| `POST /api/waitlist/confirm` | `{token}` | `{ok:true, state}` (idempotent) or `{ok:false, state:"unknown"\|"confirm_expired"}` | Sets `confirmed_at` only if null and the send is under 7 days old |
| `POST /api/waitlist/leave` | `{token}` | always `{ok:true}` | Deletes the row and its `email_sends` rows (`recipient_hash = recipientHash(email, secret)` and kind in the two waitlist kinds) |

Admin (`requirePlatformAdmin`; GET under `ADMIN_READ_LIMIT`; writes under `ADMIN_WRITE_LIMIT` with `adminWriteKey`,
one hit per request; one `logModerationAction` row per affected person, `targetType: "waitlist"`, `targetId` = row
id, `meta` never holds an address):

| route | body | answers |
|---|---|---|
| `GET /api/admin/waitlist` | – | `AdminWaitlistList = {ok:true, rows: AdminWaitlistRow[], truncated: boolean, canReveal: boolean, budget: {used: number, cap: number}}`; newest first, at most 2000 rows; C filters and counts in the browser |
| `POST /api/admin/waitlist/invite` | `{ids: string[] (1-25), batch: string}` | `{ok:true, results: {id, outcome: "sent"\|"skipped"\|"failed", reason?}[], budget}`; 409 `email_budget` with `remaining` when `ids.length` > what's left today. Batch mode of `waitlist_issue_code`; sends one by one about 600 ms apart (`maxDuration = 60`); a failed send calls `waitlist_revoke_code`. Action `waitlist_invite`, `meta {batch}` |
| `POST /api/admin/waitlist/add` | `{email, name, isOfficer, officerClub?, clubs?, issueCode: boolean, batch?}` | `{ok:true, id, emailed: boolean}`; 409 `exists` with the existing `id`. Any valid address (officers write from Gmail). Action `waitlist_add` (+ `waitlist_invite` if a code went) |
| `POST /api/admin/waitlist/[id]/send-code` | `{batch?}` | `{ok:true}` or `adminFail`. Single mode: works on any row, kills the old code. Used for "Send code" and "Send a new code". Action `waitlist_invite`, `meta {batch, single: true}` |
| `POST /api/admin/waitlist/[id]/remove` | – | `{ok:true}`. Deletes the row and its `email_sends` rows. Action `waitlist_remove` |
| `POST /api/admin/waitlist/[id]/reveal` | – | `{ok:true, email}` only if the caller's id is in `app_settings.waitlist_email_viewers`, else 403 `not_allowed`. Action `waitlist_reveal` |

`AdminWaitlistRow = { id, maskedEmail, name, schoolSystem: "iu"|"purdue"|null, classYear: number|null, major, clubs,
isOfficer, officerClub, wish, source, origin: "form"|"founder", newsOptIn: boolean, status: WaitlistStatus,
createdAt, confirmedAt, codeIssuedAt, codeExpiresAt, batch, inviteCount, joinedHandle: string | null }`.
`maskedEmail` = first character + `*****` + `@` + domain. Text fields go out as plain strings (C renders them as text).

Emails (B, inside `src/lib/email/resend-transactional.ts`, built with `brandedEmailHtml`, plain-text part, `replyTo:
"hello@connectvibe.app"`, a "Take me off the list" link on both):
- `sendWaitlistConfirmEmail(to, confirmUrl)`: "Confirm your spot on the Vibe waitlist"; button "Confirm my spot" →
  `${site}/waitlist/confirm?token=<token>`; works 7 days.
- `sendWaitlistInviteEmail(to, name, code, signupUrl, manageUrl)`: "Your Vibe access code"; code box `VIBE-XXXX-XXXX`;
  button "Create your account" → `${site}/auth/signup?access_code=VIBE-XXXX-XXXX`; notes: works once, for 14 days; you
  can use any email for the account and verify your school email after; opening the link uses nothing up.
- Delivery decision is a pure function: `waitlistDeliveryMode({nodeEnv, resendKey, resendFrom}) → "send" | "dev-log" |
  "unconfigured"`. `dev-log` (not production, no key or no from) prints `[waitlist-email:dev] <kind> <masked to> <url>
  [code]` and returns success without a log row; `unconfigured` in production throws like today's senders.

## 4. The three batches

Order: **A alone first**, then **B and C in parallel**. No file appears in two batches.

### Batch A: database, the hook, local config, shared contract, SQL-level tests
Files (new unless marked):
1. `supabase/migrations/20261003100000_waitlist.sql`: 3a and the 3b functions except the hook and `handle_new_user`.
2. `supabase/migrations/20261003110000_waitlist_gate.sql`: `hook_waitlist_gate`, the `handle_new_user` block, grants.
3. `supabase/config.toml` (edit): uncomment the block at `:285-288` as `[auth.hook.before_user_created]`
   `enabled = true`, `uri = "pg-functions://postgres/public/hook_waitlist_gate"`. Nothing else changes; `enable_signup`
   stays `true`.
4. `supabase/seed.sql` (new, local only): `update public.app_settings set value = 'true'::jsonb where key = 'signup_open';`
   with a comment, so a future local reset stays open.
5. `scripts/sql/waitlist-gate-check.sql`: one transaction ending in ROLLBACK, refuses anything but the local socket,
   same header style as `scripts/sql/chat-latest-check.sql`. Can set `signup_open` false inside its own transaction
   without other sessions ever seeing it.
6. `scripts/waitlist-gate-e2e.mjs`: through the real local GoTrue (URL and keys only from `supabase status -o env`,
   refuses any non-127.0.0.1/localhost host, like `scripts/local-seed.mjs`). Uses `vibe_gate_probe`, so the shared
   switch is never touched. Deletes every user, waitlist row and allowlist row it made, in `finally`.
7. `scripts/seed-review-accounts.mjs` (edit): before `createUser` (`:677`), upsert both `REVIEW_EMAIL_n` addresses into
   `signup_allowlist` with `reason 'review'`; printed in the dry run, written only with `--apply`; a missing table
   (gate not migrated yet) is a printed warning, any other error stops the script.
8. `src/lib/waitlist/access-code.ts` + `.test.ts`, `form.ts` + `.test.ts`, `types.ts` + `status.test.ts`,
   `signup-open.ts`.

Local steps, in order (report each):
1. Apply file 1, then file 2, with the `docker exec ... psql -f -` recipe; insert their two `schema_migrations` rows.
2. `update public.app_settings set value = 'true'::jsonb where key = 'signup_open';` and put the local platform admin's
   id into `waitlist_email_viewers`.
3. Run `scripts/sql/waitlist-gate-check.sql`.
4. **The one allowed restart**, from the worktree root: `supabase stop` (no `--no-backup`: data is kept), then
   `supabase start`. Say so in the report. Auth and the API are down for about a minute for every session; the dev
   servers reconnect by themselves. If `start` says it is applying migrations, stop and report: it must not.
   Afterwards `docker exec supabase_auth_vibe env | grep HOOK_BEFORE_USER_CREATED` shows it enabled. Note: running
   `supabase start` later from the main repo (no hook block) would turn the hook off locally until this branch
   merges; that is harmless while local sign-up is open.
5. Run `node scripts/waitlist-gate-e2e.mjs`, then `node scripts/seed-review-accounts.mjs` (dry run) to see the new line.
6. `npm test`, `npm run typecheck`, `npx eslint` on touched files.

### Batch B: server (routes, email kinds and templates, admin data)
Files:
1. `src/app/api/waitlist/route.ts`, `src/app/api/waitlist/status/route.ts`, `src/app/api/waitlist/confirm/route.ts`,
   `src/app/api/waitlist/leave/route.ts`
2. `src/app/api/admin/waitlist/route.ts`, `.../invite/route.ts`, `.../add/route.ts`, `.../[id]/send-code/route.ts`,
   `.../[id]/remove/route.ts`, `.../[id]/reveal/route.ts` (params as `Promise<{ id: string }>`, like
   `src/app/api/admin/users/[id]/lift/route.ts`)
3. `src/lib/waitlist/store.ts` (`server-only`): every service-client read/write and RPC call of the waitlist; the
   budget count; the viewer list read
4. `src/lib/waitlist/tokens.ts` + `.test.ts`: `mintManageToken() → {token, hash}` (32 random bytes, base64url;
   SHA-256 hex), `hashManageToken(token)`
5. `src/lib/waitlist/admin-view.ts` + `.test.ts`: `maskEmail`, row → `AdminWaitlistRow`, `remainingBudget(used, cap)`,
   `parseInviteRequest(raw)` (1-25 unique uuids, batch rule), `parseAddRequest(raw)`
6. `src/lib/waitlist/email-content.ts` + `.test.ts`: subjects, text parts, link builders, `waitlistDeliveryMode`
7. `src/lib/email/resend-transactional.ts` (edit): the two senders and the dev-log path
8. `src/lib/email/send-log-core.ts` + `send-log-core.test.ts` (edit): the two kinds
9. `src/lib/auth/require-platform-admin.ts` (edit): the four `ModerationAction` values
10. `src/lib/sentry-config.ts` + its test (edit): add `access_code` to `AUTH_PARAM_KEYS`
11. `.env.example` (edit): `WAITLIST_EMAIL_DAILY_CAP` (default 40) with one line on why

Rules: copy the password-reset route's shape (`src/app/api/auth/password-reset/route.ts`): constant answer, hashed
per-address key, slow work in `after()` (read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`).
Never log an address, a token or a code outside the dev-log line. Check with curl against `http://localhost:3102`
(no restart): the four public routes, and the admin routes as anon (401) and as a signed-in non-admin (403).

### Batch C: pages
Files:
1. `src/app/waitlist/page.tsx` (server: metadata; `isSignupOpen(parseSignupOverride(searchParams.signup))` → open
   redirects to `/auth/signup`; reads `src` and `officer=1`) + `src/app/waitlist/waitlist-form.tsx` (client: the
   form of decision 3, the notice text with a Privacy link, the hidden honeypot `website`, the constant success view
   with "Already have an account? Log in" and "Bring your club" mailto)
2. `src/app/waitlist/confirm/page.tsx` (server: `robots: { index: false }`) + `src/app/waitlist/confirm/confirm-client.tsx`
   (reads `token` from `window.location` after mount; POST status on load, which changes nothing; "Confirm my spot"
   button; "Take me off the list" with a second tap; shows only the state, never a name or address)
3. `src/app/auth/signup/signup-form.tsx` = `git mv` of today's `page.tsx`, turned into `export function SignupForm({
   signupOpen, initialAccessCode, probe })`. When closed: an "Access code" field (optional on the client so allowlisted
   founders can submit without one; light `normalizeAccessCode` check with "Codes look like VIBE-7KQ2-M9XD"), sent as
   `options.data.access_code` in its formatted form; `vibe_gate_probe: true` only when `probe`; after reading
   `access_code` from the URL, strip it with `history.replaceState`. `signUpErrorMessage` checks `parseGateRefusal`
   FIRST and returns the section 2 copy; "No code yet? Join the waitlist" under the form when closed. When open: no
   field, today's page, but a code from the URL is still sent.
   New `src/app/auth/signup/page.tsx` (server): reads `searchParams.access_code` and `searchParams.signup`, calls
   `isSignupOpen`, renders `SignupForm` (`probe` = the dev override says closed).
4. `src/lib/waitlist/use-signup-open.ts` (client hook): `getSupabaseBrowserClient().rpc("signup_is_open")`, honouring
   `parseSignupOverride` from `window.location`; `null` while loading counts as closed wording.
5. `src/app/auth/login/page.tsx` (edit, `:372-376`): closed → "Got an access code? Create your account" (quiet link) and
   "No code yet? Join the waitlist"; open → today's "New to Vibe? Create an account".
6. `src/components/auth/EmailLinkProblem.tsx` (edit, `SignedOutCard` `:222-245`): primary "Sign in"; quiet "Got an
   access code? Create your account" when closed, "Sign up" when open.
7. `src/app/account/suspended/suspended-actions.tsx` (edit `:33-40`): `AFTER_DELETE = "/"` and its comment (Settings
   imports it; in the store apps `/` goes to `/campus`, then login).
8. `src/app/page.tsx` (edit: `isSignupOpen` → prop) + `src/components/landing/home-landing.tsx` (edit) +
   `landing.css` only if a label needs room at 375 px. Closed: header, hero, door 05 and closing buttons say "Join the
   waitlist" → `/waitlist?src=landing`; door 05 copy becomes waitlist copy plus a quiet "Got an access code? Create
   your account"; door 06 keeps "Email us" and adds "Or join the waitlist as a club officer" → `/waitlist?officer=1&src=club`.
   Open: today's labels and `/auth/signup`. Draft words are placeholders for Franky.
9. `src/app/admin/admin-shell.tsx` (edit: `AdminTab` + `TABS`), `src/app/admin/page.tsx` (edit: whitelist + render),
   `src/app/admin/waitlist-client.tsx` (new; split into `waitlist-rows.tsx` and `waitlist-add.tsx` if long),
   `src/app/admin/log-client.tsx` (edit: `VERBS` for the four actions, `TYPE_WORDS.waitlist = "a waitlist entry"`).
   The tab: filters (status, school, year, officers only, source, text), counts from the rows, tick boxes with
   "select shown" capped at 25, batch name, "Send codes", the budget line, per-row "Send code" / "Send a new code" (asks
   first when the person is invited or joined), "Remove" (asks first), "Show email" only when `canReveal`, "Add someone".
10. `src/lib/waitlist/view.ts` + `.test.ts`: `gateRefusalCopy(reason)`, `landingCta(open)` → `{label, href}`,
   `filterWaitlistRows(rows, filters)`, `countWaitlistRows(rows)`.

Copy rules everywhere: never name Instagram; no numbers about Vibe's size or the list's length; no "beta"; no place in
line. Every page uses the theme tokens (Night everywhere). Browser pass at 375 px, signed in as a non-admin for the
student pages, with `?signup=closed` to see the closed state locally (dev only), and the `[waitlist-email:dev]` lines
in the :3102 dev-server log to follow the links and codes.

## 5. Tests

**A, SQL (`scripts/sql/waitlist-gate-check.sql`, rolled back):**
S1 anon and authenticated have no privilege on the three tables and cannot execute the hook, issue, revoke, normalise
or hash functions; both CAN execute `signup_is_open`. S2 as `supabase_auth_admin` (`set role`): open → `{}`; closed
and no code → `access_code_required`; allowlisted email → `{}`; malformed code → `invalid`; unknown → `invalid`;
expired → `expired`; redeemed → `used`; valid → `{}` and the claim is written; the same code with a second email →
`in_use`; the first email again → `{}`; a claim older than 15 minutes is taken over; probe + open → behaves closed.
S3 normaliser vectors (below) and hash vector. S4 issue: batch mode refuses unconfirmed and already-coded rows,
single mode replaces a code and the old hash no longer matches; revoke only clears a matching hash. S5
`handle_new_user`: an `auth.users` insert carrying a claimed code redeems the row with the new id; without a code
nothing changes; Terms consent rows are still written as before; a deliberately broken waitlist update raises only a
WARNING and the user row still exists. S6 the new email kinds, action kinds and target type are accepted; an unknown
kind still fails. S7 founder rows may skip consent; form rows may not.

**A, through GoTrue (`scripts/waitlist-gate-e2e.mjs`):**
E1 `signUp` with the probe and no code → `error.status` 403, `parseGateRefusal` gives `access_code_required`.
E2 bogus code → `access_code_invalid`. E3 a code issued through `waitlist_issue_code` → account created, the row's
`redeemed_user_id` equals the new id (this proves `user_metadata` reaches the hook). E4 the same code, another email →
`access_code_used`. E5 two parallel `signUp`s, one fresh code, two emails → exactly one account. E6 `admin.createUser`
with the probe and no code → succeeds (the admin path skips the hook; record the result in the report). E7 an
existing confirmed address → 422 `user_already_exists`, the hook not consulted. E8 an allowlisted address with the
probe → allowed. Not testable locally: the production confirmation-email path (autoconfirm is on here).

**A, unit:** access code: alphabet and length, `VIBE-` format, deterministic with an injected random source, every
byte maps inside the alphabet; normaliser vectors shared with SQL: `VIBE-7KQ2-M9XD`, `vibe 7kq2 m9xd`, `7kq2-m9xd` →
`7KQ2M9XD` (hash `28260557...f3d165`); `VIBE-7KQ2-M9XO` → `7KQ2M9X0`; `vibe-ILO0-0000` → `11000000`; `VIBE-7KQ2-M9X`,
`VIBE-7KQ2-M9XU`, `VIBE7KQ2M9XDQ`, `""` → null. Form: each field's limit, school-only email, retired IU domain copy,
required consents, honeypot passes through, bad source → null. Status derivation, `parseGateRefusal`,
`parseSignupOverride` (ignored in production).

**B, unit:** masking (short local parts, subdomains), manage token mint/hash, budget math, invite and add request
parsing (26 ids refused, duplicates, bad batch), email content (subjects, links built from the site URL, code
appears only in the invite, plain-text parts have no HTML), delivery mode for each env combination, the kinds list,
Sentry scrubbing of `access_code` in a URL and in JSON. **B, local curl:** constant answer for new/duplicate/garbage
honeypot submits; 400 for a Gmail address; the dev-log line appears; confirm via token; leave deletes; admin 401/403.

**C, unit:** `gateRefusalCopy` for all five reasons, `landingCta` both states, row filtering and counts.
**C, browser (375 px):** waitlist submit → dev-log link → confirm page (load changes nothing, tap confirms) → admin
"Send codes" → dev-log code → `/auth/signup?access_code=...` fills the field and cleans the URL → account made →
school email step as today; `?signup=closed` with a wrong code shows the right copy; login and landing wording in both
states; admin as a non-Franky admin sees no "Show email".

**Everyone:** `npm test` stays green (1847 + new), `npm run typecheck` clean, eslint clean on touched files.

## 6. Going live (main session and Franky only; not part of A, B or C)
UPDATED after the three reviews (Oct 3): the gate lives in `auth_hooks`, two email budgets.
UPDATED for the founder's 40-day rule (Oct 3): the purge, a daily Vercel Cron, `CRON_SECRET`, the wave tag.
UPDATED after the retention review (Oct 3, `..._150000` and `..._160000`): batch names are a word and a number, an
entry past its line counts as gone, no code in an entry's last day.
UPDATED for the late cron (Oct 3, `..._170000`): the purge lines sit two days inside the promise, and signing up again
restarts an unconfirmed entry's clock. Eight migration files in all. 6.2 is the whole go-live runbook, in order.

### 6.1 The 40-day rule, as built
The pages and emails promise "up to 40 days" (30 for an unconfirmed entry), and only those two numbers are ever shown.
The database deletes **two days early**: **38 days** after an entry joined the list, whatever its state (address,
name, answers, code hashes and claims), and an unconfirmed form entry with no code **28 days** after its last confirm
email (or after joining, if none went). Why two days: Vercel's Hobby cron runs once a day at any minute of its hour
and is not retried, so two runs can be about 25 hours apart. An entry then waits at most about 25 hours past its line:
gone by day 39 and an hour, inside 40 (and 30). That moment is written once, in `public.waitlist_deletes_at`; the
admin tab's date is its copy (`waitlistDeletesAt`, types.ts), and `retention.test.ts` ties the numbers, the SQL, the
admin hint and `vercel.json` together.
- **The purge** (`public.waitlist_purge_expired`, service role only) deletes every entry past that moment, up to 1000 a
  call, and forgets the address hash of every waitlist send-log row older than 38 days. Three callers: the form's
  background step and the admin Waitlist tab (each at most once an hour per server), and a daily Vercel Cron
  (`GET /api/cron/waitlist-purge`, `vercel.json`, 08:17 UTC, guarded by `CRON_SECRET`; step 6.2 c).
- **Past the line = gone**, even before the purge reaches it: the form and "Add someone" first drop that one person's
  entry (`public.waitlist_drop_if_due`), so they come back as a fresh entry, as every "you can join again" line
  promises; a link from one of its emails reads "This link no longer works"; no code can be issued to it.
- **Signing up again restarts an unconfirmed entry's clock.** When the form sends a new confirm link to an entry that
  is still unconfirmed (no code, never redeemed), the trigger `waitlist_restart_clock` makes its join date now, so a
  late confirm still gets the full 38 days, not what was left from the first try. A confirmed, invited or joined entry
  keeps its date. No new link (the confirm budget is spent) means no restart.
- **No code in an entry's last 24 hours** (`entry_expiring`): the admin row says "Leaves within a day" and has no Send
  code button, and "Select shown" skips it. A code never outlives its entry: it ends at the sooner of 14 days and the
  entry's 38-day mark, and the invite email names that day. For the full 14 days, send by day 24 of an entry (the
  admin tab says so). Every deletion date in a row uses one format, with the time ("deleted Nov 9, 2026, 3:12 PM").
- **The wave tag.** An account made with a code keeps only `public.user_cohorts`: the batch, form or founder, the day
  let in and the day joined. Written when the code is redeemed, deleted with the account; no name, no address.
- **Batch names** are a fixed word and a number, never free text, because the batch outlives the entry in the tag:
  `wave`, `officers`, `clubs`, `friends` or `test`, then 1 to 999 (`wave-1`). The admin tab picks the word from a list;
  CHECKs on `waitlist.batch` and `user_cohorts.batch` hold the same rule (`WAITLIST_BATCH_RE` in types.ts).

Runbook notes for the founders: make hand-made accounts with `auth.admin.createUser` (it skips the gate), or put the
address on `signup_allowlist` first; the dashboard's "Invite user" and `generateLink` signup / invite / magiclink for
a new address are refused while sign-up is closed. A student who mistyped their account email: "Send a new code" on
their row works while that mistyped account is unconfirmed; once an account made with the code is confirmed the
database refuses (`joined`). A row in its last day can't get a code; once it is past its date the person can join
again, or be added again, as a fresh entry.

### 6.2 Go-live runbook, in order
Who: James (with the lawyer) for (a); Franky for every yes, every dashboard step and the smoke test; the main session
runs the commands only after Franky says yes in chat. Production commands use the Management API recipe:
```
export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
q() { curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data "$1"; }
q "$(jq -n --rawfile q supabase/migrations/<file>.sql '{query:$q}')"     # a file
q "$(jq -n --arg q "<sql>" '{query:$q}')"                                  # one statement
```
`[]` = success. A JSON error = nothing applied (each file is one transaction). A lock timeout = retry.

**(a) The Privacy Policy lines are live first (James / the lawyer; Franky's words win).** Nothing below starts until
`/legal/privacy` says this, matching the form's notice ("We keep your answers for up to 40 days."):
- **What the waitlist collects:** the school email, name, year, major, clubs, whether they run a club and which one,
  the optional one line, where they came from (the `?src=` tag), when they agreed (age, invites, the optional news),
  and a record of each email we send (its kind, the address's domain, the time and a keyed hash of the address).
- **Why:** to confirm the spot, choose who gets in each wave and email the access code.
- **Who stores or handles it:** Supabase (the database), Vercel (runs the site and the daily clean-up), Resend (sends
  the emails).
- **How long:** up to 40 days after joining the list, whatever happens; an unconfirmed entry up to 30 days after its
  last confirm email. The email record forgets the address with the entry.
- **After joining:** an account made with an access code keeps only which wave it came in with (the batch, form or
  added by a founder, the day let in, the day joined), deleted with the account.
- **Leaving sooner:** "Take me off the list", in every email, deletes the entry at once.

**(b) Resend: the two daily caps, or an upgrade.** The free tier is 100 emails a day for the whole account, shared
with Supabase Auth's sign-up mail and the password-reset / school-email codes. Keep the defaults
(`WAITLIST_EMAIL_DAILY_CAP` 40 access codes, `WAITLIST_CONFIRM_DAILY_CAP` 30 confirm emails; the two never share), or
upgrade and raise both on Vercel > Settings > Environment Variables > Production. Note the Auth email limit
(Dashboard > Authentication > Rate limits; 30 an hour per the handoffs).

**(c) `CRON_SECRET` on Vercel Production**, before the deploy (variables reach the next deploy only): a random string
of at least 16 characters (`openssl rand -hex 32`). Vercel sends it as `Authorization: Bearer ...`; without it every
cron call gets 401 and the logs say `[cron/waitlist-purge] CRON_SECRET is missing`.

**(d) Commit, merge `landing-night` into main, push. Franky approves the merge.** Run `npm test`, `npm run typecheck`
and the local checks (section 5) on the merged tree first. Pushing main starts the production deploy by itself, and
until (e) runs the new site finds no switch, reads sign-up as closed, and its form saves nothing. So run (e) the
moment the push lands (the build takes minutes), or, for no window at all, run (e) from the merged local main just
before pushing: the migrations change nothing the current site uses.

**(e) The migrations, in order, each followed by its row** (`q` the file, then
`insert into supabase_migrations.schema_migrations (version, name) values ('<version>', '<name>') on conflict do nothing;`):
1. `20261003100000_waitlist`: the three tables, the switch (`signup_open` starts `false`), the code functions.
2. `20261003110000_waitlist_gate`: the first hook and `handle_new_user`'s redeem block.
3. `20261003120000_waitlist_hardening`: the hook moves to `auth_hooks`, a stricter redeem, the invite's own token,
   the undo after a failed send, an account's deletion reaches its row.
4. `20261003130000_waitlist_code_scrub`: the typed code is kept only as its hash (triggers on `auth.users` /
   `auth.identities`). If the hosted project refuses it, the others still stand; only that clean-up waits.
5. `20261003140000_waitlist_retention`: `user_cohorts`, the tagging trigger, the purge. Deletes nothing when applied.
6. `20261003150000_waitlist_retention_fixes`: a code capped at its entry, the batch rule.
7. `20261003160000_waitlist_line`: `waitlist_deletes_at`, `waitlist_drop_if_due`, no code in the last day.
8. `20261003170000_waitlist_margin`: the 38 / 28-day lines and the restarted clock.

Each pre-flight checks what the files before it left (by md5 where it replaces a function) and refuses to run twice;
each ends with its own post-check. Never `supabase db push --include-seed`. Then:
- `select key, value from public.app_settings;` shows `signup_open` = `false`.
- Franky in the viewers: `update public.app_settings set value = '["<Franky's user id>"]'::jsonb, updated_at = now()
  where key = 'waitlist_email_viewers';`
- The standing-rule post-check of `20260922090000` (expect 0 rows), and Dashboard > Settings > API > Exposed schemas
  does NOT list `auth_hooks`.

**(f) The deploy, and proof the served files are new (the S65 stale-CSS lesson: check what is served, not git).**
Vercel > Deployments: the production deploy is main's newest commit and Ready. Then:
```
curl -s -o /dev/null -w '%{http_code}\n' https://www.connectvibe.app/waitlist          # 200 (404 = old build)
curl -s https://www.connectvibe.app/waitlist | grep -o '/_next/static/[^"]*\.css' | sort -u | while read p; do
  curl -s "https://www.connectvibe.app$p" | grep -q 'vwl-bar' && echo "new CSS: $p"; done      # at least one line
```
Open the landing at 375 px: it says "Join the waitlist" (the switch is closed). Settings > Cron Jobs lists
`/api/cron/waitlist-purge`.

**(g) Turn the hook on, then the post-checks.** The hook points at
`pg-functions://postgres/auth_hooks/hook_waitlist_gate`. Either the Management API (`PATCH /v1/projects/{ref}/config/auth`
with `hook_before_user_created_enabled: true` and that `hook_before_user_created_uri`; runs no SQL) or Dashboard >
Authentication > Hooks > Before user created > Postgres > schema `auth_hooks` > `hook_waitlist_gate` (safe now: its
REVOKE only touches a function the REST API can't reach). Then:
- `select r, has_schema_privilege(r, 'auth_hooks', 'usage') from unnest(array['anon','authenticated','service_role']) r;`
  (expect three `false`) and the standing-rule post-check again (expect 0 rows).
- `GET /v1/projects/{ref}/config/auth` shows the hook enabled with that URI; magic link, OAuth and anonymous sign-in
  are off; email confirmation is on (`mailer_autoconfirm: false`).
- The review seed's production dry run (`node scripts/seed-review-accounts.mjs --production --i-have-frankys-yes`,
  Franky at the terminal, the ref typed back) prints the allowlist line for both review addresses; `--apply` only with
  his yes.

**(h) The sign-up rate limit / CAPTCHA decision (Franky).** While closed, GoTrue's per-IP sign-up limit is the
only brake on code guessing and on "does this address have an account" probes. Dashboard > Authentication > Rate
limits: write down the sign-up/sign-in number; if it is loose, tighten it now. CAPTCHA (Turnstile) is the stronger
option but NOT a switch to flip today: once on, GoTrue refuses every sign-up, sign-in and password reset that carries
no captcha token, and our pages send none yet. Recommendation: tighten the limit now; CAPTCHA only after the pages
send a token (its own small build).

**(i) A live smoke test of the whole waitlist with a founder's own address.** Use a founder's school address that has
no Vibe account yet (the form quietly does nothing for an address with an account, so Franky's IU and Gmail won't do;
ask James or Rylan). Watch Vercel's runtime logs throughout.
1. `/waitlist` at 375 px: fill the form, submit, see the same thank-you page as everyone.
2. The confirm email arrives (Resend, from the live sender; check spam once). Opening the link changes nothing;
   "Confirm my spot" confirms.
3. `/admin?tab=waitlist` as Franky: the row is there, masked, "Waiting", "deleted" 38 days out with the time; "Show
   email" shows the address (and writes a `waitlist_reveal` log row); a non-Franky admin sees no "Show email".
4. Send a code to that founder: "Send code" on the row, batch `test-1`. The invite email arrives with the code box and
   the button; the row says "Code sent" and when it works until.
5. Sign up with it: the button opens `/auth/signup?access_code=...`, the field is filled and the URL is cleaned;
   create the account, confirm it from Supabase's email, carry on to the school-email step. The row says "Joined".
6. The review account still signs in (the hook never runs at sign-in).
7. An anonymous sign-up with no code gets 403: `curl -s -X POST "https://<ref>.supabase.co/auth/v1/signup" -H "apikey:
   <publishable key>" -H "Content-Type: application/json" -d '{"email":"fgcazares04+gatecheck@gmail.com","password":
   "<random 20 chars>"}'` answers 403 with `[vibe:access_code_required]` and makes no account.
8. The cron: Vercel > Settings > Cron Jobs > `/api/cron/waitlist-purge` > Run. Its log shows 200
   `{"ok":true,"deleted":0}`. A 401 means `CRON_SECRET` is missing or the deploy predates it (redeploy after setting
   it). A **308** means the call was redirected and the purge never ran: `next.config.ts` sends `connectvibe.app` to
   `www.connectvibe.app` with a 308, and Vercel Cron does not follow redirects, so make `www.connectvibe.app` the
   production domain the cron calls (Settings > Domains), then Run again until it is 200.
9. Clean up: Remove the founder's row (or "Take me off the list"); keep the account only if it is their real one.

**(j) The App Review note.** One sentence in the App Store and Play review notes: "Vibe is opening in waves; new
visitors join a waitlist; please sign in with the review account." The review accounts only sign in, and both are on
`signup_allowlist` anyway.

**(k) If anything goes wrong: roll back.** Two switches, each about a minute, no deploy needed:
- Open sign-up: `q "$(jq -n --arg q "update public.app_settings set value = 'true'::jsonb, updated_at = now() where
  key = 'signup_open';" '{query:$q}')"`. The hook then lets everyone in, and the site's buttons go back to "Sign up"
  within a minute (each server remembers the switch for 30 seconds).
- Turn the hook off: `PATCH /v1/projects/{ref}/config/auth` with `hook_before_user_created_enabled: false`, or the
  Dashboard's Hooks page. With the hook off and the switch still closed, the site says "waitlist" but anyone can sign
  up without a code: open the switch too unless that is what you want.
- The code itself: Vercel > Deployments > the last good one > Promote. The eight migrations can stay: the older site
  never reads them. Each file's header has its own ROLLBACK, for a calm day, not an emergency.

**Not in this build:** product-fit survey, cohort dashboard (the `user_cohorts` tag it will read IS in), `user_active_days`, heartbeat move, invite chain, a
"we launched" email, an admin button for the switch, campus field, CAPTCHA on the auth pages.

### 6.3 Read on production (Oct 3, read-only, with Franky's OK)
- `md5(pg_get_functiondef('public.handle_new_user()'::regprocedure))` on production = `cb3e3ae40a7d2fcc7897d31fa9f8be66`, the value 20261003110000's pre-flight expects, so that pre-flight will pass.
- Production session `search_path` is `"$user", public` and Postgres is 17.6. Pre-flight fingerprints of later files were taken locally with the same setting; if a Management API session ever runs with an empty search path, put `set local search_path = public, extensions;` before the pre-flight blocks.
- Production then had 20 accounts (14 school-verified, 3 platform admins), latest migration 20261001120000 (97 rows), no auth hook functions, no pg_cron.
