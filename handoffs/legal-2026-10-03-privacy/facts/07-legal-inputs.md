# Legal inputs for Privacy Policy v2 (gathered 2026-10-03)

Read-only pass over the legal documents. No code was read except the live legal pages and `src/lib/legal/terms.ts`.
Nothing here is legal advice; it is a map of what the documents already say, with file and line.

**Short names used for sources** (all under `/Users/franciscocazares/vibe/`):

| Short | File | Date |
|---|---|---|
| S7 | `handoffs/legal-drafts/2026-09-07-privacy-policy.md` | Sept 7, re-checked Sept 17 |
| RQ | `handoffs/legal-drafts/2026-09-07-reviewer-questions.md` | Sept 7 / Sept 17 |
| CF | `handoffs/legal-2026-09-29/00-code-facts.md` | Sept 29 |
| T2 | `handoffs/legal-2026-09-29/02-terms-of-service-v2.md` | Sept 29 |
| CO | `handoffs/legal-2026-09-29/03-companion.md` | Sept 29 |
| ATT | `handoffs/legal-2026-09-29/10-attacker-round1.md` | Sept 30 |
| DEF | `handoffs/legal-2026-09-29/11-defender-round1.md` | Sept 30 |
| RES | `handoffs/legal-2026-09-29/12-results.md` | Sept 30 |
| WB | `handoffs/s72-prep/waitlist/BUILD.md` | Oct 3 |
| WP / WE | `handoffs/s72-prep/waitlist/PLAN.md` / `email-admin-data.md` | Oct 3 (older than WB) |
| LIVE-P | `src/app/legal/privacy/page.tsx` | page dated Sept 28 |
| LIVE-T / LIVE-C / LIVE-CS / LIVE-D | `src/app/legal/terms`, `community`, `child-safety`, `delete-account` `/page.tsx` | May 7 / Sept 28 / Sept 27 / Sept 28 |

**Three things to know before reading the list.**

1. The Sept 7 draft (S7) is the base (CO:7), but it is the oldest source. The companion (CO), then the defender (DEF),
   then the waitlist notes (WB) each overrule it where they differ. Section 7 lists every clash.
2. Franky has not answered the nineteen calls in RES:63-87 yet. Where a requirement hangs on one, it says so.
3. "Depends on H-item" means the sentence is only true once that code item ships. The H-numbers are the engineering
   list in CO:122-145 and DEF:1901-1949. This pass did not check which H-items are built; another fact file must.

## 1. Requirements

Each item: what the policy must say, change or remove; exact words where a source gives them; the source; code it depends on.

### A. The frame

**R1. Build on the Sept 7 draft, then apply companion B, then the defender's B1 to B11.**
Source: CO:7 ("The Sept 7 Privacy Policy stays the base"); DEF:1796-1846. Code: none.

**R2. Publish on the same day as the Terms, under the same version number.**
Words: "Privacy Policy: rewritten (companion B, AC28) and published the same day, under the same version bump."
Source: DEF:2053 (publish gate item 2); DEF:825-828; RES:37. Code: `TERMS_VERSION` bump (see section 6).

**R3. Remove the "baseline draft, review with counsel" line and every bracket.**
The live page still carries it (LIVE-P:27-32). T2:5 says not to publish that line: "students are required to accept
this document, and that line undermines it." S7:5 says remove all bracketed markers before publishing. Code: none.

**R4. Remove "By using Vibe, you agree to the practices described here."**
Live words: LIVE-P:23-25. Replace with agreement by the checkbox: "I'm 18 or older and I agree to the Terms of Service
and Privacy Policy." (S7:29; T2:19). The Terms say using Vibe never counts as agreeing (T2:23, T2:281). Code: none.

**R5. Cover people who have no account.** The live page is written only for account holders (WE:298-299; WP:619-620).
The policy must also cover: people on the waitlist (R26), people who email a report or an intimate-image request
without an account (DEF:1642; LIVE-C:195-199), and people who only visit a public page. Code: none.

**R6. Name the operator and say Vibe is independent.** CONNECTVIBE. LLC, an Indiana limited liability company
(S7:13; T2:7). Words for independence: "Vibe is not part of, sponsored by, endorsed by, or operated by Indiana
University, Purdue University, or any campus, school, or student organization." (T2:9). Footer line the defender wants
everywhere: "Vibe is independent and not affiliated with Indiana University or Purdue University." (DEF:2017). Code: none.

**R7. Say who can reach data, in the defender's words. This replaces S7:13.**
S7:13 says "Francisco Cazares is the only person with administrative access to your data" and that James and Rylan
read one inbox "and nothing else". The review called that false (RES:38; DEF:847-861). Replacement, exact:
> "Platform admins (the three cofounders) can see reports and their snapshots, removed content, restriction records and
> notes, and hidden clubs, and can look an account up by its exact email address (the address itself is not shown to
> them). Only Franky can reach the database directly, which is where login and school emails are stored. The founders
> read what arrives at hello@, help@ and vibe.llc@."

Source: DEF:1833-1834 (B9), same text at DEF:857. The Terms intro that must match it is at DEF:1477. Code: none.

**R8. Three contact addresses, each with its job.** hello@connectvibe.app for questions; help@connectvibe.app for
safety, appeals, takedowns, child safety, account recovery, login-email changes and deletion by email;
vibe.llc@outlook.com for legal notices. Source: T2:13, T2:297, T2:290; DEF:1519; LIVE-D:118-125. S7 uses hello@ for
everything (S7:300, 304, 310, 332) and must be updated. Also say where mail lands: hello@ is forwarded by Cloudflare
Email Routing to a Gmail inbox (S7:15), which the attacker describes as Franky's personal Gmail (ATT:659). Code: none.

**R9. Postal address: either the registered agent's address, or a plain "none".** S7:13 and S7:334 leave it open.
Recommendation in the documents: the registered agent's address from the state filing, never a home address (CO:160;
RES:86; DEF:1786). It waits on James's Oct 3 filing. Code: none. Lawyer question (section 5).

**R10. Say Vibe is a website and store apps.** S7:21 says "Vibe is a website; there is nothing separate to download
or install." T2:7 covers "the website at connectvibe.app, the Vibe apps for iPhone and Android". Use the Terms' scope
only once the apps exist; until then say the website, and that apps are coming. Code: store apps (not an H-item).

### B. Who the policy covers: age and verification

**R11. 18 or older, by checkbox only; no date of birth.** S7:23, S7:308; T2:27. Code: none.

**R12. Remove "We do not knowingly collect information from anyone under 13."** Live words: LIVE-P:175-176. It
contradicts an 18+ rule (RQ:12; S7:312). The lawyer is asked to confirm dropping it (section 5). Code: none.

**R13. Remove "who are affiliated with a U.S. college".** Live words: LIVE-P:174-175. Called untrue at CO:102,
DEF:1236, DEF:2018, CF:444. Replace with what the Terms say (DEF:1494, T2.2):
> "Anyone 18 or older may create a login with any email address. A login on its own lets you set up a profile, follow
> people and clubs, react to and save posts, block, mute and report, and delete your account. It can also see what Vibe
> shows to signed-in users (Section 7); some screens in the app ask you to verify first, but that is a step in the app,
> not a privacy wall. It does not let you post, comment, message, join or create clubs, create events, RSVP to events,
> or buy Vibe+. Those need a verified school email."

Code: depends on H20 (RSVP needs a verified school email, before publish) and H18 (Vibe+ needs one, before billing).

**R14. A minor found on Vibe: match the Terms.** Replace S7:310 ("we will delete it and the data it holds") and
LIVE-P:176-177 ("we will promptly remove the account") with the sense of T12.10 (DEF:1692):
> "If we learn an account belongs to someone under 18, we close it and take its content down. We then delete its data,
> except what the law requires us to keep: for example, material we must report to the National Center for Missing &
> Exploited Children and preserve, which we keep only as long as the law requires. A school email on a closed minor's
> account is not banned for good: once the person turns 18, they can write to help@connectvibe.app and we will free it."

Code: none for the words; "close" is the ban tool today, and the rest is done by hand until H34 (DEF:1158-1162).
Franky's call 9 (RES:77).

**R15. Say what verification proves, and never say "student".** Row text from CO:14: "To confirm you controlled a
university address at the moment you verified. It tells us your university (IU or Purdue), never your campus,
enrollment, or identity. One address verifies one account. Never shown to other users." S7 calls the badge "school
verified" (S7:26, S7:40); the Terms define it as "@iu.edu verified" or "@purdue.edu verified" with the campus beside it
(DEF:1503). Code: depends on the badge copy change AC1 to AC4 (DEF:1991-1994); Franky's call 15 (RES:83).

