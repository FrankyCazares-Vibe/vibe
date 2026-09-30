# Org following — implementation spec

**Written 2026-09-16 against HEAD `917775f` + live catalog SELECTs (read-only).**
Source reports: membership/channels map, follow-graph + feed map, surfaces + copy map.
Requirement (Franky, verbatim): *"students should be able to see a orgs public events, but make an invite only channel where the org invites you to follow them or whatver, then you can join in the chats there"* and *"yeah you can show, maybe make a distinction between following, and them following you?"*

**Scope guard.** Everything in §3 is new SQL. Everything in §4 marked FOLLOW-UP lands on a file wave 2b run A is writing right now — **after run A merges, never in parallel**. Nothing here edits `src/lib/orgs/join-state.ts` or `membership.ts`.

---

## 1. Plain-English summary for Franky

Right now a student meets a club exactly one way: they join it, or they don't. There is no in-between, and after M1c the only club visible in production is SAE, which is **invite only** — so a new student's onboarding "Clubs" screen shows one club with a dead button. That is the hole this closes.

**Two relationships, like Instagram plus a group chat.**

**Follow** is the light one. Any student taps `Follow` on any club — open, request-only, invite-only, IU-only, unverified, doesn't matter. What they get: the club's posts land in their feed, the club shows up under "Yours", and the club can count them. What they don't get: the chats. Following is not asking for anything, so nobody has to approve it and it can never fail.

**Membership** is the real one, and it is what you already built. The club's join policy decides it — open clubs let you in with a tap, request clubs make officers approve, invite-only clubs mean an officer has to pull you in. Membership is the key to the **chat channels**. Joining a club automatically starts you following it; the reverse is never true.

**Public events don't change at all.** They're already visible to every student whether they follow, join, or do neither. That was already true before this spec; nothing about following gates or ungates an event.

**The "distinction" you asked for is the chip on the row.** Three states, three words:

| What the student sees | What it means |
|---|---|
| `Following` | **You → them.** You follow the club. |
| `Invited you` | **They → you.** An officer sent you an invite. This is "them following you." |
| `Joined` | You're in. Chats are open. |

**The walk-through for one student, on the phone:**

1. Onboarding step 5 now says **"Follow clubs"**. Every club in the list has a working `Follow` button — including SAE. The student follows three clubs and hits Continue. Their first feed is not empty.
2. SAE posts about rush. It lands in the student's feed with SAE's name and logo on it.
3. SAE's public events show on SAE's page and in the campus events list. They always did. The student RSVPs.
4. An SAE officer opens the invite sheet. **It opens already filled with SAE's followers** — the people who raised their hand — instead of an empty search box. The officer taps `Invite to join` on the student.
5. The student gets one Otto notification: **"invited you to join SAE."** They tap `Accept`.
6. They're a member. SAE's channels appear in their Chat tab and they can talk.
7. If they later leave SAE, they stop being a member and the chats disappear — but they keep following, so SAE's posts still reach them. That's the point of having two relationships.

**The one thing this spec deliberately does not do:** it does not build a "X followed your club" notification. A campus app that pings 40 officers every time somebody taps Follow is a campus app people mute. Officers get a follower **count** and a follower **list** on their own club's page instead. Adding the notification later is one line of SQL.

---

## 2. Model

### 2.1 Three standings, and exactly what each unlocks

| | Row that proves it | Governed by | Unlocks | Does **not** unlock |
|---|---|---|---|---|
| **Follower** | `org_followers` (new, §3) | nothing — auth + org not hidden | club's posts in the feed; "Yours" section; counted by the club; appears in the officer's invite pool | chats, roster, requests queue, anything member-only |
| **Member** | `org_members` (role `member`) | `orgs.join_policy` + `audience` via `orgJoinState` (`src/lib/orgs/join-state.ts:291`) — already built and applied | **chat channels** (`can_view_org_channel`), `channel_members` subscriptions, the chat rail, member roster | posting as the org, settings |
| **Officer** | `org_members.role` in `owner`/`admin`/`mod` | promoted by owner/admin (`org_members_update`) | requests queue (`OFFICER_ROLES`), invites + follower list (`owner`/`admin` — `INVITE_ROLES`), settings (`SETTINGS_ROLES`), post/event as the org | — |

**The wall.** Six things stay membership-only and must not be re-keyed to follow, because the chat gate is one SECURITY DEFINER function and every channel policy funnels through it:

| Surface | Gate | Anchor |
|---|---|---|
| Reading org channel messages | member (+ private allow list) | `can_view_org_channel`, `messages_select_org_member` |
| Posting to org channels | member + consent | `messages_insert_org_member`; `src/lib/messages/channel-access.ts:49-58` |
| Channel list / names | member (RLS strips the rest) | `src/app/api/orgs/[slug]/channels/route.ts:38-49` |
| Chat rail ("your servers") | `/api/orgs?filter=mine` = membership | `src/app/campus/campus-home.tsx:465`; `src/components/mobile/CampusMobile.tsx:1517` |
| Thread list inclusion | `channel_members` row + `channels!inner` under RLS | `src/app/api/me/threads/route.ts:376-379` |
| "+ Join all public channels" | member | `src/app/api/orgs/[slug]/channels/subscribe-public/route.ts:50-55` |

> **Hard rule for every batch below: never mint a `channel_members` row for a follower, and never change what `?filter=mine` means.** A follower with a chat rail they can't click is the worst possible version of this feature. `/api/me/threads` has an accidental safety net (the inner join re-runs `channels_select_org_member`), but it is a net, not the gate — do not lean on it.

### 2.2 Following is purely additive — it opens no new read surface

Worth stating plainly, because it bounds the blast radius: **an org's posts are already public to every signed-in student.** `posts_select_authenticated` is `USING (status = 'published' OR user_id = auth.uid())` — there is no org clause at all. `/api/orgs/[slug]/profile/route.ts:22` reads with the service client and returns 12 posts for any org, private ones included, and says so in a comment at `:65-68`: the privacy boundary is the channels, not the description or the posts.

So following changes **whose feed a public post reaches**, not who may read it. That is a far smaller change than M1c was.

### 2.3 Invites: an invite means *join*, not *follow*

Franky's sentence is ambiguous ("invites you to follow them or whatver, then you can join in the chats"). **Ruling: an invite is an invite to become a MEMBER.** Reasons:

1. Following needs no invitation — it's open to everyone, including for invite-only clubs (§2.5). An invite to do something you can already do is noise.
2. The payoff clause in Franky's own sentence is *"then you can join in the chats there."* Chats = membership. The invite has to carry membership or the sentence doesn't land.
3. It's already built that way: `org_invites`, `notifications.type = 'org_invite'`, and `admitMember(… via: "invite")` (`src/lib/orgs/membership.ts:264`) all mean membership today. Redefining it would undo M1c-era work that is in flight.

**Accepting an invite therefore makes you a member, and membership implies following**, so the invite implicitly follows too — via the trigger in §3, not via any route code. Copy stays `"invited you to join {org}"`.

### 2.4 The invariant, and what happens on unfollow / leave

**`member ⇒ follower`.** Enforced at the database, not in a route (§3.4).

| Event | `org_members` | `org_followers` | Why |
|---|---|---|---|
| Tap `Follow` | untouched | row inserted, `source` = surface | — |
| Tap `Unfollow` (non-member) | untouched | row deleted | Franky's stated rule |
| Join / accept invite / request approved / create the org | row inserted | row inserted by trigger if absent (`source='join'`) | a member who doesn't see the club's posts is a bug |
| Tap `Unfollow` while a member | — | **refused, `409 member_follows`** | preserves the invariant, so the feed needs ONE or-clause, not two. The UI never offers the control (§5), so this only fires on a race or a raw API call. |
| **Leave the club** (`DELETE /api/orgs/[slug]/join`) | row deleted | **untouched — they stay a follower** | demote, don't erase. An ex-member who still wants the club's public posts is the common case, and it mirrors "unfollowing does not remove membership". **This needs zero code: the existing leave path doesn't know the table exists.** |
| Org deleted / user deleted | cascade | cascade (`ON DELETE CASCADE` both FKs) | — |

Deferred, not built: a member who wants chats but not feed. The honest v2 answer is **Mute posts** (the `channel_member_mutes` pattern), not unfollow. Flagged, not scoped.

### 2.5 Hidden orgs and `audience` applied to following

