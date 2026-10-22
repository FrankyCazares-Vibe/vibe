## Club tools screens: how they could open in a club-page panel

All paths below are under `/Users/franciscocazares/vibe/.claude/worktrees/club-page-in-shell-0b76e3/src/`. Shorthand: `T` = `app/orgs/[handle]/tools/`, `C` = `components/orgs/tools/`, `CP` = `app/orgs/[handle]/club-page/`.

**Main finding:** every tools screen except the index and Setup fetches its own data on the client from existing officer-only API routes. The only server data they need is `club: ToolsClub` (`C/types.ts:10-24`). Of its fields, the screens only read `handle, name, verified, hidden, joinPolicy, audience, role, viewerId`. `id`, `logoUrl` and `ownerId` are never read. The club page already has every needed field: `org.*`, `officerRole` (`app/orgs/[handle]/page.tsx:488`) and `user.id`.

### Shared server gate (all `T/*` pages)
`loadOfficerClub` (`T/load-officer-club.ts:32-79`):
- runs `enforceCampusAccess`, then reads the club with the service client, then the viewer's role;
- `notFound()` for a hidden club or one that doesn't exist; `redirect` to the club page for anyone who isn't the owner or an officer (61-63);
- builds `ToolsClub` (65-77).

The club page only mounts the launcher for `framed && officerRole` (`page.tsx:688-700`), so a panel host is already gated the same way.

### Per screen

**1. Index: `T/page.tsx` → `ToolsIndex` (`C/ToolsIndex.tsx:44`)**
- Props: `{ club: ToolsClub; counts: ToolsCounts; clubUrl: string }`.
- `counts = {requests, members, followers, officers}`, all read on the server in `loadCounts` (`T/page.tsx:51-62`, block-filtered requests via `loadOfficerCounts`). `clubUrl` comes from `getSiteUrl()` (70).
- Does no fetching of its own.
- What a client host needs:
  - The club page's `toolsCounts` (`page.tsx:509-513`) already has requests, members and followers.
  - `officers` is missing. Either add it to the page, or count `role in owner/admin` from `GET /api/orgs/[slug]/members`.
  - `clubUrl` can be `window.location.origin + /orgs/<h>`, as `CP/share-page.ts:16-23` already does.
- Chrome: `ToolsHeader backHref=clubPath backLabel=club.name` at line 68 (it renders its own header, not the page).
- Links (all go through `NavRow href`, which is a `<Link>` at `C/tools-ui.tsx:104-107`):

| Line | Row | Target |
|---|---|---|
| 84 | Members' link | `/orgs/<h>/setup#members-link` |
| 93 | Join requests | `tools/requests` |
| 97 | Members | `tools/members` |
| 98 | Followers | `tools/followers` |
| 99 | Officers and titles | `tools/officers` |
| 103 | Edit the page | `/orgs/<h>?edit=1` |
| 104 | Past events | `/orgs/<h>?tab=events` |
| 108 | Club settings | `tools/settings` |

`NavRow` already supports `onClick` instead of `href` (tools-ui 71-115), so swapping rows to callbacks is easy.
- Dialogs: `OrgInviteSheet` (117-125). It picks sheet or modal with `window.matchMedia("(max-width: 720px)")` (81), so on desktop it opens as the modal.

**2. Requests: `T/requests/page.tsx:28-38` → `RequestsScreen` (`C/RequestsScreen.tsx:24`)**
- Props: `{ club }`.
- Fetches `GET /api/orgs/[slug]/requests` (30-51); approves or denies with `POST …/requests/[id]` (66).
- No navigation, no router, no sheets.
- Chrome (on the page): `ToolsHeader backHref=tools backLabel="Club tools" title="Join requests." club sub` (30-36).

