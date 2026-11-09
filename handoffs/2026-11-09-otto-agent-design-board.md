# Otto as an agent: the design board (Nov 9, 2026)

**Board:** https://claude.ai/artifact/SUW2iyFFTdCLYjx62rZtXk
(a Design canvas, private to Franky's account until he shares it from the page's Share menu, so Arash can't
open it yet. It holds invented people, clubs and numbers only: Jordan Reyes, Canal Run Club.)

**Spec it follows:** "Otto: what we're building", the spec for Arash
(https://claude.ai/artifact/S7TzsPPRiXa4h27P443XJr), sections "Product design" and "How Otto acts".

This is the visual track for Otto becoming an agent. **No app code changed.** Nothing about the AI is live,
and every board says "design, not live". It also covers the Otto page redesign queued since Oct 20 (D8 in
`2026-10-19-critique/PLAN.md`): direction B's Today page is that redesign.

## What's on the board

- **Start here:** what Otto can do first (post an event, announce to members, what's on tonight, send a
  reminder), the rule every direction keeps, the three directions, the recommendation, the calls, and what
  the model has to hand the screen (for Arash).
- **Otto's states:** the spec's four (idle, thinking, talking, waiting on you) plus working, done and didn't
  work. Night, Light and reduced motion. The motion on the app's springs, and where Otto lives (the phone's
  Otto tab, the computer's corner orb and side panel).
- **One row per direction:** the Otto tab on the phone, the ask in four screens (thinking, confirm, done,
  didn't work), and the computer. Night above Light everywhere.

The rule every direction keeps (the spec's): you ask, Otto shows what it's checking, Otto shows **a card,
not a post** (the action in plain words, the result as it will look, where it goes and who sees it with a
count, what it sets off), you tap the verb ("Post event"), it goes out, and Otto links to what it made with
the app's own undo (delete it). A failure says what happened and that nothing went out.

| | Direction | The Otto tab | The ask drawn | The failure drawn |
|---|---|---|---|---|
| A | **Just talk** | One conversation; Otto's morning note opens the day | "post this event for my club…" | Vibe didn't answer: nothing was posted, the draft is kept |
| B | **Today + Ask** | A calm Today page with the chat at its top; on the computer, the corner orb's side panel | "remind people about friday's run" | Not an officer of that club: "Remind just me" instead |
| C | **Otto's desk** | Jobs you approve: Ready for you, Scheduled, Done; each spells out "What will happen" | "message all our members…" (an announcement on the Board that notifies the members) | The club already sent today's one announcement: "Schedule for tomorrow" |

## Recommendation

**B, with C's "What will happen" list on the confirm card.**
- B's page ships before the model is ready: its Today page is the Otto page redesign by itself (no purple
  starfield, Light mode, Fraunces headings, flat trays).
- With `OTTO_AI=off` (the spec's switch) there is simply no chat, and the page is still the new Otto page.
- It puts the chat where the spec does: the top of the Otto tab on phones, the corner orb's side panel on the
  computer, /otto as the roomy version.
- C's step list makes the card a contract: the model has to name each thing it will do, and the person can
  switch off the optional ones.
- It fits Eli's note (prove the core before agent work): B is the only direction that's useful without the agent.

## Calls for Franky (my recommendation for each)

1. **Which direction?** A, B or C. **Rec: B, with C's step list on the card.**
2. **Ship the Today page before the agent?** **Rec: yes, now**, as the Otto page redesign. It replaces the
   purple starfield page, adds Light mode and needs no model; the chat joins it later.
3. **Otto's purple:** thinking only, or gone? **Rec: thinking only** (the brand guide's rule). The purple page
   and the starfield go, and today's orb loses its always-on purple ring.
4. **Show Otto's thinking steps** ("finding friday's run"), or only the orb? **Rec: show them.** They're
   honest, cheap for the model to write, and the only sign of progress on a slow answer.
5. **The card's words:** sentence case or lowercase? **Rec: sentence case.** Otto's own lines stay lowercase
   (the spec's voice), but the card is the contract and reads like the app.
6. **The phone's Otto tab icon:** **Rec: a small still orb** with a coral dot when Otto is waiting on you,
   moving only while an approved action is going out.
7. **How long are chats with Otto kept?** **Rec: 30 days, deletable any time.** The spec already ties Otto
   to a Privacy Policy update.

Settled by the spec, so not asked here: Otto shows the exact result before it acts, only what your role
allows, one action per card, undo is the app's own delete, the calm lowercase watcher who never judges a
club's members, and `OTTO_AI=off` puts back today's Otto.

## For whoever builds it (after Franky picks)

- Today's Otto page: `src/components/otto/` (`OttoPageClient`, `OttoHero`, `OttoSection`, ...), the phone's
  `src/components/mobile/OttoMobile.tsx`, and the `.otto-room-*` rules in `src/app/globals.css` (the purple
  starfield). The D8 plan says the revamp owns those files.
- The orb: `src/components/the-map/OttoOrb.tsx` and `.otto-orb-wrap` in `globals.css`. The board's orb is the
  same build (breathing ring, two orbits, core) with states added: `think` turns on the purple inner orbit,
  `talk` quickens the pulses, `work` is a coral arc, `done` pops a check, `fail` stops still, and a badge
  means waiting on you.
- The computer: `src/components/network/OttoCorner.tsx` (the corner orb) and `OttoSidePanel.tsx` (its Otto
  and Messages tabs).
- Motion: transform and opacity only, on `src/lib/motion/springs.ts` (CSS twins `--vibe-spring-soft` and
  `--vibe-spring-pop` in `globals.css`); loops stop under reduced motion.
- The board's styles (both color sets, the orb states, the keyframes) sit in each board between
  `/* otto.css */` markers; read a board with the Artifact tool to lift them.
- Two things the board shows that need backend work first (the spec's tool list): the scheduled event
  reminder (the spec starts with "remind now"; scheduling waits for the reminder job) and "message all
  members" (the new officer-only announce route with its one-a-day cap).

## Status

- Done: the board is published (11 boards), this note, and the link sent to the spec's session to add to
  the spec.
- Ahead of v1 on purpose: B draws a scheduled reminder (the spec starts with "remind now"), and C's
  announcement needs the new announce route.
- Not done: no app code. Franky hasn't picked a direction or answered the calls.