**Hidden orgs: follow is blocked, and it 404s.** Same answer `orgJoinState` gives (`join-state.ts:302-304`): for a non-member a hidden org does not exist, so `POST /follow` returns 404 `not_found` — not 403, which would confirm the handle. **Existing follow rows survive hiding** (hiding is reversible and a platform-admin action, not a follower's doing), and an unhide restores the audience intact. Hidden orgs are filtered out of feed inclusion at the hydration step (§4.4), not by deleting rows.

**`audience` does NOT gate following. Recommend, with the reason:**

A Purdue-only club **can** be followed by an IU student. Three arguments, in order of weight:

1. **`audience` is documented as "who may join", not "who may see".** `join-state.ts:210-217` says it in the function's own doc comment: *"It is a label, not a boundary."* Members are never re-checked, and a Purdue Indianapolis student holding an `@iu.edu` address already reads as `iu`. Enforcing a label as a boundary on a brand-new surface hardens a thing the codebase says is soft.
2. **It hides nothing.** The club's posts are already readable by that student (§2.2), its page renders for them through the service client (`src/app/orgs/[handle]/page.tsx:85-99`), and its events are `USING (true)`. Refusing the follow removes the one control that always works without removing a single byte of information.
3. **This campus is one campus.** IU Indianapolis and Purdue Indianapolis share buildings. A shared-campus product whose IU students can't follow the Purdue robotics club is wrong on the facts on the ground.

**Same ruling for `unverified`** (`users.school_system is null`): they can follow. `Verify your school email` stays on the **join** path only. A student in the first five minutes of their account should be able to fill their feed.

**What this means for `orgJoinState`:** nothing. It is pure, in flight, correct, and **untouched**. Follow is a *sibling field*, never a tenth `JoinState`:

```ts
follow_state: "following" | "not_following"
```

### 2.6 The §5 blocker, resolved: every follow surface resolves the org with the SERVICE client

Live `orgs_select` (verified 2026-09-16):

```
((is_public OR is_org_member(id, auth.uid())) AND ((hidden_at IS NULL) OR is_org_member(id, auth.uid())))
```

SAE is `is_public = false`, `join_policy = 'invite'` — the one non-hidden club in production. **A non-member cannot SELECT it under the user client.** So `POST /api/orgs/sae/follow` would 404 on the org lookup for exactly the students Franky wants to court.

Two ways out, and only one is acceptable:

- **(a) Resolve the org with `createSupabaseServiceClient()` in every follow surface.** Already the house pattern: `orgs/[slug]/profile/route.ts:22`, `search/route.ts:61-62`, `orgs/[slug]/posts/route.ts:51`, `orgs/[handle]/page.tsx:85-99`.
- **(b) Widen `orgs_select`.** M1c critic A4 refused this: `authenticated` holds table-level SELECT on `orgs` (`relacl` = `authenticated=rdDxtm`), so widening leaks `owner_id`, `tags`, `school` and `updated_at` for every private club — and SAE has exactly one member, so it would name him.

→ **Take (a). M1d must not touch `orgs_select`.** This is written as a do-not-delete contract paragraph in the migration header (§3.2), the way M1c wrote the B27 contract, because the consuming batches land a wave later.

---

## 3. Data model + migration M1d

### 3.1 Why a new table and not `public.connections`

`connections` is the user→user graph: `follower_id` and `following_id` both `REFERENCES users(id)`, `CHECK (follower_id <> following_id)`, 26 live rows. Reusing it is not a shortcut, it is impossible:

1. **Fatal:** `trg_notify_on_connection AFTER INSERT` calls `notify_on_connection_insert()`, which does `INSERT INTO notifications (user_id = NEW.following_id, …)`. An org id is not a user id → FK violation on `notifications_user_id_fkey` → **the follow INSERT itself fails.** Reusing `connections` cannot work without altering a trigger 26 live rows depend on.
2. `connections.following_id` FKs to `users(id)`. A polymorphic column drops the FK and the cascade.
3. No `kind` column + `connections_select_authenticated USING (true)` means every existing reader silently starts counting clubs as people: `getCountsFor` (`src/lib/connections/queries.ts:37-46`) inflates `followers`; `loadMutualIds` (`:180`) calls a club a mutual; `hydrateUserCards` (`:398-400`) drops them with `if (!profile) return null` — **a wrong number with no error.** That is the exact lie the S58 metrics-honesty pass removed.
4. `connections`' grants are the unhardened pre-M1c shape (`anon=arwdDxtm, authenticated=arwdDxtm` — verified live). A new table gets M1c's posture cleanly.

**Name: `public.org_followers`**, not `org_follows` — it holds people, and it pairs with `org_members` in every query, list and count you will ever write next to it.

### 3.2 The migration file

**File:** `supabase/migrations/20260916120000_org_followers.sql` — new file, collides with nothing.

**Numbering note.** Live `max(version)` in `supabase_migrations.schema_migrations` is **`20260916103000`** (M1c applied). `20260916110000_revoke_campus_label_writes.sql` (M2) is **written but NOT applied**. `20260916120000` sorts *after* M2, which is correct for the deploy order below. The design name is "M1d" (it belongs to the M1 family of org work); the file sorts last. **If M1d must ship before M2 for any reason, renumber it below `20260916110000` or `db push` will replay them out of order.**

**Header sections, in M1c's order:** `WHAT IT DOES` · `CHANGES FROM THE REPORTS` · `>>> CONTRACT FOR THE FOLLOW BATCHES` (do-not-delete) · `LIVE STATE BEFORE THIS MIGRATION` · `RUNS ONCE` · `DEPLOY ORDER` · `WHY THIS IS SAFE WITH THE CODE DEPLOYED TODAY` · `HOW TO APPLY BY HAND` · `ROLLBACK`.

```sql
-- Org FOLLOWING (Franky, 2026-09-16): a club gets two relationships. FOLLOWING
-- is open to any student and puts the club's posts in their feed. MEMBERSHIP is
-- governed by orgs.join_policy (M1c) and is what unlocks the chat channels.
-- Spec: handoffs/2026-09-16-org-following-spec.md. Migration M1d.
--
-- WHAT IT DOES
--   1. New table public.org_followers (org_id, user_id, created_at, source),
--      UNIQUE (org_id, user_id), both FKs ON DELETE CASCADE.
--   2. M1c's grant posture: revoke all from anon + authenticated, grant SELECT
--      to authenticated only, one narrow SELECT policy. Every write is service
--      role, through POST/DELETE /api/orgs/[slug]/follow.
--   3. Trigger org_members_imply_follow AFTER INSERT ON org_members: becoming a
--      member writes the follow row. Not a helper call -- see CHANGES item 2.
--   4. Backfill: every existing org_members row gets a follower row
--      (source 'join'), asserted by parity, not by a hardcoded count.
--
--   It does NOT touch orgs, posts, notifications, connections or any existing
--   policy. org_members gains one AFTER INSERT trigger and nothing else.
--
-- CHANGES FROM THE REPORTS
--   1. Table is org_followers, not org_follows: it pairs with org_members in
--      every query written next to it, and the count field is follower_count.
--   2. Membership -> follow is a TRIGGER, not a call inside admitMember().
--      admitMember is not the only inserter: orgs/route.ts:391 writes the OWNER
--      row when a club is created, and admin/orgs/** may write directly. A
--      forgotten call is SILENT (student joins a club, feed stays empty) and
--      wave 2b run A is rewriting five-plus membership write paths right now.
--      A trigger cannot be forgotten and cannot be edited by a parallel batch.
--      Both writers are already service-role, so it adds no grant surface.
--   3. org_followers_select admits the row's owner OR the club's owner/admin --
--      NOT `using (true)` like public.connections. A follower list on an
--      invite-only club names the students it courted; connections is
--      `using (true)` because of an un-hardened grant, not because anybody
--      decided it should be. "Counts public, identities private" is the product
--      line (S58 metrics pass), and this policy is that line in SQL.
--      owner/admin, not owner/admin/mod, matching org_invites_select (M1c
--      critic C2). Adding 'mod' later is one CREATE OR REPLACE POLICY plus one
--      constant in src/lib/orgs/following.ts -- keep those two in step.
--   4. NO orgs.follower_count column. A denormalised counter needs a second
--      trigger, and `orgs` has no table-level UPDATE grant for authenticated,
--      so a drifted counter would be service-role-only to repair. Count it the
--      way member_count is counted.
--   5. NO notification on follow. notifications.actor_id is NOT NULL and FKs to
--      users, so an org-follow notification is one row PER OFFICER per follow,
--      plus another notifications_type_check swap. Clubs want the number. If
--      Franky wants it later it is one ALTER ... DROP/ADD CONSTRAINT.
--
--     >>> CONTRACT FOR THE FOLLOW BATCHES -- EVERY FOLLOW SURFACE MUST RESOLVE
--     >>> THE ORG WITH THE SERVICE CLIENT. Do not delete this paragraph: it is
--     >>> the only place the cost of M1c critic A4 is written down for this
--     >>> feature, and the consuming routes land two waves later.
--     M1c NARROWED orgs_select to
--       ((is_public OR is_org_member(id, auth.uid()))
--        AND ((hidden_at IS NULL) OR is_org_member(id, auth.uid())))
--     SAE -- the only non-hidden club in production -- is is_public = false,
--     join_policy = 'invite'. So under the USER client a non-member SELECTs
--     nothing for SAE, and a follow route that resolves the handle with
--     `createSupabaseServerClient()` returns 404 to exactly the students the
--     feature exists to court. The failure is silent: no error, just a Follow
--     button that says "not found".
--     SO: POST/DELETE /api/orgs/[slug]/follow, GET /api/orgs/[slug]/followers,
--     GET /api/me/followed-orgs, and the feed's followed-org hydration all
--     resolve {id, handle, name, logo_url, verified, hidden_at} with
--     createSupabaseServiceClient(). Embed NOTHING from orgs under the user
--     client. This migration does NOT widen orgs_select and must not be edited
--     to do so -- A4's reasons (authenticated holds table SELECT on orgs;
--     widening leaks owner_id, tags, school, updated_at for every private club;
--     SAE has exactly one member) have not changed.
--
-- LIVE STATE BEFORE THIS MIGRATION (read-only catalog SELECTs via the Supabase
-- MCP, 2026-09-16; RE-RUN THEM AS PRE-FLIGHT -- orgs_delete lets an owner
-- delete their own org, and wave 2b run A's routes write org_members)
--   * max(version) in supabase_migrations.schema_migrations = 20260916103000.
--     to_regclass('public.org_followers') = NULL.
--     to_regclass('public.org_follows')   = NULL (no earlier attempt).
--   * orgs 5 rows, 4 hidden. In created_at order:
--       f7ae4129 test-f7ae4129 open    both hidden   2 members 0 posts 3 events
--       6e881851 test-6e881851 request both hidden   1 member  0 posts 0 events
--       923896fb sae           invite  both VISIBLE  1 member  0 posts 6 events
--       a73bee3e test-a73bee3e request both hidden   1 member  0 posts 0 events
--       6ca4ec6e test-6ca4ec6e open    both hidden   2 members 0 posts 0 events
--     SAE is the ONLY visible club and it is invite-only. That is why this
--     migration exists: without following, every non-member's only control on
--     the only live club is a disabled button.
--   * org_members 7 rows, UNIQUE (org_id, user_id), and ZERO non-internal
--     triggers (pg_trigger) -- so the trigger below is the first one on it.
--     relacl: postgres=arwdDxtm | authenticated=rdDxtm | service_role=arwdDxtm
--     (no 'a' -- M1c's INSERT revoke is live). 3 policies: select/update/delete,
--     no insert policy.
--   * org_invites 0 rows; relacl authenticated=r (the posture copied below).
--   * connections 26 rows; relacl anon=arwdDxtm AND authenticated=arwdDxtm --
--     the UN-hardened shape this file deliberately does not copy.
--   * posts 21, posts with org_id = 0. users 18, school_system not null 14.
--   * public.org_member_role(uuid,uuid): SECURITY DEFINER, STABLE, proacl
--     {postgres=X, authenticated=X, service_role=X} -- EXECUTE granted to
--     authenticated and NOT to anon, which is what org_followers_select needs
--     (a policy expression runs as the querying role). Same dependency
--     org_invites_select already has.
--   * notifications_type_check = CHECK (type = ANY (ARRAY['follow','connection',
--     'like','comment','mention','org_invite','org_request_approved'])) -- this
--     file does NOT change it (CHANGES item 5).
--   * pg_default_acl for public tables =
--     {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm,
--      service_role=arwdDxtm}
--     -- VERIFIED LIVE. A new table is auto-granted everything to anon and
--     authenticated, so the `revoke all` below is not decoration: without it
--     any signed-in client could INSERT and DELETE follow rows directly.
--   * No table here is FORCE RLS, so the owner and the service role bypass
--     every policy -- which is why the negative tests switch role explicitly.
--
-- RUNS ONCE. Not idempotent: CREATE TABLE / CREATE TRIGGER without IF NOT
-- EXISTS, plus a one-time backfill and a DO block that raises on a mismatch. A
-- second run fails on the first statement and the whole BEGIN/COMMIT rolls
-- back, changing nothing.
--
-- DEPLOY ORDER (extends M1c's):
--   1. M1 applied 2026-09-15. DONE.       2. Wave 1 live. DONE.
--   3. M1c applied 2026-09-16. DONE.      4. Wave 2 + wave 2b (run A) ship.
--   5. M2 (20260916110000_revoke_campus_label_writes.sql).
--   6. THIS FILE, with the PRE-FLIGHT and POST-APPLY checks below. Applying it
--      here -- BEFORE any follow UI exists -- is deliberate: the trigger then
--      bakes against run A's live join/accept/approve paths for a full wave
--      with no user-visible surface, so a trigger bug shows up as a stray row
--      in a verify query instead of as a broken Join button.
--   7. Wave 3 (B12/B13/B14/B16/B19/B26) ships.
--   8. Follow batches F1-F5a, then F5b-F7 (spec §6).
--   9. feature-sentinel + security-sentinel.
--
-- WHY THIS IS SAFE WITH THE CODE DEPLOYED TODAY
--   * NOTHING in src/ reads or writes org_followers. The table is new; grep for
--     'org_followers' returns this file only. The app must behave identically
--     after apply -- that is the smoke test in HOW TO APPLY step 4.
--   * The only existing object touched is org_members, which gains one AFTER
--     INSERT trigger. Its three inserters are all SERVICE ROLE after M1c
--     (orgs/route.ts:391 owner row; [slug]/join/route.ts:63 open-policy join;
--     requests/[id]/route.ts:88 approval -- plus run A's invite-accept, which
--     goes through admitMember). authenticated holds no INSERT on the table
--     (relacl has no 'a') and org_members_insert was dropped, so no client can
--     reach the trigger directly.
--   * The trigger's only failure modes are an FK violation on an org_id/user_id
--     that cannot be missing inside the same transaction, and a unique
--     violation, which `on conflict do nothing` swallows. It cannot fail a
--     join. It is AFTER INSERT so it never alters the member row.
--   * org_members has 7 rows, so the backfill and the ACCESS EXCLUSIVE lock are
--     milliseconds; lock_timeout 5s bounds the wait if a long reader is open.
--   * Rollback drops the table, the trigger and the function and restores
--     nothing else, because nothing else changed.

begin;

-- Fail fast instead of queueing every org_members write behind M1d.
set local lock_timeout = '5s';

-- 1. the table ---------------------------------------------------------------
create table public.org_followers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id)  on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  source     text not null default 'profile'
             constraint org_followers_source_check
             check (source in ('join','profile','discover','onboarding','search','map','suggestion')),
  constraint org_followers_org_user_key unique (org_id, user_id)
);

comment on table public.org_followers is
  'FOLLOWING an org: open to any student who can see it, Instagram-style. Distinct from org_members, which is MEMBERSHIP and is the only thing that unlocks chat channels. Invariant member => follower, kept by trigger org_members_imply_follow on INSERT and by DELETE /api/orgs/[slug]/follow refusing members (409 member_follows). Unfollowing never removes membership; LEAVING never removes the follow (an ex-member keeps getting the club''s public posts). Service role writes only -- authenticated has SELECT and nothing else.';
comment on column public.org_followers.source is
  'Which surface the follow came from. ''join'' rows are written by the membership trigger, not by a student tapping Follow, so an officer can tell an AUDIENCE from a ROSTER in the followers list and the invite sheet. NAMED CHECK so a writer bug maps by constraint name instead of positional org_followers_check numbering. Routes validate the client-supplied value against this list in TypeScript and fall back to ''profile'' -- a bad client value must never reach the CHECK as a 23514.';
comment on column public.org_followers.created_at is
  'Shown to officers as "Follows since {Mon D}" in the invite sheet. Also the sort key for "clubs I follow".';

-- (org_id, user_id) UNIQUE already serves org -> followers and the existence
-- check; this one serves "clubs I follow", newest first, and the feed prelude.
create index org_followers_user_created
  on public.org_followers (user_id, created_at desc);

-- 2. grants + RLS: M1c's posture, verbatim ------------------------------------
alter table public.org_followers enable row level security;

-- pg_default_acl auto-grants arwdDxtm on every new public table to anon AND
-- authenticated (verified live, see LIVE STATE). Take it all back first.
revoke all on table public.org_followers from anon, authenticated;
grant select on table public.org_followers to authenticated;

-- The row's own student (this is what drives the "Following ✓" chip under the
-- user client) OR the club's owner/admin (the club's own audience metric, and
-- the invite sheet's default list). Deliberately NOT `using (true)`: see
-- CHANGES item 3. Counts are read by the SERVICE role, so the narrow policy
-- costs the product nothing -- but it does mean a follower_count read under the
-- USER client silently returns 1-or-0. Routes must use the service client for
-- counts. This is the single easiest silent bug in the whole feature.
create policy org_followers_select on public.org_followers
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.org_member_role(org_id, auth.uid()) in ('owner','admin')
  );
-- No INSERT / UPDATE / DELETE policy, and no grant to match: every write goes
-- through a service-role route that has already checked rate limit, Terms,
-- existence and hidden_at.

-- 3. membership implies following --------------------------------------------
create or replace function public.org_members_imply_follow() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.org_followers (org_id, user_id, source)
  values (new.org_id, new.user_id, 'join')
  on conflict (org_id, user_id) do nothing;   -- already following: keep their original source
  return new;
end $fn$;

comment on function public.org_members_imply_follow() is
  'A member who does not see their club''s posts is a bug. This is a trigger and not a call inside admitMember() because admitMember is not the only inserter (orgs/route.ts:391 writes the owner row on club creation) and a forgotten call would be silent. on conflict do nothing preserves the original source, so a deliberate Follow that later became a membership still reads as ''profile''.';

revoke all on function public.org_members_imply_follow() from public, anon;

create trigger org_members_imply_follow
  after insert on public.org_members
  for each row execute function public.org_members_imply_follow();

-- 4. backfill: every existing member follows their club ----------------------
insert into public.org_followers (org_id, user_id, source)
select om.org_id, om.user_id, 'join'
  from public.org_members om
on conflict (org_id, user_id) do nothing;

-- Assert PARITY, not a hardcoded 7: wave 2b run A's routes are live by the time
-- this applies and the member count will have moved.
do $$
declare n_member int; n_follow int; n_missing int;
begin
  select count(*) into n_member from public.org_members;
  select count(*) into n_follow from public.org_followers;
  select count(*) into n_missing
    from public.org_members om
   where not exists (
     select 1 from public.org_followers f
      where f.org_id = om.org_id and f.user_id = om.user_id
   );
  if n_missing <> 0 then
    raise exception 'M1d backfill: % org_members rows have no follower row', n_missing;
  end if;
  if n_follow <> n_member then
    raise exception 'M1d backfill: % followers vs % members -- org_followers was not empty before this ran', n_follow, n_member;
  end if;
  raise notice 'M1d backfill: % members -> % followers', n_member, n_follow;
end $$;

commit;
```

### 3.3 HOW TO APPLY BY HAND

The Supabase MCP `execute_sql` is read-only and `supabase db push` needs a DB password that is not on this machine — same as M1c.

**0. PRE-FLIGHT (read-only; the MCP is fine). Stop if anything differs you can't explain.**

```sql
SELECT (SELECT max(version) FROM supabase_migrations.schema_migrations) AS latest,  -- 20260916110000 (M2 applied)
       to_regclass('public.org_followers')::text AS followers,                      -- NULL
       to_regclass('public.org_follows')::text   AS legacy,                          -- NULL
       (SELECT count(*) FROM public.orgs)         AS orgs,                           -- 5
       (SELECT count(*) FROM public.org_members)  AS members,                        -- 7 at time of writing
       (SELECT count(*) FROM public.connections)  AS connections;                    -- 26

-- the trigger slot must be empty
SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE c.oid = 'public.org_members'::regclass AND NOT t.tgisinternal;               -- 0

-- the helper the policy leans on must still be EXECUTE-granted to authenticated
SELECT prosecdef, provolatile, proacl::text FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace AND proname = 'org_member_role';       -- t, s, {…authenticated=X…}

-- orgs_select must be M1c's, unchanged (this file must not touch it)
SELECT pg_get_expr(polqual, polrelid) FROM pg_policy
 WHERE polrelid = 'public.orgs'::regclass AND polname = 'orgs_select';
```

**1. Apply.** From the repo root, with `SUPABASE_ACCESS_TOKEN` exported from `.env.local`. Use curl, not Python (urllib gets a Cloudflare 1010 block):

```bash
export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  --data "$(jq -n --rawfile q supabase/migrations/20260916120000_org_followers.sql '{query:$q}')"
```

`[]` = success. A JSON error means nothing was applied (single transaction). `"canceling statement due to lock timeout"` means a long reader held a lock; nothing changed, retry.

**2. Record it** (same transport, `--rawfile` at a scratch `.sql`; no statements array, the file has dollar-quoted bodies):

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260916120000', 'org_followers');
```

**3. POST-APPLY VERIFY (read-only).** Use `pg_catalog` and `has_*_privilege`, not `information_schema` — the MCP role (`supabase_read_only_user`) sees 0 rows in `information_schema.column_privileges` for these tables.

```sql
-- a. shape: 5 columns, org_id/user_id NOT NULL, source default 'profile'
SELECT attname, format_type(atttypid, atttypmod), attnotnull
  FROM pg_attribute WHERE attrelid='public.org_followers'::regclass
   AND attnum > 0 AND NOT attisdropped ORDER BY attnum;

-- b. constraints, all NAMED
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.org_followers'::regclass ORDER BY 1;
-- expect org_followers_org_id_fkey (ON DELETE CASCADE),
--        org_followers_org_user_key (UNIQUE),
--        org_followers_pkey, org_followers_source_check,
--        org_followers_user_id_fkey (ON DELETE CASCADE)
-- NO org_followers_check: the CHECK is named so a 23514 maps by name.

-- c. grants -- the whole point of the M1c posture
SELECT has_table_privilege('authenticated','public.org_followers','SELECT') AS a_sel,  -- t
       has_table_privilege('authenticated','public.org_followers','INSERT') AS a_ins,  -- f
       has_table_privilege('authenticated','public.org_followers','UPDATE') AS a_upd,  -- f
       has_table_privilege('authenticated','public.org_followers','DELETE') AS a_del,  -- f
       has_table_privilege('anon','public.org_followers','SELECT')          AS n_sel,  -- f
       has_table_privilege('service_role','public.org_followers','INSERT')  AS s_ins;  -- t

-- d. exactly one policy, and it is not `true`
SELECT policyname, cmd, qual FROM pg_policies
 WHERE schemaname='public' AND tablename='org_followers';
-- expect ONE row: org_followers_select | SELECT | qual naming auth.uid() and
--   org_member_role(...) = ANY ('{owner,admin}'). No insert/update/delete policy.
SELECT relrowsecurity FROM pg_class WHERE oid='public.org_followers'::regclass;  -- t

-- e. index
SELECT indexname FROM pg_indexes
 WHERE schemaname='public' AND tablename='org_followers' ORDER BY 1;
-- expect org_followers_org_user_key, org_followers_pkey, org_followers_user_created

-- f. trigger + function
SELECT c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid)
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal
   AND c.relname IN ('org_members','org_followers') ORDER BY 1,2;
