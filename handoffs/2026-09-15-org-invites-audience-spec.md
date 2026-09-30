# Org join policy, audience, hidden orgs and invites: implementation spec

2026-09-15. Read-only spec. Built on the governance, notifications and surfaces reports, plan `handoffs/2026-09-15-indy-campus-onboarding-plan.md` (§2.6, §3.4 step 5, §5, §6, §7 answers 5–7, critic section), and the pending migrations `20260916100000_campuses_school_system.sql` (M1) and `20260916110000_revoke_campus_label_writes.sql` (M2). Both migrations are untracked and not applied.

**Where the facts come from.** Live-DB facts are the reports' catalog SELECTs. Every Supabase MCP `execute_sql` call failed this session, even `select 1`. Code citations were re-read at HEAD plus the wave-1 working tree.

**Settled inputs (Franky, 2026-09-15)**
- Only SAE (`923896fb`) is real. It becomes **invite only**, audience **both**, campus `indianapolis`.
- The four test orgs are **hidden, not deleted**: Finance Club `f7ae4129`, Kelley Floor - University Tower `6ca4ec6e`, CS Club `a73bee3e`, Private equity club `6e881851`.
- Every org gets a **join policy** (open / request / invite) and an **audience** (both / IU only / Purdue only), set by its officers. Audience replaces the plan's `orgs.system`.

---

## 1. Plain-English summary for Franky

**Officers** (owner, admin, mod) get two settings on every org:
- **Who can join**
  - "Anyone at Indianapolis": join with one tap.
  - "Request to join": officers approve.
  - "Invite only": officers invite people.
- **Open to**
  - "IU and Purdue students" (default)
  - "IU students only"
  - "Purdue students only"

  Vibe checks this against each student's verified school email, so nobody can fake it. Current members stay if the setting changes later.

**Invites.** Officers invite people from an "Invite people" sheet: search by name or @handle, tap Invite.
- The sheet works on the org page (so phone officers have it) and in desktop org settings.
- Every invite waits for the student to answer. Nobody is ever added silently.
- An invite lasts 30 days. Officers can revoke it.
- A student who declines can be invited again after 14 days.

**What students see**
- An Otto notification: "{officer} invited you to join SAE". It opens the org page.
- A "You're invited" banner on the org page with **Accept invite** and **Decline**.
- A "You're invited" group at the top of the Orgs tab, pinned first in onboarding's clubs step.
- Invite-only orgs still show in lists and search with an "Invite only" label and no join button. Students can see SAE exists; they can't request it.
- A student outside the audience sees a disabled "IU students only" / "Purdue students only" instead of Join. Officers can't invite them either.

**Hidden orgs** disappear from Discover, search, the map, event lists, people suggestions and onboarding.
- Their members can still open the org page and chats, under a "This org is hidden" notice.
- Nobody new can join, be invited, or get new events or org posts.
- Only a platform admin can hide or unhide an org, from /admin. Nothing is deleted.

**Also fixed along the way**
- Today "Request to join" on a private club returns "Not found" (critic A2).
- Anyone can add themselves to any public club through the database API, which would skip audience and hidden. Both close in the same migration.

**Honest gaps that stay**
- No push and no email.
- The phone has no unread badge, and phone officers get no Requests screen.
- A phone student learns about an invite only from Otto, the Orgs tab, onboarding, or an officer saying "open vibe → SAE".

---

## 2. Data model

### 2.1 Columns on `public.orgs`

| Column | Type | Default / backfill | Writes |
|---|---|---|---|
| `join_policy` | `text not null default 'open' check (join_policy in ('open','request','invite'))` | `is_public` true → `open`, false → `request`. SAE → `invite` | Service role only, no UPDATE grant |
| `audience` | `text not null default 'both' check (audience in ('both','iu','purdue'))` | All `both` (SAE is `both`) | Service role only |
| `hidden_at` | `timestamptz` (null = visible) | `now()` for the 4 test orgs | Platform-admin route only (service role) |
| `campus_id` | already in M1 §3 | SAE → `indianapolis` (folds M1b in; the 4 hidden orgs stay null) | Service role only |
| ~~`system`~~ | **removed from M1** (decision 7) | n/a | n/a |

Dropping `system` is safe: nothing in `src/` reads it (grep `org.system|orgs.system` returns 0 hits). The only reader is M1's own `posts_stamp_campus` (`20260916100000:441-454`), which switches to `nullif(o.audience,'both')`.

No `hidden_by` column. Only 3 platform admins exist, and members of a hidden org could read the column, because `authenticated` holds table-level SELECT on `orgs`.

Name clash to comment on: `channel_members.hidden_at` is a per-user thread hide (`me/threads/route.ts:427`) and means something different.

### 2.2 `is_public` going forward: kept in sync for one release, then derived

- **Why both columns for now.** Deployed bundles still send `is_public`:
  - Desktop settings sends it on every save (`campus-home.tsx:1428`).
  - The create form sends it (`campus-home.tsx:899`).
  - The PATCH route writes it with the user client under the column grant (`orgs/[slug]/route.ts:179-181,214`).
  - Three live RLS policies read it.
- **Trigger `orgs_sync_join_policy`** (BEFORE INSERT OR UPDATE OF `is_public, join_policy`):
  - If `join_policy` changed, it wins.
  - If only `is_public` changed (an old bundle), `true` → `open`, and `false` → `request`, **unless the org was `invite`, which stays `invite`**. Without that rule, any SAE settings save from an old bundle would drop SAE to request mode.
  - A legacy INSERT with `is_public=false` and the default `open` becomes `request`.
  - It always ends with `is_public := (join_policy = 'open')`.
- **Contract for new code:** send `join_policy`, never `is_public`. The column default is `true` (`20260430190000:44`), and the trigger derives the rest.
- **M2 (after wave 2 is live)** revokes `UPDATE(is_public)` from `authenticated`.
- **Later (M3 cleanup)** drops the trigger and the column once `rg -n "is_public"` has no readers. That's not in waves 1–4.

### 2.3 New table `public.org_invites`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid pk default gen_random_uuid()` | n/a |
| `org_id` | `uuid not null → orgs(id) on delete cascade` | n/a |
| `invitee_id` | `uuid not null → users(id) on delete cascade` | n/a |
| `invited_by` | `uuid → users(id) on delete set null` | null renders "an officer" |
| `status` | `text not null default 'pending' check in ('pending','accepted','declined','revoked','expired')` | n/a |
| `created_at` | `timestamptz not null default now()` | n/a |
| `expires_at` | `timestamptz not null default now() + interval '30 days'` | Expiry is lazy: readers treat `pending AND expires_at < now()` as expired, and writers flip it to `expired` before acting |
| `resolved_at` | `timestamptz` | `check ((status = 'pending') = (resolved_at is null))` |
| `resolved_by` | `uuid → users(id) on delete set null` | The invitee (accept/decline), the officer (revoke), a platform admin (hide), or null (expiry) |

- **Constraints:** `check (invited_by is null or invited_by <> invitee_id)`.
- **Indexes:**
  - unique partial `(org_id, invitee_id) where status = 'pending'` (one live invite per person per org)
  - `(invitee_id) where status = 'pending'` (inbox)
  - `(org_id, created_at desc)` (officer list)
- **No message field in v1.** Free text inside a notification is a harassment and moderation surface with no report path.
- **Why not reuse `org_join_requests`.** It has full `arwdDxtm` grants and an insert policy that checks only `user_id = auth.uid()` (`20260507110000:141-144`). A student could write their own "invite" there.

### 2.4 Notifications

- Add `notifications.org_id uuid → orgs(id) on delete cascade`, plus a partial index.
- Extend `notifications_type_check` (live: `follow, connection, like, comment, mention`; last set in `20260515100000:20-22`) with `org_invite` and `org_request_approved`. The second closes the "approved student is never told" gap for a few lines in a route B23 already edits.
- Rows are inserted by the **service role** from routes, with `actor_id` = the officer and `user_id` = the student.
- `notifications_insert_as_actor` stays `mention`-only (`20260515100000:38-44`).
- A revoke deletes the matching `org_invite` notification.

### 2.5 RLS and grants (everything lands in M1)

| Object | Today (live) | After M1 | Why it's safe with deployed code |
|---|---|---|---|
| `orgs_select` | `is_public OR is_org_member` (`20260507110000:60-66`) | **`hidden_at IS NULL OR is_org_member(id, auth.uid())`** | Every non-hidden org row is already rendered to any signed-in user: `/orgs/[handle]` loads with the service role (`page.tsx:85-94`) and Discover lists private orgs (`orgs/route.ts:149-160`). The old policy only produced 404s: critic A2, `[slug]` GET, the SAE page's ChannelsSection error, and the notifications org embed would be null for invitees. anon still has no grant. Side effect: `campus-map/route.ts:132` (user client) starts listing SAE to non-members, which Q1's answer wants anyway |
| `org_members_select` | member OR org `is_public` (`20260903100000:99-107`) | member OR (org `join_policy='open' AND hidden_at IS NULL`) | Same result for visible orgs; test-org rosters close |
| `org_members_insert` | self-insert into any public org (`20260903100000:109-118`) | **dropped**; `revoke insert on org_members from authenticated` | Every insert already uses the service role: `join/route.ts:63`, `requests/[id]/route.ts:88`, `orgs/route.ts:391`. Without this, a direct PostgREST insert skips audience, hidden, visiting, rate limit and Terms. Retires plan §5.4's "deferred" row for this policy |
| `org_join_requests` | anon + authenticated `arwdDxtm`; insert `user_id=uid`; officers update (`20260507110000:131-149`) | Drop the insert and update policies. `revoke all from anon`. Revoke insert/update/delete/truncate/references/trigger from authenticated. **Keep SELECT** | Writes are service role (`join/route.ts:116`, `requests/[id]/route.ts:103`). Discover reads pending requests with the user client (`orgs/route.ts:141-147`), so SELECT stays |
| `org_invites` | n/a | RLS on. `revoke all from anon, authenticated` (Supabase default ACL auto-grants `arwdDxtm`, M1 header `:60-67`). `grant select to authenticated`. Policy `invitee_id = auth.uid() OR org_member_role(org_id, auth.uid()) IN ('owner','admin','mod')` | New table |
| `orgs.join_policy/audience/hidden_at` | n/a | No UPDATE grant (orgs UPDATE is per-column; critic D3) | n/a |
| `notifications` | n/a | New column and type values only | Existing rows all satisfy the new CHECK |

