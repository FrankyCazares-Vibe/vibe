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
