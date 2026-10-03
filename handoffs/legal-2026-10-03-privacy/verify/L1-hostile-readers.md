# L1: three hostile readers on Privacy Policy v2

Read 2026-10-03. File read: `handoffs/legal-2026-10-03-privacy/privacy-policy-v2.md` (361 lines), against the live pages in `src/app`, the waitlist branch, the September 29 Terms draft and `calls-for-franky.md`. Nothing was changed except this report. This is a reading, not legal advice: every item is a flag for the founders and the lawyer.

## The short answer

The draft is unusually honest, and most of it holds. It is not ready to publish as is, for three reasons.

1. **It teaches an attacker.** About a dozen sentences name a weak spot and how to use it (who holds the keys, that admins have no second sign-in step, which cookie setting is missing, which data can be pulled "from our database", which ban check is never run). Each can be said honestly without the how-to. Six are cheaper to fix in code than to admit.
2. **It disagrees with pages a user can open today.** The delete-account page, the live Terms, the Community Guidelines, the Child Safety page, the Vibe+ page, Support and one Settings card each say something this policy says is not so. Most fixes belong on those pages, and they need to ship the same day.
3. **A few sentences are false or cannot be kept on day one.** "Never shown to other users" (the starter name is the front half of the sign-in email), "No location" (chat and club media keep it), "whatever happens" (the 40 days restart), "we change that version and ask every account" (the default plan does not), "we keep no backups" (not checked).

Counts: 17 must-change, 19 should-change, 9 other pages or screens that contradict.

---

## A. Must change before publishing

Each item: where, what is wrong, the fix. "Code first" means the cheaper path is a code change, then the sentence can go.

### M1. Section 1 and 10: the one person with the keys is named, next to "no two-factor for the admin accounts"
- Text: "Only one cofounder, Francisco Cazares, can reach the database, the file storage and our providers' dashboards directly." and (section 10) "No two-factor sign-in, for you or for the admin accounts. ... No record of what the people in section 1 read."
- Problem: read together these say whom to phish, that a password is the only thing in the way, and that nobody would see it afterwards. The name is also marked NOT VERIFIED, and the brief was "no individual named unless needed". It is not needed: "one cofounder" tells a user the same thing.
- Fix: "Only one of the three cofounders can reach the database, the file storage and our providers' dashboards directly." In section 10: "Vibe does not offer two-factor sign-in today." Keep one plain sentence about the missing access log in section 1 only. Take the name out of the Terms draft's opening paragraph too.
- Code first: turn on two-step sign-in at Supabase, Vercel, Cloudflare, Resend, Sentry, Stripe, Gmail and Outlook (all offer it, no code). Then the policy can say "our provider accounts use two-step sign-in" instead of admitting the opposite.

### M2. Sections 7 and 10: the cookie flag, the cookie name, "no CSRF cookie", the reset token
- Text: "the sign-in cookie can be read by scripts on our own pages"; "named `sb-...-auth-token`"; "no advertising, analytics, consent or CSRF cookie"; "a password-reset token moved out of the address bar"; "They last up to 400 days".
- Problem: this is a recipe. It says the session cookie is not protected from page scripts, what it is called, that it lives 400 days, that there is no CSRF token, and where a reset token sits in the tab.
- Fix: section 7: "Only the cookies that keep you signed in. They last up to 400 days and are refreshed as you use Vibe. There are no advertising or analytics cookies, so there is no cookie banner." Drop the cookie name, "CSRF" and the reset-token example ("A few items live for one tab only."). Section 10: delete the cookie sentence. If a user-facing sentence is wanted: "If a harmful script ever ran on a Vibe page it could act as you until you sign out."

### M3. Sections 5b, 5e, 5g: three "from our database, though no screen shows it" sentences
- Text: 5b "From our database, though no screen shows it: the member list of a club anyone can join, and for any account the day it was made, when it was last active, when its handle last changed and its lifetime profile-view count." 5e "The app does this; the database rule behind it does not apply the block." 5e "other members of a chat can read from our database when you last read it and whether you muted, pinned, hid or cleared it." 5g "the block record can be read from both sides."
- Problem: each tells a signed-in person exactly where to look for something the app hides: anyone's last-active time (a stalking tool), messages from someone who blocked them, whether a chat partner muted or hid them, and who blocked them. The last one also contradicts the Vibe+ page ("no seeing who blocked you") and Support ("They aren't told").
- Fix (wording that keeps WHAT and WHO): 5b "Any signed-in account can also learn, for any account: the day it was made, roughly when it was last active, when its handle last changed and how many profile views it has had; and the member list of a club anyone can join." 5e "In club chats a block is a courtesy screen, not a wall: treat what you write in a club room as readable by every member, including someone you blocked." 5e "Other members of a chat may be able to tell when you last read it and whether you muted, pinned, hid or cleared it." 5g "The person you blocked is not notified, but they may be able to work out that they were blocked."
- Code first: all four are small database-rule fixes already listed in calls-for-franky section 3. Fix them and delete the sentences.