**R16. Campus is the person's own choice and is not checked; state the right change interval.** S7:26 says once every
30 days. T2:40 says "at most once every 45 days". One of them is wrong; the policy must match the code. Code: check.

**R17. Do not describe sign-up as "four steps you cannot get past".** S7:24 and S7:27 describe a wall at school
verification. The Terms now say an unverified login can read what signed-in users see (R13). And while the waitlist is
on, a new account also needs an access code (WB:61-69). Describe both honestly. Code: waitlist gate (WB, built on a
branch, not live).

### C. What we collect

**R18. Replace the school-email row in S7's account table with the companion's rows.** Exact rows at CO:11-21, with
the defender's two edits: B1, "Verification status" only, and "The date is added when H8 ships" (DEF:1798); B2, the
login-email scrambled copy is for a "banned" account, not a "restricted" one (DEF:1799). Code: H8 (verification date,
not built), H30 (login-email key written only for bans, before publish).

**R19. Ban records: disclose the scrambled copies, with the corrected sentence.** Rows: CO:16-17. The sentence
"It cannot be turned back into the address" is too strong (DEF:949). Use:
> "We keep a one-way scrambled record of that address (a keyed hash: without a secret key that only our servers hold,
> it cannot be turned back into the address) for exactly this purpose, and it survives your deleting the account."

Source: DEF:953, DEF:1672. Remove S7:272 ("We do not keep a 'banned users' list or any record of deleted accounts"),
which is no longer true. LIVE-D:207-213 repeats the too-strong sentence ("The code can't be turned back into an
address") and should change with it. Code: H30 for "for a ban, the login email".

**R20. Do not say a ban stops someone coming back.** LIVE-P:151-154 says a banned identifier is kept "so the same
actor can't simply re-register". The Terms say the opposite, honestly (DEF:1675): "We do not have a way today to stop a
banned person from creating a new login with a different email... We keep a scrambled record of the banned account's
login email as evidence, and we may use it to spot a returning account." Code: H17 would make the check real (not built).

**R21. Consent record: say what is kept and for how long.** New row, exact (DEF:1802-1804, B3): "Consent record: Terms
versions accepted and when, plus keyed hashes of the login and school emails (H3, revised) | To prove, if there is ever
a dispute, who agreed to which version. Kept 3 years after deletion." S7:316 and LIVE-D:152-154 say the record is
deleted with the account, which is what the code does today (CF:87). Also change "whether you accepted at signup or on
the re-consent screen" to "which screen you accepted on" (DEF:1485). Code: depends on H3 revised (before publish). If
H3 does not ship, keep "deleted with the account" (DEF:1366). Franky's call 2 (RES:70).

**R22. Deleted while reported.** New row, exact (DEF:1808-1810, B4): "A keyed hash of the school email of an account
deleted while reports about it were open (H22) | So a moderator can still act on those reports. Kept with the reports."
Terms wording uses "may" so it can ship before the code (DEF:1733). Code: H22 (can follow publish).

**R23. Views: who viewed what, and who sees it.** New row, exact (DEF:1814-1816, B5): "Profile and post views: who
viewed what, and when | Counts are shown to the person viewed; names are shown with Vibe+. Blocks in either direction
hide the name. Views made while signed out are not recorded." Paragraph to mirror from the Terms (DEF:1555):
> "When you are signed in and open someone's profile or post, we record that you viewed it. The person you viewed sees
> how many people looked; with Vibe+ they also see who. If either of you has blocked the other, your name does not
> appear on their list. Views while you are signed out are not recorded."

This replaces S7:76-77, S7:120 and S7:125 (free list of 25 recent viewers; post views "only the count"). A profile view
also stores a referrer of up to 80 characters (CF:403; S7:76 "the page they came from"). If private viewing ships, add:
"You can turn on private viewing in Settings; while it is on, your views are counted without your name, and you cannot
see names either." (DEF:1557). Code: private viewing is H36, Franky's call 11 (RES:79).

**R24. IP addresses and device information, said plainly.** CO:23: "IP addresses appear in short-lived rate-limit
counters for password reset and school-email requests, in our hosting provider's request logs, and in our email
provider's delivery logs; we never use them for location. Device information: browser user agent in provider logs and
error reports; push device tokens if enabled. No analytics SDK, no advertising SDK." Add the sign-in provider's
security log, which keeps the email address and IP (LIVE-D:229-233; CF:389, CF:399). S7:80 says the rate-limit
counters are "the only place Vibe itself stores an IP address"; keep that only if it is still true. Code: check.

**R25. Remove "approximate location derived from IP" and "Pages you visit on Vibe, actions you take".** Live words:
LIVE-P:59-63. S7:86 says "we never ... estimate it from your IP" and S7:85 says "We do not track which buttons you
press". CF:400: "No geolocation code exists." Code: none.

**R26. Keep the photo-location paragraph that is on the live page.** LIVE-P:48-54 says photos uploaded to a profile
or a post have their location details removed, while "Videos, photos sent in chats, club logos and banners, and group
chat pictures keep their original details, which can include where they were taken or filmed." Neither S7 nor the
companion has this paragraph, so a rewrite from S7 would lose it. Code: check it is still true.

**R27. Billing and Vibe+.** Row, exact (CO:20): "Billing: your Stripe customer id, subscription status, period dates,
and Stripe's records of charges, refunds and disputes | To run Vibe+. Card numbers never reach us. Stripe's privacy
policy covers what Stripe holds." Terms match: "we never see or store your card number" (T2:171). S7:88 lists "payment
details" under what we do not collect; narrow that to card details. Vibe+ notices go to the login email (DEF:1623).
Code: production billing is off; H18, H24, H31 gate it (DEF:2068).

**R28. Push notifications.** Row, exact (CO:21): "Push devices: a device token and platform, if you turn
notifications on | To send notifications to that device. Removed when you sign out or turn them off. [Only once push is
live.]" S7:87 says no part of Vibe asks for push permission; remove that. The table also holds app version and
timestamps, and web push goes through Apple, Google, Mozilla and Microsoft endpoints as well as Firebase (CF:401,
CF:414). Code: check whether push is live.

**R29. Recovery evidence.** Row (CO:19): "Recovery evidence you send us (email replies, a redacted ID photo, call
notes) | Only to decide a recovery or a club-transfer request. Deleted 90 days after the request closes." Add (DEF:1818,
B6): "Kept in one private shared folder, never a personal inbox. Purged monthly (P14)." The proofs the Terms now ask for
are at DEF:1697-1702 (a reply from the school email, a change made from a signed-in device, or a video call; an ID photo
with the number covered only supports). S7:88 says "No ... government ID"; qualify it. Code: none; it is a process (P6,
P14 at DEF:2032, DEF:2040).

**R30. Reports keep a copy of what was reported.** T2:189: "We keep a snapshot of what was reported so that later
edits or deletions do not hide it." LIVE-D:178-182 says the same. S7:227 says a report "does not keep a copy of the
post's text" and that a message or group chat cannot be reported from a menu; both are out of date (T2:187;
LIVE-C:131-133). Only say that reporting a message saves the surrounding conversation once H21 ships (DEF:1921).
Code: H21 (before the Oct 31 launch).

**R31. Intimate-image requests and reports from people without an account.** The Terms promise: "We keep a record of
each request and what we did." (DEF:1654). A valid request carries a signature, where the image is, a good-faith
statement and a contact address (LIVE-C:227-248). The policy must list that record and say how long it is kept. The
period is a lawyer question (J7, J22). Code: none; process P2 (DEF:2028).

**R32. The waitlist: a new section, word for word from the go-live runbook.** WB:452-464 says nothing goes live until
`/legal/privacy` says this, matching the form's notice "We keep your answers for up to 40 days.":
- Collected: "the school email, name, year, major, clubs, whether they run a club and which one, the optional one
  line, where they came from (the `?src=` tag), when they agreed (age, invites, the optional news), and a record of each
  email we send (its kind, the address's domain, the time and a keyed hash of the address)."
- Why: "to confirm the spot, choose who gets in each wave and email the access code."
- Who handles it: "Supabase (the database), Vercel (runs the site and the daily clean-up), Resend (sends the emails)."
- How long: "up to 40 days after joining the list, whatever happens; an unconfirmed entry up to 30 days after its last
  confirm email. The email record forgets the address with the entry."
- After joining: "an account made with an access code keeps only which wave it came in with (the batch, form or added
  by a founder, the day let in, the day joined), deleted with the account."
- Leaving sooner: "'Take me off the list', in every email, deletes the entry at once."