No DB backstop trigger for audience on `org_members`. `authenticated` no longer has INSERT, so the grant is the boundary (security-model rule: "grants not routes").

### 2.6 Exactly what to change in `20260916100000_campuses_school_system.sql`

The migration is unapplied, so edit it in place. Four edits plus one appended section.

**Edit 1: section 3 (`:375-385`).** Replace the whole block with:
```sql
-- 3. orgs --------------------------------------------------------------------
alter table public.orgs
  add column campus_id   text references public.campuses(id) on update cascade,
  add column join_policy text not null default 'open'
             check (join_policy in ('open','request','invite')),
  add column audience    text not null default 'both'
             check (audience in ('both','iu','purdue')),
  add column hidden_at   timestamptz;
create index orgs_campus_id_idx on public.orgs (campus_id);
comment on column public.orgs.campus_id is
  'Community the org meets in. Service role writes only (no UPDATE grant).';
comment on column public.orgs.join_policy is
  'open = join instantly, request = officers approve, invite = officers invite. Service role writes only. is_public mirrors (join_policy = ''open'') via trigger orgs_sync_join_policy until the M3 cleanup.';
comment on column public.orgs.audience is
  'Which verified universities may join: both | iu | purdue, compared with users.school_system. Replaces the plan''s orgs.system (Franky decision 7). Service role writes only.';
comment on column public.orgs.hidden_at is
  'Set by a platform admin: the org leaves every list, search, map, event list and suggestion; members keep direct access. Unrelated to channel_members.hidden_at (a per-user thread hide). Service role writes only.';
-- No grant: authenticated already holds table-level SELECT on orgs (critic D3),
-- and orgs UPDATE is per-column, so these columns get no UPDATE.
```

**Edit 2: `posts_stamp_campus` (`:441-442`).** Change `select o.campus_id, o.system` to `select o.campus_id, nullif(o.audience, 'both')`. Also update the header comment at `:55-58` from "org.system" to "the org's audience when it is iu or purdue". Plpgsql bodies resolve columns at run time, and section 3 runs before any posts write, so the order is fine.

**Edit 3: header.**
- Item 3 (`:25-28`): "orgs + campus_id, join_policy, audience, hidden_at (no `system`)".
- Add item 5, pointing at §2.6 of this spec.
- Verify step e (`:216-217`) becomes the §2.7 checks below.
- In step g (`:236`), replace the `orgs.system` UPDATE check with `join_policy`, `audience` and `hidden_at` UPDATE → f.
- Rollback (`:277`): `ALTER TABLE public.orgs DROP COLUMN IF EXISTS hidden_at, DROP COLUMN IF EXISTS audience, DROP COLUMN IF EXISTS join_policy, DROP COLUMN IF EXISTS campus_id;`, plus the §2.8 lines.

**Edit 4:** delete the M1b note in plan §5.1 (`plan:477`). SAE's campus is set here.

**Append: insert before the final `commit;` (`:468`).**
```sql
-- 5. org governance: join policy, audience, hidden, invites (Franky 2026-09-15,
--    decisions 5-7; spec scratchpad/org-invites-audience-spec.md) -------------

-- 5a. backfill join_policy from is_public, then keep them in sync
update public.orgs set join_policy = case when is_public then 'open' else 'request' end;  -- expect 5

create or replace function public.orgs_sync_join_policy() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.join_policy = 'open' and new.is_public = false then
      new.join_policy := 'request';               -- legacy create body {is_public:false}
    end if;
  elsif new.join_policy is distinct from old.join_policy then
    null;                                          -- new code: join_policy wins
  elsif new.is_public is distinct from old.is_public then
    new.join_policy := case                        -- old bundles toggling is_public
      when new.is_public then 'open'
      when old.join_policy = 'invite' then 'invite'  -- a "private" save keeps invite
      else 'request' end;
  end if;
  new.is_public := (new.join_policy = 'open');
  return new;
end $$;
revoke all on function public.orgs_sync_join_policy() from public, anon;
create trigger orgs_sync_join_policy
  before insert or update of is_public, join_policy on public.orgs
  for each row execute function public.orgs_sync_join_policy();

-- 5b. Franky's org list (replaces M1b). Raises, and rolls back all of M1,
--     if a prefix doesn't match exactly the expected rows.
do $$
declare n int;
begin
  update public.orgs
     set join_policy = 'invite', audience = 'both', campus_id = 'indianapolis'
   where left(id::text, 8) = '923896fb';                       -- SAE
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'SAE: expected 1 row, got %', n; end if;

  update public.orgs set hidden_at = now()
   where left(id::text, 8) in ('f7ae4129','6ca4ec6e','a73bee3e','6e881851');  -- test orgs
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'test orgs: expected 4 rows, got %', n; end if;
end $$;

-- 5c. RLS. Non-hidden org rows are already public to signed-in users
--     (/orgs/[handle] and discover use the service role), so stop hiding
--     private orgs (critic A2's root cause) and start hiding hidden ones.
drop policy if exists orgs_select on public.orgs;
create policy orgs_select on public.orgs
  for select to authenticated
  using (hidden_at is null or public.is_org_member(id, auth.uid()));

drop policy if exists org_members_select on public.org_members;
create policy org_members_select on public.org_members
  for select to authenticated
  using (
    public.is_org_member(org_id, auth.uid())
    or exists (select 1 from public.orgs o
                where o.id = org_members.org_id
                  and o.join_policy = 'open' and o.hidden_at is null)
  );

-- Membership and join requests are written only by service-role routes that
-- check policy, audience, hidden, campus, rate limit and Terms
-- (join/route.ts:63,116; requests/[id]/route.ts:88,103; orgs/route.ts:391).
drop policy if exists org_members_insert on public.org_members;
revoke insert on table public.org_members from authenticated;

drop policy if exists org_join_requests_insert on public.org_join_requests;
drop policy if exists org_join_requests_update on public.org_join_requests;
revoke all on table public.org_join_requests from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.org_join_requests from authenticated;          -- SELECT stays

-- 5d. invites
create table public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id)  on delete cascade,
  invitee_id  uuid not null references public.users(id) on delete cascade,
  invited_by  uuid references public.users(id) on delete set null,
  status      text not null default 'pending'
              check (status in ('pending','accepted','declined','revoked','expired')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '30 days'),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  check ((status = 'pending') = (resolved_at is null)),
  check (invited_by is null or invited_by <> invitee_id)
);
comment on table public.org_invites is
  'Officer -> student org invites. Service role writes only; the invitee and the org''s owner/admin/mod can read.';
create unique index org_invites_one_pending on public.org_invites (org_id, invitee_id) where status = 'pending';
create index org_invites_invitee_pending on public.org_invites (invitee_id) where status = 'pending';
create index org_invites_org_created on public.org_invites (org_id, created_at desc);

alter table public.org_invites enable row level security;
revoke all on table public.org_invites from anon, authenticated;   -- undo Supabase default ACL
grant select on table public.org_invites to authenticated;
create policy org_invites_select on public.org_invites
  for select to authenticated
  using (invitee_id = auth.uid()
         or public.org_member_role(org_id, auth.uid()) in ('owner','admin','mod'));

-- 5e. notifications: org rows
alter table public.notifications
  add column org_id uuid references public.orgs(id) on delete cascade;
create index idx_notifications_org on public.notifications (org_id) where org_id is not null;
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow','connection','like','comment','mention','org_invite','org_request_approved'));
```

### 2.7 M1 post-apply SELECTs to add (read-only; use `has_*_privilege`, not information_schema)

| Check | Expected |
|---|---|
| `select join_policy, audience, count(*), count(hidden_at), count(campus_id) from orgs group by 1,2 order by 1` | `invite both 1 0 1` · `open both 2 2 0` · `request both 2 2 0` |
| `select count(*) from orgs where is_public <> (join_policy = 'open')` | 0 |
| `pg_policies` for `orgs`, `org_members`, `org_join_requests`, `org_invites` | `orgs_select` qual mentions `hidden_at`. No `org_members_insert`. `org_join_requests` has only `_select`. `org_invites_select` exists |
| `has_table_privilege('authenticated','public.org_members','INSERT')` | f |
| `has_table_privilege('authenticated','public.org_join_requests', 'INSERT' / 'UPDATE' / 'SELECT')` | f / f / t |
| `has_table_privilege('anon','public.org_join_requests','SELECT')` | f |
| `has_table_privilege('authenticated','public.org_invites', 'SELECT' / 'INSERT' / 'UPDATE')` | t / f / f |
| `has_table_privilege('anon','public.org_invites','SELECT')` | f |
| `has_column_privilege('authenticated','public.orgs', c, 'UPDATE')` for `join_policy`, `audience`, `hidden_at` | f f f |
| `has_column_privilege('authenticated','public.orgs','is_public','UPDATE')` | t (until M2) |
| `pg_get_constraintdef` of `notifications_type_check` | includes `org_invite`, `org_request_approved` |
| Trigger list (M1 step f) | adds `orgs | orgs_sync_join_policy | BEFORE INSERT OR UPDATE OF is_public, join_policy` |

### 2.8 M2 and rollback additions

- **Append to `20260916110000_revoke_campus_label_writes.sql`** before `commit;` (`:117`):
  ```sql
  -- Wave 2's PATCH /api/orgs/[slug] writes join_policy with the service role after
  -- an owner/admin check (critic A3), so the legacy is_public column grant goes.
  -- The sync trigger stays until the M3 cleanup.
  revoke update (is_public) on public.orgs from authenticated;
  ```
