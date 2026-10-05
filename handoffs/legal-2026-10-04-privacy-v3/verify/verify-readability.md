# Privacy Policy v3: readability check, round 3

2026-10-04. Independent check of `privacy-policy-final.md` as rebuilt at 11:13 (md5 `7f88ad28…`, 619 lines). The policy was not edited. Earlier notes are kept as `verify-readability-r1.md` and `verify-readability-r2.md`. This is not legal advice.

**Skill.** `design:ux-copy` was loaded with the Skill tool first. Its five tests (clear, concise, consistent, useful, human) were run on the whole text, and hardest on the sentences that are new in round 3. Numbers come from four scripts in `_readability/`: the three from rounds 1 and 2, and a new `measure-r3.py` (outputs `out-r3-a.txt` to `-d`). Labels and one number were checked in the release worktree (`release-s74` at `62a2daa`, merges done, read only). This lens checks how the text reads, not whether each fact is right.

## 1. Verdict

**Pass. No high, no medium. Thirteen low findings, each with an exact rewrite.**

Round 2's one medium is fixed in both places (short version item 7, and the note under step 3 in section 9). All of round 2's low findings are in. The text still reads at about grade 6.

What round 3 cost: the new facts about bug reports (3d) brought back three sentences over 28 words, one of them 37, and two pieces of jargon ("the calls our server made to the database", "their addresses"). None of it misleads. All of it leaves when row 14 ships and the old reports are gone.

Two conditions sit behind the pass, both already on the change list:

- **Item 7a before the page goes live.** If it slips, use the sharper line in L2 for short version item 9.
- **Row 14 in today's deploy.** If it slips, the policy is still true as written. Nothing to change.

## 2. What was measured

| Measure | Round 3 | Round 2 | Round 1 |
|---|---|---|---|
| Words, headings and table cells included | **about 11,700** (11,694 to 11,713 by script) | 11,000 | 9,827 |
| Reading time at 230 words a minute | about 51 minutes. The short version takes about 2.5 | 48 | 42 |
| Sentences | 988 if each bullet and table cell counts as one. 825 with cells and 1 to 3 word labels left out | 923 / 768 | 781 / 633 |
| Average sentence length | **11.6 words** (generous). **13.0** (strict). 13.3 in paragraphs alone. Median 12 | 11.6 / 13.1 / 13.5 | 12.2 / 14.1 / 14.0 |
| Reading grade, Flesch-Kincaid, three counters | 5.1 to 5.4 generous. 5.8 to 5.9 strict. 6.0 to 6.1 paragraphs alone | 5.1 to 6.3 | 5.4 to 6.6 |
| Other formulas | Coleman-Liau 6.7 to 7.0. Automated Readability 4.4 to 5.3. Gunning Fog 7.0 to 8.6. SMOG 7.9 to 9.1 (SMOG always runs high) | about the same | higher |
| Flesch reading ease | 75 to 79 ("fairly easy") | 74 to 79 | 73 to 78 |
| **Best single estimate** | **Grade 6.** Under the grade 9 bar on every formula but SMOG's top figure | 6 | 6 to 7 |
| Sentences over 28 words | **9** (10 by the older script, which counts "résumé" as two words). Longest: **37**, then 32. The rest are 29 | 13 or 14, longest 30 | 45, longest 55 |
| Sentences of 25 to 28 words | 31 | 32 | not counted |
| Sentences of 15 words or fewer | 67% (strict count) | 67% | 68% |
| Paragraphs or bullets (25+ words) above grade 9 | 15 | 18 | 31 |
| Sections or sub-sections above grade 9 | **None.** Highest: 5i at 8.5, section 15 at 8.4 (email and web addresses count as long words), 3f at 7.9 | none | 3b at 20 |
| Headings | 34, of which 32 are questions | same | same |
| Pointers to other sections | 58 in brackets. Most used: 3d (11), section 1 (9), 3g (7), section 9 (6) | 55 | 38 |

The blocks that are new or rewritten in round 3:

| Block | Words | Longest sentence | Grade |
|---|---|---|---|
| 3d, Error reports (the whole bullet) | 350 | **37** | 6.4 |
| 5h, "Outside these cases" | 77 | 21 | 6.8 |
| 5h, Removed content | 95 | 23 | 6.0 |
| Section 6, Supabase entry | 125 | **29** | 8.5 |
| Section 6, Anthropic entry | 268 | 25 | 6.3 |
| Section 8, "What Vibe does not delete yet" | 289 | 19 | 5.0 |
| Section 9, "What happens, in order" | 154 | 17 | 5.1 |
| Section 11, whole | 1,267 | 29 | 4.6 |

The short version, item by item:

