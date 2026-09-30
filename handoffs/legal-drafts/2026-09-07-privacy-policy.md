# Vibe Privacy Policy

**Effective September 7, 2026** (version `2026-09-07`)

> Draft for founder/counsel review. Every factual statement below about what Vibe collects, stores, shows, or deletes was checked against the code and configuration as of September 7, 2026, and re-checked on September 17, 2026 against commit `db26ff8` for Purdue, campuses, club following, club invites, onboarding and post editing. Two kinds of bracketed markers are used, and the same legend applies to the Terms of Service: **[DECISION: …]** is a founder or product choice that the code does not settle — each one states the default this draft assumes. **[REVIEWER: …]** is a legal question for counsel — each one also states the draft's current default. Remove this note and all bracketed markers before publishing.

---

## 1. Who we are and how to reach us

Vibe is a campus social app for students, clubs and organizations at **Indiana University** and **Purdue University**. It is piloting in **Indianapolis**, which is one shared campus community for IU Indianapolis and Purdue Indianapolis students. Vibe is built and operated independently; it is **not affiliated with, endorsed by, or operated by Indiana University or Purdue University**, and neither university receives any data from Vibe.

Vibe is operated by **CONNECTVIBE. LLC**, an **Indiana** domestic limited liability company (Business ID 202605081999327, registered agent James Andres), effective **May 8, 2026** ("we," "us," "our"). Vibe has no published postal address. **[DECISION: none is required at Vibe's current size — no state privacy law applies (Indiana CDPA and CCPA thresholds are ~100k consumers), and the federal physical-address rule covers marketing email, which Vibe does not send. Add one before any of these: sending promotional email; registering a DMCA designated agent; submitting to an app store; approaching those thresholds. When you do, prefer a PO box or registered-agent service over a cofounder's home address, since it becomes public. Draft assumes: email contact only, no address published.]** You can reach us at the email addresses below. Vibe is built and operated by its three cofounders: **Francisco Cazares** (builds and runs the product), **James Andres**, and **Rylan Conaway**. **Francisco Cazares is the only person with administrative access to your data** — the database, the hosting, and the file storage. James Andres and Rylan Conaway can read the business inbox (vibe.llc@outlook.com) and nothing else; if you email that address, they may see what you send. Elsewhere in this policy, "the people with administrative access" means Francisco Cazares.

Questions, requests, or concerns about this policy: **hello@connectvibe.app**. Email sent to that address is delivered to us through Cloudflare Email Routing and lands in a Gmail inbox we control, so Google also processes support messages you send us (see section 6).

The current version of this policy is always at **connectvibe.app/legal/privacy**, and it is linked from Settings inside the app. The Terms of Service are at **connectvibe.app/legal/terms**.

## 2. Who this policy covers

This policy applies to everyone who visits **www.connectvibe.app** — on a computer or on a phone — or creates a Vibe account. Vibe is a website; there is nothing separate to download or install.

- **You must be 18 or older** to have an account. When you sign up you check a box confirming this. We do not collect your date of birth and do not otherwise verify your age. See section 12.
- **Vibe is open to IU and Purdue students.** You can sign up with any email address, but to use Vibe you must complete four steps in order: (1) confirm that email; (2) accept the Terms; (3) prove you control an **@iu.edu or @purdue.edu** address (including subdomains such as @mail.iu.edu); and (4) finish or skip onboarding, which Otto, Vibe's built-in assistant, walks you through. Without one of those school addresses you cannot get past step 3. IU retired @iupui.edu addresses on January 1, 2026, so we refuse them, and IU's other retired addresses, and ask for your @iu.edu address instead. Purdue Fort Wayne (@pfw.edu) and Purdue Northwest (@pnw.edu) addresses are not accepted yet, and no other school's address is accepted.
- **What onboarding asks.** You pick your campus from your university's campuses and give a display name and a handle. The name and handle are the only required fields; finishing also needs a campus. A photo, the rest of your profile, clubs, and people to follow are optional. Each step is saved to your account when you continue, a photo when you save it, and each follow or join when you tap it. **Skip** ends onboarding once you have a name and a handle, and leaves your campus for later.
- **What that check does and does not prove.** Your school email proves which **university** you attend, IU or Purdue, not your campus: every IU campus uses @iu.edu, and Purdue's campuses share @purdue.edu. You **choose your campus** from your university's campuses, and we do not verify it. Indianapolis is one community for both universities. After onboarding you can change your campus at most once every 30 days, and we store when you last set it. If you later verify an address at the other university, your university changes with it; your campus stays if it belongs to both universities and is cleared if it doesn't. The "school verified" badge means your IU or Purdue address was confirmed, nothing more.
- **Pages you can use before finishing those steps, or if you decline a new version of the Terms:** Settings (to delete your account), these legal pages, public profile and org links (which anyone on the internet can see), and direct links to individual posts (opening the post itself needs a login, but not the later steps; the link preview — author, the start of the text, and the image — is visible to anyone, see section 5a). The campus, feed, network, messages, Otto, and profile pages all send you back to whichever step is next.

