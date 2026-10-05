# The hover menu in Messages: last review before main (S74, Oct 5)
Verdict: pass = True. Nothing high or medium reaches people today.

## Findings (all only with the desktop switch on)

### [medium] only with the switch on

- Where: public/html/messages.html, place() and show() in __dmInstallActionsHover (lines 1304-1323) with the .acts-below rules (lines 403-411). Seen at 1280x800 with the Pinned and Shared panel open and at 1440x900 with it closed.
- What: The first message's menu drops onto the second message and catches the pointer. When the pointer comes straight down from the chat header, across the first message on screen, to the message under it (two messages in a row from the same person), the first message's menu opens under its bubble at once, on top of the second message. The pointer ends on the FIRST message's menu; the second message's own menu does not open and its bubble is mostly hidden behind the menu. A press there reacts to, pins or deletes the first message (Delete's confirm does not say which message). Measured 3 of 3 at three speeds (about 120 ms, 400 ms, 1 s), for their messages and for mine; with main's page in the same pane the second message's menu opened 3 of 3. Coming from the left or from below it is fine, and moving on to the bottom strip of the second bubble opens the right menu. Stacked menus on main already lie over the neighbouring message the other way round (a menu above its bubble covers the message before it); this adds the downward case for the first message on screen. Still: final-review/still-passby-after-1280-panel-fr_long_from_blake.png.
- Fix: Move a menu under its bubble only after the pointer has rested on that bubble for about 150 ms (or not when the pointer came in through the bubble's top edge on its way down), so a pointer passing through is not caught. Also worth having Delete's confirm quote the start of the message.

### [low] only with the switch on

- Where: public/html/messages.html line 1026 (width:max-content in the narrow/touch block), in desktop Messages when the Pinned and Shared panel lies OVER the thread (window narrower than 1140: content width under 232+420+288).
- What: The one-row menu of the other person's messages now runs under the open Pinned and Shared panel. At 1024 wide the Report button is covered on 25 of 29 of their messages (on main 12 of 29, the long ones). At 900 wide the fire reaction, Reply, Pin and Report are covered on 25 of 29 (on main 11 of 29 had 2 to 7 buttons covered). Closing the panel uncovers them; my own messages are fully under that panel on main too. With the panel beside the thread (1280, 1440) or closed (all sizes) every button is pressable.
- Fix: In pane mode, cap the menu at the width the panel leaves free (the shell can tell the frame how much the panel covers) so it wraps there, or anchor it to stay left of the panel.

### [low] only with the switch on

- Where: public/html/messages.html, the focusin handler (lines 1363-1370) calling show() then place() (1305-1315).
- What: By keyboard, when Shift+Tab lands on a message whose top was cut by the header, the page measures before the browser brings that message down flush with the top. The menu is therefore left above the bubble, fully under the header (cut 43 px), and the next Tab jumps the chat by about 330 to 380 px to show it. This is what main does too; the new placement simply does not reach this case. When the message was already whole on screen the keyboard path is right: menu under the bubble, row raised, all 8 buttons visible with their focus ring, at 1280 panel open and 1440 panel closed.
- Fix: Measure again on the next animation frame after a keyboard focus (requestAnimationFrame(() => place(wrap))), so the browser's own scroll is counted.

### [low] only with the switch on

- Where: public/html/messages.html, place() line 1307 (it clears .acts-below from every row, including one that still holds keyboard focus), and the pane rules at lines 62-63.
- What: Keyboard and mouse at once. With keyboard focus on the first message (its menu under the bubble) and the mouse then resting on the next message, the first message's menu jumps back above its bubble and is cut by the header (38 to 39 px). The next Tab then drops focus to the page body instead of entering that menu. The focus drop is the same on main's page (measured there too): a menu kept open only by :focus-visible disappears while focus moves into it. Only the jump back under the header is new.
- Fix: In place(), do not strip .acts-below from a row that still holds keyboard focus. For the older focus drop, keep show-actions on a row while focus is inside it (do not let another row's hover or the 250 ms timer remove it).

## What was checked

Verdict: nothing high or medium reaches people today, and nothing high with the switch on, so this can merge. One medium and three lows exist only with the switch on.

Not covered: only Chromium was run (no WebKit or Firefox in the Playwright cache). iPad Safari, the main touch audience for the one-row change, was not run on a real engine.

Read the diff of daa980e line by line, then measured with Playwright against the local stack. Scripts, outputs and 32 stills are in /private/tmp/claude-501/-Users-franciscocazares-vibe/95993665-d589-438f-acb8-267060730d7e/scratchpad/release-walk/fixes/desktop-messages/final-review/.

A. Old page, switch off (main's copy served by a route, same clicks on both)
- Sizes: 13 configs, each on main and on the branch. 1280x800, 1440x900, 900x800 and 960x800 with a mouse; 1024x768 and 932x430 with touch; DM and group chat; Light and Night. Run with the new chat off for everyone, and the two narrow/touch DM configs again with it on.
- Load and composer: typing wakes the send button and clearing puts it back to sleep in all 26 runs; nothing was sent. The only console errors are local 500s on the messages poll (9 runs on main, 9 on the branch) and on a photo whose bucket is blanked locally.
- The menu at 1280 and 1440 with a mouse: identical to main, row for row (71 and 73 positions in the DM, 39 and 42 in the group).
- The menu at 900 to 960 wide and on touch: one row of 36 px where main draws 2 to 7 rows up to 222 px tall. No position where a button was pressable on main and is not on the branch (0 worse in every config; 6 to 21 positions better per config). Nothing off either side or cut at the bottom.
- Buttons: a reaction on and off, Reply, Report (closed unsent), Delete (confirm refused) and the "..." Chat info panel open the same things on main and branch at 900 mouse, 1024 touch and 1280 mouse.
- Keyboard: Tab order from the composer, and into a menu held open by the mouse, is identical on main and branch.
- The new "move under the bubble" code cannot run here: IS_PANE is false, no message is tabbable, the class was never set in any of the 13 walks (a watcher counted 0) and no row got a z-index.
- What else runs on the old page: no new listener or timer; one boolean that short-circuits and one class check per menu opening. The branch adds exactly 2 style rules, both starting html.vibe-pane, plus width:max-content in the narrow/touch rule. A browser without :has() and :focus-visible drops only vibe-pane rules, and the rule that opens every menu survives (simulated in oldcss.mjs).
- tsc, eslint on the changed component and the 79 related tests pass.

B. Pane mode, switch on
- Sizes: 1280 and 1440 with the Pinned and Shared panel open and closed, 1024 and 900 open and closed, Night, group chat, 1024 touch, plus main's page at five sizes for comparison.
- The two earlier mediums are gone. 135 menus placed under their bubble: every one had its row raised, none was cut or off a side, and every button was pressable except the ones under the Pinned panel itself (the low above). Walking from the bubble to the far and near buttons never closed a menu. Every button of an under-bubble menu acted on the right message, and reactions and pins were taken off again.
- By keyboard every focused button was visible with its ring.
- No class or raised row was left behind after the pointer and focus left.

C. Empty stage, sampled every frame at 900, 960, 1048 and 1280, and 900 in Night
- Hard load: absent, then hidden for one frame (5 to 8 ms), then visible at its final size (18 px under 1048, 22 px from 1048). Never visible at the wrong size.
- Visible straight away after going home by the list's button, by the browser's Back and from a chat deep link; the headline itself is on top at its place.
- Dragging the window across 1048 shows the old size for one frame.

Left as found
- .env.development.local is byte-identical (sha1 cad8dab6...).
- The 22 test messages, 4 sign-in sessions and 2 read markers are removed or restored; messages, reactions, pins, reports, sessions and channel_members match the start exactly.
- The worktree is clean on desktop-hover-menu at daa980e; the dev server and the Supabase stack were not restarted. Nothing touched production.
