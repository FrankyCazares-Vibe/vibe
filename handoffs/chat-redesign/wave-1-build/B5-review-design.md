# B5 review — lens: COPY, TOKENS, ACCESSIBILITY (read-only reviewer)

Running log
- Start: read contract sections 0, 1, 6.0, 6.1, 6.2, 6.4, 10, 14, 15, 16 and B5-notes.md.
- Next: the diff of the six files, hunk by hunk.

## Findings
- Read all six diffs. Sentences in the four files match REFUSAL_SENTENCES word for word (checked against src/lib/chat/types.ts). EVENT_CHAT_LINE matches 10.5.
- Contrast computed (WCAG): Light `--ink-muted`/`--muted` #8A8580 on `--cream` #FAF7F2 = 3.42:1, on `--paper` #FFFFFF = 3.65:1. Night 6.64 / 6.15. Desktop glass bar 7.7, phone wallpaper bar 9.7.
- Local GET /api/me/threads as blake: club rooms are type `org_channel`, name "Chat Seed Club · Lounge", room_kind + can_post sent.

### F1 (low, accessibility) The quiet line is under 4.5:1 in Light on three of the four screens
- Files: src/components/mobile/MessagesMobile.tsx:2090 (`color: ... "var(--ink-muted)"` on `var(--cream)`), public/html/messages.html:421 (`.comp-quiet` `color:var(--muted)` on `var(--cream)`), public/html/_miniMessenger.js:246 (`.vmm-quiet` `color:var(--ink-muted, #8A8580)` on `var(--paper, white)`).
- Evidence: #8A8580 on #FAF7F2 = 3.42:1; on #FFFFFF = 3.65:1. Text is 12.5 to 13.5px / 600, so the 4.5:1 rule applies (not large text). This sentence is the only thing that tells the person why there is no box to write in; it is not a placeholder. Night passes (6.2 to 6.6).
- Change: MessagesMobile.tsx:2090 `"var(--ink-muted)"` -> `"var(--ink-sub)"` (Light #5A564F = 6.83:1, Night #CFC8BE = 11.9:1; token exists in both blocks of globals.css:115/191). messages.html:421 `color:var(--muted)` -> `color:var(--soft)` (page token, Light #2D2D2D, Night #CFC8BE). _miniMessenger.js:246 `color:var(--ink-muted, #8A8580)` -> `color:var(--ink-sub, #5A564F)`.

### F2 (medium, copy) The phone share sheet still draws "# " and "Channel" on every club room, now next to the new label
- File: src/components/mobile/SharePostSheet.tsx:625 (`{isChannel ? `# ${thread.name}` : ...}`) and :645 (subtitle `"Channel"`), `isChannel` at :547.
- Evidence: GET /api/me/threads as blake (local) sends `type: "org_channel"`, `name: "Chat Seed Club · Lounge"`, `room_kind: "lounge"`. The row therefore reads "# Chat Seed Club · Lounge" over "Channel". After migration A every member has every public room of their clubs in this list (contract 0, point 3), so this is what most students see when they share a post. Contract 1 bans `#` and "channel" in copy; 6.4 says the server label is the whole label. B5 edited this file (the filter, :138) and left the row. _sharePicker.js:194 already prints the bare name.
- Change: :625 -> `{thread.name || "Direct message"}` (drop the `isChannel` branch); :640-645 -> for a row with `room_kind` (add `room_kind?: RoomKind` to the local ThreadEntry) show no second line, or the word the orchestrator picks (the contract pins none; "Club chat" is the closest to its own sentences). Keep "Group" for groups.

### F3 (low, copy) "You'll appear in the event chat." is shown to people for whom it is not true
- File: src/app/campus/campus-home.tsx:10082 (`ev.org_id && (!rsvpAtHomeOnly || status)`).
- Evidence: the line shows on every club event for every viewer. Contract 9 and 11 gate 2: "an RSVP by a non-member succeeds and writes no row", so a student who is not in the club never appears in the event chat. `CampusEvent` (:9563) carries no membership field, so the screen cannot tell. The builder followed 10.5 as written; this is a gap in the contract, not an improvisation.
- Change: none in B5's files alone. Report to the orchestrator: either GET /api/events adds a `viewer_is_member` boolean and the line's test becomes `ev.org_id && ev.viewer_is_member && (...)`, or Franky accepts the line as is until the stretch goal (section 9) makes it true.

### F4 (low, contract wording) A new identifier carries "Channel"
- File: src/app/campus/campus-home.tsx:15860 `type ChannelRoomRules`.
- Evidence: contract 1, "Never in copy or new identifiers: channel, server, thread (user-facing), #". Every other name B5 added (roomKind, canPost, clubRoom, .comp-quiet, .vmm-quiet) is clean.
- Change: rename to `RoomRules` (4 uses: :15860, :15910, :15962, :15986).

## Second run (resumed 19:11)
- Earlier run left F1-F4 above. Re-verifying each against the current tree; F3 is now an orchestrator decision (member-only Going line) so it is withdrawn as a finding.
- Re-read the six diffs in the current tree. F1, F2, F4 still hold. F1's change for _miniMessenger.js is WRONG as written above: profile.html (the only page that loads it) defines --ink-2 in both themes but not --ink-sub, so `var(--ink-sub, #5A564F)` would paint #5A564F on Night's #161515. Corrected change: `color:var(--ink-2, #5C5853)` (profile.html:103 Light #5C5853, :176 Night #CFC8BE).
- F2 downgraded to low: the "# " and "Channel" are old wording (10.8 bans NEW Discord wording only); still worth the two-line fix because contract 0.3 puts every public room in every member's list.
- F3 withdrawn (orchestrator decision: member-only Going line, a repair item).

### F5 (low, accessibility/visual) "Replying to X" stays above the quiet line on the phone and in the mini messenger
- Files: src/components/mobile/MessagesMobile.tsx:1928 (`{replyTo || staged ? (` has no canPost test; the refused send at :1329-1334 keeps replyTo and sets canPost false), public/html/_miniMessenger.js:858-870 (paintComposer hides #vmmComp only; renderReplyPill :929-951 inserts #vmmReplyPill as a sibling BEFORE #vmmComp, so it is not hidden).
- Evidence: messages.html hides it (`.comp.no-post .dm-reply-pill{display:none}` :424, the pill is inside #compBox, :1916-1922) and ChannelChat hides it (`replyTo && canPost`, campus-home :16569). The other two do not: an officer demoted (or an event chat that closes) while a reply is picked gets a "Replying to X" pill with a Cancel button over "Only officers post here." / "This chat is closed.".
- Change: MessagesMobile.tsx:1928 `{(replyTo || staged) && canPost ? (`. _miniMessenger.js paintComposer: when `!state.canPost` set `state.replyTo = null; renderReplyPill();` (or hide #vmmReplyPill with the composer).

### F6 (low, copy, contract gap for the orchestrator) The create form says "This room can't be renamed, hidden or deleted." to someone creating a room
- Files: src/app/campus/campus-home.tsx:1458 (CreateChannelModal) and :3364 (ChannelOverview save), fed by src/app/api/orgs/[slug]/channels/route.ts:207-208 (`isCoreRoomName(name)` -> refusalBody("room_locked")) and contract 8 (rename of a plain room to board/lounge/officers -> room_locked).
- Evidence: an officer who types "Lounge" in the New room form, or renames an ordinary room to "Board", reads "This room can't be renamed, hidden or deleted." The room they are creating does not exist, and the room they are renaming can be renamed. B5 shows the server's sentence as 6.0 and 10.6 require; the sentence belongs to a code that covers two different cases.
- Change: none in B5. Orchestrator: accept for wave 1 (the old desktop modal, officers only), or pin a separate code and sentence in wave 2 for "that name belongs to one of the club's own rooms".
- Checks run: npx eslint on the three TS files = 3 errors / 7 warnings, same rules and counts as the builder's baseline; node --check on both JS files OK.
