# Otto as an agent: the design board (Nov 9, 2026; round 2 on Nov 10)

**Board:** https://claude.ai/artifact/SUW2iyFFTdCLYjx62rZtXk
(a Design canvas, private to Franky's account until he shares it from the page's Share menu, so Arash can't
open it yet. It holds invented people, clubs and numbers only: Jordan Reyes, Canal Run Club.)

**Spec it follows:** "Otto: what we're building", the spec for Arash
(https://claude.ai/artifact/S7TzsPPRiXa4h27P443XJr), sections "Product design" and "How Otto acts".

This is the visual track for Otto becoming an agent. **No app code changed.** Nothing about the AI is live,
and every board says "design, not live". It also covers the Otto page redesign queued since Oct 20 (D8 in
`2026-10-19-critique/PLAN.md`): direction B's Today page is that redesign.

## Round 2 (Nov 10): built on C, Otto's desk

Franky turned down "build B + Ember": "actually i like C but maybe we should build on it a little more, lets
make this beautifully designed." He sent four soft 3D mascot pictures (mood only), a list of design skills, a
texture list (felt, fluted glass, grainy gradients, contour lines, blueprint grids, halftone, paper, ASCII and
pixels, and more), and three asks: a UI/UX designer agent, keep the space direction, and try different colors
(a possible paid customization later). On textures: "why are textures static and not animated", then "make
different versions of static and animated, you decide".

**Round 2 is published to the same link** (27 boards now). It is still design only: no app code, no database,
nothing deployed.

### The look, in one line

A warm night sky is the header, paper cards are the desk, and a small planet lives there.

### What's new on the canvas

Read left to right, top to bottom. Round 1's rows stay at the bottom, unchanged, labelled "Round 1".

- **Start here** (rewritten): the direction, the lead Otto, the texture jobs, the calls.
- **Row "Otto himself, space and textures":**
  - **Planet (the lead), Moon, Rover, Comet:** four original Ottos drawn in code, each at tab 24, chat 28,
    corner 64 and hero size, in every state (idle, thinking, working, done, didn't work, waiting on you),
    Night and Light, with a still version. Each runner-up board says why it isn't the lead.
  - **Space, warmer:** the night sky over campus instead of deep space. The sky is the header of the page,
    stars are stippled, orbits are contour lines, and the onboarding wormhole ends in the new Otto.
  - **Textures:** Franky's whole list, each drawn twice (still and living), and the working set with a job
    each: felt = Otto's body, grainy and stippled gradients = the sky, contour lines = orbit paths, blueprint
    grid = a draft waiting for approval, paper = the desk's cards, halftone = "done" stamps, fluted glass =
    the side panel, ASCII and pixels = Otto's thinking steps.
- **Row "Otto's desk (the direction you picked)":**
  - **D1** the Otto tab on a phone: Ready for you, Scheduled, Done this week.
  - **D2** the ask: you ask, he checks, you send. "What will happen" and "Acting as" are on the card.
  - **D3** the computer: the corner Otto and the side panel.
  - **D4** notifications ("Otto saw"), Stats and settings on a phone.
  - **Colors:** one Otto in ten colors (the app's ten backdrop names: Dusk, Midnight, Violet, Rose, Cardinal,
    Ember, Lantern, Forest, Canal, Onyx) plus texture skins, still and living, and a mock "Otto's look" picker.

### Decisions I made (say if any is wrong)

- **Planet is the lead Otto.** It grows today's orb instead of replacing it, reads at 24px, and keeps the
  space idea. Moon, Rover and Comet stay on the board as runners-up.
- **Otto is drawn in code** (SVG and CSS), not as 3D picture files, so he can blink, lean and bounce on the
  app's springs, stay sharp at tab size and be recolored with no new files.
- **Still is the base, living is for Otto and for moments.** Cards, lists, the side panel and the 24px tab
  Otto are still. The hero Otto and the sky move gently. Reduced motion and Low Power Mode get the still
  version everywhere.
- **Living textures move by sliding or fading a layer.** The noise is drawn once and never animated, so it
  stays cheap on phones and inside the app's move-and-fade rule.
- **Colors reuse the ten backdrop names**, so club backgrounds and Otto's colors are one system. Ember is the
  default.
- **The sample story** is one club all the way through: Canal Run Club, 38 members and 112 followers. This
  Friday's run is already posted with a reminder scheduled; the draft waiting on the desk is next week's run.

### Calls for Franky (my pick for each)

1. **Which Otto?** **Answered Nov 10: Planet** (Franky: "Yes, Planet").
2. **Face or no face?** **Answered Nov 10 with call 1: a face**, two eyes, no mouth at small sizes. The
   spec's "no face" line has to change.
3. **The base textures?** The seven drawn on Start here. Say so if you want Planet in felt.
4. **Still or living by default?** Still everywhere, living for Otto and moments, one switch in settings.
5. **Default color, and what is paid?** Ember by default, the ten still colors free, living texture skins as
   Vibe+ candidates. Billing stays off; this is a picture of a picker.
6. **Still textures: free or Vibe+?** Free.
7. **How much space stays?** The sky is the header (option B on the Space board).
8. **Do cool skies like Canal end in a warm horizon?** Yes, a thin one. Otto himself stays teal.
9. **Stats numbers?** Two: things Otto did, and views on what he posted, over the last 30 days.
10. **Otto's waiting dot beside a verb button?** Quiet (ink). Coral only where no verb button is on screen,
    so each frame keeps one coral fill.
11. **Does "Undo for 10 seconds" mean the notice waits 10 seconds before it goes out?** Yes.
12. **Does the page dim under the side panel on the computer?** No.
13. **A chat-history row in Settings?** Yes.
14. **Does the designer agent file go into git?** Not yet.

Smaller calls, each with my pick on Start here: what opens first on the desk (the top draft, already open);
keep "Otto saw" and "Earlier" on the computer (keep both); the like-milestone notice (keep it in the list,
switched off); keep the purple colors (keep all ten); Blueprint as a skin (drop it, ship five); thermal and
iridescent warm or purple (warm); the orbit's coral dot (drop it in the app); the bench of eleven extra
textures (none ships until a screen needs it); keep Planet or swap to Comet (keep Planet).

### How it was made

- Three workflows: the four Ottos, Textures and Space; then Colors and the desk rebuilt; then two adversarial
  reviews and a repair pass. I looked at every new board as a picture before publishing, and at the live
  canvas after.
- Skills added for this (local, in the gitignored `.claude/skills`): Emil Kowalski's set, Web Design
  Guidelines, BrandKit, Extract Design System, Image to Code; UI/UX Pro Max was already there. They were used
  as craft reading only: none of their scripts or outside tools were run. `skills-lock.json` is new and
  untracked in the repo root.
- A designer agent for UI, UX, design concepts and branding: `.claude/agents/vibe-designer.md`. It is local
  to Franky's Mac because `.claude/` is gitignored (call 14).

### Known and left open

- Start here is drawn in Night only.
- D3 has a stretch of bare page in its third frame and one invented number ("4 new followers this week").
- D4 does not draw the "are you sure" sheet for Delete all chats.
- The shared kit still has three purple textures (thermal, iridescent, impressionist) and a teal end on the
  Canal sky; the Textures and Space boards redraw them warm as a proposal (calls 8 and the smaller calls).
- Some boards still show the older Light sky.
- No focus ring is defined yet in the kit.

### Not checked

Motion watched live on a phone, focus rings, measured contrast, and real devices. The reviewers could not
check these either. They belong to the build.

### Where the sources are

The published boards are self-contained: each carries its styles between `/* name.css */` markers (`otto.css`,
`tex.css`, `mascot.css`, `m-planet.css`, `desk.css`, `skins.css`). The un-inlined sources, the kit, the briefs
and the two reviews are backed up in the side session's shared notes folder on Franky's Mac (`otto-kit-backup`),
not in git.

## Round 1 (Nov 9): what's on the board

- **Start here:** what Otto can do first (post an event, announce to members, what's on tonight, send a
  reminder), the rule every direction keeps, the three directions, the recommendation, the calls, and what
  the model has to hand the screen (for Arash).
- **Otto's states:** the spec's four (idle, thinking, talking, waiting on you) plus working, done and didn't
  work. Night, Light and reduced motion. The motion on the app's springs, and where Otto lives (the phone's
  Otto tab, the computer's corner orb and side panel).
- **Otto's look** (added after Franky asked "should we redesign otto as a different mascot? does the solar
  system feel too cold?"): three ways to warm Otto, each at tab, chat, corner and hero size, Night and Light:
  **Warm orb** (today's orb, no purple at rest, no spin at rest), **Ember** (a glowing coal that breathes; the
  orbit shows only while Otto works) and **Little face** (the ember with two dot eyes), plus how the ember
  behaves (leans in, glances, bounces, dims).
- **One row per direction:** the Otto tab on the phone, the ask in four screens (thinking, confirm, done,
  didn't work), and the computer. Night above Light everywhere.
- **Row B also draws the rest** (added at Franky's ask to keep stats, notifications and the orb's side panel
  in mind): B4, the phone's Today page further down (Otto did, and "Otto saw" for notifications), the Stats
  tab, and Otto's settings; B5, the side panel open over Campus (its Otto tab and its Messages tab); B6,
  Stats on the computer (one number and a 7-day bar strip, Vibe's own icons in neat columns: the D9 fix);
  B7, chatting from Today on the phone (Franky: "you should still be able to talk and chat with otto on today
  mobile"): the conversation stays at the top of Today, the ask bar docks above the tab bar while you scroll,
  a reply that lands while you're scrolled down rides on the docked bar, and yesterday folds into one row.

The rule every direction keeps (the spec's): you ask, Otto shows what it's checking, Otto shows **a card,
not a post** (the action in plain words, the result as it will look, where it goes and who sees it with a
count, what it sets off), you tap the verb ("Post event"), it goes out, and Otto links to what it made with
the app's own undo (delete it). A failure says what happened and that nothing went out.

| | Direction | The Otto tab | The ask drawn | The failure drawn |
|---|---|---|---|---|
| A | **Just talk** | One conversation; Otto's morning note opens the day | "post this event for my club…" | Vibe didn't answer: nothing was posted, the draft is kept |
| B | **Today + Ask** | A calm Today page that is also an ongoing chat: the conversation stays at its top and the ask bar docks above the tab bar while you scroll; on the computer, the corner orb's side panel | "remind people about friday's run" | Not an officer of that club: "Remind just me" instead |
| C | **Otto's desk** | Jobs you approve: Ready for you, Scheduled, Done; each spells out "What will happen" | "message all our members…" (an announcement on the Board that notifies the members) | The club already sent today's one announcement: "Schedule for tomorrow" |

## Round 1's recommendation (superseded: Franky picked C on Nov 9)

**B, with C's "What will happen" list on the confirm card.**
- B's page ships before the model is ready: its Today page is the Otto page redesign by itself (no purple
  starfield, Light mode, Fraunces headings, flat trays).
- With `OTTO_AI=off` (the spec's switch) there is simply no chat, and the page is still the new Otto page.
- It puts the chat where the spec does: the top of the Otto tab on phones, the corner orb's side panel on the
  computer, /otto as the roomy version.
- C's step list makes the card a contract: the model has to name each thing it will do, and the person can
  switch off the optional ones.
- It fits Eli's note (prove the core before agent work): B is the only direction that's useful without the agent.

## Round 1's calls (calls 1 and 8 are answered by round 2: C, and a new Otto; the rest still stand)

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
8. **Otto's look: a new mascot?** Warm orb, Ember or Little face. **Rec: the Ember, no face.** A face reads
   young for officers posting to a whole club, smudges at the 24px tab size, needs every state drawn, and the
   brand guide and the spec both say "no face". The Ember is warm without one; the onboarding wormhole would
   end with its rings settling into the ember.

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

- Done (Nov 9): round 1 published (16 boards), this note, and the link sent to the spec's session to add
  to the spec.
- Done (Nov 10): round 2 published to the same link (27 boards). Franky picked C; round 2 rebuilds it.
- Ahead of v1 on purpose: the desk draws a scheduled reminder (the spec starts with "remind now"), and the
  announcement needs the new announce route.
- Done (Nov 10, later): Franky picked Planet, with a face (calls 1 and 2). Start here and the Planet board
  now say so (canvas Version 17).
- Not done: no app code. Round-2 calls 3 to 14 are open, and so are round 1's calls 2 to 7. The spec's
  "no face" line needs changing (the spec's session owns the spec).
