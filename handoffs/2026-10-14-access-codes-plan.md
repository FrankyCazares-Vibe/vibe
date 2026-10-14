# Shared access codes for clubs and ambassadors: a plan (FIRST DRAFT)

Oct 14, 2026. Franky asked for this plan today. It is for the three founders.
Nothing in it is built yet. Line numbers come from the Oct 14 working tree. The
Usage tab being built today adds 4 lines near the top of
`src/app/legal/privacy/sections-1-3.tsx`.

**Short answer.** Build club codes (Option B) right after the rate-limits
work, but only if at least one club has signed by about Oct 21. Hold
ambassador codes (Option C) until the lawyer answers the perks question and we
have a real "came back the next week" number. Until then, keep the waves.

## What it is

Today every access code belongs to one person. A founder picks someone from
the waitlist, the app emails them a code, and the code makes one account and
works for 14 days (`supabase/migrations/20261003100000_waitlist.sql:4-9`,
`:193-194`, `:363`). A **shared code** is one code that many people can use.
We would give it to a club officer or an ambassador (a student who promotes
Vibe), and they would pass it on to their people. Each shared code has a
**cap** (the most accounts it can make) and an end date, and a founder can
stop it at any time. Every account made with a shared code remembers which
code it used. That lets founders see totals per code: how many signed up,
verified their school email, finished a profile and came back. The totals
never show who.

## How it would work

**A student** gets a link from their club's group chat or from a friend:
`/auth/signup?access_code=VIBE-XXXX-XXXX`. It is the same link the invite
email uses today (`src/lib/waitlist/email-content.ts:94-101`). The sign-up
page fills in the code from the link and sends it with the sign-up
(`src/app/auth/signup/signup-form.tsx:163-164`, `:311-316`), so the page
itself does not change. After that it is the usual sign-up: school email, the
code we email them, then the profile.

**An ambassador** (Option C only) gets one code from Rylan, with a cap of
about 25 and the Ambassador Promise rules. They share it one to one, or in
group chats they really belong to. To learn how many people joined, they ask
a founder. Version 1 has no in-app view for them.

**A club officer** gets the club's code at the demo day, after the club page
is built in front of them. By default it makes up to 50 accounts and ends
after 14 days. The officer shares it in the club's own chat and never posts it
publicly. If it runs out, they ask a founder to raise the cap.

**A founder** gets a new "Shared codes" part in admin > Waitlist. There they
make a code: club or ambassador, which club, the cap and the end date. The
code is shown once, with a button that copies the link. Like today's codes,
we keep only its scrambled form (`waitlist.sql:232-233`). The list shows each
code's label, its club, uses out of cap, its end date and a Stop button.
The Usage tab shows sign-ups per code.

## What we'd build

**Data.** One new table, `public.access_codes`. Like the waitlist, only the
server can read or write it (`waitlist.sql:221-225`). Its columns:
- `code_hash`: the scrambled code, made the same way as
  `public.waitlist_code_hash` (`waitlist.sql:302-314`). It is unique, and it
  is also checked against `waitlist.code_hash`, so the two kinds of code can
  never clash.
- `kind` (`club` or `ambassador`) and `label`. The label is a fixed word and
  a number, such as `club-3` or `amb-2`, and never a person's name. Wave names
  already follow that rule (`src/lib/waitlist/types.ts:86-93`).
- `org_id` for a club code, then `max_uses`, `ends_at`, `stopped_at`,
  `created_by` and `created_at`.
- No owner column in version 1. Who holds `amb-2` stays in the founders'
  sheet. Add the column only when code holders get a count in the app.

`public.user_cohorts`, the wave note kept for each account
(`20261003140000_waitlist_retention.sql:78-88`), gains two things: an
`access_code_id` column, and a third value for `origin` (`code`). The id is
set to null if a code is ever deleted, but we only stop codes and never
delete them. The table already goes with the account and holds nothing
personal (`:89-93`), so the record of which code someone used goes with the
account too.

**The hook change.** The hook is the database's check on every sign-up. It
is `auth_hooks.hook_waitlist_gate`
(`20261003120000_waitlist_hardening.sql:136-224`). Today its step 4 claims one
waitlist row for one address (`:185-202`). A new step 4b runs only when no
waitlist row matched. It lets the sign-up through when all three of these
hold:
- the code is a live shared code: not stopped and not past `ends_at`;
- the address is a school email. Today the sign-up page only hints when an
  address is not a school one (`signup-form.tsx:218-222`), so without this
  check a leaked shared code would let anyone make a login. Step 4b needs a
  database copy of the domain rule (`src/lib/auth/school-email-domains.ts:56-61`),
  with shared test cases, the way the code-reading rule already has its twin
  (`src/lib/waitlist/access-code.ts:9-12`);
