# Session 81: task order, Vibe HQ, the club pipeline, onboarding review (Oct 23, 2026)

**S82 starts here.** Previous close: `2026-10-23-session-80-club-view-shipped-and-launch-priorities.md` (its
priorities still hold; this file reorders them with Eli's notes folded in).

**Update Sat Oct 24:** Franky is going solo: nothing is assigned to James or Rylan any more, in this file, the S80
close (its "James's lawyer file" is now Franky's lawyer list) or anywhere else. Deploy A, first light (Deploy B) and
event covers all shipped Oct 24 (`handoffs/2026-10-23-onboarding-review/deploy-a-shipped.md`, `first-light-shipped.md`).
Still Franky's calls, unchanged: James's and Rylan's admin flags (3 platform admins on production), the Privacy
Policy's "three cofounders" lines (they change the same day as any access change), and the INBiz record (a lawyer
question).

## Start here (next session)
1. `git pull` in `~/vibe`, then `git branch -r | grep claude/`.
2. Event covers: ask the club page session (local_55efdd06) or Franky whether migration `20261028100000` got his
   yes and shipped before touching event files.
3. Read "Task order" below; the onboarding plan is in `handoffs/2026-10-23-onboarding-review/`.

## What S81 did
- **Vercel "limits":** nothing is blocked. The account is on Hobby with no block on it (checked through the API:
  no soft block, no feature blocks). October use is small: about 40,000 requests and 31,000 function runs a week
  (the Hobby month allows 1,000,000 of each), under 0.5 GB of data out, 71 builds and about 100 build minutes last
  week, never more than 29 deploys in a day (the cap is 100). Two real limits: Hobby builds **one at a time**, so a
  push to `main` and to a `claude/*` branch queue behind each other (33 minutes of queueing last week); and Hobby is
  **for non-commercial use only**, which an LLC launching publicly is not. Franky didn't say where he saw the
  message; Vercel's emails go to his IU address, which this session can't read.
- **"Claude is blocked" in two sessions:** neither is broken. Both finished their turn and are waiting on Franky:
  - club page session (local_55efdd06): his yes for migration `20261028100000` (event covers: one new column plus a
    rule that a cover must sit in its own club's folder; additive, tried locally, 4,015 tests pass). With the yes it
    runs read-only checks on production, applies it, then ships the code and the Privacy Policy line the same day.
  - club view wave 1 session (local_83f2da9b): "put the journal back as it was, or keep its Session 80 entry and
    leave `DOCS/` and the journal's next-steps panel for the next session?" Recommendation: keep the entry; a
    session in `~/vibe` does `DOCS/` and the panel.
- **Eli Serrano's notes** filed: `handoffs/2026-10-23-eli-serrano-meeting-notes.md` (with what they change).
- **Vibe HQ** (dashboard): https://claude.ai/artifact/3Qow3D8VFKHHSDgqK8EgvL. Launch scorecard (North Star, active,
  confirmed, clubs live, events, RSVPs, check-ins, Board posts, waiting requests), the sign-up funnel, 12 weeks of
  activity, founder work, Eli's 30-day test, and Money (burn now / launch-ready / one-time, cost by kind, the
  decisions, every cost). Data are attached files (counts only), refreshed by Claude every Monday; sources live in
  `~/vibe/vibe-hq/data/` (kept out of git through `.git/info/exclude`). Goals are suggestions for Franky to change.
- **Club Pipeline** (shared page with its own database): https://claude.ai/artifact/W9NNdByF55Cjmypa8RY52B. Clubs by
  stage (CS club: Met; SAE: On Vibe), Mom Test interviews (Eli's questions are the form), user tests (Parker's 2 + 2).
  Page source `~/vibe/vibe-hq/club-pipeline.html`. (Oct 24: the "who's on it", "asked by" and "run by" fields came
  out when Franky went solo.)
- **Finance sheet:** `DOCS/FINANCES.csv` replaced with the rebuilt ledger (old one kept as
  `DOCS/FINANCES-old-2026-09.csv`). Found: Supabase is on the **Free** plan (checked Oct 23), not Pro as the old sheet
  said, so there are **no daily backups**. The amounts and the research behind them stay local (`DOCS/` is private:
  `DOCS/FINANCE-NOTES-2026-10-23.md`), and Vibe HQ › Money shows them.
