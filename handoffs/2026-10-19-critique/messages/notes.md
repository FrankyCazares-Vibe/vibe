# Messages critique (Oct 19) — evidence notes

Seed account: avery (9 clubs, 5 chats), local dev server, dark theme.

- d4-desktop-inbox-avery.png, d4-desktop-inbox-bottom-avery.png, d4-phone-inbox-bottom-avery.png
  Club rows with no preview and no event chip measure 48px tall with a 48px avatar (avatar top == row top),
  so w1test club / 2 / 3 avatars touch edge to edge. Other rows: clubs 64-69px (48px avatar), people 63-65px (44px avatar).
- d5-desktop-dm-open-slim-avery.png
  Wide list 14 rows; slim list with Blake's DM open = 8 rows (Chat Seed Club, Test Hidden, Test Open, w1test x3 missing).
  slimRows caps at SLIM_TARGET = 8 (desktop-rules.ts:181,220).
- d6-desktop-dm-hover-own-avery.png  desktop DM (legacy frame): hover pill = 5 emojis, Reply, Pin, 13px trash "Delete message".
- d6-desktop-club-hover-own-avery.png desktop Lounge, own message: toolbar = React, Reply only (no More, no delete).
- d6-phone-dm-press-own-avery.png   phone DM long-press own: 7 emojis, Reply, Pin message. No delete.
- d6-phone-club-press-own-avery.png phone Lounge long-press own: 7 emojis, Reply. No delete.

API: DELETE /api/me/threads/[id]/messages/[messageId] already hard-deletes the sender's own message in any room
(RLS messages_delete_own, 20260509100000). No DB writes were made in this check.
