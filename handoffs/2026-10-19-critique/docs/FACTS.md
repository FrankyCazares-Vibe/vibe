# Session 79 facts for the doc update (Oct 18-19, 2026)

The one source the doc agents work from. When this file and the code disagree, the code wins: check
`git show <commit>` and the files named. Plain English, short sentences, a recommendation for every open
call, no blame framing, "video posts" (never "clips"), no equity language, never a person's records.

## Where things stand
- Main is `29b6121`, deployed (Vercel success, live probes passed Oct 19 late evening).
- 3,521 tests pass (`npm test`), type check clean. 906 commits, 128 migrations, 191 API routes, 35 pages.
- The Privacy Policy is dated **October 19, 2026** (two changes that day: event check-in, and the
  "Message deleted" note). Checker: PASS, 1,248 sentences the same.
- Two production database changes on Oct 19, each after Franky's explicit yes:
  `20261019120000_event_checkins` and `20261019150000_message_deleted_note`.
- Finding: production has **no `push_outbox` table** (the push migration was never applied; push is
  parked until Apple accepts). The first apply of the deleted-note migration refused itself on that,
  nothing was written, the file was changed so push_outbox is optional, re-rehearsed locally (40 of 40
  cases), then applied.

## Shipped this session (oldest first)
| Commit | What |
|---|---|
| `49ce2d9` | The app motion pass (phone + desktop) and each phone tab keeps its own scroll (the Feed → Orgs blank bug Franky reported) |
| `d4bffc2` | Research: who could pay for Vibe (sponsors, Greek life, the school, athletics): `handoffs/2026-10-18-research-sponsors-greek-athletics.md` |
| `33dc0cd`, `8e54e1e`, `a76d45e` | Design boards for the desktop feed side space and the tonight card; Franky picked C2 (desktop), the phone card that opens a sheet, and a Tonight section in Events |
| `5d3ddc6` | Fonts: one shared font link (`src/lib/theme/fonts.ts`, pasted into the static pages, a test guards drift), soft Fraunces on ALL titles, the coral accent word upright, the soft logo file `public/fonts/vibe-wordmark-v1.woff2` everywhere, real weights |
| `5248efe` | "What's the vibe tonight?" and "Your clubs" on Feed and Events (C2 on desktop, phone card + sheet, Tonight section in Events) |
| `9a0a0d2` | School cards glow in school colours on hover (IU crimson), no orbit that looked like a stuck cursor |
| `6bb6c04` | The lead line reads only "First because it starts soonest." |
| `9117dc6` | Event check-in (live Oct 19): door code + QR for officers, "Mark as here", anyone at the event can check in, kept until the club deletes the event, students can remove their own; counts show from 5 up (officers see the real number) |
| `7c35593` | Critique wave 1a: even Messages rows with 48px pictures, every chat in the side list while a DM is open; Otto stats use our own icons, not emoji |
| `a3215a1` | Critique wave 1b: "Reposted by" list, one hashtag rule everywhere, Bloomington school events on |
| `29b6121` | Critique wave 2: likes and saves stay in sync between the feed and the open post; the quiet repost line; tags tappable inside captions; profile composer clears the tabs; Saved shows pictures on desktop; our repost icon instead of the Apple emoji; delete your own message (a grey "Message deleted" note stays); calendar colours and event links; the door view has one "Done" |

## Tonight (school and athletics events)
- Code: `src/lib/school-events/*` (iCal reader, sources, off switch), `src/app/api/school-events/route.ts`,
  `src/components/campus/tonight/*`. Contract: `handoffs/2026-10-19-tonight-build/CONTRACT.md`.
