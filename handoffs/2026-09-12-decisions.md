# Franky's decisions, 2026-09-12 — metrics, money, campuses

Answered directly by Franky after the four design passes (`handoffs/2026-09-12-design-*.md`). **Settled: do not re-ask.**

## 1. The paid line: sell only what the database already protects

Vibe+ sells **who viewed your profile, who viewed each post, who saved it**. Likes, comments and the follow graph stay free.

**Why it was even a question:** `post_likes`, `post_comments`, `post_reposts`, `connections` and `comment_likes` all carry `SELECT TO authenticated USING (true)`, `authenticated` holds SELECT on their identity columns, and the app ships a browser Supabase client that queries tables directly (`ProfileHandleSwitch.tsx:77-82`). Any signed-in student can already list every liker and walk the whole follow graph from devtools. Selling that would be a paywall over data the database hands out for free.

Only three signals are privacy-real, because RLS enforces them:

| Signal | Table | Who can read it |
|---|---|---|
| Post views | `post_views` | **Nobody** — RLS on, 0 SELECT policies, service role only |
| Profile views | `profile_views` | Owner only |
| Saves | `bookmarks` | Owner of the row only |

**Deferred, not rejected:** locking down the world-readable policies on likes/comments/follows is its own hardening decision. It would break anything reading those tables directly, so it needs its own pass.

## 2. Price: $3.99/month or $24.99/year, Stripe on the web

Exactly Snapchat+'s price, which is the founder's named reference and the number students already accept. Stripe nets ~92% of a $3.99 charge; Apple's Small Business Program takes 15%.

**Apple comes later.** No native wrapper exists in the repo (no capacitor, expo or react-native in `package.json`), so iOS is not close. Web-first and adding in-app purchase later is a normal path Apple allows (Guideline 3.1.3(b)), provided the same thing is purchasable in the app when it ships.

**One subscription, no one-off unlocks in v1**, and one tier bundling paid metrics with the customization catalog — two products would mean two paywalls, two lapse states and two upgrade sheets for one developer.

## 3. Visiting another campus: read everything, RSVP and request to join

You browse any campus's feed, orgs, events and map. At a campus that isn't your home you may **RSVP to events** and **request to join orgs** — both real actions — but you may **not post to its feed or appear on its map**.

Everything else follows the multi-campus design's recommendations: campus lives in a real `campuses` table; you switch via a URL segment (`/campus/<slug>`), with bare `/campus` meaning home; a `.edu` domain sets your campus automatically only when it maps to exactly one campus; home campus changes at most once per 30 days, and old posts stay on the campus they were posted to; following someone at another campus puts their posts in a separate Following lane while the Campus lane stays local; the 7 campus-less accounts get prompted, not guessed; a new campus opens behind an admin switch and shows an honest "be the first" page.

## 4. Ship the honest lock now, before payments exist

`/api/me/profile-views` currently returns every viewer's name and avatar to everyone and stamps `premium: false`, while `OttoMetrics.tsx` captions it "premium soon". The paid feature is free and advertised as not-yet-paid — the least honest configuration available.

Free accounts now get **counts only** ("7 people viewed your profile this week"), names locked behind an honest upgrade page that states the price and that it is not purchasable yet. **Zero names free**, not three: one rule, trivially enforceable server-side, and it matches "counts are public, identities are private" with no asterisk.

## Fixed regardless of any decision (honesty bugs the design pass found)

1. **Post views are inflated.** `record_post_view` never got the self-view guard that `record_profile_view` has. 71 of 149 rows are authors viewing their own posts (54 of them Franky's): his "74 views" is really **20**. Fix the read and the write; leave the stored counter alone for now.
2. **`users.banner_gradient` is free-text CSS that students can write directly** through PostgREST, bypassing the route validator, rendered raw as a CSS background at five sites including other students' screens, with no CSP. That is an IP beacon built out of a profile setting. Becomes a validated preset key.
3. **"N mutual" counts people you both follow**, not strict mutual connections (2 versus 1 against james). Keep the math, fix the words.
4. **Phones record no profile views at all** — the recorder only fires on the desktop static profile, so the entire 25-row ledger is desktop traffic.