Only the two numbers 40 and 30 are ever shown; the database deletes two days early (WB:404-411). Who sees full
addresses: Franky only, and each look is logged (WB:75-76). Code: the waitlist build on branch `landing-night`.

**R33. Emails we send.** S7:97 says the only automated emails are three and "We do not send marketing email, digests,
or activity emails." Now add: the waitlist confirm and invite emails (WB:70), each with a "Take me off the list" link
(WB:230-231); Vibe+ receipts, renewal reminders and notices (DEF:1623; H31); and the optional "Vibe news" tick
(WB:123, WB:455). Keep the live promise "We will not send marketing email without your consent" (LIVE-P:75). No news
email goes out until the LLC has a postal address and the person has ticked "Vibe news" (WP:635). Code: waitlist build.

**R34. Remove the cookie, analytics and multi-factor claims.** Live words: "strictly necessary cookies for sign-in
sessions and CSRF protection" (LIVE-P:65-67); "aggregate usage analytics that help us understand which features people
use" (LIVE-P:73); "turn on multi-factor authentication if your account email supports it" (LIVE-P:167-169). "none is
true; remove" (CO:102); DEF:1831; DEF:2018; CF:463. Replace with S7:193 (only sign-in cookies, no banner) and S7:292
("No two-factor authentication on Vibe accounts"). Do not add the waitlist plan's replacement analytics sentence
(WP:623-624): the counting it describes was cut from the build (WB:13, WB:570). Code: none.

**R35. Rewrite "What we do not collect".** S7:83-89. Still true per CO:23 and CF:407: no analytics or advertising
SDK. No longer safe as written: no push (R28), no payment details (R27), no government ID (R29), and "nothing separate
to download" (R10). Code: check each line.

**R36. Add the "eight kinds of information" table.** Exact table at CO:31-42, with the defender's edits (DEF:1842-1846,
B11): in "Made by verification" drop "verification date" until H8; in "Signed-in users only" replace "events, RSVPs,
follow lists" with "events, RSVP counts, follow lists"; new row "Who RSVP'd: you and the event's organizers"; in "Kept
after deletion" add "consent hashes, preservation copies, NCMEC material". Also drop "resumes" from "every Vibe user"
(R39). Code: H8, H3.

**R37. Otto and AI.** Keep S7:72 and S7:99: Otto is built in-house, nothing is sent to an AI vendor, and content is
not used to train AI models. The Terms repeat it (DEF:1546). Code: check it is still true.

### D. Who can see what

**R38. RSVPs are not visible to everyone.** S7:66 and S7:116 say every signed-in user sees RSVP status; LIVE-P:85-87
says other users see your RSVPs. The defender checked the code and found that wrong (DEF:19-23). Words to mirror
(DEF:1552): "how many people are going to an event is shown to everyone, but who is going is shown only to you and to
the event's organizers (the person who created it or, for a club event, the club's owner and admins)". Code: none
(policy `rsvps_select_own_or_manager`, already live per DEF:20).

**R39. Resumes open only for verified viewers.** S7:115 says any signed-in user who is not blocked. Correct words
(DEF:1552): "your résumé opens only for signed-in users with a verified school email whom you have not blocked, unless
you hide it, through short-lived links, with your redactions burned in." Code: none (already built, DEF:25).

**R40. Club officers row.** Exact (CO:25): "A club's owner and admins can see: the member list with roles and join
dates, the follower list with first-follow dates and how each person followed, join requests with the message written,
invites and their outcome, and who RSVP'd to the club's events. They cannot see anyone's email addresses, verification
date, login activity, or private messages outside the club's own chats." Add "(only for the club's own events)" and
"Nobody else sees who RSVP'd; everyone sees counts." (DEF:1832, B8). Moderators see join requests only (CO:41). S7:140-147
is the longer base text. Code: none.

**R41. What the open internet can see, and what a block cannot hide.** Base: S7:105-109 (profile card, public photo
links, club pages with recent posts and who posted them, post link previews). Add the honest block sentence (DEF:1645):
"A block cannot reach people who are signed out: your public profile card and any club posts you made can still be
seen by anyone on the internet". Code: none. H41 (signed-in-only profiles) would change it after launch.

**R42. When we read private messages: one rule.** Replace S7:138 (a general right to "check for content that breaks
the Terms") and CO:27 ("when a report or the law requires") with the Terms' single rule (DEF:1651): "We read private
messages only when one is reported to us, when we have specific evidence that a conversation is being used for spam,
threats, exploitation or another serious breach of these Terms, or when the law requires it." Keep S7:138's plain facts:
messages are not end-to-end encrypted, and there is no audit trail of administrative reads (also S7:293, S7:296).
Code: none.

**R43. Universities, emergencies and legal requests.** S7:181 says "Vibe sends nothing to IU or Purdue." The Terms now
have exceptions and point to this policy (DEF:1534): "We share information with a university only: when someone's life
or safety is at risk and we contact campus police or other emergency services; when you ask us to; or when the law
requires it (the Privacy Policy explains legal requests)." So the policy must have a legal-requests paragraph (base:
S7:189) that does not contradict it, and must mention preservation copies (R48). Code: none; process P20, P9.

**R44. Unverified logins and what they can read.** The companion says to write Franky's decision into the policy's
"who can see what" section (CO:117). Recommendation: keep browsing open at launch, but hide viewer identities and
last-active time from unverified logins (RES:73; DEF:1899 drops "resumes" because that is done). Until H16 ships, the
policy must say an unverified login can read what any signed-in user can. Code: H16 (later).

### E. Providers

**R45. The provider list has ten names, not three.** Live list: "Supabase (database, auth, storage), Vercel (hosting
and serverless functions), and Cloudflare R2 (media storage)" (LIVE-P:89-94). Full list (DEF:1819-1829, B7): Supabase;
Vercel; Cloudflare R2; Resend; Stripe; Sentry; Firebase Cloud Messaging (once push is on); Google Fonts (until H37);
Cloudflare cdnjs; Cloudflare Email Routing (forwards our inbox to Gmail). S7:153-173 already has the detailed table
for most of these and is the base. Also name what the defender's list leaves out: the Gmail inbox behind hello@
(S7:160), the Outlook inbox for vibe.llc@ (S7:13), and the web-push services of Apple, Google, Mozilla and Microsoft
(CF:414). Code: H37 removes Google Fonts; a yearly check of `package.json` is the defender's backstop (DEF:845).

**R46. Do not say providers act "on our instructions".** Live words: LIVE-P:92-93. S7:151 uses the softer "under
their published customer terms and privacy policies", and says there is no separate agreement with Google Fonts, cdnjs
or Gmail. Which wording is safe is a lawyer question (S7:151). Code: none.

### F. Keeping and deleting

