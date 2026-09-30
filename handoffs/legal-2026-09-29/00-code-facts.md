# Vibe code facts for the ToS draft (audited 2026-09-29, HEAD 5c68da1)

Scope: `src/`, `supabase/migrations/` (97 files), `supabase/config.toml`, `public/html/`, `mobile/`, plus handoffs where production dashboard settings are recorded. Dashboard-only settings (Supabase Auth, Vercel env) are not in the repo. Where the audit relies on a handoff for one, it says so. (Audit by a read-only agent; saved verbatim by the orchestrator.)

## Most important surprises (short version)

1. **Legal copy overstates what verification proves:**
   - `src/app/legal/community/page.tsx:34-36` says "Everyone here verified a school email, which means the person on the other end … is a real student at a real school."
   - `src/app/legal/terms/page.tsx:40-43` and `src/app/legal/child-safety/page.tsx:35` require being "enrolled" and holding a ".edu" address.
   - The code only proves control of an `@iu.edu` / `@purdue.edu` inbox once. It never checks enrollment and never expires. Any email can open an account.
2. **Profile badges say "Student":**
   - `public/html/profile.html:8532`: "🎓 Student · {campus}". The CTA at `:8543` reads "Verify your student status".
   - `src/components/mobile/ProfileMobile.tsx:6485` falls back to "Student".
   - The campus inside the badge is **self-selected**, not verified.
3. **Bans do not stop re-registration:**
   - Sign-up never passes through a Vibe route. The "personal email" ban key is stored but never checked.
   - A banned person can make a new account with any email. They can post again if they verify a *different* school address.
   - Only re-verifying the same canonical school address is blocked.
4. **There is no ownership transfer.**
   - An owner cannot leave (`join/route.ts:298`, "Owners must transfer ownership before leaving"), but no transfer path exists.
   - If the owner deletes their account, `orgs.owner_id` goes NULL and the club is **orphaned**. Nobody can delete it or manage its admins through the app.
5. **No account recovery without the login email.** No MFA, no email-change UI, no admin or support route to recover or re-home an account.
6. **Terms venue and operator:**
   - The venue is **Monroe County** (`terms/page.tsx:142`), but the only open campus is Indianapolis.
   - The Terms say "operated by the Vibe team". Support and delete-account pages name "CONNECTVIBE. LLC, an Indiana limited liability company".
   - `TERMS_VERSION` is still `"2026-05-07"`.
7. **"Verified" clubs:**
   - The flag is a manual platform-admin toggle with no stated criteria.
   - The UI calls these "Officially recognized clubs at {campus}" (`campus-home.tsx:12251-12254`) and badges them "Verified by Vibe".
8. **Reads are not verification-gated at the data layer.** The UI redirects unverified accounts away from campus pages. Read APIs and RLS let any signed-in account (verified or not) read published posts and events.

---

## A. Signup and login

### A1. Who can create an account

- **Any email address.** Sign-up calls `supabase.auth.signUp` directly from the browser (`src/app/auth/signup/page.tsx:207-221`). No domain allowlist exists anywhere in the sign-up path.
- The page actively asks for a **personal** email:
  - `:380-382`: "Use your **personal email** — the one you actually check. Your school .edu is verified separately in the next step."
  - Label "Personal email / not your .edu" (`:407-408`), placeholder `you@gmail.com` (`:413`).
  - Typing a school address shows a hint only, not a block (`:426-437`).
- **Email confirmation:**
  - Local `supabase/config.toml` has `enable_confirmations = false`.
  - Production: "Confirm email ON (`mailer_autoconfirm: false` verified)" since 2026-09-06, per `handoffs/2026-09-04-session-53-private-resumes.md:130,186`. This is dashboard state, not in the repo.
  - The code handles both modes: session returned means no confirmation (`signup/page.tsx:253-258`). Login handles `email_not_confirmed` (`src/app/auth/login/page.tsx:37,144`).
  - Confirmation is a link or an 8-digit code. The template is `supabase/templates/confirmation.html` ("expire in 1 hour").
- **OAuth / Apple / Google:** none.
  - No `signInWithOAuth` or `signInWithIdToken` anywhere in `src/`.
  - `[auth.external.apple] enabled = false` in config.toml.
  - Login is `signInWithPassword` only (`login/page.tsx:138`).
- **Magic links / passwordless login:** none. `verifyOtp` is used only to confirm sign-up (`src/components/auth/ConfirmCodeForm.tsx:114`, `src/app/auth/confirm/page.tsx:54`) and for password recovery (`src/app/auth/update-password/page.tsx:262`).
- **Password rules** (`src/lib/auth/password-rules.ts`):
  - 8 to 72 characters, checked in code points plus a 72-byte UTF-8 check. No composition rules.
  - Config `minimum_password_length = 8`, `password_requirements = ""`.
  - Leaked-password (HIBP) protection is **not enabled**: it needs Supabase Pro, and the project is on Free (session-53 handoff `:128`). The signup page still maps a `pwned` reason if one ever arrives (`signup/page.tsx:57-58,76`).
- **Unconfirmed sign-ups:** the `public.users` row is created by the `on_auth_user_created` trigger at `auth.users` INSERT, before confirmation (`supabase/migrations/20260906120000_terms_acceptances.sql:68-136`). No code path cleans up unconfirmed accounts.

### A2. Which email is stored where

