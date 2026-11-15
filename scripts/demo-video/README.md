# The 30-second demo video

Films the app on the local copy, as Franky, and cuts it into two films and a poster. Nothing here touches
production: the camera refuses any address that is not `localhost`, and the data tool only talks to the local
database container.

## The one command

```
node scripts/demo-video/record.mjs
```

About five minutes. It writes, outside the repo:

- `~/vibe-demo-video/vibe-demo-30s-master.mp4`: the film as filmed, 1170x2532, 60 frames a second.
- `~/vibe-demo-video/vibe-demo-30s-1080x1920.mp4`: for Instagram and the landing page. The phone screen with
  rounded corners on a near-black canvas with a soft coral glow.
- `~/vibe-demo-video/vibe-demo-30s-poster.jpg`: the lit hero. Use it as the landing page's video poster and as
  the Instagram cover: the film's own first frame is the hero before its lights come on.
- `~/vibe-demo-video/take/`: the lossless reels and `take.json` (the timeline, what the page wrote, the clean-up,
  the repo commit and a sha256 of every script that made it, and the md5 of each film it was cut into).

A take is filmed into `take.new/` and becomes `take/` only when it is good; the take before it is kept as
`take.prev/`. `cut.sh` writes the films under `.new` names, checks them, and only then moves all three into
place, so a film being looked at is never replaced by a half-written one. Name the md5 from `take.json` when
you review a film. Older films go in `~/vibe-demo-video/old/`, never next to the deliverables.

To cut again without filming again: `scripts/demo-video/cut.sh`.

## Before you run it

1. The local Supabase stack is up (`supabase start`) and Docker is running.
2. Franky's pictures are in `~/vibe-demo-photos/web/`. They are never copied into the repo.
3. Run the seed the same day, before 9:30 pm Indianapolis time: `node scripts/demo-seed.mjs`.
   "Blitz Night" is tonight 7 to 10 pm; after 10 pm it leaves the Events list.
4. The demo dev server answers at `http://localhost:3102` (next section).
5. Keep the Mac awake.

The recorder checks 3 and 4 itself and stops with a plain sentence if something is missing.

## Start the demo server

The film is made on a dev server that reads the LOCAL database and has the new chat on for everyone.

1. A checkout of the app at the commit to film, outside this folder. On Oct 2 that was the branch
   `landing-night`; on Nov 14 it was `main` (`git worktree add -b <branch> <folder> main`), then
   `npm ci` in it (a new worktree has no `node_modules`).
2. In that checkout, a file `.env.development.local` (it wins over `.env.local` under `next dev`, and git ignores
   it). Do not copy `.env.local` over: it holds live keys. The Oct 2 server's file sets these 26 names:
   - Needed: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (all three
     from `supabase status -o env`), `NEXT_PUBLIC_SITE_URL=http://localhost:3102`, `CHAT_V2_ENABLED=true`,
     `CHAT_V2_ALLOWLIST=*`, and any made-up local values for `SCHOOL_EMAIL_VERIFY_SECRET` and `RESTRICTION_PEPPER`.
   - Off: `BILLING_ENABLED=false`, `PUSH_ENABLED=false`, `PUSH_ALLOWLIST` empty, `RESEND_FROM` anything, and
     (since Nov 14) `SCHOOL_EVENTS_OFF=true`: no school calendar is read, so no IU event, team or place can reach
     the Feed or Events (gate G11), and the dev server never calls the schools' sites.
   - Must be EMPTY on a demo server (no live key on a machine that films): `RESEND_API_KEY`, `R2_ACCESS_KEY_ID`,
     `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`,
     `SUPABASE_ACCESS_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
     `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `FCM_SERVICE_ACCOUNT_B64`. Nothing in the film needs them.