**3. Members (`T/members/page.tsx:27-32`) and Officers (`T/officers/page.tsx:28-32`) → `MembersScreen` (`C/MembersScreen.tsx:34`)**
- Props: `{ club; mode: "members" | "officers" }`.
- Fetches `GET /api/orgs/[slug]/members` (43-64). Changes: `PATCH …/members/[userId]` for role (80) and title (110), `DELETE` to remove (96). All update in place, no navigation.
- Sheets: `ToolSheet` (190-213) and `PickOfficerSheet` (214-216, `C/MemberSheets.tsx:146-188`). Rows open sheets, not links (`C/MemberList.tsx:46-58`).
- Chrome: `ToolsHeader` on each page.

**4. Followers: `T/followers/page.tsx:28-31` → `FollowersScreen` (`C/FollowersScreen.tsx:149`)**
- Props: `{ club }`.
- Fetches:
  - `GET /api/orgs/[slug]/followers?limit=` (199) and `&cursor=` for Load more (226);
  - `DELETE …/followers/[id]` (266);
  - `POST …/invites` (295), `DELETE …/invites/[id]` (359);
  - `POST …/requests/[id]` approve (386).
- No navigation.
- Dialogs: `ConfirmSheet` (598-607) and `OrgInviteSheet` (609-626, matchMedia at 565). Closing the invite sheet re-reads the list.

**5. Settings: `T/settings/page.tsx:28-32` → `SettingsScreen` (`C/SettingsScreen.tsx:37`)**
- Props: `{ club }`.
- Fetches `GET/PATCH /api/orgs/[slug]` for the Board switch (57, 73; `clubUrl()` in `components/desktop/messages/rooms-dialog-rules.ts:365`). Leave is `DELETE /api/orgs/[slug]/join` (171); delete is `DELETE /api/orgs/[slug]` (230).
- Navigation:
  - **`useRouter` + `router.replace('/orgs/<h>')` after leaving (163, 192).**
  - **`router.replace('/campus?tab=orgs')` after deleting (221, 242).**
- Dialogs: `ConfirmSheet` (206-213); the delete `ToolSheet` (270-290).
- Uses a fixed DOM id, `board-followers-label` (108, 115).

**6. Setup: `app/orgs/[handle]/setup/page.tsx` → `SetupScreen` (`setup/SetupScreen.tsx:56-64`)**
- Props: `{ club: SetupClub; role: "owner" | "admin"; setup: SetupView | null }`.
  - `SetupClub` (33-44) is `id, handle, name, verified, hidden, joinPolicy, audience, hasLogo, hasBanner`, all from the server org read (`page.tsx:58-104`).
  - `setup` comes from `loadClubSetup` (87-92).
- **It depends on the server for the list.** Every change ends in `router.refresh()` (65-66, passed as `onChanged`), which re-runs the server page.
- Client options:
  - `GET /api/orgs/[slug]/setup` already exists (`app/api/orgs/[slug]/setup/route.ts:52-62`) and returns `{ setup: {steps, done, total, complete} | null }`.
  - The club page also loads `setup` for officers (`page.tsx:362-371`). So a host that takes `setup` and the `SetupClub` fields as page props would be refreshed by `router.refresh()` as it is today.
- Child components:
  - `SetupList` (`setup/SetupList.tsx`) opens `UploadAssetModal` (170-179) and `CreateEventModal` (181-190), and adds `body.vibe-composer-open` (78-82).
  - `StepPanels.tsx` saves with PATCH `/api/orgs/[slug]` (53, 129), `POST …/setup` marks (38-40), `GET …/members` (243), `PATCH …/members/[id]` (256), and opens an `OrgInviteSheet` (350-358).
  - `MembersLinkPanel` (`components/orgs/MembersLinkPanel.tsx:80-89`, props `{handle, clubName, onChange?}`) fetches its own `GET/POST /api/orgs/[slug]/members-link` (90-118). It is the only part that can be hosted with no server data.

