# Session 64 — The profile lock, Vibe+ on Stripe, a redaction leak closed, and moderation begun

**Dates:** 2026-09-22 · **Continues:** session 63 (test stack + privacy lock) · **Started at:** `8786180`

Read this first. It carries session 63's open items forward and records what replaced them.

---

## §1 — What happened, in plain English (the version to tell Rylan and James)

1. **The practice copy is tidy and current.** Its Supabase tools went from version 2.98 to 2.117, the whole
   database rebuilds from scratch in one command, and 1.3 GB of stale cache is gone. Its database still runs
   the same Postgres version as the real site, which is what makes it useful for catching real bugs.
2. **The profile lock went live.** The browser can no longer write your skills, interests, work history,
   pinned post or "here for" answer directly — only Vibe's server can, after checking who you are.
3. **Five leftover bugs from session 63 are fixed and live**: hidden clubs' posts stayed hidden in comments,
   reposts, saves and view counts; a refused like now says why instead of quietly undoing itself; one sender
   can ping at most 60 people an hour with @mentions; an out-of-date copy of your profile can no longer wipe
   your photo; and hidden clubs' posts are now hidden by the database itself, not just by the app.
4. **Vibe+ payments are built and tested against Stripe's sandbox.** Subscribing sends a student to Stripe's
   own page (Vibe never sees a card), Stripe tells Vibe what happened, and Vibe+ turns on and off by itself
   on renewals, failed cards and cancellations. **Selling is switched OFF on the live site** until the LLC has
   its EIN and bank account and the Terms with subscription wording are published.
5. **A privacy leak in resume redactions is closed.** The black bars students draw were tied to a document's
   position in their list, so removing an earlier file left a later file's bars pointing at nothing and other
   students were served the original. Bars now belong to the file itself. Proven twice by reading the pixel
   under the bar, before and after.
6. **Profile addresses are clean**: `/profile` and `/profile/<handle>` instead of `/html/profile.html?app=1`.
   Old shared links redirect and now show a real preview card in iMessage or Discord.
7. **Moderation is under construction** — the report queue, suspensions and bans, the word filter and the
   safety pages. Franky's decisions are recorded in §6.

---

## §2 — What shipped (deployed; every Vercel build green)

| Commit | What |
|---|---|
| `8e4e81a` | Local config renamed for the newer Supabase CLI. |
| `b7fe82d` | Hidden clubs' posts stay hidden in comments, reposts, saves and views; the copied check replaced by the shared one. |
| `c898865` | Migration `20260922140000_hidden_club_content_rls` — hidden clubs at the database layer (applied to production, §3). |
| `500e38d` | A refused like says why; state and count restored; one request per double tap; four surfaces. |
| `da89b24` | A per-sender mention budget (60 people an hour) inside `insertMentionNotifications`. |
| `73b9bad` | A stale profile copy can't wipe a photo, cover or resume; both editors send only what changed; "Here for" renders on the first load. |
| `1f53b02` | Journal: session 63. |
| `4d9d66c` | Stripe: `billing_customers` + `billing_events` migration, `scripts/stripe-setup.mjs`, env docs. |
| `6036007` | Stripe: the billing library (subscription → entitlement, webhook routing, customer mapping), 26 tests. |
| `94c036a` | Stripe: checkout, portal and webhook routes; deleting an account stops charges first. |
| `16b0925` | `/plus`: subscribe, manage, complimentary, past-due and ended states; sales-off copy for production. |
| `bcd145b` | Redaction bars bound to their file; fail closed; "View as others see it". |
| `e2fb5ce` | Clean profile addresses; old links redirect with their settings; notification deep links survive the gates. |

## §3 — Production database changes (each with Franky's explicit yes, 2026-09-22)

Applied through the management API with a pre-flight and a post-check; live max version **`20260922140000`**.

| Migration | Verified after |
|---|---|
| `20260922130000_users_profile_detail_server_only` | six columns closed to the browser, 7 snapshot rows untouched, 0 functions deny EXECUTE, no restart, profile loads both ways |
| `20260922140000_hidden_club_content_rls` | posts/comments/reposts/bookmarks/`record_post_view` gated by `org_content_visible`; feed and comment counts identical before and after; 0 functions deny EXECUTE; no restart |

