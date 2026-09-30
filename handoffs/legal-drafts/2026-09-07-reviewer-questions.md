# Vibe legal drafts — questions for the reviewer

**September 7, 2026** · Drafts: `handoffs/legal-drafts/2026-09-07-privacy-policy.md` and `2026-09-07-terms-of-service.md` (replacing the May 7, 2026 live pages). Section numbers refer to the drafts. Reply to Franky Cazares, hello@connectvibe.app. · updated September 17, 2026 for Purdue, campuses, club following and invites, onboarding and post editing

## Context

Vibe is a free campus social app (profiles, posts and video posts, clubs you can follow or join, direct and group messages, events, and resumes other students can open) piloting in Indianapolis (one shared campus for IU Indianapolis and Purdue Indianapolis) with 20 account rows as of September 17, 2026 — 13 have accepted the Terms and 7 have never finished onboarding, and several are the founders' own test accounts — operated by CONNECTVIBE. LLC, an Indiana LLC (effective May 8, 2026) and built by three cofounders, only one of whom can reach user data, and usable only by people who verify an @iu.edu or @purdue.edu address and tick a box saying they are 18 or older. At signup we record the Terms version accepted, a server timestamp, the 18+ attestation and where it happened (signup or re-consent screen) — not date of birth, IP address, browser, or a copy of the text — and account deletion immediately purges the user's uploaded files, then deletes every database row tied to the account, leaving only orgs/channels they created and reports they filed, with their identity removed.

## Questions

**1. Is a self-attested "I'm 18 or older" checkbox enough, and what about 17-year-old first-years?**
*Why:* IU Indianapolis and Purdue Indianapolis admit some 17-year-olds; Vibe holds identity, private messages and resumes; no date of birth is collected or verified. The drafts drop the old COPPA "under 13" text that contradicted the 18+ rule.
*Default:* strict 18+, attestation only; account deleted if we learn the holder is under 18 (Privacy §2, §12; Terms §2).
*If different:* admitting 17-year-olds needs a parental-consent flow and restricted features that do not exist, plus a new checkbox; stronger age proof means collecting DOB or ID and disclosing it in Privacy §3a.

**2. Is the consent record, as implemented, an enforceable clickwrap?**
*Why:* the cap, indemnity, content license and venue clause all rest on it; the old pages captured no acceptance.
*Default:* required checkbox naming both documents; version, server timestamp, attestation and source in an append-only ledger; a new version blocks feed, posting and messaging until the user actively re-accepts; continued use is never acceptance; typo-level "minor corrections" do not change the version or re-prompt (Terms §1, §14; Privacy §13). Only the Terms carry a version; the Privacy Policy rides on the same checkbox.
*If different:* add IP/user agent or a snapshot of the accepted text, give the Privacy Policy its own version, or drop the minor-corrections carve-out — each a code change plus a Privacy §13 update.

**3. Should anything outlive a deleted account — consent proof, a banned-user identifier, the handle?**
*Why:* deletion removes the consent ledger, so we cannot later prove agreement; there is no ban list, so a removed user can re-register with another email; a freed handle can be used to impersonate a departed student.
*Default:* nothing survives, and the drafts say so (Privacy §8, §9d, §13; Terms §1, §3, §7).
*If different:* a minimal consent tombstone, a hashed-email ban list, or a handle reservation (e.g. 90 days) are each a code change plus a "what stays" line in Privacy §9d and Terms §9 — tell us which, and for how long.

**4. Do the "as is" disclaimer, $100 cap and user indemnity hold against individual students under Indiana law for a free service?**
*Why:* Terms §10–§12 are a one-person operator's only financial protection; with no database backups, data loss is a realistic claim.
*Default:* full disclaimer including "no backups", no indirect damages, $100 cap, indemnity for the user's content and breaches, no arbitration, no class waiver (Terms §10–§13).
*If different:* give us the cap, any conspicuousness formatting Indiana requires, whether to narrow the indemnity, and whether to add arbitration or a class waiver (both documents change and everyone re-consents).

**5. Who is the contracting party, and is the jurisdiction framing right?**
*Why:* the drafts now name CONNECTVIBE. LLC, an Indiana domestic LLC effective May 8, 2026 (registered agent James Andres); the state record lists no principal office address and the drafts publish none — our read is that none is required at this size, which is one of the things we would like confirmed; the old Terms put venue in Monroe County (Bloomington).
*Default:* Indiana law; courts in Marion County, Indiana; Vibe stated as independent of Indiana University and Purdue University; no state-privacy-law or EU/UK section beyond "we honor rights the law requires", as Vibe is far below Indiana CDPA and CCPA thresholds; no mobile app exists — both drafts describe Vibe as a website used on computers or phones, and Terms §15 carries only a conditional "if we ever publish through an app store" sentence (Privacy §1, §2, §14; Terms preamble, §13, §15).
*If different:* name the entity (sole proprietorship vs LLC) and address; confirm or replace Marion County; flag any state or foreign-user disclosure due now; if an app-store release is ever planned, Apple's third-party-beneficiary paragraph must be added to Terms §15 first (founder note #8 in the Terms draft). **Counsel flag:** the live Terms (published May 7, 2026; `src/app/legal/terms/page.tsx:142`) name Monroe County courts, while both drafts name Marion County (Terms §13). Pick one before anything is published.