- **`auth.users.email`** (GoTrue) is the **login email**.
- **`public.users.email`** (`NOT NULL UNIQUE`, `20260430190000_phase1_initial_schema.sql:13`):
  - Copied once at signup by `handle_new_user`.
  - The only trigger on `auth.users` is `AFTER INSERT` (`phase1:224`), so it is **never re-synced**.
  - Private: no column grant to `authenticated`.
  - Settings shows it as "Email — Used for sign-in." (`src/components/settings/SettingsClient.tsx:469`).
- **`public.users.school_email`** (`UNIQUE` on raw text, `phase1:15`) plus `school_verified boolean` (`phase1:16`): the separately verified school address. Private column.
- **Changing the login email:** no app route or UI. The only `auth.updateUser` call in the repo sets a password (`update-password/page.tsx:380`).
  - GoTrue's own `PUT /user` is not blocked by app code. The anon key is public, so a signed-in user could call it directly. Local config has `double_confirm_changes = true`.
  - If it were used, `public.users.email` (and the "personal" ban key built from it) would go stale.

### A3. Age gate and terms

- **Signup checkbox** (required; the submit button is disabled until checked): "I'm **18 or older** and I agree to the Terms of Service and Privacy Policy." (`signup/page.tsx:455-488`). `MIN_AGE = 18` (`src/lib/legal/terms.ts:2`).
- No date of birth is collected. No age verification of any kind.
- **What gets recorded:**
  - Signup sends metadata `{terms_version: TERMS_VERSION, age_attested: true}` (`signup/page.tsx:216-219`).
  - The trigger stamps `users.terms_version`, `terms_accepted_at` and `age_attested_at`, and appends a `terms_acceptances` row with `source='signup'`. It accepts only when the version matches `YYYY-MM-DD` and `age_attested='true'` (`20260906120000_terms_acceptances.sql:83-132`).
- `TERMS_VERSION = "2026-05-07"` (`src/lib/legal/terms.ts:1`).
- **Consent counts** only if all three columns are present and the version equals the current one (`terms.ts:22-26`). Anything else is sent to `/auth/terms`.
- **`/auth/terms` interstitial** (`src/app/auth/terms/accept-terms-form.tsx:146-190`):
  - Headline "One quick thing."
  - Body: "We now record your agreement to the Terms of Service and Privacy Policy, and that you're 18 or older — the age the Terms require. One tap and you won't see this again."
  - Same checkbox wording as signup.
  - Offers "delete your account" or sign out instead.
- `POST /api/me/accept-terms` writes an append-only `terms_acceptances` row with `source='interstitial'`, then stamps `users` (`src/app/api/me/accept-terms/route.ts:67-88`).
- `terms_acceptances` is service-role only, `ON DELETE CASCADE`, so it is **deleted with the account** (`20260906120000:31-35,46`).
- Privacy changes do not trigger re-consent: only `TERMS_VERSION` gates it, and it has not changed since May 7.

---

## B. School email verification

### B4. The flow

- **Allowlist** (`src/lib/auth/school-email-domains.ts`):
  - `SYSTEM_DOMAINS = { iu: ["iu.edu"], purdue: ["purdue.edu"] }` (`:54-62`), subdomains included.
  - `PURDUE_SIGNUPS_ENABLED = true` (`:44`).
  - Retired IU domains (`iupui.edu`, `indiana.edu`, `iuk.edu`, …) are always rejected (`:69-79`).
  - `pfw.edu` and `pnw.edu` are not accepted.
  - The `SCHOOL_EMAIL_DOMAINS` env var can only **narrow** the list, never widen it (`:133-148`).
- **Request:** `POST /api/auth/school-email/request` (`src/app/api/auth/school-email/request/route.ts`).
  - Requires a session and recorded Terms (`:75`).
  - Normalizes the address, checks the allowlist, and short-circuits if it is already verified on this account (`:128-137`).
  - Rate limits: 3 sends per hour per user and 60 per hour per network (IPv4 or IPv6 /64) (`:150-174`).
  - Checks the conflict and the restriction (below), then emails a signed link plus an 8-digit code through Resend (`:237-249`).
- **Token and expiry** (`src/lib/auth/school-email-token.ts`):
  - Link: HMAC-signed payload `{userId, email, exp}`, **48-hour TTL** (`:46-61`).
  - Code: 8 digits, HMAC of user id + address + a 30-minute window. The current and previous windows are accepted, so it lives 30-60 minutes (`:104-158`). Stateless, with no table.
- **Confirm by link:** `POST /api/auth/school-email/confirm`. The caller must be signed in as the same `userId` as in the token (`confirm/route.ts:62-71`).
- **Confirm by code:** `POST /api/auth/school-email/confirm-code`. Limits are 5 tries per 15 minutes per user and 150 per hour per network, and both fail closed (`confirm-code/route.ts:110-126`).
- **What gets written** (`src/lib/auth/school-email-apply.ts:221-229`):
  - `school_email = <normalized address>`, `school_verified = true`, `school_system = 'iu'|'purdue'` (from the domain).
  - On a system change, `campus_id` is kept or cleared and the legacy `school` label is rewritten (`school-email-domains.ts:424-441`).
  - **No verification timestamp column exists.** No `school_verified_at` anywhere.
- **Reuse across accounts:**
  - The `users_school_email_key` unique index is on raw text.
  - A canonical scan also runs over verified rows: lowercase, strip `+tag`, fold subdomains to `iu.edu` or `purdue.edu`. Dots are kept (`src/lib/moderation/access.ts:330-357`, `src/lib/moderation/identity.ts:80-93`).
  - A conflict returns 409: "That school email is already linked to another account." (request) or "That school email was claimed by another account." (apply, `school-email-apply.ts:204-213`).
  - The code has no knowledge of institutional aliases. Two different addresses that deliver to the same inbox count as two identities.