### M4. Section 9, "What stays" item 1: the ban check that is never run
- Text: "Nothing checks the sign-in-email hash today; it is kept as a record. A ban does not stop someone making a new account."
- Problem: instructions for coming back after a ban (same sign-in email, a different school address). The Terms draft section 12 says the same in more words.
- Fix: "The school-email record stops that address being verified on another account while the suspension or ban is in force. The sign-in-email record is kept as evidence." Stop there.
- Code first: check the second hash at sign-up (Terms companion H17). Until then, say nothing about what is unchecked.

### M5. Section 9: "No waiting period, no undo, no password asked"
- Text: "type your handle, and the account is deleted at once. No waiting period, no undo, no password asked." plus "What your deletion takes from other people ... no cancel notice is sent" and section 8 "We keep no database backups."
- Problem: the handle is public. Read with M2, this says anyone holding a session (a stolen cookie, an unlocked phone, a lab computer) can wipe an account, a club's events and other people's chats for good. Users do need to know deletion is instant and takes other people's things with it; they do not need "no password asked".
- Fix: "type your handle to confirm, and the account is deleted at once. There is no waiting period and no undo." Keep the "takes from other people" paragraph but drop "and no cancel notice is sent".
- Code first: ask for the password on delete (the Terms draft already recommends it), and re-home club events (H19).

### M6. Sections 3d and 3e: how the limits and the word filter work
- Text: 3d "mostly by account id ... password reset (the full address), and school-email requests, code entry and the waitlist form (the address, or the first half of an IPv6 address) ... Rows older than a day are removed by a clean-up that runs by chance". 3e "No image scanning. One automated check exists: a short word list is checked before text is saved. A match is refused, and nothing about the attempt is kept."
- Problem: tells an abuser what each limit counts by (so how to get round it), that uploads are never scanned, that the filter is a short list and that probing it leaves no trace.
- Fix: 3d "To stop abuse we count actions over short windows. A few counters hold an IP address, or part of one, because the person may be signed out. These counters are the only place in Vibe's own tables that holds an IP address. Most are removed within days; some can stay for weeks." 3e: drop "No image scanning" and the last two sentences; keep "A small set of words is blocked before text is saved" (the Community Guidelines already say it).

### M7. Sections 3a and 5f: "never to other users" is not true for a new account
- Text: 3a "Sign-in email: ... Shown to you in Settings, never to other users." Same table, next row: "Until you choose one, your display name is the part of your sign-in email before the @, and signed-in users can read it." 5f "Officers never see email addresses."
- Problem: the two rows contradict each other. For a Gmail sign-in the front half is, in practice, the address. An unverified account can follow a club, and the officers then see that name on the follower card.
- Fix, code first (one line in the sign-up trigger: start with a neutral name such as "New member"). Then both "never" sentences become true and the admission goes. If the code stays: say it in the short version and change 3a to "not shown to other users, except as described in the next row", and 5f to "Officers are not shown email addresses".

### M8. Section 3e: "No location" against section 3c
- Text: 3e "No location: Vibe never asks your device for it, our page headers block it, and we never work it out from your IP address." 3c "These keep their original details, which can include where they were taken or filmed: videos, photos on a club's posts, club logos and banners, photos and videos sent in chats, group chat pictures".
- Problem: Vibe stores location inside those files. A store reviewer or regulator reading 3e alone is misled, and the store forms have a Location line.
- Fix: "We do not ask your device for its location and we do not work it out from your IP address. Some photos and videos you upload carry a location inside the file (section 3c)." Put the same fact in the short version (see S1).

### M9. Sections 1, 3a, 10: "only our server" against "one cofounder can read everything"
- Text: 10 "Your email addresses, proof of agreement and moderation records can be read only by our server code." 3a "Read only by our server." 1 "That access can read everything Vibe stores, including both your email addresses". Also 1 "The admin tools do not show email addresses" against 1 and 11 "showing a full waitlist address is logged first".
- Fix: 10 "No other user, and no screen in the app, can read your email addresses, proof of agreement or moderation records. The direct access in section 1 can." 1 "The admin tools do not show an account's email addresses ... The one address they can show is a waitlist address (section 11)."

