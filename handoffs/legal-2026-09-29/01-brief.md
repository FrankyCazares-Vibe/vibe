# Terms of Service v2 — the brief (2026-09-29, session 70)

This folder is the working set for the second Terms of Service draft and the two-player review Franky asked for. Everything a cloud session or an agent needs is in this folder or in the files it points at. Memory and the private journal are NOT available in the cloud; what mattered from them is written down here.

## 0. What Franky asked for (his words, paraphrased only where marked)

1. Draft the Terms of Service for Vibe, using "everything you know about vibe, our ideas, the three cofounders, absolutely everything", with the ChatGPT prompt in `01a-chatgpt-prompt.md` as the analysis frame, and the current Terms as a reference.
2. Then set up **two players**: one agent on Franky's side, "defending and making sure I will be completely safe from anything at all", and one that "tries to fight against it, find every little loophole there is, and try to f*** me over basically".
3. Then show "the results of what happened, the potential outcomes", and **stop**. Franky gives his thoughts.
4. Then revise to close the loopholes.

He wants the heavy work run in the cloud (the Mac sleeping killed a workflow in session 67).

## 1. Who the contract is with

- **CONNECTVIBE. LLC**, Indiana domestic LLC, Business ID 202605081999327, effective May 8, 2026, manager-managed. The filed Articles name only **James Andres** (governing person, registered agent, signer). An amendment due Oct 3 adds **Francisco Cazares** and **Rylan Conaway** as co-founders / governing persons and sets a principal office (Franky's home address, never written into the repo). No office exists.
- Three cofounders, all called cofounders in every document: **Franky** builds everything and is the only person who can reach the systems that hold user data (Supabase, Vercel, Cloudflare R2); **James** runs the paperwork (LLC, bank, lawyer, filings) and does NOT own the company; **Rylan** runs the campus (club outreach, events, demo days). Never use "owns". No equity language anywhere.
- All three are platform admins (moderators) in production. Every report emails all three.
- Emails: `hello@connectvibe.app` (general, forwards to Franky's Gmail), `help@connectvibe.app` (safety, appeals, takedowns, child-safety contact), `vibe.llc@outlook.com` (business email of record; James and Rylan can read it).
- Venue: **Marion County, Indiana**. The live page still says Monroe County, which is wrong.
- Lawyer: James is finding one. Terms and Privacy must be live ~Oct 14 (they must publish before students are invited, and publishing re-prompts every account). Store submission Oct 16. Launch Oct 31. Bank: Mercury. EIN pending. DMCA agent registration is James's task j9, Oct 14.

## 2. What Vibe is

Franky, Sept 15: "the focal point of vibe is replace instagram and creating a whole new social media for students, orgs, and clubs." Social first, career second. Tagline: **"Your campus. Your people. Yourself."** Profiles are a customizable portrait, not a résumé; **counts are public, identities are private** (anyone sees how many followers; only you see who viewed you, and the "who" is what Vibe+ sells).

Pilot: the shared **Indianapolis** campus (IU Indianapolis + Purdue in Indianapolis, formerly IUPUI) as one community. Vibe serves both university systems. Clubs come before students: Rylan's job is 10 clubs live with events before students are invited. **Zero clubs have signed.** SAE is Franky's own fraternity chapter used as a test page.

Numbers (Sept 28): ~20 account rows, 14 verified school emails, 0 Purdue students, 0 upcoming events, several founder test accounts.

Vibe is a website (connectvibe.app) that will also ship as store apps (App Store + Google Play, Capacitor shell loading the live site, 18+ rating on both stores, Vibe+ invisible inside the store apps at launch). Push notifications are built but dark.

## 3. How identity works TODAY (see `00-code-facts.md` for the code-verified version; where they disagree, the code facts win)

- **Sign up with any email** (Gmail etc.). The brand copy literally says "Use your personal email — the one you actually check. Your school .edu is verified separately." Supabase Auth, email confirmation on, password 8–20 chars, no OAuth, no 2FA, no phone.
- **School email verification**: a second address, `@iu.edu` or `@purdue.edu` (and subdomains), verified by a link or code. It proves the **university system** (IU or Purdue), not the campus and not enrollment. Campus is self-declared from the verified system's campus list (home campus locks for 45 days). `@iupui.edu` was retired Dec 31 2025 and is refused. One school address can verify only ONE account (unique). Verifying the other university's address switches the account's system. No expiry, no re-verification, no enrollment check, no graduation handling.
- **The badge** says the campus label or "IU verified" / "Purdue verified". The Privacy draft and the Terms draft already say "a school-verified badge means only that the person confirmed an IU or Purdue school email address."
- **Verified-only actions**: posting, commenting, reposting, messaging, club chats, events, RSVP, creating a club, joining a club, sending invites. **Unverified accounts can still**: browse the feed and profiles (a security finding: a Gmail-only account can read every student's profile, posts, major, year, location text, work history and last-active time), follow clubs, like, block, mute, report.
- **18+**: one checkbox, "I'm 18 or older and I agree to the Terms of Service and Privacy Policy." No date of birth. IU and Purdue admit some 17-year-olds. The Sept 27 security review flagged that a found minor is banned for good.
- **Consent record**: Terms version, server time, 18+ attestation, source; append-only ledger; deleted with the account (so no proof of consent survives deletion). `TERMS_VERSION` is still "2026-05-07"; every bump re-prompts everyone.
- **Bans and suspensions** (live since S64): a suspension has an end date; a ban never ends. Neither blocks sign-in: a restricted student can read the notice at `/account/suspended`, appeal to help@, sign out, and delete the account. What makes a ban stick is an HMAC of the **canonical school email** (`+tags` stripped, subdomains folded), tested at school-email verification, so that address can never verify another account. The login email is NOT hashed: a banned person can sign up again with a new personal email and, if they have a second school address, verify that. A ban tears down Vibe+ with no refund; a suspension leaves billing running. Removed content shows its author "Removed by Vibe moderators" plus a reason; moderation actions are append-only; reports keep a snapshot; the desk refuses to restrict a platform admin.
- **Account recovery**: password reset by email to the LOGIN email only. Nothing exists for a lost login email, no support-driven recovery, no session revocation list, no "sign out everywhere". The security review found: sessions last over a year; a password can be changed without the old one from a live session; deletion asks only for the handle (public).
- **Deletion**: `DELETE /api/me` purges files first, then the login and every user-keyed row; nulled not removed: org owner, report reporter, channel "added by", request "resolved by", invite "invited by". Reports keep their snapshot with the reporter cleared. The ban hash survives (that is its purpose). Stripe customer is deleted first (cancels subscriptions, no refund); failure aborts deletion. No database backups (Supabase Free).
- **Pre-registration takeover** (security finding, Sept 27): someone can sign up with a student's email first, leave it unconfirmed, and the student's later confirmation activates the attacker's password. Relevant to "compromised email" scenarios.

## 4. Clubs and orgs TODAY

- A club is a **page controlled by student accounts**, not a separate login and not a legal entity. Any verified student can create one (on the computer). Roles: owner, admin, moderator, member. Only the owner promotes or demotes admins; owner and admins remove members, approve requests, invite, post as the club, edit it, see followers and remove a follower; mods approve requests. **No ownership transfer exists in code.** If the owner deletes their account the club stays with no owner; remaining admins can run it, but nobody can become owner.
- **"Verified club" badge**: granted only by the founders (admin desk). Only verified clubs can create events and send invites. It means "we confirmed it is a real campus organization", never a university endorsement.
- Join policies: open, request (officer approves), invite-only. Audience: both / IU only / Purdue only, checked against the student's verified system. Following ≠ membership: anyone signed in can follow any visible club; members can't unfollow; officers see the follower list; the public follower count shows only from 5 up. Club pages, recent posts and who posted them are readable by anyone on the internet, including invite-only clubs. Hidden clubs 404.
- **No club-level billing.** Vibe+ is per student. Nothing a club can buy exists today. A club officer who subscribes to Vibe+ subscribes personally.
- Founders' meeting asks (Sept 26): member lists, roles, and **passing down ownership so a club survives when officers graduate**; club badges on profiles. Roadmap recommendation: club pages are created by a student officer's own verified account, **at least 2 officers**, and a **club school email** (e.g. sae@iu.edu) as the verified mark and the recovery key. Rylan's demo-day pitch will be asked "what happens to our account when officers graduate?" (podcast-gtm notes).
- Club pages are built in front of the club in the same visit it says yes; events copied from The Spot / BoilerLink only for clubs that agreed.

## 5. Money (Vibe+)

- Vibe+ (`plus`): $3.99/month or $24.99/year, Stripe hosted Checkout (auto-renew line under the button) + Customer Portal to cancel. No trials, no promo codes, no tax collection (no registration). Refunds and disputes are recorded, not acted on; Franky cancels in the Dashboard. Comp rows for founders/testers. Production billing is OFF until the LLC has an EIN + bank account AND the Terms with subscription and auto-renewal wording are published. Vibe+ is invisible inside the store apps at launch (no in-app purchase).
- What Vibe+ will sell: more customization (flair), and the names behind the counts (who viewed you). Free tier shows the numbers.
- Ambassador / "founding members group" perks (free Vibe+) have a queued lawyer question about unpaid promoters for a for-profit LLC.

## 6. The legal pages as they stand

- **Live Terms** (`src/app/legal/terms/page.tsx`, effective May 7, 2026): "operated by the Vibe team", requires 18+ AND enrollment at a U.S.-accredited college AND a working .edu (all three overstated vs. the code), one account, $100 cap, indemnity, Indiana law, **Monroe County**, no subscription terms, no named entity, "baseline draft" disclaimer.
- **Sept 7 drafts** (`handoffs/legal-drafts/`): a full Terms rewrite and Privacy Policy, code-grounded, with `[DECISION]` and `[REVIEWER]` markers, plus `2026-09-07-reviewer-questions.md`. Re-checked Sept 17. They predate: moderation (bans, suspensions, the school-email hash), Stripe, the store apps, push, the 24-hour and 48-hour promises, any-campus browsing, profile widgets, and the club chat redesign. **Use the Sept 7 Terms as the base text and structure; do not throw it away.**
- **Community Guidelines** (live, Sept 28) and **Child Safety Standards** (live, Sept 27): 24-hour review aim, NCII 48-hour removal (TAKE IT DOWN Act), help@ contact, bans stick to the school email. Both pages OVERSTATE verification: "Everyone here verified a school email, which means the person on the other end of a post, a comment or a message is a real student at a real school" and "You need a verified school email to be here, and the Terms require you to be 18 or older and enrolled at a U.S.-accredited college". The Terms must not repeat these; the pages must be corrected (list them in the copy audit).
- Marketing repo (`~/vibe-marketing`, not in this repo) also carries "real students only" as a proof line and "Vibe uses real names and verified school emails".
- Sept 27 security review, legal section: live pages stale (Medium), TAKE IT DOWN process was missing (now on the pages), age check is one checkbox and the documents disagree on the minimum age (Low), no DMCA agent, no NCMEC registration yet. Apple/Google check that the privacy page matches the app.
- Reviewer questions already queued for the lawyer (Sept 7 doc): 17-year-olds; clickwrap enforceability; what survives deletion; the $100 cap and indemnity under Indiana law; entity and venue; which hand-run promises are safe; officer follower visibility. Later additions: TAKE IT DOWN coverage and records; IU/Purdue name usage in marketing; unpaid ambassadors; photo/video consent; Texas SB 2420 (app store age checks).

## 7. Product decisions that are Franky's, already known

- 18+ only (attestation), no minors' path built.
- Verify-before-posting: browsing without verification is deliberate for now, but the security review said it should be decided on purpose.
- Bans stick to the school email, not the person; a banned student may still sign in to appeal and delete.
- Handles are not reserved after deletion.
- No arbitration, no class waiver in the Sept 7 draft (deliberate, for plainness) — counsel to advise.
- Store apps: 18+ rating, no in-app purchase at launch.
- Clubs: student-officer-created, at least 2 officers, a club school email for recovery (recommendation, not built).

## 8. House rules for the writing

- Plain English. Short sentences. Explain any unavoidable legal term once in a few words. James and Rylan must be able to read every document. A recommendation for every open call.
- Never claim the system verifies more than it does. "Verified" on Vibe means "confirmed control of an IU or Purdue email address at the time of verification". Never "verified student", "students only", "safe", "authenticated".
- Never describe James as owning the company. Never write the business address. Never write "clips" (say video posts).
- The Terms are a contract students must accept by checkbox; no "baseline draft" disclaimer in the published text. Reviewer notes go in brackets or a separate file, never in the body.
- Do not promise tooling that does not exist (MFA, backups, automated export, ownership transfer, org billing). Where a promise needs code, say so in the engineering list instead.
- Refer to the company as CONNECTVIBE. LLC once, then "we".

## 9. Deliverables in this folder

| File | What |
|---|---|
| `00-code-facts.md` | What the code actually verifies and enforces (agent audit, with file paths) |
| `01-brief.md` | This file |
| `01a-chatgpt-prompt.md` | The analysis frame Franky brought, verbatim |
| `02-terms-of-service-v2.md` | The draft Terms (output A) — the thing the two players fight over |
| `03-companion.md` | Outputs B–J: privacy provisions, community guideline provisions, org-account rules, recovery rules, verification UX, personal-email rules, engineering requirements, unresolved decisions, questions for counsel |
| `10-attacker-round1.md` | The attacker's findings (every loophole, ranked, with the exact clause and the play) |
| `11-defender-round1.md` | The defender's answers: holds / partially holds / breaks, plus the fix |
| `12-results.md` | What happened, the potential outcomes, what needs Franky's call (STOP here for Franky) |
| `02-terms-of-service-v3.md` | After Franky's thoughts: the revised Terms |

## 10. The two players (rules of the game)

- **Attacker** plays, in turn: a malicious user; a banned user coming back; a student disputing an impersonation; a former club officer; a new club officer; a university; a privacy regulator; a consumer-protection regulator; plaintiff's counsel. For each loophole: the clause, the play (step by step, using how the app actually works per `00-code-facts.md`), what Franky loses (money, data, a lawsuit, a store rejection, a campus), and a severity.
- **Defender** plays startup defense counsel plus the operator who has to keep the promises with no staff: for each attack, does the clause hold, partially hold, or break; the fix in words (a clause) or in code (an engineering item); and which fixes are cheap.
- Neither player may invent features. Both cite `00-code-facts.md` or the draft by section.
- The results file is for Franky: plain English, what would actually happen, ranked, with a recommendation on every call. Then stop.