- **Re-verify with a different address:** allowed, including switching from IU to Purdue (`request/route.ts:35-37`). The new address overwrites the old one, which becomes free for another account.
- **Remove the school email:** **no code path exists** other than deleting the account.
- **Restricted address:** 403 "This school email can't be used on Vibe. Questions: help@connectvibe.app" (`school-email-apply.ts:51-58`).
- **UI copy (exact strings):**
  - Badge text: the campus label ("IU Indianapolis", "Purdue Indianapolis", …) when a campus is picked, else "IU verified" / "Purdue verified" (`src/lib/iu/campuses.ts:394-401`; `src/lib/profile/build-vibe-user-v1.ts:94-103`).
  - Desktop badge: "🎓 Student · {school}" (`public/html/profile.html:8532`). Own-profile CTA: "🎓 Verify your student status" (`:8543`).
  - Mobile badge: "🎓 {school ?? "Student"}" (`src/components/mobile/ProfileMobile.tsx:6485`).
  - Success: "School email verified." (API). Page headline "You're verified" and "Added to the Vibe account {email}." (`src/app/auth/verify-school/page.tsx:408,422`).
  - Settings: "School email … Verified." / "Not yet verified. Verify now →" (`SettingsClient.tsx:470-485`).
  - Step banner: "You're confirmed. Your login email is set. One last verification: add your school email (@iu.edu or @purdue.edu) **so we know you're actually on campus.**" (`src/app/auth/school-email/page.tsx:503-505`). Headline "Verify your campus."
  - Onboarding: "Your school email shows you're at {system}." (`src/components/mobile/onboarding/onb-copy.ts:52`), "from your school email" (`:54`), "**You're verified as a Purdue student.**" (`:67`).

### B5. Enrollment, graduation, periodic re-verification

**None.**
- There is no expiry on `school_verified`, no re-verification job, and no enrollment or graduation check.
- A grep for `school_verified_at|reverif|enroll|graduat|alumni` finds only legal copy.
- Verification proves one thing: at one moment, the user could read mail at that address.

### B6. What requires `school_verified`

Enforced in two layers:
- The route helper `requireCanPublish` checks Terms, no active restriction, and `school_verified` (`src/lib/moderation/access.ts:217-221`).
- The database helper `can_publish_now()` checks Terms and age stamps, `school_verified`, and not restricted (`supabase/migrations/20260923090000_moderation_foundation.sql:2028-2043`).

**Requires verified (`requireCanPublish` in the route):**
- Posts: `me/publish-post`, `posts/[id]` edit, reposts, comments.
- Post photo and poster uploads (`me/profile-upload` for kind `post`/`poster`), clip uploads, message media uploads.
- DM, group and chat thread creation, adding members, sending messages (`me/threads*`).
- Events: create and edit (`api/events`, `events/[id]`).
- Org create (`api/orgs` POST, which also re-checks at `:738-744`) and org settings PATCH (`orgs/[slug]`).
- Org posts, org channel creation.

**RLS `WITH CHECK can_publish_now()`** on posts, post_comments, post_reposts, messages, channels and events (list at `moderation_foundation.sql:3025-3051`).

**Other checks that effectively require verification:**
- Joining an org: `orgJoinState` returns `unverified`, giving 403 "Verify your school email to join." (`src/app/api/orgs/[slug]/join/route.ts:176-180`).
- Being listed in people search (`src/app/api/search/route.ts:205,214`; `users/search/route.ts:118,125`).
- Seeing someone's résumé (`src/lib/profile/hidden-fields.ts:95-103`).
- Every campus UI page: `/campus`, `/feed`, `/messages`, `/network`, `/otto` and `/profile` redirect unverified users to `/auth/school-email` (`src/lib/auth/campus-access.ts:43-45`). `/onboarding` does the same (`src/app/onboarding/page.tsx:94-95`).

**Club events** also require the org's admin-set `verified` flag and the caller being owner or admin (`src/app/api/events/route.ts:471-472,497-503`, "Events must be posted on behalf of a verified org").

### B7. What unverified (personal-email-only) accounts can do

Allowed by route gates:
- Sign in; accept Terms; open Settings (`/settings` has no verification gate).
- Edit profile text and avatar/banner (`requireNotRestricted` only).
- Change handle.
- Follow people (`me/follow`, no gate). Follow orgs (Terms only).
- Like posts and comments, save posts, RSVP (Terms only; the home-campus rule does not refuse a campus-less viewer).
- Report; block and mute.
- Personal calendar events, Otto reminders.
- Respond to DM requests (accept, decline, hide).
- Start a Vibe+ checkout (Terms only, `billing/checkout/route.ts:136`; only if billing is enabled).
- Delete the account.

Cannot:
- Post, comment, repost or message.
- Create threads, events or orgs; join orgs.
- Reach any campus UI page.

**Data-layer caveat:**
- Read APIs (`/api/feed`, `/api/events`, `/api/orgs`, etc.) require login but **not verification**. `src/lib/iu/campus-request.ts:94-99` says "Those routes carry no verification gate of their own".
- A null system gets "every campus" as its default scope.
- `posts_select_authenticated` has no viewer-verification or viewer-campus condition (`20260928120000_blocks_in_rls.sql:353-359`).
- So an unverified signed-in account can read campus content through the API. Only the web UI hides it.

---

## C. Campus and system

### C8. How campus is set