3. `npx next dev -p 3102` in that checkout. (This Mac's `.claude/launch.json` has it as `vibe-landing`.)

With the wrong database the take stops at "the screen never settled: the feed"; with the new chat off, at
"the screen never settled: Messages".

## Settings and fixed paths

- `DEMO_BASE`: the dev server (default `http://localhost:3102`). Only `http://localhost` or `http://127.0.0.1`.
- `DEMO_OUT`: the output folder (default `~/vibe-demo-video`). Refused if it is inside the repo.
- `DEMO_CUT=0`: film only, do not cut.
- `DEMO_WATCHDOG_MIN`: minutes before the whole-take watchdog stops a take (default 15). On Nov 14 a busy Mac
  stalled for minutes at a time and the take needed `DEMO_WATCHDOG_MIN=60`.
- It runs on this Mac only: Playwright is loaded from `~/.claude/skills/gstack/node_modules`, the sign-in tool
  from `handoffs/chat-redesign/wave-1-build/tools/cookie.mjs`, ffmpeg from `/opt/homebrew/bin`.

## What each file does

| File | Job |
|---|---|
| `record.mjs` | The whole run: checks, opens every screen once off camera, films, puts the data back, cuts. |
| `storyboard.mjs` | The film, shot by shot. The file to edit. |
| `capture.mjs` | The camera. Freezes the page's clock, moves it 1/60 s per frame, takes one screenshot per frame. A slow machine makes the run longer, never the film worse. |
| `shim.mjs` | The part of the camera that runs inside the page: animations and smooth scrolls on the frozen clock, the finger dot, and the film-only dressing. |
| `moves.mjs` | The hand: tap, scroll, type. Each move checks that it worked. |
| `data.mjs` | Checks the practice data, remembers it before a take, puts it back after. |
| `cut.sh` | Joins the three reels and writes the two films and the poster. |
| `landing.sh` | The landing's two web films, `vibe-demo-780.mp4` and `vibe-demo-390.mp4` (`src/lib/landing/demo-media.ts`), cut from the master into a folder outside the repo. Uploading them is Franky's step. |
| `check.mjs` | Compares the two films frame by frame; the cut fails if the framed one repeats frames. |
| `stills.sh`, `stills.mjs` | The landing's committed stills and film poster (`public/landing/`), cut from the master: frame times and crops are in `stills.sh`. Photo-free screens only; look at each one before committing. A new take moves the screens: check the times first. |

## Changing the storyboard

Everything is in `storyboard.mjs`.

- **How long a beat lasts:** the table `T` at the top, in milliseconds of film. A tap adds the finger dot's
  330 ms lead (`moves.mjs`) to the beat it ends. `T.openAt` is where the hero starts on the sky's own clock;
  `FADE_MS` is the dip to black at the two joins.
- **The line Franky types:** `LINE`.
- **A new screen:** copy a block. Tap with `cut: true`, then `s.settle("name", test)`, then `s.record(true)`.
  The test must name words that are only on the finished screen, so a loading screen can never pass for it.
- **A tap that stays on the same screen** (a chip, a field, Send): no `cut`. Say what should follow in `expect`.
- **A new thing the page must write:** add it to `allow`, and teach `data.mjs` to put it back.

The film must stay at 30.0 seconds or less. `record.mjs` prints the timeline and stops if it is longer.

## What it writes, and takes back

The page may write two things: the line to James and the read markers the app moves when a chat opens. Every
other write is refused in the browser (among them the "active now" heartbeat and the profile-view ledger).
Two more things happen outside the page: each run signs Franky in once (a session row in the local auth
tables), and the warm-up sends one empty message from Node to compile the send route (the app refuses it; its
limiter row is counted).

After the take, `data.mjs` deletes the line, puts the markers, the "active now" stamp and the limiter back,
closes the sign-in it opened, and compares a fingerprint of every public table with the one taken before. A take
that fails is cleaned up the same way. On Ctrl-C, a kill or the 15-minute limit the browser is killed first,
then the data is put back, and looked at again 1.5 s later in case a line already on its way landed late. A Mac
that goes to sleep or a `kill -9` cannot be caught: the next run then says what is left and sends you to the
seed, which removes it.

## Film-only dressing

Twenty-four small things are changed in the film and NOT in the app. Most hide a flaw the app still has on a 390 px
phone in Night, so each is also a thing to look at in the app. 1 to 5 and 14 to 17 are in `shim.mjs` (`pageDot`,
its rules 1 to 9), the rest are in `storyboard.mjs`.

1. Campus header: the whole crimson campus bar ("IU Bloomington", its monogram tile, its count line) is left out
   (since Nov 14: no school name, colour or mark on camera until IU answers, gate G11); the chips move up into
   its place.
2. The chip row (Feed, Events, Orgs, Map) gets a solid backing; posts used to show through it while scrolling.
3. The tab bar is fully opaque; lines under it used to ghost through.
4. Orgs list: the "Following" pill beside a name is left out and the handle line is set a little tighter and
   may wrap ("Tower…" and "@sae · Invite only · 3 me…" before).
5. The DM field's picture button gets Night colours (it is a light grey disc in the app).
6. Rylan's profile: the study chip that only repeats "IU Bloomington" is left out (he has no major seeded).
7. The close: the "Bring your club." card and the footer around the wordmark are left out, and so are the
   "Sign up" button and the "Log in" line (nobody can tap a video). The wordmark, the tagline and "IU · PURDUE" stay.
8. Chess Club's Lounge: a few px of room under the last line, so the top row under the Board bar is whole.
9. The hero: "Tap a light to see what's out there." is hidden (it keeps its room). Since Nov 14 the landing is
   opened as `/?signup=open` (dev-only override, src/app/page.tsx): sign-up is open live since Nov 9 and every
   button reads "Sign up free"; the local database keeps sign-up closed. The take fails if "Join the waitlist" shows.
10. The hero: the six labels are put on the sky's clock (see Known limits), so they light the same way every take.
11. Events: the "Report event" buttons are hidden (beside "Add to calendar" they keep their room; alone in a
    row, the row is taken out).
12. Orgs list: a handle line that wraps breaks after the handle ("@tower_floor_3" / "By request · 3 members"),
    instead of leaving a "·" at the end of the first line.
13. Profiles (Rylan's and Franky's): the round "+" (New post) is hidden; it sat on the first post's "⋯".
14. The small counts that read as "nearly empty" are left out (the marketing rule: no number that makes Vibe look
    bigger or smaller than it is), each with its own "·", so nothing dangles and nothing leaves a gap: the Orgs
    list's "· 3 members" ("@chess_club": the handle and the join mode stay), a club page's
    "· 6 followers · 3 members" ("@sae"), the "4 going" on the event cards (Events and the Lounge's card; hidden,
    its room kept), "Interested · 1" ("Interested"), and the Lounge header's "· 7 members" ("Your hat: Member").
    The profile header's FOLLOWERS / CONNECTIONS numbers are not touched. `shim.mjs` rule 6, an observer; the
    storyboard fails the take if a count is still in sight on Events, the Orgs list or Chess Club's page.
15. Messages home, the "Live now" room card: the red dot's halo was cut flat on its left and top (its line is
    `overflow: hidden`); the line is let overflow. `shim.mjs` rule 7.
