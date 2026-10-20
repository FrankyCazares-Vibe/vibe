# Live Sites

Public URLs, dashboards, and entry points for Vibe.

> **Note on internal docs:** `handoffs/` (session notes, plans, contracts) is committed to this private repo. `DOCS/` (the old spec and finance sheet) is excluded by `.gitignore` and exists only on a founder's Mac, so any reference to it here is informational.
>
> For how the code works, see `README.md` and `ARCHITECTURE.md` at the repo root.

## Production site

- **Canonical URL:** https://www.connectvibe.app
- **Apex:** https://connectvibe.app → 301 to `www`
- **Vercel alias (don't share this):** https://vibe-mocha-iota.vercel.app
- **Product journal:** private since Sept 28, 2026: not deployed and not in git; it lives only on Franky's Mac at `journal/vibe_journal.html` (gitignored)

## Demo entry points (for James + Rylan to share)

Share `https://www.connectvibe.app` — landing, login, and onboarding all live there.

Direct routes (signed-in):

- Campus: https://www.connectvibe.app/campus
- Profile: https://www.connectvibe.app/profile
- Network: https://www.connectvibe.app/network
- Messages: https://www.connectvibe.app/messages
- Otto: https://www.connectvibe.app/otto
- Onboarding: https://www.connectvibe.app/onboarding

Event check-in (live since Oct 19) has two more pages; don't share them: `/campus/checkin/<event id>/door` (the officers' screen with the code and QR, opened from the event card) and `/campus/checkin/<event id>` (where the door's QR lands; it has a code box too).

Do not share `/html/*.html` addresses. Three static pages there are still part of the desktop app, but they are reached through the clean routes above (see `ARCHITECTURE.md`, section 4).

## Repository

- **GitHub repo (private):** https://github.com/FrankyCazares-Vibe/vibe
- **Default branch:** `main`
- **Auto-deploy:** every push to `main` triggers a Vercel production deploy, except a push that only changes `handoffs/` (`ignoreCommand` in `vercel.json`)
- **Account owner:** FrankyCazares-Vibe (separate from any personal GitHub)
- **Clips restore tag:** `clips-before-backlog` (`a0734fc`) — see local `DOCS/BACKLOG_CLIPS.md`

## Vercel dashboards (Franky only)

- **Project home:** https://vercel.com/fracazar-1988s-projects/vibe
- **Deployments list:** https://vercel.com/fracazar-1988s-projects/vibe/deployments
- **Git settings:** https://vercel.com/fracazar-1988s-projects/vibe/settings/git
- **Environment variables:** https://vercel.com/fracazar-1988s-projects/vibe/settings/environment-variables

## External services

The `/api/health/*` routes answer platform admins only.

- **Supabase:** dashboard for the linked project (Auth, SQL, Storage). Was paused over an unpaid Pro invoice May 2026; resumed Session 49. Health: `/api/health/supabase`, `/api/health/auth`
- **Cloudflare R2:** post-video objects under the legacy `clips/` prefix. Health: `/api/health/r2`
- **Resend:** transactional email. Health: `/api/health/resend`. Custom SMTP for Supabase Confirm email is still TBD.
- **Sentry:** error monitoring. Health: `/api/health/sentry`
- **Cloudflare Turnstile:** the "are you a person" box on sign-in and sign-up. How to turn it on and off: `src/lib/auth/captcha.ts`
- **Stripe:** Vibe+ billing, built and switched off in production. Settings: `src/lib/billing/config.ts`
- **Push:** health at `/api/health/push`. Parked until Apple accepts the store apps. Production has no `push_outbox` table yet (its migration was never applied; found Oct 19)
- **School calendars (read only):** the public iCal feeds behind "What's the vibe tonight?"; code in `src/lib/school-events/`
  - Hosts: Indianapolis reads IU Indy athletics (`iuindyjags.com`) and two IU Indianapolis calendars on `events.iu.edu` (groups 24 and 342). Bloomington, on since Oct 19, reads IU Athletics (`iuhoosiers.com`) and two IU Bloomington calendars on `events.iu.edu` (groups 76 and 341). The exact addresses are fixed in `sources.ts`, never taken from a request.
  - Who reads them: only the server, for `GET /api/school-events` (`read-server.ts`). A 4-second timeout, redirects refused, each calendar read about once every 2 hours (Next's cache). The request names the app but carries no person's data.
  - When one is down: a calendar that is down, slow or refuses is skipped. Its last good list shows for up to 24 hours, then nothing. The other calendars and the page carry on (never a 500).
  - Off switch, either one wins: the env `SCHOOL_EVENTS_OFF` (from the next deploy) or the `app_settings` row `school_events_off` (in about 30 s, no deploy; a production write, so Franky's OK first). `true` turns every calendar off. A list of calendar keys or campus ids (commas in the env, a JSON array in the row, like `["iub-athletics"]` or `["iu-bloomington"]`) turns just those off. Rules and the SQL: `switch.ts`.
  - Before rolling production back to any build older than `a3215a1` (`7c35593` or older), clear any `school_events_off` row or `SCHOOL_EVENTS_OFF` value that holds a Bloomington word (an `iub-*` key or `iu-bloomington`): an older build turns every calendar off, Indy included, when a list names only words it doesn't know.
  - Open: `iuhoosiers.com` sits behind Imperva and may refuse Vercel; not checked in production yet. If it refuses, Bloomington loses its games only. No Content-Security-Policy change was needed: the browser never fetches these hosts, and `src/lib/security/csp.ts` lists none of them.

---

_Last updated: 2026-10-19 (school calendars added to External services, the event check-in pages, a push note; the dashboard links are as of 2026-09-02)_