- **`school_system`** is stamped only server-side (service role) from the verified domain. It has no UPDATE grant for clients (`20260916100000_campuses_school_system.sql:13-19`).
- **`campus_id` is self-declared.** The user picks it from a picker. The DB trigger `users_campus_in_system` rejects a campus not allowed for their system.
  - IU addresses can pick any IU campus.
  - Indianapolis and Fort Wayne are shared by IU and Purdue.
  - Only `indianapolis` has `isOpen: true`. Closed campuses "stay selectable" (`src/lib/iu/campuses.ts:185,217-229`).
- **`CAMPUS_CHANGE_COOLDOWN_DAYS = 45`** (`src/lib/profile/onboarding-prefill.ts:402`). The server enforces it through `campusChangeDecision` in the onboarding-step and profile campus writes.
- **`resolveScopeV2`** (`src/lib/iu/campus-scope.ts:226-251`):
  - With no param, it scopes to the home campus.
  - `?campus=<id>` lets any verified user browse any campus.
  - A viewer with no system may not name a campus (`campus-request.ts:109-117`) but defaults to all campuses.
- Nothing verifies where a student actually studies. The single-campus preselect for `pfw.edu`/`pnw.edu` is visible, but those domains are not accepted.

---

## D. Organizations (clubs)

### D9. Who can create an org

- `POST /api/orgs` (`src/app/api/orgs/route.ts:659-958`) requires:
  - recorded Terms;
  - no active restriction;
  - `school_verified` (`requireCanPublish` `:679`, plus `:738-744` with "Verify your school email before creating an org.");
  - a home campus (400 "Pick your campus in your profile before creating an org.").
- Rate limit: 5 per hour. A word filter runs on name and description.
- **Open to every verified user.** No admin-only or founder-only gate, and no feature flag. The desktop "Create an org" modal is shown to everyone (`campus-home.tsx:1139,1263`).
- On create:
  - an org row with `owner_id = creator` and the campus taken from the creator's row;
  - an `org_members` row with role `owner`;
  - rooms via `chat_repair_club`.

### D10. Roles and powers

- **Roles:** `org_members.role IN ('owner','admin','mod','member')` (`20260507100000_org_channels_schema.sql:42-43`). Plus `orgs.owner_id` (FK `ON DELETE SET NULL`, `:11`).
- **Promote and demote:** owner and admin only (`members/[userId]/route.ts:17,26-28`).
  - Admins can act on mod and member. Only the owner can promote to admin, demote admins or remove admins.
  - The owner's row cannot be changed: "Owner role can't be changed here" (`:90,143-148`).
- **Remove members:** the same rules. Each removal is recorded in `org_removals` first; removed people must ask to rejoin (`:193-209`).
- **Remove followers:** owner and admin only. This is "a mute, not a ban"; they can re-follow and are not notified (`followers/[userId]/route.ts:22-40`; `src/lib/orgs/following.ts:36`).
- **Edit name and description:** owner and admin (`SETTINGS_ROLES`, `src/lib/orgs/join-state.ts:176`).
  - The **handle is not editable**: the PATCH whitelist never passes `handle`, `owner_id` or `verified` (`orgs/[slug]/route.ts:382-384`).
- **Delete org:** owner only, by `owner_id`. Refused while hidden by moderators (`orgs/[slug]/route.ts:741-800`). The delete cascades to members, channels, events and club posts; moderator-removed posts are detached and kept.
- **Ownership transfer:** **no code path exists.**
  - `members/[userId]/route.ts:90`: "transfer-ownership flow not in v1".
  - The owner cannot leave (`join/route.ts:298`).
- **Claim this org:** **none.**
- **Org verification:**
  - `orgs.verified` is flipped only by platform admins (`src/app/api/admin/orgs/[slug]/verify/route.ts:34-80`) and logged to `moderation_actions`.
  - No club-email or school-recognition check and no documented criteria.
  - UI copy: "Verified by Vibe" (`campus-home.tsx:16899`, `orgs/[handle]/page.tsx:791`); "Officially recognized clubs at {campus}." (`campus-home.tsx:12251-12254`).
- **Invites** (`join-state.ts:170,204-210`): owner and admin can invite, person by person. Invites expire after 30 days, and there is a 14-day cooldown after a decline. Invite links are disabled.
- **Join requests:** owner, admin or mod may approve. Re-admitting a removed person needs owner or admin (`join-state.ts:155,258-263`).
- **Post as the org:** owner and admin (`orgs/[slug]/posts/route.ts:38`). Owner and admin may also delete any club post.

### D11. When the owner deletes their account

- `orgs.owner_id` becomes NULL (SET NULL) and the owner's `org_members` row cascades away. The org **survives with no owner**.
- After that, nobody can delete the org or promote, demote or remove admins through the app. Admins can still edit settings and manage mods and members.
- The owner's own posts and **events they created** are deleted: `events.creator_id ON DELETE CASCADE` (`phase1:124`).
- The delete-account page discloses this: "A club you started stays up for its other members" (`src/app/legal/delete-account/page.tsx:164`).

### D12. Join policies, audience, following

- **`join_policy`:** `open | request | invite`. **`audience`:** `both | iu | purdue` (`join-state.ts:59-62`).
- The audience is checked only at join time. Existing members are never re-checked: "It is a label, not a boundary" (`join-state.ts:268-281`).
- **Following:**
  - Open to any signed-in account, verified or not (Terms only).
  - Members auto-follow (`source='join'`).
