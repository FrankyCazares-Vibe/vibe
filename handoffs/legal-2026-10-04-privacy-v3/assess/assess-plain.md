# Plain language and voice: Privacy Policy v2, read for v3

Read 2026-10-04 as a first-year student on a phone. Not legal advice.

**What I read.** `handoffs/legal-2026-10-03-privacy/privacy-policy-publish.md` (whole), `calls-for-franky.md`, `changes-after-verify.md`, `verify/L2-plain-english.md` (the October 3 plain-English read, so this report does not repeat it), and the page as built on `release-s74` (`src/app/legal/privacy/page.tsx`, `parts.tsx`; the merges are done, last commit `fe40634`). For the new Messages: `supabase/migrations/20261004100000_chat_message_pins.sql`, `20261004110000_chat_room_post_policy.sql`, `src/lib/chat/pins-read.ts`, `src/lib/chat/room-rules.ts`, `src/components/desktop/messages/rooms-dialog-rules.ts`. Nothing was edited outside this file.

**Skills.** Both loaded and used: `design:ux-copy` (its five tests: clear, concise, consistent, useful, human; its "recommended copy, alternative, rationale" shape is used for the short version in part 3) and `marketing:brand-review` (its findings table and its "unsupported claims" check are part 9). Neither skill has a brand guide for Vibe configured, so the voice rule used is the one in the job: warm, plain, direct, no hype, never names Instagram, no numbers about its size.

---

## 1. The verdict

The October 3 pass did the heavy work. The policy is honest, the jargon is mostly gone, and the sentences are short. What is left is not a reading-level problem. It is four smaller ones:

1. **The short version leans on pointers.** Two of its ten lines send the reader to another section for the answer to the question students ask most: who reads my messages. A short version has to answer, not point.
2. **The order is the company's, not the student's.** A student scrolls past about 1,850 words (the short version, who we are, who can use Vibe, what we collect, how we use it) before reaching "Who can see what". There is no line anywhere that says "people in a chat see your messages" until section 5e, about 2,350 words in.
3. **Several words still mean more than one thing.** "Officers" is the sharpest: the policy says it includes club mods, and the app's new "Only officers post" rule does not. "Code" means five things. "Removed" and "deleted" are mostly kept apart but slip four times.
4. **It is plain but not warm.** Many lines are fragments with no verb ("Off today: ...", "Not public: ..."; five of the eight entries in section 6). Machines are the subject of the sentence where a person should be ("the page asks", "the app tells them", "Vibe's own database keeps no record").

Nothing in it is hype. It never names Instagram and gives no number about Vibe's size. Both pass.

### The numbers

| Measure | Result |
|---|---|
| Words a reader sees | 5,996 |
| Sentences | 513 |
| Average sentence | 11.7 words |
| Reading grade (Flesch-Kincaid) | 5.8 overall; every section between 2.6 and 7.6 |
| Sentences of 30 words or more | 18 (the longest is 50, section 9 step 3) |
| Time to read on a phone | about 26 to 30 minutes |
| The short version | 211 words, about one minute |
| Lists after a colon | 36 |
| Brackets | 49 |
| "Section N" pointers | 25 |

The grade is flattered. Flesch-Kincaid counts a fragment such as "Group chat pictures." as an easy sentence. The real load is density: many facts, and few verbs to carry them. The fix is not shorter words. It is full sentences, a "who can see what" table, and a short version that stands alone.

---

## 2. The changes the policy needs, ranked

Each one is worked out in the part named.

