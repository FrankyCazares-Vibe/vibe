# todo-verify.md (critic pass over todo.md, Oct 2 2026)

Read-only. Nothing in vibe/, vault/, vibe-marketing/ or .claude/ was changed.

## Step 0: starting facts
- main head: fa3348c (Oct 2). Only cloud branch: origin/claude/relaxed-davinci-9d11h3.
- Untracked: handoffs/chat-redesign/s71-walk/.
- Known done (given): wave 2 on production with flag on, key leak fixed + legacy keys off,
  Mac .env.local + Vercel ANON row fixed, week swipe + month sheet shipped (00257b5).

## Step 1: per-item checks (appended as I go)
- M1 Support Block wording: STILL OPEN. src/app/support/page.tsx:136-138 unchanged ("you stop seeing theirs").
- M2: STILL OPEN. Newest migration is 20261001120000 (migration C). No hidden_at fix file.
- M3: STILL OPEN. src/app/api/me/threads/route.ts:611-612 + :826 still send `peer` for every channel type.
- M4: STILL OPEN. src/app/api/me/threads/[id]/clear/route.ts has no club-room refusal.
- M5: STILL OPEN. grep '/read' in src/app/campus/campus-home.tsx = 0 hits.
- Trending floor: STILL OPEN. src/lib/trending/count-tags.ts:29 = 1.
- Landing copy: STILL OPEN. src/components/landing/home-landing.tsx:247 "Sign up with your school email".
- F36: STILL OPEN. handoffs/stores/review-notes.md step 5 tells account 1 to "join a live club"; no SAE warning.
- Event-card cap: STILL OPEN. cards/route.ts only has the shared 60/min rate limit.
- git log since Sept 30: no commit touches M1-M5; last code commit is 00257b5 (week swipe).
- Cloud branch origin/claude/relaxed-davinci-9d11h3 is 0 commits ahead of main: nothing stranded there.
- Legal copy checks, all STILL OPEN: public/html/profile.html:8532 still prints "Student ·"; accept-terms-form.tsx:147
  "One quick thing"; campus-home.tsx:12254 "Officially recognized clubs"; legal/community/page.tsx:36 "a real student
  at a real school"; TERMS_VERSION still "2026-05-07"; privacy page lists 3 providers and both legal pages still say
  "baseline draft" and "clips".
- 17.2 L3 (Report/Remove on text Board posts): STILL OPEN (BoardPost.tsx passes onReport only to the card branch).
- Wave 4 of the app plan: src/app/api/version does not exist (no "new version, tap to refresh" toast). OPEN.
- Link files: public/.well-known does not exist. OPEN (blocked on Apple Team ID + Play key).
- Android SDK folder ~/Library/Android/sdk still missing: f9 still blocked on Franky's wizard click.

## Step 2: things the first list MISSES (found by re-reading sources)
- MISSING A (roadmap v14 Chapter 11 "Five numbers every Sunday"): "Franky makes every screen count [a visit], and
  counts days per week, before launch." Code check: only src/app/campus/campus-home.tsx:4673 calls /api/me/heartbeat.
  Not built. Also Franky owes a screenshot of the five numbers every Sunday night (Ch 12 call).
- MISSING B (roadmap v14 Chapter 7 rule 5): "Not affiliated" on the landing page and flyers. grep "affiliated" in
  src/components/landing = 0 hits. Fold into the landing revamp.
- MISSING C (12-results call 17 + call 14): one-page club agreement Rylan brings to each signing (lawyer reviews),
  written checks before a club is verified, SAE re-verified by James or Rylan (not Franky). Demo days start Oct 5.
- MISSING D (roadmap Ch 4 Franky): company Google account + Firebase can be opened NOW (no D-U-N-S needed). The first
  list parks it behind the D-U-N-S number.
- MISSING E (roadmap Ch 4/5): first Campus 10 ideas session (Franky, week 2); 3-line weekday note; Rylan's club
  playbook by Oct 11; Rylan emails campus offices; 20-30 student interviews; first two "Building Vibe" posts.
- MISSING F (roadmap Ch 12): two open calls not on the list: "What does a student open Vibe for on a day with no
  event?" (Franky) and "Sign-up before Oct 26: open or club members only?" (Rylan).

## Step 3: corrections to the first list
- Item "Pre-store security": the block clause on comment / repost / bookmark inserts is DONE. Evidence:
  supabase/migrations/20260928120000_blocks_in_rls.sql (header lines 36-40), shipped in c0b0533 (S67 security 2A),
  applied to production per handoffs/2026-09-28-session-67-waves-2-4-and-security.md line 3. Engagement throttles
  also exist (src/app/api/posts/[id]/like/route.ts:72, save/route.ts:87, comments/route.ts:353). STILL OPEN: CSP
  (next.config.ts has HSTS and X-Frame-Options only), cookie hardening, the local pentest. => "partly done".
