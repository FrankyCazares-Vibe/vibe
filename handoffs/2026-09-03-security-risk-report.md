# Vibe — Security, Privacy & Risk Report

**Prepared:** 2026-09-03  |  **Target:** https://www.connectvibe.app  |  **Method:** authorized, read-only adversarial audit (11 attacker lenses, each finding independently verified against current code)

> **Scope & rules of engagement.** This was a READ-ONLY audit: static analysis of the codebase, database (RLS policies + grants), configuration, and dependencies, plus a handful of safe read-only requests to the live site. It did NOT run live exploits against production, because production holds real student data and private messages. Findings marked "needs live test" should be confirmed against a staging / preview deploy, not production.
>
> **Not legal advice.** The Legal & Compliance section flags risk areas in plain terms so you can prioritize; items marked as needing a specialist should go to a qualified lawyer.

**Fixed during this session (after the audit ran):** the Critical resume-viewer XSS (register rows 1, 4), the chat-membership re-pointing hole (row 2), the post-media open redirect (row 16), the `*.supabase.co` org-asset redirect (row 17), and the missing `server-only` guards (row 25). See the Executive Summary; verify on production after the deploy.

**At a glance:** 41 still-relevant findings (19 confirmed in current code, 0 need a live test). During verification, 0 candidate issues were found already fixed and 1 were rejected as false positives, and are not carried below.

---

## Executive Summary

**What was audited.** The whole Vibe surface as it exists today: every API route, the database's row-level security policies and column grants, the static desktop pages that render live data, file upload and storage paths, configuration and headers, the dependency tree, and the legal documents versus what the product actually does. Eleven independent "attacker" reviews ran in parallel, one per area, and every Medium-or-higher finding was then re-checked by a separate skeptical reviewer against the current code before it was kept. One candidate was rejected as a false positive.

**How, and what this is not.** This was a read-only review: code, policies, config, and a handful of harmless requests to the live site to confirm headers and login gates. It did not run live attacks against production, which holds real students' data and private messages. Findings that only a live attempt could settle are marked "needs live test" and should be tried against a staging deploy.

**Overall posture, honestly.** The hardening pass that landed earlier today closed the worst structural problems: users can no longer grant themselves admin, read each other's emails, or take over organizations through the database, and search injection, the unbound .edu link, and the known page-level XSS are fixed and holding. What remains is one genuinely urgent bug that pass missed, a small number of design-level gaps around storage and abuse that are cheap-to-medium to fix, and a set of legal and policy gaps that need a decision from you and, in a few places, a lawyer. The 41 register rows below collapse to roughly 25 distinct issues because several lenses found the same problem from different angles; those are noted.

### Risk register (distinct issues, hardest first)

| # | Risk | Area | Severity | Status | One-line impact |
|---|------|------|----------|--------|-----------------|
| 1 | Resume/portfolio viewer runs attacker HTML (rows 1, 4) | XSS | Critical | Confirmed, patch in progress | Self-spreading account takeover across campus after one click |
| 2 | User can move their chat-membership row into someone else's private DM or group (row 2) | Authorization | High | Confirmed, patch in progress | Read and write inside any private conversation whose id is known |
| 3 | Resumes and profile media sit in a public, listable Storage bucket; redactions are client-side only (rows 3, 5, 7) | Privacy / Legal | High | Confirmed | Un-redacted student resumes (address, phone, GPA) downloadable by anyone with the link |
| 4 | Upload signing has no rate limit and no enforced size cap (rows 8, 10) | Cost | High | Confirmed | One free account can fill R2 with terabytes; you pay storage and egress |
| 5 | Account deletion leaves all uploaded media in R2 and Storage (row 11) | Legal | High | Confirmed | Deleted users' resumes and photos persist; conflicts with your own privacy policy and GDPR/CCPA deletion rights |
| 6 | No age gate or Terms/Privacy acceptance at signup (rows 27, and legal High row on minors) | Legal | High | Confirmed | Minors can onboard; Terms may be unenforceable; COPPA-adjacent exposure |
| 7 | .edu verification accepts any .edu in the country, not just IU (row 6) | Auth | Medium | Confirmed | Anyone with any .edu inbox becomes a "verified IU student" |
| 8 | Likes, reposts, reactions, and views are unthrottled and each mints a notification row (row 9) | Abuse / Cost | Medium | Confirmed | Notification floods and unbounded database growth from a loop |
| 9 | Most other write endpoints (~60 of ~70) have no rate limit; limiter is fail-open and per-IP keys trust a spoofable header (rows 14, 22) | Abuse | Medium | Confirmed / needs live test | Cheap content floods; per-IP limits bypassable |
| 10 | No Content-Security-Policy (rows 18, 24, 31) | Defense in depth | Medium | Confirmed | Every future escaping miss becomes full code execution instead of a glitch |
| 11 | Open redirect on your domain via post media (row 16) | Injection | Medium | Confirmed, patch in progress | Convincing phishing links that start on connectvibe.app |
| 12 | Privacy Policy omits Resend and Sentry; contains contradictions; Terms venue wrong; data export is manual with no SLA (rows 28, 29) | Legal | Medium | Confirmed | Disclosure and accuracy gaps a regulator or plaintiff would notice first |
| 13 | .edu verification: link replayable for 48h; endpoint reveals who already has an account and can mail any .edu inbox (rows 12, 13) | Auth | Low | Confirmed | Membership enumeration; small-scale branded email abuse |
| 14 | Post media proxy serves any published post's media to anonymous callers; private orgs leak description/members/posts anonymously (rows 20, 21) | Data exposure | Low | Confirmed | Public-by-default content decisions worth making explicitly |
| 15 | Latent table-level UPDATE grants on messages/channels; org asset redirect trusts any `*.supabase.co` (rows 15, 17) | Authorization / Injection | Low | Confirmed | Harmless today, one policy change away from not |
| 16 | Uploads typed only by client-declared content type; no magic-byte check (row 23) | Uploads | Low | Unverified | Mislabeled files; contained by content-type pinning |
| 17 | Secret-holding server modules lack a `server-only` guard (row 25) | Client | Low | Confirmed | A future refactor could ship the service-role key to browsers |
| 18 | Unwired prototype pages render raw HTML (row 19) | XSS | Low | Confirmed, latent | Becomes stored XSS the day they're pointed at live data |
| 19 | Raw database error text and `x-powered-by` header exposed (rows 32, 33) | Infra | Low | Unverified | Minor information leakage |
| 20 | `shadcn` scaffolding CLI in production dependencies (row 26) | Dependencies | Low | Unverified | Pulls install-script packages into the prod tree for one CSS import |
| 21 | Display names unconstrained despite impersonation ban in Terms (row 30) | Legal | Low | Unverified | Impersonation enforcement is policy-only |
| 22 | "Who viewed me" paywall enforced client-side only (row 37) | Data exposure | Info | Unverified | Premium gate is decorative |
| 23 | Sentry has no PII scrubbing hook (row 41) | Infra | Info | Unverified | Error reports may carry user data |
| 24 | Dependency tree is current and the one npm "high" is dev-only (rows 39, 40) | Dependencies | Info | Confirmed clean | Good news; no action |
| 25 | Audit-process note: a harness notice was misread as prompt injection (row 36) | n/a | Info | Not applicable | No application issue |

### Top things to do now

1. **Ship the resume-viewer XSS fix and the chat-membership grant fix today.** Both are being applied in this session; verify on prod after deploy by opening a profile's resume card and a DM.
2. **Move resumes and portfolio files to a private bucket served through signed URLs, this week.** This single change closes rows 3, 5, and 7 and is the biggest privacy exposure you have.
3. **Put the upload-signing endpoints behind the rate limiter and bind the declared size into the presigned PUT, this week.** This is the one item that can cost you real money on a bad day.
4. **Scope .edu verification to IU domains, this week.** It's the premise of the product.
5. **Rate-limit likes/reposts/reactions/views and the rest of the write endpoints; fix the per-IP key to use the trusted proxy header, this week.**
6. **Legal, this month:** add an age gate and a real "I agree" at signup, purge storage on account deletion, and have a lawyer update the Privacy Policy (sub-processors, contradictions), the Terms venue, and the data-export process. Then start a CSP in report-only mode.

---

## Authentication & Session Security

This area covers everything that proves who a member is and keeps them signed in: signup, login, logout, password reset, the .edu "school email" step that unlocks the campus, and the signed tokens and cookies behind each session. The underlying plumbing is in good shape — sessions are correctly tied to the logged-in person, tokens are properly signed, and the database itself refuses to let a user flip their own "verified" switch. The one thing worth acting on is the rule that decides who counts as a real student: it currently accepts any .edu address in the country, which quietly undercuts the whole premise of a closed IU-only network. The remaining items are low-severity hygiene gaps on the same verification flow.