- **Follower list:** owner and admin only. The public follower count is hidden below **5** (officers see the raw number) (`following.ts:36,89-104`).
- **Member roster:** visible to any member; non-members get 403 (`orgs/[slug]/members/route.ts`). The member count is public on the org page.
- **Club posts** show on the public org page whatever the join policy. Channel content is members-only (`orgs/[handle]/page.tsx:240-243`).

---

## E. Billing (Vibe+)

### E13. What exists

- **Per-user only.** `entitlements.user_id` is the primary key (`20260912101000_entitlements.sql`). `billing_customers` and `billing_events` are keyed on the user (`20260922150000_billing_stripe.sql`). **There is no org-level billing and no org references.**
- **Prices** (`src/lib/billing/config.ts:27-53`):
  - Lookup keys `vibe_plus_monthly` and `vibe_plus_yearly`, at $3.99 a month and $24.99 a year, in USD.
  - Stripe prices are checked against these values before checkout.
  - Grace after a failed renewal is 7 days (`:68`).
- **Enabled only if** `BILLING_ENABLED === "true"`, a Stripe key is set and a `whsec_` webhook secret is set (`config.ts:102-108`).
  - The migration header says production billing stays off "until the LLC has its EIN and bank account and the Terms with subscription wording are published" (`billing_stripe.sql`, PRODUCTION section).
- **Checkout** (`src/app/api/billing/checkout/route.ts`):
  - Uses Stripe-hosted Checkout, `mode: subscription`.
  - Refused inside the store apps (`:107-109`).
  - Requires Terms only, **not school verification**.
  - Auto-renew line: "Vibe+ renews automatically at {price} {period} until you cancel. Cancel anytime from Manage subscription on Vibe." (`:82-87`).
- **Portal** (`billing/portal/route.ts`): Stripe Customer Portal. Not gated on the billing switch or Terms, and allowed for restricted users.
- **Webhook** (`src/lib/billing/webhook.ts:99-140`): handles checkout, subscription, invoice and `customer.deleted` events. **Refunds and disputes are recorded, not acted on** (`:21-23`). No automated refund logic exists.
- **Account deletion:**
  - `stripe.customers.del` runs **before** anything else. This cancels subscriptions immediately with no refund.
  - It fails closed with 503 if Stripe cannot confirm (`src/app/api/me/route.ts:184-218`).
  - Stripe keeps its own records.
- **Ban:** the same `customers.del` runs, and Vibe+ is canceled with no refund (`src/lib/moderation/actions.ts:282-334`). **Suspension leaves billing running** (suspended-page copy says so).
- **What Vibe+ unlocks** (`requirePlus`): the identities of profile viewers (`api/me/profile-viewers`) and post viewers (`api/me/posts/[id]/viewers`).

---

## F. Moderation and restrictions

### F14. `account_restrictions`

- **Table:** `20260923090000_moderation_foundation.sql:1829-1874`. Service role only; no FK on `identity_key`; `user_id ON DELETE SET NULL`.
- **What is hashed:** HMAC-SHA256 with `RESTRICTION_PEPPER` (at least 32 characters, never rotatable) over `"restriction-identity-v1|" + canonical` (`src/lib/moderation/identity.ts:37,115-125`). Two keys are written per restriction (`actions.ts:156-169`):
  - **school** key: canonical `users.school_email`, if one exists. Lowercased, `+tag` stripped, subdomain folded, dots kept.
  - **personal** key: `public.users.email` (the **signup-time** login email), lowercased and trimmed only.
  - If both are the same address, only the school key is written.
- **Enforcement:**
  - On the **live account**, by `user_id`: the proxy redirect via the `app_metadata` mirror (`src/proxy.ts:239-249`); the route gates (`requireNotRestricted` / `requireCanPublish`); and RLS (`is_restricted_now()`, `user_visible()`).
  - The **school key** is tested **only** at school-email request and confirm (`access.ts:263-302`; `school-email-apply.ts:218-219`).
  - The **personal key is never tested.** It is "EVIDENCE, NOT ENFORCEMENT" (`moderation_foundation.sql:398-404`; `actions.ts:142-154`).
- **Can a banned person come back?**
  - With a new account on any personal email: **yes**, because sign-up is never checked.
  - Posting from it with **the same** school address (canonical): **no**.
  - Posting from it with a **different** school address: **yes**.
  - If the ban was placed before they verified any school email, **nothing** stops a new verified account.
  - The suspended page's own comment concedes this (`src/app/account/suspended/page.tsx:287-295`).
- **Suspension vs ban:**
  - A suspension lasts 1 to 365 days (`admin/users/[id]/restrict/route.ts:23`) and expires at read time. A ban has no end date.
  - Both lead to: every page redirected to `/account/suspended`; all writes refused except logout, `DELETE /api/me`, the billing portal, push-device delete, block and mute (`proxy.ts:175-181`); profile, posts and comments hidden from others (`user_visible`); push devices deleted.
  - **Sign-in is never blocked.** Any GoTrue ban is cleared (`actions.ts:228-248`).
  - A ban also cancels Vibe+.
- **`/account/suspended` copy:**
  - Ban: "Your account is closed." / "A Vibe moderator closed this account, for good — there's no end date on it. … if you verified a school email here, it can't be verified on another account, so a new account can't post, comment or message. If you had Vibe+, we cancel it … no refund …"
  - Suspension: "Your account is paused." / "… until {date}. While it's paused, your profile, posts and comments aren't visible to anyone else … Vibe+ is the one thing that doesn't pause …"
  - Appeal: "If you think we got this wrong, email help@connectvibe.app … A person reads it." (`suspended/page.tsx:19,262-358`).
  - The ban paragraph's "a new account can't post" is only true for the same school address.