**R47. Backups: remove "Encrypted backups may retain copies for up to 30 days".** Live words: LIVE-P:147-148. The
other documents say there are none: S7:217 ("We do not currently run automated database backups"), T2:250 ("We do not
currently keep our own database backups"). LIVE-D:236-238 says deleted data "can also sit in our hosting provider's
routine backups", with no number, and its own note says the number is unconfirmed (LIVE-D:47-49). All three pages must
say the same thing. Code: none; it follows Franky's Supabase Pro decision (CO:163; RES:87).

**R48. One list of what survives deletion, matching the Terms.** Companion list (CO:29) plus the defender's additions
(DEF:1835-1841, B10): the consent record with its hashes; the deleted-while-reported school hash; preservation copies
(legal holds); material kept for NCMEC. The full list the Terms will carry is at DEF:1729-1741 and the policy must not
say less. Also carry the lines only the delete-account page has: the email log keeps the domain and message id
(LIVE-D:221-227), the sign-in provider's security log keeps the address and IP (LIVE-D:229-233), and the moderation
log keeps the handle as it was (LIVE-D:187-192). Code: H3 revised and H30 before publish; H22 and H28 can follow.

**R49. The retention numbers, in one place.**
- Moderation records and report snapshots: "3 years after the case closes, then deleted or stripped of names and
  handles" (DEF:1841, DEF:1732). S7:212 says reports are kept indefinitely.
- Removed or reported media in the locked area: up to 1 year (T2:247; LIVE-P:156-160; LIVE-D:194-204).
- Ban record: "for as long as the ban lasts"; suspension record: "3 years after it ends" (DEF:1731).
- Consent record: 3 years after deletion (DEF:1734). Recovery evidence: 90 days after close (CO:19).
- Billing records: "generally 7 years" (T2:244). NCMEC material and legal holds: as long as the law or the request
  requires (DEF:1739-1740).
- Waitlist: up to 40 days, 30 if unconfirmed (R32).

Code: nothing deletes any of the first four today. No scheduled job exists and the moderation log refuses deletes
(DEF:14, DEF:939-948). They are calendar items (P14, DEF:2040); H28 must be live before Sept 2027. The policy should
use "up to" and "may", as the Terms do (DEF:1743).

**R50. How deletion works, matching the Terms.** Words (DEF:1719): "Settings → Danger zone, enter your password to
confirm, and your account is deleted at once. No grace period, no undo. Vibe+ is cancelled first, with no refund for the
rest of the period." If H7 misses the date, keep "type your handle to confirm" (DEF:1721), which is what S7:235 and
LIVE-D:105 say today. Failure wording (DEF:1724) replaces S7:239's "We never delete the account and leave your files
behind": "If removing your files fails part-way, we stop and your account is not deleted, so you can try again; Vibe+
has already been cancelled by then, and files already removed stay removed." Code: H7.

**R51. Say what deletion takes from other people.** "posts and events you made as a club officer are deleted with
your account today (H19 changes that), and messages you sent disappear from the other person's chat too." (CO:29).
Terms match at T2:235. Code: H19 would keep club content; H40 would keep messages as "Deleted account" (after launch).

**R52. The handle after deletion.** S7:262 says it "becomes available for someone else to register". Terms wording
(DEF:1525): "your old handle may become available to others, either at once or after a waiting period we set." Code:
H9 (90-day hold, recommended, not built). Franky's call 3 (RES:71).

**R53. When we close an account ourselves.** Words (DEF:1748): "If we delete an account ourselves, we remove its files
and records the same way as above, except what this section says we must keep, and we tell you at the login email first
unless the law or someone's safety says otherwise." No admin tool deletes an account today (DEF:13). Code: H34 (later).

**R54. Keep the section numbers the Terms point at, or fix the Terms.** The Terms cite "Privacy Policy, section 1"
for who can reach data (T2:7; DEF:1477), "section 8" for what happens to attached files and files deletion cannot find
(T2:108, T2:248; DEF:1741), and "section 9" for provider logs (T2:245; DEF:1736). In S7 those are sections 1, 8 and 9d.
The Terms' pointer to "section 5" for reading chats is removed by T9.9 (DEF:1609-1610). Code: none.

### G. Security

**R55. Say what is and is not done; no "industry-standard".** Live words: "We use industry-standard practices"
(LIVE-P:164-170). The defender: "The Privacy Policy may say 'we take reasonable steps to protect your data' only once
the pre-invite fixes have landed." (DEF:885). Base text: S7:280-296 (what we do; what we do not have: no two-factor, no
end-to-end encryption, no breach-list check, no outside audit, no audit trail). "role-based access for our team"
(LIVE-P:165-166) must match R7. Code: H11, H5(a), H7 are the pre-invite fixes (DEF:872-875).

**R56. Signing out and password changes.** Only say "Changing your password signs out your other devices" if H5(a)
ships; otherwise use the fallback (DEF:1707-1709). Code: H5(a).

**R57. Breach notice.** S7:298: notify affected users by email "without unreasonable delay and within the time
Indiana law requires", no number of days. Lawyer confirms the timing (S7:298). Code: none.

### H. Changes to the policy

**R58. Replace the live "Changes" section with the one-version rule.** Live words (LIVE-P:181-184) promise only
"reasonable notice (in-app or by email)". The Terms will say (DEF:1777): "The version of these Terms is the dated string
at the top. It also covers our Privacy Policy, Community Guidelines and Child Safety Standards: when we change any of
them in a way that matters, we publish a new version with a new date and ask every user to accept it the next time they
open Vibe". The policy must say the same, plus S7:320-322: using Vibe is never acceptance; small corrections add a
"Last corrected" line and do not change the version. Code: `TERMS_VERSION` bump and the new acceptance screen (section 6).

### I. Smaller items

**R59. Selling, advertising and marketing use.** Keep "We do not sell your personal information, share it with
advertisers, or use it to train AI models" (S7:99). Mirror the Terms' new promise (DEF:1546): "We do not use your name,
photo or content in advertising, marketing or app-store screenshots without asking you first." Whether showing viewer
names with Vibe+ is a "sale" is a lawyer question (J25). Code: none.

**R60. The wave tag.** An account made with an access code keeps `user_cohorts`: "the batch, form or founder, the day
let in and the day joined. Written when the code is redeemed, deleted with the account; no name, no address."
(WB:427-428). Code: waitlist build.

**R61. Report handling.** Replace S7:227's 7-day aim with the 24-hour aim and "People on the Vibe team review reports;
software does not decide them" (DEF:1651). Keep: reports are private, and the person reported is not told who reported
them (T2:187). A small word filter runs before posting (T2:133), so S7:227's "no automated moderation" needs care.
Code: H29 (urgent alerts, before publish).

**R62. Copyright contact.** S7:304 says no agent is registered and to write to hello@. The Terms will carry a
registered agent's address (T2:112; DEF:2030, P4, James, by Oct 14). Point to the Terms rather than repeat it. Code: none.

**R63. Rights and export.** Keep S7:231 (export by email to the sign-in address, within 30 days) and S7:326-328
(choices open to everyone; no sale; no automated decisions). Both carry open markers (sections 4 and 5). The live page
gives no time for export (LIVE-P:127-136). Code: none; it is done by hand.

**R64. New items only if they are built.** A club's own email address (DEF:1592; H12); the profile "I am" field
(CO:97); a verification date (H8); a "recognized by the university" line on club pages (CO:98). Do not describe them
before they exist.

## 2. Statements on the live Privacy page that the review called false

The live page is `src/app/legal/privacy/page.tsx`, dated September 28, 2026 (LIVE-P:20).

**Named by the review** (CO:102; ATT:631-648; DEF:818-843; DEF:2018; CF:463; RES:37):

| # | Live words | Line | Why it is wrong | Source |
|---|---|---|---|---|
| F1 | "strictly necessary cookies for sign-in sessions and CSRF protection" | LIVE-P:65-67 | No CSRF cookie exists; only the sign-in cookies | CF:409 |
| F2 | "To improve the Service: aggregate usage analytics that help us understand which features people use." | LIVE-P:73 | No analytics tool of any kind | CF:407 |
| F3 | "turn on multi-factor authentication if your account email supports it" | LIVE-P:167-169 | Vibe has no two-factor sign-in; the Terms say so | T2:57; CF:496 |
| F4 | "Vibe is for users 18 and older who are affiliated with a U.S. college." | LIVE-P:174-175 | Any email makes a login; only IU and Purdue addresses verify; enrollment is never checked | CF:444; ATT:1005 |
| F5 | "Supabase (database, auth, storage), Vercel (hosting and serverless functions), and Cloudflare R2 (media storage)" | LIVE-P:89-93 | Three named; at least ten exist, including Google Fonts on every page load and a Gmail inbox | DEF:819-839; CF:410-419 |
| F6 | "Encrypted backups may retain copies for up to 30 days" | LIVE-P:147-148 | There are no backups on the current plan | S7:217; T2:250 |
| F7 | "We do not knowingly collect information from anyone under 13." | LIVE-P:175-176 | Contradicts the 18+ rule; the drafts drop it | RQ:12; S7:312 |
| F8 | Nobody has accepted this page: it is dated Sept 28 but every account accepted the May 7 version | LIVE-P:20 | Only `TERMS_VERSION` asks again | ATT:695-696; CF:88 |

**Found in this pass, same kind of problem** (not named one by one in the review, but each clashes with a source):

| # | Live words | Line | The clash |
|---|---|---|---|
| F9 | "approximate location derived from IP" | LIVE-P:62-63 | "No geolocation code exists" (CF:400); S7:86 says never |
| F10 | "Pages you visit on Vibe, actions you take" | LIVE-P:60-61 | No analytics; S7:85 "We do not track which buttons you press". Only profile views, post views and last-active are recorded (CF:403-405) |
| F11 | "By using Vibe, you agree to the practices described here." | LIVE-P:23-25 | The Terms: using Vibe never counts as agreeing (T2:23) |
| F12 | "This is a baseline draft ... Review with qualified legal counsel" | LIVE-P:27-32 | T2:5 says never publish that line |
| F13 | "Other Vibe users see your ... RSVPs" | LIVE-P:85-87 | Only you and the organizers see who is going (DEF:19-23) |
| F14 | "They process data on our instructions under their own security commitments." | LIVE-P:92-93 | No agreement exists with Google Fonts, cdnjs or Gmail (S7:151) |
| F15 | "retaining a record of a banned account's identifier so the same actor can't simply re-register" | LIVE-P:151-154 | It stops only the same school email being verified again (DEF:1675) |
| F16 | "we remove your data from our live systems immediately" | LIVE-P:145-147 | True for most data, but the page then lists far less than what stays (LIVE-D:171-234; DEF:1729-1741) |
| F17 | "We use industry-standard practices ... role-based access for our team" | LIVE-P:164-166 | See R55; all three founders are admins and one reaches the database |
| F18 | "we will promptly remove the account" (a minor) | LIVE-P:176-177 | Terms: close, keep what the law requires (DEF:1692); Child Safety page: ban (LIVE-CS:144) |
| F19 | "we'll give you reasonable notice (in-app or by email) before they take effect" | LIVE-P:181-184 | No such notice mechanism exists; see section 6 |
| F20 | "school-verified '.edu' email" | LIVE-P:37 | Only @iu.edu and @purdue.edu verify (T2:37); code-facts call the label accurate (CF:445), so this is a tightening, not an error |
| F21 | The page never names CONNECTVIBE. LLC and gives only hello@ | LIVE-P:186-196 | The Terms name the LLC and three addresses (T2:296-297) |

