# Terms v2: what happened when we attacked it (for Franky, 2026-09-30)

**Stop here and read this before anything else gets written.** Your thoughts decide v3.

## What we did

1. Wrote a new Terms of Service (`02-terms-of-service-v2.md`, 21 sections) from everything we know about Vibe, the three of you, the LLC, the clubs, Vibe+, bans and recovery, using ChatGPT's frame as the checklist. Every claim in it was checked against a read-only audit of the code (`00-code-facts.md`). A companion file (`03-companion.md`) carries the privacy changes, the club rules, the recovery runbook, the copy fixes, the engineering list, your decisions and the lawyer questions.
2. An **attacker** played nine people trying to hurt you: a malicious user, a banned user coming back, an impersonation victim, a former club officer, a new officer, a university, a privacy regulator, a consumer regulator and a plaintiff's lawyer. It found **54 loopholes** (`10-attacker-round1.md`): 7 critical, 23 high, 21 medium, 3 low.
3. A **defender** played your lawyer and the operator who has to keep every promise with no staff. It answered all 54 with a verdict, a fix and a cost (`11-defender-round1.md`), and re-checked the code where the attacker cited it.

One honest note: both players ran on this Mac in separate work folders, not in a cloud environment. The cloud hand-off was blocked because the turn was triggered by an agent's report instead of your message. Nothing was lost, but the laptop had to stay awake.

## The score

| | |
|---|---|
| Attacks that the draft already handles | 2 |
| Attacks where the draft helps but has a gap | 31 |
| Attacks where the attacker is right | 21 |
| Closable with cheap fixes (an hour or so each) | 43 of 54 |
| Fixes that cost money | insurance only (a lawyer question) |

**The single most important sentence from both sides:** the Terms themselves are mostly honest. The damage comes from the words *around* them. The profile badge says "🎓 Student". The club list says "Officially recognized". The Community Guidelines say everyone here "is a real student at a real school". The ban notice says "a new account can't post". The acceptance screen says "One quick thing… you won't see this again". A plaintiff will quote those, not section 5. They have to change on the day the Terms publish, or before.

## The ten outcomes that matter, ranked

Each one says what would actually happen and what closes it. "Words" means a change to the Terms or a page; "code" means a build; "process" means one of you doing something on a schedule.

1. **A stranger signs up with a student's address before the student does; when the student later confirms, the stranger's password works, and it keeps working after a password reset.** Every hijacked student is a clean lawsuit, and our own Sept 27 review already found the bug. *Closes with code: delete unconfirmed sign-ups after 24 hours, require a new password at confirmation, sign out other devices on a password change. Must be live before the first student invite. The landing page must stop saying "Sign up with your school email."*
2. **A 17-year-old ticks the box, is pressured into sending an image, we remove it, and nobody reports it to NCMEC because we are not registered.** Then the Terms tell us to delete her data, which the law says we must preserve for a year. Uncapped exposure with the worst possible facts. *Closes with process and words: register with NCMEC now and use the public CyberTipline form until then; change "delete its data" to "close the account and keep only what the law requires"; the lawyer confirms the preservation rules.*
3. **A hijacked account posts something ban-level; we ban it; the innocent student's school email is burned forever, and the appeal has to come from a login email the attacker now controls.** *Closes with words and process: a takeover exception with no time limit, appeals from any address with evidence, and a check for takeover signs before any first-time ban of an older account.*
4. **Vibe's own badge vouches for an impostor.** Someone verifies their own IU address, names the profile after a classmate, and the app prints "🎓 Student · IU Indianapolis" next to her name. Section 230 protects what users post; it does not protect Vibe's word "Student". *Closes with copy: three strings, before the Terms publish. Recommended badge text: "@iu.edu verified", campus beside it rather than inside.*
5. **Flat promises turn into a lawsuit that gets past Section 230.** "A person reads every report", "we remove it within 48 hours", "the new account is banned when found". Courts have let harmed users sue over a platform's own specific promises. *Closes with words: every timing becomes an aim, except the 48-hour intimate-image removal, which the law itself sets, so it stays and needs a rota behind it.*
6. **One club president deletes a verified club in one click, with no backups**, the night before Rylan's demo or after losing an election. One of the ten clubs gone, with its whole semester. *Closes with code, cheap: a verified club can't be deleted in the app; we delete after 7 days' notice to the other officers.*
7. **The 48-hour intimate-image clock is federal law and nobody is on call.** A request lands on a Friday in finals week in an email alias. *Closes with process: one founder on duty each day checks help@ and the report queue morning and evening, weekends included, with phone alerts on "Intimate image removal" and "URGENT:", plus a log of every request. This is the only standing time commitment we keep because the law forces it.*
8. **The re-acceptance screen may mean v2 binds nobody.** It says "One quick thing… one tap and you won't see this again". It never says the Terms changed or what changed. If a court agrees, the May 7 page governs: "the Vibe team", Monroe County, no subscription terms, "baseline draft". *Closes with copy: "We've updated our Terms. The main changes: …", a link, and a clear "I agree".*
9. **The live Privacy Policy describes a different app.** It lists three providers; the real list is ten, including Google Fonts on every page load and a personal Gmail behind hello@. It claims a CSRF cookie, analytics and multi-factor authentication that don't exist. Apple and Google compare this page with the app. *Closes with a rewrite published the same day as the Terms, under the same version bump.*
10. **"Only one cofounder can reach your data" is false in the first paragraph.** All three of you moderate and read reported content, restriction notes and removed posts. *Closes with words: say all three moderate and see reported content, and only Franky reaches the database.*

