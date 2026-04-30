# Live Sites

Public URLs, dashboards, and entry points for Vibe.

> **Note on internal docs:** the spec, handoffs, and finance sheet live in `DOCS/` and `handoffs/` — both are excluded from git via `.gitignore` and exist only on Franky's local machine. They're not visible from GitHub. Any reference to them in this file is informational; open them locally.

## Production site

- **Main URL:** https://vibe-mocha-iota.vercel.app
- **Product journal:** https://vibe-mocha-iota.vercel.app/journal/vibe_journal.html
- **Custom domain:** TBD — see local `DOCS/PHASE_1.md` ticket P1-034 (candidates: `getvibe.app`, `vibe.cc`, `joinvibe.app`, `vibe.so`, `withvibe.com`)

## Demo entry points (for James + Rylan to share)

- **Landing → View demo:** https://vibe-mocha-iota.vercel.app/ — no signup required, lands on full Maya demo experience
- **Landing → Create profile:** https://vibe-mocha-iota.vercel.app/ — fresh-onboarded flow with empty states
- **Direct page links** (cleaner URLs ship later in Phase 1):
  - Feed: https://vibe-mocha-iota.vercel.app/html/feed.html
  - Profile: https://vibe-mocha-iota.vercel.app/html/profile.html
  - Otto: https://vibe-mocha-iota.vercel.app/html/otto.html
  - Campus: https://vibe-mocha-iota.vercel.app/html/campus.html
  - Network: https://vibe-mocha-iota.vercel.app/html/network.html
  - Messages: https://vibe-mocha-iota.vercel.app/html/messages.html
  - Opportunities: https://vibe-mocha-iota.vercel.app/html/opportunities.html
  - Onboarding: https://vibe-mocha-iota.vercel.app/html/onboarding.html

## Repository

- **GitHub repo (private):** https://github.com/FrankyCazares-Vibe/vibe
- **Default branch:** `main`
- **Auto-deploy:** every push to `main` triggers a Vercel production deploy
- **Account owner:** FrankyCazares-Vibe (separate from any personal GitHub)

## Vercel dashboards (Franky only)

- **Project home:** https://vercel.com/fracazar-1988s-projects/vibe
- **Deployments list:** https://vercel.com/fracazar-1988s-projects/vibe/deployments
- **Git settings:** https://vercel.com/fracazar-1988s-projects/vibe/settings/git
- **Environment variables:** https://vercel.com/fracazar-1988s-projects/vibe/settings/environment-variables (where Supabase + R2 + Resend + Sentry keys will live)

## Future external services (to be added in Phase 1)

- **Supabase project dashboard:** TBD — add link once project is created
- **Cloudflare R2 dashboard:** TBD — add link once bucket is created
- **Resend dashboard:** TBD — add link once account exists
- **Sentry project:** TBD — add link once wired

---

_Last updated: 2026-04-30 (Session 27)_
