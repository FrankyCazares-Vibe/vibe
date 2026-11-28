# Easier sign-up, and why the school code is slow (Sat Nov 28, 2026)

Franky, Nov 28: "the signup process is way to hard for people. and it takes EXTREMELY long for the sign up
verification email to go through… is there anyway we can have people sign up with their phone number and school
email instead… or how can we make this work while keeping the integrity of peoples accounts but making it a lottttt
easier." He has tried to get about 10 people signed up; they get the email about 30 minutes later.

Sign-up is still open (since Nov 9, no access code). Nothing here changes that.

## What the logs say (production, read only, counts only)

- **Supabase is not the slow part.** A sign-up hands its email to Resend in about a second: the two `/signup`
  requests in the logs took 0.97 s and 1.20 s, and Supabase only answers after the email is handed over. The
  account's "email sent" time is 0.1 to 0.2 s after the account. Supabase's own mailer isn't used: the SMTP is
  `smtp.resend.com`, from hello@connectvibe.app, capped at 40 auth emails an hour. No rate-limit refusals in the
  logs (kept back to Nov 12).
- **Personal inboxes are fast.** Every code sent to a personal inbox was typed within 2 minutes of sign-up: 14 of 14
  (median 24 s, 9 in 10 within a minute, slowest 1.7 min). Since the code-only email began on Oct 8: 3 of 3, at
  23 s, 45 s and 67 s.
- **School inboxes are where it breaks.** Since Oct 8, 0 of 3 codes sent to an iu.edu inbox were used: sign-ups on
  Oct 25 (5:52 pm) and Nov 17 (7:50 pm), and a school-step code on Nov 20 (1:56 pm), all Indianapolis time. Resend
  accepted all three. Both schools' mail goes to Microsoft 365 (MX `*.mail.protection.outlook.com`).
- **The funnel since Nov 12:** 12 sign-up page opens, 4 sign-ups sent (3 personal, 1 school), 3 confirmed (all
  personal). 8 opens never sent the form; nothing on the form records why.
- **Code lifetimes made a late email worse.** The sign-up code lasts 1 hour and the school code lasted 30 to 60
  minutes. A school email held for 30 minutes could arrive with a dead code, and "Send again" only queued another
  slow one.
- **Not measured: the time between Resend and the student's inbox.** Our Resend key can only send, so Resend's
  delivery log (its "Delivered" or "Delivery delayed" times) needs Franky's dashboard. The 30 minutes is Franky's
  own observation.

**Root cause.** Microsoft 365 at IU and Purdue holds or junks mail from connectvibe.app, a domain registered in May
2026 that sends a few emails a week through Resend's shared servers. The records are fine (Nov 9 note: SPF, DKIM
and DMARC pass, no blocklists). It is the sender's reputation, which only time, volume and "Not junk" clicks
improve. The S75 change (no links, code in the subject) already removed what Microsoft scans; school codes still
went unused after it.

## The options, compared

| Option | For the student | Fixes the school inbox? | Integrity | Cost and setup |
|---|---|---|---|---|
| 6-digit code to the school email, proper sender | Already live: an 8-digit code since Oct 8, Resend since Sep | No: same inbox, same hold | Same | 6 digits instead of 8 saves two keystrokes; not worth a change |
| Phone number + SMS code | Code in seconds | No: a phone isn't a student, so the school email is still needed for campus | Weaker on its own | About $0.058 a code (Twilio Verify), an account and a card; SMS-pumping fraud to guard |
| Google sign-in | One tap | No: mostly personal Gmail | Doesn't prove a student | Free |
| **Microsoft sign-in with the IU or Purdue login** | One tap and their school login; **no email at all** | **Yes** | **Stronger**: the school's own login proves the account, and our existing rule (`verifySchoolFromSignInEmail`) already accepts a confirmed school sign-in email | Free. Needs a Microsoft Entra app, maybe publisher verification, and a Supabase setting. **Unknown: whether IU and Purdue let students approve a new app themselves.** Many universities ask for admin approval, sometimes for months |
| **Any inbox first, school email next** (this PR) | Account in under a minute; school email after | Partly: nobody is lost at the first wall, and a late school code still works | Same: campus still needs a verified school email | Free, works today |

The sign-up form itself has nothing spare: an email, a password (needed so signing in later doesn't depend on
email), and the age-and-Terms box (the legal record). The waiting is what to cut.

