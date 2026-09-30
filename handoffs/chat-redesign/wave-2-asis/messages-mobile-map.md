# MessagesMobile.tsx — structural map for the wave-2 split (as-is, Sept 30 2026)

Reader: "messages-mobile-map" (cloud session, read-only; no database, no browser). Every claim cites `path:line`.
Tree: main = `e4f8916` (B5) + two docs commits (`0732ed5`, `5c68da1`). The file is `src/components/mobile/MessagesMobile.tsx`,
4,985 lines (`wc -l`). Last four commits touching it: `e4f8916` (B5, room rules), `026618d` (Night), `47c61a1` (push asks),
`2896a50` (report one message) — `git log --oneline -- src/components/mobile/MessagesMobile.tsx`.

What this document is for: the extraction-only split (orchestrator default D6, plan-critique #11 at
`handoffs/chat-redesign/plan-critique.md:185-196`) and the screen batches that come after it. Section 10 is the proposed split;
sections 1-9 are the facts it rests on. Line ranges in section 1 were computed mechanically (brace balance over the file, script
kept in the reader's scratchpad; re-runnable in one minute) and spot-checked by reading the whole file in slices.

Sections
1. Top-level declarations: range, export, dependency table
2. Module-level state (constants, caches, subscriptions, vaul styles)
3. Props of MessagesMobile and ConversationView; how the pieces talk to each other
4. Every read of a wave-1 field (can_post, room, room_kind, kind, hidden, removed, card, reply_count, author_role) and REFUSAL_SENTENCES
5. Fetching: every request, polling / resync, initialHandle / initialChannelId, the ?channel= deep link
6. Night / Light and the CSS tokens
7. Lint state today (eslint on MessagesMobile.tsx and CampusMobile.tsx)
8. Importers
9. page.tsx, MessagesSwitch.tsx, MobileShell.tsx, MobileTabBar.tsx and how the tab bar hides
10. Proposed split (file by file), what must become exported, hazards
11. What B5 changed in this file (from the wave-1 build notes)
12. Surprises

---

## 1. Top-level declarations

File head: `"use client"` at `:1`; imports `:3-30`; the header comment `:32-51`. Imports (all at the top, nothing dynamic):
- `:3` `Link` from `next/link`
- `:4-12` `useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore` from `react` (NO `React` default/namespace import — see hazard H6)
- `:13` `Drawer` from `vaul`
- `:15` `asLoadFailure, LoadFailed, type LoadFailure` from `@/components/feedback/LoadFailed`
- `:16` `PushAsk` from `@/components/push/PushAsk`
- `:17-21` `RemovedContentCard, ReportSheet, type ReportTargetRef` from `@/components/safety/ReportSheet`
- `:22-27` `REFUSAL_SENTENCES, type RefusalCode, type RoomKind, type ThreadMessagesResponse` from `@/lib/chat/types`
- `:28` `type VibeFailure, vibeRequest` from `@/lib/feedback/request`
- `:29` `toast` from `@/lib/feedback/toast`
- `:30` `currentTheme, THEME_EVENT` from `@/lib/theme/theme`

Exactly two exports: `export function MessagesMobile` (`:376`) and `export function ConversationView` (`:1057`). No default export
(`grep -n "export default"` → none). Every other declaration is module-private.

### 1.1 Declaration table

| Lines | Decl | Size | Uses (other top-level names in this file) | External names used |
|---|---|---|---|---|
| 55 | `type ThreadType = "dm" \| "group" \| "org"` | 1 | – | – |
| 57-63 | `type ThreadPeer` | 7 | – | – |
| 65-71 | `type ThreadMember` | 7 | – | – |
| 73-108 | `type ThreadEntry` | 36 | ThreadType, ThreadPeer, ThreadMember | `RoomKind` (`:105`) |
| 110-114 | `type MessageReaction` | 5 | – | – |
| 118-131 | `type MessageAttachment` | 14 | – | – |
| 136-148 | `type ParentPreview` | 13 | – | – |
| 150-185 | `type MessageRow` | 36 | MessageReaction, MessageAttachment, ParentPreview | – |
| 187 | `const REACTION_EMOJIS` (7 emojis, `as const`) | 1 | – | – |
| 192-193 | `const ATTACH_ACCEPT` | 2 | – | – |
| 194 | `const ATTACH_IMAGE_TYPES` (Set) | 1 | – | – |
| 195 | `const ATTACH_VIDEO_TYPES` (Set) | 1 | – | – |
| 196 | `const MAX_IMAGE_BYTES` (15 MiB) | 1 | – | – |
| 197 | `const MAX_VIDEO_BYTES` (200 MiB) | 1 | – | – |
| 200-205 | `type StagedMedia` | 6 | – | – |
| 209 | `type ReplyTarget` | 1 | ParentPreview | – |
| 211 | `type Tab = "all" \| "requests"` | 1 | – | – |
| 224-227 | `function subscribeTheme` | 4 | – | `THEME_EVENT`, `window` |
| 229-235 | `function useNightTheme` | 7 | subscribeTheme | `useSyncExternalStore`, `currentTheme` |
| 237-242 | `const vaulOverlayStyle: React.CSSProperties` | 6 | – | `React` namespace (type only) |
| 244-256 | `const vaulContentStyle` | 13 | – | `React` (type) |
| 258-264 | `const vaulHandleStyle` | 7 | – | `React` (type) |
| 268-278 | `const visuallyHiddenStyle` | 11 | – | `React` (type) |
| 282-295 | `function relativeTime` | 14 | – | – |
| 297-305 | `function initialsOf` | 9 | – | – |
| 307-310 | `function threadTitle` | 4 | ThreadEntry | – |
| 312-323 | `function threadAvatar` | 12 | ThreadEntry, initialsOf | – |
| 327-340 | `function quotedBody` | 14 | ParentPreview | – |
| 348-351 | `function chatRefusalLine` | 4 | – | `REFUSAL_SENTENCES`, `RefusalCode`, `VibeFailure` |
| 354-357 | `function toastSendFailure` | 4 | chatRefusalLine | `VibeFailure`, `toast` |
| 364-368 | `function entryCanPost` | 5 | ThreadEntry | – |
| 374 | `const LIST_RESYNC_MS = 30_000` | 1 | – | – |
| 376-749 | **`export function MessagesMobile`** | 374 | ThreadEntry, Tab, useNightTheme, LIST_RESYNC_MS, TabPill, ThreadRow, ListSkeleton, EmptyState, ConversationView, ComposeOverlay | useCallback, useEffect, useMemo, useRef, useState, asLoadFailure, LoadFailed, LoadFailure, vibeRequest, toast |
| 753-808 | `function TabPill` | 56 | – | – |
| 810-951 | `function ThreadRow` | 142 | ThreadEntry, relativeTime, threadTitle, threadAvatar | – |
| 953-998 | `function ListSkeleton` | 46 | – | – |
| 1000-1053 | `function EmptyState` | 54 | Tab | `Link` |
| 1057-2338 | **`export function ConversationView`** | 1282 | ThreadEntry, MessageRow, ATTACH_ACCEPT, ATTACH_IMAGE_TYPES, ATTACH_VIDEO_TYPES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, StagedMedia, ReplyTarget, useNightTheme, visuallyHiddenStyle, **vaulOverlayStyle** (`:1574`, spread with zIndex 1099), threadTitle, threadAvatar, quotedBody, toastSendFailure, entryCanPost, ConversationActionSheet, GroupSettingsView, MessageBubble | Link, useCallback, useEffect, useRef, useState, Drawer, asLoadFailure, LoadFailed, LoadFailure, PushAsk, ReportSheet, ReportTargetRef, REFUSAL_SENTENCES, RoomKind, ThreadMessagesResponse, vibeRequest, toast |
| 2342-2716 | `function ConversationActionSheet` | 375 | ThreadEntry, vaulOverlayStyle, vaulContentStyle, vaulHandleStyle, visuallyHiddenStyle, SheetRow, MuteDurationSheet | useCallback, useEffect, useState, Drawer, ReportSheet, ReportTargetRef, `fetch` (raw) |
| 2718-2782 | `function SheetRow` | 65 | – | `Link` |
| 2784-2832 | `function MuteDurationSheet` | 49 | vaulOverlayStyle, vaulContentStyle, vaulHandleStyle, visuallyHiddenStyle, SheetRow | Drawer (`NestedRoot`) |
| 2836-3353 | `function GroupSettingsView` | 518 | ThreadMember, ThreadEntry, useNightTheme, initialsOf, SheetRow, MemberRow, MemberActionSheet, ComposeOverlay | useCallback, useEffect, useState, `fetch` (raw) |
| 3355-3518 | `function MemberRow` | 164 | ThreadMember, useNightTheme, initialsOf | `Link` |
| 3520-3590 | `function MemberActionSheet` | 71 | ThreadMember, vaulOverlayStyle, vaulContentStyle, vaulHandleStyle, visuallyHiddenStyle, SheetRow, MuteDurationSheet | useState, Drawer |
| 3594-3601 | `type SearchUser` | 8 | – | – |
| 3603-3883 | `function ComposeOverlay` | 281 | useNightTheme, ListSkeleton, SearchUser, ComposeUserRow | useEffect, useRef, useState, asLoadFailure, LoadFailed, LoadFailure, vibeRequest, `fetch` (raw, `:3649`) |
| 3885-3966 | `function ComposeUserRow` | 82 | initialsOf, SearchUser | – |
| 3968-4751 | `function MessageBubble` | 784 | MessageRow, initialsOf, quotedBody, ReactionPicker | Link, useRef, useState, RemovedContentCard, `React` (types: `React.RefObject` `:4007`, `React.PointerEvent` `:4084,4093`, `React.MouseEvent` `:4097,4104`, `React.CSSProperties` `:4149`, `React.ReactNode` `:4231,4294`) |
| 4758-4778 | `function swallowNextClick` | 21 | – | `document`, `window` |
| 4780-4965 | `function ReactionPicker` | 186 | MessageReaction, REACTION_EMOJIS, swallowNextClick, pickerRowStyle | useEffect, useLayoutEffect, useRef, useState |
| 4968-4985 | `function pickerRowStyle` | 18 | – | `React.CSSProperties` |

Notes on the table:
- The mechanical scan also flagged three name matches that are COMMENTS, not code: `ConversationView` mentions `MessagesMobile` at `:1068` and
  `:1421`; `MessageBubble` mentions `ConversationView` at `:3994`; `ConversationActionSheet` mentions "toast" at `:2565`. None is a dependency.
- Lines not inside any declaration (imports, section-banner comments, blank lines): `1-54, 56, 64, 72, 109, 115-117, 132-135, 149, 186,
  188-191, 198-199, 206-208, 210, 212-223, 228, 236, 243, 257, 265-267, 279-281, 296, 306, 311, 324-326, 341-347, 352-353, 358-363,
  369-373, 375, 750-752, 809, 952, 999, 1054-1056, 2339-2341, 2717, 2783, 2833-2835, 3354, 3519, 3591-3593, 3602, 3884, 3967, 4752-4757,
  4779, 4966-4967, 4986`. Doc comments directly above a declaration (e.g. `:341-347` above `chatRefusalLine`, `:4752-4757` above
  `swallowNextClick`) belong to it and should move with it.
- No const is referenced before its line (mechanical check: zero hits). Functions reference later functions only through hoisting
  (`MessagesMobile` → `TabPill`… declared after it; `MessageBubble` → `ReactionPicker`), which is legal in one file and irrelevant across files.
- Section banners in the file: `// ---------- Types ----------` `:53`, `Vaul shared styles` `:213`, `Helpers` `:280`, `Component` `:370`,
  `Thread list pieces` `:751`, `Conversation view` `:1055`, `Action sheet` `:2340`, `Group settings` `:2834`, `Compose overlay` `:3592`.
  (MessageBubble / ReactionPicker have no banner: `:3967` is blank.)

---

## 2. Module-level state

Everything at module level is immutable data or a pure function; there is NO module-level cache, map, timer, or mutable variable
(`grep -nE "^(let|var) "` → none). The only module-level side effect is registration-free: `subscribeTheme` attaches a listener when a
component subscribes and removes it on unsubscribe (`:224-227`).

| What | Where | Notes for a move |
|---|---|---|
| `REACTION_EMOJIS` | `:187` | Read only by `ReactionPicker` (`:4888`). |
| `ATTACH_ACCEPT`, `ATTACH_IMAGE_TYPES`, `ATTACH_VIDEO_TYPES`, `MAX_IMAGE_BYTES`, `MAX_VIDEO_BYTES` | `:192-197` (comment `:189-191`) | Read only inside `ConversationView`: `ATTACH_ACCEPT` at `:2150`, the sets and limits in `chooseMedia` `:1452-1473`. Mirror of the upload route's limits (`src/app/api/me/messages-upload-url`). |
| `subscribeTheme` + `useNightTheme` | `:224-235` (comment `:219-223`) | `useSyncExternalStore(subscribeTheme, () => currentTheme() === "dark", () => false)`. Server snapshot is `false` (Light). Called by MessagesMobile `:384`, ConversationView `:1079`, GroupSettingsView `:2848`, MemberRow `:3364`, ComposeOverlay `:3611`. NetworkMobile has its own copy (`src/components/mobile/NetworkMobile.tsx:103` comment names this one). |
| `vaulOverlayStyle` (zIndex 1200), `vaulContentStyle` (zIndex 1201, `var(--cream)`), `vaulHandleStyle`, `visuallyHiddenStyle` | `:237-278` (comment `:213-223`) | Used by ConversationView (`visuallyHiddenStyle` `:1594`; `vaulOverlayStyle` spread with zIndex 1099 at `:1574`), ConversationActionSheet `:2576-2579`, MuteDurationSheet `:2803-2806`, MemberActionSheet `:3541-3546`. |
| `LIST_RESYNC_MS = 30_000` | `:374` (comment `:372-373`) | Read once, `MessagesMobile` `:491`. |

Pure helpers (`:280-368`): `relativeTime`, `initialsOf`, `threadTitle`, `threadAvatar`, `quotedBody`, `chatRefusalLine`,
`toastSendFailure`, `entryCanPost`. `toastSendFailure` is the only helper with a side effect (calls `toast`, `:356`).
`chatRefusalLine` matches on `r.code` against `REFUSAL_SENTENCES` and prefers the server's `r.error` (`:349-350`).

Body-class side effects (the tab bar): `document.body.classList.add("vibe-composer-open")` on mount / remove on unmount in
ConversationView `:1158-1159`, GroupSettingsView `:2879-2880`, ComposeOverlay `:3625-3626`. The CSS is
`src/app/globals.css:2878-2880` (`body.vibe-composer-open .vibe-mobile-tabbar { display: none !important; }`), see section 9.

Other DOM-global listeners: `visibilitychange` on `document` (MessagesMobile `:494-495`); `pointerdown` on `document` (ReactionPicker
`:4840-4846`); `click` / `pointerdown` / `pointercancel` capture listeners on `document` (swallowNextClick `:4771-4777`).

---

## 3. Props and how the pieces talk

### 3.1 `MessagesMobile` (`:376-749`)
Props (`:376-382`): `{ initialHandle?: string; initialChannelId?: string }`.
State: `tab: Tab` `:385`; `threads`, `requests: ThreadEntry[] | null` `:386-387`; `listErr: LoadFailure | null` `:390`; refs `listLoadedRef`,
`listSeqRef` `:391-392`; `openThreadId` `:393`; `composeOpen` `:394`; refs `lastHandledHandleRef` `:397`, `deepLinkSeqRef` `:400`,
`refetchThreadsRef` `:435-437`, `listFetchedAtRef` `:440`, `lastHandledChannelRef` `:505`.
Callbacks: `openOrCreateDmFromHandle(handle)` `:403-431`; `refetchThreads(mode: "first" | "refresh" | "quiet" = "refresh")` `:449-478`.
Derived: `visibleThreads` `:558-561` (tab → requests or threads); `unreadCount` `:567-574` (unread and not muted).
Render (`:577-748`): `<main style={{ background: "var(--feed-backdrop)" }}>` `:577` → sticky `<header>` `:585` with `<h1>Messages</h1>` `:608-620`,
the "New message" pencil `:621-657`, two `TabPill`s `:667-678` (All with the unread badge, Requests with `requests.length`) →
list area `:681-723`: `ListSkeleton` `:696` while `threads === null` and no error, `LoadFailed` `:686` on a first-load failure (`onRetry` → `refetchThreads("first")`),
`EmptyState tab={tab}` `:699` when empty, else `<ul>` of `ThreadRow` `:711` (`onTap` → `setOpenThreadId(t.id)`) → `ConversationView` keyed by thread id
`:725-740` → `ComposeOverlay` `:742-747`.

### 3.2 `ConversationView` (`:1057-2338`)
Props (`:1057-1072`):
```
threadId: string;
thread: ThreadEntry | null;
onClose: () => void;
onThreadsChanged?: () => void;   // MessagesMobile: refetchThreads(); CampusMobile: not passed
backdropCss?: string | null;     // CampusMobile: the org's BACKDROP_PRESETS css; MessagesMobile: not passed
```
How MessagesMobile calls it (`:725-740`): `key={openThreadId}`, `thread` = the entry from `threads` or `requests` (else `null`),
`onThreadsChanged={() => void refetchThreads()}`, `onClose` = clear `openThreadId` + `refetchThreads()`.
How CampusMobile calls it (`CampusMobile.tsx:1042-1052`): `threadId={openChannel.id}`, `thread={synthesizeChannelThread(openChannel)}`
(type `"org"`, name `# <channel>`, no `room_kind` / `can_post` / `is_request` / `unread`; `CampusMobile.tsx:2459-2472`), `onClose`,
`backdropCss` from `BACKDROP_PRESETS[openChannel.orgBackdrop]?.css`.

State (`:1077-1136`): `night`, `onDark = !!backdropCss || night` `:1080`; `messages: MessageRow[] | null`; `loadErr`; `loadSeq`; `draft`;
`sending`; `meId`; `roomKind: RoomKind | null` (seed `thread?.room_kind`) `:1093`; `canPost: boolean | null` (seed `entryCanPost(thread)`)
`:1094`; `reportMessage: ReportTargetRef | null`; `staged: StagedMedia | null`; `replyTo: ReplyTarget | null`; `requestState`; `reqBusy`;
`showPushAsk`; `menuOpen`; `groupSettingsOpen`; `actionFeedback`; `pinnedAt`; `mutedUntil` (both seeded from `thread`); `shownThreadId`
with a render-time reset block `:1125-1136` when `threadId` changes under a mounted view.
Refs: `scrollRef`, `inputRef`, `fileInputRef`, `listScrolledAtRef` `:1137-1142`; `lastMessageIdRef` `:1216`; `pinnedToBottomRef` `:1234`.
Callbacks: `keepPinnedToBottom` `:1235`; `reload` `:1249`; `send` `:1254-1386`; `acceptRequest` `:1391-1401`; `declineRequest` `:1404-1424`;
`startReply(m)` `:1426-1441`; `chooseMedia(file)` `:1452-1473`; `toggleReaction(messageId, emoji)` `:1485-1548`.
Derived: `isRequest` `:1242`, `isDm` `:1245`, `canAttach = (dm || group) && !roomKind` `:1448`, `peer`/`title`/`avatar` `:1550-1552`.

Render tree (`:1567-2337`): `Drawer.Root open direction="right" handleOnly` → `Drawer.Portal` → `Drawer.Overlay` (zIndex 1099) →
`Drawer.Content` `:1575` (zIndex 1100, background `backdropCss ?? "var(--cream)"`) → `Drawer.Title` (hidden) `:1594` → top bar `<header>` `:1596-1746`
(Back button → `onClose`; avatar; title as `Link` to `/profile/<handle>` when `peer.handle`; "More actions" → `setMenuOpen(true)`) →
message list `<div ref={scrollRef}>` `:1747-1858` (Loading… / `LoadFailed` `:1780` / "Say hi to …" / `MessageBubble` per row `:1824-1850`) →
request bar `:1861-1930` (Accept / Decline) → `PushAsk placement="dm"` `:1931-1939` (`:1936`) → reply pill + staged chip `:1940-2083` (only when
`canPost`) → composer: quiet line when `canPost !== true` `:2084-2118`, else the `<form>` `:2119-2270` (attach button when `canAttach`,
`<textarea>` `:2202-2233`, Send) → `ConversationActionSheet` `:2275-2298` → `ReportSheet variant="sheet" nested` `:2312-2317` →
`GroupSettingsView` `:2324-2333`.

### 3.3 Child contracts (what each piece receives and reports back)
| Piece | Props in | Reports back |
|---|---|---|
| `TabPill` `:753` | `label, active, onClick, badge?` | `onClick` |
| `ThreadRow` `:810` | `thread: ThreadEntry, onTap` | `onTap` |
| `ListSkeleton` `:953`, `EmptyState({ tab })` `:1000` | – / `tab: Tab` | – (EmptyState links to `/network`) |
| `MessageBubble` `:3968` | `message: MessageRow, isMine, topGap, showSender?, groupMode?, darkMode?, onToggleReaction?(emoji), onMediaLoad?, listScrolledAtRef?: React.RefObject<number>, parentIsMine?, onReply?, onReport?` | `onToggleReaction`, `onMediaLoad`, `onReply`, `onReport` (the last two only when passed and the id is not `temp_`, `:4728-4745`; `ReactionPicker` mounted at `:4718`) |
| `ReactionPicker` `:4780` | `darkMode, isMine, existing: MessageReaction[], onPick(emoji), onReply?, onReport?, onClose` | `onPick`, `onReply`, `onReport`, `onClose` (outside pointerdown + `swallowNextClick`, `:4832-4846`) |
| `ConversationActionSheet` `:2342` | `threadId, thread: ThreadEntry \| null, clubRoom, pinned, muted, feedback, onFeedback, onPinned(at), onMuted(until), onClose, onOpenGroupSettings, onCleared, onLeftOrDeleted` | pin/mute mirrors via `onPinned`/`onMuted`; `onCleared` → `setMessages([])`; `onLeftOrDeleted` → `onClose()` of the view (`:2275-2298`) |
| `SheetRow` `:2718` | `label, onClick?, href?, onClose?, danger?, bold?, disabled?` | `onClick`, or a `Link` that calls `onClose` |
| `MuteDurationSheet` `:2784` | `onClose, onPick(hours \| null)` | `Drawer.NestedRoot` (`:2801`) |
| `GroupSettingsView` `:2836` | `threadId, thread: ThreadEntry, onClose, onLeft` | `onLeft` → view closes (`:2328-2331`) |
| `MemberRow` `:3355` | `member: ThreadMember, muted, onOpenActions` | `onOpenActions` |
| `MemberActionSheet` `:3520` | `member, muted, canRemove, onClose, onMute(hours), onUnmute, onRemove` | the four callbacks |
| `ComposeOverlay` `:3603` | `onCancel, onPick(handle)` | used by MessagesMobile `:743-747` (start a DM) AND by GroupSettingsView `:3319-3323` (add a member) |
| `ComposeUserRow` `:3885` | `user: SearchUser, onPick` | `onPick` |

Shared types and who reads them: `ThreadEntry` (MessagesMobile, ThreadRow, ConversationView, ConversationActionSheet, GroupSettingsView,
threadTitle/threadAvatar/entryCanPost); `ThreadMember` (GroupSettingsView, MemberRow, MemberActionSheet); `MessageRow` (ConversationView,
MessageBubble); `MessageReaction` (MessageRow, ReactionPicker); `ParentPreview` (MessageRow, ReplyTarget, quotedBody, startReply);
`MessageAttachment` (MessageRow only); `StagedMedia`, `ReplyTarget` (ConversationView only); `Tab` (MessagesMobile, EmptyState);
`SearchUser` (ComposeOverlay, ComposeUserRow). `ThreadType` is `"dm" | "group" | "org"` (`:55`) while the server sends `"org_channel"`
for a club room (`src/app/api/me/threads/route.ts:63,479`) and CampusMobile synthesizes `"org"` (`CampusMobile.tsx:2463`); the file's
own comment says so at `:2278-2279`.

---

## 4. Every read of a wave-1 field, and of REFUSAL_SENTENCES

Method: `grep -nE "can_post|room_kind|roomKind|canPost|\.room\b|hidden|removed|\bcard\b|reply_count|author_role|REFUSAL_SENTENCES|RefusalCode|RoomKind|ThreadMessagesResponse|board_officers_only|room_closed|\.code\b"` over the file, every hit read.

| Field / name | Where | What happens |
|---|---|---|
| `ThreadEntry.room_kind?: RoomKind` | declared `:105` (comment `:102-104`) | seed for `roomKind` state `:1093`, and the render-time reset `:1134` |
| `ThreadEntry.can_post?: boolean` | declared `:107` (comment `:106`) | read only by `entryCanPost` `:365` (`typeof thread?.can_post === "boolean"`); dm/group → `true` `:366`; else `null` `:367` |
| `entryCanPost(thread)` | `:364-368` | seeds `canPost` `:1094` and re-seeds on thread change `:1135` |
| thread read `viewer.can_post` | `:1187` | `setCanPost(prev => viewer ? viewer.can_post !== false : (prev ?? true))` |
| thread read `room.kind` | `:1188` | `if (r.data.room?.kind) setRoomKind(r.data.room.kind)` — the response is typed `{ messages?, viewer_id? } & Partial<Pick<ThreadMessagesResponse, "room" \| "viewer">>` `:1168-1172` |
| failed thread read | `:1193` | `setCanPost(prev => prev ?? true)` (unknown → composer shows, as before club chat) |
| send refused with `r.code === "board_officers_only" \|\| "room_closed"` | `:1347` | `setCanPost(false)` — the quiet line replaces the composer (text branch only; the media branch `:1301-1308` toasts and returns without this) |
| `canPost` gates | `:1837` (`onReply={canPost ? … : undefined}`), `:1942` (reply pill + staged chip drawn only when `canPost`), `:2089` (`canPost !== true` → quiet bar), `:2091` (`role="note"` only when `false`) | |
| `roomKind` gates | `:1448` (`canAttach … && !roomKind`), `:2114-2116` (quiet line sentence: `board` → `REFUSAL_SENTENCES.board_officers_only`, else `REFUSAL_SENTENCES.room_closed`; empty while `canPost === null` `:2112`), `:2280` (`clubRoom={!!roomKind \|\| (!!thread && thread.type !== "dm" && thread.type !== "group")}`) | |
| `REFUSAL_SENTENCES` | import `:23`; `chatRefusalLine` `:349-350` (hasOwnProperty check, then `r.error?.trim() \|\| REFUSAL_SENTENCES[r.code as RefusalCode]`); quiet line `:2115-2116` | |
| `toastSendFailure` (uses chatRefusalLine) | `:354-357`; called `:1283` (upload-url sign), `:1307` (media send), `:1341` (text send) | `toast({ message: line ?? r.message, tone: "error", action: line ? undefined : r.action })` |
| `RefusalCode`, `RoomKind`, `ThreadMessagesResponse` | imports `:24-26`; `RoomKind` also `:105`, `:1093`; `ThreadMessagesResponse` only `:1170` | type-only |
| `removed_at`, `removed_reason` (the OLD moderation columns, NOT wave 1's `removed`) | `MessageRow` `:183-184` (comment `:175-182` says the route never sends them); `MessageBubble` `:4558-4569` renders `RemovedContentCard kind="message" compact` for `isMine && message.removed_at` — "Unreachable today" per its own comment `:4556-4557` | |
| `kind`, `thread_root_id`, `card`, `reply_count`, `author_role`, `hidden`, `removed` (wave-1 message fields) | **not read anywhere** in this file. `MessageRow` (`:150-185`) does not declare them. The word `card` at `:4294-4304`, `:4656` is MessageBubble's local `let card: React.ReactNode` for a shared post; `hidden` hits are CSS `overflow: "hidden"` / `aria-hidden` | B5 notes confirm: "the bubble reads none of the new fields" (`handoffs/chat-redesign/wave-1-build/B5-notes.md:24`) |
| `org` (`ThreadEntryRoomFields.org`) | not declared on this file's `ThreadEntry` (`:73-108`), not read | |
| `ThreadType` vs the server | `:55` `"dm" \| "group" \| "org"`; server sends `"org_channel"` (`src/app/api/me/threads/route.ts:63`); the comparisons here are always `=== "dm"` / `=== "group"` (`:308,313,366,1245,1448,2280,2381-2382`) or `=== "org"` (`:2212` placeholder only), so an `org_channel` entry takes the non-dm/non-group branches | |

Other `.code` reads: none besides `:349-350` and `:1347`. `is_request` `:1242`; `unread` `:571`, `:836`; `muted_until` `:571`, `:1118`; `pinned_at` `:1115`;
`viewer_role` `:2867`; `members` `:2853`; `hidden_at` declared `:98` and never read.

---

## 5. Fetching

### 5.1 Every request (`grep -nE "vibeRequest|fetch\("`)
| Line | Component / callback | Method + URL | Via | Notes |
|---|---|---|---|---|
| `:415` | MessagesMobile · `openOrCreateDmFromHandle` | POST `/api/me/threads` `{ handle }` | vibeRequest | failure "Couldn't start that conversation." |
| `:453` | MessagesMobile · `refetchThreads(mode)` | GET `/api/me/threads` | vibeRequest, `cache: "no-store"`, `quiet: mode !== "refresh" \|\| !listLoadedRef.current` | answer `{ threads, requests }` `:463`; seq guard `:461` |
| `:540` | MessagesMobile · `?to=` effect | POST `/api/me/threads` `{ handle }` | vibeRequest | then `refetchThreads()` `:551`, `deepLinkSeqRef` guard `:554` |
| `:1168` | ConversationView · first load / Retry | GET `/api/me/threads/<id>/messages?limit=50` | vibeRequest, `no-store`, quiet | **no `?after=`, no `?before=`**; oldest-first array used as-is (comment `:1179-1180`) |
| `:1203` | ConversationView · mark read | POST `/api/me/threads/<id>/read` | vibeRequest, quiet | fire-and-forget, on `threadId` change |
| `:1273` | ConversationView · `send` (media) | POST `/api/me/messages-upload-url` `{ channelId, contentType, sizeBytes }` | vibeRequest, quiet | |
| `:1294` | ConversationView · `send` (media) | PUT `<uploadUrl>` (R2, cross-origin) body = File | vibeRequest | |
| `:1301` | ConversationView · `send` (media) | POST `/api/me/threads/<id>/messages` `{ content, parent_message_id?, media_url: objectKey, media_kind }` | vibeRequest, quiet | non-optimistic |
| `:1335` | ConversationView · `send` (text) | POST `/api/me/threads/<id>/messages` `{ content, parent_message_id? }` | vibeRequest, quiet | optimistic `temp_<Date.now()>` row `:1319-1333`, replaced `:1354`, removed on failure `:1342` |
| `:1394` | ConversationView · `acceptRequest` | POST `/api/me/threads/<id>/accept` | vibeRequest | |
| `:1414` | ConversationView · `declineRequest` | POST `/api/me/threads/<id>/decline` | vibeRequest | `window.confirm` first `:1408-1412` |
| `:1517` | ConversationView · `toggleReaction` | POST / DELETE `/api/me/threads/<id>/messages/<mid>/react` `{ emoji }` | **raw `fetch`**, optimistic, rollback in `catch` only (a 4xx does NOT roll back) | |
| `:2390` | ConversationActionSheet · `togglePin` | POST `/api/me/threads/<id>/pin` `{ pinned }` | raw fetch + `r.json()`, `j?.ok` check | feedback text via `onFeedback` |
| `:2413` | · `unmute` | DELETE `/api/me/threads/<id>/mute` | raw fetch | |
| `:2434` | · `muteFor(hours)` | POST `/api/me/threads/<id>/mute` `{ duration_hours }` | raw fetch | `j.muted_until` |
| `:2466` | · `clearHistory` | POST `/api/me/threads/<id>/clear` | raw fetch | `window.confirm` |
| `:2491` | · `hideConversation` | POST `/api/me/threads/<id>/hide` | raw fetch | `window.confirm` |
| `:2517`, `:2525` | · `leaveGroup` | GET `…/messages?limit=1` (to learn `viewer_id`), then DELETE `/api/me/threads/<id>/members/<viewerId>` | raw fetch | |
| `:2550` | · `blockPeer` | POST `/api/me/block` `{ target_id }` | raw fetch | `window.confirm` |
| `:2891` | GroupSettingsView · `saveName` | PATCH `/api/me/threads/<id>` `{ name }` | raw fetch | |
| `:2923` | · `removeMember` | DELETE `/api/me/threads/<id>/members/<mid>` | raw fetch, optimistic with rollback | |
| `:2948` | · `muteMember` | POST `/api/me/threads/<id>/members/<mid>/mute` `{ duration_hours? }` | raw fetch | |
| `:2974` | · `unmuteMember` | DELETE `/api/me/threads/<id>/members/<mid>/mute` | raw fetch | |
| `:3000`, `:3008` | · `leave` | GET `…/messages?limit=1`, then DELETE `…/members/<viewerId>` | raw fetch | same dance as `leaveGroup` |
| `:3027` | · `addMember(handle)` | POST `/api/me/threads/<id>/members` `{ handle }` | raw fetch | |
| `:3649` | ComposeOverlay · suggested | GET `/api/me/suggested-connections?limit=20` | raw fetch, try/catch | |
| `:3676` | ComposeOverlay · search | GET `/api/users/search?q=…&limit=20` | vibeRequest, quiet | debounced 220 ms `:3639` |

### 5.2 Polling and re-sync — there is NONE for messages
- The conversation loads once per `threadId` / `loadSeq` (`:1165-1198`); nothing re-reads while it is open (no `setInterval` anywhere:
  `grep -n setInterval` → none). New messages from others appear only on Retry, on reopen, or after a send that couldn't be painted
  (`if (!row || messages === null) reload()` `:1360`). The code map says the same ("NO polling", `handoffs/chat-redesign/code-map.md:14`).
- The thread LIST re-syncs quietly on `visibilitychange` → visible, at most once per `LIST_RESYNC_MS` (30 s) since the last load
  (`:486-496`), plus `refetchThreads()` after closing a view (`:734-737`), after `onThreadsChanged` (`:733`), after a DM is created (`:426`, `:550`).
- Timers in the file: feedback auto-clear 1800 ms (`:2569`, `:2872`), compose autofocus 60 ms (`:3633`), search debounce 220 ms (`:3639`),
  long-press 500 ms (`:4051`), swallowNextClick 1000 ms (`:4777`), picker listener bind on next tick (`:4840`).

### 5.3 `initialHandle` / `initialChannelId` and the `?channel=` deep link
- `src/app/messages/page.tsx:26-36` (server): `?to` → `initialHandle` lowercased, `?channel` → `initialChannelId` trimmed; both go through
  `MessagesSwitch` (`src/app/messages/MessagesSwitch.tsx:19-35`) into `MessagesMobile` (mobile) or into the `messages.html` iframe URL
  as `to` / `channel` (desktop, `:40-43`). The URL is never rewritten by MessagesMobile (no `history.replaceState`: `grep` → none in this file).
- `?channel=` (`:497-513`; effect `:506-513`): on every change of `initialChannelId`, once per id (`lastHandledChannelRef`), bump `deepLinkSeqRef`, close
  compose, `setOpenThreadId(initialChannelId)`. Opens the view immediately, before/without the list; the view's own read works for any
  thread the viewer may read (comment `:498-504`). The `thread` prop is whatever the list has for that id, else `null` (`:727-731`).
- `?to=` (`:515-566`; effect `:522-566`): waits for the first list load to settle (`threads === null && !listErr` → return), once per lowercased handle
  (`lastHandledHandleRef`); an existing DM opens directly `:530-536`; otherwise POST `/api/me/threads`, `refetchThreads()` `:550`, then open
  unless a newer deep link took over (`deepLinkSeqRef` `:553`). Lint error at `:534` is this branch (section 7).
- CampusMobile's own `?channel=` (`CampusMobile.tsx:265-271`, `:422-435`): sets `tab` to `"chat"` and mounts `ConversationView` with a
  synthetic `OpenChannel` whose `name` is null → `synthesizeChannelThread` returns `null` (`CampusMobile.tsx:2460`) → the view's title is
  "Conversation" (`:1551`).

---

## 6. Night / Light and the CSS tokens

- Truth: `<html data-theme>` via `currentTheme()` (`src/lib/theme/theme.ts:142`) and the `THEME_EVENT` (`theme.ts:43`), read through
  `useNightTheme` (`:229-235`). The comment at `:219-223` explains the S67 wave-3 decision: in Night a DM/group wears the dark-glass
  palette that org backdrops already had.
- Two different "dark" signals: `night` (the theme) and `onDark = !!backdropCss || night` (`:1080`). The header, list, reply pill,
  composer and bubbles key on `onDark` (passed to `MessageBubble` as `darkMode` `:1831`); the quiet line keys on `backdropCss` only
  (`:2103-2109`, tokens on the page's paper otherwise); the Messages header / GroupSettings header / Compose header key on `night`
  (`:591`, `:3074`, `:3719`, `:3759`); ThreadRow, TabPill, SheetRow, sheets use tokens only (no branch).
- Tokens used (count of `var(--…)` occurrences): `--charcoal` 26, `--scrim-rgb` 25 (always inside `rgba(var(--scrim-rgb),α)`),
  `--ink-muted` 10, `--ink-2` 5, `--cream` 5, `--tabbar-bg` 4, `--paper-70` 4, `--paper` 4, `--hairline` 2, `--feed-backdrop` 1 (`:581`),
  `--error-ink` 1 (`:2743`). No other token.
- Literals that the file's own comments call "no token yet": header cream `rgba(250, 247, 242, 0.86)` (`:591`), `.92` (`:1605`),
  `.94` (`:3074`, `:3719`, `:3759`), `.96` (`:1952`, `:2133`); white `.78` (`:630`, `:1726`, `:2169`, `:3500`, `:3800`), `.92` (`:2228`, `:3165`);
  dark glass `rgba(14, 11, 22, 0.62/0.72)` and `rgba(20,16,28,0.55/0.62)`; coral `#FF5C35` (badge `:793`, unread `:904`/`:941`, send
  `:2249`, bubbles `:4120`, reply pill `:1975`); charcoal `#1C1C1E`; muted `#8A8580`; `#5C5853`; avatar peach `#FFD3C2`.
  `ReactionPicker` and `MessageBubble` are entirely literal-coloured, branched on `darkMode` (`:4117-4147`, `:4873-4883`).
- Fonts: `Fraunces, serif` (titles) and `DM Sans, sans-serif` (body) as inline `fontFamily` throughout; no CSS module, no className
  except none (the file uses inline styles only; `grep -n className` → none).

---

## 7. Lint state today

Command run in this session: `npx eslint src/components/mobile/MessagesMobile.tsx src/components/mobile/CampusMobile.tsx`
(ESLint 9, `eslint-config-next` core-web-vitals + typescript, `eslint.config.mjs`). Result: **8 problems (7 errors, 1 warning)**.

| File:line:col | Level | Rule | What |
|---|---|---|---|
| `MessagesMobile.tsx:481:5` | error | `react-hooks/immutability` | `refetchThreadsRef.current = refetchThreads` inside `useEffect` ("value previously passed as an argument to a hook") |
| `MessagesMobile.tsx:534:7` | error | `react-hooks/set-state-in-effect` | `setOpenThreadId(existing.id)` in the `?to=` effect |
| `MessagesMobile.tsx:2855:20` | warning | `@typescript-eslint/no-unused-vars` | `setPhotoUrl` assigned, never used (GroupSettingsView) |
| `MessagesMobile.tsx:3669:7` | error | `react-hooks/set-state-in-effect` | `setResults(null)` in ComposeOverlay's search effect |
| `CampusMobile.tsx:282:7` | error | `react-hooks/set-state-in-effect` | `setOpenPostId(initialPostId)` in the `?post=` effect |
| `CampusMobile.tsx:434:27` | error | `react-hooks/set-state-in-effect` | `if (initialChannelId) setTab("chat")` |
| `CampusMobile.tsx:630:10` | error | `react-hooks/set-state-in-effect` | (an effect in CampusMobile, not chat-related) |
| `CampusMobile.tsx:3990:7` | error | `react-hooks/set-state-in-effect` | `setUsers([])` in CampusSearchOverlay's search effect |

Baseline agreement: B5's gate recorded MessagesMobile at "3 errors / 1 warning … immutability 481, set-state-in-effect 534 and 3669,
unused setPhotoUrl" (`handoffs/chat-redesign/wave-1-build/B5-gate.md:6`) — identical to today. The contract's lint rule is "no new
errors in the batch's files" (`handoffs/chat-redesign/wave-1-contracts.md:636`). After the split, the three MessagesMobile errors land in
whichever new file holds MessagesMobile (481, 534) and ComposeOverlay (3669), and the warning in GroupSettingsView's file: the
"no new errors" check must compare per RULE and per moved declaration, not per file name (a fresh file with 2 old errors is not "new").

---

## 8. Who imports from MessagesMobile.tsx

`grep -rn "MessagesMobile" src` → two real importers; every other hit is a comment naming the file as a pattern
(`OrgInviteBanner.tsx:15`, `OrgJoinControl.tsx:32,459`, `ReportSheet.tsx:568`, `PushAsk.tsx:306`, `PostViewerMobile.tsx:855`,
`ProfileMobile.tsx:5974,6266,6307`, `NetworkMobile.tsx:103`, `lib/push/payload.ts:321`).

1. `src/app/messages/MessagesSwitch.tsx:4` — `import { MessagesMobile } from "@/components/mobile/MessagesMobile"`; renders it at `:31-34`
   inside `MobileShell` when `useIsMobile()` (`:26-37`).
2. `src/components/mobile/CampusMobile.tsx:37` — `import { ConversationView } from "@/components/mobile/MessagesMobile"`. Uses:
   - `:1042-1052` mounts `<ConversationView threadId thread={synthesizeChannelThread(openChannel)} onClose backdropCss>`.
   - `:2459-2472` `synthesizeChannelThread(c: OpenChannel)` builds `{ id, type: "org", name: "# <name>", photo_url, peer: null, members: [],
     last_message: null, last_read_at: null, accepted_at }` cast `as Parameters<typeof ConversationView>[0]["thread"]` (`:2471`) — a
     TYPE-level dependency on the exported component's first parameter. Returns `null` when `c.name` is null (`:2460`).
   - The Chat tab: `type Tab` `:88` includes `"chat"`, `TAB_ORDER` `:89`, `TAB_LABEL.chat = "Chat"` `:1156`; `TabStrip` `:1160-1216`
     rendered at `:850` with `order={tabOrder}` (`:188`). `?tab=` is read at `:166-171` (`useSearchParams`, initial state only);
     `?channel=` at `:271` (`initialChannelId`), seeds `openChannel` `:422-431` and forces `setTab("chat")` in an effect `:433-435`
     (lint error 434). `setTab` is also called by the swipe handler `:863` and the `?post=` / `?tag=` handlers (`:283`, `:319`, `:342`).
   - `ChatPane` `:2157-2404` (rendered `:968`, keyed by `chatKey` `:256`): GET `/api/orgs?filter=mine` `:2171`; dark surface
     `linear-gradient(180deg, #1A1B1F 0%, #16171B 100%)` `:2203`; title "Servers" `:2230`, search placeholder "Search servers" `:2255`, drawer search "Search channels" `:2718`, group "Text channels" `:2776` (Discord words on the flag-off path, untouched until after launch per D5;
     `onSelectOrg` → `selectedOrgForChat` `:421`.
   - `OrgChannelsDrawer` `:2487-2821` (rendered `:1030-1036`): GET `/api/orgs/<handle>/channels` `:2514`; `body.vibe-composer-open`
     `:2506-2507`; `Drawer.Root direction="right"` `:2543`, overlay zIndex 1080 `:2553` / content 1081 `:2573` so ConversationView
     (1099/1100) stacks above; rows `DarkChannelRow` `:2841` → `onOpenChannel({ id, name, orgName, orgLogo, orgBackdrop })` `:2783-2789`,
     `:2804-2810`; groups "Text channels" / "Private" (`ChannelGroupHeader` `:2823`).
   - Types local to CampusMobile that describe this path: `JoinedOrg` `:2423-2431`, `ChannelRow` `:2433-2441`, `OpenChannel` `:2446-2455`.
   - `BACKDROP_PRESETS` / `BackdropKey` come from `@/app/campus/campus-home` (`:8-18`).
3. Nothing else imports the file. The types `ThreadEntry`, `MessageRow`, etc. are NOT exported today, so SharePostSheet (`:33`) and the
   threads route (`route.ts:61`) each declare their own `ThreadEntry`.

---

## 9. page.tsx, MessagesSwitch.tsx, MobileShell.tsx, MobileTabBar.tsx — and how the tab bar hides

- `src/app/messages/page.tsx` (37 lines, server component): `enforceCampusAccess("/messages")` `:25`; reads `to` / `channel` from
  `searchParams` (a Promise, `:11-15`, awaited `:26`); `initialHandle` lowercased `:28`, `initialChannelId` trimmed `:30`; renders
  `<MessagesSwitch initialHandle initialChannelId>` `:31-35`. `metadata.title = "Messages · Vibe"` `:5-8`.
- `src/app/messages/MessagesSwitch.tsx` (68 lines, `"use client"`): `useIsMobile()` `:26` (matchMedia `(max-width: 899px)`,
  `src/lib/use-is-mobile.ts:16`, hook `:54`, server snapshot `false` `:36-38`); mobile → `<MobileShell><MessagesMobile …/></MobileShell>` `:28-37`;
  desktop → `<CampusAppShell><iframe src="/html/messages.html?app=1&embedded=1[&to=][&channel=]" …/></CampusAppShell>` `:39-66`.
  Desktop is untouched by wave 2 (D5, D10).
- `src/components/mobile/MobileShell.tsx` (40 lines): a `<div style={{ minHeight: "100dvh", paddingBottom: "calc(64px + env(safe-area-inset-bottom, 0px))", background: "var(--cream)" }}>`
  around `children` plus `<MobileTabBar />` `:25-40`. No class name, so the `.vibe-tabbar-page:has([aria-modal="true"])` rule
  (`globals.css:2952-2954`) does NOT apply to `/messages`; that rule is for server pages without a MobileShell (`/orgs/[handle]`, `/plus`).
- `src/components/mobile/MobileTabBar.tsx` (165 lines): five tabs `/campus`, `/network`, `/otto`, `/messages`, `/profile` (`MOBILE_TABS`
  `:37-129`); `<nav className="vibe-mobile-tabbar">` `:136`; active tab from `activeMobileTab(pathname)` (`mobile-tab-active.ts:29-38`).
  No badge on the Messages tab (the unread count lives only in MessagesMobile's All pill `:667-672`).
- How the bar hides while a conversation is open: `globals.css:2853-2880` — `.vibe-mobile-tabbar` is `display: none` by default, `display:
  grid` inside `@media (max-width: 899px)`, and `body.vibe-composer-open .vibe-mobile-tabbar { display: none !important; }` `:2878-2880`.
  ConversationView (`:1158-1159`), GroupSettingsView (`:2879-2880`), ComposeOverlay (`:3625-3626`) add/remove that body class on
  mount/unmount; so do CampusMobile's OrgChannelsDrawer (`:2506-2507`) and CampusSearchOverlay (`:3968-3969`), and PostComposerMobile
  (`:115-117`). The class is a counter-less boolean: when two of these are mounted at once (Compose over the list, or Group info over a
  conversation) the FIRST to unmount removes the class while the other is still up — the bar reappears under the remaining overlay.
  Today that can happen with GroupSettingsView over ConversationView (`:2324-2333`): closing Group info removes the class while the
  conversation stays open; ConversationView's `Drawer.Content` is `position: fixed; zIndex: 1100` (`:1575-1592`) while the bar is
  `position: fixed; z-index: 9988` (`globals.css:2857-2862`), so a re-shown bar would paint OVER the open conversation's composer.
  Not walked in a browser here; recorded as a fact of the CSS and the mount order, for the screen batches to keep in mind.

---

## 10. Proposed split (extraction only, D6) — file by file

Target directory: `src/components/mobile/messages/` (does not exist today: `ls src/components/mobile/` shows no `messages` dir).
Principle: a declaration moves whole (its doc comment with it), unchanged modulo whitespace, the added `export` keyword and import lines.
Single-consumer declarations stay in their consumer's file (fewer exports, fewer names to keep stable). Every new component file starts
with `"use client"` (all of them use hooks or the DOM) and keeps NAMED exports only (the source has no default export).

| New file | Moves (source lines) | Must become `export` | Imports it needs |
|---|---|---|---|
| `messages/types.ts` | `ThreadType` `:55`, `ThreadPeer` `:57-63`, `ThreadMember` `:65-71`, `ThreadEntry` `:73-108`, `MessageReaction` `:110-114`, `MessageAttachment` `:118-131` (comment `:116-117`), `ParentPreview` `:136-148` (comment `:133-135`), `MessageRow` `:150-185`, `Tab` `:211` | all of them (`ThreadType` may stay private if `ThreadEntry` is the only user — it is) | `import type { RoomKind } from "@/lib/chat/types"` (for `:105`) |
| `messages/theme.ts` | `subscribeTheme` `:224-227`, `useNightTheme` `:229-235` (comment `:219-223`) | `useNightTheme` | `useSyncExternalStore` from `react`; `currentTheme, THEME_EVENT` from `@/lib/theme/theme`. Add `"use client"` (it is a hook). |
| `messages/sheet-styles.ts` | `vaulOverlayStyle` `:237-242`, `vaulContentStyle` `:244-256`, `vaulHandleStyle` `:258-264`, `visuallyHiddenStyle` `:268-278` (comments `:213-218`, `:265-267`) | all four | none at runtime; the `React.CSSProperties` annotations resolve through `@types/react`'s global namespace without an import (they do so today, `:237`; a `.ts` module may reference a UMD global in TYPE position) — see H3 |
| `messages/format.ts` | `relativeTime` `:282-295`, `initialsOf` `:297-305`, `threadTitle` `:307-310`, `threadAvatar` `:312-323`, `quotedBody` `:327-340` (comment `:325-326`), `entryCanPost` `:364-368` (comment `:359-363`) | all six | `import type { ThreadEntry, ParentPreview } from "./types"` |
| `messages/send-failure.ts` | `chatRefusalLine` `:348-351` (comment `:342-347`), `toastSendFailure` `:354-357` (comment `:353`) | `toastSendFailure` (and `chatRefusalLine`, which the screen batches will want) | `REFUSAL_SENTENCES, type RefusalCode` from `@/lib/chat/types`; `type VibeFailure` from `@/lib/feedback/request`; `toast` from `@/lib/feedback/toast` |
| `messages/ThreadList.tsx` | `TabPill` `:753-808`, `ThreadRow` `:810-951`, `ListSkeleton` `:953-998`, `EmptyState` `:1000-1053` (banner `:751`) | all four (`ListSkeleton` is also used by `ComposeOverlay` `:3822`, `:3824`) | `Link`; `type ThreadEntry, type Tab` from `./types`; `relativeTime, threadTitle, threadAvatar` from `./format` |
| `messages/ConversationView.tsx` | `ATTACH_ACCEPT` … `MAX_VIDEO_BYTES` `:189-197` (stay private), `StagedMedia` `:200-205` (comment `:199`), `ReplyTarget` `:209` (comment `:207-208`), `ConversationView` `:1057-2338` (banner `:1055`) | `ConversationView` | `Link`; `useCallback, useEffect, useRef, useState`; `Drawer`; `asLoadFailure, LoadFailed, type LoadFailure`; `PushAsk`; `ReportSheet, type ReportTargetRef`; `REFUSAL_SENTENCES, type RoomKind, type ThreadMessagesResponse`; `vibeRequest`; `toast`; `type ThreadEntry, type MessageRow` from `./types`; `useNightTheme` from `./theme`; `vaulOverlayStyle, visuallyHiddenStyle` from `./sheet-styles`; `threadTitle, threadAvatar, quotedBody, entryCanPost` from `./format`; `toastSendFailure` from `./send-failure`; `ConversationActionSheet`; `GroupSettingsView`; `MessageBubble` |
| `messages/sheets.tsx` | `SheetRow` `:2718-2782`, `MuteDurationSheet` `:2784-2832` | both (`SheetRow`: ConversationActionSheet, MuteDurationSheet, GroupSettingsView, MemberActionSheet; `MuteDurationSheet`: ConversationActionSheet, MemberActionSheet) | `Link`; `Drawer`; the four styles from `./sheet-styles` |
| `messages/ConversationActionSheet.tsx` | `ConversationActionSheet` `:2342-2716` (banner `:2340`) | `ConversationActionSheet` | `useCallback, useEffect, useState`; `Drawer`; `ReportSheet, type ReportTargetRef`; `type ThreadEntry`; the four styles; `SheetRow, MuteDurationSheet` from `./sheets` |
| `messages/GroupSettingsView.tsx` | `GroupSettingsView` `:2836-3353` (banner `:2834`), `MemberRow` `:3355-3518`, `MemberActionSheet` `:3520-3590` (the last two stay private: single consumer) | `GroupSettingsView` | `Link` (MemberRow); `useCallback, useEffect, useState`; `Drawer` (MemberActionSheet); `type ThreadEntry, type ThreadMember`; `useNightTheme`; `initialsOf`; the four styles; `SheetRow, MuteDurationSheet`; `ComposeOverlay` |
| `messages/ComposeOverlay.tsx` | `SearchUser` `:3594-3601` (private), `ComposeOverlay` `:3603-3883` (banner `:3592`), `ComposeUserRow` `:3885-3966` (private) | `ComposeOverlay` | `useEffect, useRef, useState`; `asLoadFailure, LoadFailed, type LoadFailure`; `vibeRequest`; `useNightTheme`; `initialsOf`; `ListSkeleton` from `./ThreadList` |
| `messages/MessageBubble.tsx` | `MessageBubble` `:3968-4751` | `MessageBubble` | `Link`; `useRef, useState`; `RemovedContentCard`; `type MessageRow`; `initialsOf, quotedBody`; `ReactionPicker` |
| `messages/ReactionPicker.tsx` | `REACTION_EMOJIS` `:187` (private), `swallowNextClick` `:4758-4778` (comment `:4752-4757`, private), `ReactionPicker` `:4780-4965`, `pickerRowStyle` `:4968-4985` (comment `:4967`, private) | `ReactionPicker` | `useEffect, useLayoutEffect, useRef, useState`; `type MessageReaction` |
| `MessagesMobile.tsx` (stays) | `"use client"` `:1`, header comment `:32-51`, `LIST_RESYNC_MS` `:374` (comment `:372-373`), `MessagesMobile` `:376-749` | keeps `export function MessagesMobile`; adds `export { ConversationView } from "./messages/ConversationView";` | `useCallback, useEffect, useMemo, useRef, useState`; `asLoadFailure, LoadFailed, type LoadFailure`; `vibeRequest`; `toast`; `type ThreadEntry, type Tab`; `useNightTheme`; `TabPill, ThreadRow, ListSkeleton, EmptyState`; `ConversationView`; `ComposeOverlay`. Drops `Link`, `Drawer`, `PushAsk`, `ReportSheet`, `REFUSAL_SENTENCES`, `currentTheme`, `THEME_EVENT`, `useLayoutEffect`, `useSyncExternalStore`. |

The two names `MessagesMobile.tsx` must keep exporting: **`MessagesMobile`** (for `src/app/messages/MessagesSwitch.tsx:4`) and
**`ConversationView`** (for `src/components/mobile/CampusMobile.tsx:37`, including the type-level `Parameters<typeof ConversationView>` at
`CampusMobile.tsx:2471`). A re-export (`export { ConversationView } from "./messages/ConversationView"`) satisfies both; the importers
need no edit. After the split, wave-2 screens import from `@/components/mobile/messages/*` directly and never add to `MessagesMobile.tsx`
beyond the navigation/deep-link work (plan-critique #11, `plan-critique.md:193-194`).

Import graph after the split (no cycle): `MessagesMobile` → {ThreadList, ConversationView, ComposeOverlay, theme, types};
`ConversationView` → {MessageBubble → ReactionPicker; ConversationActionSheet → sheets; GroupSettingsView → {sheets, ComposeOverlay → ThreadList}};
leaves: `types`, `theme`, `sheet-styles`, `format`, `send-failure`. Nothing under `messages/` imports `MessagesMobile.tsx`.

### 10.1 Hazards for a mechanical move
- **H1 `"use client"`.** Only `:1` carries it today. Every new `.tsx` (and `theme.ts`) should start with it: they use hooks, `document`,
  `window`, `navigator`. Next 16 treats the directive on a module already inside the client graph as harmless; without it the files still
  work when imported from `MessagesMobile.tsx` / `CampusMobile.tsx` (both client), but a later server-component import would break. The
  check script must skip the directive line like an import line.
- **H2 No default export anywhere** (`grep -n "export default"` → none); keep it that way so `CampusMobile.tsx:37` and
  `MessagesSwitch.tsx:4` stay named imports.
- **H3 The `React.` namespace without an import** (`:237,244,258,268,4007,4084,4093,4097,4104,4149,4231,4294,4968`). It compiles today
  because `@types/react` declares `export as namespace React` and TS allows a UMD global in TYPE position inside a module. Moving the text
  unchanged keeps that; rewriting to `import type { CSSProperties } from "react"` would change the declaration text and fail the
  identical-text check. Keep the text; `npm run typecheck` is the proof.
- **H4 `isolatedModules: true`** (`tsconfig.json:13`): re-exporting a TYPE needs `export type { … }`; importing one may use `import { type X }`.
  Only `ConversationView` (a value) is re-exported from `MessagesMobile.tsx`, so no type re-export is needed.
- **H5 Lint errors move with their code** (section 7): 481 and 534 stay in `MessagesMobile.tsx`; 3669 → `ComposeOverlay.tsx`; the
  warning 2855 → `GroupSettingsView.tsx`. The gate compares rule+declaration, not file counts.
- **H6 Comments that name siblings** (`:1068`, `:1421`, `:3994`, `:2565`) stay as they are; they are not imports.
- **H7 Doc comments belong to the declaration below them**: `:116-117`, `:133-135`, `:199`, `:207-208`, `:219-223`, `:265-267`, `:325-326`,
  `:342-347`, `:353`, `:359-363`, `:372-373`, `:4752-4757`, `:4967` (and the section banners `:53,213,280,370,751,1055,2340,2834,3592`,
  which may be dropped or kept; the check ignores comment-only lines).
- **H8 Two module-level names read by more than one component must not be duplicated**: `ListSkeleton` (MessagesMobile `:696`,
  ComposeOverlay `:3822,3824`), `SheetRow` / `MuteDurationSheet` / the four vaul styles / `useNightTheme` / `initialsOf`. One home each.
- **H9 Function hoisting hides forward references** that become imports: `MessagesMobile` → `TabPill`… (declared after it),
  `MessageBubble` → `ReactionPicker`, `ConversationView` → the sheets, `GroupSettingsView` → `ComposeOverlay` (declared 750 lines later).
  All become explicit imports; no runtime order issue because no module-level code runs anything.
- **H10 Body-class side effect** (`vibe-composer-open`) is inside three components and moves with them; the boolean-not-counter
  behaviour (section 9) is pre-existing and NOT this batch's to change.
- **H11 Single-consumer types** (`StagedMedia`, `ReplyTarget`, `SearchUser`, `MessageAttachment` via `MessageRow`) — the table keeps the
  first three private in their consumer; `MessageAttachment` must go to `types.ts` because `MessageRow` references it.
- **H12 `Tab`** is used by both `MessagesMobile` (`:385`) and `EmptyState` (`:1000`) → `types.ts`, exported.
- **H13 `LIST_RESYNC_MS`** stays private in `MessagesMobile.tsx` (single reader `:491`).
- **H14 No test imports the file** (`grep -rn MessagesMobile src --include=*.test.ts` → none), so `npm test` proves nothing about the
  split by itself; `typecheck` + `eslint` + the identical-text script are the proof (D6).
- **H15 The proof script** (proposed `handoffs/chat-redesign/wave-2-build/tools/check-split.mjs`): read `git show HEAD:src/components/mobile/MessagesMobile.tsx`,
  slice each declaration by the ranges in section 1.1, normalise (collapse whitespace, strip a leading `export `, drop lines that start with
  `import `, `export {`, `"use client"`, `//` or `/*`…`*/`), then find the same normalised text in the new files; report any declaration
  missing or altered, and any declaration present in the new files that has no source (a new one). Node only, no dependencies.
- **H16 The header comment `:32-51`** ("Two screens, one component", the data list) becomes partly stale after the split; leaving it is
  a comment-only change either way. Not a behaviour change.
- **H17 ESLint on new files** may raise `import` ordering? No: `eslint-config-next` (`eslint.config.mjs:6-7`) has no import-sort rule, so
  the new import blocks cannot add errors on ordering; `@typescript-eslint/no-unused-vars` WILL flag any import a new file does not use.

---

## 11. What B5 changed in this file (wave 1)

Commit `e4f8916` ("old chat screens follow the new room rules (wave 1, B5)") touched six files; in `MessagesMobile.tsx` it is
+134 / −15 lines over 20 hunks (`git diff 026618d e4f8916 --numstat -- src/components/mobile/MessagesMobile.tsx`). The hunks, by
post-commit line (= today's lines, nothing landed after):
- `:19-31` imports: `RemovedContentCard, ReportSheet, type ReportTargetRef`; `REFUSAL_SENTENCES, type RefusalCode, type RoomKind,
  type ThreadMessagesResponse` from `@/lib/chat/types`; `type VibeFailure`.
- `:99-110` `ThreadEntry.room_kind?` and `can_post?` with their comments.
- `:339-372` the three helpers `chatRefusalLine`, `toastSendFailure`, `entryCanPost`.
- `ConversationView`: `roomKind` / `canPost` state `:1086-1097`; the reset block `:1131-1138`; the read's type and `viewer` / `room`
  handling `:1165-1196`; the three sends made quiet + `toastSendFailure` `:1277-1288`, `:1301-1312`, `:1335-1350` (incl. the
  `board_officers_only` / `room_closed` → `setCanPost(false)` at `:1347`); `canAttach … && !roomKind` `:1444-1451`; `onReply` gated on
  `canPost` `:1833-1840`; reply pill / staged chip gated `:1939-1945`; the quiet line in place of the form `:2081-2121`; `clubRoom` prop
  to the action sheet `:2267-2283`; `:2342-2348`.
- `ConversationActionSheet`: `clubRoom` prop `:2356-2364`; `isGroup = … && !clubRoom` `:2379-2385`; "Delete conversation" hidden for a
  club room `:2673-2686`.
Sources: `handoffs/chat-redesign/wave-1-build/B5-notes.md:18-24` (first pass), `:53` (repair: `canPost` became `boolean | null`, reply
pill gated, quiet-line colour `var(--ink-2)`, `clubRoom` also true for any non-dm/non-group type); `B5-repair.md` items 4, 5, 7, 11;
`B5-review-design.md` F1 (contrast → `--ink-2`) and F5 (reply pill); `B5-review-coverage.md` (the `clubRoom` finding, "Resumed run");
`B5-review-regression.md` R3 (composer flash on a Board until the read answers — on the phone solved by `canPost === null` drawing an
empty bar `:2112`); `B5-gate.md:6` (lint 3/1, same as today).
What B5 did NOT change here: `ThreadRow`, `MessageBubble`, `ReactionPicker`, `GroupSettingsView`, `ComposeOverlay`, the thread list
(`B5-notes.md:24`: "ThreadRow and MessageBubble: no change needed").

---

## 12. Surprises (short; no opinions beyond these)

1. The conversation view never polls: one GET per open (`:1165-1198`), no `setInterval` in the file. D7's 4 s `?after=` polling and the
   every-5th full re-read are entirely new behaviour for the wave-2 screens; the old view keeps loading once.
2. Only two exports and no default export; but `CampusMobile.tsx:2471` depends on `ConversationView`'s PROPS TYPE
   (`Parameters<typeof ConversationView>[0]["thread"]`) and builds a `ThreadEntry` with a field the type does not have
   (`last_read_at`, `CampusMobile.tsx:2469`; `type: "org"` at `:2463`) — an `as` cast hides it. Renaming or narrowing `thread`'s type would surface at that line.
3. `ThreadType` is `"dm" | "group" | "org"` (`:55`) but the server sends `"org_channel"` (`route.ts:63`); the code only ever tests for
   `dm` / `group` (and `org` once, for a placeholder `:2212`), so it works by the else-branch.
4. Reactions use raw `fetch` with a rollback only in `catch` (`:1517-1545`): a 4xx/5xx answer leaves the optimistic count on screen.
   Pin / mute / clear / hide / leave / block / group settings all use raw `fetch` + `r.json()` too (section 5.1) — none goes through
   `vibeRequest`, so none maps a `code` to a sentence.
5. `vibe-composer-open` is a boolean class shared by three components here plus three elsewhere; Group info over a conversation
   removes it on close while the conversation is still open (section 9).
6. `hidden_at` (`:98`) and `removed_at` / `removed_reason` (`:183-184`, `:4558`) are declared and never (or never reachably) used; the
   wave-1 message fields (`kind`, `thread_root_id`, `card`, `reply_count`, `author_role`, `hidden`, `removed`) are not declared on
   `MessageRow` at all. Every wave-2 renderer needs its own type (or `ChatMessage` from `src/lib/chat/types.ts:231`).
7. `MessageRow` and `ThreadEntry` are duplicated by hand in `SharePostSheet.tsx:33` and the threads route (`route.ts:61`); `relativeTime`
   is duplicated in `CampusMobile.tsx:3853`; `useNightTheme` in `NetworkMobile.tsx:103`. The split can export them, but must not change
   their text.
8. `leaveGroup` (`:2517`) and `leave` (`:3000`) each re-fetch `…/messages?limit=1` just to learn `viewer_id`, although the view already
   holds `meId` (`:1088`) — the sheets never receive it.
9. The `React.` namespace is used in type position with no `React` import (13 sites); it compiles because of `@types/react`'s UMD
   namespace — a new `.ts` file that copies `vaulContentStyle: React.CSSProperties` will compile too, but a reviewer may think it is a bug.
10. The three lint errors in this file are the same three B5 recorded at HEAD~1 (`B5-gate.md:6`): the file has had them since before wave 1.
