### CM · phone CampusMobile: Orgs tab with Follow and Join, the campus confirm banner, Edit post on feed cards

**Owns:** `src/components/mobile/CampusMobile.tsx`
**Depends on:**
- F5a (imports `OrgJoinControl`; `orgRowView`, `memberCountText`, `inviteSubText`, `policyChip`, `audienceChip`, `type OrgRelation`, `type OrgDisplayState` from `join-copy`)
- F2 live (`org_follow_state`, nullable `member_count`, `?filter=following`)
- E2 (`EditPostSheet`; `PostViewerMobile`'s optional `onEdited` prop) and E0's lib (`type EditedPost`)
- B14t (`CampusConfirmBanner`)
- CH1 (`CampusBanner` keeps its export signature; `export type FeedPost` gains `edited_at`)
- G3
- By URL only: F1 (follow routes), E1 (PATCH `/api/posts/[id]`), F4 (`edited_at` on feed posts), H1 (search rows carry `join_policy`/`audience`).
- It folds in three reader batches: F5b (Orgs tab), B14's two CampusMobile edits (§2.4 item 13) and E3 (phone feed card Edit).

**Anchors:** no wave before W4 edits `CampusMobile.tsx` (§5). Every `:line` below was re-read at HEAD `f23bc5d`, and `git diff --quiet f23bc5d -- src/components/mobile/CampusMobile.tsx` was clean while W1 ran. The batch's own edits shift lines, so edit bottom-up or re-grep by function name. Names from other files (`CampusBanner`, `EditPostSheet`, `OrgJoinControl`, `CampusConfirmBanner`) are cited by name, because W1–W3 create or change them.

**Scope limit:**
- Don't touch `ChatPane`'s body (:1503-1749), including its `/api/orgs?filter=mine` load (:1517). Also leave `JoinedOrg` (:1769-1777), `OrgChannelsDrawer` (:1833-2167) and its channels fetch alone. `filter=mine` stays the chat list (founder decision).
- The `CampusBanner` line (:426) and the campus-home import list (:8-16) stay as they are. CH1 owns the banner.
- `CampusSearchOverlay` keeps its export and props: `ProfileMobile.tsx:10` and `:1896` import it, and PM owns that file in this same wave. Only `SearchOrg` and `SearchOrgRow` change.
- The `PostComposerMobile`, `MapPane`, `TabStrip` and `EventCard` mounts stay as they are. No Delete on the feed card (Q19).
- Don't edit `CampusConfirmBanner.tsx`, `EditPostSheet.tsx`, `PostViewerMobile.tsx`, `OrgJoinControl.tsx` or `join-copy.ts`. Report their defects to the orchestrator.

**Contract**

0. **Preconditions** (stop and report if any fails)
   - `ls src/components/mobile/EditPostSheet.tsx src/components/mobile/CampusConfirmBanner.tsx src/components/orgs/OrgJoinControl.tsx src/lib/orgs/join-copy.ts src/lib/posts/edit.ts` → all five exist (G3, plus W1 files).
   - `grep -n "export function EditPostSheet\|export function CampusConfirmBanner\|export function OrgJoinControl" src/components/mobile/EditPostSheet.tsx src/components/mobile/CampusConfirmBanner.tsx src/components/orgs/OrgJoinControl.tsx` → 3 named exports. If B14t shipped a default export, only the import line in item 1 changes.
   - `grep -n "onEdited" src/components/mobile/PostViewerMobile.tsx` → the prop exists (E2).
   - `grep -n "export function orgRowView\|export function inviteSubText\|export function memberCountText\|export function policyChip\|export function audienceChip" src/lib/orgs/join-copy.ts` → 5 hits.

1. **Imports** (:1-25). Add these, keeping the existing groups and alphabetical order:
   ```ts
   import { CampusConfirmBanner } from "@/components/mobile/CampusConfirmBanner";
   import { EditPostSheet } from "@/components/mobile/EditPostSheet";
   import { OrgJoinControl } from "@/components/orgs/OrgJoinControl";
   import { campusRowById } from "@/lib/iu/campuses";
   import { orgAssetProxyUrl } from "@/lib/org-asset-url";
   import { audienceChip, inviteSubText, memberCountText, orgRowView, policyChip, type OrgDisplayState, type OrgRelation } from "@/lib/orgs/join-copy";
   import type { JoinPolicy, JoinState, OrgAudience, OrgRole } from "@/lib/orgs/join-state";
   import type { EditedPost } from "@/lib/posts/edit";
   ```
   - Never import `@/lib/orgs/membership` (server-only), `@/lib/orgs/following` (route helpers), `@/app/api/*` or `@/lib/onboarding/*`.
   - `org-asset-url.ts` and `campuses.ts` have no `server-only` import. Both are already used from client files.

**B14: the two small edits (§2.4 item 13)**

2. **Campus confirm banner mount.**
   - Render `<CampusConfirmBanner />` directly before `<header id="otto-mobile-tour-tabs"` (:466-467). It sits after the Otto strip wrapper (:436-464) and outside the sticky `CampusBanner` wrapper (:418-427).
   - The comment above that wrapper (:416-417, "IU crimson banner — …") becomes `{/* Campus banner (shared with desktop): campus identity, live stats line, search icon. */}`. After CH1 it isn't crimson for Indianapolis.
   - Mount it bare, with no wrapper element. When the component renders nothing, the layout matches HEAD exactly.
   - It shows on every tab, because the tab strip sits below it.
   - If its card touches the screen edges at 375px, report that to the orchestrator: B14t's file has no W4 owner. Don't add a padding wrapper, which would leave a gap when the banner is hidden.

3. **EventsPane empty body** (:1484): replace `"When orgs or classmates create events, they'll surface here. Pull to refresh later."` with `"When orgs or classmates create events, they'll surface here."`. The title `"Nothing scheduled"` (:1483) stays.

**F5b: the Orgs tab**

4. **Types.**
   - `Org` (:56-65) keeps its eight fields; `member_count` becomes `number | null` (F2, C27). It gains:
     ```ts
     join_policy: JoinPolicy;
     audience: OrgAudience;
     role: OrgRole | null;
     join_state: JoinState;
     join_reason: "policy" | "visiting" | null;
     pending_invite: { id: string; expires_at: string; invited_by_name: string | null } | null;
     org_follow_state?: "following" | "not_following";
     ```
     Never add `viewer_follows` or `follow_state` (§2.4 item 1; `follow_state` means a PERSON follow).
   - New types next to `Org`:
     ```ts
     /** One row of GET /api/me/org-invites (me/org-invites/route.ts:106-119). logo_url is the RAW stored key. */
     type InviteRow = { id: string; created_at: string; expires_at: string; org: { id: string; handle: string; name: string | null; logo_url: string | null; verified: boolean; audience: OrgAudience }; invited_by: { name: string } | null };
     /** What OrgJoinControl's onChange reports (F5a §C props). */
     type OrgChange = { state: OrgDisplayState; following: boolean; role: OrgRole | null; declined?: true };
     type OrgLocal = { state: OrgDisplayState; following: boolean; role: OrgRole | null };
     type OrgLists = { discover: Org[] | null; following: Org[] | null; invites: InviteRow[] | null; campusId: string | null };
     type OrgErrs = { discover: LoadFailure | null; following: LoadFailure | null; invites: LoadFailure | null };
     const EMPTY_ORG_LISTS: OrgLists = { discover: null, following: null, invites: null, campusId: null };
     const NO_ORG_ERRS: OrgErrs = { discover: null, following: null, invites: null };
     ```

5. **Pure row helpers** (module level, directly above `function OrgsPane`, :2311)
   ```ts
   /** §4.2: following = role != null || org_follow_state === "following". A member always follows (join trigger). */
   function orgRelationFor(o: Org, local: OrgLocal | undefined): OrgRelation {
     const state: OrgDisplayState = local ? local.state : o.join_state;
     const role = local ? local.role : (o.role ?? null);
     const following = state === "member" || (local ? local.following : o.role != null || o.org_follow_state === "following");
     return { handle: o.handle, orgName: o.name, state, following, role, reason: o.join_reason ?? null, audience: o.audience, joinPolicy: o.join_policy };
   }
   /** Invite inbox rows carry no join_policy; F5a treats joinPolicy null as "no disclosure". */
   function inviteRelationFor(row: InviteRow, local: OrgLocal | undefined): OrgRelation {
     const state: OrgDisplayState = local ? local.state : "invited";
     return { handle: row.org.handle, orgName: row.org.name ?? row.org.handle, state, following: state === "member" || (local?.following ?? false), role: local?.role ?? null, reason: null, audience: row.org.audience, joinPolicy: null };
   }
   ```
   - `orgRowsFrom(raw: unknown): Org[] | null` returns null when `raw` isn't an array. Otherwise it keeps the rows whose `id`, `handle` and `name` are strings (narrowed with `typeof`, no `any`).
   - `inviteRowsFrom(raw: unknown): InviteRow[] | null` works the same way. A row needs a string `id` and `expires_at`, and an `org` object with string `id` and `handle`.
   - These must agree with B12S's `relationFor` (`social-steps.ts`), and the reviewer diffs the two. CM does not import onboarding code.

6. **State** (`orgs` :86, `orgsErr` :91) is replaced by:
   ```ts
   const [orgLists, setOrgLists] = useState<OrgLists>(EMPTY_ORG_LISTS);
   const [orgErrs, setOrgErrs] = useState<OrgErrs>(NO_ORG_ERRS);
   // What a row's control reported, painted until the next full reload answers.
   const [orgLocal, setOrgLocal] = useState<Record<string, OrgLocal>>({});
   // Bumped after a join so ChatPane remounts and re-reads filter=mine.
   const [chatKey, setChatKey] = useState(0);
   ```

7. **`refetchOrgs`** (:250-266) takes `mode: "first" | "refresh"`. It follows `refetchFeed`'s pattern (:206-228): a seq ref plus a loaded ref, and a failed refresh never wipes a loaded list.
   - Refs: `orgsSeqRef = useRef(0)`; `orgsLoadedRef = useRef({ discover: false, following: false, invites: false })`. No setState before the first `await`, so the eslint count holds at 4 (react-hooks/set-state-in-effect; HEAD hits are :117, :193, :271, :2943).
   - `const seq = ++orgsSeqRef.current;` then `Promise.all` of three requests:
     - `vibeRequest<{ orgs?: unknown; viewerCampusId?: unknown }>("/api/orgs?filter=discover", { cache: "no-store", quiet: mode !== "refresh", failure: "Couldn't load orgs." })`: the URL and failure string are unchanged
     - `vibeRequest<{ orgs?: unknown }>("/api/orgs?filter=following", { cache: "no-store", quiet: true, failure: "Couldn't load the clubs you follow." })`
     - `vibeRequest<{ invites?: unknown }>("/api/me/org-invites", { cache: "no-store", quiet: true, failure: "Couldn't load your invites." })`
   - If `seq !== orgsSeqRef.current`, return.
   - `discover = d.ok ? orgRowsFrom(d.data.orgs) : null`, and the same for `following` (`.orgs`) and `invites` (`inviteRowsFrom(i.data.invites)`). Mark each non-null list as loaded.
   - `setOrgLists(prev => …)`: each list is the new value when non-null, else `prev`'s. `campusId` = discover's `viewerCampusId` when discover answered and it is a string, `null` when discover answered without one, else `prev.campusId` (`orgs/route.ts:469`).
   - `setOrgErrs`: each key is `null` when that list answered or was loaded before, else `asLoadFailure(res, <its failure string>)`.
   - Only when all three answered: `setOrgLocal({})`, because the server lists are now the truth. Otherwise the tapped rows keep their painted state.
   - Comments: keep the `filter=discover` comment (:253-256). Replace the comment "Loads once; the only refetch is Retry after a failed first load." (:251) with "Loads on mount, on Retry, and after a row's Follow / Join / Accept." The `useCallback` at :252 gains the `mode` parameter.
   - The mount effect (:270-274) calls `void refetchOrgs("first");`. The deps stay the same.

8. **Mounts.**
   - `OrgsPane` (:528-536):
     ```tsx
     <OrgsPane
       lists={orgLists}
       errs={orgErrs}
       local={orgLocal}
       onRetry={() => { setOrgErrs(NO_ORG_ERRS); void refetchOrgs("first"); }}
       onChange={(orgId, wasMember, next) => {
         setOrgLocal((prev) => ({ ...prev, [orgId]: { state: next.state, following: next.following, role: next.role } }));
         if (!wasMember && next.state === "member") setChatKey((k) => k + 1);
         void refetchOrgs("refresh");
       }}
     />
     ```
   - `ChatPane` (:539) → `<ChatPane key={chatKey} onSelectOrg={(o) => setSelectedOrgForChat(o)} />`. Nothing inside `ChatPane` changes, and remounting re-runs its own `filter=mine` load. Without this, a club joined on the Orgs tab would be missing from Chat until a reload.

9. **`OrgsPane`** (:2311-2364), rewritten
   - Props: `{ lists: OrgLists; errs: OrgErrs; local: Record<string, OrgLocal>; onRetry: () => void; onChange: (orgId: string, wasMember: boolean, next: OrgChange) => void }`.
   - **All three lists null:** `errs.discover ? <LoadFailed failure={errs.discover} onRetry={onRetry} /> : <PaneSkeleton />`. The three loads settle together, so null with no error means loading, and a pane where everything failed shows discover's line (today's behaviour).
   - **Buckets** (no second read, no `filter=mine`):
     - `inviteRows = lists.invites ?? []` and `inviteIds = new Set(inviteRows.map(r => r.org.id))`.
     - `followingRows = (lists.following ?? []).filter(o => !inviteIds.has(o.id))`, in server order (newest follow first, F2). Never re-sorted.
     - `taken` = the invite ids plus the following ids.
     - `rest = (lists.discover ?? []).filter(o => !taken.has(o.id))`, split into `verified` (`!!o.verified`) and `others`, each sorted by `a.name.localeCompare(b.name)` (today's rule, :2334-2340).
     - If the following list failed, followed clubs stay in `rest` with their correct control. If the invite list failed, invited discover rows stay in `rest` with the "Invited you" chip and "Accept".
   - **Render order.** Put a `<div style={{ height: 6 }} />` before each header except the first thing rendered.
     1. Invites. Failed (`lists.invites === null && errs.invites`): `<LoadFailed failure={errs.invites} onRetry={onRetry} />` with NO header, because a "You're invited" header over a failure would claim there are invites. Rows: `<OrgSectionHeader label="You're invited" />`, then one `OrgRow` per invite.
     2. Following. Failed: `LoadFailed` ("Couldn't load the clubs you follow."), no header. Rows: header `"Following"`, then the rows. The reader note proposed "Yours". "Following" matches desktop's filter chip (§2.4 item 8); member clubs sit here and read "Joined ✓".
     3. Discover. Failed: `LoadFailed` ("Couldn't load orgs."). Rows: header `"Verified"`, then header `"All clubs"` (replaces "All orgs" at :2356).
   - **Copy.** `campus = campusRowById(lists.campusId)?.name ?? null` ("Indianapolis" for the shared campus). `line = campus ? `Clubs are just getting started at ${campus}. Follow the ones you like — posts land in your feed.` : "Clubs are just getting started here. Follow the ones you like — posts land in your feed."`. These sentences are character-identical to `ONB_COPY.clubs.sparse` and `sparseNoCampus` (B12S) but written as literals, because CM imports no onboarding code.
   - **Empty.** `total = inviteRows.length + followingRows.length + verified.length + others.length`; `failedAny` = any list that is null with an error.
     - `total === 0 && !failedAny` → `<EmptyTab title="No clubs here yet" body={line} />`. This replaces "No orgs here yet" / "Once orgs spin up on campus, you'll find them here." (:2326-2327).
     - `total` of 1–2 and `!failedAny` → the same `line` as a footer `<p>` under the rows: margin "6px 4px 0", DM Sans 12.5px, #8A8580, lineHeight 1.45, centered. With only SAE live, every student sees it.
     - While `failedAny` is true, neither the empty state nor the footer renders, so an error never reads as "no clubs".
   - **Row props.**
     - Invite row: `<OrgRow key={`invite:${r.id}`} orgId={r.org.id} handle={r.org.handle} name={r.org.name ?? r.org.handle} logoUrl={orgAssetProxyUrl(r.org.handle, r.org.logo_url, "logo")} verified={r.org.verified} relation={inviteRelationFor(r, local[r.org.id])} pendingInviteId={r.id} memberCount={null} inviteSub={inviteSubText(r.invited_by?.name ?? null, r.expires_at)} onChange={onChange} />`.
     - `orgAssetProxyUrl` is used ONLY on invite rows. The inbox returns the raw key (`me/org-invites/route.ts:114`); discover/following logos are already proxied (`orgs/route.ts:424`), and the helper returns null for an already-proxied `/api/orgs/…` value (`org-asset-url.ts:12-25`).
     - Discover/following row: `<OrgRow key={o.id} orgId={o.id} handle={o.handle} name={o.name} logoUrl={o.logo_url} verified={!!o.verified} relation={orgRelationFor(o, local[o.id])} pendingInviteId={o.pending_invite?.id ?? null} memberCount={o.member_count ?? null} inviteSub={null} onChange={onChange} />`.

10. **`OrgRow`** (:2384-2513), rewritten. Today the whole row is a `<Link>`, and a control nested inside it would be invalid HTML: a tap would navigate.
   - Props: `{ orgId: string; handle: string; name: string; logoUrl: string | null; verified: boolean; relation: OrgRelation; pendingInviteId: string | null; memberCount: number | null; inviteSub: string | null; onChange: (orgId: string, wasMember: boolean, next: OrgChange) => void }`.
   - `const view = orgRowView(relation, "phone_row");`. Buttons, chip, meta and disclosure all come from `view`. Never re-derive them.
   - Meta line: `(inviteSub !== null ? [`@${handle}`, inviteSub] : [`@${handle}`, ...view.meta, memberCountText(memberCount)]).filter((s): s is string => !!s).join(" · ")`.
   - `control` = `<OrgJoinControl relation={relation} variant="phone_row" source="discover" pendingInviteId={pendingInviteId} onChange={(next) => onChange(orgId, relation.state === "member", next)} />`. Source is `"discover"` for every Orgs-tab row (§4.2).
   - DOM, with no interactive element inside another:
     ```tsx
     <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 18, background: "rgba(255,253,248,0.78)", border: "1px solid rgba(255,255,255,0.7)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 14px rgba(180,120,60,0.08)" }}>
       <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
         <Link href={`/orgs/${encodeURIComponent(handle)}`} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
           {/* logo: today's 52px block (:2406-2432), reading logoUrl / name */}
           {/* text column (:2433): name row = name span (:2441-2453, plus minWidth 0) + verified ✓ (:2454-2473) + chip; then the meta line with today's styles (:2475-2492) */}
         </Link>
         {view.layout === "slot" ? <div style={{ flexShrink: 0 }}>{control}</div> : null}
       </div>
       {view.layout === "line" ? <div style={{ width: "100%" }}>{control}</div> : null}
       {view.disclosure ? <p style={{ margin: 0, fontFamily: "DM Sans, sans-serif", fontSize: 11.5, color: "#8A8580", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{view.disclosure}</p> : null}
     </div>
     ```
   - The chevron svg is deleted, because the control takes the right edge.
   - The `line` layout (open clubs) puts the two pills on a full-width row under the name, so the name never truncates to make room for two pills at 375px. F5a's control renders the pills with `flex:1`, at least 44px tall.
   - The disclosure sits outside the Link: it stays next to Follow (C14) and out of the link's accessible name.
   - Chip (`view.chip`), after the ✓: `<span style={{ flexShrink: 0, padding: "2px 8px", borderRadius: 999, fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", background: view.chip === "Invited you" ? "rgba(255,92,53,0.12)" : "rgba(28,28,30,0.06)", color: view.chip === "Invited you" ? "#B83A1A" : "#5C5853" }}>{view.chip}</span>`.
   - What a phone row shows, all from F5a's `orgRowView` table:
     - member: "Joined ✓"
     - invited: "Accept" + chip "Invited you". Decline lives on the org page.
     - open club, not followed: "Follow" + "Join" on the action line
     - open club, followed: "Following ✓" + "Join"
     - request club, not followed: "Follow"
     - request club, followed: "Request" + chip "Following"
     - requested / invite-only / audience-blocked / unverified: "Follow" or "Following ✓"
     - The disclosure "Officers can see who follows this club." shows on request and invite-only rows that render Follow or Following ✓.
   - Live SAE (invite only, audience both, 1 member):
     - a non-member sees SAE's name + ✓, then "@sae · Invite only · 1 member", slot "Follow", and the disclosure
     - Franky (owner) sees it under "Following": "Joined ✓", "@sae · Invite only · 1 member", no disclosure

11. **Search rows** (navigate-first; still no control)
   - `SearchOrg` (:2899-2905) gains `join_policy?: JoinPolicy; audience?: OrgAudience;` (H1 made `/api/search` return them; `r.data.orgs as SearchOrg[]` at :2965 is unchanged).
   - `SearchOrgRow` meta (:3335) `@{o.handle}` → `{[`@${o.handle}`, o.join_policy && o.join_policy !== "open" ? policyChip(o.join_policy) : null, o.audience ? audienceChip(o.audience) : null].filter(Boolean).join(" · ")}`, e.g. "@sae · Invite only".

**E3: Edit post on your own phone feed cards** (founder decision; Q19: Edit only, Delete stays in the viewer)

12. **Feed types and the viewer id**
   - `type FeedPost = DesktopFeedPost;` (:54) → `type FeedPost = DesktopFeedPost & { edited_at?: string | null };`. After CH1 this is identical to the desktop field, and it keeps this file compiling on its own.
   - `FeedBody` (:700) → `{ feed?: unknown; posts?: unknown; viewerId?: unknown }`. `/api/feed` echoes `viewerId: user.id` on every 200 (`feed/route.ts:452`).
   - State next to `feed` (:84): `const [viewerId, setViewerId] = useState<string | null>(null);`
   - `refetchFeed`, inside `if (posts) {` right after `setFeed(posts);` (:221): `if (r.ok && typeof r.data.viewerId === "string") setViewerId(r.data.viewerId);`
   - The #tag effect, inside `if (posts) {` (:322-325), before `setTagFeed`: the same line. A viewer whose main feed failed but whose tag list loaded still gets Edit.

13. **In-place update, with no refetch**
   - Directly after the `tagFeed` state (:285-289):
     ```ts
     const applyPostEdit = useCallback((p: EditedPost) => {
       const patch = (x: FeedPost): FeedPost =>
         x.id === p.id ? { ...x, content: p.content, tags: p.tags, edited_at: p.edited_at } : x;
       setFeed((prev) => (prev ? prev.map(patch) : prev));
       setTagFeed((prev) => (prev && prev.posts ? { ...prev, posts: prev.posts.map(patch) } : prev));
     }, []);
     ```
   - `setFeed` re-runs the #tag effect (:299-341 depends on `feed`). With a tag filter on, expect exactly one extra `GET /api/feed?limit=50&tag=…`. A card whose edit removed the tag stays on screen until that answer lands.
   - `PostViewerMobile` mount (:600-608): add `onEdited={applyPostEdit}`, so an edit made in the viewer updates the card under it.
   - `FeedPane` mount (:507-515): add `viewerId={viewerId}` and `onEdited={applyPostEdit}`.

14. **`FeedPane`** (:715-773)
   - Props gain `viewerId: string | null; onEdited: (p: EditedPost) => void;`.
   - `<FeedCard>` (:765-770) adds `isOwner={!!viewerId && p.user_id === viewerId}` and `onEdited={onEdited}`.
   - Owner means author (`user_id`), for club-attributed posts too. That's the same rule as desktop `FeedRow`'s `viewerOwnsPost` in `campus-home.tsx` and E1's `.eq("user_id", user.id)`.

15. **`FeedCard`** (:843-852)
   - Props gain `isOwner: boolean; onEdited: (p: EditedPost) => void;`.
   - Sub-line (:1045-1047): after `{time}`, add `{post.edited_at ? " · Edited" : ""}`, before the club suffix. It reads "@handle · 2h ago · Edited", the same marker as E2's viewer and CH1's desktop row.
   - Comment (:1050-1052) → `{/* 3-dot menu: Send to chats, Copy link, and Report (others' posts) or Edit post (your own). Delete stays in the post viewer. */}`.
   - `PostActionsSheet` mount (:1448-1459) adds `isOwner={isOwner}`, `initialContent={post.content ?? ""}`, `hasMedia={!!post.media_url}` and `onEdited={onEdited}`. `hasMedia` reads `media_url`, as E2's viewer mount and E1's `checkPostEdit(…, !!prior.media_url)` do.

16. **`PostActionsSheet`** (:2580-2755)
   - Docblock (:2573-2579), first paragraph → "3-dot menu sheet: slides up from the bottom. Send to chats, Copy link, then Edit post on your own post or Report post on anyone else's. Delete lives in the post viewer." Keep the vaul paragraph.
   - Props (:2586-2592) gain `isOwner: boolean; initialContent: string; hasMedia: boolean; onEdited: (p: EditedPost) => void;`.
   - State next to `shareOpen` (:2598): `const [editOpen, setEditOpen] = useState(false);`.
   - Rows (:2721-2726): the Report row becomes `{isOwner ? <ActionSheetRow label="Edit post" onClick={() => setEditOpen(true)} /> : <ActionSheetRow label="Report post" tone="danger" onClick={() => void report("other")} disabled={reporting} />}`.
     - Row order: Send to chats, Copy link, Edit post or Report post, Cancel.
     - Owners stop seeing Report on their own post, matching `PostViewerMobile`'s owner menu and desktop `FeedRow`.
   - After the `{shareOpen ? … : null}` block (:2736-2753), still inside `Drawer.Root`:
     ```tsx
     {editOpen ? (
       <EditPostSheet
         nested
         postId={postId}
         initialContent={initialContent}
         hasMedia={hasMedia}
         onClose={() => setEditOpen(false)}
         onSaved={(p) => { onEdited(p); onClose(); }}
       />
     ) : null}
     ```
     - `nested` for the same reason the SharePostSheet comment gives (:2738-2739).
     - EditPostSheet itself toasts "Post updated" and calls its own `onClose`. `onClose()` here is FeedCard's `setMenuOpen(false)`, so both sheets close in the same tick.
     - A failed save keeps the edit sheet open with the draft (E2).
   - HAZARD: inside this function, `toast` is a local `useState<string | null>` (:2594) that shadows the imported `toast` (:25). Add no `toast({…})` call here; EditPostSheet does its own toasting.
   - Portal bubbling: `FeedCard` is a `<button onClick={handleCardClick}>` (:973-976), and React bubbles through portals. `ActionSheetRow` already stops propagation (:2775-2776), and E2's `Drawer.Content` stops click and pointerdown. CM adds nothing on the card for this, and must not remove either guard.

**Acceptance**

Static (run in the repo):
- `npx tsc --noEmit` exits 0. This also proves `ProfileMobile.tsx` still compiles against the unchanged `CampusSearchOverlay` export.
- `npx eslint src/components/mobile/CampusMobile.tsx` → at most 4 problems. The baseline at `f23bc5d` is 4, all react-hooks/set-state-in-effect (:117, :193, :271, :2943).
- `rg -n "Pull to refresh later|No orgs here yet|All orgs|Once orgs spin up|viewer_follows" src/components/mobile/CampusMobile.tsx` → 0.
- `rg -n "[^_]follow_state" src/components/mobile/CampusMobile.tsx` → 0. Only `org_follow_state` appears.
- `rg -n "filter=mine" src/components/mobile/CampusMobile.tsx` → exactly 1 hit, inside `ChatPane`.
- `rg -n "orgAssetProxyUrl" src/components/mobile/CampusMobile.tsx` → exactly 2 (the import and the invite row).
- `rg -n 'from "@/lib/orgs/(membership|following)"|from "@/lib/onboarding|from "@/app/api' src/components/mobile/CampusMobile.tsx` → 0.
- `rg -n "<CampusConfirmBanner|<EditPostSheet|<OrgJoinControl" src/components/mobile/CampusMobile.tsx` → 1, 1, 1.
- `git diff -U0 f23bc5d -- src/components/mobile/CampusMobile.tsx | grep '^@@'`: no hunk's old-side range falls inside :1503-2300, the region covering `ChatPane`, `JoinedOrg`, `OrgChannelsDrawer` and `DarkChannelRow`.
- A reviewer diffs `orgRelationFor` against B12S's `relationFor`, and the empty/footer sentences against `ONB_COPY.clubs.sparse` / `sparseNoCampus`, character by character.

Live, production, read-only. Use the signed-in gstack browser as Franky (live verification recipe): `browse viewport 375x812` BEFORE `goto`.
- **Setup.** Open `/profile`, then run `browse js` to install, before anything is tapped:
  - (a) A non-GET blocker. It wraps `window.fetch`, records `[method, url, body]` in `window.__nonGet`, and answers each non-GET with the synthetic response named in the step (default 418 `{ok:false,error:"blocked",code:"blocked"}`). Nothing non-GET reaches the network.
  - (b) GET overrides for the step: exact-URL matches that return a JSON `Response`. Every other GET passes through.
  - Then click the tab bar's `a[href="/campus"]`. That client-side navigation keeps the wrapper while `CampusMobile` mounts and runs its loads.
  - Navigate with a full `goto` afterwards to drop the wrappers.
  - Franky's account is at Indianapolis with an unconfirmed campus (read-only SQL, `campus_set_at` null), so the confirm banner shows in these screenshots.
- **Real data, no GET overrides.**
  - Orgs tab: the network log shows exactly one GET each of `/api/orgs?filter=discover`, `/api/orgs?filter=following` and `/api/me/org-invites`.
  - SAE sits under "FOLLOWING" with "Joined ✓", "@sae · Invite only · 1 member", no chip and no disclosure. No "VERIFIED" copy of SAE.
  - The footer reads "Clubs are just getting started at Indianapolis. Follow the ones you like — posts land in your feed."
  - `window.__nonGet.length === 0`.
  - `document.querySelectorAll('#otto-mobile-tour-feed > section')[2].querySelectorAll('a button, a a, button a, button button').length === 0`.
  - The Chat tab screenshot matches the one taken before the diff.
- **Overridden lists.**
  - Build the rows from the real SAE discover row plus synthetic ids:
    - R1: SAE, non-member (`role:null`, `join_state:"invite_only"`, `org_follow_state:"not_following"`, `member_count:1`)
    - R2: open, not followed (`join_policy:"open"`, `join_state:"can_join"`, name "Indianapolis Photography and Film Society")
    - R3: request, followed (`join_policy:"request"`, `join_state:"can_request"`, `join_reason:"policy"`, `org_follow_state:"following"`)
    - R4: invited (`join_state:"invited"`, a `pending_invite`), id X
    - R2–R4 have `verified:false`
  - Responses: discover `{ok:true, orgs:[R1,R2,R3,R4], viewerCampusId:"indianapolis"}`; following `{ok:true, orgs:[R3], has_more:false}`; invites `{ok:true, invites:[{id:"inv-1", created_at, expires_at:<now+10d>, org:{id:X, handle:"test-club", name:"Test Club", logo_url:"orgs/x/logo.png", verified:false, audience:"both"}, invited_by:{name:"Franky"}}]}`.
  - Sections in order:
    - "YOU'RE INVITED": Test Club, chip "Invited you", "@test-club · Invited by Franky · Expires {Mon D}", slot "Accept". The logo background is `/api/orgs/test-club/asset/logo`.
    - "FOLLOWING": R3, chip "Following", slot "Request", and NO disclosure (F5a: the line shows only when a Follow or Following ✓ control renders).
    - "VERIFIED": R1, "@sae · Invite only · 1 member", slot "Follow", "Officers can see who follows this club."
    - "ALL CLUBS": R2, with "Follow" and "Join" on a full-width line under the text. The name span is wider than 150px, and neither pill sits beside the name.
    - Club X renders exactly once. No footer (4 rows).
  - **Follow R1.** Make the overrides stateful: a synthetic POST `/api/orgs/sae/follow` → 200 `{ok:true, org_follow_state:"following", already:false, follower_count:null}` flips R1's `org_follow_state` in later discover answers.
    - `__nonGet` holds exactly one entry, `["POST", "/api/orgs/sae/follow", "{\"source\":\"discover\"}"]`.
    - The button reads "…" with `aria-busy="true"` until the answer, then "Following ✓".
    - The network log then shows one more GET of each of the three list URLs.
    - R1 still reads "Following ✓" after they answer.
  - **Join R2.** A synthetic POST `/api/orgs/<R2 handle>/join` → 200 `{ok:true, joined:true, role:"member"}`.
    - R2 shows "Joined ✓".
    - Exactly one more GET `/api/orgs?filter=mine` appears (ChatPane remounted).
    - The Chat pane still renders.
  - **Accept X.** A synthetic join 200 `{ok:true, joined:true, role:"member"}` → the invite row shows "Joined ✓", then the three lists reload.
  - **Following fails.** The following override returns 500 `{ok:false,error:"Failed to load orgs",code:"load_failed"}`.
    - "Couldn't load the clubs you follow." with Retry, and no "FOLLOWING" header.
    - "YOU'RE INVITED", "VERIFIED" and "ALL CLUBS" still render, and R3 now shows under "ALL CLUBS" with "Request" + chip "Following".
    - Retry sends the three GETs again.
  - **Empty.** All three lists return empty (`viewerCampusId:"indianapolis"`) → "No clubs here yet" + "Clubs are just getting started at Indianapolis. Follow the ones you like — posts land in your feed." With `viewerCampusId:null`, the body reads "Clubs are just getting started here. Follow the ones you like — posts land in your feed."
  - **All three fail** (500) → one LoadFailed "Couldn't load orgs." with Retry, and no "No clubs here yet".
- **Search, real data.** In the overlay, `sae` → "@sae · Invite only". No hidden test club appears for `club` (H1).
- **Confirm banner (B14 item 2).**
  - Real data (Franky, unconfirmed): "Confirm your campus" / "Is Indianapolis still right?" with "Yes", "Change" and "Not now". It sits directly above the tab strip on Feed and Orgs, and its card doesn't touch the screen edges.
  - "Yes" with the blocker (synthetic 200 `{ok:true}`): `__nonGet` holds exactly one PATCH `/api/me/profile` with body `{"campus_id":"indianapolis"}`, and the banner hides.
  - "Not now": `sessionStorage.vibe_campus_confirm_dismissed === "1"`, and the banner stays hidden after a client-side tab switch.
  - The overrides below apply to `/api/me/onboarding-state` only:
    - `campus_id:null` → "Pick your campus" / "Your campus decides the clubs, events and map you see."
    - `campus_confirmed:true` → no banner, and `document.getElementById("otto-mobile-tour-tabs").previousElementSibling` is the Otto strip wrapper, as at HEAD
    - 500 → no banner
  - The tour's feed bubble still resolves the campus name (B14t).
- **Events empty line (B14 item 3).** Override `/api/events?limit=50` → `{ok:true, events:[]}` → "Nothing scheduled" + "When orgs or classmates create events, they'll surface here."
- **Feed Edit (E3).** Real feed (Franky has 10 published posts, 4 with media; read-only SQL, ids shown as `left(id::text,8)`), blocker installed:
  - Your own card's ⋯ lists exactly "Send to chats", "Copy link", "Edit post", "Cancel". Another author's card lists "Send to chats", "Copy link", "Report post", "Cancel".
  - "Edit post" opens the "Edit post" sheet above "Post options". While you type and tap inside the textarea:
    - no post viewer opens
    - no `/api/posts/<id>/like` entry lands in `__nonGet`
  - Synthetic PATCH `/api/posts/<id>` → 200 `{ok:true, post:{id, content:"cm check #cmcheck", tags:["cmcheck"], edited_at:<now ISO>}}`:
    - both sheets close and "Post updated" toasts
    - the card shows "cm check" and a "#cmcheck" chip, and its sub-line contains " · Edited"
    - no new GET `/api/feed?limit=50` follows
    - `__nonGet` holds exactly one PATCH whose body is `{"content":"cm check #cmcheck"}` (no `tags`, no `status`)
    - `getComputedStyle(document.body).pointerEvents !== "none"`, and `window.scrollBy(0, 400)` moves the feed (vaul released its lock)
  - Synthetic PATCH → 403 `{ok:false,error:"Terms",code:"terms_required"}` → toast "Accept the Terms first, then try again.". The edit sheet stays open with the draft, and the card is unchanged.
  - An image post's sheet shows "You can change the words. The photo or video stays.".
  - With a #tag filter on (tap a card chip), a synthetic 200 edit triggers exactly one extra GET `/api/feed?limit=50&tag=<tag>`.
  - Viewer path: tap your own card, then ⋯ → "Edit post" in the viewer → synthetic 200 → close the viewer. The card underneath shows the new text and " · Edited" with no feed refetch.
  - A `/api/feed?limit=50` override setting `edited_at` on one post → that card's sub-line shows " · Edited" (0 live posts are edited today).
- **Franky's phone test** (iOS Safari, after deploy, by hand; the only real writes):
  - the Orgs rows fit at his width
  - Edit from a feed card: Save closes both sheets with no scroll jump, the textarea doesn't zoom, and the edit shows " · Edited"
  - "Yes" on the banner confirms his campus

**Do not touch:** every file except `CampusMobile.tsx`, in particular:
- `CampusConfirmBanner.tsx`, `EditPostSheet.tsx`, `PostViewerMobile.tsx` (B14t/E2; defects go to the orchestrator)
- `src/components/orgs/*`, `src/lib/orgs/join-copy.ts`, `join-state.ts` (F5a / nobody)
- `campus-home.tsx` (CH2 owns it in W4)
- `ProfileMobile.tsx` (PM, same wave)
- `src/lib/onboarding/*` and `src/components/mobile/onboarding/*` (B12/B12S)
- every API route

Inside `CampusMobile.tsx`, leave `ChatPane`'s body, `JoinedOrg`, `OrgChannelsDrawer`, `DarkChannelRow`, the `CampusBanner` line, `CampusSearchOverlay`'s export and body (only `SearchOrg` and `SearchOrgRow` change), `ComposerFab`, `MapPane` and `TabStrip` alone.

---