-- expect exactly 1 row: org_members | org_members_imply_follow | O | AFTER INSERT ... FOR EACH ROW
SELECT prosecdef, proacl::text FROM pg_proc
 WHERE pronamespace='public'::regnamespace AND proname='org_members_imply_follow';  -- t, no anon/public

-- g. backfill parity
SELECT (SELECT count(*) FROM public.org_members)   AS members,
       (SELECT count(*) FROM public.org_followers) AS followers,      -- equal
       (SELECT count(*) FROM public.org_followers WHERE source <> 'join') AS not_join,  -- 0
       (SELECT count(*) FROM public.org_members om
         WHERE NOT EXISTS (SELECT 1 FROM public.org_followers f
                            WHERE f.org_id=om.org_id AND f.user_id=om.user_id)) AS missing;  -- 0

-- h. nothing else moved
SELECT (SELECT count(*) FROM public.connections) AS connections,                     -- 26
       (SELECT pg_get_expr(polqual, polrelid) FROM pg_policy
         WHERE polrelid='public.orgs'::regclass AND polname='orgs_select') AS orgs_select,
       (SELECT pg_get_constraintdef(oid) FROM pg_constraint
         WHERE conrelid='public.notifications'::regclass
           AND conname='notifications_type_check') AS notif_types;
