# L2: plain-English read of Privacy Policy v2

Read 2026-10-03. File read whole: `handoffs/legal-2026-10-03-privacy/privacy-policy-v2.md` (361 lines). For the house voice: `src/app/legal/privacy/page.tsx`, `src/app/legal/community/page.tsx`, and the paragraph of `src/app/legal/delete-account/page.tsx` that already explains the scrambled email code. Read as two people: a first-year on a phone, and James handing this to a lawyer. Nothing was changed except this report. This is an editor's read, not legal advice and not a fact check (V2 to V6 check the facts, L1 reads it as a hostile reader).

## The short answer

The draft is honest and the facts are in a sensible order. It is not yet written for a student. Three things stand in the way.

1. **It speaks as the codebase, not as us.** The subject of the sentence is often "our code", "our server", "the database", "a row" or "nothing" ("No Vibe code sends...", "Nothing deletes these rows", "the database rule behind it does not apply the block"). The Community Guidelines say "we" and "a person reads it". This page should too.
2. **About 85 words or phrases need a plain swap or a one-time explanation.** The worst is "keyed hash": first used in 3d, explained only in section 9, and used in the waitlist section with no explanation at all. The live delete-account page already has the house wording: "a scrambled code ... can't be turned back into an address".
3. **The same fact is told in three or four places.** That is where the length is. The cut list in part 4 removes about 915 words without dropping a fact.

Counts: 12 must-change (a reader would misunderstand); 31 cuts worth about 915 words, plus the wording in parts 1, 2, 3, 5 and 7 (should-change); 5 other pages or drafts that contradict.

## Counts used in this report

| What | Words |
|---|---|
| The file as it stands, drafting note and brackets included | 7,610 |
| Minus the drafting note and the 20 brackets (575 words) | 6,965 |
| Minus table bars, list dashes and other marks: the words a reader will see | about 6,740 |
| The aim | 5,500 to 6,000 |
| After the cut list in part 4, with the plain-English additions put back in | about 5,950 |
| If the code fixes L1 asks for ship first, so the M10 sentences and the starter-name row can go | about 5,800 |

So "about 7,000" is really about 6,740 published words. The gap to 6,000 is about 740, not 1,000.

The live legal pages have only four building blocks (`LegalLayout`, `LegalH2`, `LegalP`, `LegalUL`). The draft uses five things they cannot show yet: 4 tables, 16 third-level headings (3a to 3g, 5a to 5i), 2 numbered lists, a boxed short version, and 23 "section N" pointers that need to be links. Whoever builds the page needs to know this before the wording is locked.

---

## A. Must change: a reader would misunderstand

