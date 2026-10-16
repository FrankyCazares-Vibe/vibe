# Session 78, part 2 (Oct 15-16, 2026): rate limits and upload caps (waves 1-3), Follow everywhere, the club-relationship brainstorm

Read this first in session 79, then `2026-10-14-session-78-usage-stats-feed-delete.md`
for the first half of this session.

## START HERE — session 79

1. **The club brainstorm is open** (below). Franky asked to think it through
   together before building; get his three answers first.
2. **Owed by Franky:** two uploads on his phone (a chat photo, and a video or
   photo post) to prove Wave 1's file-type lock end to end. Not done as of
   Oct 16. If one fails: revert the upload part of `0b9bc7e`.
3. **Owed by Franky (1 minute):** Cloudflare dashboard → R2 → `vibe-clips` →
   Settings: Public Development URL should be Disabled, Custom Domains empty;
   note any Lifecycle rules. The connector can't read these.
4. **Wave 4 (agreed: after launch, except its sweep in count-only mode before
   launch):** the orphan-media sweep, then closing direct database writes.
   Plan and skeptic amendments: the inventory's `plan` and `critique`
   (summarized below; re-run the inventory if the scratchpad is gone).

**Where things stand.** Main is `81a155d`, deployed. 2,798 tests. Privacy
Policy dated October 15, 2026 (page = text, 1,175 sentences).

## What shipped

| Commit | What | Production database |
|---|---|---|
| `0b9bc7e` Wave 1 | Upload links sign `content-type`; all seven client upload sites send exactly the signed type; media links ask storage for the type from the key's extension (unknown → download). Group-photo uploads need a group you're in; club uploads need a publishable account. Signed-out visitors see a person's 24 newest posts ("Sign in to see all of their posts"). The unused `/api/orgs/[slug]/profile` route is gone. The limiter: "limited" vs "unavailable", time left in Retry-After, `failLocal`, a breaker on transport errors and 1.5 s timeouts, a deny cache, a window guard. **No daily upload budget (Franky).** | none |
| `c06b304` Wave 2 | All ten IP-keyed limits use a scrambled per-purpose daily code (never the address); every limiter count deleted within three days (both daily crons call `rate_limits_purge()`); signed-out caps on the `/profile`, `/orgs`, `/posts` pages and the profile data: per network 300/h and 1,500/day, per IPv6 /48 1,500/h, site-wide 9,000/h, hour and day windows only. Reset emails 3 a day per address. Privacy Policy 3d, 11 and the delete-account page say so. | `20261015120000` (purge, applied before the deploy and run once), `20261015130000` (raw-IP rows dropped after it). Checked: 0 address-shaped keys, 0 counts older than a day, anon/authenticated refused. |
| `d7fe8b2` Wave 3 | Named budgets (`src/lib/limits/budgets.ts`) on the 46 signed-in actions that had none (chat settings, reactions, group edits, reposts, block, mute, named mark-read, reminders, personal events, unfollow, leave a club, deletes, club officer actions at 300/10 min). Typing and read marks stay unlimited (conditional writes). Views go through `record_*_view_as` with the verified account, capped at 5,000 posts / 1,000 profiles a day counted from today's rows. The check-in skips its row lock when idle and repeats within 20 s on a server. **Club invites 50/h per officer, 200/day per club (Franky).** | `20261016120000` (before), `20261016130000` (after: the old view functions answer false to everyone; never revoked). |
| `81a155d` | **People: Follow → Following ✓ → Follow back → Connected ✓** everywhere (phone, desktop, static pages); the fake "Pending / connection request" is gone; unfollowing a mutual asks first. `src/lib/people/follow-label.ts`. | none |

Vercel is on **Hobby** with no firewall rules, so our own limiter is the real
control (checked with the CLI, read-only).

## Not verified (say so if asked)

- The upload-type lock on a real upload (needs Franky's phone; local dev
  blanks the storage keys on purpose).
- Wave 3's limits and the new view functions on the live site with a signed-in
  account (covered by tests and the migrations' post-checks only).
- The follow wording on the live site and on a real phone (checked locally at
  375 px as a seed student).

## The club brainstorm (open, Franky's three calls)

Franky, Oct 16: "combine Instagram with flare" — think as a student.
Proposed ladder: Visitor → Follower (posts and events in the feed, optional
bell) → Member (chats, member-only posts and events, a club badge) → Officer.
His open questions and the session's recommendation:
1. **Followers in club chats?** Members-only chats; each club may open one room
   to followers (e.g. an announcements board). "Public rooms" exist already.
2. **Do people have to follow back?** No (done: one-way follow; mutual =
   Connected).
3. **Can clubs follow people back?** Recommended no: membership and invites are
   the club's side; a club "follow" would mean nothing and blur access.
4. **Membership visibility:** per-club choice on your profile; member list for
   members only; counts public from 5 up.
5. **Flair:** club badges you pick, officer titles, member-since, event stamps.
6. His four gaps, all wanted: Leave club on phone; Mute a club's posts (members
   stay in chats); a "Clubs" section (Member of = your choice, Following =
   only you); request to join without following first.

## Wave 4 notes (from the skeptic, keep)

- Never revoke EXECUTE; refuse inside. Never sweep `clips/<uid>/` when the
  user row is gone, or `orgs/<id>/` when the club is gone (moderation
  evidence). Reference list covers posts of every status and
  `messages.content`. Feed photos live in the `profiles` bucket (not swept):
  scope the policy line. Run count-only first.
- Closing direct writes: list every RLS clause the routes must re-check
  (officer-only rooms, blocks, consent), or use a per-user rate trigger.
- Known gap: any signed-in account can read the directory through the
  database's REST interface (`users_select_authenticated`).

## Things a new session must know

- `src/lib/rate-limit.ts`: `rateLimit(key | null, {limit, windowSec,
  failClosed?, failLocal?, hotKey?})`; per-network keys only through
  `clientNetworkCode(req, purpose)`; windows must divide a day.
- New budgets go in `src/lib/limits/budgets.ts`, never inline.
- Heartbeat, typing, read marks and views never get a per-account limiter key
  (Privacy Policy 3d).
- Production migrations: Franky's explicit OK each time; apply with the
  connector (body without begin/commit), rename the schema_migrations row.
