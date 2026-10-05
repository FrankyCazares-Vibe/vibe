# Privacy Policy v3: questions for the lawyer

2026-10-04, for James to send. The policy is `privacy-policy-final.md`. It went live today as a notice, by the founders' decision, and the lawyer reads it in parallel. Each question below is one only a lawyer can settle. Each gives the default the policy uses until the answer comes. Laws are cited from memory: please verify each. Brought up to date after a second and a third round of checks the same day; what changed is marked "round 2" or "round 3".

The company in two lines: CONNECTVIBE. LLC, Indiana, three cofounders, no revenue, a handful of accounts at IU Indianapolis and Purdue Indianapolis, about 100 hand-picked testers next. One cofounder holds every login and the database; all three moderate; there are no backups and no access log.

## Most urgent

**1. Reading private messages (section 5h).**
- Question: are the six cases safe under the Stored Communications Act (18 U.S.C. 2701(c)(1)), the Wiretap Act and Indiana's wiretap law (Ind. Code 35-33.5)? Is the word "only" wise when one person has full access and nothing records what is opened? Does the blocked-word check on messages need anything more than the disclosure in 3e? Round 2: our bug tracker (Sentry) can receive the text of a message inside an error or speed report (section 3d), and the AI coding assistant may be shown such a report. Is disclosure enough until the code fix ships (18 U.S.C. 2702)? Round 3: on the code's reading this is not rare. About one request in ten to our servers sends a speed report, so the text of about one message in ten can be copied to Sentry as it is sent, together with the sender's sign-in cookie. The short version and 5h now say so. The fix (a few lines in one file) is listed for the same deploy as the policy.
- Default: six cases since round 2 (reported; someone in the chat asks us to or agrees; specific evidence of a serious break of the Terms; the law requires it; a chat fault that cannot be fixed any other way; we believe someone is in danger of death or serious injury, or a child is at risk), followed by "This is a rule we keep ourselves. No system enforces or records it." The sixth was added because 5i already said we may go to the police in an emergency, and "someone in the chat" because a data copy for one person holds the other person's messages. The new Terms will use the same six, word for word.

**2. Handing information to courts and the police (section 5i).**
- Question: may we say "For the content of private messages we ask for a search warrant"? What do we answer to a civil subpoena for message content (18 U.S.C. 2702, 2703)? Is "danger of death or serious injury, or a child is at risk" the right emergency test? Is "We aim to tell you before we hand over your information, unless the law forbids it or telling you would put someone in danger" safe to promise?
- Default: all four sentences are in the policy as quoted. Round 2 added: "no university has special access to Vibe. If one asks us about you, we treat it the way we treat the police." Is a request from IU or Purdue (state bodies) a government request under 18 U.S.C. 2702 and 2703, and is that sentence safe?