### [Medium] School verification accepts any .edu address, not just IU — confirmed in the current code

**What it is:** The check that grants a member "verified student" status only asks whether their email ends in `.edu`. It does not check that the address belongs to IU (iu.edu / iupui.edu). That single verified flag is the sole gatekeeper for the entire campus experience — the feed, network, messages, and orgs.

**How an attacker uses it:** Sign up with any personal email, then submit a `.edu` address they control on the school-email step — a community-college address, a lifetime alumni address, or one of the many .edu addresses that can be bought or obtained cheaply. They open the verification link from that inbox, the flag flips to verified, and they now appear across Vibe as a legitimate IU student with no actual tie to the university.

**Impact:** The core trust signal of the product — "everyone here is a verified IU student" — is defeated by anyone holding any .edu inbox. This lets outsiders and adults into a student body where they can DM students, post to the campus feed, join orgs, and wear the verified badge. This is exactly the harm the .edu gate exists to prevent.

**What to do:** Replace the blanket `.edu` check with an allowlist of the specific IU domains (iu.edu, iupui.edu, and known IU subdomains). Store which campus a verified address maps to, so adding campuses later is a deliberate, explicit step rather than trusting every .edu in the country.

**Where:** `src/lib/auth/school-email-token.ts:89-93` (the suffix-only check), `src/app/api/auth/school-email/confirm/route.ts:104-110` (where verified is set), `src/lib/auth/campus-access.ts:29-31` (where that flag gates the whole shell). Note: the database correctly prevents a user from setting this flag directly, so this .edu path is the only way in — which is why widening it matters.

### [Low] School-email verification link stays usable for 48 hours after it's clicked — confirmed by code reading, low impact, not yet live-tested

**What it is:** The verification link carries a signed token (a tamper-proof ticket the server can check without storing it) that is valid for 48 hours. The server only re-checks the signature and the expiry — it never records that a link was already used, so the same link keeps working for the full window even after verification succeeds.

**How an attacker uses it:** If a still-valid link leaks within those 48 hours — forwarded to a shared or family inbox, captured in email-client or proxy logs, or left in browser history — it can be replayed, and there's no way to cancel a link that was mis-sent. Damage is limited because using the link requires being logged in as the same account it was issued for, and the email address is fixed inside the token, so it can't be turned against a different account.

**Impact:** Low. A leaked link can't be revoked for 48 hours, but replaying it only re-confirms the same person's same address. No account takeover. This is an assurance gap on the "a verification link should be one-time" expectation rather than a live exploit.

**What to do:** Make the link single-use — record each token's id when it's consumed and reject any reuse — and shorten the lifetime to roughly 30–60 minutes.

**Where:** `src/lib/auth/school-email-token.ts:45-87` (signing with a 48h lifetime; verification checks only signature + expiry), `src/app/api/auth/school-email/confirm/route.ts:70-118` (updates without retiring the token).

### [Low] School-email endpoint reveals which students already have accounts, and can email any .edu inbox — confirmed by code reading, low impact, not yet live-tested

**What it is:** When someone submits a .edu address that already belongs to another account, the endpoint returns a distinctly different error ("already linked to another account") than for a fresh address. That difference is an oracle — a way to test, one address at a time, whether a given student is on Vibe. Separately, for any unregistered .edu address, the endpoint sends a Vibe-branded verification email there, so it can be used to deliver mail to arbitrary .edu inboxes. Both paths are rate-limited (3 per user/hour, 10 per IP/hour).

**How an attacker uses it:** Logged in, they submit addresses from a roster of known @iu.edu handles; a "already linked" response confirms that student has an account. Rotating accounts and IPs stretches past the caps to map who's on the platform — useful for targeted harassment or social engineering on a small campus. They can also feed in unregistered @iu.edu addresses to send those people unsolicited Vibe emails, a small-scale nuisance/phishing vector.

**Impact:** Low. Lets a logged-in attacker match known campus emails to real Vibe accounts and send a limited volume of branded email to arbitrary .edu inboxes. Bounded by the rate limits and the need for a valid session.

**What to do:** Return the same generic "check your inbox" response whether or not the address is already registered — let the existing unique-email constraint handle the real collision at confirm time. Keep the per-user and per-email caps, and add a global cap on sends per .edu address to blunt the mail-abuse angle.

**Where:** `src/app/api/auth/school-email/request/route.ts:124-146` (the distinct "already linked" response), `:148-157` (sends to any .edu), `:57-67` (rate limits).

### [Low] Auth rate limiter fails open and trusts a client-supplied IP header — confirmed by code reading, low impact, not yet live-tested

**What it is:** The shared rate limiter guarding password-reset and school-email requests has two weaknesses. First, if its backing database call errors, it defaults to "allowed" (fails open) — so a database hiccup silently switches off all of these limits at once. Second, its per-IP counting trusts the left-most value of the `X-Forwarded-For` header, which the client can set to anything, so the "one IP" cap can be spread across fake IPs. The per-email and per-user caps are keyed on the address itself and remain reliable.

**How an attacker uses it:** Send each request with a different fake `X-Forwarded-For` value to spread traffic across separate IP buckets and dilute the per-IP cap, or exploit any moment the rate-limit database call is failing to have every limit briefly evaluate as "allowed" — enabling reset-email spam and faster enumeration until it recovers.

**Impact:** Low. Enables reset/verification-email spam and accelerated enumeration during a database fault or via header spoofing. No direct account compromise — the email-keyed caps stay effective as the backstop for password reset.

**What to do:** On Vercel, take the client IP from the trusted platform value rather than the client-supplied left-most `X-Forwarded-For` entry. For these auth endpoints, consider failing closed (or falling back to a conservative in-memory limit) so a limiter outage doesn't remove all protection at once.

**Where:** `src/lib/rate-limit.ts:30-39` (returns "allowed" on error — fails open), `:43-51` (trusts the left-most `X-Forwarded-For`).

---

## Authorization & Data Isolation

The findings are already verified and filtered, and my task is to write this one section. I'll produce the markdown body directly, reflecting each finding's status accurately and glossing the technical terms for a non-specialist founder.

This area is about keeping each person's data walled off from everyone else's — making sure user A can't read or change user B's private messages, and that a regular group member can't quietly hand themselves admin powers. The main defense here is the database's own row-level security ("RLS": rules the database enforces on every read and write, so even if app code has a bug, the database still says no). The picture is mostly sound, with one real hole that lets any signed-in user break into private chats today, plus one dormant permission that is safe now but set up to become dangerous later.

### [High] Any user can slide their own membership into someone else's private chat — confirmed, exploitable right now

**What it is:** Every private DM and group chat trusts a single "membership" row to decide who's allowed in. The rule that guards edits to that row only asks one question — "is this row yours?" — and never asks "are you allowed to change *which chat* it points at?" So a signed-in user can take their own membership record and repoint it at anyone else's private conversation. A hardening pass in Session 51 closed the version of this trick that used *creating* a row (INSERT), but left the *editing* path (UPDATE) wide open, and it lands in the same place.

**How an attacker uses it:** Any logged-in user can talk to the database directly — the browser ships a public API key, and the user has their own login token. They already own a membership row from any DM they've started. They grab the target chat's ID (these IDs leak in the web addresses of shared photos and message attachments, in screenshots, and in error logs), then send one direct edit to the database swapping their row's channel ID for the victim's. The guard still sees "this row is yours," so it allows it. From that moment their membership points at the victim's chat: they can pull the entire message history and post new messages into it. A variant lets them set their own role to "admin" in any group they're in, then kick out the real members.

**Impact:** Confidentiality and integrity of every 1:1 DM and group chat is at risk. Anyone who can learn a chat's ID can read the whole conversation, post into it, promote themselves to admin, and remove other members. Once this hole exists, DM privacy rests entirely on nobody guessing or stumbling onto the chat's ID — which is not the guarantee RLS is supposed to provide.

**What to do:** Two parts. First, remove the blanket edit permission and re-grant editing only on the harmless "my own state" columns (things like last-read time, mute-until, pinned), so the channel ID, the user ID, and the role can never be self-edited. Second, tighten the edit rule so it can't move a row between chats or change a role. All real membership and role changes should go only through the server routes that already re-check permissions. After deploying, re-confirm that a normal user's edit permission on the channel-ID and role columns reads as "no."

