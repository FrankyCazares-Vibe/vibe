# Wave 3 desktop Messages: as built

What the code in the worktree `chatdesk` (branch `chat-desktop`, on top of `e7869b9`) really is, wave by wave. Later waves code against THIS file where it differs from `contract.md`. Nothing here is committed, pushed or deployed; nothing touched production.

## Wave 1

Integrated Sat Oct 3, 2026. Five batches: W3-1-types, W3-1-switch, W3-1-pinsdb, W3-1-pure, W3-1-prep. No new screen is visible: `MessagesDesktop` is a stub that draws nothing, and `CHAT_DESKTOP_ENABLED` is unset everywhere.

### The gate (run in the worktree after all five batches)

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` | 1,900 tests, 1,900 pass, 0 fail (baseline 1,839; +61) |
| `npx eslint <every file of the wave>` | exit 0, no problem in any file (so nothing added to map 05's baselines) |
| `npm run build` | exit 0 (Next 16.3.4, Turbopack; `/messages` and `/campus` build as dynamic routes; `next/dynamic` with `ssr: false` inside the Client Component `MessagesSwitch` builds cleanly) |
| `scripts/sql/chat-message-pins-check.sql` on the LOCAL Docker stack | `chat-message-pins-check: all 43 cases passed`, then `ROLLBACK`; `schema_migrations` holds `20261004100000 | chat_message_pins`; the table is empty |

The integrator changed no code: every seam below was read on both sides and matched. Every changed file belongs to one of the five batches.

### Files of the wave (30: 15 changed, 15 new)

Changed (15): `.env.example`, `src/app/api/me/features/route.ts`, `src/app/api/me/threads/[id]/cards/_lib/rpc-refusal.ts`, `src/app/api/me/threads/[id]/messages/route.ts`, `src/app/messages/MessagesSwitch.tsx`, `src/app/messages/page.tsx`, `src/components/mobile/messages/home/MessagesHome.tsx`, `src/components/mobile/messages/home/MonthSheet.tsx`, `src/lib/auth/campus-access.ts`, `src/lib/chat/cards/rpc-refusal.test.ts`, `src/lib/chat/flag.test.ts`, `src/lib/chat/flag.ts`, `src/lib/chat/room-rules.test.ts`, `src/lib/chat/room-rules.ts`, `src/lib/chat/types.ts`.

New (15 files; `git status` shows them as 9 untracked paths): `scripts/sql/chat-message-pins-check.sql`, `supabase/migrations/20261004100000_chat_message_pins.sql`, `src/lib/chat/pin-rules.ts`, `src/lib/chat/pin-rules.test.ts`, `src/lib/chat/flag-desktop-server.ts`, `src/lib/use-client-ready.ts`, `src/components/mobile/messages/surface.ts`, `src/components/mobile/messages/home/MonthBody.tsx`, and under `src/components/desktop/messages/`: `contracts.ts`, `desktop-rules.ts`, `desktop-rules.test.ts`, `dm-bridge.ts`, `dm-bridge.test.ts`, `DesktopDialog.tsx`, `MessagesDesktop.tsx`.

`src/lib/chat/flag-server.ts` is unchanged (empty diff). The only importer of `flag-desktop-server` is `src/app/messages/page.tsx`. `grep -rn "Record<PostRefusalCode" src` finds exactly two tables, both with five rows.

### W3-1-types: shared types and room rules

Files: `src/lib/chat/types.ts`, `src/lib/chat/room-rules.ts`, `room-rules.test.ts`, `messages/route.ts` (one row), `cards/_lib/rpc-refusal.ts` (one row + comment), `cards/rpc-refusal.test.ts`, `src/components/mobile/messages/surface.ts`.

`src/lib/chat/types.ts`
```ts
export type PostPolicy = "everyone" | "officers" | "listed";
// Room gains:          post_policy?: PostPolicy            (optional, as pinned; absent = "everyone")
// ViewerInRoom gains:  post_line?: string
export type SpaceRoom = { id: string; kind: RoomKind; name: string; unread: boolean; can_post: boolean; event: EventRef | null; locked?: boolean; post_policy?: PostPolicy };
// SpaceResponse gains: board_recent?: ChatMessage[]
export type PostRefusalCode = "board_officers_only" | "board_post_missing" | "thread_root_not_allowed" | "room_closed" | "room_posters_only";
// RefusalCode gains "pin_limit" | "pin_not_allowed" | "pins_chats_only" | "room_posters_only" | "room_limit", each with its sentence in REFUSAL_SENTENCES (4.3's table, word for word)
export type FeaturesResponse = { ok: true; chat_v2: boolean; chat_desktop: boolean };
export type PinnedMessage = { message_id: string; pinned_at: string; created_at: string; text: string; full_text: string; author: Person | null; media_kind: "image" | "video" | null; has_post: boolean };
export type MessagePinsResponse = { ok: true; pins: PinnedMessage[]; cap: number };
export type PinMessageResponse = { ok: true; pinned: boolean; already?: true };
export type SharedItem = { message_id: string; created_at: string; user_id: string; media_url: string | null; media_kind: "image" | "video" | null; attachment: AttachmentRow | null };
export type SharedResponse = { ok: true; items: SharedItem[]; has_more: boolean };
```
`src/lib/chat/room-rules.ts`
```ts
export const EXTRA_ROOM_CAP = 5;
export const POST_POLICIES = Object.freeze(["everyone", "officers", "listed"] as const);
export function isPostPolicy(value: unknown): value is PostPolicy;
export function postRuleLine(policy: PostPolicy): string | null;   // "officers" -> "Only officers post here."  "listed" -> "Only officers and people they picked post here."  else null
// postRefusal(room, rootId, role): unchanged signature; new row before the last `room_closed`:
//   no root && room && kind === "room" && (room.post_policy ?? "everyone") !== "everyone"  ->  "room_posters_only"
```
Status tables (both five rows, `room_posters_only: 403`): `export const POST_REFUSAL_STATUS: Readonly<Record<PostRefusalCode, number>>` in `cards/_lib/rpc-refusal.ts`; `const POST_REFUSAL_STATUS: Record<PostRefusalCode, number>` (not exported) in `messages/route.ts`.

`src/components/mobile/messages/surface.ts` (`"use client"`)
```ts
export type ChatSurface = "phone" | "desktop";
export const ChatSurfaceContext = createContext<ChatSurface>("phone");
export function useChatSurface(): ChatSurface;
```

Deviations from the contract:
1. **`SpaceRoom.locked` and `SpaceRoom.post_policy` are OPTIONAL; 4c.3 pins them required.** With them required, three places that build a `SpaceRoom` fail the typecheck, and all three belong to wave 2 (`src/app/api/orgs/[slug]/space/route.ts:241`, `orderSpaceRooms`' final map at `src/lib/chat/reads.ts:218`, `sroom` at `src/lib/chat/reads.test.ts:164`). See "What wave 2 must do" below. This is the one open mismatch of the wave.
2. `POST_POLICIES` is wrapped in `Object.freeze` (same tuple type; the file's other lists are frozen too).
3. `postRuleLine` answers `null` for any value outside the three policies.
4. The new `postRefusal` row guards a null room (`room && ...`); same behaviour for every real room.

### W3-1-switch: the switch

Files: `src/lib/chat/flag.ts`, `flag.test.ts`, `flag-desktop-server.ts` (new), `src/app/api/me/features/route.ts`, `src/lib/auth/campus-access.ts`, `src/app/messages/page.tsx`, `src/app/messages/MessagesSwitch.tsx`, `src/lib/use-client-ready.ts` (new), `src/components/desktop/messages/MessagesDesktop.tsx` (new stub), `.env.example`.

```ts
// src/lib/chat/flag.ts (pure; the five chat_v2 exports are unchanged)
export function chatDesktopEnabled(env: NodeJS.ProcessEnv = process.env): boolean;
export function chatDesktopEveryone(env: NodeJS.ProcessEnv = process.env): boolean;
export function chatDesktopListedUser(userId: string, env: NodeJS.ProcessEnv = process.env): boolean;
export function chatDesktopAnswer(userId: string, chatV2On: boolean, env: NodeJS.ProcessEnv = process.env): boolean;

// src/lib/chat/flag-desktop-server.ts (import "server-only"; its only export)
export async function chatDesktopFor(userId: string): Promise<boolean>;

// src/lib/auth/campus-access.ts
export async function enforceCampusAccess(currentPath: string): Promise<{ userId: string }>;

// src/lib/use-client-ready.ts ("use client")
export function useClientReady(): boolean;   // false on the server and during hydration, true after

// src/components/desktop/messages/MessagesDesktop.tsx ("use client"; STUB, returns null)
export function MessagesDesktop(_props: { initialHandle?: string; initialChannelId?: string }): null;

// src/app/messages/MessagesSwitch.tsx
export function MessagesSwitch(props: { initialHandle?: string; initialChannelId?: string; desktopChat?: boolean }): JSX.Element;   // desktopChat defaults to false

// src/app/messages/page.tsx
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ to?: string | string[]; channel?: string | string[]; tab?: string | string[] }> });

// src/app/api/me/features/route.ts
export async function GET(): 200 { ok: true, chat_v2, chat_desktop } | 401 { ok: false, error: "Unauthorized" }   // both `Cache-Control: private, no-store`
```
How it behaves:
- `page.tsx` awaits `searchParams` BEFORE the gate, builds `path` = `/messages` plus the first value of `to`, `channel`, `tab` (in that order, only when non-empty, raw, encoded by `URLSearchParams`), then `const { userId } = await enforceCampusAccess(path)` and `const desktopChat = await chatDesktopFor(userId)`.
- `MessagesSwitch`: `desktopChat && !ready` -> `CampusAppShell` around an empty cream stage; `isMobile` -> the phone branch as today; `desktopChat` -> `CampusAppShell` around `MessagesDesktop` (loaded with `next/dynamic`, `ssr: false`, by the NAMED export `MessagesDesktop`); else today's iframe, lines untouched.
- `useClientReady` and `useIsMobile` are both `useSyncExternalStore`, so they flip in the same render after hydration: a phone never mounts the desktop shell.

Deviations from the contract:
1. `chatDesktopAnswer` checks `chatDesktopEnabled(env)` first and treats only a real `true` as `chatV2On`. Same truth table for boolean input.
2. `MessagesSwitch` calls `useClientReady()` on every render (a hook cannot sit behind a prop); its result is read only with the switch on. A switch-off laptop gets one extra no-op re-render after hydration, same output.
3. The pinned empty `<div>` is one local component, `EmptyStage`, used for the not-ready stage and for `dynamic`'s `loading`.
4. The stub carries one `eslint-disable-next-line @typescript-eslint/no-unused-vars` above its signature. W3-4-shell deletes it when it uses the props.
5. `chatDesktopFor` has no log line for a star inside a list (the contract pins two lines; `.env.example` says such a star is ignored and promises no log).

### W3-1-pinsdb: pins, the migration and the rules

Files: `supabase/migrations/20261004100000_chat_message_pins.sql`, `scripts/sql/chat-message-pins-check.sql`, `src/lib/chat/pin-rules.ts`, `src/lib/chat/pin-rules.test.ts`. LOCAL stack only (Docker, `supabase_db_vibe`). Production has NOT been touched and holds neither the table nor the trigger.

```ts
// src/lib/chat/pin-rules.ts (pure: no import at all)
export const PIN_CAP = 20;
export function pinQuote(content: string | null): string;                              // whitespace runs -> one space, trimmed, at most 140 characters, a cut ends with "…"; "" for no content
export function afterCleared(createdAt: string, clearedAt: string | null): boolean;    // strictly after; compares to the microsecond; an unreadable date is "not after"
export function pinnedIds(pins: { message_id: string }[] | null): ReadonlySet<string>;
```
SQL, as applied locally and recorded as `20261004100000 | chat_message_pins`:
- `public.chat_message_pins (message_id uuid primary key -> messages on delete cascade; channel_id uuid not null -> channels on delete cascade; pinned_by uuid -> users on delete set null; pinned_at timestamptz not null default now())`; indexes `idx_chat_message_pins_channel (channel_id, pinned_at desc)` and `idx_chat_message_pins_pinned_by (pinned_by)`; RLS on with NO policy; only `service_role` holds select, insert, update, delete.
- `public.chat_pins_drop_removed()` (plpgsql, security definer, `search_path ''`) and the trigger `chat_pins_drop_removed` AFTER UPDATE OF `removed_at` ON `public.messages` FOR EACH ROW WHEN (`new.removed_at is not null and old.removed_at is null`).
- The file's behaviour check raises `P0C49` to roll itself back. The check script ends `chat-message-pins-check: all 43 cases passed`, then `ROLLBACK`; it refuses any connection that is not the local unix socket.
- Run the check: `docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/chat-message-pins-check.sql`. The integrator reran it after the wave: 43 passed.

Deviations from the contract:
1. **The migration's behaviour check builds its own rows** (a throwaway dm room with no members and one message written by the oldest `public.users` row), as 4b's shared rule says. 4b.1's own line says "pick any message of a dm or group". The two lines pull apart; the file follows the shared rule. It is skipped with a NOTICE when there is no `users` row.
2. No PRE-FLIGHT raise for the triggers on `public.channels`, although the probe inserts a `channels` row. The two triggers there (`chat_channels_fill_kind`, `chat_channels_subscribe`) do nothing for a dm room; the header's PRE-CHECK 4 lists them for a read by hand on production.
3. The batch is about 1,200 lines against the "about 600" rule (migration 581, check 402, rules 87, test 130).
4. The header has sections beyond the eight the contract names (WHAT IT CHANGES FOR EVERYONE, WHAT EACH RULE GIVES, THE STANDING RULE, LOCK).

### W3-1-pure: the pure desktop files

Files (all new, under `src/components/desktop/messages/`): `contracts.ts`, `desktop-rules.ts`, `desktop-rules.test.ts`, `dm-bridge.ts`, `dm-bridge.test.ts`.

`contracts.ts` is contract 3.3 word for word (checked line by line): `MessagesDesktopProps`, `WeekBandProps`, `MonthPopoverProps`, `InboxWideProps`, `SlimListProps`, `NewChatDialogProps`, `ClubPaneProps` (no `pinnedAt`), `ClubPanelProps`, `RosterRow`, `RosterResponse`, `RoomPeopleProps`, `EventPanelProps`, `MembersDialogProps`, `RoomsDialogProps`, `LegacyThreadPaneHandle`, `LegacyThreadPaneProps`, `PinsPanelProps`, `DesktopDialogProps`, `DesktopPopoverProps`. Types only. Read the props from the file, not from here.

```ts
// desktop-rules.ts (no React, no DOM)
export type KnownChat = { kind: "dm" } | { kind: "club"; orgHandle: string; roomKind: RoomKind };
export function knownChat(id: string, threads: ThreadEntry[] | null, requests: ThreadEntry[] | null, clubs: InboxClub[] | null): KnownChat | null;
export type OpenChat =
  | { kind: "club"; orgId: string | null; orgHandle: string; name: string; logoUrl: string | null; roomId: string }
  | { kind: "dm"; threadId: string; name: string; avatarUrl: string | null; group: boolean };
export type SlimRow = { key: string; kind: "club" | "dm" | "group"; name: string; avatarUrl: string | null; seed: string; open: boolean; dot: "coral" | "ring" | null; label: string; href: string;
  target: { kind: "club"; orgHandle: string; roomId: string; roomKind: RoomKind } | { kind: "dm"; threadId: string } };
export function slimRows(clubs: InboxClub[], threads: ThreadEntry[], requests: ThreadEntry[], open: OpenChat | null, now: Date): SlimRow[];
export function searchRows(rows: HomeRow[], query: string): HomeRow[];
export function bandFit(bandWidth: number, fixedWidth: number, count: number): { cards: number; more: number };
export function panelMode(contentWidth: number, panelWidth: number, pref: "1" | "0" | null, openedHere: boolean): "side" | "overlay" | "hidden";
export function chatEntry(id: string): { state: { vibeChat: string; depth: 1 }; url: string };

// dm-bridge.ts (no React, no DOM, no import)
export const DM_BRIDGE_VERSION = 1;
export function paneSrc(): string;   // "/html/messages.html?app=1&embedded=1&pane=1&v=1"
export type DmPageEvent = /* 12 types, 5.3 word for word: ready, opened, open-failed, read, activity, list-changed, closed (declined | blocked | deleted | left | lost), escape, info-opened, pins-toggle, pins-changed, jump-missed */;
export type DmShellCommand = /* 5 types, 5.3 word for word: open, close, jump, pins-changed, panel-state */;
export function parsePageEvent(data: unknown): DmPageEvent | null;
export function shellMessage(command: DmShellCommand): { source: "vibe-shell"; v: 1 } & DmShellCommand;
export function fromFrame(event: { origin: string; source: unknown }, ownOrigin: string, frameWindow: unknown): boolean;
```
What the code does beyond the pinned comments (all inside the contract's rules):
- `slimRows`: a club is "the open one" when `open.orgId === club.org.id` OR the handles match ignoring case. A supplied row's key is `club:<orgId ?? orgHandle>` or `thread:<id>`; its label is the name alone. A supplied dm with no name yet takes the request's title, else `Group` / `Direct message`.
- **`SlimRow.target.roomKind` on the OPEN club row may be the placeholder `"room"`** (an event chat and the Officers room read so too: `OpenChat` carries no kind). Never act on the open row's target. Every other club row names its Board or its Lounge.
- `parsePageEvent` answers a fresh object with the pinned fields only; an id must be a non-empty string.
- `fromFrame` answers false when `frameWindow` is null or undefined (an unmounted frame vouches for nothing).
- `bandFit` treats a `count` or a width that is not a finite number as 0.

Deviations from the contract:
1. `desktop-rules.ts` has TWO runtime imports from the phone, not one: `threadAvatar`, `threadTitle` from `@/components/mobile/messages/format` besides `home-rules.ts`. `format.ts` is pure (its only import is type-only), so "no React and no DOM" still holds. Reason: one title rule, the one `PersonRow` draws with.
2. The rest of this batch's report did not reach the integrator (the task text was cut). Nothing else was found by reading the three files against 3.3, 3.4 and 5.3.

### W3-1-prep: phone-file preparations and the dialog

Files: `src/components/mobile/messages/home/MessagesHome.tsx` (four `export` keywords and one added line, nothing else), `home/MonthSheet.tsx` (now the shell only, 216 lines), `home/MonthBody.tsx` (new, 388 lines), `src/components/desktop/messages/DesktopDialog.tsx` (new).

```ts
// home/MessagesHome.tsx
export function useHomeData(refreshKey: number, onThreads: MessagesHomeProps["onThreads"]);
export type HomeData = ReturnType<typeof useHomeData>;
export function HomeSkeleton();
export const FILTER_LABEL: Record<HomeFilter, string>;
export const LIST_LABEL: Record<HomeFilter, string>;

// home/MonthBody.tsx ("use client")
export type MonthBodyProps = { initialDay: Date; now: Date; night: boolean; onPicked: (day: Date) => void; onOpenRoom: (entry: WeekEntry) => void; renderTitle: (monthLabel: string) => ReactNode; cell?: number };
export function MonthBody(props: MonthBodyProps);            // renders a FRAGMENT
export { SLIDE_CSS as MONTH_SLIDE_CSS } from "./YourWeek";   // extra export, see below

// home/MonthSheet.tsx: MonthSheetProps and MonthSheet unchanged in name and props