### M10. Section 8: "We keep no database backups" is unchecked and contradicts two live pages
- Text: "We keep no database backups. ... deleted data does not sit in a backup of ours."
- Against: `/legal/delete-account` today: "Deleted data can also sit in our hosting provider's routine backups". Live Terms section 4: "copies retained in backups for a limited period". Live Privacy: "Encrypted backups may retain copies for up to 30 days".
- Problem: the source is a September 30 note, not the dashboard. If the plan has backups, this sentence, the "up to 40 days" waitlist promise and "deleted at once" are all false.
- Fix: check the Supabase plan first. Then make this paragraph and the delete-account page say the same thing on the same day.

### M11. Section 13: "we change that version, and Vibe asks every account to accept again"
- Text: "When either changes in a way that matters, we change that version, and Vibe asks every account to accept again the next time it opens." Then the bracket: "Draft assumes: accounts are asked the next time the version changes; until then this page is a notice."
- Problem: this policy is itself a change that matters (view records with names for Vibe+, three cofounders reading reported messages, no end date on moderation records). Under the default plan the version is not changed on publish day, so the sentence is untrue the day it goes live. Two more things follow. The live policy people ticked for promises "reasonable notice (in-app or by email) before they take effect". And a new sign-up between publish day and the Terms change is recorded under the same version string as someone who agreed in May, so the record cannot show which policy they saw.
- Fix (pick one): (a) change the recorded version on publish day, or record a separate privacy-policy version, so the sentence is true; or (b) keep the plan, and rewrite: "This policy was published on [date]. Accounts made before then are shown a notice and are asked to accept it together with the new Terms on [date]." and show that notice in the app. Calls-for-franky item 2 should carry this consequence.

### M12. Sections 2 and 13: "Using Vibe never counts as agreeing" against the live Terms
- Policy: "Using Vibe never counts as agreeing." / "Using Vibe is never acceptance."
- Live Terms (`/legal/terms`): "By creating an account or using the Service, you agree to these Terms." and "Continued use of the Service after the effective date of the update means you accept the updated Terms." The live Privacy page says "By using Vibe, you agree".
- Fix: publish this policy and the new Terms together, or change those two sentences in the live Terms the same day.

### M13. Section 5h and the short version: "We read private messages only ..." has three different versions, and two more cases exist
- Policy: "We read private messages only when one is reported to us, when we have specific evidence that a conversation is being used for spam, threats, exploitation or another serious breach of the Terms, or when the law requires it."
- Terms draft section 9: "We can read chats when a report or the law requires". Terms draft section 11: "We may also look at content on our own, including messages, when we have reason to think these Terms are being broken or the law requires it."
- Also: section 9 says a founder builds "a copy of your data" by hand, which means opening that person's messages; the Terms draft section 13 checks "who you message" to recover an account. Neither is one of the three cases. And section 1 says no record is kept of what is read, so "only" cannot be shown to anyone.
- Fix: one sentence, used word for word in all three places: "We read private messages only when one is reported to us, when you ask us to (for example a copy of your data or an account recovery), when we have specific evidence of a serious breach of the Terms, or when the law requires it." For the lawyer: whether an "only" promise is wise with no access log.

### M14. Section 11: "up to 40 days ... whatever happens"
- Text: "We keep your answers for up to 40 days after you join the list, whatever happens." Two sentences later: "Sending the form again before you confirm replaces your answers and restarts the 40 days."
- Problem: the two disagree. The form can be sent by anyone who knows the address, so an entry can be kept alive, and its answers replaced, by someone else. "Whatever happens" also rests on one daily job nobody watches, and on M10.
- Fix: "We delete your entry within 40 days of the last time the form was sent for your address. A daily clean-up does this." Drop "whatever happens" here and "replaces your answers" as a described feature. Worth a code look: an unconfirmed entry should not be overwritten by a second sender.

### M15. Sections 8 and 9 against `/legal/delete-account` (Google Play's deletion page)
- Policy: evidence files "No end date today"; "These are kept even if the report was later dismissed." Delete page: "kept privately ... for up to a year". Live Privacy says "up to a year" too.
- Policy: "Files deletion cannot find: files of messages you had deleted one by one, group pictures you uploaded, and photos and videos you posted as a club". Delete page: "every photo, video and document you uploaded is erased from storage, not just hidden, except files kept because of a report" and "the photos and videos you sent".
- Policy: events you made as a club are deleted with "everyone's RSVPs and its whole chat". Delete page: "A club you started stays up for its other members; your posts, uploads and role in it are removed."
- Policy: the suspension record keeps "the private moderator note" and two hashes for a suspension too. Delete page agrees, but says "The code can't be turned back into an address" with no "without the key".
- Fix: the store reviewer reads the delete page, not this one. Rewrite its "What is deleted" and "What we keep" lists from section 9 and ship both together. Decide the evidence period (a year, or none stated) once, for both pages and the Terms.

