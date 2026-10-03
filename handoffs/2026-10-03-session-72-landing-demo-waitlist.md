# Session 72 (Oct 2-3): the demo film, the new landing page, the waitlist

S72 started from `2026-10-02-session-71-close-and-next-up.md` and did three things Franky asked for: a 30-second demo film of the app, a new landing page built around it, and a waitlist so about 100 hand-picked students test Vibe before the official launch. **Nothing from S72 is on the live site.** The landing page and the waitlist sit on branch `landing-night`; the film and the tools that make it are on `main`.

## START HERE — session 73

1. **Read the go-live runbook** for the waitlist: `handoffs/s72-prep/waitlist/BUILD.md` section 6.2 (steps a to k). Every step needs Franky's OK; the first one is James's.
2. **Ask Franky:**
   - Has James got the Privacy Policy waitlist lines in front of the lawyer (runbook step a)? The form must not go live before them.
   - Email: start with waves of about 25 a day on Resend's free plan, or upgrade (he said "later")?
   - Did he walk the landing preview on his own phone? What does he want changed?
   - The title rotation: it does two rounds (about 28 s) and rests on "your campus.". Keep, one round, or a pause button (WCAG 2.2.2)?
   - Android phones that report a slow connection get the smaller, softer film. Keep (saves data) or always send the sharp one?
3. **Before the merge:** walk the landing page and the waitlist on a real iPhone (Safari, Low Power Mode) and a real Android phone, signed out. Nothing was tested on a real device in S72.
4. **The dated table from S71 still applies** (see that file): hello@ mailbox (Sun Oct 4), Terms review answers (Tue Oct 6), Android build (Fri Oct 9), the old-screen chat fixes and both sentinels before Thu Oct 15, store submission Fri Oct 16, new chat for everyone Mon Oct 26, launch end of October.

## 1. The demo film (done)

