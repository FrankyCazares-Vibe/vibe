### CH3 · desktop officer settings: Who can join / Open to, Followers tab with Remove, Invites tab, Requests eligibility, leave copy

**Owns:** `src/app/campus/campus-home.tsx`, officer surfaces only: the `Org` type, `CreateOrgModal`, `OrgSettingsModal`, `SettingsOverview`, `SettingsRequests`, `SettingsDanger`, `ROLE_PERMS`, plus new `ChoiceField` and `SettingsFollowers`
**Depends on:**
- CH2 (W4, same file). G4 requires CH2 on `main`; re-grep every function by name on top of CH2's diff.
- CH1: `useViewerCampus()`.
- F5a: imports `OrgInviteSheet` and the `join-copy` helpers.
- F1 by URL: `GET /api/orgs/[slug]/followers`, `DELETE /api/orgs/[slug]/followers/[userId]`.
- F3 by URL: the inline invite sheet's default followers list.
- F2 by URL: `follower_count` on `GET /api/orgs/[slug]`, used only by the read-only view.

**Scope limit:** the student side stays CH2's: `OrgsTabBody`, `DiscoverGroup`, `DiscoverCard`, `OrgQuickViewModal`, `DiscoverFilterChips`, the `ChannelRail` header chip, the search dropdown and the map zone footer. CH3 never edits them or the two `?filter=mine` fetches (the chat rail in `CampusHome`, the post-as-club picker).

**Anchors.** `campus-home.tsx` sites are named by function or constant only, because H1 → CH1 → CH2 move every line. The `orgs/route.ts` and `orgs/[slug]/route.ts` anchors are named by handler and block, because F2 edits those files in W2. Other `file:line` anchors were read at `f23bc5d`, in files no batch touches.

**Contract**

1. **Imports and types.**
   - `import { OrgInviteSheet } from "@/components/orgs/OrgInviteSheet";`
   - One import from `@/lib/orgs/join-copy`: `WHO_CAN_JOIN_OPTIONS`, `openToOptions`, `AUDIENCE_HELP`, `OFFICER_FOLLOW_HELP`, `MOD_READONLY`, `whoCanJoinFact`, `openToFact`, `followerCountText`, `followsSinceText`, `orgErrorCopy`. Merge into CH2's line if one exists.
   - `import type { JoinPolicy, OrgAudience } from "@/lib/orgs/join-state"` (`join-state.ts:59`, `:62`). Merge into CH2's import if it already brings them in.
   - `campusRowById` and `isSharedCampus` from `@/lib/iu/campuses` (`campuses.ts:266`, `:233`; `isSharedCampus` takes a `Campus` row). Merge into CH1's import line.
   - Never import `@/lib/orgs/following`, `membership` or `notification-orgs` (§4.1 rule 8). This client needs none of them.
   - **`Org` type:** grep it first. It must end up with `join_policy?: JoinPolicy; audience?: OrgAudience; hidden?: boolean; campus_id?: string | null;`. CH2 may already have added these, so don't duplicate them. Every source of an `Org` value carries these fields:
     - `?filter=mine` (the mine-branch select in `orgs/route.ts`)
     - the create 201 (`join_policy`, `audience`, `campus_id`)
     - the PATCH 200, which also adds `hidden`
   - Read them as `const basePolicy: JoinPolicy = org.join_policy ?? "open"` and `const baseAudience: OrgAudience = org.audience ?? "both"`.
   - After items 3–6, delete `is_public` from `Org` only if `rg -n "\bis_public\b"` finds no remaining reader of an `Org` value. `SearchOrg`, `FeedOrg`, `MapOrg` and anything CH2 left in `DiscoverOrg` keep their declarations.

2. **`ChoiceField` (new, beside `Field`).** `Field` renders a `<label>`. Clicking its label or hint text activates the first `<button>` inside it; today that's how the Visibility field flips to "Public". The new pickers must not sit inside a `<label>`.
   - Props: `{ label: string; hint?: string; options: ReadonlyArray<{ value: string; label: string; sub?: string; disabled?: boolean }>; value: string; onChange: (v: string) => void }`.
   - Markup:
     - An outer `<div>` whose label and hint spans copy `Field`'s styles.
     - Inside it, `<div role="radiogroup" aria-label={label}>` with `display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 8`.
     - One `<button type="button" role="radio" aria-checked>` per option, styled `modalSegmentStyle(value === o.value)`: label at 700 13px, sub at 11px `COLORS.glassMuted`.
     - A disabled option gets `disabled`, `opacity: 0.45` and `cursor: "not-allowed"`.
   - Map F5a's exported option shapes onto `{value, label, sub}`. Read `join-copy.ts` first: `WHO_CAN_JOIN_OPTIONS` carries subs, and `openToOptions` may not.
   - No read-only variant. Hidden clubs and non-managers get `ReadOnlyRow`s.