**False or stale statements on the other live pages that the Privacy Policy must not repeat:**

- Community page: "Everyone here verified a school email, which means the person on the other end ... is a real student
  at a real school." (LIVE-C:34-36). Replacement text at CO:46.
- Child Safety page: "You need a verified school email to be here, and the Terms of Service require you to be 18 or
  older and enrolled at a U.S.-accredited college or university." (LIVE-CS:30-36). Replacement at CO:47.
- Live Terms: "operated by the Vibe team" (LIVE-T:24), "Monroe County" (LIVE-T:142), "Continued use ... means you
  accept the updated Terms" (LIVE-T:150-151).
- Delete-account page: "The code can't be turned back into an address." (LIVE-D:210-211); see R19.
- The Vibe+ page: "private from everyone, including from us on the free tier" is not true for the operator (DEF:15);
  new words at DEF:2014.

## 3. What the Terms v2 say that the policy must match

"v2" is the text in T2 as it stands. "v3" is the defender's ready-to-paste replacement, which becomes the Terms once
Franky answers RES. Where a v3 line exists, the policy should match v3, because that is what will publish.

| Topic | Terms section | Exact words | What the policy must say |
|---|---|---|---|
| Agreeing to both at once | Intro (T2:11); v3 at DEF:1480 | v3: "You agree to all of them at the same time you agree to these Terms, and when any of them changes in a way that matters, we ask you to accept again (Section 19)." | The same: one tick covers both; a change that matters means a new acceptance |
| The checkbox | §1 (T2:19) | "I'm 18 or older and I agree to the Terms of Service and Privacy Policy." | Quote it exactly (S7:29 already does) |
| The consent record | §1 (T2:21); v3 at DEF:1485 | "we record the version of these Terms..., the date and time on our server, that you confirmed you are 18 or older, and which screen you accepted on. We do not record your date of birth, IP address or browser details as part of that record." | List the same four things and the same three "not recorded" |
| Limited pages before accepting | §1 (T2:23) | "Settings (so you can delete your account or manage a subscription), the legal pages, and public profile, club and post links that anyone on the internet can see." | The same list (S7:27 adds direct post links needing a login; check) |
| Age | §2 (T2:27) | "You must be 18 or older. We rely on your confirmation at signup; we do not verify age." | 18+, tick only, no date of birth; never "under 13" |
| Who can hold a login | §2; v3 at DEF:1494 | "Anyone 18 or older may create a login with any email address." | The same; never "affiliated with a U.S. college" |
| What "verified" proves | §3 (T2:38) | "It proves one thing: that you controlled that address at that moment. It does not prove that you are enrolled, employed, admitted, or in good standing" | The same; never "student" |
| Accepted addresses | §3 (T2:37) | "`@iu.edu` and `@purdue.edu`, including their subdomains such as `@mail.iu.edu`. Retired addresses such as `@iupui.edu`, and other schools' addresses, are not accepted." | The same list (S7:24 agrees) |
| Campus | §3 (T2:40) | "which you choose yourself from a list. We do not verify it... it can be changed at most once every 45 days." | Self-chosen, not verified; the same number of days as the code (S7:26 says 30) |
| The badge | §3; v3 at DEF:1503 | v3: "It reads '@iu.edu verified' or '@purdue.edu verified', and the campus the person chose may appear next to it. It means 'verified school email', nothing more." | Use the same badge name |
| School email is private | §4 (T2:53) | "Your school email is only for verification and is never shown to other users." | The same |
| Checking the school email | §5 (T2:67) | "we send a link (valid 48 hours) or a short code (valid up to an hour)... We do not contact the university" | Same validity times (S7:213 says the code lasts 30 to 60 minutes) |
| No two-factor | §4 (T2:57) | "We do not offer two-factor authentication today" | The same; remove the live multi-factor line |
| Telling the university | §5 (T2:86); v3 at DEF:1534 | v3: "We do not send universities your information as a matter of course... We share information with a university only: when someone's life or safety is at risk and we contact campus police or other emergency services; when you ask us to; or when the law requires it (the Privacy Policy explains legal requests)." | The same three exceptions, and a legal-requests paragraph for the pointer to land on |
| No ads, no AI training, no sale | §7 (T2:102); v3 at DEF:1546 | v3: "We do not use Your Content to train AI models, and we do not sell or license it to anyone else. We do not use your name, photo or content in advertising, marketing or app-store screenshots without asking you first." | The same promises |
| Who can see what | §7 (T2:106); v3 at DEF:1552 | "The Privacy Policy has the full picture." then the short version quoted in R38 and R39 | The full picture, and nothing that contradicts the short version |
| Views | §7, new in v3 (DEF:1555) | Quoted in R23 | The same four facts |
| Edits and attached files | §7 (T2:108) | "no history is kept, and the post shows 'Edited'... what happens to attached files is set out in the Privacy Policy, section 8" | Section 8 must exist and cover attached files |
| Club officers | §9 (T2:143, T2:157) | "A club's owner and admins can see who follows it and remove a follower. A club's public follower count shows from 5 followers up." | The same (S7:109, S7:144) |
| Reading messages | §11; v3 at DEF:1651 | Quoted in R42 | The same three cases, no wider |
| Report handling | §11; v3 at DEF:1651 | "We aim to review reports within 24 hours... We keep a snapshot of what was reported" | 24-hour aim; the snapshot is data we keep |
| Intimate images | §11 (T2:190); v3 at DEF:1654 | "We remove it within 48 hours of a valid request... We keep a record of each request and what we did." | The request record is data we keep |
| Blocking | §11; v3 at DEF:1645 | Quoted in R41 | A block does not reach signed-out visitors |
| Vibe+ and payment | §10 (T2:171); v3 at DEF:1615-1618 | "Payment is handled by Stripe on Stripe's own pages; we never see or store your card number." / "You need a verified school email to buy Vibe+." | Stripe holds the card; we hold the customer id and status |
| The ban record | §12 (T2:199); v3 at DEF:1672 | Quoted in R19 | The same sentence about the scrambled copy |
| The login-email record | §12; v3 at DEF:1675 | "We keep a scrambled record of the banned account's login email as evidence, and we may use it to spot a returning account." | Disclose it; do not claim it stops re-registration |
| Appeals | §12; v3 at DEF:1686 | "Email help@connectvibe.app within 30 days... if you can't, or you already deleted the account, tell us the school email that was on it" | help@, 30 days; an appeal may involve the school email |
| Under 18 | §12 (T2:211); v3 at DEF:1692 | Quoted in R14 | The same |
| Recovery evidence | §13 (T2:219); v3 at DEF:1697-1702 | "a reply from the school email...; a change we describe, made from a device where you are still signed in; or a short video call in which your face matches photos... a photo of a student ID with the number covered, can support a request" | List these as data we may receive; kept 90 days after close |
| Deleting your account | §14 (T2:233-235); v3 at DEF:1719-1724 | Quoted in R50 | The same steps and the same failure wording |
| What stays, name removed | §14 (T2:237) | "clubs you created...; chats you added people to; join requests and invites you handled; reports you filed, kept for safety with the reporter field cleared" | The same (S7:249-254) |
| What stays because it must | §14 (T2:239-248); v3 at DEF:1729-1741 | Eleven bullets; see R48 and R49 | The same list and the same periods |
| Backups | §14 (T2:250) | "We do not currently keep our own database backups, so we cannot restore deleted data for you or for anyone." | The same; remove the live "30 days" line |
| When we close an account | §14; v3 at DEF:1748 | Quoted in R53 | The same |
| Changes | §19 (T2:281); v3 at DEF:1777 | Quoted in R58; also "Minor corrections... do not change the version; we add a 'Last corrected' line... Continued use is never acceptance." | The same rule |
| A new owner | §20 (T2:288) | "we will tell you before your data transfers to a new operator" | The same (S7:185) |
| Notices | §20 (T2:290); v3 at DEF:1784 | "Notices to you go to your login email or appear in the app, so keep your login email current." | Policy-change and breach notices go to the login email |
| Contact | §21 (T2:297) | "Users: hello@connectvibe.app · Safety, appeals, takedowns, child safety: help@connectvibe.app · Legal notices: vibe.llc@outlook.com" | The same three addresses with the same jobs |
| Scope | Intro (T2:7) | "the website at connectvibe.app, the Vibe apps for iPhone and Android" | The same scope |
| Who reaches data | Intro (T2:7); v3 at DEF:1477 | v3: "All three moderate Vibe: they review reports and can see what was reported, including reported messages, and the records of what we did about it. Only one of them, Francisco Cazares, has direct access to the database and the other systems that store your data (Privacy Policy, section 1)." | Section 1 must say this (R7) |

