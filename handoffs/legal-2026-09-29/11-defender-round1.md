# Defender, round 1: answers to the attacker's 54 loopholes

**Date:** 2026-09-30 (session 70).

**Role:** Vibe's defense counsel, and the operator who has to keep every promise. There is no staff and no on-call rota: three student cofounders, three inboxes, and one person (Franky) who can reach the database.

**Read, in order:** `01-brief.md`, `00-code-facts.md`, `02-terms-of-service-v2.md`, `03-companion.md`, `10-attacker-round1.md`.

**Checked in the code myself**, so the founder can trust the verdicts:

- `src/proxy.ts:226-251`. Confirmed: a restricted account's GET, HEAD and OPTIONS requests pass (A-10). `/api/billing/portal` is allowed, but the notice has no button (A-41). **The attacker missed one thing here:** the suspension notice already tells a paused student to write to help@ and "we'll stop it" (`src/app/account/suspended/page.tsx`).
- `src/lib/moderation/actions.ts:476-487`. Confirmed: `liftRestriction` finds rows by `user_id`, and its header says "NOTHING IS UNDONE BEYOND THE RESTRICTION" (A-13, A-45).
- `src/app/api/admin/users/[id]/route.ts`. Confirmed: it answers GET only. No admin route deletes an account (C-08).
- `src/lib/profile/storage-purge.ts`. Confirmed: nothing ever purges quarantine ("kept for up to a year until the lawyer says how long"). There is no scheduled job anywhere in the repo: no pg_cron, no Vercel cron (A-39).
- `src/app/plus/page.tsx`. Confirmed: customization is "Still being built; nothing here is charged for until it exists", and the page says "No hiding that you viewed someone" (A-40, A-38). **New finding:** the same page says the viewer names are kept private "from everyone, including from us on the free tier". That is not true for the operator.
- `src/app/api/me/reports/route.ts:494`. Confirmed: 10 reports per hour per login (A-05).
- `src/lib/moderation/alerts.ts`. Every alert has the same subject, "New report on Vibe", whatever the reason. Alerts are throttled per target for 60 minutes.
- `src/lib/profile/handle.ts`. Confirmed: handles are 3–20 characters, with a 14-day cooldown.
- **Correction to the attacker, and to Terms §7: RSVPs are not visible to every signed-in user.**
  - The policy `rsvps_select_own_or_manager` (`supabase/migrations/20260922110000_t1_close_world_readable_selects.sql:306-309`) shows a person only their own RSVPs.
  - The attendee list (`src/app/api/events/[id]/attendees/route.ts`) is only for the event's creator, or for a club event's current owner and admins.
  - Everyone else sees counts.
  - So A-04's "RSVPs are a map" is wrong, C-27 is wrong, and Terms §7 overstates RSVP visibility.
- `src/lib/metrics/profile-viewers.ts` and `src/lib/safety/hidden-users.ts`. Blocks work in both directions on the "who viewed you" list: if either person blocked the other, the name is left off. Signed-out profile views are never recorded (`src/app/api/profile-views/route.ts`).
- `src/lib/profile/hidden-fields.ts:95-103`. A résumé opens only for viewers with a verified school email. The Terms understate this (C-03).
- `src/app/api/admin/orgs/[slug]/hide/route.ts` and the DELETE handler in `src/app/api/orgs/[slug]/route.ts`. Hiding a club already stops new joins, invites and posting as the club, and the owner cannot delete a hidden club. **That is a working "freeze" for club disputes today.**
- `supabase/migrations/20260509100000_message_delete_and_clear.sql`. A sender can already delete their own messages one at a time. This matters for A-02.
- `src/app/api/users/[handle]/bootstrap/route.ts`. The anonymous profile read has no rate limit (A-07).

## Bottom line for Franky

1. **The Terms text mostly holds.** Of 54 attacks: 2 hold, 31 partly hold, and 21 break.
   - Most of the breaks are fixed with words, not code. Flat promises become aims ("we aim to"). A few sentences describe the code wrongly.
   - Copy outside the Terms says more than the code does: the badge, the club list, the acceptance screen, the Guidelines and the ban notice. It has to change on the day the Terms publish, or before.
2. **Eight code items are cheap (an hour to half a day each). Land them before the Terms publish:**
   - H3 revised (the consent record survives deletion);
   - the H5 piece (sign out other devices when the password changes);
   - H7 (password to delete an account);
   - H20 (RSVP needs a verified school email);
   - H23 (a restricted account can't read);
   - H25 (a verified club can't be deleted in one click);
   - H29 (urgent report alerts);
   - H30 (the ban key cleaned up).

   **One medium item, H11 (the pre-registration takeover), must be live before any student is invited.**
3. **Four things wording can't fix:**
   - the takeover bug (code);
   - ban evasion (only partly fixable, by anyone);
   - NCMEC registration (paperwork: start it now);
   - the Privacy Policy rewrite, which must publish on the same day as the Terms.
4. **Money.** None of the Vibe+ attacks can happen while billing is off. Keep it off until H18, H24, H31 and the Stripe settings (P11) are done.
5. **Protecting you personally:**
   - fix the known security list before students arrive, and keep a dated log of each fix;
   - turn on two-factor sign-in (2FA) on every dashboard today;
   - ask the lawyer about insurance (J20).

   The Terms can't do this part. The record of what you fixed can.

## How to read this file

- **Verdicts.**
  - **HOLDS**: the draft already handles it.
  - **PARTIALLY HOLDS**: the clause helps but has a gap.
  - **BREAKS**: the attacker is right.
- **Cost.**
  - **Cheap**: an hour or so.
  - **Medium**: about a day.
  - **Expensive**: a week or more, or money.
- **Before publish** means before the Terms go live, about Oct 14. Where the real gate is different, the entry names it, for example "before billing turns on" or "before the first student invite".
- **Numbering.**
  - Code items continue the companion's list: **H21 onward** are new, and H3, H5, H11 and H17 are revised.
  - Decisions for Franky: **I19 onward**. Questions for counsel: **J19 onward**. Process items: **P1 onward**, all listed in Part 4.
- **Wording blocks.** Wording is quoted in full and ready to paste. Where two attacks share a fix, the second entry points to the first and doesn't repeat it. Part 4 collects every wording change by section.

---

# Part 1: Verdicts, A-01 to A-54

### A-01 · Pre-register the class: **BREAKS**

**Why.**
- The attack works as described:
  - the account row exists as soon as the attacker signs up (A1: nothing cleans up unconfirmed accounts);
  - the attacker's password survives the real student's confirmation (brief §3, the Sept 27 finding);
  - a password reset doesn't sign out other devices (G16).
- §16 does not claim to cover this: it excludes a "reused password or a shared mailbox", and neither applies.
- A court won't let §4's "you are responsible" shift the cost of Vibe's own bug to the student, and the Terms shouldn't try.
- This is a code bug. Words can only stop making it worse: today the landing page steers students into it.
- One correction: a class action is unlikely, because each takeover is its own story. That changes nothing about fixing it.

**Fix.**
- **Code: H11, revised spec.** Every email confirmation, by link or by code, ends on a **"Set your password"** step. The person who holds the inbox sets the password that will work.
  - The same step asks for the Terms checkbox again and writes a `terms_acceptances` row with source `confirm`.
  - Then it signs out every other session (`signOut({ scope: "others" })`).
  - This beats pre-registration without guessing by IP address. Cleaning up unconfirmed rows after 24 hours can follow.
- **Code: H5, the cheap piece.** After any password change on `/auth/update-password`, sign out other sessions.
- **Words** (§4, "Keep your account safe", replace the sentence that begins "You are responsible"):
  > You are responsible for what happens under your account, including anything done by someone you let in or someone who used a password you also use elsewhere, until you tell us at help@connectvibe.app that someone else has access. That does not apply if someone got in because of a flaw on our side.
- **App copy.** Landing page (`src/components/landing/home-landing.tsx:247`): "Sign up with your school email." becomes "Sign up with the email you'll keep, then confirm your school email." This is shared with A-22 and C-19.
- **Process.** No student invites go out until H11 is live.

**Cost:** medium (a day). **Before publish:** yes. It must be live before the first student invite.

**Residual risk:** someone who controls the student's inbox can still take the account, and no app can stop that.

### A-02 · Harass, delete, come back: **PARTIALLY HOLDS**

**Why.**
- §14 is accurate: deleting an account deletes the messages it sent, including the copies in other people's chats (G17). Saying so is honest.
- The attacker is right that saying so doesn't solve the design problem. Two things narrow it:
  - A sender can already delete messages one at a time (`messages_delete_own`), as on most apps. Keeping a deleted account's messages would not stop a determined harasser.
  - Reported items survive in the report snapshot (F14).
- The real gaps:
  - the snapshot holds one message, not the conversation;
  - the school email is free the moment the account is gone.

**Fix.**
- **Code: H21.** When a message is reported, save the last 50 messages between the reporter and the reported person in that conversation (both directions) into the report snapshot. Medium (half a day).
- **Code: H22.** If an account with an open or actioned report against it deletes itself, keep a keyed hash of its canonical school email with those reports.
  - If that address is verified again, let it through, but flag the new account on the admin desk and email the admins.
  - This is evidence, not an automatic ban. Medium.
- **Words** (§11, new paragraph after Block and Mute):
  > **Keep evidence.** If someone threatens or harasses you, take screenshots first, then report. The sender can delete their messages, or their whole account, and when they do, the messages leave your chat too. Reporting saves a copy of what you reported for us.
- **Words** (§14, add to "What stays because it must"). This lets H22 ship without a new version:
  > **Reports about you.** If there are open reports about your account when you delete it, we may keep a scrambled copy of the school email on it with those reports, so a moderator can still act on them.
- **Decision I21.** Keep a deleted account's messages in other people's chats, shown as "Deleted account". Recommended after launch.
- **Process.** When a victim says the messages are gone: ask for screenshots, check the report snapshot, and follow P9 if police are involved.

**Cost:** words cheap; H21 and H22 medium. **Before publish:** words yes. H21 before the Oct 31 launch; H22 can follow.

**Residual risk:** messages deleted before anyone reports them are gone. Screenshots are the victim's best evidence, as on every app.

### A-03 · The catfish buys Vibe+ and harvests who looked: **PARTIALLY HOLDS**

It breaks the day billing turns on without H18.

**Why.**
- Production billing is off (E13, brief §5), so today nobody can buy Vibe+.
- But §2 as drafted says a login on its own may "manage a subscription", and checkout needs accepted Terms only (E13).
- Selling "who viewed you" to an unverified, unaccountable account builds a targeting list.
- Two protections the attacker missed:
  - if either person blocked the other, the viewer's name is left off the list (`hidden-users.ts`);
  - views made while signed out are never recorded.

**Fix.**
- **Code: H18** (companion). Checkout refuses accounts without a verified school email.
- **Words** (§2, bullet 2): the shared rewrite under A-11.
- **Words** (§10, new first sentence under "Price and renewal"):
  > You need a verified school email to buy Vibe+.
- **Decision I20** (private viewing): see A-38.

**Cost:** cheap. **Before publish:** words yes. H18 before billing turns on.

**Residual risk:** a verified catfish can still buy Vibe+, but that person has a school email we can ban.

### A-04 · Blocking doesn't make you disappear, and RSVPs are a map: **PARTIALLY HOLDS**

**Why.**
- **The RSVP half is wrong.** RSVPs are readable only by the person who RSVP'd and by the event's organizers (checked: `rsvps_select_own_or_manager` and the attendee route). A stalker sees the event and how many are going, not the victim's name.
- Terms §7 overstates it ("events and RSVPs are visible to everyone signed in"). That costs us for nothing, so it gets fixed too.
- **The block half is right.** "You disappear from each other" is too strong.
  - Blocks cover posts, comments, the signed-in profile screen, messages, the résumé and the viewer list (F15, `hidden-users.ts`).
  - They don't cover the public profile card a signed-out visitor sees, and they don't cover events.

**Fix.**
- **Words** (§11, replace the Block and Mute bullet):
  > **Block** someone and, inside Vibe, they can no longer see your posts, comments or profile, message you, open your résumé, or see your name among the people who viewed their profile; and you stop seeing theirs. A block cannot reach people who are signed out: your public profile card and any club posts you made can still be seen by anyone on the internet (Section 7). **Mute** someone and their content disappears from your feeds without telling them.
- **Words** (§7, "Who can see it": replace "published posts, comments, events and RSVPs are visible to everyone signed in to Vibe at every campus"):
  > published posts, comments and events are visible to everyone signed in to Vibe at every campus; how many people are going to an event is shown to everyone, but who is going is shown only to you and to the event's organizers (the person who created it or, for a club event, the club's owner and admins)
- **Words** (§8, new bullet after "Get around a restriction"):
  > **Get around a block**: using another account, signing out, or someone else's account to see, follow or contact a person who blocked you.
- **Code: H20.** RSVP needs a verified school email. An unverified login then can't put itself on an organizer's list.
- **Decision I23.** Let students make their profile visible to signed-in users only. Recommended; it can follow publish.

**Cost:** cheap. **Before publish:** yes (words and H20).

**Residual risk:** a stalker can still see a public profile card while signed out, until I23 ships.

### A-05 · Flood the report queue: **PARTIALLY HOLDS**

**Why.**
- "We aim to review reports within 24 hours" is an aim, and it holds.
- "A person on the Vibe team reads every report" and "child exploitation and self-harm first" are flat claims with nothing behind them:
  - every alert has the same subject line, and there is no priority queue (`alerts.ts`);
  - "every" is a promise counted per report, and reports are free.
- The flood itself is less scary at pilot scale than the attacker says:
  - twenty fresh logins filing 200 reports in an hour stand out at once among a few dozen accounts;
  - each report carries the reporter's account id, so the flooders can be restricted, but only if the Terms make flooding a violation.

**Fix.**
- **Words** (§11, replace the "What we do with reports" bullet):
  > **What we do with reports.** People on the Vibe team review reports; software does not decide them. We aim to review reports within 24 hours, and we look at reports about child safety, intimate images, threats and self-harm before others. That is an aim, not a promise of a particular time or outcome. We keep a snapshot of what was reported so that later edits or deletions do not hide it. We read private messages only when one is reported to us, when we have specific evidence that a conversation is being used for spam, threats, exploitation or another serious breach of these Terms, or when the law requires it.
- **Words** (§8, new bullet after "Spam or automate"):
  > **Misuse reporting**: filing reports you know are false, or flooding the report button to bury real reports or to target someone.
- **Code: H29.**
  - Reports with reason `child_safety`, `intimate_image` or `self_harm` get the subject "URGENT: [reason] report on Vibe".
  - Those reports skip the 60-minute per-target throttle.
- **Process: P1** (help@ rota), including a phone notification on "URGENT:".

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** a big, patient flood from real-looking accounts could still delay one real report by hours.

### A-06 · Squat a club's name for good: **PARTIALLY HOLDS**

**Why.**
- The attacker misreads §9. The squatter's page is not "the group's page": a page for a group you are not part of is impersonation under §8. So the real society breaks nothing when it asks for its name back.
- Two words in §9 have no tool behind them:
  - "merge" doesn't exist;
  - a club's handle can't be edited in the app (D10). A rename or a handle change today is Franky running SQL.
- A squatter can't create events or send invites (only verified clubs can), but it can post as the club (D10).

**Fix.**
- **Words** (§9, "Creating a club", replace the sentence that begins "We may refuse, rename, merge"):
  > If a page was made by someone who does not speak for the group, the group's real officers can ask us to hand it over, rename it, or take it down (see "Passing a club down"). We may refuse, rename, hide, hand over or remove a club page that breaks these promises, and a page created for a group you have nothing to do with is impersonation (Section 8).
- **Code: H38.**
  - A warning at creation: "a club with a similar name already exists".
  - An admin-desk action to rename a club and change its handle, logged.
- **Process.**
  - Until H38 is built, Franky renames by SQL and writes a `moderation_actions` row with the reason.
  - Rylan builds each signed club's page during the signing visit (brief §4). That is also the best defense against squatting.

**Cost:** words cheap; H38 medium. **Before publish:** words yes; H38 no.

**Residual risk:** a squatter can post under the club's name until someone reports it.

### A-07 · Scrape the campus and sell it: **PARTIALLY HOLDS**

**Why.**
- §7 is honest about what is public, and §8 forbids scraping.
- The attacker is right that the Terms can't bind someone who never signed up, and that *hiQ v. LinkedIn* weakens the anti-hacking law against scraping public pages. That is true for every social network.
- The same case also shows a contract claim does work against a scraper who holds an account. So §8 still earns its place.
- The only real defense is to show less and to slow reads down. The anonymous profile read has no rate limit (checked).

**Fix.**
- **Code: H32.** Rate-limit the anonymous profile read and the public club page by network (for example 60 a minute). Cheap.
- **Code: H16** (companion): read limits for unverified logins. It can follow publish.
- **Decision I23.** A signed-in-only profile option. Also consider making work history and links signed-in only by default.
- **Words:** none needed.

**Cost:** cheap (H32). **Before publish:** H32 recommended; H16 no.

**Residual risk:** a patient scraper can still collect public profiles slowly. Whatever is public can be copied.

### A-08 · Delete someone else's account with their handle: **BREAKS**

**Why.**
- The attacker is right, and the draft admits it in its own [DECISION] marker. Typing a public handle is not a check.
- §16's "lost data" exclusion might still hold. But a court will ask whether the design was reasonable, and a password check costs an afternoon (H7).

**Fix.**
- **Code: H7.** Deletion asks for the account's password, checked on the server by a fresh sign-in, instead of the handle. Cheap.
- **Words** (§14, replace the first paragraph; if H7 misses the publish date, keep "type your handle"):
  > **You can leave any time.** Settings → Danger zone, enter your password to confirm, and your account is deleted at once. No grace period, no undo. Vibe+ is cancelled first, with no refund for the rest of the period.
- **Words** (§4, "Keep your account safe", add at the end):
  > Lock your phone and computer: anyone holding a device where you are signed in can act as you.

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** someone who knows your password can still delete your account.

### A-09 · Come back with a second school address: **PARTIALLY HOLDS**

**Why.**
- §12 tells the truth: a ban sticks to one school address, and a different address can verify a new account.
- The other pages don't tell the truth:
  - the ban notice says "a new account can't post, comment or message";
  - the Guidelines read as if bans stick to the person.

  Those must change before the Terms publish.
- The rest is an honest limit: no app can stop a determined person who has a second valid school inbox.

**Fix.**
- **App copy.** Ban notice (`src/app/account/suspended/page.tsx`).
  - Replace: "if you verified a school email here, it can't be verified on another account, so a new account can't post, comment or message."
  - With:
    > if you verified a school email here, it can't be verified on another Vibe account. Coming back with a different email or school address is against our rules, and we close those accounts when we find them.
- **Words** (§12, replace the "Ban evasion" paragraph):
  > **Ban evasion.** Coming back after a ban, by any route, is itself a violation. If we find the new account, we ban it too and add any school email on it to the record, and we may close accounts that helped. We look for it when someone reports it and when we see the signs ourselves; we cannot promise to catch every case.
- **Words** (§12, "What a ban is", replace the sentence that begins "Doing that is ban evasion (below)"):
  > Doing that is ban evasion (below). We keep a scrambled record of the banned account's login email as evidence, and we may use it to spot a returning account.
- **Code: H17**, with its honest scope.
  - Checking at school-email verification is cheap.
  - Checking at signup needs a Supabase auth hook, which is medium.
  - It depends on H30.
- **Process: P18** (the ban-evasion check).

**Cost:** cheap. **Before publish:** yes (copy and words).

**Residual risk:** a banned person with a second school inbox and a new name gets back in until someone recognizes them.

### A-10 · Banned, but still reading: **BREAKS**

**Why.**
- Confirmed in `src/proxy.ts:229-241`: GET, HEAD and OPTIONS pass for a restricted account.
- The read policies check the author's restriction (`user_visible`), not the reader's.
- So §12, and the Guidelines' "no scrolling campus either", describe the screen, not the data.
- Blocking reads matters less than it looks, because the same person can open a new Gmail login and read the same things (B7). But the words must match the code.

**Fix.**
- **Code: H23.** For a restricted account, the proxy refuses GET on `/api/*` except:
  - the account's own data;
  - the billing portal;
  - whatever the notice page itself needs.

  Cheap: a few hours, with testing.
- **Words** (§12, "What a suspension is", replace the first sentence). With H23 live:
  > For a set number of days (1 to 365), your account can open only a notice saying what happened, why, and when it ends, and the legal pages. It cannot post, comment, message, react, follow, RSVP or change anything else, and it cannot read the feed, profiles or events.

  If H23 misses the date, use this instead:
  > For a set number of days (1 to 365), the app shows your account only a notice saying what happened, why, and when it ends, and the legal pages, and your account cannot post, comment, message, react, follow, RSVP or change anything else.

**Cost:** cheap. **Before publish:** yes (H23 and the first wording).

**Residual risk:** a banned person can still read by signing up again with a new email. A ban is not a wall against looking.

### A-11 · Banned before verifying? Nothing happens: **BREAKS**

**Why.**
- For an account that never verified, the only key is the login-email hash, and nothing tests it (F14: "EVIDENCE, NOT ENFORCEMENT"). So "always" in §4 is false.
- The harm such an account can do is small once RSVP (H20) and Vibe+ (H18) need verification: follow notifications, likes, a catfish profile, reports.

**Fix.** (The §2 rewrite here is the shared one that A-03, C-02 and C-33 point to.)
- **Words** (§4, "One person, one account", replace the third sentence):
  > We do not currently stop someone from opening a second login with a different email, but each school email can verify only one account. We may close duplicate accounts we find, especially ones used to get around a block, a restriction or a limit.
- **Words** (§2, replace bullet 2):
  > **Anyone 18 or older may create a login with any email address.** A login on its own lets you set up a profile, follow people and clubs, react to and save posts, block, mute and report, and delete your account. It can also see what Vibe shows to signed-in users (Section 7); some screens in the app ask you to verify first, but that is a step in the app, not a privacy wall. It does not let you post, comment, message, join or create clubs, create events, RSVP to events, or buy Vibe+. Those need a **verified school email** (Section 5).
- **Words** (§12, add at the end of "What a ban is"):
  > A ban on an account that never verified a school email is tied only to its login email, which is easy to replace. What limits such a person is that posting, commenting, messaging, clubs, events, RSVPs and Vibe+ all need a verified school email.
- **Code.**
  - H20 and H18 (named above).
  - H10 (block disposable email domains) and H17-at-signup can follow.

**Cost:** cheap. **Before publish:** yes (words and H20).

**Residual risk:** an unverified login can still follow, like and report from a new address after each ban.

### A-12 · The companion's H17 is beaten before it's built: **PARTIALLY HOLDS**

**Why.**
- The Terms don't promise H17 works: §12 calls the login-email hash "evidence".
- The attacker is right about the companion:
  - H17 as written stops only the laziest person coming back;
  - the key is only lowercased (F14), so `j.doe` and `jdoe+2` beat it;
  - it is written for every restriction, including a one-day suspension, and kept forever.
- Fix the scope, not the idea.

**Fix.**
- **Code: H30.**
  - Normalize the login-email key: lowercase it, strip `+tags`, and strip dots for `gmail.com` and `googlemail.com`.
  - Write that key only for bans.
  - Suspensions keep only the school key, and it goes when the suspension record is purged (A-39). Cheap.
- **Code: H6, the interim part.** Block the auth provider's direct email change, so the stored login email can't go stale.
- **Companion H17 text:** replace the framing with "raises the cost of coming back; it does not close ban evasion".
- **Words** (§14, "What stays because it must", replace "The ban record" bullet):
  > **The restriction record**, if your account was suspended or banned: the dates, the reason, and scrambled copies of the school email (and, for a ban, the login email) on it. A ban record is kept for as long as the ban lasts; a suspension record is kept for 3 years after it ends. Nothing else from the account.

**Cost:** cheap. **Before publish:** yes (H30 has to land for "for a ban, the login email" to be true).

**Residual risk:** a banned person with a new Gmail still gets in. The hash only catches reuse.

### A-13 · Win the appeal after deleting, and the address stays locked: **BREAKS**

**Why.**
- Confirmed: `liftRestriction` looks rows up by `user_id`, and deletion sets that id to null (F14).
- "The school email is freed" has no tool after deletion.
- The case is rare, and Franky can do it by hand, so a process keeps the promise now and cheap code keeps it later.

**Fix.**
- **Code: H27.** An admin action, "free a school email".
  - The admin types the address, and the server works out its canonical key with the secret key (the pepper).
  - It lifts any open restriction rows with that key, and logs the action. Cheap.
- **Process: P8.** Until H27 exists, Franky runs a one-off script with the pepper to get the key, sets `lifted_at` on the matching row in SQL, and writes a `moderation_actions` row.
- **Words** (§12, replace the "Appeals" paragraph). This also carries A-15 and A-45:
  > **Appeals.** Email **help@connectvibe.app** within 30 days, with your handle and what we missed. Write from the login email on the account if you still can; if you can't, or you already deleted the account, tell us the school email that was on it and we will check that it is you (Section 13). A person reads your appeal and replies. If we made a mistake, we undo it: a suspension is lifted; a ban is lifted and the school email freed; and if the ban ended a paid Vibe+ period, we refund the unused part (Section 10). If you deleted the account before the appeal succeeded, we cannot restore the data (Section 14), but the school email is freed so you can start again. If someone else took over your account and did what got it restricted, there is no time limit (see "If your account was taken over").

**Cost:** cheap. **Before publish:** words yes; H27 no (P8 covers it).

**Residual risk:** an appeal with no proof at all (no login email and no school-email reply) may be refused.

### A-14 · Vibe's own badge vouches for the impostor: **BREAKS**

**Why.**
- The Terms define the badge correctly (§3, §5). The app says more:
  - desktop badge: "🎓 Student · {school}" (`public/html/profile.html:8532`);
  - own-profile prompt: "Verify your student status" (`:8543`);
  - mobile badge: falls back to "Student" (`ProfileMobile.tsx:6485`);
  - onboarding: "You're verified as a Purdue student" (`onb-copy.ts:67`).
- Those are Vibe's own words, not user content, so Section 230 won't cover them. And a victim who isn't a user never read §3.
- The fix is copy. It is cheap, and it must ship with the Terms or before.

**Fix.**
- **App copy** (all before publish):
  - `public/html/profile.html:8532`: "🎓 Student · {school}" becomes "@iu.edu verified" or "@purdue.edu verified". The campus the person chose appears beside the badge as plain text, not inside it.
  - `:8543`: "🎓 Verify your student status" becomes "Verify your school email".
  - `src/components/mobile/ProfileMobile.tsx:6485`: the "Student" fallback becomes "@iu.edu verified" or "@purdue.edu verified". An unverified profile shows no badge at all.
  - `src/lib/iu/campuses.ts:400`: "{IU|Purdue} verified" becomes "@iu.edu verified" or "@purdue.edu verified".
  - `src/components/mobile/onboarding/onb-copy.ts:67`: "You're verified as a Purdue student." becomes "Your @purdue.edu email is verified."
  - `onb-copy.ts:52`: "Your school email shows you're at {system}." becomes "Your school email is an {IU|Purdue} address."
  - New tooltip when the badge is tapped: "This account confirmed an @iu.edu address. That doesn't confirm enrollment or identity, and the campus is the person's own choice."
- **Words** (§3, replace the "Badge" definition):
  > **Badge**: the mark on a profile that shows the account verified a school email. It reads "@iu.edu verified" or "@purdue.edu verified", and the campus the person chose may appear next to it. It means "verified school email", nothing more. The campus is the person's own choice; we do not check it.
- **Decision I26.** The badge text is Franky's design call. At the very least, "Student" must go before publish.
- Impersonation reports from people with no account: see A-17.

**Cost:** cheap (an hour or two). **Before publish:** yes.

**Residual risk:** an impostor who controls a real school inbox can still wear a true badge under a false name. The answers are reports and §8.

### A-15 · Hijacked, banned, and locked out for good: **BREAKS**

**Why.**
- The chain is real:
  - takeover routes exist: A-01, a reused password with no leaked-password check, or a session that lasts a year;
  - §12 bans an account on its first intimate-image post;
  - the ban burns the student's school email for good;
  - an appeal must come "from the login email on the account" within 30 days.
- The Terms have no exception for a hijacked account.
- We control every link in that chain except the takeover itself.

**Fix.**
- **Words** (§12, new paragraph after "What a ban is"):
  > **If your account was taken over.** If someone else got into your account and did what got it restricted, tell us. Once you show us the account is yours (Section 13), we lift the restriction, free your school email, and treat the account as yours again. There is no time limit on this.
- **Words** (§12, "Appeals"): the A-13 rewrite (any address; no time limit after a takeover).
- **Process: P7.** Before a first-time ban of an account older than 30 days:
  - Franky checks the Supabase auth log for a recent password change or sign-ins from new places;
  - if he sees signs of a takeover, he suspends instead of banning, and emails both the login address and the school address.

  It takes about 5 minutes.
- **Process** (until H5 exists).
  - Franky can sign an account out everywhere by deleting its rows in `auth.sessions` and `auth.refresh_tokens`.
  - He can set a random password with the admin API.
  - Both run on the service role.
- **Code:**
  - H11 (A-01);
  - H5 (an admin sign-out-everywhere button, and sign-out of other devices on password change);
  - H13 (2FA on the three founder logins).

**Cost:** words and process cheap; code as in A-01. **Before publish:** yes.

**Residual risk:** the victim still lives through the takeover itself. We can only undo our side of it.

### A-16 · Use the recovery process to take the real account: **PARTIALLY HOLDS**

**Why.**
- §13 has the right shape: we decide, we may refuse, and we never act on an email alone.
- But it lists strong and weak evidence side by side with no minimum, and the companion lets "a live call" be enough on its own.
- It also blocks its own last step (C-29): "we never send a reset link to an address that is not on the account".
- And the only way to change a login email today is by hand at the auth provider. That leaves our copy of the email and the ban key stale (A2).

**Fix.**
- **Words** (§13, replace the paragraph "If you cannot get into your login email", and delete the sentence "we never send a reset link to an address that is not on the account"):
  > **If you cannot get into your login email** (closed by a university after graduation, lost, hacked, or a shared address someone else now controls), email **help@connectvibe.app** from any address and tell us your handle. We then need at least one strong proof that the account is yours:
  > - a reply from the school email verified on the account;
  > - a change we describe, made from a device where you are still signed in; or
  > - a short video call in which your face matches photos that were on the profile before you wrote to us.
  >
  > Details only the account holder would know, or a photo of a student ID with the number covered, can support a request but are never enough on their own. Before we change anything, we email the account's current login email and wait 7 days; if the real owner answers, we stop. Then we put your new address on the account and send the password reset there. We aim to reply within 7 days, and a recovery usually takes about two weeks because of the waiting period. We may refuse if we are not satisfied, and we will tell you what would satisfy us.
- **Companion E:** replace the tiers with the rule above:
  - one strong proof is required;
  - supporting details never count on their own;
  - a 7-day notice goes to the old address;
  - every decision is logged.
- **Process: P6** (the recovery checklist, by hand until H6 exists):
  - change the auth email with the admin API;
  - update `public.users.email` and the Stripe customer's email;
  - sign the account out everywhere;
  - log it.

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** a close lookalike with old photos could fool a video call. The 7-day notice is the backstop, and it fails when the old address is dead.

### A-17 · If you're not on Vibe, you can't complain without signing up: **BREAKS**

**Why.**
- The attacker is right, and the fix is cheap.
- Only intimate-image requests have a path that needs no account.
- People who aren't users are the impersonation victims most likely to sue.

**Fix.**
- **Words** (§11, new first bullet):
  > **Not on Vibe?** You do not need an account to report impersonation, threats, harassment, your private information being posted, intimate images, or anything involving a child. Email **help@connectvibe.app** with a link or the handle and what is wrong.
- **App copy:** the same line on the Community Guidelines and the support page.

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** none beyond the time a review takes.

### A-18 · Whack-a-mole with unverified impostors and recycled handles: **PARTIALLY HOLDS**

**Why.**
- Every remedy works one account at a time. That is true of every free platform.
- Two parts can be fixed:
  - a deleted account's handle is free the same second (H9 isn't built);
  - a Gmail-only impostor profile is public on the internet with no badge.