### M16. Section 5i: disclosure to police and NCMEC says less than the Child Safety page
- Policy: "We disclose information when a law, subpoena or court order requires it. ... where the law requires a report, a founder makes it by hand."
- Child Safety page: "We escalate to law enforcement and to the National Center for Missing & Exploited Children (NCMEC) where the law requires it or where we believe a child is at risk." Terms draft section 8: "we report it to the National Center for Missing & Exploited Children and the authorities".
- Fix: "We also give information to the police, emergency services or NCMEC without being asked when we believe someone is in danger or a child is at risk." Drop "No code sends anything to law enforcement or to NCMEC": it reads as a gap, and it helps nobody.

### M17. Section 7: "Sign out ends every session of your account on every device"
- Settings card today: "End your session on this browser." Terms draft section 13: "Signing out from any device signs you out everywhere within about an hour."
- Fix: "Signing out signs you out on every device, within about an hour, and removes the account's push devices." Change the Settings line to match.

---

## B. Reader 1: the regulator and the plaintiff's lawyer

### B1. Flat promises a three-person team has to keep every day
| Where | Words | Risk | Softer and still true |
|---|---|---|---|
| Short version | "Section 1 says exactly what they can see." | "exactly" turns any missed screen into a false statement | "Section 1 lists what they can see." |
| 3d | "We never attach your account id or email" (Sentry) | error text and addresses can carry either | "Our code is set not to attach..." |
| 5a | "The folder cannot be listed." | a security claim | drop |
| 8 | "No link to it can be made, but it stays in storage." | a security claim about a file you admit keeping | "It is no longer shown anywhere in Vibe, but the file stays in storage." |
| 10 | "No other site can frame Vibe." | a security claim | drop, or "Our headers tell browsers not to..." |
| 11 | "so it cannot be used to learn who is on the list or who has an account" | a security claim | "The form is built to give everyone the same answer." |
| 11 | "each look is logged before the address appears" | fine if the code does it every time; it is the only access log Vibe has | keep |
| 5i | "we will tell you before your data moves to a new operator" | hard to keep in a forced sale | lawyer |
| 5c | "never the original" | a bug here is a false promise about a résumé | "a copy with the bars burned in, not the original" |
| 9 | "We aim to send it within 30 days" by hand | fine as an aim; the founder who builds it reads the data (M13) | keep, add M13 |
| many | "today" (billing off, push off, no news email, no comment delete) | each goes stale the day a switch flips | add to the go-live runbook: "update the policy" before each switch |

### B2. Surprising things buried deep that belong in the short version
1. Photos and videos in chats, on club posts and every video keep the location inside the file (3c).
2. Your starter name is the front of your sign-in email (3a), unless M7 is fixed in code.
3. Deleting your account removes your messages from other people's chats, and an officer's deletion removes a club's events, everyone's RSVPs and the event chats (9). The reverse is true for you.
4. "Clear chat history" and "Delete conversation" delete nothing; a comment cannot be deleted; a deleted message's photo stays in storage (8).
5. One cofounder can technically read everything, every message included, and no record is kept (1). The short version says only "not end-to-end encrypted".
6. Any signed-in account, verified or not, at either university, can read posts, comments and follow lists (2, 5b).
7. An "Anonymous" poll is stored with your name (3c).
8. No backups: a mistake cannot be undone (8), once M10 is checked.