### Page chrome to hide with an `embedded` prop
- **`ToolsPage`** (`T/frame.tsx:17-26`): `ClubAppFrame`, then `<main className="vibe-tabbar-page" style={pageStyle}>` (100dvh, cream), then a `columnStyle` div (max 480, safe-area top padding), then `<MobileTabBar/>`. A panel shouldn't use it at all; the host renders the screen components directly.
- **`ToolsHeader`** (`C/tools-ui.tsx:23-58`): the "‹ Club tools" / "‹ <club>" back `<Link>` (38-43) and the club-name `<Link>` (47-51). It is rendered by every sub-page and by ToolsIndex itself (68). It needs `onBack` / `embedded` (or the host supplies its own header), and ToolsIndex needs a prop to drop or replace its header.
- **SetupScreen** wraps itself in `columnStyle` (83) and has its own eyebrow and h1 (84-87, 112). Its two links, "Open <club>" (100) and "Open the club page" (118-122), mean "close the panel" when embedded.

### Navigation a panel host must intercept
- **ToolsIndex `NavRow`s** (84, 93, 97, 98, 99, 103, 104, 108): switch panel content. `?edit=1` and `?tab=events` mean close the panel, then act on the page.
  - **Watch out:** `EditPageButton` reads `?edit=1` only once per mount, through the `tookEditParam` ref (`CP/OfficerActions.tsx:57-67`). A second `?edit=1` on the same page will not reopen Edit page, so a direct opener callback is needed.
  - `?tab=events` is read by `useSearchParams` in `app/orgs/[handle]/OrgContent.tsx:49-50`.
- **`ToolsHeader`** back and club links (tools-ui 38, 48).
- **SettingsScreen** `router.replace` after leave (192) and delete (242). Leave goes to the same pathname, so the Arc stays "open" (`CP/ClubToolsLauncher.tsx:86-87`). It only disappears because the re-rendered page stops mounting the launcher. Better: an `onLeft` / `onDeleted` callback.
- **SetupScreen**: `router.refresh()` (66) and the two Links (100, 119).
- **`LoadFailed`** with an `action` runs `window.location.assign(action.href)` (`components/feedback/LoadFailed.tsx:115-117`). This is the sign-in case; leaving it alone is fine.
- **Arc entry links that open whole pages today**, all through `ArcPageLink` (`CP/ClubToolsLauncherParts.tsx:208-212`, which calls `onLeave`):
  - `CP/ClubToolsLauncherCards.tsx`: 112 (members), 131 (officers), 146 (`?tab=events`), 173 (settings), 197 (tools index), and the Members' link `<Link>` at 222-226;
  - `CP/ClubToolsLauncherRequests.tsx:162-165`;
  - `CP/ClubToolsLauncherFollowers.tsx:299`.

  These are the natural places to say "open in panel".
- **Other club-page entry points**:
  - `CP/OfficerActions.tsx:212-221` (Club tools button, which already opens the launcher);
  - `CP/ToolsCard.tsx:21, 54-59` (only shown outside the frame);
  - `FinishSetupLine` at `page.tsx:611-612, 779-782`.
- **The launcher's own refresh**: `close()` calls `router.refresh()` only if `changed` was marked (`CP/ClubToolsLauncher.tsx:127-146`). Hosted screens should call `onChanged` after mutations so the counts catch up.

### Sheets and dialogs: z-index and portals

| Dialog | Where | Portals to body? | z-index |
|---|---|---|---|
| `ToolSheet` / `ConfirmSheet` (vaul) | `C/tools-ui.tsx:233-257, 292-312`; used by Members, Officers, Followers, Settings | Yes, `Drawer.Portal` | overlay 10000 (462), content 10001 (477) |
| `OrgInviteSheet` | `components/orgs/OrgInviteSheet.tsx` | Yes; sheet via `Drawer.Portal` (875), modal via `createPortal` (947) | 10000 / 10001 (1229, 1242, 1264) |
| Toasts | n/a | n/a | 12000 |
| `UploadAssetModal` (Setup photo step) | `app/orgs/[handle]/admin-actions.tsx` `ModalShell` (774-795) | Yes | **1000** |
| `CreateEventModal` (Setup first-event step) | `app/campus/campus-home.tsx:12388-12400` | Yes | **1000** |
| Arc root | `CP/ClubToolsLauncherArc.tsx:139` | n/a | 1000 |