**Fix.**
- **Code: H9.** Hold a deleted account's handle for 90 days. Cheap. Decision I3: yes.
- **Words** (§4, "Handles", replace the sentence "If you delete your account, your old handle becomes available to others."):
  > If you delete your account, your old handle may become available to others, either at once or after a waiting period we set.
- **Code: H41** (with I23). A profile with no verified school email is visible to signed-in users only, not on the public internet. Medium; it can follow publish.
- **Process.**
  - An impersonation victim can ask us to watch for their name.
  - When a report shows the same photos again, we remove the profile at once, without a second review.

**Cost:** cheap (H9, words). **Before publish:** words yes; H9 recommended.

**Residual risk:** an impostor with a fresh Gmail can come back until someone reports it again.

### A-19 · Nothing can be preserved for a court: **PARTIALLY HOLDS**

**Why.**
- The attacker overstates the duty. A letter from a private lawyer to a company that isn't a party to the lawsuit doesn't, on its own, create a legal duty to preserve.
- These do create one:
  - a subpoena;
  - a request from police under 18 U.S.C. § 2703(f) (90 days, and it can be extended).
- We should be able to honor both, and today nothing lets us hold an account if its owner deletes it.
- Franky can already export an account's rows and files by hand.

**Fix.**
- **Words** (§14, add to "What stays because it must"):
  > **Copies we must preserve.** If the law requires it, or we receive a valid legal request to preserve an account, we may save a copy of the account before it is deleted and keep it as long as the law or the request requires. We cannot preserve what was deleted before the request reached us.
- **Process: P9.** Within 2 days of a valid preservation request:
  - Franky exports the account's rows (SQL by user id) and files to an encrypted folder;
  - he logs the date;
  - he sets a calendar reminder for when the hold ends.
- **Code: H33.** An admin "hold" flag that pauses self-deletion and message deletes while a legal hold is in place. Medium; it can follow publish.
- **Lawyer: J24.**

**Cost:** cheap now; H33 medium. **Before publish:** words yes.

**Residual risk:** evidence deleted before any request arrives is gone.

### A-20 · Spite-delete the club: **BREAKS**

**Why.**
- Deleting a club takes one owner, one click, no delay, and there are no backups (D10, §14).
- Hiding a club already blocks the owner's delete: the DELETE route refuses a hidden club. So disputes we know about are protected. A surprise delete isn't.
- The attacker is also right that the draft's 7-day notice before a claim warns the owner. Hiding the page during that notice fixes it (A-25).

**Fix.**
- **Code: H25.** The owner of a verified club can't delete it in the app.
  - The button says: "To delete a verified club, email help@connectvibe.app."
  - We tell the other officers, wait 7 days, then delete it (H2, or SQL until H2 exists).
  - Clubs we haven't verified keep one-click delete. Cheap.
- **Words** (§9, "Deleting a club", replace the first two sentences):
  > **Deleting a club.** The owner of a club we have not verified can delete it from the club's settings. A verified club can be deleted only by us, when its owner asks at help@connectvibe.app: we tell the club's other officers and wait 7 days before deleting it. Deleting a club deletes its posts, events, chats, invites, and member and follower lists; content our moderators removed is kept as evidence.
- **Decision I22:** yes.

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** the owner of an unverified club can still delete it on a whim. Those are the clubs we haven't vouched for.

### A-21 · The graduate keeps the keys: **PARTIALLY HOLDS**

**Why.**
- §9 already gives a process (write to help@, show evidence, we decide), and it works by hand today.
- Two things are missing:
  - any timing;
  - any statement of what ends an owner's claim to the page.
- Only Franky can make the change, by SQL. At 10 clubs that's fine, once the runbook is written down.

**Fix.**
- **Words** (§9, "Officers and roles", add at the end):
  > Roles on a club page are meant to follow who actually runs the group. When a group shows us, with the evidence in "Passing a club down", that someone no longer holds office, we may remove their role, including the owner role, even if they object.
- **Words:** the 7-day aim in step 2 (A-25).
- **Code: H1** (owner transfer, plus an admin action to appoint an owner). Needed before the first graduation. Recommended before launch, so Rylan can show it at demo days.
- **Process: P5** (the club handover runbook: SQL, logged).

**Cost:** words cheap; H1 medium. **Before publish:** words yes; H1 no.

**Residual risk:** a real split inside a club leaves us refereeing. We decide about the page only.

### A-22 · Personal Vibe+ billed to a dead school address: **PARTIALLY HOLDS**

**Why.**
- §9 and §10 correctly keep Vibe+ personal.
- The attacker is right that a graduate whose login was a school address can't be reached, and that bank disputes follow.
- One part is overstated. The card networks' dispute-monitoring programs start at around 100 disputes a month, far beyond a pilot. So a few spring disputes won't get the Stripe account restricted, though each one costs a fee.
- Billing stays off until the items below are done.

**Fix.**
- **Words** (§10, "Cancelling", add at the end):
  > We send renewal reminders, receipts and notices about Vibe+ to your login email. Keep it one you will still read after you leave school (Section 4).
- **Words** (§10, new paragraph after "Cancelling"):
  > **If you can't get into your account.** If you are the person being charged but can't get into your account, email help@connectvibe.app with the date and amount of the charge and the last four digits of the card. We will cancel the subscription, and if the charge was a renewal in the last 30 days that you did not use, we will refund it.
- **Process: P11** (Stripe settings):
  - renewal reminders on for yearly plans;
  - failed-payment and expiring-card emails on;
  - a statement descriptor people will recognize on their card statement.
- **App copy:**
  - the landing line (A-01);
  - companion F1: "Use an address you'll still have after you graduate";
  - companion F3: a warning when the login email is itself a school address.
- **Code: H6** (change your login email). It can follow publish.

**Cost:** cheap. **Before publish:** words yes; the process before billing turns on.

**Residual risk:** someone who reads no email at all and disputes with their bank still costs a dispute fee.

### A-23 · A suspended or banned owner freezes the club: **PARTIALLY HOLDS**

**Why.**
- True: a restriction stops the owner's own changes (the officer rules in RLS on `org_members`), but it doesn't move the owner role, and nothing in the app can.
- Admins keep running the club.
- We can move the owner role by SQL today, so §12's "roles can be removed" can be kept by process. The Terms should say so plainly.

**Fix.**
- **Words** (§12, replace the "Clubs" paragraph):
  > **Clubs.** The same tools apply to clubs: a post or event can be removed, the club can be hidden, the officers involved can be restricted, and we can remove any officer's role, including the owner's, and appoint another officer as owner.
- **Code:** H1's admin-appoint action.
- **Process: P5.**