- **M2 pre-check 1:** also confirm every `is_public` writer uses the service client.
- **M2 post-check:** add `('public.orgs','is_public')` expecting `t f f f`.
- **M2 rollback:** add `GRANT UPDATE (is_public) ON public.orgs TO authenticated;`.
- **M1 rollback additions** (before dropping the org columns):
  ```sql
  DROP TABLE IF EXISTS public.org_invites;
  DROP TRIGGER IF EXISTS orgs_sync_join_policy ON public.orgs;
  DROP FUNCTION IF EXISTS public.orgs_sync_join_policy();
  ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('follow','connection','like','comment','mention'));   -- delete org_* rows first
  ALTER TABLE public.notifications DROP COLUMN IF EXISTS org_id;
  -- restore policies verbatim from 20260507110000:60-66,131-149 and 20260903100000:99-118,
  -- and re-grant: GRANT INSERT ON public.org_members TO authenticated;
  --              GRANT INSERT, UPDATE, DELETE ON public.org_join_requests TO authenticated;
  ```

### 2.9 Negative tests (local stack or Supabase branch only, never prod)

1. As `authenticated`, insert into `org_members`: permission denied.
2. Insert or update `org_join_requests`: denied.
3. Any write to `org_invites`: denied.
4. Select another person's invite as a plain member: 0 rows.
5. Select a hidden org as a non-member: 0 rows. As a member: 1 row.
6. `update orgs set is_public=false` on an `invite` org (as owner, pre-M2): `join_policy` stays `invite`. On an `open` org: becomes `request`.
7. Insert org `{is_public:false}` with no `join_policy`: `request`. Insert `{join_policy:'invite'}`: `is_public=false`.
8. `update orgs set audience='iu'` as owner: permission denied.
9. The 5b DO block against a DB with a missing prefix: raises, and nothing from M1 is applied.

---

## 3. Rules

### 3.1 Terms
- **Officer** = org role `owner`, `admin` or `mod`. They can invite, revoke, and approve or deny requests. This matches `requests/[id]/route.ts:57`.
- **Settings officer** = `owner` or `admin`. They can change join policy and audience. This matches `orgs_update` and `canManage` (`campus-home.tsx:1277`).
- **Viewer system** = `users.school_system` (M1): `iu`, `purdue` or null (unverified).
- **Audience allows** = `audience = 'both' AND system IS NOT NULL`, or `audience = system`.

### 3.2 One decision order (`orgJoinState`, B22), used by every route and surface

| # | Condition | `join_state` | POST `/join` result |
|---|---|---|---|
| 1 | Viewer is a member | `member` (+ `role`) | 200 `{joined:true, role}` (idempotent, `join/route.ts:52-60`) |
| 2 | `hidden_at` set, viewer not a member | `hidden` for a platform admin; otherwise **not found** | 404 `not_found` |
| 3 | Viewer system null | `unverified` | 403 `school_unverified` |
| 4 | Audience doesn't allow the viewer's system | `audience_blocked` (+ `audience`) | 403 `audience_mismatch` |
| 5 | Pending, unexpired invite | `invited` (+ `pending_invite`) | Admit, `via:"invite"` |
| 6 | `open`, and not visiting (the org's and viewer's `campus_id` both set and different) | `can_join` | Admit, `via:"join"`. A leftover pending request is marked `approved` |
| 7 | Pending request | `requested` | 200 `{pending:true, request}` (idempotent) |
| 8 | `invite` | `invite_only` | 403 `invite_only`. **Never** files a request |
| 9 | `request`, or `open` while visiting (plan §2.6) | `can_request` (+ `reason: policy \| visiting`) | Insert request → `{pending:true, request}` |

Why this order:
- Audience comes before invite: an invite sent before an audience change must not admit an ineligible student.
- Open comes before a leftover request: switching Request → Open shouldn't strand people.
- The visiting rule never applies to invites: the officer chose the person.

### 3.3 Matrix (non-member, visible org)

| join_policy ↓ / viewer → | system matches audience | system doesn't match | unverified |
|---|---|---|---|
| **open** | Join (Request when visiting) | Disabled "IU students only" / "Purdue students only" | "Verify your school email to join" |
| **request** | Request → officer approves (re-checked at approve) | Disabled audience label | Verify link |
| **invite**, no invite | Disabled "Invite only" | Disabled audience label | Verify link |
| **invite**, pending invite | Accept invite / Decline | Disabled audience label (the invite is void; accept → 403) | Verify link |

### 3.4 Hidden orgs (decision: members keep direct access, everyone else gets 404)

**Why not "gone for everyone"**
- Hiding is reversible and "not deleted". If members lost their page and chats, it would read as data loss.
- `can_view_org_channel` and `me/threads` already key on membership, so a full lock-out means filtering more files (`me/threads/route.ts:259,331,415`, channels routes) for 4 test orgs whose members are test accounts.
- Franky (or the owner test account) can still open them to check before unhiding.

**Where hidden orgs are excluded (for everyone, members included)**
- Discover (`orgs/route.ts:154`)
- search, both orgs and events (`search/route.ts:86-108`)
- `campus-map` + `zone` (`campus-map/route.ts:129-139`, `zone/route.ts:71-83`)
- events lists: the campus org-id list at `events/route.ts:167-181`, `?org_id=` → `[]` at `:136-145`, and the embed filter at `:120-122`
- `suggested-connections` shared-org peers (`:122-148`)
- onboarding step 5 (through Discover)
- campus trending and stats: no org reads found

**What members keep**
- `filter=mine` returns it with `hidden:true` (drives the ServerRail at `campus-home.tsx:465` and phone chats at `CampusMobile.tsx:1517`).
- `/orgs/[handle]` renders with the hidden notice.
- `[slug]` GET, channels, messages and the roster keep working.
- Their own RSVPs and calendar entries (`me/upcoming-events`, `me/calendar`, ics): no change, and there are 0 upcoming events on hidden orgs.

**Blocked on a hidden org, even for its officers**
- join, request, approve (409 `org_hidden`)
- invite (409 `org_hidden`)
- event create (`events/route.ts:355-389`) → 404
- RSVP to its events (`events/[id]/rsvp/route.ts`) → 404
- posting as the org (`orgs/[slug]/posts/route.ts:66`) → 409 `org_hidden`
- `channels/subscribe-public` → allowed (members only)

**Feed and reposts:** no filter needed. There are 0 org posts live, and org posting is blocked while hidden.

**Hiding an org** (admin route) also:
- sets every pending invite to `revoked` (`resolved_by` = admin) and deletes those `org_invite` notifications;
- leaves pending requests in place, but they can't be approved.

**Unhiding** restores everything.

**Metadata:** `generateMetadata` (`page.tsx:66-81`) returns a generic "Org not found" title for a hidden org when the viewer isn't a member.

### 3.5 Invite lifecycle

1. **Send** (officer, org not hidden):
   - The target must exist, be verified (`school_system` not null), be onboarded, and not have a stranded `^u[0-9a-f]{32}$` handle. Otherwise 404 `user_not_found`. The same 404 is used for blocks either way, so a block isn't revealed.
   - Not self → else 400 `self_invite`.
   - Not already a member → else 409 `already_member`.
   - **Audience must allow the target's system** → else 403 `audience_mismatch` with `audience`. The officer sees "This org is open to IU students only."
   - Already a pending unexpired invite → 200 `{already:true, invite}`.
   - Declined in the last 14 days → 409 `recently_declined` with `available_at`.
   - Target has a pending **request** → admit them now (they asked). Returns `{admitted:true}`, sends `org_request_approved`, and creates no invite.
   - Otherwise: flip stale expired rows, insert `org_invites`, insert an `org_invite` notification. A notification failure is logged and doesn't fail the send; the org page and Discover still show the invite.
2. **Student notified:** Otto row, org page banner, "You're invited" group, onboarding step 5 pin (§5).
3. **Accept** = `POST /api/orgs/[slug]/join`. There's one join entry point for every row type. It re-checks hidden, audience and expiry. `admitMember` then:
   - inserts `org_members(role='member')`; unique `(org_id,user_id)` exists (`20260430190000:90`), so a 23505 counts as already a member;
   - subscribes public channels (moved from `join/route.ts:76-93`);
   - marks the invite `accepted`;
   - marks any pending request `approved`;
   - marks the invite notification read.
4. **Decline** = `POST /api/me/org-invites/[id] {action:"decline"}`:
   - `pending` → `declined`, and the notification is marked read.
   - Repeating it → `{already:true}`.
   - An accepted, revoked or expired invite → 409 `invite_not_pending`.
5. **Revoke** = officer `DELETE /api/orgs/[slug]/invites/[id]`: `pending` → `revoked`, the notification is deleted, otherwise 409 `invite_not_pending`.
6. **Re-invite:** immediately after revoked or expired; 14 days after declined.
7. **Expiry:** 30 days, applied lazily as in §2.3.
8. **Policy change:**
   - Invites stay valid in every policy. Officers may invite into open and request orgs too.
   - **Audience change:** pending invites to now-ineligible students → `revoked`, with notifications deleted. Pending requests stay, but approve returns 409 `audience_mismatch`. Existing members stay.
   - An audience that excludes the **owner's** system is refused: 400 `audience_excludes_owner`. The same rule applies to the creator at create time.
9. **Leave** is unchanged. Owners can't leave (`join/route.ts:152-157`). Leaving an invite-only org means you need a new invite.
10. **Events of invite-only or audience-restricted orgs:** unchanged. They stay visible on campus and anyone can RSVP. Rush and recruitment events are how invite-only orgs meet prospects. Hidden orgs' events are excluded (§3.4).

---

## 4. Routes

**Conventions for every route**
- Error body: `{ok:false, error:<human copy>, code:<snake_case>}`. The `code` field is new on org routes; `error` text stays for old clients.
- Order: auth (401 `unauthorized`) → `rateLimit(key,{limit,windowSec})` + `tooManyRequests` (`src/lib/rate-limit.ts:25,133`) → `requireTermsAccepted(user.id)` (`src/lib/legal/require-terms.ts:27`) → **service-role load of the org** → authorize → act.
- Blocks come from `blocks` (`blocker_id`, `blocked_id`), read with the service role and failing **closed**, unlike `users/search/route.ts:136-138`.