| Item | Words | Longest sentence | Grade |
|---|---|---|---|
| 1 Public profile and posts | 39 | 20 | 4.3 |
| 2 Club pages | 38 | 21 | 4.9 |
| 3 Chats | 37 | 17 | 6.8 |
| 4 Reading messages (lead, six cases, two closing sentences) | 104 | 19 | 0.5 to 7.8 per line |
| 5 One cofounder | 36 | 17 | 7.1 |
| 6 Views | 79 | 22 | 3.0 |
| 7 Deleting | 64 | 26 | 4.9 |
| 8 Location in files | 44 | 21 | 7.0 |
| 9 No selling | 73 | 18 | 5.8 |
| 10 Verified and age | 55 | 14 | 5.9 |
| All ten | 569 (521 in round 2, 447 in round 1) | 26 | 4.9 to 5.1 |

How the count works: a syllable counter is a guess, so three were used and the range is given. The "generous" count treats every bullet, table cell and bold label as a sentence, which flatters the average. The "strict" count drops them. The truth sits between.

## 3. Does the short version alone tell a student the truth?

Each item was read against the body as it stands now.

| Item | True by itself? | Note |
|---|---|---|
| 1 | Yes | Matches 5a |
| 2 | Yes | Matches 5a and the section 5 table |
| 3 | Yes | Matches 5e, down to "even one you blocked" |
| 4 | **Yes, now** | The six cases match 5h. The new closing sentence says a copy of a message's text can reach the bug service. It does not say how often (about one in ten) or who can read it there. Both are one click away in 5h, so this holds |
| 5 | Yes | "All three can see a copy" now matches 5h |
| 6 | Yes | "Any account that has it sees names today" is plain and true to 5d |
| 7 | **Yes, now** | Round 2's medium. "One of those logs can still hold your email address" is in, and section 9 step 3 carries the note |
| 8 | Yes | Matches 3c |
| 9 | Yes, with a soft spot | "What we have not yet confirmed about that company" flags an open question without saying what it is. A student who stops here does not learn it is about AI training (L2). Item 7a replaces the sentence before the page goes live |
| 10 | Yes | Matches sections 2 and 12 |

The intro's waitlist line ("up to 40 days", "up to 30 days") matches the section 11 table. Section 11 adds one exception under the table (the form being sent again restarts the days). Row 30 removes it. Fine for a line that starts "In short".

Bold-only reading: all ten bold leads state a fact. Seven outside companies are named in section 6, so "seven" is right.

## 4. Findings

Severity: high = false, unlawful or must not publish. Medium = misleading, a real gap, or likely to be believed wrongly. Low = polish.

### High

None.

### Medium

None.

### Low

Every rewrite below keeps the meaning. L1 to L4 are the ones most worth doing today.

**L1. 3d, the fourth bullet under "four more things": jargon and a 37-word sentence.** "The calls our server made to the database for that request. Their addresses hold account IDs…" A first-year student does not know what a call is, or whose addresses these are. This is the hardest line in the policy. Rewrite (longest sentence 26 words):

> - **What our server asked the database.** To answer a request, our server asks the database for things, and the report lists each thing it asked for. That list holds account IDs (random labels), yours and other people's. At three steps it also holds an email address. The steps are sending the waitlist form, typing a school email at the "verify your campus" step, and a cofounder looking an account up by email.

**L2. Short version item 9: say what is not confirmed.** Use this if item 7a is not done before the page goes live. It adds eight words and makes the short version stand alone:

> We do build Vibe with an AI coding assistant made by another company. Section 6 says what it may see. We have not yet confirmed whether that company may use what it sees to improve its own AI.

**L3. Section 6, Anthropic, third bullet: "We have not yet written a rule for the inbox" does not say what that means for the reader.** The first two bullets say what the assistant sees. The third only says a rule is missing. Add one sentence (17 words). It states the plain result of having no rule, so the writer should confirm it against item 7b before using it:

> - **The inbox and our other accounts.** We have not yet written a rule for the inbox (section 3g) or for our accounts at the other companies on this list. Until we do, the assistant could be shown what they hold, the mail you send us included.

**L4. Section 8: "For these two" is unclear.** The paragraph is indented under the "Your messages in a chat or club you have left" bullet, so "these two" reads as "a chat or club". It means the two bullets above it (comments, and messages in a place you left). Rewrite:

> For a comment, or for your messages in a chat or club you have left, you need not delete your account. Write to help@connectvibe.app from your sign-in email, and we aim to delete them by hand.

**L5. 5h: give the one-in-ten figure in message terms.** The paragraph says "About one request in ten to our servers sends Sentry a speed report". A reader who came straight from "Start here" has not met "request" (it is explained in 3d), and has to work out that this means their messages. Change the third sentence and add one:

> If you were sending a message at that moment, the report can hold its text (section 3d). So about one message in ten can be copied this way as it is sent.

The code agrees: the speed sample is 0.1 (`src/lib/sentry-config.ts:202`), and row 14 uses the same words.