## Recommendation (one)

**Prove "who you are" and "that you're a student" separately, each over a channel that is fast for it.**

1. **Now (this PR):** the account on an email the person can open now. If a school code hasn't come in a minute,
   one tap moves them to another email. The school email stays required for campus, and its code now works for at
   least 6 hours, so a late email still works.
2. **Next:** "Continue with Microsoft" as the school check, once Franky's 15-minute test with his own IU login shows
   students can approve the app themselves. Until then the school step stays the email code.

## What's in the PR

- **Sign-up page:** "Use your school email to confirm you're a student in one step. Or use any email you can open
  right now, and add your school email next." The field is "Email · school or personal". A personal address gets
  "That works. Next you'll add your IU or Purdue email, which is what lets you into campus." instead of a warning.
  Club links still ask for the school email only.
- **"Check your email" view:** after a minute, "Nothing yet?" For a school address: look in Junk, or "Use another
  email", which goes back to the form with the address empty and focused and the password and box kept. For other
  addresses: look in Junk or Spam and send a new code.
- **School code:** works for at least 6 hours (was 30 to 60 minutes), in one file (`src/lib/auth/school-code-life.ts`)
  that the server, the page and the email all read. The school step adds: "School inboxes can hold mail from new
  apps for a while. The code works for at least 6 hours, and sending again never cancels the first email, so a
  late one still works." Guessing odds don't change: 5 tries a quarter hour per account, and only two codes are
  live at any time, whatever the window.
- **Privacy Policy, dated Nov 28:** section 2, "Making an account", now says sign-up takes your school email or
  another one you can open right away, and what each path does. Nothing new is collected: a personal sign-in email
  was always possible (the form only hinted against it). Page and text match: 1,321 of 1,321 sentences (checker
  report updated). The Terms version is unchanged, so nobody is asked to accept again.

## Checked

- 4,243 of 4,243 tests pass on the final state (6 new in `src/lib/auth/school-code-life.test.ts`). Typecheck clean;
  lint clean on changed files (one existing warning in the school-email page, not from this change).
- **Local, end to end, timed** (local Supabase with confirmations turned on for the run, Mailpit as the inbox, a
  local stand-in for Resend; nothing was sent anywhere):
  - School address, one step: submit to inbox 0.66 s; code typed, then onboarding 1.2 s later.
  - School address, no code typed: no help at 6 s; "Nothing yet?" showing by 72 s. "Use another email": form back,
    address empty and focused, password and box kept.
  - Then a personal address: submit to inbox 0.36 s; confirmed; school step code captured 8.7 s after "Send my code"
    (first compile of that route in dev); code typed, then onboarding 2.8 s later. The abandoned school sign-up
    stayed unconfirmed and didn't block verifying the same school address.
  - Afterwards: test accounts deleted, local sign-up closed again, local config back as it was.
- **Not checked:** real delivery to an iu.edu inbox (needs Franky), and the live site (after merge).

## Franky's steps (recommendations, in order)

1. **5 minutes, read only: Resend > Emails.** Find the three iu.edu emails above (Oct 25 5:52 pm, Nov 17 7:50 pm,
   Nov 20 1:56 pm). For each, note the Sent and Delivered times, or "Delivery delayed" or "Bounced". That is the one
   number we don't have: whether Microsoft takes the mail and holds it, or turns it away for a while.
2. **Merge this PR on your yes**, then check the live sign-up page.
3. **Microsoft sign-in test** (free, about an hour, needs your OK to create the app): make a Microsoft Entra app
   registration for "accounts in any organizational directory", redirect URI
   `https://rqopjkimxbjkwdkpkbfq.supabase.co/auth/v1/callback`, with the `xms_edov` optional claim (Supabase's
   Azure guide). Sign in to it with your own IU account. A consent screen means students can approve it; "Need
   admin approval" means IU must (ask UITS). Ask one Purdue friend to try too. If it passes, a small PR adds the
   button and Supabase's Azure provider goes on.
4. **Keep asking friends to choose "Not junk"** on the first Vibe email. It's the only thing that teaches Microsoft.

## Deploy notes

- Changing the school code's window changes every code: a school code emailed in the minutes before the deploy stops
  working; sending again gives one that lasts 6 hours. Almost no traffic today.
- No database or Supabase setting changes.
- Rollback: revert the PR. The policy text and date go back with it.