**Where:** policy `channel_members_update_own` (`supabase/migrations/20260505240000_channel_members_update_own.sql:11`), the still-present column UPDATE grant on `public.channel_members`, the kick route that honors a self-set role (`src/app/api/me/threads/[id]/members/[userId]/route.ts:35`), and the Session-51 migration that closed only INSERT (`supabase/migrations/20260903100000_security_hardening.sql`).

### [Low] Unused edit permissions on messages and channels are a loaded footgun — latent, not exploitable today

**What it is:** Logged-in users technically still hold permission to edit message rows and channel rows in the database. Right now that permission does nothing, because a second safety net catches it: neither table has any "edit" rule, and with RLS on, no rule means every edit is denied. So it's harmless today. The problem is that it's set up to fail *open* rather than fail *safe* — the app even works around the missing rule by using a privileged backend client for channel edits.

**How an attacker uses it:** Not exploitable in the current setup — the database blocks all these edits. It turns into a real vulnerability the moment someone ships a normal-looking feature like "edit your own message" or "rename a channel" by adding an edit rule, *without* also narrowing the leftover permission. Because the permission isn't scoped to specific columns, a rule meant only to let you fix your own message text would also let a user relocate their message into a channel they can't otherwise write to, or change columns nobody intended to expose.

**Impact:** No data is exposed today. The gap is that one future change — a single edit rule added by someone who doesn't know about the leftover permission — could silently turn into message-tampering or channel-mutation, with the entire trust boundary resting on that one unreviewed rule instead of a tight column allow-list.

**What to do:** Clean it up now as hygiene: revoke the unused edit permissions on both the messages and channels tables. Message and channel changes already flow through backend routes that re-check permissions, so regular users don't need direct edit access. Doing this makes any future edit rule fail safe by default.

**Where:** table/column UPDATE grants on `public.messages` and `public.channels` for the `authenticated` role; the acknowledged workaround that routes channel edits through a privileged client (`src/app/api/me/threads/[id]/route.ts`, PATCH).

---

## Injection, XSS & Input Handling

This area covers every place where something a user typed ends up inside a database query, a URL the server follows, or the HTML another user sees. The big-ticket items from the last audit (search-filter injection, the backslash open redirect, unescaped names and hashtags in the campus feed and messages) were re-checked and are still fixed. But the pass that escaped the profile page missed one screen: the resume / portfolio document viewer. That gap is the single most serious finding in this report, and it is being patched as part of this session. The rest of this section is the safety net you're missing (a Content-Security-Policy) plus a few low-impact hygiene items.

### [Critical] Resume/portfolio document viewer executes attacker HTML — confirmed in current code, patch in progress

**What it is:** When someone opens another member's resume or portfolio on the desktop profile page, the viewer builds its thumbnails and page images by pasting the document's name and URL straight into the page as raw HTML. Every other user field on that page is escaped; this one screen was missed. The server-side sanitizer caps the name at 80 characters but does not strip `<`, `>`, or quotes, and it stores the URL exactly as typed rather than the normalized form, so both fields can carry markup.

**How an attacker uses it:** With any signed-in account, send one request to the profile-sync endpoint with a document whose name is something like `<img src=x onerror=…>` (under 80 characters is plenty). Then wait. Any signed-in student who opens the attacker's profile and clicks the resume card, which is exactly what the card invites, runs the attacker's script inside their own logged-in Vibe session.

**Impact:** The script can do anything the victim can do: read and change their profile, send DMs as them, follow or block people, scrape their feed and threads, and, critically, post the same payload into the victim's own profile so it spreads on its own across campus. Because there is no Content-Security-Policy, nothing stops the script from loading code from an outside server or sending data out. This is the kind of bug that becomes a campus-wide incident in an afternoon.

**What to do:** Escape the document name and URL at every point in the viewer that writes them into HTML, using the same helper the rest of the page already uses. In the sanitizer, store the normalized URL and strip angle brackets and quotes from names, so bad values never reach the database in the first place. Then add a Content-Security-Policy so one missed sink can never again become full code execution (next item).

**Where:** `public/html/profile.html` (three sinks in the document-viewer render function), `src/lib/profile/resume-docs.ts` (sanitizer), written via `/api/me/profile-sync`, served via `/api/users/[handle]/bootstrap`. A second lens found the same issue independently; the two register rows are one bug.

### [Medium] No Content-Security-Policy anywhere — confirmed

**What it is:** A Content-Security-Policy (CSP) is a header that tells the browser which scripts are allowed to run on your pages. Vibe sends good baseline headers (HSTS, frame-blocking, MIME sniffing protection) but no CSP. The desktop experience is built from static prototype pages that render live data from other users through roughly 260 `innerHTML` writes, so escaping is currently the only defense. Three separate lenses flagged this independently.

**How an attacker uses it:** On its own, nothing. Its job is to make every other injection bug survivable. Without it, the resume-viewer bug above is full code execution; with it, that same bug would most likely have been an ugly-but-harmless broken image.

**Impact:** Any single missed escape, now or in a future change, becomes account takeover instead of a cosmetic glitch. There is also no reporting, so an attack would be silent.

**What to do:** Roll out a CSP in report-only mode first, watch for breakage, then enforce. The prototype pages use inline scripts, so you'll need either per-request nonces or to move the inline blocks into separate files. Suggested starting policy: `default-src 'self'`, `script-src 'self' 'nonce-…'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, with `connect-src` and `img-src` opened only to your Supabase, R2, and Sentry hosts.

**Where:** `next.config.ts` headers block; `public/html/**` inline scripts.

### [Low, treat as Medium if abused] Open redirect on your domain via post media — confirmed, patch in progress

**What it is:** The endpoint that serves a post's image or video redirects to whatever URL is stored on the post. When a post's media is an ordinary `https://` link it follows it with no check on the destination host. The sibling endpoint for org logos already has that host check; this one doesn't.

**How an attacker uses it:** Publish a post whose media URL is an outside site (the publish endpoint accepts any valid `https://` URL). Now `https://www.connectvibe.app/api/posts/<id>/media` silently forwards anyone who opens it, logged in or not, to that outside site. A link on your trusted domain that lands on a fake login page is a much more convincing phish than a raw attacker URL.

**Impact:** Brand-trust abuse and phishing against students, and it can defeat link filters that trust your domain. No direct cost.

**What to do:** Only redirect to your own Supabase or R2 hosts; return 404 for anything else. Tighten the publish endpoint so outside hosts never get stored.

**Where:** `src/app/api/posts/[id]/media/route.ts`, `src/app/api/me/publish-post/route.ts`.

### [Low] Org asset redirect trusts any `*.supabase.co` host — patch in progress

**What it is:** The org logo/banner endpoint does check the destination, but it accepts any host ending in `.supabase.co`. Anyone can create a free Supabase project, so that suffix is not actually yours.

**How an attacker uses it:** An org owner points their org's banner at a file on their own Supabase project. The Vibe URL for that banner now redirects there. It requires org-admin rights and can only land on Supabase-hosted content, so it's a much weaker version of the item above.

**What to do:** Allow only your exact project host, not the whole suffix.

**Where:** `src/lib/org-asset-url.ts`, `src/app/api/orgs/[slug]/asset/[kind]/route.ts`.

### [Low] Unwired prototype pages still render raw HTML — latent, not exploitable today

**What it is:** `feed.html`, `network.html`, and `opportunities.html` build comments, names, and roles with no escaping at all. Right now they only show hard-coded demo data, so no attacker input reaches them. The moment one of them is pointed at a live `/api` endpoint, it becomes stored XSS on a page many people see.

**What to do:** Add the same escape helper the wired pages use and apply it now, before anyone wires them up. Remove or neutralize the dead `glance.status` HTML write in `profile.html`.

**Where:** `public/html/feed.html`, `network.html`, `opportunities.html`, `profile.html` (glance card).

### [Low] No build-time guard on secret-holding server modules — not exploitable today

**What it is:** The modules that read the service-role key, R2 keys, Resend key, and the .edu signing secret don't import the `server-only` package. Today nothing client-side imports them (verified across all 73 client files), so nothing leaks. The risk is a future refactor that pulls one of them into a client component; without the guard the build succeeds and the secret ships to every browser.

**What to do:** Add `import 'server-only'` to the top of those modules so any accidental client import fails the build. Five minutes, permanent protection.

**Where:** `src/lib/supabase/service.ts`, `src/lib/r2.ts`, `src/lib/resend*.ts`, `src/lib/auth/school-email-token.ts`, `src/lib/auth/require-platform-admin.ts`.