**Written, NOT applied to production:**
- `20260922150000_billing_stripe` (Stripe customer + event tables) — applied to the test copy only; production
  doesn't need it until billing goes live.
- `20260923090000_moderation_foundation` — see §6.

Standing rules still hold: never revoke EXECUTE on a public function; never instant-roll Vercel back past a
migration's code.

## §4 — Vibe+ on Stripe (v1)

- **Sandbox:** "Vibe sandbox" (US, test mode). Product `vibe_plus`; prices by lookup key `vibe_plus_monthly`
  ($3.99) and `vibe_plus_yearly` ($24.99); a Customer Portal configuration with cancel-at-period-end,
  card update, invoices, plan switching and **quantity locked** (Stripe enables quantity changes unless told
  not to — "2× Vibe+" would double a charge). `node scripts/stripe-setup.mjs` is idempotent; `--check` reports drift.
- **Keys:** a TEST secret key lives in `.env.development.local` on Franky's Mac. Production has **no Stripe env
  vars at all**, so `/plus` shows "not on sale yet" and checkout answers 503.
- **How it works:** hosted Checkout (`mode: subscription`) → webhook → `entitlements`. Every event re-fetches the
  subscription from Stripe (out-of-order events can't roll state back) and maps the student through
  `billing_customers`, never through metadata alone. A comp entitlement is never overwritten. The success page
  syncs the same way so Vibe+ appears at once.
- **Deleting an account deletes the Stripe customer first** (which cancels every subscription) and fails closed.
- **Refunds and disputes are recorded, not acted on** — a refund alone doesn't stop next month's charge, so the
  cancel is the real action and the webhook follows it. This reverses the Sept 12 design; Franky can reverse it back.
- **Before going live:** LLC EIN + bank account (James) → activate Stripe → a RESTRICTED live key (`rk_live_`) with
  the permission list in `.env.example` → `BILLING_ENABLED=true` on Vercel production only (never Preview: Preview
  shares the production database) → webhook endpoint at `https://www.connectvibe.app/api/billing/webhook` on API
  version `2026-08-26.dahlia` with the event list in `.env.example` (the apex domain 308-redirects and Stripe does
  not follow redirects) → set retry-exhaustion to **cancel the subscription** in the Dashboard → publish the Terms
  with subscription and auto-renewal wording → Stripe Tax only after a registration exists.
- **Not done:** Franky's own test checkout with card 4242 on the test copy; the Settings delete screen doesn't yet
  warn that deleting cancels Vibe+ with no refund.

## §5 — The redaction leak, and clean addresses

- **Cause:** bars were bound to a document's index. A phone delete of an earlier document, or a desktop tab whose
  list came from the phone, left a later document listed with no bars, and non-owners were served the original.
- **Fix:** every bar carries `docKey` (the document's stored url). The server re-maps bars by identity whenever the
  list changes, and a save whose positions can't be trusted may ADD cover but never remove it. If any bar matches
  no document, non-owners get a 503 for every hosted document on that row rather than an original. Owners get
  "View as others see it" (`?view=public`) and a line saying only they see the original.
- **Watch out:** the dev server served STALE code for two full verification rounds; a check that fails in a way the
  code says is impossible means `touch` the file, re-warm it, and re-run.
- **Production exposure:** 3 accounts have bars, 1 has more than one document, 0 had bars past the end of their list.
  A backfill helper (`stampRedactionDocKeys`) exists but has NOT been run; rows flagged for review need a human.
- **Addresses:** `/profile` and `/profile/<handle>`; `/html/profile.html?handle=x` (without `app=1`) 307s to the clean
  one, carrying `post`, `welcome` and `embedded`; profile.html rewrites its own address after reading its settings,
  and skips that when framed.

## §6 — Moderation (in progress at the time of writing)

Plan and contract: `handoffs/wave-plan-moderation/plan.md`. Research maps (reports, admin, bans, app stores) are in
the session scratchpad's `research_result.json`.

**Franky's decisions (2026-09-22):** suspended students are locked out and see a page with the end date and an appeal
address; permanent bans are keyed on a scrambled copy of the school email so a new account can't escape them;
a removed post shows its author "Removed by Vibe moderators" and is gone for everyone else; all three founders
moderate (all three already hold `is_platform_admin` in production: `frankycazares`, `james`, `cqo`) and every new
report emails them; posting, commenting and messaging will require a verified school email (6 of 20 accounts are
unverified and none has ever posted); scope also covers reporting anything, a word filter, and Community Guidelines
plus Child Safety pages; the contact address is **help@connectvibe.app** (Franky must add the Cloudflare Email
Routing rule); the Terms text and `TERMS_VERSION` are NOT touched until the legal-publish step.

**Store requirements worth remembering:** Apple's written rule says reports get a "timely" response, but its
reviewers enforce 24 hours in rejection letters; Google wants a public child-safety page with a named contact.
Today's Terms say "no guarantee about response time", which works against both.

## §7 — Open for Franky

1. The Cloudflare Email Routing rule for `help@connectvibe.app`.
2. The Stripe test checkout on the test copy (card 4242), and later the live-key steps in §4.
3. His live profile's **Web** field holds `http://localhost:3000/html/profile.html?app=1` — a test address saved into
   the real profile at some point.
4. From session 63, still open: seeding (a second real account, SAE's first tapped follow/invite/club post),
   Rylan's club outreach, James's lawyer + bank chain, the Oct 31 deadline.

## §8 — Known follow-ups (small, not done)

- Save buttons still undo themselves silently, the same bug the like buttons had (campus-home `toggleSave`,
  PostViewerMobile `toggleSave`, `_postViewer.js __vpvToggleSave`).
- Blocked students can still comment on, save or repost the blocker's posts; `save` has no rate limit or Terms check.
- `GET /api/users/[handle]/posts` returns a person's hidden-club posts to signed-out visitors (service-role read).
- The posts media route has no author exemption, so an author who isn't a member 404s on their own post's media.
- `post_engagement_counts` and `comment_like_counts` leave platform admins out of the hidden-club rule.
- `record_post_view` still counts a view on someone else's draft; `/api/trending/hashtags` counts the viewer's own
  drafts' tags.
- Bars smaller than 1% of the page are dropped silently and the save still reports success.
- `parse-reminder.test.ts` fails on an extensionless import (pre-existing, unrelated).
- A nested `<button>` hydration warning in the phone feed card (CampusMobile).
- Supabase CLI storage pins in `supabase/.temp/*.bak` stay set aside: they're stale from May, not a CLI problem.

## §9 — Where things are

- Week-one plan: `handoffs/wave-plan-week1/` (rulings.md first). Stripe contract:
  `handoffs/wave-plan-stripe/contract.md`. Moderation: `handoffs/wave-plan-moderation/plan.md`.
- Launch decisions: `2026-09-15-session-60-email-verification.md` §6e; roadmap artifact
  https://claude.ai/artifact/6QfJfD1QSPYu8qn9FvsRzi.
- Local test copy: session 63 handoff §5, still accurate apart from the CLI version.

---

## §10 — RESUMED AND FINISHED (2026-09-23/24). What §10 listed is done.

**Committed and deployed:** everything in §2 plus the moderation FOUNDATION (`5c1c8c1`, `85683bf`,
`f537aee`, `acf9ad4`, `9213929`, `c097306`). Live and smoke-checked: campus, profile, feed, /plus all fine.

**Production database is at `20260922140000`.** The moderation migration
`20260923090000_moderation_foundation.sql` is applied to the LOCAL test copy only and needs Franky's yes.
It is big: reports life cycle + evidence, moderation_actions (append-only, no FKs on purpose), removed_at on
posts/comments/messages, account_restrictions, three helper functions, policy ANDs on every write a student
can reach through PostgREST, the users/events column-grant revokes that make the word filter unbypassable,
and the email_sends kind widening. PRE-FLIGHT d matters: production has repeat reports, the local copy has
none, so the duplicate collapse must be measured before applying.

**UNCOMMITTED in the working tree (26 files): moderation wave 2, the screens.** Built and 68 acceptance
checks green: /admin desk (reports queue, clubs, users, log — `admin-shell.tsx`, `reports-client.tsx`,
`users-client.tsx`, `log-client.tsx`), report buttons across React and the static pages, the
"Removed by Vibe moderators" author notice, `/legal/community` and `/legal/child-safety`, a Help & Safety
row in Settings. Types clean, lint clean, both .html files' inline scripts parse.

**The finishing round was RUNNING when the session paused and was stopped cleanly — its work may be partly
applied. Re-check these five before committing wave 2:**
1. Removal notices are INERT until `removed_at`/`removed_reason` ride on the wire: feed, single post,
   comments, and a person's posts. `src/app/api/users/[handle]/posts/route.ts` reads with the SERVICE role
   for signed-out visitors, so it must drop removed rows explicitly or it becomes a leak.
2. `src/app/orgs/[handle]/page.tsx:~349` mounts `<OrgContent>` without `reportable`, so "Report this club"
   is built but unreachable.
3. The 24-hour review commitment is missing from both safety pages (Apple's reviewers enforce it).
4. `/admin`'s reports tab answers 500 against production until the migration lands; it should say the update
   is pending, not "Couldn't load".
5. `.env.example` must document `RESTRICTION_PEPPER`; **without it on Vercel, every suspend/ban/lift answers
   503** — set it in production before moderation can restrict anyone.

**Then:** commit wave 2 → push → apply the moderation migration to production with Franky's yes (pre-flight
first) → browser pass over /admin and the report sheets at phone width → journal entry for session 64.

**Test copy:** rebuilt from scratch this session (75 migrations) and reseeded; the dev server on port 3000 is
this session's own (`preview_start` name "vibe"), not another chat's. Restriction probes left a couple of rows
in `moderation_actions` and `account_restrictions`, and blake's probe posts — all local, all harmless.


### §10b — Closed out after the pause

All five resume items landed and shipped (`ffbec83`, `ab26445`, `2d3f3bf`, `2d050cf`, `39cdff2`), Vercel green.
Verified on the test copy end to end: an author sees their removed post's reason, another student gets 404,
a signed-out visitor never sees it; the club report control renders; both safety pages carry the 24-hour
line and help@; Settings has the Help & Safety row; the /admin desk groups reports with evidence and offers
only the actions each target type allows.

**`20260923090000_moderation_foundation` IS NOW APPLIED TO PRODUCTION** (2026-09-23, Franky's yes). Live max
version **`20260923090000`**. Post-check: both new tables exist, 5 report columns, removed_at on all three
content tables, 3 helpers, 0 functions deny EXECUTE, 0 of the 6 filtered `users` columns and 0 of the 3
`events` text columns writable by `authenticated`, the log is service-role only, no restart, 21 posts and
20 accounts intact. Pre-flight had measured 0 reports and 0 duplicate groups, so the collapse was a no-op.
Live smoke afterwards: campus, feed, profile, /admin (renders), the queue API (200, 0 groups) and
/legal/community all fine.

**STILL OPEN — Franky only:**
1. ~~`RESTRICTION_PEPPER`~~ **DONE (2026-09-24).** Franky set it in Vercel (Production) and redeployed, and a
   live end-to-end test proved it: his own `+vibe1` test account (id `3a446418-…`, no posts, not an admin) was
   suspended for 1 day through `POST /api/admin/users/[id]/restrict` and lifted within the minute. The
   restriction carried a 64-char keyed identity (so the pepper is genuinely configured — without it the route
   answers 503), `incomplete: []`, the app_metadata mirror set then cleared, and the log reads
   `user_suspend → user_lift by frankycazares`. Note the desk refuses to restrict yourself or another admin,
   so all three founders are unsuspendable by design — a test needs a non-admin account.
2. ~~Cloudflare rule for `help@connectvibe.app`~~ **DONE (2026-09-24)** — created against the verified
   destination `fgcazares04@gmail.com`. NOT yet proven to deliver: the zone showed "Emails received: 0", so
   neither `hello@` nor `help@` has ever carried a real message. Send one and confirm (watch spam).
3. The Stripe test checkout with card 4242, then the go-live checklist in §4.
4. ~~His live profile's Web field~~ **DONE (2026-09-24)** — it held `http://localhost:3000/html/profile.html?app=1`,
   written by the save-on-load bug back when `npm run dev` pointed at the PRODUCTION database (before the test
   copy existed). Only his row was affected. Cleared to empty; `headline` ("Marketing · Year 3", same
   fingerprint) left alone at his choice.

**Next engineering, in order:** a browser pass over the report sheets and the removal notices at phone width;
the installable app (PWA) for October; then re-run both sentinels over everything since Sept 3. The §8
follow-ups are unchanged, plus two from the as-built read: `post_comments` and `messages` grant
`authenticated` UPDATE on the removal columns (safe only because no UPDATE policy exists — tighten it), and
`removeContent`/`restoreContent` in `src/lib/moderation/actions.ts` have zero callers because the routes
carry inline copies, so the two halves can drift.

---

## §11 — Moderation finished and live (2026-09-23/24). Session close.

**Wave 2 (the screens) shipped:** `ffbec83` /admin desk · `ab26445` React report surfaces + author removal
notices · `2d3f3bf` the same on the static desktop pages · `2d050cf` Community Guidelines + Child Safety +
Settings row · `39cdff2` the removal mark on the wire, the club report reachable, the admin queue honest
before the update · `2896a50` phone: report ONE message, and a finished report closes the menu it came from.
`7ea073b` journal (v7.6). Every Vercel build green; live smoke after each.

**Production database is at `20260923090000`.** Applied with Franky's yes after a pre-flight that measured
0 reports and 0 duplicate groups (the collapse step was a no-op). Post-check: both new tables, 5 report
columns, removal marks on posts/comments/messages, 3 helpers, 0 functions denying EXECUTE, 0 of the 6
filtered `users` columns and 0 of the 3 `events` text columns writable by `authenticated`, log service-role
only, no restart, 21 posts and 20 accounts intact.

**`RESTRICTION_PEPPER` is SET in Vercel production** and proven live: Franky's own `+vibe1` account
(`3a446418-…`, no posts, non-admin) was suspended for a day and lifted inside a minute — 64-char keyed
identity (so the pepper is real), `incomplete: []`, app_metadata mirrored then cleared, log reads
`user_suspend → user_lift by frankycazares`. **The desk refuses to restrict yourself or another admin**, so
all three founders are unsuspendable by design; testing needs a non-admin account.

**Phone pass at 375px (hands-on, as an ordinary student).** Working: report on others' posts (own posts show
Edit, no self-report), the sheet's privacy line and six reasons with Submit disabled until one is picked,
in-place "Thanks — we're on it.", per-comment reporting with the comment text captured as evidence,
conversation reporting beside Block, and the author's "Removed by Vibe moderators" card with the reason,
"Only you can see this post", help@ and the guidelines link. Two gaps found and fixed in `2896a50`.

**Lessons worth keeping:**
- The dev server served STALE code through two whole verification rounds — a fixed leak kept reproducing.
  When a failure contradicts the code, `touch` the file, re-warm, re-run BEFORE "fixing" correct code.
- Request-level acceptance passed three things that were broken in the hand: inert removal notices, an
  unreachable club report, and no per-message report on phones. The browser pass is not optional.
- Signing in with a magic link does NOT switch accounts if someone is already signed in (session 60's
  forwarded-link protection). Sign out first or you test as the wrong person — this cost a whole pass.
- Three builders stalled mid-wave with their work already on disk; rescue the tree before re-running.
- The plan critic caught a migration step that passed locally and would have FAILED on production, because
  production has repeat reports and the test copy has none. Measure production in every pre-flight.

**Open for Franky:** (1) the Stripe test checkout with card 4242 (test copy, browser pane); (2) one test
email to help@connectvibe.app — the zone shows "Emails received: 0", so that path has never carried a real
message; (3) the Stripe go-live chain in §4 when the LLC bank account lands.

**Next build: the installable app (PWA) for October** — manifest, service worker, iOS add-to-home-screen
coaching, push notifications. Start with a research pass; Apple's install and notification rules are
specific. After that: re-run both sentinels over everything since Sept 3, then the legal publish.

**Follow-ups added this session:** `post_comments` and `messages` grant `authenticated` UPDATE on the
removal columns (safe only because no UPDATE policy exists — tighten); `removeContent`/`restoreContent` in
`src/lib/moderation/actions.ts` have no callers because the routes carry inline copies (they can drift);
Save buttons still undo silently like the like buttons did; blocked students can still comment on, save or
repost the blocker's posts.