Terms v2 lines the defender found wrong, which the policy must not copy: RSVPs "visible to everyone signed in"
(T2:106); resumes visible to any signed-in user who is not blocked (T2:106); "we never send a reset link to an address
that is not on the account" (T2:219, removed at DEF:1704); "it cannot be turned back into the address" (T2:199); "We
never tell your university" (T2:86); "nothing is deleted ... we never delete the account and leave your files behind"
(T2:235).

## 4. Open decisions that change the policy's words

"Franky" means a product call. "Lawyer" means James takes it to counsel. The numbering of Franky's calls is from RES:67-87.

| # | Decision | Recommendation the documents give | Whose | Words it changes |
|---|---|---|---|---|
| D1 | Publish order: do the waitlist's Privacy lines go live before the full rewrite, or does everything wait for the Terms? | None written. WB:452 says the lines go live first; DEF:2053 says the rewrite publishes with the Terms. See section 6 | Franky | Whether there is an interim page |
| D2 | Keep a consent record after deletion (call 2; CO:150) | Yes, 3 years | Franky, then lawyer (J2) | R21, R48 |
| D3 | Reserve a deleted handle (call 3; CO:151) | Yes, 90 days | Franky | R52 |
| D4 | Vibe+ for unverified logins (call 4; CO:153) | No | Franky | R13, R23 |
| D5 | Browsing without verification (call 5; CO:154) | Keep for launch month; hide viewer identities and last-active from unverified logins | Franky | R44 |
| D6 | Verified clubs give a club school email (call 7; CO:156) | Yes | Franky | R64 (new data) |
| D7 | Password instead of handle to delete (call 8; CO:157) | Yes | Franky | R50 |
| D8 | A minor found (call 9; CO:158) | Close, keep what the law requires, free the school email at 18 | Franky, then lawyer (J1) | R14 |
| D9 | Private viewing (call 11; DEF:1956) | Yes, before billing turns on | Franky | R23 |
| D10 | A deleted account's messages stay as "Deleted account" (call 12; DEF:1957) | Yes, after launch | Franky | R51 |
| D11 | Badge text (call 15; DEF:1962) | "@iu.edu verified" / "@purdue.edu verified", campus beside it | Franky | R15 |
| D12 | Postal address (call 18; CO:160) | The registered agent's address; never a home address | Franky and James; lawyer confirms | R9 |
| D13 | Supabase Pro and backups (call 19; CO:163) | Before students arrive; until then say "no backups" | Franky | R47 |
| D14 | Non-students with a school address, and an "I am" field (call 1; CO:149) | Allow; must be truthful; add the field | Franky | R15, R64 |
| D15 | Use the login-email record to refuse sign-ups (CO:159, CO:166; DEF:1915) | Yes; "it is a privacy disclosure, not a secret" | Franky | R19, R20 |
| D16 | Profiles signed-in only (DEF:1959, I23) | Yes, after launch | Franky | R41 |
| D17 | Reading messages: reserved right or only on a report (S7:138) | Settled in the Terms rewrite by the three-case rule (DEF:1651) | Franky to confirm; lawyer (J12) | R42 |
| D18 | Logged-out profile shows the full card (S7:105) | Draft assumes today's behaviour, disclosed | Franky | R41 |
| D19 | Public club pages show member posts and authors, even for invite-only clubs (S7:109) | Draft assumes as-is, disclosed | Franky | R41 |
| D20 | Export window (S7:231) | "within 30 days" | Franky; lawyer (Sept 7 Q6) | R63 |
| D21 | Retention for notifications and profile-view history (S7:211) | Draft assumes kept until account deletion; suggests 90 days | Franky | R49 |
| D22 | A scheduled prune for rate-limit counters (S7:80) | Add one, then say "deleted after one day" | Franky | R24 |
| D23 | State each provider's storage region (S7:162) | Draft keeps "we will confirm on request" | Franky | R45 |
| D24 | Confirm Resend and Sentry log retention (S7:268-269; LIVE-D:47-49) | State the number once confirmed in each dashboard | Franky | R48 |
| D25 | A separate Privacy version in the consent record (S7:318) | Draft assumes one version for both; the defender's one-version rule agrees (DEF:1777) | Franky | R58 |
| D26 | Self-host the fonts (H37; DEF:841) | Can follow publish | Franky | R45 (Google Fonts comes off the list) |
| D27 | Fix leftover files on delete (image posts, message attachments, replaced photos) (S7:202-206) | Fix in code, then simplify the text | Franky | Section 8 of the policy |
| D28 | How long waitlist data is kept | Founder's rule already made: 40 days, 30 unconfirmed (WB:397, WB:404). WP:642 still lists it for the lawyer | Franky decided; lawyer may confirm | R32 |
| D29 | How long to keep removed or reported media ("up to a year") | Kept "until the lawyer says how long" (DEF:14) | Lawyer (J22, J17) | R49 |
| D30 | Moderation-record period (T2:242) | 3 years after the case closes (DEF:1732) | Lawyer | R49 |
| D31 | Promise to tell users about legal requests where allowed (S7:189) | Draft assumes no such promise | Lawyer | R43 |
| D32 | Breach-notice timing (S7:298) | No number of days stated | Lawyer | R57 |
| D33 | Any state-law or EU/UK section (S7:328) | None beyond one paragraph | Lawyer | R63 |
| D34 | Drop the under-13 text; is the tick enough (S7:312) | Tick only, no under-13 text | Lawyer (J1) | R11, R12 |
| D35 | Provider wording: "under their published customer terms" or stronger (S7:151) | The softer wording | Lawyer | R46 |

## 5. Lawyer questions that touch privacy

One list, merged from four places: the Sept 7 reviewer questions (RQ) and the markers inside S7; the companion's J1 to
J18 (CO:168-187); the defender's J19 to J28 and extensions (DEF:1970-1985); and the waitlist notes (WE:350-364;
WP:637-642). Questions that are only about money, clubs or the courts are left out. James runs this list.

**Age and children**

- L1. Is a tick-box "I'm 18 or older" enough, and what do we do with the account and data of a 17-year-old we find?
  May the under-13 sentence be dropped? Does keeping a scrambled school email cause a problem once that person turns
  18? (RQ:11-14; S7:312; CO:170, J1)
- L2. Reporting to NCMEC (18 U.S.C. § 2258A): confirm the procedure. The one-year preservation after a report: how do
  we store the material lawfully, who may open it, and how is it deleted afterwards? Is the public CyberTipline form
  enough until we are registered? (CO:186, J17; DEF:1975)
- L3. App-store rules: the 18+ rating, Apple's and Google's required wording, and Texas SB 2420 and similar state
  laws on age checks in store apps. (CO:183, J14)

**Agreement and what outlives an account**

- L4. Is one tick for both documents an enforceable agreement? Should the Privacy Policy carry its own version, or is
  one version for the whole set right? (RQ:16-19; S7:318)
- L5. Should a small consent record survive deletion, and for how long? (RQ:21-24; CO:171, J2)
- L6. The scrambled copy of a banned school email kept after deletion: is it personal data we must disclose, and can
  a person demand that we delete it (Indiana's privacy law; California's if it ever applies)? The same question now
  covers the login-email copy and the copies inside the consent record. (CO:172, J3; DEF:1802-1810)
- L7. How long may moderation records and report snapshots be kept? The drafts say 3 years after the case closes.
  (T2:242; DEF:1732)
- L8. How long may removed or reported photos and videos be kept in the locked area? Today "up to a year", pending
  this answer. (DEF:14; LIVE-D:28; `handoffs/s72-prep/notes/todo.md:62`)

**Promises one person has to keep by hand**

