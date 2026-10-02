# S72 prep: what is still owed (as of Fri Oct 2, 2026)

Notes file. Built up in small chunks while reading. Read-only research.

## Sources to read
- handoffs/2026-09-30-session-71-audit-chat-waves-1-2.md (2049 lines)
- handoffs/2026-09-30-session-70-chat-wave-2-cloud.md
- handoffs/2026-09-30-session-69-close-chat-wave-1-live.md
- handoffs/2026-09-29-session-68-close-and-chat-redesign.md
- handoffs/2026-09-28-session-67-waves-2-4-and-security.md
- handoffs/chat-redesign/wave-2-contracts.md (sections 14, 15, 17.x)
- handoffs/legal-2026-09-29/12-results.md
- handoffs/roadmap-2026-09-25/ (facts.md, roadmap-v8.html)
- memory notes

## Findings (appended as I go)

### From S71 handoff top (handoffs/2026-09-30-session-71-audit-chat-waves-1-2.md)
- Line 24 "Still owed after go-live": real-phone walk (17.9/17.10 lists); F10 on a device; wave-1 fixes M2-M5 + Support page Block wording (M1/F04); per-event Event-card cap; Report/Remove on text Board posts and replies before Oct 26 (17.2 L3); Terms v3 inputs.
- Line 35 not walked (Franky's phone): week-strip swipe vs iPhone edge-back, month sheet drag-to-close vs grid swipe, 320px phone.
- Part 1 small leftovers (line 54-60): Mac .env.local new keys (scripts against prod fail 401 until then); Vercel ANON row -> line 107 says "none (the ANON row is recreated as Config; Preview builds succeed)" so DONE; remove unused Vercel integration rows SUPABASE_ANON_KEY / SUPABASE_JWT_SECRET; reviewer pass over key-guard.ts never ran; watch signed-out pages. (Disclosure topic: SKIP per Franky.)
- Short list (119-168): M3, M4, M5, M2, M1+F04 wording (Apple reviewer sees flag OFF on Oct 16). Before Oct 26: F12-F17. Terms v3 inputs: wave-1 L3, L10; wave-2 F11, F40, F41, F42, F56. N1-N9 stand.
- Never use `supabase db push`: billing_stripe and push_notifications not applied on prod.
- Part 2 lows (now): L1 weekly chat health check unowned; L2 send one real DM photo + one SAE Lounge msg on prod; L4 wave-1 screens never opened in browser; L5 phone ?channel= open glitch; L6 Reply on Board in old screens; L7 report-this-chat on club room; L8 empty Board "say hi"; L9 old channel wording desktop; L10 officer meaning; L11 stale handoff note.
- Part 2 (wave2 tag): M6 1000-row cut (=F16), M7 Board unread lost (fixed by migration C? check), M8 desktop Campus>Chat has no Report/Delete + Officers room unreachable, M9 RSVP-then-join silent add, L12 cancel-event wipes chat no warning, L13/L14 suspended member visible, L15 leave event chat = cannot report, L16 sentinels + phone walk Oct 10-14 before Oct 15 freeze, L17 flag fn no test, L18-L20 admin queue context, L21-L30.
- N1 f2 hello@ mailbox, due Sun Oct 4, needs Franky's Resend key in Gmail.
- N2 f9 Android build due Fri Oct 9, blocked on Android SDK (Android Studio wizard); safe-area strip check.
- N3 paperwork: D-U-N-S (requested Sept 28, D&B case #11037991, check spelling 'CONNECTVIBE. LLC'), LLC amendment due Oct 3, EIN, Sept 26 meeting outcomes; then Apple ($99) + Google Play ($25) enroll; flag if no number by ~Oct 7; store submission Oct 16.
- N4 push off on prod; renumber push (+billing) migrations; apply push with Franky's yes before Oct 16.
- N5 f11 taken-down photos gone within 48h, by Oct 18; needs Supabase Pro decision by ~Oct 10.
- N6 wave 6: journal entries S67-S69 (now S70/S71 too), feature sentinel (none since Sept 9), memory tidy.
- N7 roadmap v14 published page never scrolled through (artifact 6QfJfD1QSPYu8qn9FvsRzi).
- N8 two S68 officer flows never hand tested: event Cancel/Edit on club page; officer Delete in phone post viewer.
- N9 S68 small known lows dropped (aria-current tabs, PickCampusStrip Night colours).

### From handoffs/chat-redesign/wave-2-contracts.md
- Sec 15 "After launch": the React desktop Messages page and the retirement of messages.html, _miniMessenger.js and Campus > Chat on desktop (this IS the "desktop version of the new chat" Franky asked for on Oct 2; contract parked it after launch). Also: non-member event rooms, custom rooms UI (3 per club), photos in club rooms, notification settings + push for board posts, "seen by", Realtime/typing, custom titles, phone create-club/create-event, message search, hide blocked in groups, Officers-room unread signal.
- Sec 14 open points with defaults taken: 14.1 officer Board-post exception (Franky to see the three tells with his own eyes before Oct 26: 17.5 item 23), 14.13 home search button not in v1, 14.14 Start a club on phone.
- 17.2 after-launch lines: L1 "You:" prefix on group rows (after Oct 15 freeze); L2 remove-route author-role read failing -> 503 (six lines; after freeze); L3 Report/Remove on TEXT Board posts + replies BEFORE Oct 26 (Apple guideline 1.2 mechanism); L5 old renderers' empty line; L6 home bloom halo (Franky's taste); L7 officer exception before any Apple review with flag ON; L8 comment tidy.
- 17.5: defaults taken for fonts line (800 weight kept), Retry ink kept, screenshots not squashed. Items 22-29 partially walked. Item 23 (three tells) not confirmed seen by Franky.
- 17.7 open: per-event or per-user cap on Event cards in POST /api/me/threads/[id]/cards (small; before Oct 26). Pin two more things in POST-CHECK (low).
- 17.8 open: inbox upcoming events shared limit (clubs.length*10) same bug class; messages SELECT policy cost measure at launch size; text send route accepts blank message / 500 on NUL; not covered by HTTP pass: reply_count null, 503 card tables, requireCanPublish on card POST, global switch off, vote race.
- 17.9 not walked: long-press on card, Take a spot, RSVP sheet, New sign-up + Share an event sheets, Board replies open + post, Officers room, club space in Light, flag-pending skeleton, keyboard on a phone, Safari, store apps (Capacitor), a real phone.
- 17.10: F10 NOT done (keyboard height in store apps; needs device). Not walked: Back while Posting, space closed under open sheet, Back while restored room loading, 60+ gap replace, keyboard, Android system Back, iPhone edge swipe. Open small: Board chip dot up to 20 s; short thread cannot un-pin; refreshOne no epoch.
- 17.11: week swipe + month sheet LIVE. Not walked: real finger vs iPhone edge-back, sheet drag-to-close vs grid swipe, screen reader, 320px phone, reduced motion. Open small: day outside strip reach; failed week keeps failure line 5 min; comment.

### From S70 cloud handoff (handoffs/2026-09-30-session-70-chat-wave-2-cloud.md; same file is on main now)
- Checklist: all Mac boxes done in S71 EXCEPT: "Before Oct 26: contract 17.2 L3"; "Window 2 (Oct 12-14): repairs, the flag-off walk repeated, the submission build; Oct 15 freeze; Oct 26 CHAT_V2_ALLOWLIST=*".
- Still open from before: f2 Oct 4; f9 Oct 9; paperwork; wave 6 journal + feature sentinel; f11 parked (no Supabase Pro); push dark on prod.

### From S69 close (handoffs/2026-09-30-session-69-close-chat-wave-1-live.md)
- Dated: demo days week of Oct 5; App Store submission Oct 16; freeze Oct 15; on for everyone Mon Oct 26.
- Wave 2 carry-overs still open: room/viewer re-read on every poll (K1, old screens); room_locked reserved-name sentence; demoted officer keeps Officers room by name (default leave); nested-button hydration warning in CampusMobile FeedCard.

### From S68 close (handoffs/2026-09-29-session-68-close-and-chat-redesign.md)
- "Desktop stays on today's chat with compat fixes for v1" (so desktop new chat was deferred by plan).
- Unanswered: OK to update the roadmap page (f10 done -> off the page)?
- Figma Starter (about 20 MCP calls/month), Mobbin needs paid plan.

### From S67 part 2 (handoffs/2026-09-28-session-67-waves-2-4-and-security.md)
- START HERE q's: Supabase Pro decided? paperwork; Sept 26 meeting outcomes ("settle at first Sunday meeting, Oct 4": pitch workshop, seven "how we work" lines).
- Item 4 before student launch: raise TRENDING_MIN_AUTHORS 1 -> 2 (src/lib/trending/count-tags.ts). Evidence-retention sweep before Sept 2027 (lawyer confirms period).
- Item 5 security follow-ups (none urgent at 20 users): EXIF on R2 uploads (chat, club, video); direct UPDATE grants on users.current_on/resume_*/department/website; last_active_at count RPC + revoke; channel_members settings columns; /api/me/handle word filter; look-alike letters; CSP + cookie hardening (~3 days); org-invite accept block re-check. Lists: handoffs/wave-plan-sec2/.
- Paperwork: D-U-N-S requested Sept 28 (case #11037991), due ~Oct 5, Apple sees ~Oct 7; enroll Apple $99/yr + Google Play $25; check spelling. James due Sat Oct 3: INBiz amendment adding Franky + Rylan as governing persons, principal office; say whether an operating agreement exists; then EIN; then Mercury bank.
- Not walked live: deleting a photo post removes files; replacing profile photo deletes old; moderator photo takedown on prod.
- Franky's to-do: share roadmap link w/ James+Rylan; Supabase Pro + leaked-password protection (~$25/mo, recommend yes); Lawyer via James (48h takedown wording vs cache, "up to a year" evidence retention, 17-year-olds, Vibe+ showing profile visitors, ambassadors marking ads); DMCA agent ($6, copyright.gov, James, by Oct 14); spending alerts on Vercel/Supabase/Cloudflare; Dependabot; Turnstile CAPTCHA key; decision: should accounts without a school email see student data at all?

### From handoffs/legal-2026-09-29/12-results.md (Terms v2 review STOPPED here, waiting on Franky)
- Needs from Franky: thoughts on the ten outcomes + the nineteen calls (table, each with a recommendation). Then a session writes v3, updates the companion, hands James the lawyer questions (10 new + 18 queued).
- Outcome 1: pre-registration takeover fix (code) "must be live before the first student invite"; landing page must stop saying "Sign up with your school email".
- Outcome 2: register with NCMEC now (process); change "delete its data" wording.
- Outcome 4: badge says "Student" -> "@iu.edu verified" (three strings, before Terms publish).
- Outcome 6: verified club can't be deleted in one click (code, cheap).
- Outcome 7: 48-hour intimate-image rota: one founder on duty daily, help@ + report queue morning/evening.
- Outcome 8: re-acceptance screen copy. Outcome 9: Privacy Policy rewrite (10 providers, not 3) same day as Terms. Outcome 10: "only one cofounder can reach your data" wording.
- Code before Terms publish (cheap): consent record survives deletion; sign out other devices on password change; password to delete account; RSVP needs verified school email; restricted account can't keep reading via API; verified club delete guard; URGENT subject on urgent report alerts; login-email ban key cleanup.
- Code before billing on: Vibe+ needs verified school email; cancel button on suspension notice; checkout confirmation email; Stripe renewal reminders; private viewing.
- Process now: NCMEC registration, help@ rota, intimate-image log, 2FA on every dashboard, dated security-fix log in repo, no founder verifies own club alone.
- Lawyer: insurance before launch, Franky's personal exposure as sole data-access person, how long to keep removed intimate image as evidence.
- Call 19: Supabase Pro before students arrive.

### From memory notes (launch plan, team, stripe, installable app)
- project_launch_plan.md: hard deadline end of Oct. Clubs before students: 10 signed -> profiles -> events -> demo days. Zero clubs signed (SAE is a test page); Rylan's first real signing = SAE; Rylan's 10 clubs due at Oct 23 check; >=3 Purdue. Paperwork chain: D-U-N-S -> Apple/Google ~Oct 7-9 -> Oct 9 decision day (no extensions) -> Terms ~Oct 14 (James) -> submit Oct 16 -> app links Oct 23 -> launch Oct 31; marketing 3 posts/week, launch night Thu Oct 29. Roadmap tasks: f9 Android Oct 9, f11 Oct 18, j8 LLC amendment Oct 3, j9 DMCA agent Oct 14, r8 two Instagram accounts + campus account names Oct 3 (check naming rule: no "IUI"/"PUI"), f12 chat redesign. Sept 26 meeting product asks (handoffs/2026-09-25-founders-meeting-product-notes.md): club member lists/roles/passing ownership, club badges on profiles, view-only events nearby campuses, Butler; "Build order is not yet confirmed". Roadmap republish rule: Artifact read first, rebuild from #page-source.
- project_team.md: LLC manager-managed; only James named; Oct 3 INBiz amendment adds Franky + Rylan, principal office; operating agreement exists? (ask James); D-U-N-S name spelling check; Business Entity Report due 05/31/2028; certified Articles validation link expires Oct 28.
- project_stripe_status.md: prod BILLING_ENABLED stays unset until (1) EIN + bank in LLC's name (James) and (2) Terms with subscription + auto-renewal wording published. Switch sandbox key to restricted key (rk_). billing_stripe migration not on prod.
- project_installable_app.md: push migration never applied to prod; needs Franky's yes + keys + PUSH_ENABLED + PUSH_ALLOWLIST on Vercel Production. Wave 3'b (asks + get-the-app + desktop QR) specified in plan section 8.7 (handoffs/wave-plan-pwa/plan.md); S3D link files; S4 kit; iOS aps.badge paused until wave 4. Real web subscribe/delivery is still a device test. Vibe+ invisible inside store apps; 18+.

### From memory notes (keys, moderation, legal, chat, security sequencing, marketing, vault)
- project_supabase_keys_s71.md: still open: Mac .env.local needs publishable + sb_secret_ key (scripts against prod 401 until then). Vercel ANON row: memory says open, but S71 handoff line 107 + line 12 (Preview of 57577c1 built) say recreated as Config = DONE; memory note is stale -> "memory tidy". (Disclosure: skip.)
- project_moderation.md: Terms not touched by moderation; 24-hour review commitment on Guidelines pages; Apple enforces 24h in guideline 1.2.
- project_legal_terms_v2.md: STOPPED at 12-results.md (commit d48ade0) waiting for Franky's thoughts; next = 02-terms-of-service-v3.md from defender Part 4 + his answers; update 03-companion.md. Terms must publish ~Oct 14 (James + lawyer) before students invited; publish bumps TERMS_VERSION and re-prompts everyone.
- project_chat_redesign.md: owed: real-phone walk, F10 on device, wave-1 fixes M2-M5, Support-page Block wording, Event-card cap, 17.2 L3 before Oct 26; Franky's real-finger test of week swipe/month sheet. Its description line is partly stale (flag IS set now).
- project_security_sequencing.md: before app-store submission: CSP, engagement throttles, proxy-trusted clientIp, Sentry PII scrub, live pentest against a Vercel preview (never prod), Apple prerequisites (in-app deletion, privacy labels, age rating). Sentinel per milestone.
- project_marketing_workspace.md: marketing work (landing copy research, demo video, teasers) belongs in ~/vibe-marketing; share via Artifact links.
- reference_obsidian_vault.md: ~/vault; Founder/Handoffs is a dir symlink to vibe/handoffs; Founder/vibe_journal.html symlinks to vibe/public/journal/vibe_journal.html (journal MOVED to vibe/journal/ in S68 -> that symlink is likely broken); Handoffs Index.md is hand-curated (likely stale since S48); vault not in git (no backup).

### Obsidian vault check (read-only look at ~/vault, Oct 2)
- ~/vault/Founder/Handoffs -> /Users/franciscocazares/vibe/handoffs : symlink WORKS (files show up).
- ~/vault/Founder/vibe_journal.html -> vibe/public/journal/vibe_journal.html : BROKEN (journal moved to vibe/journal/vibe_journal.html in S68).
- ~/vault/Founder/Handoffs Index.md last edited Sep 3: newest entry is session 52. Sessions 53-71 are not linked from anything.
- Only 1 of 73 top-level handoff .md files contains a [[wikilink]]. Handoffs point at each other with plain file paths in backticks, which Obsidian does not treat as links. So the graph shows them as loose dots. That is "why our things aren't connected".
- Inbox/, Product/, People/ are empty; Daily has 6 notes (last Sept 22). Memory notes (~/.claude/.../memory) use [[links]] but live outside the vault. Vault is not in git (no backup).
- Fix options (for next session, vault edits need Franky's go): repoint journal symlink; regenerate Handoffs Index (S53-S71) ; add a "Previous / Next / Related" wikilink footer to each new handoff; optionally symlink memory folder into vault.

### Landing page facts (handoffs/2026-09-25-marketing-pass-site-findings.md)
- Item 10: landing hero types for ~9 seconds; first seconds read just "I'"; on phones first screen is mostly empty dark space above "SCROLL".
- Item 2: landing sign-up card repeated the retired tagline (layout metadata fixed in S68 f10; check the card).
- Item 9: custom cursor dot sits at centre on load. Item 11: thin strip around auth gradient panel. Item 5: signed-out club pages show an error in Upcoming Events (401) -> should be empty state. Item 6: SAE page copy typos. Item 7: club creation is computer-only; demo-day prep. Item 4: Terms/Privacy say "clips" + "baseline draft" banner.
- Unconfirmed on a real phone: @mentions picker, group chat start from phone, Otto settings, app icon unread count.
- legal 12-results outcome 1: landing must stop saying "Sign up with your school email."

### Founders meeting product asks (handoffs/2026-09-25-founders-meeting-product-notes.md) - order NOT confirmed
- Before Oct 31 (recommended): club member list + roles + ownership transfer; club badges on profiles; (slim strip shipped S67).
- After launch: nearby campuses view-only; Butler.

### Roadmap v14 (handoffs/chat-redesign/roadmap-v14-published/page-final.html; live link claude.ai/artifact/6QfJfD1QSPYu8qn9FvsRzi)
Franky tasks:
- Working @connectvibe.app email that can send; one real test to help@ (by Sun Oct 4) = f2.
- Company Google account + Firebase now; Google Play developer account ($25) the day D-U-N-S arrives (~Oct 5), by Oct 9.
- 45-minute product walkthrough for James + Rylan + one-page "tough questions" sheet (Wk 1).
- Time how long a club takes on a phone from "yes" to live page with event; goal under 15 min (Wk 1).
- 3-line note every weekday morning; run the Sunday meeting (first: Oct 4; confirm pitch + seven lines + the 13 calls in Ch 12).
- Build Android once (by Fri Oct 9) = f9. Oct 9 = the store call (no extensions).
- Chat: no chat changes after Thu Oct 15; event chats + polls done by Wed Oct 14; on for everyone Mon Oct 26. "On a computer, chat stays as it is today until after launch."
- f11 photos gone in 48h by Sun Oct 18 (Supabase Pro ~$25/mo: "Not yet").
- Week 2: go through every screen a new student sees (keep or hide); first Campus 10 ideas session.
- Week 3 (Oct 12-18): speed test on a borrowed mid-range phone; tag trends only once two people use it; security check of what's built since Sept 27 before submit; notifications on for the three founders first (four setup steps, Apple's key needs the Apple account); submit both stores by Fri Oct 16.
- Week 4: Vibe links open straight in the app by Oct 23; walk the whole app as a brand-new student; officers' complaints fixed within 48h.
- Week 5: fixes only from Sun Oct 25; store badge up when listing live; chat on for all Oct 26.
- A backup name for the stores ("Vibe" probably taken): two backups with Rylan by Sun Oct 4.
James tasks: INBiz amendment (Sat Oct 3) + operating agreement answer; EIN after; one list to the lawyer (Terms changes by Oct 9: zero tolerance, 24h reports, 18+, subscriptions, Texas app-store age law; Privacy naming every service); pick bank (Mercury) after EIN; scoreboard (Fri Oct 2); first responder on help@ (24h); DMCA agent $6 by Oct 14; lawyer's final Terms + Privacy to Franky by Oct 12, live ~Oct 14.
Rylan tasks: email campus offices; list of 25 clubs; finish the pitch; 20-30 student interviews; sign SAE for real (Wk 1); five demo days booked for week 2 + first two "Building Vibe" posts (by Oct 4); first five Campus 10 names (Oct 4); two Instagram accounts + campus account names (Sat Oct 3); 5 clubs signed by Oct 11; club playbook by Sun Oct 11; 10 clubs w/ 3 events each by Oct 18; Oct 23 check: ten clubs live, at least three Purdue; launch night Thu Oct 29.
Asked at meeting, not built: club member list + roles + passing a club down (before Oct 23 check if they fit); club badges on profiles (else November).

### Code spot-checks (read-only, Oct 2) confirming items are still open
- M4: clear route has no club-room check (grep empty). M5: campus-home.tsx has 0 '/read' calls. M1: src/app/support/page.tsx:136-138 still says a block means "you stop seeing theirs" with no club-chat exception. M2: no migration after 20261001120000. 17.2 L3: BoardPost.tsx has no long-press hook on text branch. Event-card cap: none in cards/route.ts. TRENDING_MIN_AUTHORS still 1 (src/lib/trending/count-tags.ts:29). ~/Library/Android/sdk still missing (f9 blocked).
- git log: "ccce913 chore: rebuild the Preview after the Vercel env clean-up (S71)" => Vercel ANON row cleanup DONE. No commit for M1-M5.
- Working tree: untracked handoffs/chat-redesign/s71-walk/ (screenshots; decide commit or ignore).

### S71 audit Part 3, before-Oct-26 list and status
- FIXED in S71: F01, F02, F03, F05, F06, F07, F08, F09, F15 (migration C), F19, F22, F23, F39 (blank text), F58 (migration C), M7 (per-room previews).
- OPEN before Oct 26: F12 (removed message cannot be reported, no record), F13 (admin sees no poll options in report), F14 (@mention push opens club page not chat), F16=M6 (1,000-row cut in old inbox), F17 (Supabase Free 5 GB egress vs polling), F32 (vote on blocked person's poll), F33, F34 (home refreshes under open space), F35 (Light mode reaction chips), F36 (review accounts must never join SAE: write it into store notes), F37, F38 (admin Remove form says sender won't see reason but they do), F40 (Guidelines/Privacy silent on poll names), F54, F57 (measure DB traffic), F59 (=17.2 L3), F63, F64, F65.
- OPEN, device: F10 (keyboard height in store apps), F31 (checklist never opens new screens inside store apps), F72 (store apps locked to Light).
- OPEN, legal inputs: F11, F40, F41, F42, F56, F71 (account delete erases DM media even under open report vs delete-account page promise).
- F04 decision: officer Board post visible to a member who blocked the officer, even flag OFF, live at Oct 16 submission: fix Support wording now, decide exception before submission.
- F70: billing_stripe + push migrations unapplied on prod and sort before B: renumber before applying. Local migration list 20 behind (L30).
- F20: 38 KB extra for flag-off users (lazy-load built, untested). F21/F60/F61 informational.
- After launch: F18, F43-F51, F55, F66-F69, L31-L33, I11.
- Production plan fact: Supabase FREE plan (no backups; 5 GB egress).

### Store / submission leftovers (handoffs/2026-09-25-session-65-next-waves.md lines 73-110; S66 push-client :11-12, :84)
- S3D link files (apple-app-site-association + assetlinks.json): BLOCKED on Apple Team ID + Play SHA-256; live by Oct 23.
- S4 submission kit: App Privacy label + Play Data safety form, 18+ forms, review notes, screenshots from local seed, production review seed script (Franky runs it), last safe submit Fri Oct 16. BLOCKED on store accounts.
- Wave 4: /api/version + refresh toast, runbook, device checklist, store-app icon badge; at launch PUSH_ALLOWLIST=*.
- Security pass before submitting: both sentinels; pentest LOCAL stack only; block clause on post_comments / post_reposts / bookmarks insert policies (migration + Franky's yes).
- handoffs/stores/review-notes.md:38 tells review account 1 to join a live club: clashes with F36 (must not be SAE while SAE is in CHAT_V2_CLUBS).

### Desktop chat facts (for the "desktop version of the new chat" ask)
- Desktop chat today = public/html/messages.html (3,755 lines, static), public/html/_miniMessenger.js (1,055), and Campus > Chat inside src/app/campus/campus-home.tsx (ChannelChat from ~:15960).
- New phone chat = src/components/mobile/messages/{home,club,cards,compose}/ behind chat_v2.
- Plan of record: S68 close "Desktop stays on today's chat with compat fixes for v1"; contract sec 15 puts "the React desktop Messages page and the retirement of messages.html, _miniMessenger.js and Campus > Chat on desktop" AFTER launch; roadmap v14 tells James + Rylan "On a computer, chat stays as it is today until after launch"; freeze Oct 15.
- Desktop gaps already known: M3 (club room treated as DM), M4 (Clear fakes), M5 (never marks read), M8 (no Report/Delete in Campus > Chat; Officers room unreachable), I3 (no way to open an event chat or Board reply on desktop), L6-L9, L25-L27, F63.
- Recommendation: mock desktop on the design canvas first (Franky picks), ship the M3/M4/M5 compat fixes now, build the React desktop page behind chat_v2 so the freeze and Apple's reviewer are not affected; do not retire the old pages before Oct 26.

### Landing facts
- src/app/page.tsx (24 lines) -> src/components/landing/home-landing.tsx (423), landing-orbit.tsx (423), landing-typewriter.tsx (94). home-landing.tsx:247 says "Sign up with your school email. Your campus. Your people. Yourself."

## FINAL LIST (ordered by due date, then risk) - part 1
H = handoffs/ ; S71 = H/2026-09-30-session-71-audit-chat-waves-1-2.md ; C = H/chat-redesign/wave-2-contracts.md ; RM = H/chat-redesign/roadmap-v14-published/page-final.html

1. Open S72 by asking Franky the status questions (f2 done? D-U-N-S? amendment? EIN? Sunday meeting) | today | Claude session | S71 N1, N3 | open | small
2. James: build the scoreboard sheet | 2026-10-02 | James | RM ch4 | unsure | small
3. James: INBiz LLC amendment (add Franky + Rylan, principal office) + say if an operating agreement exists | 2026-10-03 | James | H/2026-09-28-session-67 "Paperwork"; memory project_team.md | unsure | medium
4. Rylan: two Instagram accounts + campus account names | 2026-10-03 | Rylan | RM ch4 (r8) | unsure | small
5. f2: mailbox that sends as hello@connectvibe.app + one real test to help@ | 2026-10-04 | Franky | S71 N1 | unsure | small
6. First Sunday founders' meeting: confirm pitch, seven lines, the open calls, two backup store names | 2026-10-04 | Franky | RM ch10, ch12; memory project_launch_plan.md | open | small
7. Rylan week 1: sign SAE for real, 25-club list, five demo days booked, first five Campus 10 names (zero clubs signed) | 2026-10-04 | Rylan | RM ch4; memory feedback_founder_docs / launch plan | unsure | large
8. Real-phone walk of the new chat (cards long-press, sheets, Board replies, keyboard, iPhone edge swipe, week swipe, month sheet, 320px) | before Oct 15 (best this weekend, before demo days) | Franky + Claude session | S71 line 24, 35; C 17.9, 17.10, 17.11 | partly done | medium
9. D-U-N-S arrives: check spelling, open Google Play ($25) + company Google account + Firebase, enroll Apple ($99) ~Oct 7 | 2026-10-05 to 2026-10-07 | Franky | S71 N3; H/2026-09-28-session-67 "Paperwork" | open | medium
10. James: EIN, then Mercury bank | week of Oct 5 (after the amendment) | James | RM ch4 | open | medium
11. Franky's answers on the Terms v2 results (10 outcomes, 19 calls) | before Oct 9 | Franky | H/legal-2026-09-29/12-results.md | open | small
12. f9: first Android build (Franky clicks the Android Studio SDK wizard first) + safe-area strip + Android Back | 2026-10-09 | Franky + Claude session | S71 N2 | open | medium
13. Oct 9 store call | 2026-10-09 | Franky | RM ch3, ch12 | open | small
14. James: one list to the lawyer, Terms changes | 2026-10-09 | James | RM ch4; H/2026-09-28-session-67 to-do 6 | unsure | medium
15. Supabase Pro decision | 2026-10-10 | Franky | S71 N5, F17; 12-results call 19 | open | small
16. Wave-1 chat fixes M2, M3, M4, M5 | before Oct 15 | Claude session | S71 short list + Part 2 | open | medium
17. Support page Block wording (M1) + decide the officer Board-post exception (F04) | before Oct 16 | Claude session + Franky | S71 M1, F04; C 17.2 L7 | open | small
18. Report / Remove on text Board posts and replies (17.2 L3 = F59) | before Oct 26 (best before Oct 15) | Claude session | C 17.2 L3, 17.5 item 30 | open | medium
19. Security sentinel + feature sentinel + 375px non-admin walk | 2026-10-10 to 2026-10-14 | Claude session | S71 L16, N6; RM week 3 | open | large
20. Write "review accounts never join SAE" into the store notes (F36) | before Oct 16 | Claude session | S71 F36; H/stores/review-notes.md:38 | open | small
21. Terms v3 + companion + chat facts (L3, L10, F11, F40, F41, F42, F56, F71) | 2026-10-12 | Claude session, then James + lawyer | memory project_legal_terms_v2.md; S71 short list | open | large
22. Cheap code + copy that must land before the Terms publish | 2026-10-14 | Claude session | 12-results "What the defense fixed" | open | large
23. James: Terms + Privacy from the lawyer to Franky Oct 12, live ~Oct 14 | 2026-10-14 | James | RM ch4 | open | large
24. James: DMCA agent ($6) | 2026-10-14 | James | RM ch4; S67 to-do 7 | open | small
25. Chat freeze | 2026-10-15 | Franky | RM ch4; S69 close | open | small

## FINAL LIST - part 2
26. Push on production: renumber + apply the push migration (Franky's yes), keys, on for founders first | before Oct 16 | Franky + Claude session | S71 N4, F70; RM week 3 | open | medium
27. Store submission kit (privacy labels, 18+ forms, screenshots, review seed) + submit both stores | 2026-10-16 | Franky + Claude session | H/2026-09-25-session-65-next-waves.md S4 | open (blocked on store accounts) | large
28. Store-app device checks: F10 keyboard, F31 new screens inside the apps, F72 apps locked to Light | before Oct 16 | Franky + Claude session | S71 F10, F31, F72; C 17.10 F | open | medium
29. Pre-store security items (CSP, cookies, throttles, local pentest, block clause on comment/repost/bookmark inserts) | before Oct 16 | Claude session | memory project_security_sequencing.md; S65 next-waves "Security pass" | open | large
30. f11: taken-down photos gone within 48 hours | 2026-10-18 | Claude session (after Supabase Pro) | S71 N5 | open (parked) | small
31. Raise TRENDING_MIN_AUTHORS to 2 + speed test on a mid-range phone | 2026-10-18 | Claude session / Franky | S67 item 4; RM week 3 | open | small
32. Link files so Vibe links open in the app | 2026-10-23 | Claude session | S65 next-waves S3D | open (blocked on Apple Team ID + Play SHA) | small
33. Rylan: ten clubs live with events, three Purdue (Oct 23 check); 5 signed by Oct 11 | 2026-10-23 | Rylan | RM ch4, ch6 | open | large
34. Club member list, roles, handover; then club badges | 2026-10-23 (if they fit) | Claude session | H/2026-09-25-founders-meeting-product-notes.md; RM ch12 | open | large
35. Walk the whole app as a brand-new student; every first-run screen keep or hide | 2026-10-23 | Franky | RM weeks 2, 4 | open | medium
36. Pre-registration takeover fix | before Oct 26 | Claude session | 12-results outcome 1 | open | medium
37. Safety process: NCMEC, help@ rota for 48-hour intimate image, 2FA on dashboards | before Oct 26 (start now) | James + Franky + Rylan | 12-results outcomes 2, 7 | open | medium
38. Moderation gaps in the new chat (F12, F13, F37, F38, F54, L18-L20) | before Oct 26 | Claude session | S71 Part 3 | open | medium
39. Per-event cap on Event cards | before Oct 26 | Claude session | C 17.7 open points | open | small
40. Old inbox 1,000-row cut (M6 = F16) | before Oct 26 | Claude session | S71 M6, F16 | open | small
41. Measure chat traffic vs the Supabase Free allowance (F17, F57, K1) | before Oct 26 | Claude session | S71 F17, F57 | open | medium
42. Chat notices and wording (M9, L12, L8, L9, L6, F40) | before Oct 26 | Claude session | S71 Part 2 | open | small
43. Decide: suspended member's chat messages and roster entry (L13, L14) | before Oct 26 | Franky | S71 L13, L14 | open | small
44. Franky looks at the three tells of the officer exception | before Oct 26 | Franky | C 17.5 item 23 | open | small
45. Small new-chat polish (F14, F32-F35, F63-F65, 17.10/17.11 open smalls) | before Oct 26 | Claude session | S71 Part 3; C 17.10, 17.11 | open | medium
46. Weekly chat health check on production | weekly until 2026-10-26 | Claude session | S71 L1 | open | small
47. Turn the new chat on for everyone (CHAT_V2_ALLOWLIST=*) and push for everyone | 2026-10-26 | Franky | C 17.5; S65 next-waves wave 4 | open | small
48. Launch night Oct 29, deadline Oct 31 | 2026-10-31 | Rylan / all | RM ch8 | open | large
49. NEW Oct 2: desktop version of the new chat | none (plan says after launch; freeze Oct 15) | Claude session + Franky picks | C section 15; S68 close :11; S71 M8, I3 | open | large
50. NEW Oct 2: landing page revamp + quick demo video or demo site | none | Claude session + Franky (reference sites) | Franky Oct 2; H/2026-09-25-marketing-pass-site-findings.md items 9-10; 12-results outcome 1 | open | large
51. NEW Oct 2: Franky's personal portfolio site | none | Claude session + Franky | Franky Oct 2 | open | medium
52. NEW Oct 2: Obsidian vault links | none | Claude session | memory reference_obsidian_vault.md; vault check | open | small
53. Send one real DM photo and one SAE Lounge message on production (L2) | none | Franky | S71 L2 | unsure | small
54. Mac .env.local new keys; tidy unused Vercel rows; reviewer pass on key-guard.ts | none | Franky + Claude session | S71 Part 1 "Still to do" | unsure | small
55. Wave 6: journal S67-S71, memory tidy, roadmap page v15, s71-walk screenshots | none | Claude session | S71 N6, N7; S68 header :9 | open | medium
56. Walk never-opened screens (L4, N8) + three live photo flows | none | Claude session | S71 L4, N8; S67 "Not walked live yet" | open | small
57. Demo-day prep: phone club creation, time a signing, walkthrough for James + Rylan, signed-out club page error, SAE typos | none (demo days week of Oct 5) | Franky + Claude session | site findings 5-7; RM ch4 | open | medium
58. Vibe+ stays off: gate list | none | James + Franky | memory project_stripe_status.md; 12-results | open | medium
59. Smaller security and ops follow-ups | none | Claude session + Franky | S67 item 5, to-do 7 | open | medium
60. After-launch chat backlog | none | Claude session | C section 15, 17.2 L1, L2 | open | large