### 4.1 Shared lib (new, wave 1, B22)

```ts
// src/lib/orgs/join-state.ts — pure, no imports beyond types; tested with node --test
export type JoinPolicy = "open" | "request" | "invite";
export type OrgAudience = "both" | "iu" | "purdue";
export type OrgRole = "owner" | "admin" | "mod" | "member";
export const OFFICER_ROLES: readonly OrgRole[];          // owner, admin, mod
export const SETTINGS_ROLES: readonly OrgRole[];         // owner, admin
export const INVITE_TTL_DAYS = 30, DECLINE_COOLDOWN_DAYS = 14;
export type JoinState =
  | "member" | "invited" | "requested" | "can_join" | "can_request"
  | "invite_only" | "audience_blocked" | "unverified" | "hidden";
export function audienceAllows(a: OrgAudience, s: "iu" | "purdue" | null): boolean;
export function isJoinPolicy(v: unknown): v is JoinPolicy;
export function isOrgAudience(v: unknown): v is OrgAudience;
export function orgJoinState(i: {
  org: { join_policy: JoinPolicy; audience: OrgAudience; hidden_at: string | null; campus_id: string | null };
  viewer: { school_system: "iu" | "purdue" | null; campus_id: string | null; is_platform_admin: boolean };
  role: OrgRole | null;
  pendingInvite: { id: string; expires_at: string } | null;
  pendingRequest: { id: string } | null;
  now?: Date;
}): { state: JoinState | "not_found"; reason?: "policy" | "visiting"; audience?: "iu" | "purdue" };

// src/lib/orgs/membership.ts — "server-only", service client passed in
export async function loadViewerOrgContext(service, orgId: string, userId: string):
  Promise<{ role; pendingInvite; pendingRequest; viewer }>;   // 1 round trip, Promise.all
export async function subscribePublicChannels(service, orgId: string, userId: string): Promise<void>;
export async function admitMember(service, a: { orgId: string; userId: string; actorId: string;
  via: "join" | "request" | "invite" }): Promise<{ ok: true; already: boolean } | { ok: false }>;
export async function expireStaleInvites(service, f: { orgId?: string; inviteeId?: string }): Promise<void>;
export async function notifyOrg(service, row: { type: "org_invite" | "org_request_approved";
  userId: string; actorId: string; orgId: string }): Promise<void>;   // logs, never throws
```

Tests (`src/lib/orgs/join-state.test.ts`):
- every row of §3.2;
- audience `iu` with `purdue` → `audience_blocked`, even with an invite;
- a hidden non-member → `not_found`; a hidden platform admin → `hidden`;
- `open` + different campuses → `can_request/visiting`;
- `open` + pending request → `can_join`;
- `invite` + pending request → `requested`;
- an expired invite is ignored.

### 4.2 Changed routes

| Route | Change | Response additions / errors |
|---|---|---|
| `POST /api/orgs/[slug]/join` (`join/route.ts:21-130`) | `rateLimit("org-join:"+uid,{limit:30,windowSec:600})` + Terms (plan §2.6). **Load the org with the service client** (`:36-40`, fixes A2), selecting `id, join_policy, audience, hidden_at, campus_id`. Apply §3.2 through `orgJoinState`. Admit through `admitMember`. The request body `message` stays ≤500 chars (`:102-103`) | 200 `{ok, joined:true, role, via}` or `{ok, pending:true, request}`. 403 `school_unverified` / `audience_mismatch` (+`audience`) / `invite_only` / `terms_required`. 404 `not_found`. 409 `org_hidden` (member-less paths never get here). 429 |
| `DELETE /api/orgs/[slug]/join` (`:136-169`) | Service-role org load (the user client works after M1, but match the convention). No other change | Unchanged |
| `GET /api/orgs?filter=mine` (`orgs/route.ts:77-114`) | Select `join_policy, audience, hidden_at`. Return `hidden: !!hidden_at` | + `join_policy, audience, hidden` |
| `GET /api/orgs?filter=discover` (`:131-233`) | `.is("hidden_at", null)`. Select the new columns. Load the viewer's pending invites next to `myPending` (`:141-147`) plus `school_system`/`campus_id`/`is_platform_admin` (service). Per row: `join_state`, `pending_invite`. Sort: `invited` first, then the plan's order, with `audience_blocked` last. `include_dormant` never reveals hidden orgs. Fix the docblock at `:38` (D6) | + `join_policy, audience, join_state, join_reason, pending_invite:{id, invited_by_name, expires_at}\|null`. Keep `role`, `pending_request` |
| `POST /api/orgs` (create, `:259-422`) | Accept `join_policy` (default: derived from a legacy `is_public`, else `open`) and `audience` (default `both`). 400 `audience_excludes_owner` if the creator's system isn't allowed. Insert `join_policy`, `audience`; omit `is_public` when `join_policy` is sent (§2.2) | + fields. 400 `invalid_join_policy` / `invalid_audience` |
| `GET /api/orgs/[slug]` (`[slug]/route.ts:58-115`) | Service-role load (`:66-72`). Hidden and not a member (or platform admin) → 404 | + `join_policy, audience, hidden, join_state, join_reason, pending_invite`; `pending_request` unchanged |
| `PATCH /api/orgs/[slug]` (`:126-232`) | Load with the service client. **Explicit role check**: `SETTINGS_ROLES` for everything this route edits (today it's a silent 500 for mods, `:214`). Accept `join_policy`, `audience`; map a legacy `is_public` like the trigger (`true`→`open`; `false`→`request` unless currently `invite`). **Never accept `hidden_at`.** Write the whole patch with the service role (fixes A3; also covers plan B8's campus write). On an audience change: revoke now-ineligible pending invites and delete their notifications | + new fields in `.select` (`:218`). 400 `audience_excludes_owner` / `invalid_*`. 403 `settings_officers_only`. 409 `org_hidden` for policy/audience edits on hidden orgs |
| `GET /api/orgs/[slug]/requests` (`requests/route.ts:12-76`) | Unchanged role gate (`:37`). Service-read each requester's `school_system` and emit `eligible` + `ineligible_reason: "audience_iu" \| "audience_purdue" \| "unverified" \| null`. No names beyond today's shape | + per row |
| `POST /api/orgs/[slug]/requests/[id]` (`requests/[id]/route.ts:18-120`) | Select `hidden_at, audience` at `:42-46`. On approve: hidden → 409 `org_hidden`; audience → 409 `audience_mismatch`. Replace `:79-101` with `admitMember(via:"request")` (**adds the missing public-channel subscribe**). Send `org_request_approved` | Unchanged success; new 409s |
| `POST /api/orgs/[slug]/posts` (`posts/route.ts:66`) | After the role check: hidden → 409 `org_hidden` | n/a |
| `GET /api/orgs/[slug]/profile` (`profile/route.ts:24-34`) | Hidden and not a member → 404 (no callers found; keep it consistent) | + fields |
| `GET /api/orgs/[slug]/members` (`members/route.ts:23-27`) | Service-role org load so a non-member gets the intended 403, not 404 | n/a |
| `GET /api/search` (`search/route.ts:86-108,210-225`) | Orgs `.is("hidden_at", null)`, emit `join_policy, audience`. Events: add `hidden_at` to the org embed and drop hidden rows | + fields |
| `GET /api/campus-map` / `zone` (`campus-map/route.ts:129-139`, `zone/route.ts:71-83`) | `.is("hidden_at", null)`. Zone: hidden → 404 | n/a |
| `GET/POST /api/events` (`events/route.ts:120-122,136-145,167-181,355-389`) | Embed `hidden_at`, drop hidden rows; `?org_id=` of a hidden org → `[]`; campus id list filters hidden; POST on a hidden org → 404 "Org not found" | n/a |
| `POST/DELETE /api/events/[id]/rsvp` | Event's org hidden → 404 (with plan B8's rate limit + Terms) | n/a |
| `GET /api/me/suggested-connections` (`:122-148`) | Load visible org ids (service, `hidden_at is null`) and restrict the shared-org peer query to them | n/a |
| `GET /api/me/notifications` (`notifications/route.ts:41-51`) and `GET /api/me/otto` (`me/otto/route.ts:196-200`) | Add `org_id` and `org:orgs!notifications_org_id_fkey(handle,name,logo_url)` to both selects (the full select only; the fallback at `:47-51` stays). After M1, orgs RLS lets an invitee read SAE's row. A null `org` (hidden, non-member) → drop the row | + `org` per row; `ActivityRow` gains `org: {handle,name} \| null` |
| `GET /api/admin/orgs` + `admin/page.tsx:33-40` | Select `hidden_at, join_policy, audience`; hidden orgs stay listed | + fields |

### 4.3 New routes

**`GET /api/orgs/[slug]/invites`**: officers list pending invites.
- Service role. 403 `officers_only`, 404 `not_found`.
- Calls `expireStaleInvites` first.
- 200 `{ok, invites:[{id, created_at, expires_at, invitee:{id,name,handle,avatar_url}, invited_by:{name}|null}]}`: pending only, newest first, limit 100.

**`POST /api/orgs/[slug]/invites`**: send.
- Body `{user_id?: uuid, handle?: string}` (exactly one; the handle is resolved with the service role, as in `channels/[channelId]/members/route.ts:126-142`).
- Limits: `rateLimit("org-invite:"+uid,{limit:30,windowSec:3600})` and `rateLimit("org-invite-org:"+orgId,{limit:100,windowSec:86400})`. Plus Terms.
- Codes (§3.5 step 1): 400 `self_invite`/`invalid_body` · 403 `officers_only`/`audience_mismatch`(+`audience`) · 404 `not_found`/`user_not_found` · 409 `org_hidden`/`already_member`/`recently_declined`(+`available_at`) · 429.
- 200 `{ok, invite:{id, expires_at, invitee:{id,handle,name,avatar_url}}}`, or `{ok, already:true, invite}`, or `{ok, admitted:true}`.

**`DELETE /api/orgs/[slug]/invites/[id]`**: revoke.
- Officers only. Terms.
- 200 `{ok}`. 403 `officers_only`, 404 `invite_not_found`, 409 `invite_not_pending`.

