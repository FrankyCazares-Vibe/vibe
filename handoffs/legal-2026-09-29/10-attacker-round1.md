# Attacker, round 1: loopholes in Terms v2 and the companion

**Date:** 2026-09-29 (session 70).

**Under attack:**
- `02-terms-of-service-v2.md` (21 sections).
- `03-companion.md` (outputs B to J).
- The live legal pages and the app's own copy, as quoted in `00-code-facts.md` §I and §J.

**Truth source:** `00-code-facts.md` (cited as A1, B7, F14 and so on). I also checked the code in six places the audit doesn't cover, and each one is cited by file:
- `src/proxy.ts`: a restricted account can still read, and a suspended student can't reach the Vibe+ portal.
- `src/lib/moderation/actions.ts` and the lift route: the lift tool finds a ban by account id.
- `src/lib/profile/storage-purge.ts` and the migrations: nothing ever purges quarantine.
- `src/app/plus/page.tsx`: how the page describes customization, and that viewers can't hide.
- `src/app/api/me/reports/route.ts`: 10 reports per hour per login.
- `src/lib/profile/handle.ts`: handles are 3–20 characters with a 14-day cooldown, which confirms the Terms.

**Severity:**
- **Critical**: likely at pilot scale, and it ends in a person hurt, a lawsuit, a regulator or a store removal, where the Terms don't help or make it worse.
- **High**: real money, a regulator letter, a store rejection, or a lost club or campus.
- **Medium**: a fight Franky can win but pays for in time or trust.
- **Low**: tidy-up.

**Count:** 54 loopholes: 7 critical, 23 high, 21 medium, 3 low. After them come the Contradictions, the Promises the operator cannot keep, and the Top 12.

## The short version

1. **The Terms are honest about verification. The damage comes from everything around them.** The app says "🎓 Student", "Officially recognized clubs", "a real student at a real school" and "bans stick". A plaintiff will quote the app, not §5.
2. **The Terms promise work that nobody is set up to do.** Examples: "a person reads every report", removal "within 48 hours", "we move the owner role by hand", "we may freeze", "up to 14 days". All of it rests on one person's database access and three students' inboxes. A platform's own promises are exactly what let lawsuits get past Section 230.
3. **The security holes land on innocent students.** A hijacked account (pre-registration takeover, year-long sessions) gets banned, and the victim's school email is burned forever. A harasser deletes their account, and their messages vanish from the victim's inbox.
4. **Clubs have no protection against their own officers.** One owner can delete a verified club in one click. A graduate keeps the keys. Only Franky's SQL can move them. And the club itself isn't a party to the Terms, so it isn't bound by the $100 cap.
5. **Child safety has four gaps:**
   - no NCMEC registration;
   - no image matching;
   - quarantined media kept with no purge;
   - a promise to "delete" a minor's data, which collides with the federal duty to preserve it after a report.

---

## 1. A malicious user

### A-01 · Pre-register the class
**Persona:** malicious user · **Severity:** critical

**The clause.**
- §4: "You are responsible for what happens under your account, including anything done by someone you let in or someone who guessed a reused password, until you tell us at help@connectvibe.app that someone else has access."
- §16 excludes harm caused "by someone who got into your account through a reused password or a shared mailbox".
- The landing page (code-facts §I, `home-landing.tsx:247`): "Sign up with your school email."

**The play.**
1. Collect student usernames from public directories or club rosters. School addresses follow a guessable pattern.
2. Sign up with each address as the login email, using a password you know. Nothing checks the domain. The account row is created at once and never cleaned up (A1: "No code path cleans up unconfirmed accounts").
3. Wait. The landing page tells students to sign up with their school email, so many will. When the student later confirms, the attacker's password is the one that works (brief §3, the security finding of Sept 27).
4. Sign in as the student once they have verified and built a profile. Read their DMs, post, message.
5. If the student notices and resets the password, the attacker's session survives anyway. Changing a password doesn't sign out other devices (G16: "No app code revokes sessions after a password change"), and sessions last over a year (brief §3).

**What Franky loses.**
- Every hijacked student is a plaintiff with a clean story: Vibe's own review found the bug on Sept 27, and Vibe launched anyway.
- With no class waiver (§18), one lawyer can bring all of them.
- A regulator treats "known, cheap to fix, left open" as an unfair security practice (A-36).

**Why the draft fails.** §4 and §16 blame the user for a reused password or for someone they let in. This is neither: it is Vibe's own confirmation flow. A court won't let a contract push the cost of the operator's known defect onto the victim, and Vibe's landing copy steers students straight into the attack. The fix is code (companion H11), sized "M", with no date before the Oct 14 publish.

### A-02 · Harass, delete, come back
**Persona:** malicious user · **Severity:** critical

**The clause.**
- §14: "messages you sent (the other people lose them too)" and "No grace period, no undo".
- §11: "We keep a snapshot of what was reported so that later edits or deletions do not hide it."
- §12: a ban is tied to the school email.

**The play.**
1. From a verified account, send threatening DMs to a classmate on a Friday night.
2. Delete the account before the victim reports, or after a report but before a founder acts. Typing the handle is enough (G17). Deletion removes "all messages the user sent, including the copies in other people's DMs and group chats" (G17). The victim's inbox empties.
3. Nobody was banned, so no hash was written. The school email is simply free again.
4. Make a new Gmail login, verify the same school address, and start over.
5. Even if the victim reported first, the snapshot keeps only the single item reported (F14: "the reported text, media URLs, owner handle and name"), not the thread.

**What Franky loses.**
- A victim who goes to the police, a protective-order hearing or a Title IX office with nothing, because of how Vibe works.
- A design claim: Vibe chose to erase the sender's messages from the recipient's side.
- The first campus story becomes "on Vibe, harassers can delete the evidence".

**Why the draft fails.** The Terms disclose the behaviour as a feature. Disclosure is no defence for a design that foreseeably destroys a victim's evidence. There is no hold on an account that has been reported, no "message from a deleted account" placeholder, and the snapshot covers one item at a time.

### A-03 · The catfish buys Vibe+ and harvests who looked
**Persona:** malicious user · **Severity:** high (from the day billing turns on)

**The clause.**
- §2: "A login on its own lets you set up a profile, follow people and clubs, ... manage a subscription", followed by "[DECISION: RSVP and Vibe+ are open to unverified logins today; companion I recommends closing both.]"
- §10: "Vibe+ ... lets you see who viewed your profile and posts".

**The play.**
1. Make any Gmail login. Set a name, photos and the bio "IU Indy nursing '28". The display name is free text (§4), and the profile is public on the internet without a badge (H19: the signed-out profile route).
2. Follow 300 students; following people has no verification gate (B7). Each one gets a notification, and some tap through.
3. Buy Vibe+. Checkout needs accepted Terms only, not verification (E13). The viewer list now names every student who looked.
4. The viewer has no opt-out. The /plus page says so: "No hiding that you viewed someone" (`src/app/plus/page.tsx`).

**What Franky loses.**
- A targeting list for a predator or a scammer, built with Vibe's paid feature.
- The first press story about Vibe+.
- An unfairness argument (A-38).

**Why the draft fails.** The fix (companion H18, I5) is still an open decision. If published as drafted, the Terms say any login may subscribe. They sell the viewer's identity without the viewer ever choosing it.

### A-04 · Blocking doesn't make you disappear, and RSVPs are a map
**Persona:** malicious user · **Severity:** high

**The clause.**
- §11: "Block someone and you disappear from each other; messages between you stop; they cannot open your resume."
- §7: "published posts, comments, events and RSVPs are visible to everyone signed in to Vibe".

**The play.**
1. The victim blocks the stalker.
2. The stalker signs out and opens `/profile/<handle>`. Name, photo, bio, year, major, work history and links load for anyone who is signed out (H19). Blocks are enforced only on signed-in reads of posts and comments and on the profile screen (F15).
3. The stalker makes a Gmail login, with no verification. Through the API it reads events and RSVPs at every campus (B7, data-layer caveat; C8: a viewer with no university "defaults to all campuses"). The victim's RSVP to Thursday's club meeting, with its time and room, is right there.
4. The unverified login can also RSVP (B7), so the stalker's name sits on the same list.

**What Franky loses.** A stalking victim who relied on "you disappear from each other". That sentence is Vibe's own promise, and promises are what get around Section 230 (A-47).

**Why the draft fails.** "Disappear" is absolute. The code blocks two tables and one screen. The companion's H20 (RSVP only for verified accounts) controls who can RSVP, not who can read RSVPs.

### A-05 · Flood the report queue
**Persona:** malicious user · **Severity:** medium

**The clause.** §11: "A person on the Vibe team reads every report. We aim to review reports within 24 hours, with reports of child exploitation and self-harm first." Also: "You can report without a verified school email. Reports are limited to a reasonable number per hour."

**The play.**
1. Make 20 Gmail logins. Throwaway email domains aren't blocked (H10 is not built).
2. Each login can file 10 reports an hour. Checked in code: ``rateLimit(`report:${user.id}`, { limit: 10, windowSec: 3600 })`` in `src/app/api/me/reports/route.ts`.
3. That makes 200 reports an hour. Each one emails all three founders, with no content in the email (F14).
4. The one real report is lost in the noise, or the founders mute the alerts.

**What Franky loses.**
- The 24-hour aim fails on the day it matters.
- "Every report" becomes false.
- "Child exploitation ... first" isn't built anywhere. The audit shows no priority queue.

**Why the draft fails.** The promise is counted per report, the limit per login, and logins are free.

### A-06 · Squat a club's name for good
**Persona:** malicious user · **Severity:** medium

**The clause.** §9: "you are not creating a page for a group that already has one on Vibe. We may refuse, rename, merge, hide or hand over a club page that breaks these promises".

**The play.**
1. Before the real society signs with Rylan, a verified user creates "IU Indy Pre-Med Society" with the handle `@premed`. Any verified user can create a club, up to 5 an hour (D9).
2. Club posts are public on the internet under the club's name (H19). The squatter posts a "scholarship application" link.
3. When the real society creates its own page, the real society is the one breaking §9: its group "already has one on Vibe".
4. The squatter's handle can never be changed in the app (D10: "The handle is not editable"), and no merge exists.

