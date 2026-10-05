# Privacy Policy v3: red-team check, round 3

2026-10-04. Checker's notes on `privacy-policy-final.md` as rebuilt after round 2 (619 lines, about 12,060 words, md5 `7f88ad28…`). The policy was not edited. Nothing in the release worktree or the repo was edited. Production was not touched. This is not legal advice; laws are cited from memory and marked "verify with counsel" where I am unsure. Earlier notes are kept as `verify-redteam-r1.md` and `verify-redteam-r2.md`.

**Skill.** No skill is named for this job. `legal:compliance-check` was loaded first as the closest fit; its frame is at the end. The four readings in the job are the lens.

**Code read.** The release worktree at `62a2daa` (the three merges are in; six files have uncommitted changes, none of them a legal page). The installed Sentry kit, `/Users/franciscocazares/vibe/node_modules/@sentry/core` 10.73.0. The live policy on `main`, for what it promised.

## Verdict

**Do not pass yet: two medium findings. Nothing is high.** Round 2's medium (one message in ten and Sentry) is closed in the text: short version item 4 and 5h now say it. I found no sentence that is false of the release. Both mediums are a few words each. One was widened by round 3's own new promise.

## Medium findings

### M1. A forged "From" line is the only proof for three things that cannot be undone

- **Where:**
  - Section 9, "See and change" (line 420): "To change your sign-in email, write to help@connectvibe.app from your current sign-in email. We reply to that address before we change anything."
  - Section 8, under "Comments" (line 408, new in round 3): "Write to help@connectvibe.app from your sign-in email, and we aim to delete the comment or the messages by hand."
  - Section 9, "Delete your account" by email (line 430): "We reply to your sign-in email and delete only after you answer from it."
  - Section 14 (line 593): "Write from the email address on your account or waitlist entry, so we know it is you."
- **What is wrong:** the sender line of an email can be forged. The policy treats it as proof ("so we know it is you").
  - The sign-in email change promises a reply, not a wait. An attacker forges the victim's address and asks for a new sign-in email. The cofounder replies to the victim and changes it. The attacker resets the password at the new address and reads every chat. Then "A copy of your data" goes to that new address too.
  - The new hand route for comments and messages has no reply step at all. A forged request deletes someone's messages for everyone, with no backups.
  - Deleting by email does wait for an answer, but a forger can send the "answer" blind.
- **Why it is medium:** a real gap, in public, on the question "who can get at my DMs". The policy is a how-to for an angry ex-member. The three sentences also promise three different levels of care for the same kind of request.
- **Fix in the policy (exact):**
  - Section 9: "We reply to that address, and change it only after you answer that reply."
  - Section 8: "Write to help@connectvibe.app from your sign-in email. We reply to that address, and once you answer that reply we aim to delete the comment or the messages by hand."
  - Section 9, delete by email: "…and delete only after you answer that reply."
  - Section 14: replace "so we know it is you" with "Before we delete or change anything, we reply to that address and wait for your answer."
- **Fix on the change list:** items 20 and 21, and a new one for the sign-in email change: the reply carries a one-time word, and the answer must quote it. Then a blind forged "answer" fails. Add the same line to `decisions.md` D7, D11 and D16. Lawyer question 20 already asks about proof of identity.
- **From memory, verify:** gmail.com and outlook.com publish a policy that does not reject forged mail outright, so such a message can still arrive (perhaps in spam).

### M2. Section 11 lists the companies that handle a waitlist entry and leaves out the AI assistant

- **Where:** section 11, "Which companies handle it?" (line 528); the intro's "Only on the waitlist? Section 11 is written for you."
- **What is wrong:** section 11 calls itself "our notice to you" and names Supabase, Vercel, Resend, Google, Sentry and the university's mail system, then Cloudflare and Gmail for a reply. It does not name Anthropic. But section 6 says that when the cofounder tests the live site with the assistant, "it sees the screens that cofounder's own account sees, the admin tools in section 1 included", and section 1 lists "the waitlist (section 11)" among those tools. That screen shows each person's name, answers and part of the address. The waitlist ships today, so its admin screen is the one most likely to be tested live this week.
- **Why it is medium:** a waitlist person is told to read section 11 only, and will believe the list is complete. They never agree to the policy, so this notice is all they get. A third-party AI company is the recipient a regulator or a store reviewer asks about first (Apple 5.1.2(i), from memory).
- **Fix in the policy (exact):** in "Which companies handle it?", before "Section 6 says more about each company.", add: "The AI coding assistant we build Vibe with (Claude, made by Anthropic) may see the list on screen when the cofounder with direct access tests the admin tools with it."
- **Or fix it by a rule:** if the cofounders decide the assistant is never used on the live waitlist screen, say that in section 6 instead and add nothing here. That is the kinder choice for students, but it is a rule someone must keep (item 7b).
- The form's own notice can stay as it is: it links to section 11.