3. **`CreateOrgModal`.**
   - State: `isPublic` is replaced by `joinPolicy: JoinPolicy` (default `"open"`) and `audience: OrgAudience` (default `"both"`).
   - `const { system, campus } = useViewerCampus();` and `openToCampus = campus ? { name: campus.name, shared: isSharedCampus(campus) } : null`. The POST handler in `orgs/route.ts` stamps the creator's own campus via `allowedCampusId(viewerRow.campus_id, creatorSystem)`, so the label names the right campus.
   - Replace the "Visibility" `Field` with, in order:
     1. `ChoiceField` "Who can join", options `WHO_CAN_JOIN_OPTIONS`.
     2. `ChoiceField` "Open to", options `openToOptions(openToCampus)`, hint `AUDIENCE_HELP`.
        - Disable the options the POST refuses with 400 `audience_excludes_owner` (`audience !== "both" && audience !== creatorSystem`).
        - `system === "iu"` → `purdue` disabled. `system === "purdue"` → `iu` disabled. `system === null` → both narrow options disabled.
     3. One muted line (11px, `rgba(255,255,255,0.4)`): `OFFICER_FOLLOW_HELP`.
   - POST body: `{ name, handle, description, join_policy: joinPolicy, audience, backdrop_preset }`. No `is_public` key.
   - Errors:
     - Check `res.status === 429` first and show "Too many tries. Try again in a minute." (the 429 body has no `code`).
     - Any other non-ok response keeps showing `data.error` in the existing error line. That covers `audience_excludes_owner`, `invalid_join_policy` and `handle_taken`.
   - `onCreated({ ...data.org, role: "owner", hidden: false } as Org)`.
   - Width stays `min(480px, 92vw)`. The Open to grid wraps "All of Indianapolis (IU + Purdue)" onto two lines instead of overflowing.

4. **`OrgSettingsModal` tabs.**
   - `type SettingsTab = "overview" | "channels" | "members" | "followers" | "invites" | "requests" | "danger";`
   - `tabs`, in this order:
     1. Overview: always
     2. Channels: `canManage`
     3. Members: always
     4. Followers: `canManage` (owner/admin). This mirrors `FOLLOWER_LIST_ROLES`; F1 gives mods 403 `officers_only`.
     5. Invites: `canManage && !org.hidden`. Same rule as F6, whose hidden-club officer bar drops "Invite people"; the invite POST also refuses `org_hidden`.
     6. Requests: `isStaff`, under every policy (§2.4 item 9). Delete the `!org.is_public` condition.
     7. Danger: always
   - Tab bodies:
     - `followers` → `<SettingsFollowers org={org} canInvite={canManage && !org.hidden} onInvite={() => setTab("invites")} />`
     - `invites` → item 7
   - The nav keeps `overflowX: "auto"`. Seven pills fit in 760px.

