# Compliance Check: Vibe Privacy Policy v2 and the release of October 4, 2026

For Franky, James and Rylan. Written 2026-10-04 by the compliance pass of the privacy-v3 run.

**How this was made.** The installed skill `legal:compliance-check` was called first and its output shape is used below. Read: `handoffs/legal-2026-10-03-privacy/privacy-policy-publish.md` (the text), `calls-for-franky.md`, `changes-after-verify.md`, `facts/07-legal-inputs.md`, `verify/L1-hostile-readers.md`, and the release code in the worktree `scratchpad/release` (branch `release-s74`, all three merges present: `ab3a93c`, `5f3b8b0`, `fe40634`). Nothing was edited there, and production was not touched. One public lookup was made: the mail records of connectvibe.app (they point to Cloudflare's email forwarding).

**Not legal advice.** This is a map for the founders and the lawyer. Every law is cited from memory; anything marked "verify with counsel" must be checked before anyone relies on it.

**Section numbers** (3a, 5h, 11 and so on) are those of `privacy-policy-publish.md`.

---

## Summary

**Proceed with conditions.**

The policy is unusually honest, and no law that applies to a company this size blocks publishing today. Nine things must change in the text first, because a sentence is untrue, out of date, or a required line is missing. Six more should change because they protect students at no cost. Three things outside the policy must be done by people (section "Recommended Actions").

The nine, in order:

1. The date. The page says "October 5, 2026" (`src/app/legal/privacy/page.tsx:22`). It goes live October 4.
2. The inbox sentences (sections 3g, 6, 11) say "our support inbox, which the Vibe team reads". Mail really goes through Cloudflare to one cofounder's personal Gmail.
3. The AI sentence (section 6) says database records pass through the AI tool's provider. The rule is now counts only. Name the tool and state the rule.
4. "We email you only to ..." (section 4) is untrue the day a founder emails anyone about a breach, a report or this policy.
5. NCMEC (section 5i) says "we may". The law says "must".
6. Do Not Track and "no cross-site tracking" lines are missing (California's online privacy law, no size limit).
7. The breach promise (section 10) leans on Indiana law, which mostly does not cover what Vibe holds. Give a number of days.
8. Age (section 12) covers accounts only. It must cover the waitlist, 17-year-olds with a school email, and children under 13.
9. The new Messages (pins, rooms where only some may post) and the home-page film's host are not in the policy.

---

## Applicable Regulations and Policies

| Regulation / policy | Relevance to Vibe today | Key requirements |
|---|---|---|
| **FTC Act, section 5** (15 U.S.C. 45) and Indiana's Deceptive Consumer Sales Act (Ind. Code 24-5-0.5) | **Applies. The main one.** No size limit. | Every statement must be true and not misleading by omission. A promise in a policy is a promise. Material changes to how already-collected data is used need real notice. "Reasonable security" is expected. |
| **CalOPPA** (Cal. Bus. & Prof. Code 22575 to 22579) | **Applies** as soon as one person whose home is in California uses the site. No size limit. | Post the policy with a clear link; list kinds of data and kinds of third parties; say how to review or change data; say how changes are announced; show an effective date; say how the site answers "Do Not Track"; say whether others can track users across sites. |
| **CAN-SPAM** (15 U.S.C. 7701 to 7713; 16 CFR 316) | **Applies** to every email Vibe sends. | No false "From" or subject. A commercial email also needs a working opt-out (for 30 days, honored in 10 business days) and a postal address. A "transactional or relationship" email needs neither. |
| **Stored Communications Act** (18 U.S.C. 2701 to 2712) | **Applies.** Vibe carries private messages for the public. | Vibe may open messages on its own systems (2701(c)(1)). It may not hand message content to others except as 2702(b) allows: a person in the chat agrees, a warrant, an emergency with danger of death or serious injury, a report to NCMEC, or to protect the service. |
| **Wiretap Act** (18 U.S.C. 2511) and Indiana's wiretap law (Ind. Code 35-33.5, verify with counsel) | **Applies** to anything that reads a message as it is sent (the blocked-word check). | Covered when users are told and agree, or when it is a normal part of running the service. So the check must stay disclosed. |
| **18 U.S.C. 2258A** (reports to NCMEC) and the REPORT Act of 2024 | **Applies.** | Once Vibe knows of apparent child sexual abuse material it must report to NCMEC as soon as reasonably possible and preserve what it reported (one year; verify with counsel). No duty to search. |
| **TAKE IT DOWN Act** (2025) | **Applies** to an app whose main use is content from users (verify with counsel). In force for platforms since May 19, 2026. | A clear way to ask for removal of an intimate image; removal within 48 hours of a valid request. |
| **Indiana breach law** (Ind. Code 24-4.9) | **Applies, but rarely triggers.** It covers a Social Security number, or a name plus a driver's licence, state ID, card or bank account number. Vibe holds none. | Where it triggers: notice without unreasonable delay and no later than 45 days after discovery, plus notice to the Attorney General (verify with counsel). Other states' laws follow where the affected person lives, and some cover an email plus password. |
| **COPPA** (15 U.S.C. 6501 to 6506; 16 CFR 312) | **Does not apply** unless Vibe is aimed at children under 13 or knows it holds a child's data. It is neither. | Do not aim at children. Act when you learn of one. |
| **FERPA** (20 U.S.C. 1232g; 34 CFR 99) | **Does not apply.** It binds schools. Vibe gets nothing from IU or Purdue and is not their "school official". | Never claim FERPA cover. Never take student records from a university without its process. |
| **CCPA / CPRA** (Cal. Civ. Code 1798.100 and after) | **Does not apply.** Needs about $26.6M revenue, or data of 100,000 Californians, or half of revenue from selling data. | None. Good practice: give access, correction and deletion to everyone. |
| **California "Shine the Light"** (Cal. Civ. Code 1798.83) | **Does not apply.** Fewer than 20 employees, and nothing is shared for others' direct marketing. | None. One sentence saying so closes the question. |
| **Indiana Consumer Data Protection Act** (Ind. Code 24-15, in force January 1, 2026) | **Does not apply.** Needs data of 100,000 Indiana residents, or 25,000 plus half of revenue from selling data. | None. It is the model to follow as Vibe grows: answer in 45 days, an appeal, a list of rights, no private lawsuits, 30 days to cure. |
| **Other state privacy laws** (Virginia, Colorado, Connecticut, Texas, Oregon and about fifteen more) | **Do not apply.** All have size limits, or (Texas, Nebraska) exempt small businesses except for one rule: no selling sensitive data without consent. | Do not sell sensitive data. Vibe sells none. |
| **GDPR and UK GDPR** | **Probably do not apply.** They follow where a person is, not their passport. An international student in Indianapolis is not covered. Vibe is not offered to people in Europe. A student who opens Vibe while abroad is an edge case (Article 3(2); verify with counsel). | If it ever applies: say why each use is allowed, list the rights, say data is in the US, name a contact. Cheap to say now. |
| **Indiana right of publicity** (Ind. Code 32-36-1) | **Applies** to the home-page film, which shows real people to promote a business. | Written consent from each person before commercial use (verify with counsel). |
| **Video Privacy Protection Act** (18 U.S.C. 2710) | **Unclear.** Vibe records who viewed a video post and, with Vibe+, shows the name to the poster. | If it applies, separate written consent is needed. Lawyer question before Vibe+ is sold. |
| **State laws on minors and social media, and on app-store age checks** (Utah, Texas, Louisiana, Tennessee, Virginia and others; Indiana, verify with counsel) | **Mostly not yet.** Vibe is 18+ and not in the stores. They start to matter on store submission (about October 16). | Rate the apps 18+. Use the stores' age signals where a state requires it. |
| **Apple App Store Review Guidelines 5.1.1, 5.1.2, 1.2; Google Play User Data, account deletion and Child Safety Standards policies** | **Apply on store submission**, not today. | Policy link; in-app deletion and a web deletion page that agree with each other; privacy labels that match the policy; disclosure of personal data given to third-party AI (Apple 5.1.2(i), verify with counsel). |
| **Vibe's own published promises** (the live policy of September 28; the live Terms of May 7) | **Apply.** They are statements to consumers. | The live policy promises "reasonable notice (in-app or by email)" before material changes take effect. Keep that promise for the accounts that exist. |

---

## Requirements

"C" numbers point to the exact sentences in the section "The sentences" below.

| # | Requirement | Status | Action needed |
|---|---|---|---|
| 1 | The effective date is shown and is the day of publishing (CalOPPA; FTC) | **Not Met** | The text has a placeholder and the page says October 5. Set October 4, 2026. C1 |
| 2 | Every sentence about who holds mail sent to Vibe is true (FTC) | **Not Met** | Sections 3g, 6 and 11 say "our support inbox, which the Vibe team reads". Fact: Cloudflare forwards hello@ and help@ to one cofounder's personal Gmail. C2 |
| 3 | The AI sentence matches the company's rule (FTC; Apple 5.1.2(i) later) | **Not Met** | Section 6 says database records pass through the tool's provider. Rule now: counts, settings and code fingerprints only. Name Claude and Anthropic. C3 |
| 4 | "We email you only to ..." is true (FTC) | **Not Met** | A founder's email about a breach, a report or a policy change breaks "only". C4 |
| 5 | The duty to report child sexual abuse material is stated as a duty (18 U.S.C. 2258A) | **Not Met** | Section 5i says "we may". The Child Safety page says "where the law requires it". C5 |
| 6 | The policy says how Vibe answers Do Not Track (CalOPPA 22575(b)(5)) | **Not Met** | Add one sentence. C6 |
| 7 | The policy says whether others can track users across sites (CalOPPA 22575(b)(6)) | **Not Met** | Add one sentence. C6 |
| 8 | The breach promise means something (FTC; Ind. Code 24-4.9; other states) | **Not Met** | "Within the time Indiana law requires" is close to empty for Vibe's data. Give a number. C7 |
| 9 | Age: 18+ at sign-up and on the waitlist | **Met** | Both have the box (`signup-form.tsx:594`, `waitlist/form.ts:165`). |
| 10 | Age: the policy covers the waitlist, 17-year-olds with a school email, and under-13s (COPPA; app stores) | **Not Met** | Section 12 speaks of accounts only. An admin can already remove a waitlist entry (`api/admin/waitlist/[id]/remove`). C8 |
| 11 | The policy describes what the release adds: pinned messages, rooms where only some may post, the film's host (FTC, omission) | **Not Met** | Checked against chat-desktop for the first time here. C9, C10 |
| 12 | Kinds of data collected are listed (CalOPPA; GDPR Art. 13 if ever) | **Met** | Section 3. |
| 13 | Kinds of third parties are listed (CalOPPA) | **Met after C2, C3, C10** | Missing today: Gmail by name, Cloudflare's email forwarding, Anthropic, Vercel's file storage for the film. |
| 14 | A way to see, fix and delete data is described (CalOPPA; app stores) | **Met** | Section 9. |
| 15 | How changes are announced (CalOPPA 22575(b)(3)) | **Met for accounts, Not Met for everyone else** | Add one sentence for waitlist people and visitors. C11 |
| 16 | A clear "Privacy" link on the home page and the waitlist | **Met** | `home-landing.tsx:69`, `waitlist/layout.tsx:34`, and the link in the form notice. |
| 17 | Existing accounts get the notice the live policy promised ("in-app or by email, before they take effect") | **Not Met** | A handful of accounts. One short email or message today. See Recommended Actions 2. |
| 18 | Other pages on the site agree with the policy (FTC) | **Not Met** | `legal/delete-account/page.tsx` still says "routine backups" (line 237), "up to a year" (198), "erased from storage" (159). Terms line 150: "Continued use ... means you accept". The full list is `changes-after-verify.md` section 4. |
| 19 | The waitlist form's own notice does not say less than the policy | **Not Met (small)** | The form names three services; section 11 names more. Add "and a few more, listed in the Privacy Policy". The form also says "a current student"; the policy says enrollment is never checked. |
| 20 | Waitlist emails: true sender and subject (CAN-SPAM) | **Met** | `email-content.ts`: plain subjects, reply-to hello@. |
| 21 | Waitlist emails: a way out in every email | **Met, beyond the law** | "Take me off the list" is in both. Weak point: an older link can stop working. C12 |
| 22 | Waitlist emails: postal address | **Unknown** | Not needed if both are "transactional" (they most likely are: verify with counsel). The LLC has no address to print. See CAN-SPAM below. |
| 23 | "Vibe news": no send until there is a postal address and a 30-day opt-out link | **Met today** (nothing is sent) | Keep it a hard gate. C12 |
| 24 | No sale of personal data; no sharing for others' marketing ("Shine the Light"; state laws) | **Met today** | Say it in the words those laws use. Vibe+ viewer names need a plain line before billing turns on. C13 |
| 25 | Do not claim cover by laws that do not apply (FERPA, GDPR, CCPA) | **Met** | The text claims none. Add one FERPA line so students do not assume it. C14 |
| 26 | People abroad are told their data is in the United States (GDPR Art. 13; fairness) | **Not Met** | Section 14 says only "run from Indiana". C15 |
| 27 | Requests about data: who answers, how fast, how you prove it is you | **Partly Met** | Only "a copy" has a time (30 days). Say it for all requests. C15 |
| 28 | Reading private messages is disclosed, with the cases (SCA; wiretap; FTC) | **Met** | Section 5h, with the honest line that no system enforces it. Risk stays: see Risk Areas 2. |
| 29 | The blocked-word check on messages is disclosed (wiretap law) | **Met** | Section 3e. Keep it. |
| 30 | Handing data to police or courts follows 18 U.S.C. 2702 | **Partly Met** | "When the law requires it" is true. The emergency wording is wider than the statute for message content. C5 tightens it. |
| 31 | The people in the home-page film agreed in writing (Ind. Code 32-36-1) | **Unknown** | They agreed. Get each yes as a text or email and keep it. Then add the marketing promise. C16 |
| 32 | The operator can be identified and served with papers | **Partly Met** | Name and state are there. No address. Point to the registered agent in the state's public record. C17 |
| 33 | Contracts with providers limit their use of the data | **Unknown** | The policy honestly says "its own published terms". Accept each provider's data processing terms (most are a click). Needed for Apple 5.1.1 before store submission. |
| 34 | A removal route for intimate images, answered in 48 hours (TAKE IT DOWN Act) | **Unknown** | Outside the policy: check the Community page and who watches help@ every day. |
| 35 | Records: a log of data requests, breach decisions and film consents | **Not Met** | One shared sheet. Ten minutes. |
| 36 | In-app deletion and a public deletion page (Apple 5.1.1(v); Google Play) | **Met in the app; the page contradicts the policy** | Same fix as row 18, before store submission. |
| 37 | "Reasonable security" for the accounts that hold everything (FTC unfairness) | **Unknown** | One cofounder's logins to Supabase, Vercel, Cloudflare, Resend, Sentry, GitHub and that Gmail are the whole security of Vibe. Turn on two-step sign-in on each. The policy must not claim it until it is done. |

---

## Law by law: what the policy must say, what it must not promise

### 1. FTC Act and Indiana's deceptive-acts law (every sentence must be true)

- **Must say:** what is really collected, who really sees it, who really holds it. The text does this well. Fix the four untrue or stale sentences: C1 (date), C2 (inbox), C3 (AI tool), C4 ("only" emails).
- **Must not promise:** "secure", "industry standard", "we never read your messages", "deleted everywhere", "your data stays in Indiana", "compliant with" any law, "verified student". None is in the text today. Keep them out.
- **Promises a person has to keep by hand** (all fine, all need a named owner): look at reports within 24 hours; send a data copy within 30 days; delete recovery proof within 90 days; read messages only in four cases; the AI tool reads counts only; tell users before a sale. A missed promise is the classic FTC case, more than a missing clause.
- **The old policy's promise.** The live page says material changes get "reasonable notice (in-app or by email) before they take effect". Publishing as a notice is fine, but give that notice to the accounts that exist (Recommended Actions 2).
- **Two pages that disagree = one false page.** See Requirements 18. The delete-account page is the one Google Play reads.

### 2. COPPA, the 18+ line, and 17-year-olds with a school email

- **Facts.** Vibe is 18+, asks no date of birth, and relies on a checkbox. Two groups of minors can hold a university address: first-years who are still 17, and high-school students in dual-credit courses (verify which addresses IU and Purdue give them).
- **Must say:** 18 or older for an account and for the waitlist; no date of birth is asked; what happens when Vibe learns of a minor; how to tell Vibe; that Vibe is not for children and does not knowingly collect from anyone under 13. The earlier draft dropped the under-13 line as "contradicting 18+". It does not contradict it: it is true, and app-store reviewers and CalOPPA readers look for it.
- **Must not promise:** "everyone on Vibe is an adult", "we verify age", "no minors are on Vibe".
- **Sentence:** C8.
- **What follows for the company:** when someone under 18 is found, the account is closed with the ban tool and the rest is done by hand. Write down who does it. Rate both store apps 18+.

### 3. FERPA (is Vibe a "school official"? No)

- **Why not:** FERPA binds schools that take federal education money. A company becomes a "school official" only when the school hands it records under the school's control (34 CFR 99.31(a)(1)(i)(B)). IU and Purdue hand Vibe nothing. Students type everything themselves.
- **What follows:** (a) FERPA gives students no rights against Vibe, so this policy is their only protection: say so. (b) A privacy hold a student placed on their university directory entry does not carry over to Vibe, where a profile is public: say so. (c) The day Vibe takes anything from a university (single sign-on, a directory feed, an enrollment check, a club roster exported from the university's system), FERPA comes in through the school and this check must be redone. (d) The Terms should tell club officers not to upload lists that came from the university's records.
- **Must not promise:** "FERPA compliant", "your education records are protected", anything that sounds like the university stands behind Vibe.
- **Sentence:** C14.

### 4. CAN-SPAM (the waitlist emails, the news box, the missing address)

- **The confirm email and the access-code email** are most likely "transactional or relationship" messages (15 U.S.C. 7702(17): they confirm or complete something the person asked for). Those need a true sender and subject and nothing else. Both already carry a way out, which is more than required. Verify the access-code email with counsel: it invites someone to start using a product, so a cautious reader could call it commercial. If it were, it would need a postal address.
- **A person a cofounder adds by hand** gets the access-code email with no box checked. It rests on "you asked us". Keep a note of the ask (who, when, how).
- **"Vibe news"** is commercial. Before the first one: a postal address in the email (a registered agent's address or a PO box is allowed), an opt-out link that works for at least 30 days after sending, and removal within 10 business days. Today's link can die when a newer email is sent: fine for the waitlist emails, not for news.
- **Must say:** which emails are sent and why (section 4 and 11 do). **Must not promise:** that news will be sent, or a news email before the address exists.
- **Sentences:** C4 and C12.

### 5. CalOPPA and "Shine the Light"

- **CalOPPA has no size limit.** A student whose home is California is enough. The policy meets it except for three lines: Do Not Track, cross-site tracking, and how people without an account learn of changes. Sentences: C6, C11. The date is C1.
- **"Shine the Light"** does not reach a company with fewer than 20 employees. One sentence saying nothing is shared for others' direct marketing ends the question. Sentence: C13.
- **Must not promise:** "we honor Do Not Track" as if something were switched off. Nothing tracks, so nothing changes: say that.

### 6. CCPA/CPRA, Indiana's CDPA and the other state laws

- **None applies.** Vibe has no revenue, a handful of accounts, and sells nothing. Texas and Nebraska exempt small businesses except for selling sensitive data without consent, which Vibe does not do.
- **Do anyway (free, and it protects students):** give everyone the same rights wherever they live; answer within 30 days and never later than 45 (the Indiana and California number); look again if the person objects; never treat someone worse for asking; say in those laws' words that nothing is sold or shared for ads.
- **Must not promise:** "CCPA rights", "we comply with the Indiana Consumer Data Protection Act", a formal appeal office, or a "Do Not Sell" link. Saying a law applies when it does not creates duties for nothing.
- **Watch:** with Vibe+, a paying member gets the names of people who viewed them. Indiana's law defines a sale as personal data exchanged for money to a third party. Below the size limit this is not a legal problem, but "we do not sell your personal information" should not stand next to it without a plain line. Sentence: C13.
- **Sentence:** C15.

### 7. GDPR and UK GDPR (international students, visitors from abroad)

- **Reach.** These laws follow location. An international student in Indiana is outside them. They would reach Vibe only if it offered the service to people in Europe or monitored their behaviour there. Vibe is offered to two Indiana universities. A student on a semester abroad who keeps using Vibe is the edge case (verify with counsel).
- **What a small US app should say:** it is run from the United States; data is handled there; it is not aimed at other countries; the plain reasons it uses data; the rights it gives everyone; a contact; the right to complain to a regulator at home.
- **Must not promise:** "GDPR compliant", an EU or UK representative, a data protection officer, Standard Contractual Clauses, or that data stays in any region. The provider regions have not been confirmed.
- **Sentence:** C15.

### 8. Stored Communications Act and wiretap law (reading messages in moderation)

- **Reading.** A provider may open messages stored on its own service (18 U.S.C. 2701(c)(1)). The four cases in section 5h are narrower than the law allows. They are lawful. The risk is the word "only" with no access log (Risk Areas 2), not the statute.
- **A reported message** is given by a person in the chat. That is consent of an addressee (2702(b)(3)).
- **The blocked-word check** runs as a message is saved. It is covered by the provider exception and by consent, as long as it stays disclosed (section 3e) and the Terms carry the same line.
- **Handing over.** Content of messages may go to the government with a search warrant, in an emergency involving danger of death or serious physical injury (2702(b)(8)), or to NCMEC. A private party's subpoena cannot make a provider hand over message content (verify with counsel). Records that are not content (account details) follow looser rules (2702(c)).
- **Must say:** not end-to-end encrypted; who can open messages; the cases; the automated check; that reports copy the message. All present.
- **Must not promise:** "we will tell you before we hand anything over" (a court can forbid it), "we never give messages to anyone", or "only with a warrant" before the lawyer agrees to the wording.
- **Sentence:** C5.

### 9. Indiana breach notification

- **What the statute covers:** a Social Security number, or a name with a driver's licence, state ID, card or bank account number. Vibe holds none, so Indiana's law would rarely force a notice. Other states' laws follow the person's home state, and some cover an email address with a password.
- **So** "within the time Indiana law requires" could mean "never". The honest fix is a number that does not depend on which law applies.
- **Must not promise:** "within 72 hours" (a European rule Vibe cannot keep with one person), or "we will prevent breaches".
- **Sentence:** C7.

### 10. Data requests (who answers, in how many days)

- **Who:** the cofounder with direct access is the only person who can pull, fix or delete records. The policy should say so. A second cofounder looks again if the person objects.
- **How fast:** aim for 30 days, never more than 45. No law binds Vibe to it today. It matches Indiana and California for the day one does.
- **Identity:** the request comes from the sign-in address (accounts) or the school address (waitlist). No ID document.
- **People with no account** (named in a post, shown in a photo): give them help@ as the route.
- **Sentence:** C15.

---

## The sentences

Each is ready to paste. "Must" means the policy should not go live without it. "Should" means it protects students or closes a gap at no cost, and was decided here under the founder's four rules. Every sentence was written to be true with no further input.

### Must (C1 to C10)

**C1. The date (top of the page; `EFFECTIVE_DATE` in `page.tsx`).**
> Effective October 4, 2026

**C2. Where your email to us goes (sections 3g, 6 and 11).** Public mail records for connectvibe.app point to Cloudflare's email forwarding.
- Section 6, replace the "Our email inbox" bullet:
> **Our email.** Cloudflare forwards mail sent to hello@connectvibe.app and help@connectvibe.app to the personal Gmail inbox of the cofounder with direct access (section 1), so Google holds it. The other two cofounders see a message only when he passes it on.
- Section 6, Google bullet: change "(fonts)" to "(fonts, and the inbox above)". Cloudflare bullet: add "It also forwards the mail you send us."
- Section 3g, replace "What you send stays in our support inbox, which the Vibe team reads, until one of us deletes it.":
> What you send stays in that Gmail inbox (section 6) until he deletes it.
- Section 11, replace "lands in our support inbox":
> lands in that same Gmail inbox (section 6)

**C3. The AI coding assistant (section 6, replace the "AI coding tools" bullet).**
> **An AI coding assistant.** We write and fix Vibe's code with Claude, an AI assistant made by Anthropic. When it checks the live database, our rule is that it may read only counts (how many), settings and code fingerprints (a short code that shows whether a piece of our code has changed). It may not read anyone's records: no profile, post, message, email address or waitlist entry. What it does read passes through Anthropic. This is a rule we keep ourselves. No system enforces it.

Keep the short version's "Vibe has no ads and no AI features, and we do not train AI on what you post." It stays true. Do not add "no AI ever touches your information": Gmail is a Google service.

**C4. Emails (section 4, replace "We email you only to ... There is no marketing or activity email.").**
> Vibe itself sends only these emails: to confirm your account, reset your password, verify your school email, confirm your waitlist spot and send your access code. A person on the Vibe team may also write to you: to answer you, about a report or your account, or to tell you about a security problem or an important change to this policy. There is no marketing or activity email.

**C5. Police, courts and NCMEC (section 5i, replace the second paragraph).**
> We hand over information when the law requires it, for example under a search warrant, a subpoena or a court order.
>
> If we find sexual images of a child on Vibe, US law requires us to report them to the National Center for Missing & Exploited Children (NCMEC) and to keep what we reported for a time. We follow that law.
>
> We may also go to the police or emergency services ourselves when we believe someone is in danger of death or serious injury, or a child is at risk.

Decided: no promise to tell a user about a legal request (a court can forbid it), and no "warrant only" promise until the lawyer agrees to the words.

**C6. Do Not Track (new paragraph at the end of section 7).**
> **Do Not Track.** Vibe does not follow you from site to site, so it does nothing different when your browser sends a "Do Not Track" or "Global Privacy Control" signal. We have put no code in Vibe that lets another company follow what you do across other sites. The services in section 6 do see your IP address and browser when your device contacts them.

**C7. Breach (section 10, replace the last paragraph).**
> **If we learn of a breach** that exposes your personal information, we will email the people affected, at the address we hold, and say what happened, what information was involved and what we are doing about it. We will do it as fast as we reasonably can and no later than 30 days after we find out, unless the police ask us to wait. Where a state's law requires it, we also tell that state's attorney general.

Why 30: Indiana's outer limit is 45 days where its law applies; several other states use 30. One number for everyone. If the founders will not hold 30, use 45, never "the time Indiana law requires" alone.

**C8. Age (section 12, replace the whole section).**
> Vibe is for adults. You must be 18 or older to join the waitlist or to make an account, even if you already have a university email. Some people start college at 17, and some high-school students are given a university address. Vibe is not for them until they turn 18.
>
> We ask for no date of birth, so we rely on the checkbox and on what people tell us. Vibe is not meant for children, and we do not knowingly collect information from anyone under 13, or from anyone under 18.
>
> If we learn an account belongs to someone under 18, we close it and take its content down. We then aim to delete its information ourselves, except what the law requires us to keep. Closing an account works like a ban and keeps the scrambled codes in section 9. Once the person turns 18 they can ask help@connectvibe.app to let that school email be verified again. If we learn a waitlist entry belongs to someone under 18, we delete the entry.
>
> If you think someone under 18 is on Vibe, or you are their parent or guardian, write to help@connectvibe.app.

Also change the short version's last line to: "Vibe is for people 18 or older, on the waitlist too. You confirm it with a checkbox."

**C9. The new Messages (section 5e and the table in section 8).** Checked against `chat_message_pins`, the pin routes and `channels.post_policy` in the release. Pins exist only where the new chat is switched on.
- Section 5e, add to "Direct and group chats":
> Anyone in the chat can pin a message for everyone in it, up to 20, and anyone in it can unpin one. A "Pinned and Shared" list shows the chat's pinned messages and the photos, videos and posts shared in it. We store who pinned a message and when. The chat is shown when, not who.
- Section 5e, add to "Club chats":
> A club's owner and admins can set an extra room so that only they, or they and people they pick, can post in it. Everyone who can open the room can still read it, vote in its polls and take its sign-up slots.
- Section 8 table, new row: **A pin** | Someone in the chat unpins it, the message or the chat is deleted, or the Vibe team removes the message.
- Section 3c, in "Messages and everything in them": add "the messages you pin".

**C10. The film on the home page (section 6, add to the Vercel bullet).**
> It also stores and serves the short film on our home page, so it sees your IP address and browser when the film loads.

### Should (C11 to C17)

**C11. How changes are announced (section 13, add after "One version").**
> When we change this page we put the new date at the top. If the change matters, people with accounts are also told in the app or by email and asked to accept it, as above. If you are on the waitlist or just visiting, the date at the top is how you can tell.

**C12. The waitlist emails (section 11).**
- In "Why", replace "No news email exists. If we ever send one, it is meant only for people who checked the news box.":
> No news email exists. If we ever send one, it goes only to people who checked the news box, and it will carry a postal address and a link to stop the news that keeps working.
- In "Leaving sooner", after "an older link may no longer work.":
> If a link does not work, write to hello@connectvibe.app from that address and one of us takes you off by hand.

**C13. Selling, sharing, and Vibe+ (section 4, replace the last sentence).**
> We do not sell your personal information to anyone, share it with advertisers, give it to other companies for their own marketing, or use it to train AI models. One paid feature comes close and we want to be plain about it: with Vibe+ (not on sale yet), a paying member sees the names of the signed-in people who viewed their profile and posts (section 5d).

**C14. FERPA (section 5i, add after "Vibe sends nothing to IU or Purdue automatically.").**
> Vibe is not your university and holds none of its records. The federal student-records law (FERPA) covers what your university keeps about you, not what you put on Vibe. A privacy hold on your university directory entry does not carry over here: this policy and your own settings decide what people see on Vibe.

**C15. Where you live, your rights, and who answers (replace section 14).**
> ## 14. Where you live, and your rights
>
> **Vibe is run from Indiana, in the United States.** Your information is handled there and on the servers of the companies in section 6, wherever they run them. If you use Vibe from another country, your information comes to the United States, where the law may protect it less than the law at home.
>
> **Rights for everyone.** Wherever you live, and at no cost, you can ask us to tell you what we hold about you and send you a copy, fix something that is wrong, delete your account or your waitlist entry, or stop an optional use such as Vibe news. Section 9 says how. Write from the email address on your account or waitlist entry, so we know it is you. If you have no account and think Vibe holds something about you, write to help@connectvibe.app.
>
> **Who answers, and when.** The cofounder with direct access (section 1) does the work, because only he can reach the records. We aim to answer within 30 days. If we need longer we will tell you, and it will not be more than 45 days in all. If we cannot do what you ask, we say why, and you can ask us to look again. We never charge for a request or treat you worse for making one.
>
> **State privacy laws.** Vibe is too small to be covered today by the privacy laws of Indiana, California or other states. We give the rights above to everyone anyway. No software decides anything important about you by itself: people decide reports, suspensions and bans.
>
> **Outside the United States.** Vibe is built for two universities in Indiana and is not aimed at people in other countries. If European or UK data protection law does apply to you: we use your information to run the service you asked for, to keep Vibe safe and working, with your consent where we ask for it (Vibe news, notifications), and where the law requires it. You can also object to a use or ask us to limit it, and you can complain to the data protection authority where you live. We have no office or representative outside the United States.

**C16. Your face in our marketing (section 4, new paragraph).** Add once each person in the film has said yes in writing (a text or an email is enough to keep).
> We do not use your name, photo or posts in our ads, on our home page or in app-store pictures unless you say yes first. The people in the film on our home page said yes.

**C17. Who we are on paper (section 15, add under the company name).**
> We have no office. Legal papers can be served on our registered agent, who is named in the Indiana Secretary of State's public business records.

Decided: publish no postal address today. No law requires one in a privacy policy at this size, the LLC has none, and a home address must not be used. An address is needed before any news email and for the Google Play listing.

**Also worth one line in the short version** (protects students; true today):
> What you join, follow and post can show personal things about you, such as your religion, your politics or your health. Club pages and most of your profile are public.

---

## Risk Areas

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | A sentence is untrue on the day of publishing (date, inbox, AI tool, "only" emails) | **High** | C1 to C4 before the page goes live. |
| 2 | "We read private messages only in four cases", with one person who can open everything and no record of what is opened. One look outside the four cases, even while fixing a bug, makes the sentence false, and nobody could prove it either way. | **High** | Keep the four cases and the honest line "No system enforces or records it" (decided: do not widen the cases). The cofounder with access adopts the same counts-only habit as the AI tool when fixing chat. After launch: turn on database access logging, then the policy can say reads are recorded. |
| 3 | The counts-only rule for the AI tool is kept by habit. One query that returns rows makes C3 false, and after store launch is "personal data given to third-party AI" without permission (Apple 5.1.2(i), verify with counsel). | **High** | Give the tool its own database login that cannot select from tables holding people's records (a read-only role with access to counts and catalog only). Then the policy can drop "No system enforces it". |
| 4 | Other pages contradict the policy: the delete-account page ("routine backups", "up to a year", "erased from storage"), the live Terms ("continued use means you accept"), the waitlist form notice, the Community and Child Safety pages ("a real student", "enrolled"). | **High** for the delete-account page (Google Play reads it), **Medium** for the rest | Align the delete-account page and the form notice in the same release. The others go with the Terms, about October 14. |
| 5 | Reports, child-safety tips, intimate-image requests and recovery proof land in one person's personal Gmail. An abusive image sent as an attachment would sit there. Nothing deletes anything on a schedule. | **Medium** | A separate company mailbox with two-step sign-in (already on the list for October 4). Never forward or keep an abusive image: report to NCMEC's CyberTipline and follow its instructions (verify with counsel). A monthly reminder to clear closed requests older than 90 days. |
| 6 | Minors with a university address (17-year-old first-years, dual-credit high-school students) pass a checkbox. | **Medium** | C8. Close on knowledge. Rate the apps 18+. Lawyer: whether a checkbox is enough once the apps are in the stores, and which state laws on minors apply. |
| 7 | The breach promise was close to empty (Indiana's law rarely covers Vibe's data). | **Medium** | C7. |
| 8 | Vibe+ shows a paying member who viewed them. Could be called a "sale" of personal data (Indiana's definition), and for video posts could fall under the Video Privacy Protection Act, which lets people sue. Viewer names are already shown to accounts given Vibe+ by the team. | **Medium**, before billing turns on | C13 now. Lawyer before billing. A free "view privately" setting is the clean fix (already recommended in the Terms review). |
| 9 | Reports, the moderation log, ban records and evidence files have no end date. Regulators now treat keeping data forever as a fault. Evidence files could include illegal images. | **Medium** | The policy says "no end date is set", which is true: leave it. Set a period (the Terms review suggests 3 years) and a calendar reminder. Lawyer: how long reported child-abuse material may and must be kept. |
| 10 | No backups, no two-step sign-in for users, no access log, one person holding every login. "Reasonable security" is judged by size, but these are the first things asked after an incident. | **Medium** | The policy admits each one, which is right. Two-step sign-in on the founder's provider accounts and Gmail today. Backups before students arrive. |
| 11 | The home-page film uses real people to promote a business. Indiana asks for written consent. | **Low to Medium** | Collect a written yes from each person (text or email), keep them together, then add C16. |
| 12 | The access-code email could be read as commercial, and it carries no postal address. The "take me off" link can stop working when a newer email is sent. | **Low** | C12. Put an address in the footer once one exists. Never send news through the current link design. |
| 13 | Club membership, follows and posts can reveal religion, politics, health or sexuality, and club pages are public. | **Low to Medium** | The short-version line under C17. A later product call: let a member hide their name on a public club page. |
| 14 | A student abroad, or a claim that European law applies. Fonts load from Google on every page. | **Low** | C15. Host the fonts on Vibe's own site (already item H37). |
| 15 | A failed server request can send sign-in details to Sentry (section 3d says so). | **Medium** (security, not wording) | Fix 1 in `changes-after-verify.md`, then delete the sentence. |
| 16 | Provider regions are unconfirmed, so the policy cannot say where data is. | **Low** | Read each dashboard once and write "in the United States" if true. Until then C15's wording is safe. |

---

## Recommended Actions

In order. 1 is the only one that blocks publishing.

1. **Put C1 to C10 into the policy** (text and `src/app/legal/privacy/*`), then publish. About an hour of editing. C11 to C17 can go in the same pass; they are short and decided.
2. **Tell the existing accounts today.** There are only a handful. One short message from hello@ or in person: "We published a new Privacy Policy today. It says more plainly what Vibe keeps and who can see it. Nothing about how Vibe works changed. Read it at connectvibe.app/legal/privacy. You will be asked to accept it with the new Terms in about ten days." This keeps the promise the old policy made.
3. **Fix the delete-account page and the waitlist form notice in the same release** so the site does not contradict itself. The lines are in `changes-after-verify.md` section 4.
4. **Collect a written yes from each person in the film** before adding C16.
5. **Turn on two-step sign-in** on the Supabase, Vercel, Cloudflare, Resend, Sentry, GitHub and Gmail accounts.
6. **Give the AI tool a database login that cannot read people's records**, so the counts-only rule is enforced and not only promised.
7. **Start one sheet** with three tabs: data requests (date, who, what, answered when), security incidents (what, when found, who was told), consents (film, people added to the waitlist by hand).
8. **Accept each provider's data processing terms** (Supabase, Vercel, Cloudflare, Resend, Sentry). Needed before store submission.
9. **Get a postal address** (registered agent's or a PO box) before any news email and before the Google Play listing.
10. **Before Vibe+ is sold:** the lawyer's answer on viewer names (sale; video privacy), and the "view privately" setting.
11. **Before store submission (about October 16):** redo this check against Apple's and Google's forms; rate both apps 18+; re-read section 3f.

---

## Approvals Needed

| Approver | Why | Status |
|---|---|---|
| Franky (builds Vibe, holds the access) | He is the person the policy's promises fall on: the four cases for messages, the counts-only rule, data requests in 30 days, breach notice in 30 days, the Gmail inbox. He asked for a policy without his input, so the text was decided for him. He should still read C2, C3, C7 and C15 before it goes live. | Pending |
| James (runs the paperwork; registered agent) | The registered agent line (C17), the postal address, sending the lawyer the list below. | Pending |
| Rylan (campus; moderator) | Moderates under the four-case rule and the 24-hour aim for reports. | Pending |
| The lawyer | Reads in parallel, as the founders decided. Not a gate for today. | Pending |
| Each person in the home-page film | Written consent to appear. | Agreed by word; writing pending |

---

## Further Review Recommended

For the lawyer, most urgent first. Everything here is "verify with counsel".

1. **Reading and handing over messages:** are section 5h's four cases and C5 safe under the Stored Communications Act, the Wiretap Act and Indiana's wiretap law? Should the policy say "search warrant" for message content?
2. **Child safety duties:** the NCMEC reporting steps, how long reported material must and may be kept, where it may be stored, and whether Vibe must register with NCMEC first. Whether the TAKE IT DOWN Act covers Vibe and what record of requests to keep.
3. **Age:** is a checkbox enough for an 18+ app in the stores? What applies to a 17-year-old found on Vibe? Which state laws on minors, social media and app-store age checks apply (Utah, Texas, Louisiana and any Indiana law in force)?
4. **Breach notice:** confirm Indiana's 45 days and Attorney General notice, and which other states' laws would apply to an email address with a password.
5. **Vibe+ viewer names:** a "sale" under state law? Covered by the Video Privacy Protection Act for video posts? What consent would be enough?
6. **CAN-SPAM:** is the access-code email transactional? What address may be printed in a news email?
7. **The film:** is a text or email reply enough as written consent under Indiana's right of publicity law?
8. **European law:** does a student using Vibe on a semester abroad bring Vibe under it? Is C15 enough?
9. **One checkbox for age, Terms and Privacy,** and publishing this policy as a notice before the Terms version changes.
10. **Records kept after deletion** (scrambled email codes, reports, the moderation log, evidence files): how long, and can a person make Vibe delete them?
11. **Insurance** (including cyber cover) before the wider launch.

Standing rule: redo this check whenever a switch flips (billing, phone notifications, the store apps, a news email, backups, a second person with database access, anything received from a university).

