# Session 67, part 2 (2026-09-26 → 09-28): waves 2–4, three security waves, D-U-N-S, the roadmap refresh

Part 1 (design canvas + wave 1) is `2026-09-26-session-67-wave1-feed-strip.md`. All code below is pushed, deployed and applied to production. Working tree clean at `db901c7`.

## START HERE — session 68

1. **Ask Franky first** (the roadmap's open questions):
   - **Tagline:** picked by Fri Oct 2? Recommended: "Your campus. Your people. Yourself."
   - **Product journal:** take it off the public site? (It's inside the Oct 3 website task, f10.)
   - **Supabase Pro:** decided? It's also the photo-cache fix, task f11 by Oct 18.
   - **Paperwork:** did James file the Oct 3 LLC amendment? Is the EIN done (was it done Sept 26)? Has the D-U-N-S number arrived (due ~Oct 5)? Any D&B / TruePic follow-up?
   - **The Sept 26 meeting:** did it settle the pitch workshop or the seven "how we work" lines? Nothing is written down, so the roadmap says "settle at the first Sunday meeting, Oct 4".
2. **FRANKY'S NEXT BUILD (asked at the very end of S67, start here in the new chat).** This is his order. Ask him to confirm it; weave the dated items in section 3 around it.
   - **A. Campus header redesign (desktop).**
     - **One top bar:** the campus/school name on the LEFT, the search bar ("people, clubs, events") in the MIDDLE, and the tab pills (Feed · Events · Orgs · Chat · Map) on the RIGHT. Today the tabs and the search sit in rows under the dark campus banner. This is the layout from the S67 design canvas ("Option A desktop feed with header search"): https://claude.ai/artifact/B69NRnhbB8mvdrKsc9NQFJ (memory `reference_design_canvas.md`).
     - **Colors:** Franky finds the plain black banner "kind of sad". He wants it split, half **Purdue black & gold** and half **IU crimson & cream**, so the shared Indianapolis campus shows both schools.
       - Recommendation: a campus that belongs to one school (Bloomington, West Lafayette) uses only that school's colors.
       - Show him 2–3 split treatments first (a hard split, a diagonal, a band), in Light and Night, and let him pick. He loves picking from visual options.
       - Colors only, no IU/Purdue logos (marketing rule).
       - Keep text contrast readable on both halves.
     - **Code:** `src/app/campus/campus-home.tsx`, where `CampusBanner` is around line 4520; the tab list is around 358; the banner and search row mount around 892–896. The phone uses `src/components/mobile/CampusMobile.tsx` and shares `CampusBanner`. Keep the phone layout unless he says otherwise.
     - **Open question he asked:** "the profile card — leave it white or make it dark?" This is the profile card beside the feed on desktop. Recommendation to show him: follow the theme (cream/white in Light, near-black `#161515` in Night), with a thin split school-color strip on top that ties it to the new header. Mock it both ways.
   - **B. Officer tools.**
     - A Delete button on club posts. The database already lets current owners/admins delete them (`posts_delete_club_officer`).
     - Edit, Cancel and Delete for club events. The database already allows these (see the `campus-home.tsx:9395` comment). Cancelling should tell everyone who RSVP'd.
     - Hide Edit/Delete on an author's moderator-removed post.
   - **C. Night mode on every other page (wave 5).** The spec is item 5 in the date-order list below.
   - The first walk failed: the gstack `browse screenshot` timed out twice at 1280 px on `/campus`. Retry after a fresh `goto`, or use the local dev server.
3. **Build, in date order** (confirm with Franky):
   1. **f10 · website ready for the first post, Sat Oct 3:** the product journal off the public site (if he agrees), the new tagline in link previews (the old "your campus, your career" line is still in `layout.tsx` metadata), and a share image. See `2026-09-25-marketing-pass-site-findings.md`.
   2. **Officer tools, before demo days start (week of Oct 5).** A Delete button on club posts; the database already allows current owner/admins (`posts_delete_club_officer`). Edit, Cancel and Delete for club events; the database already allows these too (see the `campus-home.tsx:9395` comment). Hide Edit/Delete on an author's moderator-removed post.
   3. **f9 · build Android, by Fri Oct 9** (the store decision day). It has never been built, and Android Studio isn't installed. That's a large download; ask Franky before installing. Capacitor project: `mobile/`.
   4. **f2 · a working @connectvibe.app mailbox that can send, by Sun Oct 4.** help@ already forwards to Franky; Apple and Google want a work address.
   5. **Wave 5 · Night mode on the older pages.** `public/html/*.html` still render Light in Night. Drop the `[data-legacy-night]` gate. Flip `DEFAULT_THEME_PREF` to `"system"` in `src/lib/theme/theme.ts` and `_VIBE_THEME_DEFAULT` in `_persistence.js`. Re-paste the static heads and bump `SW_VERSION`. Also fix: the phone "⋯" buttons, `LegalLayout`, the nav identity chip, the desktop /network cards, and the admin page's dark background that stops partway down. Plan: `handoffs/wave-plan-s67/waves.md`.
   6. **f11 · make taken-down photos disappear within 48 hours, by Sun Oct 18,** once Supabase Pro is decided. The fix is Smart CDN plus a purge call after every quarantine move or delete.
   7. **Wave 6 · close S67:** product journal v7.9 (`public/journal/vibe_journal.html`, absolute path), a feature sentinel run, memory tidy.
4. **Before the student launch:** raise `TRENDING_MIN_AUTHORS` from 1 to 2 (`src/lib/trending/count-tags.ts`). Build the evidence-retention sweep before any kept file turns a year old; the earliest is Sept 2027, and the lawyer confirms the period.
5. **Security follow-ups** (none urgent at 20 users): EXIF on R2 uploads (chat, club and video); direct UPDATE grants on `users.current_on/resume_*/department/website`; a `last_active_at` count RPC plus revoke; the `channel_members` settings columns; the `/api/me/handle` word filter; look-alike letters; CSP and cookie hardening (~3 days); the org-invite accept block re-check. Full lists: `handoffs/wave-plan-sec2/` (the waveA/waveB build files and both crosschecks).

## What shipped this session (all on main and live)

| commit | what |
|---|---|
| `035de54` | Wave 2: movable + hideable profile widgets (`users.profile_layout`, 20260926100000) |
| `026618d` | Wave 3: Night mode (Auto / Light / Night; default Light until wave 5) |
| `ef18f50` + `c72aaa2` | Wave 4: browse any campus; home campus locks 45 days; RSVP at home or in your clubs (route + RLS 20260927100000) |
| `24dac9f` | Security wave 1 (`2026-09-27-security-risk-report.md`): emoji allowlist, own-folder media refs, quarantine bucket, intimate_image + child_safety reasons, admin flag server-only (20260927110000–142000) |
| `c0b0533` | Security 2A (`2026-09-27-security-lenses-authz-dataexp.md`): hidden widgets really hidden, blocks in the database, Vibe+ viewer list server-only, club event + membership + chat rules (20260928100000–160000) |
| `db901c7` | Security 2B: moderator photo takedown/put-back, post + club delete rules, EXIF stripping, tag rules + Trending counts people, no-Retry on permanent errors, phone Deny, invite sheet in Night (20260929100000–120000) |

Franky can still override any product call in `handoffs/wave-plan-sec2/waveA-build.md` (calls 1–12, rulings 13–18) or `waveB-build.md` (calls 1–7). The main ones:
- A block hides the person's posts, including club posts they wrote.
- A victim is never locked out of a club by a harasser officer.
- Removed members must request to rejoin.
- Counts include muted people.
- Deleting a club deletes its posts and events.
- Evidence survives account deletion.

## Paperwork (Sept 28)

- **D-U-N-S requested** Mon Sept 28, 6:15 PM, as a Company/Organization. D&B case #11037991 (email to vibe.llc@outlook.com). The number is due ~Oct 5, and Apple sees it ~Oct 7. Then enroll Apple ($99/yr) and Google Play ($25). Check that D&B spells the name exactly `CONNECTVIBE. LLC`; the case subject showed `CONNECTVIBE.LLC`.
- **Certified Articles read** (4 pages; validation link expires Oct 28). The LLC is **manager-managed** and not single-member. **James is the only person named:** governing person ("Co-founder"), registered agent, and signer ("Member"). There is **no principal office**. Franky's name appears nowhere. Upload this PDF to D&B if asked.
- **James's task, due Sat Oct 3:** an INBiz amendment adding **Francisco Cazares and Rylan Conaway** as co-founders ("governing persons"), with Franky's home address as the principal office "for now" (the same address as the D-U-N-S request). He should also say whether an operating agreement exists. Then the EIN, then the bank. There is no office. The address is on the roadmap page at Franky's request; keep it out of memory and the repo.

## The launch roadmap (shared page)

https://claude.ai/artifact/6QfJfD1QSPYu8qn9FvsRzi, version 13.
- **Edit mode:** Franky can click text and save a new version. Only people with edit access see the button. v12 was his own edit: "as co-founders" in James's task.
- **Before any republish:** `Artifact read` it first and rebuild from its `#page-source` JSON (how-to in memory `project_launch_plan.md`), or Franky's edits get overwritten.
- **Sharing:** "anyone with the link" views it with no account. Editing needs a claude.ai account plus edit access.
- **Rule from Franky:** cleared tasks come off the page, with one line in Chapter 1.
- **The v13 refresh** (8-agent workflow, notes in scratchpad `roadmap-update/changes.md`):
  - counts recounted Sept 28
  - new tasks f9, f10, f11, j9, r8
  - Chapter 12 renamed "Still to decide"

## Gotchas learned

- **Auto-mode safety check** blocked production migrations twice, even after Franky's yes. It went through after he said "just run them all". Don't retry a blocked command without a new instruction from him.
- **The Supabase management API can 502 mid-sequence.** Verify the object read-only, then retry the `schema_migrations` insert (`on conflict do nothing`).
- **The local stack is http.** The https-only avatar rule and the prod-host `post_media_ref_ok` refuse local photo URLs, so photo-post delete and avatar replace can only be walked on production.
- **Local sign-in switching:** `POST /api/auth/logout`, then the magic-link confirm. `.env.development.local` is the local stack; `.env.local` is PRODUCTION.
- **Mac sleep:** keep `caffeinate` running during long workflows. Recover a usage-limit stop with `resumeFromRunId`.
- **The built-in browser can't open claude.ai,** so Artifact pages can't be walked from here; Franky checks them.

## Not walked live yet (check on first real use)

- Deleting a photo post removes its files.
- Replacing a profile photo deletes the old file.
- A moderator photo takedown on production (the local walk passed end to end).

## Franky's to-do (founder actions, with my recommendation)

1. **Tagline** by Fri Oct 2 (recommended: "Your campus. Your people. Yourself.").
2. **Share the roadmap link** with James and Rylan. They need no account to read it.
3. **James, by Sat Oct 3:** the INBiz amendment and the operating-agreement answer, then the EIN, then the Mercury bank.
4. **D&B:** answer any follow-up fast. When the number arrives (~Oct 5), check the name spelling, then enroll Apple and Google.
5. **Supabase Pro + leaked-password protection:** recommend yes now (~$25/mo). It's the photo-cache fix, needed before the first real takedown.
6. **Lawyer (via James):**
   - the 48-hour takedown wording versus the cache delay
   - "up to a year" evidence retention
   - 17-year-old students
   - Vibe+ showing profile visitors
   - how ambassadors mark posts as ads
7. **DMCA agent** ($6, copyright.gov, James, by Oct 14). Also: spending alerts on Vercel, Supabase and Cloudflare; Dependabot; a Turnstile CAPTCHA key (I build it once he makes the key).
8. **Decisions:**
   - the product journal private (and the repo?)
   - should accounts without a school email see student data at all?
   - confirm the new tasks' dates on the roadmap

## Known, not fixed (pre-existing)

- The phone `FeedCard` nests a button in a button (hydration warning "2 Issues" in dev).
- `src/lib/otto/parse-reminder.test.ts` fails (extensionless import). It's the one known `npm test` failure (1254/1255 pass).
- Legacy desktop pages stay Light in Night until wave 5.