**`GET /api/orgs/[slug]/invite-candidates?q=`**: the people picker.
- Officers only. `rateLimit("org-invite-search:"+uid,{limit:60,windowSec:60})`.
- `q` is 2–40 characters, prefix match first, then contains, like `users/search/route.ts:72-94`. Service role.
- Excludes self, blocked either way (fail closed), unverified, not onboarded, and stranded handles.
- Limit 20.
- 200 `{ok, users:[{id,name,handle,avatar_url,major,year, state:"member"|"invited"|"requested"|"declined_recently"|"none", eligible:boolean, reason:"audience_iu"|"audience_purdue"|null, available_at?:string}]}`.
- Ineligible students are returned greyed out, not hidden, so the officer understands why. The result carries no emails or school emails.

**`GET /api/me/org-invites`**: the student's inbox.
- Service role, `invitee_id = uid`, pending and unexpired, orgs not hidden.
- 200 `{ok, invites:[{id, expires_at, created_at, org:{id,handle,name,logo_url,verified,audience}, invited_by:{name}|null}]}`.

**`POST /api/me/org-invites/[id]`**: the student declines.
- Body `{action:"decline"}`. Terms.
- Only the invitee; anyone else gets 404 `invite_not_found`.
- 200 `{ok}` or `{ok, already:true}`. 409 `invite_not_pending`. 400 `invalid_action`.
- Accept is **not** here. Accept = `POST /api/orgs/[slug]/join` (§3.5 step 3), which avoids a second admit path.

**`POST /api/admin/orgs/[slug]/hide`**
- Copy `admin/orgs/[slug]/verify/route.ts:18-67` (platform-admin check `:26-37`).
- Body `{hidden:boolean}`. The service update sets `hidden_at = hidden ? now() : null`.
- On hide: revoke pending invites (§3.4).
- 200 `{ok, org:{id,handle,hidden_at}}`.

---

## 5. UI and copy (phone first, desktop parity)

### 5.1 Shared client pieces (new, wave 2b, B25), so B12, B14, B19 and B26 don't import each other

- **`src/lib/orgs/join-copy.ts`** (pure). Its `joinCopy(state, {orgName, audience, reason, compact})` returns `{label, sub, disabled, tone}`:

| `join_state` | label (`compact` = phone rows, onboarding) | sub-line | disabled |
|---|---|---|---|
| `member` | "Joined ✓" (no toggle for `owner`, critic C9) | n/a | yes |
| `invited` | "Accept invite" (compact "Accept") | "Invited by {first name}" / "Invited by an officer" | no |
| `requested` | "Requested" | n/a | yes |
| `can_join` | "Join" | n/a | no |
| `can_request` | "Request to join" (compact "Request") | policy: "Officers approve requests" · visiting: "You're visiting, so officers approve requests" | no |
| `invite_only` | "Invite only" | "Officers invite members" | yes |
| `audience_blocked` | "IU students only" / "Purdue students only" | "{org} is open to IU students only." / "…Purdue students only." | yes |
| `unverified` | "Verify your school email to join" (link to `/auth/school-email`) | n/a | no (link) |
| `hidden` (admin) | "Hidden" | "Hidden by Vibe. Only members can see it." | yes |
| signed out | "Sign in to join" (open) / "Sign in to request" (request) / "Sign in" (invite) | n/a | link |

- **Chips:** policy chip "Public" (open) / lock + "Private" (request) / lock + "Invite only" (invite). Audience chip "IU only" / "Purdue only" (none for `both`). Hidden chip "Hidden" (members and admins only). They combine, e.g. "Invite only · IU only".
- **`src/components/orgs/OrgJoinControl.tsx`** (client).
  - Props: `{handle, orgName, state, reason?, audience, pendingInvite?, compact?, onChange(state)}`.
  - The button waits for the server before changing state (no optimistic flip), like `MessagesMobile.tsx:1203-1234`. The minimum tap target is 44px.
  - Accept POSTs `/join`. Decline asks with `window.confirm("Decline the invite to {org}? An officer can invite you again later.")`, then POSTs `/api/me/org-invites/[id]`.
  - Error `code`s flip to the matching disabled state instead of showing a red "Failed":
    - `invite_only` → invite_only
    - `audience_mismatch` → audience_blocked
    - `school_unverified` → unverified
    - `not_found` → "This org isn't available."
  - A 429 shows "Too many tries. Try again in a minute."
  - After accept, a toast: "You're in. Welcome to {org}."
- **`src/components/orgs/OrgInviteSheet.tsx`** (client; bottom sheet on phone, modal on desktop).
  - Title "Invite people".
  - Search input, placeholder "Search by name or @handle"; 2 characters minimum ("Type at least 2 letters"); 250ms debounce with AbortController.
  - Results:
    - Avatar, name, @handle, major/year.
    - Right-side button by `state`: `none`+eligible "Invite" → "Invited ✓" with an "Undo" link (revoke); `invited` "Invited"; `member` "Member" (disabled); `requested` "Add" with sub "Asked to join" (the POST admits them); `declined_recently` disabled "Declined" with sub "You can invite again {Mon D}"; ineligible disabled "Not eligible" with sub "{org} is open to IU students only."
  - Empty: "No one found. Check the spelling of their handle."
  - Failed: `LoadFailed` with Retry.
  - Below the results: "Pending invites ({n})". Each row has "Invited {relative} by {first name}" and "Revoke", which confirms "Revoke this invite?" with buttons "Revoke" / "Keep". Empty: "No pending invites."
  - Toasts: "Invite sent", "Invite revoked", "They're in. Their request was approved.".
  - Errors: 429 "You've sent a lot of invites. Try again in an hour."; `org_hidden` "This org is hidden, so it can't invite anyone."; `audience_mismatch` "{org} is open to {IU|Purdue} students only."
- **`src/components/orgs/OrgInviteBanner.tsx`**
  - Title "You're invited to join {org}".
  - Sub "Invited by {first name} · Expires {Mon D}".
  - Buttons "Accept invite" (primary orange) and "Decline" (outlined), styled like the `MessagesMobile.tsx:1657-1723` bar.

### 5.2 Officer controls

The same two segmented controls appear in **three places**:
- the create form (`campus-home.tsx:1005-1037`)
- desktop settings Overview (`campus-home.tsx:1486-1505`, dirty check `:1413`, PATCH body `:1422-1435` sends `join_policy`/`audience`, not `is_public`)
- **`EditDetailsModal`** on `/orgs/[handle]` (`admin-actions.tsx:148-245`, PATCH `:172`). This is the only phone surface for officers.

**Field "Who can join"**
- "Anyone at {campus short name}", sub "Join instantly". Uses `org.campus_id`; with no campus it reads "Anyone".
- "Request to join", sub "Officers approve requests".
- "Invite only", sub "Officers invite members".
- Note when switching *to* Invite only with pending requests: "{n} pending requests stay in Requests until you approve or deny them."

**Field "Open to"**
- "IU and Purdue students" (default) · "IU students only" · "Purdue students only".
- Help: "Checked against each student's verified school email. Current members stay if you change this."
- Error `audience_excludes_owner`: "The owner has to be able to join. Pick an option that includes {IU|Purdue} students."

**Settings officers vs mods:** both fields render read-only for mods ("Only owners and admins can change this.").

**Desktop settings tabs** (`campus-home.tsx:1281-1287`; `SettingsTab` type `:1252`):
- `requests` shows when `isStaff && (org.join_policy === "request" || pendingCount > 0)`, replacing `!org.is_public` at `:1285`.
- New `invites` tab ("Invites") for `isStaff` in every policy, rendering `OrgInviteSheet` inline. It replaces the raw `@handle` input pattern at `:2735-2760`.

**`SettingsRequests`** (`:2026-2170`): show "Not eligible (Purdue student)" / "(IU student)" and hide Approve when `eligible === false`.

**Read-only rows** for members (`:1459`): "Who can join: Anyone / By request / By invitation" and "Open to: IU and Purdue students / IU students / Purdue students".

