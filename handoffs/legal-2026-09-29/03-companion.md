# Companion to the Terms v2 — outputs B to J (2026-09-29)

Everything here goes with `02-terms-of-service-v2.md`. Section letters follow the frame in `01a-chatgpt-prompt.md`. Where this file names a code change, the Terms carry a `[CODE]` marker pointing here.

## B. Privacy Policy provisions (changes to the Sept 7 draft)

The Sept 7 Privacy Policy stays the base. Add or change these:

**§3a, account and sign-in.** Replace the school-email row with two rows and add four:

| What | Why |
|---|---|
| Login email (any provider) and a password hash | Sign in, account emails, password reset. This is the primary address. |
| School email (`@iu.edu` / `@purdue.edu`) you add to verify | To confirm you controlled a university address at the moment you verified. It tells us your university (IU or Purdue), never your campus, enrollment, or identity. One address verifies one account. Never shown to other users. |
| Verification status and date | To show the badge and to unlock posting, messaging, clubs and events. We do not re-check it on a schedule. |
| A one-way scrambled copy (keyed hash) of the school email on a banned account | So the same address cannot verify a new account after a ban. It survives account deletion. It cannot be turned back into the address. |
| The same kind of scrambled copy of the login email on a restricted account | Kept with the restriction as evidence. Today it is not used to block new sign-ups (H17 changes that). Survives deletion. |
| The date you verified | Not recorded today; H8 adds it so the badge can say when. |
| Recovery evidence you send us (email replies, a redacted ID photo, call notes) | Only to decide a recovery or a club-transfer request. Deleted 90 days after the request closes. [Operator promise; keep a folder with dates.] |
| Billing: your Stripe customer id, subscription status, period dates, and Stripe's records of charges, refunds and disputes | To run Vibe+. Card numbers never reach us. Stripe's privacy policy covers what Stripe holds. |
| Push devices: a device token and platform, if you turn notifications on | To send notifications to that device. Removed when you sign out or turn them off. [Only once push is live.] |

**§3d, automatic.** Say plainly: IP addresses appear in short-lived rate-limit counters for password reset and school-email requests, in our hosting provider's request logs, and in our email provider's delivery logs; we never use them for location. Device information: browser user agent in provider logs and error reports; push device tokens if enabled. No analytics SDK, no advertising SDK.

**§5, who can see what — add a club-officer row.** A club's owner and admins can see: the member list with roles and join dates, the follower list with first-follow dates and how each person followed, join requests with the message written, invites and their outcome, and who RSVP'd to the club's events. They cannot see anyone's email addresses, verification date, login activity, or private messages outside the club's own chats.

**§5, add "us".** Platform admins (the three cofounders) can see everything above plus login and school emails, verification dates, restriction records, reports and their snapshots, and can read messages when a report or the law requires. Only one cofounder can reach the database directly.

**§8 / §9d, what survives deletion.** List: the ban hashes (school and login email); moderation records and report snapshots (3 years); media our moderators removed or that was reported, in the locked quarantine area (up to 1 year); the consent tombstone (user id, version, time; 3 years) [DECISION]; Stripe and billing records (7 years, accounting); recovery evidence (90 days after close); email-delivery stubs and rate-limit counters (short-lived); provider logs on their schedules. Also say: posts and events you made as a club officer are deleted with your account today (H19 changes that), and messages you sent disappear from the other person's chat too.

**New §, "The eight kinds of information".** One table answering the frame's question 7 in plain English:

| Kind | Examples | Who sees it |
|---|---|---|
| You gave us directly | name, handle, profile, posts, messages, resumes, login email, school email | Profile and posts: everyone (much of it without login). Emails: only us. |
| Made by verification | university (IU/Purdue), verification date, badge | Badge and university: everyone. Date: you and us. |
| From Stripe | customer id, subscription state, invoices | You and us. Stripe holds the card. |
| Collected automatically | profile views, post views, last-active time, rate-limit counters with IP, provider logs, error reports | Counts: everyone. Who viewed: you (names with Vibe+). Logs: us and the provider. |
| Public to the internet | profile card, club pages and recent posts, post link previews, photos at their links | Anyone, no account needed. |
| Signed-in users only | published posts, comments, events, RSVPs, follow lists, resumes (short links, redactions burned in) | Every Vibe user at every campus, unless blocked. |
| Club officers only | member and follower lists, join requests, invites, RSVPs to the club's events | That club's owner and admins (moderators: requests only). |
| Kept after deletion | ban hash, moderation records, consent tombstone, billing records, recovery evidence (90 days), copies others made | Us, and Stripe for billing. |