| # | Change | Why it ranks here | Part |
|---|---|---|---|
| 1 | Rewrite the short version so every line answers by itself. Spell out the four cases for reading messages. Add the line that is missing: who sees your messages. | It is the only part most students read | 3 |
| 2 | Stop using "officers" for owner, admins and mods together. The app's new room rule calls owner and admins "officers" and leaves mods out. Say "club owners and admins" or "club owners, admins and mods" each time. | A student told "only officers post" would read the policy's definition and get it wrong | 6 |
| 3 | Put a two-column "Who can see what" table at the top of section 5. | Answers the first question in one screen; the 1,300 words under it become reference | 7 |
| 4 | Make the 15 headings questions, in the reader's voice. One array in `parts.tsx` drives the headings and the contents list. | Lets a student find a section from the contents list alone | 5 |
| 5 | Keep the section numbers today. Add a "Start here" block of five links under the short version. Reorder later, with the Terms. | The order is wrong for students, but 25 pointers, the `#section-N` links and the Terms draft all lean on the numbers | 4 |
| 6 | Fix the 30 sentences in part 8. Eight of them can be misread today. | Each is a place a student stalls or gets the wrong idea | 8 |
| 7 | Say the facts the founder gave in plain words: the Gmail inbox, the AI coding assistant and its counts-only rule, pinned messages, rooms where only some people post, the film on the front page. Four current sentences are no longer true as written. | Rule 1: true before plain | 8, 10 |
| 8 | One word for one thing: "delete" (gone) against "remove" (hidden by the Vibe team or a club, still stored); "access code" and "scrambled code" always in full; "our software", not "our code"; "school email", not "school mailbox". | 32 uses of "code" for five different things | 6 |
| 9 | Replace "No tool that tracks what you tap" (3e). One screen earlier, 3d says Vibe records every profile and post you open. | The one line a student would call untrue | 8, 9 |
| 10 | Turn eight paragraphs into lists (résumé conditions, club rooms, deletion step 3, evidence files, what the waitlist collects, what stays after a waitlist entry is deleted, a post's deletion, the outside services). | Each holds four or more items after a colon | 7 |
| 11 | Move four misplaced facts: the block notice out of "Only you" (5g); "If you decline new Terms" from 9 to 13; "Your handle is free right away" out of "What stays"; the switched-off features (3f) out of "What we collect". | A fact under the wrong heading is a fact nobody finds | 4, 11 |
| 12 | Cut about 270 words of repeats and joining words; the new facts, the table and the fuller short version add about 450. Do not chase a lower word count. | Length is honest detail now, not padding | 11 |
| 13 | The date. `page.tsx` says "October 5, 2026". The policy publishes today, October 4, 2026. Section 13 hangs a rule on "the date at the top". | A wrong date makes section 13 wrong for anyone who signs up today | 10 |

---

## 3. The short version

### 3a. The ten lines as they stand

"True" is checked against the policy's own body and the founder's facts, not re-opened in code. "Enough" asks: if a student read only this line, would they know the thing?

| # | Line (start) | True? | Enough on its own? | Problem |
|---|---|---|---|---|
| 1 | "Most of your profile, including your posts, is open to anyone on the internet..." | Yes | Yes | None. The best line. |
| 2 | "Club pages are public too, with their 12 newest posts and who wrote them." | Yes | Yes | None. |
| 3 | "When you are signed in, we record each profile you open and each post you open or pause on..." | Mostly | No | "The owner" reads as a club owner. "Pause on" undersells it: a post counts after about one second on screen (3d). |
| 4 | "All three cofounders moderate Vibe, and a reported message is copied for them (section 1)." | Yes | Half | "Copied for them" is odd English. The copy is explained in 5h, not section 1. Not only messages are copied: posts and comments are too. |
| 5 | "One cofounder can reach everything Vibe stores. We read private messages only in the cases in section 5h." | Yes | **No** | The most-asked question is answered with a pointer. |
| 6 | "We do not sell your information. Vibe has no ads and no AI features, and we do not train AI on what you post." | Yes | Half | True, but an AI coding assistant is used on the live database (section 6). "No AI features" next to silence on that reads as hiding it. |
| 7 | "Photos and videos you send in chats or post as a club can still say where they were taken." | Yes | Half | Does not say what is safe, and leaves out videos on your own posts, which also keep it (3c). |
| 8 | "You can delete your account in Settings, right away... Sections 8 and 9 list what stays." | Yes | Half | "What stays" is a pointer. No undo and no backups are the two facts a student needs here. |
| 9 | ""Verified" means the account could once read mail at an @iu.edu or @purdue.edu address. It does not prove enrollment or identity." | Yes | Yes | "Enrollment or identity" is the only abstract phrase in the box. |
| 10 | "Vibe is for people 18 or older. You confirm it with a checkbox." | Yes | Yes | None. |

**Missing altogether:** who can see your messages (the people in the chat, and anyone added later). It is one of the four things students ask first and the short version does not say it.

### 3b. Recommended copy

The bold lead of each line is a summary of the summary: a student who reads only the ten bold phrases still leaves with the truth. Lines 9 and 10 of the old box share one line here, which frees a line for messages.

Above the box, replacing "Only on the waitlist? Go to section 11. It is all you need.":

> **Only on the waitlist?** [Section 11] is written for you. In short: we delete your entry within 40 days of the last time you sent the form, sooner if you never confirm your email, and every email from us has a "Take me off the list" link.

The box:

1. **Your profile and your posts are public.** Anyone on the internet can open most of your profile and read your posts, and search engines can list them.
2. **Club pages are public too.** They show the club's 12 newest posts and who wrote each one.
3. **Everyone in a chat sees every message in it.** A person added later can read everything sent before they joined. In a club room, treat what you write as readable by every member, even one you blocked.
4. **Vibe can read messages, and does so only in four cases:** when one is reported, when you ask us to, when we have specific evidence of a serious break of the Terms such as threats or spam, or when the law requires it. This is our own rule, not a lock ([section 5h]).
5. **Who at Vibe sees what.** All three cofounders moderate Vibe, and they get a copy of anything that is reported. One cofounder can reach everything Vibe stores.
6. **We record what you look at.** When you are signed in, we record each profile you open and each post you open or stop on in the feed. You cannot turn this off. The person you looked at sees how many people looked and, with Vibe+ (a paid plan, not on sale yet), who.
7. **You can delete your account in Settings, right away.** There is no undo, and we keep no backups. Your posts and messages go, from other people's chats too. Records of reports and bans stay, and so do a few files ([sections 8] and [9]).
8. **Photos and videos can show where you were.** On new uploads we remove the hidden location from your profile photo, your cover and the photos on your own posts. Videos, chat photos and anything posted as a club keep it.
9. **No selling, no ads.** We do not sell your information. Vibe has no ads and no AI features, and we do not train AI on what you post. We do build Vibe with an AI coding assistant, and [section 6] says what it may read.
10. **"Verified" and age.** "Verified" means an account could once read mail at an @iu.edu or @purdue.edu address. It does not prove the person is a student, or is who they say. Vibe is for people 18 or older, and you confirm that with a checkbox.

About 390 words, under two minutes (the box today is 211). The bold leads alone are 60 words. Every line is drawn from a sentence already in the policy or from a fact the founder gave:

- Line 3: 5e ("Someone added later can read the whole history"; "treat what you write in a club room as readable by every member, including someone you blocked").
- Line 4: 5h's four cases, in the same order. "This is our own rule, not a lock" is 5h's "This is a rule we keep ourselves. No system enforces or records it." It belongs up here: without it the line reassures more than the facts allow.
- Line 7: section 8 ("We keep no database backups") and section 9 ("no waiting period and no undo").
- Line 8: 3c's two lists. "On new uploads" covers 3c's "Photos uploaded before late September 2026 may still carry theirs."
- Line 9: the second sentence is new and rests on the founder's counts-only rule (part 10). If section 6 does not get that paragraph, cut the sentence.
- The waitlist line: section 11's table. "Within 40 days of the last time you sent the form" is truer than "after you join", because sending the form again restarts the count.

### 3c. Alternative, if the box must stay near 210 words

Keep the bold leads and lines 1, 2, 5 and 10 as above. Shorten the rest:

- 3. **Everyone in a chat sees every message in it,** and so does anyone added later.
- 4. **Vibe can read messages.** We do so only when one is reported, when you ask, when we have evidence of a serious break of the Terms, or when the law requires it.
- 6. **We record each profile and post you open while signed in.** You cannot turn this off. The person you looked at sees the count and, with Vibe+ (a paid plan, not on sale yet), who.
- 7. **You can delete your account in Settings, right away, with no undo.** A few records stay ([sections 8] and [9]).
- 8. **Videos, chat photos and club posts keep the place they were taken.**
- 9. **No selling, no ads, no AI trained on what you post.**

This version loses "not a lock", "no backups" and the coding-assistant sentence. The longer one is the recommendation: rule 4 (protect students more) outranks a shorter box.

Line 8 does not say "only": 3c also removes the location from work logos and résumé images, which the line leaves out for length.

### 3d. Words in the short version a reader from another country may stumble on

IU and Purdue enroll many students whose first language is not English. Four idioms in the current text: "vanish" (use "go" or "are deleted"), "linger" (section 8: "stay"), "leaves both inboxes" (5e: "disappears from both inboxes"), "free for someone else" (section 9: "someone else can take it").

---

## 4. Order

### 4a. What a student asks, and where the answer is today

| The question | Where the answer is | How far down |
|---|---|---|
| Who can see what I post? | 5a, 5b | about 1,850 words |
| Who can see what I message? | 5e | about 2,350 words |
| Does Vibe read my messages? | 5h, with half of it in section 1 | about 2,900 words, and split in two |
| What happens when I delete? | 8 and 9 | about 3,600 words, and split in two |
| I only joined the waitlist | 11 | about 4,900 words |

Two answers are split. "Who at Vibe can see my things" is told in section 1 (the admin tools, direct access) and again in 5h (messages, reports, removed content), and each points at the other. "What stays when I delete" is told in section 8 (files) and section 9 (records), and each points at the other.

### 4b. The decision: keep the numbers today, fix the way in

A full reorder is the better page. It is the wrong change for today. Three things lean on the numbers:

- 25 "section N" pointers inside the text and the `#section-N` anchors behind them (`parts.tsx`, the `Sec` helper).
- The Terms draft cites Privacy Policy sections 1, 5, 8 and 9 by number (`handoffs/legal-2026-09-29/02-terms-of-service-v2.md`, lines 7, 108, 163, 245, 248).
- The fact check of October 3 was done sentence by sentence in this order. A reorder on publish day risks one wrong pointer on a legal page.

On a phone people tap, they do not scroll. So today, fix the way in:

1. **Question headings** (part 5). The contents list then reads as the student's own questions.
2. **A "Start here" block** between the short version and the contents list. Five links, no new facts:
   - Who can see what I post? → section 5
   - Who can see my messages? → section 5e
   - Does Vibe read my messages? → section 5h
   - What happens when I delete something, or my account? → sections 8 and 9
   - I only joined the waitlist → section 11
3. **The "Who can see what" table** at the top of section 5 (part 7).
4. **Link the waitlist straight to its section.** The form (`src/app/waitlist/waitlist-form.tsx:211`), the waitlist footer (`src/app/waitlist/layout.tsx:34`) and the waitlist emails (`src/lib/email/resend-transactional.ts:146`) link to the top of the page. They should link to `/legal/privacy#section-11`. This is a code change for the release workflow, not for this document.
5. **Four moves that change no number:**
   - 5g ends with a sentence about what the person you blocked is told. It sits under "Only you". Move it to 5a, after "A block only works while the other person is signed in."
   - "If you decline a new version of the Terms" is in section 9. It belongs in section 13.
   - "Your handle, which is free for someone else right away" is in the list "What stays after deletion". It is the opposite of staying. Give it its own line after the list.
   - Section 1 lists what the admin tools show; 5h says what the team reads. Keep both, but make section 1 end with one sentence that answers the question outright: "When and why we read private messages is in section 5h."

### 4c. The better order, for the day the Terms change

When the Terms are edited (about October 14) every pointer in both documents is rewritten once. Reorder then:

1. Who can see what (now 5a to 5g)
2. Who at Vibe can see it, and when we read messages (now 1 and 5h, merged)
3. Deleting, and what stays (now 9, with section 8's "does not delete yet" list)
4. How long we keep things (the rest of 8)
5. What we collect (now 3a to 3e, 3g)
6. How we use it (now 4)
7. Other companies, universities and the law (now 6 and 5i)
8. What is kept on your device (now 7)
9. Security (now 10)
10. Who can use Vibe, "verified", and age (now 2 and 12)
11. The waitlist (now 11; keeping its number keeps every `#section-11` link working)
12. Features that are switched off today (now 3f)
13. Agreeing, and changes (now 13)
14. Where you live (now 14)
15. Contact (now 15)

---

## 5. Headings as questions

The reader asks, Vibe answers: "I" and "my" in the heading, "you" and "we" in the text under it. This is the pattern the federal plain-language guidelines recommend for question headings. The numbers do not change. `SECTION_TITLES` in `parts.tsx` feeds both the headings and the contents list, so this is one edit.

| # | Today | As a question |
|---|---|---|
| 1 | Who we are and who can reach your data | Who runs Vibe, and who there can see my information? |
| 2 | Who can use Vibe, and what "verified" means | Who can use Vibe, and what does "verified" mean? |
| 3 | What we collect | What does Vibe collect about me? |
| 4 | How we use it | What does Vibe do with it? |
| 5 | Who can see what | Who can see what I post, send and do? |
| 6 | Outside services | Which other companies handle my information? |
| 7 | Cookies and what is stored on your device | What does Vibe keep on my phone or computer? |
| 8 | How long we keep things, and what happens to files | How long does Vibe keep things, and what happens to my files? |
| 9 | Your choices, and deleting your account | How do I see, change or delete my information? |
| 10 | Security | How does Vibe keep my information safe? |
| 11 | The waitlist | I joined the waitlist. What happens to what I sent? |
| 12 | Age | What if someone is under 18? |
| 13 | How we record your agreement, and changes | How do I agree to this policy, and what happens when it changes? |
| 14 | Where you live | Does it matter where I live? |
| 15 | Contact | How do I reach Vibe? |

The sub-headings:

| Today | As a question |
|---|---|
| 3a. Your account | 3a. What do I give when I make an account? |
| 3b. Your profile | 3b. What is on my profile? |
| 3c. What you post and do | 3c. What about the things I post and do? |
| 3d. What Vibe records by itself | 3d. What does Vibe record without my typing it? |
| 3e. What we do not collect | 3e. What does Vibe not collect? |
| 3f. Features that are switched off today | 3f. What is built but switched off today? |
| 3g. If you write to us | 3g. What if I email Vibe? |
| 5a. Anyone on the internet, with no account | 5a. What can anyone on the internet see? |
| 5b. Every signed-in account, verified or not, at every campus | 5b. What can every signed-in account see? |
| 5c. Résumés | 5c. Who can open my résumé? |
| 5d. Who viewed you | 5d. Who can see that I looked at them? |
| 5e. People in your chats | 5e. Who can see my messages? |
| 5f. Club owners, admins and mods | 5f. What can the people who run a club see? |
| 5g. Only you | 5g. What can only I see? |
| 5h. What we at Vibe can see | 5h. What can people at Vibe see, and do they read my messages? |
| 5i. Universities, emergencies and the law | 5i. Does Vibe tell my university or the police anything? |

Keep "(verified or not, at every campus)" as the first sentence under 5b: it is the surprise, and it is too long for a heading.

The bold run-in labels inside sections 9 and 11 should turn the same way: "What we collect." becomes "What does Vibe collect?", "Why." becomes "Why?", "Who handles it." becomes "Which companies handle it?", "How long." becomes "How long does Vibe keep it?", "Leaving sooner." becomes "How do I leave sooner?", "What your deletion takes from other people." becomes "What do other people lose when I delete my account?"

---

## 6. One word for one thing

Counts are from the published text.

### 6a. "Officers" (8 uses): the one that will mislead

- The policy, 5f: "'Officers' means a club's owner, admins and mods."
- The app, in the release going out today: "Only officers post here." means the club owner and admins. A mod "reads and votes there like any member" (`supabase/migrations/20261004110000_chat_room_post_policy.sql`, lines 101 to 103; the label is in `src/lib/chat/room-rules.ts:67`). The Board is the same: only the owner and admins post.
- The policy's own "Officers room" (5e) is "for the club owner, club admins and people they add", so mods are not in it by default either.

So the defined word and the app's label disagree, on the very feature this release adds. **Fix:** drop the definition. Write the roles out each time. There are only eight uses:

| Where | Today | Write |
|---|---|---|
| 3c | "if a club officer removes you" | "if someone who runs the club removes you" (or the exact roles, if the fact check gives them) |
| 5e, polls | "no member or officer can see who voted" | "nobody in the club can see who voted" |
| 5f, heading line | "'Officers' means a club's owner, admins and mods." | cut |
| 5f | "All officers see pending requests..." | "Club owners, admins and mods see pending requests..." |
| 5f | "Officers are not shown email addresses or reports." | "Nobody who runs a club is shown email addresses or reports." |
| 8, table | "an officer removes you from the club" | "the club removes you" |
| 9 | "Club records where you acted as an officer" | "Club records of things you did as a club owner, admin or mod" |
| new | rooms where only some people post | "the club owner and admins" (part 10) |

Where the app's own label appears, keep it as a label, in quotes or capitals: the Officers room, "Only officers post here."

### 6b. "Code" (32 uses, five meanings)

| Meaning | Uses | Always write |
|---|---|---|
| The invite code | "access code" 7, bare "a code", "the code" 4 | "access code", never bare |
| The scrambled email | "scrambled code" 6, bare "the code" 2 | "scrambled code", never bare |
| The school email check | "a link and a code" 1 | "a link and a verification code" |
| The token inside an email link | "the code in our email links" 1 | "the one-time key inside the link" |
| Software | "our code", "our own code", "server code", "ad code" 5 | "Vibe", "our software", "tracking or ad software" |

Section 11 is where they collide: "a scrambled code in place of your address. The code cannot be turned back", then "when a code was sent", then "Vercel's visit logs see the code in our email links".

### 6c. Delete, remove and the rest

"Delete" 57, "remove" 22, "take down" 5, "clear" 7, and one each of "erase", "taken offline", "vanish", "disappear". The policy nearly keeps a rule already. Say it once, at the top of section 8, and hold to it:

> In this policy, **deleted** means gone from Vibe's systems. **Removed** means hidden by the Vibe team or by a club, and still stored.

Slips to fix:

| Where | Today | Write |
|---|---|---|
| 8, a post | "We then try to remove its files." | "We then try to delete its files." |
| 9, cannot sign in | "deletes the account's records and removes its files" | "deletes the account's records and its files" |
| 9, step 2 | "Your files are erased" | "Your files are deleted" |
| 1; 5h; 9 | "taken down", "took down", "taken offline" | "removed" (it is the same act as removing a post) |
| 12 | "we close it and take its content down" | "we close it, which works like a ban, and remove its content". "Close" is a new word here; tie it to "ban" in the same sentence, not the next one |
| short version | "vanish" | "go" |
| 9 | "disappear from other people's chats" | "are deleted from other people's chats" |

"Clear" is fine where it is the app's own word ("Clear chat history") or means emptying a count.

### 6d. The people at Vibe

"Cofounder" 11, "the Vibe team" 7, "one of us" 3, "the team" 1, "we". Keep three and give each one job:

- **the Vibe team**: the three cofounders when they moderate.
- **the cofounder with direct access**: the one person who can reach the database, the provider accounts and the inbox. Section 1 defines it; use the same six words every time. Today it is also "One cofounder" (twice) and "the direct access in section 1".
- **we**: the company, for rules and promises.

"One of us" is now untrue in two of its three places. A copy of your data (section 9) and deleting an account for someone who cannot sign in (section 9) both need the database, and only one cofounder can reach it. Write "the cofounder with direct access".

### 6e. Smaller ones

| Thing | Today | Always write |
|---|---|---|
| The account's credentials | "sign-in" as a noun: "Your sign-in is deleted", "your sign-in (email, scrambled password...)" | "sign-in" for the act; "your sign-in record (your email and scrambled password)" for the thing |
| The session | "the sign-in details your browser sent" (3d) | "the sign-in cookie your browser sent" (section 7 explains cookies) |
| The address you verify | "school email" 11, "school mailbox" 1 | "school email" |
| The address you sign in with | "sign-in email" 5, "sign-in address" 1 | "sign-in email" |
| What Vibe holds about you | "information" 10, "data" 6, "personal information" 2 | "information"; keep "data" only in "a copy of your data" if the lawyer wants the familiar phrase |
| Pictures | "photos" 36, "pictures" 4, "media" 5 | "photos and videos"; "group chat photo", not "group chat picture" |
| The other companies | "outside services" 2, "providers" 5, "companies" 5 | "outside companies" or "the companies in section 6" |
| The person viewed | "the owner" 2 | "the person you looked at", "the post's author" |
| An internal id | "Vibe account number", "your old account number" | "account ID (a random label Vibe gives each account)" at first use, then "account ID". "Account number" sounds like a bank. |
| Evidence | "evidence files" appears in section 6 before sections 8 and 9 explain it | at first use: "evidence files (photos and videos we keep because of a report)" |

---

## 7. Where a table or a list beats a paragraph

A limit first. `LegalTable` gives the first column 124px and each other column 136px. Three columns need 396px, so on a 375px phone a three-column table scrolls sideways inside its box. **Use two columns only.** The policy's three tables today (sections 8, 11, 15) are all two-column and all work.

### 7a. New table: "Who can see what", at the top of section 5

Every row is a sentence already in 5a to 5g. The table adds no fact. It is the one-screen answer; 5a to 5i stay under it as the detail.

| What | Who can see it |
|---|---|
| Your profile, and posts you made as yourself | Anyone on the internet, signed in or not |
| A club's page and its 12 newest posts, with each author's name | Anyone on the internet |
| Your comments and reposts | Any signed-in account |
| Who you follow and who follows you | Any signed-in account |
| Like, view and save totals on a post | Any signed-in account |
| Who liked a post | Only the post's author |
| Who saved a post | Nobody on Vibe |
| Who viewed your profile or post | Any signed-in account sees the total. Only you can see the names, and only with Vibe+. |
| Your résumé | Signed-in accounts with a verified school email, unless you hid it or one of you blocked the other |
| Your messages | Everyone in that chat, including people added later |
| A club's member list | The club's members. If anyone can join the club, any signed-in account, on the Map. |
| A club's follower list, and who RSVP'd | The club's owner and admins. The people in an event's chat also see who is in it. |
| Drafts, saved posts, your mute list, your personal calendar | Only you |
| Your sign-in email and school email | Only you |

Under the table, one line: "The Vibe team and the cofounder with direct access can see more than this table shows. [Section 1] and [section 5h] say what."

Two rows need the fact check to confirm them before they print: "Who saved a post: nobody on Vibe" (5b says "nobody sees who saved") and the email row (3a: your starter name is the first half of your sign-in email until you pick a name, so add "except your starter name, section 3a" if that sentence stays).

### 7b. Paragraphs that should be lists

**5c, who can open a résumé** (35 words, four conditions, three of them negatives):

> Another person can open your résumé only if all four of these are true:
> - they are signed in with a verified school email;
> - neither of you has blocked the other;
> - you are not suspended or banned;
> - you have not hidden it.

**5e, club chats** (two sentences of 29 and 26 words; "any rooms they create" does not say who "they" are). As a two-column table, with the new rule about who can post. The "who can post" wording is the app's own (`src/components/desktop/messages/rooms-dialog-rules.ts`, lines 162 to 173); the fact check must confirm it before it prints.

| Room | Who can read it, and who can post |
|---|---|
| Board | Every member reads. The club owner and admins post. Any member can reply under a post. |
| Lounge | Every member reads and posts. |
| Officers | The club owner, the club admins and people they add. Everyone in it can post. |
| Extra rooms | The club owner and admins create them and choose who sees each one: every member, or only people they pick. They also choose who can post: everyone who sees it, only the owner and admins, or the owner, admins and people they pick. |
| An event's chat | Club members who marked Going or Interested, and the club's owner and admins. Its member list shows their names. |

> New members can read a room's whole history. In a room where you cannot post, you can still read, vote in polls and take a sign-up slot.

**8, deleting a post** (six facts in one bullet):

> **A post.** When you delete a post:
> - it is deleted right away, with its likes, comments, saves, reposts and view records;
> - we then try to delete its files. If that fails, they stay until your account is deleted, or until the club is, for a club post;
> - if a report about the post is open, its files are kept as evidence;
> - our storage provider's network can hold temporary copies of a public photo for longer. We have not measured how long.
>
> You cannot delete or edit a post the Vibe team removed.

**9, step 3** (one sentence, 50 words, 14 items):

> 3. Your sign-in record is deleted, and with it every record tied to the account:
>    - both email addresses, your profile and your proof of agreement;
>    - everything you posted, sent, liked, saved or voted on;
>    - your follows, club memberships, RSVPs, blocks and mutes;
>    - the records of what you viewed and of who viewed you;
>    - your notifications and your waitlist entry.

**9, evidence files** (43 words, three cases nested in one sentence):

> **Evidence files.** These are:
> - the photos and videos of a post, if the Vibe team removed it or if a report on it is open or was acted on;
> - a photo, cover or logo the Vibe team removed;
> - your profile photo and cover, if a report about you was open.
>
> A photo already kept as evidence stays, even if the report was dismissed.

**9, what stays after deletion** (nine bold items, mixed). Split under two small labels: "Stays with Vibe" (ban records, reports, the moderation log, evidence files, the files deletion misses, club records, the email log and abuse counts) and "Stays with other companies" (Supabase's sign-in log, Resend's record, Vercel's visit logs, Sentry's reports, Stripe's payment records once billing is on).

**11, what we collect** (46 and 30 words, then five long bullets). Three short lists:

> **You must give:** your school email (IU or Purdue only) and your name.
>
> **You can also give:** your year and major; the clubs you are in; whether you run a club, and which one; one line on what you would want from Vibe.
>
> **We add:**
> - your university, read from your address;
> - where you found us, if your link carried a tag saying so;
> - the time you sent the form, and which of these boxes were checked: "I'm 18 or older and a current student", "Email me when it's my turn", and the optional "Also send me Vibe news";
> - where your entry stands: when we emailed you, when you confirmed, which wave you are in (a wave is one group we let in at a time), when your access code was sent and which cofounder sent it;
> - a log of each email we send you: its kind, the part of your address after the @, the time and whether it was sent. In place of your address the log holds a scrambled code, which cannot be turned back into the address.

**11, what stays after an entry is deleted** (three fragments):

> - Our email log, without the scrambled code.
> - Resend's own record of the emails it sent you. It holds your address and, for the access-code email, your name and the access code. We have not confirmed how long Resend keeps it.
> - Our log of what each cofounder did on the waitlist. It holds no name and no address.

**6, outside services.** Keep the list (a table would need a third column). Give every entry the same two sentences, so the eye learns the pattern: "It holds ..." then "It sees ...". Today five of the eight entries open with a fragment that has no verb. Supabase as the model:

> **Supabase** (database, sign-in, file storage). It holds the whole database, your sign-in record (your email, a scrambled password and a log of sign-in activity), public photos, private résumés and evidence files. Your browser talks to it directly when you sign in and each time a profile or post photo loads, so it sees your IP address and browser. It also sends the "confirm your account" email.

---

## 8. The 30 worst sentences, with replacements

Worst first. Each replacement keeps the meaning of the original unless it says **fact**, where the founder's facts of October 2 to 4 make the original untrue. **Misread** marks the eight a student is likely to get wrong today. **Check** marks four where the original can be read two ways, so the writer must confirm which before using the replacement. The longest list-shaped sentences (5c, 5e club chats, section 8 a post, section 9 step 3 and evidence files, section 11 what we collect) are rewritten in part 7b and not repeated here.

**1. Short version, line 5.** The most-asked question, answered with a pointer.
- Now: "One cofounder can reach everything Vibe stores. We read private messages only in the cases in section 5h."
- Write: "One cofounder can reach everything Vibe stores. We read private messages only when one is reported, when you ask us to, when we have specific evidence of a serious break of the Terms such as threats or spam, or when the law requires it (section 5h)."

**2. Short version, line 3. Misread.** "The owner" reads as a club owner.
- Now: "The owner sees the count and, with Vibe+ (a paid plan, not on sale yet), who."
- Write: "The person you looked at sees how many people looked and, with Vibe+ (a paid plan, not on sale yet), who."

**3. Short version, line 4.** "Copied for them" is not English a student uses, and the copy is explained in 5h, not section 1.
- Now: "All three cofounders moderate Vibe, and a reported message is copied for them (section 1)."
- Write: "All three cofounders moderate Vibe. When a message is reported, they get a copy of it (section 5h)."

**4. Section 3e. Misread.** One screen up, 3d says Vibe records every profile and post you open. A student reads this line as denying it.
- Now: "No tool that tracks what you tap, and no advertising tracker."
- Write: "No analytics tool and no advertising tracker from any outside company. What Vibe itself records about what you open is in section 3d."

**5. Section 11, who at Vibe sees it. Misread.** The bracket reads as the parts that are hidden. They are the parts that show.
- Now: "The three cofounders see the list with addresses partly hidden (the first letter and the part after the @), next to your name and answers and, once you sign up, your handle."
- Write: "The three cofounders see the list. Each address is partly hidden: only its first letter and the part after the @ show. Beside it they see your name, your answers and, once you sign up, your handle."

**6. Section 11, what we collect. Misread.** "Stores no IP address" and "count requests by IP address", back to back, read as a contradiction. "They" has no clear owner.
- Now: "The entry stores no IP address (the number that identifies your internet connection), browser, device or location, and the waitlist pages set no cookie. To stop abuse they count requests by IP address, and those counts can stay for weeks."
- Write: "Your entry holds no IP address (the number that identifies your internet connection), no browser, no device and no location. The waitlist pages set no cookie. Apart from your entry, the pages count requests from each IP address to stop abuse, and those counts can stay for weeks."

**7. Section 5e, polls. Misread.** The sentence ends on "could" with nothing after it, and its subject is "the direct access".
- Now: "The vote is still stored with your account, so the direct access in section 1 could."
- Write: "Your vote is still stored with your account, so the cofounder with direct access (section 1) could see how you voted."

**8. Section 9, what stays. Misread.** "For both" has nothing to point at.
- Now: "Suspension and ban records, for both: the kind, dates, reason, private note, and up to two scrambled codes (section 3d) made from your school and sign-in emails."
- Write: "Suspension and ban records. For either one we keep which it was, its dates, the reason, the team's private note, and up to two scrambled codes (section 3d): one made from your school email and one from your sign-in email."

**9. Section 3f, notifications. Misread. Check.** "Which" can mean Apple alone or both companies.
- Now: "App notifications go through Google's Firebase and, on iPhone, Apple, which can read them."
- Write: "App notifications go through Firebase, a Google service, and on iPhone through Apple as well. Both companies can read them."

**10. Section 5a, photos. Misread. Check.** Keeps working after what? If it means the link never expires, say so. If it means the link works even after you replace or delete the photo, say that and point to section 8.
- Now: "For most photos the link keeps working."
- Write: "For most photos that link does not expire."

**11. Section 13.** "The recorded version" is the build's word. Nobody outside it knows what was recorded.
- Now: "Your checkbox covers the Terms and this policy together, under one recorded version. [...] This version of the policy was published before the recorded version was changed. If you made your account before the date at the top, this page is our notice to you, and you are asked to accept it when the version next changes."
- Write: "Your checkbox covers the Terms and this policy together. We record the two as one version number. [...] We published this policy without changing that number. So if you made your account before the date at the top, Vibe has not asked you to accept it. Until it does, this page is our notice to you. Vibe will ask you the next time the number changes."

**12. Section 1.** A database is the subject, and the exception hangs off the end.
- Now: "Vibe's own database keeps no record of what is read this way or in the admin tools, except that showing a full waitlist address is logged first."
- Write: "Vibe's own database does not log what is read through direct access or in the admin tools. One exception: each time a full waitlist address is shown, that is logged first."

**13. Section 3g. Fact.** hello@ and help@ forward to one cofounder's Gmail. "Which the Vibe team reads" and "one of us" are no longer true.
- Now: "What you send stays in our support inbox, which the Vibe team reads, until one of us deletes it. We aim to delete recovery proof within 90 days after the request closes, though nothing does this automatically."
- Write: "Mail to hello@ or help@connectvibe.app is forwarded to the Gmail inbox of the cofounder with direct access (section 1), so Google holds it. It stays there until that cofounder deletes it. We aim to delete recovery proof within 90 days after your request closes. A person has to do that. Nothing does it automatically."
- The same change is needed in section 6 ("Our email inbox. Mail you send us is held by the email service that hosts our inbox." becomes part of the Google entry that is already there for fonts: "**Google** (fonts, and the inbox our mail lands in). [...] Mail you send us is forwarded to a Gmail inbox, so Google holds it." If a forwarding service carries the mail on the way, as an earlier draft said of Cloudflare, name it in the same line.) and in section 11 ("lands in our support inbox" becomes "lands in that Gmail inbox").

**14. Section 6, AI coding tools. Fact.** The founder's rule is counts only. The sentence says records pass through.
- Now: "AI coding tools. We build and maintain Vibe with them. When the cofounder with direct access uses one to look into a problem, the database records it reads pass through that tool's provider."
- Write: "**Anthropic** (AI coding assistant). We build and maintain Vibe with Claude, an AI coding assistant made by Anthropic. When it looks at the live database, our rule is that it may read counts, settings and fingerprints of the database's own rules (a fingerprint is a short string that shows whether a rule has changed). It may not read anyone's records. What it does read passes through Anthropic."
- If nothing but the rule enforces this, add 5h's sentence: "This is a rule we keep ourselves." Do not write "never has": the rule is about what it may do now.

**15. Section 9, a copy of your data. Fact.** Only one cofounder can reach the database, so "one of us" overstates who handles your records. Same fix for "One of us then deletes the account's records" a paragraph later.
- Now: "There is no export tool, so one of us puts it together, which means opening your records, messages included."
- Write: "There is no export tool. The cofounder with direct access (section 1) puts the copy together by hand, and has to open your records to do it, messages included."

**16. Section 3d, views.** 40 words, three conditions before the verb. **Check** that "once per day" means once for each profile or post.
- Now: "When you are signed in and open a profile, open a post, or a post stays on your screen in the feed for about a second, we record who you are, what you viewed and the day, once per day."
- Write: "When you are signed in, we record a view when you open a profile, open a post, or leave a post on your screen in the feed for about a second. The record holds who you are, what you viewed and the day. We keep one record per day for each profile or post."

**17. Section 3d, error reports.** Two different reports share one sentence, and "sign-in details" hides the word the reader knows.
- Now: "When something breaks, and for about one in ten page loads and server requests, a report goes to Sentry. [...] One about a failed server request can include the sign-in details your browser sent, which identify your account."
- Write: "When something breaks, a report goes to Sentry, the service we use to find bugs. A speed report also goes for about one in ten page loads and server requests. [...] A report about a failed server request can include the sign-in cookie your browser sent, and that cookie identifies your account."

**18. Section 3d, email log.** "A given address" and "with a secret key held on our servers" are a programmer's sentence.
- Now: "The code cannot be turned back into the address, but with a secret key held on our servers we can test whether a given address matches."
- Write: "Nobody can turn the scrambled code back into the address. Our servers do hold a secret key that lets us test whether a particular address matches it."

**19. Section 5h.** The bracket explains the thing Vibe does not have, so the reader has to turn it inside out.
- Now: "Messages are not end-to-end encrypted (locked so that only the people in a chat can read them)."
- Write: "Messages are not end-to-end encrypted. End-to-end encryption is a lock that lets only the people in a chat read it. Vibe does not have it."

**20. Section 5e, direct and group chats.** A definition in a bracket in the middle of the sentence.
- Now: "A message from someone you are not connected with (you do not follow each other) arrives as a request, and the sender sees when you read it."
- Write: "A message from someone you are not connected with arrives as a request. (Connected means you follow each other.) The sender can see when you read it."

**21. Section 5d.** "Left off the names" and "on either side of a block" both need a second read.
- Now: "People on either side of a block, and people you muted, are left off the names but still counted."
- Write: "The names leave out anyone you blocked, anyone who blocked you and anyone you muted. They still count in the total."

**22. Section 5g.** A fact about the other person, under the heading "Only you".
- Now: "The person you block gets no notification, but if they open your profile while signed in, Vibe tells them the account has restricted them."
- Write: "Vibe does not notify a person you block. If they open your profile while signed in, though, Vibe tells them this account has restricted them." Move it to 5a, after the two block sentences there.

**23. Section 6.** "Off today ... once the apps are published" says two opposite things in one line.
- Now: "Off today: Stripe and the notification services (section 3f), and the Apple App Store and Google Play once the apps are published."
- Write: "Not in use today: Stripe and the notification services (section 3f). The Apple App Store and Google Play will join this list when the apps are published."

**24. Section 7.** "Up to about" is two hedges, and "though" buries the fact that matters.
- Now: "Signing out in Settings signs your account out on every device, though another device can keep working for up to about an hour."
- Write: "Signing out in Settings signs your account out on every device. Another device can stay signed in for about an hour more."

**25. Section 8.** A possessive with nothing after it.
- Now: "The one clean-up on a schedule today is the waitlist's (section 11)."
- Write: "Only one thing is deleted on a schedule today: waitlist entries (section 11)."

**26. Section 9, what stays.** It is in the list of things that stay, and it is the one thing that does not.
- Now: "Your handle, which is free for someone else right away."
- Write: "Your handle is not held for you. Someone else can take it right away." Put it after the list, not in it.

**27. Section 10, breach.** 45 words, the longest promise on the page.
- Now: "If we learn of a breach that exposes your personal information, we will email the people affected and say what happened, what information was involved and what we are doing about it, as fast as we reasonably can and within the time Indiana law requires."
- Write: "If we learn of a breach that exposes your personal information, we will email the people affected. We will say what happened, what information was involved and what we are doing about it. We will do this as fast as we reasonably can, and within the time Indiana law requires."

**28. Section 11.** "Set up to do it", "one person at a time" (which person?) and "each look".
- Now: "A cofounder we have set up to do it can see a full address, one person at a time, and each look is logged first."
- Write: "A cofounder who has been given that permission can show a full address, one entry at a time. Each time is logged before the address appears."

**29. Section 11.** "The same answer" to what?
- Now: "The form gives everyone the same answer, so it does not show who is on the list."
- Write: "The form shows the same message whether or not an address is already on the list, so nobody can use it to find out who joined."

**30. Section 11, when you sign up with a code. Check.** "How you came" is unclear, and the founder's fact says an account keeps only a wave tag. The fact check must say whether "a record of the code" is a second thing.
- Now: "Your account keeps a record of the code and a wave note (the wave, how you came, the day the code was sent and the day you joined), deleted with the account."
- Write: "Your account keeps a record of the access code you used and a wave note. The note holds your wave, how you got in, the day your access code was sent and the day you joined. Both are deleted with the account."

### 8b. Smaller ones, same treatment

| Where | Now | Write |
|---|---|---|
| 1, admin tools | "and briefly ones that were taken down, including a removed post's media" | "For a short time they can also see ones that were removed, including the photo or video of a removed post" (check what "briefly" means) |
| 2 | "Verifying hides nothing: an unverified account can read everything in section 5b, except résumés." | "Verifying does not hide anything from other accounts. An account that has not verified can still read everything in section 5b, except résumés." |
| 3a, sign-in email | "Other people are not shown it, apart from the starter name below." | "No other user is shown it. The one exception is your starter name, below." |
| 3a, school email | "Other people never see it." | "No other user ever sees it." (the cofounder with direct access can, section 1) |
| 3d, abuse limits | "Nowhere else in Vibe's own tables holds one. Counts are cleared on no fixed schedule and can stay for weeks." | "They are the only place in Vibe's own database that holds one. We clear the counts from time to time, not on a set schedule, so they can stay for weeks." |
| 3e | "One automated check exists: a small set of words is blocked before text is saved, in messages too." | "Vibe makes one automatic check. Before your text is saved, messages included, it is checked against a short list of blocked words." |
| 4 | "We use your information to run Vibe, including suggesting people and clubs from who you follow and your major." | "We use your information to run Vibe. That includes suggesting people and clubs to you, based on who you follow and your major." |
| 5a, share link | "the page asks for sign-in, but its preview shows the author's name, up to 140 characters of the text, and the photo" | "you must sign in to open the post. But the preview that shows when the link is shared gives the author's name, up to 140 characters of the text, and the photo" |
| 5i | "Emails to your school email are delivered by the university's mail system, which can see them." | "When we email your school email, the university's mail system delivers the message and can see it." |
| 6, Google | "Your IP address and browser on almost every page, and when a mail app loads the fonts in one of our emails." | "It sees your IP address and browser on almost every page. It sees them again if your mail app loads the fonts in one of our emails." |
| 9, what stays | "Our email log (without the scrambled code or your account number), abuse limit counts until they are cleared and, once billing is on, Stripe's payment records and our list of payment events." | Three lines: "Our email log, without the scrambled code or your account ID." "Abuse limit counts, until they are cleared." "Once billing is on: Stripe's payment records and our list of payment events." |
| 11, opening | "This section is our notice to you." | "This section is our notice to you: it says what we do with what you send." |
| 11, why | "If we ever send one, it is meant only for people who checked the news box." | "If we ever send one, it is only for people who checked the news box." |
| 11, who handles it | "Vercel's visit logs see the code in our email links." | "When you open a link from one of our emails, Vercel's visit logs record its web address, including the one-time key inside it." |
| 11, how long | "The 40 days hold whatever state your entry is in." | "The 40 days apply whether or not you confirmed, and whether or not you got an access code." (check that those are the states meant) |
| 11, leaving sooner | "With no email from us, write to hello@connectvibe.app from that address. After you make an account, the entry goes with the clean-up or when you delete the account." | "If you have no email from us, write to hello@connectvibe.app from the address you joined with. After you make an account, your entry is deleted by the daily clean-up, or sooner if you delete the account." |
| 11, sign up with a code | "A few addresses we list ourselves can sign up without a code. That list keeps the address and a reason, even after the account is deleted." | "We keep a short list of addresses that can sign up without an access code. For each one the list holds the address and the reason, and it keeps them even after the account is deleted." |

---

## 9. Voice, and claims the text cannot carry (the brand review)

### Summary

- **Fit to the voice:** plain, yes. Direct, yes. Hype, none. It never names Instagram and gives no number about Vibe's size ("three cofounders" is a fact the reader needs, not a boast). Warm, not yet.
- **Strongest:** it says the hard things in the open ("You cannot turn this off", "This is a rule we keep ourselves. No system enforces or records it", "Ask and we will tell you what we know"). That is the voice. Keep every one.
- **Most important fix:** five absolute claims the rest of the page contradicts or cannot back. They are small, and each is one sentence.

### Findings

| Issue | Where | Severity | Suggestion |
|---|---|---|---|
| "No tool that tracks what you tap" sits one screen under "we record each profile you open" | 3e | High | Part 8, sentence 4 |
| "It is all you need." Section 11 does not hold the breach promise (10), the rights line (14) or what the front page loads | Intro | High | "Section 11 is written for you." |
| "We never store it." The company's own sign-in service stores a scrambled copy; to a student "we" covers both | 3a, password | Medium | "We never store the password itself. Supabase, the company that runs our sign-in, stores a scrambled version that cannot be read back." |
| "Other people never see it." Section 1 says one cofounder can | 3a, school email | Medium | "No other user ever sees it." |
| "No AI features" with nothing about the AI coding assistant that reads the live database | Short version, 3c, 4 | Medium | Part 3b line 9, and part 8 sentence 14 |
| "The Vibe team reads" the inbox, "one of us" handles your data copy and hand deletion | 3g, 9 | Medium | Part 8, sentences 13 and 15 |
| Fragments with no verb read as a checklist, not as a person: "Not public: ...", "Off today: ...", five of the eight entries in section 6, the three lines of "What stays after an entry is deleted" | 5a, 6, 11 | Medium | A full sentence wherever the line does not sit under a lead-in that carries the verb |
| A machine is the subject: "the page asks for sign-in", "the app tells them", "Vibe's own database keeps no record", "Our code does not tag reports", "A daily clean-up deletes the whole entry" | 1, 3d, 5a, 5f, 11 | Medium | "We" or "Vibe" as the subject: "We do not tag reports with your account", "We delete the whole entry once a day" |
| "We aim" five times (24 hours for reports, 30 days for a data copy, 90 days for recovery proof, telling you before a sale, deleting an under-18 account's information) | 5h, 9, 3g, 5i, 12 | Low | Honest, keep. But "within 24 hours" is a three-person promise: keep it only if the cofounders mean it |
| "Danger zone" | 9 | Low | It is the app's label. Put it in quotes so it reads as a label, not as the policy's tone |
| No line says why the page is written the way it is | Intro | Low | One sentence after "This page says what Vibe knows about you...": "We wrote it to be read. If a line is unclear, write to hello@connectvibe.app and tell us." |

### Claims to check before they print (not legal advice)

1. "All traffic uses an encrypted connection (HTTPS)." (10) A plain "all". Fine if the host forces it; the fact check should say so.
2. "The account is deleted right away" and four more "right away". Checked against the code on October 3; the desktop Messages branch was not in that check.
3. "We aim to look at each within 24 hours." (5h) Not a claim about the code. It is a promise about three people.
4. The waitlist form says "I'm 18 or older and a current student" (`src/app/waitlist/waitlist-form.tsx:216`). Section 2 says verifying "does not prove that you are enrolled". The policy quotes the checkbox correctly; the form's wording is the thing to change, and it is outside this document.
5. The front page now shows real people in a film. The policy says nothing about using people's faces. Part 10 offers a sentence.

---

## 10. Plain words for what is new today

These are wording offers for facts that are not in the October 3 text. Each needs the fact check's yes before it prints. Sources are the founder's facts and the release code read for this report.

**Pinned messages** (5e, direct and group chats; `supabase/migrations/20261004100000_chat_message_pins.sql`, `src/app/api/me/threads/[id]/messages/[messageId]/pin/route.ts`):

> Anyone in a direct or group chat can pin a message, yours included, for everyone in that chat, and anyone in the chat can unpin it. The pinned list shows the message, who wrote it and when it was pinned. We store who pinned it. A pin goes when the message is deleted or removed, so deleting your message also unpins it. Club rooms have no pinned messages.

**Rooms where only some people post** (5e): the table in part 7b, and its last line: "In a room where you cannot post, you can still read, vote in polls and take a sign-up slot."

**The AI coding assistant** (6): part 8, sentence 14. One more line for section 4, after "use it to train AI models": "We build Vibe with an AI coding assistant. Section 6 says what it may read."

**The inbox** (3g, 6, 11): part 8, sentence 13.

**The film on the front page** (6 under Vercel, and 11 under "Which companies handle it?"; `src/lib/landing/demo-media.ts:28` loads it from Vercel's file storage):

> The short film on our front page loads from Vercel's file storage, so Vercel sees your IP address and browser when it plays. The people in it are the three cofounders and their friends, and they agreed to appear. We do not use anyone's name, photo or posts from Vibe in our marketing without asking them first.

The last sentence is a promise, taken from the Terms draft (`calls-for-franky.md`, call 4). It protects students more, so by rule 4 it goes in. It is kept by people, not by software. If the cofounders will not hold to it, cut that one sentence and keep the first two.

**No backups** (8): the sentence is already there and already plain. Keep it. The short version now carries it too (part 3b, line 7).

**The date.** The file says "Effective {{EFFECTIVE_DATE}}". `src/app/legal/privacy/page.tsx:22` sets "October 5, 2026". The founder's fact is that it publishes today. Write "Effective October 4, 2026" in both. Section 13 turns on "the date at the top", so a wrong day there is a wrong rule.

---

## 11. What to cut, and what to move

The October 3 pass already took out about 900 words. What is left to cut is small. Do not cut facts to reach a number.

| # | What | Where | Saves |
|---|---|---|---|
| 1 | Search words are told twice: "Search words are not stored in our database, but our hosting company can log them" (3d) and "Some web addresses carry personal details, such as search words" (6, Vercel). Keep section 6. | 3d | 25 |
| 2 | The email log is described in full twice (3d and 11). Section 11 must stand alone, so keep it there whole. In 3d, cut to: "We keep a log of every email Vibe sends. It holds a scrambled code in place of your address (section 11 says what else)." | 3d | 55 |
| 3 | "Messages are not end-to-end encrypted (section 5h)" in section 10 repeats 5h. Keep six words and the link. | 10 | 10 |
| 4 | "(the number that identifies your internet connection)" appears twice. Keep it in 11 (it stands alone) and at the first use in section 1; that is already what the text does. No cut. | | 0 |
| 5 | 3f, switched-off features, about 230 words inside "What we collect". Do not cut it: the code exists, a later change would mean a new notice, and the company names in it are disclosures. When the order changes (part 4c), move 3f to the end. No cut today. | 3f | 0 |
| 6 | "The same button is on the 'verify your campus' screen and the suspended notice." Useful to almost nobody reading. Keep "the suspended notice" (a suspended person needs it) and cut the other. | 9 | 8 |
| 7 | Section 1's list of what the admin tools show repeats 5h ("a copy of what was reported") and 11 ("the waitlist"). Keep the list, cut the two bracketed pointers to one line at the end. | 1 | 15 |
| 8 | The intro's '("we", "us")'. Cut the bracket, and add after the next sentence: "In this policy, 'we' means that company." Same length, no legal bracket in the first paragraph. | Intro | 0 |
| 9 | "There are no advertising or tracking cookies, so there is no cookie banner." Keep: it explains something the reader notices. No cut. | 7 | 0 |
| 10 | The fragments in section 9's "What stays" that only point elsewhere: "The files that deleting your account misses (section 8)." Keep the pointer, but fold it into the evidence line above it. | 9 | 8 |

Total cut: about 120 words from these, and about 150 more from turning the eight paragraphs of part 7b into lists (lists drop the joining words). The new facts in part 10, the longer short version and the "Who can see what" table add about 450. **Expect about 6,200 words.** That is right: the page gets easier to use, not shorter.

**Moves** (all in part 4b, point 5): the block notice from 5g to 5a; "If you decline a new version of the Terms" from 9 to 13; the handle line out of "What stays"; and, on the day of the reorder, 3f to the end.

---

## 12. What this read did not do

- It did not re-check facts against the code, apart from the three new-Messages points it needed for wording: who "officers" are in a room's post rule, who can pin and unpin, and who creates a club's rooms. Every replacement in part 8 keeps the original's meaning except the three marked **fact**, and those rest on the founder's facts, not on code I opened.
- It did not read the Terms, the Community Guidelines or the delete-account page for voice. `changes-after-verify.md` section 4 already lists where they contradict the policy.
- It did not test the page in a browser at 375px. The table-width point in part 7 comes from reading `LegalTable`, not from a screenshot.
- The reading-grade figures come from a Flesch-Kincaid count run on the markdown file. They are a guide, and part 1 says why they flatter this text.