-- orgs_select UNCHANGED from M1c (the contract); notif_types UNCHANGED (no org_follow)

-- i. recorded
SELECT max(version) FROM supabase_migrations.schema_migrations;                       -- 20260916120000
```

**4. Live smoke (old code — no follow UI is shipped yet, so the app MUST look identical).**
- Open `/campus`, the phone Orgs tab, `/orgs/sae` as a non-member, and the chat rail. Every one of them behaves exactly as before. `grep -rn "org_followers" src/` returns nothing at this point.
- Join an open club from the phone → the join still succeeds (the trigger runs inside its transaction) and `select * from org_followers where source='join' order by created_at desc limit 1` shows a fresh row.
- Leave that club → the `org_members` row goes, the `org_followers` row **stays**. That is check (2.4) passing in production before any UI depends on it.

**5. Negative tests** — on a Supabase **branch or local stack, NEVER prod**. Save as `scratchpad/m1d-tests/negative-tests.sql`:
```sql
set local role authenticated;
-- each of these must fail with 42501 permission denied
insert into public.org_followers (org_id, user_id) values ('…','…');
update public.org_followers set source='profile';
delete from public.org_followers;
-- and this must return 0 rows, not an error: another student's row on a club you
-- do not officer
select count(*) from public.org_followers where user_id <> auth.uid();
reset role;
```

### 3.4 Rollback

```sql
-- Roll back the follow batches (F1-F7) FIRST if they are live: they read and
-- write this table. THIS LOSES EVERY FOLLOW ROW, including the membership
-- backfill -- but not membership itself, and re-applying M1d re-derives every
-- 'join' row from org_members. Only deliberate Follow taps are unrecoverable.
BEGIN;
  SET LOCAL lock_timeout = '5s';
  DROP TRIGGER IF EXISTS org_members_imply_follow ON public.org_members;
  DROP FUNCTION IF EXISTS public.org_members_imply_follow();
  DROP POLICY IF EXISTS org_followers_select ON public.org_followers;
  DROP TABLE IF EXISTS public.org_followers;  -- cascades its index + constraints
  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260916120000';
COMMIT;
```

Reversible with no data loss outside the new table: M1d adds nothing to `orgs`, `org_members`, `posts`, `notifications` or `connections` except the one trigger, which the rollback drops. `org_members` returns to zero non-internal triggers, matching its pre-M1d state exactly.

---

## 4. Routes

**Conventions, applied in this order in every new route** (matching `me/follow/route.ts`, `orgs/[slug]/posts/route.ts`, `orgs/[slug]/join/route.ts`):

`auth (401)` → `rateLimit (429)` → `requireTermsAccepted (403, writes only)` → **service-role org load by slug (404)** → `hidden_at` check (404) → authorize → act with the service role → respond.

**The counts rule, in one line:** `follow_state` may be read with the **user** client (`org_followers_select` admits `user_id = auth.uid()`); `follower_count` and any follower **list** must be read with the **service** client, because under the user client the policy narrows the count to 1-or-0 and the number would be a silent lie.

**The honesty rule (S58 metrics pass):** all four existing `member_count` sites fall back to `?? 0` on a read error. **Do not extend that to followers.** On a failed count read, return `follower_count: null` and render nothing.

### 4.1 New files (zero collision — batch F1)

| Route | Method | Behaviour | Response |
|---|---|---|---|
| `src/app/api/orgs/[slug]/follow/route.ts` | `POST` | rate limit `org-follow:<uid>` 60/600s · Terms · **service** org load (`id, handle, hidden_at`) → 404 · `hidden_at` non-null and viewer not a member → 404 `not_found` · **no audience check, no verified check** (§2.5) · service insert `{org_id, user_id, source}` with the client `source` validated in TS against the CHECK list, falling back to `'profile'` · 23505 → `already: true` | `200 {ok:true, following:true, already:boolean, follower_count:number\|null}` |
| same | `DELETE` | rate limit · **no Terms gate** (letting somebody out is never gated) · service org load → 404 · `org_member_role(org_id, uid)` non-null → **`409 {ok:false, error:"member_follows"}`** (§2.4) · service delete, idempotent | `200 {ok:true, following:false, follower_count:number\|null}` |
| `src/app/api/orgs/[slug]/followers/route.ts` | `GET` | service org load → 404 · gate on `FOLLOWER_LIST_ROLES` (`owner`/`admin`, mirroring `org_followers_select`) → 403 · service read, `order created_at desc`, `limit` ≤ 50, keyset `cursor` on `created_at` · hydrate identities through the existing `hydrateUserCards` path (`src/lib/connections/queries.ts:324`) so blocks/mutes are applied · rows carry `source` so an officer can tell audience from roster | `200 {ok:true, followers:[UserCard & {followed_at, source}], next_cursor:string\|null, count:number\|null}` |
| `src/app/api/me/followed-orgs/route.ts` | `GET` | user client reads own `org_followers` ids (policy admits them) · **service** client hydrates `{id, handle, name, logo_url, verified, join_policy, audience, hidden_at}` and drops hidden ones · pairs with `loadViewerOrgContext` for `join_state` | `200 {ok:true, orgs:[{…, followed_at, join_state}]}` |
| `src/lib/orgs/following.ts` (+ `.test.ts`) | — | `FOLLOWER_LIST_ROLES`, `FOLLOW_SOURCES` + `normalizeFollowSource()`, `loadViewerFollowedOrgIds(userClient, viewerId)`, `loadFollowerCounts(serviceClient, orgIds)` → `Map<string, number\|null>`, `loadFollowedOrgIdentities(serviceClient, ids)`. **Server-only, service-role-always, nothing throws** — the `membership.ts` contract, in a new file so `membership.ts` is never touched. | — |

### 4.2 FOLLOW-UP edits to wave 2b run A's files (batch F2 — after run A merges)

| In-flight file | Edit | New/changed response fields |
|---|---|---|
| `src/app/api/orgs/route.ts` (`filter=discover\|mine\|all`) | one extra service-role count query + one user-client "my follow rows for these org ids" query, both batched over the page's org ids | each row gains `follow_state: "following"\|"not_following"` and `follower_count: number\|null` |
| same | **NEW `filter=following`** — the viewer's followed clubs | same row shape |
| same | **`filter=mine` STAYS MEMBERSHIP-ONLY. Do not widen it.** `campus-home.tsx:465` and `CampusMobile.tsx:1517` build the **chat rail** from it; a follower in that rail gets channel rows they cannot open. This is the single most dangerous one-word change in the feature. | unchanged |
| `src/app/api/orgs/[slug]/route.ts` (`GET`) | same two reads for one org | `follow_state`, `follower_count` |
| `src/app/api/orgs/[slug]/profile/route.ts` | already service-client (`:22`); add the count and the viewer's row | `follow_state`, `follower_count` |
| `src/app/api/orgs/[slug]/join/route.ts` | **NO EDIT.** Join inserts `org_members`; the trigger writes the follow row. `DELETE` (leave) deliberately leaves the follow row behind (§2.4). | unchanged |
| `src/lib/orgs/join-state.ts`, `membership.ts` | **NO EDIT.** Follow is a sibling field; the trigger replaces the `admitMember` call the reports proposed. | unchanged |

### 4.3 FOLLOW-UP edit to B23's file (batch F3 — after run A merges)

`src/app/api/orgs/[slug]/invite-candidates/route.ts`:
- accept `?source=followers` (and make it the **default when `q` is empty**). Returns this club's followers who are not members, `created_at desc`, so the invite sheet opens on a warm list instead of "Type at least 2 letters" — an officer of a brand-new club has nobody to type.
- each row gains `follows_since: string | null` (rendered as `Follows since Mar 4`).
- gate unchanged (`canInvite`, owner/admin). The existing audience/cooldown/already-member states on each row are unchanged.

### 4.4 Feed inclusion (batch F4 — `src/app/api/feed/route.ts`, `src/lib/iu/community-scope.ts`)

Neither file is in run A's list. Land after wave 2 (B9 owns `feed/route.ts` for a hidden-org change) to keep one owner per file.

1. **Prelude.** Add `loadViewerFollowedOrgIds` to the `Promise.all` at `feed/route.ts:153-162`, read with the **user** client, and **fail closed** exactly like `followingRes` at `:178-181` — since wave 2 the follow set decides *visibility*, not ranking, so a failed read must not silently widen the lane. Then hydrate `{id, handle, name, logo_url, verified, hidden_at}` for those ids with the **service** client and drop `hidden_at is not null`. That second read does double duty: it is also the attribution source for step 6.
2. **Lane.** `FeedLane` gains `followedOrgIds: string[]`. `feedLaneOrFilter` (`community-scope.ts:358`) gains one clause `org_id.in.(<uuids>)`, `isUuid`-filtered and capped by a new `FOLLOWED_ORG_FILTER_CAP = 100` beside `FOLLOWED_AUTHOR_FILTER_CAP = 300` (`:294`) — PostgREST carries the whole filter in the URL, 5 clubs exist live, and a realistic student follows well under 50.
3. **Gate it on the existing `includeFollowed` flag** (`community-scope.ts:338-340`), so `?campus=<another campus>` stays that campus only. A followed club must not leak into a browse view, same rule as followed people.
4. **Belt-and-braces.** `postInFeedLane` (`:384-401`) gains the mirror clause: `lane.includeFollowed && post.org_id && followedOrgIds.has(post.org_id)`. Its signature takes a second `ReadonlySet`. Unit tests go in `src/lib/iu/community-scope.test.ts` (the lane helpers are pure by design).
5. **Ranking.** In `scoreFeedRow` (`:467`), a followed org's post gets the same 1.6 as a followed author — but take **`max(authorBoost, orgBoost)`, never the product.** An officer posting as a club you follow would otherwise score 2.56 and carpet the page.
6. **Two existing bugs this makes live — fix them in the same batch:**
   - `feed/route.ts:417` buckets the `MAX_PER_AUTHOR = 3` diversity cap on `entry.post.org?.id ?? entry.post.user_id`. The `org:orgs(...)` embed at `:221` is an **outer** embed under the user client, so it is `null` for any private/invite-only club — the cap silently falls back to the human author, and whether a club's three posts share a bucket depends on its join policy. **Bucket on `row.org_id`, the column, which is always present.**
   - Same root cause, worse symptom: an invite-only club's post arrives in a follower's feed reading as *"some officer posted"* with no club name or logo. **Resolve `{handle, name, logo_url, verified}` for every `org_id` on the page with the service client and join in TypeScript; embed nothing from `orgs` under the user client.** This is the M1c A4/B27 contract (`20260916103000:66-92`) applied to the feed. **Do not widen `orgs_select` to fix it.**
   - Live blast radius today is **zero**: `select count(*) from posts where org_id is not null` = 0. This is the cheapest moment in the product's life to fix both.
7. `posts_stamp_campus` needs **no change**: a followed club whose officer has no campus produces a campus-less row, which already enters the lane via the legacy clause.
8. **No new top-level response field.** `viewerFollowedOrgIds` would be a field nothing reads. `feed[].post.org` changes from an RLS-filtered outer embed to a service-resolved object — same shape, now never null for a post that has an `org_id`.

### 4.5 Deliberate non-changes

| Surface | Why it does not change |
|---|---|
| Events list, `?org_id=` path, `.ics` | `events_select_authenticated` is already `USING (true)` and `/api/events?org_id=` deliberately skips campus scoping (`events/route.ts:135-144`). "Public events stay visible to everyone" is already true. |
| Event RSVP | `rsvps_insert_own` is `auth.uid() = user_id` and the route never loads the event (`rsvp/route.ts:45-50`). Any student can RSVP to any event id today. That wants **tightening** (event-exists + org-not-hidden), which is wave 2's job, not this feature's. Do not add a follow gate. |
| Attendee list | Stays officer-only at the route (`attendees/route.ts:52-65`). |
| Campus map pin size | Stays **member** count. The map answers "who is physically here", not "who subscribes". |
| Suggested connections | People only. Suggested **clubs** is a separate future route (`/api/me/suggested-orgs`), not a widening — its `Suggestion` type is user-shaped end to end. |
| `notifications_type_check` | No `org_follow` type in v1 (§7 Q3 rationale). |

---

## 5. UI + copy

### 5.0 One derived helper picks every row's single button

Phone rows have room for exactly one 44px control. `src/lib/orgs/join-copy.ts` exports `primaryOrgAction({ join_state, follow_state })` — **first match wins:**

| # | Condition | Button | Secondary |
|---|---|---|---|
| 1 | `join_state === "member"` | `Joined ✓` (disabled) | — |
| 2 | `join_state === "invited"` | `Accept` (filled) | `Decline` |
| 3 | `follow_state === "not_following"` | **`Follow`** (filled) | — |
| 4 | following + `can_join` | `Join` | — |
| 5 | following + `can_request` | `Request` | — |
| 6 | following + anything else | `Following ✓` (tap = unfollow) | — |

Answering an invite outranks following; following outranks joining; a dead `Invite only` button never appears as a row's primary — it becomes a meta chip. **The org page is the one surface that shows both axes at once (§5.2), so nothing is lost by demoting membership in rows.** Rows 4–5 are the ladder Franky described: `Follow` → `Join`.

Chips (the "distinction" he asked for): `Following` · `Invited you` · `Joined` · `Invite only` · `IU only` / `Purdue only` · `Verified`.

### 5.1 Phone — Orgs tab (`src/components/mobile/CampusMobile.tsx`; today `OrgRow:2384` is a link with **no control at all**)

- Sections, in order: **`You're invited`** → **`Yours`** (members *and* follows, each with its own chip) → **`Verified`** → **`All clubs`**.
- Row line 1: club name + one chip. Line 2: `@sae · Invite only · IU only`. Right: the §5.0 control. The row body still links to the page.
- Loads `?filter=discover`; the `Org` type (`:56-65`) gains `join_state, join_reason, join_policy, audience, pending_invite, follow_state`.
- Drop the spec's "`audience_blocked` sorts last" rule — those rows are actionable now (they can be followed), so they sort normally.
- Empty state: **"Clubs are just getting started at IU Indianapolis. Follow the ones you like — their posts land in your feed."**