### B3. Consent
- **Waitlist people never tick this policy.** Their three ticks are "I'm 18 or older and a current student", "Email me when it's my turn", "Also send me Vibe news". Section 2 says ticking the sign-up box "is how you agree to this policy". Say plainly in section 11: "Joining the waitlist is not agreeing to this policy. This section is our notice to you." 
- **The form notice says less than section 11.** Notice: "Supabase stores them, Vercel runs the site and Resend sends our emails." Section 11 adds Google (fonts), Sentry, the university mail system, the source tag, that founders see your name and answers, the IP counter and the email record that outlives the entry. Add "and a few others, listed in the Privacy Policy" to the notice, or the gap is the first thing a regulator quotes.
- **People a founder adds by hand** ticked nothing: no 18+, no "email me". Their first email is the access code. Say what that rests on ("because you asked us to") and for how long the entry is kept (the 40-day rule is written only for form entries).
- **"a current student"** on the form disagrees with section 2 ("does not prove that you are enrolled") and with the Terms draft, which lets staff and alumni verify. Suggested tick: "I'm 18 or older and have an IU or Purdue email."
- **"Use the link in our newest email; older links stop working."** An opt-out link that dies when a newer email is sent is a question for the lawyer before any news email goes out.
- **One tick for age, Terms and Privacy** (section 13). For the lawyer. At the least, record a privacy version of its own (M11).
- **Existing accounts**: see M11.

