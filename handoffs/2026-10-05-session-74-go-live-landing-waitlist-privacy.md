# Session 74 (Oct 4-5): everything is LIVE. Landing page, waitlist, Privacy Policy v3, the new chat for everyone

S74 started from `2026-10-04-session-73-privacy-v2-desktop-messages.md`. Franky asked for the new landing page and Messages on main, then for "the best privacy policy you can right now without any of my input", then through Oct 5 for: the share picture fixed, the new chat for everybody, and everybody on the newest version of the site.

**State at the end of Oct 5 (main `7fc4cb4` live, plus docs commits):**
- Sign-up is CLOSED. The waitlist is open and the access-code check is on.
- The new chat is ON FOR EVERYONE, phone and desktop (21 accounts).
- Privacy Policy v3 is published, effective October 5, 2026.
- An open tab now moves itself to the newest build when the person comes back to it.

## START HERE: session 75

1. **Ask Franky three things:** how the live sign-up test went (section 4); whether Vercel Cron "Run" answered 200; whether a tab he left open reloaded by itself after a deploy (section 7).
2. **Fix the mini messenger** (his ask, Oct 5). Ask him first which of the three choices he wants (section 6).
3. **Before the Oct 16 store submission:** decide the blocked-pair traces in clubs (section 5, last line), the store review note, the providers' data-processing terms.
4. **Privacy follow-ups** in the order of `handoffs/legal-2026-10-04-privacy-v3/page-and-code-changes.md` parts 2 and 3. First: tell the existing accounts, read one live Sentry report, the "verify your campus" gap (row 26; a task chip is raised).
5. **Give James** `handoffs/legal-2026-10-04-privacy-v3/for-the-lawyer.md`.
6. **Still dated:** Terms review answers (Tue Oct 6), Android build (Fri Oct 9), both sentinels before Thu Oct 15, store submission Fri Oct 16. "New chat for everyone, Oct 26" is done three weeks early, and the old-screen chat fixes owed before Oct 15 no longer reach anyone.

## 1. What went live, in order (all Oct 5, EDT)

| Time | Commit | What |
|---|---|---|
| 12:24 | `50b60d2` | The release: new landing page with the 30-second film, the waitlist and access codes, Privacy Policy v3, desktop Messages code (off), Sentry reports no longer carry message text or the sign-in cookie, the walk fixes |
| 1:56 pm | `c3b9d6a` | Hover menu on a short message is one row, not a ball |
| 3:15 pm | `f17145e` | Share picture: "Your" white, "self" coral |
| 3:24, 3:29 pm | `1d0a5c2`, `c52bccf` | Empty commits to redeploy after Franky set the desktop Messages values |
| 5:43 pm | `cae3995` | Policy section 5e (the new chat is for everyone), deployed with `CHAT_V2_ALLOWLIST=*` |
| 8:26 pm | `40e04de` | Another session's docs commit (brand kit pointer) |
| 9:51 pm | `7fc4cb4` | Open tabs follow the newest build |

Gate on the release and on each code commit after it: typecheck clean, all tests (2,174 at the release, 2,225 now), build passes. The release also passed the waitlist end-to-end script and a browser walk on phone and desktop.

## 2. Production: what was changed and how to undo it (full log: `handoffs/s74-release/prod-log.md`)

