# Otto Wave 2A: the desk (ship record)

- Branch `claude/otto-wave-2a` (worktree `.claude/worktrees/otto-wave-1`), from `main` ab81c0c9 (Wave 1 live).
- Commits c4dbc39e (the desk) and 522c9c78 (walk fixes). **SHIPPED Nov 11** on Franky's "Ship Wave 2A": `main` fast-forwarded ab81c0c9 → 4175c5a4, Vercel deploy succeeded.
- Plan: `BUILD-ORDER.md`. Design: the board's D1 (phone desk), D3 (computer desk), D4 (Saw, Stats, settings).

## What's built
- **The Otto tab (phone) and /otto (computer) are Otto's desk.** A warm sky header with Planet and his one
  lowercase line, soft hills at the bottom, still stars; then paper cards: **Ready for you**, **Scheduled**,
  **Done this week**. The computer adds **Otto saw** and **Earlier** (8 to 30 days). The phone's sky folds to a
  short "otto." bar; tabs Desk | Saw | Stats | Settings.
- **Everything comes from data the app already keeps**: join requests (Accept through the existing route, with
  "What will happen": joins as member N, gets a notice, joins the open chats), the club's Up next step and
  setup steps, your post drafts, follow-backs, unread messages, reminders, the club's events and posts,
  check-ins, notifications.
- **Honest:** no AI model yet, so nothing says Otto did, drafted or will send anything. The ask bar is the
  reminder box ("Remind me to…"); reminders read "Reminder · Thu 9:00 AM" and nothing claims to deliver them.
- **One coral button per screen**, on the top Ready item; everything else is quiet.
- **Acting as:** officers pick which club the desk works for, or "You" (their own desk). While acting as a
  club, a quiet "You · N waiting" shows what waits on their own desk, and the sky line says so.
- **Stats:** one honest card, views on your (or the club's) posts in the last 30 days, from the view ledger
  with your own views left out; never who. Your profile-views card shows only on your own desk.
- **Settings:** the board's parts; Otto's look stays; the like-milestone notice is listed and off by default.
- **Off switch:** `OTTO_DESK=off` on Vercel (Production) brings back today's page after a redeploy (checked
  locally on phone and computer). Today's page now lives in `*Legacy.tsx` files.
- Violet and Midnight give the thinking moon a cream rim.

## What you need to approve
- **Ship = merge to `main` and push** (Vercel deploys). No database change. No Privacy Policy change: the
  desk shows data the app already collects (the policy already covers notifications, events, posts, views and
  Otto settings); nothing new is stored.
- Note for the off switch: with `OTTO_DESK=off`, the old page now has like milestones off by default (harmless:
  nothing sends them).

## Checks
- `npm test`: 4,154 pass (Wave 1 ended at 4,097). `npm run typecheck` clean. eslint clean on changed files.
  `npm run build` (Turbopack) passes.
- Adversarial reviews (correctness and privacy; looks and brand) and a repair pass, then a signed-in walk on
  the local database, a fix pass for what the walk found, and an adversarial re-check of each fix.
- Fixed from the reviews and walk: failed reads shown as "all clear" (phone and computer), an officer's own
  items hidden behind their first club, personal and club numbers mixed on Stats, a failed club switch moving
  the saved pick, text showing through the folded bar, an Accept that could promise a refused join (now
  "Review"), hidden clubs linked from check-ins, Stats dates in UTC, tab sizes and keyboard use, copy nits.

## The browser walk (local only)
- Phone 390 and computer 1440 (and 1100), Avery (officer of 8 local clubs) and Blake, Night and Light, reduced
  motion: the desk at rest and folded, each tab, Acting as switching (clubs and You), Accept on a join request
  (local data restored after), a reminder saved from the bar, Stats, Settings, Otto's look, keyboard tabs,
  simulated failures, and `OTTO_DESK=off`. No console errors.

## Not done, or not checked
- A real phone, and the live site signed in (Franky's phone walk after the ship).
- A brand-new account with no clubs (the local one is sent to set up its school email first); its desk was
  checked through the route.
- Low, left: on reload, an officer whose saved pick is "You" sees their first club for a moment before the
  switch; a dated reminder leaves the desk once its time passes (the old page did the same); the app tab
  bar's coral marker over the Otto tab (old app chrome, every page).

## Calls for you
- None blocking. Wave 2B (the corner and side panel restyle) is next once this ships.

## Shipped (Nov 11)
- Franky: "Ship Wave 2A". `main` was still ab81c0c9, so the branch fast-forwarded to 4175c5a4 and was pushed.
- Vercel status for 4175c5a4: success (build `dpl_HCFQzNd6maqoECtN63MvwNpJsqEi` on /api/version).
- Live checks, signed out: the new `/api/me/otto/stats` route answers 401 (a made-up route answers 404), and
  `/html/_otto-planet.css` (with the cream rim) matches `main`. The desk itself needs a signed-in visit.
- Not checked: Franky's phone walk on the live desk (officer and You desks, Acting as, Accept, a reminder).
- Off switch if needed: set `OTTO_DESK=off` on Vercel (Production) and redeploy.
