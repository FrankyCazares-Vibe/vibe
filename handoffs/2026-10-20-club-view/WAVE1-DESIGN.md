# Wave 1 design: roles and the two club links (Oct 21, 2026)

The build notes for wave 1 ("a club can get on"). Decisions are in `DECISIONS.md`; this file says how they are
built, so the reviews have one thing to check against. Plain English first, the mechanics after.

## In plain English
- **Roles.** A club has one Owner and its Officers. Today's mods become officers. Only the owner makes someone an
  officer, takes it back, or removes an officer from the club. Everything officers could do (Board posts, events,
  check-in, join requests, settings, invites) stays theirs. Titles stay labels.
- **The setup link.** Franky types a club name in Admin › Clubs and makes a link (and its QR). It works once, for
  7 days. The president opens it, signs up with their school email (even while sign-up is closed), and once their
  account is set up the club is made with them as its owner, already checked. A president who already has an
  account opens the same link signed in and taps "Make me the owner".
- **The members' link.** Every checked club gets one. It lets people with a school email past the closed waitlist
  and asks them to join the club. It ends 3 weeks after it was made and lets at most 150 people sign up through
  it. Officers can turn it off (and back on), and see only how many joined through it.
- **What is kept.** For each person a link let in: which link, and when. The address the person signed up with is
  kept only until their account is made, then it is dropped. No IP address, ever.

## One mechanism, two kinds
- `public.club_links`: one row per link. `kind` is `setup` or `members`. Only the SHA-256 of the link's code is
  stored for a setup link; a members' link keeps its code too (officers show it again and again; the table is
  service-role only). Setup: `club_name`, `club_handle`, `checked`, 7 days, 1 use. Members: `org_id`, 21 days,
  150 sign-ups, `off_at`. One members' link per club (a partial unique index).
- `public.club_link_uses`: one row per person a link let in or brought into a club. `claimed_email` and
  `claimed_at` while a sign-up is under way (the gate wrote it), then `user_id` once the account exists (the
  address is cleared then), `joined_at` when they joined the club through it. Officers see `count(joined_at)`.
- A link's code: 16 Crockford base32 characters (80 bits), never typed, only opened (`/c/<code>`) or scanned.

## The sign-up gate (`auth_hooks.hook_waitlist_gate`)
A new step 0, before "sign-up is open": a sign-up whose `user_metadata.club_code` is a string asks
`auth_hooks.club_link_claim(code, email)`. Yes: the gate lets it in. No: the gate goes on exactly as today (open
switch, allowlist, access code), and only when nothing else lets the person in does it refuse with the link's own
reason (`[vibe:club_link_used]`, `_expired`, `_off`, `_full`, `_in_use`, `_school_email`, `_invalid`).
The claim runs even when sign-up is open, so the app still knows, after onboarding, which club the person came for.

The claim, under a row lock on the link (two sign-ups at once can't both take the last place):
- the link is unknown, off, expired, or (members) its club is gone, hidden or not checked: no;
- the address is not a school address (`iu.edu`, `purdue.edu` and their subdomains, not the retired IU ones): no;
- this address already holds a place on the link: yes (a retry);
- claims older than 15 minutes whose address never got an account give their place back;
- a setup link already used, or held by another address: no; a members' link with 150 sign-ups: no;
- otherwise a place is taken for this address: yes.

`handle_new_user` is NOT changed. The typed code never stays in `auth.users`: a trigger like the access code's
scrub swaps `club_code` for `club_code_hash` on `raw_user_meta_data` and on `auth.identities.identity_data`.

## After the account exists
- New account: when onboarding finishes, the app looks for a place this account's address claimed. Setup: the
  club is made (one database function: the club row, the owner row, its rooms, the link marked used), and the
  owner lands on the setup list. Members: "Join <club>?" with Join and Not now.
- Existing account: `/c/<code>` signed in shows the club and one button (Make me the owner / Join). Signed out,
  it shows the sign-up form with the club on top and "Already on Vibe? Sign in", which comes back to the link.
- Every redemption is a service-role database function that refuses the browser roles from the inside.

## What needs Franky's yes (production)
One bundle, two files: the roles change and the club links (tables, the gate's new step, the scrub, the
redemption functions). Each is rehearsed on the local database before and after, with its rollback.
