# Integration review — lens "old-renderers" (wave 2, branch `claude/relaxed-davinci-9d11h3` at `b3381af`; main `5c68da1`)

Read against contract 12.9 / 12.1 / 12.2 / 12.4 / 8.1 / 8.3 with the validate-thread fixtures as the page
(`tools/fixtures/{stub,poll,lounge,board,event-card,signup,event,dm}.json`): a card row (`kind: "poll"`, `content` = the
fallback text, `card !== null`), a stub (8.1's exact shape: `hidden: true`, `content: ""`, `user_id: ""`, `users: null`),
the viewer's own removed row (`removed: { by: "officer", at, reason: null }`, no `removed_at`), `reply_count` and
`author_role` set, a quote with `parent_preview: null`. Old files' whole diff since main: `messages.html` +2, `_miniMessenger.js` +2,
`campus-home.tsx` 2 lines, `threads/route.ts` one hunk (12.4), `CampusMobile.tsx` the 2.2 gate, the split's three new files.

## Findings

### INT-OLD-RENDERERS-1 — LOW — the two static renderers' group-top margin reads the UNFILTERED index (confirms B3-BEHAVIOUR-1)
- where: `public/html/messages.html:1440` (`const showAv=!mine&&(gb||i===0);const gc=gb&&i>0?' gt':'';` inside
  `msgs.forEach((m,i)=>{ if (m.hidden) return; …`) and `public/html/_miniMessenger.js:771`
  (`const gc = gb && i > 0 ? " gt" : "";` inside `state.msgs.forEach((m, i) => { if (m.hidden) return; …`).
- what: with `stub.json` reordered so the stub is the page's oldest row (or any page whose first rows are stubs), the first
  visible bubble has `i >= 1` while `lastSenderId` / `lastSender` are still `null`, so `gb` is true and the bubble gets
  the `gt` margin (`.msg-row.gt{margin-top:24px}`, `.vmm-msg.gt{margin-top:14px}`) that an un-stubbed first row never
  carries: one extra 24 px / 14 px under the day separator. Day grouping (`lastIsoForSep`), the sender run and `showAv`
  are right (all advance on visible rows only). `ConversationView.tsx:809-811` and `campus-home.tsx:16391-16392` index the
  filtered array and are right.
- fix (exact): `messages.html:1440` → `const showAv=!mine&&(gb||lastSenderId===null);const gc=gb&&lastSenderId!==null?' gt':'';`
  and `_miniMessenger.js:771` → `const gc = gb && lastSender !== null ? " gt" : "";`. Amend 12.1's "two lines" for these
  two files to three (the task list already carries this as FIX NOW / B3-BEHAVIOUR-1).

## Holds (each read in the file, field by field, against the fixtures)

**The old phone — `messages/ConversationView.tsx`, `messages/MessageBubble.tsx`**
- `ConversationView.tsx:548` `const shown = (messages ?? []).filter((m) => !m.hidden);` and the map at `:809-811`
  (`prev = shown[i - 1]`, `showGap`, `showSender`) read `shown`: a stub between two rows by one person does not split
  their run; a stub is never handed to `MessageBubble`, so its hooks-first body needs no skip (12.1, SPLIT-M3).
  `messages/types.ts:138` `hidden?: boolean` is additive.
- `MessageBubble.tsx` reads only `users`, `content`, `media_url`, `media_kind`, `attachment`, `attachment_id`,
  `attachment_kind`, `parent_preview`, `reactions`, `id`, `removed_at`, `removed_reason` (`:65, :209-219, :525, :606-614, :712-722`).
  A poll / event card row (`poll.json`, `event-card.json`, `board.json` row 3): `content` is the fallback text → `hasText`
  true → a text bubble; `card`, `reply_count`, `author_role`, `kind`, `thread_root_id` are never read; reactions and the
  quote work as on text (12.2). Never an empty bubble (`isEmpty` guards a row with no text, media or attachment; a card
  row always has text).
- The viewer's own removed row (`lounge.json` row 3, `removed !== null`): the old bubble reads `removed_at` (never sent,
  the fixtures carry no `removed_at`; `types.ts:263-266`), so it renders as an ordinary sent bubble, exactly as today and
  as 6.2's last line says ("the old `MessageBubble` branch … stays as it is"). No crash.
- A quote with `parent_preview: null` (`parent_message_id` set, a blocked parent per 8.3): `parent = null` → no quote
  (`:525-526`); `parentIsMine` reads `m.parent_preview?.user_id` (`:831`), safe.
- `messages.length === 0` "Say hi" (`:794`) reads the unfiltered array, so a room holding only stubs shows an empty
  scroll area, not "Say hi". 8.3's old-screens row and 12.1 say "filter … nothing else"; the same accepted rule the B3
  behaviour review recorded for the mini messenger. Nothing renders, nothing leaks. (After launch, if wanted: `shown.length`.)