### M1. "Admin" and "moderator" each mean two different people
- Text: section 1 "All three are platform admins and moderate Vibe"; section 4 "Admins also get an alert when a report comes in"; 5e "the owner, the admins and people they add"; 5f "Owners and admins see the follower list"; 5f "Owners, admins and mods"; 5h "If a moderator removes your post"; section 10 "the admin accounts"; 5f "Officers never see email addresses and never see reports".
- Problem: in sections 1, 4 and 10 an admin is a cofounder. In 5e and 5f an admin is a club role. "A moderator" is a cofounder in 5h, 8 and 9, and "mods" are a club role in 5f. A student reading section 4 will think club admins get report alerts, which 5f denies. "Officers" is never defined: 5f uses it for owners, admins and mods together, while the Officers room in 5e leaves mods out.
- Fix: the cofounders are always "the Vibe team". Club roles always carry the word club: "club owners, club admins and club mods" (the app's own labels are Owner, Admin, Mod). Say once, at the top of 5f, who "officers" are. Section 4: "The Vibe team also gets an alert when a report comes in."

### M2. Section 3c, photo details: "These keep" points the wrong way
- Text: "Our server rebuilds these photos without their hidden details, including location: your profile photo and cover, photos on your own posts, work logos and résumé images. These keep their original details, which can include where they were taken or filmed: videos, photos on a club's posts, ..."
- Problem: "These" at the start of the second sentence reads as the photos just listed. A student will take it to mean the opposite of what is meant. This is the one place where a misread has a safety cost (a location inside a chat photo).
- Fix: two labelled lists.
  - **Location and other hidden details removed:** your profile photo and cover, photos on your own posts, work logos, résumé images.
  - **Not removed (the file can still say where it was taken):** videos, photos on a club's posts, club logos and banners, photos and videos sent in chats, group chat pictures, résumé PDFs.
  - Then the one line about photos from before late September 2026.

### M3. Section 9, step 2: "Every other file you uploaded is erased" is not true as a sentence
- Text: "Every other file you uploaded is erased, including the photos and videos on messages that still exist."
- Problem: ten lines later, "What stays" item 5 lists files that are not erased (files of messages deleted one by one, group pictures, photos and videos posted as a club). Section 8 says the same. A reader who stops at step 2 leaves with the wrong idea.
- Fix: "Your other files are erased, except the ones in the 'What Vibe does not delete yet' list in section 8."

### M4. Section 9: "(item 4 below)" sends the reader to the wrong item
- Text: step 2 "Evidence files (item 4 below) are moved to a locked folder."
- Problem: section 9 has two numbered lists, steps 1 to 5 and "what stays" 1 to 12. The nearest "4 below" is step 4, "Your sign-in is deleted". The lawyer's bracket ("items 1 to 4") has the same problem.
- Fix: keep numbers for the steps and give the "what stays" list bold labels with no numbers, or letters (a to l). Step 2 then says "Evidence files (see 'Evidence files' under What stays)".

### M5. Section 11 and the short version: "up to 40 days ... whatever happens"
- Text: "We keep your answers for up to 40 days after you join the list, whatever happens."
- Problem: "whatever happens" reads as "even if you ask to leave", which the next paragraph ("Leaving sooner") denies. Two lines on, re-sending the form "restarts the 40 days", so "up to 40 days after you join" is not true either. The paragraph holds five numbers (40, 30, 7, 14, daily) in six sentences.
- Fix: a small table, then two sentences.

  | What | How long |
  |---|---|
  | Your entry | Deleted within 40 days of the last time you sent the form |
  | An entry you never confirm | Deleted within 30 days of our last confirm email |
  | The confirm link | Works for 7 days |
  | An access code | Works once, for up to 14 days |

  "This holds whether or not you get a code. To leave sooner, use 'Take me off the list'." Short version: "we delete your answers within 40 days". V6 and L1 M14 check the exact rule; the point here is the shape, and that "whatever happens" has to go.

### M6. "Keyed hash" is explained about 3,700 words after its first use
- Text: 3d twice ("a keyed hash of the email", "a keyed hash of the address"), then section 9 item 1 explains it, then section 11 ("a keyed hash of the address", "its hash is wiped") and section 12 ("the keyed hashes in section 9").
- Problem: the explanation sits about 3,700 words after the first use. A waitlist person who reads only section 11 never sees it.
- Fix: use the wording already live on `/legal/delete-account`: "a scrambled code made from the address. The code cannot be turned back into the address." Say it at the first use in 3d and once more in section 11. Everywhere else: "the scrambled code". Drop "keyed hash" from the page.

### M7. Section 2: the refused addresses read as if Purdue Fort Wayne were a retired IU address
- Text: "Refused: retired IU addresses such as @iupui.edu, @pfw.edu, @pnw.edu, and every other school."
- Problem: @pfw.edu and @pnw.edu are Purdue Fort Wayne and Purdue Northwest. The commas make them examples of "retired IU addresses".
- Fix: "Not accepted: @iupui.edu (retired), @pfw.edu and @pnw.edu (Purdue Fort Wayne and Purdue Northwest), and every other school."

### M8. Section 2: "Verifying is a step in the app, not a privacy wall"
- Problem: nobody outside the build knows what a privacy wall is, and the fact under it matters: an account with no school email can still read everything in 5b.
- Fix: "Verifying lets you post, comment and message. It does not hide anything: an account that has not verified can still read everything in section 5b, except résumés."

### M9. Short version, bullets 4 and 5
- Bullet 4 text: "The person sees how many people looked and, with Vibe+, who." "The person" can be read as you. "Vibe+" is not explained until 3f.
- Bullet 5 text: "We read private messages only in the three cases in section 5." Section 5 is nine parts and about 1,230 words. The three cases are in 5h, inside one 39-word sentence, with no numbers. A student cannot find them.
- Fix: say the cases in the bullet (see part 3 for wording), point to 5h, and make the 5h sentence a numbered list of three.

### M10. Sections 5b, 5e and 5g: four sentences about "our database" that do not say what it means for you
- Text: 5b "From our database, though no screen shows it: ..."; 5e "The app does this; the database rule behind it does not apply the block."; 5e "other members of a chat can read from our database when you last read it..."; 5g "the block record can be read from both sides."
- Problem: a first-year cannot tell from any of these whether the person they blocked can find out, or whether a stranger can see when they were last online. James cannot explain them to a lawyer either.
- Fix: say the outcome. 5g: "The person you blocked gets no notice. Someone with technical skill could still find out." 5e: "In club chats a block only hides messages on screen. Treat what you write in a club room as readable by every member." 5b: "Any signed-in account can also find out, for any account: the day it was made, when it was last active, when its handle last changed, and its total profile views." L1 (M3) recommends fixing these four in code and deleting the sentences. That is the better outcome and saves about 110 words.

### M11. Sections 3a and 10: "Read only by our server"
- Text: 3a "Sign-in email: Read only by our server." and "School email: ... Read only by our server."; section 10 "can be read only by our server code".
- Problem: two misreadings. "Read only" looks like "read-only" (cannot be changed). And "only our server" sounds like no person can read it, which section 1 says is not so.
- Fix: "Other people on Vibe never see it." (L1 M7 and M9 cover the factual side: the starter name and the cofounder with direct access.)

### M12. Section 11 does not stand on its own yet
- Text: "This section is for people who joined the waitlist. It stands on its own."
- Problem: it sends the reader to sections 3d and 6, uses "keyed hash", "Limit counters" and "wave" with no explanation, and gives no address to write to. A waitlist person has no account, so "delete your account" and Settings mean nothing to them.
- Fix: in part 6 below (five small additions, about 35 words).

---

## 1. Words a first-year would not know

### 1a. Keep the word, explain it once at first use

| Word | First use, times used | One-time explanation |
|---|---|---|
| IP address | section 1, 12 times | "the number that identifies your internet connection" |
| handle | section 1, 17 times | "your @name" |
| end-to-end encrypted | short version, 3 times | "locked so that only the people in a chat can read it" |
| Vibe+ | short version, 9 times | "a paid plan, not on sale yet" |
| wave, access code | section 2, 7 times | "we are letting people in one group at a time (a wave); your invite email carries a code" |
| redaction bars | 3b, 3 times | "black bars you draw to cover parts of a résumé" |
| evidence folder | section 6 table, before section 8 explains it | "a locked folder where we keep files tied to a report. Nobody else can see it." |
| officers, Board, Lounge, Officers room | 5e | "each club has three chat rooms: Board, Lounge and Officers" plus the M1 definition |
| connected, connection counts | 5a, 5e | never explained. Say what a connection is and how it differs from a follow. |
| scrambled code (was keyed hash) | 3d, 6 times, plus "hash" alone 7 more | M6 |

### 1b. Replace

| Where | Draft says | Plain replacement |
|---|---|---|
| Intro | "inside an app shell" | "the same site, wrapped as an app" |
| Short, 5a | "index them", "may be indexed" | "list them in search results" |
| Short, 3e | "analytics tracker" | "a tool that tracks what you tap" |
| Short | "AI vendor" | "AI company" (3c already says this) |
| Short, 10 | "two-factor sign-in" | "a second sign-in step, like a code on your phone" |
| Short | "moderation records have no set end date" | "we have not set a date for deleting records of reports and bans" |
| Short | "post link previews" | "the preview shown when a post's link is shared" |
| 1 | "platform admins" | "the Vibe team" (M1) |
| 1 | "addresses masked" | "addresses partly hidden, like f*****@iu.edu" (the example is only in 11) |
| 1 | "the database, the file storage and our providers' dashboards" | "the systems that store Vibe's data, and our accounts at the companies in section 6" |
| 1 | "Cloudflare Email Routing" | "a forwarding service (Cloudflare)" |
| 2 | "subdomains such as @mail.iu.edu" | "addresses that end in iu.edu or purdue.edu, such as @mail.iu.edu" |
| 3a | "stores a hash" (password) | "stores a scrambled version that cannot be read back" |
| 3a | "internal account id" | "a number we give your account" |
| 3a, 11 | "wave tag" | "a note of which group you joined with" |
| 3a | "stays on the server" | "is stored; nobody else sees it" |
| 3b | "recruiter snapshot field" | "an old profile field we no longer use" |
| 3c, 5e | "your state in each chat (last read, typing, mute, pin, hide, clear)", "Your chat state" | "your settings in each chat: what you have read, and whether you muted, pinned, hid or cleared it" |
| 3c | "Our server rebuilds these photos without their hidden details" | "We remove the hidden details: the data a camera saves inside a photo, such as where it was taken" |
| 3c | "properties such as the author's name" | "file details such as the author's name" |
| 3d | "your browser pings us" | "your browser tells us it is still open" |
| 3d | "the web address you came from (up to 80 characters); nothing reads it" | "the page you came from. We do not use it." |
| 3d, 9, 11 | "Limit counters" | "Abuse limits: we count how often some actions happen in a short time" |
| 3d | "mostly by account id" | "mostly per account" |
| 3d | "the first half of an IPv6 address" | "part of the address" |
| 3d | "Rows older than a day are removed by a clean-up that runs by chance, not on a schedule" | "Counts older than a day are cleared, but not on a fixed schedule" |
| 3d, 11 | "a coarse domain such as iu.edu" | "the part after the @, such as iu.edu" |
| 3d, 11 | "our email provider's message id" | "our email service's reference number for that message" |
| 3d | "Nothing deletes these rows automatically" | "We do not delete this log yet" |
| 3d | "sign-in tokens" | "sign-in keys" |
| 3d | "details of the failed request", "a post id" | "details of what went wrong", "a post's number" |
| 3d | "travel to our host in the request address" | "are part of the web address your browser asks for, so our hosting company can log them" |
| 3e | "our page headers block it" | cut |
| 3e | "No image scanning" | "We do not scan photos or videos" |
| 3f, 9 | "Stripe customer id", "Stripe event ids" | "your customer number at Stripe", "a list of payment event numbers" |
| 3f, 6, 7, 9 | "push address", "push devices", "push record", "push service" | "notifications to your phone or browser"; "the address your device gives us so a notification can reach it"; "this device's notification setup" |
| 3f | device "kind", "last-seen time" | "type (iPhone, Android or browser)", "when we last saw it" |
| 3f | "Firebase checks in with Google" | "Google's notification service, Firebase, contacts Google" |
| 3f | "analytics or advertising component" | "tracking or ad code" |
| 4 | "enforce limits", "digest" | "limit how often things can be done", "summary" |
| 5a | "poster frame" (twice) | "the still image shown before a video plays" |
| 5a | "The folder cannot be listed" | "Nobody can browse the folder. They need the exact link." |
| 5a | "hands out a storage link good for one hour" | "a link that works for one hour at a time" |
| 5a | "follower count from 5 up" | "follower count once it reaches 5" |
| 5a | "any service a link is pasted into fetches the preview" | "any app a link is pasted into loads the preview" |
| 5b | "set-up accounts", "lifetime profile-view count" | "accounts that finished setting up", "total profile views" |
| 5c | "bars burned in", "fetches it" | "bars made permanent", "loads it" |
| 5e | "Read receipts" | "'Seen' marks" (or keep, most students know it) |
| 5h | "stored as plain text", "the direct database access in section 1" | "stored in a form we can read", "the cofounder with direct access (section 1)" |
| 5h | "serious breach of the Terms" | "serious break of our rules" |
| 5i | "No Vibe code sends anything", "No code sends anything" | "Vibe sends nothing to ... automatically" |
| 5i | "subpoena", "disclose", "new operator" | "a legal order such as a subpoena", "hand over", "new owner" |
| 6 | "password hash, sessions, a sign-in security log" | "a scrambled password, your sign-ins and a log of sign-in activity" |
| 6 | "request logs" | "visit logs" |
| 6 | "R2 storage", "Vercel Blob", "cdnjs", "Email Routing" | name the company and the job; drop the product name or put it in brackets |
| 6 | "a PDF reader script" | "the small program that shows PDFs" |
| 6 | "a 10% sample of performance traces" | "speed measurements from about one page load in ten" |
| 6 | "Typefaces" | "Fonts" |
| 6 | "set in that provider's dashboard, not in our code" | "Each company decides where its servers are" |
| 7 | "`sb-...-auth-token`", "consent or CSRF cookie", "a password-reset token moved out of the address bar", "(message ids only)" | cut all four |
| 7 | "site data", "'tour seen' flags", "onboarding draft" | "your browser data for Vibe", "a note that you saw the welcome tour", "a draft of your set-up answers" |
| 7 | "ends every session of your account" | "signs your account out everywhere" |
| 8 | "deleted by age" | "deleted just because it is old" |
| 8, 9 | "a cache" | "a temporary copy that helps pages load fast" |
| 8 | "No link to it can be made" | "Nobody can open it" |
| 9 | "reason code" | "reason" |
| 9 | "the reporter field is cleared", "with your id blanked", "your old account id" | "your name is taken off them", "with your name removed", "your old account number" |
| 9 | "Email log rows, with the address hash and your account id wiped" | "Our email log, without the scrambled address or your account number" |
| 9 | "acted-on report", "in force" | "a report we acted on", "lasts" |
| 10 | "HTTPS, forced by our headers" | "an encrypted connection (HTTPS)" |
| 10 | "rate limits" | "limits on how often" |
| 10 | "No other site can frame Vibe", "can be read by scripts on our own pages" | cut both (a student can do nothing with either; L1 M2 wants the second gone for safety) |
| 11 | "source tag" | "a tag in the link that says where you found us" |
| 11 | "a founder named in our settings" | "a founder we have set up to do it" |
| 11 | "The email record forgets the address (its hash is wiped)", "a row id" | "Our email log drops the scrambled address", "a row number" |
| 12 | "free the school address" | "let that school email be verified again" |
| 13 | "Each acceptance is kept as its own row" | cut |

### 1c. Words that are plain but not ours

- **"tick"** (9 times: "You tick a box", "Ticking it", "the tick"). A student in Indiana says "check the box". Use "check" and "checkbox".
- **"at once"** (6 times). "Right away" is the warmer word.
- **"by hand"** (7 times). Plain, keep, but two of the seven can go with the cuts in part 4.
- **"school address"** (4 times: sections 2, 5i, 12). Next to "We publish no postal address" it can be read as a street address. Always "school email".

---

## 2. Sentences, negatives, tables and lists

### 2a. Sentences that are too long (36 words or more, longest first)

| Words | Where | Starts | Fix |
|---|---|---|---|
| 78 | 11, What we collect | "We also store your university (from the address); where you came from..." | A list of four: your university; where you found us; when you checked each box; a log of each email we sent you |
| 61 | 9, step 4 | "Your sign-in is deleted, and with it every record tied to the account: ..." (23 items) | Keep every item, but group them in four short lines: your account (both emails, password, profile, proof of agreement); what you posted and sent; your links to people and clubs; your settings and devices |
| 58 | 6 | "What your browser or app contacts directly: ..." | Cut. Every item is already in the table above it (part 4, C1) |
| 47 | 3f, notifications | "If you turn them on once they are switched on, we store each device's..." | Two sentences: what we store; when it is removed (a list of four) |
| 46 | 11, What we collect | "From the form: your school email..." | A list: what you must give; what is optional |
| 44 | 7 | "To load faster, Vibe keeps copies of some of your own data on the device: ..." | The small table in 2d |
| 44 | 3c | "These keep their original details, ..." | M2 |
| 42 | 5b | "From our database, though no screen shows it: ..." | M10 |
| 41 | 5a | "Club pages: name, description, links, logo, banner, ..." | Split at "and the 12 newest posts": that half is the surprise |
| 40 | 11 | "Your account keeps a record of the code you used, and a wave tag: ..." | "Your account keeps the code you used and a note of which group you joined with. The note holds no name, address or answers." |
| 39 | 5h | "We read private messages only when one is reported to us, when we have specific evidence..." | Numbered list of three (M9) |
| 39 | 3d | "Email log. For each email our code sends: ..." | "We log each email we send: what kind it was, when, whether it worked, and a scrambled code of the address." |
| 38 | 5a | "Your profile page: name, handle, tagline, ..." | Fine as a list sentence once 3b stops repeating it |
| 37 | 3b | "What you type or upload: name, handle, year, major, ..." (19 items) | Shorten and point to 5a, which lists the same fields (C9) |
| 36 | 5c | "Another person can open your résumé only if they are signed in..." (four conditions, three of them negative) | A list of four, each stated as a plain condition |

The draft also has 31 semicolons and 48 sentences that run a list after a colon. On a phone, any colon list of more than four items should be a real list.

### 2b. Double negatives and tangled negatives

| Where | Draft | Fix |
|---|---|---|
| 4 | "No news email exists yet, and none will go to anyone who did not tick it." | "There is no news email yet. When there is, it goes only to people who checked that box." |
| 5a | "A block cannot reach people who are signed out: they still see..." | "A block only works while the other person is signed in. Signed out, they can still see your public profile and any club posts you made." |
| 5c | "only if ... neither of you has blocked the other, you are not suspended or banned, and you have not hidden it" | List of four (2a) |
| 5g | "is not notified, but the block record can be read from both sides" | M10 |
| 8 | "No link to it can be made, but it stays in storage." | "Nobody can open it, but the file stays in our storage." |
| 8 | "'Clear chat history' and 'Delete conversation' delete nothing." | The app's own confirm text is kinder and just as true: "only clear your view; the other person keeps their copy." |
| 8 | "We cannot restore something you delete by mistake, and deleted data does not sit in a backup of ours." | "We keep no backups. So we cannot bring back something you delete by mistake, and nothing you delete lingers in one." |
| 9 | "Reporting needs an account that has accepted the Terms and is not suspended or banned. It does not need a verified school email." | "Any account that has accepted the Terms can report, verified or not, unless it is suspended or banned." |
| 9 | "Nothing checks the sign-in-email hash today; it is kept as a record. A ban does not stop someone making a new account." | L1 M4 rewrites this. Whatever replaces it, no "nothing checks". |
| 11 | "Once you have made an account the link is no longer offered: the entry goes with the clean-up, or when you delete the account." | "After you make an account the link stops working. Your entry is deleted within the 40 days, or sooner if you delete the account." |
| 2 and 13 | "Using Vibe never counts as agreeing." and "Using Vibe is never acceptance." | Say it once, in 13 |

Section 3e is nine "No ..." fragments in a row. It reads fine as a short list. It does not read fine as a paragraph.

### 2c. Tables that will not fit a 375px phone: make them lists

- **Section 6, outside services** (3 columns, 10 rows, the middle cell up to 55 words). At 375px each column is about 14 characters wide, so the Supabase row runs about 30 lines. Make it a list. Fold the "Why" column into the label: "**Supabase** (database, sign-in, file storage). It holds ...". The last three rows become one line each under "Off today".
- **Section 3a, your account** (2 columns, but the left cell runs to 11 words: "Verified or not, university, campus, the day the account was made"). Make it a list with a bold label of three words or fewer, or cut each left cell to three words.
- **Section 1, contact** (2 columns). It fits. It also repeats section 15. Keep one (C7).
- **Section 8, how long** (2 columns). It fits. Two fixes: the last row, "School verification link, and code | 48 hours; 30 to 60 minutes", makes the reader pair the halves, and the column is headed "Kept until" when the row means "works for". Split it into two rows and put them under their own heading, "How long a link or code works".

### 2d. Lists that should be small tables (two short columns, they fit)

- **Section 11, how long**: the table in M5.
- **Section 7, kept in your browser**:

  | What | Until |
  |---|---|
  | Your profile card, your posts, follow list, calendar, recent searches, Otto setup, notification setup | You sign out or delete your account |
  | A draft of your set-up answers | 14 days |
  | The email you just signed up with | 24 hours |
  | Theme, "tour seen", which notifications you tapped | You clear your browser data |

- **Section 3c, photo details**: two labelled lists (M2). A two-column table also fits.

---

## 3. The short version

Ten bullets, 233 words. Five run over 25 words. One cannot be understood alone, two are only pointers, and the order is a lawyer's order, not a student's.

| # | Words | True on its own? | Problem |
|---|---|---|---|
| 1 Age | 18 | Yes | "tick". Not the first thing a student wants: the sign-up checkbox already says it |
| 2 Verified | 28 | Yes | 3 over. "at one moment" is odd |
| 3 Public | 28 | Yes | 3 over. Three subjects in one sentence; "post link previews" and "index" are jargon |
| 4 Views | 32 | Mostly | 7 over. "The person" is unclear (M9). "with Vibe+" is unexplained, and Vibe+ is not on sale |
| 5 Messages | 30 | No | 5 over. "end-to-end encrypted" is jargon, and "the three cases in section 5" tells the reader nothing (M9) |
| 6 No selling | 25 | Yes, if "tracker" is read narrowly | "analytics tracker", "AI vendor". Google Fonts and Sentry still see your IP address on most pages (section 6), so "no tracker" will be tested |
| 7 Cofounders | 13 | Yes | A pointer only. L1 flags "exactly" |
| 8 Delete | 15 | Yes | Good. "at once" |
| 9 What we lack | 18 | Yes | Two unrelated facts in one bullet. "moderation records have no set end date" means nothing to a student. "We would rather say so." is the one bragging line on the page |
| 10 Waitlist | 23 | No, the 40 days can restart (M5) | It is the last bullet, and on day one the waitlist people are the main readers |

### Suggested order and wording (each 25 words or fewer, about 230 words in all)

Above the box, as its own line: **Only on the waitlist? Go to section 11. It is all you need.**

1. Most of your profile is public to anyone on the internet, and search engines can list it. (17)
2. Club pages are public too, with their 12 newest posts and who wrote them. A shared post link shows a short preview. (22)
3. We record each profile and post you open, and you cannot turn this off. The owner sees the count and, with Vibe+ (paid), who. (24)
4. We can read messages, but only do when one is reported, when there is evidence of serious abuse, or when the law requires it. (24)
5. All three cofounders moderate Vibe. They can read a copy of any reported message. Section 1 lists what else they can see. (22)
6. We do not sell your information. Vibe has no ads, and nothing you post goes to an AI company. (19)
7. You can delete your account in Settings, right away. Your messages vanish from other people's chats too. Section 9 lists what stays. (22)
8. "Verified" means one thing: the account could once read mail at an @iu.edu or @purdue.edu address. It does not prove enrollment or identity. (23)
9. Vibe is for people 18 or older. You confirm it with a checkbox. We never ask for your date of birth. (21)
10. Two things Vibe does not have yet: a second sign-in step, and a set date for deleting records of reports and bans. (22)

Notes on this version:
- Bullet 4 must match whatever list of cases the lawyer settles for 5h (L1 M13 says there are more than three).
- If the lawyer wants age first, move bullet 9 to the top. Nothing else depends on it.
- L1 (S1) asks for four more facts up here. Keep the box at ten bullets: for each one added, one comes out. The best candidate to add is "photos and videos in chats keep their location"; the best to drop is bullet 10.

---

## 4. Length: the cut list

Start: about 6,740 published words. Every cut below removes a repeat or a build detail. No fact a reader needs goes. Words saved are estimates, counted from the paragraphs named.

### 4a. The biggest repeats

| # | The fact | Where it is told now | Keep it in | Saved |
|---|---|---|---|---|
| C1 | What your device contacts | Section 6 table, then again as an 80-word paragraph under it ("What your browser or app contacts directly") | The list. Keep only the paragraph's last sentence ("Other sites are told only our site's address...") | 65 |
| C2 | What is never deleted | 3a (unfinished accounts), 3b (old field), 3d (counters, email log), 3g (emails to us), 8 intro, 8 table, six bullets in 8, 9 items 4, 5 and 9 | One list in section 8 (see 4c). Section 9 points to it | 85 |
| C3 | The copy kept with a report | 1 (first bullet), short version, 5h, 8 (edit bullet), 9 item 2 | 5h. Section 1: "every report and the copy of what was reported (5h)". Section 9: "Reports about you, with that copy" | 35 |
| C4 | The scrambled email code | 3d twice, 9 item 1 (31-word definition), 9 item 7, 11 twice, 12 | Define in 3d in 15 words. Item 1 of "what stays" drops from 103 words to about 60 | 40 |
| C5 | Abuse counters and IP addresses | 3d (112 words), 9 item 9, 11 twice | 3d in about 55 words: drop IPv6, "the full address", "runs by chance". L1 M6 wants the same trim for safety | 55 |
| C6 | The email log | 3d, 9 item 7, 11 twice | 3d in 30 words; once in 11 (C14) | 13 |
| C7 | How to reach us | Section 1 table, section 15, and help@ or hello@ named six more times. The mail-hosting sentence in 1 repeats three rows of section 6 | One table (section 15, with a one-line pointer in 1, or the reverse). "Google and Microsoft host these inboxes (section 6)" | 45 |
| C8 | 18 or older, no date of birth | Short version, 2, 3e, 12, 13 | 2 and the short version. Section 12 keeps only what happens when we find someone under 18 | 30 |
| C9 | The profile fields | 3b (19 items), 5a (17 of the same), 5g | 5a and 5g. 3b: "Everything on your profile (5a lists it), plus: résumés, the bars you draw on them, the sections you hid, and your 'here for' answers" | 35 |
| C10 | Chat settings and poll votes | 3c and 5e, each twice | 5e. 3c: "Poll votes and sign-ups in club chats (5e)" | 30 |

### 4b. Paragraphs to tighten or merge

| # | Where | What to do | Saved |
|---|---|---|---|
| C11 | 3f, notifications (127 words, feature is off) | Drop "kind, app version and last-seen time". One sentence for what we store, one for when it goes, one for who carries it | 35 |
| C12 | 7 | Drop the cookie name, "consent or CSRF", the reset-token example, "(message ids only)". Browser storage as the table in 2d | 40 |
| C13 | 9, step 4 | Group the 23 items in four lines | 20 |
| C14 | 11 (683 words) | "What we collect" as two lists (147 to 115). "When you sign up with a code" 128 to 85: the wave tag is told twice, and "deleting the account also deletes the entry" is said here and in "Leaving sooner". "What stays" 62 to 45. "How long" as the M5 table | 127 |
| C15 | 10 | "What we do" loses "forced by our headers", "No other site can frame Vibe" and the link times already in 5a and 5c. "What we do not have" becomes two lines that point to 1 and 5h, without the cookie sentence | 40 |
| C16 | 14, 13 | "We do not sell personal information" (third time). "Using Vibe is never acceptance" (second time) | 14 |
| C17 | 2 and 3a | "Making an account" and the 3a table both list what sign-up asks for. Merge into 3a | 20 |
| C18 | 3e | Cut "our page headers block it" and "No card numbers" (3f says it). Move the word-filter sentence to section 4, safety, in 14 words | 16 |
| C19 | Intro | "not part of, sponsored by, endorsed by, or operated by" becomes "not run or backed by". Drop "inside an app shell" | 12 |
| C20 | 3c, photo details | Two labelled lists (M2) | 15 |
| C21 | 9, suspended or banned (79 words) | Keep the privacy facts (what the notice shows, the appeal lives in the inbox). Point to the Community Guidelines for what a suspension does | 19 |
| C22 | 5a, 8, 9 | "Files with a public link" and "Post videos and club media" in one bullet. "Cached photos for a few days" once | 19 |
| C23 | 3d, views | "the page you came from; we do not use it" | 8 |
| C24 | 1, what the team sees (103 words) | Shorter third and fourth bullets | 18 |
| C25 | 13 | Cut "Each acceptance is kept as its own row" and "date of birth" | 11 |
| C26 | 6 | Table to list, "Why" folded into the label | 17 |
| C27 | 3a | Cut "8 to 72 characters". "and the date you last changed campus" | 7 |
| C28 | 5c | The outside-link paragraph in one sentence | 10 |
| C29 | 9, delete your account | "The same button is on the verify, set-up and suspended screens." | 10 |
| C30 | 3d, error reports (54 words) | "We never attach your account or email, and we strip sign-in keys, access codes and profile handles. A club's handle or a post's number can remain." | 14 |
| C31 | 5e | "Polls and sign-ups" and "Who's going" in one bullet | 10 |

**Total cut: about 915 words.**

Words that go back in, about 120: the one-time explanations in 1a (about 60), the five additions that let section 11 stand alone (about 35), where to block and mute (12; the draft dropped the live page's "Block users from their profile"), the waitlist line above the short version (12).

**Result: about 6,740 minus 915 plus 120 = about 5,950.** Inside the aim, at the top of it.

Two ways to go lower, both founder calls:

- **Code first (recommended).** If the four small database-rule fixes in `calls-for-franky.md` section 3 ship, the four sentences in M10 go (about 110 words). If a new account starts with a neutral name (L1 M7), the "starter name" row in 3a goes (about 35). That lands near 5,800.
- **Leave the switched-off features for later (not recommended).** 3f and three rows of section 6 describe Vibe+, phone notifications and the store apps, about 290 words, none of it on today. Cutting it to a 100-word note saves about 190. But the day a feature turns on, the policy changes and every account is asked to accept again. Keeping it, tightened (C11), avoids that.

### 4c. The single list: "What Vibe does not delete yet" (for section 8)

Every line below is a fact the draft already states somewhere. Thirteen lines, about 170 words, replacing about 255 scattered ones.

- The photo or video on a message you deleted. The message goes; the file stays in our storage. Nobody can open it, and deleting your account later does not remove it.
- Group chat pictures.
- A work logo you replaced. It stays at its public link until you delete your account.
- Photos and videos you posted as a club. They stay until the club is deleted.
- Comments. There is no delete button yet. A comment goes when its post or your account does.
- Your messages in a chat or club you have left. They stay, and you can no longer delete them.
- "Clear chat history" and "Delete conversation" only clear your view.
- The date you first followed a club, after you unfollow.
- An account that never confirmed its email or never finished setting up.
- An old profile field we no longer use, on a few early accounts.
- Our email log, and the abuse counts, which are cleared on no fixed schedule.
- Emails you send us, and any proof you send to recover an account.
- Reports, the moderation log, suspension and ban records, and evidence files. No end date is set yet.

Put it in section 8, not 9: the Terms draft points to "Privacy Policy, section 8" for "files that deletion cannot find" (see part 6).

---

## 5. Tone

Vibe's voice on the Community Guidelines page is plain and a little warm: "A person reads it. If we made a mistake, we undo it." The draft is plain. It is not warm, and in four ways it drifts.

### 5a. It reads as the codebase talking (the main one)

The subject of the sentence is the machinery, so the page sounds like an audit, and "we" disappears just where a student wants to know who is responsible.

| Draft | In our voice |
|---|---|
| "No Vibe code sends anything to IU or Purdue." | "Vibe sends nothing to IU or Purdue automatically." |
| "No code sends anything to law enforcement or to ... (NCMEC); where the law requires a report, a founder makes it by hand." | "We send nothing to the police or to NCMEC automatically. Where the law requires a report, one of us makes it." |
| "Nothing deletes these rows automatically." | "We do not delete this log yet." |
| "Otto ... is ordinary code we wrote." | "Otto is Vibe's built-in helper. It runs on our own systems." |
| "account deletion cannot find it later", "Files deletion cannot find" | "deleting your account does not remove it", "Files that deleting your account misses" |
| "are never deleted by any part of Vibe today" | "are not deleted yet" |
| "a clean-up that runs by chance" | "not on a fixed schedule" |
| "wiped", "blanked", "the reporter field is cleared" | "removed", "your name is taken off" |

Counted in the draft: "our server" 6 times, "our database" or "the database" 6, "our code" or "No code" 6, "nothing" 9, "row" or "rows" 5. One pass that puts "we" back as the subject fixes most of them.

### 5b. Alarming without need

- Short version, bullet 9. A list of what is missing, in the box a student reads first, ending "We would rather say so." The facts stay; the framing goes (part 3).
- Section 8: "Almost nothing in Vibe is deleted by age." True and needed, but it opens the section like a warning. Same fact, calmer: "Vibe does not delete things just because they are old. They stay until you, a club or we delete them. The one exception is the waitlist (section 11)."
- Section 8: the bold on "**Its photo or video file is not deleted**". Everywhere else bold marks a label. Here it shouts. Unbold it; the list in 4c carries the fact.
- Section 9: "No waiting period, no undo, no password asked." Three drumbeats. "It happens right away and cannot be undone." (L1 M5 wants "no password asked" gone for safety.)
- Section 9: "A ban does not stop someone making a new account." A student who reported a harasser reads this as "it will not help". L1 M4 rewrites it.
- Section 10, "What we do not have": four "No" sentences and then the cookie. A student can act on none of them. Two lines and two pointers are enough (C15).
- "today" appears 11 times ("You cannot turn this off today", "has no delete button today", "no end date today"). Each one hints at a promise. Rule: write "yet" only where a fix is planned, and nothing otherwise. The lawyer will ask which is which.
- "never" appears 23 times and "cannot" 13. Read in a row they sound defensive. L1 (B1, S7) lists the ones that are also risky promises.

### 5c. Blaming

Nothing blames the reader. Two sentences pass the buck:

- Section 6: "Where each provider stores data is set in that provider's dashboard, not in our code." Reads as "not our problem". "Each company decides where its servers are. Ask and we will tell you what we know."
- Section 3a: "is kept until someone deletes it". Who? "until you or we delete it".

### 5d. Bragging

- "We would rather say so." (short version)
- "It stands on its own." (section 11, about itself). Make it useful: "On the waitlist and nothing else? This section is all you need to read."
- "Section 1 says exactly what they can see." (short version; L1 also flags "exactly")
- "so there is no cookie banner" is fine: it explains something the reader will notice.

### 5e. Legalese

| Draft | Plain |
|---|---|
| "it is not part of, sponsored by, endorsed by, or operated by" | "it is not run or backed by" |
| "We disclose information when a law, subpoena or court order requires it." | "We hand over information when the law requires it, for example under a subpoena or court order." |
| "a new operator" | "a new owner" |
| "another serious breach of the Terms" | "another serious break of our rules" |
| "while the suspension or ban is in force" | "while the suspension or ban lasts" |
| "without unreasonable delay and within the time Indiana law requires" | keep the legal half, add a human half: "as fast as we reasonably can, and within the time Indiana law requires" |
| "personal information", "information", "data" for one thing | "information" in the text. "Data" can stay in the section 1 heading |

### 5f. Where a little warmth costs almost nothing

- The intro says who runs Vibe and that it is independent. It never says why the page exists. One line: "This page says what Vibe knows about you, who can see it and how to delete it. The short version comes first."
- "Ask and we will tell you what we know." (section 6) is the warmest line in the draft. Keep it, and use the same turn in 9 for the data copy: "Ask and we will put it together for you. There is no export tool yet, so allow up to 30 days."
- "founder" (7 times) and "cofounder" (6 times) both appear. Pick one. "One of us" is warmer than either where the count does not matter.

---

## 6. Structure

### 6a. Can a waitlist person find section 11 and read it on its own?

**Find it: not easily.** The only signpost is the tenth bullet of the short version. Section 11 starts about 5,700 words down, roughly 85% of the way through the page. On day one the waitlist people are most of the readers.

- Put a line above the short version: "Only on the waitlist? Go to section 11. It is all you need."
- Give section 11 an anchor (`#waitlist`). Link the form's privacy line and every waitlist email to `/legal/privacy#waitlist`, not to the top of the page.
- Do not move section 11 up. That would renumber 1, 5, 8 and 9.

**Read it alone: not yet (M12).** Five small additions, about 35 words:

1. A contact line. Section 11 has no address: "Questions, or want a copy of your entry? Write to hello@connectvibe.app."
2. Explain the scrambled code in place (M6).
3. Replace "(section 3d)" with the fact: "The form counts requests by IP address to stop abuse. Those counts are cleared within days."
4. Say what a wave is: "We let people in one group at a time."
5. Say where they stand: "Joining the waitlist does not make an account. The rest of this policy applies once you sign up." (L1 B3 covers the consent side: waitlist people never check the Terms box.)

Also inside 11: move "If a founder adds you by hand" after "Why" (it is the rare case and it interrupts), and use the M5 table for "How long".

### 6b. Do sections 1, 5, 8 and 9 keep their meaning for the Terms?

Checked against `handoffs/legal-2026-09-29/02-terms-of-service-v2.md`.

| The Terms draft says | Points to | In v2 |
|---|---|---|
| "can reach the systems that hold your data (Privacy Policy, section 1)" (intro) | 1 | Yes. "Who we are and who can reach your data" |
| "We can read chats when a report or the law requires (Privacy Policy, section 5)" | 5 | Yes, in 5h. The Terms name two cases, 5h names three (L1 M13) |
| "what happens to attached files is set out in the Privacy Policy, section 8" | 8 | Yes |
| "Files that deletion cannot find ... (Privacy Policy, section 8)" | 8 | **Half.** The list is in section 9, item 5. Section 8 has the message file and group pictures but not media posted as a club. The single list in 4c fixes this |
| "Short-lived operational logs at our providers ... (Privacy Policy, section 9)" | 9 | Yes, item 10. The wording differs (see part 8) |

Rules for the edit so the pointers stay true:

- Do not renumber sections 1 to 9, and keep the four headings as they are.
- Nothing in the cut list moves "who can see" out of 5, the deletion steps out of 9, or files out of 8.
- C7 can move the contact table to 15. Section 1 still says who can reach your data.
- C8 thins section 12 but keeps it, so 13 keeps its number (3a points to it).

### 6c. Other structure notes

- **Two numbered lists in section 9** (M4).
- **"5h. Us"** tells a scanning reader nothing. "5h. What we at Vibe can see".
- **23 "section N" pointers.** On a phone a pointer that is not a link is a thirty-screen scroll. Each one needs to be a link, and 3a to 3g and 5a to 5i need anchors.
- **A contents list** under the short version (15 links) is worth its 40 words on a page this long.
- **The page blocks.** `LegalLayout` has no third-level heading, numbered list, table or box today. Either add them (four small components) or rewrite to H2, paragraphs and bullets. Tell the builder before the wording is locked.

---

## 7. Style rules

| Rule | Result |
|---|---|
| No em dashes | Pass. None, and no en dashes. Other marks: one "→" (section 9, "Settings → Danger zone", the same as the live page) and three "·" in section 15. Use line breaks in 15 |
| Sentence case headings | Pass, all 15 section headings and 16 sub-headings. "Vibe Privacy Policy" is the page's name, as on the live page. App labels (Going, Interested, Board, Lounge, Officers, Settings, Danger zone, Campus) pass as labels. Put "Anonymous" in quotes at first use |
| "we" and "you" | "We" holds except where the code is the subject (5a). "You" slips to "an account", "the person" or "someone" where it means the reader, in six places: short version bullet 4 ("The person"); section 2 ("A new account then confirms...", "an account cannot post"); 3a ("An account that never confirms"); 9 ("Reporting needs an account that..."); 13 ("asks every account to accept again"). Use "you" in each |
| "school email", not ".edu email" | Pass, no ".edu email". But "school address" 4 times (sections 2, 5i, 12) and "school mailbox" once. Make all of them "school email" |
| Never "verified student" | Pass, none. One thing to flag for the form, not the policy: section 11 quotes the waitlist checkbox, "I'm 18 or older and a current student", two sections after the policy says verifying "does not prove that you are enrolled" (L1 B3) |
| "club" as the app says it | Pass, 48 uses, no "org". One "student organization" in the intro's independence line. Suggest "any campus, school or club". If the lawyer wants the formal word, it is the only one |

Also for consistency: "tick" to "check" (1c), "founder" or "cofounder" (5f), and "the Vibe team" for the cofounders at work, which is what the Community Guidelines already call them.

---

## 8. Other pages and drafts that contradict the policy

Only what I opened. L1 part F has the full list.

1. **Community Guidelines**, `src/app/legal/community/page.tsx` lines 34 to 36: "Everyone here verified a school email, which means the person on the other end of a post, a comment or a message is a real student at a real school." Policy section 2: verifying "does not prove that you are enrolled", and an account with no school email can read everything in 5b. This is "verified student" in all but name.
2. **Community Guidelines**, lines 53 to 54: "Counts are public; who did what is yours. Nothing on this page changes that." Policy: with Vibe+ the owner sees who viewed (5d); the author is told who liked (5b); club owners and admins see the follower list (5f); polls with names on show who picked what (5e).
3. **Delete-account page**, `src/app/legal/delete-account/page.tsx` about lines 195 to 204: evidence "is kept privately ... for up to a year". Policy section 8: "No end date today". (L1 M15.)
4. **Terms draft**, `handoffs/legal-2026-09-29/02-terms-of-service-v2.md` line 108: "You can delete your own posts, comments and messages". Policy section 8: "A comment has no delete button today."
5. **Terms draft**, lines 245 and 248: provider logs are "short-lived" and "expire on their schedules" (policy 9, item 10: "We have not confirmed how long each is kept"); and "files that deletion cannot find" is cited as section 8 when the list is in section 9 (6b).

The live privacy page (`src/app/legal/privacy/page.tsx`) contradicts the draft in many places (backups for 30 days, "approximate location derived from IP", "aggregate usage analytics", "CSRF protection", "By using Vibe, you agree"). It is the page this draft replaces, so it is not listed.

---

## Recommendation

Do it in this order. Each step is small.

1. Fix the 12 must-change items in part A.
2. One pass that puts "we" back as the subject wherever the code is (5a), with the swaps in part 1.
3. Cuts C1 to C10, the repeats: about 430 words. Then C11 to C31: about 485 more.
4. Build the "What Vibe does not delete yet" list in section 8 (4c) and point section 9 to it.
5. Rewrite the short version (part 3) and put the waitlist line above it.
6. Tell the builder what the page needs: sub-headings, a numbered list, a small table, anchors, and the form linked to `#waitlist`.
7. Count again. The aim is about 5,950, or about 5,800 once the code fixes in `calls-for-franky.md` section 3 ship.

L1's must-change items will add and remove words of their own. They are not in these numbers.