- **Onboarding and campus tour review** (a 10-agent workflow: three code maps, three designs, a director, an
  attack): `handoffs/2026-10-23-onboarding-review/PLAN.md`. Otto first, then the feed, then Tonight (right) and Your
  clubs (left) grow in as Otto names them, ending on "Show me clubs"; the profile step folds to name and handle;
  Skip can't skip the campus. Nine questions for Franky. Nothing built.
- **Baseline numbers (Oct 23, counts only):** 17 accounts, 16 confirmed, 12 school-verified, 11 finished sign-up,
  1 followed a club; 0 active in the last 7 days; 3 visible clubs, none with setup done; 0 events, RSVPs or check-ins.

## Task order (Fri Oct 23 to Dec 10)
Dates: **Wed Oct 28** review day and freeze that night; **Thu Oct 29** launch night, no deploys; **Fri Oct 30** Demo
Day; **Sat Oct 31** public launch.

**Now (tonight and this weekend), Franky**
1. Answer the two waiting sessions (above): the event-covers yes or no; the journal question.
2. P0, about 25 minutes, before any club link goes out: the Supabase dashboard steps, then the live sign-up test with
   a school address that has no Vibe account yet (a friend's, with their OK; his own IU address already has one).
   Check Inbox AND Junk. Codes in Junk come before everything else.
3. Then the CS club's setup link and SAE's members' link. Log both in the Club Pipeline.
4. Money calls that touch launch: Supabase Pro (backups), Vercel Pro (commercial use), Resend paid plan + the
   40-an-hour cap. All three are in Vibe HQ › Money with a recommendation.
5. Start the interviews (Parker's 10+ at a general campus event, asked Eli's way) and log them in the pipeline.

**By Tue Oct 27**
- Franky: the rest of P1 from the S80 close (Vibe Test Club link then hide it, the officer phone checks, the two upload
  checks, school outreach emails, two-step sign-in and Sentry's IP setting, the sentinels on Fable on Oct 27).
- A session: event covers ship (if yes); point desktop Messages' "Manage club" at Club tools; the counting-only upload
  sweep; **the before-freeze onboarding and tour changes** once Franky answers its questions
  (`handoffs/2026-10-23-onboarding-review/PLAN.md`: Deploy A by Sat Oct 24 night, Deploy B Mon Oct 26 with an off
  switch or it moves to week 1; a new session in its own worktree, since the club page session is full).
- Into the freeze build: `TRENDING_MIN_AUTHORS` 1 → 2; reword the two "new Terms in October" promises.

**Wed Oct 28:** review day as planned (full adversarial review of `e91c92b..HEAD`, feature sentinel on the club
paths, sign-up gate security pass, Franky's phone walk with a fresh setup link, repairs), then freeze.

**Thu Oct 29 to Sat Oct 31:** launch night (club links and codes), Demo Day, `signup_open` on Saturday morning with
his yes. The 30-day test's group starts confirming on Thursday.

**Week 1 (Nov 2 to 8):** first Monday snapshot (Nov 2); the week-1 onboarding items; event pages, story cards,
notices, the hand-over; the retention tally (a counts-only database change, his yes, live before Nov 26); first two
user tests (the CS club president as a club owner); read "The Cold Start Problem"; a short Luma / Eventbrite /
Partiful study (how they make money, where they started).

**Weeks 2 to 4:** members' link renewal, Insights, Board pictures; Monday snapshots; Nov 30 first retention look;
**Thu Dec 10** the full 30-day read (Query B in `handoffs/2026-10-23-vibe-hq/KPI-QUERIES.md`).

## Open calls
| Call | Recommendation |
|---|---|
| Supabase Pro before launch | Yes, by Oct 28 (backups) |
| Vercel Pro before launch | Yes, by Oct 30 (commercial use, firewall, spend alerts) |
| The suggested goals in Vibe HQ | Franky edits them; they are starting points |
| James's and Rylan's admin flags (solo since Oct 24) | DECIDED Oct 24: leave them on for now; the Privacy Policy stays as it is |
| A Monday routine that refreshes Vibe HQ | Yes (a scheduled Claude task, counts only) |