- Indianapolis: IU Indy Jaguars athletics (iuindyjags.com) and IU Indianapolis events (events.iu.edu).
- Bloomington (turned on Oct 19 for Franky's demo): IU Athletics home games (iuhoosiers.com) and IU
  Bloomington Student Life + Featured (events.iu.edu). Titles read "IU vs Purdue".
- Order (`buildTonight` in `src/components/campus/tonight/tonight-view.ts`): the school's own featured
  pick (none so far), else tonight's home game, else the school event on now, else the soonest; then the
  other school events; then club events. Never by popularity.
- Off switch: env `SCHOOL_EVENTS_OFF` or the `app_settings` row `school_events_off`.
- Franky turned it ON before any written OK from athletics or IU Licensing. Outreach drafts are in
  `vibe-marketing/outreach/2026-10-19-jaguars-ok/` and `.../2026-10-19-iub-athletics-ok/`; Franky sends
  them himself. Rule for marketing: no public post names the schools or uses their marks until they
  answer in writing.
- Unverified: iuhoosiers.com sits behind Imperva and may refuse Vercel; if so Bloomington loses only its
  games (Student Life and Featured come from events.iu.edu and still show; no crash). Franky checks by picking Bloomington under Campuses.

## Decisions (full list: `handoffs/2026-10-19-critique/DECISIONS.md`)
- Reposts: one quiet line ("Maya and 6 others reposted"); tap opens "Reposted by" naming people you
  follow, the rest as a number.
- Hashtags: 5 per post, 2-32 characters with at least one letter, 5 in the trending strip, tags tappable
  inside the caption (no chips). Trending needs 2 different people from launch day:
  `TRENDING_MIN_AUTHORS` goes 1 → 2 on launch morning (checklist note in `handoffs/2026-10-12-launch-checklist-audit.md`).
- Deleting your own message (DMs, group chats, Lounge, rooms, event chats, Board posts; phone and desktop):
  words, files, cards, reactions, pins and notifications go; a grey "Message deleted" note stays ("Post
  deleted" for a Board post, whose replies stay under it). Franky chose the note over the plan's "gone, no note".
- Calendar: solid coral = Going, coral outline = Interested, a plain chip with a thin bar in your colour =
  your own entries, the word "Interested" everywhere, even day cells. Clicking an event opens its club
  page at that event (`/orgs/<handle>?event=<id>`); a real event page after launch.
- Otto revamp: a design board this week, build after launch.
- Profile views: keep "the last day each person viewed you".
- Saved text posts: plain theme-coloured tiles for launch.

## Motion and fonts (for the brand guide and design system)
- Springs in `src/lib/motion/springs.ts`: SNAPPY, SOFT, POP. Transform and opacity only, never blur,
  reduce-motion respected (`MotionRoot`). CSS press `.vibe-press` / `.vibe-toggle` (a spring sampled into
  `linear()`, ease-out fallback on older Safari).
- Fraunces with SOFT on every title; the coral accent word stays upright; DM Sans for text; the logo is
  its own font file; Mono only on the landing page.
- School cards hover in school colours.

## Still open for Franky (asked, not blocking)
1. Which vision is current: the "Vibe Growth Brief" Claude Doc (clips, recruiter marketplace, "Otto is not
   live", orange-on-maroon) or the repo. Recommendation: the repo; the brief looks written without it.
   **The vision rewrite waits for this answer.**
2. The launch date: roadmap v14 says Oct 26; `vibe-marketing/CLAUDE.md` says Oct 31 with launch night Oct 29.
3. Delete the empty "Untitled" Claude Doc (`RuwML2Wak7RDeDGfTvjXQs`)? Recommendation: yes.
4. The "Requests" row style in Messages, and optionally all club rows at 66px.

## Owed by Franky (real phone only)
Check-in with the camera, Tonight, the fonts, the motion feel, Bloomington, deleting a message on the
phone, a like inside a post then back to the feed. Send the outreach emails (tell FSL before the Club &
Greek Night pitch).

## Not verified
Real reposts or comments (the local database has none); deleted messages on the live site (checked
locally: the other person's desktop DM or group shows the note in about 2 s, a club room in about 20 s,
a phone DM or group only when reopened); the cross-tab calendar case; Vercel past Imperva on iuhoosiers.com; what
production Bloomington shows.