**3. Child safety (sections 5i and 12, and the Child Safety and Community pages).**
- Question: the exact steps of a report under 18 U.S.C. 2258A; whether we must register with NCMEC first; how long reported material must and may be kept, and where (mail to help@ lands in one cofounder's personal Gmail); whether the TAKE IT DOWN Act covers Vibe, and what record of requests to keep for its 48-hour rule.
- Default: "If we learn of sexual images of a child on Vibe, US law requires us to report them to … (NCMEC). The same goes if we learn that someone is trying to sexually exploit a child. The law also requires us to keep what we reported for a time. We follow that law." Round 2 widened it from images alone (the 2024 changes to 2258A, from memory). Round 2 also lets a person shown in a kept file ask us to delete it, account or no account (section 9): how does that sit with the duty to keep what was reported?

**4. Age (sections 2 and 12).**
- Question: is a checkbox enough for an 18+ app, on the web and in the stores? Is "ban at once, then delete within 7 days, keep the ban record and the scrambled email codes" right for a 17-year-old we find, and what must we keep? Which state laws on minors, social media and app-store age signals apply (Texas SB 2420, Utah, Louisiana, any Indiana law)? Is the "we do not knowingly collect from anyone under 13" line right for a site that is not aimed at children?
- Default: checkbox only; no date of birth; the three paragraphs of section 12. Round 2: the 7-day deletion now reads "unless a report or the law needs something kept first", because deleting the account also deletes its messages and there are no backups.

**5. Breach notice (section 10).**
- Question: confirm Indiana's deadline and Attorney General notice (Ind. Code 24-4.9; 45 days from memory) and which other states' laws would reach an email address with a password. Does our wider promise bind us for information the statutes do not cover?
- Default: email each person affected and post a notice, as fast as we reasonably can and no later than 30 days after we find out, unless the police ask us to wait or the law sets a shorter time; if we cannot tell whose information was reached, we tell everyone.

## Before billing, the stores or a news email

**6. Vibe+ shows a paying member who viewed them (sections 4 and 5d).**
- Question: is that a "sale" of personal data under any state law? Does the Video Privacy Protection Act (18 U.S.C. 2710) reach viewer names on video posts, and what consent would be enough?
- Default: billing is off. The policy says plainly that a member with Vibe+ sees the names, and (round 2) that "an account we give it to sees names today". The words "comes close to selling" were taken out. The cofounders are asked to give Vibe+ to no more accounts until this is answered.

**7. The outside companies (section 6).**
- Question: is "Each works under its own published terms and privacy policy" the right description? Once the data-processing terms of Supabase, Vercel, Cloudflare, Resend and Sentry are accepted, what may we say to meet Apple's "same or equal protection" line (guideline 5.1.1)? What is our position on a personal Gmail inbox and Google Fonts, which have no agreement with the LLC?
- Default: no "equal protection" sentence. The policy says we gave none of them permission to sell or advertise with the information, and that Google's two services run under Google's public terms.

**8. The AI coding assistant (section 6).**
- Question: under Apple's guideline 5.1.2 on third-party AI, does a coding assistant that may see server logs, error reports or the cofounder's own screens count as sharing personal data that needs permission first? Does the answer change with the plan the account is on?
- Default: disclosed. The rule (counts, settings and code fingerprints from the live database, never anyone's records) is stated as a rule people keep, with the two things outside it said plainly. Round 2 added three sentences: the rule is new and before October 4 the assistant could be shown records; logs and error reports can hold a sign-in cookie or the text someone was sending; and "We have not yet confirmed whether Anthropic may use it to improve its AI models" (the plan and the setting are being checked today). Does "we do not train AI on what you post" need that last sentence even once the setting is confirmed off? Round 3: the policy now says the rule covers the database only, and that "We have not yet written a rule for the inbox or for our accounts at the other companies on this list". The inbox holds safety reports and recovery proof. Is that sentence enough until the rule is widened (planned before October 16)?

**9. The waitlist (section 11).**
- Question: waitlist people never agree to the policy, so section 11 calls itself a notice. Is that enough? Is the access-code email "transactional" under CAN-SPAM, or does it need a postal address? What record should we keep when a cofounder adds someone by hand? What address may a news email print?
- Default: a notice, three checkboxes on the form, no news email until there is a postal address and a lasting unsubscribe link. Round 2: section 11 now says whether you run a club is looked at when waves are chosen, and the free-text line is read to learn what to build. Round 3 reverses one point: the landing page says "Or join the waitlist as a club officer", so section 11 and the form's notice now say "If you said you run a club, a cofounder may also write to you about setting up its page on Vibe." Is one personal email of that kind "commercial" under CAN-SPAM (15 U.S.C. 7704, from memory), so that it needs a postal address and a way to opt out? The LLC publishes no postal address (question 18). Until you answer, the cofounders keep it to one personal email and stop on request.

**10. The film and our marketing (section 4).**
- Question: is a text or email reply enough as written consent under Indiana's right of publicity law (Ind. Code 32-36-1)?
- Default: the people in the film agreed by word; a written yes from each is being collected. The policy promises no name, photo or posts in marketing without a yes.

**11. Files left behind after account deletion (section 8).**
- Question: do Apple's rule 5.1.1(v) and Google's deletion rule accept leftover files that are disclosed but not required by law (a deleted message's photo, group chat photos, replaced logos)?
- Default: disclosed in section 8; a clean-up is on the code list. Round 3 adds a hand route for the two things a person cannot delete alone: "Write to help@connectvibe.app from your sign-in email, and we aim to delete the comment or the messages by hand." Is an aim worded that way safe to publish, and does deleting one person's messages from a chat on request raise any issue for the other people in it?

## Can wait for the Terms

**12. Safety records (sections 8 and 9).**
- Question: how long may and must we keep reports, the moderation log, suspension and ban records and evidence files? Can a person make us delete a scrambled code made from their email?
- Default: "No end date yet. We will set one with our lawyer and write it here." Until then we delete a report copy or an evidence file on request, unless safety, the law or an open case needs it.

**13. One checkbox, and publishing as a notice (section 13).**
- Question: is one box for age, Terms and Privacy sound? The May policy promised notice "in-app or by email" before changes take effect; is publishing today as a notice, with acceptance asked when the Terms change, enough?
- Default: yes to both. Telling the handful of existing accounts by a message today is on the to-do list (`page-and-code-changes.md`, part 3); the policy itself says only "this page is our notice to you".

**14. Where people live (section 14).**
- Question: is "Those laws cover companies much bigger than Vibe is today" accurate for Indiana's Consumer Data Protection Act and California's? Does California's online privacy law (Bus. & Prof. Code 22575) need anything beyond the Do Not Track paragraph in section 7? Does a student using Vibe on a semester abroad bring European or UK law in, and is the last paragraph of section 14 enough, or too much?
- Default: rights for everyone, an answer within 30 days and 45 at the latest, no claim to comply with any named law. The last paragraph says we have no office or representative outside the United States. One option is to cut that paragraph to its first sentence (GDPR Article 27).

**15. A sale or a shutdown (section 5i).**
- Question: are "We aim to email your sign-in email and post a notice first" and "If Vibe shuts down, we plan to delete the database and the stored files, not sell them" promises the LLC can safely make, for example in an insolvency?
- Default: both are in the policy, worded as an aim and a plan.

**16. Legal holds (section 9).**
- Question: when a valid order or a preservation request arrives before a person deletes their account, is "we copy and keep them" the right practice and the right sentence?
- Default: as quoted, in "What stays with Vibe after deletion".

**17. The student-records law (section 5i).**
- Question: is our FERPA paragraph accurate, and should the Terms tell club owners not to upload lists that came from a university's records?
- Default: "FERPA covers what your university keeps about you, not what you put on Vibe. A privacy hold on your university directory entry does not carry over here."

**18. Address and service of papers (section 15).**
- Question: may we publish no postal address? One is needed for a news email, the copyright agent and the Google Play listing: the registered agent's, or a PO box?
- Default: none published; "Legal papers can be served on our registered agent, who is named in the Indiana Secretary of State's public business records."

**19. The cofounder with direct access.**
- Question: can a regulator or a claimant name that one cofounder personally? What records would show reasonable care (two-step sign-in, an access notebook, a breach plan)? Should the company carry insurance, including cyber cover, before the wider launch?
- Default: the policy admits there is no access log, no second sign-in step and no backup.

**20. Proof of identity for requests (sections 9 and 14).**
- Question: is "write from your sign-in email" enough proof before we send a copy that includes other people's messages?
- Default: the copy goes only to the sign-in email; a sign-in email is changed only after we answer to the current one. Round 2: an account is deleted on an emailed request only after the person answers from the sign-in email, or gives other proof.

**21. Copyright complaints (section 15). Round 2.**
- Question: the Terms that are live until mid-October have no copyright section. Must we register a copyright agent (17 U.S.C. 512(c)) before testers can post, and what must the new Terms say?
- Default: section 15 sends copyright complaints to help@connectvibe.app. No agent is registered.

**22. Two gaps the policy now admits (sections 3d and 10). Round 2.**
- Question: the policy says an error or speed report can hold a sign-in cookie and the text someone was sending (round 3: also account IDs and, at three steps, an email address, inside the addresses of our server's database calls), and that a signed-in person can test whether a school email is on an account or banned (three tries an hour). Both have small code fixes listed for the same deploy as the policy. Does saying them in public create exposure, and should the sentences come out the day the fixes ship?
- Default: said plainly, because the policy must be true today; each fix lists the sentences it removes.

**23. A removed message that its sender is not told about (section 5h). Round 3.**
- Question: when the Vibe team removes a message in a direct or group chat, everyone else stops seeing it, but the sender's screen still shows it as sent, with no mark and no reason (a known gap; the fix is small and listed). Does any law that reaches Vibe today require us to tell a person when their content is removed, and is the plain sentence in 5h enough until the fix ships?
- Default: 5h says "In a direct or group chat it is not marked yet, so it can look to you as if it was still sent."

**24. Deleting an account by hand (section 9). Round 3.**
- Question: an account deleted on an emailed request is deleted by one cofounder by hand ("its files first, then its records"), with no tool and no log. What record of the request and of the deletion should we keep, and for how long, given that the policy promises the account's records are gone?
- Default: the request stays in the Gmail inbox until deleted there (section 9 says so); nothing else is kept.

