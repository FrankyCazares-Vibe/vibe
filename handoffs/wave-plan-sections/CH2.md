### CH2 · desktop campus home Orgs tab, student side: Follow next to Join, "You're invited" and "Yours", filters, quick view, rail chip, search meta

**Owns:** `src/app/campus/campus-home.tsx`
**Depends on:**
- CH1 (W3, same file, on `main` by G3). Keep its `useViewerCampus` labels: the `OrgsTabBody` eyebrow `'Organizations · {label}'` and the Verified hint `'Officially recognized clubs at {label}.'`. Also keep the feed Edit post work and `CampusBanner`.
- H1 (W1, same file). Its `discoverJoinLabel` helper, its optional `DiscoverOrg` fields and its `handleJoin` failure copy are REPLACED here.
- F5a. Imports `OrgJoinControl`, `orgRowView`, `policyChip`, `audienceChip`, `memberCountText`, `inviteSubText` and `type OrgRelation`.
- F2 live: `org_follow_state` on discover rows, `?filter=following`, nullable `member_count`.
- F1 live: the follow routes, called by URL inside `OrgJoinControl`.
- H1 live: `join_policy` / `audience` on `/api/search` org rows.
- Gate G3.

**Anchors:** H1 and CH1 both edit `campus-home.tsx` before this batch, so every site in it is named by function, type or constant, never by line. Re-grep them on `main` before editing (§4.1 rule 6). The `:line` anchors below are only in files no batch touches, and were re-read at `f23bc5d`:
- `src/app/api/me/org-invites/route.ts`
- `src/lib/org-asset-url.ts`
- `src/lib/orgs/join-state.ts`
- `src/components/feedback/LoadFailed.tsx`
- `src/lib/feedback/request.ts`

Live facts (read-only SQL, 2026-09-16):
- `sae` is `join_policy='invite'`, `audience='both'`, verified, with 1 member, 1 follower, 4 channels and 0 pending invites.
- The other four clubs are hidden.

**Scope limit:**
- CH2 does not touch `CreateOrgModal`, `OrgSettingsModal` or any of its tabs (`SettingsRequests`, the Overview form, `ReadOnlyRow 'Visibility'`). Those belong to CH3 (W5).
- It does not touch the `filter=mine` loads in `CampusHome` (chat rail) or the post-as-club picker (`EligibleOrg`).
- It does not touch `EmptyState`'s "Discover orgs" card, which CH1 already rewrote.
- It adds no follower count to any student surface.

**Contract**

1. **Imports** (top of file, next to the existing `@/lib/...` imports)
   - `import { OrgJoinControl } from "@/components/orgs/OrgJoinControl";`
   - `import { audienceChip, inviteSubText, memberCountText, orgRowView, policyChip, type OrgRelation } from "@/lib/orgs/join-copy";`
   - `import type { JoinPolicy, JoinState, OrgAudience } from "@/lib/orgs/join-state";` (`join-state.ts:59`, `:62`, `:80-89`; pure, no imports)
   - `import { orgAssetProxyUrl } from "@/lib/org-asset-url";` (`org-asset-url.ts:12-25`; no imports, client-safe)
   - Module-level type: `type OrgControlChange = Parameters<NonNullable<React.ComponentProps<typeof OrgJoinControl>["onChange"]>>[0];`. Never re-declare F5a's shape by hand.