**6. Which of these hand-run process promises are safe to make?**
*Why:* one person performs each with no tooling; a missed promise is worse than none.
*Default:* export by email within 30 days, only to the sign-in address (Privacy §9c); "we aim to look at every report within 7 days" as an aim, not a guarantee (Privacy §9b, Terms §6); breach notice "without unreasonable delay and within the time Indiana law requires", with no number of days stated and a [REVIEWER] marker asking you to confirm Ind. Code 24-4.9 timing (Privacy §10); email-only appeal, no data restoration (Terms §7); copyright takedown by email, no registered DMCA agent (Privacy §11, Terms §4); a reserved right to read messages to check for violations, not only on a report (Privacy §5e, Terms §6).
*If different:* any can be dropped or reworded; windows can become "no fixed time", the DMCA agent registered before publishing, and proactive reading narrowed to "only on a report or legal request".

**7. Is our notice that club officers can see followers enough?**
*Why:* following a club is one tap and feels passive, but the club's owner and admins can see each follower's name and profile card, when they first followed, and how; on an invite-only club that list names the students it courted. Officers can also remove a follower — but not a member, whose follow ends only with the membership — without telling them.
*Default:* the line "Officers can see who follows this club." next to Follow on request-to-join and invite-only clubs, plus Privacy §5f. No line on open clubs, and no notice on removal (Privacy §5f, §8; Terms §8).
*If different:* showing the line on every club, or notifying a removed follower, is a small code change plus a Privacy §5f update.

## Facts you can rely on without checking (verified in the code, September 7, 2026; school email, campus, club and post-edit facts re-checked September 17, 2026)

- **Checkbox:** "I'm 18 or older and I agree to the Terms of Service and Privacy Policy." — required; signup disabled until checked; existing users get a full-page re-consent screen.
- **Consent record:** version, server timestamp, 18+ attestation, source — on the user row and in an append-only, server-only ledger; nothing else captured; deleted with the account. Minimum-age constant 18; no date-of-birth field. The version constant is still `2026-05-07` and must become `2026-09-07` in the same deploy as the new pages, or nobody is re-prompted. Any change to the live pages needs `TERMS_VERSION` (`src/lib/legal/terms.ts:1`) bumped in the same deploy, and each bump re-prompts all 20 accounts (S54).
- **Login:** any sign-in email; verification accepts only @iu.edu and @purdue.edu (and subdomains); @iupui.edu and IU's other retired domains are refused with a message pointing to @iu.edu; @pfw.edu and @pnw.edu are not accepted; one school address per account (unique in the database), and verifying at the other university switches the account's university; the email proves the university, and the student picks the campus (changeable once every 30 days after onboarding); email confirmation on; password minimum 8 characters; no two-factor.
- **Deletion:** typed-handle confirmation; purges profile, post, poster and logo files, resumes and redacted copies, clips, and media on messages the user still has; then deletes the login and every user-keyed row. Nulled, not removed: org owner, report reporter, channel "added by", join-request "resolved by", club invite "invited by" and "resolved by". Club follows, first-follow dates and invites received are deleted. Purge failure means nothing is deleted. No grace period, no undo, no database backup (Supabase Free plan, per supabase.com/pricing, September 7, 2026).
- **Resumes:** private bucket; only signed-in, mutually unblocked users, via 5-minute links; non-owners get a server-rendered copy with redaction bars burned in; owner keeps the original; no recruiter role.
- **Public exposure:** logged-out visitors to `/profile/<handle>` get the full card minus resume fields; photos, banners and post images sit on non-expiring public links; org pages, with recent posts and who posted them, are readable without an account, for every club except hidden ones, including invite-only clubs; a club's follower count is public only at 5 or more.
- **Clubs, campus and post edits:**
  - Following a club is open to any signed-in user; the database lets only the student and that club's owner/admins read the follow.
  - Members follow automatically. An officer's removal is silent and reversible, and the first-follow date survives it.
  - Club invites expire after 30 days; a decline blocks re-invites for 14 days.
  - Hidden clubs 404 for non-members (platform admins excepted) and nobody can start following one.
  - `users`, `events`, `rsvps` and published `posts` are readable by every signed-in user at every campus; campus is a relevance setting, not a boundary.
  - A post edit overwrites the text, re-derives tags, is stamped `edited_at` by a trigger when the post is published, and keeps no history. Database grants let a student change only a post's text, tags and draft status.
- **Vendors holding personal data:** Supabase, Vercel, Cloudflare (R2, DNS, hello@ forwarded to a Gmail inbox), Resend, Sentry (identifying defaults off; user id never attached); browsers also contact Google Fonts and cdnjs. No analytics, advertising or AI vendor; Otto is in-house code.
- **Not in the code:** ban/suspension flag, handle reservation, identity check on display names (free text, 120 characters), CSRF cookie, IP geolocation, automated export, moderation queue, post edit history, a copy of the reported text inside a report. Live legal pages: unchanged since May 7, 2026, still say Monroe County.

*Not for you:* [DECISION] markers that are product or code choices (comment deletion, message-media cleanup, private-org posts, retention windows, PDF-viewer loading, an operator deletion tool) are the founder's; see "Notes for the founder" #3 in the Terms draft.