5. **`SettingsOverview` for owner/admin.**
   - State: `isPublic` is replaced by `joinPolicy` (starts at `basePolicy`) and `audience` (starts at `baseAudience`).
   - `openToCampus`: from `campusRowById(org.campus_id)` plus `isSharedCampus`; null when there's no row.
   - **Visible club:** replace the "Visibility" `Field` with:
     1. `ChoiceField` "Who can join" (`WHO_CAN_JOIN_OPTIONS`)
     2. `ChoiceField` "Open to" (`openToOptions(openToCampus)`, hint `AUDIENCE_HELP`). No disabled options: an admin can't know the owner's university, so the server's 400 is the check.
     3. The muted `OFFICER_FOLLOW_HELP` line
   - **Hidden club (`org.hidden`):** replace it with:
     1. `ReadOnlyRow` "Who can join" = `whoCanJoinFact(basePolicy)`
     2. `ReadOnlyRow` "Open to" = `openToFact(baseAudience)`
     3. A muted line "This org is hidden, so its join settings can't change." This is the same sentence as the PATCH's 409 `org_hidden`.
   - **Pending-requests line**, directly under "Who can join":
     - Show it only when `joinPolicy === "invite" && basePolicy !== "invite"`.
     - On the first such render, fetch once (guarded by a ref): `vibeRequest<{ requests?: unknown[] }>(`/api/orgs/${org.handle}/requests`, { cache: "no-store", quiet: true, failure: "Couldn't load join requests." })`.
     - Count = the array's length, or null on failure.
     - Copy:
       - 0 or null → nothing
       - 1 → "1 pending request stays in Requests until you approve or deny it."
       - n → "{n} pending requests stay in Requests until you approve or deny them."
   - **`dirty`:** the `isPublic` term becomes `joinPolicy !== basePolicy || audience !== baseAudience`.
   - **`save`:** `vibeRequest<{ org?: Partial<Org> }>(`/api/orgs/${org.handle}`, { method: "PATCH", json, quiet: true, failure: "Couldn't save your changes." })`.
     - `json` = `{ name, description, backdrop_preset, philanthropy, links }`, with today's trimming and link filter.
     - Add `join_policy` only when `joinPolicy !== basePolicy`, and `audience` only when `audience !== baseAudience`. Add neither when `org.hidden`.
     - Never send `is_public`. The PATCH's "Join policy" block maps a stray `is_public` into a policy.
     - ok → `onOrgUpdated({ ...org, ...r.data.org })` (the response has `join_policy`, `audience` and `hidden` but no `role`), then msg "Saved.".
     - failure → the err msg is `r.status === 429 ? "Too many tries. Try again in a minute." : (r.error ?? r.message)`.
       - When `r.action` is set (`terms_required`), also `toast({ message: r.message, tone: "error", action: r.action })`.
       - `audience_excludes_owner` (400) and `org_hidden` (409) show the server's sentence.

6. **`SettingsOverview` read-only view (mod/member).**
   - Remove the "Visibility" `ReadOnlyRow`. After "Description" add:
     - "Who can join" = `whoCanJoinFact(org.join_policy)`
     - "Open to" = `openToFact(org.audience)`
     - Omit either row when its field is undefined.
   - **"Followers" row:** one quiet GET on mount, `vibeRequest<{ org?: { follower_count?: number | null } }>(`/api/orgs/${org.handle}`, { cache: "no-store", quiet: true, failure: "Couldn't load this club." })`.
     - Render `ReadOnlyRow` "Followers" = `String(n)` only when `followerCountText(n)` is non-null. F2 already floors the count for non-officers.
     - Failure or null → no row and no toast.
     - Never widen `?filter=mine` for this (F2 rule).
   - Under the `PermissionsCard`: a muted 12px line, `MOD_READONLY` ("Only owners and admins can change this.").

7. **Invites tab.**
   - Markup: `<div style={{ background: "#FBF8F3", color: "#1C1C1E", borderRadius: 14, padding: 12 }}><OrgInviteSheet handle={org.handle} orgName={org.name} audience={baseAudience} presentation="inline" /></div>`.
   - F5a gives the sheet no `tone` prop and styles it for light surfaces (org page modal, phone sheet); the light panel keeps its text readable inside this dark modal. If F5a shipped a `tone` prop, pass `tone="dark"` and drop the panel.
   - The tab remounts on every visit (conditional render), so its followers list refetches after a Remove.
   - No other invite UI here. `ChannelAccess`'s private-channel `@handle` add stays: it grants channel access, not org membership.