- The newest-id scroll key (`:212`) and `setMessages` maps read the full array, which is what 8.1 keeps a stub's `id` /
  `created_at` for.
- `CampusMobile.tsx:2499` `synthesizeChannelThread` hands `last_message: null`, `type: "org"` → multi-party grouping
  (`thread?.type !== "dm"`); with the flag on it never mounts (`oldChatMounts`, the 2.2 gate).

**`public/html/messages.html`**
- The load map (`:2407-2477`) copies named fields only; `hidden: m.hidden === true` (`:2474`) is carried; `card`,
  `reply_count`, `author_role`, `removed`, `kind` are dropped; `t: m.content` makes a card a text bubble; a stub builds
  harmlessly (`u = {}`, `senderName ''`, `senderInit '?'`, `m: 0` since `"" !== me`).
- `renderMsgs` (`:1429-1527`): `if (m.hidden) return;` is the first statement, before the day separator
  (`lastIsoForSep` `:1433-1436`), the sender run (`lastSenderId`, `last` `:1526-1527`) and `removedFor`; so a stub first
  on a day carries no separator and never breaks a run. `lastSentIdx` (`:1321`) walks `m.m === 1` rows (never a stub).
  `sig` (`:1299-1304`) carries stub ids (one repaint when a new stub arrives, like any row). `quoteStubFor` (`:1339-1345`)
  guards `!m.parentPreview`. Only `gc` is off (finding 1).
- The preview list (`:2089-2104`): `__dmLastMessageLabel(null)` → `''` → `'No messages yet'`; `__dmFmtRel(undefined)`
  → `''` (`:1971`); `thread.unread` is the route's. A club-room entry with `last_message: null` (12.4) renders as a
  "No messages yet" row; `lastMessage` on the record (`:2045`) is written and never read.

**`public/html/_miniMessenger.js`**
- The map (`:652-665`) copies named fields; `hidden: m.hidden === true` (`:665`) carried; `content: m.content || ""`
  makes a card a text bubble; a stub's `senderId: ""` is never reached (`:763` skips it before `lastSender` advances).
- `paintMessages` (`:755-`): the skip is first; separators and runs advance on visible rows only; the quote guards
  `m.parentPreview`; `state.msgs.length === 0` "Say hi 👋" reads the unfiltered array (the same accepted rule as the
  phone). Only `gc` is off (finding 1).
- The list (`:524-526`): `lastMessageLabel(null)` → `""` → `"No messages yet"`; `fmtRel(undefined)` → `""`.

**`src/app/campus/campus-home.tsx` `ChannelChat` (`:16391-16392`)**
- `messages.filter((m) => !m.hidden).map((m, idx, shown) => { const prev = idx > 0 ? shown[idx - 1] : null; …`:
  `sameAuthor` and `showDateSep` read the filtered array (`shouldShowChatSep(undefined, …)` → true for the first visible
  row, `:17098-17100`). Its local `ChatMessage` type (`:15933`) names only `id, content, created_at, user_id,
  parent_message_id, parent_preview, reactions, users`; the bubble reads `content`, `users`, `reactions`,
  `parent_preview` (`:16395-16398`, `:16470-16490`). A card is a text bubble; `removed`, `reply_count`, `author_role`,
  `card` are never read. "No messages yet" (`:16382`) reads the unfiltered array (same accepted rule).

**The share pickers (12.5)**
- `SharePostSheet.tsx:141` filters `!t.is_request && t.can_post !== false`; it reads `type`, `name`, `photo_url`,
  `peer`, `room_kind` (`:543-652`), never `last_message`. `_sharePicker.js:239` filters `can_post !== false`;
  `lastMessageLabel(null)` → `""` (`:158-159`) → an empty sub-line for a club room with no visible row (`:184-187`).
  Neither builds a card; a share stays a text message with an attachment.

**The old inbox, 12.4 (`threads/route.ts:702-727`)**
- `loadHiddenUsers` runs before the fill; `clubRoomIds.has(cid) && blockedPeerIds.has(m.user_id)` skips before the
  first-row-wins `set`; none visible → `last_message: null` → every list above reads "No messages yet"; `unread`
  (`:771-774`) is `!!last && …` so it is false for that room; the `hidden_at` reactivation and the request guard read
  `last` null-safely. Dms and groups untouched. A card's preview is `content` = its fallback text.

**Section 0 with the flag off (this lens's surface)**: the only changes visible to a person without the flag on these
renderers are row 1 (stubs filtered; a blocked author's row skipped in the old inbox's club-room preview) and the
cosmetic margin of finding 1. No copy, no crash, no empty bubble, no stub shown, no day mis-grouped, in any of the four
renderers or the two share pickers, with any of the eight fixtures.

**Verdict: PASS with one LOW (INT-OLD-RENDERERS-1 = B3-BEHAVIOUR-1, the `gt` margin in the two static files; a one-token
fix in each and 12.1 amended to three lines for them).**