**Two that only matter when billing turns on:** a suspended subscriber can't reach the cancel button (a button on the notice fixes it), and the Terms sell "extra profile customization" that doesn't exist (delete the half-sentence). Keep production billing off until those, the checkout confirmation email and the Stripe renewal reminders are done.

## What the attacker got wrong, so you don't lose sleep

- **"RSVPs are a map for a stalker."** False. The defender checked: a person sees only their own RSVPs, organizers see the list, everyone else sees a count. Our Terms actually overstated RSVP visibility and get corrected.
- **"A wave of graduate chargebacks gets the Stripe account shut."** Overstated at our size; card networks act at roughly 100 disputes a month. Each one still costs a fee, so renewal reminders are worth turning on.
- **"An FTC order with Franky's name on it."** That case followed a breach of millions after years of warnings. A 20-account pilot that fixes its own review's findings before inviting students is the opposite story. It becomes real only if the known fixes don't land.
- **"No proof anyone agreed."** Courts accept proof of how signup works plus proof the person had an account. Keeping a small consent record after deletion is still worth an hour, because it shows which version.
- **"A harasser deletes the evidence."** Senders can already delete their own messages one at a time, like every messaging app. Evidence comes from screenshots and from saving the thread when a message is reported, not from changing what account deletion does.
- **"No class waiver is urgent."** A class waiver without arbitration is weak, and arbitration invites mass-arbitration fees that can cost more than a class action. Plain courts plus a small-claims line is the right call at this size; revisit at about 1,000 users.

## What the defense fixed on paper versus what needs code

- **Words (the Terms):** 79 specific replacements, all written out and ready to paste. Promises become aims. Five sentences that described the code wrongly are corrected. The club license becomes its own license that survives the officer. Recovery gets a 7-day notice rule. Section 5 gets exceptions for emergencies and consent instead of "we never tell your university".
- **Copy (the app and the pages):** about 30 strings, most of them the ones in the "single most important sentence" above.
- **Code before the Terms publish, all cheap:** consent record survives deletion; sign out other devices on password change; password (not handle) to delete an account; RSVP needs a verified school email; a restricted account can't keep reading through the API; a verified club can't be deleted in one click; urgent report alerts get an "URGENT:" subject; the login-email ban key is cleaned up so it can be used.
- **Code before the first student invite:** the pre-registration takeover fix. One medium item.
- **Code before billing turns on:** Vibe+ needs a verified school email; a cancel button on the suspension notice; a checkout confirmation email; private viewing if you approve it.
- **Process, starting now:** NCMEC registration, the help@ rota, the intimate-image log, two-factor sign-in on every dashboard today, a dated security-fix log in the repo, no founder verifies their own club alone.
- **Lawyer:** ten new questions, on top of the eighteen already queued. The three that matter most: insurance before launch, your personal exposure as the only person with data access, and how long we may keep a removed intimate image as evidence.

The full list, with owners and dates, is Part 4 of the defender's file. Its section 4e is the publish gate: what must be true on the day the Terms go live.

## The calls that are yours

The defender recommends an answer on each. Say yes, no, or change it.

| # | Call | Recommendation |
|---|---|---|
| 1 | Non-students who hold a school address (staff, alumni, applicants) | Allow; they must describe themselves truthfully; add an "I am" field on the profile |
| 2 | Keep a small consent record after deletion | Yes, 3 years |
| 3 | Reserve a deleted handle | Yes, 90 days |
| 4 | Vibe+ for accounts without a verified school email | No |
| 5 | Browsing without verification | Keep for launch month, but hide viewer identities, resumes and last-active from unverified logins |
| 6 | Clubs with no officers | Hide at 6 months, delete at 12 |
| 7 | Verified clubs need a club school email and two officers | Yes; it doubles as the recovery key |
| 8 | Password instead of handle to delete an account | Yes |
| 9 | A minor found on Vibe | Close the account, keep what the law requires, free the school email at 18 (not a permanent ban) |
| 10 | Vibe+ during a suspension | Keep billing, with a cancel button on the notice |
| 11 | Private viewing: anyone can hide their name when viewing, but then sees no names either | Yes, before billing turns on |
| 12 | A deleted account's messages stay in others' chats as "Deleted account" | Yes, after launch |
| 13 | A verified club can be deleted only by us, after 7 days' notice | Yes, before publish |
| 14 | Written checks before a club is verified; SAE re-verified by James or Rylan, not you | Yes |
| 15 | Badge text "@iu.edu verified" with the campus beside it | Yes; at minimum "Student" goes before publish |
| 16 | A small-claims option in the disputes section | Yes |
| 17 | Officers accept the Terms for the group, plus a one-page club agreement Rylan brings to each signing | Yes; the lawyer reviews the page |
| 18 | Postal address in the Terms | The registered agent's address from the state filing, never a home address |
| 19 | Supabase Pro (backups and session limits) | Before students arrive; until then the Terms say "no backups" |

## What I need from you

Your thoughts on the ten outcomes and the nineteen calls. Anything you disagree with, anything the attacker missed that you know about, and anything you want kept out of the published text. Then I write v3 with the loopholes closed, update the companion, and hand James the lawyer questions.