- L9. Which are safe to make: export within 30 days; breach notice "without unreasonable delay and within the time
  Indiana law requires" (confirm Ind. Code 24-4.9 timing); the 24-hour review aim; the 48-hour intimate-image removal;
  the recovery reply time. (RQ:36-39; S7:298; CO:175, J6)
- L10. Should the policy promise to tell a user about a legal request for their data where the law allows? (S7:189)
- L11. Is "under their published customer terms" the right way to describe our providers, or do their terms support a
  stronger sentence? (S7:151)

**Reading, keeping and handing over**

- L12. Reading private messages on a report or on specific evidence: is the wording safe under the Stored
  Communications Act and wiretap law? (CO:181, J12; RQ:38)
- L13. TAKE IT DOWN Act: are we a covered platform; what records of requests and removals must we keep; may we keep a
  removed intimate image as evidence, and for how long? (CO:176, J7; DEF:1979, J22; LIVE-C:1-5)
- L14. Account recovery: may we ask for an ID photo or a video call, and what must we keep or delete afterwards?
  (CO:180, J11)
- L15. Preservation: what must we do for a private lawyer's letter, a subpoena, and a police request under § 2703(f)?
  May we pause a person's own deletion during a hold? (DEF:1981, J24)
- L16. Emergency disclosures to campus police: is the Terms wording safe, and does it clash with anything in the
  Privacy Policy? (DEF:1983, J26) Related: when a professor or official is impersonated, is there a duty to tell the
  university, or a risk in not telling? (CO:187, J18)

**The business model and the founders**

- L17. Showing viewer names with Vibe+: exposure under the FTC Act and Indiana consumer law. Is a free private-viewing
  setting enough? (DEF:1982, J25) Indiana's definition of a "sale" matters as Vibe grows (ATT:721).
- L18. Can a regulator name Franky personally as the only person with database access? What records show reasonable
  security? (DEF:1978, J21) Insurance, including cyber cover, before launch. (DEF:1977, J20)
- L19. Is "no scraping" plus rate limits enough, or should commercial use be forbidden outright? (CO:184, J15)
- L20. A consent form for showing students in teasers and store screenshots. (DEF:1984, J27)
- L21. Is the notice that club officers can see followers enough? (RQ:41-44)

**Where Vibe is and what it calls itself**

- L22. Which postal address do we publish when the LLC has none: the registered agent's, a PO box, or none? It is
  needed before any news email, for the copyright agent and for the store listings. (RQ:31-34; S7:13; CO:174, J5;
  WE:354-356; WP:639)
- L23. Is any state privacy notice, or an EU/UK notice, needed now? Vibe is far below the Indiana and California
  thresholds. (RQ:33; S7:328)
- L24. Using the IU and Purdue names, including on the public waitlist page. (CO:178, J9; WE:359; WP:641)

**The waitlist**

- L25. Is the "you're in" invite email a transactional or relationship message under CAN-SPAM, and what counts as
  promotional after that? (WE:352-353; WP:638)
- L26. Are prizes for answering a survey allowed? The notes say none until this is answered (WP:452; WE:357-358). The
  survey itself is not in the current build (WB:13).
- L27. How long should waitlist data be kept? (WP:642) The founders have already set 40 days (WB:404); the lawyer is
  asked only to confirm.
- L28. If cohort numbers or survey answers were ever published or used for class work, would university research
  rules apply? (WE:360-362; WP:481-482)

Counts: the Sept 7 list had 7 questions; the companion has 18 (J1 to J18); the defender added 10 (J19 to J28) and
extended J8 and J17; the waitlist notes add six, two of which repeat J5 and J9. The 28 lines above are the ones that
bear on the Privacy Policy.

## 6. How publishing works today

**The version.** `src/lib/legal/terms.ts:1` reads `export const TERMS_VERSION = "2026-05-07";`. It has not changed
since May 7 (CF:79, CF:88). A person's agreement counts only when three things are all present: a time they agreed, a
time they confirmed 18+, and a stored version equal to the current one (`src/lib/legal/terms.ts:22-26`). Anything else
sends them to the acceptance screen at `/auth/terms` (CF:80).

**What re-acceptance shows today** (CF:81-85; the screen is `src/app/auth/terms/accept-terms-form.tsx:146-190`, not
read in this pass):

- Headline: "One quick thing."
- Body: "We now record your agreement to the Terms of Service and Privacy Policy, and that you're 18 or older — the
  age the Terms require. One tap and you won't see this again."
- The same checkbox as signup, plus "delete your account" or sign out.

It does not say anything changed, or what changed. The review says that may mean the new documents bind nobody
(RES:36; DEF:1000-1008). The replacement copy is written out (DEF:1011-1022): headline "We've updated our Terms"; body
"Our Terms of Service, Privacy Policy and Community Guidelines have changed. The main changes are below. Please read
them before you continue."; three to five "main changes" lines; links to all three documents; the same checkbox;
buttons "Agree and continue", "Sign out", "Delete my account". The five lines written for the first publish are about
the Terms (DEF:1015-1019). None of them is about privacy, so the Privacy rewrite should supply one or two.

**Does a Privacy-only change re-prompt anyone? No.** "Privacy changes do not trigger re-consent: only `TERMS_VERSION`
gates it" (CF:88). The live Privacy page is dated September 28 (LIVE-P:20), yet every account accepted under the May 7
version, so "by Vibe's own rule, nobody has accepted the current Privacy Policy" (ATT:695-696). Publishing the new set
with a new `TERMS_VERSION` fixes that, because every account then accepts all of it (DEF:897).

**What the live Privacy page promises about changes** (LIVE-P:180-184, section "8. Changes"):
> "If we make material changes to this Policy, we'll give you reasonable notice (in-app or by email) before they take
> effect."

Nothing in the documents describes a mechanism that sends that notice. The page was changed on or before Sept 28
without one.

**What the live Terms say** (LIVE-T:146-152): "If a change is material, we'll give you reasonable notice (e.g., an
in-app notice or email). Continued use of the Service after the effective date of the update means you accept the
updated Terms." The new Terms say the opposite ("Continued use is never acceptance", T2:281).

**The rule the review adopts** (DEF:2041, P15): "Any material change to the Terms, Privacy Policy, Community Guidelines
or Child Safety Standards bumps `TERMS_VERSION`, and the acceptance screen gets 3–5 'main changes' lines." Small
corrections do not bump it; they add a "Last corrected" line (T2:281; S7:322).

**The publish gate** (DEF:2050-2068): all Terms changes applied; the Privacy Policy "rewritten ... and published the
same day, under the same version bump"; the app copy changes; eight cheap code items (H3 revised, H5(a), H7, H20, H23,
H25, H29, H30); the process items. Target date about Oct 14 (DEF:69; ATT:648). Each bump re-prompts every existing
account (RQ:49).

**The waitlist is on a different clock.** The waitlist form records its own notice version, `"2026-10-03"`
(WB:178; column `notice_version`, WB:124), separate from `TERMS_VERSION`. Its runbook says the Privacy lines must be
live before anything else starts (WB:452-453). If the waitlist opens before Oct 14, that is a Privacy-only change made
ahead of the version bump. People on the waitlist have no account, so no one is re-prompted, but it sits awkwardly with
P15 and with the live page's own "reasonable notice" promise. This is decision D1.

## 7. Conflicts between the sources

Order of age, oldest first: live Terms (May 7); S7 and RQ (Sept 7, re-checked Sept 17); live Child Safety (Sept 27);
live Privacy, Community and Delete-account pages (Sept 28); CF, T2, CO (Sept 29); ATT, DEF, RES (Sept 30); WP and WE,
then WB (Oct 3; WB "replaces PLAN.md wherever the two differ", WB:4). Unless a row says otherwise, the newest wins.
"Check" means the sources cannot settle it and the code must.