**Cost:** cheap. **Before publish:** yes (words).

**Residual risk:** the club waits for a founder to act.

### A-24 · "That's my logo, and those are my posts": **PARTIALLY HOLDS**

**Why.**
- Fair hit on the drafting: the club license is "the same license" as Vibe's, and Vibe's ends when the account is deleted. The club license should be its own, and it should survive.
- The logo fight is mostly a property question between the group and its designer, and Vibe shouldn't decide it.
- The copyright (DMCA) process lets both sides be heard once the agent is registered (James, task j9, due Oct 14).

**Fix.**
- **Words** (§7, replace the "What a club keeps" paragraph):
  > **What a club keeps.** When you post, upload or write something *as a club* (a club post, a club event, a club's logo or banner, a message in a club chat), you give the club's current and future officers, and us, a license to keep showing and using it on the club's page and in its chats for as long as the page exists. That license cannot be taken back, and it does not end when you leave the club or delete your account. You cannot take a club's content with you when you stop being an officer, and a club cannot claim your personal posts. If you made something for a club and believe you still own it, that is between you and the group; a copyright notice (below) is how to raise it with us. One thing to know today: if you delete your account, the posts and events you created as the club are deleted with it (Section 14), so before you leave, ask another officer to repost anything the club needs to keep.
- **Process: P4.** James registers the DMCA agent before publish.

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** a real ownership fight over a logo may still end with the logo coming down after a valid notice.

### A-25 · Take over a club by claiming it: **PARTIALLY HOLDS**

**Why.**
- §9 step 2 lists examples of evidence, not a minimum, and gives the current owner no notice.
- The tools are better than the attacker thinks. Hiding a club (an existing admin action) stops:
  - new joins;
  - invites;
  - posting as the club;
  - the owner's delete.

  That is a real freeze, and the Terms should use it.
- Verified status riding along with a handover is a real gap: see A-28.

**Fix.**
- **Words** (§9, "Passing a club down", replace steps 2 and 3):
  > 2. **If the owner is gone or won't hand over** (deleted their account, lost access, left, or refuses after the group chose someone else), an officer or a person who can show they now run the group may ask us at help@connectvibe.app to appoint a new owner. We need at least two of: a message from the club's own school email; the group's current officer listing on the university's organization site; a message from another current officer on Vibe; or a call with us. If the current owner still has an account, we email them and wait 7 days for an answer before we move the role, unless they broke these Terms or the page is at risk; we may hide the page while we wait. We aim to reply within 7 days. We decide; we may say no; and we may leave the page with no owner while we look.
  > 3. **If two people both claim a club**, we may hide the page until we decide. While a page is hidden, nobody can delete it, post as the club, invite people or add members; its members keep their chats. We decide on the evidence above, not on who asked first, and we tell both sides. Our decision on who holds a Vibe role is about the page on Vibe only; it says nothing about who holds office in the real group.
- **Process: P5.**

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** forged evidence that gets past two checks can still win a page. We will sometimes be wrong, and the Terms say so.

### A-26 · The real club can't get its page back: **PARTIALLY HOLDS**

**Why.**
- Everything the new president needs can be done today by Franky with SQL: changing `owner_id` and the member roles. A squatted handle can be changed the same way.
- None of it is a button, and the Terms promise no timing, which the attacker reads as "never".
- An aim fixes the words, and the runbook keeps the aim.

**Fix.**
- **Words:**
  - the 7-day aim in step 2 (A-25);
  - §9, "Passing a club down", replace step 4:
    > 4. **A club with no officers left** may be hidden after 6 months and deleted after 12, or handed sooner to a person who shows they now run the group. We review clubs with no officers at least once a semester.

    This settles the draft's [DECISION] on the 12-month figure, following companion I7. The last sentence of "Deleting a club" ("...or that has had no officer for 12 months") stays as written.
- **Code:** H1, H2 and H38.
- **Process:**
  - P5 (the handover runbook);
  - P13 (the semester club review).

**Cost:** words cheap; H1 and H2 medium. **Before publish:** words yes.

**Residual risk:** a club that needs its page during the founders' exam week may wait longer than 7 days.

### A-27 · The calendar disappears with the officer who posted it: **BREAKS**

**Why.**
- The draft contradicts itself:
  - §9 step 5 says club content "stays with the club";
  - §7 and the code say it is deleted (D11, G17: `events.creator_id ON DELETE CASCADE`, and posts cascade by author).
- The honest sentence in §7 is right. Step 5 is wrong.

**Fix.**
- **Words** (§9, "Passing a club down", replace step 5):
  > 5. **An outgoing officer** keeps the personal posts they made as themselves and loses their role. Content posted as the club stays on the club's page while that officer's account exists; if the officer deletes their account, the club posts and events they created are deleted with it today (Section 7), so hand them to another officer first.
- **Code: H19** (companion). Club posts and events move to the club instead of being deleted. Recommended before the first handover season. Then §7 and §9 change in users' favor, with the next version.
- **Code and copy: H35.** The delete dialog warns officers: "You created N club posts and M club events. They'll be deleted with your account." Cheap.

**Cost:** words cheap; H35 cheap; H19 medium. **Before publish:** words yes; H35 recommended; H19 no.

**Residual risk:** an officer who ignores the warning still takes the calendar with them, until H19 ships.

### A-28 · "Verified" rides along with a private handover: **BREAKS**

**Why.**
- "Does not transfer if the page changes hands without us" is written as a fact.
- In the code, verification is one column that nothing re-checks (D10).
- As a right we keep, the sentence is fine. As a fact, it is false.

**Fix.**
- **Words** (§9, replace the "Verified clubs" paragraph). The checks list is added under A-30:
  > **Verified clubs.** We mark a club as verified after we have checked that it is a real campus organization and that the officers on Vibe speak for it (the checks are listed below). Only verified clubs can create events and send invites. Verification is not a university endorsement (Section 6). It is about the page and the people we checked: if the people running the page change, we may check again, and we may remove verified status at any time.
- **Code: H26.** When a verified club's owner changes, or the owner's account is gone, the admin desk flags the club for a re-check. Medium; it can follow publish.
- **Process: P13.** Every semester, re-check each verified club with its officers.

**Cost:** cheap. **Before publish:** yes (words).

**Residual risk:** a private handover between officers stays verified until we notice.

### A-29 · "IU verified" and "Officially recognized": trademark and false endorsement: **PARTIALLY HOLDS**

**Why.**
- §6 is right in substance. Naming a school to say where someone studies is ordinary, descriptive use.
- The risk is our own copy:
  - "IU verified" reads as "verified by IU";
  - "Officially recognized clubs at {campus}" tells students the university recognized them.
- Both are cheap to fix.

**Fix.**
- **App copy:**
  - Badge: "@iu.edu verified" / "@purdue.edu verified" (A-14).
  - `src/app/campus/campus-home.tsx:12251-12254`: "Officially recognized clubs at {campus}." becomes "Clubs verified by Vibe at {campus}. Not a university listing." And "Officially recognized clubs." becomes "Clubs verified by Vibe."
  - `campus-home.tsx:12272`: "Groups created by verified students." becomes "Groups created by verified accounts."
  - A footer line on the site, and in the store listings: "Vibe is independent and not affiliated with Indiana University or Purdue University."
  - `supabase/templates/confirmation.html`: "the social app for students, clubs and orgs at IU and Purdue" becomes "an independent social app for students, clubs and orgs on the IU and Purdue campuses".
  - Marketing repo: "real students only" becomes "verified school emails".
- **Words** (§6, first bullet, add at the end):
  > A badge reads "@iu.edu verified" or "@purdue.edu verified" because that is the address the person confirmed with us; the university does not verify anyone on Vibe.
- **Lawyer: J9** (already on the list).

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** a university can still object to any use of its name. With these changes, our answer is strong.

### A-30 · A suspended chapter, "officially recognized", running events: **PARTIALLY HOLDS**

**Why.**
- §6 and §9 say verification isn't recognition by the university. The app says "Officially recognized"; that copy is fixed under A-29.
- There are no written criteria for verifying a club (D10).
- The only club today is a founder's own chapter, used as a test page (brief §2).
- Criteria are cheap to write, and easy to keep at 10 clubs.

**Fix.**
- **Words** (§9, add right after the "Verified clubs" paragraph from A-28):
  > Before we verify a club we check that: the group is listed as active on the university's student-organization site, or we have other good evidence it exists; at least two of its officers have Vibe accounts; one of us has met an officer in person or on a call; and, as far as we know, the university has not suspended or banned the group. We remove verified status from a club when we learn the university has suspended or banned it. A founder does not verify a club they belong to on their own.
- **Decision I24:** adopt these checks.
- **Process:**
  - P19 (no founder verifies their own club alone);
  - P13 (the semester re-check).

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** we can miss a suspension that the university hasn't made public.

### A-31 · "We never tell your university" versus campus police and Title IX: **BREAKS**

**Why.**
- "Never" has no exception for an emergency or for the student's own consent.
- The attacker is right that it forces a bad choice in the one case that matters most: a threat to someone's life.

**Fix.**
- **Words** (§5, replace the paragraph "We never tell your university"):
  > **We don't report you to your university.** We do not send universities your information as a matter of course, and they do not send us anything about you. We share information with a university only: when someone's life or safety is at risk and we contact campus police or other emergency services; when you ask us to; or when the law requires it (the Privacy Policy explains legal requests). If a university asks us to act on an account, we treat it like any other report (Section 11).
- **Process: P20** (emergencies): call 911 or campus police first, then log what we shared and why.
- **Lawyer: J26.**

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** a student may still be upset that we called campus police. The Terms now say we may.

### A-32 · The university owns the verification pipe: **HOLDS**

**Why.**
- §3 already says "We may add or remove domains over time", and §5 keeps the right to change which domains we accept.
- Nothing in the Terms promises that verification will always be possible at every school.
- A university filtering our email is unlikely at pilot scale. If it happens, existing badges keep working and new students wait.

**Fix.**
- **Process:** confirm that SPF, DKIM and DMARC are set up for `connectvibe.app` in Resend. That lowers the chance of our email being filtered.
- **Words:** none.

**Cost:** cheap. **Before publish:** no.

**Residual risk:** a university can still block us.

### A-33 · TAKE IT DOWN: a 48-hour federal clock with no one on call and no image matching: **PARTIALLY HOLDS**

**Why.**
- The 48-hour removal is the law's own clock for covered platforms, so we keep saying it. Softening it to an aim would not remove the duty.
- What must change is making it keepable:
  - nothing alerts anyone on a Friday night;
  - there is no log of requests;
  - "identical copies we find" goes beyond the statute, which asks for "reasonable efforts" to remove known identical copies.
- One point is overstated. Keeping a removed image in a locked quarantine as evidence is not leaving it up. The Act requires removal from the platform, and quarantine does that. (How long to keep it goes to counsel: J22.)

**Fix.**
- **Words** (§11, intimate images, replace the sentence "We remove it within 48 hours of a valid request, along with identical copies we find."):
  > **We remove it within 48 hours of a valid request**, and we make reasonable efforts to find and remove identical copies on Vibe. We keep a record of each request and what we did.
- **App copy** (Community page, `src/app/legal/community/page.tsx:202-204`): "along with any identical copies of it we find on Vibe" becomes "and we make reasonable efforts to find and remove identical copies on Vibe".
- **Code:**
  - H29 (the urgent alert).
  - H39 later: store a fingerprint (a SHA-256 hash) of each uploaded image, and refuse a re-upload of a removed image's exact file. Medium; it can follow publish.
- **Process:**
  - P1: the help@ rota. Every day one founder is responsible for help@ and the admin queue, checking them morning and evening, weekends included. Phones notify on "Intimate image removal" and "URGENT:".
  - P2: the NCII log (NCII: intimate images shared without consent). It records when each request came in, where the image was, when it came down, which copies were searched, and who did it.
- **Lawyer:** J7 (already on the list) and J22.

**Cost:** cheap. **Before publish:** yes (words, H29, P1, P2).

**Residual risk:** a re-upload with a changed file can slip through until someone reports it.

### A-34 · The Privacy Policy describes a different app: **BREAKS**

**Why.**
- Confirmed (code-facts §I and H18). The live Privacy Policy:
  - claims a CSRF cookie, analytics and multi-factor sign-in, none of which exist;
  - names three providers when there are at least ten.
- The Terms pull the Privacy Policy in.
- The fix lives in the Privacy Policy, and it must publish on the same day as the Terms.

**Fix.**
- **Process.** Publish the corrected Privacy Policy (companion B, plus the list below) on the same day as the Terms, under the same version bump.
  - Providers:
    - Supabase;
    - Vercel;
    - Cloudflare R2;
    - Resend;
    - Stripe;
    - Sentry;
    - Firebase Cloud Messaging (once push is turned on);
    - Google Fonts;
    - Cloudflare cdnjs;
    - Cloudflare Email Routing (it forwards our inbox to Gmail).
  - Remove the CSRF, analytics and multi-factor claims.
- **Code: H37.** Serve the fonts ourselves (Next's font loader), so visitors' IP addresses stop going to Google. Then Google Fonts comes off the list. It can follow publish.

**Cost:** medium (a day, for the Privacy rewrite). **Before publish:** yes.

**Residual risk:** a provider we forgot. The fix is a yearly check of `package.json` and outbound calls.

### A-35 · "Only one cofounder can reach your data" is false: **BREAKS**

**Why.**
- The attacker is right about the intro: all three cofounders are admins, and they see reported content, including reported messages.
- The companion is wrong in the other direction. The admin desk does not show email addresses (H19).

**Fix.**
- **Words** (intro, replace "Vibe is built and run by its three cofounders; only one of them, Francisco Cazares, can reach the systems that hold your data (Privacy Policy, section 1)."):
  > Vibe is built and run by its three cofounders. All three moderate Vibe: they review reports and can see what was reported, including reported messages, and the records of what we did about it. Only one of them, Francisco Cazares, has direct access to the database and the other systems that store your data (Privacy Policy, section 1).
- **Companion B, the "us" row** (replace):
  > Platform admins (the three cofounders) can see reports and their snapshots, removed content, restriction records and notes, and hidden clubs, and can look an account up by its exact email address (the address itself is not shown to them). Only Franky can reach the database directly, which is where login and school emails are stored. The founders read what arrives at hello@, help@ and vibe.llc@.

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** none. The sentence is now true.

### A-36 · Known security holes, and the founder personally: **PARTIALLY HOLDS**

**Why.**
- §15's disclaimer is standard and stays. The attacker is right that it doesn't answer a regulator's question: "what did you do about problems you already knew about?"
- The answer is to fix the known list before students arrive, and to keep a dated record.
- The Drizly comparison is overstated. That order followed a breach of about 2.5 million customers after years of warnings.
- A pre-launch pilot of about 20 accounts that fixes its own review's findings before inviting students is the opposite story. But only if the fixes actually land.

**Fix.**
- **Code, before any student is invited:**
  - H11 (pre-registration);
  - the H5 piece (sign out other devices on password change);
  - H7 (password to delete).
- **Code, before launch:**
  - H13: 2FA on the three founder logins. Supabase's authenticator-app sign-in works on the Free plan.
  - The interim part of H6: block the direct email change.
- **Process: P17.** Today:
  - turn on 2FA for every founder account that reaches data or money: Supabase, Vercel, Cloudflare, Stripe, GitHub, Resend, and the Google and Outlook inboxes;
  - keep a dated "security fixes" log in the repo that says what is fixed, what is still open, and why.
- **Lawyer:**
  - J20 (insurance);
  - J21 (Franky's personal exposure).
- **Words:** none in the Terms. The Privacy Policy may say "we take reasonable steps to protect your data" only once the pre-invite fixes have landed.

**Cost:** medium overall. **Before publish:** H5 and H7 yes; H11 before the first invite; P17 today.

**Residual risk:** sessions still last a long time on the Free plan. A hard cap needs Supabase Pro or app-side code, and the Terms disclose it.

### A-37 · Privacy and the Guidelines change through a side door: **BREAKS**

**Why.**
- Confirmed (A3): only `TERMS_VERSION` makes anyone accept again.
- Nobody has accepted the Privacy Policy dated Sept 28.
- The fix is a rule: one version number covers all three documents.
- Publishing v2 fixes the past gap, because every account then accepts the whole set.

**Fix.**
- **Words** (§19, replace the first two sentences):
  > The version of these Terms is the dated string at the top. It also covers our Privacy Policy, Community Guidelines and Child Safety Standards: when we change any of them in a way that matters, we publish a new version with a new date and ask every user to accept it the next time they open Vibe (Section 1).
- **Words** (intro, replace the third paragraph):
  > Our Privacy Policy explains what we collect and what we do with it. Our Community Guidelines and Child Safety Standards explain what is allowed on Vibe in plain words; where they say something is not allowed, that is a rule under these Terms too. You agree to all of them at the same time you agree to these Terms, and when any of them changes in a way that matters, we ask you to accept again (Section 19).
- **Words** (§12, new sentence at the end of the first paragraph):
  > We may also remove content or limit an account when we believe in good faith that it puts someone at risk or exposes Vibe or its users to legal harm, even if no rule names that exact thing.
- **Process: P15.** Any material change to any of the three documents bumps `TERMS_VERSION`.

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** a new rule added between versions is enforced under the good-faith sentence, not as a written rule.

### A-38 · Selling who-viewed-whom with no opt-out: **PARTIALLY HOLDS**

**Why.**
- This is the paid feature by design (brief §2: counts are free, names come with Vibe+). The /plus page says plainly "No hiding that you viewed someone".
- The attacker is right on two points:
  - the Terms never tell a viewer that views are recorded and shown, by name, to the person viewed;
  - the viewer has no choice about it.
- Two protections the attacker missed:
  - a block keeps your name off their list, in both directions;
  - views made while signed out are not recorded.

**Fix.**
- **Words** (§7, "Who can see it", new paragraph):
  > **Views.** When you are signed in and open someone's profile or post, we record that you viewed it. The person you viewed sees how many people looked; with Vibe+ they also see who. If either of you has blocked the other, your name does not appear on their list. Views while you are signed out are not recorded.
- **Decision I20: private viewing** (LinkedIn's model).
  - Anyone can turn private viewing on. Their views still count, but carry no name.
  - While it's on, they can't see names either, with or without Vibe+.
  - Recommended before billing turns on (H36). Then add to §7: "You can turn on private viewing in Settings; while it is on, your views are counted without your name, and you cannot see names either."
- **App copy** (`src/app/plus/page.tsx`): "Three things the database already keeps private from everyone, including from us on the free tier:" becomes "Three things Vibe keeps private from other users on the free tier:".
- **Lawyer: J25.**

**Cost:** words cheap; I20 medium. **Before publish:** words yes; I20 before billing.

**Residual risk:** someone who checks an ex's profile is named to that ex, unless one has blocked the other or private viewing is on.

### A-39 · Retention promises the database blocks or never carries out: **PARTIALLY HOLDS**

**Why.**
- The attacker's facts are right:
  - there is no purge job anywhere;
  - the moderation log refuses deletes, even for postgres;
  - recovery evidence would sit in personal inboxes.
- But nothing on Vibe is old enough to break a promise yet:
  - quarantine began on Sept 27, 2026, so "up to a year" can't be broken before Sept 2027;
  - "3 years" can't be broken before 2029.

  So these are items for the calendar, not false statements today.
- One statement is too absolute: the ban hash "cannot be turned back into the address". That is only true while the secret key stays secret.

**Fix.**
- **Words** (§12, "What a ban is", replace the sentence that begins "We keep a one-way scrambled record"):
  > We keep a one-way scrambled record of that address (a keyed hash: without a secret key that only our servers hold, it cannot be turned back into the address) for exactly this purpose, and it survives your deleting the account.
- **Words** (§14, "What stays because it must", replace the "Moderation records" bullet and its [REVIEWER] bracket):
  > **Moderation records**: what we removed and why, and the snapshot attached to a report about you, kept as evidence for 3 years after the case closes, then deleted or stripped of names and handles.
- **Code: H28.** A scheduled job for the quarantine, with a "hold" marker for material we must keep. It must be live before Sept 2027.
- **Process: P14** (the retention calendar):
  - a monthly purge of recovery evidence;
  - every January, a review of old moderation records (the first purge is due in 2029);
  - H28 live before Sept 2027;
  - recovery evidence kept in one private shared folder, never in a personal inbox.

**Cost:** cheap now; H28 medium, later. **Before publish:** words yes.

**Residual risk:** if the secret key (the pepper) leaks, the school-email hashes could be matched against a student directory. Keep the key out of the repo and out of logs.

### A-40 · Selling customization that doesn't exist: **BREAKS**

**Why.**
- Confirmed: `requirePlus` unlocks only the viewer names, and the /plus page itself says the customization "is still being built".
- The contract promises what the product page disclaims.

**Fix.**
- **Words** (§10, replace the "What it is" paragraph):
  > **What it is.** Vibe+ lets you see the names of the people who viewed your profile and your posts (everyone sees the counts for free). We are building more profile customization for Vibe+, and we will not charge for anything before it exists. What is in Vibe+ may change; we will not remove something you paid for in the middle of a paid period without refunding the rest of that period.

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** none.

### A-41 · A suspended subscriber can't cancel and keeps paying: **PARTIALLY HOLDS**

**Why.**
- The attacker missed that the suspension notice already says "write to the address below and we'll stop it" (`src/app/account/suspended/page.tsx`). The proxy already allows the portal call.
- But §10's "Cancel any time from the Vibe+ page" is false for a suspended student.
- And an email is weaker than a button under state cancellation laws.

**Fix.**
- **Code: H24.** A "Manage subscription" button on `/account/suspended`. The portal route is already allowed there. Cheap.
- **Words** (§10, "Cancelling", replace the first sentence):
  > Cancel any time from the Vibe+ page ("Manage subscription", which opens Stripe's portal); if your account is suspended, the same button is on the notice you see instead.
- **Words** (§10, replace the "Restrictions and Vibe+" paragraph and its [REVIEWER] bracket):
  > **Restrictions and Vibe+.** A suspension leaves Vibe+ running and does not extend the paid period; you can cancel from the notice at any time. A ban ends Vibe+ at once with no refund, unless the ban is lifted on appeal (Section 12).
- **Decision I19:** keep billing during a suspension (recommended), with the button and the disclosure.

**Cost:** cheap. **Before publish:** words yes; H24 before billing turns on.

**Residual risk:** a student may still feel that charging during a suspension is unfair. The button is what the law asks for.

### A-42 · "One quick thing": the re-acceptance screen may void v2: **BREAKS**

**Why.**
- Confirmed (A3). The acceptance screen:
  - says "One quick thing";
  - presents agreeing as a record-keeping step;
  - promises "you won't see this again".
- Every existing account accepts v2 on that screen.
- Fix the screen before the version bump. Otherwise the May 7 page may still govern existing accounts.

**Fix.**
- **App copy** (`src/app/auth/terms/accept-terms-form.tsx`), shown whenever the version changes:
  - Headline: "We've updated our Terms"
  - Body: "Our Terms of Service, Privacy Policy and Community Guidelines have changed. The main changes are below. Please read them before you continue."
  - "Main changes" for v2's first publish, one line each:
    - "Vibe is run by CONNECTVIBE. LLC, an Indiana company."
    - "A verified badge means you confirmed a school email. Nothing more."
    - "Vibe+ terms: price, automatic renewal, and how to cancel."
    - "Our liability is limited, and disputes go to courts in Marion County, Indiana."
    - "How clubs are handed down, and what happens to your data when you leave."
  - Links: Terms of Service · Privacy Policy · Community Guidelines.
  - Checkbox, unchanged: "I'm 18 or older and I agree to the Terms of Service and Privacy Policy."
  - Main button: "Agree and continue". Other choices: "Sign out" and "Delete my account".
- **Process: P15.** Every version bump comes with its own 3–5 "main changes" lines.

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** some students will click without reading. The screen now gives them a fair chance to read first.

### A-43 · Store reviewers read the Terms too: **PARTIALLY HOLDS**

**Why.**
- Apple's guideline 1.2 asks for four things, and Vibe has all four:
  - a way to report content;
  - a way to block abusive users;
  - timely action on reports;
  - published contact details.
- It does not require a ban to stop someone signing up again. That part of the attack is wrong.
- Two things are real: Google's child-safety declaration, and the federal duty to report child sexual abuse material (18 U.S.C. § 2258A). Both need a working way to report.
- A provider can file through NCMEC's public online CyberTipline form today. Registering as an electronic service provider is better, and free.

**Fix.**
- **Process: P3.**
  - Register with NCMEC as an electronic service provider now, before the Oct 16 store submission. Franky or James takes it on.
  - Until then, report through the public CyberTipline form and save the report number.
  - Move the material to quarantine with a hold on it. Never forward it by email, and never download it.
- **Words:** none in the Terms. The Child Safety page already says we report.
- **Lawyer: J14** (already on the list).

**Cost:** cheap (paperwork, plus a few days' wait). **Before publish:** yes (start now).

**Residual risk:** a store reviewer can still ask questions, which we answer. App-store age laws are unsettled (J14).

### A-44 · Auto-renewal and price notices that can't be delivered: **PARTIALLY HOLDS**

**Why.**
- The Terms say the right things. The operations behind them don't exist yet.
- Billing is off, so none of this can happen until billing turns on, and that is the right gate.
- Stripe can send renewal reminders itself: it's a setting in the Dashboard.
- A confirmation email with instructions for cancelling is a small webhook.

**Fix.**
- **Process: P11.** Before billing turns on, turn on in Stripe:
  - upcoming-renewal reminders for yearly plans;
  - failed-payment emails;
  - receipts.
- **Code: H31.** On `checkout.session.completed`, send a confirmation email with the price, the renewal date, the auto-renewal terms and how to cancel. Cheap.
- **Process: P12.** For a price change: export the subscribers from Stripe, email them at least 30 days ahead, and log the date.
- **Words** (§10, "Price and renewal", replace "plus any sales tax the law requires"):
  > plus sales tax where the law requires it. If we start charging tax on your subscription, we will tell you at least 30 days before it applies to a renewal
- **Lawyer: J8.** Add two questions: is Stripe's reminder email enough, and which states need a notice before renewal?

**Cost:** cheap. **Before publish:** words yes; the rest before billing turns on.

**Residual risk:** a reminder sent to a dead inbox still isn't read. A-22's refund path covers that case.

### A-45 · A wrongful ban gets lifted; the money doesn't come back: **BREAKS**

**Why.**
- Confirmed: lifting a ban doesn't bring Vibe+ back ("NOTHING IS UNDONE BEYOND THE RESTRICTION").
- "We undo it" reads as "we make you whole".
- Charges survive even after the Stripe customer record is deleted, so a refund is still possible from the Dashboard.

**Fix.**
- **Words** (§10, "Refunds", replace the list of exceptions):
  > we do not refund partial periods except where the law requires it, where we removed a paid feature mid-period, where we charged you in error, where we restricted your account by mistake and lifted it on appeal, or where we choose to.
- **Words:** §12 "Appeals", as rewritten under A-13.
- **Process: P10.** When a ban appeal succeeds, refund the unused part of the last Vibe+ charge from the Stripe Dashboard, and log it.
  - Refund = price × unused days ÷ days in the period.

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** none.

### A-46 · Free Vibe+ for campus helpers, with no disclosure rule: **PARTIALLY HOLDS**

**Why.**
- In the contract, "not a payment" is right.
- For advertising, the attacker is right: a free subscription is a connection that a helper must disclose when they promote Vibe.

**Fix.**
- **Words** (§10, "Free Vibe+", add at the end):
  > If we give you Vibe+ or anything else for helping promote Vibe, you must say so whenever you post about Vibe (for example, "I get Vibe+ free for helping out").
- **Process: P16.**
- **Lawyer: J16** (already on the list).

**Cost:** cheap. **Before publish:** words yes; the process before the marketing teasers start.

**Residual risk:** a helper forgets. We remind them, and we can withdraw the perk.

### A-47 · The harmed student: Vibe's own promises, and the injury carve-out: **PARTIALLY HOLDS**

**Why.**
- The draft already uses "aim" for the 24-hour review, which is the right shape.
- The attacker is right about three phrases, and they are fixed under A-05, A-09 and A-11:
  - "every";
  - "banned when found";
  - the flat "bans stick" on the other pages.
- The 48-hour removal is a legal duty. Stating it adds little exposure, as long as the process exists (A-33).
- On §16, the attacker half-misreads. The carve-out covers only liability "that cannot legally be limited".
  - The examples are the trouble: they read as an admission.
  - Delete them. The law gives a plaintiff what it gives either way.
- *Barnes* and *Bride* turn on specific promises. The fix is to make fewer promises, keep the ones we make, and write aims as aims.

**Fix.**
- **Words** (§16, replace the last paragraph and its [REVIEWER] bracket):
  > Some places do not allow some of these limits; there, they apply only as far as the law allows. Nothing in these Terms limits liability that the law does not allow us to limit.
- **Words:** the changes to aims under A-05 (§11), A-09 (§12) and A-11 (§4).
- **App copy** (Community page, `src/app/legal/community/page.tsx:145-147`): "A report goes straight to the Vibe team and lands in a queue, where a person reads it" becomes "A report goes to the Vibe team and lands in a queue, where a person on the team reviews it". The ban notice changes as under A-09.
- **Lawyer: J19.**

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** a harmed student can still sue in negligence over Vibe's own acts. The cap and Section 230 are defenses, not walls.

### A-48 · The minor who got in: **BREAKS**

**Why.**
- §12 promises to "delete its data".
- The law requires us to preserve reported child sexual abuse material: 18 U.S.C. § 2258A, which the 2024 REPORT Act extended to one year after a report.
- The Child Safety page already says "We keep the records the law requires us to keep".
- Three documents disagree (C-09):
  - the Terms say "close it and delete its data";
  - the Child Safety page says "ban";
  - the moderation desk's default is a permanent ban with the school email hashed.
- Reporting also has to actually happen (A-43).

**Fix.**
- **Words** (§12, replace the paragraph "Accounts of people under 18" and its [REVIEWER] bracket):
  > **Accounts of people under 18.** If we learn an account belongs to someone under 18, we close it and take its content down. We then delete its data, except what the law requires us to keep: for example, material we must report to the National Center for Missing & Exploited Children and preserve, which we keep only as long as the law requires. A school email on a closed minor's account is not banned for good: once the person turns 18, they can write to help@connectvibe.app and we will free it.
- **Words** (§14, "What stays because it must", new bullet):
  > **Material the law requires us to keep**, such as reports we make to the National Center for Missing & Exploited Children and the content they are about, for as long as the law requires.
- **App copy** (Child Safety page, "If you think a minor is on Vibe"):
  - "If the person is under 18, we ban the account" becomes "If the person is under 18, we close the account".
  - Add: "A school email on it can be used again once the person turns 18."
- **Process:**
  - P3 (NCMEC);
  - P8 (free the address when they turn 18).
- **Code:**
  - H28 (the quarantine "hold" marker);
  - H34 later (an admin delete that keeps the evidence).

  Until then, "close" means the ban tool, which hides everything. Franky deletes the rest by hand after the hold ends.
- **Lawyer:** J1 and J17 (already on the list).

**Cost:** words cheap; process a few days; code medium, later. **Before publish:** words and P3 yes.

**Residual risk:** a 17-year-old who lies still gets in. Today the law asks only for the age check we have (J1, J14).

### A-49 · Delete, then sue: no proof anyone agreed: **BREAKS** (until H3 lands)

**Why.**
- If §14 publishes promising a 3-year proof record while the code still deletes it, the Terms state a retention that isn't happening.
- A record of only (user id, version, time) proves little: after deletion, nothing links a plaintiff to that user id.
- The attacker overstates the stakes. Courts regularly accept proof of a checkbox agreement from how the signup works (no account can exist without the box) plus proof that the person had an account.
- Which version they accepted is harder to show. H3 fixes that cheaply.

**Fix.**
- **Code: H3, revised.** On deletion, write to a table only the service role can read:
  - the user id;
  - every Terms version accepted, with its date;
  - the deletion date;
  - keyed hashes of the login email and the school email, made with a separate "consent" key.

  Delete each row after 3 years. Cheap.
- **Words** (§14, "What stays because it must", replace "Proof that you agreed" and its [DECISION] bracket):
  > **Proof that you agreed**: the Terms versions you accepted and when, with a scrambled copy of your login and school emails so we can match it to you if there is ever a dispute, kept for 3 years after you delete your account.
- **Words** (§1): remove the [DECISION] bracket. No other change.

**Cost:** cheap. **Before publish:** yes (or drop the promise).

**Residual risk:** accounts deleted before H3 ships leave no record behind.

### A-50 · The defamed club isn't bound by anything: **PARTIALLY HOLDS**

**Why.**
- The draft is right that an unincorporated student group isn't a party, and that cuts both ways.
- The exposure is smaller than the attacker says:
  - deciding who controls a page of user content, and whether to show it, is the kind of editorial decision Section 230 protects;
  - a free page gives a group little to claim in damages.
- The cheap improvement:
  - officers accept the Terms for the group, where they have the authority to;
  - each signed club signs a one-page agreement during Rylan's visit.

**Fix.**
- **Words** (§9, "What a club is on Vibe", replace the last sentence):
  > The student organization behind the page, if there is one, is not a party to these Terms on its own. When you create a club page or accept an officer role, you agree to these Terms for yourself and, if you have the authority, on behalf of the group, for everything to do with its page on Vibe.
- **Process: P21.** A one-page "club page agreement", signed by an officer when Rylan signs a club. It covers:
  - who runs the page;
  - the handover rule;
  - the checks for a verified club;
  - that Vibe decides about the page only;
  - Marion County.

  Counsel reviews it (J23).
- **Code: H42.** A checkbox at club creation that repeats the sentence. Cheap; it can follow publish.

**Cost:** cheap. **Before publish:** words yes.

**Residual risk:** a group whose officer had no authority is still not bound.

### A-51 · The exposed student: the Community page says the opposite: **PARTIALLY HOLDS**

**Why.**
- §7 is accurate. The false statements are elsewhere:
  - the Guidelines;
  - the Child Safety page;
  - the live Privacy Policy;
  - marketing.
- They must change on the day the Terms publish, or before.
- This attack needs no new fix beyond A-14, A-34 and the copy list. It is the reason the copy list is a publish gate, not a nice-to-have.

**Fix.**
- **App copy**, all before publish:
  - the Community opener (companion C1);
  - the Child Safety opener (C2);
  - the live Privacy line "affiliated with a U.S. college";
  - the marketing line "real students only" (companion F8).
- **Code: H16** (read limits for unverified accounts), later.

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** screenshots of the old pages survive. The dated versions show when they changed.

### A-52 · No arbitration, no class waiver, and defects that affect everyone: **HOLDS**

**Why.**
- Leaving out arbitration is a deliberate choice, and a defensible one.
- A class-action waiver outside an arbitration clause is weak in court.
- A consumer arbitration clause brings its own risk for a tiny company: "mass arbitration", where hundreds of individual filings each trigger fees the company must pay. That can cost more than a class action.
- With about 20 accounts, and fixes landing before students arrive, ordinary courts are the right call for now.
- One small addition helps students and helps our fairness argument: allow small-claims court.

**Fix.**
- **Words** (§18, add after the Marion County sentence, and remove the [REVIEWER] bracket):
  > Either of us may instead bring a claim in small-claims court in the county where you live, if the claim qualifies there.
- **Decision I27:** adopt the small-claims option.
- **Lawyer:** the §18 question stays on counsel's list (J28: revisit at 1,000 users).

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** a class action is still possible. The real defense is fixing the shared defects (A-01, A-51).

### A-53 · The indemnity hands Vibe's defense to a student: **BREAKS**

**Why.**
- The attacker is right: the draft lets the student run Vibe's defense.
- A broad indemnity from a 19-year-old with no money is also the clause a judge points to when calling a contract one-sided. That can drag other clauses down with it.
- An indemnity is the promise to cover someone else's costs.
- The fix:
  - we run our own defense;
  - we narrow what the student covers to things they did knowingly or recklessly.

**Fix.**
- **Words** (§17, replace the whole paragraph and its [REVIEWER] bracket):
  > If someone brings a claim against us because of something you did knowingly or recklessly (content you posted, a breach of these Terms or the law, or a violation of someone else's rights), you will cover our reasonable costs of dealing with it, including reasonable lawyers' fees, and any amount we have to pay because of it. We choose our lawyers and run our own defense; you agree to help where you reasonably can. We will not settle a claim in a way that admits fault on your behalf without your agreement.
- **Lawyer: J4** (already on the list): proportionality, and whether "knowingly or recklessly" is the right limit.

**Cost:** cheap. **Before publish:** yes.

**Residual risk:** a court may still trim an indemnity from a student. It now reads as fair.

### A-54 · Teasers and store screenshots go beyond the license: **PARTIALLY HOLDS**

**Why.**
- §7 already says we don't use Your Content for advertising. That holds as long as marketing uses test accounts or has consent.
- The gap is process, plus one sentence that names screenshots and teasers.

**Fix.**
- **Words** (§7, "The permission we need", replace "We do not use Your Content for advertising, to train AI models, or to sell or license to anyone else."):
  > We do not use Your Content to train AI models, and we do not sell or license it to anyone else. We do not use your name, photo or content in advertising, marketing or app-store screenshots without asking you first.
- **Process: P16.** Marketing and store screenshots use founder or test accounts, or a signed consent.

**Cost:** cheap. **Before publish:** words yes; the process before teasers and screenshots.

**Residual risk:** a real student's post that happens to show in the background of a screenshot. Review each image before it goes out.

---

# Part 2: Contradictions and unkeepable promises

## 2a. The attacker's Contradictions (C-01 to C-36)

Each row says how the contradiction is settled and where the fix is written. "Part 4" means the wording is only in the v3 change list.

| # | Resolution | Where |
|---|---|---|
| C-01 | Both documents were wrong. The intro now says all three founders moderate and see reported content, and only Franky reaches the database. Companion B's "us" row drops "login and school emails" (the admin desk doesn't show them). | A-35 |
| C-02 | The companion was wrong about today. With H20 live before publish, Terms §2 and companion G agree: a login without a verified school email can't RSVP. | A-11, H20 |
| C-03 | The Terms understated it. §7 now says a résumé opens only for signed-in users with a verified school email whom you haven't blocked, unless you hide it. The résumé item comes off companion G and H16 (already built). | Part 4 §7 |
| C-04 | §9 step 5 is rewritten to match §7 and the code. | A-27 |
| C-05 | The club license is now its own license. It can't be taken back, and it survives the officer's account. | A-24 |
| C-06 | There is one rule for reading messages, in §11. §9's club-chat sentence points to it. | A-05; Part 4 §9 |
| C-07 | §14 now says: if removing files fails part-way, we stop and the account is not deleted; Vibe+ is already cancelled by then, and files already removed stay removed. "We never ... leave your files behind" is deleted. | Part 4 §14 |
| C-08 | Softened. "We can end your account" becomes "We can close your account" (a ban). Deletion by us is done by hand until H34. | Part 4 §14 |
| C-09 | Aligned across the Terms, the Child Safety page and companion I10. We close the account and take the content down. We delete the data except what the law requires us to keep. The school email is freed at 18. | A-48 |
| C-10 | H23 makes the §12 sentence true. If H23 slips, use the fallback wording. | A-10 |
| C-11 | The customization claim is dropped. | A-40 |
| C-12 | The ban notice copy is fixed. | A-09 |
| C-13 | Copy fixes to the Community page, Child Safety page, live Privacy Policy and marketing. | A-51, companion C1 and C2 |
| C-14 | Badge and onboarding copy fixed. | A-14 |
| C-15 | App copy: the support page, the school-email screen headline and its banner (full strings in Part 4, app copy). | Part 4 app copy |
| C-16 | "Officially recognized" copy removed, and written checks for verifying a club. | A-29, A-30 |
| C-17 | §9 now keeps a right to re-check; the false statement of fact is gone. | A-28 |
| C-18 | §9 now says "people with a verified IU address, a verified Purdue address, or either", checked when someone joins. The app label "IU students only" becomes "Open to @iu.edu accounts". | Part 4 §9, app copy |
| C-19 | Landing copy fixed. | A-01 |
| C-20 | One version number covers all three documents. | A-37 |
| C-21 | The acceptance screen is rewritten. | A-42 |
| C-22 | Report handling uses aims, plus urgent alert subjects (H29). | A-05 |
| C-23 | Publishing v2 with a new `TERMS_VERSION` replaces the live May 7 page. | P15 |
| C-24 | Fixed in the Privacy Policy rewrite. | A-34 |
| C-25 | Fixed in the Privacy Policy rewrite. | A-34 |
| C-26 | Companion B now lists "Verification status" only. The date is added when H8 ships. | Part 4 companion B |
| C-27 | **The attacker is wrong here.** RSVPs are own-or-organizer only (checked in code). Companion B's officer row was right. Terms §7 was wrong and is fixed, and companion I17's premise is corrected. | A-04 |
| C-28 | Companion C4 drops "the ban gets longer, not shorter" and becomes "The new account is banned too." | Part 4 companion C |
| C-29 | §13 rewritten. We put the new address on the account after the checks and a 7-day notice, then send the reset there. | A-16 |
| C-30 | One timing in §13 and companion E: "We aim to reply within 7 days; a recovery usually takes about two weeks because of the waiting period." | A-16 |
| C-31 | §5 rewritten with exceptions for emergencies, consent and the law. J18 stays: tell the university about a professor being impersonated only with the professor's agreement, or when the law requires. | A-31 |
| C-32 | §11 now uses aims everywhere except the 48-hour legal duty, which stays because the law sets it. §20 is unchanged. | A-05, A-33 |
| C-33 | §2 now says the verify step is a step in the app, not a privacy wall. | A-11 |
| C-34 | Companion G: "Disposable-email domains will be refused at signup once H10 lands." | Part 4 companion G |
| C-35 | A Manage subscription button on the notice (H24), and the §10 wording. | A-41 |
| C-36 | Appeals can come from any address. H27, or P8 until it exists, frees a school email after deletion. | A-13 |

## 2b. The attacker's promises the operator cannot keep (P-01 to P-25)

**The rule used here:** keep a promise only where a named process (P-number) or a cheap code item keeps it. Otherwise soften the words or drop them.

There is one standing time commitment that the law forces on us: the 48-hour removal of intimate images. Every other timing below is an aim.

| # | The promise | Call | How it's kept, or the new words |
|---|---|---|---|
| P-01 | "A person on the Vibe team reads every report ... child exploitation and self-harm first" | **Soften** | "People on the Vibe team review reports; software does not decide them. We aim to review reports within 24 hours, and we look at reports about child safety, intimate images, threats and self-harm before others." Kept by H29 (urgent subjects) and P1 (the rota). See A-05. |
| P-02 | NCII removed within 48 hours, "along with identical copies we find" | **Keep 48 hours; soften the copies** | It is a legal duty, so it stays. P1: one founder on duty each day checks help@ and the admin queue morning and evening, weekends included, with phone alerts on "Intimate image removal" and "URGENT:". P2 is the log. Copies become "reasonable efforts to find and remove identical copies". See A-33. |
| P-03 | CSAM is reported to NCMEC | **Keep** | P3: the public CyberTipline form works today; register as an electronic service provider now. See A-43. |
| P-04 | Copyright notices, counter-notices, "close the accounts of repeat infringers" | **Keep, adjust** | P4: James registers the DMCA agent (task j9, Oct 14), and we keep a repeat-infringer log. New wording: "we close the accounts of repeat infringers in appropriate cases". |
| P-05 | "We move the owner role by hand" | **Keep** | P5: Franky changes it in SQL and logs a `moderation_actions` row. We add an aim: "within 7 days". H1 replaces the SQL later. |
| P-06 | "Freeze" for clubs and for accounts | **Soften to tools that exist** | For clubs, "hide": it exists, and it stops joins, invites, posting as the club, and the owner's delete. For accounts, "pause": a suspension with reason "takeover hold" using the existing restrict tool, plus Franky's sign-out-everywhere in SQL. See A-25 and §13. |
| P-07 | "Refuse, rename, merge, hide or hand over" | **Soften** | "Merge" is dropped. A rename or handle change is Franky's SQL (P5) until H38. See A-06. |
| P-08 | An ownerless club deleted only by us; deleted after 12 months | **Keep with "may"** | SQL until H2 exists. P13, the semester review, finds these clubs. See A-26. |
| P-09 | Verify again within 14 days or lose the badge | **Keep** | It is a right we keep, not a feature. Process: email the person, wait 14 days, set `school_verified = false` in SQL, and log it. §5 is unchanged. |
| P-10 | "We will change [your login email] after the checks" | **Soften** | "We make the change after the checks in Section 13, and we may wait before making it." Kept by P6, by hand until H6: the admin API changes the email, then we update `public.users.email` and the Stripe customer's email, and log it. |
| P-11 | Recovery "up to 14 days"; "Log every decision"; evidence deleted after 90 days | **Soften the timing; keep the log** | "We aim to reply within 7 days." P6 keeps one private recovery log (a spreadsheet). Evidence lives in one private shared folder, purged monthly (P14). |
| P-12 | "We may sign the account out everywhere, reset its password" | **Keep** | Franky deletes the account's `auth.sessions` and `auth.refresh_tokens` rows and sets a random password with the admin API (service role). H5 makes it a button later. See A-15. |
| P-13 | 30 days' notice before a price increase | **Keep** | P12: export the subscribers from Stripe, email them, log the date. No price change is planned. |
| P-14 | No removal mid-period without a refund; the refund exceptions | **Keep** | P10, the refund runbook. It works even after the Stripe customer is deleted, because charges remain. |
| P-15 | Proof of agreement kept 3 years | **Keep if H3 lands before publish; otherwise drop the bullet** | H3, revised, is cheap. See A-49. |
| P-16 | Moderation records kept 3 years | **Keep, reworded** | "3 years after the case closes, then deleted or stripped of names and handles." P14: a review every January, with the first purge due in 2029. A migration can lift the append-only trigger for the purge. |
| P-17 | Quarantine "up to a year" | **Keep** | It can't be broken before Sept 2027. H28 must be live by then (P14). |
| P-18 | A minor's data deleted; "we can end your account ... then run the same file purge" | **Soften** | "Close, and delete except what the law requires us to keep." "We can close your account." Deletion by us is by hand until H34. See A-48 and C-08. |
| P-19 | Appeals: a person replies; a ban is lifted and the school email freed, even after deletion | **Keep** | P1 (the rota), P8 or H27 (free the school email), P10 (the refund). See A-13 and A-45. |
| P-20 | "The new account is banned when found"; duplicates closed "always" | **Soften** | "If we find the new account, we ban it too ... we cannot promise to catch every case." "Always" is dropped. See A-09 and A-11. |
| P-21 | Verification "does not transfer" | **Soften** | Now a right we keep: we may re-check it and remove it. See A-28. |
| P-22 | "Block someone and you disappear from each other" | **Soften** | Honest wording about what a block covers. See A-04. |
| P-23 | A restricted account "can open" only the notice | **Keep with H23 (cheap); otherwise soften** | See A-10. |
| P-24 | "Cancel any time from the Vibe+ page" | **Keep** | H24 before billing turns on, plus the §10 wording. See A-41. |
| P-25 | "We never tell your university" | **Soften** | Exceptions for emergencies, consent and the law. See A-31. |

**New promises this file adds, and what keeps each one:**

| New promise | What keeps it |
|---|---|
| "We aim to reply within 7 days" (club claims, recovery, step 1 handovers) | P1, P5, P6 |
| "We email [the current owner or login address] and wait 7 days" | P5, P6 |
| "We tell the club's other officers and wait 7 days" before deleting a verified club | H25, and P5 by hand |
| "We review clubs with no officers at least once a semester" | P13 |
| "We keep a record of each [intimate-image] request" | P2 |
| "We will cancel and refund an unused renewal from the last 30 days" (can't get in) | P10 |
| "Tell you 30 days before tax applies" | P12 |
| "We free [a minor's school email] once they turn 18" | P8 |

Every one is a single founder action with a written runbook. None needs a tool that doesn't exist.

---

# Part 3: Attacks and claims to reject

These are not real, or much smaller than they look. Franky should not lose sleep over them. Each still got its fix in Part 1 where one was cheap.

1. **A-04: "RSVPs are a map."** False. RSVP rows are readable only by the person who RSVP'd and by the event's organizers (`rsvps_select_own_or_manager`, and the attendee route uses the same check). A stalker sees a count, not a name.
2. **C-27: "the companion is wrong about RSVPs."** It's the other way round. The companion was right, and Terms §7 was wrong.
3. **A-06: "the real society is the one breaking §9."** A misreading. A page made by someone outside the group is impersonation (§8), not "the group's page". The real group can always ask for it back.
4. **A-41: "pay for a year of a service you can't open, or delete everything."** The notice already says "write to the address below and we'll stop it", and the portal route is already allowed for restricted accounts. The gap is a button, not a trap.
5. **A-43: "Apple wants bans to stop re-signups."** Apple's guideline 1.2 asks for reporting, blocking, timely response and contact details. Vibe has all four. The NCMEC part is real (P3); this part isn't.
6. **A-19: "a court can sanction Vibe for not preserving after a lawyer's letter."** Overstated. A private letter to a company that isn't a party to the lawsuit doesn't create a duty on its own; a subpoena or a police request under § 2703(f) does. We add a process to honor both, because it's the right thing to do and it's cheap.
7. **A-22: "a wave of disputes gets the Stripe account restricted."** Overstated at pilot scale. The card networks' monitoring programs start at around 100 disputes a month. Each dispute still costs a fee, so the reminders and the refund path (P10, P11) are worth doing.
8. **A-36: "a Drizly-style order with Franky's name on it."** That order followed a breach of about 2.5 million customers after years of warnings. A 20-account pilot that fixes its own review's findings before inviting students is the opposite story. The risk is real only if the known fixes don't land. That is why H11, H5 and H7 are gates and P17 is today.
9. **A-39: "every retention figure is false today."** No retention promise can be broken before Sept 2027 (quarantine) or 2029 (moderation records), because the data is newer than that. These are calendar items (P14). The one wording fix that matters now is the hash sentence.
10. **A-47: "§16 volunteers a negligence carve-out."** The clause only preserves liability "that cannot legally be limited". The examples are what read badly, and they're deleted. The plaintiff gets what the law gives, no more.
11. **A-49: "no proof anyone agreed."** Overstated. Courts accept proof of a checkbox agreement from how the signup works (no account can exist without the box) plus proof that the person had an account. H3 is still worth building (cheap), because it shows *which* version was accepted.
12. **A-50: "uncapped exposure from the club."** Deciding who controls a page of user content, or hiding it, is the kind of editorial decision Section 230 protects, and a free page gives a group little to claim in damages. The officer-accepts sentence and the one-page agreement are cheap insurance, not an emergency.
13. **A-52: "no class waiver is urgent."** A class waiver without arbitration is weak, and consumer arbitration invites mass-arbitration fees that can cost more than a class action. Plain courts plus a small-claims option is the right call at this size.
14. **A-32: "the university owns the pipe."** Already covered by §3 and §5. Low likelihood.
15. **A-01: "one lawyer can bring all of them" as a class.** Each targeted takeover is its own story, so class treatment is unlikely. The bug is still critical for each student it hits, and H11 is a gate.
16. **A-33: "quarantine keeps the image, so it isn't removed."** The Act requires removal from the platform. A locked evidence store isn't the platform. How long to keep it goes to counsel (J22).
17. **A-24: "Vibe must decide the logo fight."** It's a property question between the group and its designer. Vibe runs the copyright notice process and doesn't pick the owner.
18. **A-38: Indiana's privacy law.** The attacker concedes that it doesn't reach Vibe at this size.
19. **A-02: "keep the messages and the harasser can't erase evidence."** Senders can already delete messages one at a time on Vibe, as on most apps. Evidence protection comes from screenshots and the report snapshot (H21), not from changing what account deletion does.
20. **A-10, in part: "the banned stalker is still watching."** True today, and H23 fixes it cheaply. But the same person can open a new Gmail login and read the same things. Blocking reads is good hygiene, not a wall, and the Terms shouldn't pretend otherwise.
21. **A-05, in part: "the flood buries the one real report."** At about 20 accounts, twenty fresh logins filing 200 reports stand out at once. Once misuse of reporting is a violation (§8), the flooders get restricted.

---

# Part 4: The v3 change list

This is the checklist for assembling v3. It includes:
- every wording change from Parts 1 and 2;
- the brackets to remove, and where each one's content goes;
- the code, process and copy items that the words depend on.

**How to use it.**
- "Replace" means swap the quoted v2 text for the new text exactly.
- "Add" says where the new text goes.
- IDs like **T4.3** are for tracking only. Don't paste them into the Terms.

**Brackets.** Every `[DECISION]`, `[REVIEWER]` and `[CODE]` marker comes out of the published text. The table says where each one's content goes.

| v2 bracket | Goes to |
|---|---|
| Draft box at the top | Delete |
| §1 [DECISION] consent record | Settled by H3, revised (T14.4) |
| §2 [DECISION] 17-year-olds / [REVIEWER] attestation | Companion J1 (already there) |
| §2 [DECISION] RSVP and Vibe+ | Settled by H20 and H18 (T2.2) |
| §2 [DECISION] non-students | Companion I1 (allow; must describe yourself truthfully) |
| §4 [CODE] H6 | Companion H6; §4 reworded (T4.2) |
| §4 [DECISION] handle reservation | Companion I3 and H9; §4 reworded (T4.4) |
| §5 [CODE] H8 | Companion H8; the §5 text stands as a right we keep |
| §5 [DECISION] alumni state | Companion I4 |
| §6 [REVIEWER] trademarks | Companion J9 |
| §6 [CODE] recognized line | Companion F6 |
| §7 [CODE] H19 | Companion H19 |
| §7 DMCA agent address | **Must be filled before publish** (P4, James, task j9). Its [REVIEWER] goes to counsel. |
| §9 [DECISION] club school email | Replaced by T9.5 |
| §9 [CODE] H1 | Companion H1 |
| §9 [DECISION] 12-month figure | Settled by T9.6 (hide at 6 months, delete at 12, per companion I7) |
| §10 [DECISION] no in-app purchase | Companion; the sentence stays |
| §10 [REVIEWER] refunds and auto-renewal | Companion J8 |
| §10 [REVIEWER] no refund on a ban | Settled by T10.6 and T10.8 |
| §11 [REVIEWER] TAKE IT DOWN | Companion J7 and J22 |
| §12 [CODE] H17 | Companion H17, revised |
| §12 [REVIEWER] minors | Settled by T12.10; J1 |
| §13 [CODE] H5 | Companion H5, revised |
| §14 [DECISION] deletion confirmation | Settled by H7 (T14.1) |
| §14 [REVIEWER] moderation retention | Settled by T14.4 |
| §14 [DECISION] consent record | Settled by H3, revised |
| §14 [DECISION] backups | Companion I15 |
| §16 [REVIEWER] | Companion J4 and J19 |
| §17 [REVIEWER] | Companion J4 |
| §18 [REVIEWER] | Companion J28 |
| §20 [DECISION] postal address | Fill with the registered agent's address from the Indiana Secretary of State filing, never a home address (I12) |
| §20 [REVIEWER] Apple EULA | Companion J14 |

## 4a. Terms of Service, section by section

### Intro

**T0.1** (A-35). Replace "Vibe is built and run by its three cofounders; only one of them, Francisco Cazares, can reach the systems that hold your data (Privacy Policy, section 1)." with:
> Vibe is built and run by its three cofounders. All three moderate Vibe: they review reports and can see what was reported, including reported messages, and the records of what we did about it. Only one of them, Francisco Cazares, has direct access to the database and the other systems that store your data (Privacy Policy, section 1).

**T0.2** (A-37). Replace the paragraph that begins "Our Privacy Policy explains what we collect" with:
> Our Privacy Policy explains what we collect and what we do with it. Our Community Guidelines and Child Safety Standards explain what is allowed on Vibe in plain words; where they say something is not allowed, that is a rule under these Terms too. You agree to all of them at the same time you agree to these Terms, and when any of them changes in a way that matters, we ask you to accept again (Section 19).

### §1 How you agree

**T1.1** (keeps the sentence true once H11 adds a confirm-time acceptance). Replace "and whether you accepted at signup or on a later re-acceptance screen" with:
> and which screen you accepted on

**T1.2** Remove the [DECISION] bracket.

### §2 Who can use Vibe

**T2.1** Bullet 1: remove the [DECISION] and [REVIEWER] brackets. The text stays.

**T2.2** (A-03, A-11, C-02, C-33). Replace bullet 2 with:
> - **Anyone 18 or older may create a login with any email address.** A login on its own lets you set up a profile, follow people and clubs, react to and save posts, block, mute and report, and delete your account. It can also see what Vibe shows to signed-in users (Section 7); some screens in the app ask you to verify first, but that is a step in the app, not a privacy wall. It does not let you post, comment, message, join or create clubs, create events, RSVP to events, or buy Vibe+. Those need a **verified school email** (Section 5).

Depends on H20 before publish. H18 before billing turns on; billing is off, so the sentence is true until then.

**T2.3** Bullet 3: remove the [DECISION] bracket. The text stays.

### §3 Words we use

**T3.1** (A-14, A-29). Replace the "Badge" definition with:
> - **Badge**: the mark on a profile that shows the account verified a school email. It reads "@iu.edu verified" or "@purdue.edu verified", and the campus the person chose may appear next to it. It means "verified school email", nothing more. The campus is the person's own choice; we do not check it.

Depends on the badge copy change (app copy AC1).

**T3.2** In "Officer", replace "**Owner**: the one officer role that can promote or demote admins and, once built, transfer the club." with:
> **Owner**: the one officer role that can promote or demote admins and delete a club we have not verified.

**T3.3** Replace the "Verified club" definition with:
> - **Verified club**: a club we have marked as a real campus organization after the checks in Section 9. It is not a university endorsement, and it can be removed.

### §4 Your account

**T4.1** (A-11). In "One person, one account", replace from "We do not currently stop someone" to the end of the paragraph with:
> We do not currently stop someone from opening a second login with a different email, but each school email can verify only one account. We may close duplicate accounts we find, especially ones used to get around a block, a restriction or a limit.

**T4.2** (P-10, A-16). Replace the "Changing your login email" paragraph and its [CODE] bracket with:
> **Changing your login email.** There is no way to change your login email inside Vibe today. To change it, email help@connectvibe.app from your current login email; if you have lost access to it, follow Section 13. We make the change after the checks in Section 13, and we may wait before making it. Do not try to change it any other way: a change we did not make may be reversed and treated as a takeover.

**T4.3** (A-01, A-08). Replace the "Keep your account safe" paragraph with:
> **Keep your account safe.** Passwords must be at least 8 characters. Choose one you do not use anywhere else. You are responsible for what happens under your account, including anything done by someone you let in or someone who used a password you also use elsewhere, until you tell us at help@connectvibe.app that someone else has access. That does not apply if someone got in because of a flaw on our side. Lock your phone and computer: anyone holding a device where you are signed in can act as you. We do not offer two-factor authentication today, and we say so plainly so you can decide what to keep on Vibe.

**T4.4** (A-18). In "Handles", replace "If you delete your account, your old handle becomes available to others." and the [DECISION] bracket with:
> If you delete your account, your old handle may become available to others, either at once or after a waiting period we set.

### §5 What "verified" means

**T5.1** Remove the [CODE] bracket after the list of rights we keep. The text stays; P-09's process keeps it.

**T5.2** In "When you graduate", remove the [DECISION] bracket.

**T5.3** (A-31). Replace the "We never tell your university" paragraph with:
> **We don't report you to your university.** We do not send universities your information as a matter of course, and they do not send us anything about you. We share information with a university only: when someone's life or safety is at risk and we contact campus police or other emergency services; when you ask us to; or when the law requires it (the Privacy Policy explains legal requests). If a university asks us to act on an account, we treat it like any other report (Section 11).

### §6 Vibe and the universities

**T6.1** (A-29). At the end of bullet 1 (and after removing the [REVIEWER] bracket), add:
> A badge reads "@iu.edu verified" or "@purdue.edu verified" because that is the address the person confirmed with us; the university does not verify anyone on Vibe.

**T6.2** Bullet 3: remove the [CODE] bracket.

### §7 Your content

**T7.1** (A-54). In "The permission we need", replace "We do not use Your Content for advertising, to train AI models, or to sell or license to anyone else." with:
> We do not use Your Content to train AI models, and we do not sell or license it to anyone else. We do not use your name, photo or content in advertising, marketing or app-store screenshots without asking you first.

**T7.2** (A-24, C-05). Replace the "What a club keeps" paragraph and its [CODE] bracket with:
> **What a club keeps.** When you post, upload or write something *as a club* (a club post, a club event, a club's logo or banner, a message in a club chat), you give the club's current and future officers, and us, a license to keep showing and using it on the club's page and in its chats for as long as the page exists. That license cannot be taken back, and it does not end when you leave the club or delete your account. You cannot take a club's content with you when you stop being an officer, and a club cannot claim your personal posts. If you made something for a club and believe you still own it, that is between you and the group; a copyright notice (below) is how to raise it with us. One thing to know today: if you delete your account, the posts and events you created as the club are deleted with it (Section 14), so before you leave, ask another officer to repost anything the club needs to keep.

**T7.3** (A-04, C-03, C-27). Replace the "Who can see it" paragraph with:
> **Who can see it.** The Privacy Policy has the full picture. The short version: almost your whole profile, every club page with its recent posts and who posted them, and post link previews are reachable by anyone on the internet without an account; published posts, comments and events are visible to everyone signed in to Vibe at every campus; how many people are going to an event is shown to everyone, but who is going is shown only to you and to the event's organizers (the person who created it or, for a club event, the club's owner and admins); messages are visible to the people in that conversation; your résumé opens only for signed-in users with a verified school email whom you have not blocked, unless you hide it, through short-lived links, with your redactions burned in. Assume that anything on Vibe can be screenshotted.

**T7.4** (A-38). Add a new paragraph after T7.3:
> **Views.** When you are signed in and open someone's profile or post, we record that you viewed it. The person you viewed sees how many people looked; with Vibe+ they also see who. If either of you has blocked the other, your name does not appear on their list. Views while you are signed out are not recorded.

If private viewing (I20, H36) ships, add: "You can turn on private viewing in Settings; while it is on, your views are counted without your name, and you cannot see names either."

**T7.5** (P-04). In "Copyright", replace "We remove infringing content and close the accounts of repeat infringers." with:
> We remove content that a valid notice shows is infringing, and we close the accounts of repeat infringers in appropriate cases.

Fill in the DMCA agent address (P4) before publish.

### §8 What you may not do

**T8.1** In "Get around a restriction", replace "Any account used for this is closed and the ban extends to it." with:
> We close any account we find being used for this, and the ban extends to it.

**T8.2** (A-04). New bullet after "Get around a restriction":
> - **Get around a block**: using another account, signing out, or someone else's account to see, follow or contact a person who blocked you.

**T8.3** (A-05). New bullet after "Spam or automate":
> - **Misuse reporting**: filing reports you know are false, or flooding the report button to bury real reports or to target someone.

### §9 Clubs

**T9.1** (A-50). In "What a club is on Vibe", replace "The student organization behind the page, if there is one, is not a party to these Terms; the people who run the page are." with:
> The student organization behind the page, if there is one, is not a party to these Terms on its own. When you create a club page or accept an officer role, you agree to these Terms for yourself and, if you have the authority, on behalf of the group, for everything to do with its page on Vibe.

**T9.2** (A-06). In "Creating a club", replace the last sentence ("We may refuse, rename, merge, hide or hand over ... impersonation (Section 8).") with:
> If a page was made by someone who does not speak for the group, the group's real officers can ask us to hand it over, rename it, or take it down (see "Passing a club down"). We may refuse, rename, hide, hand over or remove a club page that breaks these promises, and a page created for a group you have nothing to do with is impersonation (Section 8).

**T9.3** (A-21). At the end of "Officers and roles", add:
> Roles on a club page are meant to follow who actually runs the group. When a group shows us, with the evidence in "Passing a club down", that someone no longer holds office, we may remove their role, including the owner role, even if they object.

**T9.4** (A-28, A-30). Replace the "Verified clubs" paragraph with these two paragraphs:
> **Verified clubs.** We mark a club as verified after we have checked that it is a real campus organization and that the officers on Vibe speak for it (the checks are listed below). Only verified clubs can create events and send invites. Verification is not a university endorsement (Section 6). It is about the page and the people we checked: if the people running the page change, we may check again, and we may remove verified status at any time.
>
> Before we verify a club we check that: the group is listed as active on the university's student-organization site, or we have other good evidence it exists; at least two of its officers have Vibe accounts; one of us has met an officer in person or on a call; and, as far as we know, the university has not suspended or banned the group. We remove verified status from a club when we learn the university has suspended or banned it. A founder does not verify a club they belong to on their own.

**T9.5** Replace "The club's school email" paragraph (the [DECISION] block) with:
> **The club's school email.** We may ask a verified club for an email address the group itself controls, so that the page does not depend on one officer's account, and we may use it to confirm who runs the group.

**T9.6** (A-21, A-25, A-26, A-27). Replace the numbered list under "Passing a club down" with:
> 1. **Before you go**, the owner should pick the next owner. Today the owner cannot hand over the owner role, or leave the club, inside Vibe: the owner promotes the successor to admin and emails help@connectvibe.app, and we move the owner role by hand. We aim to do it within 7 days.
> 2. **If the owner is gone or won't hand over** (deleted their account, lost access, left, or refuses after the group chose someone else), an officer or a person who can show they now run the group may ask us at help@connectvibe.app to appoint a new owner. We need at least two of: a message from the club's own school email; the group's current officer listing on the university's organization site; a message from another current officer on Vibe; or a call with us. If the current owner still has an account, we email them and wait 7 days for an answer before we move the role, unless they broke these Terms or the page is at risk; we may hide the page while we wait. We aim to reply within 7 days. We decide; we may say no; and we may leave the page with no owner while we look.
> 3. **If two people both claim a club**, we may hide the page until we decide. While a page is hidden, nobody can delete it, post as the club, invite people or add members; its members keep their chats. We decide on the evidence above, not on who asked first, and we tell both sides. Our decision on who holds a Vibe role is about the page on Vibe only; it says nothing about who holds office in the real group.
> 4. **A club with no officers left** may be hidden after 6 months and deleted after 12, or handed sooner to a person who shows they now run the group. We review clubs with no officers at least once a semester.
> 5. **An outgoing officer** keeps the personal posts they made as themselves and loses their role. Content posted as the club stays on the club's page while that officer's account exists; if the officer deletes their account, the club posts and events they created are deleted with it today (Section 7), so hand them to another officer first.

**T9.7** (C-18). In "Joining and following", replace "and whether IU students, Purdue students or both can join, which we check against the university of your verified school email" with:
> and whether people with a verified IU address, a verified Purdue address, or either can join. We check this when someone joins, not afterwards

**T9.8** (A-20). In "Deleting a club", replace the first two sentences ("Only the owner can delete a club. Deleting it deletes ... kept as evidence.") with:
> **Deleting a club.** The owner of a club we have not verified can delete it from the club's settings. A verified club can be deleted only by us, when its owner asks at help@connectvibe.app: we tell the club's other officers and wait 7 days before deleting it. Deleting a club deletes its posts, events, chats, invites, and member and follower lists; content our moderators removed is kept as evidence.

The rest of the paragraph stays. Depends on H25.

**T9.9** (C-06). In "Club chats", replace "We can read chats when a report or the law requires (Privacy Policy, section 5)." with:
> We read chats only as Section 11 says.

### §10 Vibe+

**T10.1** (A-40). Replace "What it is" with:
> **What it is.** Vibe+ lets you see the names of the people who viewed your profile and your posts (everyone sees the counts for free). We are building more profile customization for Vibe+, and we will not charge for anything before it exists. What is in Vibe+ may change; we will not remove something you paid for in the middle of a paid period without refunding the rest of that period.

**T10.2** (A-03, A-44). Replace "Price and renewal" with:
> **Price and renewal.** You need a verified school email to buy Vibe+. Vibe+ costs **$3.99 a month** or **$24.99 a year** (U.S. dollars), plus sales tax where the law requires it. If we start charging tax on your subscription, we will tell you at least 30 days before it applies to a renewal. **It renews automatically** at the end of each period, at the then-current price, until you cancel. We tell you the renewal terms under the button before you subscribe, and we will tell you by email at least 30 days before a price increase, which applies from your next renewal; you can cancel before then.

**T10.3** In "Payment", remove the [DECISION] bracket. The text stays.

**T10.4** (A-22, A-41). Replace "Cancelling" with:
> **Cancelling.** Cancel any time from the Vibe+ page ("Manage subscription", which opens Stripe's portal); if your account is suspended, the same button is on the notice you see instead. Cancelling stops the next charge; you keep Vibe+ until the end of the period you already paid for. Deleting your account cancels Vibe+ immediately. We send renewal reminders, receipts and notices about Vibe+ to your login email. Keep it one you will still read after you leave school (Section 4).

**T10.5** (A-22). New paragraph after "Cancelling":
> **If you can't get into your account.** If you are the person being charged but can't get into your account, email help@connectvibe.app with the date and amount of the charge and the last four digits of the card. We will cancel the subscription, and if the charge was a renewal in the last 30 days that you did not use, we will refund it.

**T10.6** (A-45). Replace "Refunds" and its [REVIEWER] bracket with:
> **Refunds.** Vibe+ is a monthly or yearly digital service; **we do not refund partial periods** except where the law requires it, where we removed a paid feature mid-period, where we charged you in error, where we restricted your account by mistake and lifted it on appeal, or where we choose to. If your bank reverses a charge, we may end Vibe+ and may refuse future subscriptions.

**T10.7** "Failed payments": no change.

**T10.8** (A-41). Replace "Restrictions and Vibe+" and its [REVIEWER] bracket with:
> **Restrictions and Vibe+.** A suspension leaves Vibe+ running and does not extend the paid period; you can cancel from the notice at any time. A ban ends Vibe+ at once with no refund, unless the ban is lifted on appeal (Section 12).

**T10.9** (A-46). At the end of "Free Vibe+", add:
> If we give you Vibe+ or anything else for helping promote Vibe, you must say so whenever you post about Vibe (for example, "I get Vibe+ free for helping out").

### §11 Reporting, blocking, muting, and takedowns

**T11.1** (A-17). New first bullet:
> - **Not on Vibe?** You do not need an account to report impersonation, threats, harassment, your private information being posted, intimate images, or anything involving a child. Email **help@connectvibe.app** with a link or the handle and what is wrong.

**T11.2** (A-04). Replace the Block and Mute bullet with:
> - **Block** someone and, inside Vibe, they can no longer see your posts, comments or profile, message you, open your résumé, or see your name among the people who viewed their profile; and you stop seeing theirs. A block cannot reach people who are signed out: your public profile card and any club posts you made can still be seen by anyone on the internet (Section 7). **Mute** someone and their content disappears from your feeds without telling them.

**T11.3** (A-02). New bullet after T11.2:
> - **Keep evidence.** If someone threatens or harasses you, take screenshots first, then report. The sender can delete their messages, or their whole account, and when they do, the messages leave your chat too. Reporting saves a copy of what you reported for us.

**T11.4** (A-05, A-47, C-06, C-22). Replace the "What we do with reports" bullet with:
> - **What we do with reports.** People on the Vibe team review reports; software does not decide them. We aim to review reports within 24 hours, and we look at reports about child safety, intimate images, threats and self-harm before others. That is an aim, not a promise of a particular time or outcome. We keep a snapshot of what was reported so that later edits or deletions do not hide it. We read private messages only when one is reported to us, when we have specific evidence that a conversation is being used for spam, threats, exploitation or another serious breach of these Terms, or when the law requires it.

**T11.5** (A-33). In the intimate-images bullet, replace "**We remove it within 48 hours of a valid request**, along with identical copies we find." with:
> **We remove it within 48 hours of a valid request**, and we make reasonable efforts to find and remove identical copies on Vibe. We keep a record of each request and what we did.

Remove the [REVIEWER] bracket. Depends on P1, P2 and H29.

### §12 Enforcement, suspensions, bans, and appeals

**T12.1** (A-37). At the end of the first paragraph, add:
> We may also remove content or limit an account when we believe in good faith that it puts someone at risk or exposes Vibe or its users to legal harm, even if no rule names that exact thing.

**T12.2** (A-10). Replace "What a suspension is" with (needs H23):
> **What a suspension is.** For a set number of days (1 to 365), your account can open only a notice saying what happened, why, and when it ends, and the legal pages. It cannot post, comment, message, react, follow, RSVP or change anything else, and it cannot read the feed, profiles or events. Your profile, posts and comments are hidden from other people; nothing is deleted; Vibe+ keeps running. You can still sign out, cancel Vibe+, and delete your account.

If H23 misses the date, use this instead:
> **What a suspension is.** For a set number of days (1 to 365), the app shows your account only a notice saying what happened, why, and when it ends, and the legal pages, and your account cannot post, comment, message, react, follow, RSVP or change anything else. Your profile, posts and comments are hidden from other people; nothing is deleted; Vibe+ keeps running. You can still sign out, cancel Vibe+, and delete your account.

"Cancel Vibe+" needs H24 before billing turns on.

**T12.3** (A-39, A-45). Replace "What a ban is" with:
> **What a ban is.** The same, for good. And: the **school email verified on the account can't be verified on another Vibe account while the ban lasts**. We keep a one-way scrambled record of that address (a keyed hash: without a secret key that only our servers hold, it cannot be turned back into the address) for exactly this purpose, and it survives your deleting the account. A ban ends Vibe+ with no refund, unless the ban is lifted on appeal. A ban does not stop you signing in, so that you can read the notice, appeal, and delete your account and data.

**T12.4** (A-09, A-11). Replace the paragraph that begins "A ban is tied to the school email", and its [CODE] bracket, with:
> A ban is tied to the school email, not to the person. We do not have a way today to stop a banned person from creating a new login with a different email, and a different school address can be verified on a new account. Doing that is ban evasion (below). We keep a scrambled record of the banned account's login email as evidence, and we may use it to spot a returning account. A ban on an account that never verified a school email is tied only to its login email, which is easy to replace. What limits such a person is that posting, commenting, messaging, clubs, events, RSVPs and Vibe+ all need a verified school email.

**T12.5** (A-15). New paragraph after T12.4:
> **If your account was taken over.** If someone else got into your account and did what got it restricted, tell us. Once you show us the account is yours (Section 13), we lift the restriction, free your school email, and treat the account as yours again. There is no time limit on this.

**T12.6** "We tell you": no change.

**T12.7** (A-09, A-47). Replace "Ban evasion" with:
> **Ban evasion.** Coming back after a ban, by any route, is itself a violation. If we find the new account, we ban it too and add any school email on it to the record, and we may close accounts that helped. We look for it when someone reports it and when we see the signs ourselves; we cannot promise to catch every case.

**T12.8** (A-13, A-15, A-45). Replace "Appeals" with:
> **Appeals.** Email **help@connectvibe.app** within 30 days, with your handle and what we missed. Write from the login email on the account if you still can; if you can't, or you already deleted the account, tell us the school email that was on it and we will check that it is you (Section 13). A person reads your appeal and replies. If we made a mistake, we undo it: a suspension is lifted; a ban is lifted and the school email freed; and if the ban ended a paid Vibe+ period, we refund the unused part (Section 10). If you deleted the account before the appeal succeeded, we cannot restore the data (Section 14), but the school email is freed so you can start again. If someone else took over your account and did what got it restricted, there is no time limit (see "If your account was taken over").

**T12.9** (A-23). Replace "Clubs" with:
> **Clubs.** The same tools apply to clubs: a post or event can be removed, the club can be hidden, the officers involved can be restricted, and we can remove any officer's role, including the owner's, and appoint another officer as owner.

**T12.10** (A-48, C-09). Replace "Accounts of people under 18" and its [REVIEWER] bracket with:
> **Accounts of people under 18.** If we learn an account belongs to someone under 18, we close it and take its content down. We then delete its data, except what the law requires us to keep: for example, material we must report to the National Center for Missing & Exploited Children and preserve, which we keep only as long as the law requires. A school email on a closed minor's account is not banned for good: once the person turns 18, they can write to help@connectvibe.app and we will free it.

### §13 Recovering an account

**T13.1** (A-16, C-29, C-30). Replace the paragraph "If you cannot get into your login email" with:
> **If you cannot get into your login email** (closed by a university after graduation, lost, hacked, or a shared address someone else now controls), email **help@connectvibe.app** from any address and tell us your handle. We then need at least one strong proof that the account is yours:
> - a reply from the school email verified on the account;
> - a change we describe, made from a device where you are still signed in; or
> - a short video call in which your face matches photos that were on the profile before you wrote to us.
>
> Details only the account holder would know, or a photo of a student ID with the number covered, can support a request but are never enough on their own. Before we change anything, we email the account's current login email and wait 7 days; if the real owner answers, we stop. Then we put your new address on the account and send the password reset there. We aim to reply within 7 days, and a recovery usually takes about two weeks because of the waiting period. We may refuse if we are not satisfied, and we will tell you what would satisfy us.

This removes "We never restore access on the strength of an email alone, and we never send a reset link to an address that is not on the account." The strong-proof rule replaces it.

**T13.2** (P-06, P-12). Replace "If someone else is in your account" and its [CODE] bracket with (needs the H5 piece before publish):
> **If someone else is in your account**, tell us at once. We may sign the account out on every device, reset its password, and pause the account (nobody can post or change anything on it, and its profile is hidden) until we have checked with you. Signing out from any device signs you out everywhere within about an hour. Changing your password signs out your other devices.

If the H5 piece misses the date, the last sentence reads: "Changing your password does not by itself sign out other devices today, so sign out right after you change it."

**T13.3** (P-06). In "If two people ask for the same account", replace "we freeze it (nothing can be changed, and we may hide it)" with:
> we pause it (nobody can post or change anything on it, and its profile is hidden)

**T13.4** No other changes to §13.

### §14 Ending your account

**T14.1** (A-08). Replace the first paragraph and its [DECISION] bracket with (needs H7):
> **You can leave any time.** Settings → Danger zone, enter your password to confirm, and your account is deleted at once. No grace period, no undo. Vibe+ is cancelled first, with no refund for the rest of the period.

If H7 misses the date, keep "type your handle to confirm".

**T14.2** (C-07). In "What we delete", replace "If removing your files fails part-way, nothing is deleted and you can retry; we never delete the account and leave your files behind." with:
> If removing your files fails part-way, we stop and your account is not deleted, so you can try again; Vibe+ has already been cancelled by then, and files already removed stay removed. We do not delete the account until the files we can find are gone.

**T14.3** "What stays, with your name removed": no change.

**T14.4** (A-02, A-12, A-19, A-39, A-48, A-49). Replace the whole "What stays because it must" list with:
> **What stays because it must:**
>
> - **The restriction record**, if your account was suspended or banned: the dates, the reason, and scrambled copies of the school email (and, for a ban, the login email) on it. A ban record is kept for as long as the ban lasts; a suspension record is kept for 3 years after it ends. Nothing else from the account.
> - **Moderation records**: what we removed and why, and the snapshot attached to a report about you, kept as evidence for 3 years after the case closes, then deleted or stripped of names and handles.
> - **Reports about you.** If there are open reports about your account when you delete it, we may keep a scrambled copy of the school email on it with those reports, so a moderator can still act on them.
> - **Proof that you agreed**: the Terms versions you accepted and when, with a scrambled copy of your login and school emails so we can match it to you if there is ever a dispute, kept for 3 years after you delete your account.
> - **Payment records** at Stripe and in our billing table: invoices, charges, refunds and disputes, kept as tax and accounting law requires (generally 7 years). Your card details were never with us.
> - **Short-lived operational logs** at our providers (email delivery, hosting requests, sign-in audit) that expire on their own schedules (Privacy Policy, section 9).
> - **Copies other people made**, and things other people posted about you or in reply to you, which are theirs.
> - **Media our moderators removed, or that was reported**, kept in a locked area as evidence for up to a year.
> - **Material the law requires us to keep**, such as reports we make to the National Center for Missing & Exploited Children and the content they are about, for as long as the law requires.
> - **Copies we must preserve.** If the law requires it, or we receive a valid legal request to preserve an account, we may save a copy of the account before it is deleted and keep it as long as the law or the request requires. We cannot preserve what was deleted before the request reached us.
> - **Files that deletion cannot find**: media attached to messages you had already deleted one by one, and media uploaded into a club's own storage (Privacy Policy, section 8).

Depends on H3 (revised) and H30 before publish. H22 and H28 can follow, because the wording keeps them as rights ("may") or as limits ("up to").

**T14.5** In "Backups", remove the [DECISION] bracket. The text stays.

**T14.6** (C-08). Replace the paragraph "We can end your account too" with:
> **We can close your account too** (Section 12). If we delete an account ourselves, we remove its files and records the same way as above, except what this section says we must keep, and we tell you at the login email first unless the law or someone's safety says otherwise.

**T14.7** "What outlives this agreement": no change.

### §15 "As is"

**T15.1** Replace "a verified club means only that we believed it was a real campus group (Section 9)" with:
> a verified club means only that it passed our checks when we made them (Section 9)

### §16 Limits on our liability

**T16.1** (A-47). Replace the last paragraph and its [REVIEWER] bracket with:
> Some places do not allow some of these limits; there, they apply only as far as the law allows. Nothing in these Terms limits liability that the law does not allow us to limit.

### §17 Your responsibility for claims against us

**T17.1** (A-53). Replace the whole paragraph and its [REVIEWER] bracket with:
> If someone brings a claim against us because of something you did knowingly or recklessly (content you posted, a breach of these Terms or the law, or a violation of someone else's rights), you will cover our reasonable costs of dealing with it, including reasonable lawyers' fees, and any amount we have to pay because of it. We choose our lawyers and run our own defense; you agree to help where you reasonably can. We will not settle a claim in a way that admits fault on your behalf without your agreement.

### §18 Governing law

**T18.1** (A-52). After "...and you agree that those courts can hear the case.", add:
> Either of us may instead bring a claim in small-claims court in the county where you live, if the claim qualifies there.

Remove the [REVIEWER] bracket.

### §19 Changes to these Terms

**T19.1** (A-37). Replace "The version of these Terms is the dated string at the top. When we change these Terms in a way that matters, we publish a new version with a new date and ask every user to accept it the next time they open Vibe (Section 1)." with:
> The version of these Terms is the dated string at the top. It also covers our Privacy Policy, Community Guidelines and Child Safety Standards: when we change any of them in a way that matters, we publish a new version with a new date and ask every user to accept it the next time they open Vibe (Section 1).

The rest of §19 stays.

### §20 Other terms

**T20.1** Replace "**Notices to you** go to your login email or appear in the app." with:
> **Notices to you** go to your login email or appear in the app, so keep your login email current.

**T20.2** Legal notices: fill in the registered agent's address from the Indiana Secretary of State filing, once the Oct 3 amendment lands (I12). Never a home address. Remove the [DECISION] bracket.

**T20.3** App stores: remove the [REVIEWER] bracket (it goes to J14). The text stays.

### §21 Contact

No change.

## 4b. Companion changes (`03-companion.md`)

### B. Privacy Policy provisions

- **B1** (C-26). Row "Verification status and date": rename it "Verification status". Add: "The date is added when H8 ships."
- **B2** (A-12). Row "The same kind of scrambled copy of the login email on a restricted account": change "restricted" to "banned". It reads "(H30 limits it to bans)".
- **B3** (A-49). New row:

  | What | Why |
  |---|---|
  | Consent record: Terms versions accepted and when, plus keyed hashes of the login and school emails (H3, revised) | To prove, if there is ever a dispute, who agreed to which version. Kept 3 years after deletion. |

- **B4** (A-02). New row:

  | What | Why |
  |---|---|
  | A keyed hash of the school email of an account deleted while reports about it were open (H22) | So a moderator can still act on those reports. Kept with the reports. |

- **B5** (A-38). New row:

  | What | Why |
  |---|---|
  | Profile and post views: who viewed what, and when | Counts are shown to the person viewed; names are shown with Vibe+. Blocks in either direction hide the name. Views made while signed out are not recorded. |

- **B6** (A-39). Row "Recovery evidence": add "Kept in one private shared folder, never a personal inbox. Purged monthly (P14)."
- **B7** (A-34). In §3d, add the full provider list:
  - Supabase;
  - Vercel;
  - Cloudflare R2;
  - Resend;
  - Stripe;
  - Sentry;
  - Firebase Cloud Messaging (once push is on);
  - Google Fonts (until H37);
  - Cloudflare cdnjs;
  - Cloudflare Email Routing (forwards our inbox to Gmail).

  Remove the CSRF-cookie, analytics and multi-factor claims from the live policy.
- **B8** (C-27). In the §5 officer row, "who RSVP'd to the club's events" is correct; add "(only for the club's own events)". Add a note: "Nobody else sees who RSVP'd; everyone sees counts."
- **B9** (A-35). Replace the §5 "us" row with:
  > Platform admins (the three cofounders) can see reports and their snapshots, removed content, restriction records and notes, and hidden clubs, and can look an account up by its exact email address (the address itself is not shown to them). Only Franky can reach the database directly, which is where login and school emails are stored. The founders read what arrives at hello@, help@ and vibe.llc@.
- **B10** (A-19, A-39, A-48). In the §8/§9d list of what survives deletion, add:
  - the consent record with its hashes;
  - the deleted-while-reported school hash;
  - preservation copies (legal holds);
  - material kept for NCMEC.

  Change moderation records to "3 years after the case closes, then deleted or stripped of names and handles".
- **B11** (C-26, C-27). In the "eight kinds" table:
  - "Made by verification": "university (IU/Purdue), badge". Drop "verification date" until H8.
  - "Signed-in users only": replace "events, RSVPs, follow lists" with "events, RSVP counts, follow lists".
  - New row: "Who RSVP'd: you and the event's organizers".
  - "Kept after deletion": add "consent hashes, preservation copies, NCMEC material".

### C. Community Guidelines provisions

- **C-a** (C-28). C4 becomes: "If we banned you, don't come back with another email, another school address, a friend's account or a club page. The new account is banned too."
- **C-b** (A-13). C6 becomes: "…appeals go to help@ within 30 days, from the login email if you still have it, or from any address with the school email that was on the account. No time limit if the account was taken over."
- **C-c** (A-17). New C8: "Not on Vibe? You can report impersonation, threats, harassment, your private information, intimate images or anything involving a child by email to help@, no account needed."
- **C-d** (A-02). New C9: "Screenshot first, then report. If the sender deletes their messages or their account, the messages leave your chat too."
- **C-e** (A-05). New C10: "Don't misuse reporting: no false reports, no flooding."
- **C-f** (A-04). New C11: "Don't get around a block with another account or by signing out."
- **C-g** (A-33, A-47). On the live page:
  - "along with any identical copies of it we find on Vibe" becomes "and we make reasonable efforts to find and remove identical copies on Vibe";
  - "where a person reads it" becomes "where a person on the team reviews it".

### D. Organization-account provisions

- **D1** (A-20). Table row "Delete the club": "Owner may delete an unverified club. A verified club: only us, on the owner's request, after 7 days' notice to the other officers (H25)." Gap: "H2 for our side".
- **D2** (A-25). Table row "Claim an existing page": "Two of four kinds of evidence; 7-day notice to a current owner who still has an account; hide the page meanwhile." Gap: "H1 admin-appoint".
- **D3** (A-25). Table row "Dispute between officers": "Hide the page. It exists today: it stops joins, invites, posting as the club, and the owner's delete. Decide on evidence and tell both sides." Gap: "H4 is now optional".
- **D4** (A-22). Stress test, subscription bullet: add "P11 (renewal reminders), and the 'can't get into your account' cancel-and-refund path (Terms §10)".
- **D5** (A-26). The 12-month figure: "hide after 6 months, delete after 12" (I7). Reviewed each semester (P13).

### E. Account recovery rules (replace the tiers)

- **E1** (A-16). Replace "Tiers of evidence" with:
  > **At least one strong proof:** a reply from the school email verified on the account; a change we describe, made from a device still signed in to the account; or a video call in which the face matches photos on the profile from before the request (a founder who knows the person socially does not run the call alone).
  >
  > **Supporting only, never enough on their own:** account details (join month, clubs, recent chats, Vibe+ status); a student ID photo with the number covered.
  >
  > **Club transfers:** two of four (club school email, university org listing, another current officer, a call).
- **E2** (A-16). Replace "Rules" with:
  - Never act on one email alone.
  - Before any change, email the current login address and wait 7 days.
  - Then put the new address on the account (admin API, `public.users.email`, Stripe customer email) and send the reset there.
  - Sign the account out everywhere.
  - Log it in the recovery sheet: who asked, what evidence, the decision, who decided, and who ran it.
  - Aim to reply within 7 days.
  - Refuse in writing and say what would satisfy us.
  - At any sign of takeover, pause first.
  - With two claimants, pause, decide on evidence, and tell both.
  - Keep the evidence in the shared folder; delete it 90 days after close.
- **E3** (A-16). "Which cofounder": unchanged, plus "the person who ran the database change is logged".

### F. Verification UX

- **F-a** (A-14). F4 tooltip: "This account confirmed an @iu.edu address. That doesn't confirm enrollment or identity, and the campus is the person's own choice." Date optional, once H8 exists.
- **F-b** (A-14, A-29). Badge text becomes "@iu.edu verified" / "@purdue.edu verified", with the campus beside it (I26). This replaces F8's "the campus label or 'IU verified'".
- **F-c.** Add to F8 all the app-copy lines in 4c below.

### G. Personal-email account rules

- **G1** (C-02). Replace "It cannot post, comment, message, join or create clubs, RSVP or create events." with: "It cannot post, comment, message, join or create clubs, create events, RSVP (H20) or buy Vibe+ (H18)."
- **G2** (C-34). Replace "Disposable-email domains are refused at signup (H10)" with: "Disposable-email domains will be refused at signup once H10 lands."
- **G3** (C-03). In the browse bullet, remove "resumes" from the things to hide. Résumés already open only to verified viewers.

### H. Engineering: revised items

- **H3, revised** (A-49). On deletion, write to a service-role-only table:
  - the user id;
  - every accepted Terms version, with its time and source;
  - the deletion time;
  - HMAC hashes of the canonical login email and school email, under a separate `consent-v1|` domain.

  Prune after 3 years. **Cheap. Before publish.**
- **H5, revised** (A-01, A-15, A-36). Three pieces:
  - (a) After any password change, call `signOut({ scope: "others" })`. **Cheap. Before publish.**
  - (b) An admin "sign out everywhere" button. It deletes the user's `auth.sessions` and `auth.refresh_tokens` rows with the service role; Franky does the same in SQL until it exists. Can follow publish.
  - (c) A session-length cap. It needs Supabase Pro or an app-side check. Medium, later.
- **H11, revised** (A-01). Every confirmation (by link or by code) ends on a required "Set your password" step. It also asks for the Terms checkbox again (`terms_acceptances` source `confirm`), then signs out other sessions. Cleaning up unconfirmed rows after 24 hours is optional, later. **Medium. Before the first student invite.**
- **H17, revised** (A-12). Test the login-email ban key at school-email verification (cheap). Test it at signup through a Supabase auth hook (medium). Only after H30. Describe it as "raises the cost of coming back; does not close ban evasion".

### H. Engineering: new items

| # | Build | Why | Size | When |
|---|---|---|---|---|
| H21 | Reporting a message saves the last 50 messages between the reporter and the reported person in that conversation (both directions) into the report snapshot | A-02, A-19 | M (half a day) | Before launch, Oct 31 |
| H22 | When an account with open or actioned reports deletes itself, store a keyed hash of its canonical school email with those reports. At school-email verification, a match is let through but flagged on the admin desk and emailed to the admins | A-02 | M | Can follow |
| H23 | For restricted accounts, the proxy refuses GET on `/api/*` except the account's own data, `/api/billing/portal`, and what `/account/suspended` needs | A-10, P-23 | S | Before publish |
| H24 | "Manage subscription" button on `/account/suspended` (the portal POST is already allowed) | A-41, P-24 | S | Before billing |
| H25 | The owner of a verified club can't delete it in the app ("To delete a verified club, email help@connectvibe.app"). We delete after 7 days' notice to the other officers (H2 or SQL) | A-20 | S | Before publish |
| H26 | When a verified club's owner changes or goes empty, flag it on the admin desk for a re-check; keeping verified status needs a logged reason | A-28 | M | Can follow |
| H27 | Admin action "free a school email": type the address, the server computes the canonical key with the pepper, lifts matching open restriction rows, and logs it | A-13, A-48 | S | Can follow (P8 covers it) |
| H28 | Quarantine retention job: a scheduled job deletes quarantine files older than 12 months unless they carry a `held_until` marker (NCMEC report, legal hold) | A-39, A-48 | M | Before Sept 2027 |
| H29 | Urgent alerts: reports with reason `child_safety`, `intimate_image` or `self_harm` get the subject "URGENT: [reason] report on Vibe" and skip the 60-minute throttle | A-05, A-33 | S | Before publish |
| H30 | Canonical login-email ban key (lowercase, strip `+tag`, strip dots for gmail.com and googlemail.com), written only for bans | A-12 | S | Before publish |
| H31 | Checkout confirmation email on `checkout.session.completed`: price, renewal date, auto-renewal terms, how to cancel | A-44 | S | Before billing |
| H32 | Rate-limit anonymous reads of `/api/users/<h>/bootstrap` and public club pages by network (for example 60 a minute) | A-07 | S | Recommended before publish |
| H33 | Admin "legal hold" flag: pauses self-deletion and message deletes while a hold is in place; logged | A-19 | M | Can follow (P9 covers it) |
| H34 | Admin account deletion that runs the same purge as `DELETE /api/me` but keeps held evidence | A-48, C-08 | M | Can follow |
| H35 | The delete-account dialog warns officers: "You created N club posts and M club events. They'll be deleted with your account." | A-27 | S | Recommended before publish |
| H36 | Private viewing (if I20 is approved) | A-38 | M | Before billing |
| H37 | Serve fonts ourselves (Next's font loader) instead of from Google Fonts | A-34 | S | Can follow |
| H38 | A duplicate-name warning at club creation, plus an admin action to rename a club and change its handle, logged | A-06 | M | Can follow |
| H39 | Store a SHA-256 fingerprint of each uploaded image; refuse re-uploads of a removed image's exact file | A-33 | M | Can follow |
| H40 | Messages from a deleted account stay in other people's chats as "Deleted account" (if I21 is approved) | A-02 | M | After launch |
| H41 | Profiles without a verified school email visible to signed-in users only; optional signed-in-only setting for everyone (I23) | A-04, A-07, A-18 | M | After launch |
| H42 | Club-creation checkbox repeating the Terms §9 "on behalf of the group" sentence | A-50 | S | Can follow |

**Also in the companion's H table:**
- H2 (admin delete for clubs) now also serves H25.
- H4 (freeze flag) is downgraded to optional: hiding covers clubs, and a "takeover hold" suspension covers accounts.
- H16 drops "resumes" (already done).
- H18 must land before billing turns on.
- H20 must land before publish.

### I. Decisions for Franky: new

| # | Decision | Recommendation |
|---|---|---|
| I19 | Vibe+ during a suspension | Keep billing, with a cancel button on the notice (H24) and the §10 wording. Revisit if students complain. |
| I20 | Private viewing: anyone can hide their name when they view, but then can't see names either, even with Vibe+ | Yes, before billing turns on. It answers the unfairness and safety attacks without breaking the business model. |
| I21 | A deleted account's messages stay in others' chats as "Deleted account" | Yes, after launch (H40). Until then, keep the §14 disclosure. |
| I22 | A verified club can be deleted only by us, after 7 days' notice | Yes, before publish (H25). |
| I23 | Profiles without a verified school email are signed-in only, plus a signed-in-only option for everyone | Yes, after launch (H41). |
| I24 | Written checks for a verified club (Terms §9) | Adopt as written. Re-verify SAE through a second founder (P19). |
| I25 | Takeover exception with no time limit, and appeals from any address | Yes. |
| I26 | Badge text "@iu.edu verified" / "@purdue.edu verified", with the campus beside it rather than inside | Yes. At minimum, "Student" goes before publish. |
| I27 | Small-claims option in §18 | Yes. |
| I28 | Officers accept for the group, plus a one-page club page agreement at signing | Yes (Terms §9 now; P21 at signing; J23). |

**Changes to existing decisions:**
- I17's premise is corrected: RSVPs are not public to every signed-in user. Only organizers see who is going. The recommendation (H20) stands, to keep unverified logins off organizers' lists.
- I7 is settled by the Terms wording: hide at 6 months, delete at 12.

### J. Questions for counsel: new, and extensions

| # | Question |
|---|---|
| J8 (extend) | Is Stripe's upcoming-renewal reminder email enough for the states with pre-renewal notice rules? Is a cancel button on the suspension notice enough for "easy cancellation" rules? |
| J17 (extend) | The REPORT Act's one-year preservation after a CyberTipline report: how do we store the material lawfully, who may access it, and how do we delete it after? Until we are registered, is the public CyberTipline form enough? |
| J19 | Indiana and releasing our own negligence. Must a limitation that covers our own negligence say so specifically to be enforced? Is the §16 wording right now that the examples are gone? |
| J20 | Insurance before launch: general liability and cyber / tech errors-and-omissions for CONNECTVIBE. LLC. The cost, and whether it covers the founders acting for the LLC. |
| J21 | Personal exposure: can a regulator name Franky individually as the only person with data access? What records (the dated security-fix log, P17) show reasonable security? What LLC formalities matter? |
| J22 | TAKE IT DOWN Act: may we keep a removed intimate image in a locked quarantine as evidence, and for how long? What records of requests and removals must we keep? |
| J23 | Can an officer's signature on a one-page club page agreement bind an unincorporated student group? What should the page say? |
| J24 | Preservation: private lawyers' letters vs subpoenas vs § 2703(f) police requests. What must we do for each? May we pause a user's own deletion during a hold (H33)? |
| J25 | Selling viewer identities (Vibe+): FTC Act §5 and Indiana consumer-sales-law unfairness exposure. Is a free private-viewing option (I20) enough? |
| J26 | Emergency disclosures to campus police: is the §5 wording safe? Does it conflict with anything in the Privacy Policy? |
| J27 | A consent form for featuring students in marketing teasers and store screenshots. |
| J28 | Revisit arbitration and a class waiver at about 1,000 users. How big is the mass-arbitration risk for a small company? |

## 4c. App copy changes (all before publish unless marked)

| # | File | Replace | With |
|---|---|---|---|
| AC1 | `public/html/profile.html:8532` | "🎓 Student · {school}" | "@iu.edu verified" / "@purdue.edu verified", with the chosen campus beside it as plain text |
| AC2 | `public/html/profile.html:8543` | "🎓 Verify your student status" | "Verify your school email" |
| AC3 | `src/components/mobile/ProfileMobile.tsx:6485` | "🎓 {school ?? "Student"}" | "@iu.edu verified" / "@purdue.edu verified"; no badge when unverified |
| AC4 | `src/lib/iu/campuses.ts:400` | "{IU\|Purdue} verified" | "@iu.edu verified" / "@purdue.edu verified" |
| AC5 | `src/components/mobile/onboarding/onb-copy.ts:67` | "You're verified as a Purdue student." | "Your @purdue.edu email is verified." |
| AC6 | `onb-copy.ts:52` | "Your school email shows you're at {system}." | "Your school email is an {IU\|Purdue} address." |
| AC7 | Badge tooltip (new) | — | "This account confirmed an @iu.edu address. That doesn't confirm enrollment or identity, and the campus is the person's own choice." |
| AC8 | `src/app/auth/school-email/page.tsx:503-505` | "…add your school email (@iu.edu or @purdue.edu) so we know you're actually on campus." and headline "Verify your campus." | "…add your school email (@iu.edu or @purdue.edu). It unlocks posting, messaging, clubs and events." Headline: "Confirm your school email." |
| AC9 | `src/app/support/page.tsx:144-147` | "Vibe also needs a school email to verify your campus." | "Posting and messaging on Vibe need a verified @iu.edu or @purdue.edu email." |
| AC10 | `src/components/landing/home-landing.tsx:247` | "Sign up with your school email." | "Sign up with the email you'll keep, then confirm your school email." |
| AC11 | `src/app/campus/campus-home.tsx:12251-12254` | "Officially recognized clubs at {campus}." / "Officially recognized clubs." | "Clubs verified by Vibe at {campus}. Not a university listing." / "Clubs verified by Vibe." |
| AC12 | `campus-home.tsx:12272` | "Groups created by verified students." | "Groups created by verified accounts." |
| AC13 | `src/lib/orgs/join-copy.ts:147-148,158-159,202-203`, `public/html/onboarding.html:958-1029` | "IU students only" / "Purdue students only" / "{org} is open to IU students only." | "Open to @iu.edu accounts" / "Open to @purdue.edu accounts" / "{org} is open to @iu.edu accounts only." |
| AC14 | `src/app/account/suspended/page.tsx` (ban) | "…if you verified a school email here, it can't be verified on another account, so a new account can't post, comment or message." | "…if you verified a school email here, it can't be verified on another Vibe account. Coming back with a different email or school address is against our rules, and we close those accounts when we find them." |
| AC15 | `src/app/account/suspended/page.tsx` (both) | "…write to the address below and we'll stop it." | Once H24 ships: "…use Manage subscription below to cancel it." (before billing) |
| AC16 | `src/app/auth/terms/accept-terms-form.tsx` | "One quick thing." and the body with "One tap and you won't see this again." | Headline "We've updated our Terms"; body, main-changes lines, links, checkbox and buttons exactly as in A-42 |
| AC17 | `src/app/legal/community/page.tsx:34-36` | "Everyone here verified a school email, which means … a real student at a real school." | Companion C1 text |
| AC18 | `src/app/legal/child-safety/page.tsx:30-36` | "You need a verified school email to be here, and the Terms … enrolled at a U.S.-accredited college or university." | Companion C2 text |
| AC19 | `src/app/legal/child-safety/page.tsx` ("If you think a minor is on Vibe") | "If the person is under 18, we ban the account" | "If the person is under 18, we close the account", then add "A school email on it can be used again once the person turns 18." |
| AC20 | `src/app/legal/community/page.tsx:202-204` | "along with any identical copies of it we find on Vibe" | "and we make reasonable efforts to find and remove identical copies on Vibe" |
| AC21 | `src/app/legal/community/page.tsx:145-147` | "A report goes straight to the Vibe team and lands in a queue, where a person reads it" | "A report goes to the Vibe team and lands in a queue, where a person on the team reviews it" |
| AC22 | `src/app/legal/community/page.tsx` (appeals) | "…from the address on your account and tell us what we missed." | "…within 30 days, from the address on your account if you still have it (otherwise tell us the school email that was on it), and tell us what we missed. No time limit if your account was taken over." |
| AC23 | Community Guidelines and support page (new) | — | The Terms §11 "Not on Vibe?" line (T11.1) and the "Keep evidence" line (T11.3) |
| AC24 | `src/app/plus/page.tsx` | "Three things the database already keeps private from everyone, including from us on the free tier:" | "Three things Vibe keeps private from other users on the free tier:" |
| AC25 | `src/app/plus/page.tsx` | "Any signed-in student can already read those" | "Anyone signed in can already read those" |
| AC26 | `supabase/templates/confirmation.html` | "This is Vibe, the social app for students, clubs and orgs at IU and Purdue." | "This is Vibe, an independent social app for students, clubs and orgs on the IU and Purdue campuses." |
| AC27 | Site footer and store listings (new) | — | "Vibe is independent and not affiliated with Indiana University or Purdue University." |
| AC28 | Live Privacy Policy (`src/app/legal/privacy/page.tsx`) | "affiliated with a U.S. college", "CSRF protection", "aggregate usage analytics", "turn on multi-factor authentication…", and the 3-provider list | The rewrite in companion B |
| AC29 | Delete-account dialog (with H35) | — | "You created N club posts and M club events. They'll be deleted with your account." |
| AC30 | Marketing repo (`~/vibe-marketing`) | "real students only", "verified student identity", "Vibe uses real names and verified school emails" | "verified school emails"; drop "real names" |
| AC31 | `src/app/legal/community/page.tsx` (suspension bullet) | "…there's no posting, commenting, messaging or reacting, and no scrolling campus either." | Keep only if H23 ships; otherwise drop "and no scrolling campus either" |

## 4d. Process items (runbook lines the founders can follow)

| # | Process | Owner | When |
|---|---|---|---|
| P1 | **help@ rota.** Check first that help@ reaches all three founders. Then a shared calendar: each day one founder is responsible for help@ and the `/admin` report queue, and checks both morning and evening, weekends included. Swap in the group chat if you can't. Phone notifications on subjects containing "URGENT:" and "Intimate image removal". This is the only standing time commitment; it exists because the 48-hour intimate-image removal is the law. | All three | Before publish |
| P2 | **Intimate-image log.** A private sheet: request received (date and time), from whom, where the image was, when it was removed, which copies were searched, who did it. Keep it as counsel says (J22). | On-duty founder | Before publish |
| P3 | **NCMEC.** Register as an electronic service provider now. Until then, use the public CyberTipline online form, save the report number, move the material to quarantine and mark it held, and never forward, download or screenshot it. | Franky or James | Start now; before the Oct 16 store submission |
| P4 | **Copyright (DMCA).** Register the agent with the U.S. Copyright Office (task j9) and put the address in §7. Keep a repeat-infringer log. | James | By Oct 14 |
| P5 | **Club handover by hand** (until H1, H2, H38): check the evidence rule (two of four); email the current owner and wait 7 days, hiding the page if contested; change `orgs.owner_id` and the `org_members` roles in SQL; insert a `moderation_actions` row with the reason; tell both sides. | Decide: any founder. Run: Franky | Now |
| P6 | **Account recovery by hand** (until H6): one strong proof; email the old address and wait 7 days; change the auth email with the admin API, update `public.users.email` and the Stripe customer email; delete the user's `auth.sessions` and `auth.refresh_tokens`; log it in the recovery sheet; put the evidence in the shared folder. | Decide: any founder. Run: Franky | Now |
| P7 | **Takeover check** before any first-time ban of an account older than 30 days: look at the Supabase auth log for a recent password change or new sign-ins. If you see signs of takeover, suspend with reason "takeover hold" instead of banning, and email the login and school addresses. | Franky | Now |
| P8 | **Free a school email by hand** (until H27): compute the canonical key with the pepper in a one-off script, set `lifted_at` on the matching row, insert a `moderation_actions` row. Also used for a minor who has turned 18. | Franky | As needed |
| P9 | **Preservation.** Within 2 days of a valid request: export the account's rows (SQL by user id) and files to an encrypted folder, log the date, and set a reminder for when the hold ends. Answer police § 2703(f) requests the same way. | Franky | As needed |
| P10 | **Refunds.** Stripe Dashboard: find the charge, refund price × unused days ÷ days in the period, and log it. Covers: a ban overturned on appeal, a removed feature, an error, the "can't get into your account" path (an unused renewal in the last 30 days). | Franky | Before billing |
| P11 | **Stripe settings.** Upcoming-renewal reminders on (yearly plans), failed-payment and expiring-card emails on, receipts on, and a statement descriptor people will recognize. | Franky | Before billing |
| P12 | **Price or tax change.** Export the subscribers from Stripe, email them at least 30 days ahead, and log the date. | Franky | As needed |
| P13 | **Semester club review** (January and August): re-check each verified club with its officers; list clubs with no officers (hide at 6 months, delete at 12); log the results. | Rylan with Franky | Each semester |
| P14 | **Retention calendar.** Monthly: purge recovery evidence older than 90 days after close. Every January: review moderation records and suspension records more than 3 years past (first purge due 2029). H28 (quarantine job) live before Sept 2027. | Franky | Recurring |
| P15 | **Version rule.** Any material change to the Terms, Privacy Policy, Community Guidelines or Child Safety Standards bumps `TERMS_VERSION`, and the acceptance screen gets 3–5 "main changes" lines. Before each bump, search the app copy for "student", "officially", "real" and "verified" (the copy audit). | Franky | Every release |
| P16 | **Marketing.** Teasers and store screenshots use founder or test accounts, or a signed consent (J27). Anyone getting free Vibe+ for promoting Vibe discloses it when they post. | Rylan and James | Before teasers |
| P17 | **Security hygiene.** Turn on 2FA today for Supabase, Vercel, Cloudflare, Stripe, GitHub, Resend, and the Google and Outlook inboxes. Keep a dated "security fixes" log in the repo: what was fixed, when, and what is still open. | Franky (all three for their own inboxes) | Today |
| P18 | **Ban-evasion check.** When someone reports "they're back", or a new account matches a banned one (name, photos, phrases, the same victim), restrict it and write the match into the moderation log. | On-duty founder | Now |
| P19 | **No self-verification.** A founder never verifies their own club alone. SAE's verified status is re-confirmed by James or Rylan and logged. | All three | Before publish |
| P20 | **Emergencies.** A credible threat to someone's life: call 911 or campus police first, then log what was shared and why. | Whoever sees it | Now |
| P21 | **Club page agreement.** A one-page agreement signed by an officer when Rylan signs a club: who runs the page, the handover rule, the verification checks, that Vibe decides about the page only, Marion County, and the club's own email address. Counsel reviews it (J23). | Rylan | Before club signings |
| P22 | **Email sending health.** Confirm SPF, DKIM and DMARC for connectvibe.app in Resend. | Franky | Can follow |

## 4e. The publish gate (must be true on the day the Terms go live)

1. **Terms:** every T-item above is applied, and every bracket is removed, with the DMCA address and postal address filled in.
2. **Privacy Policy:** rewritten (companion B, AC28) and published the same day, under the same version bump.
3. **App copy:** AC1–AC14, AC16–AC28 and AC30. AC15 and AC29 go with H24 and H35. AC31 goes with H23 or is dropped.
4. **Code:**
   - H3 (revised);
   - the H5(a) piece (sign out other devices on password change);
   - H7;
   - H20;
   - H23;
   - H25;
   - H29;
   - H30.

   Recommended: H32 and H35. If one of H7, H23 or the H5(a) piece slips, use the fallback wording given in T14.1, T12.2 and T13.2.
5. **Process:** P1, P2, P3 started, P4 done, P15, P17, P19.
6. **Before the first student invite:** H11 (revised).
7. **Before billing turns on:** H18, H24, H31, H36 (if I20 is approved), P10, P11, and AC15.

---

# Part 5: Summary table

**Fix types.**
- **words**: the Terms themselves.
- **copy**: app or page text outside the Terms.
- **code**: an H item.
- **process**: a P item.
- **lawyer**: a J item.

"Before publish: yes" means at least one part of the fix must land before the Terms go live. The other gates are named where they differ.

| ID | Verdict | Fix type | Cost | Before publish |
|---|---|---|---|---|
| A-01 | BREAKS | code, words, copy | medium | yes (H11 before the first invite) |
| A-02 | PARTIALLY HOLDS | words, code, process | cheap / medium | words yes; H21 before launch |
| A-03 | PARTIALLY HOLDS | code, words | cheap | words yes; H18 before billing |
| A-04 | PARTIALLY HOLDS | words, code | cheap | yes |
| A-05 | PARTIALLY HOLDS | words, code, process | cheap | yes |
| A-06 | PARTIALLY HOLDS | words, code, process | cheap / medium | words yes |
| A-07 | PARTIALLY HOLDS | code | cheap | recommended (H32) |
| A-08 | BREAKS | code, words | cheap | yes |
| A-09 | PARTIALLY HOLDS | copy, words, code, process | cheap | yes |
| A-10 | BREAKS | code, words | cheap | yes |
| A-11 | BREAKS | words, code | cheap | yes |
| A-12 | PARTIALLY HOLDS | code, words | cheap | yes |
| A-13 | BREAKS | words, process, code | cheap | words yes |
| A-14 | BREAKS | copy, words | cheap | yes |
| A-15 | BREAKS | words, process, code | cheap / medium (code as A-01) | yes |
| A-16 | PARTIALLY HOLDS | words, process | cheap | yes |
| A-17 | BREAKS | words, copy | cheap | yes |
| A-18 | PARTIALLY HOLDS | code, words, process | cheap | words yes |
| A-19 | PARTIALLY HOLDS | words, process, lawyer | cheap | words yes |
| A-20 | BREAKS | code, words | cheap | yes |
| A-21 | PARTIALLY HOLDS | words, code, process | cheap / medium | words yes |
| A-22 | PARTIALLY HOLDS | words, process, copy | cheap | words yes; process before billing |
| A-23 | PARTIALLY HOLDS | words, process | cheap | yes |
| A-24 | PARTIALLY HOLDS | words, process | cheap | yes |
| A-25 | PARTIALLY HOLDS | words, process | cheap | yes |
| A-26 | PARTIALLY HOLDS | words, code, process | cheap / medium | words yes |
| A-27 | BREAKS | words, code | cheap / medium | words yes |
| A-28 | BREAKS | words, process | cheap | yes |
| A-29 | PARTIALLY HOLDS | copy, words, lawyer | cheap | yes |
| A-30 | PARTIALLY HOLDS | words, process | cheap | yes |
| A-31 | BREAKS | words, process, lawyer | cheap | yes |
| A-32 | HOLDS | process | cheap | no |
| A-33 | PARTIALLY HOLDS | words, code, process, lawyer | cheap | yes |
| A-34 | BREAKS | process (Privacy rewrite), code | medium | yes |
| A-35 | BREAKS | words | cheap | yes |
| A-36 | PARTIALLY HOLDS | code, process, lawyer | medium | partly (H5 piece and H7 yes; H11 before the first invite; P17 today) |
| A-37 | BREAKS | words, process | cheap | yes |
| A-38 | PARTIALLY HOLDS | words, code, lawyer | cheap / medium | words yes; I20 before billing |
| A-39 | PARTIALLY HOLDS | words, process, code | cheap | words yes |
| A-40 | BREAKS | words | cheap | yes |
| A-41 | PARTIALLY HOLDS | code, words | cheap | words yes; H24 before billing |
| A-42 | BREAKS | copy | cheap | yes |
| A-43 | PARTIALLY HOLDS | process, lawyer | cheap | yes (start P3 now) |
| A-44 | PARTIALLY HOLDS | process, code, words, lawyer | cheap | words yes; the rest before billing |
| A-45 | BREAKS | words, process | cheap | yes |
| A-46 | PARTIALLY HOLDS | words, process, lawyer | cheap | yes |
| A-47 | PARTIALLY HOLDS | words, copy, lawyer | cheap | yes |
| A-48 | BREAKS | words, process, code, lawyer | cheap / medium | words and P3 yes |
| A-49 | BREAKS | code, words | cheap | yes |
| A-50 | PARTIALLY HOLDS | words, process, lawyer | cheap | words yes |
| A-51 | PARTIALLY HOLDS | copy | cheap | yes |
| A-52 | HOLDS | words, lawyer | cheap | yes (the small-claims line) |
| A-53 | BREAKS | words, lawyer | cheap | yes |
| A-54 | PARTIALLY HOLDS | words, process | cheap | yes |

**Totals:** 2 HOLDS, 31 PARTIALLY HOLDS, 21 BREAKS.

- **Cost.** 43 of 54 can be closed with cheap fixes alone. The rest need at most a day of work each. Nothing needs spending money except insurance (J20) and, later, Supabase Pro for the session cap and backups.
- **The one item that is truly before-students, not before-publish:** H11 (the pre-registration takeover).
- **The items that decide whether Franky is personally well placed:** H11, the H5 piece, H7, P17 (2FA and the fix log), P3 (NCMEC), and J20 (insurance).
