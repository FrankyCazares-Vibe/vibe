# Session 79 close (Oct 19, 2026): event check-in, the 17-item critique, the doc update

Read this first in session 80. It continues `2026-10-18-session-79-motion-scroll-research.md` (motion,
per-tab scroll, research, side space, fonts, Tonight), which still holds for those parts. The S78 close
(`2026-10-18-session-78-close-and-next-up.md`) still holds for older owed items.

**Where things stand.** Main is `29b6121` plus this doc commit, deployed (Vercel success; live probes
passed). 3,521 tests, type check clean. The Privacy Policy is dated **October 19, 2026** (check-in and the
"Message deleted" note). Two production database changes on Oct 19, each after Franky's explicit yes.
Facts sheet for this whole session: `handoffs/2026-10-19-critique/docs/FACTS.md`.

## Shipped Oct 19 (after Tonight)

| Commit | What |
|---|---|
| `9a0a0d2` | School cards glow in school colours on hover; no orbit that looked like a stuck cursor |
| `6bb6c04` | The lead line reads only "First because it starts soonest." |
| `9117dc6` | **Event check-in** + migration `20261019120000_event_checkins` (production) + policy |
| `7c35593` | Critique wave 1a: Messages rows (48px pictures, every chat in the side list), Otto stats with our icons |
| `a3215a1` | Critique wave 1b: "Reposted by", one hashtag rule everywhere, Bloomington school events on |
| `29b6121` | Critique wave 2: likes in sync, repost line, caption tags, profile fixes, **delete your own message** + migration `20261019150000_message_deleted_note` (production) + policy, calendar colours and links, one "Done" at the door |

## Event check-in (live)

Contract: `handoffs/2026-10-19-checkin-build/CONTRACT.md`. Shared numbers and words:
`src/lib/events/event-checkin.ts`.
- Officers open check-in on the event; the door screen (`/campus/checkin/[id]/door`) shows a big QR and a
  4-digit code that change every 30 seconds. Anyone at the event checks in with either
  (`/campus/checkin/[id]`). Officers can also "Mark as here".
- Window: 1 hour before the start to 1 hour after the end; marking stays open until a day after the end.
- Kept until the club deletes the event; students can remove their own check-in.
- The count shows from 5 up; the event's officers see the real number and the list.
- Tables `event_checkins` (event and person only) and `event_checkin_sessions` (the secret); 10 functions.
  Check file: `scripts/sql/event-checkins-check.sql` (local).
- "Check-in" in code only ever means this. The yearly school-email check
  (`src/lib/auth/school-checkin-job.ts`, cron `/api/cron/school-checkin`) and the usage heartbeat are
  different things.

## The critique (Franky's 17 items, 4 phone + 13 desktop)

Plan, decisions and evidence: `handoffs/2026-10-19-critique/` (`PLAN.md`, `DECISIONS.md`, `batch-B*.md`,
`shots/`). Every batch was built, adversarially reviewed and repaired before it shipped.
- **Phone:** likes and saves now match between the feed card and the open post (one engagement store,
  `src/lib/posts/engagement-store.ts`); the quiet "Maya and 6 others reposted" line and the "Reposted by"
  list (people you follow by name, the rest as a number); tags: 5 per post, 2-32 characters with a
  letter, tappable inside the caption, 5 in the strip; Bloomington school events on for the demo.
- **Desktop:** the profile composer clears the tabs; Saved shows pictures (plain tiles for text posts);
  our repost icon instead of the Apple emoji; Messages rows even with 48px pictures and every chat listed
  while a DM is open; Otto stats with our icons; calendar: solid coral = Going, outline = Interested, a
  thin bar in your colour = your own entries, even day cells, an event opens its club page at that event
  (`/orgs/<handle>?event=<id>`); the door view has one "Done".
- **Answers given, no change:** Saved is only for you (phone and desktop); profile views keep "the last
  day each person viewed you".
- **Calendar and RSVPs:** they mostly synced; the three gaps (the desktop profile calendar never showed
  RSVPs, an RSVP in the small Messages window didn't refresh the calendar, another tab or the phone waited
  for a reload) were worked in B8 and B6. The cross-tab case is not verified.
- **Delete your own message** (DMs, group chats, Lounge, rooms, event chats, Board posts; phone and
  desktop): words, files, cards, reactions, pins and notifications go, a grey "Message deleted" note stays
  ("Post deleted" on the Board, with its replies kept). Only `public.delete_own_message(uuid)` can do it (the old delete policy is gone). Check file:
  `scripts/sql/message-deleted-note-check.sql` (local, 40 cases).
- **Otto revamp:** a design board this week, build after launch.