## Low findings

| # | Where | What | Fix |
|---|---|---|---|
| L1 | Section 4, "Emails" (line 168) | "There is no marketing or activity email." Two sentences earlier a person on the team may write about "a club you run", and section 11 says a cofounder may write to a club runner about setting up its page. That email is outreach | "Vibe's software sends no marketing or activity email." |
| L2 | `src/app/waitlist/waitlist-form.tsx:211-212`; row 6; policy lines 9 and 543 | The form says "Every email we send has a link to take you off the list". Row 6 adds "a cofounder may write to you" to the same notice. The cofounder's own email has no such link | Row 6: "Every automatic email we send has a link…". Policy, both places: "Every automatic waitlist email…". Item 19: the cofounder's email ends "Reply 'take me off' and we delete your entry." |
| L3 | Section 4 (line 179) | "Section 5d says who has it today." 5d says how an account can have Vibe+, not who or how many | "Section 5d says how an account can have it today." After item 17: 5d can give the number |
| L4 | Row 3, on `src/app/legal/delete-account/page.tsx:164-165` and `:225-226` | After row 3 the page reads "your posts, uploads and role in it are deleted". Section 8 says the files of posts made as a club stay until the club is deleted. The email-log bullet says "The address … [is] erased from it"; the log never held the address (3d) | Row 3: "your posts and your role in it are deleted. The photos and videos of posts you made as the club stay until the club is deleted (Privacy Policy, section 8)." And: "The scrambled code we used to look it up is erased from it." |
| L5 | Section 9, "A copy of your data"; section 14, first right | Silent on other people's information. Reports about you hold the reporter's handle (section 1). 5h promises the person reported is not told who filed. A reported person can ask for "what we hold about you" | Add to section 9: "The copy leaves out who reported you and the Vibe team's private notes." |
| L6 | Row 14, step (d) | The pattern misses `or=(a.eq.x,b.eq.y)` filters and the operators not in its list (`is`, `gte`, `not.…`). `.or(` is used in 45 files under `src/lib` and `src/app/api`, with account IDs (for example `src/app/api/search/route.ts:235`). After (d) ships, 3d's "database calls" bullet is still true | Replace (d): drop the whole query string of any web address containing `/rest/v1/`, in span descriptions, span data and the trail. Do not cut that bullet until a live speed report shows no ID |
| L7 | Part 3, item 9 | The three most alarming sentences (short version item 4, last sentence; 3d's cookie bullet; 5h's Sentry paragraph) rest on a code reading. Mine agrees for what the kit sends (see "Sentry" below). But Sentry's own servers, by default, blank values under keys that contain "auth" or "token" (from memory; verify), and the cookie is named `sb-…-auth-token` | Do item 9 before the page goes live, with items 6 and 7a. It is five minutes. If the cookie shows as filtered, cut the cookie bullet the same hour |
| L8 | Part 3, item 1 | The live policy on `main` says: "we'll give you reasonable notice (in-app or by email) before they take effect." Item 1 tells existing accounts "the same day" | Send the note first, then publish. A handful of accounts. Lawyer question 13 |
| L9 | Section 12, third paragraph | "If we learn an account belongs to someone under 18": ban, then a delete that cannot be undone, within 7 days, with no backups. A false tip from an angry ex could erase an adult's account and its messages in other people's chats | Item 14's one-page steps: tell the account, and do not delete while an appeal is open unless the case is plain. Optional sentence: "The account can appeal first (section 9)." |
| L10 | Section 5h | The automatic blocked-word check on messages is said only in 3e, under "What does Vibe not collect?". A student asking "does software read my DMs" looks in 5h | Add to 5h: "Software checks each message against a short list of blocked words before it is saved, and refuses it on a match. Nothing is kept from that check (section 3e)." True in the code: `src/app/api/me/threads/[id]/messages/route.ts:300` |
| L11 | Section 14, "State privacy laws" | "Those laws cover companies much bigger than Vibe is today." A few state laws on health information have no size floor (Washington, Nevada; from memory, verify) | "Most of those laws…". Lawyer question 14 |
| L12 | Section 6; short version item 9 ("seven") | The handoff notes committed to the private GitHub repo hold 31 email addresses that are not the founder's. 18 look like placeholders; 13 do not (a count; I did not open them). The assistant reads those notes too | Check the 13 by hand. If any belongs to a user who is not a cofounder, take it out, or GitHub is an eighth company |
| L13 | The release, `src/app/legal/privacy/*` | Not a fault in the policy. The page in the release still holds v2: the date says October 5, and it names neither Anthropic nor the personal Gmail inbox, and has no Sentry sentence about message text | Row 2 and its fallback. Do not let v2 go live as the policy |