### 5.2 Phone + desktop — org page (`src/app/orgs/[handle]/page.tsx`, not forked by viewport)

**Header — two controls, side by side. This is the only place both axes are visible, which is what makes the model learnable.**

| `join_state` | Left (filled) | Right (outline) |
|---|---|---|
| `can_join` | `Follow` → `Following ✓` | `Join` |
| `can_request` (either reason) | `Follow` → `Following ✓` | `Request to join` |
| `invite_only` | `Follow` → `Following ✓` | `Invite only` (disabled) |
| `requested` | `Follow` → `Following ✓` | `Requested` (disabled) |
| `invited` | `Follow` → `Following ✓` | `Accept invite` (filled) + `Decline` |
| `member` | `Following ✓` (disabled, sub-line `Members follow automatically`) | `Joined ✓` (disabled) |
| `unverified` | `Follow` → `Following ✓` | `Verify your school email to join` |
| `audience_blocked` | `Follow` → `Following ✓` | `IU students only` / `Purdue students only` (disabled) |
| signed out (`join-button.tsx:39-54`) | **`Sign in to follow`** — the lowest-friction ask; today it says "Sign in to join" | — |

- Handle line (`:487`): `@sae · 128 followers · 12 members`. **Omit a count that is `null`** — never render `0 followers` because a read failed.
- Chips (`:455-461`) gain `Invite only` (lock), `IU only`, `Hidden`, and **`Invited you`**.
- **`PrivateOrgNotice`** (`:220`, `:587-634`) is rewritten from `!is_public` to `join_policy`:
  - invite → **"Invite only. Anyone can follow this club — officers add members."**
  - request → **"Anyone can follow this club. Officers approve members."**
  - `audience_blocked` → **"{Org} only takes IU students as members. You can still follow."**
- **`ChannelsSection` — the most important string in the feature.** Today every SAE non-member sees a red *"Couldn't load this org's channels."* (`ChannelsSection.tsx:51-73`) because the fetch runs for everyone and RLS returns nothing. **Skip the fetch entirely when `!viewerIsMember`**, and render by state:
  - `can_join` → **"Chats are for members. Join to start talking."** + inline `Join`
  - `can_request` → **"Chats are for members. Officers approve who joins."** + inline `Request to join`
  - `invite_only` → **"Chats are for members. Officers invite members."** (no control)
  - member → unchanged
- `FactsSection` (`:828-843`): `Followers · Members · Who can join: Anyone / By request / By invitation · Open to: Anyone / IU students / Purdue students · Status · Last activity`.
- `OrgInviteBanner` above the description when `invited`: **"You're invited to join {org}"** / `Invited by {first name} · Expires Mar 4` / `Accept invite` · `Decline`.

### 5.3 Desktop — campus Orgs tab + rail (`src/app/campus/campus-home.tsx`)

| Anchor | Change |
|---|---|
| `:8254-8259` SceneHeader | **"Follow any club to get its posts. Join to get its chats."** (replaces "Public ones you can join instantly, private ones you can request.") — one line, teaches both axes |
| `:9030-9048` filter chips | `All` · **`Following`** · `Open` · `By request` · `Invite only` |
| `:8882` `DiscoverGroup` | prepend **`You're invited`**, then **`Yours`** |
| `:9103-9111` card label | the §5.0 six |
| `:9224-9230` card meta | `@handle · Invite only · IU only · 12 members` — **no follower count on a browse card.** A follower count on every card while every club sits near 0 is "No vanity metrics" failing the same way it failed in prod for five months |
| `:8211-8232` `handleJoin` | split into `handleFollow` → `/follow` and `handleJoin` → `/join`; both map response codes through `OrgJoinControl` |
| `:8447-8454`, `:8748-8772` quick view | primary = the §5.0 button; secondary **text link** under it: `Join the chats →` / `Request to join →` when the primary is `Following ✓` |
| `:12105-12112` rail chip | `Invite only · N channels`. **Rail is fed by `?filter=mine` at `:465` — membership only, unchanged.** |
| `:3922-3936` search dropdown | append ` · Invite only` / ` · IU only`; action stays `View` — a search dropdown is the wrong place for a write |

### 5.4 Onboarding step 5 — follow, not join (`StepClubs.tsx`/`OrgPickRow` B12, `public/html/onboarding.html` B13)

**Neither file exists yet. Build it follow-first; do not retrofit.** The plan (`2026-09-15-indy-campus-onboarding-plan.md:264-270`) currently specs `Join` / `Request` / `Joined ✓`, which on today's production data is a screen with **one club and a dead button**.

- Title **"Follow clubs"**. Sub: **"Their posts show up in your feed. You can join the ones that let you."**
- **Every row's control is `Follow` → `Following ✓`. Never `Join` on this step.** Nothing here can 403, which is the point; and a first-run screen should not drop a student into a chat they never looked at.
- **Invite-only SAE is listed and actionable for the first time**, with the chip `Invite only`. Invited students pin to the top with `Accept`.
- **Keep `audience_blocked` clubs in the list** (the spec currently omits them) — they are followable, so there is something to do.
- Order: `invited` → open → request → invite-only → already-following / member last.
- `role = 'owner'` (plan `:930`, seeded-club officers): render `Following ✓` **disabled**, not a toggle.
- Continue flips to **`Continue →`** once anything is **followed** (the plan said joined) — a much lower bar to a non-empty first feed.
- Sparse-list copy: **"Clubs are just getting started at IU Indianapolis. Follow the ones you like — posts land in your feed."**
- B13's vanilla-JS twin duplicates the `join-copy` strings as a const (no TS import in static HTML); the strings must match `join-copy.ts` character for character.

### 5.5 Officer view of followers

**Where the count shows:** org page handle line and Facts block, and the settings header. **Never on a browse card** (§5.3).

**Org page settings, desktop** (`campus-home.tsx:1252`, `:1279-1288`):
- New **`Followers`** tab, `owner`/`admin` only (matching `org_followers_select`). Header `128 followers`. Cards with sub-line **`Follows since Mar 4`**, plus `Joined Mar 9` when `source = 'join'` — so an officer can read audience apart from roster at a glance.
- One button per row: **`Invite to join`**, disabled with `Already a member` / `Invited Mar 4` / `Can't invite — IU students only` per the existing invite states.
- Overview help line under the two segmented settings: **"Anyone can follow your club. This only sets who becomes a member."**
- Read-only rows for non-settings officers (`:1455-1461`): `Followers` / `Who can join` / `Open to`.