// dm/DesktopDialog.tsx ("use client")
export function DesktopDialog(props: DesktopDialogProps);    // width 440, busy false, ownsHistory true by default
export function DesktopPopover(props: DesktopPopoverProps);  // width 336, align "start" by default
export function desktopLayerOpen(): boolean;                 // extra export, see below
```
The month split, read side by side by the integrator (old file at `HEAD` against the two new ones): the sheet draws the same nodes in the same order with the same styles. The only differences in the code, none of them visible on the phone:
- the picked day's button is found by `button[aria-pressed="true"]` inside the scrolling box (`bodyRef`) instead of by a ref on the button;
- the sheet keeps its own copy of the picked day, set by the body's `onPicked` at every pick, and hands it to `onClose`;
- the title is drawn by the sheet through `renderTitle` (the same `Drawer.Title`, the month and the year cut from `October 2026` at the last space);
- the day button's height is `cell + 4` (46 at the default 42);
- a live day's dot glows only when `useChatSurface() === "phone"`, which is the default the phone always reads.

Deviations from the contract (6.1, 6.2):
1. **The dialog's scrim is `t.scrim`, not `rgba(var(--scrim-rgb), 0.45)`.** `--scrim-rgb` is the ink tint (white in Night), so the pinned value would be a white haze in Night. `t.scrim` is what the phone's sheets use.
2. **The popover returns focus to `anchor` on every close EXCEPT one:** when the window lost focus because the person pressed inside the dm frame (`document.activeElement` is an iframe), focus is left in the frame.
3. With no room under the anchor and room above it, the popover opens ABOVE the anchor (the "+" at the foot of the window). With no anchor it sits in the middle of the window.
4. Both layers are portalled to `<body>`; z-index 1200 (dialog) and 1210 (popover). The dialog also has `aria-busy` while `busy`, and while `busy` Back is answered by a step forward (`useLayerHistory`'s `canPop`).
5. Two extra exports the contract does not name: `desktopLayerOpen()` (true while any `DesktopDialog` or `DesktopPopover` is mounted) and `MONTH_SLIDE_CSS`.
6. `MonthBody` carries the phone's two coral literals for the `Going` pill (`rgba(255,92,53,...)`), moved line for line from `MonthSheet`. They now also draw inside the desktop month popover: look at the pill in Light at 1440 on the walk.
7. This batch's own report did not reach the integrator (the task text was cut). The list above is from reading the files.

### What the next waves must know

**Wave 2**
- **W3-2-roomreads (or the orchestrator, before wave 2's typecheck): make `SpaceRoom.locked` and `SpaceRoom.post_policy` required.** In `src/lib/chat/types.ts` change `locked?: boolean` to `locked: boolean` and `post_policy?: PostPolicy` to `post_policy: PostPolicy`, delete the second paragraph of the comment above them, and in the SAME change set both keys at `space/route.ts:241`, in `orderSpaceRooms`' final map (`reads.ts:218`: it copies an explicit key list and would drop them) and in `sroom` (`reads.test.ts:164`). `types.ts` is not in W3-2-roomreads' owned files: the wave-2 brief must grant it this two-line edit.
- W3-2-roomreads, `viewerInRoom` (4c.3): write `(room.post_policy ?? "everyone") !== "everyone"`, as `postRefusal` does, and hand `postRuleLine` a real `PostPolicy`. `Room.post_policy` is optional, so the contract's bare `room.post_policy !== "everyone"` is true for a hand-made `Room` and `postRuleLine(room.post_policy)` does not compile.
- W3-2-pinroutes, the PUT pin route (4.3): select `removed_at` with the message and answer 404 `not_found` when it is set, and count only pins whose message is live for the cap. The author of a moderator-removed message can still read their own row on the cookie client, so today's text lets them pin it; the trigger fires only on null -> set, so that pin is never dropped and silently takes one of the 20 slots (the check script's case T6 shows such a pin staying).
- W3-2-roomsdb: rerun `scripts/sql/chat-message-pins-check.sql` after your last apply (43 cases).
- No gated route may import `flag-desktop-server.ts`; nothing new may be exported from `flag-server.ts`.

**Wave 3**
- W3-3-campus: `enforceCampusAccess` returns `{ userId }`; `chatDesktopFor(userId)` is in `@/lib/chat/flag-desktop-server`; `useClientReady` is in `@/lib/use-client-ready`.
- W3-3-thread, W3-3-forms and every later screen: read `room.locked` and `room.post_policy` as required (no `?? "everyone"`, no `=== true`); read the surface with `useChatSurface()` from `@/components/mobile/messages/surface`.
- W3-3-bridge: the page writes the bridge's names by hand; they are the ones in `dm-bridge.ts`. `paneSrc()` is the frame's only URL.
- For the planner (no batch owns these yet): `public/html/_sharePicker.js:299-305` has its own `CHAT_REFUSALS` table without `room_posters_only`; `ConversationView.tsx:339` and `public/html/messages.html:2663` flip "cannot post" only for `board_officers_only` / `room_closed`. Give the rows to a batch or accept the generic line.

**Wave 4**
- W3-4-shell: replace the stub in `MessagesDesktop.tsx`. Keep the NAMED export `MessagesDesktop` and the props `{ initialHandle?: string; initialChannelId?: string }` (`MessagesSwitch` loads it by that name with `next/dynamic`); delete the `eslint-disable` line. Provide `<ChatSurfaceContext.Provider value="desktop">`. Call `useHomeData` exactly once. `desktopLayerOpen()` is there for the Esc rule (3.5 rule 9).
- W3-4-week: `MonthPopover` = `DesktopPopover` (width 336) around `MonthBody`; render `<style>{MONTH_SLIDE_CSS}</style>` once, give the box a bottom padding (the sheet uses 14px; the popover box is already a flex column), and pass `renderTitle` an `<h2>` with `marginRight: "auto"` that is a live region. Keep the last `onPicked` day for your own close.
- W3-4-lists: `SlimRow.open` rows open nothing; never act on the open row's `target.roomKind`.
- W3-4-phonepins and W3-5-pins: do not test "was cut" with `full_text.length > text.length` (4d.5). It is also true for an uncut quote whose content has a line break or a doubled space, because `pinQuote` collapses them. Use `text !== full_text.replace(/\s+/g, " ").trim()`.

**The orchestrator**
- Contract 4b.1's POST-CHECK BY BEHAVIOUR line still says "pick any message of a dm or group". Either update that line to match the file (it builds its own room and message) or have the old fixture put back; decide before the production yes.
- Before the production apply, run the migration header's PRE-CHECK 4 by hand (the triggers on `public.channels`; expected `chat_channels_fill_kind`, `chat_channels_subscribe`). The file does not refuse on a different list.
- The handoff should say that the comment at `MessagesMobile.tsx:47` and wave-2 contract 2.1 ("desktop never asks the flag") are superseded by contract 2.5. No phone file was edited for it.
- Contract section 8's Agent line for W3-1-types ("no error outside `features/route.ts`") and 4c.3's required `SpaceRoom` keys cannot both hold in wave 1; see the first wave-2 item.
- Notes, not breaks: `src/proxy.ts:296` sends a signed-out hit on `/html/messages.html?to=<handle>` to login with `next=/messages` and loses `?to=` (2.5 row 1 only promises the `/messages` page keeps it). On the local stack the role `authenticated` holds TRUNCATE, REFERENCES and TRIGGER on `public.messages` by default ACL (not reachable through PostgREST); worth a line in the next security pass.

### Walk (DEFERRED: nobody opened a browser in wave 1)

1. A switch-off laptop's first paint on `/messages` is today's iframe, no placeholder, and the iframe does not reload after hydration.
2. A switch-on phone (375px) never shows or mounts the desktop shell: the app-shell placeholder, then the phone tree.
3. A switch-on laptop: `CampusAppShell` and the empty cream stage during hydration, then `MessagesDesktop` (nothing until wave 4); no hydration warning in the console.
4. Signed out, open `/messages?channel=<id>` (and `?to=<handle>`, `?tab=clubs`): after sign-in or Terms the browser comes back to the same address with its query (2.5 row 1).
5. `GET /api/me/features`: `chat_desktop` true only with both switches on; false for a `chat_v2`-only account; 401 signed out.
6. Dragging a switch-on window across 900px swaps the phone tree and the desktop shell.
7. The phone's month at 375px with `chat_v2` on (2.5 row 10 item e; section 10 part G): open from the title and from a day, focus lands on the picked day, change month by chevron and by swipe, Today, pick a day, open a plan, close by the handle, by Back, by a drag, by the scrim; the strip moves to the picked day's week. All as on Oct 2.
8. `DesktopDialog` and `DesktopPopover` are mounted by nobody yet: their focus, Esc, Back, Tab and window-blur rules were checked by reading only. They are walked with the first screens that use them (waves 3 to 5; section 10 part H).

## Wave 2

Integrated Sat Oct 3, 2026. Four batches: W3-2-roomsdb, W3-2-roomreads, W3-2-roomroutes, W3-2-pinroutes. The server only: no new screen, nothing mounts the hook yet. Not committed, not pushed, not deployed. Production was not touched by the integrator; the builders report the same (the post-policy file is applied to the LOCAL Docker stack only).

### The gate (run in the worktree after all four batches)

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` | 2,025 tests, 2,025 pass, 0 fail (1,900 after wave 1; +125) |
| `npx eslint <the 20 source and test files of the wave>` | exit 0, no problem in any file (nothing added to map 05's baselines) |
| `npm run build` | exit 0 (the three new routes build) |
| `scripts/sql/chat-room-post-policy-check.sql` on the LOCAL stack | `chat-room-post-policy-check: all 104 cases passed`, then `ROLLBACK` |
| `scripts/sql/chat-message-pins-check.sql` (rerun after the last apply) | `all 43 cases passed`, `ROLLBACK` |
| `scripts/sql/chat-v2-rooms-check.sql` / `chat-v2-cards-check.sql` (unchanged files) | `all 200 cases passed` / `all 181 cases passed`, `ROLLBACK` |

Local database after the wave (read by the integrator): `schema_migrations` holds `20261004110000 | chat_room_post_policy` above `20261004100000 | chat_message_pins`; `channels.post_policy` is `text not null default 'everyone'`; both constraints validated; md5s `can_post_org_channel` = `ae485a1fb463cfd6f6ace3448d986fb9`, `chat_cast_vote` = `0ba4681e8816cecaa5c066ee6b03bedd`, `can_view_org_channel` = `747ee06d2e4c3e8a788129f7530ec0ae` (untouched); no room holds a rule other than `everyone`; `chat_message_pins` is empty.

The integrator changed two COMMENTS and no code (see "Integration edits"). Every changed file belongs to a batch; `types.ts` was edited by W3-2-roomreads under the grant written in wave 1's notes.

### Files of the wave (22: 11 changed, 11 new)

Changed: `src/app/api/orgs/[slug]/channels/route.ts`, `.../channels/[channelId]/route.ts`, `.../members/route.ts`, `.../space/route.ts`, `src/lib/chat/rooms.ts`, `reads.ts`, `reads.test.ts`, `message-read.ts`, `message-read.test.ts`, `reads-routes.test.ts`, `types.ts`.

New: `supabase/migrations/20261004110000_chat_room_post_policy.sql`, `scripts/sql/chat-room-post-policy-check.sql`, `src/app/api/me/threads/[id]/message-pins/route.ts`, `src/app/api/me/threads/[id]/messages/[messageId]/pin/route.ts`, `src/app/api/me/threads/[id]/shared/route.ts`, `src/lib/chat/pins-read.ts`, `pins-routes.test.ts`, `use-message-pins.ts`, `room-names.ts`, `room-names.test.ts`, `room-routes.test.ts`.

### Integration edits (comments only)

1. `src/lib/chat/types.ts`, the comment on `PinnedMessage.author`: was "null when the account is gone"; now says null means the VIEWER cannot read that profile (suspended or banned author) or the authors' read failed, and the pin is still live. The type is unchanged.
2. `src/lib/chat/rooms.ts`, the file header: one sentence added saying the three `postPolicyColumn...` functions only remember a missing column (the header counted "four" functions).

### W3-2-roomsdb: the post-policy migration

Files: `supabase/migrations/20261004110000_chat_room_post_policy.sql` (1,028 lines), `scripts/sql/chat-room-post-policy-check.sql` (690 lines). LOCAL stack only.

- Column `public.channels.post_policy text not null default 'everyone'`; constraints `channels_post_policy_check` (`in ('everyone','officers','listed')`) and `channels_post_policy_rooms_only` (`post_policy = 'everyone' or coalesce(kind = 'room', false)`).
- `public.can_post_org_channel(cid uuid, uid uuid, root uuid) returns boolean` restated (the two new arms of 4b.2); `public.chat_cast_vote(p_poll uuid, p_option uuid, p_user uuid, p_on boolean) returns void` restated (the closed test is `v_kind = 'event'`). Both keep EXECUTE for anon, authenticated, service_role. `can_view_org_channel` is not touched.
- The file's own behaviour check raises `P0C59`. The check script refuses anything but the local unix socket and ends `chat-room-post-policy-check: all 104 cases passed`.
- Run it: `docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/chat-room-post-policy-check.sql`.
- Who may put a person on a room's list (read on the local stack by the integrator): only owner and admin (`org_channel_members_insert`'s check), so a `listed` room's posters cannot add themselves.

Deviations from the contract:
1. The header's PRE-CHECK has SIX items (nine read-only queries), not the contract's list. Item 4 reads the triggers on eight tables (`channels`, `messages`, `channel_members`, `org_channel_members`, `chat_polls`, `chat_poll_options`, `chat_poll_votes`, `orgs`). Item 6 is new: who may write the rule (column privileges for anon and authenticated on `channels`, `relacl`, policies covering UPDATE), with the builder's own instruction: stop and tell Franky if anon or authenticated holds INSERT or UPDATE on `public.channels` on production. Items 4 and 6 are reads BY HAND: the file does not refuse on a different answer.
2. 104 check cases, not the first build's 102 (C11 = PRE-CHECK 6 as a catalog case; K15 = an admin's direct insert of a room born with a rule, refused 42501). The header's REHEARSED paragraph still says 102, with an AFTER THE REVIEW paragraph under it.
3. Extras the reviewer accepted: the apply record sits in `can_post_org_channel`'s comment; a stricter md5 compare; two extra pre-flight raises; three CHECK probes; a rollback guard; a restated `chat_cast_vote` comment; header sections beyond the contract's eight. Size 1,718 lines against "about 600".

### W3-2-roomreads: rooms in the space and thread reads

Files: `src/lib/chat/rooms.ts`, `reads.ts`, `reads.test.ts`, `message-read.ts`, `message-read.test.ts`, `reads-routes.test.ts`, `src/app/api/orgs/[slug]/space/route.ts`, and the one type `SpaceRoom` in `types.ts`.

```ts
// src/lib/chat/rooms.ts (server-only)
export function postPolicyColumnMissing(now: number = Date.now()): boolean;     // true while now - lastNote < 5 * 60 * 1000
export function notePostPolicyColumnMissing(now: number = Date.now()): void;
export function forgetPostPolicyColumnMissing(): void;                          // tests only
export async function loadRoom(channelId: string): Promise<Room | null>;        // select "id, kind, name, org_id, event_id, post_policy"; fallback without it; the Room ALWAYS has post_policy

// src/lib/chat/reads.ts (pure)
export function spaceCanPost(kind: RoomKind, role: ClubRole | null, state: RoomState | null, policy: PostPolicy = "everyone", listed = false): boolean;
export function orderSpaceRooms(rooms: SpaceRoomWithPosition[]): SpaceRoom[];   // keeps locked and post_policy (eight keys)
export function recentShown<T extends { hidden: boolean; removed: unknown }>(messages: T[], max: number): T[];   // NEW, not in the contract

// src/lib/chat/message-read.ts
export function viewerInRoom(room: Room, role: ClubRole | null, mayPost: boolean): ViewerInRoom | null;   // post_line only when !mayPost && kind === "room" && (post_policy ?? "everyone") !== "everyone"

// src/lib/chat/types.ts
export type SpaceRoom = { id: string; kind: RoomKind; name: string; unread: boolean; can_post: boolean; event: EventRef | null; locked: boolean; post_policy: PostPolicy };   // both REQUIRED now
```
`GET /api/orgs/[slug]/space`: rooms select `"id, kind, name, event_id, position, is_private, post_policy"`, fallback `"id, kind, name, event_id, position, is_private"`. Each room carries `locked` (`is_private === true`) and `post_policy`; `can_post = spaceCanPost(kind, role, state, policy, listed)`. `?panel=1` adds `board_recent: ChatMessage[]` (at most 3, newest first, cut from the Board page the route already reads with `{ limit: 6 }`).