**Phone org page admin bar** (`admin-actions.tsx:50-103`; rendered at `page.tsx:197` for owner/admin only):
- Render it for owner/admin/**mod**.
- Add an "Invite people" button (a person-plus icon) that opens `OrgInviteSheet`. It's the first button on phone widths.
- Mods see only "Invite people".
- Bar eyebrow "Owner / admin tools" (`:88`) → "Officer tools".
- On a hidden org, the bar shows only "Edit details" and the eyebrow "Hidden org".

### 5.3 Student side

**Org page `/orgs/[handle]`** (`page.tsx`; not forked for phone, so this covers both viewports)
- **Loads:**
  - `:87-94` selects `join_policy, audience, hidden_at`.
  - Hidden, not a member, not a platform admin → `notFound()`.
  - The viewer block (`:136-156`) uses `loadViewerOrgContext` + `orgJoinState`.
- **Header slot** `:207-215`: `OrgProfileJoinButton` (`join-button.tsx`) becomes a thin wrapper over `OrgJoinControl`. `isPublic` (`:23,51,132`) is replaced by `state`/`audience`/`pendingInvite`.
- **Above the description** when `state==="invited"`: `OrgInviteBanner`.
- **Notice** (`:220`, `PrivateOrgNotice` `:587-634`) by state:
  - request: keep today's copy.
  - invite: "**This community is invite-only.** Its profile is public. Officers invite new members."
  - audience_blocked: "**{org} is open to {IU|Purdue} students only.** Its officers set who can join."
  - hidden (members/admin): "**This org is hidden.** Only its members can find it. It's out of lists, search and events."
- **Chips** `:455-461`: §5.1 chips. **Facts** `:832`: "Visibility" becomes the two read-only rows from §5.2.
- **ChannelsSection** (`ChannelsSection.tsx:52-70`): skip the fetch when `!viewerIsMember` and render "Channels are for members." This fixes today's "Couldn't load this org's channels." for every non-member on SAE.
- **Metadata** `:66-81`: generic for hidden non-members.

**Otto notifications**
- **Desktop `OttoSidePanel.tsx`**
  - `NotifType` `:8` += `"org_invite" | "org_request_approved"`.
  - `verbFor` `:834-849`: `org_invite` → "invited you to join {org.name}"; `org_request_approved` → "approved your request to join {org.name}".
  - `openRow` `:902-922`: both → `/orgs/{org.handle}`.
  - No buttons in the tray; the org page is the one place a student decides.
- **Static `public/html/_otto.js`:** the same verbs in the row builder (`:776-783`) and `__ottoOpenNotif` (`:814-847`).
- **Phone `OttoActivity.tsx`:**
  - `describe` `:32-62` adds `${actor} invited you to join ${org}` and `${actor} approved your request to join ${org}`.
  - Rows with `org` (and post rows) become `<Link>`s. Today they are plain `<li>`s (`:78-94`), so they're not tappable.

**Orgs tab**
- **Phone** `CampusMobile.tsx` `OrgsPane` `:2311-2364`:
  - `Org` type `:56-65` gains `join_state, join_reason, join_policy, audience, pending_invite`.
  - New top section "You're invited" (header style from `OrgSectionHeader`).
  - `OrgRow` `:2384-2393` stays a link. The meta line `:2488-2492` appends " · Invite only" / " · IU only". A right-side `OrgJoinControl compact` shows only for `invited`, `can_join` and `can_request` (tap the row body for the page).
  - `audience_blocked` rows sort last.
  - Search row `SearchOrgRow` `:3248-3252`: meta chips only.
- **Desktop** `campus-home.tsx`:
  - `OrgsTabBody` state map `:8190-8194` → `join_state`.
  - `handleJoin` `:8211-8232` uses `OrgJoinControl`'s code handling.
  - New "You're invited" group above Verified (`:8372`).
  - `DiscoverFilterChips` `:9037-9045` adds "Invite only". The predicate at `:8236-8240` filters on `join_policy`.
  - `DiscoverCard` label `:9103-9111`, meta chips `:9224-9230`.
  - `OrgQuickViewModal` CTA `:8447-8454`, button `:8748-8772`, sub-line under the button.
  - Subtitle `:8257` → "Browse clubs and orgs at {campus}. Join public ones instantly, request private ones, and accept invites from officers." (B19 already owns the "· IU" campus copy.)
  - Channel-rail chip `:12105-12112` and search dropdown meta `:3922-3936` append " · Invite only" / " · IU only".
- **`public/html/profile.html`** search org meta (`_profSearchOrgToRow` `:6398-6412`): append the same.

**Onboarding step 5, "Clubs & orgs"** (`StepClubs.tsx`/`OrgPickRow` in B12; `onboarding.html` in B13). This replaces plan §3.4 step 5's button rules and its "system chip".
- **Load:** `GET /api/orgs?filter=discover` (hidden orgs never arrive).
- **Order:** `invited` first, then `can_join`, `can_request`, `invite_only`, `requested`, `member`.
- **Rows** use `OrgJoinControl compact`: "Accept" (sub "Invited by {first name}") · "Join" · "Request" (sub "Officers approve requests") · disabled "Invite only" (sub "Officers invite members") · "Requested" · "Joined ✓" (no toggle for owners).
- **SAE stays listed** as "Invite only" for non-invitees. Hiding it would leave the step with zero real clubs.
- **`audience_blocked` orgs are omitted** from this step: there's nothing to act on during setup. They still show in the Orgs tab.
- **`unverified`** can't happen here (the step requires verified).
- **Audience chip** "IU only" / "Purdue only" replaces the system chip.
- **Continue label:** "Continue →" once anything is joined *or accepted*; otherwise "Skip for now" (plan §3.1).
- **Sparse copy** when only invite-only orgs are listed: "Clubs are just getting started at {campus}. Invite-only orgs add members themselves."

**Admin** (`admin-orgs-client.tsx`):
- "Hidden" badge next to the private badge (`:377`).
- A "Hide" / "Unhide" button mirroring Verify (`:402-425`) → `/api/admin/orgs/[slug]/hide`.
- Confirm on hide: "Hide {org}? It leaves lists, search, the map and events. Members keep access. Pending invites are revoked."

---

## 6. Batches (file-owned; no file in two batches)

**Wave 1 (in progress, before M1 is applied)**

| Batch | Files | Work | Conflicts |
|---|---|---|---|
| **B3, extended** | `supabase/migrations/20260916100000_campuses_school_system.sql`, `supabase/migrations/20260916110000_revoke_campus_label_writes.sql` | §2.6–§2.9 exactly: edits 1–3, the section-5 append, the M2 append, header verify and rollback, negative tests on a local stack or branch | B3 already owns both files. Must land **before** M1 is applied |
| **B22, new: Org join lib** | new `src/lib/orgs/join-state.ts`, new `src/lib/orgs/join-state.test.ts`, new `src/lib/orgs/membership.ts` | §4.1 contract. `membership.ts` moves the subscribe block from `join/route.ts:76-93` (copied; B8 deletes the original) | None: new files. Wave 1 gets 6 batches; B22 is S |

**Plan text edits for Franky's plan** (not code):
- §2.6 and §3.4 step 5: "system" → audience + join_state.
- §5.1: M1b folded in.
- §5.4: `org_members_insert` "Unchanged" → "dropped + INSERT revoked in M1"; add `org_join_requests`, `orgs_select`, `org_invites` rows.
- Wave 5: remove "tightening org_members_insert".

**Wave 2 (after M1)**: extend existing batches.

| Batch | Adds to its existing files | Conflicts / notes |
|---|---|---|
| **B8** (`orgs/route.ts`, `[slug]/route.ts`, `join/route.ts`, `events/route.ts`, `rsvp/route.ts`) | §4.2 rows for mine, discover, create, `[slug]` GET/PATCH (A2 + A3 service-role writes, explicit role check), join (§3.2 via B22), events and RSVP hidden filters | B8 already adds the rate limit, Terms and visiting to join, so the same edit carries both. Discover's `system` field → `join_policy`/`audience`/`join_state`. Size M → M+ |
| **B9** (`suggested-connections`, `feed`, `users/search`) | Hidden-org exclusion in suggested-connections only | No feed change (§3.4) |
| **B10** (`campus-map`, `zone`, `search`, …) | Hidden filters + `join_policy`/`audience` in search output | n/a |

**Wave 2b (new run, parallel with wave 2; depends only on wave 1 + M1)**. Keeps each run at 4–5 batches.

| Batch | Files (sole owner) | Work |
|---|---|---|
| **B23: Invite routes** | new `api/orgs/[slug]/invites/route.ts`, new `api/orgs/[slug]/invites/[id]/route.ts`, new `api/orgs/[slug]/invite-candidates/route.ts`, new `api/me/org-invites/route.ts`, new `api/me/org-invites/[id]/route.ts` | §4.3 |
| **B24: Org governance edits** | `api/orgs/[slug]/requests/route.ts`, `api/orgs/[slug]/requests/[id]/route.ts`, `api/orgs/[slug]/posts/route.ts`, `api/orgs/[slug]/profile/route.ts`, `api/orgs/[slug]/members/route.ts`, new `api/admin/orgs/[slug]/hide/route.ts`, `api/admin/orgs/route.ts` | §4.2 rows + hide route |
| **B25: Shared org client components** | new `src/lib/orgs/join-copy.ts` (+ `join-copy.test.ts`), new `src/components/orgs/OrgJoinControl.tsx`, new `src/components/orgs/OrgInviteSheet.tsx`, new `src/components/orgs/OrgInviteBanner.tsx` | §5.1. Calls only routes (no import of B23/B24) |
| **B27: Notification read path** | `api/me/notifications/route.ts`, `api/me/otto/route.ts` | Org embed + `ActivityRow.org` (§4.2). Neither file belongs to any plan batch today |

**Wave 3 (after waves 2 and 2b are live, then M2)**

| Batch | Change | Conflicts |
|---|---|---|
| **B12, extended** (`StepClubs.tsx`/`OrgPickRow`) | §5.3 onboarding rows via `OrgJoinControl` (B25, earlier wave), invited pin, omit `audience_blocked` | `OrgPickRow` must not re-derive state; the plan's "system chip" becomes the audience chip |
| **B13, extended** (`onboarding.html`) | The same rows in vanilla JS, using the `join_copy` table duplicated as a const (no TS import in static HTML) | Keep strings identical to `join-copy.ts` |
| **B14, extended** (`CampusMobile.tsx`) | §5.3 phone Orgs tab: type, "You're invited" section, meta chips, compact control, search row chips | B14 already owns the file (empty-state copy); same-wave import of B12's `OrgPickRow` is avoided by importing B25 |
| **B16, extended** (`profile.html`) | Search org meta suffix | Tiny |
| **B19, extended** (`campus-home.tsx`) | §5.2 create/overview controls, tabs `:1252,1281-1287`, Invites tab, `SettingsRequests` eligibility, read-only rows, §5.3 discover/quick view/filter chips/rail chip/search meta, subtitle | Largest edit in B19 (~13k-line file, one owner). If B19 gets too big, move B19's org edits into a follow-up run on the same file **after** B19 lands, never in parallel |
| **B26, new: Org page + Otto renderers** | `src/app/orgs/[handle]/page.tsx`, `join-button.tsx`, `admin-actions.tsx`, `ChannelsSection.tsx`, `src/components/network/OttoSidePanel.tsx`, `src/components/otto/OttoActivity.tsx`, `public/html/_otto.js`, `src/app/admin/admin-orgs-client.tsx`, `src/app/admin/page.tsx` | §5.2 phone officer bar, §5.3 org page, Otto rows, admin hide. 9 files, mostly small; split Otto + admin into a B28 if the run is tight |

**Acceptance additions (beyond plan §6's global checks)**
- `node --test --experimental-strip-types src/lib/orgs/join-state.test.ts src/lib/orgs/join-copy.test.ts`.
- `rg -n "\.is_public|isPublic" src/app/api/orgs src/app/orgs src/components/mobile/CampusMobile.tsx` → only legacy mapping hits.
- Signed-in negative checks on prod that write nothing:
  - `POST /api/orgs/<hidden test org handle>/join` → 404.
  - `GET /api/orgs/<hidden>` → 404 for a non-member.
  - `POST /api/orgs/sae/join` as a non-invited account → 403 `invite_only`. This writes nothing on SAE, since the invite branch never inserts.
- 375×812 screenshots using in-page fetch overrides for each `join_state`: org page, phone Orgs tab, onboarding replay step 5, invite sheet (loaded / empty / ineligible / rate-limited), Otto activity invite row.
- **No positive-path invite writes from agents.** Franky sends the first real SAE invite himself.

**Deploy order**
1. B3-extended + B22 are committed with wave 1.
2. Apply M1 with the §2.7 checks.
   - **Known window until wave 2 is live:** old Discover (service role) still lists hidden orgs. The old join route now *finds* SAE (new `orgs_select`) and would file a request instead of 404ing.
   - Keep the window short. Pending requests on SAE can be denied in desktop settings.
3. Push wave 2 + 2b.
4. Apply M2 (+ the `is_public` revoke).
5. Wave 3.
6. Run feature-sentinel and security-sentinel.

---

## 7. Questions for Franky

1. **Should invite-only orgs show up in Discover, search, the map and onboarding for students who aren't invited?**
   - **Recommend: yes,** labeled "Invite only", with no join button.
   - **Why:** SAE is the only real club. Hiding it leaves onboarding step 5 empty for every new student. Seeing it tells a prospect "talk to a brother", and its page and rush events stay reachable.
   - **Changes:** Discover filter and onboarding list (B8, B12).
2. **Who can send invites: officers only (owner, admin, mod), or any member?**
   - **Recommend: officers only.** Members share the org link and point people to an officer.
   - **Why:**
     - Letting someone in by invite is the same power as approving a request, which mods already have (`requests/[id]/route.ts:57`).
     - Member invites would let one bad account spam notifications under the org's name.
     - SAE has 1 member today, so nobody loses anything.
   - **Changes:** the `OFFICER_ROLES` gate in B23 and whether the admin bar renders for all members (B26).
3. **Do you want a shareable invite link or code (e.g. `/orgs/sae?invite=…`) now, or person-by-person invites first?**
   - **Recommend: person-by-person first,** links later.
   - **Why:** no invite-code or token code exists anywhere. A link posted to an Instagram story lets anyone who sees it into an invite-only org, which defeats "you have to be invited". It also needs uses, expiry and a revoke UI.
   - **If wanted later:** add `org_invite_links (token_hash, org_id, created_by, expires_at, max_uses, uses, revoked_at)`. Landing shows the same `OrgInviteBanner`.
   - **Changes:** one extra table + 2 routes, deferred.

Decided in this spec without asking; say so if you disagree:
- Hidden orgs stay reachable by their members (§3.4).
- Invites last 30 days, with a 14-day re-invite wait after a decline.
- Audience changes keep existing members and can't exclude the owner.
- Invite-only and audience-restricted orgs' events stay visible, and anyone can RSVP.
- `org_request_approved` notifications ship with invites.

---

## Critic additions

Read-only pass, 2026-09-15. The Supabase MCP worked this time: live pg_policies, relacl, pg_proc, pg_trigger, pg_constraint and counts. Code re-read in the working tree. **CONFIRMED** = checked in code or the live DB; **PLAUSIBLE** = reasoned, not executed. Ranked by severity.

### A. Things that would break or open a hole

**A1. §2.6 edits target stale line numbers, and two verify queries would fail once `system` is gone (CONFIRMED).**
- The M1 file on disk is 587 lines. The spec's line numbers come from an older draft:

  | What | Spec says | Actually at |
  |---|---|---|
  | Section 3 | `:375-385` | `:491-501` |
  | Trigger select | `:441-442` | `:560-561` |
  | Final `commit;` | `:468` | `:587` |
  | Verify step e | `:216-217` | `:266-267` |
  | Verify step g | `:236` | `:286` |
  | Rollback | `:277` | `:387` |

- Header lines that still name `orgs.system` and that the spec never edits:
  - `:56-60`: "take orgs.campus_id / system from the CREATOR's row"
  - `:68-74`: the A7 stamping rule
  - `:272`: "expect exactly 3 rows" (becomes 4 with `orgs_sync_join_policy`)
- **Queries that error:**
  - M1 step g `:286` runs `has_column_privilege('authenticated','public.orgs','system','UPDATE')`. On a column that doesn't exist, that call raises an error instead of returning f, so the whole step g query fails.
  - M2's post-check `:90` has the row `('public.orgs','system')`, and its header `:15` names `orgs.system`. §2.8 adds an `is_public` row but never removes the `system` one, so M2's post-check fails too.
- **Fix:** locate edits by quoted anchor text, not line numbers. Remove `system` from M1 `:286` and `:387`, and from M2 `:15` and `:90`.

**A2. Edit 2 (`nullif(o.audience,'both')`) is the wrong fix. Drop the org's university from the stamp instead (CONFIRMED by reading `:558-578`).**
- `v_org_system` feeds two coalesces:
  - `:573` uses `coalesce(v_org_system, v_user_system)`, but only when the org has a campus.
  - `:577` uses `coalesce(v_user_system, v_org_system)`.
- Audience means "who may join". It doesn't mean "which university the post belongs to":
  - A Purdue admin posting as an "IU only" org would get the post stamped `iu`.
  - An org with no campus can't reach `:573`. Hidden orgs can't post at all (§3.4).
- **Fix:** `select o.campus_id into v_org_campus`, then `new.school_system := v_user_system` in both branches, and delete `v_org_system`. `posts.school_system` stays "the author's university", and M1 no longer depends on any org governance column. A3 needs that.

**A3. Folding org governance into M1 puts the campus rollout behind it and makes M1's safety note untrue (CONFIRMED).**
- M1 must be applied **before wave 1 is pushed** (`20260916100000:139-151`), because the school-email apply step starts stamping `school_system`.
- The appended section 5 would add to that time-critical file:
  - RLS drops;
  - a CHECK swap on `notifications`;
  - a new table;
  - a DO block that raises.
- **5b aborts all of M1** if any of the 5 prefixes has gone missing, and orgs can disappear between review and apply: `orgs_delete` (live) lets each owner delete their own org.
- **"WHY THIS IS SAFE WITH THE CODE DEPLOYED TODAY" (`:170-204`) stops being true.** The new `orgs_select` changes what deployed code does: the old join route finds SAE and files requests (the spec's own "known window").
- **Fix:** put section 5 in its own file, e.g. `20260916103000_org_join_policy_invites.sql` ("M1c"), with its own header, pre-flight, verify and rollback. Apply it after M1 and before wave 2. That only works once A2 is done; otherwise M1's trigger reads `o.audience` before the column exists, and every org post fails.

**A4. The new `orgs_select` shows every signed-in user who owns each invite-only or request org. The spec's reason for widening it is wrong (CONFIRMED).**
- `authenticated` has table-level SELECT on orgs (live relacl `authenticated=rdDxtm`). Once RLS admits the row, `GET /rest/v1/orgs?handle=eq.sae&select=owner_id` works.
- Nothing shows a private org's owner to non-members today:
  - the org page selects no `owner_id` (`page.tsx:88-91`);
  - the members route returns 403.
- SAE has 1 member, so this names its only member. §2.5's claim that every non-hidden org row is already shown to any signed-in user is false for `owner_id`, `tags`, `school` and `updated_at`.
- The widening fixes nothing the spec doesn't already fix another way:
  - A2 is fixed by B8's service-role loads.
  - `[slug]` GET moves to the service role.
  - ChannelsSection skips the fetch for non-members.
  - Only B27's notification embed and `campus-map/route.ts:132` still rely on it.
- **Fix:** in M1c, only *narrow* the policy: `using ((is_public or public.is_org_member(id, auth.uid())) and (hidden_at is null or public.is_org_member(id, auth.uid())))`.
  - B27 then resolves `{handle,name,logo_url}` for org notification rows with the service client.
  - B10's map lists invite-only orgs through the service role, if Q1 is answered yes.
  - This also closes the M1→wave 2 window: the old join route keeps returning 404 on SAE instead of filing requests.

**A5. The hidden-org event filter can't work as written: under the user client a hidden org's embed is just `null` (CONFIRMED).**
- Both read events with the user client and embed `org:orgs(...)`:
  - `events/route.ts:117-122` (`supabase` at `:75`)
  - `search/route.ts:97-102`
- Once RLS hides a hidden org from non-members, the embed comes back `null`. That looks exactly like an event with no org. So "embed `hidden_at`, drop hidden rows" (§4.2) never sees `hidden_at`, and the rows stay.
- These paths have no org-id list to filter on:
  - `?campus=all` and campus-less viewers (`:147-156`)
  - `?org_id=` (`:136-145`)
- Finance Club (hidden) has 3 events, all past (live count), so this is latent today.
- **Fix:** drop rows where `org_id is not null and org is null`, or load hidden org ids with the service role and add `.not("org_id","in",…)`. Apply the same fix in search.

**A6. Invite → revoke → re-invite has no cap: a notification harassment loop, with the org name as free text (CONFIRMED on the limits; the abuse path is PLAUSIBLE).**
- §3.5 step 6 allows re-inviting right after a revoke, and a revoke deletes the notification. So every re-send makes a fresh unread row (Otto badge + OttoCorner peek).
- The only brakes are 30/hour per officer and 100/day per org. A decline buys 14 days, and that repeats forever.
- **Who can do it:** any verified student can create 5 orgs/hour (`orgs/route.ts:266,305`) and becomes owner. The org name is free text of 2–50 characters (`[slug]/route.ts:145-150`), rendered verbatim in "{officer} invited you to join {org}". The org name brings back the message field the spec removed, still with no report path.
- **Fix:**
  - (a) Cap each (org, invitee) pair, e.g. at most 3 invites per 90 days whatever the outcome.
  - (b) Cap each invitee: `rateLimit("org-invite-to:"+inviteeId,{limit:10,windowSec:86400})`.
  - (c) v1: only `verified` orgs can send invites. SAE is verified, and `/api/admin/orgs/[slug]/verify` exists.
  - (d) The Decline confirm offers "Decline and stop invites from {org}", stored as a long cooldown.

**A7. Blocks are checked only between the invitee and the sending officer, and only at send time (CONFIRMED in the spec text; the code paths are new).**
- If the invitee blocked the **owner** or another officer, a different officer's invite still arrives under the org's name.
- If the invitee blocks the inviter **after** the invite:
  - `loadHiddenUsers` hides the Otto row (`me/notifications/route.ts:62-68`);
  - but `GET /api/me/org-invites`, the org-page banner ("Invited by {first name}") and Discover's `pending_invite.invited_by_name` still show the blocked person's name. §4.2/§4.3 specify no filter there.
- **Fix:**
  - On send, check blocks between the invitee and the sender **and** the owner.
  - On every read, run `loadHiddenUsers` (it also covers mutes) and render a hidden inviter as "an officer".
  - Optionally revoke the pending invite when the invitee blocks its sender.

**A8. Removal has no memory, so a mod can undo an owner's decision (CONFIRMED on the policies; PLAUSIBLE as a flow).**
- An owner or admin removes a member (live `org_members_delete`) or denies a request (`requests/[id]/route.ts:103-110` sets `denied`).
- Mods can invite (§3.1). A mod re-invites that person at once, and they accept.
- For an invite-only org, "you have to be invited" becomes "any mod can overrule the owner".
- **Fix:** invites to someone denied or removed in the last 30 days need owner/admin. Removal needs a record, e.g. an `org_removals (org_id, user_id, removed_by, removed_at)` row written by a service-role remove route. Or make invites owner/admin-only in v1: SAE has 1 member, so nobody loses anything. That changes the Q2 recommendation.

**A9. "Vibe checks this against each student's verified school email, so nobody can fake it" (spec `:26`) is false on both sides (CONFIRMED).**
- Purdue Indianapolis students verify with @iu.edu and get `school_system='iu'` (plan Q1 `:728-731`), so "IU students only" admits them.
- A verified student may re-verify with the other university's address (`request/route.ts:33-35`; `school-email-apply.ts:63-67`). So they can:
  1. join a Purdue-only org;
  2. switch back to their IU email;
  3. join an IU-only org.

  Members are never re-checked (§3.5 step 8).
- **Fix the copy:** "Checked against each student's verified school email when they join." This is a label, not a boundary; say so in §3.1 too.

**A10. Old Otto renderers show invites as a blank row that links to the officer's profile, from wave 2b until wave 3 (CONFIRMED).**
- B23/B24 (wave 2b) insert `org_invite` / `org_request_approved`, but the renderers only ship in wave 3 (B26).
- What deployed code does with the new types:
  - `OttoSidePanel.tsx:846-847` has `default: return ""`, so the row reads "{officer name}" with no verb. `openRow` (`:919-922`) then falls through to the officer's profile.
  - `_otto.js:783` does the same.
  - `OttoActivity.tsx:58-59` shows "{first name} did something".
- The phone (tested only on the Vercel deploy) shows "did something" for the whole gap.
- **Fix:** add `OttoSidePanel.tsx`, `OttoActivity.tsx` and `public/html/_otto.js` to B27 in wave 2b (no 2b batch owns them), or hold notification inserts behind a flag until B26 is live.

**A11. The invite route admits people with a pending request, contradicting "Nobody is ever added silently" (spec `:30` vs `:431`) (CONFIRMED in the spec text).**
- Requests can be months old, and there's no withdraw route (plan D7).
- The spec's own M1→wave 2 window lets anyone on an old bundle file one on SAE.
- An officer who finds that person and taps "Add" makes them a member without asking them. The invite path also skips the request's own `resolved_by` audit.
- **Fix:** the sheet's `requested` state calls the existing approve route (`requests/[id]`), labeled "Approve request". The invite POST never admits: it returns 409 `has_pending_request` with the `request_id`.

### B. Migration and RLS details

**B1. The expiry flip will violate the table's own CHECK (CONFIRMED by reading §2.3).**
- `check ((status = 'pending') = (resolved_at is null))` means `expireStaleInvites` must set `resolved_at` (e.g. `= expires_at`).
- §2.3 only says "writers flip it to `expired`". Updating status alone raises 23514.
- Put it in B22's contract.

**B2. A 23505 on send must be handled, not returned as a 500 (PLAUSIBLE).**
- `org_invites_one_pending` plus lazy expiry means two officers inviting the same person at once hit 23505.
- An expired row still marked `pending` does the same until it's flipped.
- B23 maps 23505 → `{already:true}`. The request insert has the same unique-pending index (`org_join_requests_unique_pending`, live).

**B3. Live facts the spec relied on without a DB, now checked (all CONFIRMED).**
- **`notifications_type_check`** is exactly `follow, connection, like, comment, mention`, and live rows use only `comment, follow, like, mention`. The swap is safe. `notifications` is in no publication.
- **`org_members` INSERT:**
  - ACL is `authenticated=ardDxtm` (table-level INSERT, 0 column INSERT grants), so `revoke insert` takes effect.
  - No function in `public` and no trigger writes `org_members` or `org_join_requests`.
  - All three app inserts use the service role: `orgs/route.ts:391`, `join/route.ts:63`, `requests/[id]/route.ts:88`.
- **Readers of `is_public`:** exactly three live policies (`orgs_select`, `org_members_select`, `org_members_insert`) and no functions.
  - Live `can_view_org_channel` differs from the repo (`20260507110000:39-54`): private channels allow owner/admin or `org_channel_members`, and mods are not included.
- **Requests:** `org_join_requests_select` is requester OR owner/admin/mod, so keeping SELECT is safe. Status values are `pending/approved/denied`.
- **orgs UPDATE column grants:** name, school, description, logo_url, banner_url, tags, is_public, backdrop_preset, updated_at, links, philanthropy. Not verified, owner_id, handle or last_activity_at.
- **§2.7 expected row counts hold:**
  - Kelley and Finance are public → `open`, hidden.
  - CS Club and Private equity are private → `request`, hidden.
  - SAE is private and verified: 1 member, 6 events (1 upcoming), 4 channels, 0 pending requests.
- **Notification FK:** `notifications.actor_id` is `ON DELETE CASCADE`. If the inviting officer deletes their account, the invite notification disappears, but the invite row stays with `invited_by` null.

**B4. PATCH on the service role must keep both the owner check and the field whitelist (CONFIRMED).**
- Live `orgs_update` admits `auth.uid() = owner_id OR org_member_role IN ('owner','admin')`. A role check based only on `SETTINGS_ROLES` drops the `owner_id` branch.
- The patch builder at `[slug]/route.ts:144-208` is the only whitelist once RLS and column grants stop applying. It must stay explicit: never spread `body`, and never pass `verified`, `owner_id`, `handle`, `hidden_at`, `audience` or `join_policy` without validating them.

**B5. Hidden orgs still hold their handles, which reveals them and blocks real clubs (CONFIRMED).**
- `finance-club`, `cs-club`, `private-equity-club` and `kelley-floor-university-tower` stay reserved. Creating one returns 409 "That handle is taken" (`orgs/route.ts:351-359`).
- That confirms the hidden org exists, and it blocks a real CS Club or Finance Club from its natural handle.
- **Fix:** in 5b (or M1c), rename hidden handles to `test-<id8>` (a service write; their members are test accounts), or add a "rename on hide" field to the admin route.

**B6. Leftover hidden-org surfaces (CONFIRMED, low).**
- `asset/[kind]/route.ts:28-37` serves logo and banner by handle with the service role and no hidden check. Add it to B24.
- Direct PostgREST still reaches hidden orgs' events and can RSVP to them: live `events_select_authenticated USING true` and `rsvps_insert_own`.
  - §3.4's "Blocked … RSVP" is route-only. Say "hidden from lists", not "blocked".
- "Unhiding restores everything" (§3.4) is false for invites revoked at hide time. Change the copy to "Unhiding puts it back in lists; revoked invites stay revoked."

**B7. "This writes nothing" on the prod negative check (§6 acceptance) is slightly wrong (CONFIRMED).**
- `rateLimit` writes `public.rate_limits` (a live table) before the `invite_only` branch.
- Say "writes only a rate-limit row", and use a founder test account.

### C. Copy that contradicts Franky or itself

**C1. The two officer fields contradict each other (spec `:18`, `:22`, `:636`).**
- "Who can join: Anyone at Indianapolis" next to "Open to: IU students only" reads as a contradiction on the same screen and in the org facts.
- Franky used Indianapolis as the *audience* word: "indianapolis (both campuses)".
- **Suggested labels:**
  - Who can join: "Anyone can join" · "Request to join" · "Invite only"
  - Open to: "All of Indianapolis (IU + Purdue)" (default) · "IU students only" · "Purdue students only"
- The member read-only rows at `:648` should match.

**C2. The Q2 recommendation should change given A6 and A8.**
- Recommend **owner/admin only** for v1, not mods.
- **Why:**
  - Invites are the only new outbound notification.
  - Mods can't remove members today (live `org_members_delete`) but could re-add removed ones.
  - SAE has one member.
- Add mods once removals are recorded.

### D. Batch and deploy-order corrections

- **M1c.** A new file owned by B3-extended. A2's trigger simplification stays in M1. Deploy: M1 → wave 1 push → M1c (with the §2.7 checks) → wave 2 + 2b → M2.
- **B27 grows** by `OttoSidePanel.tsx`, `OttoActivity.tsx` and `public/html/_otto.js` (A10). B26 drops them and keeps the org page and admin. Each run stays within 4–5 batches.
- **B8/B10** handle A5's null-embed rule in `events/route.ts` and `search/route.ts`.
- **B22** adds three things to the contract: `resolved_at` on expiry (B1), the 23505 mapping (B2), and a "hidden inviter → an officer" helper (A7).
- **B23** adds:
  - the per-pair and per-invitee caps, and the verified-org gate (A6);
  - blocks checked against the owner (A7);
  - the removed/denied gate (A8);
  - never admitting from the invite POST (A11).

