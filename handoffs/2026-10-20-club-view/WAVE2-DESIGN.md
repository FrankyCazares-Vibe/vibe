# Wave 2 design: officers run it from the phone (Oct 21, 2026)

The build notes for wave 2. Decisions are in `DECISIONS.md`, the order in `BUILD-ORDER.md` (Wave 2 table), the
drawings in the board's `R2_Club_Phone`, `R2_Club_Desktop`, `R2_Switcher_Phone`, `R2_Profile_Phone` and
`B_Board_Tools` (renders in `shots/`). This file says how it is built, so the builders and the reviews check one
thing. Plain English first, the mechanics after.

## In plain English
- **The switch.** On the phone, hold the Profile tab, or tap your name on your own profile, and a sheet opens:
  "Switch to." with you first, then every club you are the owner or an officer of. Pick a club and the Profile tab
  becomes that club (its picture on the tab) and opens the club's page, until you switch back to you. Only this
  phone remembers the choice; signing out forgets it. A dot on the tab says one of your clubs has join requests.
  On a computer, "Clubs you run" sits in the left menu above Admin (Admin stays founders-only), one line per club.
- **The club page, Instagram-style.** The cover on top, the club's picture over its edge with two big counts
  (followers, members), the name, @handle, the bio, one link, two small chips (who can join, when it meets) and
  "More about us" (every link, philanthropy, the club's facts, Report this club). Then the buttons: officers get
  Edit page and Share page, everyone else gets Join or Follow and Share page. Officers also get + (post) and Club
  tools on the cover, the "needs you" line ("2 want to join · +6 followers this week") and wave 1's "Finish setting
  up · n of 6". The next event is pinned above the tabs as "Up next". Tabs: Posts (first), Events, Board.
- **Exact counts for officers.** Officers see the real follower and member numbers even under 5. Members still
  see their exact member count, as before; everyone else sees each count only from 5 up.
- **When it meets.** A new short line a club writes itself ("Thursdays · 7 PM, the Lantern Room"), up to 60
  characters, shown on the club page to everyone. It is the one new thing the page shows, so the Privacy Policy's
  "Club pages" line gains "when it meets".
- **Club tools on the phone.** A page per tool, phone first, theme colours: Join requests (approve, deny), Members
  (titles, make officer or member, remove), Officers and titles, Followers (remove a follower), Club settings
  (followers read the Board, leave or delete the club). The desktop window stays as it is.

## Ownership (one file, one builder)
| Batch | Owns |
|---|---|
| **S · the switch** | `src/lib/orgs/club-switch.ts` (+ `.test.ts`), `src/components/orgs/ClubSwitcherSheet.tsx`, `src/components/orgs/ClubsYouRunNav.tsx`, `src/app/api/me/clubs-you-run/route.ts`, `src/components/mobile/MobileTabBar.tsx`, `src/components/mobile/mobile-tab-active.ts` (+ test), `src/components/LeftNav.tsx` (one import, one mount), `src/components/mobile/ProfileMobile.tsx` (the name tap only), `src/components/profile/clubs-model.ts` (keep `role`), `src/lib/pwa/leave-device-clean.ts` (+ test), `src/lib/hooks/use-long-press.ts` |
| **P1 · the club page** | `src/app/orgs/[handle]/page.tsx`, `OrgContent.tsx`, `OrgEventsSection.tsx`, `src/app/globals.css` (club page rules + the night island), new `src/app/orgs/[handle]/club-page/` files except P2's |
| **P2 · officer actions** | `src/app/orgs/[handle]/admin-actions.tsx`, new `src/app/orgs/[handle]/club-page/OfficerActions.tsx`, `club-page/PlusSheet.tsx`, `club-page/share-page.ts` |
| **T · club tools** | `src/app/orgs/[handle]/tools/**`, `src/components/orgs/tools/**` |
| **D · data, API, policy** | `supabase/migrations/20261023100000_club_meeting_time.sql`, `scripts/sql/club-meeting-time-check.sql`, `src/lib/orgs/meeting-time.ts` (+ test), `src/lib/orgs/officer-counts.ts` (+ test), `src/app/api/orgs/[slug]/route.ts` (PATCH `meeting_time`), `src/app/legal/privacy/*.tsx`, `handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md`, `src/lib/legal/club-page-policy.test.ts` |

Code against the contracts below, not against another batch's file while it is being written.

## Contracts

### C1 · The remembered club (batch S; P reads it)
`src/lib/orgs/club-switch.ts`, safe to import from client files (every `window`/`localStorage` touch guarded,
every read and write in try/catch, a failure reads as "not switched"):
```ts
export const PROFILE_AS_CLUB_KEY = "vibe.profile-as-club.v1";   // localStorage, per account
export const PROFILE_AS_CLUB_EVENT = "vibe:profile-as-club";     // same-tab change event
export type SwitchedClub = { handle: string; name: string; logo_url: string | null };
export function readSwitchedClub(): SwitchedClub | null;          // validates the shape; junk → null
export function setSwitchedClub(club: SwitchedClub | null): void; // null removes the key; dispatches the event
export function useSwitchedClub(): SwitchedClub | null;           // useSyncExternalStore; server snapshot null;
                                                                   // listens to the event and to "storage"
```
The key joins `ACCOUNT_KEYS` in `src/lib/pwa/leave-device-clean.ts` (and its test), so signing out forgets it. The
Privacy Policy's section 7 ("Kept in your browser … some of your own information … cleared when you sign out")
already covers it; no policy line. Handles are compared lower-cased.

### C2 · Clubs you run (batch S)
`GET /api/me/clubs-you-run` → `200 {ok:true, clubs: ClubYouRun[]}`, `401 unauthorized`, `429`, `500 request_failed`.
```ts
export type ClubYouRun = {
  org_id: string; handle: string; name: string; logo_url: string | null; // logo through orgAssetProxyUrl
  role: "owner" | "admin";            // "admin" is shown as "Officer"
  title: string | null;               // storedClubTitle(org_members.title)
  requests: number | null;            // pending join requests; null when that read failed
};
```
Only the signed-in person's `org_members` rows with role owner/admin (service read filtered to their id), clubs
Vibe hid left out (`loadVisibleOrgCards`), owner rows first, then by name. Pending requests are one read of
`org_join_requests` (`status = 'pending'`, `org_id in (…)`, capped, counted in code). Rate limit
`me-clubs-run:<uid>`, 60 a minute. Export the type from the route's sibling `src/lib/orgs/club-switch.ts`
(type only) so the sheet, the tab bar and the desktop nav share it. A client cache (module memory + sessionStorage,
2 minutes, keyed by nothing but cleared on `setSwitchedClub`) keeps the tab bar from asking on every page.

### C3 · The switcher sheet (batch S; P mounts it)
```tsx
// src/components/orgs/ClubSwitcherSheet.tsx, "use client"
export function ClubSwitcherSheet(props: {
  open: boolean;
  onClose: () => void;
  /** The person's own row; when absent the row says "You" with a plain person glyph. */
  me?: { name: string; avatarUrl: string | null } | null;
}): JSX.Element | null;
```
A vaul `Drawer` built like `ClubOptionsSheet` (`src/components/profile/ClubsSection.tsx`), theme tokens. Title
"Switch to." (Fraunces 800), a close button. Row 1: you ("You", "Now" when not switched). Eyebrow "CLUBS YOU RUN",
then one row per club: `ClubLogo` 40px, name, "Owner" or "Officer" plus " · <title>" when set, and on the right
"Now" for the switched club, else "<n> to review" in `--tag-ink` when requests > 0. Loading: two quiet skeleton rows;
a failed read: one line and Retry; none: "When you're the owner or an officer of a club, you can switch to it here."
Footnote (`--ink-muted`, 12.5px): "Your Profile tab shows the club's page until you switch back. Chats and Board
posts still show your own name and title." Picking a club: `setSwitchedClub(...)`, close, `router.push('/orgs/<h>')`.
Picking you: `setSwitchedClub(null)`, close, `router.push('/profile')`. Every row ≥ 56px tall.

### C4 · The tab bar (batch S)
- Profile tab, switched: `href` `/orgs/<handle>`, the label stays "Profile", the icon is the club's `ClubLogo`
  (22px). Not switched: as today. Hydration: the server and first client render are "not switched".
- `activeMobileTab(pathname, switchedHandle?)`: `/orgs/<switchedHandle>` and its subpaths (setup, tools) light
  Profile; every other `/orgs/...` lights Campus as today. Keep the pure function tested.
- Hold the Profile tab 500 ms (primary pointer; cancel on > 10 px move, up, leave; `navigator.vibrate(8)` in try;
  `onContextMenu` preventDefault; `-webkit-touch-callout: none`; swallow the click that ends a hold) → the sheet.
  Lift the hold logic into `src/lib/hooks/use-long-press.ts`.
- The dot: when switched, the tab asks C2 (cached) and shows a small coral dot when any club has requests > 0.
  Not switched, the tab never asks.

### C5 · Desktop "Clubs you run" (batch S)
`src/components/orgs/ClubsYouRunNav.tsx` asks C2 once (same cache) and renders nothing until it has ≥ 1 club: an
eyebrow "Clubs you run" (same look as LeftNav's "Platform" eyebrow), then one `<Link href="/orgs/<h>">` per club
(ClubLogo 22px, name, coral dot when requests > 0, `aria-current` on that club's page). LeftNav mounts it just
above the Platform/Admin block, for everyone (it hides itself when empty).

### C6 · Your name on your profile (batch S)
`ProfileMobile.tsx`, owner view only (`!isVisitor && !editMode`): when `useMyClubs` lists a club with role owner or
admin, the name becomes a button (same h1 look) with a small chevron after it, `aria-haspopup="dialog"`,
`aria-label="Switch to one of your clubs"`; it opens C3 with `me` = the profile's name and photo. `clubs-model.ts`
keeps `role` on `MyMemberClub`. No change for anyone who runs no club.

C2's client side lives in `club-switch.ts` too: `useClubsYouRun(enabled: boolean): { status: "idle" | "loading" |
"ok" | "error"; clubs: ClubYouRun[]; retry(): void; refresh(): void }` (the sheet calls `refresh()` on open so its
counts are fresh; the tab bar and the desktop nav take the cache). Never `fetch` raw: use `vibeRequest`.

### C7 · Officer counts and the needs-you line (batch D; P reads it)
`src/lib/orgs/officer-counts.ts` (server only):
```ts
export type OfficerCounts = { pendingRequests: number | null; newFollowersThisWeek: number | null };
/** Two head-count reads with the service client; each null when its read failed. */
export async function loadOfficerCounts(service: SupabaseClient, orgId: string, nowMs: number): Promise<OfficerCounts>;
/** The header's number: exact for officers, else null below FOLLOWER_COUNT_FLOOR (5); null stays null. */
export function headerCount(raw: number | null, exact: boolean): number | null;
/** "2 want to join · +6 followers this week", or null when both are 0 or unknown. "1 wants to join". */
export function needsYouText(c: OfficerCounts): string | null;
```
"This week" = `org_followers.created_at` within the last 7 days. Pending = `org_join_requests.status = 'pending'`.

### C8 · When it meets (batch D; P and T use it)
- Column `public.orgs.meeting_time text not null default ''`, check `orgs_meeting_time_len` (`char_length <= 60`).
  No grant changes: `authenticated` already has table SELECT and no UPDATE on `orgs`; the route is the only writer.
- `src/lib/orgs/meeting-time.ts` (client-safe): `MEETING_TIME_MAX = 60`; `normalizeMeetingTime(raw: unknown):
  {ok:true; value:string} | {ok:false; code:"meeting_time_invalid"; message:string}` (string only; control
  characters out; whitespace collapsed to single spaces; trimmed; empty is allowed and clears it; at most 60 code
  points: message "Keep it to 60 characters.").
- PATCH `/api/orgs/[slug]` takes `meeting_time` (string). `normalizeMeetingTime`, then `checkChangedText(v,
  org.meeting_time)` → `contentBlockedResponse("meeting_time")`. The route's org read asks for the column; when the
  column is missing (`isMissingColumnError`) and the body carries `meeting_time`, answer 503
  `meeting_time_unavailable` "This isn't ready yet. Try again later."; a body without it must still work on a
  database without the column (read without it, as the Board setting does). Allowed on a hidden club (it is page
  text, like the description).
- The page reads it the same way: asked for, and on a missing column read again without it (shown as nothing).

### C9 · The club page layout (batch P)
One structure for phone and desktop; the page stays dark in Light and Night as today (its backdrop is the club's
own), so `<main>` gets `className="… vibe-night-island"`: in globals.css the Night token block's selector becomes
`:root[data-theme="dark"], .vibe-night-island`, so new UI uses theme tokens and still reads right on the dark page.
Top to bottom:
1. TopNav as today.
2. The cover (Banner as today). Officers (owner/admin, club not hidden): two round 40px buttons on its top right,
   `+` ("Post", opens the + sheet) and Club tools (a 3-line glyph, `aria-label="Club tools"`, a link to
   `/orgs/<h>/tools`).
3. The header: the logo overlapping the cover's lower edge; beside it the two counts as big numbers over small
   caps labels (FOLLOWERS, MEMBERS; a count that is null is left out). Then the name (h1), and for officers on a
   phone a chevron button after it that opens C3 (`aria-label="Switch account"`), and the ⋯ OrgMenu at the row's
   end as today. Then `@handle` with the Verified badge and the chips that exist today (audience, Hidden, Invited
   you, Dormant). The bio (description) as plain text. The first link only ("<label>", link glyph, opens in a new
   tab). A chip row: who can join (`policyChip`/`whoCanJoinFact` wording, e.g. "Open · anyone can join") and the
   meeting time when set. "More about us ›" (a button) opens a sheet on phones / a centred dialog on desktop with:
   every link, philanthropy, the facts (followers, members, who can join, open to, status, last activity) and
   "Report this club" (moved from the About column, same rules).
4. The buttons, one row, two halves: officers "Edit page" and "Share page"; everyone else the join control as
   today and "Share page". A hidden club's officers get Edit page only. Share page: `navigator.share({title, url})`
   when it exists, else copy the link and toast "Link copied." (url = origin + `/orgs/<handle>`).
5. Officers only: wave 1's "Finish setting up · n of 6" (unchanged), then the needs-you line (C7's text, a coral dot,
   a link to `/orgs/<h>/tools/requests` when requests > 0, else to `/orgs/<h>/tools/followers`); nothing when null.
6. The join-policy notice and the invite banner, as today.
7. Up next: the first upcoming event (the same `/api/events?org_id=` read the Events tab makes, shared through one
   client provider so it is fetched once), drawn with the existing `EventCard` under an "Up next" eyebrow. Nothing
   when there is no upcoming event (an officer sees a quiet "No event coming up. Post one with +." line).
8. The tabs, on phone and desktop: Posts | Events | Board, underline style, opening on Posts (Events when the
   address has `?event=`). Posts: today's posts list / empty / failed. Events: `OrgEventsSection` (its own
   "+ Create event" for officers stays) and `OrgPastEvents`. Board: `BoardSection` and `ChannelsSection`.
9. Desktop (≥ 900px) officers: a right column with a "Club tools" card (the same rows as the tools page's index,
   links). Everyone else on desktop: one centred column, no side column.

Addresses: `?tab=posts|events|board` picks the first tab (`?event=` still means Events); `?edit=1` opens Edit page
once for an officer and is then taken off the address (`router.replace`, no scroll).

**P2's exports, which P1 mounts** (`club-page/OfficerActions.tsx`, "use client"; P2 owns their look):
```tsx
type EditProps = { orgHandle: string; orgName: string; hidden: boolean; openToCampus: { name: string; shared: boolean } | null;
  joinPolicy: JoinPolicy; audience: OrgAudience; initialDescription: string; initialLinks: { label: string; url: string }[];
  initialPhilanthropy: string; initialMeetingTime: string; meetingTimeReady: boolean /* false: the column is missing, hide the field */ };
export function EditPageButton(props: EditProps): JSX.Element;           // half-width pill; reads ?edit=1 itself
export function SharePageButton(props: { orgHandle: string; orgName: string }): JSX.Element; // half-width pill
export function CoverOfficerButtons(props: { orgId: string; orgHandle: string; orgName: string; verified: boolean;
  viewerRole: "owner" | "admin"; boardId: string | null }): JSX.Element; // the + and Club tools round buttons
```
Both pills are 44px tall, `flex: 1`, the page's dark-glass look; the join control sits where Edit page would.

The + sheet (phone sheet / desktop small dialog): "Post to the page" (today's NewPostModal), "New event"
(CreateEventModal; for a club Vibe hasn't checked, the row is off with "Events need a checked club"), "Board post
or poll" (a link to `/messages?channel=<boardId>`; left out when there is no Board). Edit page = today's Edit
details dialog, renamed, with two pills at its top ("Change photo", "Change cover") that open the existing
UploadAssetModal, and a new "When you meet" field (C8, live count) between Description and Links. The officer bar
(`OrgProfileAdminBar`) goes away: Invite people and Members' link move to Club tools, Banner and Logo into Edit
page, New post into +. Nothing is removed. A `ClubSwitchSync` (client) on the page clears the remembered club when
this is it and the viewer is no longer an officer (`ctx.ok` only), and refreshes its name and logo when they are.

### C10 · Club tools pages (batch T)
Theme-token pages like the setup list (`club-tool-styles.ts`), `MobileTabBar` inside `<main className=
"vibe-tabbar-page">`, owner and officers only: a hidden club is a 404 to anyone outside it, a member or visitor is
redirected to the club page (the setup page's gate, `officerGate` + `SETTINGS_ROLES`). `enforceCampusAccess`.
- `/orgs/<h>/tools`: "Club tools." / "<club> · only officers see this". Bring people in: Share the club, Invite
  members (`OrgInviteSheet`, sheet below 720px; not on a hidden club), Members' link (checked clubs; a link to
  `/orgs/<h>/setup#members-link`). People: Join requests (count, coral dot), Members (count), Followers (exact
  count), Officers and titles (count). The club: Edit the page (back to the club page with `?edit=1`, which opens
  Edit page), Past events and who came (`/orgs/<h>?tab=events`), Club settings. Counts read on the server.
- `/tools/requests`: pending requests (GET/POST `/api/orgs/[slug]/requests…`): photo, name, @handle, their message,
  "Removed before", an ineligible reason; Approve (the screen's one coral button per row is too many: Approve is an
  outline pill with coral text, Deny a quiet pill); the row leaves on success; `vibeRequest` errors as toasts.
- `/tools/members`: the members list (GET `/members`), a filter box, each row name, @handle, role chip, title. Tap
  a row → an action sheet: Edit title (`normalizeClubTitle`, 32), Make officer / Make member (owner only, never the
  owner's own row), Remove from the club (owner: officers and members; an officer: members only; a confirm sheet,
  never `window.confirm`). The rules are the members route's (`mayTitleMember`-style helper in T's own files).
- `/tools/officers`: the owner and officers with titles; the owner gets "Add an officer" (pick a member) and, on each
  officer, Make member; anyone can edit titles they may edit.
- `/tools/followers` (may slip): the follower list (GET `/followers`, cursor), follows-since, Remove (confirm sheet;
  409 `member_follows` explained).
- `/tools/settings` (may slip): "Followers read the Board" switch (PATCH `followers_read_board`), Leave the club
  (officers who aren't the owner; DELETE `/join`, keep following), Delete the club (owner; the desktop Danger tab's
  confirmation, typed name).
The desktop `/campus?manage=<handle>` window stays as it is.

## Not in wave 2
The step rail on Up next, the share kit's link picture and table QR (wave 3), event covers, Insights, hand-over.