16. Feed, the "today." strip: only its first chip ("Blitz Night  Today"); the second ran off the screen edge.
    `shim.mjs` rule 8.
17. The DM and the Lounge: the round "⋯" (Message actions) beside each bubble is hidden, its room kept.
    `shim.mjs` rule 9.
18. Rylan's profile: the tab bar does not light the Profile tab there (it read as Franky's own profile). Taken off
    again before Franky's own profile, where Profile is lit (`storyboard.mjs`, `visiting`).
19. (Nov 14) "What's the vibe tonight?" on the Feed and the Events pane's "Tonight" section are left out: no public
    post shows a Tonight screen until IU answers (gate G11). Blitz Night still shows under "Coming up". `shim.mjs`
    rule 10.
20. (Nov 14) A club's page: the FOLLOWERS / MEMBERS numbers beside its logo are hidden (rule 14's reason).
    `shim.mjs` rule 11.
21. (Nov 14) Profiles: the school badge ("🎓 IU Bloomington", in the school's crimson) and the chips that only repeat
    the campus name are left out; a chip row left empty goes too. This replaces Oct 2's rule 6 (Rylan's study
    chip). `shim.mjs` rule 12.
22. (Nov 14) Messages home, "Your week": a card for an event of a club that is not the cast's is left out. On the
    local database Franky's test account also holds RSVPs to a real club's events, written by another session.
    `shim.mjs` rule 13.
23. (Nov 14) The chips put the open pane in the address (`?tab=events`); the camera films through that one change
    (`session.urlMay`), and only on /campus.
24. (Nov 14) No real club's or building's name is on camera: the seed's SAE became Outdoors Club, "Tower Floor 3"
    Film Society and "North Hall" Music Collective (`demo-seed.mjs`, RETIRED). The film visits Chess Club's page.

## Known limits

- **No swipes or long presses.** Taps, scrolls and typing only. The week swipe in Messages cannot be filmed.
- **Cuts, not slides, between screens.** A route change is never filmed, so loading shapes never show. The
  chat does not slide in; it cuts in.
- **Two takes are the same film, not the same pixels.** Same length, same cuts, every scroll on the same pixels
  (scrolls are counted in frames). What differs: "2h ago" becomes "3h ago", and James's row shows the real time
  the line was sent. The hero now starts on its own sky's clock (`shim.mjs` marks when the page starts it), so
  its opening is the same to the frame: two runs of it compared at 0.999998 SSIM on Oct 2.
- **Before or after 7 pm.** Blitz Night starts at 7. A take filmed after about 6:55 pm (Messages comes about
  three minutes into the run) shows "Live now" on the Messages home and in the Lounge where an earlier take shows
  "7 PM", while the posts and the chat still say "tonight at 7". `record.mjs` prints a note when that will happen.
- **Scrolls move in whole CSS pixels.** `shim.mjs` asks for positions on the 3x device grid, but this Chromium
  rounds scroll offsets to whole CSS pixels (tested on Oct 2, also with `FractionalScrollOffsets` on), so the
  step per frame alternates by one pixel ("10 11 10 11"). Barely visible; no fix in the browser.
- **The typing has no keyboard.** A headless phone screen shows none; the line appears in the field as typed.
- **It is tied to this app and this browser.** The in-page shim replaces animation frames and smooth scrolls,
  and the dressing rules go by the page's structure. An app change could look wrong without failing: look at
  the film.
- **No profile pictures.** Everyone is an initials tile, Franky too. That stays until Franky sends a headshot:
  no face is ever cut out of the shared pictures to make one (it would put a person's face where they did not
  choose it).
- **It needs the internet** for the fonts (Google Fonts), even though everything else is local.
- **If the clean-up reports a table that differs**, another session was using the local database, or the take
  wrote something new. Run the seed again before the next take.
