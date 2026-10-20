# Profile critique (Oct 19, 2026), read-only reproduction

How: headless Playwright on localhost:3000 (local DB), seed account `franky` as owner,
`/profile/hanasato` as the visitor view. 1440x900 @2x and 390x844 iPhone. Every non-GET
was aborted (only heartbeat and profile-views fired, both blocked). The local DB has 0
bookmarks and 0 reposts, so `/api/me/bookmarks` and `/api/users/*/reposts` were MOCKED
with real local post rows (3 with photos, 2 text-only). Nothing was written.

- D1 composer vs tabs: `.content-tabs { margin:-28px -28px 20px }` (profile.html:2000-2003)
  pulls the tab row 28px up; the composer above it has only 16px margin, so the tabs sit
  12px INSIDE the composer box (measured gap = -12px, light and Night). Visitor view is fine.
  Shots: desk-owner-composer-tabs-zoom.png, desk-owner-night-composer-tabs-zoom.png,
  desk-visitor-tabs-reposts.png (the look the -28px was made for).
- D2 Saved privacy: owner only. RLS `bookmarks_all_own` (auth.uid() = user_id),
  `/api/me/bookmarks` reads only the caller's rows, tab hidden for visitors on both twins.
  Shots: desk-visitor-tabs-reposts.png (no Saved tab), phone-visitor-tabs.png.
- D3 Saved "chat boxes": desktop `_buildSavedCell` (profile.html:11112-11126) always builds a
  text tile and never reads media_url; phone SavedGrid shows the photo when there is one and
  a grey text tile when not. Shots: desk-owner-saved.png, desk-owner-night-saved.png,
  phone-owner-saved.png, phone-owner-night-saved.png.
- D7 Apple repost emoji: profile.html:10987 `&#128257;` (U+1F501). Phone uses the SVG
  IconRepost (ProfileMobile.tsx:5878). Shots: desk-owner-reposts.png, phone-owner-reposts.png.
