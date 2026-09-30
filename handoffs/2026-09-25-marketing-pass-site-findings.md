# Live-site findings from the marketing pass (2026-09-25)

Found while building `~/vibe-marketing` (signed-out screenshots of connectvibe.app, plus a read of the code and the journal). None of these are fixed yet. Ordered by how much they matter before the marketing push.

## Fix before the first marketing post

1. **The product journal is public.** Anyone signed out can open `/journal/vibe_journal.html`. Its summary still pitches the April idea ("LinkedIn has a monopoly… the network where your AI agent lives"), lists internal sections (Strategy, IU Meeting, Next Steps, Session Log) and says "Changes from Claude conversations persist here automatically". Recommendation: gate it behind admin, or move it out of `public/`, before any teaser goes out.
2. **The site description is the retired career tagline.** `src/app/layout.tsx` and the manifest say "Your campus, your career, one profile." The landing sign-up card repeats it. Link previews on Instagram and iMessage will show this line. Recommendation: switch to the roadmap line once the founders pick the one-liner.
3. **No Open Graph image.** Shared links get no preview picture. Recommendation: one 1200×630 image with the logo on cream.
4. **Terms and Privacy still say "clips" and carry the "baseline draft… review with counsel" banner,** dated May 7, 2026. The Terms rewrite is already on James's path (~Oct 14); the "clips" wording should change in the same pass.

## Fix before demo days

5. **Signed-out club pages show an error.** On desktop, the SAE page's "Upcoming Events" box reads "You've been signed out. Sign in and try again." because the events request returns 401 for visitors. Should be an empty state or "sign in to see events."
6. **SAE page copy.** "Where men become true gentleman" (should be "gentlemen"; "Sigma alpha epsilon" capitalization). Fix on the page itself, since Rylan's first real signing is SAE.
7. **Demo-day prep is required.** A club must be created on a laptop and verified in `/admin` before an officer can post an event or send invites. Creating a club is computer-only today. Recommendation: either make club creation work on phones or add "create + verify the club the night before" to Rylan's demo-day checklist.
8. **The SAE cover photo shows about 13 real students' faces.** Fine on the site (members chose it), but no marketing screenshot may use it. The marketing copies were retaken with the cover swapped out.

## Polish

9. **Custom cursor dot sits at screen center on load** (`.vibe-cursor`) until the mouse moves; it covered the "o" in "welcome" on the landing page.
10. **Landing hero types for ~9 seconds.** For the first seconds the page reads just "I'". On phones, the first screen is mostly empty dark space above a "SCROLL" hint.
11. **Auth pages have a thin lighter strip (~16px) around the gradient panel** on desktop and phone.
12. **Fraunces loads only weights 400/700/900 but the CSS uses 600 and 800.** Browsers fake those weights.
13. **`DOCS/DESIGN_SYSTEM.md` drifts from the code**: the logo's orange (`#FC6B2F`) and black (`#1A1A1A`) differ from the palette's (`#FF5C35`, `#1C1C1E`); the two purples are undocumented; the UI kit CSS overrides `--accent`, `--muted`, `--border` with greys (users don't see it because hex values are hard-coded).
14. **`LIVE_SITES/README.md` is stale** (Sept 2): says the repo is private (it's public) and Resend SMTP is TBD (done in S54).
15. **The journal header still reads "v5.4 — Session 42 / Last updated May 3"** while the content is v7.8. Its Executive Summary, Vision, Strategy and Design Language sections still describe the April product.

## Unconfirmed on a real phone (the inventory marked these UNSURE)

- @mentions picker (older code, never tested on a phone)
- starting a group chat from a phone (found only in the desktop Messages)
- Otto settings (choices save, but nothing sends nudges until push is on)
- the unread count on the app icon