**Stands from earlier rounds, nothing new:** Vibe+ and "we do not sell" (lawyer question 6); the stepping-aside rule (item 13); "or a child is at risk" (question 2); the store gates (Apple 5.1.1(i) and 5.1.2(i), NCMEC registration, a copyright agent, a written yes from the people in the film). Row 39 (one line under the sign-up box about views) should ship before the apps are submitted: Google asks for a notice in the app where people would not expect the use (from memory; verify).

## Sentences that rest on a listed change

No sentence in the policy is true only after a change. I tried the ones most likely to be: the sign-up box (section 2), sign-out on every device (section 7), the 40 and 30 days (section 11), the five automatic emails (section 4), "the only cookies" (section 7). Each is true of the release today.

What rests on a change is the other pages, and the page that shows the policy:

| Change | Small and exact? | Note |
|---|---|---|
| Row 1 (the date) | yes | The page says October 5; the policy says October 4 |
| Row 2 (the page's text) | **no: large** | L13. The fallback (publish plainly) is the safe path today |
| Row 3 (delete-account page) | yes, but one line is wrong | L4 |
| Rows 4, 6 to 13, 48, 53, 54 | yes | Row 6 needs one more word (L2) |
| Row 14 (Sentry) | yes, but step (d) is not complete | L6. It takes sentences out; it makes none true |
| Row 26 (school-email test) | yes | Takes section 10's "One more gap" out |

## Sentry: what I re-read, because the policy's scariest lines rest on it

- `src/lib/sentry-config.ts:203` sets `sendDefaultPii: false`. In kit 10.73.0 that turns body collection "off" in the settings (`utils/data-collection/defaultPiiToCollectionOptions.js`, `httpBodies: []`).
- But the code that captures an incoming request's body does not look at that setting (`integrations/http/server-subscription.js:56`, on unless `maxRequestBodySize` is "none"), and the step that attaches it says "data: true" (`integrations/requestdata.js:28`).
- On an error or speed report, headers and cookies are copied with no filter (`requestdata.js:111-141`). The kit's new filter list, which names `sb-` and `supabase` cookies, is used only for span attributes (`utils/request.js:170`), not for the report's own request record.
- So the policy's reading of what the kit sends holds. What Sentry keeps after its own server-side scrubbing is not known until someone opens a report (L7).

## The four readings: what held up

- **A state attorney general.** The hard facts are said plainly: one person with every key, no backups, no access log, a personal Gmail inbox, an AI assistant with a rule nobody enforces, what "verified" does not prove, public posts, location inside files, Vibe+ showing names today, message text reaching Sentry. No named law is claimed. No fixed number is promised except 30 days (breach), 45 days (requests) and 7 days (under 18), each worded with its limits. What it would pick at: M2 (a notice that leaves a recipient out), L8 (the older policy's "before they take effect") and "we do not sell" beside Vibe+ (lawyer question 6).
- **An Apple or a Google reviewer.** Collection, use, companies, keeping, deleting and taking back consent are all there. The app's permissions match 3h. The page a reviewer opens is delete-account, so rows 3 and 4 (and L4) matter most. Nothing in the app asks for a permission the policy leaves out.
- **An attacker or an angry ex-member.** The leads the policy hands over: M1 (new), the sign-in cookie and the school-email test (rows 14 and 26, in the gate), one inbox and one person (item 6). The promises it can be held to are all in `decisions.md` part D. Two can be turned against another student: the hand deletion of messages (M1) and the under-18 rule (L9). A third needs one sentence: a reported person asking for "a copy" (L5).
- **A first-year student.** "Who can read my DMs" is answered in short version items 3, 4 and 5, then 5e and 5h. "What happens when I delete" is in item 7, then 8 and 9. Both are plain and neither hides the bad parts. Frightening without need: only if L7 shows the cookie is filtered. One thing a student would look for in 5h and not find: L10.

## The waitlist notice, the emails and the pages (re-read this round)

| Compared | Result |
|---|---|
| Waitlist form notice and its three boxes (`waitlist-form.tsx:207-227`) | Agrees on purposes, five companies, "up to 40 days", the link to `#waitlist`. Open: "a current student" and "error reports" (row 6); "Every email we send" (L2) |
| "Check your inbox", confirm and leave pages (`waitlist-done.tsx`, `confirm/confirm-client.tsx`) | Agree: 7 days, 40 days, "We deleted your answers" |
| Confirm email and access-code email (`src/lib/waitlist/email-content.ts`) | Agree: 7 days, "up to 40 days", the code's real end ("14 days, or sooner when the entry is deleted first"), "Take me off the list" in both, replies go to hello@. "Use your personal email" stands with rows 24 and 55 |
| Password-reset and school-email emails (`src/lib/email/resend-transactional.ts`) | Agree with section 2 (a link and a code) and with "these five" in section 4. No sixth automatic email exists in the code |
| Sign-up checkbox (`signup-form.tsx:594-613`) | Agrees with section 2, word for word |
| Delete-account page | Contradicts sections 1, 8 and 9 until rows 3 and 4 ship. One row line is itself wrong (L4) |
| Support page | Agrees on reports, email and "a person reads every email". The block paragraph contradicts 5a until row 12 ships |
| Settings | "Danger zone", "Delete your account" and typing the handle match section 9. No privacy switch the policy leaves out. Three lines wait for rows 13, 48 and 53 |
| Words in the app that promise privacy | Report sheet: "The person you reported won't be told who sent it" (matches 5h). Anonymous poll: "On: counts only" (matches 5e). "Only you can see it" on removed content and saves (5g and 5h add the Vibe team and the cofounder with direct access) |
| Landing page | No privacy claim. "Not affiliated with Indiana University or Purdue University" matches the intro. Store links stay hidden until the apps exist |
| What the code contacts | Cookies: only the sign-in ones (`src/proxy.ts`, `src/lib/supabase/middleware.ts`, `server.ts`). No sign-in through another company, no puzzle check, no live socket from the browser to Supabase, no outside embed. Outside hosts: Google Fonts, Cloudflare (the PDF reader), Vercel's file storage, and Stripe and Firebase behind their switches. Nothing section 6 leaves out |

## The compliance-check frame, in short

- **Summary:** proceed with conditions: M1 and M2 in the text (a few words each), part 1 of the change list in the same deploy, and items 1, 6, 7a and 9 before the page goes live.
- **Rules that apply today (all from memory; verify with counsel):** FTC Act section 5 and Indiana's deceptive-acts law (every statement true, nothing material left out: M2); California's online privacy law (met by sections 3, 6, 7, 9 and 13); the Stored Communications Act (5h, 5i and the Sentry copy); 18 U.S.C. 2258A (5i); the TAKE IT DOWN Act (Support page); Indiana's breach law (section 10); CAN-SPAM for the club email (lawyer question 9, L1 and L2). The state privacy-rights laws have size limits Vibe is far under (L11).
- **Risks, most serious first:** account takeover by a forged email (M1); the page shipping v2's text (L13); the Sentry copy of message text until row 14 ships and old reports are gone; one inbox and one person without two-step sign-in (item 6).
- **Approvals needed:** the three cofounders for the 17 hand-kept promises in `decisions.md` part D (M1 changes three of them); the lawyer for the 24 questions.
- **Further review:** lawyer questions 1, 2, 6, 13 and 20 first.
