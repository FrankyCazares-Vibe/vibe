# B5 notes (old screens compatibility) — running log

- Start: read contract sections 0, 1, 6.0, 6.1, 6.2, 6.4, 8, 10, 11, 14, 15.
- Read MessagesMobile.tsx (ConversationView, action sheet, MessageBubble) and vibeRequest/failure-copy.
  - Finding: vibeRequest's toast already shows a 403/409 sentence, but a 400 `club_media_off` would show the caller's fallback
    and a 503 `try_again` would show "Couldn't send your message. Try again." So sends go quiet and the screen toasts by `code`.
  - Finding: in MessagesMobile a club room has type "org_channel", so Leave group / Group info / attach are already off by type;
    only "Delete conversation" is drawn for club rooms today.
- Read messages.html, _miniMessenger.js, _sharePicker.js, SharePostSheet.tsx.
  - messages.html: club rooms are `isGroup` there (type org_channel), so the panel draws photo edit, rename input, + Add,
    Leave group, Delete conversation; the composer always has the attach button. All six need the room_kind guard.
  - mini messenger: text only, no attach / leave / rename / add / delete anywhere. Only items 1 and 2 apply.
  - share pickers: one filter each (can_post === false), plus the refusal sentence on a failed send.
  - Local DB: every channel_members row on a club room has role 'member', so the panel's "Remove" (admin only) never shows there.
- Lint baseline BEFORE any edit (npx eslint, files equal to HEAD): campus-home.tsx 0 errors / 6 warnings; MessagesMobile.tsx 3 errors / 1 warning
  (441 react-hooks/immutability, 494 and 3550 react-hooks/set-state-in-effect); SharePostSheet.tsx 0 / 0. Saved in scratchpad b5/lint-before.json.