2. **Types**
   - **`Org`** (the rail / `filter=mine` row) gains these optional fields, which `/api/orgs?filter=mine` already sends:
     - `join_policy?: JoinPolicy`
     - `audience?: OrgAudience`
     - `hidden?: boolean`
     - `campus_id?: string | null`

     `is_public` STAYS on `Org`, because CH3's settings still read it.
   - **`DiscoverOrg`** (replace H1's optional fields; drop `is_public` and `pending_request`):
     ```ts
     type DiscoverOrg = {
       id: string; handle: string; name: string; description: string;
       logo_url: string | null; banner_url?: string | null; backdrop_preset: BackdropKey;
       verified: boolean; dormant: boolean;
       member_count: number | null;             // F2 C27: null on a failed read
       role?: Role | null;
       join_policy: JoinPolicy | null;          // null only on a row built from /api/me/org-invites
       audience: OrgAudience;
       join_state: JoinState;
       join_reason?: "policy" | "visiting" | null;
       pending_invite?: { id: string; expires_at: string; invited_by_name: string | null } | null;
       org_follow_state?: "following" | "not_following";
       follower_count?: number | null;          // typed only, NEVER rendered (C13, No vanity metrics)
       links?: Array<{ label: string; url: string }>; philanthropy?: string;
     };
     ```
   - **`DiscoverFilter`** = `"all" | "following" | "open" | "request" | "invite"`.
   - **`type MeInvite`**, the shape `/api/me/org-invites` answers (`me/org-invites/route.ts:95-122`): `{ id: string; created_at: string; expires_at: string; org: { id: string; handle: string; name: string | null; logo_url: string | null /*RAW key*/; verified: boolean; audience: OrgAudience }; invited_by: { name: string } | null }`.
   - **`type OrgOverride`** = `{ state: JoinState; following: boolean; role: Role | null; approx?: true }`.
   - **`SearchOrg`** gains `join_policy?: JoinPolicy; audience?: OrgAudience`. `is_public` stays in the type; it is no longer read.

3. **Delete dead code.**
   - Remove H1's `discoverJoinLabel`.
   - Remove `OrgsTabBody`'s `pending` / `busy` state, the seeding block inside the discover effect, and `handleJoin`.
   - After the edit, `rg -n "discoverJoinLabel|handleJoin" src/app/campus/campus-home.tsx` must return 0.

4. **`OrgsTabBody` state and loads**
   - **Keep:** `results`, `searchInput`, `debouncedQ`, `showDormant`, `previewOrg`, `loadErr`, `loadKey`, `loadedRef`.
   - **Keep the discover effect:** `filter=discover`, `q`, `include_dormant`; same quiet failure handling and same deps.
   - **One change in its success branch**, after `setResults(orgs)`: `setOverrides((prev) => dropApprox(prev))`. `dropApprox` is a module-level pure helper that removes the entries with `approx: true`.
   - **New state:**
     - `overrides: Record<string /*org id*/, OrgOverride>` (`{}`)
     - `followingOrgs: DiscoverOrg[] | null`, `followingHasMore: boolean`, `followingErr: LoadFailure | null`
     - `invites: MeInvite[] | null`, `invitesErr: LoadFailure | null`
     - `sideKey: number` (`0`)
     - `const YOURS_PREVIEW = 6` (module level)
   - **Following effect** (deps `[debouncedQ, sideKey]`):
     - Request: `vibeRequest<{ orgs?: DiscoverOrg[]; has_more?: boolean }>(`/api/orgs?${new URLSearchParams(debouncedQ ? { filter: "following", q: debouncedQ } : { filter: "following" })}`, { cache: "no-store", quiet: true, failure: "Couldn't load the clubs you follow." })`
     - Cancelled check exactly like the discover effect.
     - On `!r.ok || !Array.isArray(r.data.orgs)`, with `failure = asLoadFailure(r, "Couldn't load the clubs you follow.")`:
       - no list yet (`followingOrgs === null`) → `setFollowingErr(failure)`
       - otherwise → keep the rows and `toast({ message: failure.message, tone: "error", action: failure.action })`
     - On ok: `setFollowingErr(null); setFollowingOrgs(r.data.orgs); setFollowingHasMore(r.data.has_more === true)`.
     - Rows come back newest follow first and include member clubs. Never re-sort them.
   - **Invites effect** (deps `[sideKey]`):
     - Request: `vibeRequest<{ invites?: MeInvite[] }>("/api/me/org-invites", { cache: "no-store", quiet: true, failure: "Couldn't load your invites." })`
     - Handle failure the same way, into `invitesErr` / toast.
   - **Where "Yours" comes from.** Neither effect replaces `filter=mine`. The "Yours" list comes ONLY from `?filter=following` (hazard: `filter=mine` is the chat rail).
   - **Selecting the "Following" chip** calls `setSideKey((k) => k + 1)` as well as `setFilter("following")`, so that list is fresh.

5. **One relation per org** (a `useCallback` in `OrgsTabBody`, deps `[overrides]`)
   ```ts
   const relationOf = (o: DiscoverOrg): OrgRelation => {
     const ov = overrides[o.id];
     const state = ov?.state ?? o.join_state;
     const role = ov ? ov.role : (o.role ?? null);
     const following = state === "member" || role != null || (ov ? ov.following : o.org_follow_state === "following");
     return { handle: o.handle, orgName: o.name, state, following, role, reason: o.join_reason ?? null, audience: o.audience, joinPolicy: o.join_policy };
   };
   ```
   - This is §4.2's `following = role != null || org_follow_state === "following"`, with F5a's "force following when member".
   - An override is always the latest answer the server confirmed, so it wins over row data for the life of the tab.
   - The card and the quick view call the SAME `relationOf`, so both show one state.

6. **`handleChange(org: DiscoverOrg, prev: OrgRelation, next: OrgControlChange)`**
   - `if (next.state === "signed_out") return;` (the tab is signed-in only).
   - **`next.declined`:**
     - `setOverrides((p) => ({ ...p, [org.id]: { state: next.state, following: next.following, role: next.role, approx: true } }))`
     - then `setLoadKey((k) => k + 1)` and `setSideKey((k) => k + 1)`
     - F5a's decline state is a guess (it can't know `visiting` or `audience_blocked`). The discover refetch replaces it, and its success branch drops `approx` entries. The effect cleanup cancels any older in-flight discover response, so only the post-decline response lands.
   - **`next.state !== prev.state`** (join, request or accept):
     - set a non-approx override
     - `setSideKey((k) => k + 1)`: the invite inbox drops the accepted invite, and "Yours" gains the club through the join trigger
   - **Otherwise** (follow ⇄ unfollow only): set the override and reload NOTHING. The card stays where it is and shows its new control; it never jumps between groups on the tap.
   - Never call `/api/orgs?filter=mine` from here. Never toast from here: `OrgJoinControl` owns every toast (F5a C).

