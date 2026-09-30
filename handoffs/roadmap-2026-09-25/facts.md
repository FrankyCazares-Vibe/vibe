# Vibe: where we actually are (Sept 25, 2026)

For the founders' meeting on Sept 26. Three parts: the live numbers, what got built since Sept 21, and
what's stuck and on whom.

The numbers come straight from the live database, pulled at 2:14 a.m. Indianapolis time on Sept 25.
Read-only. Nothing was changed. The database is still on the Sept 23 update (the moderation one).

---

## Part 1. The live numbers

**The short version:** the app is built, but almost no real students use it yet. That's expected. The
plan was always clubs first, then students. But it means the next five weeks are about getting people
in, not about building more.

| What we counted | Number | What it means in plain words |
|---|---|---|
| Accounts | **20** | Everyone who ever signed up. Includes the 3 of us and some of Franky's test accounts. How many are real students is UNVERIFIED. |
| Verified school email | **14 of 20** | Proved they have a real school email. The other 6 never did. Right now they can't post, comment or message. |
| IU vs Purdue | **14 IU, 0 Purdue** | The 6 unverified accounts have no school set. Purdue Indy has nobody on Vibe yet. |
| Real, visible clubs | **1 (SAE)** | 4 more clubs exist, but they're hidden test clubs. Only SAE is real. |
| SAE followers | **1** | That one follower is a founder. The public count only shows once a club has 5 followers, so SAE's page shows no number yet. |
| SAE members | **1** | Also a founder. |
| All club follows (test clubs too) | **7, by 3 people** | Almost all of it is test clubs. |
| Posts published | **20** | 19 regular posts and 1 video post. Plus 1 draft. **19 of the 20 are by founders.** 4 different people have ever posted. Clubs have posted **0**. |
| Upcoming events | **0** | Nothing on the calendar right now. |
| Events ever | **11** | 8 on SAE, 3 on a hidden test club. The last one started Sept 23. |
| Messages, last 7 days | **0** | 56 messages ever. The last one was Sept 12. |
| New accounts, last 7 days | **0** | The last signup was Sept 17. None since the Sept 21 roadmap. |

A few extra numbers that help:

- **Signed in during the last 7 days:** 1 account. In the last 30 days: 11.
- **Reports filed:** 0. (Reporting went live Sept 23.)
- **Likes:** 9. **Comments:** 11. **Event RSVPs:** 6. **Connections between students:** 27.
- **Accounts by month:** 8 signed up in May, 12 in September.

**What this means for the plan:**

1. **We have zero real traction yet.** Every number is us plus a few friends and testers. That's normal
   before an invite. It's also the honest starting line.
2. **The number that matters most is real clubs.** The Sept 21 goal is 10 clubs signed on. Today: 1.
   And that one club has no posts and no upcoming events.
3. **Purdue Indy is at zero.** The Indy campus is shared by IU and Purdue, so we need Purdue clubs too.
4. **Things went quiet after Sept 17.** No posts, no signups, no messages since. That's because the
   build work was all behind the scenes, not because something broke.

**How each number was counted (for anyone who wants to check):**
accounts = every row in the users list · verified = "school verified" is yes · IU/Purdue = the school
system saved on the account · real clubs = clubs not marked hidden · followers and members = rows for
SAE in the follow and member lists · published = posts marked "published" · upcoming = events whose
start time is after now · last 7 days = anything created after Sept 18.

---

## Part 2. What got built since Sept 21

Everything below is live on connectvibe.app unless it says OFF.

### Safety (live Sept 23-24)

- **Students can report almost anything:** a post, comment, message, conversation, event or club.
  Every report is meant to email all three of us. (UNVERIFIED: no real report has been filed yet.)
- **We have a moderation desk.** The three of us can review reports, remove posts, and suspend or ban
  accounts. We tested a suspension live on Sept 24 and it worked.
- **A banned student can't come back** with a new account using the same school email.
- **You need a verified school email to post, comment or message.** This keeps out fake accounts.
- **A word filter runs everywhere students can type.**
- **Community Guidelines and Child Safety pages are live.** They promise we review reports within 24
  hours. (Our Terms still say "no guarantee about response time." The lawyer has to fix that. See Part 3.)