**The production finding.** Production has no `push_outbox` table (the push migration was never applied;
push waits for Apple). The deleted-note migration's pre-flight refused itself on that, nothing was
written, the file now treats push_outbox as optional (`to_regclass` + `execute`), it was re-rehearsed
locally with and without the table, then applied. When push ships, its migration lands first and the
delete function starts clearing push rows on its own.

## Still open for Franky (asked, not blocking)

1. **Which vision is current**: the "Vibe Growth Brief" Claude Doc or the repo. Recommendation: the repo
   (the brief mentions clips, a recruiter marketplace, "Otto is not live" and orange-on-maroon). The vision
   rewrite (journal vision, `vibe-marketing/research/principles-and-positioning.md`, `timeline.md`, the
   Build Overview artifact) waits for this.
2. **The launch date**: roadmap v14 says Oct 26; `vibe-marketing/CLAUDE.md` says Oct 31 with launch night
   Oct 29. Recommendation: pick one and we fix the other the same day.
3. Delete the empty "Untitled" Claude Doc (`RuwML2Wak7RDeDGfTvjXQs`)? Recommendation: yes.
4. The "Requests" row style in Messages; optionally all club rows at 66px.
5. Does a school's pin hold #1 while another school event is live? (Built: the pin holds.)

## Owed by Franky (a real phone)

Check in with the camera at a test event; Tonight on Feed and Events; the soft titles; the motion feel;
pick Bloomington under Campuses (if iuhoosiers.com's Imperva refuses Vercel, it loses only its games; Student Life and Featured still show);
delete a message in a DM and a club; like inside a post, then back to the feed. Send the outreach emails
in `vibe-marketing/outreach/2026-10-19-jaguars-ok/` and `.../2026-10-19-iub-athletics-ok/` (send only one
Bloomington draft; tell FSL before the Club & Greek Night pitch).

## Launch morning

`TRENDING_MIN_AUTHORS` 1 → 2 (`src/lib/trending/count-tags.ts` and its test; noted in
`handoffs/2026-10-12-launch-checklist-audit.md`).

## Known leftovers (small)

- Phone DM/group: the other person's open chat shows a deleted message until it is reopened (no poll;
  checked locally, desktop shows the note in about 2 s, a club room in about 20 s). Pins and reactions on
  it are refused.
- DM and group unread counts, the Otto unread count and the app badge still count a deleted last message.
- The database still accepts a reply under a deleted Board post (the app hides the field).
- `LikeBurst` callers in `campus-home.tsx` and `PostViewerMobile.tsx` pass only `liked`, so a refused
  unlike re-pops the heart.
- Symbols DM Sans lacks (⌄ ⋯ ✓ ↗ ▶ ❤ ↻) still come from a system font; Safari not yet checked for fonts.
- Not verified: real reposts and comments (none in the local seed), the cross-tab calendar case, what
  production Bloomington shows.

## Next (Franky's order)

1. His phone walk (above), then the open calls.
2. The pipeline tracker when Franky gives the detail; security wave 4; the feed speed second half.
3. The Otto design board.

## Docs updated this session (two workflows, every batch fact-checked and repaired)

- **App repo (in git):** `ARCHITECTURE.md`, `README.md`, `scripts/README.md`, `LIVE_SITES/README.md` (the
  school calendars as an outside service), the research doc's "After Oct 19" note, the comment in
  `src/lib/school-events/switch.ts` (roll back past `a3215a1`, not `9117dc6`).
- **This Mac only (gitignored):** the private journal (v9.1, session 79, cards S76 to S79, Next Steps),
  `DOCS/ROADMAP.md` (marked superseded), `DOCS/DESIGN_SYSTEM.md`, `DOCS/LEARNINGS.md`.
- **`vibe-marketing` (its own repo, committed locally, not pushed):** `CLAUDE.md`, `README.md`,
  `brand/brand-guide.md` + its `brand-kit` copy, `brand/tokens.css`, `brand-kit/styles.css`,
  `research/whats-changed-2026-10-19.md` (new), pointers in the Oct 5 note, `product-story.md` and
  `feature-inventory.md`, gate G11, the claims sheet (re-checked Oct 19), the campaign README.
- **Waits:** the vision parts (open call 1); the "Vibe Brand" Claude Design re-sync (Franky's OK; the kit's
  italic font file has no SOFT axis, so Design still draws the hard italic until a soft file replaces it).

**Marketing calls the doc pass raised (Franky's):** does a school colour (the crimson header in the stills)
count as a mark under G11 (recommendation: treat it as one until IU Licensing answers); film the Events tab
before G11 clears if cropped to club cards? (recommendation: ask first, as the docs say); the "Not safe to
post" table in `gates-and-decisions.md` still describes the Oct 5 stills and needs a pass; two stills
(`club-lounge.png`, `desktop/club-chat.png`) still show "Maybe"; the SAMPLE label (G7) is still owed.
