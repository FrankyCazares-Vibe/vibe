# Legal risk assessment: Vibe Privacy Policy (v2 text, for v3)

**Date:** 2026-10-04
**Assessor:** Claude (risk job of the privacy-v3 workflow), using the installed skill `legal:legal-risk-assessment`
**Matter:** the policy text in `handoffs/legal-2026-10-03-privacy/privacy-policy-publish.md`, as built in the release worktree (`release-s74`, commit `fe40634`, pages under `src/app/legal/privacy/`), which goes live today with the landing page, the waitlist and desktop Messages.
**Privileged:** No. This is a founder's working paper, not a lawyer's advice. It is not legal advice; the lawyer reads the policy in parallel, and every statute below is cited from memory and marked "verify with counsel" where it carries weight.

## How this was done

- **Skill used: yes.** `legal:legal-risk-assessment` loaded. Its method is used as written: each risk gets Severity (1 to 5) times Likelihood (1 to 5), and a level: GREEN 1 to 4, YELLOW 5 to 9, ORANGE 10 to 15, RED 16 to 25. Its memo fields (description, contributing and mitigating factors, recommended approach, residual risk, monitoring, next steps) are kept, in short form, for every ORANGE and RED item.
- **Severity, fitted to a company with no revenue.** The skill measures severity as a share of "deal value". Vibe has none, so: 5 = could end the launch or the company (a student harmed, a store removal, a regulator's letter, a cofounder personally named); 4 = a store rejection that delays launch, a campus news story, a lawyer's demand letter; 3 = a sentence shown to be false in public, a formal complaint; 2 = fixed quietly; 1 = cosmetic.
- **Likelihood** is over the next 12 months, at the planned size: about 100 hand-picked testers, then the Indianapolis campus.
- **What was read.** The policy text; `calls-for-franky.md`; `changes-after-verify.md`; `verify/L1-hostile-readers.md` and `verify/V1-admins-moderation-deletion.md`; `facts/07-legal-inputs.md` sections 4 to 7. Code in the release worktree (the three merges are done): the privacy page, the delete-account page, the Terms, Community, Child Safety and Vibe+ pages, `src/app/api/me/route.ts`, `src/lib/sentry-config.ts`, `src/lib/moderation/alerts.ts`, the admin routes, the waitlist form and its purge, the landing film's loader, and the two desktop Messages migrations (`20261004100000_chat_message_pins.sql`, `20261004110000_chat_room_post_policy.sql`). Nothing was edited. Production was not touched.
- **The founder's facts (Oct 2 to 4) are taken as final:** no backups; one cofounder holds every key and all three moderate; hello@ and help@ forward to that cofounder's personal Gmail; Claude (Anthropic) is the coding assistant under a counts-only rule; the policy publishes October 4 as a notice; the people in the film agreed; no analytics; Stripe off; the Outlook address is not used.

## The answer in six lines

1. The policy is honest to an unusual degree, and that honesty is its main protection. The largest risk is not in the policy. It is that **other live pages say the opposite on the same day** (R1).
2. **Five sentences are untrue today** given the founder's facts, and each has a true replacement below: the inbox "the Vibe team reads" (R4), "We email you only to..." (R3), the AI tools sentence (R7), "Each company decides where its servers are" (R22), and the date on the page (October 5, not October 4) (R13).
3. **Three promises are absolute and rest on one busy person with no log:** reading private messages "only" in four cases (R6), "we will email the people affected" after a breach (R8), and "we close it and take its content down" for an under-18 account (R5).
4. **Two facts can hurt a student and are understated:** location inside public videos and club photos (R2), and files that stay in storage after "delete right away" (R10).
5. **The new desktop Messages features are not in the text** (pinned messages, rooms where only some may post) (R11).
6. **Gaps with no sentence at all:** shutdown of the company, a legal order to keep records, Do Not Track, the film on the home page, a lost database.

## The register, ranked

S = severity, L = likelihood. Same score: the cheaper fix first.

| ID | Risk | S | L | Score | Level | Fix is in |
|---|---|---|---|---|---|---|
| R1 | Other live pages contradict the policy on publish day | 4 | 5 | 20 | RED | other pages |
| R2 | Location inside public videos and club photos; the short version understates it | 5 | 3 | 15 | ORANGE | words + code |
| R3 | "We email you only to..." contradicts five other promises | 3 | 5 | 15 | ORANGE | words |
| R4 | Support inbox: "the Vibe team reads" is untrue; a personal Gmail is not named | 3 | 5 | 15 | ORANGE | words + setup |
| R5 | Under-18 accounts: the promise does more than the ban tool does | 5 | 3 | 15 | ORANGE | words + runbook |
| R6 | "We read private messages only..." with one person and no log | 4 | 3 | 12 | ORANGE | words + a notebook |
| R7 | The AI coding tool sentence is wrong both ways | 3 | 4 | 12 | ORANGE | words + a setting |
| R8 | The breach promise | 4 | 3 | 12 | ORANGE | words + runbook |
| R9 | No backups: "deleted" and "lost" are not explained | 4 | 3 | 12 | ORANGE | words + a plan |
| R10 | Files left in storage against "delete right away" and the store rules | 4 | 3 | 12 | ORANGE | words + code |
| R11 | Pinned messages and post-rule rooms are not in the policy | 2 | 5 | 10 | ORANGE | words |
| R12 | The 48-hour intimate-image removal rests on one personal inbox | 5 | 2 | 10 | ORANGE | setup |
| R13 | Existing accounts: no notice is sent, and the page says October 5 | 3 | 3 | 9 | YELLOW | one line + a message |
| R14 | No end date for reports and evidence; the delete page says "up to a year" | 3 | 3 | 9 | YELLOW | words + a decision |
| R15 | Absolute security claims ("no other user can", "never", "does not show") | 3 | 3 | 9 | YELLOW | words |
| R16 | Sign-in details can reach Sentry: an admission that code can remove | 3 | 3 | 9 | YELLOW | code |
| R17 | Waitlist: the tick, the form's notice, the one daily job, the news box | 3 | 3 | 9 | YELLOW | words on the form |
| R18 | Three classmates moderate, with no rule for stepping aside | 3 | 3 | 9 | YELLOW | a rule |
| R19 | The law-enforcement paragraph (subpoena, "in danger", NCMEC "may") | 4 | 2 | 8 | YELLOW | words |
| R20 | A data copy or an email change asked for by email: impersonation | 4 | 2 | 8 | YELLOW | words + habit |
| R21 | One person holds every key: no stand-in | 4 | 2 | 8 | YELLOW | setup |
| R22 | "Each company decides where its servers are" | 2 | 4 | 8 | YELLOW | words |
| R23 | Sale, merger or shutdown | 3 | 2 | 6 | YELLOW | words |
| R24 | The film: real people, and Vercel Blob is not listed | 3 | 2 | 6 | YELLOW | words + a written yes |
| R25 | "every record tied to the account" against the allow list and legal holds | 2 | 3 | 6 | YELLOW | words |
| R26 | Hosting on Vercel's free plan | 3 | 2 | 6 | YELLOW | a plan |
| R27 | No "Do Not Track" sentence | 2 | 2 | 4 | GREEN | one sentence |
| R28 | Store forms and age rating must match the policy | 2 | 2 | 4 | GREEN | at submission |

Counts: 1 RED, 11 ORANGE, 14 YELLOW, 2 GREEN.

---

## RED

### R1. Other live pages contradict the policy on publish day (4 x 5 = 20)

**The risk.** A privacy policy is judged together with every other page that speaks about data. In the release worktree at `fe40634` these lines are still there, and each says the opposite of the policy:

| Page and line | It says | The policy says |
|---|---|---|
| `src/app/legal/delete-account/page.tsx:158-160` | "every photo, video and document you uploaded is erased from storage, not just hidden" | section 8 lists files that stay, "even after you delete your account" |
| same, `:198` | evidence is kept "for up to a year" | "No end date is set" |
| same, `:236-237` | "Deleted data can also sit in our hosting provider's routine backups" | "We keep no database backups" |
| `src/app/legal/terms/page.tsx:25-26, 150` | "By creating an account or using the Service, you agree"; "Continued use ... means you accept" | "Using Vibe does not count as agreeing" |
| same, `:78-79` | "copies retained in backups for a limited period" | no backups |
| `src/app/legal/community/page.tsx:34-36` | everyone "is a real student at a real school" | "Verified ... does not prove enrollment or identity" |
| same, `:53-54` | "Counts are public; who did what is yours." | Vibe+ shows who viewed; a like names the liker; follow lists are open |
| `src/app/legal/child-safety/page.tsx:35` | "enrolled at a U.S.-accredited college or university" | not checked |
| `src/app/plus/page.tsx:650-652` | "private from everyone, including from us" | "One cofounder can reach everything Vibe stores" |
| `src/app/waitlist/waitlist-form.tsx:208, 216` | three providers named; "a current student" | section 11 names six handlers; verified does not mean enrolled |

**Why it matters.** Two public statements that cannot both be true mean one is false, and a false statement about personal data is the plain case of a deceptive practice (FTC Act section 5, 15 U.S.C. 45; Indiana Deceptive Consumer Sales Act, Ind. Code 24-5-0.5; verify with counsel). The delete-account page is also the page Google Play asks for and Apple's reviewer opens. A reviewer or a student reporter needs no code to find these: both pages are one click apart.

**Contributing.** The policy was fact-checked; the other pages were not rewritten. **Mitigating.** A handful of accounts today; the new Terms come about October 14.

**Recommended approach.** The policy is the true page, so the other pages change, in the same deploy:
- Delete page, line 158: "Your files: the photos, videos and documents in your own folders are erased from storage. A few kinds of files stay behind; the Privacy Policy, section 8, lists them."
- Delete page, line 198: replace "for up to a year for safety and legal reasons" with "with no end date set yet (Privacy Policy, section 9)".
- Delete page, lines 236-237: "We keep no database backups. Deleted data can still sit in our service providers' logs (such as our email sender's delivery log and our error reports), until those expire."
- Terms: the smallest safe change before October 14 is one line under the title: "New Terms arrive around October 14. Until then, where these Terms and the Privacy Policy describe your information differently, the Privacy Policy is the accurate one."
- Community line 34-36: "Everyone who posts here verified a school email address."; line 53: "Counts are public. The Privacy Policy says who can see who did what."
- Child Safety line 35: "require you to be 18 or older and to verify an IU or Purdue email address."
- Vibe+ line 650: drop "including from us on the free tier".
- Waitlist form: R17.

**Residual risk** after the edits: YELLOW (3 x 2), until the new Terms replace the May 7 ones.
**Monitoring.** One rule in the release checklist: when the policy changes, search the other pages for the same subject before deploying.

---

## ORANGE

### R2. Location inside public videos and club photos (5 x 3 = 15)

**The sentences.** Short version: "Photos and videos you send in chats or post as a club can still say where they were taken." Section 3c: "We do not remove them from: videos, photos on a club's posts, club logos and banners, photos and videos sent in chats, group chat pictures, and résumé PDFs."

**The risk.** (a) The short version leaves out the widest case: a **video on your own post**. Posts are open to anyone on the internet (section 5a), so a video filmed at home can hand a stranger a home address. Club post photos are public too, on the club page's 12 newest posts. (b) The code confirms it: only `src/app/api/me/profile-upload/route.ts`, `src/lib/profile/storage-upload.ts` and `src/lib/profile/resume-storage.ts` call `strip-image.ts`; no chat, club or video path does. (c) This is the one item where the harm is physical (stalking), and where a regulator would ask why a known, cheap fix was not made ("reasonable security").

**Mitigating.** It is disclosed, twice. Phones often strip location when sharing from the photo picker, but not always, and not for files.

**Safer true wording.** Short version: "**Videos you post, and photos or videos you send in chats or post as a club, can still say where they were taken.** Vibe removes that detail only from the photos listed in section 3c." Section 3c, add after the two lists: "Posts and club pages are public, so a location inside one of those files is public too."

**Do.** Strip in code for chat photos, club post photos, logos, banners and group pictures (the function exists). For video, either strip the container's metadata on upload or show one line at upload: "Videos keep the place they were filmed." Then shorten the sentence.

**Residual risk** after the code fix: GREEN for photos, YELLOW for video until it is stripped.

### R3. "We email you only to..." contradicts five other promises (3 x 5 = 15)

**The sentence.** Section 4: "We email you only to confirm your account, reset your password, verify your school email, confirm your waitlist spot and send your access code."

**The risk.** The same policy promises other emails: a breach notice (section 10, "we will email the people affected"), a copy of your data (section 9), answers to appeals and support mail (sections 3g, 9), and it should promise notice of a sale or a new policy. The first time any of those is sent, the "only" is broken. The contradiction is in the text today.

**Safer true wording.** "**Emails.** Vibe's automatic emails are these five: to confirm your account, reset your password, verify your school email, confirm your waitlist spot and send your access code. A person on the Vibe team may also write to you: to answer you, about a report or your account, or to tell you something you need to know, such as a security problem or a change to this policy. There is no marketing or activity email."

**Residual risk:** GREEN.

### R4. The support inbox (3 x 5 = 15)

**The sentences.** Section 3g: "What you send stays in our support inbox, which the Vibe team reads, until one of us deletes it." Section 6: "Our email inbox. Mail you send us is held by the email service that hosts our inbox." Section 11: "lands in our support inbox".

**The risk.** By the founder's facts, hello@ and help@ forward to **one cofounder's personal Gmail**. So "the Vibe team reads" is untrue, "one of us deletes it" is untrue, and the company holding the mail (Google) is not named, while every other provider is. What arrives there is the most sensitive mail Vibe gets: intimate-image removal requests, child-safety tips, appeals, recovery proof, replies from waitlist students. It sits among personal mail, on personal devices, and stays if that cofounder leaves.

**Safer true wording.** Section 3g: "Mail to hello@ and help@connectvibe.app is forwarded to one cofounder's own Gmail inbox, so Google holds it. That cofounder reads it and passes to the other two only what they need to act. It stays there until that cofounder deletes it." Section 6: "**Google (Gmail).** Holds the mail you send us and our answers (section 3g)." If a forwarding service sits in between, name it in the same line (the Oct 3 notes say Cloudflare Email Routing; not confirmed).

**Do (no code).** Open one mailbox used only for Vibe, with two-step sign-in; point both addresses at it; reply from @connectvibe.app, never from a personal address; a monthly reminder to clear closed threads older than 90 days. Then the sentence becomes "a mailbox used only for Vibe".

**Residual risk** with the true sentence: YELLOW (3 x 2). With the separate mailbox: GREEN.

### R5. Under-18 accounts (5 x 3 = 15)

**The sentences.** Section 12: "If we learn an account belongs to someone under 18, we close it and take its content down. We then aim to delete its information ourselves ... Closing an account works like a ban". Short version: "You confirm it with a checkbox."

**The risk.** (a) "Take its content down" promises more than a ban does: section 9 says that after a ban "messages you already sent stay visible in chats". So a 17-year-old's messages would stay in adults' chats after Vibe "closed" the account. (b) It is likely to happen: universities give school email addresses to people under 18 (early admits, 17-year-old first-years, high-school students in college-credit programs), and the checkbox is the only gate. (c) There is no "under 18" reason in the report list (`src/lib/moderation/reports.ts`), so "if we learn" has no channel but email. (d) The store laws on age signals are moving (Utah, Texas, Louisiana, California app-store age laws; status of each: verify with counsel); once a store tells Vibe a user is a minor, Vibe "knows".

**Safer true wording.** "If we learn an account belongs to someone under 18, we ban it, which hides its profile, posts and comments at once. We then delete the account, which also removes its messages from other people's chats. We aim to do that within 7 days. We keep the ban record and the scrambled codes in section 9, so that school email cannot be verified again until the person is 18 and asks help@connectvibe.app. To tell us about an under-18 account, write to help@connectvibe.app."

**Do.** A half-page runbook (ban, then delete the account, keep the code); add "Under 18" as a report reason; change the waitlist tick (R17).

**Residual risk:** YELLOW (4 x 2).

### R6. "We read private messages only..." (4 x 3 = 12)

**The sentences.** Short version: "We read private messages only in the cases in section 5h." Section 5h: the four cases, then "This is a rule we keep ourselves. No system enforces or records it."

**The risk.** "Only" is an absolute, about the most private data Vibe holds, kept by one person who also builds and repairs the chat tables, with no record. The admin tools do hold the line (no admin route returns an unreported message; checked in `src/app/api/admin/**`). The direct access does not. An ordinary repair of a chat fault means seeing message rows, and that is none of the four cases. A promise about message privacy that is broken in normal work is the kind regulators have acted on (verify with counsel). Under the Stored Communications Act a provider may look at what it stores (18 U.S.C. 2701(c)(1)); the exposure is the promise, not the looking.

**Mitigating.** The honesty of the last two sentences; the counts-only rule for the AI tool; a tiny user base.

**Safer true wording.** "We do not open private messages to learn about you. The cofounder with direct access opens them only: (1) when one is reported to us; (2) when you ask us to, for example for a copy of your data; (3) when we have specific evidence that a conversation is being used for spam, threats, exploitation or another serious break of the Terms; (4) when the law requires it; (5) when a fault in Vibe cannot be fixed any other way, and then as few as possible. People keep this rule. No system enforces it." If the notebook below is started, add: "That cofounder writes down each time and the reason." Use the same five cases, word for word, in the Terms.

**Do.** A plain notebook (one dated line: what was opened, why). It costs nothing and turns "trust us" into something that can be shown.

**Residual risk:** YELLOW (3 x 2).

### R7. The AI coding tool sentence (3 x 4 = 12)

**The sentence.** Section 6: "AI coding tools. We build and maintain Vibe with them. When the cofounder with direct access uses one to look into a problem, the database records it reads pass through that tool's provider."

**The risk.** It is wrong both ways. It says people's records pass to the provider, which the counts-only rule forbids; and it names nobody, when the founder has said who it is. Three further points: (a) the rule is a rule, not a lock: the tool's access is the cofounder's access; (b) the short version says "we do not train AI on what you post", which is true of Vibe, but whether the provider may train on what passes through depends on a setting in that provider account (not checked); (c) when the tool helps test the live site through the cofounder's signed-in browser, it sees what that account sees (the team's own notes describe checking the live site this way; not re-checked here). The counts-only rule speaks of the database, not of the screen.

**Safer true wording.** "**Anthropic (Claude, an AI coding assistant).** We build and maintain Vibe with it. Our rule: when it looks at the live database it may read counts, settings and the shape of the code, never anyone's records. A person keeps this rule; the tool's access is not technically limited to it. What the tool reads passes through Anthropic. When it helps test the live site, it can see what the cofounder's own account sees on screen." Drop the last sentence only if live testing with the tool stops.

**Do.** Confirm the model-training setting is off on the account used; write the counts-only rule into the project's instructions file so the tool is told it every session.

**Residual risk:** YELLOW (3 x 2).

### R8. The breach promise (4 x 3 = 12)

**The sentence.** Section 10: "If we learn of a breach that exposes your personal information, we will email the people affected and say what happened ... as fast as we reasonably can and within the time Indiana law requires."

**The risk.** Four weak points. (1) "Exposes" is wider than the legal test, which is information actually taken or reached by someone not allowed (Ind. Code 24-4.9; verify with counsel). (2) "Email the people affected": with no record of what is read (section 1), Vibe often could not say who was affected; and a person whose account is deleted has no address on file, though report copies and leftover files of theirs remain. (3) "Indiana law": students live in many states, and each state's law follows the resident. Indiana's own deadline is, from memory, without unreasonable delay and at most 45 days, with notice to the Attorney General (Ind. Code 24-4.9-3; verify), and its definition of personal information is narrow, so the policy's promise is wider than the statute, which is good for students and must then be kept. (4) No backups and no security staff: after an attack that destroys data, nothing can be restored.

**Safer true wording.** "**If someone gets at your personal information without permission** and we learn of it, we will email the sign-in address of each account affected and put a notice on this page. We will say what happened, what information was involved and what we are doing. We will do it without unreasonable delay, and within any deadline the law sets. Vibe keeps few records of who read what (section 1), so we may not be able to tell exactly whose information was reached. If we cannot tell, we will tell everyone."

**Do.** A one-page plan: who decides, the email text, the lawyer's number, the Attorney General's form.

**Residual risk:** YELLOW (4 x 2).

### R9. No backups (4 x 3 = 12)

**The sentence.** Section 8: "Backups. We keep no database backups, so we cannot bring back something you delete by mistake."

**The risk.** (a) "We keep" is true of Vibe. Whether the database company holds short-lived internal copies under its own terms is not known, so "deleted" should not be stretched to "exists nowhere". (b) The sentence covers the student's mistake, not Vibe's: one bad command, an attack or a provider fault loses every account, post and message for good, and with them the safety records Vibe may be required to keep (after a child-safety report the law requires keeping what was reported, one year from memory, 18 U.S.C. 2258A(h); verify). (c) The delete page says the opposite (R1).

**Safer true wording.** "**Backups.** We keep no database backups, and our plan with our database company includes none. So we cannot bring back something you delete by mistake. And if the database were ever lost or damaged, we could not restore it: accounts, posts and messages would be gone. We cannot speak for short-lived copies our providers may keep inside their own systems." Add one bullet to the short version: "We keep no backups. What is deleted or lost cannot be brought back."

**Do.** Decide before the second wave: the paid database plan with daily backups. On the day it is switched on the sentence must change to: "Our database company keeps daily backups for [N] days. Something you delete leaves the live database right away and the last backup within [N] days", and "up to 40 days" for the waitlist gains "plus [N] days in backups".

**Residual risk:** YELLOW (3 x 2) with the wording; GREEN with backups and the changed sentence.

### R10. Files left in storage against "delete right away" (4 x 3 = 12)

**The sentences.** Short version: "You can delete your account in Settings, right away." Section 8: "A message is deleted right away for everyone"; then, under "What Vibe does not delete yet": "The photo or video on a message you deleted ... the file stays in our storage, even after you delete your account."

**The risk.** The promise leads and the exception trails. A company that said messages were gone while files remained is the textbook deception case (verify with counsel). The store rules ask that account deletion remove the account's data, with what is kept disclosed (Apple guideline 5.1.1(v); Google Play's account-deletion rule; verify the current text at submission). Disclosure helps with honesty. It does not make the files go.

**Mitigating.** Section 8 is frank; the leftover files are reachable only by their exact, unguessable link.

**Safer true wording.** Short version: "You can delete your account in Settings, right away. Your messages vanish from other people's chats too. **A few kinds of files and some safety records stay**; sections 8 and 9 list them." Section 8, first bullet of the "not yet" list: "The photo or video on a message you deleted **yourself, one at a time**. The app stops showing it, but the file stays in our storage, even after you delete your account. We are building the clean-up."

**Do.** A sweep for files no row points to (deleted-message media, group pictures, replaced logos). Finish before the store submission, then delete the list.

**Residual risk:** YELLOW (3 x 2) with the wording; GREEN after the sweep.

### R11. Pinned messages and post-rule rooms are not in the policy (2 x 5 = 10)

**The risk.** The policy was checked against `main` and `landing-night`. Desktop Messages adds two things it does not mention. (a) `chat_message_pins`: in a direct or group chat anyone in it can pin a message for everyone, up to 20; the row stores who pinned it and when; the pin list returns the message and the time, not the name (`src/lib/chat/pins-read.ts`); the pin goes when the message is deleted or removed; it outlives the account of the person who pinned it. (b) `channels.post_policy`: in a club's extra rooms officers can limit who posts (everyone, officers, or a list), while anyone who can read the room can still vote and take sign-up slots.

**Safer true wording.** Section 3c, in the Messages bullet: "..., the messages you pin, ...". Section 5e, after "Direct and group chats": "**Pinned messages.** Anyone in a direct or group chat can pin a message for everyone in it. We store who pinned it and when; the app shows the pin, not who made it. A pin goes when its message is deleted or removed." Section 5e, in "Club chats": "In a room they create, officers can limit who may post: everyone, officers only, or people they list. Everyone who can read the room can still vote in its polls and take its sign-up slots."

**Residual risk:** GREEN.

### R12. The 48-hour intimate-image removal rests on one personal inbox (5 x 2 = 10)

**The risk.** Community and Support promise "We remove it within 48 hours of a valid request", which mirrors the TAKE IT DOWN Act (2025; covered platforms had to have the process by May 2026; the FTC enforces; verify with counsel). The request arrives by email (section 3g) into one person's personal Gmail. A weekend, a spam filter or an illness breaks a legal deadline, for the most harmful content there is.

**Do (no code).** Send a test from an outside address to both mailboxes today; a filter so mail to help@ can never land in spam and always raises a phone alert; a second cofounder who also receives help@; the in-app report reason "intimate image" already sorts first in the queue (`reports.ts`), so say in section 3g: "If you have an account, the Report button is the fastest way." This is not a wording fix.

**Residual risk:** YELLOW (5 x 1).

---

## YELLOW

### R13. Existing accounts: no notice is sent, and the page says October 5 (3 x 3 = 9)
- **Sentences.** Top: "Effective {{EFFECTIVE_DATE}}"; the built page has `const EFFECTIVE_DATE = "October 5, 2026"` (`src/app/legal/privacy/page.tsx:22`), and it publishes October 4. Section 13: "If you made your account before the date at the top, this page is our notice to you".
- **Risk.** The policy people ticked in May promised "reasonable notice (in-app or by email) before they take effect". A page nobody is pointed to is thin notice. A wrong date on a legal page is a small falsehood that is free to fix. Under the "one day early" date, a waitlist entry made today is covered by a policy that says it is not yet in force.
- **Wording.** Set the date to "October 4, 2026". Section 13, replace the last two sentences: "This version was published on October 4, 2026, before the recorded version changed. If you made your account before that day, we told you about it by a message, and you are asked to accept it when the version next changes, around October 14." Keep "we told you about it by a message" only if it is done.
- **Do.** Message the handful of existing accounts today, by hand. With so few it takes minutes and makes the old promise kept.

### R14. No end date for reports and evidence (3 x 3 = 9)
- **Sentences.** Section 8: "Reports, the moderation log, suspension and ban records, and evidence files. No end date is set (section 9)." Section 9 keeps report copies after deletion.
- **Risk.** Private message text, bios and photos of a person who deleted their account are kept for ever, including after a report was dismissed. It is honest and it is the least student-friendly sentence in the policy. The delete page says "up to a year" (R1).
- **Wording (true today).** "No end date is set yet. We will set one with our lawyer and write it here. Until then you can ask help@connectvibe.app to delete a report copy or an evidence file about you, and we will unless safety, the law or an open case needs it."
- **Do.** Decide the period with the lawyer inside 30 days (the drafts suggest 3 years after a case closes; one year for evidence files); a calendar reminder until code does it.

### R15. Absolute security claims (3 x 3 = 9)
Each is true by design today and false the day one access rule slips. Reword as design, not as guarantee.

| Where | Now | Safer and true |
|---|---|---|
| 3a | "School email ... Other people never see it." | "Other people are not shown it." |
| 5b | "Nobody else sees who liked, and nobody sees who saved." | "Vibe shows nobody else who liked, and shows nobody who saved." |
| 10 | "No other user can read your email addresses ..., your proof of agreement or your moderation records." | "Vibe is built so that no other user can read ..." |
| 11 | "The form gives everyone the same answer, so it does not show who is on the list." | "The form is built to give everyone the same answer, so that it does not show who is on the list." |
| 7 | "Cookies. Only the ones that keep you signed in" | "The only cookies Vibe sets are the ones that keep you signed in" |
| 3d | "Our code does not tag reports with your account or email, and strips sign-in links ..." | "Our code is set not to tag ..., and to strip ..." |
| 5c | "they get a copy with the bars made permanent, not the original" | keep; it is the mechanism |
| 3a, 3f | "We never store it [the password]"; "card numbers never reach us" | keep both; true by construction |
| 2 | "One school email verifies one account." | "One school email is meant to verify one account." (the check has a row cap: `changes-after-verify.md`, fix 3) |

### R16. Sign-in details can reach Sentry (3 x 3 = 9)
- **Sentence.** Section 3d: "One about a failed server request can include the sign-in details your browser sent, which identify your account."
- **Risk.** An admission that a session key can sit at an outside company, where anyone with that dashboard could act as the student. It is honest, and cheap to remove: the scrubber in `src/lib/sentry-config.ts` cleans addresses and bodies but drops no request header.
- **Do.** Delete the cookie and authorization headers before sending. Then cut the sentence. Keep it until then.

### R17. The waitlist (3 x 3 = 9)
- **The tick** (`waitlist-form.tsx:216`): "I'm 18 or older and a current student." The policy says a school email does not prove enrollment, and staff and alumni can hold one. Use: "I'm 18 or older and I have an IU or Purdue email address." Quote the same words in section 11.
- **The form's notice** (`:208`) names three providers; section 11 names six handlers. Add: "and a few others listed in the Privacy Policy, section 11".
- **"A daily clean-up deletes the whole entry."** One job on the free hosting plan, once a day, no retry (the code deletes at 38 and 28 days to leave margin). If the job's secret is missing it refuses every run and only a log line says so. Wording: "A daily clean-up is set to delete the whole entry." Do: a weekly count of entries older than 40 days (a count is allowed under the counts-only rule); it must be zero.
- **"The three cofounders see the list"** stays true. **"Lands in our support inbox"** becomes R4's wording.
- **The news box.** "No news email exists" is true today and goes stale on the first newsletter. A news email needs an unsubscribe link and a postal address in every message (CAN-SPAM, 15 U.S.C. 7704; verify). Before the first one: an address, a working unsubscribe, and this sentence updated first.

### R18. Three classmates moderate, with no rule for stepping aside (3 x 3 = 9)
- **Risk.** Reports will name people the cofounders know, and the one real club is close to them. A reported private message is copied for all three. Nothing says a cofounder who is a party, or a friend of one, steps back.
- **Do.** Agree the rule among the three. Only then add to section 5h: "A cofounder who is part of a report, or close to someone in it, leaves it to another cofounder." Do not publish it before it is agreed.

### R19. The law-enforcement paragraph (4 x 2 = 8)
- **Sentences.** Section 5i: "We hand over information when the law requires it, for example under a subpoena or court order. We may also go to the police, emergency services or ... NCMEC ourselves when we believe someone is in danger or a child is at risk."
- **Risk.** (a) Federal law limits when a service may hand over the content of messages: in general a warrant for the government, and not at all on a civil subpoena (Stored Communications Act, 18 U.S.C. 2702 and 2703; damages under 2707; verify). "Under a subpoena", unqualified, invites the wrong response. (b) The emergency rule is narrower than "in danger": danger of death or serious physical injury (2702(b)(8)). (c) "May" understates a duty: a service that learns of apparent child sexual abuse material must report it to NCMEC (18 U.S.C. 2258A). (d) A lawful order to keep records collides with "deleted right away ... every record" (R25).
- **Wording.** "We give information to a court or the police when the law requires it and the request is valid. For the content of private messages we ask for a search warrant, unless you agree or it is an emergency. We report apparent child sexual abuse material to the National Center for Missing & Exploited Children (NCMEC), as the law requires. We may also go to the police or emergency services ourselves when we believe someone is in danger of death or serious physical harm. We aim to tell you before we hand over your information, unless the law forbids it or it would put someone at risk."
- **Do.** One page: who answers, what to ask for, where the request is logged. Send every request to the lawyer first.

### R20. A data copy or an email change asked for by email (4 x 2 = 8)
- **Sentences.** Section 9: "A copy of your data. Email hello@connectvibe.app from your sign-in address." and "To change your sign-in email, write to help@connectvibe.app."
- **Risk.** The "from" line of an email can be faked. A copy includes the messages of everyone the person talked to. An email change by request is a way to take over an account. The finished copy then also sits in a Gmail "sent" folder.
- **Wording.** "We send the copy only to your sign-in address, never to another one." and "To change your sign-in email, write to help@connectvibe.app from your current sign-in address. We answer to that address before we change anything."
- **Do.** Delete the copy from the sent folder once delivered.

### R21. One person holds every key (4 x 2 = 8)
- **Risk.** If that cofounder is unreachable, nobody can delete an account by hand, answer a legal order, act on a 48-hour removal, or respond to a break-in. The policy's "one of us then deletes" (section 9) assumes that person. No wording fixes this.
- **Wording.** Section 9, "If you cannot sign in": change "One of us then deletes" to "The cofounder with direct access then deletes".
- **Do.** Two-step sign-in on every provider account, the code host and the mailbox; recovery codes sealed with a second cofounder for emergencies.

### R22. "Each company decides where its servers are" (2 x 4 = 8)
- **Risk.** Untrue for the database: the customer picks its region when the project is made. Not checked here (no dashboard access).
- **Wording.** "We chose the region our database and files are kept in. The other companies decide where their own servers are. Ask and we will tell you what we know." Better, once someone reads the dashboard: "Our database and files are kept in the United States."

### R23. Sale, merger or shutdown (3 x 2 = 6)
- **Sentence.** Section 5i: "If Vibe is ever sold or merged, we aim to tell you before your information moves to a new owner."
- **Risk.** Nothing on a shutdown, nothing binding a new owner, and "aim" with no means. Moving user data against a policy's promise is a known enforcement pattern (verify).
- **Wording.** "If Vibe is ever sold, merged or handed to another company, your information would move with it. We aim to email your sign-in address and post a notice here first, so you can delete your account before it moves. If Vibe shuts down, we plan to delete the database and the stored files, not sell them, unless a court or the law stops us."

### R24. The film on the home page (3 x 2 = 6)
- **Risk.** The film shows real people (the cofounders and friends in the founder's photos). They agreed, by word. Indiana's right-of-publicity law asks for written consent to use a person's likeness for a commercial purpose (Ind. Code 32-36-1-8; statutory damages; verify with counsel). The policy says nothing about marketing use, and the film loads from a second Vercel host (`*.public.blob.vercel-storage.com`, `src/lib/landing/demo-media.ts:28`) that section 6 does not mention.
- **Wording.** Section 4, last line: "We do not use your name, photo or posts in our own marketing unless you say yes first. The people in the film on our home page agreed to be in it." Section 6, Vercel: add "It also stores the film on our home page, so it sees your IP address when the film loads."
- **Do.** A written yes from each person in the film (a text or email reply, kept in one folder).

### R25. "Every record tied to the account" (2 x 3 = 6)
- **Sentence.** Section 9, step 3: "Your sign-in is deleted, and with it every record tied to the account: both email addresses ...".
- **Risk.** Two exceptions sit elsewhere or nowhere: the sign-up allow list keeps a full address and a reason after deletion (section 11 says so; section 9 does not), and a legal order to keep records.
- **Wording.** Add two bullets to "What stays after deletion": "**The sign-up allow list,** for the few addresses we let in without a code: the address and a reason." and "**Anything a court order or the law makes us keep.** If we get a valid order to keep an account's records before you delete it, we copy and keep them."

### R26. Hosting on Vercel's free plan (3 x 2 = 6)
- **Risk.** The clean-up job runs on Vercel's hobby plan (the migration's own note says so). From memory that plan is for personal, non-commercial use (verify the current terms). If the host paused the project, the site and the daily clean-up would stop together. Section 6 says each provider "works under its own published terms".
- **Do.** Move to the paid plan before Vibe+ is sold or the campus wave opens.

## GREEN

### R27. No "Do Not Track" sentence (2 x 2 = 4)
California's online privacy law asks every site that collects personal details from a California resident to say how it answers a browser's Do Not Track signal (Cal. Bus. & Prof. Code 22575(b)(5); verify). An IU or Purdue student can be a California resident. One true sentence in section 7: "**Do Not Track.** Vibe does not follow you across other sites or apps, so it works the same whether or not your browser sends a Do Not Track or Global Privacy Control signal."

### R28. Store forms and age rating (2 x 2 = 4)
Not due today. At submission: fill Apple's privacy label and Google's Data safety form from sections 3 and 6 (messages are not end-to-end encrypted; photos and videos can carry location; a push address is a device identifier; error reports go to Sentry), give `connectvibe.app/legal/delete-account` as the deletion page, rate the app 18+, and re-read section 3f that day.

---

## The ten gaps the job named, and where each is answered

| Gap | What the text says today | Verdict | Where |
|---|---|---|---|
| No backups: what "deleted" means, and what happens after a mistake | covers the student's mistake only | add Vibe's own loss, and "providers' own copies" | R9 |
| One person with full access and no access log | said plainly in section 1 | keep; add a notebook, a stand-in, two-step sign-in | R6, R21 |
| Private messages readable in moderation | a reported message is copied for all three; the copy has no end date | true and disclosed. Good news from the code: the alert email to the cofounders carries no student text (`src/lib/moderation/alerts.ts`), and no admin route returns an unreported message. Open: the end date, and stepping aside | R14, R18 |
| Personal Gmail for support | "our support inbox, which the Vibe team reads" | untrue; name Google and the one reader | R4, R12 |
| Photos keeping location data | disclosed, but the short version omits public videos | reword; fix in code | R2 |
| Files left in storage after deletion | listed in section 8, after a headline that says "right away" | put the exception next to the promise; sweep in code | R10 |
| Under-18 accounts | "we close it and take its content down" | a ban leaves messages up; rewrite as ban, then delete | R5 |
| A sale or shutdown | sale only, "we aim to tell you" | add shutdown and how notice is given | R23 |
| Law-enforcement requests | "under a subpoena or court order"; NCMEC "may" | warrant for message content; the NCMEC duty; a legal-hold bullet | R19, R25 |
| A breach with no backups and no security staff | "we will email the people affected ... Indiana law" | reword the trigger, the reach and the deadline; say what cannot be known | R8 |

## Sentences that are right and should stay as they are

These are the policy's strength. Softening them would add risk, not remove it.

- "One cofounder also has direct access ... That access can read everything Vibe stores, including both your email addresses and every message."
- "This is a rule we keep ourselves. No system enforces or records it." (with R6's fifth case)
- "'Verified' means the account could once read mail at an @iu.edu or @purdue.edu address. It does not prove enrollment or identity."
- "You cannot turn this off." (view records) and "We can give Vibe+ to an account ourselves."
- "Messages are not end-to-end encrypted."
- "The vote is still stored with your account, so the direct access in section 1 could."
- "We have not confirmed how long each is kept." (provider logs)
- "Vibe is independent. It is not run or backed by Indiana University, Purdue University ..."
- "We aim to ..." for the 24-hour review, the 30-day copy and the 90-day clean-up of recovery proof: an aim is the honest form for a promise three people keep by hand.

## What the company should do in the next 30 days, smallest first

Words alone leave the ORANGE items at YELLOW. These move them to GREEN. None needs the policy to wait.

**Today, minutes each**
1. Set the date on the page to October 4, 2026 (`src/app/legal/privacy/page.tsx:22`).
2. Fix the contradicting lines on the delete-account, Terms, Community, Child Safety and Vibe+ pages and the waitlist form, in the same deploy (R1, R17).
3. Message the handful of existing accounts that a new Privacy Policy is live (R13).
4. Send a test email from an outside address to hello@ and help@; make sure neither can land in spam (R12).

**This week, no code**
5. Two-step sign-in on every provider account, the code host, the domain and the mailbox; recovery codes sealed with a second cofounder (R21).
6. A written yes from each person in the film (R24).
7. Start the access notebook: one line each time message content or a person's full record is opened by hand (R6).
8. Check the AI tool account's training setting; write the counts-only rule into the project's instructions (R7).
9. Read the database's region in its dashboard and put it in section 6 (R22).
10. Move hello@ and help@ to a mailbox used only for Vibe, replying from @connectvibe.app; a second cofounder also receives help@ (R4, R12).

**Weeks 2 and 3, small code**
11. Drop the cookie and authorization headers from error reports; cut the sentence in 3d (R16).
12. Strip location from chat photos, club post photos, logos, banners and group pictures; a one-line warning on video upload (R2).
13. Ask for the password before deleting an account; send the admin email search in the request body, not the address (from `changes-after-verify.md`, fixes 8 and 9).
14. Add "Under 18" as a report reason; write the half-page under-18 runbook: ban, delete, keep the code (R5).
15. A weekly count: waitlist entries older than 40 days must be zero; the clean-up job ran (R17).

**Weeks 3 and 4, decisions and one-page plans**
16. Backups: move to the paid database plan before the second wave, and change section 8 the same day (R9).
17. A sweep for files that no record points to; then delete the "does not delete yet" list (R10).
18. With the lawyer: an end date for reports, the moderation log and evidence files; put it in sections 8 and 9 and on the delete page (R14).
19. One page each: a legal request (R19), a break-in (R8), and who steps aside in moderation (R18). Register with NCMEC's CyberTipline before the first report is ever needed.
20. Before any news email: a postal address, an unsubscribe link, and section 11 updated first (R17). Before Vibe+ or the campus wave: the paid hosting plan (R26).

## For the lawyer (James carries these)

1. Is the five-case rule for reading messages safe under the Stored Communications Act, and is "only" wise even with a notebook? (R6)
2. Message content and legal process: warrant only? What do we say to a civil subpoena? (R19)
3. Breach notice: Indiana's deadline and who must be told; does our wider promise bind us for data the statute does not cover? (R8)
4. Under 18: is ban-then-delete right, and what may we keep? The state app-store age laws. (R5)
5. TAKE IT DOWN: are we covered, and what records of requests must we keep? (R12)
6. Right of publicity: is a text-message "yes" a written consent for the film? (R24)
7. How long may report copies and evidence be kept, and can a person make us delete a scrambled email code? (R14)
8. Do Not Track and any other state notice at our size. (R27)
9. Can a regulator name the one cofounder with access personally, and what records show reasonable care? (R21)

## Residual risk and monitoring

- **With the wording changes only:** no RED; R2, R5 and R12 stay ORANGE-low or YELLOW because their fix is not in words.
- **With the 30-day list done:** every item GREEN or YELLOW; the open YELLOW items are the ones waiting on the lawyer.
- **Triggers to reassess at once:** the first report of an under-18 account; the first legal request; any sign of a break-in; the day backups, billing, notifications, a news email or a store app is switched on (each makes a "today" sentence in sections 3f, 4, 8 or 11 untrue); the new Terms around October 14.
- **Owner:** the cofounder with direct access for items 1 to 17; James for the lawyer's list; review this register when the Terms publish.

