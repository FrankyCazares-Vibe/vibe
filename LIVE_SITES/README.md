# Live Sites

Public URLs, dashboards, and entry points for Vibe.

> **Note on internal docs:** the spec, handoffs, and finance sheet live in `DOCS/` and `handoffs/` — both are excluded from git via `.gitignore` and exist only on Franky's local machine. They're not visible from GitHub. Any reference to them in this file is informational; open them locally.

## Production site

- **Canonical URL:** https://www.connectvibe.app
- **Apex:** https://connectvibe.app → 301 to `www`
- **Vercel alias (don't share this):** https://vibe-mocha-iota.vercel.app
- **Product journal:** https://www.connectvibe.app/journal/vibe_journal.html

## Demo entry points (for James + Rylan to share)

Share `https://www.connectvibe.app` — landing, login, and onboarding all live there.

Direct routes (signed-in):

- Campus: https://www.connectvibe.app/campus
- Profile: https://www.connectvibe.app/profile
- Network: https://www.connectvibe.app/network
- Messages: https://www.connectvibe.app/messages
- Otto: https://www.connectvibe.app/otto
- Onboarding: https://www.connectvibe.app/onboarding

Legacy static HTML under `/html/*.html` still exists for prototypes; do not send testers there.

## Repository

- **GitHub repo (private):** https://github.com/FrankyCazares-Vibe/vibe
- **Default branch:** `main`
- **Auto-deploy:** every push to `main` triggers a Vercel production deploy
- **Account owner:** FrankyCazares-Vibe (separate from any personal GitHub)
- **Clips restore tag:** `clips-before-backlog` (`a0734fc`) — see local `DOCS/BACKLOG_CLIPS.md`

## Vercel dashboards (Franky only)

- **Project home:** https://vercel.com/fracazar-1988s-projects/vibe
- **Deployments list:** https://vercel.com/fracazar-1988s-projects/vibe/deployments
- **Git settings:** https://vercel.com/fracazar-1988s-projects/vibe/settings/git
- **Environment variables:** https://vercel.com/fracazar-1988s-projects/vibe/settings/environment-variables

## External services

- **Supabase:** dashboard for the linked project (Auth, SQL, Storage). Was paused over an unpaid Pro invoice May 2026; resumed Session 49. Health: `/api/health/supabase`, `/api/health/auth`
- **Cloudflare R2:** post-video objects under the legacy `clips/` prefix. Health: `/api/health/r2`
- **Resend:** transactional email. Health: `/api/health/resend`. Custom SMTP for Supabase Confirm email is still TBD.
- **Sentry:** error monitoring. Health: `/api/health/sentry`

---

_Last updated: 2026-09-02 (Session 49)_