| What | State | Undo |
|---|---|---|
| Ten database files, `20261003100000` to `20261004110000` | All applied and recorded (107 rows). After-deploy chat check: 0 findings. | Each file's header has its rollback. Not needed for any switch below. |
| `signup_open` | **false** since 12:25 | `update public.app_settings set value = 'true'::jsonb, updated_at = now() where key = 'signup_open';` Buttons follow within a minute. |
| Sign-up hook | ON (`auth_hooks.hook_waitlist_gate`) | Supabase > Authentication > Hooks. Open, the hook lets everyone through, so it can stay on. |
| `waitlist_email_viewers` | Franky's account id only | |
| `CHAT_DESKTOP_ENABLED`, `CHAT_DESKTOP_ALLOWLIST` (Vercel) | `true`, `*` (set by Franky) | Remove `CHAT_DESKTOP_ENABLED`, redeploy |
| `CHAT_V2_ALLOWLIST` (Vercel) | `*` (set by the session at Franky's ask) | Put the three founders' ids back (they are in the variable's comment), redeploy |

If sign-up ever breaks: switch to true, then hook off, then promote the previous deploy. Every production read followed the counts-only rule. The session never created an account on the live site: the gate was proven by calling it directly with a made-up address (no code = refused with 403, unknown code = refused).

## 3. Privacy Policy v3

- **Where:** the page is `src/app/legal/privacy/*`; the text is `handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md` (about 12,700 words, 15 sections as questions, a ten-line short version). Section 11 is the waitlist notice (`/legal/privacy#waitlist`). `decisions.md` has every decision and why; `verify/` has the checkers' reports.
- **Page = text check:** `node handoffs/legal-2026-10-04-privacy-v3/check/check.mjs` with a dev server running (1,084 of 1,084 sentences today).
- **The rule from now on:** a change to what the app collects, shows or deletes needs the policy changed the same day. It happened once already (section 5e, when the chat went to everyone).
- **Decided without Franky, at his ask:** six cases for reading messages; a search warrant asked for before message content is handed over; a break-in notice within 30 days; an under-18 account banned then deleted within 7 days; requests answered in 30 days and only after the person answers our reply; no postal address; Anthropic and Claude named, with the counts-only rule dated October 4.
- **Other pages brought in line:** delete-account, the waitlist form's notice, Terms (one line), Community, Child Safety, Support, Vibe+, Settings, six block dialogs. The desktop profile badge reads "Verified · school", not "Student · school".
- **Admitted in the policy, not fixed:** the "verify your campus" step tells a signed-in person whether a school email is in use (row 26); no backups; no access log; comments have no delete button.

## 4. Franky's hands

| What | How |
|---|---|
| **Live sign-up test** | Private window, signed out: "Create your account" with no code must be refused. Then with James or Rylan's school email: join the waitlist, confirm, send a code in Admin > Waitlist (batch `test-1`), sign up with it, remove the test entry. |
| **Cron** | Vercel > Settings > Cron Jobs > `/api/cron/waitlist-purge` > Run. 200 = good. (`CRON_SECRET` is set; checked.) |
| **Real phones** | The landing page, `/waitlist` and the new chat on an iPhone and an Android phone. Nobody has walked the new chat on a real phone and 21 accounts now have it. |
| **Two-step sign-in** | Supabase, Vercel, Cloudflare, Resend, Sentry, GitHub and the Gmail account. The policy tells the world one person holds everything. |
| **Claude account** | Is "help improve Claude" off? The policy says "not yet confirmed" in three places. |
| **Mail** | A test email to hello@ and help@ from an outside address. |
| **Tell the 21 accounts** | The old policy promised notice of a new one. Claude can draft it. |
| **Sentry** | Open one server error and one speed report and read what they hold. |
| **One look in Light** | Admin > Waitlist > the Batch list: the open list should be readable. |
| **Before Oct 16** | Store review note ("Vibe is opening in waves; new visitors join a waitlist; please sign in with the review account"); providers' data-processing terms; a written yes from each person in the film. |
| **Resend** | 100 emails a day on the free plan: invite in waves of about 25 until upgraded. |

Done and off this list: `CRON_SECRET` and `SCHOOL_EMAIL_VERIFY_SECRET` exist on Vercel; the desktop Messages values.

## 5. The new chat: on for everyone

**Franky's rule from Oct 5: "no need to delay features for people when we are still building."** A finished, reviewed feature goes to every account in the same deploy. A switch is an off button set to everyone, not a stage. Still off for their own reasons: open sign-up (the waitlist test), billing, notifications.

- **Phone and desktop, all 21 accounts, since 5:45 pm.** Franky confirmed the desktop layout shows for him. The session cannot sign in on the live site and saw no account's screen.
- Campus has no Chat on desktop any more; old chat links open Messages.
- Checked before opening it: Report and Remove on text Board posts and replies (the one thing that had to exist first) shipped with the desktop work.
- **Known, small:** the first message on screen keeps its hover menu half under the chat header; under 1140 wide with the Pinned and Shared panel open, some menu buttons sit under the panel; no unread mark for the Officers room or private rooms.
- **Not merged, local branch `desktop-hover-menu` (`daa980e`):** moving that first menu under its bubble. A reviewer found it catches a pointer travelling down the chat (a press could hit the wrong message). The fix is in `handoffs/s74-release/hover-menu-review.md`.
- **Decide before Oct 16:** in a club, two people who blocked each other still see three traces of one another (an owner's or admin's Board post, unread counts, reply and vote counts). The store reviewer's account has the new chat now.

## 6. The mini messenger (Franky, Oct 5: "we need to fix the mini messenger view")

The small Messages window over the desktop profile page: `public/html/_miniMessenger.js`, loaded by `profile.html` and `_profilePreview.js`. The redesign never touched it. He did not say what the fix should be: **ask before building.**

- From his screenshot (the session's reading): each club room is still its own row ("SAE · Board", "SAE · Lounge"); a hidden test club's rooms show, with a person's photo where a logo should be; dates switch between "6d" and "9/12/2026"; no Your week, unread marks or pinned chats.
- **Choices, recommendation first:** (1) a small version of the new inbox that opens chats in `/messages`; (2) keep it and only fix the rows; (3) remove it on desktop.
- Check too that its "Open" lands on the new `/messages` and a club room goes to `/messages?channel=<id>`.

## 7. Open tabs follow the newest build (`7fc4cb4`)

Franky asked that everybody have the newest version on phone and desktop. Everything already did (one build on every address and device, nothing cached past a reload) except a tab left open.

- **What it does:** when a person comes back to a tab (at most once every two minutes) the page asks `GET /api/version` and reloads once if a newer build is live. Never in the middle of something: typed text, a changed pick-list or switch, a chosen file or open file picker, an open sheet or dialog, a save in flight, a video playing, or anything marked `data-holds-reload`. A tap, key or scroll before the answer arrives cancels it. Never on `/auth`, `/onboarding`, `/waitlist`; off inside the store apps.
- **Where:** `src/lib/build/` (rules, 51 tests), `src/components/build/BuildRefresh.tsx` (root layout), `src/app/api/version/route.ts`, `next.config.ts` (build id = Vercel's deployment id), and `public/html/_buildRefresh.js`, a hand-copied twin for the static desktop profile: a rule added on one side must be added on the other.
- **How it was checked:** two independent reviewers attacked it and each found one real problem (unsaved phone profile edits could be lost; an open file picker was not counted). Both fixed.
- **Seen live:** `/api/version` answers a `dpl_` id; the page's own files carry the same id, so nobody reloads on the build they already have; a page left open did not reload.
- **Not seen yet:** a real reload after a deploy (tabs open before 9:51 pm have no watcher, so the first build it helps with is the next one), a real phone, Safari, the home-screen app. If tabs ever reload on every return, revert `7fc4cb4`.
- **For new work:** an editor whose unsaved state is not typed text or a labelled dialog should carry `data-holds-reload` while dirty. Every deploy now refreshes people's open tabs, so avoid pushes that only redeploy.

## 8. Found and not fixed (small, none blocks)

- Phone feed: the Feed / Events / Orgs / Map chips have no background when posts scroll under them; a post card is a button holding buttons. A task chip is raised.
- `/profile` on desktop shows a piece of the cursor ring until the mouse moves.
- "Only you can see it" on removed content (the Vibe team can too); club lines that say "IU students only"; em dashes on the ban notice and Vibe+ page.
- The plain-text part of the waitlist emails has no privacy link.
- The new-build check: a control that saves in place holds the reload until the next page load; four desktop club dialogs and the Otto tour are not marked as dialogs.
- Committed handoffs hold some email addresses that may be real (counted, not opened): look before the repo is ever shared.

## 9. Local environment

- **Local branches worth knowing:** `desktop-hover-menu` (section 5), `release-s74` and `build-refresh` (both already on main). A worktree `.claude/worktrees/great-sammet-5b4b03` and an untracked `.agents/` folder belong to other sessions.
- **Scratch worktrees** under `/private/tmp/claude-501/-Users-franciscocazares-vibe/95993665-.../scratchpad/`: `release` (dev server config `vibe-release`, port 3105) and `release-gate` (a clean clone for builds). They may not survive a restart; nothing in them is unsaved.
- The local database has all ten files; local `signup_open` is true; the local hook is on through `config.toml`.
- The film, the photos and the walk stills stay outside the repo.

## 10. Gotchas learned in S74

- **The weekly usage limit stopped everything at noon on Oct 4** and cost a day. Cap check-and-repair loops at two rounds, use a lighter model for pure transcription, and look at the working tree after a kill: two agents had finished on disk without reporting.
- **A visual checker that reads hundreds of full-page stills dies at its own context limit.** Measure with scripts and look at a few stills.
- **The Vercel connector works when called without the team slug** (project id `prj_1MXN7zjFs3kWIAX1fZ7VP6fq7ae9`); the old 403 came from the slug. Read plain settings only. A changed value only reaches a new deploy.
- **A reviewer earns its place twice:** both reviews of the new-build check found a way to lose someone's work that the builder's own checks had passed.
- **zsh:** `"$REL:supabase/..."` is read as a modifier. Write `"${REL}:supabase/..."`.
- **The read-only database connector's role cannot call `signup_is_open()`** (harmless). Read the setting row.
- **Turbopack refuses a symlinked `node_modules`.** For a clean build of an exact commit, clone it with `cp -cR`.
- **The background keep-awake helper is cut at two hours.** Stay in the turn while jobs run, or ask the app to keep the Mac awake.
- **The Browser pane's tab reads as hidden**, so "come back to the tab" cannot be triggered there.