- Item "Key clean-up": Vercel ANON row DONE (commit ccce913; S71 handoff line 107). Mac .env.local DONE per the
  orchestrator (I did not read .env files; handoff line 55 and memory project_supabase_keys_s71.md still say open:
  both are stale -> memory tidy). Left: remove unused Vercel rows SUPABASE_ANON_KEY / SUPABASE_JWT_SECRET; one
  reviewer pass over src/lib/supabase/key-guard.ts.
- Item "Safety process" due was "before Oct 26". Source says earlier: 11-defender-round1.md section 4e + Part 4
  process table: P1 help@ rota and P2 intimate-image log "Before publish" (~Oct 14); P3 NCMEC "Start now; before
  the Oct 16 store submission"; P17 2FA "Today" (Franky); P19 SAE re-verified by James or Rylan "Before publish".
- Item "Terms v3" due was Oct 12. James sends the Terms changes to the lawyer by Oct 9 (roadmap Ch 4) and the
  lawyer's final text is due back Oct 12, so v3 must exist BEFORE Oct 9. Franky's thoughts must come first.
- Item "D-U-N-S": the company Google account + Firebase do NOT wait for the number (roadmap Ch 4 Franky). Split.
- Item "new-student walk": roadmap has two passes: week 2 (by Oct 11, keep or hide each screen) and week 4 (Oct 23).
- Item "sign-up takeover (H11)": defender says "before the first student invite"; officers start signing up at
  demo days the week of Oct 5, so recommend building it with the Terms code (by Oct 14), hard stop Oct 26.
- Obsidian facts re-checked: ~/vault/Founder/vibe_journal.html -> vibe/public/journal/... is BROKEN (file now at
  vibe/journal/vibe_journal.html, last edited Sep 25, newest entry S66); Handoffs Index.md last edited Sep 3.

## Step 2 (continued): more missing items
- MISSING G (11-defender H21): reporting a message saves the last 50 messages into the report. "Before launch, Oct 31".
- MISSING H (11-defender P21): one-page club page agreement, Rylan, "Before club signings"; lawyer reviews (J23).
- MISSING I (11-defender P16): teasers / store screenshots / demo video use founder or test accounts or signed
  consent; the SAE cover shows ~13 real faces (marketing-pass item 8). Applies to the demo video Franky asked for.
- MISSING J (S65 next-waves "Wave 4"): /api/version + "new version, tap to refresh" toast, runbook, device
  checklist, store-app icon badge. src/app/api/version does not exist.
- MISSING K (S71 L15): leaving an event chat removes the power to report or delete your own messages (wave2 tag).
- MISSING L (S71 M8): desktop Campus > Chat has no Report or Delete (medium). Sits inside the desktop item; called out.
- MISSING M (S71 I1): any club member can read other members' read times / mute / pin settings via the raw API
  (medium, contract section 15 parks it after launch). Called out in the after-launch item.
- MISSING N (S67 to-do 8): decision "should accounts without a school email see student data at all?" = legal call 5.
- MISSING O (S65 session file section 6, still true): repost route has no rate limit (no rateLimit in
  src/app/api/posts/[id]/repost/route.ts); nothing listens for the Android Back event (NATIVE_BACK_EVENT is only
  dispatched in src/components/native/NativeBridge.tsx:171); the Play feature graphic is not scripted; the live
  Privacy page says "Encrypted backups may retain copies for up to 30 days" (src/app/legal/privacy/page.tsx:147)
  while production is on the Free plan with no backups.
- MISSING P: ~/vibe-marketing/campaigns, content and outreach are empty (last commit Sept 26). No teaser is drafted,
  and the "official orange" decision in ~/vibe-marketing/README.md is still open.
- Journal: vibe/journal/vibe_journal.html newest entry is Session 66. S67 to S71 are owed (five sessions).
- Untracked handoffs/chat-redesign/s71-walk/: 7 files, 452K. Recommendation: commit them (small).

## Step 4: verdict
- Nothing on the first list is fully done. Every code item I could check is still open in the repo.
- Two PARTS are done and are split out as "done" rows: (a) Mac .env.local + Vercel ANON row, (b) the block clause
  on comment / repost / bookmark inserts (and engagement throttles).
- Due dates fixed: Terms v3 (Oct 12 -> before Oct 9), safety process (before Oct 26 -> Oct 14, 2FA today),
  demo-day prep (none -> Oct 4), new-student walk (Oct 23 -> first pass Oct 11), EIN/bank (-> Oct 11),
  Rylan split into Oct 11 and Oct 23, company Google account + Firebase split out (do now).
- Added 12 items: 2FA today; club page agreement; company Google account + Firebase; first Campus 10 session;
  M8 desktop Report/Delete; app wave 4 (update toast, runbook, device checklist); visit counting for the Sunday
  numbers; L15 report after leaving an event chat; H21 report saves last 50 messages; first teaser posts; the two
  open roadmap calls (folded into the Sunday meeting row); landing "Not affiliated" + consent rule (folded in).
- Not added on purpose: the key-leak disclosure topic (per instruction).

## Final list
Returned as the structured result (same fields as the first list), ordered by due date then risk.