**What Franky loses.** The real club's first experience of Vibe is a fight over its own name, in the middle of Rylan's pitch.

**Why the draft fails.** "Rename" and "merge" have no tool. The rule as written protects whoever made the first page, not the real group. Companion D lists "duplicate-name warning" as a gap but gives it no H number.

### A-07 · Scrape the campus and sell it
**Persona:** malicious user · **Severity:** medium

**The clause.** §8: "Scrape or bulk-collect profiles, posts, resumes or any other data, by script or by hand, beyond ordinary personal use, or build a dataset, directory or model from Vibe."

**The play.**
1. Signed out, walk `/api/users/<handle>/bootstrap`. It returns name, year, major, department, skills, work experience and links (H19).
2. Signed in with a throwaway Gmail, read posts, events and follow lists at every campus through the API (B7, data-layer caveat).
3. Sell the directory to recruiters, a data broker or a rival app.

**What Franky loses.**
- A dataset of named students that can't be recalled.
- The remedy in the Terms is a ban, which doesn't work (A-09, A-11).
- Against a scraper who never signed up, the Terms are nothing. After *hiQ v. LinkedIn* (9th Cir. 2022), scraping public pages is hard to attack under the anti-hacking law. A contract claim only works against someone who accepted the contract.

**Why the draft fails.** The clause is a promise from users. The exposure is a product choice. The companion's H16 (limits on unverified reading) is sized "M" and not scheduled.

### A-08 · Delete someone else's account with their handle
**Persona:** malicious user · **Severity:** medium

**The clause.**
- §14: "Settings → Danger zone, type your handle to confirm, and your account is deleted at once. No grace period, no undo."
- §14: "We do not currently keep our own database backups".