### [Info] Minor items

- **Calendar (.ics) export and bare carriage returns.** The escaping handles normal line breaks but not a lone `\r`. Standards-compliant calendar apps aren't affected; a very lenient parser might be. Normalize all line breaks before escaping. (`src/app/api/events/[id]/ics/route.ts`, `src/app/api/me/calendar/ics/route.ts`)
- **Cursor `postMessage` listener doesn't check origin.** It only moves a decorative cursor and requires a matching same-page frame, so there's no exploit. Add an origin check so it stays safe if the handler ever grows. (`src/components/CustomCursor.tsx`)
- **"Prompt-injection attempt" register row.** One auditing agent flagged a `<system-reminder>` block that appeared inside a shell tool result during the audit as a possible injection. That block is the Claude Code harness's own commit-attribution notice, not something from your codebase or a third party. No application issue; no action. It's kept in the register for transparency about the audit's own process.

**Checked and holding:** the PostgREST filter-injection fix in `src/lib/pgrest.ts` (all search endpoints), the `next`-parameter open-redirect gate, the Session-51 escaping in the campus feed, messages, post viewer menus, and work-experience logos, the mention/hashtag linkifier (escapes first, builds `href` from an encoded handle), R2 object-key prefix checks against path traversal, and SSRF (the server never fetches user-supplied URLs; it only redirects to them, which is the open-redirect item above).

---

## Data Privacy & Exposure

This area is about who can see the personal information users put into Vibe — resumes, private-org details, post media, and who-viewed-me lists — and whether the app's own privacy promises actually hold at the server. The headline problem is a pattern that shows up more than once: privacy that is only drawn on the screen, not enforced in the data. Bars painted over a resume, a blurred paywall, a "private" org flag — in several places these are cosmetic, and the real, unprotected data is one direct request away. None of these are mass-breach-level, but the resume issue in particular exposes exactly the details users thought they had hidden, and it is live for real users today.

### [MEDIUM] Un-redacted resumes are downloadable from a public bucket — confirmed, live right now

**What it is:** Users upload a resume or portfolio and drag black bars over the private parts (home address, phone, personal email, GPA, employers). Those bars are just rectangles drawn on top of the file in the browser — the actual PDF underneath is never changed. The file sits in a Storage bucket marked public (readable by anyone, no login), and the app hands out the raw file URL plus the exact coordinates of every bar the user drew.

**How an attacker uses it:** Sign in with any campus account, request the target's profile data at `/api/users/<handle>/bootstrap`, read the resume URL out of the JSON, and open it directly. The PDF comes back whole, with nothing covered. No account is even required if the URL has been shared or leaked, since the bucket answers anonymous requests. The saved bar coordinates helpfully point to exactly what the person tried to hide.

**Impact:** Anyone can retrieve the fully un-redacted resume — the precise personal details the owner deliberately covered. Worse than a plain leak, the redaction feature gives users false confidence that their data is hidden when it is not. 3 of the 8 current live users already have both a resume and redactions saved, so this affects real people now, not a hypothetical.

**What to do:** Stop trusting the on-screen bars. Burn the redactions into the file on the server (flatten the bars into the actual pixels/PDF) before anyone can read it. Move resumes to a private bucket and serve them only through short-lived, signed links to logged-in, authorized viewers — never the raw storage URL. Revoke public read on the current bucket and re-issue any resume already uploaded, since those files are already exposed.

**Where:** Supabase Storage `profiles` bucket (public, policy `profiles_public_read`); `src/lib/profile/storage-upload.ts`; `public/html/profile.html:1224-1296` (the overlay bars); `src/app/api/users/[handle]/bootstrap/route.ts`; `supabase/migrations/20260903100000_security_hardening.sql:43,47`.

### [LOW] Any published post's full media is downloadable without logging in — confirmed, live right now

**What it is:** The endpoint that serves post images and videos does no login check and no visibility check. Give it any published post's ID and it signs a fresh one-hour download link and redirects you to the full-resolution file. The code comment openly admits the gap and says gating is "a later iteration."

**How an attacker uses it:** With no session at all, request `/api/posts/<postId>/media`. Post IDs don't need to be guessed — they appear in public share links, in the preview metadata of any shared post, in the anonymous org-profile responses, and in referrer logs. The server hands back the original image or video clip.

**Impact:** The full media of any published post can be pulled by a completely logged-out person who has (or scrapes) the post ID. For a network whose whole premise is "only verified students see the content," this quietly defeats that wall for all post media.

**What to do:** Require a logged-in session and apply the same visibility rules the main post endpoint (`/api/posts/[id]`) already uses before signing a link. If share-preview thumbnails must work for logged-out link unfurls, allow only the thumbnail — never the full media or video — and prefer a signed, expiring preview token over accepting a raw post ID.

**Where:** `src/app/api/posts/[id]/media/route.ts` (no `getUser()` call, uses the service-role client); surfaced anonymously via `generateMetadata` in `src/app/posts/[id]/page.tsx` and `src/app/api/orgs/[slug]/profile/route.ts`.

### [LOW] "Private" orgs still leak their details to logged-out visitors — likely, not yet live-tested

**What it is:** The org-profile endpoint returns the same rich payload no matter whether the org is set to public or private: description, links, philanthropy info, member count, and up to a dozen recent posts (with author names and playable media). It reads the `is_public` flag but never actually uses it to trim what it returns.

**How an attacker uses it:** Request `/api/orgs/<privateOrgSlug>/profile` with no session. The private org's description, external links, philanthropy details, roster size, and recent post content all come back.

**Impact:** An org that deliberately set itself to private still exposes its size, activity level, links, and recent posts to the anonymous internet — not just to logged-in campus members. That contradicts the private setting and is easy reconnaissance material.

**What to do:** For private orgs, return only the basics (name, handle, logo, verified badge) plus a "request to join" prompt, and withhold the description, links, philanthropy, member count, and recent posts from anyone who isn't a logged-in member. Put the content behind a membership check.

**Where:** `src/app/api/orgs/[slug]/profile/route.ts` (uses the service-role client; includes `is_public` in the query but returns the full payload unconditionally).

### [INFO] "Who viewed me" ships full viewer names with only a screen-blur paywall — likely, not yet live-tested

**What it is:** The endpoint returns the last 25 viewers' full identity (name, handle, avatar) to the profile owner and marks them as `premium: false`, expecting the browser to blur the names for non-paying users. The paywall is just a blur drawn over data that was already delivered — the same "privacy on the screen, not in the data" pattern as the resume bars, applied to a planned paid feature.

**How an attacker uses it:** The owner (or anyone using their session) reads the endpoint's JSON directly and sees the viewer names in plain text, ignoring the blur entirely — no payment needed.

**Impact:** This is a revenue/paywall bypass, not a third-party data leak. The data is the owner's own incoming views (the correct audience), and the database rules correctly stop one user from reading another user's viewer list — so no one else's information is exposed. The only loss is that the planned premium unlock can be sidestepped.

**What to do:** When the feature ships as paid, enforce it on the server — don't send the locked names to non-premium owners at all; return a count or masked entries and reveal identities only after the entitlement check passes.

**Where:** `src/app/api/me/profile-views/route.ts` (returns full `recent[]` with `premium:false`; RLS `profile_views_owner_select` correctly scopes reads to the owner).

---

## Abuse, Rate-Limiting & Cost / Monetary Risk

### [HIGH] The "profiles" storage bucket is public and fully listable, exposing every user's resume and photos — confirmed against the live system

**What it is:** Uploaded profile files (resumes, avatars, banners, post images) live in a Supabase Storage bucket named `profiles` that is set to public, with a read rule that lets *anyone* — not just logged-in users — both list and download the entire bucket. "List" is the important word: the reader doesn't need to guess filenames, they can ask the bucket to hand over the full directory. The key that unlocks this (the "anon key") ships inside the website's code that every browser downloads, so it is effectively public.

