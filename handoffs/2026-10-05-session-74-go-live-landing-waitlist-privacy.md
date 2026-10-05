# Session 74 (Oct 4-5): the new landing page, the waitlist and Privacy Policy v3 are LIVE

S74 started from `2026-10-04-session-73-privacy-v2-desktop-messages.md`. Franky asked for the new landing page and the Messages feature on main, then for "the best privacy policy you can right now without any of my input". He chose: close sign-up and turn the waitlist on, no backups, only he has direct access, mail forwards to his Gmail, the counts-only rule for AI tools, publish now with the lawyer reading in parallel, and "go when green".

**Live since Monday Oct 5, 12:24 EDT: main = `50b60d2`.** Sign-up is closed, the waitlist is open, the access-code check is on. Desktop Messages is on main but still switched OFF.

## START HERE: session 75

1. **Ask Franky** how his live test went (section 4, first row) and whether the Vercel Cron "Run" answered 200.
2. **Desktop Messages** is one small step from on: the hover-menu fix (section 5) needs a review and a merge, then Franky's ten minutes on a real phone, then his two Vercel values and a redeploy.
3. **Privacy follow-ups**, in the order of `handoffs/legal-2026-10-04-privacy-v3/page-and-code-changes.md` (parts 2 and 3). First: tell the existing accounts, open one live Sentry report, the "verify your campus" gap (row 26), the hand-kept promises in `decisions.md` part D.
4. **Give James** `handoffs/legal-2026-10-04-privacy-v3/for-the-lawyer.md` (the lawyer's questions).
5. **Still dated:** Terms review answers (Tue Oct 6), Android build (Fri Oct 9), old-screen chat fixes and both sentinels before Thu Oct 15, store submission Fri Oct 16 (the review note in section 4), new chat for everyone Mon Oct 26.

## 1. What went live

- **The new landing page** ("campus at night", the panels, "A day on Vibe" with the 30-second film from Vercel Blob).
- **The waitlist:** `/waitlist`, the confirm and leave links, Admin > Waitlist, access codes at sign-up, the daily clean-up (`/api/cron/waitlist-purge`).
- **Privacy Policy v3**, effective October 5, 2026 (section 3).
- **Desktop Messages code**, behind `chat_desktop` (off), with its two database files applied. Founders and SAE got the small phone chat changes from S73 with this deploy.
- **A fix that rides along:** bug reports to Sentry no longer carry what a person was sending, their sign-in cookie or a rough location (`src/lib/sentry-config.ts`, 34 tests, checked against the installed kit).
- **Walk fixes:** the mouse pointer is back in windows under 900px, phone tap areas, half an access code gets a helpful message, Admin > Waitlist small things.

Gate on the exact commit: typecheck clean, 2,174 of 2,174 tests, build passes, waitlist end-to-end script passes, the policy page equals the text (1,087 of 1,087 sentences).

## 2. What was done to production (full log: `handoffs/s74-release/prod-log.md`)

| What | Result |
|---|---|
| Ten database files, `20261003100000` to `20261004110000`, each with its row | All answered `[]`. 107 rows, newest `20261004110000`. File 4 (code scrub on the auth tables) was accepted. |
| `waitlist_email_viewers` | Franky's account id only |
| Push `c71e9a4..50b60d2` | Vercel Production deploy success, 12:24 |
| Sign-up hook | ON: `pg-functions://postgres/auth_hooks/hook_waitlist_gate` |
| `signup_open` | **false** since 12:25 |
| Gate, called directly with a made-up address | open: allow. Closed: no code = `access_code_required` (403), unknown code = `access_code_invalid`. No account was made. |
| Chat check after deploy (counts only) | 0 findings; 5 clubs, 22 rooms |

**To reopen sign-up fast:** `update public.app_settings set value = 'true'::jsonb, updated_at = now() where key = 'signup_open';` (buttons follow within a minute). The hook can stay on; open, it lets everyone through. Rollback order if sign-up ever breaks: switch to true, hook off, promote the previous deploy.

Every production read followed the counts-only rule (structure, fingerprints, counts, settings).

## 3. Privacy Policy v3

- **Where:** the page is `src/app/legal/privacy/*`; the text is `handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md` (about 12,700 words, 15 sections as questions, a ten-line short version, "Start here"). Section 11 is the waitlist notice (`/legal/privacy#waitlist`).
- **How it was made:** six assessors using the legal, design and marketing skills, a writer, three rounds of five checkers, a last repair with its own checker. `decisions.md` has every decision and why; `verify/` has the checkers' reports.
- **Check that page = text:** `node handoffs/legal-2026-10-04-privacy-v3/check/check.mjs` (needs a dev server; see its header).
- **Decided without Franky** (all in `decisions.md`): six cases for reading messages (the sixth: a fault that cannot be fixed any other way); a search warrant asked for before message content is handed over; a break-in notice within 30 days; an under-18 account banned then deleted within 7 days; requests answered in 30 days; emailed requests acted on only after the person answers our reply; no postal address published; Anthropic and Claude named, with the counts-only rule dated October 4.
- **Other pages brought in line:** delete-account, the waitlist form's notice (version `2026-10-05`), Terms (one line: the policy is the accurate one until the new Terms), Community, Child Safety, Support, Vibe+, Settings, six block dialogs. **The desktop profile badge now reads "Verified · school", not "Student · school".**
- **Left as it is, and said honestly in the policy:** the "verify your campus" step tells a signed-in person whether a school email is in use or banned (row 26); no backups; no access log; comments have no delete button.

**Franky's hands, privacy:**
1. Two-step sign-in on Supabase, Vercel, Cloudflare, Resend, Sentry, GitHub and the Gmail account.
2. His Claude account: is "help improve Claude" off? The policy says "not yet confirmed" in three places; item 7a of the change list has the replacement sentence.
3. A test email to hello@ and help@ from an outside address; check `SCHOOL_EMAIL_VERIFY_SECRET` exists on Vercel.
4. Tell the 21 existing accounts a new policy is live (the old policy promised notice). Claude can draft it.
5. Open one server error and one speed report in Sentry and read what they hold (item 9). The policy says "we have not yet opened a live report".
6. Before Oct 16: the data-processing terms of the providers (item 10), a written yes from each person in the film (item 5).

## 4. Franky's hands, go-live

| What | How |
|---|---|
| **Live test** | Signed out, in a private window: "Create your account" with no code must be refused in plain words. Then with James or Rylan (a school email that has no account): join the waitlist, confirm from the email, see the row in Admin > Waitlist, send a code in batch `test-1`, sign up with it. Remove the test entry after. |
| **Cron** | Vercel > Settings > Cron Jobs > `/api/cron/waitlist-purge` > Run. 200 = good. 401 = `CRON_SECRET` did not reach this deploy: Redeploy. |
| **One look in Light** | Admin > Waitlist > the Batch list, and Admin > Reports > Suspend > the reason list: the open list should be readable (no tool could photograph it). |
| **Real phones** | The landing page and `/waitlist` on an iPhone and an Android phone; the five small chat changes in SAE (S73 handoff, section 2). |
| **Resend** | 100 emails a day on the free plan: invite in waves of about 25 until upgraded. |
| **Store review note** (before Oct 16) | "Vibe is opening in waves; new visitors join a waitlist; please sign in with the review account." |
| **Sign-up rate limit** | Supabase > Authentication > Rate limits: look once. Do NOT switch CAPTCHA on. |

## 5. Desktop Messages: what is left

- Both database files are on production. The code is on main behind `chat_desktop`.
- **One fix is not on main:** with the switch on, the hover menu on a short message was squeezed into a ball when the chat column is narrow. A fix exists in the release worktree (`public/html/messages.html`, `MessagesDesktop.tsx`), but its first version was found to draw the menu behind the next message, and the repair has not been reviewed. `messages.html` is also the page every laptop uses today, so it was kept out of the release. Next: review it, merge, push.
- Then Franky: the phone walk, `CHAT_DESKTOP_ENABLED` = `true` and `CHAT_DESKTOP_ALLOWLIST` = the founders' ids (or `*` = everyone who has the new chat) on Vercel Production, Redeploy.

## 6. Found and not fixed (small, none blocks)

- Phone feed: the Feed / Events / Orgs / Map chips have no background when the feed scrolls under them; a post card is a button holding buttons (a console error). Old, `CampusMobile.tsx`.
- `/profile` on desktop shows a piece of the cursor ring until the mouse moves (`public/html/profile.html`).
- Old desktop Campus > Chat shows a poll as "Poll:" and an empty bubble (already owed before Oct 15).
- "Only you can see it" on removed content (four places): the Vibe team can too. Club lines that say "IU students only". The ban notice and Vibe+ page carry em dashes.
- The plain-text part of the waitlist emails has no privacy link.
- Committed handoffs hold some email addresses that may be real (a checker counted, did not open): look before the repo is ever shared.

## 7. Local environment

- Worktrees in the S74 scratchpad (`/private/tmp/claude-501/-Users-franciscocazares-vibe/95993665-.../scratchpad/`): `release` (branch `release-s74` = main, plus the uncommitted hover-menu fix; preview config `vibe-release`, port 3105) and `release-gate` (a clean copy of `50b60d2`).
- The local database has all ten files; local `signup_open` is true; the local hook is on through `config.toml`.
- The film, the photos and the walk stills stay outside the repo.

## 8. Gotchas learned in S74

- **The weekly usage limit stopped everything at noon on Oct 4** (about 12M subagent tokens that day) and cost a day. Cap check-and-repair loops at two rounds, use a lighter model for pure transcription, and look at the working tree after a kill: two agents had finished on disk without reporting.
- **A visual checker that reads hundreds of full-page stills dies at its own context limit, twice.** Measure with scripts and look at a few stills.
- **zsh:** `"$REL:supabase/..."` is read as a modifier (`:s`). Write `"${REL}:supabase/..."`.
- **The read-only database connector's role cannot call `signup_is_open()`** (permission denied, harmless). Read the setting row.
- **Turbopack refuses a symlinked `node_modules`.** For a clean build of an exact commit, clone it: `cp -cR`.
- **The keep-awake helper (`caffeinate` in the background) is cut at two hours.** Stay in the turn while jobs run, or ask the app to keep the Mac awake.
- **A session that may not create accounts on the live site can still prove the gate:** call `auth_hooks.hook_waitlist_gate` directly with a made-up address and read its decision.