- the code has made fewer accounts than `max_uses`, counted from
  `user_cohorts`. Two sign-ups in the same second can both pass, so the cap
  can run over by one or two. That is acceptable, and it means a sign-up that
  fails later never uses up a place: the hook runs before the account exists
  and outside the step that makes it (`20261003110000_waitlist_gate.sql:38-44`).

Three new refusals join the five in `src/lib/waitlist/types.ts:154-158`, with
their own words in `src/lib/waitlist/view.ts:33-47`: "that code is full",
"that code has ended" and "shared codes need your school email".

`handle_new_user` is the database step that sets up each new account. Its
latest version is in
`20261008110000_starter_name_not_from_email.sql:143-167`. It gets one more
block: if the sign-up carried a live shared code, it writes the
`user_cohorts` row with `access_code_id`. The block reads `access_code_hash`,
which the scrub trigger already puts in place of the typed code
(`20261003130000_waitlist_code_scrub.sql:12-20`), so the plain code is never
stored on the account. Like today's block, a failure only logs a warning and
never blocks an account. The new file starts with the same fingerprint check
every waitlist file uses (`20261003120000_waitlist_hardening.sql:95-110`).

**After sign-up opens.** Once `signup_open` is true, the hook lets everyone
in at step 1 (`hardening.sql:162-165`). From then on a shared code is no
longer a key, only a label. The page still sends a code that arrived in a
link when sign-up is open (`signup-form.tsx:163-164`), so club links keep
counting after launch. A stopped code stops counting.

**Admin.** Three founder-only routes beside the waitlist ones
(`src/app/api/admin/waitlist/`) make, list and stop codes, with the invite
route's admin check and write limit (`waitlist/invite/route.ts:56`) and the
same code maker (`src/lib/waitlist/access-code.ts:49`). Making and stopping a
code go in the admin log, which needs two new action names (`waitlist.sql:241-247`).

**Usage tab.** One more block: accounts per code, by kind and label, with the
same founder and test exclusions. One fix: the waves list counts every
`user_cohorts` row, so shared-code sign-ups would read as "no batch"
(`20261014120000_admin_usage_summary.sql:278-290`); leave out `origin = 'code'`.
**Checks:** new cases in `scripts/sql/waitlist-gate-check.sql` (live, full,
ended, stopped, not a school address, sign-up open), plus tests.

## How long it takes (rough, review included)

| Piece | Time |
|---|---|
| Migration: table, cohort column, hook step 4b, domain twin, `handle_new_user` block, local checks | 1 day |
| Admin routes and the "Shared codes" part | ½ day |
| Usage block, waves fix, refusal words, tests | ½ day |
| Policy text, review pass, browser pass at 375px as a non-admin, one live test | 1 day |

**Option B is about 3 days.** Option C adds about an hour of code (`kind` is
already in the table); its real cost is the Ambassador Promise, the lawyer's
answer and Rylan's time. Option A costs nothing to build.

## Privacy Policy and Terms changes

The policy changes in the same deploy as the code (the rule since Oct 4), in
the files under `src/app/legal/privacy/` and their text twin
`handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md`. The checker
must pass, and `EFFECTIVE_DATE` moves (`src/app/legal/privacy/page.tsx:24`).
- **Section 2** (`sections-1-3.tsx:81-84`): "the access code we emailed you"
  gains "or one a club or a student shared with you".
- **Section 3a** (`sections-1-3.tsx:150-154`): "a record of it" stays true.
  Add "including which shared code, if you used one".
- **Section 4** (`sections-4-5.tsx:21-22`): after "We also count things", add
  "We count sign-ups per shared code. We may tell the club or student who
  shared a code how many accounts it made, once it is 5 or more, never who."
- **Section 11, the table** (`sections-11-15-waitlist.tsx:143`): a new row,
  "A shared code: up to its cap, until its end date or until we stop it".
- **Section 11, "When you sign up with an access code"** (`:195-203`): a
  shared code has no waitlist entry. The wave note also holds which shared
  code (such as `club-3`), and "how you got in" gains "with a shared code".
- **Section 1** (`sections-1-3.tsx:35-38`) already covers totals per code.

**Terms.** The live Terms are the May 7 version (`src/lib/legal/terms.ts:1`,
`src/app/legal/terms/page.tsx`). A new version sends every account back
through the agree screen (`src/lib/legal/terms.ts:14-26`), and Option B
doesn't need one: the hook holds the cap and end date, and section 2 already
allows one account per person (`terms/page.tsx:62-63`). **Recommendation:**
no Terms change now. Add to Terms v2's "What you may not do"
(`handoffs/legal-2026-09-29/02-terms-of-service-v2.md:114`): "Sell, trade or
post publicly an access code, or use one not shared with you." Code holders
get that rule in writing with the code; ambassadors sign the Promise.

