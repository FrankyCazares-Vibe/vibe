# Club chat redesign — plan in waves (S68, 2026-09-29)

Inputs: `franky-brief.md` (his words + picks), `research.md` (pains, ideas, directions, Part 6 calls), `code-map.md` (what exists today, file:line), mockups on the design canvas https://claude.ai/artifact/B69NRnhbB8mvdrKsc9NQFJ rows 5–6 (sources in `boards/`). **Building starts in a new chat (session 69).**

## 0. READ FIRST — overrides after the plan critic (Sept 29)

A plan critic checked this plan against the real code, the local DB and read-only production counts: **`plan-critique.md` (30 findings, 9 high) — read it before wave 0.** Where it disagrees with sections 2–6 below, **the critique wins**. The key overrides:

- **Feature flag `chat_v2`.** Everything new ships dark behind it; on for the founders + SAE first (demo days), everyone at launch. The App Store build (submission Oct 16) must see ONE consistent chat — freeze Oct 15.
- **v1 = phone only, the smallest set that meets the three must-haves** (critique "Smallest v1"): Board + Lounge (top-level Board posts owner/admin only, folded quiet replies, inbox Board dot, no push / "seen by" / notification settings); **member-only** event rooms (Going/Maybe members + officers; created with the event; open until 7 days after the end; Where + When tiles; club banner as cover); polls + sign-ups as ONE `chat_polls` model (`mode poll|signup`) + an RSVP card that calls the existing RSVP route (no Headcount); a compact Messages home **Chats · Clubs · Requests** (the inbox must keep Requests) with **this week only** (chips; the month sheet and week swiping come right after launch); officer + mod soft-delete in club rooms; report snapshots that include cards.
- **Desktop stays on today's chat for v1**, with compatibility fixes only: new kinds render as text, the Board refuses member typing, `messages.html` + mini messenger keep working. The React desktop Messages (wave 4) is after launch.
- **Security first:** signed-in users can insert messages directly today and any member can post in any club channel — ONE batch (wave 1 B1) owns every `messages` INSERT/SELECT policy restate (direct inserts `kind = 'text'` only; Board top-level posts owner/admin only), and every new table revokes default grants.
- **Corrected privacy fix:** the "moved out" item is the settings columns (`muted`, `hidden_at`, `cleared_at`, `pinned_at`), NOT `last_read_at`/`typing_until` (hiding those would break DM read receipts and typing). See critique #8.
- **Backfill:** SAE (the only real club) doesn't fit the generic rules (its `general` is private) — map it by hand; dry-run on the local seed + production counts first.
- **Push is out of scope** here (critique #9: `20260924120000` is numbered below migrations prod already has and must be renumbered) — its own task.
- **File ownership** for wave 1 and the `MessagesMobile.tsx` split for waves 2–3: use the critique's split (#10, ~lines 155–195); no cross-cutting "states" batch — each batch owns its own loading/empty/error, Light + Night, 375px.
- **Schedule** (critique "Timeline"): Sept 30 – Oct 2 wave 0 (calls + contracts) and a slimmed wave 1 behind the flag; Oct 5 – 9 phone home + club space (flag on for founders + SAE; demo days show SAE only); Oct 10 – 14 event rooms + cards + sentinels + phone walk; **Oct 15 freeze**; launch → flip the flag. After launch: month sheet + week swipe, non-member event rooms, custom rooms + pinning, photos in club rooms (after location stripping), notification settings + push, "seen by" + Realtime, React desktop Messages.

**New calls for Franky** (add to section 2): (a) event rooms members-only in v1, non-members after launch — recommended; (b) inside a club's own event room, can members see who else is going? Today only officers see names — recommended: yes inside the club's room (members already see each other in the Lounge), counts only everywhere else; (c) SAE's `general` is private today — as the Lounge every member will see it; OK? (recommended yes, confirm with SAE's owner); (d) replaces call 10: sign-ups show names to room members (that's the point), polls show names by default with an "anonymous" toggle that shows counts only.

## 1. What Franky locked (Sept 29)

- **Where chat lives: Messages.** One inbox for 1:1 DMs, group chats and clubs (Option 3, `R2_Mix`). DMs are never pushed down: the top block is capped at ~150px and the first chat row starts at ~y 249 on a 390×844 phone.
- **"Your week" on top of Messages** = the phone's calendar for what you RSVP'd to: a week strip (coral dot = Going, grey = Maybe), one row of event-room chips (the live one glowing). **Beyond this week:** swipe the strip week by week ("This week" jumps back; chips continue past the week) and tap "Your week" for a **month sheet** of your RSVPs; tap a day → its rooms (`R3_NextWeek`, `R3_Month`).
- **Event rooms look like `ChatB_Room`:** hero cover, Where / When / Bring / Rides tiles, going faces, a Board line, chat with polls and sign-ups.
- **Inside a club looks like `ChatA_Club`** (to restyle to match Option 3): Board (officers post; replies fold and stay quiet) + Lounge (members talk) + room chips + Up next + a "+" tray (Poll · Sign-up · RSVP · Headcount).
- v1 must-haves: announcements separate from chatter; event chats; polls / sign-ups / RSVPs in chat. Otto recaps NOT in v1. Phone first.
- No Discord tells: no icon rail, squircles, "#", "server", "channel", uppercase colored role chips, blurple #5865F2 (full list in `code-map.md`).

## 2. Calls to confirm with Franky first (each with my recommendation)

1. **Names:** Board + Lounge (recommended) vs "Announcements + Chat" vs "Club + Hangout".
2. **Replies to Board posts:** yes, folded under the post, never notify (recommended).
3. **Extra rooms per club:** up to 3 custom rooms + the automatic Officers room + automatic event rooms (recommended); existing extra channels over the cap are kept but can't be added to.
4. **Who's in an event room:** Going + Maybe. For a **public** event, a non-member who RSVPs joins *that room only*, never the Lounge (recommended — "following ≠ membership").
5. **Room lifecycle:** opens 2 days before start ("Soon"), "Live" from start to end, "After" for 7 days as a read-only album + chat, then archived (recommended). Officers can open it early.
6. **Default notifications:** "Board + mentions" (recommended); Lounge and event chatter off by default; a small weekly "Important" budget for officers (phase 2).
7. **"Seen by" on Board posts:** officers only, a count from 5 up, only after the read-state privacy fix (recommended; names = Vibe+ later).
8. **The Campus › Chat pill:** removed; the club page's "Chat" button and old `?tab=chat` links deep-link into Messages (recommended).
9. **Desktop:** Messages becomes a React page with three columns (inbox + Your week | room | club/event panel) and retires the `messages.html` iframe (recommended — the iframe is where the S68 white flash and most legacy literals lived).
10. **Poll/sign-up visibility:** counts public, names private except to the poll's creator and officers (recommended; matches "counts public, identities private").

## 3. What changes under the hood (contracts to pin in wave 1)

**Rooms.** Today every club room is a `channels` row (`type = org_channel`, `topic`, `is_private`, `position`, `pinned`; `org_subchannel` + `parent_channel_id` unused). Add:
- `channels.kind` — `board | lounge | officers | event | room` (NOT NULL for org channels).
- `channels.event_id` (FK events, unique, on delete cascade) for event rooms; `opens_at`, `archives_at` (derived from the event; stored for queries).
- **Backfill:** each club's `#general` (or first public channel) → `lounge`; `#announcements` → `board`; private officer-only channels → `officers`; everything else → `room`. Clubs missing a Board/Lounge get one.
- **Board posting = current owner/admin only** (RLS + route), everyone who can view the club reads it; replies are messages with `parent_message_id` = the Board post and never notify.
- Event rooms are created lazily (first open) or by trigger on event create; membership computed from `rsvps` (going/maybe) + club membership rules in call 4. Deleting/cancelling an event removes its room (the S68 cancel notice already tells RSVPs).

**New message kinds.** `messages.kind` — `text | poll | signup | rsvp | headcount | board_post` with typed side tables:
- `chat_polls` (message_id, question, options jsonb, closes_at, multi bool) + `chat_poll_votes` (poll, user, option_idx; unique per user/option).
- `chat_signups` (message_id, title, slots jsonb: label + capacity) + `chat_signup_claims` (signup, slot_idx, user; unique).
- `rsvp` = an event card message referencing `events.id`; `headcount` = a one-tap "I'm in" count that an officer can turn into a real event.
- All writes through service-role routes with the same gates as sending (`ensureMember`, requireCanPublish, word filter, rate limit); reads through RLS (`can_view_org_channel`). Vote/claim lists: counts to everyone, names to creator + officers (call 10).

**Reads the new screens need.**
- `GET /api/me/inbox` — one list: DMs, group chats, clubs (with latest Board line, unread Board flag, Lounge unread count, next-event chip), sorted by recency, pinned first; filters `all | chats | clubs`.
- `GET /api/me/rsvps?from&to` — your going/maybe events in a date range (week strip, chips, month sheet), each with its room id and live/soon/after state.
- `GET /api/clubs/[handle]/space` — Board (latest + history page), rooms (chips), Up next, your hat, faces count.

**Realtime.** Today everything polls (desktop 2 s, phone never). v1: poll the open room every 3–5 s and the inbox every 30 s while visible; Supabase Realtime is wave 5 (it needs the read-state privacy fix and a load test first).

**Privacy/security carried over:** blocks don't apply inside club rooms (by design, `messages/route.ts:481-486`) but blocked people's POSTS stay hidden (ruling 13); a victim is never locked out by a harasser officer; hidden clubs 404 to non-members; audience (iu/purdue/both) gates joining; no chatting across campuses; counts public / identities private (N=1 is an identity); the pending read-state privacy fix (other members can read your `last_read_at`/`typing_until`/`muted_until`) must land before any "here now" / "seen by".

## 4. Waves

Shape (memory `feedback_workflow_waves.md`): 4–5 file-owned batches per wave; each batch = implement → adversarial review → one repair; one integration pass + gates after the wave; the orchestrator walks it in the browser at 375px as a non-admin (memory `feedback_browser_pass.md`) before committing; production migrations need Franky's yes and go before the deploy that needs them. Write each wave's contract doc (`handoffs/chat-redesign/wave-N-contracts.md`) and run a plan critic on it BEFORE implementing.

### Wave 0 — decide + finish the design (no code; ~1 session, can overlap f2/f9)
- Franky answers the 10 calls in section 2.
- Canvas: restyle **inside a club** (Board + Lounge + chips + Up next + "+" tray) to match Option 3; the **"+" tray flows** (create poll, create sign-up, share an event); **desktop Messages** (3 columns) Light + Night; the **empty states** (no clubs yet, no RSVPs this week, a club with no events) — the cold-start risk is real with zero clubs signed.
- Optional but strong: Rylan asks 3–5 IU/Purdue club officers "how do you run your group chat today?" (research caveat: no real student voice yet).
- Output: `wave-1-contracts.md` pinning every table, column, route, payload field and name.

### Wave 1 — data foundation (backend only; nothing visible changes)
- **B1 · rooms:** migration (`channels.kind`, `event_id`, `opens_at`, `archives_at`; backfill; Board = officers-only posting via RLS + route; event-room membership function); `src/lib/messages/channel-access.ts` + room helpers.
- **B2 · message kinds:** migration (`messages.kind`, `chat_polls`, `chat_poll_votes`, `chat_signups`, `chat_signup_claims` + RLS + grants); routes `POST /api/rooms/[id]/polls`, `/votes`, `/signups`, `/claims`, headcount; word filter + rate limits.
- **B3 · reads:** `GET /api/me/inbox`, `GET /api/me/rsvps`, `GET /api/clubs/[handle]/space`; extend the thread GET to return kind + side-table data.
- **B4 · read-state privacy fix** (the one moved out of S67 wave A): other members can no longer read your `last_read_at` / `typing_until` / `muted_until`; per-user unread counts computed server-side.
- **B5 · notifications:** kinds `board_post`, `event_room_open` (+ reuse `mention`), settings defaults ("Board + mentions"), push payloads (push itself is still dark on prod until `20260924120000` is applied — apply it in this wave with Franky's yes).
- Gates: tsc, eslint, `npm test`, a local migration run on the seed DB, then the production migration (management API + `schema_migrations` row, memory `project_security_model.md`).

### Wave 2 — phone Messages home (the Option 3 screen)
- **B1 · inbox list** (`MessagesMobile` thread list rewrite): All · Chats · Clubs filter, pinned first, club rows (crest, Board line + coral dot, next-event chip, Lounge "N new"), DM + group rows.
- **B2 · Your week:** week strip (swipe weeks, "This week"), event-room chips (live glow, bloom only there), month sheet.
- **B3 · navigation + deep links:** club row → club space, chip → event room, old `?tab=chat` / org page "Chat" button → Messages; remove the Campus › Chat pill (call 8); `CampusMobile` ChatPane/OrgChannelsDrawer retired.
- **B4 · states:** loading skeletons, empty states, errors (LoadFailed pattern), Light + Night, 375px.

### Wave 3 — phone club space + event room
- **B1 · club space:** header (crest, name, hat, faces), Up next, room chips, Board card (latest) + Board history, Lounge (reuses `ConversationView` bubbles), club switcher.
- **B2 · event room:** hero cover (shrinks on scroll), Where / When / Bring / Rides tiles, going faces, Board line, chat, lifecycle (Soon / Live "I'm here" / After album).
- **B3 · "+" tray + cards:** Poll, Sign-up, RSVP (share an event), Headcount — composer tray, the four card renderers with voting/claiming, results.
- **B4 · officer tools in rooms:** post to Board, pin, delete others' messages in their club (new: today only Vibe mods can), open a room early, manage custom rooms (cap 3).
- **B5 · attachments + fixes carried from the code map:** photos in club rooms (off today, `canAttach`), media rendering on desktop (a photo-only message is an empty bubble today), the no-op "Clear" in club ⋯ menus.

### Wave 4 — desktop
- React desktop Messages (3 columns) replacing the `messages.html` iframe (call 9): inbox + Your week | room | club/event panel; keyboard + focus; Light + Night. Retire the Campus › Chat three-rail grid (`campus-home.tsx` ServerRail/ChannelRail/ChannelMain/ChannelChat ~15083–17100) and its Discord copy. Keep `/messages?to=` and `?channel=` deep links working.

### Wave 5 — live + polish + audits
- Supabase Realtime for the open room and the inbox (after the privacy fix + a small load test); typing / "here now" only if Franky wants them.
- Notification tuning (the officers' weekly "Important" budget), Board "seen by" counts (call 7).
- **Feature sentinel + security sentinel** over everything new (skill `audit-sentinels`); journal entry.

## 5. Timing against the launch plan

Launch is **end of October**; clubs onboard first, demo days start the week of Oct 5. Dated items that come first: **f2** sending mailbox (Oct 4), **f9** Android build (Oct 9). A realistic cut: waves 0–1 the week of Sept 30, wave 2 by ~Oct 9, wave 3 by ~Oct 16, wave 4 by ~Oct 23, wave 5 after launch if needed. If time runs short, **waves 1–3 (phone) are the v1**; desktop can keep today's chat a little longer (with the Discord copy renamed) because students are phone-first.

## 6. Open risks

- **Cold start:** zero clubs signed; Your week and event rooms look empty without events. Mitigations: good empty states, Headcount → event in one tap, officers onboarded at demo days create their first event on the spot.
- **Scope:** this is the biggest build since moderation. Keep waves small; don't start wave 4 before waves 2–3 are walked on a real phone (Vercel deploy — Franky tests on his phone).
- **Existing chat data:** the backfill must not lose messages or reorder rooms unexpectedly; dry-run it on the local seed and on a copy of production counts first.