- **Who moderates:** anyone with `users.is_platform_admin = true`, set by hand in SQL (`20260507150000_org_governance.sql:34-36`; `src/lib/auth/require-platform-admin.ts`).
  - Admins cannot restrict another admin or themselves (`restrict/route.ts:139`).
  - Every new report emails all admins with type, reason, count and a link, but no content (`src/lib/moderation/alerts.ts:1-20`).
- **`moderation_actions`:** append-only, enforced by a trigger that refuses UPDATE and DELETE even for service_role and postgres. It has no FKs, so it survives deletions (`moderation_foundation.sql:1880-1960`).
- **Report snapshot:**
  - `reports.target_snapshot` (jsonb) holds the reported text, media URLs, owner handle and name, and the bio for user reports.
  - `target_owner_id` has no FK; `reporter_id` is SET NULL (`moderation_foundation.sql:2054-2066`; `src/app/api/me/reports/route.ts:85,342,367`).
- **Removed content:** the author still sees it with a "Removed by Vibe moderators" notice. Media is moved to the private `quarantine` bucket (`src/lib/moderation/media-quarantine.ts`).
- **Report reasons:** spam, harassment, sexual, intimate_image, child_safety, hate, self_harm, other (`src/lib/moderation/reports.ts:55-64`).
- **Automated moderation:** only a word filter on text (`src/lib/moderation/text-filter.ts`). **No image or CSAM hash scanning exists.**

### F15. Block, mute, report

- **Block:** `api/me/block`. Enforced in RLS on posts and comments (`20260928120000_blocks_in_rls.sql`) and in the profile bootstrap, which shows "Profile unavailable".
- **Mute:** `api/me/mute`, with an optional expiry in hours. It hides the muted person's posts and notifications from the muter only.
- **Report:** `api/me/reports` covers users, posts, messages, channels, comments, orgs and events.
- Block and mute stay available to restricted users.

---

## G. Account recovery and deletion

### G16. Recovery and sessions

- **Password reset** (`src/app/api/auth/password-reset/route.ts`):
  - Only to the login email: GoTrue admin `generateLink('recovery')` plus a Resend email linking to `/auth/update-password?token_hash=…`.
  - Rate limits are per IP (5 per 15 minutes) and per hashed address (3 per hour). Responses are generic (no account enumeration).
- **Lost access to the login email:**
  - **No code path.** No admin route to change a user's email or reset credentials, and no support tooling.
  - Support copy only says to "write from the address you sign in with" (`src/app/support/page.tsx:51,144-147`).
- **MFA/2FA:** none. No MFA code in `src/`; TOTP and phone are disabled in config.toml. Review notes say "there is no code or 2FA" (`handoffs/stores/review-notes.md:61`).
- **Sign out:**
  - `POST /api/auth/logout` calls server `supabase.auth.signOut()`. Its scope defaults to **global**, which revokes every refresh token (all devices), and it deletes all the user's push devices (`logout/route.ts:26-40,86`).
  - No separately labeled "sign out everywhere".
  - An issued access JWT stays valid until expiry (`jwt_expiry = 3600` in config).
  - No app code revokes sessions after a password change.

### G17. `DELETE /api/me`

Implemented in `src/app/api/me/route.ts:58-154`. The user types their handle to confirm. The steps run in this order:
1. Stripe customer deleted.
2. Uploads purged: the `profiles` and `resumes` buckets, R2 clips and chat media (`src/lib/profile/storage-purge.ts`).
3. `auth.admin.deleteUser`, which cascades to `public.users`.

**Deleted by cascade:**
- Profile row.
- Posts, including posts inside clubs.
- Comments on anyone's posts.
- Likes, reposts, bookmarks, connections.
- **All messages the user sent**, including the copies in other people's DMs and group chats. Also reactions.
- Channel memberships, org memberships and follows.
- **Events they created**, including club events.
- RSVPs, notifications, `profile_views` and `post_views` (both as viewer and as viewed).
- `terms_acceptances`, entitlements, the `billing_customers` row, push devices, mutes and blocks, personal events and Otto data.

**Survives deletion:**
- `reports` about them: `target_owner_id` uuid plus the snapshot with their name and handle at the time.
- `reports` they filed, with `reporter_id` nulled.
- `moderation_actions`: uuids, reason, and meta that may hold the handle.
- `account_restrictions`: the school and personal HMAC keys, kind, dates, reason, private note; `user_id` nulled.
- `billing_events`: event ids and the `user_id` uuid, no FK.
- `email_sends`: domain, outcome and provider id. `user_id` and `recipient_hash` are nulled by a trigger (`20260922104000_email_sends.sql:185-200`).
- `rate_limits` rows: keys with raw IPs or a hashed email. Cleanup is opportunistic after 1 day and can linger (`email_sends.sql:25-37`).
- The **`quarantine` bucket** (moderator-removed or reported media) and R2 clips of removed or reported posts, "for up to a year" (`storage-purge.ts:35-45`).
- Orgs they owned, now ownerless.
- Supabase auth audit log (email and IP), Stripe's own records, and provider logs and backups. The delete-account page discloses these.

---

## H. Data collected

### H18. Automatic collection and third parties