**L6. 3d: three more things in the new block.**

| Text | Problem | Rewrite |
|---|---|---|
| "That can be what you were sending at that moment: the text of a message or a post, a report you were filing, the waitlist form or an email address you typed." | 32 words | "That can be the thing you were sending at that moment. Examples are the text of a message or a post, a report you were filing, the waitlist form, or an email address you typed." |
| "A report about a request to our servers, error or speed, can hold four more things:" | "error or speed" hangs in the middle | "An error report or a speed report about a request to our servers can hold four more things:" |
| "…the requests your browser made and lines our own software logs." | "lines … logs" is shop talk | "…the requests your browser made and the notes our own software writes as it runs." |

**L7. Section 6, Supabase: a 29-word sentence, then "It also does when…".** Rewrite as three sentences of 9, 24 and 24 words:

> On some pages your browser talks to Supabase directly. They are the pages where you sign in, sign up, confirm or verify an email, set a new password or read a suspension notice. Your browser also does so when a profile page checks that you are signed in, and each time a profile or post photo loads.

**L8. 3d and section 7 do not quite agree about signing out.** 3d: "Someone who could read the report could use it to act as you, until you sign out (section 7)." Section 7: "Another device can stay signed in for about an hour more." A reader who follows the pointer finds a gap of an hour. If the facts checkers agree, 3d can say:

> Someone who could read the report could use it to act as you. Signing out stops that, within about an hour (section 7).

**L9. Five sentences that trip.**

| Where | Text | Problem | Rewrite |
|---|---|---|---|
| 5e, Direct and group chats | "…can add you alongside people you are not connected with, with no request first." | "with, with" | "In a group chat, a person you are connected with can add you with no request first. The others in that chat may be people you are not connected with." |
| 6, Logs and reports | "It may be asked to read the logs…" | A bullet that starts with "It" | "The assistant may be asked to read the logs…" |
| 1, direct access | "That access can read everything Vibe stores…" | Access does not read. A person does | "With that access, the person can read everything Vibe stores, including both your email addresses, every message and the sign-in records in section 3d." |
| 4, first paragraph | "We also count things, to see in totals how Vibe is used." | Reads as a fragment | "We also count things, so we can see in totals how Vibe is used." |
| 5h | "If the request was you sending a message…" | Awkward | See L5 |

**L10. Words that survived.** Everything listed in round 2 is fixed. These five were missed then, or are new:

| Word | Where | Plain version |
|---|---|---|
| "All traffic uses an encrypted connection (HTTPS)." | 10 | "Everything sent between your device and Vibe travels over an encrypted connection (HTTPS)." |
| "Supabase's delivery network" | 8, A post | "The servers Supabase uses to deliver files can hold temporary copies of a public photo for longer." |
| "the one-time key inside it" | 11, Which companies | "including the single-use code inside the link" |
| "the reference number Resend gave the message" | 11, "We add" | A waitlist reader starts here and has not met Resend: "the reference number our email service (Resend) gave the message" |
| "goes through Cloudflare" | 11, Who at Vibe sees it | "goes through Cloudflare, the company that forwards our mail, to the personal Gmail inbox…" |

The policy still has no "hash", "token", "cache", "metadata", "consent", "retention", "third party" or "process".

**L11. The sentences over 28 words.** Three are new in round 3 and have rewrites above (L1, L6, L7). Seven stay, for the reasons given in round 2:

| Words | Where | Why it stays |
|---|---|---|
| 29 | 4, "The automatic emails Vibe sends you are these five: …" | A list, and "five" is the point |
| 29 | 5a, "Photos and videos: anyone who has the exact link…" | 25 words without its label |
| 28 or 29 | 3c, "We do not strip them from: …" | A list |
| 29 | 5i, "For the content of private messages we ask for a search warrant, unless…" | Lawyer wording (question 2) |
| 29 | 5i, "We may also go to the police or emergency services ourselves when…" | Exact wording, used three times |
| 29 | 10, "Vibe is built so that no other user can read your email addresses (…)" | Exact wording |
| 29 | 11, "The note holds your wave, how you got in (…), …" | A list |

Round 2's six splits are all in (5g, the section 11 list, 5e, the code fingerprint, Do Not Track, "take you off by hand").

**L12. Length and repeats.** About 11,700 words, 700 more than round 2. Every added word is a checked fact, so this is not a finding against the text. Sections 9 and 11 are now about 1,200 words each. Rows 14, 26, 49 and 51 take about 550 words back out. Nothing should be cut before they ship.