- **The film:** `~/vibe-demo-video/vibe-demo-30s-1080x1920.mp4` (29.9 s, for Instagram and the page), `vibe-demo-30s-master.mp4` (1170x2532 phone screen), `vibe-demo-30s-poster.jpg`. Older takes in `~/vibe-demo-video/old/`. **Outside the repo on purpose:** it shows Franky's own photos with real people (all agreed to a public video, Franky confirmed Oct 2).
- **Story** (Franky's ask: faster, 30 s, clean and sharp): landing open, feed, visiting Rylan's profile, Events (Blitz Night, Going), Orgs and SAE's page, the rebuilt Messages, Chess Club's chat with a poll, a DM to James typed and sent, Franky's own profile, the "vibe." end card. Filmed on the new chat (chat_v2 on for the demo server only).
- **The cast:** `scripts/demo-seed.mjs` (local stack only, re-runnable). Lead = Franky himself (junior, marketing, "vibin"); James is the SAE admin, Rylan is not in SAE; ten of Franky's pictures read at run time from `~/vibe-demo-photos/web/` (never copied into the repo); invented students and clubs (Chess Club, Finance Club, Tower Floor 3, North Hall) on the IU Bloomington campus label (Franky: "IU Bloom is fine"). Notes: `handoffs/s72-prep/demo-cast.md`.
- **The recorder:** `scripts/demo-video/` (README inside). It steps the page's clock one frame at a time and captures at 3x, so the film is sharp and smooth whatever the Mac is doing (~4 min per take). A take cleans up after itself. Film before 6:55 pm for "7 PM" on Blitz Night; Blitz Night leaves the app at 10 pm. Seven things are tidied "in the film only" (listed in the README), not in the app.
- **Hosted:** Vercel Blob store `vibe-landing-media` (public, Cleveland), created and filled by Franky: `https://npzptkkzqxthhsnu.public.blob.vercel-storage.com/vibe-demo-780.mp4` and `-390.mp4`. Browsers cache them 30 days: **a re-cut needs new file names.**

## 2. The landing page (built, on `landing-night`, not merged)

Franky picked direction C, "the campus at night", then design 2 of three prototypes, then a mix of two title animations.

- **Hero:** a canvas night sky with lights by kind (clubs coral, events gold, people blue), orbits and moons, sparks, a shooting star. The title sketches itself in (points of light on the letter tips), then the ending rolls "your campus. / your clubs. / your events. / your people." in the kind colours, two rounds, then rests.
- **Three panels** (Sibal-style readouts) with real, photo-free app screens: the Orgs tab, Blitz Night marked Going, a DM.
- **04 · A day on Vibe:** the film in a phone readout next to seven parts of the day that jump it; muted, plays only in view, poster first, reduced motion and Save-Data never autoplay. The film URL is the Blob default in `src/lib/landing/demo-media.ts` (`NEXT_PUBLIC_DEMO_MEDIA_BASE` overrides).
- **Doors, close, footer** with the not-affiliated line. While sign-up is closed every Sign up becomes **Join the waitlist**.
- Also fixed: panels fit phones, the soft wordmark really is soft (local OFL font file `src/components/landing/fraunces-soft.woff2`, must stay tracked), contrast, black browser bars in light theme, copy that overclaimed, 20 to 60 fps on software canvas, `<main>` and focus order, metadata, ~650 lines of the old landing removed (the /otto hero's `.vibe-landing-sun-*` pieces stay).
- **Preview:** https://vibe-git-landing-night-fracazar-1988s-projects.vercel.app/ (Vercel login). Preview builds read the PRODUCTION database, so the waitlist form there cannot save until the migrations are applied.
- Owed: the Blitz Night screen says "Fri, Oct 2" (re-shoot before November); headshots for Franky, James, Rylan (initials today); James's and Rylan's year and major.

## 3. The waitlist (built, local only, on `landing-night`)

Franky (Oct 3): ~100 hand-picked testers, product-fit data, launch "end of the month or whenever". Memory note `project_waitlist`.

- **Flow:** `/waitlist` form (school email IU/Purdue, name, year, major, clubs, "I run a club", what they'd want, consents) → confirm by email → founders pick batches in the admin **Waitlist** tab → each gets an **access code** (`VIBE-XXXX-XXXX`, hashed, single use, up to 14 days) → they enter it once at sign-up. Club officers skip the line (a founder adds them by hand). Existing accounts and the App Review accounts are never asked.
- **The gate:** a Supabase before-user-created hook `auth_hooks.hook_waitlist_gate` + `app_settings.signup_open` (one switch opens everything at launch). It must live in the database because sign-up goes from the browser straight to Supabase.
- **40 days:** entries deleted at 38 days (28 unconfirmed) so "up to 40 / 30" holds with a late cron; from the form, the admin tab and a daily Vercel cron (`vercel.json`, `CRON_SECRET`). Accounts keep only a wave tag (`public.user_cohorts`).
- **Migrations** `20261003100000` to `170000`: applied to the LOCAL stack only. Production's `handle_new_user` fingerprint was read on Oct 3 and matches what the first one expects.
- **Not built yet:** the product-fit survey and the founders' cohort dashboard (next, once the first wave is in); a CAPTCHA (Cloudflare Turnstile).
- Notes: `handoffs/s72-prep/waitlist/` (PLAN.md, BUILD.md, signup-gate.md, email-admin-data.md).

## 4. Smaller things done

- The "This week" pill is smaller (`5a00446`), Franky's S71 note.
- Live app bugs found and offered as one-click chips: blank Events/Orgs pane after scrolling the feed (shared scroll, `CampusMobile.tsx`), light bars in Night (`PostViewerMobile.tsx` ~581/1105/1129) and the old Chat chip flashing on /campus with chat_v2 on, a nested `<button>` in `FeedCard`. The org pages (`src/app/orgs/[handle]/`) were never moved to the Night tokens.

## 5. Local environment (gone in a new session)

- The `landing-night` worktree lives in the S72 scratchpad and will not exist in S73. Recreate: `git worktree add <dir> landing-night`, copy `node_modules` with `cp -cR`, copy `.env.development.local` from the main checkout (never `.env.local`), add `CHAT_V2_ENABLED=true` and `CHAT_V2_ALLOWLIST=*`, set `BILLING_ENABLED=false` and `PUSH_ENABLED=false`, and copy `supabase/.temp/` from the main checkout so `supabase start` keeps the production image versions. The local stack's auth hook is on (from that worktree's `supabase/config.toml`); local sign-up stays OPEN. Put the two film files in `public/landing-media/` only if you set the env var to use them.
- The local database holds the waitlist tables and the demo cast; re-run `node scripts/demo-seed.mjs` on the day of any re-shoot.
- `caffeinate -ims` was left running so the Mac stays awake for phone-driven work; Remote Control is on for the S72 chat.

## 6. Gotchas learned in S72

- **SendMessage to an agent inside a workflow starts a separate copy**; it does not reach the running one. Twice this made two recorders work the same data. To steer a workflow, stop it and relaunch.
- **Playwright's video ignores deviceScaleFactor** (records at 1x). Sharp capture = frame-stepped virtual time + screenshots, or browser zoom 200% in a persistent profile for real time. Begin-frame control is refused on macOS.
- **The Vercel connector here gets 403** on Franky's team (`fracazar-1988s-projects`); store and env changes go through Franky's dashboard or a reconnect.
- **Production reads** are blocked by the auto-mode classifier unless Franky OKs them in chat (he did on Oct 3).
- Supabase `admin.createUser` does not call the before-user-created hook (GoTrue v2.189), so the seeds still work with sign-up closed; the review seed also allowlists its two emails.