- **IP addresses:**
  - Stored in `public.rate_limits.key` for `pw-reset-ip:<ip>`, `school-email-ip:<ip or /64>` and `school-code-ip:<ip or /64>` (`src/lib/rate-limit.ts:52-92`; purge `20260903100000_security_hardening.sql:314-317`).
  - Also held in the Supabase auth logs and Vercel logs.
  - No geolocation code exists.
- **Devices:** `push_devices` holds transport (webpush or fcm), push address or token, keys, platform (`ios-app`, `android-app`, `ios-web`, …), `app_version`, origin and timestamps (`20260924120000_push_notifications.sql:460-485`).
  - The user agent is read to detect the app shell but **not stored**.
- **`profile_views`:** profile owner, viewer, date, a client-supplied `referrer` of up to 80 characters, and first-viewed time (`20260513000000_...sql`; `api/profile-views/route.ts:49-54`). The owner sees counts free and identities with Vibe+.
- **`post_views`:** post, viewer and date. The author sees identities with Vibe+. Saves are shown as a count only.
- **`users.last_active_at`:** updated about every 30 seconds while the campus tab is visible (`api/me/heartbeat`). Used for the aggregate "active now" count.
- **Analytics:**
  - **No analytics or ads SDK**: no Vercel Analytics, PostHog, GA or similar in `package.json` or `src/`.
  - **Sentry** (`@sentry/nextjs`): `sendDefaultPii: false`, 10% traces, auth tokens scrubbed, no replay (`src/lib/sentry-config.ts:198-201`).
- **Cookies:** only the Supabase session cookies (`src/lib/supabase/middleware.ts`). No CSRF cookie exists, despite the Privacy Policy saying there is one. localStorage holds a cached profile (`vibe_user_v1`) and UI flags.
- **Third parties seen in code:**
  - Supabase (DB, auth, storage), Vercel (hosting), Cloudflare R2 (media).
  - Resend (email, `noreply@connectvibe.app`), Stripe.
  - Sentry.
  - Firebase Cloud Messaging (Google, app push, `FCM_SERVICE_ACCOUNT_B64`); Web Push through Apple, Google, Mozilla and Microsoft endpoints.
  - Google Fonts loaded from `fonts.googleapis.com` at runtime (`src/app/layout.tsx:96`, `public/html/*.html`).
  - Cloudflare cdnjs for pdf.js (`src/lib/pdfjs-cdn.ts:14`).
  - Cloudflare Email Routing (`hello@` forwards to Gmail, per handoff).
  - No Google Maps.
- The Privacy Policy lists only Supabase, Vercel and R2 (`privacy/page.tsx:90-93`).

### H19. Who sees what

- **Signed out (anon):**
  - Landing, `/legal/*`, `/support`.
  - `/profile/<handle>` via `/api/users/<h>/bootstrap`: name, handle, avatar, banner, bio, campus badge, year, major, department, interests, skills, work experience, links, counts. The résumé is withheld.
  - `/orgs/<handle>`: name, description, logo, banner, links, member count, follower count if at least 5, and **recent club posts with author name, handle and avatar**.
  - Link-preview metadata for `/posts/<id>` (author, text, image) for published, non-removed posts by unrestricted authors. The page itself redirects to login (`posts/[id]/page.tsx:161-163`).
  - Every other `/api` read requires login.
- **Any signed-in account:** other users' public profile columns, posts and comments (RLS), events, orgs, and follower and following lists.
  - `email` and `school_email` are never exposed to other users.
  - `looking_for` is owner-only. The résumé is shown to verified viewers only.
- **Org officers:** follower lists (owner and admin), join requests (owner, admin and mod), invite candidates. The roster is visible to any member.
- **Platform admins only:** the report queue with snapshots, the moderation log, restriction history and private notes, hidden orgs and removed content, and lookup by exact login or school email (the email is not returned; `admin/users/route.ts:69-80`). Operators with the service role see everything.

---

## I. Copy audit (claims beyond "controls an @iu.edu / @purdue.edu inbox")

