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
- **Push:** health at `/api/health/push`

---

_Last updated: 2026-10-13 (notes on internal docs, static pages, deploys and services brought up to date; the dashboard links are as of 2026-09-02)_