## C. Community Guidelines provisions

1. **Replace the opening paragraph** ("Everyone here verified a school email, which means the person on the other end … is a real student at a real school"). New text: *"Vibe is a campus app. Posting, messaging and joining clubs need a verified school email, which proves the person could read mail at an IU or Purdue address when they verified. It does not prove they are a student, and it does not prove who they are. Treat a badge as a good sign, not a guarantee, and use the report button when something is off."*
2. **Child Safety page, first paragraph**: replace "You need a verified school email to be here, and the Terms require you to be 18 or older and enrolled at a U.S.-accredited college" with "You must be 18 or older to be here. Posting and messaging need a verified IU or Purdue email."
3. **Impersonation bullet**: add "a professor, a university office or official, a club officer, or a club you are not part of. Making a club page for a group you have nothing to do with is impersonation."
4. **New bullet, "Coming back after a ban."** "If we banned you, don't come back with another email, another school address, a friend's account or a club page. The new account is banned too and the ban gets longer, not shorter."
5. **New bullet, "Claiming to be someone you aren't."** "Saying you're a student, an officer, or staff when you aren't; verifying a school email that isn't yours."
6. **"If we act on your account"**: add that a ban makes the school email unusable on Vibe and that appeals go to help@ from the login email within 30 days.
7. **Clubs paragraph** (new, short): what officers can see about members and followers; that a club page can be handed to whoever actually runs the group; that fights over a club go to help@ and the page may be frozen while we look.

## D. Organization-account provisions (the rules, one line each)

| Action | Who may do it today (code) | Rule in the Terms v2 | Gap to close |
|---|---|---|---|
| Create a club page | any verified user | must be a member/officer of the group or starting it; no duplicate pages; impersonation otherwise | duplicate-name warning at creation |
| Claim an existing page | nobody (no flow) | email help@ with evidence; we may hand over, freeze, or refuse | claim button → help@ template |
| Become an admin/mod | only the owner promotes to admin; owner or admins set mods and members | roles come only from the page's officers or from us | — |
| Remove an admin | owner only | same | — |
| Transfer the owner role | **no code path** | owner should promote successor before leaving; otherwise help@ with evidence; freeze during disputes | build owner transfer (H1) |
| Buy premium | Vibe+ is personal; nothing for clubs | an officer's Vibe+ is theirs; no club claim on it | none until a club product exists |
| Cancel premium | the subscriber, via Stripe portal | same | — |
| Change payment | the subscriber, via Stripe portal | same | — |
| Refund | recorded, not acted on; Franky in the Dashboard | no partial refunds; exceptions listed | write the refund runbook |
| Delete the club | owner only; refused while hidden by moderators; cascades members, channels, events, club posts (moderator-removed posts kept) | owner may; we may; 12 months with no officer → we may | H2: an admin-desk delete for ownerless clubs |
| Dispute between officers | nothing | we may freeze roles/name/handle/settings and hide the page; decide on evidence; our decision is about Vibe only | H4 freeze flag |