By checking the box at signup ("I'm 18 or older and I agree to the Terms of Service and Privacy Policy") you agree to this policy. We record that agreement as described in section 13.

## 3. What we collect

We only collect what you give us or what the app needs to work. Here it is, grouped.

### 3a. Account and sign-in

| What | Why |
|---|---|
| Sign-in email address and a password (we store a hash of the password, never the password itself) | To create and secure your account and send account emails |
| School email address (@iu.edu / @purdue.edu) — required to use Vibe | To confirm which university you attend (IU or Purdue) and give you the "school verified" badge; it does not identify your campus, one address can verify only one account, and the address itself is never shown to other users |
| Your university (IU or Purdue), taken from your verified school email | To decide which campuses you can pick and browse (their feeds, events and maps), and which clubs you can join when a club is open to only one university's students. It does not limit who you can follow, message, or find in search |
| Your campus, which you pick within your university, and when you last set it | To show your campus's clubs, events, map and people first, and to allow one campus change every 30 days. Your campus is part of your profile (section 5); when you last set it is visible only to you |
| The version of the Terms you accepted, when you accepted, whether you attested you are 18+, and where you accepted (signup or the re-consent screen) | To keep a record that you agreed |
| Whether you are a platform admin (only we can set this) | To gate admin tools |

Your sign-in email and school email are stored so that only our server-side code (and we, the operator) can read them. Other users never see either address.

### 3b. Your profile

Everything on your profile is something you typed or uploaded:

- display name, handle, university and campus (see 3a), year, major, department;
- headline, tagline, bio, location (free text you type — we do not use GPS or your IP to find where you are), website;
- interests, skills, what you're looking for, work experience, "currently working on" items;
- a recruiter snapshot;
- profile photo, banner image, and your banner color choice.

Your **resume or portfolio documents** (up to three files, or links to Google Drive/Dropbox-style documents you paste in) and any **redaction bars** you draw on them. Redaction geometry never leaves our server (see section 5c).

### 3c. Things you post and do

- Posts (text, tags, images, video clips), drafts, comments, likes, reposts, saves and saved collections.
- **Edits to your posts.** When you edit a post, we replace its text, re-read its tags from the new text, and, for a published post, record when you edited it. We do not keep the earlier text.
- **Follows and connections.** You can follow another user (one-way). When two people follow each other they are "connected." We store both.
- **Clubs you follow.** You can follow any club Vibe shows you, whatever its campus and whoever it lets join. We store which clubs you follow; how you started following each one (by joining it, from its page, from the clubs list, or during onboarding); when; and the date you first ever followed it. Joining a club follows it automatically, and a member can't unfollow; leaving a club removes the follow only if joining created it.
- Events, RSVPs, and personal calendar entries. Only the owner or an admin of a **verified** org can create an event, on that org's behalf. Any signed-in user can RSVP to an event and keep personal calendar entries. The app offers "going" and "interested" (stored as "maybe"); the database can also hold "no." Whatever RSVP status is stored is visible to every signed-in user.
- Connection suggestions you dismiss.
- Org (club) memberships, join requests including any message you write, and org channels you join.
- **Club invites.** When a club's owner or an admin invites you to join, we store the invite, who sent it, and what happened to it (waiting, accepted, declined, withdrawn, or expired).
- Direct messages and group chats: message text, photos and videos you attach, reactions, replies, @mentions, group photos and group names; plus per-chat state such as when you last read a thread, whether you muted it, and a short-lived "typing" indicator.
- Reports you file about a user or a post (a reason code and up to 1,000 characters of free text), and your block and mute lists.
- Otto settings (how chatty Otto is, which reminders you want) and Otto reminders. **Otto is built in-house.** Nothing you tell Otto is sent to any AI or language-model vendor; no such vendor is part of Vibe.

### 3d. Activity Vibe records automatically

- **Who viewed your profile.** When a signed-in user opens your profile we record their identity, the date, and the page they came from, once per day per viewer. You can see your recent viewers (section 5b). Equally, when *you* open someone else's profile, they can see that you did. There is currently no way to browse profiles anonymously.
- **Post views.** We record that a signed-in user viewed a post, once per user per day, to count views. Only the count is shown to anyone.
- **Last active time.** When you open the Campus page, on a computer or a phone, and every 30 seconds while it stays on screen, your browser pings us. We store the time of your last ping and use it for the "active now" count on your campus's banner, which counts people at your campus (or everyone on Vibe, if you haven't picked a campus). Signed-in users can see it. Other pages do not send this ping.
- **Notifications** generated when someone follows, likes, comments on, mentions, or connects with you; when a club invites you to join; when a club approves your request to join; and when someone newly @mentions you by editing a post. Following a club doesn't notify anyone.
- **Rate-limit counters.** We keep short-lived counters for most actions — posting, commenting, following, messaging, starting threads, uploads, reports, resume views, handle changes, org creation, following and unfollowing clubs, removing a club's follower, sending club invites, editing posts, saving onboarding steps, accepting the Terms — keyed by your user id (club invites are also counted per club and per invited person). Password-reset requests are counted by your email address and your IP address, because you are not signed in. School-email verification requests are counted by your user id and additionally by your IP address. Counters older than one day become eligible for deletion and are cleaned up opportunistically (there is no scheduled job), so at low traffic they can persist for a few days. This is the **only** place Vibe itself stores an IP address, and we never derive your location from it. **[DECISION: add a scheduled prune so the one-day figure is firm, then say "deleted after one day." Draft assumes: opportunistic cleanup, disclosed as such.]**
- **Error reports.** If something breaks, our error-monitoring vendor (Sentry) receives a stack trace, the page or route involved, and standard request details. We have configured it not to send personally identifying defaults, and our code never attaches your user id or email to an error report; however, a page URL in a report can include a handle.