- The vaul and invite sheets sit above a panel at 1000-1100 with no changes.
- **`UploadAssetModal` and `CreateEventModal` would sit under a panel above 1000.** Raise them or give them a z-index override.
- Radix and vaul sheets set no `aria-modal`, but their Escape handler runs first on document and calls `preventDefault`, so the Arc's Escape handler (`CP/ClubToolsLauncherArc.tsx:92-105`) skips correctly. The `OrgInviteSheet` modal does set `aria-modal="true"`, so the Arc's "top dialog" check works for it too.
- **Theme mismatch:** the Arc root is `vibe-night-island` (138). Tools screens use theme tokens, so inside it they render Night, while the sheets they open portal to body and follow the page theme.
- React events bubble out of portals to React ancestors (`ModalShell` calls `stopPropagation` for this reason, admin-actions ~778). A panel host must not put a close-on-click handler on an ancestor of the screen. Tab presses inside portaled modals also reach the Arc's `keepTabInside` (107-123), which is harmless as written.

### Places that assume a full page
- `SetupScreen` reads `window.location.hash` through `useSyncExternalStore` and `hashchange` (49-54, 69-73), then calls `scrollIntoView` on `#members-link` (75-78). Embedded, it would read the club page's hash. Replace this with an `initialStep` prop.
- Fixed DOM ids: `members-link` (`MembersLinkPanel.tsx:153`) and `board-followers-label` (`SettingsScreen.tsx:108`). They are fine while only one instance is mounted.
- `ToolsPage`'s 100dvh `pageStyle` and safe-area padding (`components/orgs/club-tool-styles.ts:12-25`). Don't use them in a panel.
- `useRouter`: only SettingsScreen (163, 221) and SetupScreen (65). Nothing else uses `useSearchParams` or window scroll. `MembersLinkPanel` uses `window.confirm` (264), which is fine.
- The launcher is desktop and app-frame only, and closes under 900px (`CP/club-tools-launcher.ts:12`; `CP/ClubToolsLauncher.tsx:164-172`). Phones keep the routes, so the pages must stay as they are.

### Smallest change set I'd recommend
1. **Panel content in the Arc.** Add a panel state `screen: "index" | "requests" | "members" | "officers" | "followers" | "settings" | "setup"` inside the launcher, rendered where the card column is (`CP/ClubToolsLauncherArc.tsx:192-224`) or as a wider panel. Build `ToolsClub` once from the launcher props, adding `role: officerRole` and a non-null `viewerId`. Pass `onChanged` through.
2. **`ToolsHeader`**: add an optional `onBack?: () => void`. When set, the back control is a button, and the club-name link is dropped or becomes a close.
3. **`ToolsIndex`**: add an optional `onOpen?: (screen, opts?) => void`. When set, `NavRow` gets `onClick` instead of `href`, and the Edit page / Past events rows call host callbacks that close the panel, then open Edit page directly or set `?tab=events`. Have `counts.officers` come from the page or from the roster.
4. **`SettingsScreen`**: add optional `onLeft` / `onDeleted`. The defaults stay the current `router.replace`; the host closes the panel and runs `router.refresh()`.
5. **`SetupScreen`**: add `embedded?`, `initialStep?` (instead of the hash) and `onClose?` (for the two club links). Keep `router.refresh()` and pass `setup` plus the `SetupClub` fields from `page.tsx`, which already loads `setup` at 362-371; or re-read `GET /api/orgs/[slug]/setup` in place of `router.refresh()`. Raise `UploadAssetModal` / `CreateEventModal` above the panel's z-index (simplest: panel at ≤1000, or add a `zIndex` prop to `ModalShell`).
6. **Leave alone**: `RequestsScreen`, `MembersScreen`, `FollowersScreen`, `MemberSheets`, `MembersLinkPanel`. They already fetch for themselves and their sheets portal at 10000+.
7. **Arc links**: point the `ArcPageLink` / `onLeave` uses above at "open in panel" instead of navigating.