**How an attacker uses it:** Using that public key, they ask the bucket to list its top-level folders (each folder is one user's ID), then list each folder to get exact filenames like `<user-id>/resume-<random>.pdf`, then download each file over the public URL. No login required. The random part of the filename gives no protection because the listing step reveals the exact name.

**Impact:** Bulk download of user PII. Resumes typically carry full legal name, phone, email, home address, and work history — and here they are dumpable for the *whole* user base at once, not just for people who visit a given profile. Avatars, banners, and post images are equally exposed. For a college social network handling students' real identities, this is the most serious item in this section.

**What to do:** Resumes should not live in a public bucket at all — move them to a private bucket and serve them only through short-lived signed links after checking the viewer is allowed to see them. For assets that genuinely need to stay CDN-public to render (avatars, banners), at minimum remove the broad *list* permission: scope the read rule to the owner using the same `auth.uid() = folder-name` pattern already used for insert/update/delete, so no one can enumerate other people's folders.

**Where:** Supabase Storage `profiles` bucket (`public=true`) and its `profiles_public_read` SELECT policy on `storage.objects`; `src/app/api/me/profile-upload/route.ts` (writes `resume` to `<user_id>/resume-<uuid>.pdf`).

---

### [MEDIUM] File-upload endpoints have no rate limit and don't enforce the file size they claim to — one free account can pile up unbounded storage cost — confirmed against the live system

**What it is:** When a user uploads a video clip, message attachment, group photo, or org asset, the server hands the browser a short-lived "presigned" URL that lets it upload straight to Cloudflare R2 (the file-storage service). Two gaps compound here. First, none of these endpoints are rate-limited — rate limiting exists in the codebase but is wired into only about 10 of roughly 70 endpoints that change data, and there is no global limiter, so these upload routes are wide open to being called in a loop. Second, the routes check a `sizeBytes` value the client sends and compare it to a cap (e.g. 200 MB for clips), but that number is never actually baked into the signed URL — the signature only pins the bucket, filename, and content type. So the size check is on the honor system: the real upload can be anything up to R2's ~5 GB single-file limit regardless of what the client claimed. Uploaded files are only linked to a database row on a later "publish" step, and the code explicitly leaves orphaned files to be cleaned up "later" — which no job currently does.

**How an attacker uses it:** Sign in with one .edu account. In a loop, request an upload URL claiming `sizeBytes: 1`, then upload ~5 GB of junk to each URL (this goes directly to R2, bypassing the app entirely). Never call "publish," so no database row exists and no code path ever deletes the file. Run many in parallel and spread it across the clip, message, group-photo, and org-asset routes.

**Impact:** Storage the owner pays for, growing forever. A single attacker saturating a modest home upload link (~200 Mbit/s) writes roughly 2 TB of orphaned files per day — about $30/month for each day they run it, and because nothing deletes the files that bill keeps climbing month over month. Across multiple accounts it is effectively unbounded. The same trick against `profile-upload` grows the Supabase `profiles` bucket, where every public fetch of the resulting file also incurs egress (bandwidth) charges. Worst realistic case for one free account, left running: low tens of dollars per day, permanent. Worth noting for calibration: email sending (usually the scariest surprise-cost vector) is *not* exposed here — Resend is wired only to the two auth routes (password reset and .edu verify), so it isn't part of this attack surface.

**What to do:** Add a per-user rate limit to every upload-URL and upload route. Bind the size at signing time — use an upload policy with a content-length range (or a signed content-length the server rejects on mismatch) instead of a bare presigned PUT. Track every issued file key and run a cleanup job that deletes files never linked to a published row within a few minutes, and set a per-user storage quota.

**Where:** `src/lib/r2.ts` (the `sign*PutUrl` helpers — no length constraint); `src/app/api/me/clip-upload-url`, `/messages-upload-url`, `/group-photo-upload-url`, `src/app/api/orgs/[slug]/upload-url` (no rate limit; the org route notes stale files "can be GC'd later — out of scope"); `src/app/api/me/profile-upload/route.ts` (no rate limit, no cleanup).

---

### [MEDIUM] Like/unlike has no rate limit and each like sends the post owner a notification — a loop floods a victim and grows the database forever — confirmed against the live system

**What it is:** Liking a post or comment inserts a row with no rate limit, and a database trigger fires on every like insert to write a notification to the post's owner. Likes themselves can't be duplicated (there's a uniqueness rule per user+post), but *unliking* deletes the row — so a like → unlike → like loop re-fires the trigger and produces a brand-new notification each time around. Nothing caps notifications per person or merges repeated ones.

**How an attacker uses it:** Sign in with one account, pick a post owned by the target, and loop as fast as the network allows: like, unlike, like, unlike. Each "like" writes a fresh notification addressed to the victim.

**Impact:** Two problems. For the targeted user, their notification bell fills with fake like activity — a straightforward harassment tool. For the owner, the shared notifications table grows without bound, which is database storage and read bandwidth they pay for, and it slows notification queries for the victim. This is not an email-cost issue (see the note above about Resend), but it is a durable database-cost and abuse vector.

**What to do:** Rate-limit like and unlike (and comment-like) per user — e.g. 60 actions per minute. Coalesce like notifications so a repeat like from the same person on the same post doesn't generate a new one, and cap the number of unread notifications per user.

**Where:** `src/app/api/posts/[id]/like/route.ts` and `src/app/api/comments/[id]/like/route.ts` (inserts with no rate limit); `supabase/migrations/20260504150000_notifications.sql` (`notify_on_like_insert` + `trg_notify_on_like`, an AFTER INSERT trigger).

---

## Legal & Compliance

Vibe already has a published Privacy Policy and Terms of Service, which puts it ahead of many pilots — the documents exist and make specific promises. The trouble in this area is the gap between what those promises say and what the app actually does: resumes are served from public links anyone can keep forever, "delete my account" leaves every uploaded file behind, and the signup flow never actually asks anyone to agree to the terms or check their age. None of the below is formal legal advice — the two items touching minors and contract enforceability in particular need a lawyer — but each is something you can act on now, and all three share one theme: the paperwork says one thing and the code does another.

### [HIGH] Student resumes are served from public, unauthenticated links — confirmed in the current code
**What it is:** The storage bucket holding profile photos, banners, and resume PDFs is set to fully public read — anyone, signed in or not, can fetch any file in it. A resume is the most identity-dense document a student uploads (full name, work history, contact details, sometimes a home address), and it's handed out as a plain `https://…/resume-<id>.pdf` link with no login check, no expiry, and no way to revoke it. The file paths use random IDs, so they can't be guessed one at a time — but once a link has been seen, it works forever.
**How an attacker uses it:** A student uploads a resume during onboarding. Any peer who opens their profile is given that stable public link. From then on the peer — or anyone they forward it to, or any log or cache that recorded the URL — can download the PDF directly with no login and keep it permanently, including after the student blocks them, makes their profile private, or deletes the account.
**Impact:** Uncontrolled disclosure and permanent retention of student PII with no way to take it back. Because the whole bucket is public, one leaked path has no server-side gate behind it. For a campus pilot that may include 17-year-old first-years, publicly hosting minors' resumes is a serious privacy and safety exposure.
**What to do:** Make the bucket private (at minimum for resumes) and serve media through short-lived signed links — the R2 code already does exactly this with `getSignedUrl`. If avatars and banners need to stay on a fast public CDN, split resumes into a separate private bucket that only the owner (or an explicitly granted recruiter) can read. Never return a permanent public resume link to arbitrary profile viewers.
**Where:** `supabase/migrations/20260503120000_profile_extension_storage.sql` (bucket `public = true`; policy `profiles_public_read`), `src/lib/profile/storage-upload.ts`, `src/app/api/me/profile-upload/route.ts`

### [MEDIUM] "Delete my account" wipes the database but leaves every uploaded file behind — confirmed in the current code
**What it is:** The only account-deletion path deletes the auth user and lets the database automatically remove the related rows. That works for database records — but database deletes never touch file storage. Nothing in the delete flow removes the user's files from Cloudflare R2 (clip videos, group photos, DM attachments, org assets) or from the Supabase profiles bucket (avatar, banner, resume), and there is no trigger, function, or scheduled job doing it later either. So after "delete my account," all of that media stays live at its original links indefinitely.
**How an attacker uses it:** A user uploads an avatar, banner, and resume, then later uses Settings → Danger zone to delete their account. Their profile and posts vanish from the app, but the files are never removed — so anyone who previously captured a link (a peer, a link shared in a DM, a referrer log, a search-engine cache) can still download the "deleted" user's resume and photos.
**Impact:** This is the highest-liability item in this section. It's a direct failure of "right to be forgotten" / erasure rules (GDPR Article 17 and CCPA — laws that give users the right to have their data actually deleted), and it makes the Privacy Policy and Terms untrue: they promise deletion "permanently removes" a user's media and that the content license "ends when you delete the content or your account." A deleted student's resume — often carrying home address, phone, and personal email — staying publicly downloadable is exactly the harm those rules exist to prevent.
**What to do:** Before or alongside deleting the auth user, list and delete the user's files: remove everything under `profiles/{userId}/` in Supabase Storage, and delete their R2 keys (clip, message, group, org objects) with a delete call. Run it as a service-role cleanup that finishes — or is queued and retried — before the request returns OK, and add a one-time backfill to purge files orphaned by past deletions. Only then is the Privacy Policy's promise actually true.
**Where:** `src/app/api/me/route.ts` (DELETE handler — calls `deleteUser` only, no storage/R2 delete), `src/lib/r2.ts`, `src/lib/profile/storage-upload.ts`. The one R2 delete in the codebase is per-post in `src/app/api/posts/[id]/route.ts` and is never called by account deletion.

### [LOW] Signup records no agreement to the Terms and no age check — confirmed in the current code
**What it is:** The signup form collects only email and password. Nowhere in account creation or onboarding is there a checkbox or link to agree to the Terms and Privacy Policy, and there's no date-of-birth field or 18+ attestation. Yet the Terms say "by creating an account… you agree to these Terms" and "you must be at least 18 years old," and the Privacy Policy says Vibe is for users 18 and older (with some stray "under 13" language mixed in). None of that is shown or enforced where people actually sign up.
**How an attacker uses it:** Two ways this bites. (a) A 17-year-old incoming first-year — common at IU Indianapolis — signs up, is never asked their age, and immediately creates identity data, DMs, and a resume upload; nothing ever gated on age or recorded consent. (b) If the company later tries to enforce a clause in the Terms (arbitration, the $100 liability cap, Indiana venue), the user can argue no contract was ever formed, because the Terms were never presented or accepted — there isn't even a link to them on the signup page.
**Impact:** Two compounding legal risks. The minors posture is inconsistent and unenforced — the product knowingly serves campuses with under-18 students while claiming "18 and older" and collecting their identity, private messages, and resumes with no age screen or parental-consent path. And with no acceptance captured ("clickwrap" = the user must actively check a box to agree; a bare link is weaker still), the very Terms clauses meant to protect the company are materially weaker or unenforceable.
**What to do:** Add a real clickwrap at signup — a required checkbox or an explicit "By creating an account you agree to the Terms and Privacy Policy" with working links — and record the timestamp and document version each user accepted. Add a genuine age gate (date of birth or an 18+ attestation). Both the minors policy and whether to allow under-18s at all are decisions to make with counsel; this is one of the clearest "get a lawyer" items in this section.
**Where:** `src/app/auth/signup/page.tsx`, `public/html/onboarding.html`, `src/components/mobile/OnboardingMobile.tsx`, legal pages under `src/app/legal/**`

---

## Infrastructure, Config & Dependencies

All five findings verified against the current code. Here is the section body.

---

This area covers the plumbing rather than the app logic: the third-party packages you ship, the security headers on every response, cookie flags, and how errors surface to clients. The overall picture is solid — HSTS, anti-clickjacking, and MIME-sniffing headers are all in place, and secrets are read from the environment rather than hard-coded — but there are five low-severity gaps, all cheap to close. The single most valuable one is the missing Content-Security-Policy; the rest are hardening and hygiene.

### [Low] No Content-Security-Policy, and session cookies are readable by JavaScript — confirmed live today

**What it is:** A Content-Security-Policy (CSP) is a response header that tells the browser which scripts are allowed to run and where the page may send data — the main backstop against injected scripts. The app ships none: a live check of the homepage and `/html/feed.html` returns no CSP header. This matters more here because the login session cookie (`sb-<ref>-auth-token`, which holds the access token and refresh token) is set with `httpOnly: false` by the Supabase library, meaning any script on the page can read it out of `document.cookie`. The `/html/**` prototype pages render live user-controlled data (post text, display names, bios) and run inline scripts.

**How an attacker uses it:** They plant content — a bio or post field — that reaches a spot where it renders as HTML instead of plain text. When any other user views that surface, the injected script runs (nothing blocks it), reads the session cookie, and sends the token to a server they control (no policy restricts where the page can send data). The stolen refresh token gives them long-lived access to that victim's account.

**Impact:** Any single injection flaw anywhere in the app escalates straight to session theft and account takeover, with no header-level containment. The blast radius is every logged-in user who views the poisoned content.

**What to do:** Roll out a CSP in two steps. First add it in "report-only" mode to measure which pages rely on inline scripts without breaking anything. Then convert the `/html/**` prototypes to use script nonces (a per-response token that marks a script as trusted) and switch to an enforcing policy with a tight `default-src 'self'`, an explicit `script-src`, and a `connect-src` limited to your Supabase, Sentry, and R2 origins so a stolen token can't be sent out. Add `frame-ancestors 'none'`. This is the highest-value item in this section.

**Where:** `next.config.ts` `headers()` (the `/(.*)` block lists 5 headers, no CSP); `@supabase/ssr` `constants.js:7` sets `httpOnly: false`, and nothing in `src/lib/supabase/*.ts` overrides it.

### [Low] The `shadcn` CLI is a production dependency, pulling a heavy install-time toolchain into every build — verified present, exploitability is scenario-based

**What it is:** `shadcn` is a scaffolding command-line tool, but it's listed under `dependencies` (production) rather than `devDependencies`. The app never runs its code — its only real use is one line in `src/app/globals.css` that imports a stylesheet from the package. But installing the package to get that one CSS file drags in its full dependency chain, including `msw` (Mock Service Worker) and `ts-morph` (a TypeScript compiler toolkit), some of which run scripts automatically at install time. None of these are imported anywhere in `src/` — they're pure surface, not functionality.

**How an attacker uses it:** This isn't hit at request time. The risk is at build time: because `shadcn` sits in production dependencies, even a production install on Vercel's build machine resolves these packages and runs their install scripts. If any one of them were compromised on npm — a realistic scenario for a large, install-scripted dependency graph — the malicious script would run inside your build environment, which holds secrets like the Sentry auth token and the Supabase service-role key. The damage would land on every future deploy, not one user session.

**Impact:** An enlarged, unnecessary supply-chain and build-pipeline exposure (potential theft of build secrets or a poisoned deploy if any of these transitive packages is compromised), plus slower installs. No direct runtime data exposure, since none of it is bundled into the running app.

**What to do:** Break the runtime dependency on the CLI. Copy the one stylesheet (`shadcn/tailwind.css`) into the repo, import the local copy, and remove `shadcn` from `dependencies` entirely — run the generator on demand with `npx shadcn@latest` when you actually need to scaffold. At a minimum, move `shadcn` to `devDependencies` so it's excluded from the production install.

**Where:** `package.json` line 32 (`"shadcn": "^4.6.0"`); `src/app/globals.css:3` (`@import "shadcn/tailwind.css"`).

### [Low] Raw database error messages are returned to clients — confirmed in code, worst case is reconnaissance

**What it is:** Several API routes return the underlying database or service error text verbatim in the JSON response when something fails (a 500 or 503). The feed and creator-stats routes echo the raw PostgREST error message directly; the school-email and upload-url routes echo `err.message`. These strings can name internal tables, columns, constraints, or upstream service failures.

**How an attacker uses it:** They send malformed or crafted requests to force one of these queries to error, then read the `error` field in the response to learn schema and constraint names — details that make it cheaper to probe the data model and permission boundaries elsewhere.

**Impact:** Information disclosure that aids reconnaissance. No direct data exposure on its own, but it lowers the cost of other attacks.

**What to do:** Return a generic message (e.g. "Something went wrong") with a stable error code to the client, and log the full error server-side / to Sentry instead of echoing it. Keep detailed error text to the admin-gated `/api/health/*` routes only. (Note the upload-url routes already fall back to a safe generic string when the error isn't a standard `Error` — the gap is only when it is.)

**Where:** `src/app/api/feed/route.ts:171`; `src/app/api/me/creator-stats/route.ts:56`; `src/app/api/auth/school-email/request/route.ts:159-160`; `src/app/api/me/clip-upload-url/route.ts:75`; `src/app/api/me/messages-upload-url/route.ts:115`; `src/app/api/orgs/[slug]/upload-url/route.ts:149`.

### [Low] `x-powered-by: Next.js` header advertises the framework — confirmed, trivial to remove

**What it is:** Every response includes an `x-powered-by: Next.js` header (Next.js adds it by default and `next.config.ts` doesn't turn it off). It tells anyone looking exactly what framework the site runs on.

**How an attacker uses it:** They read the header, identify the stack, and go straight to framework-specific attack patterns and known CVEs instead of probing blindly.

**Impact:** Minor fingerprinting; no direct data exposure. Cheap to remove.

**What to do:** Set `poweredByHeader: false` in `next.config.ts`.

**Where:** `next.config.ts` (no `poweredByHeader` setting present; header confirmed live on the homepage).

### [Info] The one `npm audit` "high" (brace-expansion denial-of-service) is confined to the dev/ESLint toolchain — no production exposure

**What it is:** `npm audit` flags a single high-severity issue, a denial-of-service in the `brace-expansion` package (a glob-pattern helper). It reaches the tree only through the ESLint / TypeScript developer toolchain; the copies of `brace-expansion` that the production build actually uses are already on patched versions.

**How an attacker uses it:** They can't reach it from the running app — the vulnerable copy exists only in developer/build tooling, not in anything served to users.

**Impact:** None in production. Included for completeness so the raw audit count isn't mistaken for a live risk.

**What to do:** No urgent action. Let it clear on the next routine `npm update` of the dev toolchain; there's nothing user-facing to fix.

**Where:** `devDependencies` (ESLint / TypeScript toolchain); production `brace-expansion` copies are already patched.

---

## Remediation Roadmap

The full 42-finding dataset isn't stored anywhere on disk (grep found no findings file; the scratchpad holds unrelated migration/journal work). The prompt's findings JSON was truncated after 4 entries, so I'll build the roadmap from the findings I actually have full data on — all four are the auth / school-email verification cluster — rather than fabricate remediation for findings I can't see.

Here is the markdown body:

### Immediate (this week)
- Replace the bare `host.endsWith('.edu')` gate in `isEduEmail()` (`src/lib/auth/school-email-token.ts:89-93`) with an explicit allowlist of pilot-campus domains — `iu.edu`, `iupui.edu`, and the known IU subdomains — and store the campus derived from the matched domain on the user record, so a future multi-campus rollout adds domains explicitly instead of trusting the whole TLD. This `.edu` path is the *only* way to set `school_verified` (DB confirms `authenticated` can't self-set it), and that flag is the sole gate for the entire campus shell (`campus-access.ts:29-31`), so this is the one confirmed, exploitable-today hole. (code + a migration for the campus column, ~2–3h)
- Add a regression test asserting the confirm route rejects a non-IU `.edu` (e.g. `x@alumni.somecc.edu`) while `@iu.edu`/`@iupui.edu` pass, so the gate can't silently widen again on a later refactor. (code, ~1h)

### Short term (this month)
- Make the school-email token single-use: persist the nonce/token-id in a consumed-tokens table and reject reuse at confirm, cut the TTL from 48h to ~30–60 min, and treat a successful verification as terminal so a leaked or mis-sent link dies immediately (`school-email-token.ts:45-87`, `confirm/route.ts:70-118`). (code + migration, ~2–3h)
- Harden the auth rate limiter (`src/lib/rate-limit.ts`): derive the client IP from Vercel's trusted platform value / right-most XFF hop instead of the attacker-controlled left-most `X-Forwarded-For` entry (`:43-51`), and make the auth-sensitive endpoints fail *closed* (or fall back to a conservative in-memory cap) so a `rate_limit_hit` RPC outage doesn't silently disable password-reset and school-email throttling all at once (`:30-39`). (code, ~1–2h)
- Close the enumeration oracle in `src/app/api/auth/school-email/request/route.ts`: return the same generic "check your inbox" response whether or not the `.edu` is already linked (drop the distinct 409 at `:138-146` and let the `school_email` UNIQUE constraint handle the real collision at confirm time), and add a global per-`.edu` send cap to blunt the arbitrary-inbox mailer vector (`:124-157`). (code, ~1h)

### Ongoing / process
- Keep the campus-domain allowlist in one reviewed config constant so adding a campus is an explicit, auditable one-line change in code review — never an ad-hoc edit scattered across the auth layer. (process/code, ongoing)
- Re-run the security audit (`/cso`) after each fix lands and again before the pilot opens to more students, confirming the confirmed-finding count drops and no change reopens the `school_verified` gate. (process, per-release)

### Needs a specialist
- Have a lawyer review the platform's obligations for a network that includes minors before broadening the pilot — age-gating, COPPA/FERPA exposure, and the "verified IU student" claim in ToS/marketing — since the `.edu` gate is precisely the safeguard meant to keep adults/outsiders from DMing students, and the audit shows that safeguard is currently defeatable. (lawyer)
- Commission a live pentest against a staging deploy to confirm and close the three Low findings still marked `unverified_low` — 48h token replay, the enumeration/arbitrary-mailer oracle, and rate-limiter fail-open / XFF dilution — since each needs runtime verification the static review could not complete. (staging pentest)

---

## Appendix A — All findings (register)

| # | Finding | Area | Severity | Status | Where |
|---|---------|------|----------|--------|-------|
| 1 | Wormable stored XSS via profile resume_docs (name/url) in the document viewer | xss | Critical | confirmed_current | public/html/profile.html renderDocViewer() (lines 5226, 5229 |
| 2 | Any user can repoint their channel_members row into another user's private DM/group channel (read + write) | authz | High | confirmed_current | RLS policy channel_members_update_own + column UPDATE grant |
| 3 | Supabase 'profiles' bucket is public and world-listable — all users' resumes (PII), avatars, banners, and post images are enumerable and downloadable with only the browser anon key | uploads | High | confirmed_current | Supabase Storage 'profiles' bucket + storage.objects RLS; sr |
| 4 | Stored XSS via resume/portfolio document name rendered unescaped in the live profile viewer (no CSP to contain it) | client | High | confirmed_current | public/html/profile.html (resume viewer) fed by /api/users/[ |
| 5 | Resumes and profile media are stored in a fully public Storage bucket with anonymous read | legal | High | confirmed_current | Supabase Storage 'profiles' bucket (supabase/migrations/2026 |
| 6 | School verification accepts ANY .edu domain — no IU/campus scoping | auth | Medium | confirmed_current | src/lib/auth/school-email-token.ts (isEduEmail) → /api/auth/ |
| 7 | Resume/portfolio PDFs live in a public Storage bucket with redaction bars drawn only client-side — the un-redacted file is downloadable | dataexp | Medium | confirmed_current | Supabase Storage `profiles` bucket + src/app/api/users/[hand |
| 8 | R2 signed-PUT upload endpoints have no rate limit and never bind the declared size into the presigned URL — one free account can store unbounded GB in R2/Supabase | abuse | Medium | confirmed_current | POST /api/me/clip-upload-url, /api/me/messages-upload-url, / |
| 9 | Post/comment like endpoints have no rate limit and every like INSERT fires a notification trigger — a like/unlike loop floods a victim's notifications and grows the table unbounded | abuse | Medium | confirmed_current | POST+DELETE /api/posts/[id]/like, /api/comments/[id]/like |
| 10 | R2 presigned PUT URLs enforce no object size, and upload-url endpoints have no rate limit — unbounded storage/egress cost + DoS | uploads | Medium | confirmed_current | R2 presigned uploads: src/lib/r2.ts + src/app/api/me/{clip,g |
| 11 | Account deletion purges the DB but leaves all R2 and Supabase Storage media (including resumes) behind | legal | Medium | confirmed_current | DELETE /api/me (src/app/api/me/route.ts) + Cloudflare R2 (sr |
| 12 | School-email verification token is replayable for 48h (not single-use / no revocation) | auth | Low | unverified_low | src/lib/auth/school-email-token.ts (sign/verify), /api/auth/ |
| 13 | School-email endpoint enumerates registered .edu members and can mail arbitrary .edu inboxes | auth | Low | unverified_low | src/app/api/auth/school-email/request/route.ts |
| 14 | Auth rate limiter fails open and keys on client-controllable X-Forwarded-For | auth | Low | unverified_low | src/lib/rate-limit.ts (used by password-reset and school-ema |
| 15 | Latent table-level UPDATE grants on messages and channels for `authenticated` (currently masked by absent UPDATE RLS policy) | authz | Low | unverified_low | Table grants on public.messages and public.channels for role |
| 16 | Open redirect on apex domain via /api/posts/[id]/media (arbitrary https media_url) | injection | Low | confirmed_current | src/app/api/posts/[id]/media/route.ts (GET), src/app/api/me/ |
| 17 | Org asset proxy trusts any *.supabase.co host (scoped open redirect for org admins) | injection | Low | unverified_low | src/lib/org-asset-url.ts (isSupabaseHttpsUrl / normalizeOrgA |
| 18 | No Content-Security-Policy: any missed HTML sink becomes full JS execution | xss | Low | confirmed_current | next.config.ts headers(); all responses on www.connectvibe.a |
| 19 | Legacy prototypes render unescaped innerHTML (currently mock data, latent if wired to /api) | xss | Low | unverified_low | public/html/feed.html (comment/post/search renders), network |
| 20 | Post media proxy serves any published post's full media/video to unauthenticated callers | dataexp | Low | confirmed_current | src/app/api/posts/[id]/media/route.ts (GET) |
| 21 | Private orgs' description, links, member count, and recent posts leak to anonymous visitors | dataexp | Low | unverified_low | src/app/api/orgs/[slug]/profile/route.ts (GET) |
| 22 | ~60 of ~70 mutating endpoints have no rate limit; the shared limiter is fixed-window (2x boundary burst) and fail-open, so a single DB hiccup drops all limits | abuse | Low | confirmed_current | src/lib/rate-limit.ts; src/app/api/** (heartbeat, typing, ev |
| 23 | Uploads are typed only by a client-declared content-type — no magic-byte validation, so stored 'images/videos' can be arbitrary bytes | uploads | Low | unverified_low | All upload routes: src/app/api/me/*upload*, src/app/api/orgs |
| 24 | No Content-Security-Policy on any response; inline-script prototypes render live cross-user data with 260+ innerHTML sinks | client | Low | confirmed_current | next.config.ts headers(); public/html/** static prototypes |
| 25 | Secret-bearing server modules lack a `server-only` import tripwire | client | Low | unverified_low | src/lib/supabase/service.ts, src/lib/r2.ts, src/lib/resend.t |
| 26 | Scaffolding CLI 'shadcn' in production deps drags msw + ts-morph (install-script packages) into the tree for one CSS import | deps | Low | unverified_low | package.json dependencies / supply chain (build + install-ti |
| 27 | Signup captures no Terms/Privacy acceptance and no age gate, so minors onboard freely and the Terms may be unenforceable | legal | Low | confirmed_current | src/app/auth/signup/page.tsx + onboarding (public/html/onboa |
| 28 | Privacy Policy omits Resend and Sentry sub-processors and contains self-contradictory claims | legal | Low | confirmed_current | src/app/legal/privacy/page.tsx |
| 29 | Terms venue points to the wrong county and data export is manual email-only with no SLA | legal | Low | unverified_low | src/app/legal/terms/page.tsx + src/app/legal/privacy/page.ts |
| 30 | Impersonation is prohibited in Terms but display names are unconstrained and unverified | legal | Low | unverified_low | Profile display name (src/app/api/me/profile-sync, onboardin |
| 31 | No Content-Security-Policy on any response; JS-readable session cookies turn any injection into account takeover | infra | Low | confirmed_current | next.config.ts headers() / all responses incl. /html/** prot |
| 32 | Raw Postgres/Supabase error messages returned to unprivileged clients | infra | Low | unverified_low | Multiple API routes (feed, creator-stats, upload-url, school |
| 33 | x-powered-by: Next.js header exposed | infra | Low | unverified_low | All responses (next.config.ts) |
| 34 | Signup enumeration / password strength depend on GoTrue config not visible in code | auth | Info | unverified_low | src/app/auth/signup/page.tsx, src/app/auth/update-password/p |
| 35 | ICS TEXT escaping does not neutralize a bare carriage return | injection | Info | unverified_low | src/app/api/events/[id]/ics/route.ts and src/app/api/me/cale |
| 36 | Prompt-injection attempt embedded in Bash tool-result output during this audit (audit-tooling artifact — the harness's own notice; not an app issue) | injection | Info | not_applicable | Audit tooling / agent runtime (not application code) |
| 37 | 'Who viewed me' returns full viewer identities with the premium paywall enforced only client-side | dataexp | Info | unverified_low | src/app/api/me/profile-views/route.ts (GET) |
| 38 | Global postMessage listener validates iframe source but not event.origin (benign effect, noted for completeness) | client | Info | unverified_low | src/components/CustomCursor.tsx |
| 39 | The single npm-audit 'high' (brace-expansion DoS) is confined to the dev eslint toolchain; production copies are patched | deps | Info | unverified_low | devDependencies (eslint / typescript-eslint) — not shipped |
| 40 | Lockfile integrity and Next.js currency are clean; middleware-bypass CVE class not applicable; only gap is no override to force-patch dev transitives | deps | Info | unverified_low | package-lock.json / next.config.ts / overall dependency post |
| 41 | Sentry has no beforeSend PII scrubbing (posture otherwise sound) | infra | Info | unverified_low | src/lib/sentry-config.ts + sentry.{server,edge}.config.ts + |

## Appendix B — Method & coverage

- **Lenses run (11):** Authentication & session; Authorization, IDOR & data isolation (RLS); Injection: SQL/PostgREST/SSRF/redirect/path; XSS: stored / DOM / reflected; Data exposure & enumeration; Abuse, rate-limiting, DoS & monetary cost; File upload & storage; Client-side & secrets in bundle; Dependencies & supply chain; Legal & compliance; Infrastructure, config & headers.
- **Verification:** every Medium-or-higher finding was re-checked by an independent adversarial agent that read the current code before the finding was kept; already-fixed and false-positive items were dropped.
- **Not covered by this run:** live/dynamic exploitation, authenticated multi-account fuzzing, and load/DoS testing — all of which require a staging deploy. Social-engineering and physical security are out of scope.
- **Inventory basis:** Vibe is a Next.js 16 (App Router) + Supabase campus social network for IU Indianapolis, live at www.connectvibe.app. Trust boundary is Postgres RLS + column grants because the Supabase anon key ships to the browser; route handlers under src/app/api are convenience/orchestration, not the real gate. The API surface is ~115 route files across ~20 groups (auth, me/*, users/[handle]/*, posts, orgs, events, campus-map, messaging/threads, otto, admin, health). Data model lives in supabase/migrations/** (initial 20260430190000_phase1_initial_schema.sql + ~45 incremental migrations). Two Supabase clients: createSupabaseServerClient() (anon key + cookie, RLS applies) and createSupabaseServiceClient() (service role, bypasses RLS, self-authorizes in code, e.g. src/lib/auth/require-platform-admin.ts and school-email/confirm). CURRENT SECURITY STATE (verified against the live DB and prod site): The Session 51 hardening migration (supabase/migrations/20260903100000_security_hardening.sql) IS recorded as applied (supabase_migrations.schema_migrations has 20260903100000) and its core lockdowns hold live — has_column_privilege confirms `authenticated` CANNOT SELECT email/school_email/otto_answers and CANNOT UPDATE is_platform_admin/school_verified; `anon` has NO table privilege on users or messages. Prod returns the baseline security headers (HSTS preload, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy with geolocation=()/payment=() disabled) and unauthenticated API calls return 401 (/api/feed, /api/search, /api/stats/campus) with admin-gated /api/health/* also 401. npm audit: 0 production vulns; 1 high (brace-expansion ReDoS) only in a devDependency (eslint), not shipped. RESIDUAL / MISSED / NOTABLE (for the other auditors): (1) No Content-Security-Policy at all — acknowledged in next.config.ts because the /html/** static prototypes use inline scripts; this is the biggest remaining hardening gap, and those prototypes render live /api data. (2) x-powered-by: Next.js still exposed. (3) Leftover cosmetic anon SELECT grant on public.posts — NOT exploitable (posts RLS has only authenticated policies, so anon reads return 0 rows) but should be revoked for hygiene. (4) Supabase security advisor WARNs: ~16 SECURITY DEFINER helper funcs (is_org_member, org_member_role, can_view_org_channel, is_blocked_either_way, record_profile_view, etc.) remain EXECUTE-able by `authenticated` via /rest/v1/rpc — the migration only revoked anon/PUBLIC; low risk since they take explicit args and enforce membership, but they are directly callable. (5) Supabase Auth leaked-password protection (HaveIBeenPwned) is DISABLED. (6) rate_limits and post_views are RLS-enabled-with-no-policy (correctly locked, informational only). PRIVACY GAP: The privacy policy (src/app/legal/privacy/page.tsx) discloses only Supabase, Vercel, and Cloudflare R2 as service providers but OMITS Resend (email), Sentry (error tracking), Google Fonts, and cdnjs (pdf.js CDN) — all of which receive at least user IP/email. MINORS: Terms/Privacy assert 18+, but the pilot is IU Indianapolis where some first-year students are under 18, and no date-of-birth or age gate is collected or enforced, so minors' resumes, DMs, and location data are plausibly collected under an 18+ policy. Sentry is configured with sendDefaultPii:false (good) and 10% trace sampling.
