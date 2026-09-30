# Security wave, batch a: booby-trapped emoji reactions

Finding: report "[High] A booby-trapped emoji reaction..." (handoffs/2026-09-27-security-risk-report.md ~line 222).

Owns: public/html/messages.html (reaction chips + click handling only), public/html/_miniMessenger.js,
src/app/api/me/threads/[id]/messages/route.ts, src/app/api/me/threads/[id]/messages/[messageId]/react/route.ts,
NEW src/lib/messages/reaction-emoji.ts (+ .test.ts), NEW migration(s) in 110000-119999.

## Log

- Started. Read the report summary, the finding section and the Immediate roadmap item.
- Production read (read-only MCP, 2026-09-27): message_reactions has 24 rows, every one inside the
  seven-emoji list (❤️ 5, 👍 5, 👎 5, 😂 4, 🔥 4, 😢 1; ❤️ stored WITH U+FE0F). So the new CHECK is added
  VALIDATED, not NOT VALID. Constraint today: message_reactions_emoji_check
  `CHECK (((length(emoji) >= 1) AND (length(emoji) <= 16)))`. relacl gives anon AND authenticated
  arwdDxtm; RLS on; three policies (select_member, insert_member, delete_own), no UPDATE policy.
  Latest recorded migration 20260927100000. Local test DB (supabase_db_vibe) matches, 0 rows.
- Other callers of the react route: campus-home.tsx and MessagesMobile.tsx (React, JSX renders the
  emoji as text, not touched). Only the two static renderers put r.emoji into innerHTML.
- Scope decision: messages.html actionsFor (the hover pill's five emoji buttons, Reply, Report, Delete)
  still builds inline onclick strings. Its emoji come from a fixed list and m.id is a server uuid, and
  my Owns line for messages.html is "the reaction chip code and its click handling only", so it stays
  for whoever owns the rest of messages.html. The new delegated listener handles any
  [data-rx-emoji] button inside #msgsArea, so that pill can move onto it with markup changes only.
- Wrote src/lib/messages/reaction-emoji.ts: ALLOWED_EMOJIS (same seven strings, byte-checked against
  the route's old Set), isAllowedReactionEmoji, and groupMessageReactions (the messages route's old
  grouping loop, now dropping unlisted emoji before counting).
- Wrote supabase/migrations/20260927110000_message_reactions_emoji_allowlist.sql (validated CHECK,
  same constraint name, U& escapes, pre-flight reads the current constraint text + aborts on stray
  rows, post-check probes by behaviour and writes nothing).
- LOCAL PROOF (supabase_db_vibe): applied cleanly (BEGIN..COMMIT, both DO blocks passed). Re-running
  aborts at PRE-FLIGHT (constraint text changed), as it should. Then as `authenticated` with a
  channel member's jwt claims (what PostgREST does): insert '<b>x</b>' -> 23514
  message_reactions_emoji_check (RLS passed first, so before this file it would have been stored);
  heart without FE0F -> 23514; all seven listed emoji insert; the member's own delete works; an
  UPDATE to markup as postgres -> 23514. All in rolled-back transactions; 0 rows left behind.
  Scratch script: scratchpad/rx_probe.sql (not in the repo).
- Routes: react/route.ts now imports isAllowedReactionEmoji (its private Set is gone; trim and 400
  "emoji not allowed" unchanged). messages/route.ts hydrateReactions calls groupMessageReactions, so
  a stored unlisted emoji never reaches a client; its local ReactionGroup type moved to the lib.
- Renderers: messages.html chipsFor escapes the emoji (and count) and carries data-rx-msg /
  data-rx-emoji; one listener, __dmInstallReactionClicks, mounted on #msgsArea from renderMsgs next
  to the drag/hover installers, calls window.__dmToggleReaction. _miniMessenger.js: the hover pill's
  five emoji, its Reply, and the chips all carry data-vmm-act (pick|reply|chip) / data-vmm-mid /
  data-vmm-emoji; one listener, installVmmMessageClicks, on #vmmMsgs from paintMessages. pick and
  reply still stop propagation (their inline handlers did), chips still bubble (theirs didn't).
  Remaining inline onclicks in _miniMessenger.js are fixed strings (close, cancel reply).
- RENDER PROOF: a harness built by slicing the REAL chipsFor / __dmInstallReactionClicks / esc /
  installVmmMessageClicks / the mini's button template out of the edited files, run in the preview
  browser (a same-origin blank document, no app code, no dev server started): reactions
  '<img src=x onerror=...>' and "');window.__pwned=2;('" render as text (0 <img>, __pwned unset,
  0 [onclick] in either container); clicking every button handed the exact strings to the toggle
  handlers; Reply called __vmmStartReply('m-1'); bubbling matched the old behaviour.
- node --test src/lib/messages/reaction-emoji.test.ts: 8/8 (includes a guard that the three U&
  lists in the migration decode to ALLOWED_EMOJIS). eslint clean on the four TS files. node --check
  clean on _miniMessenger.js and on both inline scripts of messages.html.
- NOT DONE here (outside Owns): messages.html actionsFor still builds inline onclick strings for the
  hover pill's emoji / Reply / Delete (fixed emoji list + server uuid, so not exploitable today; it
  can reuse data-rx-msg / data-rx-emoji + __dmInstallReactionClicks, but it must keep
  event.stopPropagation()). Migration NOT applied to production.