**The play.**
1. An ex or a roommate picks up an unlocked phone holding a year-old session (brief §3).
2. They type the public handle and delete the account.
3. Everything goes: every post, every message the owner ever sent (including the copies in other people's chats), the club events they created, and their Vibe+ (no refund).

**What Franky loses.** A student who lost two years of posts and a paid subscription. §16 excludes "lost data", but a court asks whether the design was reasonable when a password check costs an afternoon (H7).

**Why the draft fails.** The draft flags the problem as a [DECISION] and publishes the handle confirmation anyway.

---

## 2. A banned user coming back

### A-09 · Come back with a second school address
**Persona:** banned user · **Severity:** high

**The clause.**
- §12: "the school email verified on the account can never be verified on another Vibe account".
- §8: "Coming back after a ban with another email, another school address ... Any account used for this is closed".
- The Community Guidelines say bans stick to the school email.
- The suspended page (code-facts §I): "a new account can't post, comment or message."

**The play.**
1. Get banned for harassment. Open a new login with a new Gmail. Signup is never checked (F14).
2. Verify a different school address. Some students on the shared Indianapolis campus hold both an `@iu.edu` and a `@purdue.edu` address. Others have a second address at the same school, and the code treats it as a different identity (B4: "The code has no knowledge of institutional aliases"). Verifying the other university's address just switches systems (B4).
3. Pick the same home campus. Post, comment and message again.

**What Franky loses.** The victim who was told "bans stick". The Terms' honest sentence ("We do not have a way today to stop a banned person from creating a new login") becomes Exhibit A. Vibe knew its ban was porous, while the suspended page and the Guidelines told everyone it wasn't.

**Why the draft fails.** The Terms are honest; the other pages aren't (C-12, C-13). "Closed when found" has no finder. Nothing links the new account to the old one except a founder's memory.

### A-10 · Banned, but still reading
**Persona:** banned user · **Severity:** high

**The clause.** §12 (suspension, applied to bans by "The same, for good"): "the only things your account can open are a notice saying what happened, why, and when it ends, and the legal pages; your profile, posts and comments are hidden from other people".

**The play.**
1. Get banned, then sign in. §12 allows it: "A ban does not stop you signing in".
2. Pages redirect to `/account/suspended`, but the API doesn't. `src/proxy.ts` lets every read through for a restricted account: "Reading is still reading — what a restriction stops is writing — so GET, HEAD and OPTIONS go through."
3. Call the feed, events and profile APIs from the browser console. Keep reading the victim's posts and RSVPs.

**What Franky loses.** A victim who reported, saw the ban land, and is still being watched by the same account, after Vibe's words said that account "can open" only the notice.

**Why the draft fails.** The Terms describe the screen; the code governs the API. (Checked in code; the audit's F14 summary lists only the page redirect and the write block.)

### A-11 · Banned before verifying? Nothing happens
**Persona:** banned user · **Severity:** medium

**The clause.**
- §12: "A ban is tied to the school email, not to the person."
- §4: "we may close duplicate accounts we find — always if they are used to get around a block, a restriction, or a limit."

**The play.**
1. An unverified login harasses with follow notifications, likes, RSVPs, a catfish profile and report floods (B7).
2. It gets banned. The only key written is the personal-email one, which is never checked (F14: "EVIDENCE, NOT ENFORCEMENT").
3. A new Gmail login, the same behaviour, thirty seconds later.

**What Franky loses.** Moderation time with no end. The "always" in §4 is broken every time.

**Why the draft fails.** For the whole unverified population, a ban is a speed bump. "Always" is the wrong word for something nothing detects.

### A-12 · The companion's H17 is beaten before it's built
**Persona:** banned user · **Severity:** medium

**The clause.**
- Companion H17: "Use the login-email ban hash ... Check it at signup ... and at school-email verification".
- Terms §12: "we keep a scrambled record of the banned account's login email as evidence".
- Companion I11: "it is a privacy disclosure, not a secret".

**The play.**
1. The personal key is built from the signup-time address, "lowercased and trimmed only" (F14). If `jdoe@gmail.com` is banned, `j.doe@gmail.com` and `jdoe+2@gmail.com` reach the same inbox and hash differently.
2. Or change the login email before misbehaving, through the auth provider's own endpoint, which the app doesn't block (A2). The ban then hashes the stale signup address (A2: `public.users.email` "is never re-synced").
3. Or just use a new Gmail.

**What Franky loses.**
- Engineering time on a check that stops only the laziest person coming back.
- Meanwhile Vibe keeps, forever, a keyed hash of every restricted person's personal email, including a spammer suspended for a day (F14: two keys per restriction, and the secret key can never be changed).

**Why the draft fails.** The companion sizes H17 "S" and presents it as closing ban evasion. It doesn't, unless two things happen first: H6 (blocking the direct email change) lands, and the address matching strips `+tags` and Gmail dots. Even then, a new Gmail beats it.

### A-13 · Win the appeal after deleting, and the address stays locked
**Persona:** banned user · **Severity:** medium

**The clause.** §12: "If you deleted the account before the appeal succeeded, we cannot restore the data (Section 14), but the school email is freed so you can start again." Also: "Appeals. Email help@connectvibe.app from the login email on the account".

**The play.**
1. Get banned, delete the account in anger, then appeal within 30 days from the old login email, which is no longer on any account.
2. Vibe agrees it was a mistake. But the lift tool finds restrictions by account id (checked in code: `liftRestriction` filters `.eq("user_id", args.userId)` in `src/lib/moderation/actions.ts`), and deletion set that id to null (F14: "`user_id` nulled").
3. Nothing in the app can free the address. Franky has to recompute the hash, find the row and edit it by hand.

**What Franky loses.** A broken written promise to someone Vibe admits it wronged. If it takes weeks, a complaint.

**Why the draft fails.** The promise assumes a tool that only works while the account still exists.

---

## 3. A student disputing an impersonation

### A-14 · Vibe's own badge vouches for the impostor
**Persona:** impersonation victim · **Severity:** critical

**The clause.**
- §3: "Badge ... It means 'verified school email', nothing more."
- §5: "Treat it as 'this person had a university email', not 'this person is a student'".
- §15: "We make no promise ... that any user is who they say they are".

**The play.**
1. A classmate verifies their own `@iu.edu`, then names the profile after the victim and uses her photos. §4 allows it: "Your display name is free text".
2. The desktop profile shows "🎓 Student · IU Indianapolis" (`public/html/profile.html:8532`). On mobile the badge falls back to "Student" (`ProfileMobile.tsx:6485`).
3. Post racist or sexual content as "her". The screenshots spread with Vibe's "Student" badge next to her name.

**What Franky loses.**
- Her lawyer sues Vibe, not only the impostor. Section 230 protects what users post; it doesn't protect Vibe's own words, and "Student" is Vibe's word.
- She may never have signed the Terms, so the $100 cap and the Marion County venue don't bind her.

**Why the draft fails.** The Terms define the badge narrowly, but the app tells the world something broader, and people who never read the Terms can't be bound by a definition inside them. Three strings fix it (companion F8), and they aren't scheduled before the Terms publish.

### A-15 · Hijacked, banned, and locked out for good
**Persona:** impersonation victim · **Severity:** critical

**The clause.**
- §4: "You are responsible for what happens under your account ... until you tell us".
- §12: "the school email verified on the account can never be verified on another Vibe account", and "Appeals. Email help@connectvibe.app from the login email on the account, within 30 days".
- §16 excludes harm "by someone who got into your account".

**The play.**
1. Take over a student's account. Routes: A-01; a reused password (no leaked-password check on the Free plan, A1); or a year-long session left on a shared computer (brief §3). From the live session, change the password; the old one isn't asked for (brief §3).
2. If production allows a one-sided email change (local config requires both addresses to confirm; the audit can't see the dashboard, A2), take the login email too.
3. Post an intimate image. Under §12 that is "a ban the first time". The founders ban the account, and the victim's school email is hashed for good.
4. The victim appeals, but the appeal must come "from the login email on the account" (which may now be the attacker's) and "within 30 days". A student who didn't open Vibe for a month has lost the window.

**What Franky loses.**
- An innocent student permanently barred from verifying on Vibe, with no way back that the Terms describe.
- A story in which every fact is a known issue from Vibe's own security review: a regulator's case and a sympathetic plaintiff.

**Why the draft fails.** The ban is built to be permanent, and appealing it needs the login email. The Terms have no "my account was hijacked" exception. Admins have no tool to contain a takeover first: no sign-out-everywhere (H5) and no freeze (H4).

### A-16 · Use the recovery process to take the real account
**Persona:** impersonation victim (the attacker wins the account) · **Severity:** high

**The clause.**
- §13: "email help@connectvibe.app from any address and tell us your handle ... We may ask for any reasonable combination of: a reply from the school email verified on the account; a small change to your profile that we describe; details only the account holder would know (when you joined, clubs you are in, who you message); a photo of a student ID with the number covered; or a short video call. We decide what is enough."
- Companion E: "(any two of tier 1, or one of tier 1 plus two of tier 2, or a live call)".

**The play.**
1. A roommate or an ex writes to help@ as the victim: "I lost my Gmail."
2. A roommate knows the "details only the account holder would know": when they joined, their clubs (members see the roster and club posts show authors, D12), and who they message.
3. A student ID photo "with the number covered" can't be checked against anything. Or book the "short video call" with the cofounder who half-knows the victim from campus; under companion E, a live call alone is enough.
4. Franky changes the login email by hand at the auth provider, because no tool exists (G16). That leaves `public.users.email` and the ban key stale (A2).

**What Franky loses.** Vibe handed over the account itself. That is Vibe's act, not user content, so Section 230 doesn't apply. The §16 exclusion for "our decision on who holds ... an account" is the kind a court reads narrowly when the process was this thin.

**Why the draft fails.** The evidence list mixes strong and weak items and lets Vibe "decide what is enough", with no minimum. The companion's live-call-only route is weaker than the Terms suggest. And the only way to carry out a recovery corrupts two records.

### A-17 · If you're not on Vibe, you can't complain without signing up
**Persona:** impersonation victim who isn't a user · **Severity:** high

**The clause.**
- §11: "Report a post, comment, message, chat, event, club or person from its menu". For intimate images only: "You do not need an account."
- Intro: "Safety, appeals and takedowns: help@connectvibe.app".

**The play.**
1. A professor, or a student who isn't on Vibe, learns that someone made a Vibe profile with their name and photo.
2. Reporting in the app needs a login. To get one, they must tick "I agree to the Terms", accepting the $100 cap, the Marion County venue, the indemnity, and Vibe's right to decide identity disputes as "final" (§13).
3. Their lawyer either argues the signature was forced or skips reporting and sues directly. Either way, the Terms protect nothing.

**What Franky loses.** A non-user plaintiff (A-14) bound by nothing, and possibly a university (A-29).

**Why the draft fails.** Only intimate-image requests have a path without an account. Impersonation, doxxing and threats against people who aren't users don't. A plain line fixes it at no cost: "Not on Vibe? Email help@, no account needed."

### A-18 · Whack-a-mole with unverified impostors and recycled handles
**Persona:** impersonation victim · **Severity:** medium

**The clause.**
- §4: "If you delete your account, your old handle becomes available to others."
- §8: impersonation.
- §12: "the new account is banned when found."

**The play.**
1. An impostor makes a Gmail-only profile with the victim's name, photo and the bio "IU Indy '27". It can't post, but it's public on the internet (H19).
2. Ban it, and a new Gmail brings it back (A-11).
3. If the victim deletes her own account to get away, her handle is free that same second. The impostor takes it, and old links and screenshots now point to the impostor.

**What Franky loses.** A victim who can't make it stop. The handle half is a design choice Vibe made knowingly (H9 unbuilt).

**Why the draft fails.** Every remedy in the Terms works one account at a time, and accounts are free.

### A-19 · Nothing can be preserved for a court
**Persona:** impersonation victim · **Severity:** medium

**The clause.**
- §14: "No grace period, no undo", and "We do not currently keep our own database backups, so we cannot restore deleted data for you or for anyone."
- The Terms say Vibe "answer[s] legal process as the Privacy Policy says" (§5).

**The play.**
1. The victim's lawyer sends the impostor a cease-and-desist letter, and sends Vibe a request to preserve the account.
2. The impostor deletes the account that hour. Posts, messages, follows and events all go with it (G17). Only items that were reported survive, as snapshots.
3. The lawyer subpoenas Vibe for the account's content and logs. Vibe has a hash and a snapshot.

**What Franky loses.** A court can sanction a party that fails to preserve evidence after notice, and Vibe will be asked why it had no way to hold an account. The police and a Title IX office get the same empty answer.

**Why the draft fails.** The Terms promise to answer legal process, but the system has no way to hold an account, and deletion is instant by design.

---

## 4. A former club officer

### A-20 · Spite-delete the club
**Persona:** former officer · **Severity:** critical (for the business)

**The clause.**
- §9: "Only the owner can delete a club. Deleting it deletes its posts, events, chats, invites, and member and follower lists".
- §9, step 1: "the owner promotes the successor to admin and emails help@connectvibe.app, and we move the owner role by hand."
- The club school-email [DECISION]: the successor may "claim the owner role after a 7-day notice to the current owner".

**The play.**
1. The outgoing president loses the election, or learns that Vibe is about to move the owner role (the draft's own 7-day notice tells them).
2. They delete the club: one owner, one action, no delay, no second officer (D10). Posts, events, chats, members and followers all go.
3. There are no backups (§14).

**What Franky loses.**
- One of the 10 signed clubs Rylan needs before students are invited, and that club's semester calendar.
- The trust of the next club Rylan pitches.
- The club isn't a party to the Terms (§9), so it can sue without the cap (A-50).

**Why the draft fails.** The draft protects the page from officer turnover with an email process, but leaves the one-click destroy button in a single person's hands. The missing half is a 7-day undo window for verified clubs, or a second officer's approval to delete.

### A-21 · The graduate keeps the keys
**Persona:** former officer · **Severity:** high

**The clause.**
- §9: "Only the owner can promote or demote admins." Roles "are given by the club's owner or admins, or by us under the transfer rules below."
- §5: "When you graduate ... Your account stays yours."

**The play.**
1. The founding president graduates but keeps the Gmail login and the owner role. Nothing in the Terms ends a Vibe role at graduation.
2. The new board asks for control. The graduate refuses and demotes every admin; only the owner can demote admins (D10).
3. The new board writes to help@. The Terms say "We decide; we may say no; and we may leave the page with no owner while we look", with no timeline. Only Franky can make the change, by SQL (companion E: "only Franky can execute a database change today").

**What Franky loses.**
- A club stuck through recruitment season.
- Three founders refereeing a student-government fight.
- Rylan's demo-day answer to "what happens when officers graduate?" becomes "email us and wait".

**Why the draft fails.** Owner transfer (H1) doesn't exist, and the Terms never say what ends an owner's claim to the page.

### A-22 · Personal Vibe+ billed to a dead school address
**Persona:** former officer · **Severity:** high

**The clause.**
- §10: "It renews automatically ... we will tell you by email at least 30 days before a price increase".
- §9: "If an officer pays for Vibe+, it is their subscription ... no club, successor officer or group treasurer has any claim on it or any right to cancel or refund it".
- Companion D calls this "the only unavoidable ugly outcome".

**The play.**
1. The officer signed up with `@iu.edu` as the login, because the landing page told them to. They bought yearly Vibe+, then graduated, and IU closed the address.
2. They can't reset the password; resets go only to the login email (G16). Stripe's receipts and the promised price notice go to a dead inbox.
3. The renewal hits their card, and they dispute it as unrecognised. Vibe only records disputes (E13), so Vibe+ stays on until Franky cancels it by hand.
4. Repeat across a graduating class.

**What Franky loses.** Stripe charges a fee per dispute. A small subscriber base with a wave of spring disputes looks like a high dispute rate, and that is how Stripe decides to restrict an account. Stripe is Vibe's only way to take money.

**Why the draft fails.** The Terms promise notices to an address they know will die. The only mitigation (H6, changing the login email) isn't built, and there is no reminder before a yearly renewal.

### A-23 · A suspended or banned owner freezes the club
**Persona:** former officer · **Severity:** medium

**The clause.** §9: "we may remove your role, restrict you, or restrict the club". §12 ("Clubs"): "roles can be removed".

**The play.**
1. The owner is suspended or banned. A restriction hides content but doesn't touch roles, so the owner row stays.
2. No one else can promote or demote admins, and the app says "Owner role can't be changed here" (D10).
3. The club can't change its officer team until Franky edits the database.

**What Franky loses.** A club punished for its president's conduct. Vibe's own sentence, "roles can be removed", is untrue for the one role that matters.

**Why the draft fails.** No admin-desk tool can change an owner. H1 covers only a voluntary transfer.

### A-24 · "That's my logo, and those are my posts"
**Persona:** former officer · **Severity:** medium

**The clause.**
- §7: "When you post, upload or write something *as a club* ... you give the club's officers, present and future, the same license, so the club's page keeps working after you leave".
- The same section: "This license ends when you delete the content or your account, except for what Section 14 says survives."
- §7, Copyright: "[DMCA AGENT ADDRESS — ...]".

**The play.**
1. The former officer who designed the logo files a copyright takedown against the club's own page.
2. "The same license" is the license to Vibe "to run the Service". It's unclear that officers, who don't run the Service, got anything usable. And the general license says it ends when the account is deleted.
3. Until the copyright (DMCA) agent is registered, Vibe has no safe harbour and has to decide the fight on its own.

**What Franky loses.** A copyright dispute Vibe must referee without the legal shield, and a club without its logo.

**Why the draft fails.** The club license is bolted onto a license written for Vibe, which ends on deletion. It never says the club license can't be revoked or that it outlives the officer's account.

---

## 5. A new club officer

### A-25 · Take over a club by claiming it
**Persona:** new officer (the one taking over) · **Severity:** high

**The clause.**
- §9, step 2: "an admin, a member, or a person who can show they now run the group may ask us ... We will ask for what we reasonably need ... for example, a message from a club school email, the group's own listing of officers on the university's organization site, a message from an existing officer on Vibe, or a short call. We decide".
- §9: "Verification ... does not transfer if the page changes hands without us."

**The play.**
1. Over the summer, the VP who lost the election asks for the owner role, saying the president "left". The "message from an existing officer" comes from an ally who is an admin.
2. The university's org listing is often out of date and is edited by the group's own officers, and a screenshot is easy to fake. No club school email exists (H12 unbuilt).
3. Vibe hands over the page. Because it changed hands *with* Vibe, the verified badge and the power to create events go along.
4. The new owner messages 300 followers and posts events as the club.

**What Franky loses.** The real president's group sues over a page Vibe gave away. §16 excludes Vibe's "decision on who holds a club role", but only against users, and the group isn't one (§9).

**Why the draft fails.**
- The evidence list is a set of examples, not a minimum.
- The current owner gets no notice and no time to object; the 7-day notice exists only in the [DECISION] about an unbuilt feature.
- No freeze exists (H4).

### A-26 · The real club can't get its page back
**Persona:** new officer · **Severity:** high

**The clause.** §9, step 2: "We decide; we may say no; and we may leave the page with no owner while we look". Step 4: "A club with no officers left may be hidden, handed to a person who shows they now run the group, or deleted after 12 months with no officer". Also: "a club whose owner is gone can be deleted only by us".

**The play.**
1. The owner deleted their account, so the club is orphaned: `owner_id` is empty, and "nobody can delete the org or promote, demote or remove admins through the app" (D11).
2. The new president asks for the page. The Terms set no deadline and no tool exists (H1, H2). Or the page was squatted (A-06), and its handle can never change (D10).
3. The new president gives up and runs the club on Instagram.

**What Franky loses.** The product thesis, replacing Instagram for clubs, fails on the first graduation cycle.

**Why the draft fails.** Every step of "passing a club down" is Franky running SQL, and the Terms commit to nothing about timing.

### A-27 · The calendar disappears with the officer who posted it
**Persona:** new officer · **Severity:** medium

**The clause.**
- §7: "if you delete your account, the posts and events you created as the club are deleted with it (Section 14), so before you leave, ask another officer to repost anything the club needs to keep".
- §9, step 5: "content posted as the club stays with the club (Section 7)."

**The play.**
1. The social chair posts the spring events in November and deletes her account in December.
2. Every event she created goes with her, RSVPs included (D11: `events.creator_id ON DELETE CASCADE`).
3. The new officer finds an empty calendar two weeks before the first event.

**What Franky loses.** A club event nobody attends because it vanished. The club blames Vibe, not the officer.

**Why the draft fails.** §9 step 5 says club content "stays with the club"; §7 says it's deleted. The two sentences contradict each other, and the code sides with §7 (H19 unbuilt).

### A-28 · "Verified" rides along with a private handover
**Persona:** new officer · **Severity:** medium

**The clause.**
- §9: "Verification is not a university endorsement ..., can be removed at any time, and does not transfer if the page changes hands without us."
- §8: "Buy, sell, rent, lend or transfer ... club roles, or verified-club status."

**The play.**
1. The outgoing president promotes a friend (or a buyer) to admin, then leaves.
2. `verified` is a single field on the club, set only by platform admins (D10), and nothing re-checks it when roles change.
3. The new admin keeps "Verified by Vibe", event creation and invites.

**What Franky loses.** A verified page run by someone Vibe never met, wearing Vibe's badge. The §8 ban on selling roles has no way to catch anyone.

**Why the draft fails.** "Does not transfer" is written as a fact, but the code transfers it automatically.

---

## 6. A university (IU or Purdue: counsel, the trademark office, student life)

### A-29 · "IU verified" and "Officially recognized": trademark and false endorsement
**Persona:** university · **Severity:** high

**The clause.**
- §6: "We use the names 'Indiana University', 'Purdue University', campus names ... only to say where a person or club says they belong. That use does not mean either university sponsors ... and we claim none of that."
- §3: the badge "reads with the campus name or 'IU verified' / 'Purdue verified'".

**The play (the trademark office's letter).**
1. "IU verified" and "Purdue verified" use the universities' names as a mark of approval that Vibe hands out, not as a place someone says they belong.
2. "Officially recognized clubs at {campus}" (`campus-home.tsx:12251`) tells students the university recognised them.
3. The landing page shows "IU · Purdue live" chips. The confirmation email calls Vibe "the social app for students, clubs and orgs at IU and Purdue". Marketing says "real students only".
4. The letter goes to Vibe and to Apple and Google, both of which act on IP complaints against apps.

**What Franky loses.** A takedown request around the Oct 16 store submission, and the campus relationships Rylan needs.

**Why the draft fails.** §6 describes naming the school only to say where someone belongs, which is allowed. The badge and the club list go beyond that. The REVIEWER bracket flags the issue, but the copy fixes aren't tied to the day the Terms publish.

### A-30 · A suspended chapter, "officially recognized", running events
**Persona:** university · **Severity:** high

**The clause.**
- §9: "We mark a club as verified after we have satisfied ourselves that it is a real campus organization and that the officers on Vibe speak for it. Today that is a founder's judgment".
- §6: "A club existing on Vibe, or being marked as a verified club, does not mean the university recognizes it."

**The play.**
1. A chapter the university has suspended (for hazing, say) is still "a real campus organization" in the founders' judgment, so it gets verified.
2. It now appears under "Officially recognized clubs at IU Indianapolis". Because it's verified, it can create events and send invites (B6; brief §4).
3. It posts a party, and something goes wrong.

**What Franky loses.**
- The university's risk office, and the press, ask why Vibe advertised a suspended group as recognised. The injured student's lawyer asks the same question.
- The only real club today is a founder's own chapter, verified by the founders. That is an appearance problem now, and ammunition in the first dispute.

**Why the draft fails.** There are no written criteria (the audit: "no documented criteria") and no check against university status, and the app says "officially recognized" while the Terms say the opposite.

### A-31 · "We never tell your university" versus campus police and Title IX
**Persona:** university · **Severity:** medium

**The clause.**
- §5: "We never tell your university. We do not send universities your information ... If a university asks us to act on an account, we treat it like any other report ... and we answer legal process".
- §6: "Emergencies: call 911 or campus police".

**The play.**
1. A post threatens violence on campus. The campus police department belongs to the university.
2. If Vibe calls IU's police, the poster (or a student whose data went along) says Vibe broke §5.
3. If Vibe stays silent to keep §5 and something happens, that is worse.
4. Separately, a Title IX office asks for help with a harassment case between two students. Without a subpoena, §5 forbids it.

**What Franky loses.** A contract claim whichever way Vibe goes. And the absolute "never" rules out any future partnership with the university, which is where Rylan's campus work leads.

**Why the draft fails.** "Never" has no exception for emergencies or consent. The companion's J18 asks counsel whether to notify a university about professor impersonation, which the Terms already forbid.

### A-32 · The university owns the verification pipe
**Persona:** university · **Severity:** low

**The clause.** §3: "We may add or remove domains over time", and all of §5.

**The play.** The university's IT office decides outside apps shouldn't email student inboxes and filters `noreply@connectvibe.app`, or tells students not to use their school address for outside services.

**What Franky loses.** New students at that university can't verify. The "verified" layer, which every other rule depends on, stops working there overnight.

**Why the draft fails.** No clause says what happens to posting if verification becomes impossible for a school, and no fallback exists. It's low because it's unlikely at pilot scale, but it's the one lever a university can pull without a lawyer.

---

## 7. A privacy regulator (the FTC, the Indiana Attorney General)

### A-33 · TAKE IT DOWN: a 48-hour federal clock with no one on call and no image matching
**Persona:** privacy regulator (FTC) · **Severity:** high

**The clause.** §11: "We remove it within 48 hours of a valid request, along with identical copies we find." The Community Guidelines also say "within 48 hours".

**The play.** The FTC enforces the TAKE IT DOWN Act's platform duties as unfair or deceptive practices, and those duties took effect May 19, 2026.
1. A removal request reaches help@ on a Friday night in finals week. help@ is an email alias: no ticketing, no one on call, and the three founders are students.
2. "Identical copies we find" needs a way to find them, and there isn't one (F14: "No image or CSAM hash scanning exists"). Re-uploads under new file names are missed.
3. The removed image goes to the quarantine bucket, which has no purge job (A-39).
4. Nobody keeps a record of requests and removals. The REVIEWER bracket asks what records are needed; none are kept today.

**What Franky loses.** An FTC inquiry under a brand-new law that is looking for its first cases. And a victim's lawsuit built on Vibe's own words, "within 48 hours" (A-47).

**Why the draft fails.** The law and the Terms both say 48 hours, but nothing makes sure someone looks within 48 hours, and "identical copies" needs a tool that doesn't exist.

### A-34 · The Privacy Policy describes a different app
**Persona:** privacy regulator · **Severity:** high

**The clause.**
- Terms, intro: "Our Privacy Policy explains what we collect and what we do with it ... you agree to it at the same time".
- The live Privacy Policy (code-facts §I): "cookies for sign-in sessions and CSRF protection", "aggregate usage analytics", "turn on multi-factor authentication if your account email supports it". Providers listed: Supabase, Vercel and R2 only (H18).

**The play.**
1. A regulator, or Apple checking the privacy label, compares the policy with what the app actually does.
2. Data also goes to Resend, Stripe, Sentry, Firebase Cloud Messaging, Google Fonts (every visitor's IP address goes to Google on page load), Cloudflare cdnjs, and Cloudflare Email Routing, which forwards to a personal Gmail (H18).
3. There is no CSRF cookie, no analytics tool and no multi-factor authentication.

**What Franky loses.**
- A deception claim that needs no proof of harm.
- A store rejection if the privacy labels don't match.
- Indiana's consumer-protection law reaches Vibe+ as a consumer purchase.

**Why the draft fails.** Terms v2 pulls the Privacy Policy in by reference. The companion lists the fixes (B), but the Sept 7 base and the live page are still wrong. The Terms go live Oct 14; the Privacy fixes have no date.

### A-35 · "Only one cofounder can reach your data" is false
**Persona:** privacy regulator · **Severity:** high

**The clause.**
- Terms, intro: "only one of them, Francisco Cazares, can reach the systems that hold your data (Privacy Policy, section 1)".
- Companion B: "Platform admins (the three cofounders) can see everything above plus login and school emails ... Only one cofounder can reach the database directly."

**The play.**
1. All three founders are platform admins (brief §1). The admin desk shows reported content (message text, media links), restriction history with private notes, hidden clubs, removed content, and lookup by exact email (H19).
2. Email carries data too. hello@ forwards to Franky's personal Gmail. James and Rylan read `vibe.llc@outlook.com`. Recovery requests with ID photos and intimate-image removal requests land in those inboxes.
3. A student finds out that a founder they know socially read their DM in a report.

**What Franky loses.** A false privacy statement in the first paragraph of the contract.

**Why the draft fails.** A regulator reads "reach the systems" as "see the data", and three people see it. The companion overstates in the other direction: the admin lookup doesn't return email addresses (H19: "the email is not returned").

### A-36 · Known security holes, and the founder personally
**Persona:** privacy regulator (FTC) · **Severity:** high

**The clause.** §15: "We make no promise that it will be ... secure". §4: "We do not offer two-factor authentication today".

**The play.** The FTC asks what reasonable steps Vibe took on security problems it already knew about.
1. The record:
   - the pre-registration takeover (A-01);
   - sessions lasting over a year;
   - password changes without the old password;
   - account deletion confirmed by the public handle;
   - no leaked-password check on the Free plan;
   - no two-factor on the three admin accounts, which can ban anyone and read reported content (brief §3; A1; H13).
2. All of it is documented in Vibe's own security review of Sept 27, before launch.
3. In the Drizly case (2022–23), the FTC's order bound the CEO personally, including at future companies. Franky is the only person with data access.

**What Franky loses.** A consent order with Franky's own name on it.

**Why the draft fails.** Saying "we don't promise security" doesn't answer a regulator asking what was done about known problems. H11 and H13 are sized "M" and have no dates.

### A-37 · Privacy and the Guidelines change through a side door
**Persona:** privacy regulator · **Severity:** medium

**The clause.**
- §1: "Simply continuing to use Vibe never counts as accepting a new version. We always ask."
- §19: "Continued use is never acceptance."
- Intro: where the Guidelines "say something is not allowed, that is a rule under these Terms too".

**The play.**
1. Only `TERMS_VERSION` triggers a new acceptance; Privacy changes don't (A3). The live Privacy page is dated Sept 28, but every account accepted the May 7 version.
2. So by Vibe's own rule, nobody has accepted the current Privacy Policy.
3. The Guidelines also change on their own dates. Their "not allowed" parts become rules in the Terms with no new version and no new acceptance.

**What Franky loses.**
- Any new use of data under the Sept 28 policy lacks the consent the Terms promise. The FTC has long treated material privacy changes applied to data already collected, without clear consent, as deceptive.
- Banning someone under a Guidelines rule added after they accepted becomes a contract fight.

**Why the draft fails.** "We always ask" covers one document, and so does the code. The other two slip through.

### A-38 · Selling who-viewed-whom with no opt-out
**Persona:** privacy regulator · **Severity:** medium

**The clause.**
- §10: "Vibe+ ... lets you see who viewed your profile and posts (everyone sees the counts; Vibe+ shows you the names)".
- §7: "We do not use Your Content ... to sell or license to anyone else."
- Brief §2: "identities are private".

**The play.**
1. Every visit is recorded (`profile_views` stores the viewer, the date and a referrer; `post_views` too) and sold, by name, to the person viewed.
2. There's no way to browse without being recorded. The /plus page says so: "No hiding that you viewed someone."
3. Views recorded before Sept 12 were shown free to everyone (the /plus page's own history, "Why the names disappeared") and are now behind a paywall.

**What Franky loses.**
- An unfairness argument: selling one user's behaviour to another without giving them a choice.
- A safety harm: a victim who checks her abuser's profile is named to him.
- Indiana's privacy law (in force since Jan 1, 2026) doesn't cover Vibe at its size. But its definition of a "sale" is what counsel will measure growth against.

**Why the draft fails.** "Identities are private" is the marketing line, and the product sells exactly the identity of the viewer.

### A-39 · Retention promises the database blocks or never carries out
**Persona:** privacy regulator · **Severity:** medium

**The clause.**
- §14: "Moderation records ... [REVIEWER: retention period; default 3 years]".
- §14: "Media our moderators removed, or that was reported, kept in a locked area as evidence for up to a year."
- Companion B: "Recovery evidence ... Deleted 90 days after the request closes".
- §12, about the ban record: "it cannot be turned back into the address".

**The play.**
1. `moderation_actions` refuses deletion through a database trigger, "even for service_role and postgres" (F14). "3 years" means forever, unless a migration drops the trigger.
2. Quarantined media: the code says files are "kept for up to a year until the lawyer says how long" (`storage-purge.ts`), and no purge job exists in the migrations (checked). "Up to a year" means indefinitely.
3. Recovery evidence sits in a personal inbox with no deletion process.
4. The ban record hashes school emails with a secret key that can never be changed (F14). School usernames are a small, guessable set, so anyone who gets the key can test every address in a directory. "Cannot be turned back" is true only while one secret stays secret forever.

**What Franky loses.** Each item is a false statement about how long data is kept. Together they are a pattern a regulator writes up.

**Why the draft fails.** Every retention figure is a promise with nothing behind it that carries it out.

---

## 8. A consumer-protection regulator (auto-renewal, refunds, dark patterns, age)

### A-40 · Selling customization that doesn't exist
**Persona:** consumer regulator · **Severity:** high (from the day billing turns on)

**The clause.** §10: "Vibe+ unlocks extra profile customization and lets you see who viewed your profile and posts."

**The play.**
1. Subscribe, then look for the customization. There is none.
2. `requirePlus` unlocks only viewer names. Checked: it is used only in the two viewer routes, matching E13.
3. The /plus page itself says the customization line stays "nothing here is charged for until it exists".

**What Franky loses.** A refund demand from every subscriber, and a deception claim from the Indiana Attorney General (under the state's consumer sales law) or the FTC. The contract promises what the product page disclaims.

**Why the draft fails.** The Terms describe the roadmap, not the product. Deleting half a sentence fixes it.

### A-41 · A suspended subscriber can't cancel and keeps paying
**Persona:** consumer regulator · **Severity:** high

**The clause.**
- §10: "Cancel any time from the Vibe+ page ('Manage subscription', which opens Stripe's portal)".
- §10: "A suspension leaves Vibe+ running and does not extend the paid period."

**The play.**
1. A monthly subscriber is suspended for 365 days, the maximum (F14).
2. Every page, /plus and /settings included, redirects to `/account/suspended`, which offers only Sign out and Delete account. The code says so itself (`src/proxy.ts`): "nothing on screen ever POSTs [the portal] ... the page tells a paused student to write to support instead."
3. The student either pays for a year of a service they can't open, or deletes everything to stop the charge.

**What Franky loses.**
- The federal online-subscriptions law (ROSCA) requires a simple way to stop recurring charges. California requires online cancellation when you signed up online.
- Charging for a service Vibe itself switched off is the easy version of an unfairness case.

**Why the draft fails.** The Terms promise a cancel button the suspended student can't reach. Either pause billing during a suspension, or put the portal button on the notice.

### A-42 · "One quick thing": the re-acceptance screen may void v2
**Persona:** consumer regulator (dark patterns) and plaintiff's counsel · **Severity:** high

**The clause.**
- §1: "If we publish a new version, we show it to you the next time you open Vibe and ask you to accept it". See also §19.
- The screen's copy (A3): "One quick thing." "We now record your agreement to the Terms of Service and Privacy Policy, and that you're 18 or older ... One tap and you won't see this again."

**The play.** Plaintiff's counsel, after any harm:
1. Every existing account accepts v2 through this screen, and every account sees it again after each new version.
2. The screen doesn't say the Terms changed, what changed (a named company, a liability cap, an indemnity, auto-renewal, the court venue), or that the user is agreeing to a new contract. It says the opposite: a record-keeping formality you "won't see ... again".
3. Courts ask whether a reasonable user would understand they were agreeing to terms. See *Berman v. Freedom Financial* (9th Cir. 2022), on inconspicuous notice.

**What Franky loses.** If v2 doesn't bind existing users, the old May 7 page governs: "the Vibe team", Monroe County, no subscription terms, and a "baseline draft" disclaimer.

**Why the draft fails.** The Terms are only as strong as the screen where people accept them. And "you won't see this again" becomes false the day v2 publishes.

### A-43 · Store reviewers read the Terms too
**Persona:** consumer regulator (the app stores act as one) · **Severity:** high

**The clause.** §2: "You must be 18 or older. We rely on your confirmation at signup". Also §12 (bans), the live Child Safety Standards page, and §20 (app stores).

**The play.**
1. Google Play's Child Safety Standards policy asks social apps to publish standards (done), provide in-app reporting (done), and declare that they comply with child-safety law. In the US that means reporting to NCMEC's CyberTipline, and Vibe isn't registered with NCMEC (brief §6, H15).
2. Apple's guideline 1.2 on user content asks for a way to "block abusive users from the service" and timely responses to reports. That looks thin if a reviewer asks: a ban doesn't stop sign-in or a new signup (A-09), and the 24-hour "aim" has no tooling behind it.
3. State app-store age laws (Texas, Utah and others, some being challenged in court) push age signals to developers. Vibe uses a checkbox.

**What Franky loses.** A rejection or a policy strike in the two weeks between the Oct 16 submission and the Oct 31 launch.

**Why the draft fails.** The Terms and pages describe a child-safety process whose first step, NCMEC registration, isn't done.

### A-44 · Auto-renewal and price notices that can't be delivered
**Persona:** consumer regulator · **Severity:** medium

**The clause.** §10: "It renews automatically at the end of each period, at the then-current price ... we will tell you by email at least 30 days before a price increase", and "plus any sales tax the law requires".

**The play.**
1. A yearly subscriber gets no reminder before the $24.99 renewal. Several states require a reminder before a long-term renewal, and California requires a confirmation that includes how to cancel. Students subscribe from every state.
2. The 30-day notice needs someone to send it; Stripe won't do it on its own. For graduates it goes to a dead school inbox (A-22).
3. The price says "plus any sales tax", but no tax is collected (brief §5). The first time tax is added, it's a price increase with a notice duty.

**What Franky loses.** Chargebacks and complaints to state attorneys general in the first renewal season. The FTC's 2024 click-to-cancel rule was struck down in July 2025, but ROSCA and the state laws still apply.

**Why the draft fails.** The Terms carry a bracket that amounts to "counsel will check". The operational pieces don't exist: renewal reminders, the confirmation email, the price notices.

### A-45 · A wrongful ban gets lifted; the money doesn't come back
**Persona:** consumer regulator · **Severity:** medium

**The clause.**
- §12: "If we made a mistake, we undo it: a suspension is lifted, a ban is lifted and the school email freed."
- §10: "A ban ends Vibe+ at once with no refund."

**The play.**
1. A yearly subscriber is banned by mistake in month 2, and the ban deletes their Stripe customer record (F14).
2. The appeal wins. But the lift tool's own header says: "NOTHING IS UNDONE BEYOND THE RESTRICTION. ... lifting the ban does not bring a subscription back" (checked in code).
3. The student asks for the unused $20.

**What Franky loses.** A sympathetic small-claims case, and an easy consumer complaint: Vibe kept money for a service it cut off by its own mistake.

**Why the draft fails.** "We undo it" reads as "we make you whole". §10's refund exceptions don't include "we banned you by mistake".

### A-46 · Free Vibe+ for campus helpers, with no disclosure rule
**Persona:** consumer regulator · **Severity:** low

**The clause.** §10: "Free Vibe+. We may give Vibe+ away (to testers, founders, campus helpers). Free Vibe+ is not a payment".

**The play.** Marketing teasers start, and campus helpers with free Vibe+ post "Vibe is the best app on campus". None says they got something for it.

**What Franky loses.** The FTC's endorsement guides (revised 2023) treat a free subscription as a connection that must be disclosed. This adds to the unpaid-promoter question already with counsel.

**Why the draft fails.** "Not a payment" is a contract point, not an advertising one. A one-line rule for helpers fixes it.

---

## 9. Plaintiff's counsel

### A-47 · The harmed student: Vibe's own promises, and the injury carve-out
**Persona:** plaintiff's counsel (a harmed student) · **Severity:** critical

**The clause.**
- §11: "A person on the Vibe team reads every report" and "We remove it within 48 hours".
- §12: "the new account is banned when found", and ban evasion leads "to a ban the first time".
- The Community Guidelines: "the person on the other end of a post, a comment or a message is a real student at a real school", plus the line that bans stick to the school email.
- §16: "Nothing in these Terms limits liability that cannot legally be limited, such as for fraud, willful misconduct, or death or personal injury caused by our negligence."

**The play.**
1. A student is harassed, then stalked, by someone who was reported, banned and came back (A-09), or who read her RSVPs (A-04). She is hurt.
2. Her lawyer doesn't sue over the harasser's posts; Section 230 would block that. He sues over Vibe's promises. Courts have let claims built on a platform's own specific promises go forward despite Section 230: *Barnes v. Yahoo!* (9th Cir. 2009), and *Estate of Bride v. Yolo Technologies* (9th Cir. 2024), where the app had promised to unmask and ban harassers.
3. He quotes §16: Vibe itself agreed the cap doesn't apply to personal injury caused by its negligence.

**What Franky loses.** The case survives a motion to dismiss. Discovery reaches Vibe's Sept 27 security review. And there is no cap.

**Why the draft fails.**
- The Terms and pages mix "aim" wording with flat promises: "every", "within 48 hours", "banned when found".
- §16 volunteers a negligence carve-out that goes further than US law usually requires.
- Indiana courts follow the Seventh Circuit, so these Ninth Circuit cases persuade rather than bind. That's a reason for counsel to look, not to relax.

### A-48 · The minor who got in
**Persona:** plaintiff's counsel (a 17-year-old user) · **Severity:** critical

**The clause.**
- §2: "You must be 18 or older. We rely on your confirmation at signup; we do not verify age."
- §12: "If we learn an account belongs to someone under 18 we close it and delete its data."
- The Child Safety Standards: Vibe reports to NCMEC.

**The play.**
1. A 17-year-old first-year (IU and Purdue admit some) ticks the box. No date of birth is asked (A3).
2. An older student pressures her into sending an image in DMs. By law, that image is child sexual abuse material.
3. It's reported. A founder removes it and it moves to quarantine (F14), which has no purge job (A-39). Vibe isn't registered with NCMEC (brief §6), so no report goes out "as soon as reasonably possible", as federal law (18 U.S.C. § 2258A) requires. The 2024 REPORT Act raised the fines and extended the period a provider must preserve reported material to one year.
4. Vibe then follows §12 and "deletes its data": her account and messages, the evidence police need and that a provider must preserve after a report. Or it follows the moderation desk's default, a permanent ban that hashes her school email (companion §I).
5. Her parents' lawyer points out that a minor can back out of a contract (states differ on whether lying about age prevents that). The cap, the venue and the indemnity all fall away.

**What Franky loses.**
- Exposure for failing to make a federal report.
- Holding illegal material outside the legal protection that reporting gives.
- An uncapped lawsuit with the worst facts possible.

**Why the draft fails.** The Terms promise deletion where the law demands preservation, and they describe a reporting process that doesn't exist yet.

### A-49 · Delete, then sue: no proof anyone agreed
**Persona:** plaintiff's counsel · **Severity:** high

**The clause.**
- §1: "[DECISION: today the consent record is deleted with the account, so we cannot later prove a deleted user agreed ...]"
- §14: "Proof that you agreed: your user id, the Terms version and the time you accepted, kept 3 years. [DECISION ... Today: deleted with the account.]"

**The play.**
1. A user with a grievance deletes their account. The consent record goes with it (A3: `terms_acceptances` is deleted in cascade).
2. They sue in their home county.
3. Vibe must prove the person agreed to Marion County and the $100 cap. The record is gone; Vibe is left with an append-only moderation log that may mention a handle.

**What Franky loses.** The cap and the venue, for anyone who deletes first, which is anyone with a lawyer.

**Why the draft fails.** If §14 publishes before H3 exists, it states a retention that isn't happening. Without H3, the contract can't be proven.

### A-50 · The defamed club isn't bound by anything
**Persona:** plaintiff's counsel (a club) · **Severity:** high

**The clause.**
- §9: "The student organization behind the page, if there is one, is not a party to these Terms; the people who run the page are."
- §16 excludes liability for "our decision on who holds a club role".
- §9, step 3: "we may freeze ... and we may keep the page visible or hide it while we do."

**The play.**
1. Vibe hides a club during a dispute in recruitment season, or hands the page to a rival faction (A-25), or verifies a rival and not them, so "Officially recognized clubs" lists the rival.
2. The group sues Vibe for interference and for Vibe's own statements, through its officers, or in its own name where the law lets an association do that.
3. By the Terms' own words, the cap and the venue sit in a contract the group never signed.

**What Franky loses.** Uncapped exposure for Vibe's own acts (not user content), in whatever court the group picks.

**Why the draft fails.** The draft correctly says the group isn't a party, which also means the group isn't bound. Officers accepting for themselves doesn't bind the group unless the Terms make them accept on its behalf (counsel question J10).

### A-51 · The exposed student: the Community page says the opposite
**Persona:** plaintiff's counsel (a scraped or exposed student) · **Severity:** high

**The clause.**
- §7: "almost your whole profile, every club page with its recent posts and who posted them, and post link previews are reachable by anyone on the internet ... published posts, comments, events and RSVPs are visible to everyone signed in to Vibe at every campus".
- The Community Guidelines: "Everyone here verified a school email".
- The Child Safety page: "You need a verified school email to be here".

**The play.**
1. A Gmail-only account reads and compiles a student's profile (year, major, work history, links, location text) and her last-active time (brief §3; B7; H19).
2. Her lawyer quotes the Guidelines and the marketing ("real students only"), not §7: she joined a space of verified students, and Vibe let anyone in.
3. §7's disclosure is accurate, but it sits in the Terms. The false statement is on the page she was pointed to.

**What Franky loses.** A deception claim that doesn't depend on Section 230, and a negligence claim tied to A-47's carve-out.

**Why the draft fails.** The draft fixes the Terms, but the page and marketing fixes aren't scheduled alongside it, and a plaintiff will pick whichever document helps.

### A-52 · No arbitration, no class waiver, and defects that affect everyone
**Persona:** plaintiff's counsel · **Severity:** medium

**The clause.** §18: "Any dispute ... will be heard in the state or federal courts located in Marion County ... [REVIEWER: no arbitration clause and no class-action waiver in this draft — a deliberate choice for plainness]".

**The play.**
1. One lawyer files one complaint for every student hit by the same defect: the pre-registration takeover (A-01), the data exposure (A-51), or auto-renewal (A-44).
2. There's no small-claims exception either, so even a $20 refund fight comes with an argument about venue.

**What Franky loses.** Class-action exposure out of all proportion to a three-person company. The cost of defending alone ends it.

**Why the draft fails.** Plainness is a fair value, but the draft doesn't weigh it against defects the company already knows about. This is counsel's call; the attacker's point is that the known defects make it urgent.

### A-53 · The indemnity hands Vibe's defense to a student
**Persona:** plaintiff's counsel · **Severity:** medium

**The clause.** §17: "you agree to defend us and cover our reasonable costs, including attorneys' fees. We will tell you about the claim and let you handle the defense with our reasonable cooperation".

**The play.**
1. A student whose post triggered a claim "handles the defense", as §17 entitles them to. They may have no lawyer, or a lawyer whose interest is to blame Vibe.
2. Meanwhile, a broad indemnity from a 19-year-old with no money is the clause a judge points to when calling the contract one-sided.

**What Franky loses.** Control of Vibe's own defense, plus ammunition for an argument that the contract is so one-sided it's unenforceable, which can take other clauses down with it.

**Why the draft fails.** A standard indemnity lets the company choose to run its own defense; this one hands it over. The REVIEWER bracket asks about proportionality, not about who controls the defense.

### A-54 · Teasers and store screenshots go beyond the license
**Persona:** plaintiff's counsel · **Severity:** low

**The clause.** §7: "a ... license to store, copy, reformat, display, and transmit Your Content to run the Service ... We do not use Your Content for advertising".

**The play.** The marketing teasers and the App Store and Play screenshots, both being made now, show real students' profiles or posts. A student says Vibe used her content in advertising, which §7 says it never does.

**What Franky loses.** An easy, embarrassing claim, and a takedown of the store screenshots.

**Why the draft fails.** The license covers running the Service, not marketing it. Use test accounts or get written consent.

---

## Contradictions

Every place where Terms v2, the companion, the live legal pages (code-facts §I, §J) and the app's own copy disagree. The last column says which is true per the code. The first thirteen are the ones a plaintiff or regulator will quote.

| # | One place says | Another place says | What's true |
|---|---|---|---|
| C-01 | Terms intro: "only one of them, Francisco Cazares, can reach the systems that hold your data" | Companion B: the three cofounders, as platform admins, "can see everything above plus login and school emails" | All three are admins and see reported content, restriction notes and removed content (H19); the admin lookup does **not** return emails (H19). Both documents are wrong, in opposite directions. |
| C-02 | Terms §2: an unverified login can "RSVP to events" | Companion G: an unverified login "cannot post, comment, message, join or create clubs, RSVP or create events" | B7: unverified logins can RSVP. The companion is wrong. |
| C-03 | Terms §7: resumes are "visible only to signed-in users you have not blocked" | Companion G and H16: hide resumes from unverified accounts (as a to-do) | B6/H19: the résumé is already shown to verified viewers only. The Terms understate it, and the companion plans work that's done. |
| C-04 | Terms §7: club posts and events you created "are deleted with it" when you delete your account | Terms §9 step 5: "content posted as the club stays with the club (Section 7)" | D11/G17: deleted. Step 5 is false (A-27). |
| C-05 | Terms §7: the license "ends when you delete the content or your account" | Terms §7: the club license exists "so the club's page keeps working after you leave"; §14: "media uploaded into a club's own storage" survives | The two licenses conflict (A-24). |
| C-06 | Terms §9: "We can read chats when a report or the law requires" | Terms §11: "We may also look at content on our own, including messages, when we have reason to think these Terms are being broken" | Companion B sides with §9. The Terms contradict themselves on when founders read private messages. |
| C-07 | Terms §14: "If removing your files fails part-way, nothing is deleted ... we never delete the account and leave your files behind" | Terms §14, two paragraphs on: "Files that deletion cannot find: media attached to messages you had already deleted one by one, and media uploaded into a club's own storage" | G17: the Stripe customer is deleted **first** (Vibe+ cancelled), and files purged before a failure stay purged. "Nothing is deleted" is false, and "never ... leave your files behind" is contradicted inside the same section. |
| C-08 | Terms §14: "We can end your account too (Section 12) ... then run the same file purge before deleting the login" | Terms §12: suspensions and bans never delete anything | No admin route deletes an account (`/api/admin/users/[id]` answers GET only; checked). Only the user can run the purge. |
| C-09 | Terms §12: a minor's account is closed and "its data" deleted | Companion §I and J1: the moderation desk's default is a permanent ban with the school email recorded | Federal law requires preserving reported child-abuse material for a year after a report (A-48). All three disagree. |
| C-10 | Terms §12: the restricted account can open only "a notice ... and the legal pages" | — | `src/proxy.ts`: every GET goes through for restricted accounts (A-10). |
| C-11 | Terms §10: "Vibe+ unlocks extra profile customization" | The /plus page: the customization line is "nothing here is charged for until it exists" | E13: Vibe+ unlocks viewer names only (A-40). |
| C-12 | Terms §12 (honest): "We do not have a way today to stop a banned person from creating a new login with a different email" | Suspended page: "a new account can't post, comment or message"; Community Guidelines: bans stick to the school email | F14: true only for the same canonical school address (A-09). |
| C-13 | Terms §2 and §5: verification isn't student status, and unverified logins exist | Community: "Everyone here verified a school email, which means ... a real student at a real school". Child Safety: "You need a verified school email to be here ... enrolled at a U.S.-accredited college". Live Terms: "enrolled ... working '.edu'". Live Privacy: "affiliated with a U.S. college". Marketing: "real students only" | A1/B5/B7: any email opens an account; enrollment is never checked. |
| C-14 | Terms §3: the badge means "verified school email, nothing more" | App: "🎓 Student · {campus}", "Verify your student status", "You're verified as a Purdue student", "so we know you're actually on campus" | B4: control of an inbox at one moment (A-14). |
| C-15 | Terms §3: "Campus ... which you choose yourself ... We do not verify it" | Support page: "Vibe also needs a school email to verify your campus"; school-email screen headline "Verify your campus" | C8: campus is self-declared. |
| C-16 | Terms §9 and §6: a verified club is "a founder's judgment" and "not a university endorsement" | App: "Officially recognized clubs at {campus}"; tooltip "Verified by Vibe" | D10: a manual admin switch with no criteria (A-29, A-30). |
| C-17 | Terms §9: verification "does not transfer if the page changes hands without us" | — | D10: the flag stays through any change of roles (A-28). |
| C-18 | Terms §9: clubs choose "whether IU students, Purdue students or both can join"; app: "IU students only" | Terms §5: a school email "does not prove that you are a student"; brief §8 house rule: never "students only" | D12: the check is "holds an @iu.edu address", made at join only; "a label, not a boundary". |
| C-19 | Landing: "Sign up with your school email" | Signup page: "Use your **personal email** — the one you actually check"; Terms §5: "make sure your login email is one you will still have after graduation" | The landing sends students into A-01 and A-22. |
| C-20 | Terms §1 and §19: "We always ask", "Continued use is never acceptance" | Terms intro: Guidelines rules are Terms rules; the Privacy Policy is agreed "at the same time" | A3: only `TERMS_VERSION` asks again. Privacy (dated Sept 28) and Guidelines changes are never accepted (A-37). |
| C-21 | Acceptance screen: "One tap and you won't see this again" | Terms §19: every new version is shown again | Both are live in the code; the screen is false from v2 on (A-42). |
| C-22 | Terms §11: "A person on the Vibe team reads every report ... child exploitation and self-harm first" | — | F14: alert emails carry no content and there's no priority queue; 10 reports an hour per login and unlimited logins (A-05). |
| C-23 | Terms v2: "CONNECTVIBE. LLC"; §18 "Marion County" | Live Terms: "operated by the Vibe team", "Monroe County", "baseline draft" | §J: support and delete-account pages already name the LLC. `TERMS_VERSION` is still "2026-05-07". |
| C-24 | Terms §4: "We do not offer two-factor authentication today" | Live Privacy: "turn on multi-factor authentication if your account email supports it", "CSRF protection" cookies, "aggregate usage analytics" | G16/H18: no MFA, no CSRF cookie, no analytics. |
| C-25 | Live Privacy: providers are Supabase, Vercel, R2 | — | H18: plus Resend, Stripe, Sentry, FCM, Google Fonts, cdnjs, Cloudflare Email Routing, and a personal Gmail (A-34). |
| C-26 | Companion B, row 3: "Verification status and date" is collected | Companion B, row 6: "The date you verified: Not recorded today"; the "eight kinds" table lists the "verification date" as visible to "you and us" | B4: "No verification timestamp column exists." Terms §5 is correct. |
| C-27 | Companion B (officer row): officers can see "who RSVP'd to the club's events" as an officer privilege | Terms §7: RSVPs are visible to everyone signed in | Terms §7 is right; the companion row reads as if RSVPs were private. |
| C-28 | Companion C4: "the ban gets longer, not shorter" | Terms §12: a ban already has no end date | Meaningless as written; it's a promise with no content. |
| C-29 | Terms §13: "we never send a reset link to an address that is not on the account" | Terms §13 (lost login email): recovery is possible | The only way to recover is to put a new address on the account by hand, then reset. The rule forbids the step that follows, and companion E never says how the new address gets on. |
| C-30 | Terms §13: "we may take up to 14 days" (to decide) | Companion E: "Reply within 14 days" (to answer) | Different promises; neither has a process behind it. |
| C-31 | Terms §5: "We never tell your university" | Terms §6: "call 911 or campus police"; companion J18: should we notify the university about professor impersonation? | A-31. |
| C-32 | Terms §20: only the "not allowed" parts of the Guidelines are part of the agreement | Terms §11 restates the 24-hour and 48-hour commitments inside the Terms | The commitments are in the contract whatever §20 says (A-47). |
| C-33 | Terms §2: "the campus pages ask you to verify before they open" | — | B7: the same data is readable through the API without verification; only the web UI hides it. |
| C-34 | Companion G: "Disposable-email domains are refused at signup (H10)", written as a current rule | — | A1: no domain check of any kind at signup. |
| C-35 | Terms §10: "Cancel any time from the Vibe+ page" | Terms §12: a suspended account can open only the notice | `src/proxy.ts`: /plus redirects; the notice has no portal button (A-41). |
| C-36 | Terms §12: appeals come "from the login email on the account" | Terms §12: after deletion, "the school email is freed" | With no account, no login email is on one, and the lift tool needs the account id (A-13). |

---

## Promises the operator cannot keep

Each row is a promise in the Terms, the companion or a live page that needs a tool, a person or a process that doesn't exist today. The pattern is the same every time: the promise is in writing, the operator is three students, and the only person who can run a database change is Franky. Specific written promises are what a plaintiff uses to get around Section 230 (A-47), and what a regulator calls deceptive when they aren't kept.

| # | The promise | Where | What it needs | What exists today | How it gets used against Franky |
|---|---|---|---|---|---|
| P-01 | "A person on the Vibe team reads every report. We aim to review reports within 24 hours, with reports of child exploitation and self-harm first." | Terms §11; Community ("within 24 hours") | A rota across three students, including exam weeks and nights; alerts with enough to judge urgency; a priority queue | Alert emails with no content, no rota, no priority (F14) | A report flood (A-05); a harmed student's promise-based claim (A-47) |
| P-02 | "We remove it within 48 hours of a valid request, along with identical copies we find." | Terms §11; Community | Intake monitored 7 days a week; a log of requests and removals; image matching | An email alias; no log; no matching of any kind (F14) | FTC under the TAKE IT DOWN Act (A-33) |
| P-03 | Child sexual abuse material is reported to NCMEC | Terms §8; Child Safety | Registration with NCMEC, a written reporting procedure, a preservation store | Not registered (brief §6, H15) | Federal reporting duty; Google Play declaration (A-43, A-48) |
| P-04 | Copyright notices, counter-notices, "close the accounts of repeat infringers" | Terms §7 | A registered copyright (DMCA) agent; a strike log | A placeholder; no log | No safe harbour until registered (A-24) |
| P-05 | "we move the owner role by hand" | Terms §9 step 1 | An admin tool, or SQL with an audit entry | SQL by Franky only; no audit entry unless he writes one (H1, H14) | Stuck clubs, disputed handovers (A-21, A-25) |
| P-06 | "we may freeze changes to its roles, name, handle and settings" (clubs); "freeze changes to its emails, handle and Vibe+" (accounts) | Terms §9 step 3, §13 | A freeze flag enforced in routes and the database (H4) | None. The only levers are hiding or restricting, which punish the victim | Coups (A-25) and takeovers (A-15) can't be contained |
| P-07 | "We may refuse, rename, merge, hide or hand over a club page" | Terms §9 | Handle editing; a merge tool | Handles can't be edited (D10); no merge; hiding exists | Squatters keep the name (A-06) |
| P-08 | "a club whose owner is gone can be deleted only by us"; "deleted after 12 months with no officer" | Terms §9 | An admin delete (H2) and a 12-month check | None | Orphaned clubs pile up (A-26) |
| P-09 | "ask you to verify a school email again, and remove the badge if you do not within 14 days" | Terms §5 | An admin action, a deadline, a verification date (H8) | None; no date column (B4) | A graduate's challenged badge can't be handled as promised |
| P-10 | "email hello@ ... and we will change [your login email] after the checks in Section 13" | Terms §4 | A tool that updates the login, `public.users.email`, the Stripe customer email and the ban key together (H6) | None. A direct change at the auth provider leaves our copy and the ban key stale (A2) | Recovery corrupts records (A-16) |
| P-11 | Recovery: "we may take up to 14 days"; companion: "Reply within 14 days", "Log every recovery decision", "Keep evidence 90 days ... then delete it" | Terms §13; companion E | An intake, a log (H14), an evidence store with a purge | None; evidence lands in personal inboxes | A-16; a false retention statement (A-39) |
| P-12 | "We may sign the account out everywhere, reset its password" | Terms §13 | An admin sign-out-everywhere action (H5) | Only the user's own logout does this (G16) | Takeovers can't be stopped (A-15) |
| P-13 | "we will tell you by email at least 30 days before a price increase" | Terms §10 | A mailing to every subscriber, at a working address | Nothing; Stripe won't send it; graduates' addresses die | Consumer complaints (A-22, A-44) |
| P-14 | "we will not remove something you paid for in the middle of a paid period without a refund", and the refund exceptions | Terms §10 | A refund runbook; proration | Refunds are manual in the Stripe Dashboard; disputes are only recorded (E13) | Wrongful-ban refunds (A-45) |
| P-15 | "Proof that you agreed ... kept 3 years" | Terms §1, §14 | A record that survives deletion (H3) | Deleted with the account (A3) | Delete, then sue (A-49) |
| P-16 | "Moderation records ... 3 years" | Terms §14; companion B | A purge that the database allows | A trigger forbids deletion, even for postgres (F14): kept forever | False retention statement (A-39) |
| P-17 | Quarantined media kept "for up to a year" | Terms §14; delete-account page | A purge job | None (`storage-purge.ts`: "until the lawyer says how long") | Intimate images and possibly abuse material held indefinitely (A-39, A-48) |
| P-18 | Minors: "we close it and delete its data"; "We can end your account too ... tell you at the login email on the account first, then run the same file purge" | Terms §12, §14 | An admin deletion flow that runs the purge and sends a notice | None; the admin user route is read-only (checked). Only a purge by hand | Collides with the duty to preserve (A-48) |
| P-19 | Appeals: "A person reads it and replies ... a ban is lifted and the school email freed", including after deletion | Terms §12 | An appeals log; a lift that works on the ban record, not the account | The lift works only while the account exists (checked); it never restores Vibe+ | A-13, A-45 |
| P-20 | "the new account is banned when found"; "we may close duplicate accounts we find — always if they are used to get around a block" | Terms §4, §12 | Detection | None. H17 would be partial and easy to beat (A-12) | Ban evasion (A-09, A-11); the promise that bans stick, quoted by a victim (A-47) |
| P-21 | Verification "does not transfer if the page changes hands without us" | Terms §9 | A re-check when roles change | None (D10) | A-28 |
| P-22 | "Block someone and you disappear from each other" | Terms §11 | Blocks on the public profile, events, RSVPs and club posts | Blocks cover posts, comments and the profile screen for signed-in viewers (F15) | Stalking (A-04) |
| P-23 | A restricted account "can open" only the notice and the legal pages | Terms §12 | Restricted accounts refused on reads as well as writes | Reads pass (`src/proxy.ts`) | Banned stalker (A-10) |
| P-24 | "Cancel any time from the Vibe+ page" | Terms §10 | A cancel button everyone can reach | Suspended subscribers can't reach it (`src/proxy.ts`) | ROSCA and California cancellation rules (A-41) |
| P-25 | "We never tell your university" | Terms §5 | Silence even in an emergency | Can't be kept safely; there is no exception | A-31 |

---

## Top 12

Ranked by how likely it is at pilot scale and how much it costs. "Cheapest fix" names the kind of fix: **words** (change the Terms or copy), **code**, **process** (a person or runbook), **lawyer**.

| Rank | ID | The loophole in one line | Severity | Cheapest fix |
|---|---|---|---|---|
| 1 | A-01 | Pre-register a student's address, and their later confirmation hands the attacker the account; sessions survive a password reset | critical | **Code**: delete unconfirmed signups after 24 hours and require a new password at confirmation (H11); revoke sessions on password change (H5). **Words**: change the landing to "Sign up, then confirm your school email." |
| 2 | A-02 | Harass by DM, delete the account, and the victim's copy of every message vanishes; then re-verify the same school address | critical | **Code**: keep sent messages as "from a deleted account" (or hold deletion while the account is reported), and snapshot the thread on a message report. **Words**: drop "the other people lose them too". |
| 3 | A-48 | A 17-year-old gets in; abuse material is removed but never reported; §12 promises to delete what the law says to preserve | critical | **Process + lawyer**: register with NCMEC and write the one-page procedure before Oct 14. **Words**: replace "delete its data" with "close it, and keep what the law requires". **Code**: a purge job for quarantine that exempts reported material. |
| 4 | A-15 | A hijacked account posts ban-level content; the victim's school email is burned forever, and the appeal needs the login email | critical | **Words**: a hijack exception, and appeals from any address with evidence. **Process**: check for a takeover before any first-time ban. **Code**: H5, H11. |
| 5 | A-14 | "🎓 Student · {campus}" is Vibe's own word vouching for an impostor | critical | **Words (copy)**: three strings, per companion F8. Ship them before the Terms. |
| 6 | A-47 | Flat promises ("every report", "within 48 hours", "banned when found") plus a personal-injury negligence carve-out get a harmed student past Section 230 and the cap | critical | **Words**: turn every service level into an aim, drop "every" and "when found", fix the Guidelines' "bans stick". **Lawyer**: the §16 carve-out. |
| 7 | A-20 | One owner can delete a verified club in one click, with no backups | critical | **Code**: a 7-day undo window for verified clubs, or a second officer's approval to delete. |
| 8 | A-33 | TAKE IT DOWN: 48 hours by law, with no one on call, no log and no image matching | high | **Process**: a rota that covers weekends, and a request log. **Words**: "identical copies we find" → "copies we are told about or find". |
| 9 | A-42 | The re-acceptance screen says "One quick thing ... you won't see this again", so v2 may not bind anyone | high | **Words (copy)**: "We've updated our Terms. What changed: …", with a link and a clear "I agree". |
| 10 | A-41 | A suspended subscriber can't reach the cancel button and keeps paying | high | **Code**: a Manage subscription button on the suspended page, or pause billing during a suspension. |
| 11 | A-10 | A banned account keeps reading everything through the API | high | **Code**: refuse restricted accounts on reads other than their own data, or **words**: say so honestly. |
| 12 | A-40 | The Terms sell "extra profile customization" that doesn't exist | high | **Words**: delete the half-sentence. |

**Just outside the twelve:**
- **A-29** (trademark and "Officially recognized"): a copy fix.
- **A-34** (the Privacy Policy describes a different app): a words fix.
- **A-49** (delete, then sue): build H3 before §14 says it exists.
- **A-50** (the club isn't bound): lawyer.

---

## Where the draft already holds (so the defender doesn't waste time)

- The Terms never say "students only", "verified student" or "safe", and §3 and §5 define verification exactly as the code does. Most of the damage in this file comes from copy outside the Terms.
- Vibe+ as strictly personal, with no club claim on it (§9, §10), is clean and matches the code (E13).
- The independence statement (§6) is right in substance. The problem is the app's copy (A-29), not the clause.
- The ban-evasion paragraph in §12 is honest about what the code can't do. That is a strength in front of a regulator and a weakness in front of a victim (A-09). The fix is to make the other pages equally honest, not to make §12 less so.
- The handle rules (3–20 characters, one change every 14 days) and the report limit match the code (checked).