8. **`SettingsFollowers` (new, beside `SettingsMembers`).** Props: `{ org: Org; canInvite: boolean; onInvite: () => void }`.
   - **Row type:** `FollowerRow = { id: string; name: string | null; handle: string; avatar_url: string | null; follows_since: string; org_follow_source: string; member_role: Role | null }`. This is the §4.2 shape. CH3 ignores `follow_state` (a PERSON follow), `mutual_count`, the banners, `major` and `year`.
   - **State:** `rows: FollowerRow[] | null`, `cursor: string | null`, `count: number | null`, `loadErr: LoadFailure | null`, `loadingMore`, `busyId`, `reloadKey`, `loadedRef`. Same pattern as `SettingsMembers`.
   - **Load:** `vibeRequest<{ followers?: FollowerRow[]; next_cursor?: string | null; follower_count?: number | null }>(`/api/orgs/${org.handle}/followers?limit=30${after ? `&cursor=${encodeURIComponent(after)}` : ""}`, { cache: "no-store", quiet: true, failure: "Couldn't load followers." })`.
     - First page ok → `rows = followers`, `cursor = next_cursor ?? null`, `count = follower_count ?? null`.
     - "Show more" ok → append only rows whose `id` isn't already present, in response order. Update `cursor` and `count`.
     - First-page failure with no rows yet → `<LoadFailed tone="dark" failure={asLoadFailure(r, "Couldn't load followers.")} onRetry={…} />`. A failure never shows "0 followers" or the empty copy.
     - "Show more" failure → toast `failure.message` with its action; rows and cursor stay.
     - NEVER sort, group or filter rows on the client. The server order is `first_followed_at desc, id desc` (C5, C15).
   - **Header row:**
     - Left, Fraunces 800 16px white: `count === null ? "Followers" : count === 1 ? "1 follower" : `${count} followers``. The count is exact, with no floor; only officers reach this tab.
     - Right, when `canInvite`: a button "Invite followers" (`modalSubmitStyle(true)`) → `onInvite()`.
     - Under the row, muted 12px: "Only owners and admins can see this list."
   - **Row** (same box as a `SettingsMembers` row):
     - 32px avatar, with the `initialsForOrg` initials as the fallback.
     - Line 1: `name || `@${handle}``, a `next/link` to `/profile/${encodeURIComponent(handle)}`.
     - Line 2: `@{handle}`.
     - Line 3, muted: `followsSinceText(follows_since)`, omitted when null.
     - `member_role != null` → a "Member" pill (11px 700, `rgba(255,255,255,0.08)` background, `rgba(255,255,255,0.14)` border) and NO Remove.
     - Otherwise → a "Remove" button (`modalCancelStyle`), which reads "Removing…" and is disabled while `busyId === row.id`.
   - **Remove:**
     1. Confirm with `window.confirm(`Remove ${row.name || "@" + row.handle} from ${org.name}'s followers? They'll stop getting its posts. They can follow again.`)`. Removal is reversible (Q1).
     2. `vibeRequest<{ removed?: boolean; follower_count?: number | null }>(`/api/orgs/${org.handle}/followers/${row.id}`, { method: "DELETE", quiet: true, failure: "Couldn't remove this follower." })`.
     3. Handle the response:
        - ok → drop the row and set `count = follower_count` when it's a number. Toast "Follower removed" when `removed` is true. When `removed` is false, drop the row silently; they had already unfollowed.
        - 409 `member_follows` → set that row's `member_role` to `"member"` if it was null, and toast `orgErrorCopy("member_follows")` ("Members follow automatically.").
        - 404 `not_found` → toast `orgErrorCopy("not_found")`.
        - status 429 → toast "Too many tries. Try again in a minute."
        - anything else (403 `officers_only` after a demotion, 400, 500) → toast `r.message` with `r.action`.
     - Nothing is removed before the response arrives (no optimistic removal), and nothing is refetched afterwards.
   - **Show more:** a "Show more" button (`modalCancelStyle`) under the list whenever `cursor` is non-null. It reads "Loading…" while fetching.
   - **Empty** (first page ok, zero rows, no cursor): "Nobody follows {org.name} yet. Share the club's page — people who follow it show up here." The invite sheet's empty state uses the same words.

9. **`SettingsRequests`.**
   - `RequestRow` gains `eligible?: boolean; ineligible_reason?: "audience_iu" | "audience_purdue" | "unverified" | null`. Sources: `requests/route.ts:23` and `:166-167`; no batch touches that route.
   - When `eligible === false`, hide Approve and put a muted 12px label in its place. Deny stays.
     - `audience_iu` → "Not eligible (Purdue student)"
     - `audience_purdue` → "Not eligible (IU student)"
     - `unverified` → "Not eligible (no verified school email)"
   - Approve/deny failures still show `data.error` in the existing `err` line, then `refresh()` so each row's eligibility is re-read. The approve 409s are in `requests/[id]/route.ts`: `org_hidden` at :164, `school_unverified` at :209, `audience_mismatch` at :219.
   - "No pending requests." stays as it is.

10. **`SettingsDanger`.**
    - Leave confirm → `Leave ${org.name}? You'll lose access to its chats. Its posts stop too, unless you followed it before joining.` (Q3). The leave trigger deletes only the `source='join'` follow.
    - Non-owner `DangerCard` desc → "You'll lose access to its chats and chat history. Its posts stop too, unless you followed it before joining." This drops "You can rejoin later if it's public."
    - The owner cards and `destroy` stay as they are.