| File:line | Exact string | Issue |
|---|---|---|
| `src/app/legal/community/page.tsx:34-36` | "Everyone here verified a school email, which means the person on the other end of a post, a comment or a message is a real student at a real school." | Not true: unverified accounts exist, and verification is not student status |
| `src/app/legal/terms/page.tsx:40-43` | "Be currently enrolled at, or affiliated with, a U.S.-accredited college or university; Have a working '.edu' email address from that institution" | Signup takes any email; only IU/Purdue verify; enrollment never checked |
| `src/app/legal/child-safety/page.tsx:30-36` | "You need a verified school email to be here, and the Terms … require you to be 18 or older and enrolled at a U.S.-accredited college or university." | Accounts can exist unverified |
| `src/app/legal/privacy/page.tsx:174-175` | "Vibe is for users 18 and older who are affiliated with a U.S. college." | Self-attested |
| `src/app/legal/privacy/page.tsx:37` | "school-verified '.edu' email" | Accurate label |
| `public/html/profile.html:8532` | "🎓 Student · {school}" | Implies student status; campus is self-picked |
| `public/html/profile.html:8543` | "🎓 Verify your student status" | Overstates |
| `src/components/mobile/ProfileMobile.tsx:6485` | "🎓 {school ?? "Student"}" | Same |
| `src/lib/iu/campuses.ts:400` | "{IU\|Purdue} verified" | Badge fallback |
| `src/app/auth/school-email/page.tsx:503-505` | "…add your school email (…) so we know you're actually on campus." | Overstates (location) |
| `src/components/mobile/onboarding/onb-copy.ts:67` | "You're verified as a Purdue student." | Overstates |
| `src/components/mobile/onboarding/onb-copy.ts:52` | "Your school email shows you're at {system}." | Borderline |
| `src/app/campus/campus-home.tsx:12251-12254` | "Officially recognized clubs at {campus}." / "Officially recognized clubs." | Implies university recognition; it is a manual admin flag |
| `src/app/campus/campus-home.tsx:12272` | "Groups created by verified students. Anyone can follow them." | "students" |
| `campus-home.tsx:16899`, `src/app/orgs/[handle]/page.tsx:791` | title="Verified by Vibe" | No criteria exist |
| `src/lib/orgs/join-copy.ts:147-148,158-159,202-203` (and `public/html/onboarding.html:958-1029`) | "IU students only" / "Purdue students only" / "{org} is open to IU students only." | Means "holds an @iu.edu address", checked at join only |
| `src/lib/orgs/join-copy.ts:117` | "Checked against each student's verified school email when they join." | Accurate |
| `src/components/landing/home-landing.tsx:247` | "Sign up with your school email. Your campus. Your people. Yourself." | Contradicts the signup page, which asks for a personal email |
| `home-landing.tsx:236-243` | "IU · Purdue live" chips | — |
| `supabase/templates/confirmation.html` | "This is Vibe, the social app for students, clubs and orgs at IU and Purdue." | — |
| `src/app/support/page.tsx:144-147` | "Vibe also needs a school email to verify your campus." | Implies campus is verified |
| `src/app/account/suspended/page.tsx` (ban) | "…it can't be verified on another account, so a new account can't post, comment or message." | Only for that same address |
| `src/app/legal/privacy/page.tsx:65-67,73,167-169` | "cookies for sign-in sessions and CSRF protection" / "aggregate usage analytics" / "turn on multi-factor authentication if your account email supports it" | No CSRF cookie; no analytics tool; no Vibe MFA |
| `handoffs/stores/review-notes.md:59-61` (store reviewer notes, not a listing) | "New accounts must verify an @iu.edu or @purdue.edu school email before they can see the campus" | Accurate for the UI |
| `src/app/the-map/page.tsx:267` (platform-admin only) | ".edu verified sign-up unlocks Campus." | Internal |

Site metadata ("Your campus. Your people. Yourself.", `src/app/layout.tsx:15-16`; manifest; OG) makes no verification claims. No finalized App Store or Play listing text exists in the repo.

---

## J. Legal pages inventory

| Route | Effective date | Contact | Notes |
|---|---|---|---|
| `/legal/terms` | May 7, 2026 | hello@connectvibe.app | Venue: "state or federal courts located in **Monroe County, Indiana**" (`:141-143`); Indiana law; "operated by the Vibe team"; $100 liability cap; "baseline draft" disclaimer; no subscription terms |
| `/legal/privacy` | September 28, 2026 | hello@connectvibe.app | Providers list incomplete (see H18) |
| `/legal/community` | September 28, 2026 | help@connectvibe.app | "review reports within 24 hours" (`:143`); intimate images removed "within 48 hours" (`:202`) |
| `/legal/child-safety` | September 27, 2026 | help@connectvibe.app | NCMEC CyberTipline link |
| `/legal/delete-account` | September 28, 2026 | help@connectvibe.app | Names "**CONNECTVIBE. LLC**" (`:88`); detailed retention list |
| `/support` (not under /legal) | — | help@connectvibe.app | "CONNECTVIBE. LLC, an Indiana limited liability company" (`:49,192`) |
| `/auth/terms` | uses `TERMS_VERSION` | — | Interstitial |

- `TERMS_VERSION = "2026-05-07"` (`src/lib/legal/terms.ts:1`).
- Other addresses: `noreply@connectvibe.app` (sender); help@ in the restricted-email error (`school-email-apply.ts:56`) and the suspended page (`:19`).
- There is no safety@, legal@, privacy@, DMCA or copyright-agent address.

---

## What the system does NOT do

- Does not verify enrollment, student status, graduation, faculty, staff or alumni status. School verification is one-time proof of control of an `@iu.edu` or `@purdue.edu` inbox. It never expires, is never re-checked, and records no timestamp.
- Does not restrict sign-up by email domain. Any email creates an account. Unconfirmed sign-ups are never cleaned up.
- Does not verify age (18+ is a checkbox), identity, real name, photo or campus. Campus is self-selected within the verified university.
- Does not enforce "one account per person". It only enforces one verified canonical school address per account, with no alias awareness.
- Does not block banned people at sign-up, and does not test the stored personal-email ban key. Only re-verifying the same canonical school address is blocked.
- Does not offer OAuth, magic-link login, MFA/2FA or passkeys. Has no login-email change UI, no school-email removal, and no support or admin recovery path for someone who lost their login email.
- Does not transfer org ownership, does not let an owner leave, has no "claim this org" flow, does not verify clubs by school email, and does not reassign orgs whose owner deleted their account.
- Does not bill orgs. Refunds and disputes are recorded only and never processed automatically. A suspension does not pause Vibe+.
- Does not gate API or RLS reads on the reader's verification or campus (only the web UI does), and does not re-check audience eligibility for existing members.
- Does not scan images automatically (no CSAM hashing). Only a text word filter exists.
- Does not run analytics or ad trackers. It does load Sentry, Google Fonts (Google servers) and cdnjs (Cloudflare) at runtime.
- Does not delete on account deletion: reports and snapshots, the moderation log, restriction hashes, billing events, email-send stubs, rate-limit rows, quarantined media (up to 1 year), ownerless orgs, or third-party logs and backups.