Deviations from the contract:
1. `SpaceRoom.locked` and `post_policy` are required now: wave 1's open mismatch is CLOSED. Screens read them plainly (no `?? "everyone"`, no `=== true`).
2. `viewerInRoom` resolves `room.post_policy ?? "everyone"` and sets `post_line` only when `postRuleLine` answers a string (the contract's bare compare does not compile for an optional field).
3. `recentShown` is an extra export (the pure cut behind `board_recent`).
4. With `?panel=1` and no Board, or nothing to show, `board_recent` is `[]`, never absent. Without `?panel=1` the key is absent. Its first entry equals `board_latest`.
5. The by-name list read (`org_channel_members`, made only when some room is `listed`) failing is logged and read as "not listed": a non-officer's `can_post` on a `listed` room falls to false and the answer is still 200. The thread read's `viewer.can_post` corrects it on open.
6. The "column missing" note is made on the first missing-schema failure of a select that named `post_policy`, even when the missing column is really `kind` (a database without migration A). Only effect: 5 minutes of the fallback select there.
7. `reads-routes.test.ts` stubs `@/lib/chat/rooms` but re-exports the three memory functions from the REAL `rooms.ts` by absolute file URL. Any FUTURE test that stubs `@/lib/chat/rooms` and loads the space route or the channels route must export `postPolicyColumnMissing` and `notePostPolicyColumnMissing` from its stub.

### W3-2-roomroutes: room routes, room names, the roster filter

Files: `src/app/api/orgs/[slug]/channels/route.ts`, `.../channels/[channelId]/route.ts`, `.../members/route.ts` (GET only), `src/lib/chat/room-names.ts`, `room-names.test.ts`, `room-routes.test.ts`.

```ts
// src/lib/chat/room-names.ts (pure, no import)
export function roomDisplayName(slug: string): string;    // "exec-only" -> "Exec only"; applying it twice equals once
export function roomSlug(input: string): string | null;   // "Exec only" -> "exec-only"; null unless ^[a-z0-9][a-z0-9_-]{1,30}$
```
- **`GET /api/orgs/[slug]/channels`**: three-step read. (1) `${LIST_COLUMNS}, kind, post_policy` + the event filter, skipped while `postPolicyColumnMissing()`; (2) on missing schema: `notePostPolicyColumnMissing()`, then `${LIST_COLUMNS}, kind` + the event filter; (3) only if that is missing schema too: the bare read. A row has `post_policy` ONLY from step 1: read it as `row.post_policy ?? "everyone"`. Answer `{ ok: true, channels }`; any other failure is 500 `load_failed` after one read.
- **`POST /api/orgs/[slug]/channels`**: body `{ name, topic?, is_private?, position?, post_policy? }`. Gates in order: 401; `rateLimit("room-create:" + user.id, { limit: 10, windowSec: 600 })`; publish gate; body (a bad `post_policy` is 400 `Invalid post_policy`); name rule; officer guard; a core room's name -> 409 `room_locked`; name clash -> 409 `Channel name already exists`; the cap (409 `room_limit` at `>= EXTRA_ROOM_CAP`, skipped when `kind` cannot be read). 201 `{ ok: true, channel: { id, name, topic, is_private, pinned, position, created_at, post_policy } }`: `post_policy` is ALWAYS in the answer. `post_policy` is written and selected only when it is not `everyone`; a rule asked of a database without the column -> 503 `try_again`, no second insert.
- **`PATCH /api/orgs/[slug]/channels/[channelId]`**: body `{ name?, topic?, is_private?, position?, pinned?, post_policy? }`. `post_policy` on anything but `kind === "room"` -> 409 `room_locked` (checked BEFORE the value); a bad value -> 400 `Invalid post_policy`. Answer `{ ok: true, channel }`; `channel.post_policy` is present ONLY when the body named it. `DELETE` is untouched.
- **`GET /api/orgs/[slug]/members?visible=1`** (exactly the value `1`): the roster without the ids of `blockedIdsFor(supabase, user.id)`; a failed block read -> 503 `try_again`. Without the parameter: today's unfiltered list. Row shape unchanged (`RosterRow`).

Deviations from the contract:
1. **PATCH on a database without the column does NOT answer 503 for every value** (contract 4.2's letter). `officers` / `listed` -> 503 `try_again`, nothing written. `everyone` -> the key is dropped and the rest of the body is written by the pre-wave update, once; the answer is 200 with `channel.post_policy: "everyone"`. A body that held ONLY `post_policy: "everyone"` writes nothing, reads the room back and answers 200. A second failure is the old 500 `Failed to update channel`. Reason: a missing column already means everyone, and the Rooms dialog sends the field on every save, so a plain rename must work after a rollback (4b.2 "Code keeps working").
2. PATCH does not use the 5-minute memory (neither does POST): a stale memory could turn a real `officers` -> `everyone` change into a silent no-op.
3. PATCH with `post_policy` where `kind` cannot be read (null) is 409 `room_locked`, like any non-room.
4. POST validates `post_policy` with the body, before the officer guard: a non-officer sending a bad value reads 400, not 403.
5. POST's cap count failing (or null) answers 500 `Failed to create channel` and writes nothing.
6. The roster filters only for `visible=1`; `visible=true`, `visible=0` and an empty value are the unfiltered list.
7. `room-routes.test.ts` stubs the memory trio (the memory itself is tested through `reads-routes.test.ts` and `message-read.test.ts`).
8. The first builder's own list of eleven deviations did not reach the integrator; the lines above are what the diff shows and what the repair reported.

### W3-2-pinroutes: pin and shared routes, the mappers, the hook

Files (all new): the three route files, `src/lib/chat/pins-read.ts`, `pins-routes.test.ts`, `use-message-pins.ts`.

```ts
// src/lib/chat/pins-read.ts (server-only)
export const PIN_LIST_SELECT = "message_id, pinned_at, message:messages!chat_message_pins_message_id_fkey(id, content, created_at, user_id, media_url, media_kind, attachment_id, removed_at)";   // NO users embed
export const PIN_AUTHOR_SELECT = "id, handle, name, avatar_url";      // the authors' read, on the viewer's cookie client
export const PIN_LIVE_SELECT = "message_id, message:messages!chat_message_pins_message_id_fkey(removed_at)";
export const PIN_ROWS_MAX = 100;
export const SHARED_LIMIT_DEFAULT = 30;
export const SHARED_LIMIT_MAX = 60;
export const SHARED_READS_MAX = 4;
export type PinMessageRow = { id?: string; content?: string | null; created_at?: string; user_id?: string; media_url?: string | null; media_kind?: string | null; attachment_id?: string | null; removed_at?: string | null };
export type PinRow = { message_id: string; pinned_at: string; message?: PinMessageRow | PinMessageRow[] | null };
export function pinAuthorIds(rows: PinRow[] | null, clearedAt: string | null): string[];
export function pinAuthors(rows: unknown[] | null): Map<string, Person>;
export function toPinnedMessages(rows: PinRow[] | null, clearedAt: string | null, authors: ReadonlyMap<string, Person>): PinnedMessage[];
export function pinSlots(rows: PinRow[] | null, messageId: string): { live: number; among: boolean };
export function clampSharedLimit(raw: string | null): number;
export function toSharedItems(rows: MessageRow[] | null, channelId: string): SharedItem[];

// src/lib/chat/use-message-pins.ts ("use client")
export type MessagePins = { pins: PinnedMessage[] | null; available: boolean; failure: LoadFailure | null; isPinned: (messageId: string) => boolean; pin: (messageId: string) => Promise<boolean>; unpin: (messageId: string) => Promise<boolean>; reload: () => void };
export function pinTextCut(pin: Pick<PinnedMessage, "text" | "full_text">): boolean;
export const PINS_LOAD_LINE = "Couldn't load pinned messages.";
export function useMessagePins(threadId: string | null, options: { enabled: boolean; pollMs?: number }): MessagePins;

// routes
// GET    /api/me/threads/[id]/message-pins                   -> MessagePinsResponse   (Cache-Control: private, no-store)
// PUT    /api/me/threads/[id]/messages/[messageId]/pin       -> PinMessageResponse    (no body)
// DELETE /api/me/threads/[id]/messages/[messageId]/pin       -> PinMessageResponse
// GET    /api/me/threads/[id]/shared?before=<iso>&limit=<n>  -> SharedResponse        (Cache-Control: private, no-store)
```
Gates as 4.3 pins them, in its order. Common: 401; `chatV2For` false -> 404 `not_found`; a non-uuid id -> 404; not a member -> `ensureMember`'s status with `{ ok: false, error: "Not a member" }`; a club room -> 400 `pins_chats_only`; the table missing -> 404 `not_found`; the service key missing or any other read failure -> 503 `try_again`. PUT and DELETE then: `rateLimit("message-pin:" + user.id, { limit: 30, windowSec: 600 })`, `requireNotRestricted`, a pending request -> 403 `pin_not_allowed`. PUT then: `dmSendBlocked` (blocked 403 `pin_not_allowed`, failed 503), the message on the cookie client, the cap, the insert (23505 -> `already: true`; 23503 -> 404).

Deviations from the contract:
1. **The pin list's authors are read on the VIEWER's cookie client, not in the service read** (4.3's row says "joined to their messages and authors"). `users.select("id, handle, name, avatar_url").in("id", <authors of the pins shown>)`; an author RLS hides (suspended, banned) is `author: null`; a failed authors' read is logged and every author is null, still 200. No authors' read when no pin is shown. Reason: the service role reads every profile; the thread sends `users: null` for the same message.
2. **PUT selects `id, created_at, removed_at` and answers 404 `not_found` for a removed message; the cap counts only pins whose message is live** (`pinSlots`). Wave 1's note asked for both.
3. **The shared route reads on past skipped rows**: up to `SHARED_READS_MAX` = 4 reads of `limit + 1` rows in one request, each from the previous read's last RAW row, until it has `limit` items or the rows run out. `has_more` is NEVER true with `items: []`. A run of more than about 4 x limit skipped rows in a row ends the list there (older items are then not reachable). Lifting that needs a cursor field on `SharedResponse`; not added (the type is pinned).
4. "Was the quote cut" is `pinTextCut(pin)` (`pin.text !== pin.full_text.replace(/\s+/g, " ").trim()`), not 4d.5's length test.
5. `MessagePins.available` is TRUE before the first answer and for every new `threadId`; it turns false after a 404 or `pins_chats_only`. See the gating rule below.
6. The hook also treats the code `pins_chats_only` as "not available" and stops its timer until `reload()`. A newly pinned message joins `pins` with the next read (its quote comes from the server); `isPinned` answers at once.
7. `pins-routes.test.ts` stubs three client modules so the hook file loads under `node --test`; the hook itself (`useMessagePins`) is not run by any test, only `pinTextCut`.

### Seams read on both sides (all matched; no code changed)

- `rooms.ts` exports the memory trio with 4.2's names and signatures; `channels/route.ts` and `space/route.ts` import `postPolicyColumnMissing` and `notePostPolicyColumnMissing` from it. PATCH and POST import neither, on purpose.
- The migration's column, its three values and `kind = 'room'` are what `isPostPolicy`, `loadRoom`, the space route and the two room routes read and write. The rule is written only by the service role in the two room routes.
- `PIN_LIST_SELECT` and `PIN_LIVE_SELECT` name the foreign key `chat_message_pins_message_id_fkey`; the local table has a constraint of exactly that name (read from the catalog).
- The space route's by-name read runs on the cookie client; `org_channel_members_select` lets a person read their own rows (read from the local catalog).
- The hook's two URLs, methods and response types are the routes'; it reads `status === 404` and `code === "pins_chats_only"`, both of which the routes send.
- `toSharedItems` uses the thread read's own `prepareForClient` and `MESSAGE_SELECT`, so a shared item's `media_url` and `attachment` are the thread's.

### What the next waves must know

**Wave 3**
- W3-3-thread, W3-3-forms: `SpaceRoom.locked` and `post_policy` are required: read them plainly. `viewer.post_line` is present only on an extra room whose rule refused this viewer.
- W3-3-thread: `roomDisplayName` / `roomSlug` are in `@/lib/chat/room-names` (pure; safe in a client file).
- W3-3-bridge (wherever `#cPinsBtn`, the hover pin and the pane's pin controls are gated) and W3-3-campus: nothing new from this wave beyond the routes above.

**Wave 4**
- W3-4-phonepins: show a pin CONTROL (`Pin message` / `Unpin message`, `Pinned messages`) only when `pins.available && pins.pins !== null`. `available` alone is true before the first answer; on a database without the table that would show controls for a moment and the PUT would toast (2.5 row 10 (f)). Show the "not available" state on `!pins.available`. (As built in wave 4, the phone's `Pinned messages` row ALSO shows after a first read that failed, so its Retry can be reached: see Wave 4, W3-4-phonepins, deviation 1.)
- W3-4-phonepins: import `pinTextCut` from `@/lib/chat/use-message-pins` for `Show all`; do not write a length test (this supersedes wave 1's note, which gave the expression).
- W3-4-phonepins: `author` can be null on a live pin. The words table has no string for it: see the orchestrator's list.

**Wave 5**
- W3-5-pins: the same three rules as W3-4-phonepins (gate on `available && pins !== null`, `pinTextCut`, a null author). `Show more` asks `?before=<the last item's created_at>` and only while `has_more`; an empty answer has `has_more: false` and is the end.
- W3-5-club, W3-5-panel: with `?panel=1`, `board_recent` is always an array (`[]` when there is no Board or nothing to show); its first entry equals `board_latest`. A `listed` room's `can_post` in the space answer may be false for a listed member when the by-name read failed: trust the thread read's `viewer.can_post` once the room is open.
- W3-5-rooms:
  - A row of `GET /api/orgs/<handle>/channels` may have no `post_policy` key: read `row.post_policy ?? "everyone"`.
  - Send `{ name, topic, is_private, post_policy }` on every save of an extra room if you like: a plain rename works on a database without the column. Read the saved rule from the PATCH answer's `channel.post_policy` (present whenever the body named it). Show the 503 sentence when `officers` / `listed` is refused.
  - Never send `post_policy` for the Board, the Lounge or Officers: 409 `room_locked`.
  - Two stored names can show the same words (`exec_only` and `exec-only` are both `Exec only`); the route's uniqueness check compares slugs. The form's validity rule should compare `roomDisplayName` against the existing rooms.
  - Typing `Board`, `Lounge` or `Officers` as a NEW room's name gives a core room's slug and POST answers 409 `room_locked`, whose sentence ("This room can't be renamed, hidden or deleted.") reads wrongly for a create. Catch the three names in the form's validity rule with a line of your own (the planner picks the words).
  - POST can answer 429 (10 creates per 10 minutes per person) and 500 when the cap's count fails.
- W3-5-people: `?visible=1` is exact; a 503 `try_again` means the block read failed (show the retry, never an unfiltered list).

**The orchestrator and the planner** (`contract.md` is read-only for builders; none of these was applied to it)
- 4.2, the PATCH bullet: amend to deviation 1 of W3-2-roomroutes (503 only for `officers` / `listed`; `everyone` drops the key and runs today's update once; the answer carries `post_policy: "everyone"`).
- 4.3, the message-pins row: the authors are read on the viewer's client (RLS decides); a hidden profile is `author: null`; a failed authors' read is nulls, not 503. The type comment in `types.ts` already says so.
- 4.3, the shared row, and 4d.5: the route reads on past skipped rows (up to 4 reads) and `has_more` is never true with `items: []`. Decide whether `SharedResponse` gains `next_before: string | null` to lift the bound (W3-5-pins would then page by it).
- 4d.5 (line 690): replace `full_text.length > text.length` with `pinTextCut(pin)`.
- 4d.4: `available` is "false after a 404" AND true before the first answer; add the gating rule (`available && pins !== null`).
- **Pick the words for a pin whose author is null** (6.5 has none). Recommendation: the time alone (`rowTime(created_at)`), no invented name.
- **A rule gap, not a code fault**: the cap of 20 is per chat, but "Clear chat history" hides older pins per person. Someone who cleared a chat holding 20 older pins sees an empty Pinned list and still gets 409 `pin_limit` with nothing to unpin. Decide whether the sentence, the cap or the list gives.
- 4b.3 step 4: name the header's PRE-CHECK item 6 (who may write the rule) and the widened item 4 beside "compare the three md5s"; both are reads by hand. Confirm or reword the builder's "stop and tell Franky" instruction in item 6.
- Anything that quotes 102 cases for the post-policy check should say 104.
- The 5-minute memory is per server instance and nothing clears it on a successful write. An instance that noted the column missing just before the production apply answers rooms as `everyone` (list, space, `loadRoom`, and a refused send reads `room_closed`'s sentence) for up to 5 minutes. 4b.3 step 5's redeploy covers production. ON THE LOCAL STACK: restart the dev server after applying or rolling back the post-policy file, before the walk.
- `scripts/sql/chat-latest-check.sql` (migration C's check; not required by this wave) stops at its fixture lookup on the local stack as it stands: it needs `node scripts/local-seed.mjs` first. It says nothing about this wave either way.
- `src/app/api/orgs/[slug]/channels/[channelId]/members/route.ts` (no batch of this wave; not edited): its comments still call a by-name row on a public room "harmless but not useful". With `post_policy = listed` that row now grants posting. The code already accepts it; only the comment is stale. Give the line to W3-5-rooms or W3-5-people.
- Still open from wave 1 and untouched here: `public/html/_sharePicker.js`'s own refusal table has no `room_posters_only`.

### Walk (DEFERRED: nobody opened a browser or started a server in wave 2; nothing here was run against a real PostgREST)

1. Real PostgREST, local stack: `PIN_LIST_SELECT` and `PIN_LIVE_SELECT` (the `messages!chat_message_pins_message_id_fkey` embed on a table only `service_role` may read), the authors' read on the cookie client, and the shared read's `.or("media_url.not.is.null,attachment_id.not.is.null")` filter have only met stubbed clients. One real read of each is owed before the routes are trusted. Section 10 part E, all of it.
2. Real RLS: pin a message of Blake's in a dm, suspend Blake, open the chat as Avery: `GET /message-pins` answers `author: null` for that pin.
3. Shared paging on real rows: a dm with 31 or more shared posts in a row from a since-banned author shows no endless `Show more`; the read-on cursor (a raw `created_at` as PostgREST prints it) is accepted by the database.
4. The hook in a browser: no pin control before the list answers (a slow phone; production between the deploy and the pins file); the optimistic pin and unpin, the revert and the toast on a refusal, the 20-second poll while visible.
5. Part C2 on the local stack WITH the column: `GET /api/orgs/<handle>/space` answers `locked` / `post_policy` per room and `can_post` false for a member in an `officers` room and in a `listed` room they are not on; a member opening such a room reads `Only officers post here.` / `Only officers and people they picked post here.`; `?panel=1` gives at most three Board posts, newest first, never a removed or blocked author's stub.
6. The same reads on a local database WITHOUT the column (the rollback rehearsed): 200 with every room `everyone`, and one failed select per 5 minutes in the server log, not one per poll. In the Rooms dialog there: a rename with `Everyone who can see it` saves; switching to `Only officers` shows `Try again in a moment.` and changes nothing.
7. Part C2: creating a 6th extra room shows `This club already has 5 extra rooms. Delete one first.`
8. Part F: a switch-off laptop's Campus > Chat rail lists the same rooms as before the build, with no event chats.

## Wave 3

Integrated Sat Oct 3, 2026. Four batches: W3-3-thread, W3-3-forms, W3-3-bridge, W3-3-campus. The pieces: nothing mounts them on desktop yet (`MessagesDesktop` is still wave 1's stub), so no new desktop screen is visible. What DOES change on screen with this wave is contract 2.5 row 10 items (a) to (d) on a phone with `chat_v2` on, and, for a person with `chat_desktop` on, Campus loses its Chat tab. Not committed, not pushed, not deployed. No migration in this wave; nobody touched a database, local or production.

### The gate (run in the worktree after all four batches and the integrator's four edits)

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` | 2,027 tests, 2,027 pass, 0 fail (2,025 after wave 2; +2, both in `club/helpers.test.ts`) |
| `npx eslint <the 19 source and test files of the wave>` | exit 0; the only output is `campus-home.tsx`'s 6 warnings, 0 errors: map 05's baseline, none of them on a line this wave wrote |
| `npm run build` | exit 0 (`✓ Compiled successfully`; `/messages` and `/campus` build as dynamic routes) |

The three static files (`messages.html`, `_miniMessenger.js`, `_sharePicker.js`) are outside eslint and tsc. They are covered only by the source-reading tests (`theme.test.ts`, `reaction-emoji.test.ts`, `dm-bridge.test.ts`: green) and by reading. Nothing in them was run.

### Files of the wave (22: 20 changed, 2 new)

Changed: `public/html/messages.html`, `public/html/_miniMessenger.js`, `public/html/_sharePicker.js`, `src/app/campus/page.tsx`, `src/app/campus/CampusSwitch.tsx`, `src/app/campus/campus-home.tsx`, and under `src/components/mobile/messages/`: `MessageBubble.tsx`, `ReactionPicker.tsx`, `cards/CardBubble.tsx`, `cards/EventCardView.tsx`, `club/BoardPost.tsx`, `club/BoardView.tsx`, `club/RoomChips.tsx`, `club/RoomComposer.tsx`, `club/RoomThread.tsx`, `club/RsvpSheet.tsx`, `club/helpers.ts`, `club/helpers.test.ts`, `compose/CardSheet.tsx`, `compose/CardTray.tsx`.

New: `src/components/desktop/messages/LegacyThreadPane.tsx`, `src/components/mobile/messages/club/HoverActions.tsx`.

Not edited, as the contract asks (empty `git diff`): `src/proxy.ts`, `public/sw.js`, `public/html/_postViewer.js`, `CampusMobile.tsx`, `use-room-poll.ts`, `ComposeSheets.tsx`, the three card sheets, `PollCardView` / `SignupCardView`, `EventAbout`, `BoardStrip`, `ClubSpace`, `EventChat`, `UpNext`, `src/components/safety/ReportSheet.tsx`.

### Files outside every batch's list (both kept)

1. `public/html/_sharePicker.js`: one row, `room_posters_only: "Only some people can post here."`, in its own `CHAT_REFUSALS`. No batch entry in section 8 names the file; W3-3-bridge added it on the orchestrator's word. Kept: it is the row wave 1 and wave 2 both listed as missing, the sentence is `REFUSAL_SENTENCES`' word for word, and it keeps the three static tables in step.
2. `public/html/_miniMessenger.js`: the batch entry grants ONE line (the same row). The file has 14 changed lines: `state.postLine` (reset in `openChat`, set from `j.viewer.post_line` in `loadMessages`, printed first in `paintComposer`). Kept: it is contract 2.5 row 6 ("old screens print `viewer.post_line`") for the profile page's chat bubble, and with no `post_line` in the answer every line is today's. The orchestrator should confirm the wider grant.

### Integration edits (four, all on seams between batches)

1. `club/BoardView.tsx`: the Report dialog's `onClose` is one `useCallback` handler (`closeReport`), used by the modal, the phone's sheet and `useLayerHistory`. Before, an inline arrow: `ReportSheet`'s modal re-runs `dialog.focus()` whenever `onClose` changes, and the Board re-renders on every poll, so the caret left the details box every few seconds. `RoomThread` already had this fix; the Board (W3-3-forms) did not. No change on the phone.
2. `compose/CardSheet.tsx`, `useCardPost`: `room_posters_only` now shares `try_again`'s branch (toast, close, `onReload()`) instead of the closing-only branch. Without the reload the composer under the closed sheet kept its input for up to 20 s in a room that no longer lets this person post. It is the card's half of W3-3-thread's `refusedSend` rule. Contract 4c.4 only says the list "gains the same code".
3. `club/RoomComposer.tsx`: on the desktop surface the composer takes NO history entry of its own for the "+" tray (`useLayerHistory(trayOpen && canPost && !desktop, ...)`). There the tray is a `DesktopPopover`, which always holds its own entry, so one layer was two entries (6.1 promises one). The phone is unchanged.
4. `club/RoomComposer.tsx`: on the desktop surface the 45 degree turn of the open "+" is on the icon, not the button. `DesktopPopover` places itself by the button's measured box, and a turned 44px box measures about 62px, so the popover would have moved about 9px on its next placement (any scroll or resize). The phone still turns the button, as today.

### W3-3-thread: the thread's desktop form

Files: `club/RoomChips.tsx`, `club/RoomComposer.tsx`, `club/RoomThread.tsx`, `club/HoverActions.tsx` (new), `club/helpers.ts`, `club/helpers.test.ts`, `MessageBubble.tsx`, `ReactionPicker.tsx` (one `export`), `cards/CardBubble.tsx`.

```ts
// club/HoverActions.tsx ("use client")
export type HoverActionsProps = { night: boolean; isMine: boolean; onReact?: (emoji: string) => void; onReply?: () => void; onReport?: () => void; onRemove?: () => void; children: ReactNode; label?: string };
export const HOVER_ACTIONS_CSS: string;      // classes vibe-hover-list, vibe-hover-row, vibe-hover-bar, vibe-hover-btn
export function HoverActions(props: HoverActionsProps);

// club/RoomChips.tsx: props unchanged
export type RoomChipsProps = { clubName: string; rooms: SpaceRoom[]; activeRoomId: string | null; night: boolean; now: Date; onPick: (room: SpaceRoom) => void };
export function RoomChips(props: RoomChipsProps);

// club/RoomComposer.tsx: props unchanged
export type ReplyTarget = { parent: NonNullable<ChatMessage["parent_preview"]>; authorName: string };
export type RoomComposerProps = { roomId: string; roomKind: RoomKind; roomName: string; clubName: string; orgHandle: string; orgId?: string | null; viewer: ViewerInRoom | null; viewerId: string | null; night: boolean; poll: Pick<RoomPoll, "append" | "replace" | "remove" | "reload">; replyTo: ReplyTarget | null; onCancelReply: () => void; onSent?: () => void; officerLine?: boolean; focusToken?: number };
export function ClosedTile({ text, night, board = false }: { text: string; night: boolean; board?: boolean });
export function RoomComposer(props: RoomComposerProps);

// club/RoomThread.tsx: props unchanged
export type RoomThreadProps = { poll: RoomPoll; roomId: string; roomKind: RoomKind; clubName: string; night: boolean; now: Date; anchor: "bottom" | "top"; header?: React.ReactNode; onReply: (target: ReplyTarget) => void; onOpenEventChat: (roomId: string) => void; scrollToken: number; emptyBlock?: React.ReactNode };
export function toMessageRow(m: ChatMessage): MessageRow;
export function replyTargetOf(m: ChatMessage, isMine: boolean): ReplyTarget;
export function ThreadSkeleton();
export function RemoveConfirm({ night, busy, onConfirm, onCancel }: { night: boolean; busy: boolean; onConfirm: () => void; onCancel: () => void });   // not edited
export function RoomThread(props: RoomThreadProps);

// club/helpers.ts (pure; now imports roomDisplayName from @/lib/chat/room-names)
export function chipLabel(room: Pick<SpaceRoom, "kind" | "name" | "event">): string;                 // an extra room: roomDisplayName(name)
export function chipAriaLabel(room: Pick<SpaceRoom, "kind" | "name" | "unread" | "event"> & { locked?: boolean }, now: Date): string | null;   // extra room + locked: "<label>, only some members see this room"
export function refusedSend(code: string | null | undefined): { tile: boolean; reread: boolean };   // NEW
// every other export unchanged

// ReactionPicker.tsx
export const REACTION_EMOJIS = ["❤️", "👍", "👎", "😂", "🔥", "😮", "😢"] as const;
// MessageBubble.tsx and cards/CardBubble.tsx: props unchanged
```
How it behaves:
- **Chips.** Both surfaces: the lock when `room.kind === "officers" || (room.locked && room.kind !== "event")`; the megaphone before `Board`; an extra room's name as words. Desktop only: an event chip is drawn selected when it is `activeRoomId`; the `<nav>` is `{ flexShrink: 1, minWidth: 0, height: "auto", minHeight: 45, padding: 0, borderTop: "none", flexWrap: "wrap" }`. The phone's computed style is the old one.
- **Composer.** Both surfaces: cannot post -> the Board tile, else `<ClosedTile text={viewer.post_line}>`, else `This chat is closed.`; `shownName` (words) goes to the placeholder, the tray's caption and the three sheets' room line; `anchorRef={plusRef}` to `CardTray`. A refused send: `refusedSend(code)`: the three codes turn the composer into the tile; `room_posters_only` also calls `poll.reload()` at once.
- **Thread.** Desktop only: each row is wrapped in `HoverActions` (handlers only when the row is real and not removed), `<style>{HOVER_ACTIONS_CSS}</style>` is rendered once inside the scroller, the rows' column carries `className="vibe-hover-list"`, and Report is `ReportSheet variant="modal"` (not nested).
- **Bubbles.** Desktop only: the long press does not arm, the bubble's own "..." is not drawn, text can be selected, the browser's menu opens, a text bubble stops at `min(520px, 100%)`. A card stays 292px.
- **The toolbar.** The pill shows on the row's `:hover`, on KEYBOARD focus (`:focus-visible` on the row, a focused pill button, `:has(:focus-visible)`) and while its emoji row or menu is open; hidden with `opacity` and `pointer-events` only, 150 ms hide delay. The row is the one Tab stop (`role="group"`, `tabIndex={0}`); Enter or Space goes into the pill; Left / Right along the pill and the emoji row, Up / Down along the menu; Esc closes the open layer, else returns to the row. The wrapper caps its row at `min(100%, 520px)` for mine and `min(100%, 552px)` for others.

Deviations from the contract:
1. **The refused-send list is a pure helper**, `refusedSend(code)` in `club/helpers.ts`, not an inline list at `RoomComposer.tsx:226` (4c.4). Tested in `helpers.test.ts`.
2. **One extra thread read after a `room_posters_only` refusal** (`poll.reload()`), so the tile reads the room's own sentence within about a second instead of `This chat is closed.` for up to 20 s. If that read fails the tile says `This chat is closed.` until the next full read.
3. The desktop `<nav>` of `RoomChips` carries `flexShrink: 1` and `minWidth: 0`, which 4c.4 does not name: without them `flexWrap` can never trigger inside the club header's row.
4. `HoverActionsProps` has one prop beyond 6.4, `label?: string`; the file also exports `HOVER_ACTIONS_CSS`.
5. The pill shows on keyboard focus, not on plain `:focus-within` (6.4's word): a mouse click on a focusable row would otherwise leave a pill up on every clicked row.
6. A row with no handler (a removed-content card, a `temp_` row) still gets a bare `position: relative` wrapper (no pill, no Tab stop), so the bubble is not remounted when its row turns real. The menu also answers Up / Down.
7. The phone's `ReportSheet` and `useLayerHistory` in `RoomThread` share one stable `closeReport` handler with the desktop dialog (no behaviour change on the phone).
8. Integration edits 3 and 4 above (the tray's history entry and the "+"'s turn on desktop).
9. This batch's first builder's own list did not reach the integrator; items 4 to 6 are read from the code.

### W3-3-forms: sheets become dialogs and popovers

Files: `club/BoardView.tsx`, `club/BoardPost.tsx`, `club/RsvpSheet.tsx`, `compose/CardSheet.tsx`, `compose/CardTray.tsx`, `cards/EventCardView.tsx`.

```ts
// club/BoardView.tsx: props unchanged
export type BoardViewProps = { poll: RoomPoll; roomId: string; night: boolean; now: Date; onOpenEventChat: (roomId: string) => void; scrollToken: number; paused?: boolean };
export function BoardView(props: BoardViewProps);

// club/BoardPost.tsx: two new optional props (onRemoveReply, onReportReply)
export type BoardPostProps = { post: ChatMessage; roomId: string; room: ThreadRoom | null; viewer: ViewerInRoom | null; viewerId: string | null; night: boolean; now: Date; refreshToken: number; onCard: RoomPoll["replaceCard"]; onRefresh: (createdAt: string) => void; onOpenEventChat: (roomId: string) => void; onRemove?: () => void; onReport?: () => void; onRemoveReply?: (reply: ChatMessage) => void; onReportReply?: (reply: ChatMessage) => void; onToggleReaction?: (emoji: string) => void; onReplied: () => void; onMissing: () => void };
export function BoardPost(props: BoardPostProps);
// file-local: MoreMenu({ night, at, onReport, onRemove }) with at: "byline" | "replyTouch" | "replyPointer"

// club/RsvpSheet.tsx: props unchanged
export type RsvpSheetProps = { eventId: string; current: EventRef["viewer_status"]; night: boolean; onClose: () => void; onChanged: () => void };
export function RsvpSheet(props: RsvpSheetProps);

// compose/CardSheet.tsx: props unchanged (the form helpers CloseX, PlusIcon, MinusIcon, fieldStyle, FieldLabel, Counter, AddButton, RemoveButton, Switch too)
export const CONTENT_BLOCKED_LINE: string;
export type CardPost = { posting: boolean; field: string | null; clearField: () => void; post: (body: CreateCardBody) => Promise<void> };
export function useCardPost(args: { roomId: string; failure: string; onPosted: (message: ChatMessage) => void; onReload: () => void; onClose: () => void }): CardPost;
export type CardSheetProps = { title: string; roomLine: string; orgId?: string | null; night: boolean; cta: string; ctaDisabled: boolean; posting: boolean; onSubmit: () => void; onClose: () => void; returnFocusTo?: React.RefObject<HTMLElement | null>; ctaGap?: number; children: ReactNode };
export function CardSheet(props: CardSheetProps);

// compose/CardTray.tsx: one new optional prop (anchorRef), as 6.3 pins it
export type CardTrayKind = "poll" | "signup" | "event";
export type CardTrayProps = { roomKind: RoomKind; roomName: string; clubName: string; open: boolean; onClose: () => void; onPick: (kind: CardTrayKind) => void; anchorRef?: React.RefObject<HTMLButtonElement | null> };
export function trayCaption(roomKind: RoomKind, roomName: string): string;   // not edited
export function CardTray(props: CardTrayProps);

// cards/EventCardView.tsx: props unchanged; after a successful RSVP write it also calls emitCalendarChanged() (from @/components/LeftNav), on both surfaces
```
How it behaves:
- **`BoardView`.** Both surfaces: Remove and Report now reach text posts and replies (the handlers go to `BoardPost`); a removed REPLY bumps the folds' `refreshToken` and re-reads its post for the server's `reply_count`. Desktop only: the line `Announcements from <club>'s officers. Everyone in the club sees them.` above the posts (only once `room.org.name` is known), `ReportSheet variant="modal"`, and `<style>{HOVER_ACTIONS_CSS}</style>` once.
- **`BoardPost`.** Both surfaces: a "..." (`aria-label="More"`) on a TEXT post's byline and on each reply row that is not the viewer's own, opening Report and (for `can_moderate`) Remove. Desktop only: a CARD post is wrapped in `HoverActions` (React, Reply = open the fold with the reply field focused, Report, Remove), always with `isMine={false}`, inside a slot with `className="vibe-hover-list"`.
- **`CardSheet`, `RsvpSheet`.** Desktop: the same content in `DesktopDialog` (440 with `busy` while posting and the CTA in the footer; 360 titled `Your RSVP`), both with `ownsHistory={false}` (each already holds its own `useLayerHistory` entry). No vaul root is reachable on desktop. Phone: today's nested drawers.
- **`CardTray`.** Desktop: `DesktopPopover` (`anchor` = the "+", `label` = the caption, width 320, `align="start"`), no scrim, background `t.surface`. Phone: today's in-flow block and scrim.

Deviations from the contract:
1. **A card post on the desktop Board has the hover toolbar** (6.3's BoardPost row names only the "..."). Reason: `CardBubble`'s press never arms on desktop, so a card post with no reactions had no control to add the first one.
2. **The byline "..." is on text posts only, on both surfaces** (`post.kind === "text"`): a card post's Report and Remove are in the hover toolbar's More on desktop and in the long-press picker on the phone, so nothing is offered twice.
3. Side effect of 1, desktop only: `HoverActions` caps its row at 552px, so a card post on the Board is at most 552px wide; a text post runs the article's full width.
4. `BoardView` renders `HOVER_ACTIONS_CSS` itself on desktop; the toolbar row's spoken name on the Board is `Message from <name>`.
5. **Phone only, part of 2.5 row 10 (d):** a reply row's "..." is a 44x44 target (it was 28x28). When at least one visible reply carries one, the Replies group uses gap 22 and padding `11px 0 3px 10px` (it was gap 6, `0 0 0 10px`), so one-line replies sit 44px apart and no target overlaps another. A fold holding only the viewer's own replies keeps gap 6. Desktop reply rows keep the 28px box and gap 6.
6. `CardTray` reads the "+" node through `useSyncExternalStore` on the ref instead of the contract's literal `anchorRef?.current ?? null` (the lint rule against reading a ref while rendering); same node.
7. A card post refused with `room_posters_only` also re-reads the room (integration edit 2).
8. `emitCalendarChanged()` runs on the phone too after an RSVP from an event card (it dispatches a window event nobody on the phone listens to).

### W3-3-bridge: the dm bridge

Files: `public/html/messages.html`, `public/html/_miniMessenger.js`, `public/html/_sharePicker.js` (one row), `src/components/desktop/messages/LegacyThreadPane.tsx` (new).

```ts
// dm/LegacyThreadPane.tsx ("use client")
export const LegacyThreadPane = forwardRef<LegacyThreadPaneHandle, LegacyThreadPaneProps>(function LegacyThreadPane({ threadId, night, onEvent }, ref));
// LegacyThreadPaneProps  = { threadId: string | null; night: boolean; onEvent: (event: DmPageEvent) => void }      (contracts.ts, unchanged)
// LegacyThreadPaneHandle = { jump(messageId): void; pinsChanged(): void; setPanel(open): void; focus(): void }    (contracts.ts, unchanged)
```
`LegacyThreadPane`, as built:
- Its root is `position: absolute; inset: 0`: the shell must mount it inside a `position: relative` box that has the pane's size. Hidden (`threadId === null`) is `visibility: hidden; pointer-events: none`.
- The frame's `src` is `paneSrc()`, frozen at mount. Commands wait in a queue until `ready`; while not ready an `open` replaces whatever waited and a `close` empties the queue.
- `threadId` a string -> `open` and `iframe.contentWindow.focus()`; null -> `close`, and the frame is blurred if it held the focus.
- No `ready` within 8 s of mount or of Retry: `LoadFailed` with `Couldn't open this chat.` and Retry over the frame (Retry remounts the frame with a new key and queues an `open` for the current chat). A late `ready` clears the line and flushes the queue.
- **Every valid event is handed to `onEvent`, `ready` included.** A `ready` with no `open` waiting (the page loaded again by itself) makes the pane send `open` for the current chat again.
- `onEvent` is kept in a ref: an inline arrow from the shell does not re-bind the window's listener.

The page (`messages.html`), pane mode only unless said. Names: `IS_PANE` (`IS_EMBEDDED &&` the `vibe-pane` class, set by the second head script on line 5 from `?pane=1`), `__paneSay(type, extra)`, `__dmLoadList(opts)` (`opts.fromTimer`), and `__paneListStale`, `__paneListLoaded`, `__paneCloseOverlays`, `__paneHideChat`, `__paneLost`, `__paneClosed`, `__paneNewFromOthers`, `__paneReadAgain`, `__paneOpening`, `__paneOpened`, `__panePinsAllowed`, `__panePinSig`, `__panePinsLoad`, `__panePinsPaint`, `__panePinToggle`, `__paneFocusNote`, `__paneRowOf`, `__paneFocusBack`, `__paneOpen`, `__paneCloseChat`, `__paneJump`, `__panePanelState`. State on `__realDM`: `paneWanted`, `panePins` (a Set, or null), `panePinsFor`, `panePinsOff`, `panePinBusy`, `paneListSeq`, `paneListApplied`. Markup: `#cPinsBtn` (inline `display:none`, shown by the one `!important` pane rule, hidden by `data-off`), `data-mid` on `.msg-row`, `tabindex="0"` on `.dm-bubble-wrap`, `button[data-pin-msg]` in the pill.
- What it says and hears is `dm-bridge.ts`' twelve events and five commands, field for field (read on both sides by the integrator). In pane mode the list read is `GET /api/me/threads?scope=chats`; the pinned ids come from `GET /api/me/threads/<id>/message-pins`; the pin button calls `PUT` / `DELETE /api/me/threads/<id>/messages/<mid>/pin`.
- `opened.kind` is `"group"` when the thread record is a group, else `"dm"`. `open-failed.message` is always `Couldn't open this chat.` `closed` and `open-failed` carry the `channelId` they are about.
- Esc in the page: its own overlay closes first, then the composer loses focus, then `escape`. A handled Esc is skipped by `e.defaultPrevented`.

Deviations from the contract:
1. **`_miniMessenger.js` is changed by 14 lines, not one**: `state.postLine` printed as the quiet line (2.5 row 6 for the profile page's chat bubble). Its refused send needs no new code: the 2-second poll's thread read now carries `post_line` and paints the composer.
2. Runs outside pane mode too (5.2 item 10): the thread record's `postLine` and its print in `__dmPaintComposer`; `room_posters_only` in `__DM_CHAT_REFUSALS` and in `__dmSend`'s refused-send catch (it sets `canPost` false and uses the server's sentence until the next read); the `/read` POST's `.then` that calls `__paneSay` (which returns at once outside pane mode).
3. Pane mode only, beyond 5.2's sixteen items: the first paint waits up to 300 ms for the pinned ids; list loads are numbered and a stale answer is dropped; a text bubble stack's inline `max-width` is `min(70%, 520px)` (the inline `70%` would beat 5.1's stylesheet rule); keyboard focus is put back on the same message after the rows are rebuilt, and the composer is focused on open, both ONLY while `document.hasFocus()` (so a late paint never takes the keyboard from a shell dialog or closes a shell popover).
4. Pane mode only: the Community Guidelines link in a removed-message notice opens in a new tab (`target="_blank" rel="noopener"`); a group-photo upload reopens the chat only if it is still the active one, and switching chats cancels an open photo cropper.
5. `_sharePicker.js` gained the `room_posters_only` row (outside the batch entry; see above).
6. No test was added for the page's focus guards (the batch owns no test file).

### W3-3-campus: Campus > Chat leaves the desktop

Files: `src/app/campus/page.tsx`, `src/app/campus/CampusSwitch.tsx`, `src/app/campus/campus-home.tsx` (75 changed lines).

```ts
// src/app/campus/page.tsx
export default async function CampusPage({ searchParams }: { searchParams: Promise<{ school_verified?: string; tab?: string | string[]; channel?: string | string[] }> });
// src/app/campus/CampusSwitch.tsx
export function CampusSwitch({ showSchoolVerifiedBanner, desktopChat = false }: { showSchoolVerifiedBanner: boolean; desktopChat?: boolean });
// src/app/campus/campus-home.tsx
export function CampusHome({ showSchoolVerifiedBanner, desktopChat = false }: { showSchoolVerifiedBanner: boolean; desktopChat?: boolean });
// module-private: stripManageParam(); CampusTopBar gains hideChat: boolean; CampusTabs gains hideChat?: boolean
```
How it behaves:
- `page.tsx`: `enforceCampusAccess("/campus")` (the bare path, as pinned), then `chatDesktopFor(userId)`. With the switch on and (`tab === "chat"` or a non-empty trimmed `channel`): `redirect("/messages" + (channel ? "?channel=" + encodeURIComponent(channel) : ""))`; `org=` is dropped. `desktopChat` goes to `CampusSwitch`, which hands it ONLY to `CampusHome`.
- `CampusHome` with the switch on: no Chat pill; an initial `tab=chat` becomes `feed`.
- **The `?manage=<handle>` door** (switch on only): read once on mount. When the clubs load it is consumed: a handle that matches one of my clubs (case-insensitive) selects it and opens the settings modal over whatever tab shows; no match does nothing. Either way `manage` is removed from the address with `history.replaceState` (the other parameters stay). A match wins over `?org=`.
- The old composer's quiet line prints `roomRules.viewer.post_line` when present (both switch states; no server sends one until a room is restricted).

Deviations from the contract:
1. **`?manage=` is stripped from the address once used** (section 7 only says "read once on mount"). Without it Back, a refresh or a remount opened the settings again. The strip is a small helper beside `stripWelcomeParam`.
2. `tab` and `channel` are typed `string | string[]` and read through a `first()` helper; `channel` is trimmed.
3. `CampusSwitch`'s `desktopChat` is optional with a default of false (the contract gives the default only for `CampusHome`).
4. Until the clubs load (or if that load fails), `manage` stays in the address; a Retry that succeeds opens the modal once.

### Seams read on both sides

- `RoomComposer` -> `CardTray`: `anchorRef={plusRef}` (`useRef<HTMLButtonElement | null>`) against `anchorRef?: React.RefObject<HTMLButtonElement | null>`. Matched. The history entry of the tray on desktop: fixed (integration edit 3).
- `RoomThread`, `BoardView`, `BoardPost` -> `HoverActions`: the props, `HOVER_ACTIONS_CSS` rendered once per list, `vibe-hover-list` on the rows' container. Matched.
- `RoomThread`, `BoardView` -> `ReportSheet variant="modal"`: the stable `onClose`. `BoardView` fixed (integration edit 1).
- `RoomComposer`'s refused send and `CardSheet`'s refused card: now the same rule for `room_posters_only` (integration edit 2).
- `CardSheet`, `RsvpSheet` -> `DesktopDialog` (`ownsHistory={false}`, each holds its own entry); `CardTray` -> `DesktopPopover`. Matched against `contracts.ts`.
- `LegacyThreadPane` -> `contracts.ts` (props, handle) and `dm-bridge.ts` (`paneSrc`, `parsePageEvent`, `shellMessage`, `fromFrame`). Matched. The page's sixteen `__paneSay` calls and its five command branches against `DmPageEvent` / `DmShellCommand`: names and fields matched.
- The page -> wave 2's routes (`message-pins`, `messages/<id>/pin`, `threads?scope=chats`). URLs and methods matched. Not run.
- `page.tsx` -> `enforceCampusAccess`'s `{ userId }` and `chatDesktopFor`; `CampusSwitch` -> `CampusHome`. Matched.
- `helpers.ts` -> `roomDisplayName` (`@/lib/chat/room-names`, pure, so `node --test` still loads the file). Matched.
- The sentence `Only some people can post here.` is the same in `REFUSAL_SENTENCES`, the page, the mini messenger and the share picker.

### What the next waves must know

**Wave 4**
- **W3-4-shell, the Esc rule (3.5 rule 9). Three things the pieces do NOT do for you:**
  1. Put the listener on `window`, bubble phase. In the App Router React's root is `document`, so `HoverActions`' and `DesktopDialog`'s `stopPropagation` (made from React handlers) stops the key before `window` but NOT before another listener on `document`. Also return when `e.defaultPrevented`.
  2. Return while `desktopLayerOpen()`.
  3. Return while `document.querySelector('[aria-modal="true"]')` finds something. Two layers of this wave close on Esc WITHOUT stopping it and without registering as a desktop layer: `RemoveConfirm` (`role="alertdialog" aria-modal="true"`) and the Report dialog (`ReportSheet variant="modal"`, `role="dialog" aria-modal="true"`, a `document` keydown listener). Without this check Esc cancels either one and also sends the shell home.
- W3-4-shell, `onEvent`: give the switch a no-op default (`ready` is forwarded). Ignore `closed` and `open-failed` whose `channelId` is not the open thread (a message already posted can cross a click on another chat; a late `closed` for A must not throw the person out of B). A send produces `activity` + `list-changed` and an arrival produces `activity` + `read`: coalesce the `refreshKey` bumps if the list read is not already debounced.
- W3-4-shell: mount `LegacyThreadPane` in a `position: relative` box of the pane's size (its root is absolutely positioned). It focuses the frame on every new `threadId`; call `handle.focus()` only for your own reasons.
- W3-4-shell: `GET /api/me/threads` can answer 200 with a request missing from the list when its last-message read soft-fails (`threads/route.ts`, about line 688). `knownChat` false and the page's `lost` can therefore be false negatives; do not treat one "not in the list" as final without the page's `open-failed`.
- W3-4-shell: provide `<ChatSurfaceContext.Provider value="desktop">` around everything from `club/`, `cards/`, `compose/`. Every desktop branch of this wave keys on it; without it the pieces render their phone form (and the nested vaul sheets throw with no drawer above them).
- W3-4-phonepins: build on this wave's `MessageBubble.tsx` and `ReactionPicker.tsx`. `MessageBubble` now reads `useChatSurface()`; your `onPin` row belongs to the phone surface. `REACTION_EMOJIS` is exported; do not change the array (`reaction-emoji.test.ts`).
- W3-4-phonepins, `ConversationView.tsx:339`: the refused-send check there still flips "cannot post" only for `board_officers_only` / `room_closed`. Add `room_posters_only` when you add the `post_line` line (the page and the club composer already have it).

**Wave 5**
- **W3-5-club, the header row and the chips.** `RoomChips`' desktop `<nav>` can shrink and wrap, but only inside a width it is given. In the header's row: no fixed height (the nav is `minHeight: 45` and may be two or three lines); the `+` and the panel toggle `flexShrink: 0`; the left block (mark, name, hat line) something like `flex: "0 1 auto"` with `minWidth: 0` and an ellipsis; the nav takes the rest. Chips are start-aligned inside the nav: pushing them right is the header's `justifyContent` or margin.
- W3-5-club: pass an event chat's id as `activeRoomId` (on desktop the chip is then drawn selected). `RoomThread` and `BoardView` render the toolbar's CSS and mark their own lists: nothing extra to mount. Anyone ELSE who mounts `HoverActions` must render `<style>{HOVER_ACTIONS_CSS}</style>` once and put `vibe-hover-list` on the rows' container.
- W3-5-club: `RemoveConfirm` is `position: fixed` in the tree (not portalled, z-index 1150), and `vibe-hover-list` is a size container. Give no ancestor of `RoomThread` / `BoardView` in the pane a `transform`, `filter`, `contain` or `container-type`, or the confirm is placed against that box instead of the window. Render nothing `position: fixed` inside a thread row.
- W3-5-club: `RoomComposer` needs `poll` with `reload` (it calls it after a `room_posters_only` refusal); pass the hook's own object.
- **W3-5-club / W3-5-panel, `Manage club`: the link is exactly `/campus?manage=<handle>`, a plain `<a href>`.** No `tab=`, no `channel=` beside it (either one triggers the server redirect back to `/messages` before the door is read). A sign-in or Terms detour loses `manage=` (the gate's path is the bare `/campus`, pinned).
- W3-5-panel: `RsvpSheet` on desktop is already the 360px dialog; mount it as the phone does (`eventId`, `current`, `night`, `onClose`, `onChanged`). The sheet itself does NOT call `emitCalendarChanged()` (only the event CARD does): route its `onChanged` to your `onRsvpChanged`, where the shell emits (3.3), or the week band and My Calendar stay stale after an RSVP made in the panel.
- W3-5-pins: the page hides `#cPinsBtn` with `data-off` in a pending request and when the pins read answered 404; the shell hears `pins-toggle` only when the button is shown.

**The orchestrator and the planner** (`contract.md` is read-only for builders; none of this was applied to it)
- 6.3, the BoardPost / BoardView rows: add that on desktop a card post is wrapped in `HoverActions`, that `BoardView` renders `HOVER_ACTIONS_CSS`, and that the byline "..." is for text posts only. 2.5 row 10 (d): add that the phone's reply fold spaces rows 44px apart when a reply carries a "...". Section 10: add the Board card's toolbar and its 552px width to parts C and H, the reply spacing to part G.
- 6.3's owners line says the three card views are NOT edited; its table and section 8 give `cards/EventCardView.tsx` to W3-3-forms (one import, one call). Fix the owners line.
- 4c.4: the refused-send rule is `refusedSend` in `helpers.ts`, and both a refused send and a refused card re-read the room after `room_posters_only`.
- 6.4: the pill shows on keyboard focus (`:focus-visible`), not `:focus-within`; `label` and `HOVER_ACTIONS_CSS` are part of the file's interface.
- 5.1: the bubble cap is written inline in pane mode (the stylesheet rule alone cannot beat the stack's inline `max-width:70%`). 5.4: `ready` is forwarded to `onEvent`.
- Section 7: `?manage=` is stripped once used.
- Section 8, W3-3-bridge: confirm the wider edit of `_miniMessenger.js` (or say to cut it back to the one row) and record `_sharePicker.js`'s row as the batch's.
- **A test nobody owns yet**: a source-reading test (the style of `theme.test.ts`) that pins, in `messages.html`, `document.hasFocus()` inside `__paneFocusNote` and `__paneOpened`, and that a link in a message row carries `target="_blank"` in pane mode. Give it to a wave-4 batch.
- **Open, no batch's file**: a double click on the hover menu's `Remove` or `Report` opens the confirm or the Report dialog and the second click lands on its scrim and closes it at once (nothing is removed or sent). The fix is in the two scrims (ignore a click with `e.detail > 1`): `RemoveConfirm` (pinned as not edited) and `ReportSheet.tsx` (no batch).
- **Open, a gap in the design**: on a touch laptop or an iPad at 900px or wider the desktop surface has no long press, and the pill needs hover or the keyboard. Decide before launch whether such a device matters.
- `public/html/_imageCropper.js` (not owned) disables its Cancel while saving, so a chat switch in that moment cannot close the cropper; the photo still saves to the right group and the pane stays on the new chat.
- Still true: `src/proxy.ts`, `public/sw.js` and `_postViewer.js` are untouched; `node scripts/check-pwa.mjs` against `next dev` is the orchestrator's walk item.

### Walk (DEFERRED: nobody opened a browser or started a server in wave 3)

Phone, 375px, `chat_v2` on (2.5 row 10; section 10 part G):
1. The chips row is unchanged (45px, hairline, 12px sides, sideways scroll), with the megaphone on Board and the lock on a private room; an extra room's name reads as words on the chip, in the placeholder, in the "+" tray's caption and on the three card sheets.
2. The "+" tray and its three sheets still slide up; the RSVP sheet; the long-press picker on a message and on a card (a card post has no byline "...").
3. A Board text post's "..." and a reply's "...": five one-line replies from other people sit 44px apart, each "..." is easy to hit, the first does not fire when pressing the replies toggle nor the last when pressing Send reply; a fold with only my own replies keeps the tight rhythm; the jump when someone else's reply arrives; a two-line reply; the menu's flip at the foot of the list.
4. An officer sets an extra room to `Only officers` while a member has it open; the member sends: the toast `Only some people can post here.`, then within about a second the tile `Only officers post here.` The same from a card sheet (poll, sign-up, event). With the network off for the re-read: `This chat is closed.` until the next full read.

Desktop (after wave 5 mounts the club; section 10 parts C and H):
5. The hover pill: where it sits on a first-of-run row from someone else and on a narrow pane; the 150 ms hide; the emoji row's and the menu's flip near the thread's top; whether the sticky top fade paints over it; text selection and a slow click on a message and on a card; Light and Night.
6. The toolbar by keyboard: Tab to a row, Enter, Left / Right, Esc stops at the row and never closes the chat. The same on a Board card post.
7. Report from the hover menu: type in the details box for more than 20 s while messages arrive: the caret stays (thread AND Board). Esc and Back each close the dialog alone; focus lands in it; Tab stays inside.
8. Remove confirm and Report dialog: Esc closes them and NOT the chat (needs wave 4's Esc rule as written above).
9. At 1024px, a club with Lounge, Board, Officers, two event chats and five extra rooms: the chips wrap inside the header, every room can be clicked, none runs under the `+` or the panel toggle.
10. The "+" popover: opens upward from the "+", does not move when the thread scrolls under it, no scrim, Esc / outside press / Back each close it with ONE Back step, a second Back leaves the chat; focus returns to the "+". The three card dialogs and the RSVP dialog: focus return, Back, Esc, `Posting…` blocks closing.
11. The Board: the Announcements line; a card post at most 552px wide beside full-width text posts, no sideways scrollbar; the first card under the line opens its emoji row downward.

The dm bridge (section 10 part D, all of it), plus:
12. Open a dm, click a bubble, press New in the shell and type while a message arrives in the open dm: the field keeps the keyboard, no popover closes. Click a name in the slim list and at once open the month popover: it stays open when the messages land. Opening a chat still puts the cursor in the composer, including on a deep link while the frame boots.
13. Pin by keyboard (Tab to a message, Enter on Pin, focus returns to the same message); the 300 ms hold on open; the pinned-row flash in Light and Night; one cursor at 900 and 1024.
14. As the author of a moderator-removed message, Community Guidelines opens a new tab and the pane stays. Group A, change photo, cropper open, click chat B: the cropper closes; during an upload the pane stays on B.
15. As a plain member, open an officers-only extra room from the profile page's chat bubble: the quiet line is the room's own sentence.
16. `node scripts/check-pwa.mjs` against `next dev`.

Campus (section 10 part F):
17. Switch on: `/campus?manage=sae` opens the settings modal and the address becomes `/campus`; close it, open a profile, Back: no modal; refresh: no modal. `/campus?manage=<not my club>`: nothing opens, `manage` leaves the address. `/campus?manage=sae&tab=events`: the modal over Events, `tab=events` kept. Back from `/campus` after Manage club returns to `/messages`.
18. Switch on: `/campus?tab=chat` and the club page's rooms link land on `/messages`; Back returns to the page before. The top bar with four pills. A pending campus tour starts once.
19. Switch off: Campus > Chat by eye as before; `/campus?manage=sae` does nothing and keeps the parameter.

## Wave 4

Integrated Sat Oct 3, 2026. Four batches: W3-4-shell, W3-4-week, W3-4-lists, W3-4-phonepins. The shell, the home and the phone's pins. With this wave a person with `chat_desktop` on gets the new `/messages` on a laptop: the week band, the wide list, the slim list, New, and a dm or group in the one frame. A CLUB opens to an empty pane and the Pinned and Shared panel opens to an empty 288px column: `ClubPane` and `PinsPanel` are placeholders until wave 5 (nothing is deployed between waves). On a phone with `chat_v2` on, a dm or a group gains `Pin message` / `Unpin message`, `Pinned messages` and `Unpin from top` (2.5 row 10 (f); inert until the pins table is in that database). Not committed, not pushed, not deployed. No migration in this wave; nobody touched a database, local or production.

### The gate (run in the worktree after all four batches and the integrator's two edits)

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` | 2,027 tests, 2,027 pass, 0 fail (the same count as after wave 3: section 9 gives wave 4 no test file, and no batch added one) |
| `npx eslint <the 15 files of the wave>` | exit 1 with 2 errors, both in `src/components/mobile/MessagesMobile.tsx` (`:682` react-hooks/immutability, `:735` react-hooks/set-state-in-effect), both in `MessagesMobileV1`, both in the committed file too (`git show HEAD:... \| eslint --stdin` gives the same two, one line up): map 05's baseline of 2 errors. The other 14 files: no problem |
| `npm run build` | exit 0 (`✓ Compiled successfully`; `/messages` and `/campus` are dynamic routes) |

Nothing here ran in a browser. `use-desktop-open.ts`, the band's fit, the New dialog's group rule and the phone sheet's two rules have no test (they sit in `.tsx` / hook files `node --test` cannot load): they are covered by typecheck, lint, build and reading only.

### Files of the wave (15: 6 changed, 9 new)

Changed: `src/components/desktop/messages/MessagesDesktop.tsx` (wave 1's stub replaced), `src/components/mobile/MessagesMobile.tsx` (one line), and under `src/components/mobile/messages/`: `ConversationView.tsx`, `ConversationActionSheet.tsx`, `MessageBubble.tsx`, `ReactionPicker.tsx`.

New: under `src/components/desktop/messages/`: `use-desktop-open.ts`, `ClubPane.tsx` (placeholder), `PinsPanel.tsx` (placeholder), `WeekBand.tsx`, `MonthPopover.tsx`, `InboxWide.tsx`, `SlimList.tsx`, `NewChatDialog.tsx`; and `src/components/mobile/messages/PinnedSheet.tsx`.

Every file belongs to a batch; none was changed outside the batches' lists. Not edited (empty `git diff`): `contracts.ts`, `desktop-rules.ts` and its test, `dm-bridge.ts`, `DesktopDialog.tsx`, `LegacyThreadPane.tsx`, `home/MessagesHome.tsx`, `home/MonthBody.tsx`, `use-message-pins.ts`, `layer-stack.ts`, `use-layer-history.ts`, `CampusMobile.tsx`, `public/html/*`.

### Integration edits (two, one rule, both on the seam between the shell and a sibling)

The shell re-lays the page on the first click of a double click (the wide list tucks to 232px, the band folds from 76 to 44), so the second click lands on a different control that has just arrived under the pointer. By the approved pictures: a double click on the wide list's first row lands on the slim list's third row and opened THAT chat; a double click on the band's first card lands on the folded band's third item.
1. `SlimList.tsx`, the row's click handler: `if (e.detail > 1) return;` after `preventDefault()`. A key press counts 0, so Enter still opens.
2. `WeekBand.tsx`, `roomLink`'s click handler (cards and folded items): the same line.
The `Messages` control needs none: `goHome` already answers one press at a time, and no wide-list row sits under it.

### W3-4-shell: the shell and its state

Files: `MessagesDesktop.tsx`, `use-desktop-open.ts` (new), `ClubPane.tsx` and `PinsPanel.tsx` (placeholders: the FINAL props from `contracts.ts`, `return null`).

```ts
// use-desktop-open.ts ("use client")
export type DesktopOpen =
  | { kind: "home" }
  | { kind: "resolving"; id: string }
  | { kind: "club"; orgHandle: string; roomId: string; roomKind: RoomKind | null; initialPage: ThreadMessagesResponse | null }
  | { kind: "dm"; threadId: string };
export type DesktopOpenApi = { open: DesktopOpen; filter: HomeFilter; setFilter: (filter: HomeFilter) => void; openThread: (threadId: string) => void; openClub: (orgHandle: string, roomId: string, roomKind: RoomKind | null) => void; openById: (id: string) => void; switchRoom: (roomId: string, roomKind: RoomKind | null) => void; goHome: () => void; fail: (message: string) => void };   // 3.5's text, unchanged
export function useDesktopOpen({ initialChannelId, known }: { initialChannelId?: string; known: (id: string) => KnownChat | null }): DesktopOpenApi;

// MessagesDesktop.tsx ("use client"; mounted by MessagesSwitch through next/dynamic, ssr: false)
export function MessagesDesktop({ initialHandle, initialChannelId }: MessagesDesktopProps);

// ClubPane.tsx, PinsPanel.tsx (placeholders)
export function ClubPane(props: ClubPaneProps): null;
export function PinsPanel(props: PinsPanelProps): null;
```
How the shell is laid out (what wave 5 mounts into):
- Root: `height: 100vh`, a flex column, inside `<ChatSurfaceContext.Provider value="desktop">` (the New dialog and both right panels are inside it too). `WeekBand` (`folded={open.kind !== "home"}`), then the body row (`position: relative`, measured by the shell's one `ResizeObserver` -> `contentWidth`, the row's whole width, slim list included).
- Body row: `InboxWide` at home, `SlimList` otherwise; then the PANE BOX (`flex: 1`, `position: relative`), one element for the page's life. In it: the empty stage (home), the skeleton (`resolving`), `ClubPane` inside `<div style={{ position: "absolute", inset: 0, display: "flex" }}>` with `key={open.orgHandle}`, and the dm frame (`LegacyThreadPane`, mounted once and never moved: when both list reads have settled, or at once when the address names a chat or carries `?to=`).
- The Pinned box: a third item of the body row, only for a dm with the panel open: `width: 288`, `display: flex`, `background: t.page`; `flex: 0 0 288px` when `panelMode(contentWidth, 288, null, true)` says `side`, else `position: absolute; top: 0; right: 0; bottom: 0; z-index: 2` (no scrim). One element in both modes.

What the shell hands `ClubPane` (all stable callbacks): `orgHandle`, `roomId`, `roomKind`, `initialPage` (non-null ONLY for a room opened by the resolving read: a deep link, a refresh, Back onto an unknown id; it always belongs to `roomId`), `night`, `contentWidth`, `onSwitchRoom` = `switchRoom` (rule 3's `replaceState`; the pane is NOT remounted, `roomId` / `roomKind` change as props and `initialPage` becomes null), `onLost(message)` = go home + an error toast with that message, `onOrg` (kept only when a field moved), `onListsChanged` = bump `refreshKey`, `onRsvpChanged` = `emitCalendarChanged` (the shell itself listens for `CALENDAR_CHANGED_EVENT` and re-reads the week on screen).

What the shell hands `PinsPanel`: `threadId`, `title` (the open slim row's name: the thread's title, else `Direct message` / `Group` until the lists know it), `night`, `mode` (`"side"` | `"overlay"`), `refreshToken` (moves on the page's `pins-changed` for the open chat), `missedId` (set by `jump-missed`, cleared by the next `onJump` and by every change of chat), `onClose`, `onJump` (-> `handle.jump`), `onChanged` (-> `handle.pinsChanged`). The panel opens and closes on the page's `pins-toggle`, closes on `info-opened` and on every change of the open chat; after every change the page is told `setPanel(open)`.

`refreshKey` moves: when the open chat changes or closes (not on home -> chat, not on a room chip), after a dm or group is created (`?to=` and New), on `onListsChanged`, and at most once per 600 ms for the page's `read` / `activity` / `list-changed` / a `closed` for another chat.

Deviations from the contract:
1. **`useSearchParams` is imported in `use-desktop-open.ts`** (from `next/navigation`; the Agent line bans only `router.push` / `router.replace` / `useRouter`, which are absent). It is a trigger only. Reason: a Next link to `/messages` followed while the shell is up (the left nav's `Messages`) keeps the page mounted and fires no `popstate`, so the screen kept the chat under an address that names the home. An effect keyed on the query reads the LIVE entry and applies rule 5 with no history write: no id -> the home (and the filter the address names, also when only `?tab=` differs at home); another id -> `homeBelow = false` and `reveal(id)`. After the hook's own writes it finds the address and the screen in agreement and does nothing.
2. **Nothing is written, opened or toasted once the shell is gone.** `onPage()` is `mounted && pathname === "/messages"`; `fail()` after unmount does nothing (the contract says home + toast), and `openThread` / `openClub` / `openById` / `setFilter` / `goHome` return. `MessagesDesktop` keeps its own `aliveRef` for the `?to=` POST and the "page gave up" read. `DesktopOpenApi` was not widened.
3. **A week card or a month plan row whose entry names its club does not go through `openById`.** It calls `openClub(handle, room_id, "event")`, or `switchRoom(room_id, "event")` when that club is already open (handles compared case-insensitively, so the pane's key never changes on spelling). So `initialPage` is null for these opens and a room that cannot be read surfaces through `ClubPane`'s `onLost`, not the shell's `Couldn't open this chat.` `openById` stays for an entry with no club.
4. `fail()` with the home's entry underneath steps back (rule 4) instead of `replaceState("/messages")`: no second home entry is left and the filter is kept. Otherwise it is the contract's write (and the filter returns to All).
5. Rule 1 keeps a fallback timer (`SETTLE_MS + 600` ms) after `adoptLayerEntry()` in case the landing `popstate` never comes.
6. Rule 5 sets `homeBelow` true on Forward from the home onto the entry just left (`aboveHomeRef`); the contract only says false for the home.
7. Rule 6's filter write goes through `clearLayersThen` although the contract excepts it (a popover closing on the same click would otherwise take the write on its own entry).
8. Rule 9 also records whether a layer was showing in a CAPTURE listener at the start of the key's path (`RemoveConfirm` and the Report dialog are gone from the page by the time the key reaches `window`); Esc that ends an IME composition and a held key are ignored.
9. The page's `open-failed` and `closed: lost` are not believed at once: one thread read (`?limit=1`), and when it still answers, the frame is told to open the chat again, once per 60 s; a second "gone" stands. (Wave 3's note: the page's list can be short by a soft failure.)
10. `Couldn't open that conversation.` (the phone's line for a failed `?to=`) is a shell string outside 6.5; the empty stage's two lines are 3.2's.

### W3-4-week: the band and the month

Files: `WeekBand.tsx`, `MonthPopover.tsx` (both new).

```ts
export function WeekBand({ data, folded, night, onOpenRoom }: WeekBandProps);
export function MonthPopover({ anchor, initialDay, now, night, onClose, onOpenRoom }: MonthPopoverProps);   // onClose(picked: Date | null), once per close
// file-local in WeekBand.tsx: sentenceClip(folded), plainClick(e), entryDay(e), fitOf(count) (inside the component), StepButton, BandCard, BandItem, BandFailure, roomLink
// file-local in MonthPopover.tsx: MonthTitle
```
How it behaves:
- **The band** is a `<section>` 76px tall (44 folded, the height animates 320 ms), side padding 24. The left block (title button, the two arrows, the `This week` pill, the seven days; folded: the title alone) never shrinks. One `ResizeObserver` measures the band's box and that block; what follows is drawn only when at least 48px is left.
- **The fit** is `bandFit(measured band + 8, measured left block, count)` (`fitOf`): the rule counts a gap after every slot and the row's last one has none. Checked by the integrator with a throwaway script (not committed): `bandFit(784, 540, 2)` -> 1 card + `+1`, `bandFit(176, 0, 1)` -> 1 card, `bandFit(175, 0, 1)` -> `+1`, and for every room from 48 to 1400 and 0, 1, 2, 3, 6, 12 events the cards (168 each), the chip (48) and the 8px gaps fit the room.
- **Cards and folded items** are `<a href="/messages?channel=<room_id>">`; only a plain left click is answered here (`onOpenRoom(entry)`), and not the second click of a double click (integration edit 2). With no `room_id`: the same tile, `role="group"`, not a link.
- **The month** is always anchored to the title button, whatever opened it (the title, a day, the `+N` chip), so focus returns to the title. Every close calls `closeMonth(picked)`: the band moves to the picked day's week (or stays) and that week is read again (`data.refreshWeek`). A plan row calls the shell's `onOpenRoom`; the shell's history write closes the popover on its way (its entry becomes the chat's, 3.5 rule 2).
- The other states in the cards' place: grey cards while the week's first read is out (`fitOf(3)`), the two empty sentences with `Find events` (`/campus?tab=events`), the failure line with a pill (`BandFailure`).

Deviations from the contract:
1. **The month closes on its own anchor.** While it is open `MonthPopover` puts two native listeners on `anchor`: a click closes the month and is STOPPED (`stopPropagation`), and so is Esc pressed with focus on the title. 6.1 says a press on the anchor is the anchor's business; here the popover takes it because the picked day it hands to `onClose` lives in the popover. Stopping the click is what keeps the title from re-opening the month on the same click (React re-draws the band as closed before its own root listener runs); the title's `if (!month)` guard is the second line. Not browser-verified.
2. The title button carries `aria-expanded` (true while the month is open). Not in the contract.
3. `bandFit` is asked with the band 8px wider (above). H7 / 3.4 say the measured widths; `bandFit` itself is untouched.
4. **In the full band at narrow widths the empty state is two rows**: the sentence wraps to a second line (2-line clamp) and `Find events` / the Retry pill drops under it when the two do not fit side by side. No picture shows it. Folded: one line with an ellipsis. Under 120px of room the control is not drawn; under 48px nothing is drawn after the days.
5. The week's failure is a one-line `BandFailure` (`role="alert"`, the failure's own message; the pill is the failure's mapped action, else `Retry`), not the boxed `LoadFailed`: neither face of the band is tall enough.
6. The `+N` chip's whole spoken name is `+2` (`aria-haspopup="dialog"`): 6.5 gives no words for it.
7. The 48px and 120px thresholds are constants in `WeekBand.tsx` with no test.

### W3-4-lists: the lists and New

Files: `InboxWide.tsx`, `SlimList.tsx`, `NewChatDialog.tsx` (all new; 890 lines together against the rule of about 600).

```ts
export function InboxWide({ data, filter, night, onFilter, onOpenClub, onOpenThread, onNew }: InboxWideProps);
export function SlimList({ rows, night, onHome, onOpen }: SlimListProps);
export function NewChatDialog({ night, onClose, onCreated }: NewChatDialogProps);
// NewChatDialogProps = { night: boolean; onClose: () => void; onCreated: (channelId: string) => void }   (contracts.ts)
```
How it behaves:
- **`InboxWide`**: its root is the body row's flex item (`flex: 0 1 520px`, `min-width: 360`). It reads nothing (the shell's `HomeData`). The list switch is the phone's branch for branch, drawn with `ClubRow`, `PersonRow`, `ThreadRow` (requests), `HomeEmpty`, `HomeSkeleton`, `LoadFailed`, and `EmptyState` for requests only. Search is `searchRows` over the filter on screen; Esc in the field clears, then closes the field, and is stopped both times.
- **`SlimList`**: its root is `flex: 0 0 232px`. Rows are `<a href>` (a plain left click -> `onOpen(row)`; the open row and the second click of a double click open nothing). It decides nothing: `rows` are `slimRows(...)`.
- **`NewChatDialog`**: one person -> `POST /api/me/threads { handle }` through `vibeRequest`; several -> `{ type: "group", name?, members: <ids> }` by a hand-written `fetch` (it needs the `not_connected` ids of the refusal's body; every other failure is toasted with the same mapped line). `onCreated(channelId)`; the shell bumps the lists, opens the chat and takes the dialog away (its history entry becomes the chat's).
- **The group rule**, as section 8 and 4.1 pin it: connections are read (all pages of 50, at most 20 pages, once) the first time a SECOND person is picked; the rule applies only while two or more are picked. So a non-connection picked as the second person IS pickable, and is then flagged (a red chip with the line, the same line under their row, `Create group` disabled until they are removed); a third non-connection is unpickable (`aria-disabled`). A failed or over-long connections read counts as "no list": nobody is greyed out and the server's `not_connected` refusal is the safety net (it names the people and marks them the same way).

Deviations from the contract:
1. **Suggested people are drawn only while fewer than two are picked.** With two or more picked and an empty search the list area reads `Search above to start a new message.` Reason: `/api/me/suggested-connections` leaves out everyone the viewer follows, so nobody on it could join a group. One condition in `NewChatDialog.tsx` (`const list = q ? ... : group ? [] : suggested`); the planner may reverse it.
2. The picked people's chips and the `not_connected` sentence sit in a sticky block with the search (the chips box scrolls by itself past 124px); the group name field is below it and scrolls with the list. The block's measured height is written as `scroll-margin-top` on the rows and fields. The contract does not place these.
3. A picked person the rule holds back shows the line under their row too, and that row stays pressable (it unpicks). Only a person who is NOT picked is `aria-disabled`.
4. The wide list's search with no match reads `No matches for "<q>"`, a string 6.5 gives for the New dialog only.
5. The heading `Suggested` over the suggested people is the phone's word (`ComposeOverlay`); 6.5 does not list it.
6. Walk part B's words ("the second is unpickable") do not match this build (see the group rule above): the contract disagrees with itself; the code follows section 8 and 4.1.

### W3-4-phonepins: the phone's pins and the old-screen line

Files: `ConversationView.tsx`, `MessageBubble.tsx`, `ReactionPicker.tsx`, `ConversationActionSheet.tsx`, `PinnedSheet.tsx` (new), `MessagesMobile.tsx` (one line: `messagePins` on `MessagesMobileV2`'s `ConversationView`, `:556`; `MessagesMobileV1` and `CampusMobile` do not pass it).

```ts
// ConversationView.tsx: one new optional prop
export function ConversationView({ ..., messagePins = false }: { ...; messagePins?: boolean });
// MessageBubble.tsx, ReactionPicker.tsx: two new optional props each
onPin?: () => void; pinLabel?: string;            // the picker row between Reply and Report; `pinLabel ?? "Pin message"`
export const REACTION_EMOJIS = ["❤️", "👍", "👎", "😂", "🔥", "😮", "😢"] as const;   // untouched
// ConversationActionSheet.tsx: one new optional prop
onOpenPinned?: () => void;                        // draws `Pinned messages`; with it the chat-level row's other state reads `Unpin from top`
// PinnedSheet.tsx ("use client")
export type PinnedSheetProps = { pins: MessagePins; night: boolean; isLoaded: (messageId: string) => boolean; onJump: (messageId: string) => void; onClose: () => void };
export function PinnedSheet({ pins, night, isLoaded, onJump, onClose }: PinnedSheetProps);
// file-private: UNPIN_SETTLE_MS = 400, carried(pin), PinCard, wordButtonStyle
```
How it behaves (everything behind `messagePins`, the `post_line` items excepted):
- `pinsOn` = `messagePins` and the list entry is a dm or a group and no room kind; the hook is `useMessagePins(threadId, { enabled: pinsOn && !isRequest })` (no `pollMs`: the phone reads on open, after its own pin or unpin, and on `reload()`).
- `Pin message` / `Unpin message` in the long-press picker: on `available && pins !== null` (`pinControls`), never on a row still sending.
- `Pinned messages` in the "..." sheet: on `available && (pins !== null || failure !== null)` (`pinsSheetRow`). Opening it calls `pins.reload()` first (one GET per open).
- With `messagePins` every message row is wrapped in `<div data-mid=<id>>`, so a tap on a pin can find its row: the list scrolls it to the middle and the sheet closes. A pin whose message is not among the loaded ones opens in place to `full_text` with `That message is further back in the chat.`; a cut quote (`pinTextCut`) has `Show all`.
- `PinnedSheet` is a `Drawer.NestedRoot` with its own history entry (`useLayerHistory(true, onClose)`). Empty: `Nothing pinned yet. Press and hold a message to pin it.` A failed first read: `LoadFailed` with Retry (`pins.reload`). An author the viewer cannot read: the time alone.
- Both switch states (2.5 row 6): the quiet line under a room the viewer cannot post in is `viewer.post_line` when the server sends one (state `postLine`), and a send refused with `room_posters_only` turns the composer into that line (the refusal's own sentence until the room's is known).

Deviations from the contract:
1. **`Pinned messages` (and with it `Unpin from top`) also shows after a FIRST read that failed.** The orchestrator's rule (wave 2's note) was `available && pins !== null` for every control. With it the sheet's `LoadFailed` and its Retry could never be reached, and the phone has no timer that asks again. A database without the table still hides everything (a 404 is `available: false`, never `failure`). The long-press row keeps the strict gate. To reverse: `pinsSheetRow` -> `pinControls` at `ConversationView.tsx:1375`.
2. Opening the sheet re-reads the list (4d.6 only gives the hook's call). The phone's dm view has no live update, so the list on hand is as old as the chat's opening.
3. For 400 ms after an `Unpin`, a tap on a card's quote or on any `Unpin` is dropped (the next card has just moved under the finger; a second tap would unpin a second message for everyone). The clock is the tap's `event.timeStamp`. `Show all` is not paused.
4. A pin with no words, photo, video or post reads `Attachment` (the phone's existing word; not in 6.5).
5. After `Clear chat` the pin list is re-read only when `pinControls`.

### Seams read on both sides

- `MessagesSwitch` -> `MessagesDesktop` (`initialHandle`, `initialChannelId`; `next/dynamic`, `ssr: false`): matched. `useSearchParams` therefore never runs on the server; the build is green with `/messages` dynamic.
- Shell -> `useHomeData(refreshKey, onThreads)`: one call under `desktop/messages/`; `onThreads` is a `useCallback` whose deps never change. `HomeData`'s fields used by the band (`now`, `range`, `weekOffset`, `week`, `weekErr`, `weekSlide`, `stepWeek`, `setWeekOffset`, `refreshWeek`, `retryWeek`) and by the wide list (`threads`, `requests`, `clubs`, `threadsErr`, `clubsErr`, `retryLists`, `now`): matched.
- Shell -> `WeekBand` / `InboxWide` / `SlimList` / `NewChatDialog` against `contracts.ts`: matched field for field. `InboxWide.onOpenClub` wants `(handle, roomId, roomKind: RoomKind)`; the shell's `openClub` takes `RoomKind | null`: assignable. `SlimList.onOpen(row)`: the shell never acts on the open row's `target` (whose `roomKind` may be the placeholder `"room"`).
- `WeekBand` -> `MonthPopover` -> `DesktopPopover` + `MonthBody` (`initialDay`, `now`, `night`, `onPicked`, `onOpenRoom`, `renderTitle`): matched.
- A plan row or `onCreated` with a layer open -> the shell's `enter` -> `clearLayersInto`: the stack calls the layer's `onPop` (the popover's `close`, the New dialog's `onClose`) whatever its `canPop` says, then the layer's entry becomes the chat's (`replace`), `homeBelow` true. `MonthPopover.close` is guarded against a second call; `NewChatDialog`'s `busy` does not block it. Read in `layer-stack.ts`; not run.
- The shell's Esc rule against the siblings: the wide list's search field and the month's anchor stop the Esc they handle; `DesktopDialog` / `DesktopPopover` count as layers. Matched by reading.
- The double click across the shell's re-layout: fixed (integration edits).
- `ConversationView` -> `useMessagePins` (`pins`, `available`, `failure`, `isPinned`, `pin`, `unpin`, `reload`), `PinnedSheet`, `MessageBubble` -> `ReactionPicker` (`onPin`, `pinLabel`), `ConversationActionSheet` (`onOpenPinned`): matched. The `data-mid` wrapper is a flex item of the list's column, so the bubble's own top margin stays inside it: the rows' spacing is unchanged (by reading).
- Calm, over the nine new files and the phone diff: no hex and no `rgb(` literal except `rgba(var(--scrim-rgb), a)`; no `position: fixed` outside `DesktopDialog`; no `vaul`, `MonthSheet` or `YourWeek` under `desktop/messages/`; one glow (the band's first live card, full band only).

### What the next waves must know

**Wave 5**
- **W3-5-club, the room arrives three ways.** (a) From a click (a list row, a week card, a plan row, a slim row): `roomKind` is `"lounge"`, `"board"` or `"event"`, `initialPage` is null: the pane makes the room's first read itself. (b) From the resolving read (a deep link, a refresh, Back onto an id the lists do not know): `roomKind` is the thread read's `room.kind`, `initialPage` is that read's body and belongs to `roomId`. (c) As a PROP CHANGE on the mounted pane (your own `onSwitchRoom`, or a week card of the club already open): `roomId` / `roomKind` change, `initialPage` becomes null, nothing is remounted (the pane's key is the handle). Key the `RoomView` child by `roomId` and hand it `initialPage` as given.
- W3-5-club: a room or a club that cannot be read is YOURS to report: `onLost(message)` with the phone's words. For (a) and (c) the shell no longer shows `Couldn't open this chat.`
- W3-5-club: `ClubPane`'s root is the ONE flex item of an `absolute; inset: 0; display: flex` box: give it `flex: 1; min-width: 0; min-height: 0` and put your right panel inside it. `contentWidth` is the body row's whole width (slim list included), which is what `panelMode` expects. Until the first measure it is 0: `panelMode` then says `hidden` (or `overlay` if opened here); do not store a choice from that frame.
- W3-5-club: `onOrg` may be called after every space read (the shell keeps the object while nothing moved); `onListsChanged` and `onRsvpChanged` are stable; `onSwitchRoom(roomId, roomKind)` is rule 3's write and returns at once when `roomId` is already the open room.
- W3-5-club: the shell's Esc goes home when no layer is up and focus is not in a field. A dialog of yours that is not a `DesktopDialog` / `DesktopPopover` must carry `aria-modal="true"` while it is on screen, or stop the Esc it handles.
- W3-5-club, W3-5-panel: a link you answer in place (an event row -> its chat) should ignore the second click of a double click (`if (e.detail > 1) return;` after `preventDefault()`), as the band and the slim list now do: the pane re-lays itself under the pointer.
- **W3-5-pins**: your root is the ONE flex item of a 288px `display: flex` box whose background is `t.page` (give it `flex: 1; min-width: 0; min-height: 0` and your own scroll). In `overlay` mode the box lies over the thread with no scrim and no border: draw the left hairline yourself in both modes. `title` is the open slim row's name (`Direct message` / `Group` until the lists or the page name the chat). `missedId` is cleared when you call `onJump`, so the same message missing twice arrives as null, then the id again. The panel is unmounted on every change of chat and on `info-opened`.
- W3-5-pins, the gate: the phone now shows `Pinned messages` after a failed first read (W3-4-phonepins deviation 1). The desktop panel is opened by the page's own button and polls every 20 s, so it can show `LoadFailed` inside the open panel without changing any gate; decide and say which.
- Everyone: `DesktopPopover` hears Esc only while focus is inside its box or on `<body>`. A popover whose anchor can hold focus while it is open (a pressed button in Chrome) is deaf to Esc there, and the shell's Esc stands down too (a layer is open). `MonthPopover` listens on its own anchor; the "+" tray's popover (wave 3) and any popover of wave 5 have the same gap until `DesktopDialog.tsx` covers it (below).

**The orchestrator and the planner** (`contract.md` is read-only for builders; none of this was applied to it)
- **Tests nobody owns** (each needs a file of wave 1, which this wave could not edit): (1) the band's widened ask: `bandFit(784, 540, 2)` -> `{ cards: 1, more: 1 }`, `bandFit(176, 0, 1)` -> `{ cards: 1, more: 0 }`, `bandFit(175, 0, 1)` -> `{ cards: 0, more: 1 }`, and the loop "cards*168 + the chip's 48 + 8 per gap <= room, for room 48..1400" (true today, by a throwaway script); better, move the `+ 8` into a named helper of `desktop-rules.ts`; (2) the shell's "address moved without a popstate" decision as a pure rule there: (live channel id | null, open id | null, live filter, current filter) -> `nothing` | `home` | `filter` | `open id`; (3) New's group rule as a pure function (picked ids, refused ids, connection ids or null, candidate id, is it picked -> carries the line, is unpickable, Create group held); (4) the phone's two rules in `pin-rules.ts`: `pinsSheetReachable({ available, pins, failure })` and `tapSettled(at, lastUnpinAt)`; (5) still owed from wave 3: the source-reading test of `messages.html`'s focus guards.
- **3.5**: record that `useSearchParams` is allowed in `use-desktop-open.ts` as a read-only trigger (and reword W3-4-shell's Agent grep); add to rule 5 / rule 8 what a soft navigation to `/messages` from the left nav does while a chat is open; `fail` after unmount does nothing; `openById` is not the week card's path when the entry names its club. Section 10 part B: add the left-nav step.
- **6.1**: the month is the exception to "a press on the anchor is the anchor's business". **`DesktopDialog.tsx` (W3-1-prep, not edited here)**: make `DesktopPopover` hear Esc on its `anchor` too; then `MonthPopover` can drop its keydown half and the "+" tray is covered.
- **Section 10 part B against section 8 / 4.1 (the group rule): pick one.** Recommended: change the walk's words to "the second is flagged (a red chip with the line) and blocks `Create group` until removed; a third non-connection is unpickable". The other way (read connections at the FIRST pick and refuse a non-connection as the second) costs a connections read on every plain dm made in New and empties the Suggested list from the first pick on.
- **New, the Suggested list once two are picked**: as built it is hidden (the list area reads `Search above to start a new message.`). The better version lists the viewer's connections there; it needs a heading in 6.5.
- **6.5 has no words for**: the wide list's search with no match (as built: `No matches for "<q>"`), the band's `+N` chip's spoken name (as built: `+2`; suggested: `2 more, open the month`), the heading `Suggested`, a pin that carried nothing nameable (`Attachment`), a failed `?to=` (`Couldn't open that conversation.`).
- **The phone's gate for `Pinned messages`** (W3-4-phonepins deviation 1) loosens the rule the orchestrator gave. Confirm it, or reverse it in one word.
- H7 / 3.4: the band asks `bandFit` 8px wider; the full band's empty and failure states can be two rows at 1024 and 900 (no picture shows it).
- W3-4-lists is 890 lines against about 600: accept or split.
- 4.1, by the contract's letter: every `refreshKey` move also re-reads the calendar week (`useHomeData`, not editable here), and on desktop the page's `read` / `activity` / `list-changed` now move it (at most once per 600 ms). An active dm costs threads + inbox + calendar per burst. Consider letting the page-chatter bumps skip the week read after launch.
- Not this wave's files, seen by reviewers: `src/app/api/me/connections/route.ts:37-55` pages an unordered read by offset (New and the old page both page it; a person can be missed or doubled across pages); `ConversationView.tsx:121` seeds `pinnedAt` / `mutedUntil` from `thread` at mount only, so on a deep link an already pinned chat's row reads `Pin to top` and a tap re-pins (pre-existing; more visible now that the row has two wordings); the phone's dm view has no live update (a pin made by the other person shows on the next sheet open); `use-message-pins.ts` without `pollMs` never retries a failed first read by itself.
- Still open from wave 2: after `Clear chat history` the Pinned list can be empty while the chat holds 20 older pins (`pin_limit` with nothing to unpin).
- Between waves 4 and 5 on this branch a club opens to an empty pane and the pin button opens an empty column. Nothing is deployed between waves.

### Walk (DEFERRED: nobody opened a browser or started a server in wave 4)

Section 10 parts A, B, D, F (history), G (the dm lines) and H (Esc) whole; nothing in them was run. On top of them:

The shell (parts A, B, H):
1. With a chat open, click `Messages` in the LEFT NAV: the home shows, the address is `/messages`, the band unfolds; Back once returns to the chat; the slim list's `Messages` control then goes home on the first press. From `/messages?tab=clubs` at home, the left nav's `Messages`: the pills return to All.
2. The new effect does nothing on the shell's own writes: open, switch and close chats, change filters, open and close the month and New, create a chat in New, open a plan row from the month: no flicker, no skeleton flash, no extra list reads. In `next dev` (where `useSearchParams` runs through `use()`): a left-nav click does not flash the empty stage and the shell keeps its state; in StrictMode a deep link and `?to=` still open.
3. Paste a deep link on a throttled connection, click Campus, come back to `/messages` before the first read answers: the home stays, no toast, Back does not re-open the old chat. With the resolving read or a `?to=` POST out, drag the window under 900px: the phone tree's entry is not rewritten and no desktop toast shows.
4. In a club's Lounge (after wave 5) with a half-typed message, click that club's live event in the folded band: no skeleton, the draft and the panel stay, the address is the event room's. From the home, a week card and a month plan row open the club at once; Back returns home in one step. An entry with no club still resolves through the skeleton.
5. **The double click** (integration edits): double-click the wide list's first, second and third row: the chat clicked opens and stays. Double-click each card of the full band: that event's chat opens and stays. Enter on a slim row and on a band card still opens it.

The band and the month (part A):
6. Click `Your week` (the month opens), click it again: the month closes and does NOT re-open; focus is on the title. The same with the month opened from a day and from `+N`. In Safari and Firefox too (Safari does not focus a clicked button). Esc with focus on the title closes the month and leaves an open chat open. Keyboard: Enter on the title opens, Shift+Tab out closes, Enter opens again; a screen reader says expanded / collapsed.
7. Pick a day in another week, then close by clicking the title: the band moves to that week. Month open, press another day of the band, then the browser's Back: one step per layer, no stuck entry (the popover closes on pointerdown and the same press's click opens it again: `layer-stack.ts`' note on Chrome).
8. 1024 and 900, this week and another, 1, 2 and 3 RSVPs: the cards and `+N` drawn fit, the last card is not clipped by the band's right padding, no horizontal scroll; the grey cards while loading match the room.
9. The empty band: 1440 one row (`Nothing on your week yet.` then `Find events`); 1024 this week the sentence whole with `Find events` under or beside it, centred in the 76px band; 1024 another week `Nothing that week yet.`; 900 this week the sentence alone under 120px of room; 900 another week nothing after the days. Folded: one line. The failure line at 1440, 1024, 900: at most two lines, Retry beside or under it, nothing spills out of the band; Light and Night; the week slide still plays on the two-row state.
10. The popover's top sits flush under the day chips; the days slide in after a week step and on return home.

The lists and New (parts A, B):
11. New: search, scroll the 20 results, pick a second and a third person, `Create group` with a non-connection in it: the red chip and the sentence stay on screen above the list; the picked row shows the line and a coral check and unpicks when pressed. The connections read finishing late flags someone already picked with the chip in view.
12. New: pick two people, clear the search: `Search above to start a new message.`; remove one: Suggested comes back. Many picked people: the chips box scrolls by itself at 124px; in a window about 600px high the list still has room. Tab and Shift+Tab through the rows and the group name field: the focused row is never behind the sticky block.
13. New against the local stack: one person (dm), three with a name (group), the `not_connected` refusal, a name the word filter refuses (422, field `name`). Part B's "the second is unpickable" will NOT pass as written (the planner's call above).
14. The wide list: the hover wash against the rows' hairlines, the tint on the active Requests pill, focus rings in Light, the sticky search, the 360px minimum at a 900px window.

The phone's pins (part G, 375px, Night and Light):
15. A dm with `GET /message-pins` failing (offline, or a 503): long-press shows no `Pin message`; the "..." sheet DOES show `Pinned messages`; the sheet shows `LoadFailed` with Retry; Retry, or reopening the sheet, loads the list and the long-press row appears. A database without the pins table (a real 404): no `Pinned messages`, no `Pin message`, the chat-level row still reads `Unpin`.
16. Two accounts in one dm: A pins; B, with the chat already open, opens `Pinned messages` and sees it. Three pins, double-tap `Unpin` on the first: only one goes; a slow second tap works; the same by keyboard / screen reader.
17. The long-press picker with the extra row above and below the bubble; the sheet's inner scroll on iPhone; tap-to-jump's scroll position; Back closes only the sheet; drag-dismiss; a reload with the sheet open; the rows' spacing in a dm and a group with the `data-mid` wrapper.
18. A switch-off phone (2.5 rows 6 and 7): the old who-can-post line (`viewer.post_line`) and a `room_posters_only` refusal; long-press shows no Pin; the "..." sheet has no Pinned row and still says `Unpin`.

## Wave 5

Integrated Sun Oct 4, 2026. Five batches: W3-5-club, W3-5-panel, W3-5-people, W3-5-rooms, W3-5-pins. The club and the panels. With this wave a person with `chat_desktop` on has the whole desktop Messages: a club opens to its header (mark, name, hat line, a chip for every room, the `+` and the panel toggle), the thread or the Board, the composer, and a right panel (the club's, or an event chat's own); `See all` opens the Members dialog; an owner or an admin has the Rooms dialog; a dm or a group has the Pinned and Shared panel. Not committed, not pushed, not deployed. No migration in this wave; nobody touched a database, local or production. This is the last build wave: what follows is the browser walk (contract section 10), which nobody has started.

### The gate (run in the worktree after all five batches and the integrator's edits)

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` | 2,059 tests, 2,059 pass, 0 fail (2,027 after wave 4, plus the 32 of `rooms-dialog-rules.test.ts`, the one test file section 9 gives this wave) |
| `npx eslint <the 9 files of the wave, MessagesDesktop.tsx and the members route>` | exit 0, no problem in any of the 11 files |
| `npm run build` | exit 0 (`✓ Compiled successfully`); the worktree has no `.env.local` |

Nothing here ran in a browser and no server was started. Only `rooms-dialog-rules.ts` has tests. Everything else of the wave is `.tsx` that `node --test` cannot load: `ClubPane`'s reads, timers and lost-room rules, the panel-storage rule, the people picker's Esc rule and `matches`, the Pinned panel's stale-miss rule are covered by typecheck, lint, build and reading only.

### Files of the wave (11: 4 changed, 7 new)

Changed by a batch: `src/components/desktop/messages/ClubPane.tsx` and `PinsPanel.tsx` (wave 4's placeholders replaced).
New, all under `src/components/desktop/messages/`: `ClubPanel.tsx`, `EventPanel.tsx`, `MembersDialog.tsx`, `RoomPeople.tsx`, `RoomsDialog.tsx`, `rooms-dialog-rules.ts`, `rooms-dialog-rules.test.ts`.
Changed by the integrator only, outside every batch's list (both listed under the edits below): `MessagesDesktop.tsx` (W3-4-shell's; one statement), `src/app/api/orgs/[slug]/channels/[channelId]/members/route.ts` (nobody's; a comment).

Not edited (empty `git diff`): `contracts.ts`, `desktop-rules.ts` and its test, `DesktopDialog.tsx`, `LegacyThreadPane.tsx`, `use-desktop-open.ts`, every file under `src/components/mobile/` (`ClubSpace.tsx`, `EventChat.tsx`, `UpNext.tsx`, `EventAbout.tsx`, `BoardStrip.tsx`, `RoomChips.tsx`, `PinnedSheet.tsx` among them), `use-room-poll.ts`, `use-message-pins.ts`, `rooms.ts`, `room-names.ts`, the two `channels` route files, `public/html/*`, `supabase/*`.

### Integration edits (seven; five on seams inside the wave, two outside it)

Inside the wave:
1. `ClubPane.tsx`, the header's panel toggle: `if (e.detail > 1) return;`. Asked by W3-5-panel. A double click on the panel's own `Hide this panel` hides the panel, the header widens, and the toggle (now `Show the club panel`) arrives under the pointer: the second click showed the panel again and stored `"1"`. A key press counts 0, so Enter and Space still work.
2. `EventPanel.tsx`, the hide button: the same line. The mirror case in an event chat: a double click on the header's `Show the club panel` put the event panel's hide button under the pointer, and in `side` mode the second click hid it and stored `"0"`. (`ClubPanel`'s hide button already had the guard.)
3. `ClubPane.tsx`, focus after a hide: `hidePanel` first moves focus to the header's toggle (`toggleRef`, a new prop of the file-private `ClubHeader`) when focus was inside the panel's box (`panelBoxRef`), so a keyboard `Hide this panel` no longer drops focus to `<body>`. Only when focus was in the panel: a mouse click in Safari (which does not focus a clicked button) must not pull focus out of the composer. Asked by W3-5-panel.
4. `PinsPanel.tsx`, the stale miss: the `missedId` the panel MOUNTS with opens nothing. The shell clears `missedId` on the next jump and on a change of chat, not when the panel closes (wave 4, as built), so a pin that missed, then Hide, then the page's pin button again, mounted a new panel with that card already open to its whole text and `That message is further back in the chat.` before anything was clicked. Now `staleMissed` holds the mount-time id and `missed` (what the cards read) is null until the shell has moved the prop (a click on a quote clears it, then the page answers). Set while rendering, as the shell's own `seenKey`; no effect, no ref.
5. Comments, so they say what the code does: `ClubPanel.tsx` (in `overlay` its nearest positioned ancestor is `ClubPane`'s 320px box, not the pane's; where focus goes after a hide) and `RoomPeople.tsx` (above `NO_ROSTER_LINE`: the Rooms dialog's roster read IS tried again after it failed, and the dialog says the failure itself under the list).

Outside the wave's files (each flagged by a reviewer under "outside"; the orchestrator may revert either without touching anything else):
6. `MessagesDesktop.tsx`, `closePins` (W3-4-shell's file): after `setPinsOpen(false)` it calls `paneRef.current?.focus()`. The Pinned panel's hide button unmounts with the panel; pressed by keyboard, focus fell to `<body>` of the shell. `closePins` is only the panel's own `onClose`; the other closes (`info-opened`, the page's toggle, a change of chat) come from inside the frame or move the chat, and are unchanged. Wave 3's note: "call `handle.focus()` only for your own reasons".
7. `src/app/api/orgs/[slug]/channels/[channelId]/members/route.ts`, the POST's doc comment (owned by no batch; open since wave 2): it called a by-name row on a public room "harmless but not useful". With `post_policy = 'listed'` that row is what lets the person post. Comment only, four lines; no executed line changed.

### W3-5-club: the club pane

Files: `ClubPane.tsx` (replaces the placeholder), `EventPanel.tsx` (new).

```ts
// ClubPane.tsx ("use client"); the file's only export. ClubPaneProps is contracts.ts', unchanged.
export function ClubPane({ orgHandle, roomId, roomKind, initialPage, night, contentWidth, onSwitchRoom, onLost, onOrg, onListsChanged, onRsvpChanged }: ClubPaneProps);
// file-private: ClubHeader (props: t, night, now, orgHandle, space, roomId, panelOn, officer, onPick, onManageRooms, onTogglePanel, toggleRef),
//   RoomView (props: roomId, kindHint, storedName, clubName, orgHandle, orgId, initialPage, night, now, panelOn, reloadToken, onReport, onOpenEventChat, onRsvp),
//   type RoomReport = { roomId; kind: RoomKind | null; event; lost: boolean; refused: string | null },
//   spaceFailure, readPanelPref, storePanelPref, PANEL_WIDTH = 320, PANEL_KEY = "vibe_chat_panel", SPACE_REREAD_MS (20 s), BOARD_SETTLE_MS = 1200

// EventPanel.tsx ("use client"); EventPanelProps is contracts.ts', unchanged.
export function EventPanel({ event, night, now, mode, onHide, onRsvp }: EventPanelProps);
```
How it behaves:
- **Layout.** The root is the one flex item of the shell's pane box (`flex: 1; min-width: 0; min-height: 0; position: relative; display: flex`). In it: a column (header, then `LoadFailed` or the Board strip + `RoomView`), then the panel's 320px box: a flex item in `side`, `position: absolute; top: 0; right: 0; bottom: 0; z-index: 6` in `overlay`. One element in both modes, so a resize never remounts the panel. `ClubPanel` / `EventPanel` place themselves inside that box (in `overlay` they are absolute inside it and bring the page colour and the left hairline).
- **The header** is one row: a wrapping row (the mark, the name as a link to `/orgs/<handle>`, the hat line; then `RoomChips`) and, OUTSIDE that row, a block with the `+` and the toggle, so the two buttons stay top right when the chips drop under the name.
- **`panelOn`** (`panelMode(contentWidth, 320, pref, openedHere) !== "hidden"`) is the one boolean the hat line, `Manage club`, the Board strip and the event block read. `EventAbout` is the thread's header (`anchor="top"`) only for an event chat with `panelOn` false; else it is in `EventPanel`.
- **The room's kind** is the thread read's, else the space's, else the prop. `RoomView` (keyed by `roomId`, the one `useRoomPoll` under `desktop/messages/`) tells the pane what it knows through `onReport`.
- **Reads.** The space with `?panel=1`: on open, every 20 s while visible, on return to visible, on every `CALENDAR_CHANGED_EVENT`, 1.2 s after the Board is opened or left, when the Rooms dialog reports a change, and when the room's read is refused. The roster with `?visible=1`, once per club open, for the five faces (a failure leaves `faces` null and says nothing).
- **Lost.** A LATER 403 / 404 from the space read -> `onLost(<the refusal's own sentence>)`. An event chat whose poll says `lostAccess` -> the toast `You left the event chat.`, `onListsChanged()`, a space read, `onSwitchRoom(<lounge id>, "lounge")`. Any other room the thread read refuses (first read or later) -> a space read, and when the space does not list the room either -> `onLost` (the first read's own sentence, else `That chat isn't available anymore.`).
- **Dialogs** live in the pane: `RsvpSheet` (from the panels and from `EventAbout`), `MembersDialog`, `RoomsDialog`.

Deviations from the contract:
1. **An RSVP made in the dialog refreshes the space only through the shell.** The dialog's `onChanged` bumps the room's `reloadToken` and calls `onRsvpChanged()`; the space is re-read by the pane's own `CALENDAR_CHANGED_EVENT` listener (one path for the dialog and for an event card in the thread, one space read per RSVP). It works because the shell passes `onRsvpChanged={emitCalendarChanged}` (`MessagesDesktop.tsx`). **If the shell ever passes something else, the panel waits for the 20 s read.**
2. **`vibe_chat_panel` is written `"0"` only by a hide in `side` mode.** Hiding an overlay ends this visit's open and stores nothing; a Show stores `"1"` in both modes. (S7 does not say when the key is written.) Side effect: a `"0"` stored on a wide window becomes `"1"` when the overlay is opened on a narrow one.
3. `You left the event chat.` is once per time the room is open (the guard is cleared when `roomId` changes), not once per room for the pane's life: the same event chat can be joined, opened and left again in one visit.
4. The header's toggle is drawn in both states (section 8 gives it both names and `aria-pressed`), so while a panel is shown in `side` there are two `Hide this panel` buttons on screen: the header's and the panel's own. In `overlay` the panel covers the header's.
5. The lost-room rule is held back while the Rooms dialog is open: an officer who deletes the open room there is not thrown home mid-dialog; it runs when the dialog closes.
6. `poll.reload()` after an RSVP goes through a `reloadToken` prop (the hook lives in the keyed child, the dialog in the pane). A FIRST read's refusal can also end in `onLost`, not only a later one.
7. `EventPanel`'s chrome has the event's title as an `<h2>` beside the hide button (the contract says only "the hide button").
8. While the space (or an event chat's first read) is out, the panel's place is an empty 320px box that takes no click. `RoomThread` and `RoomComposer` get `roomKind="room"` until a kind is known. `useRoomPoll` is given `line` (`Couldn't load the Board.` / `Couldn't load this event chat.`).

### W3-5-panel: the club panel

File: `ClubPanel.tsx` (new).

```ts
export function ClubPanel({ space, activeRoomKind, night, now, mode, faces, onHide, onOpenRoom, onRsvp, onSeeMembers, onManageRooms }: ClubPanelProps);   // contracts.ts', unchanged
// file-private: PANEL_WIDTH = 320, plainClick(e), roomLink(roomId, open) -> { href, onClick }, firstClick(run) -> (e) => void,
//   EventCard, EventRow, PostRow, Faces, facesLabel, PanelIcon, MegaphoneIcon, ChevronRight
```
How it behaves:
- It never fetches and holds no state: everything is `space` (read with `?panel=1`) and `faces`. Top to bottom: `<club> events` + the hide button; the first `up_next` event as a flat card and the second as a row, or `No events coming up.`; `Announcements` (the megaphone, `See all`, up to three `board_recent` posts, or `emptyLine("board", club)`), not drawn while the Board is the open room; the faces, `<N> members`, `See all`; and, when `onManageRooms` is not null, `Manage club` (a plain link to `/campus?manage=<handle>`) beside `Manage rooms`.
- An event's body and the Board's `See all` are `<a href="/messages?channel=<id>">` answered in place on a plain left click. The RSVP pill calls `onRsvp(event.id, event.viewer_status)`: the dialog is `ClubPane`'s.
- The dot on the newest post is the Board room's own `unread`; seeing posts here marks nothing read.

Deviations from the contract:
1. **The first card's state line is `upNextLine(event, now)` in every state; `statePillText` is not used.** Live: `Live now` in coral, then `<place> · <time>` under the title (the approved picture). Not live: the time is the state line (secondary colour) and only the place is under the title, so the time prints once; with no place there is no line under the title. So "location · time" is one line only while live.
2. The phone's coral `Soon` mark (inside 24 hours, `isSoon`) is NOT on the card: the contract's entry does not name it. The planner's call.
3. **Every in-place control ignores the second click of a double click** (`e.detail > 1`): the links (`roomLink`) and, through `firstClick`, the hide button, the RSVP pill, each post, the Members `See all`, `Manage rooms`. `Manage club` is left to the browser.
4. **Focus when the Board is opened from the panel**: `Announcements` unmounts with the pressed control, so focus is first put on the Members `<section>` (`tabIndex={-1}`, found by its `useId` id, the panel's coral `:focus-visible` ring). The contract asks for no focus handling here. Nothing moves focus on to the opened room: `RoomComposer` has no focus handle.

### W3-5-people: the members dialog and the room people list

Files: `MembersDialog.tsx`, `RoomPeople.tsx` (both new).

```ts
export function MembersDialog({ orgHandle, clubName, night, onClose }: MembersDialogProps);   // contracts.ts', unchanged
export function RoomPeople(props: RoomPeopleProps);   // contracts.ts', unchanged; renders the file-private People keyed by `${orgHandle}/${roomId}`
// file-private in RoomPeople.tsx: type Listed = Pick<RosterRow, "user_id" | "name" | "handle" | "avatar_url">, matches(person, query), Face, PersonLines, ListSkeleton
// file-private in MembersDialog.tsx: matches(person, query), MemberRow
```
How it behaves:
- **`MembersDialog`**: a `DesktopDialog` titled `Members of <club>`; ONE read, `GET /api/orgs/<handle>/members?visible=1`; a sticky search (`Search members`) over the rows on hand (every typed word in the name or the handle, a leading `@` dropped); a row is the mark, the name, `@handle`, the role word, and a plain `<a href="/profile/<handle>">` (a full navigation; a member with no handle is a plain row). A failure (the route's 503 when the block read fails included): `LoadFailed` with Retry.
- **`RoomPeople`**: reads `GET /api/orgs/<handle>/channels/<roomId>/members` (`{ ok, members: [{ user_id, added_at, name, handle, avatar_url, school_verified }] }`), writes `POST` the same with `{ user_id }` and `DELETE .../members/<userId>`. Drawn: the by-name rows, less any held by a person whose roster role is in `skipRoles`. Offered under `Add someone`: `roster` rows not on the list and not in `skipRoles`, searched the same way. One write at a time; `onChanged()` after each write that went through (also after the dialog has closed); a refused write is a toast (`vibeRequest`) and nothing changes on screen; Remove and a picker row ignore the second click of a double click.
- **Esc in the OPEN picker** never reaches the Rooms dialog: in the search with words typed it clears them; anywhere else in the picker (the empty search, a row, `Add someone`) it closes the picker and focus returns to `Add someone`. Esc on the list's Remove buttons, or with the picker closed, is the dialog's.

Deviations from the contract:
1. **Strings the contract has no words for** (6.5: "no builder writes a sentence of their own"; 4c.5 says only "one muted line"). In `RoomPeople.tsx`: `No one added yet.`; `The member list isn't loaded, so no one can be added right now.` (`roster === null`, which is BOTH loading and failed, so the line is true of both); `No one else to add.`; the picker row's word `Add`; the spoken name `Remove <name>`; `Couldn't load this room's people.`, `Couldn't add them to this room.`, `Couldn't remove them from this room.`; `No matches for "<q>"`. In `MembersDialog.tsx`: `Couldn't load the members.` and `No matches for "<q>"`.
2. No test: section 9 names none and the two files are `.tsx`. The Esc rule, `matches` and the offered / shown filters are untested logic inside the components.

### W3-5-rooms: the Rooms dialog

Files: `RoomsDialog.tsx`, `rooms-dialog-rules.ts`, `rooms-dialog-rules.test.ts` (all new).

```ts
// RoomsDialog.tsx ("use client"); the only export. RoomsDialogProps is contracts.ts', unchanged.
export function RoomsDialog({ orgHandle, clubName, night, onClose, onChanged }: RoomsDialogProps);
// file-private: RoomEditor, Confirm, RoomLines, readRooms, wordStyle, LockIcon, MegaphoneIcon, Chevron

// rooms-dialog-rules.ts (pure: no React, no DOM)
export function roomsUrl(orgHandle: string): string;                    // /api/orgs/<handle>/channels
export function roomUrl(orgHandle: string, roomId: string): string;     // .../channels/<id>
export function rosterUrl(orgHandle: string): string;                   // /api/orgs/<handle>/members  (never `visible`)
export type RoomRow = { id: string; name: string; topic: string | null; is_private: boolean; kind: RoomKind | null; post_policy: PostPolicy };
export function answeredPolicy(data: unknown): PostPolicy | null;       // `channel.post_policy` of a create's or a save's answer
export function toRoomRows(channels: unknown, answered?: ReadonlyMap<string, PostPolicy>): RoomRow[];
export type RoomSection = "fixed" | "officers" | "extra";
export function roomSection(room: Pick<RoomRow, "kind">): RoomSection;
export function roomTitle(room: Pick<RoomRow, "kind" | "name">): string;
export function roomMark(room: Pick<RoomRow, "kind" | "is_private">): "megaphone" | "lock" | null;
export const FIXED_ROOM_LINE = "Every club has this room. It can't be renamed or removed.";
export const PRIVATE_CONFIRM_LINE = "Make this room private? Members who are not officers or on the list lose it, and their unread marks and votes in it are cleared.";
export const LISTED_PUBLIC_LINE = "Everyone in the club can read. Only officers and the people below can post.";
export const NAME_TAKEN_LINE = "A room with that name already exists.";
export const NAME_SHAPE_LINE = "Use at least two letters or numbers (a-z, 0-9), and start with one.";
export const NAME_CORE_LINE = "Every club already has a Board, a Lounge and an Officers room. Pick another name.";
export const TOPIC_MAX = 200;
export const OFFICER_SKIP_ROLES: readonly string[];                     // ["owner", "admin"]
export function deleteConfirmLine(room: Pick<RoomRow, "kind" | "name">): string;   // `Delete <name>? Its messages are deleted too.`
export function savedAsLine(slug: string): string;                      // `Saved as <slug>`
export function roomRuleLine(room: Pick<RoomRow, "kind" | "is_private" | "post_policy">): string;
export type SeeOption = { isPrivate: boolean; label: string };
export type PostOption = { policy: PostPolicy; label: string };
export const SEE_OPTIONS: readonly SeeOption[];
export function postOptions(isPrivate: boolean): PostOption[];          // three for a public room, two for a private one
export function effectivePolicy(isPrivate: boolean, policy: PostPolicy): PostPolicy;   // `listed` on a private room is `everyone`
export function peopleTitle(room: Pick<RoomRow, "kind" | "is_private" | "post_policy">): string | null;
export function extraRoomCount(rooms: readonly Pick<RoomRow, "kind">[]): number;
export function capLine(rooms: readonly Pick<RoomRow, "kind">[]): string | null;   // REFUSAL_SENTENCES.room_limit at 5
export type RoomForm = { name: string; topic: string; isPrivate: boolean; policy: PostPolicy };
export const NEW_ROOM_FORM: Readonly<RoomForm>;
export function formOf(room: RoomRow): RoomForm;
export type NameCheck = { ok: true; slug: string; renamed: boolean } | { ok: false; line: string | null };
export function checkRoomName(input: string, room: Pick<RoomRow, "kind" | "name"> | null, others: readonly string[]): NameCheck;
export type FormCheck = { ok: boolean; slug: string | null; nameLine: string | null; changed: boolean };
export function checkForm(form: RoomForm, room: RoomRow | null, others: readonly string[]): FormCheck;
export function needsPrivateConfirm(room: Pick<RoomRow, "is_private"> | null, nextPrivate: boolean): boolean;
export type CreateRoomBody = { name: string; topic: string | null; is_private: boolean; post_policy: PostPolicy };
export type SaveRoomBody = { name?: string; topic: string | null; is_private: boolean; post_policy?: PostPolicy };
export function createBody(form: RoomForm, slug: string): CreateRoomBody;
export function saveBody(form: RoomForm, room: RoomRow, slug: string): SaveRoomBody;
export type WriteFailure = { status: number; code?: string | null; error: string | null; message: string; field?: string };
export function writeFailureLine(failure: WriteFailure): string;
export function refusedField(failure: WriteFailure): "name" | "topic" | null;
```
How it behaves:
- A `DesktopDialog` titled `Rooms in <club>`, width 520, `busy` while one of its own three writes is out. The list (`GET channels`, read again after every write that went through): the Board and the Lounge with their line and `FIXED_ROOM_LINE`, nothing to press; Officers opens to its people list (`Also in this room`); an extra room opens to the form (Name, What it's for, Who can see it, Who can post), its people list while the SAVED room has one (`People who can see this room` when private, `People who can post` when public + `listed`), and Delete behind a confirm. One section open at a time. `New room` is the same form; at the cap the `room_limit` sentence takes the button's place.
- A name is typed as words; `checkRoomName` makes the slug (`roomSlug`), shown as `Saved as <slug>`. Words that give the stored slug back are no rename (the stored name is kept as it is). `post_policy` is sent on a save only for a room whose kind reads `room`; `listed` is never sent for a private room.
- A refused write shows its sentence under the form (`chatRefusalLine`, else `writeFailureLine`: the 409 `Channel name already exists` reads `A room with that name already exists.`) and marks its field; a refusal with an action (Sign in, Terms) is a toast with that link.
- After every write that went through: `onChanged()` (`ClubPane` re-reads the space). `RoomPeople` is handed the dialog's `onChanged` directly.

Deviations from the contract:
1. **The roster is read once, and again only after a read that failed** (4c.5 says ONE roster read): by a Retry drawn under a people list, by the room list's own Retry, and when a room's section is opened. Still one call site; never re-read while a read is out or after one went through. When the read failed, a compact `LoadFailed` (`Couldn't load the members.` + Retry) sits right under `RoomPeople`'s own muted line: two lines about one cause, on purpose (one says the effect, one gives the way out), because `RoomPeopleProps.roster` cannot tell loading from failed.
2. **The dialog remembers the rule its own writes were answered with** (`answeredPolicy`, by room id, for the dialog's life) and `toRoomRows` lays it under a list row that carries no `post_policy` and whose kind is `room`. Reason: wave 2's 5-minute "column missing" memory is not cleared by a write that proves the column is there, so the list read after a save could come back without the rule and the room read as `everyone`. Known limit: another officer's change to that room's rule is not seen until the list carries the column again (up to 5 minutes).
3. A name is checked in the form before the request: the three core names (`NAME_CORE_LINE`), a clash judged on the WORDS shown (`roomDisplayName`), the slug's shape (`NAME_SHAPE_LINE`).
4. `Confirm`'s two answers, a room's row and the New room `Cancel` ignore the second click of a double click. `New room`, the `Delete` opener and the form's submit do not need it (the control is gone or busy by then).
5. **The builder's own strings, not in 4c.5 or 6.5**: the seven lines of `roomRuleLine`, `NAME_SHAPE_LINE`, `NAME_CORE_LINE`, the buttons `Create room`, `Save`, `Cancel`, `Delete`, `Make private`, the fallbacks `Couldn't load the rooms.`, `Couldn't create the room.`, `Couldn't save the room.`, `Couldn't delete the room.`, `Couldn't load the members.` The test pins the rule lines and `NAME_SHAPE_LINE` as written: reword there and in the rules together.

### W3-5-pins: the Pinned and Shared panel

File: `PinsPanel.tsx` (replaces the placeholder).

```ts
export function PinsPanel({ threadId, title, night, mode, refreshToken, missedId, onClose, onJump, onChanged }: PinsPanelProps);   // contracts.ts', unchanged
// file-private: carried(pin), sharedUrl(threadId, before), PinCard, SharedTile, wordStyle
```
How it behaves:
- `useMessagePins(threadId, { enabled: true, pollMs: 20000 })`; a move of `refreshToken` after the mount calls `reload()`. `Pinned`: quote cards, newest pin first (`text`, else `Photo` / `Video` / `Shared post` / `Attachment`; then `<author> · <rowTime>`, the time alone for an author the viewer cannot read); a click calls `onJump`; `Unpin` shows on hover and focus, ignores the second click of a double click, and calls `onChanged()` when the request has answered (even after the panel closed). A card opens in place to `full_text` when the page could not jump to it (with `That message is further back in the chat.`) or from `Show all` (`pinTextCut`).
- `Shared`: its own read of `GET /api/me/threads/<id>/shared` on open, a two-column grid of `<a target="_blank">` tiles (a photo or a video -> the proxy URL; a post -> `/posts/<id>`), `Show more` with `before` = the last tile's `created_at` while `has_more`.
- `available === false`: the one line `Pinned messages aren't available yet.`; the hide button stays (in `overlay` the panel covers the page's own pin button, so it is the only way out).
- The rounded card draws its own hairline in both modes (wave 4's note); the root's `data-mode` carries `mode`.

Deviations from the contract:
1. **A failed first pins read shows `LoadFailed` with Retry inside the open panel** (wave 4 asked this batch to decide): the panel is opened by the page's own button and polls every 20 s, so no gate changed.
2. Strings outside 4d.5: `Couldn't load shared photos, videos and posts.` (a failed Shared read or `Show more`), `Attachment` (the phone sheet's word), the spoken `Hide this panel` and `Pinned and shared with <title>`.
3. Two focus-ring positions: inside (-2px) for the hide button, the quote cards, `Unpin`, `Show all`, `Show more`; outside (+2px) for the Shared tiles (the picture would paint over an inside ring) and for `LoadFailed`'s coral pill.
4. The `missedId` the panel mounts with is ignored (integration edit 4).

### Seams read on both sides

- Shell -> `ClubPane` (`MessagesDesktop.tsx`): all eleven props against `ClubPaneProps`, matched. `onRsvpChanged={emitCalendarChanged}` is what W3-5-club deviation 1 rests on. `key={open.orgHandle}`; `RoomView` is keyed by `roomId` and takes `initialPage` as given.
- `ClubPane` -> `ClubPanel` against `ClubPanelProps`: matched. `onOpenRoom={onSwitchRoom}` (`RoomKind | null` accepts `RoomKind`); `onRsvp(eventId, current)` -> the pane's `RsvpSheet`; `onManageRooms` is null unless the role is in `BOARD_POSTER_ROLES` (owner, admin), the same test as the header's `+` and `Manage club`. `faces` is at most five `Person`s mapped as 3.3 says.
- `ClubPane` -> `EventPanel` against `EventPanelProps`: matched; `event` is the open room's own read (`ThreadRoom["event"]`). Both panels are placed in the same 320px box and place themselves the same way in both modes.
- `ClubPane` -> `MembersDialog`, `RoomsDialog`: matched (`orgHandle`, `clubName` = `space.org.name`, `night`, `onClose`; `onChanged` -> a space read). Both mount only once the space has answered.
- `ClubPane` -> the phone's pieces (`RoomChips`, `BoardStrip`, `BoardView`, `RoomThread`, `RoomComposer`, `EventAbout`, `RsvpSheet`, `useRoomPoll` with `line`): by typecheck and by reading their signatures; none edited.
- `RoomsDialog` -> `RoomPeople` against `RoomPeopleProps`: matched; the three titles are 4c.5's (`peopleTitle`); `roster` is the unfiltered read or null; `skipRoles` = `["owner", "admin"]`.
- `RoomsDialog` -> the room routes (wave 2): `GET` answers `{ ok, channels }`; `POST` 201 `{ ok, channel: { ..., post_policy } }`; `PATCH` `{ ok, channel }` with `post_policy` when the body named it; the name clash is 409 with `error: "Channel name already exists"` and no code (matched by `writeFailureLine` on status and words); `room_locked`, `room_limit` and `try_again` come through `chatRefusalLine`; `content_blocked` is not one of its codes, so it shows the line `vibeRequest` mapped and marks its `field` (`refusedField`).
- `MembersDialog` / `ClubPane` -> `GET /api/orgs/<handle>/members?visible=1` -> `RosterResponse`; `RoomPeople` -> the room's members route (row shape read from the route file): matched.
- Shell -> `PinsPanel` against `PinsPanelProps`; `PinsPanel` -> `useMessagePins` (`pins`, `available`, `failure`, `unpin`, `reload`), `pinTextCut`, `SharedResponse` (`items`, `has_more`): matched.
- The double click across a re-layout: `ClubPanel` (every in-place control), the header toggle and `EventPanel`'s hide (integration edits 1 and 2), `RoomsDialog`, `RoomPeople`, `PinsPanel`'s `Unpin`. NOT covered, because the handler belongs to a file this build may not edit and carries no event: `BoardStrip`'s `onOpen`, `RoomChips`' `onPick`, `EventAbout`'s `onRsvp`, `LoadFailed`'s Retry (walk items 3 and 4).
- Calm, over the nine files: no hex and no `rgb(` literal except `rgba(var(--scrim-rgb), a)` and the CSS variables `--coral`, `--danger-ink`, `--error-ink`; no `position: fixed`, no `vaul`; `boxShadow` only as a 1px hairline ring (the club's mark, a Shared tile, the play mark), never a glow; no `pushState` / `replaceState`; no `can_moderate`; no `/pin` call in `ClubPane`; one `useRoomPoll(` under `desktop/messages/`.

### What comes next must know

Wave 5 is the last build wave. Next is the walk (section 10), then the commit. `contract.md` is read-only for builders; none of this was applied to it.

**Decisions waiting for the planner or Franky** (each is built one way today and is one small change to reverse):
- **An officer in an event chat with the panel shown has no `Manage club` on screen.** By the contract's letter "a panel on screen" hides the member count and `Manage club` from the hat line, but `EventPanel` shows neither. The `+` still opens Rooms. Decide whether the hat line should hide them only while the CLUB panel is on screen.
- Two `Hide this panel` buttons in `side` mode (W3-5-club deviation 4): keep the header toggle in both states (as built, as section 8 words it), or draw it only while the panel is hidden.
- The lost-room hold while the Rooms dialog is open (W3-5-club deviation 5).
- The coral `Soon` mark on the panel's first card (W3-5-panel deviation 2).
- **The words nobody signed off**: W3-5-people deviation 1, W3-5-rooms deviation 5, W3-5-pins deviation 2. Add them to 6.5 or reword them (the rooms test pins seven rule lines and `NAME_SHAPE_LINE`). 4c.5's "ONE roster read" should read "one roster read, made again only after it failed".
- `RoomPeopleProps.roster` (pinned in 3.3) is null for loading AND failed. If the two lines under a failed roster read like noise on the walk, give the prop a way to say which, and let `RoomPeople` draw a skeleton while loading and nothing while the dialog shows the failure.

**Known gaps, none fixed here** (each needs a file outside the wave, or a decision):
- `src/lib/chat/room-names.ts` (wave 2): `roomSlug` trims the dashes BEFORE the cut to 31, as 4c.3 words it, so a long name whose 31st character falls on a word break is stored with a dash at its end (thirty a's + ` bbbbb` -> `aaa...a-`, shown `Saved as ...-`). Trim again after the cut, with a row in `room-names.test.ts`.
- `src/lib/chat/rooms.ts` and the two `channels` routes (wave 2): the 5-minute "no `post_policy` column" memory is not cleared by a create or a save that wrote the column. `forgetPostPolicyColumnMissing()` after such a write would fix it for every screen; the Rooms dialog covers only itself (W3-5-rooms deviation 2).
- `channels/[channelId]/members/route.ts`: POST answers a person who has left the club with 400 `User must join the org first` and no `code`, so the screen can only toast `Couldn't add them to this room.` and the stale roster row stays offered.
- `RoomPeople`'s add and remove do not raise the Rooms dialog's `busy` (the pinned props have no way to): the dialog can be closed, or a room saved or deleted, while a people write is out. `RoomPeople` copes (it still calls `onChanged()` after unmount).
- `ClubPane`'s space reads carry no sequence guard, as on the phone: the 20 s tick, the visibility read and the on-demand reads can overlap, and an older answer can land after a newer one (a stale RSVP pill or chip for up to 20 s). A started-counter in the read would close it.
- `MessagesDesktop.tsx`: `jump-missed` sets `missedId` without checking the open chat (the page's event carries no `channelId`); harmless unless the same message id were pinned in the next chat.
- `src/components/feedback/LoadFailed.tsx`: Retry acts on both clicks of a double click, and the pill has no focus style of its own (a host that gives buttons an inside coral ring hides it on the coral pill; `PinsPanel` works around it).
- `carried(pin)` exists twice, word for word (`PinnedSheet.tsx`, `PinsPanel.tsx`): it belongs in `src/lib/chat/pin-rules.ts` with a test.
- **Tests nobody owns** (each needs a file of wave 1): the panel-storage rule as a pure helper in `desktop-rules.ts` (`panelPrefOnHide(mode): "0" | null`; a Show always stores `"1"`); the Pinned panel's stale-miss rule; the picker's Esc rule and `matches`. On top of wave 4's list.
- C14: a typed name loses its capitals and punctuation for good (`IU Alumni 2026!` is shown everywhere as `Iu alumni 2026`, `Café` as `Caf`); the dialog shows only the slug under the field, never the words the chip will read.
- Still open from earlier waves: everything under "The orchestrator and the planner" of waves 2 to 4.

### Walk (DEFERRED: nobody opened a browser or started a server in wave 5)

Section 10 parts C, C2, E and H whole, and the Light repeats of C and E; nothing in them was run. On top of them:

The club pane (part C, 1440 and 1024, Night and Light):
1. One club visit: event chat A -> `Not going` (the toast, the Lounge, history intact) -> RSVP Going from the club panel -> open A's chip -> `Not going` again: the toast shows again.
2. At 1440, Lounge open, the panel at the side: press Going on an event card in the thread: the panel's card and count change at once and the event chat's chip appears, without waiting 20 s. An RSVP made in the RSVP dialog costs ONE space read (network tab), not two.
3. **Double clicks on the pane** (integration edits 1 and 2): the panel's `Hide this panel` (club panel and event panel), the header's `Show the club panel` in the Lounge and in an event chat: one action each, the stored choice is the first click's. Then the ones NOT guarded: the header's `Hide this panel` in `side` mode (the header widens by 320px: does a chip land under the pointer and switch the room?); the Board strip (does the second click land on a Board post's control?); the panel's first event card (the event panel takes its place: does the second click land on its RSVP button and open the dialog?).
4. Keyboard: Enter on the panel's `Hide this panel` (club and event): focus is on the header's toggle, which now reads `Show the club panel`; Enter again shows the panel. A MOUSE click on the hide button while typing in the composer (Safari): the caret stays in the composer. Enter on an Announcements post or its `See all`: the Board opens, focus is on the Members row (coral ring, `Members` region), the next Tab lands on its `See all`; a mouse click on a post shows no ring there. Hold Enter on a post: the Board opens once.
5. Panel storage: at about 1100px `Show the club panel` (overlay), then hide it from the panel's button: `localStorage.vibe_chat_panel` is not `"0"`; widen to 1440 or reload wide: the panel is shown. At 1440, hide and reload: still hidden.
6. At 1024 and 900 the overlay panel lies over the header's right 320px (the chips, the `+`, the toggle): the chips cannot be clicked while it is open; the panel's own button is the way out. Look at whether that is acceptable.
7. The header with many chips at 1440 and 1024 (the chips drop under the name; the `+` and the toggle stay top right). The hat line in every state; in an event chat with the panel shown an officer sees no `Manage club` (the planner's call above).
8. `EventPanel` in Light and Night: `EventAbout`'s going avatars are ringed in `t.page` on a `t.surface` card; the hero and pill literals (3.2). The panel's first card: not live -> `<time>` on the state line, the title, the place alone (no line with no place); live -> `Live now` in coral, the title, `<place> · <time>`; no `Soon` anywhere.
9. The 1.2 s Board settle: open the Board, go back to the Lounge: the panel's dot and the Board chip's dot are gone without waiting 20 s.
10. As avery, delete the OPEN room in the Rooms dialog: the dialog stays; on closing it the pane goes home with `That chat isn't available anymore.` Leave a club in another tab: within 20 s the pane goes home with the refusal's sentence. `RemoveConfirm` is placed against the window (no transformed ancestor in the pane).

The Members and Rooms dialogs (parts C and C2):
11. Members: the sticky search over scrolling rows; the edge-to-edge rows; Safari's native search field and its clear button; focus returns to `See all`; Back after a full navigation to a profile from the open dialog; a blocked person is missing; the 503 shows `LoadFailed` with Retry.
12. The picker's Esc, in a browser: in the search with words typed (clears; picker and dialog stay); on the empty search, on a row, on `Add someone` with the picker open (the picker closes, focus on `Add someone`, the Rooms dialog and the form's unsaved edits stay); on a Remove button or with the picker closed (the Rooms dialog closes).
13. With the roster route failing (offline, or a 500): open Manage rooms -> Officers: the muted line plus `Couldn't load the members. Try again.` with Retry; Retry brings `Add someone`; closing and reopening a section retries by itself; the room list's Retry retries the roster too. A double click on that Retry (`LoadFailed` has no guard). Do the two lines read as noise?
14. Double-click `Make private`, the question's `Cancel`, the delete question's `Cancel` and `Delete`, a room's row, the New room `Cancel`: one action each. Esc inside a question leaves the dialog open. Focus after a create (the new row), after a delete (`New room`, or the body at the cap) and after the two Cancels. The radio snapping back to public while the private question is up, by mouse and by arrow keys.
15. On the local stack right after the post-policy column appears, without restarting the dev server: save `Only officers` on an extra room: its row reads `Every member sees it. Only officers post.` and Save goes off; save `Officers and people you pick`: `People who can post` appears; then save a second room: the first keeps its line.
16. A name in non-Latin letters and `_ab`: `NAME_SHAPE_LINE` under the field, the field marked, Create off. Thirty a's and a word: the trailing dash (known gap). The 86vh scroll with eight rooms, an open section and the roster failure box. A refusal's toast shows above the dialog.

Pinned and Shared (parts E and H):
17. A pin older than the loaded 50: click it (the card opens with the "further back" line), hide the panel, open it again: the card is CLOSED; click it again: it opens again (integration edit 4). The same pin missed twice without closing still re-opens.
18. Enter on the panel's `Hide this panel`: the keyboard is back in the thread (integration edit 6), and the next Esc follows rule 9 from inside the frame; the page's pin button reads not pressed.
19. Tab through Shared with photos, a video and a post: a coral ring just outside each tile's corners, whole on all four sides (first row under the heading, last row at the bottom, the panel's edges). Retry after a failed pins read, a failed Shared read and a failed `Show more`, and Sign in on a 401: a ring with a 2px gap around the coral pill. The inside rings on the hide button, each quote, `Unpin`, `Show all`, `Show more`. Night and Light.
20. Unpin by keyboard keeps focus in the list; a double click on `Unpin` removes one pin; `Show more` pages without doubles; side at 1440 and overlay at 1024; `Pinned messages aren't available yet.` on a database without the table (the hide button still closes it).