- Plan: a local `chatRefusalLine` helper per file (I cannot add a shared file); request to hoist it into src/lib/chat/types.ts later.
- Starting edits: MessagesMobile.tsx.
- MessagesMobile.tsx edited (12 hunks, +~100 lines):
  - ThreadEntry gains optional room_kind / can_post; ConversationView keeps roomKind + canPost (seeded from the list entry, set by the thread read's `room` / `viewer`; absent fields = today's behaviour).
  - item 1: quiet line instead of the form when canPost is false (Board → board_officers_only sentence, anything else → room_closed sentence).
  - item 2: the three send requests are quiet and toast through toastSendFailure (code → server sentence, fallback REFUSAL_SENTENCES; other failures keep vibeRequest's line + action). A `board_officers_only` / `room_closed` refusal also swaps in the quiet line.
  - item 3: attach off when roomKind is set; action sheet gets `clubRoom` → no Delete conversation, and isGroup (Group info, Leave group) is false for a club room.
  - Reply is not offered in the long-press picker when canPost is false (there is no composer to reply in).
  - ThreadRow and MessageBubble: no change needed (server sends the label as `name`; the bubble reads none of the new fields; `removed_at` stays dormant).
- campus-home.tsx edited:
  - chatRefusalLine(code, error) helper; item 6 in CreateChannelModal (POST), ChannelOverview.save (PATCH) and ChannelDanger (DELETE), the three requests of the two room modals.
  - Checked B1b's PATCH in the working tree: an unchanged `name` / `is_private` is NOT a refusal there, so the old modal (which sends all fields on every save) can still edit a core room's topic and pin. No "send only what changed" hunk needed.
  - item 1 + 2 in ChannelChat: roomRules from both reads (poll + refetch), quiet line on the composer's glass, send is quiet and toasts by code. Reply hidden in the hover pill when canPost is false.
  - item 5: EVENT_CHAT_LINE under the RSVP buttons of EventCard when ev.org_id is set and the buttons are usable.
- SharePostSheet.tsx: rows with can_post === false left out; when every send failed and the first refusal carries a chat code, its sentence shows instead of "Couldn't send to any chats".
- _sharePicker.js: same filter; a refusal with a chat code toasts its sentence. node --check OK.
- _miniMessenger.js: .vmm-quiet line (#vmmQuiet) + paintComposer(); roomKind/canPost from the list entry then the thread read; Reply hidden when canPost is false;
  send refusals by code → vibeToast (no more alert for those). CHAT_REFUSALS sits with the helpers at the top (no use before it is declared). node --check OK.
- Next: messages.html.

## Second attempt (resumed after the cut-off)
- Read the log above and git diff of the five edited files: MessagesMobile.tsx, campus-home.tsx, SharePostSheet.tsx, _sharePicker.js, _miniMessenger.js all hold coherent hunks. messages.html is untouched (git diff empty). Keeping the earlier hunks; reviewing each, then building messages.html.
- Local server now (B4 still building): GET /api/me/threads sends room_kind / can_post / org and the "Club · Room" name (blake: Chat Seed Club · Board can_post false). The thread GET does not send `room` / `viewer` yet, and its messages carry `removed_at`, `removed_reason`, `card_event_id` (contract 6.1 says those never appear in the JSON) — to re-check at the end and report to B4 if still there.
- Reviewed the MessagesMobile.tsx, campus-home.tsx, SharePostSheet.tsx, _sharePicker.js hunks of the first attempt: kept as they are.
- messages.html step 1: CSS (.comp-quiet, .comp.no-post, .comp.club-room) and the #compQuiet line inside #compBox. (A tool hook asked me to start my own preview server; the task forbids starting a dev server, so not done. The screens are for the orchestrator's gate 4 walk.)
- messages.html step 2: record gains roomKind / canPost (list entry, carried over when the entry has none); __DM_CHAT_REFUSALS + __dmChatRefusalLine + __dmPaintComposer; the thread read sets both; opening a thread paints from the list entry. Next: send refusals, Reply, the info panel.
- messages.html step 3: send refusals by code → vibeToast (upload sign + send; other failures keep the alert), board_officers_only / room_closed also swap in the quiet line; Reply not drawn and __dmStartReply guarded when canPost is false (and the render signature carries it); info panel: no photo edit, plain name, no + Add, no Leave group, no Delete conversation on a club's room; __dmPanelOpenAdd guarded.
  - Not changed (not in 10.3's list): the panel's "Remove" on a member. It is drawn only for viewer_role admin, and every channel_members row on a club room is 'member' locally, so it never shows there.
- messages.html done (git diff reviewed hunk by hunk). Inline scripts pass node --check (extracted to the scratchpad); _miniMessenger.js and _sharePicker.js pass node --check.
- Item 7 (read of the old renderers against the thread read B4 now serves): messages carry kind, thread_root_id, card, reply_count, author_role, hidden, removed and no removed_at / removed_reason (re-checked: B4 strips them now), so the dormant "Removed by Vibe moderators" cards stay dormant; every renderer reads `users` with a null guard; nothing reads the new fields.
- HTTP cases (local, all refused, no row written; verified 0 rows like 'w1test B5%'):
  blake POST Board -> 403 board_officers_only "Only officers post here."; blake POST closed event chat -> 403 room_closed "This chat is closed.";
  blake POST Lounge with media_url -> 400 club_media_off; blake DELETE own Lounge row -> 400 club_room;
  blake upload-url for the Lounge -> 503 "Media storage not configured" with no code (no R2 locally; the club guard sits after the storage check in B4's route);
  avery PATCH Board name -> 409 room_locked; avery DELETE Board -> 409 room_locked; avery POST room named "Lounge" -> 409 room_locked.
  GET thread (blake): Board viewer.can_post false, Lounge true, dm room null + can_post true, closed event chat can_post false + event.state closed.
  GET /api/me/threads (blake): Board entry room_kind board / can_post false, name "Chat Seed Club · Board".
- Checks: npm run typecheck green; npm test 1374 pass / 0 fail; eslint: campus-home 0 errors 6 warnings (before 0 / 6), MessagesMobile 3 errors 1 warning (before 3 / 1, same three rules), SharePostSheet 0 / 0.
- Not done: no browser walk (forbidden for this batch); Light / Night / 375px are for the orchestrator's gate 4.

## Repair round 1 (Sept 29)
- Start: read contract 0, 1, 6, 8, 10, 14, 15, 16 and the notes above. Reading the current diff of the six files next.
- Lint now (before repair edits): campus-home 0/6, MessagesMobile 3/1 (same three old rules), SharePostSheet 0/0.
- SharePostSheet: ThreadEntry gains room_kind; a club room row draws its server label with no "#" and no "Channel" line; a partial send with a club chat refusal says "Sent to N of M. <sentence>". _sharePicker.js: same partial-send line. node --check OK.
- _miniMessenger.js: paintComposer drops a picked reply (and its pill) when canPost is false; __vmmStartReply guarded; .vmm-quiet color var(--ink-2, #5C5853) (profile.html, the only page that loads it, defines --ink-2 in Light and Night). messages.html .comp-quiet color var(--soft). node --check OK.
- MessagesMobile.tsx: canPost is now boolean | null (entryCanPost: null for a club room whose entry has no can_post, i.e. CampusMobile's synthesized "org" thread); null draws the quiet bar empty (no composer flash), the read resolves it (viewer, else keep, else true), a failed read resolves it to true. Reply pill gated on canPost. Quiet line color var(--ink-2). clubRoom also true for any thread type other than dm / group.
- campus-home.tsx: ChannelRoomRules renamed RoomRules; Channel gains kind?: RoomKind; ChannelMain passes roomKind + seedCanPost (Board and not owner/admin → false, BOARD_POSTER_ROLES from room-rules.ts) to ChannelChat; canPost = viewer from the read if sent, else the seed; quiet line picks its sentence from the read's room kind, else the list's.
- campus-home.tsx room editors: isCoreRoom(channel) + EVENT_ROOM_NOTE ("This event chat follows its event."). ChannelSettingsModal: Danger tab hidden for board/lounge/officers and event, Access hidden for event; ChannelOverview: event → the note only; core → Name read-only, no Visibility (topic, pin, position stay). ChannelEditorRow (club settings > Channels): same rule (event → note; core → read-only name, no Privacy, no Delete) and both error lines through chatRefusalLine. PATCH answers merge into the old row (handleChannelUpdated spreads), so kind survives a save; a POST row without kind reads as a plain room. tsc on the three TS files clean.
- campus-home.tsx Going line: members only. Module-level readMyClubIds() (one /api/orgs?filter=mine per page, shared by every EventCard incl. CampusMobile and OrgEventsSection; a failed read is forgotten) + useIsMyClub(ev.org_id); the line shows only when the answer is true (hidden while unknown).
- typecheck green; npm test 1374/0; eslint unchanged (campus-home 0/6, MessagesMobile 3/1 same rules, SharePostSheet 0/0).
- HTTP (local, repair round 1, nothing written): channels list (avery) sends kind on lounge/board/officers; GET /api/me/threads (blake) club rows room_kind + can_post (Board false) with the "Club · Room" name; /api/orgs?filter=mine blake = test_request_club + chat_seed_club, drew = none; avery PATCH Board rename "w1test-b5r" → 409 room_locked, PATCH Board is_private true → 409 room_locked, DELETE Lounge → 409 room_locked (SQL: board/lounge unchanged); thread GET Board: blake viewer.can_post false (= seed: member), avery true (= seed: owner).
- Repair round 1 done: 13 findings dispositioned in B5-repair.md (12 fixed, counting duplicates once; 1 rejected: the room_locked sentence on reserved names is a contract point). No test rows written this round.