- **If we remove your post, you see why.** Everyone else just stops seeing it.

### Privacy (live Sept 22)

- **Posts show how many likes and reposts, never who.** Counts are public, names are private.
- **Only Vibe's server can change your profile details**, and only after it checks it's really you.
- **A resume privacy bug is fixed.** The black bars students draw over their resume now stay on the
  right file. Before, deleting one file could expose another file's hidden parts.
- **Profile links are clean**, like connectvibe.app/profile/yourname. They show a preview card when
  shared in iMessage or Discord.
- **Hidden test clubs are hidden everywhere**, down to the database itself.

### Payments (built, switched OFF)

- **Vibe+ ($3.99 a month or $24.99 a year) is built** and tested with fake cards. Students would pay on
  Stripe's own page, so Vibe never sees a card number.
- **Selling is OFF** until the LLC has its tax ID and bank account, and the Terms cover subscriptions.
- **Vibe+ will be hidden inside the App Store and Google Play apps at launch.**

### The phone app (Sept 24-25)

- **Vibe installs to a phone's home screen from the website.** It opens full screen, and shows a
  "You're offline" page when there's no signal.
- **The website is ready for Apple's and Google's reviewers.** It has a support page, a delete-your-
  account page, a footer that names CONNECTVIBE. LLC, and two demo accounts for reviewers to use.
- **The real App Store / Google Play app exists.** It runs on a simulated iPhone: open, sign in, sign
  up, swipe back, read the Terms. The Android version has never been built yet.
- **Inside the app, it acts like an app.** Links and the back button behave right, and Vibe+ is hidden.
- **Push notifications are built but switched OFF.** Nobody gets any until Franky does four setup
  steps and the phone side is built (the next piece of work).
- **A hidden bug is fixed:** the live site was sometimes shipping old styling. Every build now starts fresh.

### The big change from the Sept 21 roadmap

The Sept 21 roadmap said: web app first, App Store and Google Play apps in November or December.
**Now the store apps are the target before Oct 31.** The last safe day to submit to both stores is
**Friday, Oct 16**. That moves company paperwork (Part 3) to the very front of the line.

---

## Part 3. What's stuck, and on whom

**The short version:** the code isn't what's slowing us down anymore. Paperwork is. Apple and Google
won't let a company publish an app until they can prove the company is real. Most of these steps
wait on the one before them, so one late answer pushes everything back.

### The chain, in order