7. **`OrgsTabBody` render**
   - **`SceneHeader`:**
     - keep CH1's eyebrow
     - `subtitle` → `"Follow any club to get its posts. Join to get its chats."`
   - **The list source.**
     - `filter === "following"` → `followingOrgs`
     - otherwise → `results`, narrowed by `join_policy === filter` when the filter is `open` / `request` / `invite`
     - The client never reads `is_public`.
   - **Side groups** show only when `filter === "all" && !debouncedQ`. Call that `showSide`.
     - **`invitedRows`:**
       - When `invites` is non-null, map each invite IN ORDER:
         - if `results` or `followingOrgs` has a row with that org id, use it, with `pending_invite: row.pending_invite ?? { id: inv.id, expires_at: inv.expires_at, invited_by_name: inv.invited_by?.name ?? null }`
         - otherwise build a row with the module-level `orgFromInvite(inv)`:
           - `{ id, handle, name: org.name ?? org.handle, description: "", logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo"), banner_url: null, backdrop_preset: DEFAULT_BACKDROP, verified, dormant: false, member_count: null, role: null, join_policy: null, audience, join_state: "invited", join_reason: null, pending_invite: {…from inv}, org_follow_state: "not_following" }`
           - Proxy ONLY here: `orgAssetProxyUrl` is not idempotent, and it returns null for an already-proxied `/api/orgs/…` value (`org-asset-url.ts:18-24`).
           - A synthesized "Follow" that is really already followed self-corrects, because POST answers `already:true`.
       - Then append any `results` / `followingOrgs` row whose effective `relationOf(o).state === "invited"` and that isn't in the list yet.
       - Finally keep only rows where `relationOf(o).state === "invited"`, so an accepted card leaves the group as soon as its override lands.
     - **`yoursRows`** = `(followingOrgs ?? [])` minus the ids in `invitedRows`, in server order.
     - **`shownIds`** = ids of `invitedRows` ∪ (`followingOrgs` ids when non-null). The Verified / Student communities / Dormant groups exclude `shownIds` only when `showSide`.
   - **Loading.**
     - Show "Loading orgs…" (today's element) while `results === null`.
     - When `showSide`, also show it while `followingOrgs === null && !followingErr` or `invites === null && !invitesErr`. SAE must not render under Verified and then jump to "Yours".
     - When `filter === "following"`, show it while `followingOrgs === null && !followingErr`.
     - A first-load discover failure keeps today's `DarkGlassCard` + `LoadFailed`.
     - A first-load following failure while `filter === "following"`: the same card with `followingErr`, and Retry does `setFollowingErr(null); setSideKey((k) => k + 1)`.
   - **Groups, in order, when `showSide`:**
     1. `"You're invited"`, hint `"Accept to become a member and get the chats."`.
        - Renders when `invitedRows.length > 0 || invitesErr`.
        - `invitesErr` → `<LoadFailed tone="dark" compact failure={invitesErr} onRetry={() => { setInvitesErr(null); setSideKey((k) => k + 1); }} />` under the title, above any cards. Discover rows that say `invited` still render here.
        - `titleStyle={{ color: "#FF5C35" }}`.
     2. `"Yours"`, hint `"Clubs you follow or belong to."`.
        - Renders when `yoursRows.length > 0 || followingErr`.
        - `followingErr` → the same compact dark `LoadFailed` in place of the cards. Retry runs `setFollowingErr(null); setSideKey((k) => k + 1)`.
        - Cards: `yoursRows.slice(0, YOURS_PREVIEW)`.
        - `count={yoursRows.length}`.
        - Footer when `yoursRows.length > YOURS_PREVIEW || followingHasMore`: a text button `"See all clubs you follow →"` that runs the "Following" chip handler (item 4).
     3. `"Verified"`: hint unchanged from CH1.
     4. `"Student communities"`: hint → `"Groups created by verified students. Anyone can follow them."`.
     5. `"Dormant"`: hint unchanged.
   - **When `filter === "following"`:** ONE group, `"Following"`, hint `"Every club you follow, including the ones you joined."`, with all rows. When `followingHasMore`, a muted 12px line under the grid: `"Showing the 100 clubs you followed most recently."`.
   - **When `open` / `request` / `invite`, or any query:** today's Verified / Student communities / Dormant split with no exclusion.
   - **Empty copy.** This replaces the three-way ternary. It shows when no group has a card and no group-level error is showing:
     - `filter === "following"`, with a query → `` `No clubs you follow match “${debouncedQ}”.` ``; without → `"You don't follow any clubs yet."`
     - another filter with a query → `` `No clubs match “${debouncedQ}”.` ``
     - `open` → `"No open clubs here yet."`
     - `request` → `"No clubs here take requests yet."`
     - `invite` → `"No invite-only clubs here yet."`
     - `all` → unchanged: `"No orgs to discover yet — be the first to create one."`
   - **`OrgQuickViewModal` mount:** `org={previewOrg}`, `relation={relationOf(previewOrg)}`, `onClose`, `onChange={(prev, next) => handleChange(previewOrg, prev, next)}`. The modal STAYS OPEN after a change and repaints from the override.

8. **`DiscoverFilterChips`**
   - Options, in order:
     - `all` "All"
     - `following` "Following"
     - `open` `policyChip("open")`
     - `request` `<LockIcon size={11} /> {policyChip("request")}`
     - `invite` `<LockIcon size={11} /> {policyChip("invite")}`

     That renders as All · Following · Open · By request · Invite only.
   - Each chip button gains `aria-pressed={on}`. The styles don't change.
   - The `onChange` prop stays `(f: DiscoverFilter) => void`. `OrgsTabBody` passes `(f) => { if (f === "following") setSideKey((k) => k + 1); setFilter(f); }`.

9. **`DiscoverGroup`**
   - **Props:** `{ title; hint; orgs: DiscoverOrg[]; count?: number; relationOf: (o: DiscoverOrg) => OrgRelation; onChange: (o: DiscoverOrg, prev: OrgRelation, next: OrgControlChange) => void; onPreview: (o: DiscoverOrg) => void; error?: { failure: LoadFailure; onRetry: () => void } | null; footer?: React.ReactNode; titleStyle?: React.CSSProperties }`.
   - `pending`, `busy` and `onJoin` are removed.
   - The count badge shows `count ?? orgs.length`.
   - `error` renders the compact dark `LoadFailed` between the header and the grid.
   - `footer` renders under the grid.
   - Each card: `<DiscoverCard key={o.id} org={o} relation={relationOf(o)} onChange={(prev, next) => onChange(o, prev, next)} onPreview={() => onPreview(o)} />`.

10. **`DiscoverCard`** (`view = orgRowView(relation, "card")`)
    - **Props:** `{ org: DiscoverOrg; relation: OrgRelation; onChange: (prev: OrgRelation, next: OrgControlChange) => void; onPreview: () => void }`.
    - **Delete** `memberCount = org.member_count ?? 0`, the `label` / `disabled` computation (H1's `discoverJoinLabel` call) and the whole "Joined" div / join `<button>` branch.
    - **Card keyboard handler:** `onKeyDown` acts only when `e.target === e.currentTarget`. Without that, Enter or Space on an inner Follow button calls `preventDefault()` while bubbling, which cancels the button's own activation and opens the preview instead.
    - **Name line:**
      - after `VerifiedBadge` and the dormant pill, when `view.chip` is set: a pill styled like the dormant pill, with color `#FFD9CC`, background `rgba(255,92,53,0.18)`, border `1px solid rgba(255,92,53,0.4)`, and text `view.chip`
      - on cards that chip is only "Invited you"
    - **Meta line**, parts joined by the existing `·` separator spans, with a separator only between parts that are present:
      1. `@{handle}`
      2. each `view.meta` string, with `<LockIcon size={10} />` before "By request" / "Invite only"
      3. `memberCountText(org.member_count)` when non-null (C27)
      4. `<RoleChip role={relation.role} />` when `relation.role`
    - **No** `follower_count`, `followerCountText` or "followers" anywhere on the card (C13).
    - **Invite line.** When `relation.state === "invited" && org.pending_invite`, one 12px `COLORS.glassMuted` line under the meta: `inviteSubText(org.pending_invite.invited_by_name, org.pending_invite.expires_at)`, e.g. "Invited by Franky · Expires Oct 16".
    - **Controls row** (replaces the join branch; keeps the "Profile" `Link` and its `stopPropagation`):
      - The row gets `flexWrap: "wrap"`.
      - Controls: `<div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} style={{ flex: "1 1 auto", minWidth: 0 }}><OrgJoinControl relation={relation} variant="card" source="discover" pendingInviteId={org.pending_invite?.id ?? null} onChange={(next) => onChange(relation, next)} /></div>`
    - **Disclosure.** When `view.disclosure` is set, a 12px `COLORS.glassMuted` line under the controls row: "Officers can see who follows this club." It shows only on request and invite-only clubs with a follow control (F5a, Q7).
    - **Dark surface.** CH2 does NOT restyle, fork or re-implement `OrgJoinControl`'s buttons, and does not edit F5a files. If the shipped `card` styling assumes a light surface and reads poorly on `DARK_GLASS_SURFACE`, attach a 1280px screenshot to the batch report. The orchestrator decides on an additive `tone` prop in repair.

11. **`OrgQuickViewModal`**
    - **Props:** `{ org: DiscoverOrg; relation: OrgRelation; onClose: () => void; onChange: (prev: OrgRelation, next: OrgControlChange) => void }` (`status`, `busy` and `onJoin` are removed).
    - **Delete** `memberCount = org.member_count ?? 0` and `ctaLabel` / `ctaDisabled` (H1's `discoverJoinLabel` call).
    - **Name line:** `view.chip` pill as on the card, where `view = orgRowView(relation, "card")`.
    - **Meta line:** exactly the card's parts, in the card's order. The Private/Public branch is gone.
    - **Invite line:** the card's invite line, directly above the CTA row.
    - **CTA row:**
      - `display: flex`, `gap: 8`, `flexWrap: "wrap"`
      - the control wrapper and `OrgJoinControl` exactly as on the card (the modal content already stops click propagation)
      - then the existing `"Open profile →"` Link, unchanged
      - `view.disclosure` under the row, 12px muted
    - The "Joined" green div and the join `<button>` are removed.

12. **`ChannelRail` header meta** (the line that renders `Private` / `Public` and `` ` · ${channels.length} channels` ``)
    - Parts in order:
      1. `"Hidden"` when `org.hidden`
      2. when `org.join_policy` is set: `<LockIcon size={11} />` (request/invite only) followed by `policyChip(org.join_policy)`
      3. unless `loadErr`: `` `${channels.length} ${channels.length === 1 ? "channel" : "channels"}` ``
    - ` · ` goes only between present parts. With no `join_policy` (an old cached row), the policy part is simply left out.
    - The "no count while the list failed" rule and its comment stay.
    - Expected for SAE's owner: `Invite only · 4 channels`.
    - The rail's data source is unchanged: `filter=mine` in `CampusHome`.

13. **`CampusSearchBar` dropdown, "Clubs & Orgs" rows**
    - The `EntityRow` `role` becomes `[memberCountText(o.member_count), o.verified ? "Verified" : null, o.join_policy && o.join_policy !== "open" ? policyChip(o.join_policy) : null, o.audience ? audienceChip(o.audience) : null].filter(Boolean).join(" · ")`.
    - The `action` stays "View" and `goOrg` is unchanged.
    - This also fixes today's "1 members".
    - Expected for `sae`: `1 member · Verified · Invite only`.

**Acceptance**

Static (run on the batch's tree):
- `npx tsc --noEmit` exits 0.
- `npx eslint src/app/campus/campus-home.tsx` is not above the count on `main` after CH1. Record it before editing; it is expected to be ≤ 8.
- `node --test --experimental-strip-types src/lib/orgs/join-copy.test.ts src/lib/orgs/join-state.test.ts` still passes. CH2 edits neither file.
- The student-side scope check prints nothing:
  ```sh
  awk '/^function (OrgsTabBody|OrgQuickViewModal|DiscoverGroup|DiscoverFilterChips|DiscoverCard|ChannelRail)\(/{f=1;next} /^(export )?(async )?function /{f=0} f&&/is_public|follower_count|followerCountText|discoverJoinLabel|handleJoin|member_count \?\? 0|Private|"Public"/{print NR": "$0}' src/app/campus/campus-home.tsx
  ```
  (At `f23bc5d` the same script prints 21 lines, so it does catch the old code.)
- `rg -n "discoverJoinLabel|handleJoin" src/app/campus/campus-home.tsx` → 0 hits.
- `rg -c "<OrgJoinControl" src/app/campus/campus-home.tsx` → 2.
- `rg -n 'source="discover"' src/app/campus/campus-home.tsx` → 2 hits.
- `rg -n "follower_count|followerCountText" src/app/campus/campus-home.tsx` → exactly 1 hit: the `DiscoverOrg` type field.
- `rg -n "filter=mine" src/app/campus/campus-home.tsx` → exactly 2 hits (the rail load and the post-as-club picker).
- `git diff origin/main -- src/app/campus/campus-home.tsx | rg "filter=mine|EligibleOrg"` → no output.
- `rg -n "Anyone can join the public ones|No orgs match" src/app/campus/campus-home.tsx` → 0 hits.
- `rg -n 'api/me/org-invites|filter: "following"' src/app/campus/campus-home.tsx` → at least 2 hits.

Live, read-only (1280px, prod, signed in as Franky, who owns SAE, in the gstack browser):
- Setup (§4.1 rule 2):
  - Before opening the Orgs tab, install a `window.fetch` wrapper that records every non-GET `{method, url, body}` and answers it from a canned table. Nothing non-GET reaches the network.
  - The same wrapper serves the GET overrides named below.
  - `window.confirm` is stubbed to return true only for the decline check.
  - No real follow, join, accept, decline or invite happens.

1. **No overrides** (real data):
   - Opening the tab fires exactly one each of `GET /api/orgs?filter=discover`, `GET /api/orgs?filter=following` and `GET /api/me/org-invites`, and no non-GET.
   - "Yours" shows SAE: disabled "Joined ✓", the OWNER role chip, meta `@sae · Invite only · 1 member`, and NO "Officers can see who follows this club." line.
   - SAE is not repeated under "Verified".
   - There is no "You're invited" group.
   - Chips:
     - "Open" → "No open clubs here yet."
     - "Invite only" → SAE under "Verified"
     - "Following" → one "Following" group holding SAE
   - The SAE chat rail reads `Invite only · 4 channels`.
   - Typing `sae` in the campus search shows the row `1 member · Verified · Invite only`.
   - `/\bfollowers?\b/i.test(document.body.innerText)` → false.
2. **Non-member by override.**
   - Overrides:
     - discover: SAE with `role:null, join_state:"invite_only", org_follow_state:"not_following", follower_count:12`
     - following: `{ok:true, orgs:[], has_more:false}`
     - invites: `{ok:true, invites:[]}`
   - SAE under "Verified" shows "Follow" only, meta `@sae · Invite only · 1 member`, and the line "Officers can see who follows this club.". No "12" and no "followers" on the card or in the quick view.
   - Clicking the card body opens the quick view with the same chip, meta, control and line, plus "Open profile →".
   - Clicking "Follow" (canned `{ok:true, org_follow_state:"following", already:false, follower_count:null}` after 800ms):
     - records exactly `POST /api/orgs/sae/follow` with body `{"source":"discover"}`
     - the button reads "…" until the answer, then "Following ✓"
     - the quick view does not open
     - NO new GET to `filter=following` or `/api/me/org-invites` follows the POST
   - Tab to "Follow" and press Enter: the POST is recorded and no quick view opens.
   - A canned 404 `{ok:false, error:"Not found", code:"not_found"}` → toast "This org isn't available." and the label stays "Follow".
3. **State matrix.** Start from scenario 2's three overrides, including `role:null` (Franky really owns SAE, and a leftover `role` would force `following`). Then change these SAE fields, one reload each:
   - `join_policy:"open", join_state:"can_join"` → "Follow" + "Join", no disclosure, meta `@sae · 1 member`.
   - `join_policy:"request", join_state:"can_request", org_follow_state:"following"` → "Following ✓" + "Request to join", meta `@sae · By request · 1 member`, disclosure shown.
   - `join_state:"requested"` → "Follow", and the meta includes "Requested".
   - `join_state:"audience_blocked", audience:"iu"` → "Follow", meta `@sae · Invite only · IU only · 1 member`.
   - `member_count:null` → meta `@sae · Invite only` (no "0 members").
4. **Invites.**
   - Overrides, on top of scenario 2's:
     - discover: SAE with `role:null`, `join_state:"invited"` and `pending_invite:{id:"00000000-0000-4000-8000-000000000001", expires_at:"2026-10-16T16:00:00Z", invited_by_name:"Franky"}`
     - invites, two rows in this order:
       - that same invite for `sae`
       - `{id:"00000000-0000-4000-8000-0000000000aa", …, org:{id:"00000000-0000-4000-8000-0000000000bb", handle:"zz-fake-club", name:"Fake Club", logo_url:null, verified:false, audience:"both"}, invited_by:null}`
   - "You're invited" is the first group, with count 2 and SAE first:
     - chip "Invited you"
     - line "Invited by Franky · Expires Oct 16"
     - "Accept invite" + "Decline"
     - SAE is absent from "Verified"
   - The Fake Club card shows "No description yet.", meta `@zz-fake-club` only, "Invited by an officer · Expires …", and no broken logo request.
   - "Accept invite" on SAE (canned `{ok:true, joined:true, role:"member"}` after 800ms):
     - records `POST /api/orgs/sae/join` with body `{}`
     - then "Joined ✓"; SAE leaves "You're invited"
     - after the POST resolves, exactly one new GET each to `filter=following` and `/api/me/org-invites`
   - "Decline" on Fake Club (confirm stubbed to true, canned ok):
     - records `POST /api/me/org-invites/00000000-0000-4000-8000-0000000000aa` with body `{"action":"decline"}`
     - then new GETs to `filter=discover`, `filter=following` and `/api/me/org-invites`
5. **Failures.**
   - Following override 500 `{ok:false, error:"Failed to load orgs", code:"load_failed"}`:
     - "Yours" shows its title plus "Couldn't load the clubs you follow." and Retry
     - "Verified" still renders (SAE included)
     - Retry fires exactly one new following GET
   - Invites override 500 → "You're invited" shows its title plus "Couldn't load your invites." and Retry; the rest of the tab renders.
   - A "Following" chip with a following 500 on first load → the dark card `LoadFailed`, and no "You don't follow any clubs yet."
   - Following override `has_more:true`:
     - "Yours" shows "See all clubs you follow →", which selects the "Following" chip and fires a new following GET
     - that view ends with "Showing the 100 clubs you followed most recently."
6. **Regression.**
   - `/api/orgs?filter=mine` returns the same ids as the G4 recording.
   - The rail lists the same clubs.
   - The composer's post-as-club picker still offers SAE (open it; don't post).
   - The recorded non-GET list contains only the requests the steps above tapped on purpose.

**Do not touch:**
- **CH3 (W5):** `CreateOrgModal`, `OrgSettingsModal` and all its tabs (Overview form, `ReadOnlyRow 'Visibility'`, `SettingsRequests`), the settings tab rule that reads `org.is_public`, and `Org.is_public`.
- **In `CampusHome`:** the `filter=mine` rail load, the channels loads, and the `EligibleOrg` post-as-club picker. In `ChannelRail`, only the header meta line changes.
- **CH1's work:** `useViewerCampus`, `CampusBanner`, the `SCHOOL` removal, eyebrows, the Verified hint, the tour, map halos, the feed Edit post work, `EmptyState`, `page.tsx`.
- **`MapTabBody` / `ZonePanel`.** The following spec's "Members only. Follow to get their posts." zone footer (B19-orgs-a item 9) is NOT built. `MapOrg` carries only `is_public`, `/api/campus-map` selects no `join_policy` (`campus-map/route.ts:208`), and no wave owns that route. It is left for a later map batch.
- **Other files:** F5a's files (`join-copy.ts`, `OrgJoinControl.tsx`, `OrgInviteSheet.tsx`, `OrgInviteBanner.tsx`), `join-state.ts`, `org-asset-url.ts`, `globals.css`, and every API route.
- **Exports used by other files keep their signatures:** `CampusBanner`, `EventCard`, `OttoFeedStrip`, `BACKDROP_PRESETS`, `CampusEvent`, `FeedPost` (CampusMobile), and `CreateEventModal`, `EligibleOrg` (`OrgEventsSection.tsx`).

---
