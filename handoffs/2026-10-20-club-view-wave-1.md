# Club view, wave 1: "a club can get on" (built Oct 20, 2026)

Branch `claude/club-wave-1-ae4772` (worktree `busy-aryabhata-7b6991`). **Not on main, not on production.**
Plan: `handoffs/2026-10-20-club-view/BUILD-ORDER.md` (wave 1), decisions `DECISIONS.md`, how it's built
`WAVE1-DESIGN.md`.

## What shipped on the branch
- **Owner and Officers.** Mods are gone (today's mods become officers). Only the owner makes or removes officers;
  officers keep every admin power (Board posts, events, check-in, requests, settings, invites, removing members).
  The settings window shows the role picker to the owner only (Officer / Member).
- **Club links, one mechanism, two kinds.**
  - *Setup link:* Admin › Clubs › "New club setup link": club name, handle, "We met in person: the club is checked",
    Make the link, QR. Works once, for 7 days. The president opens it, signs up with a school email past the closed
    waitlist, and when onboarding ends they are asked once, "Set up <club>?" (Make me the owner / Not me), then land
    on its setup list. (Changed Oct 21 by the pre-registration fix: it used to make the club by itself.)
    Someone already on Vibe opens it signed in and taps "Make me the owner". Admin lists every setup link (live,
    used with its club, expired, cancelled) with Cancel.
  - *Members' link:* one per checked club, from the setup list or the officer bar's "Members' link". School email
    only, 3 weeks, 150 sign-ups. Officers see only "N joined through it", can turn it off/on, and can make a **New
    link** if it leaks (same end date, same count; the old link dies). After onboarding the person is asked
    "Join <club>?" (Join / Not now); someone already on Vibe taps Join on the link page.
- **The setup list** `/orgs/<handle>/setup` (phone and desktop): photo and cover, one line, who can join, add
  officers (owner makes members officers; invite by name; skip), first event (the existing event form), the
  members' link. The club page shows officers "Finish setting up · n of 6" until it's done.
- **The sign-up gate** (`auth_hooks.hook_waitlist_gate`) has one new first step for club links; everything it did
  before is unchanged. Club link codes are scrubbed from account data and from Sentry; no IP is stored.
- **Privacy Policy:** club links and Owner/Officers written into the policy and the delete-account page, dated
  `<SHIP DAY>` (a production build refuses to deploy until the real date is set). Every club "admin"/"mod" in the
  policy now says officer. A daily clean-up (the waitlist cron) deletes a sign-up place never tied to an account
  after 30 days, as the policy says.

## Reviews (notes in the shared side-session folder: `wave1-security-pass.md`, `wave1-adversarial-review.md`)
- **Security pass (High, fixed):** a club link let anyone start an account for a stranger's school address while
  sign-up is closed; when the real student later signed up, GoTrue kept the first password. Now, once the emailed
  code proves the inbox, the password the student typed replaces it. Places held by accounts still unconfirmed a
  day later are given back, so made-up addresses can't use up a members' link or lock a setup link.
- **Still true for everyone, not only club links (launch item):** someone who confirms from the login page instead
  of the sign-up page keeps a password set by whoever signed the address up first. Recommendation: before sign-up
  opens on Oct 31, make sign-up prove the school inbox before a password exists (the Oct 8 "school email first,
  code" shape).
- **Correctness review:** fixed the sign-up checks (school address before sending, neutral wording, links back to
  the club link), onboarding's extra reads, and the members' link question after the link ends. Production has no
  mods (read Oct 20), so the roles change is safe in either deploy order.
- **Decided not to:** count `/c/<code>` in the signed-out read limiter (it shares a per-network pot with profile
  pages, so busy campus wifi could block real sign-ups; each hit is one indexed lookup). Left for later: the
  gate's account checks scan `auth.users` without its index (fine at today's size).

## What Franky must approve (production database, one bundle)
Rehearsed on the local database with and without the change (rollback tested; the old gate tests give the same 36
passes before and after; 53 club-link checks pass through the real local sign-up service,
`node --no-warnings scripts/club-links-e2e.mjs`; wait 5 minutes between runs, the local sign-up limit). Production's fingerprints
were read on Oct 20 and match what the files expect (gate checksum `2b258dbf…`, role rule, update policy; 0 mods).
1. `20261021100000_club_officers.sql`: mods become officers (production has none), Mod can't come back, and the
   database also says only the owner changes roles.
2. `20261021110000_club_links.sql`: the two new tables and their functions.
3. `20261021120000_club_links_gate.sql`: the sign-up gate's new club-link step.

**Ship wave 1 together with the sign-up pre-registration fix** (branch `claude/signup-inbox-first`, built on top of
this one; handoff `2026-10-21-signup-preregistration-fix.md`). Club links let people past the closed waitlist, and
without that fix whoever signs a student's address up first keeps a working password. Its three files join this
bundle (A, B, C), and its handoff has the full order. In short: his yes → apply 1, 2, 3 and A with the connector
(body minus begin/commit; rename each auto-timestamp row in `schema_migrations` to the file's version, and delete
the connector's own row) → set the Privacy Policy date in `page.tsx` and line 3 of `privacy-policy-final.md` to
that day → merge `claude/signup-inbox-first` to main (it carries wave 1) → the same day, once live, apply B and C →
the dashboard steps → make one setup link in Admin and open it on a phone. No club link goes out before then.

## Calls left for Franky (each with a recommendation)
- **When a members' link ends after 3 weeks, can officers make a fresh one?** Today: no (they can only renew the
  code within the same window). Recommendation: yes, once it has ended, a new 3 weeks and a new 150; decide after
  launch week, when we see how clubs use it.
- **Unchecked setup links:** turning the toggle off makes a club that can't post events or get a members' link
  until it's checked. Recommendation: leave the toggle on for the first 20 (you meet them in person).

## Not done / known
- Photo and cover upload can't be tried locally (the storage bucket is off in dev); it reuses the club page's own
  upload, so walk it on the deploy.
- The four old `scripts/sql/*-check.sql` rehearsal scripts still insert `mod`; they were for shipped migrations.
- Rare: if a club's handle is taken when its setup link is used, the club gets the handle with a number; that
  numbering doesn't look at handles other live setup links hold.
- The local database keeps the walk's test club (Sixty-Four Chess, @sixtyfourchess) and two test accounts
  (`priya.raman.w1a@iu.edu` owner, `maya.okafor.w1a@purdue.edu` officer; local password as in `scripts/local-seed.mjs`).

## Next
**Wave 2 (Fri Oct 23 to Sat Oct 24): the Profile-tab switch, the Instagram-style club page, club tools on the
phone** (`BUILD-ORDER.md`).