## If ambassadors get perks

The FTC (the US consumer-protection agency) says anyone praising a product
must say when they're connected to it (Endorsement Guides, 16 CFR Part 255).
Any perk that could sway them counts: cash, gift cards, merch, free Vibe+,
early features, even a title. We answer for our ambassadors' posts, so we
teach the rules and spot-check. The **Ambassador Promise** (one page, lawyer-reviewed):
1. **Say you're connected, every time:** "I'm a Vibe ambassador" in the post
   or message itself, not only in a bio or a hashtag at the end. On
   Instagram, also turn on the "Paid partnership" label when there's a perk.
2. **Only say what's true for you.** No made-up numbers, no fake accounts or
   reviews, no posing as a neutral student.
3. **Don't say Vibe is from or backed by IU or Purdue.** It's independent
   (`02-terms-of-service-v2.md:9`).
4. **Share where you belong**, one to one or in chats you're really in: no
   bulk texts, school mailing lists, university channels or public posts of your code.
5. **No ownership talk:** no equity, shares or "cofounder" words.

Our side: perks for being an ambassador, never per sign-up (paying per
account rewards spam), and no cash before the LLC's bank account and a tax
answer. With no perks at all, ambassadors still say "I'm helping launch Vibe".

## What could go wrong

- **A code gets posted publicly** (a story, Reddit, a huge GroupMe). Up to
  the cap can join, each still needing a school inbox and the are-you-a-person
  check (`signup-form.tsx:303-305`). Fix: Stop it, give the club a new code;
  accounts already made stay. Spot it: the count jumps in the Usage tab.
- **Someone burns the cap** with made-up or other students' school addresses.
  Each unconfirmed account holds a place, and a real student may get a code
  email they didn't ask for. Fix: raise the cap or swap the code. Later, count
  only confirmed accounts and ones under a day old.
- **Guessing.** 40 random bits (`access-code.ts:6-7`), about a trillion
  codes, behind the check. Not a real risk.
- **Selling codes** is worth little: anyone can sign up from Oct 31. **An
  officer leaving** changes nothing: the code is the club's.
- **An ambassador works out who joined.** "2 joined" points at two friends,
  so founders give totals only from 5 up, like public follower counts.
- **Expiry and revoking.** 14 days by default. Stop sets `stopped_at`, and
  the next sign-up hears "that code has ended". Codes are never deleted, so
  their counts last. Hiding a club should stop its code too.

## Options

- **A. No shared codes; keep the waves.** An officer shares
  `/waitlist?src=club-3`; the form already keeps that label
  (`src/lib/waitlist/form.ts:102-107`, policy `sections-11-15-waitlist.tsx:34-36`).
  A founder sends them a wave the same day, one wave name per club (`clubs-3`),
  which stays on the account (`user_cohorts.batch`). Nothing to build, no
  policy change. Cost: students wait for a code; founders click for each one.
- **B. Club codes only.** Everything above with `kind = 'club'`, about 3
  days. Students are in within minutes at the demo day, while it's exciting.
- **C. Club and ambassador codes.** B, plus the Promise and the lawyer.

**Recommendation.** A now, since it works today. B right after the
rate-limits work if a club has signed by about Oct 21, done around Oct 25. C
not before November, after the lawyer answers on perks and club codes show a
"came back the next week" number. Ambassadors can start under A today with
`?src=amb-N` links and no perks.

## Open calls

**Franky**
- Build B after rate limits if a club signs by Oct 21? **Yes**; otherwise stay on A.
- Default cap and end date? **50 and 14 days**, raised on request.
- Does a club code also follow the club? **No.** Following stays the person's choice.
- Officers see their code's count in the app? **Not in version 1.** A founder tells them, from 5 up.
- Under A this week, one `clubs-N` wave per club? **Yes**, with the list of which club is which in the founders' sheet.

**James (paperwork: LLC, bank, lawyer)**
- Ask the lawyer whether ambassadors may get perks and what the Promise must say. **Bring the one-page draft** with Terms v2, so the lawyer edits instead of writes.
- Cash perks? **Not until the bank account exists**, and ask about tax forms before the first one.
- The code line for Terms v2 section 8? **Add it to the lawyer packet**; no separate Terms change now.

**Rylan (campus)**
- Who are the first ambassadors? **Five at most**, students who already lead people (officers, RAs, IFC), from both IU Indy and Purdue Indy.
- May an RA promote a business to residents? **Ask his supervisor first**, and promote as himself, not in the RA role, until then.
- Which clubs get demo days first? **The two or three likeliest to sign by Oct 21**, so the B decision gets its answer.