**`OrgInviteSheet`** (B25): **defaults to this club's followers who aren't members, before any typing** (§4.3). Empty state: **"Nobody follows {org} yet. Share the club's page — people who follow it show up here."** Everything else in the sheet (cooldown, audience refusal, revoke) is unchanged.

**Phone officer bar** (`admin-actions.tsx:50-103`): first button on phone is **`Invite people`**; eyebrow `:88` "Owner / admin tools" → **"Officer tools"**.

### 5.6 Search, map, profile

| Surface | Change |
|---|---|
| Phone search row (`CampusMobile.tsx:3248-3252`) | meta chips only (` · Invite only · IU only`), **no control** — search is navigate-first |
| Static profile search (`public/html/profile.html:6395-6412`) | same meta suffix. Its comment at `:6396-6397` ("orgs don't have a public follow API yet") becomes obsolete — **delete it.** It is the clearest statement in the repo that this feature was always missing |
| Map zone sheet (`MapMobile.tsx:945`) | for a non-member, add one line under the empty state: **"Members only. Follow to get their posts."** Pin size stays member count |
| Student profile club list | **Nothing. Deliberately.** There is no club list on a profile today (`ProfileMobile.tsx` has none). When one ships it is **members only, never followers** — whose clubs you're *in* is a fact about a person; whose clubs you *follow* is a browsing history, and putting that on a public profile is how a campus app gets deleted |

### 5.7 Notifications (no new type)

`org_invite` → *"invited you to join {org}"*, `org_request_approved` → *"approved your request to join {org}"*. Both already pass `notifications_type_check` (verified live) and are written by run A's routes. **No `org_follow` type.** Do not reuse `type = 'follow'` for club follows either: `OttoSidePanel.tsx:8` and `notifications/count/route.ts:72` would mix club follows into the person-follow badge.

> **Live-facing hazard, not this feature's but blocking it:** `OttoSidePanel.tsx:8` types `NotifType` without `org_invite`, and `OttoActivity.tsx:32-62` has no `describe` case for it. Batch **B27** owns the renderers and **is not in run A's file list** — so the moment run A ships, an invite renders as *"someone did something"* on the phone and a blank verb on desktop. Since the invite notification is the near-only way a student learns they were invited, **B27 must be scheduled with run A or the invite routes held behind a flag.** Escalating it here because the follow feature's payoff (officer invites a follower) dies at that last step.

---

## 6. Batches

**Sequence:** wave 2b run A merges → wave 2 → **M2 applied** → **M1d applied (F0)** → wave 3 (B12/B13/B14/B16/B19/B26) merges → **run F1** → **run F2**.

Nothing below edits a file another open batch owns. `join-state.ts` and `membership.ts` are never touched.

### Run F1 — server + shared client (5 batches, parallel)