11. **`ROLE_PERMS`.**
    - owner: "Edit org name, description, visibility, backdrop" → "Edit name, description, who can join, backdrop". After "Promote, demote, and remove anyone", insert "See followers, remove them, and invite people".
    - admin: insert the same line after "Promote/demote mods + members; remove non-admins".
    - mod and member stay as they are. `RoleLegend` shows each role's first line.

**Where the reader notes disagreed, and what CH3 does** (§2.4 items 2 and 9 settle the first and fourth)
- **Follower row shape.** F5c2 used `first_followed_at`, `is_member` and `count`. CH3 uses F1's `follows_since`, `member_role` and `follower_count`.
- **B19-orgs-b's per-row "Invite to join" and "Joined {Mon D}" sub.** Dropped. Invites go through the Invites tab, which is the one place invite states render, and F1's rows carry no join date.
- **B19-orgs-b's "hide the header count below 5".** CH3 shows the exact count. The floor protects followers from the public, and officers are who it's meant to leave the count for: F1 returns it raw, and F6 sends officers to this tab.
- **B19-orgs-b's Requests rule** (request policy, or pending > 0). CH3 shows Requests to staff under every policy.
- **Invites on hidden clubs.** The tab is hidden, to match F6's hidden-club officer bar.

**Acceptance**
- `npx tsc --noEmit` exits 0.
- `npx eslint src/app/campus/campus-home.tsx` is not above the count recorded on CH2's merged file before editing, and not above 8 (the `f23bc5d` baseline).
- `node --test --experimental-strip-types src/lib/orgs/join-copy.test.ts` still passes (a sanity check; CH3 doesn't edit it).
- Greps on `src/app/campus/campus-home.tsx`:
  - `rg -n "is_public|isPublic" src/app/campus/campus-home.tsx | rg -v ':\s+is_public\??: boolean;$'` → 0. Only type-field declarations remain.
  - `rg -n '"Visibility"|label: "Public"|label: "Private"|if it.s public|visibility, backdrop' src/app/campus/campus-home.tsx` → 0.
  - `rg -n 'key: "requests".*show: isStaff \}' src/app/campus/campus-home.tsx` → 1.
  - `rg -n "filter=mine" src/app/campus/campus-home.tsx` → exactly 2 lines, text unchanged from CH2's file.
  - `rg -n "viewer_follows" src/app/campus/campus-home.tsx` → 0.
  - `rg -n "/followers" src/app/campus/campus-home.tsx` → hits only inside `SettingsFollowers` (the GET and the DELETE).
  - `awk '/^function SettingsFollowers/,/^}/' src/app/campus/campus-home.tsx | rg -c '\.sort\(|\.reverse\('` → 0.
  - `awk '/^function ChoiceField/,/^}/' src/app/campus/campus-home.tsx | rg -c '<label'` → 0.
  - `rg -n 'from "@/lib/orgs/(following|membership|notification-orgs)"' src/app/campus/campus-home.tsx` → 0.
- **Live walk, read-only.** Sign in as Franky, 1280px, `https://www.connectvibe.app/campus?tab=chat`. Before the first click, install the non-GET blocker (it records and rejects every non-GET) and stub `window.confirm` / `window.prompt` to record their text and return false / null. Open each club's settings from the rail gear.
  - **SAE (owner):**
    - Tabs read "Overview · Channels · Members · Followers · Invites · Requests · Danger".
    - Overview:
      - "Invite only" and "All of Indianapolis (IU + Purdue)" have `aria-checked="true"`. `AUDIENCE_HELP` and `OFFICER_FOLLOW_HELP` are visible.
      - Clicking the Open to hint text changes nothing, and Save stays disabled.
      - Click "Request to join", then Save. The blocker records one PATCH `/api/orgs/sae` whose body has `join_policy:"request"` and no `audience` or `is_public` key.
      - Reopen the modal and change only the Name. The recorded PATCH body has no `join_policy`, `audience` or `is_public`.
    - Followers:
      - `GET /api/orgs/sae/followers?limit=30` → 200. The header reads "1 follower".
      - One row (Franky) with a "Member" pill and "Follows since {Mon D}", no "Remove", no "Show more".
      - "Invite followers" switches to the Invites tab.
    - Invites: the inline sheet sits on the light panel, with section "Followers" and the empty copy "Nobody follows {SAE's name} yet. …". A screenshot shows the text readable.
    - Requests: "No pending requests."
    - Danger: owner cards only.
  - **`test-6e881851`** (hidden; Franky is owner):
    - Tabs read "Overview · Channels · Members · Followers · Requests · Danger" (no Invites).
    - Overview shows read-only "Who can join: By request", "Open to: Anyone" and "This org is hidden, so its join settings can't change."
  - **`test-6ca4ec6e`** (hidden; Franky is a member):
    - Tabs read "Overview · Members · Danger".
    - Read-only rows "Who can join: Anyone" and "Open to: Anyone"; no "Followers" row (2 is below the floor); the line "Only owners and admins can change this."
    - Danger → "Leave org": the recorded confirm text equals item 10's string, and no DELETE is recorded.
  - **Create** (Orgs tab create entry):
    - "Anyone can join" and "All of Indianapolis (IU + Purdue)" are selected, and "Purdue students only" is disabled (Franky is IU).
    - Submit → the recorded POST `/api/orgs` body has `join_policy:"open"`, `audience:"both"` and no `is_public`. The blocker rejects it, so nothing is created.
- **In-page overrides** (same session, blocker still on; overridden non-GETs are answered by the wrapper and never reach the network):
  - **Paging:** `/followers` returns 30 rows with `next_cursor:"c1"`, then 30 rows (one id repeated from page 1) with `next_cursor:null`, with names deliberately out of alphabetical order → 59 rows in response order, and "Show more" disappears.
  - **Header count:** `follower_count` null / 1 / 12 → "Followers" / "1 follower" / "12 followers".
  - **Load failures:** first page 500 → LoadFailed "Couldn't load followers." with Retry and no empty copy. Page 2 500 → a toast, and the 30 rows stay.
  - **Remove** on a non-member row: the recorded confirm text matches item 8. With confirm returning true:
    - DELETE answered `{ok:true, removed:true, follower_count:11}` → the row is gone, the header reads "11 followers", toast "Follower removed".
    - 409 `{ok:false, code:"member_follows"}` → "Member" pill, no Remove, toast "Members follow automatically.".
    - 429 → toast "Too many tries. Try again in a minute."
  - **Requests:** a `/requests` row with `eligible:false, ineligible_reason:"audience_iu"` → "Not eligible (Purdue student)", Deny shown, no Approve.
  - **Pending-requests line:** a `?filter=mine` override gives SAE `join_policy:"request"`, and `/requests` returns 2 rows. Click "Invite only" → "2 pending requests stay in Requests until you approve or deny them." With `/requests` returning 500 instead → no line.
  - **PATCH errors:**
    - 400 `{ok:false, error:"The owner has to be able to join. …", code:"audience_excludes_owner"}` → that sentence in the error line.
    - 429 → "Too many tries. Try again in a minute."
- Agents send no follows, follower removals, invites, approvals, policy or audience saves, leaves or creates to production (§4.1 rule 2). Franky sends the first real SAE invite.

**Plan conflicts to fix outside CH3** (not CH3's files)
- **The sheet has no `tone` prop.** F5a's `OrgInviteSheet` has no `tone` prop, and CH3 mounts it inline in a dark modal. CH3 wraps it in a light panel (item 7). A later F5a follow-up could add `tone`.
- **The `audience_excludes_owner` copy doesn't match the labels.** When the owner has no university, both `audienceExcludesOwnerMessage` copies (`orgs/route.ts`, `orgs/[slug]/route.ts`) tell the officer to pick "IU and Purdue students". On a shared campus, `openToOptions` labels that option "All of {campus} (IU + Purdue)". Create avoids the dead end by disabling the options (item 3). Settings can still show the mismatched sentence until F2's owner (or a later batch) aligns it.

**Do not touch:**
- CH2's surfaces: `OrgsTabBody`, `DiscoverGroup`, `DiscoverCard`, `OrgQuickViewModal`, `DiscoverFilterChips`, the `ChannelRail` header chip, the search dropdown and the map zone panel.
- CH1's surfaces: `CampusBanner`, `useViewerCampus`, the `FeedRow` edit and the tour.
- The two `?filter=mine` fetches.
- `SettingsMembers` (including `kick`), `SettingsChannels`, `ChannelSettingsModal`, `ChannelAccess` and `Field`. `ChoiceField` is added beside `Field`.
- Every file other than `campus-home.tsx`, including `OrgInviteSheet.tsx`, `join-copy.ts`, the org, follower and requests routes, and `globals.css`.

---