### 3e. What we do *not* collect

- No usage-analytics or advertising SDK. We do not track which buttons you press or build behavioral profiles.
- No location: we never ask your browser for geolocation (it is disabled by our page headers) and never estimate it from your IP.
- No camera, microphone, or push-notification access: no part of Vibe asks for these permissions today.
- No date of birth, government ID, phone number, or payment details.
- No contacts import, no third-party login (Google/Apple/etc.).

## 4. How we use your information

- **Run Vibe:** show your profile and posts, deliver messages, fan out notifications, power search, calendars, and org pages.
- **Keep accounts secure:** send signup confirmation, password reset, and school-verification emails; enforce rate limits; keep sessions signed in.
- **Safety and moderation:** review reports, act on blocks and mutes, and remove content or accounts that break the Terms.
- **Fix bugs:** investigate error reports from Sentry.
- **Talk to you about your account.** The only *automated* emails Vibe sends are the three listed in section 6 (signup confirmation, password reset, school-email verification). We may also write to you personally from hello@connectvibe.app about your account, an enforcement action, a security incident, or a change to this policy. We do not send marketing email, digests, or activity emails.

We do **not** sell your personal information, share it with advertisers, or use it to train AI models.

## 5. Who can see what

### 5a. Anyone on the internet (no account needed)

