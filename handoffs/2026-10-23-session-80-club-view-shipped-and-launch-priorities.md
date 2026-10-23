# Session 80 close: the club's view shipped, and the launch priorities (Oct 20 to 23, 2026)

**S81 starts here.** Previous close: `2026-10-19-session-79-close-checkin-and-critique.md`.

## Start here (next session)
1. Work in `~/vibe` and run `git pull` first. On Oct 23 that checkout was 4 commits behind `origin/main`. Then
   `git branch -r | grep claude/`: every `claude/*` branch was on main on Oct 23.
2. Read this file, then the records it points to. The club's view has its own folder:
   `handoffs/2026-10-20-club-view/` (DECISIONS, BUILD-ORDER) and one handoff per wave (below).
3. **Waiting from Franky:** his notes from the **Eli Serrano** meeting. Save them as
   `handoffs/2026-10-2X-eli-serrano-meeting-notes.md` (like the Parker notes) and fold their asks into the
   priorities below. Don't guess their content.
4. **Event photos** were being built when this was written (see "In flight").

## What shipped in session 80 (all live on connectvibe.app)
Main went from `e91c92b` to `50a49ea` (and later) in four days. Each production database change had Franky's
yes at the time. Every Privacy Policy change went out the same day.

| What people see | Main commit(s) | Record |
|---|---|---|
| **Club roles:** Owner and Officers (mods gone; only the owner makes officers) | `64004a1` | `2026-10-20-club-view-wave-1.md` |
| **Club links:** Admin › Clubs makes a one-use **setup link** + QR for a club's president; each checked club has a **members' link** (school email, 3 weeks, 150 sign-ups); both work while sign-up is closed; the **setup list** `/orgs/<h>/setup` | `64004a1` | same |
| **Sign-up pre-registration fix:** a stranger can no longer pre-register a student's address and keep a password; the first confirmation wipes it, the page puts the student's own password back; Supabase's own emails became link-free notices; self-service email change refused | `64004a1` | `2026-10-21-signup-preregistration-fix.md` |
| **Wave 2:** the Instagram-style club page; hold the Profile tab (or tap your name) to switch to a club you run; Club tools on the phone; "when it meets" | `4948ce6` | `2026-10-21-club-view-wave-2.md` |
| **"Your clubs"** in the left menu's profile card: one row that opens a floating list of the clubs you run and the clubs you're in (`GET /api/me/clubs-in`) | `b7a9dc0`, `b7c783d` | wave 2 handoff, end |
| **Club pages inside the app frame** on a computer (left menu, Campus's own top bar) | `076e869`, `66b3cce`, `2651703` | wave 2 handoff, end |
| **Club tools "Arc"** (a planet on the right edge; tools open in place), **Follow vs Membership**, the **14-day wait** after a declined request, cancel a request, **invite your followers**, officers told about new join requests (in Otto; no push on production yet) | `44b0923`, `3ca8db4` | `2026-10-22-club-tools-arc/` (PLAN, PLAN-2) |
| **Members only events** (lock chip; only members see, RSVP and check in; left out of the Board, follower views, the Events list, `.ics`, search and Otto) and **leaving a club drops those RSVPs** after a warning | `3ca8db4`, `e58942e` | PLAN-2, PLAN-3 |
| **The Look:** Edit page opens on photo, cover and **10 backgrounds** (5 new: Rose, Cardinal, Lantern, Canal, Onyx) | `f04fa77`, `97b5fd5` | PLAN-4, `BACKDROP-MIGRATION.md` |
| **Phone club page tidy:** the cover's corner is empty; "+ Post · Club tools · share" row; Club tools open as a tray under the row with "Needs you" | `bba504b`, `479fd2d` | PLAN-5, PLAN-6 |
| **Wave 3:** officers' **Up next** card with five steps and one next-thing button; the **share sheet**; each club's own **link picture**; the printable **table card** with QR (`/orgs/<h>/table-card`); **event icons** (12) | `02e0fed`, `50a49ea` | `2026-10-23-club-view-wave-3/` |
| Small: deleted-message leftovers; coral hearts on desktop | `2555428`, `95691e3` | commits |

**Production database changes (11, in order):** `20261021100000_club_officers`, `20261021110000_club_links`,
`20261021120000_club_links_gate`, `20261022100000_password_needed_column`,
`20261022110000_first_confirm_drops_password`, `20261022120000_no_self_service_email_change`,
`20261023100000_club_meeting_time`, `20261024100000_org_join_request_notification`,
`20261025100000_event_visibility`, `20261026100000_club_backdrop_presets`, `20261027100000_event_icons`.
File versions are numbers, not ship dates (all went on Oct 21 to 23). Fingerprints were read before and after each.

**Privacy Policy:** effective **October 23, 2026** (re-dated Oct 21, Oct 21, Oct 22, Oct 23). Checker PASS.

## In flight
- **Event photos** (Franky, Oct 23: "upload photos for the event, like event profile photos"): being built in
  the club page session (local_55efdd06). It needs one database change (his yes in that session) and a Privacy
  Policy line the same day. Design points sent to it: a Members only event's picture must not be reachable by
  address (`src/app/api/orgs/[slug]/asset/[kind]/route.ts` checks only "club hidden"); club events only; where it
  shows; what happens to the picture when an event or club is deleted (the S78 rule keeps pictures under a
  deleted club as moderation evidence); fix the stale "Only one thing is deleted on a schedule" sentence while in
  the policy. **Ship by Tue Oct 27 or it moves back to week 1.** STATUS: _filled in below when it lands._

## The CS club (new, Oct 23)
Franky talked with the **president of the computer science club**, who thought what we built was amazing.
Franky plans to onboard that club first and to work with its president to take Vibe "to the next level".
- **Onboarding:** a setup link from Admin › Clubs, then the club's members' link. **Gate:** no club link goes out
  before Franky's dashboard steps and live sign-up test (P0 below).
- **Call for Franky: how involved the president gets.** Recommendation: a club owner, one of Parker's two
  club-owner user tests, and a regular feedback partner, with **no code, data or admin access** for now. The repo
  is private; Privacy Policy section 1 names the three founders as the Vibe team (anyone else with admin,
  moderation or data access needs the policy changed first); no equity language anywhere; if they ever write
  code, James's lawyer file needs a contributor (IP) agreement.
- Marketing knock-on: `vibe-marketing/campaigns/2026-10-launch/calendar.md` says "no club signed"; update it and
  the claims sheet once the club is on.

## Priorities, in order
Dates: **Wed Oct 28** review day (no building), freeze that night. **Thu Oct 29** launch night, no deploys.
**Fri Oct 30** IU Innovates Demo Day. **Sat Oct 31** public launch.

**P0. Franky, before any club link goes out (the CS club's included). About 25 minutes.**
1. The Supabase dashboard steps (`2026-10-21-signup-preregistration-fix.md`, "Dashboard"): read back Confirm
   signup (code only, no link); read production's current Change-email text, then paste the three notices from
   `supabase/templates/` (subjects in `supabase/config.toml`); check Redirect URLs and Site URL for wildcards;
   read, change nothing: Confirm email ON, Secure email change ON, the hook ON. **Keep "Password changed" and
   "Email changed" emails OFF through launch.**
2. His live sign-up test with James's or Rylan's school address (their OK): sign up, sign out, sign in. Time the
   code email, check **Inbox AND Junk**. If codes land in Junk, that comes before everything else.
3. Then: onboard the CS club (setup link) and give SAE its members' link.

**P1. By Tue Oct 27.**
- *Franky:* raise the 40-an-hour email cap **and** upgrade Resend (free plan is 100 emails a day for the whole
  app); open the "Vibe Test Club" setup link (it ends Oct 28; the link is in the wave 1 chat, Admin › Clubs can
  cancel it), then hide the club; the officer checks on a real phone (hold the Profile tab, switch, Club tools
  tray, approve a real request, set a meeting time via Club tools › Club settings › Edit page, the phone's own
  share sheet, scan the table QR, Change photo/cover, an iPhone and an Android hold); the two upload checks from
  S78 (file-type lock, `0b9bc7e`; photos build on it); send the school outreach emails (one Bloomington draft;
  tell FSL first); two-step sign-in and Sentry's "Prevent Storing of IP Addresses"; tell the session on Oct 27
  to run the sentinels on Fable 5.1 (he switches models).
- *A session:* finish event photos; fix `npm test` skipping `src/app/orgs/[handle]/` tests (brackets read as a
  glob in `package.json`); point desktop Messages' "Manage club" at Club tools (`ClubPanel.tsx:418`,
  `ClubPane.tsx:606`); the counting-only upload sweep (rate limits wave 4, deletes nothing); the **pipeline
  tracker** (a small shared page with its own database, the CS club as the first row) once Eli's notes arrive.
- *Into the Oct 28 freeze build:* `TRENDING_MIN_AUTHORS` 1 → 2 (`src/lib/trending/count-tags.ts:30` and its
  test; launch night has no deploys); reword the two "new Terms in October" promises
  (`src/app/legal/terms/page.tsx:27`, Privacy Policy section 13) since Terms v3 can't land before launch.

**P2. Wed Oct 28, review day (no building).** Full adversarial review of `e91c92b..HEAD` (49+ commits, ~317
files; wave 3 has no review findings on record), the feature sentinel on the club paths (start it Tue), a
security pass on the sign-up gate, decide the directory-read gap (`users_select_authenticated`), Franky's phone
walk with a **fresh** setup link (set up a club, join by the members' link, switch on the Profile tab, start
check-in), repairs, then **freeze**. Keep the Mac awake for the workflows.

**P3. Launch.** Oct 29: no deploys. Oct 31 morning (recommended): turn `signup_open` on, only after P0; it's a
production setting, so his yes at the time.

**P4. Week 1 (Nov 2 to 8) and after.** Event pages (a link anyone can open and RSVP from), story cards, notices
(new events to members and followers, Board posts to members, one a day per club), the hand-over (moved from
wave 4), event pictures if they slipped. Week 2: members' link renewal (links made now end ~Nov 13 to 17),
Insights, one picture on Board posts. Week 3: start a club on your own. After launch: the Otto page redesign
(draw the board in launch week), Terms v3, security and rate-limit wave 4, feed speed part 2, phone push once
Apple accepts.

## Open calls (each with a recommendation)
| Call | Recommendation |
|---|---|
| How involved the CS club president gets | Club owner + user test + feedback partner; no code, data or admin access |
| `signup_open` on Oct 29 or Oct 31 | Sat Oct 31 morning; launch-night guests come by club links and codes |
| Fresh members' link after the 3 weeks end | Yes, new 3 weeks and 150; decide after launch week |
| The "unchecked" setup-link toggle | Leave it on for the first 20 |
| Terms tick at confirmation: LEAN or STRICT | LEAN (as built); add to James's lawyer file |
| Purge accounts unconfirmed after 24 hours | Not now |
| School colour as a mark (marketing G11) | Treat it as one until IU Licensing answers |
| Block replies under a deleted Board post in the database too | Yes, after launch |
| Board card of a Members only event later cancelled shows "Event cancelled" to followers | Hide it from followers, after launch |
| Which vision is current (Growth Brief or the repo) | The repo |
| Delete the empty "Untitled" Claude Doc | Yes |

## Stale docs
**Fixed in this close:** `handoffs/2026-10-20-club-view/` BUILD-ORDER, DECISIONS and README (a dated status block
at the top of each; they described the waves as unbuilt); `2026-10-22-club-tools-arc/SETTINGS-MAP.md` (items
1-5 and 9 done; 6, 7, 10 open); `ARCHITECTURE.md` (clubs, club links, events, the first-confirmation fix);
`README.md` (the email templates line); memory's handoff pointer (S81 starts here). The private journal got a
Session 80 entry (v9.2). **Not applied (they live in the main `~/vibe` checkout, which this worktree session is
guarded from writing):** `DOCS/VIBE_HANDOFF.md` and `DOCS/ROADMAP.md` (ready copies were made; a session started
in `~/vibe` can redo them from this file in minutes), and the journal's "next steps" panel, which still describes
S79 (main `29b6121`, the launch date as an open call, trending on launch morning). **Also not fixed here:** `vibe-marketing` has uncommitted Oct 20
edits (`CLAUDE.md`, `research/principles-and-positioning.md`: the new positioning and dates); its `CLAUDE.md`
says Demo Day happens "if Vibe is the Indy startup picked", so confirm Oct 30 with Franky. `~/vibe` has old
untracked files (`handoffs/2026-10-18-side-space/CRAFT.md`, `FORMAT.md`, `project/support.js`, `.agents/`).

## Rules that still hold
Each production database change needs Franky's yes in the session applying it, at the time (a relayed yes
doesn't count). Production reads through AI tools return counts and fingerprints only. The Privacy Policy changes
the same day as what it describes. No staged rollouts. Never REVOKE EXECUTE from API roles. New outside hosts go
in the CSP (`src/proxy.ts`). New browser calls to the sign-in service pass `captchaToken`. Never store a visitor's
IP. Never confirm a student by hand, never set a password with SQL, never turn "Confirm email" off while accounts
are waiting. Motion: springs, transform and opacity only (`src/lib/motion/springs.ts`).