| # | Topic | The sources disagree | Newest, and what to use |
|---|---|---|---|
| X1 | Who can reach data | S7:13: only Franky; James and Rylan read one inbox "and nothing else". CO:27: the three cofounders "can see everything above plus login and school emails". DEF:1834: all three see reports, snapshots, removed content and restriction records; emails are not shown to them; only Franky reaches the database; all read hello@, help@ and vibe.llc@. WB:75-76: on the waitlist only Franky can reveal a full address | DEF (B9), plus WB for the waitlist |
| X2 | A record of banned accounts | S7:272: "We do not keep a 'banned users' list or any record of deleted accounts". CO:16-17 and T2:199: a scrambled school email is kept and survives deletion. LIVE-D:207-213: kept for suspensions and bans, from both emails. DEF:1731 and DEF:1799: login-email copy for bans only | DEF. S7 is out of date. Needs H30 for "bans only" |
| X3 | The consent record after deletion | S7:316 and LIVE-D:152-154: deleted with the account. T2:243 and CO:29: user id, version, time, 3 years. DEF:1802-1804: versions, times and scrambled emails, 3 years | DEF, if H3 ships and Franky says yes (D2). Otherwise S7 |
| X4 | Who sees RSVPs | S7:66, S7:116, T2:106, LIVE-P:85-87: every signed-in user. CO:25: officers see who RSVP'd. DEF:19-23: only the person and the organizers; everyone sees counts | DEF (it checked the code) |
| X5 | Who can open a resume | S7:115 and T2:106: any signed-in user not blocked. CO:117 lists hiding resumes from unverified logins as still to do. DEF:25: already verified viewers only | DEF |
| X6 | Who sees profile viewers | S7:76, S7:120, S7:125: the owner sees their 25 most recent viewers, free. S7:77: post views show only a count. CO:38, T2:167: counts free, names with Vibe+, for profiles and posts. DEF:24: blocks hide names; signed-out views are not recorded | DEF (B5) |
| X7 | Reading private messages | S7:138: a general right to check for rule-breaking. CO:27: "when a report or the law requires". T2:189: "when we have reason to think these Terms are being broken". DEF:1651: reported, specific evidence of a serious breach, or the law | DEF |
| X8 | Time to review a report | S7:227: 7 days. LIVE-C:143, LIVE-CS:114, T2:189: 24 hours. DEF:1651: a 24-hour aim, not a promise | DEF |
| X9 | What a report keeps | S7:227: no copy of the post's text; messages and chats cannot be reported from a menu. T2:187-189 and LIVE-D:178-182: a snapshot is kept; posts, comments, messages, chats, events, clubs and people can be reported | T2 and LIVE-D |
| X10 | Campus change | S7:26 and RQ:50: once every 30 days. T2:40: once every 45 days | Check. T2 is newer and was checked against the Sept 29 audit |
| X11 | School code validity | S7:213: 30 to 60 minutes. T2:67: "up to an hour" | Same fact, looser words; use T2 |
| X12 | Sign-up | S7:24: four steps; without a school address "you cannot get past step 3". DEF:1494: an unverified login can read what signed-in users see and do a short list of things. WB:61-69: while sign-up is closed, a new account needs an access code. LIVE-T:40-43: must be "enrolled" with "a working '.edu' email" | DEF for what a login can do; WB for the access code. T2:28's "Anyone ... may create a login with any email address" is not true while the waitlist gate is on, and the Terms need the same fix |
| X13 | A minor found | LIVE-P:176-177: "promptly remove the account". S7:310: delete it and its data. T2:211: close and delete. LIVE-CS:144-147: ban. DEF:1692: close, take content down, delete except what the law requires, free the school email at 18 | DEF |
| X14 | Under-13 sentence | LIVE-P:175-176 has it. S7:312 and RQ:12 drop it | S7, subject to the lawyer (L1) |
| X15 | Backups | LIVE-P:147-148: encrypted backups, up to 30 days. S7:217 and T2:250: none. LIVE-D:236-238: "routine backups", no number. CO:163: buy Supabase Pro before students arrive | S7 and T2 today; changes with D13 |
| X16 | Providers | LIVE-P:89-93: three. S7:153-173: Supabase, Vercel, Cloudflare, Resend, Sentry, Google, plus Google Fonts and cdnjs. DEF:1819-1829: ten, adding Stripe and Firebase. WB:458-459: Supabase, Vercel, Resend for the waitlist. CF:414 also lists web-push endpoints run by Apple, Google, Mozilla and Microsoft, which no list names | DEF's ten, plus the Gmail and Outlook inboxes and the web-push services |
| X17 | Push notifications | S7:87: no part of Vibe asks for push permission. CO:21 and CF:401: a push-devices table exists | CO; check whether push is live |
| X18 | Payment data | S7:88: no payment details. CO:20, T2:171: Stripe customer id and status; never the card | CO |
| X19 | Emails Vibe sends | S7:97: three automated emails; "We do not send marketing email". LIVE-P:75: no marketing email "without your consent". WB:70, WB:123: two waitlist emails and an optional news tick. DEF:1623: Vibe+ notices | WB and DEF: list all kinds; marketing only with the tick, and not before a postal address exists (WP:635) |
| X20 | Waitlist retention | WP:476-479 and WE:329-330: deleted on leaving; 60 days after public launch for people who never join; answers dropped when the pilot ends. WB:404-411 and WB:460-461: up to 40 days whatever happens, 30 if unconfirmed | WB |
| X21 | Usage counting | CO:102: the analytics line is untrue; remove. WP:623-624 and WE:302-305: reword it to "we count, from our own database, how many people use features and come back each week". WB:13 and WB:570: that counting and the survey are not in the build | WB: remove the line; do not add the replacement or a survey line |
| X22 | Website or apps | S7:21: "Vibe is a website; there is nothing separate to download or install." T2:7: the website and the iPhone and Android apps | T2, once the apps exist |
| X23 | Universities | S7:181: "Vibe sends nothing to IU or Purdue." T2:86: "We never tell your university". DEF:1534: three exceptions | DEF |
| X24 | Confirming deletion | S7:235, LIVE-D:105, T2:233: type your handle. DEF:1719: enter your password | DEF if H7 ships; otherwise the handle |
| X25 | A failed deletion | S7:239 and T2:235: nothing is deleted; "we never ... leave your files behind". DEF:1724: Vibe+ is already cancelled and removed files stay removed | DEF |
| X26 | The handle after deletion | S7:262 and T2:61: free at once. DEF:1525: at once or after a waiting period | DEF |
| X27 | Club content when an officer deletes | S7:251, S7:258: the club and its own storage are not affected. T2:104 and CO:29: posts and events made as the club are deleted with the account. LIVE-D:164-165: "your posts, uploads and role in it are removed" | T2 and LIVE-D for posts and events. Whether club-storage files survive: check |
| X28 | Leftover files after deleting one item | S7:200-206: image-post files, message attachments and replaced photos stay in storage. LIVE-D:15-17 notes storage changes B1 to B3 dated Sept 28 | Check; S7 may be out of date |
| X29 | The scrambled-copy sentence | CO:16, T2:199, LIVE-D:210-211: "cannot be turned back into the address". DEF:953: only "without a secret key that only our servers hold" | DEF |
| X30 | Contact address | S7: hello@ for everything. LIVE-P:128-135: hello@ for export. LIVE-D:120, LIVE-C:276, LIVE-CS:94: help@. T2:297: three addresses. DEF:1519 moves login-email changes from hello@ to help@ | T2 with DEF |
| X31 | Postal address | S7:13: none, and none needed at this size. CO:160 and RES:86: the registered agent's address. WE:93-94: the LLC has none, so no marketing mail | CO; waits on James's filing (D12) |
| X32 | Verification date | CO:15 lists "Verification status and date" as collected. CO:18 says the date is "Not recorded today". DEF:1798 settles it: status only until H8 | DEF |
| X33 | Copyright agent | S7:304: no agent, email only. T2:112 and DEF:2030: James registers one before publishing | T2 |
| X34 | Publish order | DEF:2053: the Privacy rewrite publishes with the Terms under one version bump. WB:452: the waitlist's Privacy lines must be live before the waitlist starts | No source settles it (D1) |
| X35 | Policy changes | LIVE-P:181-184: "reasonable notice (in-app or by email)". S7:320: asked to accept again. DEF:1777: one version covers all four documents | DEF |
| X36 | What the consent record calls its source | S7:43, T2:21: "at signup or on the re-consent screen". DEF:1485: "which screen you accepted on" (a third source, `confirm`, arrives with H11) | DEF |
| X37 | Verification wall | S7:27 lists pages reachable "before finishing those steps"; T2:28: "the campus pages ask you to verify before they open". DEF:1494: "a step in the app, not a privacy wall" | DEF |

**Not conflicts, but easy to miss.**

- The live Privacy page has a photo-location paragraph (LIVE-P:48-54) that no draft has (R26).
- The delete-account page (LIVE-D:171-234) is the most detailed and newest live statement of what is kept. The new
  Privacy Policy and that page must agree line for line, including the sign-in security log and the email log.
- The defender's ready-made lists stop at Sept 30. They do not know about the waitlist, the access code, the wave
  tag or the 40-day rule.
- S7:13's picture of the founders' roles (James and Rylan read only the Outlook inbox) predates their work as
  moderators; DEF:850 confirms all three are admins.
- X12's note that the Terms need the access-code fix too is this pass's own reading of WB:61-69. No source says it.