- **Almost your entire profile** — via your profile share link (`connectvibe.app/profile/<handle>`), which is deliberately open so links work when shared off-platform and may be indexed by search engines. A logged-out visitor can see everything listed in section 3b **except** your resume/portfolio documents and links, your recruiter snapshot, and your redaction bars. They can also see your "school verified" badge and your follower, following, and connection counts. That includes your university and campus badge, but not when you last set your campus. **[DECISION: restrict the logged-out profile payload in code to name, handle, tagline, bio, and photo — then shorten this bullet to match. Draft assumes: today's behaviour, the full card, disclosed as such.]**
- **Profile photos, banners, post images, video poster frames (the still image shown before a video plays), and logos you add to work-experience entries** are stored in a public storage bucket. Anyone who has the direct file link can open it until the file is deleted. The bucket cannot be browsed or listed; someone needs the exact link. These links do not expire on their own — see section 8 for when files are actually deleted.
- **Media attached to a published post** (image or clip). Video clips and org post media are served through a permanent link on our domain (`/api/posts/<id>/media`) that redirects to a storage link valid for 1 hour. No sign-in is needed.
- **A post's share link** (`connectvibe.app/posts/<id>`). The page asks you to sign in before it shows the post, but its title and preview tags — the ones chat apps and social sites use to draw link previews — carry the author's name or handle, the first 137 characters of the post text, and the post's image or video poster frame. Anyone with the link, and any service the link is pasted into, sees that much without an account.
- **Club (org) pages:** the club's description, links, logo, banner, member count, its follower count once it has 5 or more followers, and its most recent posts (up to 12), including the name, handle, and avatar of whoever posted them. This is true for every club, including clubs you must ask or be invited to join. Clubs we have hidden are shown only to their own members and to us. **[DECISION: keep as-is, or hide member posts / author identity for clubs that are not open to everyone. Draft assumes: as-is, disclosed.]**

### 5b. Every signed-in Vibe user

- Your full profile (section 3b), including your "school verified" badge (but not the address behind it), and your published posts, comments, likes, and reposts.
- **Who you follow, who follows you, and your connections** — the lists, not only the counts.
- **Your resume or portfolio documents.** Any signed-in user who has not blocked you and whom you have not blocked can open them. There is no separate "recruiter" role. If you drew redaction bars, other users only ever receive a copy our server generated with the bars permanently burned in; you alone see the original. Links to resume files expire after 5 minutes.
- **Events you create for a verified org, and your RSVPs** — to every signed-in user, at every campus. The app offers "going" and "interested" (stored as "maybe"); the database can also hold "no"; whatever status is stored is visible to every signed-in user.
- **Your campus decides what Vibe shows you first, not who can look.** Vibe puts your own campus's clubs, events, map and people first, and a club can let only one university's students join. But any signed-in Vibe user, at any campus or university, can read your profile, your published posts, the events you create, and your RSVPs, even where the app would not show them. People who are not signed in cannot read these from our database directly; what they can see is listed in 5a.
- **Membership in open clubs.** The members of a club anyone can join are visible to every signed-in user — our database allows that read, though the app's own roster screen shows the list only to the club's members. The members of a club you must ask or be invited to join are visible only to that club's members, though anyone at all can see who wrote the club's recent posts on its public page, unless we have hidden the club (5a) — so posting in a club can still link you to it publicly. Because every member follows their club automatically, anyone who can see a member list can tell those members follow the club.
- **Your "active now" status**, from the last-active timestamp.
- **That you viewed their profile** (see 3d) — shown to the profile owner with your name, handle, and avatar.

### 5c. Only you

- Your sign-in email, school email, password hash, consent record, Otto settings and reminders, saved posts and collections, personal calendar entries, when you last set your campus, drafts, notifications, mutes, dismissed suggestions, and the geometry of your resume redaction bars.
- The list of people who viewed your profile (up to your 25 most recent viewers).

(Your block list is *not* only-you; see 5d.)

(The clubs you follow and the club invites you receive are *not* only-you either; see 5f.)

### 5d. People you message

- Members of a chat see your messages, attachments, reactions, and a **read receipt** (when you last read the thread) and a **typing indicator**. Messages you send remain visible to the other members until you delete the message or your account.
- Blocking someone stops new messages in both directions and hides you from each other; it also removes their access to your resume. We do not send the person a notification, but the app does tell their device that a block exists so it can hide you from each other — if they open your profile they will see that the account has restricted them. Mutes are one-sided and invisible to the muted person.

### 5e. Us (the operator)

Direct messages and group chats are **not end-to-end encrypted**. They are stored in our database and are readable by the people with administrative access (section 1). We use that access to investigate reports, debug problems, respond to legal process (section 6e), or check for content that breaks the Terms. We do not keep an audit trail of administrative reads. **[DECISION: the Terms reserve the right to check content proactively; if you would rather promise "we only read messages when a report or legal request requires it," drop "or check for content that breaks the Terms" here and drop "but we may" from Terms §6. Both documents must say the same thing. Draft assumes: the reserved right stays in both.]**

### 5f. A club's owner and admins

The owner and admins of a club (not its moderators or other members) can see:

- **That you follow the club**, when you first followed it, how you started (by joining, from its page, from the clubs list, or during onboarding), whether you are also a member, and the profile card they would see anywhere else on Vibe: name, handle, photo, banner, major, year, and how many connections you share. If you unfollow and follow again, they see your first follow date. On clubs you must ask or be invited to join, the app tells you this next to the Follow button.
- **Invites to join that club** that its owner or admins sent you, and whether you accepted, declined, or let the invite expire.

No one else can see which clubs you follow, except as described for club members in 5b. Clubs don't get a notification when you follow them. An owner or admin can remove you as a follower, unless you are also a member of the club: a member's follow ends only when the membership does. You are not notified, and you can follow the club again.

## 6. Third parties who process your data

We use a small number of vendors to run Vibe. Our infrastructure vendors — Supabase, Vercel, Cloudflare, Resend, and Sentry — process data for us under their published customer terms and privacy policies. Google Fonts, cdnjs, and the Gmail inbox that receives our support email are governed by Google's and Cloudflare's own privacy policies; we have no separate agreement with them. The table below plus section 6a is the complete list of outside services that receive personal data. **[REVIEWER: confirm whether each infrastructure vendor's standard terms or DPA restrict processing to service provision, and whether a stronger sentence is warranted. Draft assumes: the softer "under their published customer terms" wording.]**

| Vendor | What they hold | Why |
|---|---|---|
| **Supabase** | The entire database (accounts, profiles, posts, messages, reports, consent records); authentication (email, password hash, sign-in tokens, an auth audit log); file storage for profile photos, banners, post images, video poster frames, work-experience logos (public bucket) and resumes (private bucket) | Database, sign-in, and file storage |
| **Vercel** | Runs the Vibe website and server code; keeps short-lived request logs (request path, IP address, browser user agent, and any server error output) | Hosting |
| **Cloudflare** | **R2 object storage** for video clips, chat photos/videos, group photos, and org banners/logos/media. Chat photos/videos and group photos are served through links that expire after 5 minutes. Video clips and org post media are served through a permanent link on our domain that redirects to a storage link valid for 1 hour, with no sign-in required; org banners and logos work the same way. Also our **DNS** and **Email Routing**, which forwards mail sent to hello@connectvibe.app to our Gmail inbox | Media storage, DNS, inbound support email |
| **Resend** | Recipient email address and the content of the three transactional emails we send (signup confirmation, password reset, school-email verification), sent from noreply@connectvibe.app. Resend keeps a log of sent emails | Sending email |
| **Sentry** | Error reports and a 10% sample of performance traces from the website and server: stack traces, route/page names, and standard request context. Configured with personally-identifying defaults off; we never attach your user id or email | Error monitoring |
| **Google** | Gmail holds any support email you send to hello@connectvibe.app (via Cloudflare forwarding) | Support inbox |

Our vendors are U.S. companies; some operate global edge networks. We will confirm where each vendor stores your data on request. **[DECISION: the storage region for each vendor is set in that vendor's dashboard, not in our code. Confirm the Supabase project region, Vercel function region, Sentry data-residency region (US or EU), and Resend region before publishing, then either add a "Where" column with the confirmed values or keep the sentence above. Draft assumes: keep the sentence, no regions listed.]**

### 6a. Requests your browser makes directly

When you load Vibe, your browser also contacts:

- **Google Fonts** (`fonts.googleapis.com`, `fonts.gstatic.com`) to download the site's typefaces on every page. Google sees your IP address and browser user agent for that request. Google's privacy policy governs it.
- **cdnjs** (`cdnjs.cloudflare.com`, run by Cloudflare) to load the PDF viewer library — on every profile page when you use Vibe on a desktop browser, and on a phone only when a resume PDF is opened. **[DECISION: lazy-load the PDF library on the desktop profile page so it is fetched only when a resume is opened, then simplify this bullet. Draft assumes: today's behaviour, disclosed.]**
- **Supabase** (our project's `*.supabase.co` address) for sign-in and data requests, and **Cloudflare R2** signed links for media.
- **Sentry** to deliver browser-side error reports.

No advertising network or analytics service is contacted.

### 6b. Other Vibe users

Described in section 5. Remember that anything you share can be screenshotted or copied by the people who can see it, and we cannot recall those copies.

### 6c. Indiana University and Purdue University

Vibe sends nothing to IU or Purdue. Neither university can see your Vibe account, your messages, or whether you verified. Verification works by us emailing a link and a code to your school address; the university is not involved beyond delivering that email.

### 6d. Business transfers

If Vibe is acquired or merges with another company, your data would transfer with it. We will tell you before your data transfers to a new operator, and this policy would continue to apply until you were told otherwise.

### 6e. Legal and safety

We will disclose information if required by law, subpoena, or court order, or when we believe in good faith it is needed to prevent imminent harm, investigate fraud or abuse, or protect the rights and safety of users, the public, or Vibe. **[REVIEWER: whether to commit to notifying you of legal requests where legally permitted. Draft assumes: no such commitment.]**

## 7. Cookies and data stored in your browser

**Cookies.** Vibe sets only the cookies needed to keep you signed in (named `sb-<project>-auth-token`, sometimes split into numbered parts). There are no advertising, analytics, or consent cookies. Because there are no non-essential cookies, there is no cookie banner.

**Local storage.** To make pages load faster, your browser keeps a local copy of some of your own data: your profile card, cached posts, your relationships list, calendar events, recent search terms, flags for which onboarding tours you've seen, a draft of what you've typed during onboarding (so a refresh doesn't lose it), and — if you set up Otto in a desktop browser — the name you gave Otto and when setup finished, plus the text of the last post you published with Otto's help (your Otto setup answers themselves are not kept in your browser). This stays on your device, is never sent to us except through the normal app requests described above, and is cleared when you clear site data in your browser. The onboarding draft is removed when you finish or skip onboarding, and when you sign out or delete your account from Settings or sign out from the Terms screen. A draft left untouched for 14 days is ignored and removed the next time onboarding opens.

## 8. How long we keep things

- **Your account and content:** until you delete them.
- **Individual items you delete.** Deleting a post or a message removes it from the database immediately. What happens to the attached file depends on its type. There is no automatic cleanup job for leftover files; the only thing that removes them later is account deletion (section 9d), and only for files stored under your own account.
  - **Video posts from your own profile:** deleting the post also removes the video file (best-effort). If the file removal fails, the post is still gone but the video file may remain in storage until you delete your account. The poster frame (the still image shown before the video plays) is **not** removed with the post; it stays at its public link until you delete your account.
  - **Image posts:** deleting the post removes the post, but the image file stays in storage — still reachable by anyone who saved its direct link — until you delete your account. **[DECISION: fix in code so deleting an image post also deletes the image, then simplify. Draft assumes: today's behaviour, disclosed.]**
  - **Posts you made into an org:** images and videos uploaded into an org's own storage are **not** removed when the post is deleted, and are **not** removed when you delete your account. They belong to the org's storage.
  - **Messages:** deleting a single message removes the message but **not** its attached photo or video file. Because the deleted message no longer points at the file, the file is also **not** removed when you later delete your account; it stays in storage behind an expiring link that no page will ever mint. **[DECISION: fix in code so per-message deletion also removes the file, then simplify this bullet and section 9d. Draft assumes: today's behaviour, disclosed.]**
  - **Comments:** you cannot currently delete an individual comment. It is removed when the post it is on is deleted, or when your account is deleted. **[DECISION: build comment deletion in the UI — the database already allows authors to delete their own comments; only the button and route are missing. Draft assumes: no comment deletion, disclosed.]**
- **Files you replace or remove from your profile** (a profile photo, banner, or work-experience logo): the previous file is not removed when you upload a new one or clear the field. It stays at its public link until you delete your account. **[DECISION: delete the previous object on replacement or removal, then simplify. Draft assumes: today's behaviour, disclosed.]**
- **Clubs you follow:** until you unfollow, a club's owner or an admin removes you, you leave or are removed from a club whose follow came from joining it, or your account or the club is deleted. The date you first followed a club is kept after you unfollow or are removed, so following again keeps your original date. It is deleted with your account or the club.
- **Club invites:** an invite you don't answer expires after 30 days. The invite and its outcome are kept until your account or the club is deleted. After you decline, the same club can't invite you again for 14 days.
- **Edited posts:** each edit overwrites the earlier text; only the time of the latest edit is kept.
- **Rate-limit counters** (which may contain your IP or email): eligible for deletion after one day; cleaned up opportunistically, so they may persist for a few days at low traffic (section 3d).
- **Notifications and profile-view history:** kept until you or the other party deletes the account. **[DECISION: add a retention window, e.g. delete notifications and profile-view rows older than 90 days. Draft assumes: kept until account deletion.]**
- **Reports you file, and reports about you:** kept so we can act on patterns of abuse. Your identity as the reporter is removed when you delete your account, but the report text itself (which may name other people) is kept. **[DECISION: set a retention window for reports, e.g. 2 years, or until resolved plus 1 year, and add a prune. Draft assumes: kept indefinitely, disclosed.]**
- **School-verification links:** valid for 48 hours. **School-verification codes** (typed instead of tapping the link): valid for 30 to 60 minutes. **Password-reset and signup-confirmation links:** valid for 1 hour.
- **Consent records:** kept for the life of your account and deleted with it (see section 9d).
- **Vendor logs after deletion:** see section 9d.

We do not currently run automated database backups. That means we cannot restore data you delete by mistake — and it also means deleted data does not linger in backup copies we control. **[DECISION: if the Supabase plan is upgraded to enable daily backups, update this section to state the backup retention window (7 days on Pro) and that deleted data may persist in backups for that long. Draft assumes: no backups.]**

## 9. Your choices and rights

### 9a. See and edit your data

Everything in your profile can be viewed and edited at `/profile`. Otto settings live on the Otto page. Blocked users, handle changes, and account deletion live in **Settings**. You can remove any post, message, document, or photo you added. Resume files you remove are deleted from storage at the same time (best-effort); photos you remove from your profile stay in storage — see section 8. You cannot currently delete an individual comment; it goes away when the post or your account is deleted (section 8). **[DECISION: build comment deletion in the UI. Draft assumes: not available, disclosed.]**

### 9b. Block, mute, and report

Block or mute someone from their profile. You can report a **user** (from their profile, or from a one-to-one chat with them) or a **post** (from its menu). There is not yet a menu option to report a specific message or a group chat; to report one today, report the user or email hello@connectvibe.app with details. **[DECISION: add message/channel report entry points in the UI — the server already accepts them. Draft assumes: not available, disclosed.]** Reports go to us; we review them by hand. If a post is changed after you report it, we review the post as it is when we look. Today there is no automated moderation. We aim to look at every report within 7 days; that is an aim, not a guarantee. **[DECISION: same default in both documents. Draft assumes: the 7-day aim, stated identically in Terms §6. Alternative: drop the sentence in both and promise no response time.]** **[DECISION: a post can be edited after it is reported and before we review it, and a report does not keep a copy of the post's text. Draft assumes: disclosed as-is in both documents; a later change may store the reported text with the report.]**

### 9c. Get a copy of your data

Email **hello@connectvibe.app** from the email address on your account and ask for an export. (You can see which address that is in Settings.) There is no automated export yet, so we assemble it by hand from our database and send it back as machine-readable files (JSON and/or CSV) plus your uploaded files, within 30 days. To protect you, we will only send an export to the sign-in email on the account, and we may ask you to reply from that address or to make a small change to your profile so we can confirm you control it. **[DECISION: response window. Draft assumes: "within 30 days."]**

### 9d. Delete your account

Go to **Settings → Danger zone**, type your handle to confirm, and your account is deleted immediately. There is no grace period and no undo. You can do this even if you have declined the current Terms.

**When you confirm, we:**

1. **Delete every file you uploaded** — profile photo and banner (including older ones you replaced), post images, video poster frames, logos on your work-experience entries, your resumes and the redacted copies we generated, your video clips, and the photos and videos attached to messages you still have. If removing your files fails part-way, your account is not deleted and you can retry; files already removed stay removed. We never delete the account and leave your files behind.
2. **Delete your login, and with it every record tied to your account.** If this step fails after your files were removed, your account still exists and you will be asked to retry. The records removed:
   - *Profile and posts:* profile, posts and drafts, comments, likes, reposts, saves and collections, post views.
   - *People:* follows and connections, blocks and mutes in both directions, profile views you made and received, dismissed suggestions.
   - *Orgs and events:* org (club) memberships, the clubs you follow and the dates you first followed them, join requests, club invites sent to you, events you created (and everyone's RSVPs to them), your own RSVPs.
   - *Messages:* chat memberships, messages you sent (the people you messaged lose them too), your reactions.
   - *Settings and records:* personal calendar entries, Otto settings and reminders, notifications (sent to you and triggered by you), your school verification, and your consent record.

You are then signed out.

**What stays with your name removed** (the field that pointed at you is cleared):

- Orgs you created keep existing for their members; the owner field is cleared. The org's logo, banner, and post media live in the org's own storage and are not affected.
- Channels you added people to, and join requests you resolved, keep existing with the "added by" / "resolved by" field cleared.
- Club invites you sent or withdrew as a club's owner or admin keep existing for that club, with the "invited by" / "withdrawn by" field cleared.
- Reports you filed are kept for safety review with the reporter field cleared.

**What stays because it was never tied to your account:**

- Group photos and org media stored under the group or org (not under your account), including images and videos you posted into an org.
- Photos or videos attached to *other* people's messages, even if they were sent in a chat with you.
- Files attached to messages you had deleted one by one before deleting your account (section 8) — the purge cannot find them, so they remain in storage.
- Copies other users made (screenshots, downloaded images, forwarded links to public files captured before deletion), and content other people made about you (their replies or messages quoting you), which is theirs.
- Your handle, which becomes available for someone else to register. **[DECISION: reserve deleted handles for a period, e.g. 90 days, to prevent impersonation of a departed user. Draft assumes: immediately reusable.]**

**What lingers briefly with our vendors, outside our control:**

- Supabase's authentication audit log and request logs, kept for that plan's log-retention window (currently measured in hours to one day on our plan).
- Vercel's runtime request logs (currently one hour to one day depending on plan).
- Resend's record of emails sent to you, for Resend's retention period. **[DECISION: confirm the email-log retention window for our Resend plan in the Resend dashboard and state it. Draft assumes: "for Resend's retention period" until confirmed.]**
- Sentry error events that happened to include your handle in a URL, for Sentry's retention period. **[DECISION: confirm Sentry retention in the Sentry dashboard (default 90 days on most plans) and state it. Draft assumes: "for Sentry's retention period" until confirmed.]**
- Rate-limit counters keyed by your IP or email: eligible for deletion after one day, cleaned up opportunistically (section 3d).

We do not keep a "banned users" list or any record of deleted accounts — whether you deleted the account yourself or we deleted it for breaking the Terms. **[DECISION: if the founder wants to prevent re-registration of removed accounts, a retained hash of the sign-in email must be built and disclosed here as a ban record. Draft assumes: no ban list, nothing retained.]**

### 9e. Withdraw consent

You can stop using Vibe and delete your account at any time (9d). If we change the Terms, you can decline the new version. Until you accept, you will be shown the new Terms whenever you open Vibe, and you can only use the pages listed in section 2 — Settings (to delete your account), these legal pages, public profile and org links, and direct links to individual posts.

## 10. Security

What we actually do:

- **Encryption in transit:** all traffic to Vibe uses HTTPS (HSTS enabled). Our vendors state that they encrypt stored data at rest; we rely on their defaults.
- **Private storage for resumes:** resumes live in a private bucket. They are reachable only by signed-in users through 5-minute expiring links, and only if neither party has blocked the other. Redaction bars are applied on our server, and viewers other than you never receive the unredacted file. If the redacted copy cannot be generated, the request fails rather than falling back to the original.
- **Expiring media links:** chat photos and videos, group photos, and resumes are served through links that expire after 5 minutes. Video clips, org post media, and org banners and logos are served through a permanent link on our domain that redirects to a storage link valid for 1 hour; those do not require sign-in.
- **Server-authorized uploads with limits:** every upload is authorized by our server, is size-limited, and is rate-limited per user. Profile photos, banners, post images, posters, logos, and resumes are received by our server and stored from there; video clips, chat photos and videos, group photos, and org media are sent by your browser straight to Cloudflare R2 using a short-lived, size-bound link our server signs. Current limits: profile photo and banner 6 MB; post image 8 MB; resume 8 MB; video poster frame and work-experience logo 2 MB; chat image 15 MB; group photo 10 MB; org banner 10 MB, org logo 5 MB, org post image 15 MB; any video 200 MB. These may change.
- **Database access controls:** row-level security and column-level grants mean the browser can only read what the signed-in user is allowed to see; your email, school email, consent record, Otto setup answers and settings, and your resume document list, resume links, and redaction bars are readable only by server code (you can still edit your own resume entries, but no other user's browser can read them directly from the database). Otto reminders are readable by you alone. The resume files themselves are reachable only through our server, as described in section 5b.
- **Rate limits** on sign-in-related actions, posting, messaging, reports, resume views, and uploads.
- **Passwords** must be at least 8 characters, and every new account must confirm its email before use.

What we do not have, so you can decide accordingly:

- **No two-factor authentication** on Vibe accounts. Use a strong, unique password. Vibe cannot enable 2FA on your email account; that is up to your email provider.
- **No end-to-end encryption** for messages (section 5e).
- **No checking of passwords against known breach lists** at present.
- **No independent security audit or certification** (SOC 2, ISO 27001, penetration test) has been performed. We ran an internal security review in September 2026 and addressed its highest-priority findings (private resume storage, server-side redaction, file purge on account deletion, upload limits, and consent capture). Some lower-priority items from that review remain open, and we make no guarantee that Vibe is free of vulnerabilities.
- **No audit trail** of reads by the people with administrative access (section 1).

**If we learn of a breach** that exposes your personal information, we will notify affected users by email and tell you what happened, what data was involved, and what we are doing about it. We will do this without unreasonable delay and within the time Indiana law requires. **[REVIEWER: confirm Ind. Code 24-4.9 timing. Draft assumes: no number of days is stated in the policy.]**

To report a security issue, email **hello@connectvibe.app** with "security" in the subject.

## 11. Copyright complaints

If you believe content on Vibe infringes your copyright, email **hello@connectvibe.app** with the link to the content, a description of the work, your contact details, and a statement that you believe in good faith the use is unauthorized. We will remove infringing content and may remove accounts of repeat infringers. **[REVIEWER: whether to register a DMCA designated agent with the U.S. Copyright Office to obtain safe-harbor protection. Draft assumes: no agent registered; good-faith email process only, matching Terms §4.]**

## 12. Age

Vibe is for adults. **You must be 18 or older to use it.** We enforce this by requiring you to confirm your age at signup; we do not collect a date of birth or verify age against any document.

If we learn that someone under 18 has an account, we will delete it and the data it holds, following the same steps as section 9d, run by hand. If you believe a minor is using Vibe, email **hello@connectvibe.app**.

**[DECISION: some IU and Purdue first-year students are 17. Options: (a) keep a strict 18+ rule as written; (b) allow 17-year-olds with a parental-consent process (not built) and restricted features. Draft assumes: (a), which is what the code and the signup checkbox implement.]** **[REVIEWER: confirm that an attestation-only checkbox is sufficient, and that the previous COPPA (under-13) language can be omitted because it contradicts an 18+ rule. Draft assumes: attestation only, no COPPA text.]**

## 13. How we record your agreement, and changes to this policy

When you sign up, you must check the box **"I'm 18 or older and I agree to the Terms of Service and Privacy Policy."** We store: the version of the Terms you accepted, the server time you accepted, that you attested you were 18+, and whether you accepted at signup or on the re-consent screen. We do **not** store your date of birth, your IP address, your browser details, or a copy of the document as displayed. The record is kept with your account and deleted with it. **[DECISION: whether a minimal consent record (version + timestamp, no identity) should outlive account deletion for evidentiary purposes. Draft assumes: deleted with the account, which is what the code does.]**

**Versions.** Both this policy and the Terms carry the same dated version string at the top (today: `2026-09-07`). Only the Terms version is recorded in your consent record; there is no separate Privacy Policy version. Because you accept both documents with one checkbox, the recorded Terms version also identifies the version of this policy that was in force when you agreed. **[DECISION: add a separate privacy_version to the consent record. Draft assumes: a single Terms version, and this policy rides on the same checkbox — stated identically in Terms §14.]**

**When we change this policy or the Terms** in a way that matters, we publish a new version with a new date. The next time you open Vibe you will be shown the change and asked to accept it. Until you do, you can only use the pages listed in section 2 (see also section 9e). Continued use alone does not count as acceptance; you must actively accept. You may instead export or delete your account. **[DECISION: TERMS_VERSION in the code must be bumped to "2026-09-07" when this policy is published, or existing users will not be re-prompted. Draft assumes: bumped in the same deploy.]**

**Minor corrections** (typos, or clarifications that do not change what we do or your rights) do not change the version and do not trigger re-acceptance. When we make one, we add a "Last corrected" line under the effective date so you can see that the wording moved; the version string and effective date stay as they are. Any change to the version string re-prompts every user.

## 14. State law and where you live

Vibe is operated from Indiana and governed by Indiana law. The choices in section 9 — access, correction, export, deletion, and withdrawal of consent — are available to every user regardless of where they live, at no charge, by email to **hello@connectvibe.app**. We do not sell or share personal information for advertising. We do not use automated systems to make decisions about you that have legal or similarly serious effects. We do not discriminate against you for exercising these choices.

If you live in a state whose privacy law gives you additional rights, or outside the United States, contact us at the same address and we will honor those rights to the extent the law requires. **[REVIEWER: Vibe is well under the user-count and revenue thresholds of the Indiana Consumer Data Protection Act (effective Jan 1, 2026) and of CCPA/CPRA; confirm no state-specific disclosures are currently required and whether to include an EU/UK notice at all. Draft assumes: no state-specific or EU/UK section beyond this paragraph.]**

## 15. Contact

**hello@connectvibe.app**

**[DECISION: postal address of the operating entity. Draft assumes: placeholder until an entity and address are chosen.]**

The current version of this policy: **connectvibe.app/legal/privacy**. Terms of Service: **connectvibe.app/legal/terms**. Both are linked from Settings in the app.

---

*Previous version: May 7, 2026.*