### B4. Where the policy says less than the app does
- Section 4 has no line for suggesting people and clubs (Otto's People panel uses mutuals and major), for account recovery checks, or for building a data copy.
- Section 5h "The person reported is not told about the report or who filed it": in a two-person chat the reporter is obvious, and section 5h itself says a removed message is shown to its author "marked as removed with the reason". Add "though they may be able to guess".
- Section 3g: a photo of a student ID kept in a Gmail inbox with no deletion routine. Consider dropping the ID option; the other three proofs are enough.
- Section 6 "Where each provider stores data is set in that provider's dashboard ... Ask and we will tell you what we know": find out and state it (for example "in the United States").
- Section 9 item 1: say that a keyed hash lets us test whether a given address matches the record, though we cannot list addresses from it.
- Section 11 "addresses masked (like f*****@iu.edu), next to your name": at IU and Purdue a name plus a first letter is nearly the address. Say "partly hidden", not "masked".

---

## C. Reader 2: the App Store and Google Play reviewer

Checked against `mobile/` (Capacitor shell that loads www.connectvibe.app), `mobile/android/app/src/main/AndroidManifest.xml` and `mobile/ios/App/App/Info.plist`.

| Question | What the reviewer finds | Verdict |
|---|---|---|
| Is deletion where the policy says? | Settings has a card headed "Danger zone / Delete your account", button "Delete account…", type the handle, "Permanently delete". Policy: "Settings → Danger zone, type your handle". | Matches. |
| Other places | Policy adds "the 'verify your campus' screen, in onboarding and on the suspended notice". The delete page names only verify and the suspended notice. | Small mismatch: drop "in onboarding" or add it to the delete page. |
| A way to ask by web without the app | Policy: "write to help@connectvibe.app". It never gives the public page. | Add "or see connectvibe.app/legal/delete-account" in section 9. That is the address Google Play asks for. |
| Does the delete page agree with the policy? | No (M15). | Must fix together. |
| Android permissions | Manifest asks only for INTERNET and POST_NOTIFICATIONS. Policy: "The only permission the Android app asks for is notifications." | Matches. |
| iPhone permissions | Info.plist has camera, microphone, photo library, and "add to photo library" (saving a photo or video). Policy lists the first three, "only when you take or pick a photo or video". | Add "or save one". |
| Push before a yes | Firebase auto-start is off in both projects. Policy: "After your first yes in the app, Firebase checks in with Google each time the app opens". | Matches. |
| Vibe+ in the app | `/plus` hides the price and pitch inside the app. Policy: "Vibe+ is not sold inside the iPhone or Android app." | Matches. |
| Location | Policy says "No location" but stores location inside some media (M8). | Decide what the store forms say, then make 3e say the same. |
| Third parties named | Supabase, Vercel, Cloudflare, Resend, Sentry, Google (Fonts, Gmail, Firebase), Microsoft, Stripe, Apple. | Complete as far as the code shows. |
| Age | "You must be 18 or older", section 12 "Vibe is for adults". No word on the store rating. | Add one line: "The store listings are rated 18+." |
| A contact | Three email addresses. "We publish no postal address." | Google Play shows an organisation's address on the listing. That sentence becomes untrue the day the listing is live. Reword: "The postal address is on our store listings" or wait for the lawyer's answer. |
| Things the policy says the apps do | It describes two apps that are not in a store yet ("once they are in the stores"). Section 3f "switched off today" covers push. | Fine, if section 3f is re-read the day each app is submitted. |

**The store forms.** The policy has no list a reviewer can lay beside the Data safety form and Apple's privacy label. What the text implies, so the forms can be filled to match:

| Store category | In the policy | Note |
|---|---|---|
| Contact info: email, name | 3a, 3b | linked to the account |
| User content: photos, videos, messages, other content, support emails | 3c, 3g | messages are readable by Vibe (5h): do not tick "encrypted end to end" |
| Identifiers: account id, push address | 3a, 3f | a push address counts as a device identifier on both forms |
| Usage: profile and post views, last active | 3d | used for a product feature (Vibe+), not analytics |
| Diagnostics: error reports, 10% performance sample | 3d, 6 | Sentry; "not linked to you" holds only if the "never attach your account id" sentence in 3d holds (B1) |
| Location | 3c against 3e | see M8 |
| Purchases | 3f | off; Stripe on the web only |
| Search history | 3d | not stored by Vibe; passes through host logs |
| Data shared with third parties | 6 | none sold; all are service providers |
| Deletion | 9 | in-app, plus the web page |

Suggestion: add this table as a short appendix, or keep it in the go-live runbook so the forms and the policy cannot drift.

---

## D. Reader 3: the attacker's list

Every sentence that works as instructions, the honest wording without the how-to, and whether code is the better fix. M-numbers point back to part A.

| # | Where | Sentence (short) | What it hands over | Honest wording | Fix in code first? |
|---|---|---|---|---|---|
| D1 | 1 | "Only one cofounder, Francisco Cazares, can reach..." | the one target | "Only one of the three cofounders..." | n/a (M1) |
| D2 | 10 | "No two-factor sign-in, for you or for the admin accounts" | admin accounts are password-only | "Vibe does not offer two-factor sign-in today." | Yes: two-step sign-in on every provider login now; in-app later |
| D3 | 1, 10 | "We keep no record of what is read this way or of what admins look at" (said twice) | no trail after a break-in | say it once, in section 1, as a limit on our promise | Yes: a log line on each admin route is small |
| D4 | 10 | "the sign-in cookie can be read by scripts on our own pages" | the missing cookie flag | delete (M2) | Partly: a strict content policy for scripts |
| D5 | 7 | cookie name, "CSRF", "password-reset token moved out of the address bar" | names and places | M2 | No |
| D6 | 5b | "From our database, though no screen shows it: ... last active ..." | where to read anyone's last-active time | M3 | Yes |
| D7 | 5e | "the database rule behind it does not apply the block" | how to read a blocker's club messages | M3 | Yes |
| D8 | 5e | "other members of a chat can read from our database when you last read it..." | where to read mute, hide, read marker | M3 | Yes |
| D9 | 5g | "the block record can be read from both sides" | how to find out who blocked you | M3 | Yes |
| D10 | 9 | "Nothing checks the sign-in-email hash today ... A ban does not stop someone making a new account." | how to come back after a ban | M4 | Yes (H17) |
| D11 | 9 | "no password asked" | a session plus a public handle destroys an account | M5 | Yes |
| D12 | 9 | "Each event takes everyone's RSVPs and its whole chat with it ... no cancel notice is sent" | how one officer can quietly wipe a club's calendar | keep the first half, drop the last clause | Yes (H19) |
| D13 | 3d | what each limit counts by, IPv6 half, clean-up "by chance" | how to get round the limits | M6 | Yes: a scheduled clean-up also removes an admission |
| D14 | 3e | "No image scanning ... a short word list ... nothing about the attempt is kept" | uploads are unscanned; the filter can be probed freely | M6 | No |
| D15 | 5a | "through a link on our site that hands out a storage link good for one hour" | an open door that mints file links | "Post videos and club photos and videos can be opened by anyone who has the link, without signing in." | Maybe: check it refuses posts the asker could not see |
| D16 | 5a | "The links do not expire. The folder cannot be listed." | public bucket, permanent links | "These open for anyone who has the exact link, and the link keeps working." | No |
| D17 | 2 | "name@iu.edu, name+2@iu.edu and name@mail.iu.edu count as the same address" | which variants are folded (and so which may not be) | "Variants of one address count as the same address." | No |
| D18 | 3a | "Your starter handle is 'u' plus your internal account id." | ties a handle to the database id | "Your starter handle is made for you." | No |
| D19 | 3c, 5e | "our database holds the vote" / "nobody gets names through the app" | hints that names can be had another way | "No member or officer can see who voted. The direct access in section 1 could." | Rename the switch, or stop storing the name |
| D20 | 11 | "Sending the form again before you confirm replaces your answers and restarts the 40 days." | anyone with your address can overwrite your entry and keep it alive | M14 | Yes |
| D21 | 8 | post deleted "at once" with its files unless "a report about it is open"; "An edit replaces the old text"; a message is "deleted at once for everyone"; "We keep no database backups" | post, harm, delete before anyone reports: no evidence | users need these facts; do not hide them | Yes, later: a short hold on deleted posts and messages. Not a wording fix. |

Better fixed in code than admitted, in order of value for effort: D7, D9, D6, D8 (database rules); the starter name (M7); D10; D11; D20; D2 (provider settings, no code); D3.

---

## E. The other checks

- **Individuals named.** One: "Francisco Cazares" in section 1 (and in the Terms draft's opening). Not needed. See M1.
- **"Verified student" wording.** None in the policy; it says "verified school email" and explains it well. The only "student" claim is the waitlist tick it quotes ("a current student", B3). The Community Guidelines still say "a real student at a real school" (part F).
- **University endorsement.** Nothing implies it; the opening disclaimer is clear. One accuracy point in section 2: "Refused: retired IU addresses such as @iupui.edu, @pfw.edu, @pnw.edu". The last two are Purdue Fort Wayne and Purdue Northwest addresses, not retired IU ones. Suggested: "Refused: @iupui.edu, @pfw.edu, @pnw.edu and every other school's addresses."
- **Cross-references inside the document.** All checked and correct: short version → 1, 5, 9, 11; 2 → 3g, 5, 11; 3a → 11, 13; 3d → 7; 5h → 1; 6 → 3d, 3f, 4; 8 → 9, 11; 9 step 2 → "item 4 below"; 11 → 3d, 6; 12 → 9; 14 → 9. The Terms draft's pointers to policy sections 1, 5, 8 and 9 still land.
- **Numbers.** 40 days, 30 days, 7 days, 14 days agree with the form (`WAITLIST_RETENTION_DAYS`) and both emails. 48 hours and "30 to 60 minutes" agree with the Terms draft. 90 days for profile viewers against "kept until deleted" in section 8 is consistent (shown 90 days, stored longer) but reads like a clash: add "we show you the last 90 days; the records are kept as section 8 says".
- **Counting.** Section 4: "Our systems send five kinds of email" then names a sixth (the admin alert). Section 6 says Supabase "sends the 'confirm your account' email" and that Resend holds "every email our code sends"; the bracket says this is unverified. Settle which it is, then say it once.
- **Section 8** "The one scheduled clean-up is the waitlist's" against 3f "or the device is unseen for 60 days". Say "the one clean-up running today".
- **Section 7** "It keeps no copy of any feed, profile or message" comes straight after a list of profile and post copies kept in the browser. Reword: "The offline page stores nothing else."
- **Dates.** "Effective [PUBLISH DATE]", "[VERSION]", "before late September 2026" are consistent. The draft note says it was written "after the landing-night merge"; the waitlist is still on a branch, so publish only with it.

---

## F. Other pages and screens that contradict the policy (both quoted)

Live today, a user can open each one.

| # | Page | It says | The policy says | Which one to change |
|---|---|---|---|---|
| F1 | `/legal/delete-account` | "every photo, video and document you uploaded is erased from storage"; "kept ... for up to a year"; "can also sit in our hosting provider's routine backups" | "Files deletion cannot find..."; "No end date today"; "We keep no database backups." | The delete page (M10, M15) |
| F2 | `/legal/terms` (live) | "By creating an account or using the Service, you agree"; "Continued use ... means you accept"; "Be currently enrolled at, or affiliated with, a U.S.-accredited college or university"; "copies retained in backups" | "Using Vibe never counts as agreeing."; "It does not prove that you are enrolled"; no backups | The live Terms, or publish both together (M12) |
| F3 | `/legal/community` | "Everyone here verified a school email, which means the person on the other end of a post, a comment or a message is a real student at a real school." | "It does not prove enrollment or identity." and "Without a verified school email an account ... can still read what any signed-in account can read" | Community page |
| F4 | `/legal/community` | "Counts are public; who did what is yours." | Vibe+ shows who viewed you; a like sends the author "a notification naming the liker"; follow lists are open to every signed-in account | Community page |
| F5 | `/legal/child-safety` | "You need a verified school email to be here" and "enrolled at a U.S.-accredited college or university" | an unverified account can sign in and read; verified does not mean enrolled | Child Safety page |
| F6 | `/legal/child-safety` | "We escalate to law enforcement and to ... NCMEC where the law requires it or where we believe a child is at risk." | "We disclose information when a law, subpoena or court order requires it." | The policy (M16) |
| F7 | `/plus` | "Three things the database already keeps private from everyone, including from us on the free tier"; "no seeing who blocked you" | "That access can read everything Vibe stores"; "the block record can be read from both sides" | The Vibe+ page for the first; code for the second (M3) |
| F8 | `/support` | "Someone you block can't message you, see your posts or find you in search" | "A block cannot reach people who are signed out: they still see your public profile and any club posts you made." and the club-chat block sentence | Support page: add "while they are signed in" |
| F9 | Settings, Sign out card | "End your session on this browser." | "Sign out ends every session of your account on every device" | Both (M17) |

Not contradictions, but worth knowing: the Community page and Support both promise "We remove it within 48 hours of a valid request" for intimate images. The policy does not repeat it. That is the one hard deadline on the site, and with three people it needs someone on call every day.

**The September 29 Terms draft**, beyond the five items already in calls-for-franky section 4:
- Changing a login email: Terms section 4 "email hello@connectvibe.app"; policy sections 1 and 9 "write to help@connectvibe.app".
- Provider logs: Terms section 14 "Short-lived operational logs"; policy section 9 item 10 "We have not confirmed how long each is kept."
- Résumés: Terms section 7 "visible only to signed-in users you have not blocked"; policy 5c adds "with a verified school email".
- Files: Terms section 14 "we never delete the account and leave your files behind"; policy section 9 item 5 lists files that stay.
- Reading messages: three different standards (M13).
- Sign-out: "within about an hour" (M17).
- The Terms' opening names the cofounder (M1).
- Under 18: Terms section 12 "we close it and delete its data"; policy section 12 "We then aim to delete its data by hand" and the ban tool keeps the hashes.

---

## G. Should change (clearly better, not blocking)

| # | Where | Problem | Fix |
|---|---|---|---|
| S1 | Short version | Eight surprising facts are deep in the text (B2) | Add the top four: location in chat and club media; your deletion takes other people's messages and events; one cofounder can technically read everything; any signed-in account can read posts and follow lists. Cut the "no two-factor" bullet to make room. |
| S2 | 11 | Waitlist people have not agreed to the policy; founder-added people ticked nothing | Say so in one sentence each (B3) |
| S3 | Waitlist form | Notice names three providers; section 11 names more. Tick says "a current student" | Add "and others listed in the Privacy Policy"; change the tick (B3) |
| S4 | 11 | "older links stop working" for the leave link | Keep old links working, or ask the lawyer before any news email |
| S5 | 13 | One tick, one version for two documents | Record a privacy version of its own; lawyer on the bundled tick |
| S6 | Whole text | About ten "today" statements will go stale | A line in the go-live runbook for each switch: "update the policy first" |
| S7 | Short version, 3d, 5a, 5c, 8, 10, 11 | Flat words: "exactly", "never", "cannot", "No link to it can be made" | The softer wording in B1 |
| S8 | 9 | No link to the public deletion page | Add connectvibe.app/legal/delete-account |
| S9 | New appendix or runbook | No list to lay beside the store forms | The table in part C |
| S10 | 3f | iPhone "save to library" permission missing; no store rating line | Add both |
| S11 | 1 | "We publish no postal address" will clash with the Play listing | Reword once the lawyer answers |
| S12 | 3c, 5e | "Anonymous" poll is stored with the voter's name | Say who could see it (only the direct access in section 1); rename the switch "Hide names" |
| S13 | 8 | "Clear chat history" and "Delete conversation" delete nothing | Rename the buttons ("Hide"); the admission then goes |
| S14 | 2 | "@pfw.edu, @pnw.edu" called retired IU addresses | Reword (part E) |
| S15 | 3g | Student ID photos in a Gmail inbox | Drop the ID option |
| S16 | 6 | "Ask and we will tell you what we know" about where data is stored | Look it up and state it |
| S17 | 5h | "not told ... who filed it" | Add "though they may be able to guess" |
| S18 | 4 | Uses not listed: suggestions, recovery checks, building a data copy | Add one bullet |
| S19 | 4, 6, 7, 8, 5d | Small internal slips: "five kinds of email" then a sixth; who sends the confirm email; "the one scheduled clean-up"; "keeps no copy of any ... profile"; 90 days shown against kept until deleted | The rewordings in part E |

## Recommendation

Do the code and settings fixes that remove admissions first (database rules behind D6 to D9, the starter name, the second ban check, password on delete, two-step sign-in on the provider logins). Then apply M1 to M17, update the delete-account page, the Community, Child Safety, Vibe+ and Support lines in the same commit, and publish this policy on the same day as the new Terms rather than two weeks ahead of them. If the waitlist cannot wait, publish section 11 as a short waitlist notice on its own and hold the rest.