| Repeat | Times | Call |
|---|---|---|
| A bug report can hold what you typed | 7 (short version 4, 3d, 5h, both section 6 entries, section 11 twice) | Keep until row 14 ships and the old reports are gone. Then all go together |
| "not yet confirmed" about Anthropic | 3 (short version 9, section 4, section 6) | Keep until item 7a. Then one sentence in section 6 |
| "not on sale yet" | 3 (short version 6, section 4, 5d) | Keep. Section 4 now points to 5d |
| The six message cases | 2 | Keep. They match |
| "our own rule… No system enforces it" | 3 | Keep |
| "danger of death or serious injury, or a child is at risk" | 3 | Keep, word for word |
| No backups | 3 | Keep |
| The personal Gmail inbox | 5 | Keep |
| The email log in full | 2 (3d, 11) | Keep. Section 11 must stand alone |
| "We have not confirmed" how long or where | 4, plus one in 3d about the IP address | Keep. Item 11 turns each into a number |

The repeats agree with each other. Checked again: the six cases, the view rules, the photo-details list, the waitlist days, the profile parts that can and cannot be hidden (5a against section 9, both now with tagline, location line, website link and interest tags), and "removed" (one meaning everywhere; the one other use is the app's own "Removed before" label, in quotes).

**L13. If the page is published plainly today (row 2's fallback), the nested blocks need care.** The policy has several paragraphs and lists that sit inside a list item. Four matter most: the two closing sentences of short version item 4, the "four more things" in 3d, the Anthropic entry in section 6, and the note under section 8's two bullets. If the indent is lost they detach from their item, and "This is our own rule, not a lock" would follow item 4's last case as if it were part of case six. Check those four by eye after publishing.

## 5. Sentences that lean on a listed change

No sentence in the policy is true only after a code change. These lean on something on the list:

| Sentence | What it leans on | Small and exact? |
|---|---|---|
| "Effective October 4, 2026" | Row 1 (the page says October 5 today) | Yes |
| Every "(section N)" pointer and the "Start here" list | Row 2's link targets | Row 2 is large. The text can publish plainly without it (L13) |
| Section 11, "a cofounder may also write to you about setting up its page" | Row 6 puts the same line in the form's notice. Until then the notice a person saw does not say it | Yes, small, in today's gate |
| Short version 9, section 4 and section 6, "not yet confirmed" | Item 7a, before the page goes live. Both replacement sentences are written out | Exact. No code |
| Section 9, "deletes the account by hand: its files first, then its records" | Item 20 (a person follows written steps) until row 57 | A promise kept by hand. Row 57 is small, not for today |
| Sections 8 and 14, "we aim to delete the comment or the messages by hand" | Item 21 | A promise kept by hand, worded as an aim. Cut the same day if it will not be held |
| Short version 4's last sentence, 3d's "four more things", 5h's "Outside these cases", two lines in section 11 | Row 14 removes them. True today | Yes, small, in today's gate. Cut only after the old reports are gone |

Labels checked in the release: "Shared" (`src/components/desktop/messages/PinsPanel.tsx:275`), "Verify your campus" (`src/app/auth/school-email/page.tsx:510`), "Take me off the list" in the emails and on the page (`src/lib/waitlist/email-content.ts:134`, `src/app/waitlist/confirm/confirm-client.tsx:201`), "Yes, take me off" (`confirm-client.tsx:192`), "This account has restricted you" (`src/components/mobile/ProfileMobile.tsx:5653`). The waitlist form's notice still says "error reports go to Sentry" (`src/app/waitlist/waitlist-form.tsx:210`); row 6 changes it to "error and speed reports".

## 6. Round 2's findings, checked against the new text

All are in.

- **M1** is fixed: short version item 7 and the note under step 3 use the suggested wording, and row 51 lists the sentences that leave.
- **L1, L2, L3** (short version items 4, 5, 6 and 9) are applied.
- **L4**, the twelve words: all changed as suggested.
- **L5**, the eight sentences: all rewritten. "One more gap." is bold.
- **L6**: six splits done. **L7**: 3d is now bullets, 3a is two sentences, 5g is a list.
- **L8**: "Start here" has the two new lines.

## 7. What works, and should not be touched

- Grade 6 on average, no section above grade 9, a median sentence of 12 words, 67% of sentences at 15 words or fewer.
- The short version says the hard things in its bold leads, and now also the two newest ones: the bug service and the log that keeps an email address.
- The new admissions are as plain as the promises: "This rule is new." "It is not marked yet, so it can look to you as if it was still sent." "We have not confirmed that the IP address itself is always left out." "Someone who could read the report could use it to act as you."
- 3d's four bold leads let a reader skim: what your browser sent, your sign-in cookie, a rough location.
- "The rule covers the database only. Outside it:" tells the reader the list that follows is the limit of the promise.

## 8. Order to apply

1. Nothing blocks publishing on this lens.
2. Before the page goes live: item 7a, or the L2 line.
3. Today if there is time: L1, L3, L4, L5 (four short rewrites in the most-read risky places).
4. Then L6 to L10.
5. L13 when the page is built or published plainly.