**Officer-turnover stress test (the frame's example), with today's code and the v2 rules:**

The president creates the club on their own verified account, buys Vibe+ personally, graduates, IU closes the address, a new president writes in.

- *The club page*: the old president is still owner. Under v2 §9 the new president emails help@; we ask for evidence (club school email, the university org listing, a message from an existing admin); we appoint them owner by hand [H1 makes this a button]. If the old president is unreachable and the account still exists, the page keeps working for admins in the meantime.
- *The subscription*: it is the old president's personal Vibe+, on their own card. It has nothing to do with the club. Nothing transfers, nobody else can cancel it, no refund is owed to the club. If the old president's login email was the closed IU address, they cannot reset their password; recovery under §13 requires the evidence list, and if they cannot meet it their Vibe+ keeps renewing until Stripe's own emails (sent to the Stripe customer email, which is the login email) bounce and they dispute it with their bank — the only unavoidable ugly outcome. Mitigation: H6 (login-email change with dual confirmation) and F3 (warn at verification when the login email is a school address).
- *Competing officers*: freeze (H4), decide on evidence, write the reason into the moderation log.
- *The old president's personal payment method*: never attached to the club, because there is no club billing. Keep it that way: if club billing is ever built, it must be a separate Stripe customer owned by the page with an officer as billing contact, never an officer's personal customer.

## E. Account recovery rules (the runbook behind Terms §13)

**Tiers of evidence** (any two of tier 1, or one of tier 1 plus two of tier 2, or a live call):

- Tier 1: a reply from the school email verified on the account; a profile change we describe, made from a session still signed in; a message from an existing club admin naming the person as the owner (club transfers only).
- Tier 2: account details only the holder would know (join month, clubs, recent DM partners, Vibe+ status); a student ID photo with the ID number covered; the university's public org listing naming them (clubs).
- Live: a short video call with a founder, ID shown, not recorded.

**Rules.** Never act on a single email. Never send a reset link to an address that is not on the account. Log every recovery decision in the moderation log (who asked, evidence, decision, who decided). Reply within 14 days. Refuse in writing when not satisfied and say what would satisfy. On any sign of a takeover, freeze first, ask later. Two claimants: freeze, decide on evidence, tell both. Keep evidence 90 days after the request closes, then delete it.

**Which cofounder.** Any of the three can decide; only Franky can execute a database change today. Write both names in the log.

## F. Recommended verification UX

1. **Signup**: keep "Use your personal email — the one you actually check." Add one line: *"Use an address you'll still have after you graduate. Your school email is verified separately and is never shown."*
2. **School-email screen**: title "Confirm your school email". Body: *"We'll send a link to your @iu.edu or @purdue.edu address. This confirms you can read mail there — that's all it checks. It unlocks posting, messaging, clubs and events."*
3. **If the login email is itself a school address** (the person typed `name@iu.edu` at signup): show once, at verification: *"Heads up: your sign-in email is a school address. Add a personal email in Settings before you graduate or you may lose access."* [needs H6]
4. **Badge tooltip / tap**: *"Confirmed an @iu.edu address on Sept 3, 2026. This doesn't confirm enrollment or identity."* (date optional; DECISION)
5. **Profile "I am" field**: student / alumni / staff or faculty / other — free choice, shown on the profile, never verified. Cheap, honest, and it gives the Terms' "be truthful" rule something to point at.
6. **Club page line**: "Recognized by the university: yes / not yet / unknown", set by us at verification, plus "Verified by Vibe on [date]". Never the university's logo.
7. **Re-verify prompt** (H8): a banner "Verify your school email again to keep your badge" with a 14-day countdown, triggered by an admin action.
8. **Copy audit** (from `00-code-facts §I` and the marketing repo). Change before the Terms publish:
   - Community Guidelines opener ("…is a real student at a real school") and Child Safety opener ("You need a verified school email to be here… enrolled at a U.S.-accredited college") — see C1, C2.
   - Live Terms §1 ("enrolled… working .edu") — replaced by v2. Live Privacy: "affiliated with a U.S. college", the CSRF cookie, "aggregate usage analytics", "turn on multi-factor authentication" — none is true; remove.
   - Profile badge "🎓 Student · {campus}" (`public/html/profile.html:8532`) and mobile fallback "Student" → the campus label or "IU verified"; CTA "Verify your student status" → "Verify your school email".
   - School-email screen "so we know you're actually on campus" and headline "Verify your campus" → "Confirm your school email"; support page "to verify your campus".
   - Onboarding "You're verified as a Purdue student." → "Your @purdue.edu email is verified."
   - Clubs: "Officially recognized clubs at {campus}" → "Verified by Vibe"; "Groups created by verified students" → "Groups created by verified accounts"; "IU students only" is acceptable as a club setting label but the join copy should read "open to @iu.edu accounts".
   - Landing "Sign up with your school email" contradicts the signup page; use "Sign up, then confirm your school email."
   - Suspended page (ban): "a new account can't post" → "that school email can't be verified on another account".
   - Marketing repo: "real students only", "verified student identity" → "verified school emails".
   - Store listings (none written yet): "a campus app for IU and Purdue students; posting needs a verified school email", never "students only" or "safe".
   Keep, because they are true: "Only verified emails can post", "Bans stick to the school email", "Checked against each student's verified school email when they join".

## G. Personal-email account rules

- Anyone 18+ with any email can hold a login. It can look around, follow clubs, react, block, mute, report, delete itself, and subscribe to Vibe+ [DECISION: should Vibe+ require verification? Recommendation: yes — "who viewed you" for an unverified account is a scraping tool; see I5].
- It cannot post, comment, message, join or create clubs, RSVP or create events.
- **The browse-without-verification question** (security review, Sept 27): a Gmail-only account reads every profile and post. Recommendation: keep browsing open for the launch month (it is how a curious student decides to verify), but hide *profile view identities, resumes, last-active time and the people directory* from unverified accounts, and rate-limit their reads harder. Decide on purpose; write the decision into Privacy §5.
- Disposable-email domains are refused at signup (H10). One person, one account; duplicates found are closed, always when used to evade something.
- A personal-email account that claims a university on its profile without a badge is not "verified" anywhere in the UI; the profile shows the university only from the badge, never from a typed field. [confirm in §I copy audit]
- Institutions we do not support (Butler, Ivy Tech, international): their students can hold a login and look; they cannot verify. Say so on the school-email screen ("Not at IU or Purdue? You can look around; posting opens when your school is added.").

## H. Engineering and security requirements (ranked; each is a Terms promise or a hole the attacker will use)

| # | Build | Why (which clause) | Size |
|---|---|---|---|
| H1 | **Owner transfer**: owner picks a successor admin, successor accepts, roles swap; admin action for us to appoint an owner with a reason logged | Terms §9 "passing a club down" | S |
| H2 | **Admin-desk club delete** for ownerless or abandoned clubs (owner delete exists and cascades; nothing can delete an ownerless club today); confirm storage cleanup on delete | §9 | S |
| H3 | **Consent tombstone**: on deletion write (user id, terms_version, accepted_at, deleted_at) to a service-role table; prune after 3 years | §1, §14 | S |
| H4 | **Freeze flag** on `users` and `orgs`: blocks email/handle/role/settings changes and Vibe+ changes; shows "under review" | §9, §13 | M |
| H5 | **Sign out everywhere** as an admin action (self-service logout already revokes all refresh tokens); revoke sessions on password change; session lifetime ≤ 30 days idle | §13 | S |
| H6 | **Login-email change** with confirmation at both addresses, 24-hour delay, notice to the old address with an undo link; sync `public.users.email` on change; until built, block the auth provider's direct email update (auth hook or trigger), which today leaves our copy and the ban record stale | §4, §13 | M |
| H7 | **Password required for deletion** (not the handle); re-auth for email and school-email changes | §14 | S |
| H8 | **Re-verify**: admin action that clears `school_verified` and sets a 14-day deadline; badge hidden after; keeps the hash check; add `school_verified_at` (no verification date exists today) | §5, F4 | S |
| H9 | **Handle reservation** 90 days after deletion (a small table of handle + freed_at) | §4 | S |
| H10 | **Disposable-domain block** at signup and at school-email request; refuse `+` variants of an already-verified school address (canonical compare exists for bans — reuse) | §4, §8 | S |
| H11 | **Pre-registration takeover fix**: an unconfirmed signup is deleted after 24 hours; a confirmation from a different browser/IP than the signup requires setting a new password | security review | M |
| H12 | **Club school email** (`orgs.school_email`, verified like a user's; unique; recovery key) and "recognized by the university" field | §9, F6 | M |
| H13 | **Admin accounts**: 2FA on the three admin logins (Supabase MFA), HIBP leaked-password check (needs Pro), admin actions require re-auth | ban/recovery decisions rest on these accounts | M |
| H14 | **Recovery log**: recovery and transfer decisions written to `moderation_actions` with an evidence summary; 90-day evidence purge reminder | §13, E | S |
| H15 | **NCMEC CyberTipline registration** and a one-page reporting procedure; **DMCA agent** registered (James, j9) | §7, §8, Child Safety | paperwork |
| H16 | **Unverified-account read limits**: hide viewer identities, resumes, last-active, people directory; stricter read rate limits | G | M |
| H17 | **Use the login-email ban hash**: it is already written on every restriction but never tested. Check it at signup (sign-up bypasses every Vibe route, so this needs a Supabase auth hook or a trigger on `auth.users` insert) and at school-email verification; at minimum for bans for child safety, threats and intimate images | §12 | S |
| H18 | **Vibe+ requires a verified school email** (checkout refuses otherwise; today it needs Terms only) | G, I5 | S |
| H19 | **Club content survives the officer**: club posts and club events re-home to the club (author cleared) instead of cascading with `creator_id`; a club whose owner deletes their account keeps its events | §7, §9, §14 | M |
| H20 | **RSVP requires a verified school email** (today Terms only; RSVPs are visible to every signed-in user) | §2, I17 | S |

## I. Unresolved product decisions (Franky's calls, each with a recommendation)

1. **Non-students with a school address** (staff, alumni, applicants): allow and require truthfulness (recommended), or remove when found. Recommendation: allow; add the "I am" field (F5).
2. **Consent tombstone** after deletion: keep 3 years (recommended) or delete everything.
3. **Handle reservation**: 90 days (recommended) or none.
4. **Alumni state**: none (recommended for launch); revisit in spring when the first officers graduate.
5. **Vibe+ for unverified accounts**: refuse (recommended).
6. **Browse without verification**: keep, with H16 (recommended), or require verification to read anything.
7. **Clubs with no officers**: hide at 6 months, delete at 12 (recommended).
8. **Club school email + two-officer minimum** as the verified-club requirement: yes (recommended; it is also the recovery key).
9. **Deletion confirmation**: password (recommended) instead of the handle.
10. **Minors found**: close and free the address at 18 (recommended) instead of a permanent ban.
11. **Second hash for the worst bans** (H17): yes (recommended); it is a privacy disclosure, not a secret.
12. **Postal address in the Terms**: registered agent's address (recommended) once the Oct 3 amendment lands; never a home address in a public document.
13. **Refund exceptions**: as written (no partials; error, removed feature, law, our choice).
14. **Price-change notice**: 30 days (recommended).
15. **Backups**: Supabase Pro before students arrive (recommended; Franky said "not yet" Sept 28) — the Terms say "no backups" until then.
16. **Club content when an officer deletes their account**: re-home to the club (recommended, H19) or keep today's behavior (deleted) and leave the warning sentence in Terms §7.
17. **RSVP by unverified logins**: require verification (recommended, H20); RSVPs are public to every signed-in user and an unverified account can today RSVP to any event.
18. **Ban evasion by a new login**: use the stored login-email hash at signup (recommended, H17) or keep bans school-email-only and say so.

## J. Questions for outside counsel (deduplicated with the Sept 7 list; new ones marked ★)

1. Is an attestation-only 18+ checkbox enough, and how should a found 17-year-old's account and data be handled? (Sept 7 Q1) ★ Does a permanent ban with a retained school-email hash create a problem when the person turns 18?
2. Is the consent record an enforceable clickwrap, and ★ should a tombstone survive deletion? (Sept 7 Q2/Q3)
3. ★ The keyed hash of a banned school email, kept after deletion: is it personal data we must disclose and can a user demand its deletion (Indiana CDPA, CCPA if ever in scope)?
4. Disclaimer, $100 / 12-months-paid cap, and indemnity against individual students under Indiana law for a mostly free service. (Sept 7 Q4) ★ Should the indemnity be limited to intentional wrongdoing?
5. Entity, venue (Marion), and ★ the published address: registered agent's address vs none. (Sept 7 Q5)
6. Which hand-run promises are safe: 24-hour review aim, 48-hour NCII removal, 14-day recovery reply, 30-day export. (Sept 7 Q6)
7. ★ TAKE IT DOWN Act: are we a covered platform; what records of requests and removals must we keep; is our process page sufficient?
8. ★ Auto-renewal: which states' notice, consent and cancellation rules apply to student subscribers who live across states; is "no partial refunds" enforceable; is 30 days' price-change notice enough.
9. ★ University names: IU's and Purdue's trademark policies; is "IU Indianapolis" / "Purdue in Indianapolis" in our copy and app-store listing fine without a license; the "recognized by the university" line on club pages.
10. ★ Club pages and unincorporated associations: when we hand a page to a claimant, or refuse, what exposure do we have to the losing side; is "our decision is about Vibe only" enough; should officers sign anything.
11. ★ Recovery: can we require an ID photo or a video call; what must we keep or delete; is a refusal to restore an account a consumer-law problem if the person paid for Vibe+.
12. ★ Reading messages on a report or "when we have reason to think": is the reserved right worded safely (Stored Communications Act, wiretap).
13. ★ Section 230 and our moderation promises: does "we aim to review within 24 hours" or "we remove within 48 hours" create a duty we would not otherwise have.
14. ★ Apple's required EULA language and Google's; the 18+ rating; Texas SB 2420 (app-store age checks) and similar state laws for store apps.
15. ★ Data-broker and scraping: is "no scraping" plus rate limits enough, or should the Terms also forbid commercial use outright.
16. ★ Unpaid campus helpers with free Vibe+: employment law (already queued by James).
17. ★ NCMEC registration and the CSAM reporting duty (18 U.S.C. § 2258A): confirm the procedure and retention.
18. ★ Professor/official impersonation: any duty to notify the university; any risk in NOT notifying.