| # | Files (owned) | Work | Acceptance |
|---|---|---|---|
| **F0** | `supabase/migrations/20260916120000_org_followers.sql` | §3, applied by hand after M2 | All of §3.3 verify (a)–(i) pass. Smoke: `grep -rn org_followers src/` → nothing, and the app is byte-identical in behaviour. Join → follower row appears; leave → follower row survives |
| **F1** | new `src/lib/orgs/following.ts` + `.test.ts`, new `api/orgs/[slug]/follow/route.ts`, new `api/orgs/[slug]/followers/route.ts`, new `api/me/followed-orgs/route.ts` | §4.1 | `POST /api/orgs/sae/follow` as a **non-member, unverified, Purdue** student → 200. `POST` on a hidden club → 404 (not 403). Double `POST` → `already:true`. `DELETE` as a member → 409 `member_follows`. `DELETE` twice → 200 both times. `GET /followers` as a plain member → 403; as owner → the list. **Every org lookup in the diff uses `createSupabaseServiceClient`; every count does too** (grep the diff for `createSupabaseServerClient` near a count) |
| **F2** | `api/orgs/route.ts`, `api/orgs/[slug]/route.ts`, `api/orgs/[slug]/profile/route.ts` — **follow-up on run A's files** | §4.2 | Discover rows carry `follow_state` + `follower_count`. **`?filter=mine` returns the same org ids as before the diff** (assert it — this protects the chat rail). New `?filter=following` works. Kill the service-role count read → `follower_count: null`, never `0` |
| **F3** | `api/orgs/[slug]/invite-candidates/route.ts` — **follow-up on B23's file** | §4.3 | Empty `q` + `?source=followers` returns SAE's followers minus members, newest first, each with `follows_since`. Gate still `canInvite` (a mod gets 403) |
| **F5a** | new `src/lib/orgs/join-copy.ts` + `.test.ts`, new `src/components/orgs/OrgJoinControl.tsx`, `OrgInviteSheet.tsx`, `OrgInviteBanner.tsx` (**B25's files**) | §5.0 + §5.5 sheet. `src/components/orgs/` does not exist yet — **if B25 is still unwritten, build the follow axis in from the first line rather than retrofitting eight call sites.** If B25 has landed, this is a follow-up edit on the same four files | Unit test walks all 9 × 2 (`JoinState` × `follow_state`) combinations and asserts exactly one primary label each. Calls routes by URL only — imports nothing from F1–F3 |

### Run F2 — client surfaces (4 batches, parallel, one owner per file)

| # | Files (owned) | Work | Acceptance |
|---|---|---|---|
| **F4** | `api/feed/route.ts`, `src/lib/iu/community-scope.ts`, `community-scope.test.ts` | §4.4 | `community-scope.test.ts` covers: org clause present only when `includeFollowed`; `?campus=<other>` drops it; cap at 100; non-uuid dropped; empty lane still `id.is.null`; `postInFeedLane` mirrors it. Seed one SAE post, follow SAE as a non-member → it appears **with SAE's name and logo**; unfollow → gone. Boost is `max`, not product. Diversity cap buckets on `row.org_id` |
| **F5b** | `src/components/mobile/CampusMobile.tsx` | §5.1 | Four sections render in order; a follower sees `Following ✓` and the club under "Yours"; **the Chat tab shows nothing new** (screenshot before/after) |
| **F5c** | `src/app/campus/campus-home.tsx` (~13.6k lines, **one owner, never parallel**) | §5.3 + §5.5 | Filter chips, card labels, quick-view secondary link, settings Followers tab. **Rail unchanged** — assert `?filter=mine` is still the only rail source. If this batch grows past the wave budget, split the settings work into a follow-up run *on the same file after F5c lands*, never in parallel |
| **F6** | `src/app/orgs/[handle]/page.tsx`, `join-button.tsx`, `ChannelsSection.tsx`, `admin-actions.tsx` | §5.2 | Two controls in the header for every `join_state` row in the table. **`/orgs/sae` as a non-member no longer shows the red "Couldn't load this org's channels."** — it shows "Chats are for members. Officers invite members." (this is a live bug fix, verify it first). Counts omitted, not zeroed, when null |
| **F7** | `StepClubs.tsx`/`OrgPickRow`, `public/html/onboarding.html` | §5.4 | On production data (SAE only, invite-only) the step renders **one club with a working Follow button** and Continue flips to `Continue →` after the tap. Strings identical across the TS and vanilla twins (diff them) |

**Sizing** matches the workflow rule (4–5 file-owned batches per run, implement → adversarial review → repair). Save the run scripts: a session limit kills a whole wave with nothing cached.

**Unexercised-branch hazard, stated up front.** Live today: 5 clubs, 4 hidden, **0 org posts**, SAE has 1 member and 6 events. Every follow-feed branch ships untested by real data — the same way the paid metrics branches shipped unexercised in session 59. **Seed one SAE post and a second non-member follower before testers touch it**, or F4's acceptance check is theatre.

---

## 7. Questions for Franky

**Q1. Do followed clubs' posts go into the feed? (Assumed yes.)**
**Recommendation: yes**, merged into the campus lane exactly the way a followed person's posts are today — including from an off-campus club, since choosing to follow is deliberate. It costs one `org_id.in.(…)` clause. Without it, following is a button that does nothing visible and nobody will tap it twice.
*Related and worth a nod:* your campus lane merges follows today, but `indy-campus-onboarding-plan.md:709,848` still describes a separate "Following lane" deferred to wave 5. Org-follow should match what shipped; somebody should retire that plan row.
*One inconsistency a student will notice:* a followed off-campus club's **posts** reach the feed, but its **events** won't reach the campus events list (events are scoped by campus, not by follow). Recommend keeping that for v1 — a calendar is about where you physically are — but it should be a decision, not an accident.

**Q2. Does joining a club automatically follow it? (Assumed yes.)**
**Recommendation: yes**, enforced by a database trigger so no route can forget it, and creating a club follows it too. The consequence to confirm: **a member is never offered `Unfollow`** — the control reads `Joined ✓`, and the API refuses a member's unfollow with a 409. A member who wants the chats but not the feed gets **Mute posts** in a later pass, not unfollow. Say the word and I'll allow member-unfollow, but it costs a second feed clause and a "member, not following" state on every surface.
**Leaving a club does NOT unfollow it** — you stop being a member, chats disappear, posts keep coming. That needs zero code and I've assumed it.

**Q3. When an officer invites someone, are they inviting them to *follow* or to *join*? (Your words covered both.)**
**Recommendation: to JOIN** — membership, which opens the chats. Following needs no invitation (it's open to everyone, including on invite-only clubs), so an "invite to follow" would be an invite to do something they can already do. Your own sentence ends with *"then you can join in the chats there"*, and chats are membership. Accepting an invite makes them a member, which auto-follows, so they get both. The notification stays **"invited you to join SAE."**
**Same answer implies: no "X followed your club" notification in v1.** Officers get a follower count and a follower list on the club's page instead. Pinging every officer on every tap is the highest-volume notification a campus app can invent and there's no mute for it. It's one line of SQL to add later if you want it.

### Defaults I took without asking (flip any of these in one line)

| Decision | Default | Where it lives |
|---|---|---|
| Can an IU student follow a Purdue-only club? | **Yes** — `audience` gates joining, not following (§2.5) | `follow/route.ts`: there is simply no audience check |
| Can an unverified student follow? | **Yes.** "Verify your school email" stays on the join path | same |
| Can a hidden club be followed? | **No** — 404, same as membership. Existing follow rows survive hiding | `follow/route.ts` hidden check |
| Who sees a club's follower **list**? | Owner + admin (not mods), matching `org_invites_select` | `org_followers_select` + `FOLLOWER_LIST_ROLES` |
| Who sees the follower **count**? | Everyone, on the club's page only — never on a browse card | §5.2, §5.3 |
| Button on an open club's **row** | `Follow`, with `Join` appearing only after they follow; `Join` is always available on the club's page | §5.0 rows 3–4 |
| Onboarding step 5 button | `Follow` only, never `Join` | §5.4 |
| Clubs on a student's profile | Nothing now; members-only if ever | §5.6 |

---

## Critic additions

**Adversarial pass, 2026-09-16, READ-ONLY.** Re-read against the live working tree (HEAD `b4a8fee`, **not** the `917775f` the spec claims — see C21) plus live catalog SELECTs. Wave 2b run A is writing *while this was read*: `git status --porcelain` went from one untracked dir to nine modified/untracked paths inside twenty minutes (`api/admin/orgs/route.ts`, `api/orgs/route.ts`, `[slug]/join`, `[slug]/posts`, `[slug]/profile`, `[slug]/requests/**`, `[slug]/members`, `[slug]/asset/[kind]`, new `[slug]/invites/`, new `admin/orgs/[slug]/hide/`, untracked `src/lib/orgs/`). Every anchor below into a run-A file is a snapshot.

Verdict: the SQL posture, the trigger-not-a-call decision, the `filter=mine`-is-the-chat-rail guard rail and the "resolve orgs with the service client" contract are all right and all worth keeping. Six things below will ship a bug or a leak as written.

### Blockers

**C1 — The diversity-cap "fix" caps the whole feed at 3 posts.** §4.4.6 says *"Bucket on `row.org_id`, the column, **which is always present**."* It is not: `org_id: string | null` (`src/app/api/feed/route.ts:47`), the column is nullable, and **21 of 21 live posts have `org_id = null`**. Implemented literally — `const key = entry.post.org_id` at `feed/route.ts:417` — every personal post shares one `null`/`undefined` bucket and `MAX_PER_AUTHOR = 3` (`:413`) truncates the entire page to three posts. The correct replacement for `entry.post.org?.id ?? entry.post.user_id` is `entry.post.org_id ?? entry.post.user_id`. Fix the sentence too, or someone will implement the sentence.

**C2 — §4.4.6's second "fix" un-hides every hidden and private club's identity, for every viewer, on every post.** Today `org:orgs(id,handle,name,logo_url,verified,is_public)` (`feed/route.ts:221`, and again at `:254` inside the reposts embed — the spec only names `:221`) is an *outer* embed under the user client, so live `orgs_select` — `((is_public OR is_org_member(id,auth.uid())) AND ((hidden_at IS NULL) OR is_org_member(id,auth.uid())))` — nulls it for a private or hidden club and the post renders as its author. §4.4.6 replaces that with a service-client resolve **"for every `org_id` on the page"**. §4.4.1's `hidden_at is not null` drop applies only to the *followed-id* hydration, never to the attribution map. Net effect: a hidden club's name, logo and `/orgs/<handle>` link appear in everyone's feed — including the deployed static client, which renders org attribution unconditionally (`public/html/profile.html:8531`, `:8557`). That is the exact object M1c spent critic A4 keeping out of the user client, reintroduced one layer up.
Also in the same item: the resolve list `{id, handle, name, logo_url, verified, hidden_at}` **drops `is_public`** (a shape change for any client reading it) and **adds `hidden_at`**, which is a field the client has no business holding.
Fix: resolve attribution only for `hidden_at is null`, fall back to author rendering otherwise, keep `is_public`, never emit `hidden_at`. Live blast radius is still 0 (`select count(*) from posts where org_id is not null` = 0) — which is the argument for getting it right now, not for shipping it wrong.

**C3 — `hydrateUserCards` does not apply blocks or mutes. §4.1 says it does.** The claim is *"hydrate identities through the existing `hydrateUserCards` path (`src/lib/connections/queries.ts:324`) so blocks/mutes are applied."* Read the function (`:324-416`): it issues four queries against `users` and `connections`, and its only drop is `if (!profile) return null` (`:400`) — which can never fire, because `users_select_authenticated` is `USING (true)` (verified live). There is no `blocks` read, no `mutes` read, no `loadHiddenUsers` call. Every real caller applies `loadHiddenUsers` (`src/lib/safety/hidden-users.ts:26-58`) *separately, before* calling it.
Concrete failure: a student blocks an SAE officer → following is open to everyone and has no block check → the officer opens the Followers tab and sees the person who blocked them, ranked by recency, with a live `Invite to join` button; same row again as the *default* contents of the invite sheet (§4.3). Run A's own `visibleInviterFirstName` (`src/lib/orgs/join-state.ts:308-345`, critic A7) exists to stop precisely the mirror image of this.
Fix: `GET /api/orgs/[slug]/followers` and `invite-candidates?source=followers` must both take `loadHiddenUsers(supabase, viewerId).hidden.ids` and drop those rows, and must fail closed on a read error the way `feed/route.ts:177-181` does.

**C4 — There is no way to remove a follower.** `org_followers` has no DELETE policy, no DELETE grant, and no officer-facing route; the only DELETE in the spec is the follower's own unfollow. An officer being harassed has zero lever short of hiding the entire club: the harasser keeps receiving the club's posts and keeps reappearing at the top of the invite sheet. Instagram — the spec's own stated model — has Remove Follower. Needs `DELETE /api/orgs/[slug]/followers/[userId]` gated on `FOLLOWER_LIST_ROLES`, plus a decision on whether a removed student may re-follow (if yes, it is theatre; if no, that is a new `org_follow_blocks` row and should be scoped now, not discovered later).

**C5 — Keyset pagination on `created_at` alone will skip or loop rows, guaranteed, on the backfilled set.** §3's backfill is one `INSERT … SELECT` inside one transaction, so **every backfilled row shares an identical `created_at`** (`now()` is transaction time). §4.1's followers list (`order created_at desc, limit ≤ 50, keyset cursor on created_at`) and §4.3's invite-sheet default sort the same way. A `<` cursor drops the remainder of a tie group; a `<=` cursor loops forever. Fix: order and cursor on `(created_at desc, id desc)`.

**C6 — The migration builds neither index the org-scoped reads need.** §3 creates `UNIQUE (org_id, user_id)` and `org_followers_user_created (user_id, created_at desc)`. The two hottest new reads are both `where org_id = ? order by created_at desc` — the followers list (§4.1) and the invite sheet's default list (§4.3) — and neither index serves them. Add `org_followers_org_created (org_id, created_at desc, id desc)`, which also makes C5's tiebreaker free.

### High

**C7 — Leaving a club leaves the student silently subscribed to a follow they never chose.** §2.4's "demote, don't erase" is right *when the student tapped Follow*. But the row they are left holding was minted by the trigger with `source='join'` — they never tapped anything. So: join an open club on a whim, leave a week later, and the club's posts keep arriving forever, with the club listed under "Yours" (§5.1), and nothing in the leave flow says so. That also undercuts the ranking rationale the spec inherits — `community-scope.ts:452-453`, *"following someone is a deliberate act"* — since the 1.6 boost would now ride on a row nobody chose. Fix: on leave, delete the follow row **when `source = 'join'`**, keep it for every other source. That is one service-role DELETE in the existing leave path, and it makes §2.4's table honest rather than clever. (This is a Franky question, not a unilateral call — but the current default is the surprising one.)

**C8 — `follow_state` collides with an existing union of the same name and different values.** `UserCardProps["follow_state"]` is already `"self" | "none" | "following" | "followed_by" | "connected"` (`src/components/network/UserCard.tsx:27`), consumed in `src/app/campus/campus-home.tsx:5864,5885` (a `followOverrides` map keyed by user id), `src/components/network/NetworkPageClient.tsx:78,325-330`, `src/components/mobile/NetworkMobile.tsx:38,251`, `MutualsSheet.tsx:139-142`, `PostAudienceSheet.tsx:88`. §2.5 introduces a second `follow_state: "following" | "not_following"` on org rows, and §4.1's followers response is `UserCard & {followed_at, source}` — so a single payload carries `follow_state` meaning *person*-follow while its sibling org row carries `follow_state` meaning *org*-follow, and F5c edits the 13,637-line file that holds both. Rename the org field (`viewer_follows: boolean`, or `org_follow_state`). Cheap now, unpickable later.
**And a requirements question this surfaces:** that existing union already has `"followed_by"` — literally *them → you*. Franky asked *"maybe make a distinction between following, and them following you?"* §1/§2.3 rule that "them following you" = `Invited you` and never ask. It may equally mean a real org→student edge (the club follows you back). That belongs in §7 as **Q4**, not as a table row in the plain-English summary.

**C9 — Every copy table is missing `hidden`, and `primaryOrgAction` is typed one value too narrow.** `JoinState` is nine values **including `"hidden"`** (`src/lib/orgs/join-state.ts:80-89`); `OrgJoinDecision.state` is `JoinState | "not_found"` (`:108`); and the copy layer is explicitly meant to take `JoinDisplayState` = the nine plus `SIGNED_OUT` (`:97-104`, and the module header at `:41-48` says so in as many words). §5.0's six rows and §5.2's nine rows have no `hidden` row, and F5a's acceptance is specced as *"all 9 × 2 (`JoinState` × `follow_state`)"*. Concretely: a platform admin viewing a hidden club gets `state: "hidden"` (`:387-388`), falls through §5.0 to row 3, and is shown a `Follow` button that the follow route answers **404** (§2.5). Type `primaryOrgAction`'s first parameter `JoinDisplayState`, cover 10 × 2, and let the compiler catch the gap — which is the whole reason `JoinDisplayState` exists.

**C10 — `followedOrgIds` must not go on `FeedLane`.** §4.4.2 says *"`FeedLane` gains `followedOrgIds: string[]`"*. `FeedLane` is produced by `feedLaneFor(scope, viewer)` (`src/lib/iu/community-scope.ts:334`), which is pure and has no access to a follow set — that is exactly why `followedAuthorIds` is a **parameter** of `feedLaneOrFilter` (`:358`) and not a lane field. And `feedLaneOrFilter` has a second caller: `src/app/api/trending/hashtags/route.ts:92` calls it with no id argument, plus `src/lib/iu/campus-request.test.ts:197`. Making it a required lane field breaks both. Pass it as a second parameter, mirrored in `postInFeedLane` (one caller, `feed/route.ts:295`).
Second half of the same item: §4.4.3 says *"gate it on the existing `includeFollowed` flag"* — that flag exists **only on `{kind:"scoped"}`** (`community-scope.ts:317`). A viewer with no verified `school_system` gets `{kind:"everything"}` (`:341`) and `feedLaneOrFilter` returns `null` — no filter at all. So for the unverified student §2.5 goes out of its way to let follow (*"A student in the first five minutes of their account should be able to fill their feed"*), the org clause is a no-op and following changes nothing about their feed. Not a bug, but the spec's stated payoff does not land for that viewer and §7 Q1 should say so.

**C11 — "one extra service-role count query … batched over the page's org ids" is not a thing PostgREST can do.** `filter=discover` returns up to 120 orgs (`src/app/api/orgs/route.ts:160`). There is no GROUP BY; `member_count` is done with the embed `members:org_members(count)` (`:156`) precisely because of that. As written an implementer either fires 120 `count:'exact', head:true` round trips or selects every follower row for 120 clubs and counts in TypeScript (unbounded as the table grows). Say `followers:org_followers(count)` on the existing service query — and then re-derive the honesty rule, because an embed that errors nulls the **whole row**, not just the count, which is not the `follower_count: null` behaviour §4.2's acceptance test describes.

**C12 — `follower_count` on `/api/orgs/[slug]/profile` leaks a hidden club's audience, anonymously.** That route is documented *"Safe to hit anonymously"* (`src/app/api/orgs/[slug]/profile/route.ts:11-19`), resolves the org with the service client, and has **no `hidden_at` gate** at HEAD. §4.2 adds `follower_count` to it and says nothing about hiding. Also unspecified: what `follow_state` is for a signed-out viewer, which §5.2's `Sign in to follow` row reads off. (Run A is rewriting this file *right now* — +141 lines at the time of this read — so §4.2's `:22` anchor and §2.2's *"returns 12 posts"* are already stale; HEAD is `.limit(24)` and the privacy comment is `:66-70`, not `:65-68`.)

### Medium

**C13 — A public follower count at N=1 is an identity, not a count.** 18 users, 5 clubs, SAE `member_count = 1`. The instant M1d's backfill lands, SAE's page reads **"1 follower · 1 member"** — the same person, named by the member list to anyone who can see it. Every subsequent tick is attributable by anyone refreshing the page. "Counts public, identities private" holds only above a floor; below it the count *is* the identity, which is the same failure mode the S58 metrics-honesty pass was cleaning up. Suppress the follower count below ~5, or show it to officers only until then. §5.3 already refuses a follower count on browse cards for a related reason — extend the reasoning one step.

**C14 — Following an invite-only club is not private, and no copy says so.** §4.3 makes the invite sheet **open on the follower list by design** — so tapping `Follow` on SAE tells SAE's officers "I am interested in rushing." For a Greek chapter on a small campus that is socially sensitive information, and §5.2's `Follow` control ships with no disclosure at all. Either add one line under the control on a non-open club ("Officers can see who follows this club.") or make it a §7 question. §1's *"Following is not asking for anything"* is the sentence that needs revising.

**C15 — The invite sheet's order is attacker-controlled.** `?source=followers` sorts `created_at desc`, and `POST`/`DELETE /follow` are both cheap and idempotent inside a 60/600s budget. Unfollow-then-refollow **re-stamps `created_at`** (the trigger's `on conflict do nothing` protects the join path, but a DELETE followed by an INSERT does not), so a student can pin themselves to the top of every officer's invite sheet indefinitely, and re-roll their `Follows since Mar 4` line at will. Either sort on something unrollable or keep a `first_followed_at` that the DELETE does not clear. Note the `DELETE` rate limit is never specified in §4.1 — only `POST`'s is.

**C16 — §5.0 hides `Join` behind `Follow` on open clubs, which Franky did not ask for.** Row 4 is `following + can_join → Join`, so a non-follower of an **open** club never sees `Join` in a row at all. §5.2 puts `Follow` and `Join` side by side on the page, and §5.4 bans `Join` from onboarding entirely. Result: joining an open club goes from one tap in a list to a tap, a navigation and a second tap, the row and the page disagree about what is available, and the API happily accepts a join from a non-follower — so the row is hiding an action the server allows. Franky's sentence is about *invite-only clubs and chats*; nothing in it asks for a follow-before-join ladder on open clubs. Recommend: row 3 applies only when `join_state !== "can_join"`, or open clubs carry both controls in the row.
Related: §5.3's `Following` filter chip will list every club the viewer is a **member** of too (member ⇒ follower), which reads wrong next to `Open` / `By request` / `Invite only`. Decide whether that chip means "followed" or "followed but not joined".

**C17 — "Nothing here can 403, which is the point" (§5.4) and "it can never fail" (§1) are not true of the route §4.1 specifies.** `POST /follow` runs `requireTermsAccepted` (403 `terms_required`), `rateLimit` (429), and a `hidden_at` check (404). Terms is fine in practice — it is a pre-onboarding proxy gate, so a student reaching step 5 has already accepted — but the spec states a guarantee the route does not give, and F7's acceptance never exercises 429 or 404. Either drop the Terms gate on follow (it is a subscription, not user-generated content, and `DELETE` already skips it on exactly that reasoning) or retire the claim.

**C18 — §5.2 misdiagnoses the ChannelsSection bug it is fixing.** The red *"Couldn't load this org's channels."* on `/orgs/sae` is **not** "the fetch runs for everyone and RLS returns nothing." `src/app/api/orgs/[slug]/channels/route.ts:22-36` resolves the handle with `createSupabaseServerClient()`; `orgs_select` gives a non-member nothing for SAE (`is_public = false`); the route returns **404 `Not found`** before it ever reads `channels`. `ChannelsSection.tsx:51-73` renders any non-ok as the red line. F6's `!viewerIsMember` skip does fix the symptom (and `viewerIsMember` is already wired — `page.tsx:248`), but: (a) F6's acceptance says "verify it first", and it will be verifying the wrong cause; (b) `channels/route.ts:29` is a *third* `orgs_select` casualty of M1c that neither run A nor this spec owns. Add it to §3.2's contract paragraph as an **existing** violation, not only as a rule for new files.

**C19 — The B27 hazard in §5.7 is understated by half.** `src/components/network/OttoSidePanel.tsx:8` types `NotifType = "follow" | "connection" | "like" | "comment" | "mention"` — missing **both** `org_invite` *and* `org_request_approved`. `describe()` in `src/components/otto/OttoActivity.tsx:32-62` (path is `components/otto/`, not `components/network/` as §5.7 has it) has a case for neither, so both fall through to the "did something" default at `:34-36`. So the moment run A ships, *neither* new notification renders — and `org_request_approved` is how a student learns their request was approved, which is the only other way in.

**C20 — The combined `.or()` URL budget is unchecked.** `FOLLOWED_AUTHOR_FILTER_CAP = 300` (`community-scope.ts:294`) already puts ~11.4 KB of uuids into the PostgREST query string; `FOLLOWED_ORG_FILTER_CAP = 100` adds ~3.8 KB on top of the campus and legacy clauses, in a **GET** URL through Kong. Pick the org cap against the combined budget rather than in isolation, and state which 100 survive the `.slice()` — today's author cap has the same unspecified ordering, and a silent truncation here is a silently-missing club.

### Low / factual

**C21 — Every anchor into `join-state.ts` is wrong, and the stated HEAD is six commits stale.** `orgJoinState` is `:376`, not `:291`. The hidden branch is `:387-388`, not `:302-304` — and it returns `"hidden"` for a platform admin, not `not_found` (see C9). The *"It is a label, not a boundary"* doc for `audienceAllows` is `:241-252`, not `:210-217`; `:302-304` lands inside `visibleInviterFirstName`'s doc comment. Cause: the file was being written in the same minute the spec was (`src/lib/orgs/` is still untracked, mtimes 05:15–05:16). Separately, the spec says *"against HEAD `917775f`"* — that commit is real but the working tree is at `b4a8fee`, six commits later, spanning the campus/feed/onboarding/profile work. Re-anchor after run A merges; the `feed/route.ts`, `community-scope.ts`, `campus-home.tsx`, `CampusMobile.tsx`, `page.tsx` and `ChannelsSection.tsx` anchors all check out, so it is only the in-flight file that drifted.

**C22 — The function revoke misses `authenticated`.** `revoke all on function public.org_members_imply_follow() from public, anon;` leaves the `authenticated=X` that `pg_default_acl` grants on every new public function (verified live: `{postgres=X, anon=X, authenticated=X, service_role=X}`). Harmless — a `returns trigger` function cannot be invoked directly — but it is not the posture the header claims. Add `authenticated` to the revoke list.

**C23 — The second backfill assertion is unreachable.** `if n_follow <> n_member then raise … 'org_followers was not empty before this ran'` cannot fire: `CREATE TABLE` runs in the same transaction, the trigger is created before the backfill, and `CREATE TRIGGER` takes SHARE ROW EXCLUSIVE on `org_members` so no concurrent INSERT can interleave (with `lock_timeout 5s` bounding the wait). Harmless, but the comment describes a state the migration's own statement order already made impossible. `n_missing` is the check that earns its place.

**C24 — Two `source` values no surface can produce.** The CHECK admits `'map'` and `'search'`, while §5.6 gives the map no follow control ("add one line under the empty state") and says search is navigate-first with **no control**. Trim the list, or add the controls.

**C25 — `/api/me/followed-orgs` (§4.1) has no rate limit and no pagination**, unlike every other list route in the spec, and it hydrates the full set with the service client.

**C26 — The trigger subscribes people a platform admin adds.** `admin/orgs/**` writes `org_members` with the service role (and a new `admin/orgs/[slug]/hide/` route is being written right now), so an admin-added member is silently subscribed to a club's posts with no action of their own. Consistent with `member ⇒ follower`, but it belongs in §2.4's table as a decision rather than as a side effect of the trigger.

**C27 — §5.2's honesty is split two ways on the same line.** `@sae · 128 followers · 12 members` omits a null follower count but renders `member_count` straight (`src/app/orgs/[handle]/page.tsx:487` has no null branch, and the four existing `member_count` sites fall back to `?? 0`). One line on the page will therefore be honest about a failed read and the other will quietly say `0`. Pick one; §4's honesty rule should cover both numbers or the page reads as a lie about the older one.

**Verified and fine, for the record.** `pg_default_acl` on public tables really is `{postgres, anon, authenticated, service_role}=arwdDxtm`, so the `revoke all` is load-bearing. `trg_notify_on_connection AFTER INSERT` → `notify_on_connection_insert()` → `INSERT INTO notifications(user_id = NEW.following_id …)` is exactly as described, so §3.1's "reusing `connections` is impossible" is correct and is the strongest paragraph in the spec. `org_members` has **zero** non-internal triggers today. `org_member_role` is `SECURITY DEFINER STABLE` with `authenticated=X` and no anon. `notifications_type_check` is unchanged. `posts_select_authenticated` is `TO authenticated` with `(status='published' OR user_id=auth.uid())` and no org clause, so §2.2 holds. `events_select_authenticated` is `USING (true)` and `/api/events?org_id=` skips campus scoping (`src/app/api/events/route.ts:135-144`), and **SAE does have `campus_id = 'indianapolis'`** — so §1's step 3 ("its events show in the campus events list") is true for the one live club, which it would not have been for the four `campus_id = null` test orgs. `filter=mine` is the chat rail in both viewports (`campus-home.tsx:465`, `CampusMobile.tsx:1517`) and hardening it against widening is the single best call in §4.2.