| # | What's stuck | Who | Why it matters | Needed by |
|---|---|---|---|---|
| 1 | **How CONNECTVIBE. LLC is registered** (its exact legal name, and who is listed on the filing), plus **a public business address** | **James** | Apple checks the company's exact legal name and address, and that the person signing up can sign for the company. The Indiana record lists no address today. | **At the Sept 26 meeting.** Step 2 can't start without it. |
| 2 | **A D-U-N-S number** (a free company ID number) | **Franky**, after James answers #1 | Apple requires one for any company. Our research says Google uses the same number (UNVERIFIED, not rechecked today). | **Request by Mon Sept 28.** It takes up to 7 business days, which lands about Oct 7. |
| 3 | **A working @connectvibe.app email**, plus one real test email to help@ | **Franky** | Apple wants a work email on the company's own web address. help@ has never received a real email, so we don't know it works. | This week |
| 4 | **A company Google account**, then **Firebase** (Google's service that sends phone notifications) and a **Google Play company account** ($25, one time) | **Franky** | No Google account means no Android app and no notifications on phones. | Before Oct 9 |
| 5 | **Apple Developer company account** ($99 a year) | **Franky** | No Apple account means no iPhone app. | **Decision day: Oct 9.** If Apple hasn't moved by then, we launch with the website app (the one that installs from the browser) and add the store apps later. |
| 6 | **The lawyer**, with Terms and Privacy live by about Oct 14 | **James** finds the lawyer | The Terms must say: zero tolerance for abuse, reports reviewed within 24 hours, 18 and older only, and follow Texas SB 2420 (a Texas law about app store age checks). Privacy must name every service we use: Sentry (error reports), Resend (email), Stripe (payments), Firebase and Apple (notifications). Apple and Google check these. | **About Oct 14** |
| 7 | **Turning notifications on**: a yes to the database change, making the keys once, adding the settings | **Franky** only | Nobody gets a notification until this is done. It also needs #4 first. | Before launch |
| 8 | **Install Android Studio** (the tool that builds the Android app), and **pick a backup app name** | **Franky**; the name **with Rylan** | The Android app has never been built. "Vibe" is probably already taken on the stores. | Before Oct 16 |

**Also on James, but it doesn't block launch:** the LLC's tax ID (EIN) and a business bank account.
Until those exist, Vibe+ can't sell. That's fine for launch, since Vibe+ is hidden in the store apps anyway.

### Work that is waiting on the paperwork

- **Links that open the app** (tap a Vibe link, the app opens instead of the browser). Waiting on the
  Apple account's team ID and the Google Play app's signing fingerprint. Must be live by **Oct 23**,
  because Android can take up to a week to pick them up.
- **The store submission kit** (privacy labels, age forms, notes for reviewers, screenshots). Waiting
  on both store accounts. Last safe day to submit: **Fri Oct 16**.

### Work that is NOT blocked

- **The phone side of notifications** (the on/off switches in Settings, the "turn on notifications"
  prompts). Franky can build this now.
- **A security check** of everything built since Sept 3, before we submit to the stores.

### Not in Franky's queue, but the numbers say it matters most

**Rylan owns the campus** (per the Sept 21 plan): researching clubs, reaching out, demo days, and
student interviews. By the Sept 21 plan, clubs sign on and post their events before students are invited.
Today there is 1 real club, 0 upcoming events, and 0 Purdue students. The paperwork gets the app into
the stores. Rylan's work is what makes it worth opening on Oct 31.

### Key dates at a glance

| Date | What |
|---|---|
| Sat Sept 26 | Founders meet. James brings the LLC answer (#1). |
| Mon Sept 28 | D-U-N-S requested. |
| About Oct 7 | D-U-N-S number arrives. Enroll with Apple and Google right away. |
| **Fri Oct 9** | **Apple decision day.** Store apps or website app for launch. |
| About Oct 14 | Lawyer's Terms and Privacy live. |
| **Fri Oct 16** | **Last safe day to submit to both stores.** |
| Fri Oct 23 | App links live. |
| **Sat Oct 31** | **Launch.** |

---

## Sources

**Internal (read Sept 25, 2026):**
- The live database, read-only counts pulled Sept 25 at 06:14 UTC (2:14 a.m. Indianapolis).
- `handoffs/2026-09-25-session-65-next-waves.md`: Franky's queue, the waves left, dates.
- `handoffs/2026-09-24-session-65-installable-app-and-store-shell.md`: what shipped Sept 24-25.
- `handoffs/2026-09-22-session-64-stripe-redaction-and-moderation.md`: what shipped Sept 22-24.
- Git history since Sept 21 (commits `a39df14` through `b393cb1`).
- The Sept 21 roadmap: https://claude.ai/artifact/6QfJfD1QSPYu8qn9FvsRzi (not re-read today; summarized
  from the team's notes).

**Web (checked Sept 25, 2026):**
- Apple, D-U-N-S: up to 5 business days from D&B, then up to 2 more for Apple. Free. LLCs need one.
  https://developer.apple.com/support/D-U-N-S/
- Apple Developer Program: $99 a year. A company needs a D-U-N-S number, a work email on its own web
  address, and a working public website. https://developer.apple.com/programs/enroll/
- Google Play: a $25 one-time sign-up fee. That page doesn't say whether a company account needs a
  D-U-N-S number. https://support.google.com/googleplay/android-developer/answer/6112435

**UNVERIFIED in this file:** how many of the 20 accounts are real students (vs. founders and test
accounts); that report emails reach all three founders; that Google accepts the same D-U-N-S number;
the details of Texas SB 2420 (not rechecked today); whether Sat Sept 26 is the meeting day (the
request said "tomorrow").
