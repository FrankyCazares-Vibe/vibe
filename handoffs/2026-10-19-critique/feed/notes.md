# Feed critique notes (Oct 19, 2026): MOBILE 1 and MOBILE 2

How these were made: headless Playwright on the local dev server, seed account blake,
390x844 iPhone and 1440x900. Every non-GET request was stubbed in the browser
(scripts/common.mjs), so nothing was written to any database. The like/save stubs keep a
simulated "server truth" that the single-post read (/api/posts/[id]) reflects, like the
real server would.

## MOBILE 1: like/save do not carry between the feed card and the post viewer (REPRODUCED)
scripts/like-sync.mjs, scripts/save-sync.mjs
- A: open post, like in viewer (viewer heart 1, coral) -> close -> card still 0, unpressed (m1-1, m1-2)
- reopen -> viewer shows liked again (it re-reads the server) (m1-3)
- C: like on card (1) -> open viewer (liked) -> unlike in viewer (0) -> close -> card still 1, liked (m1-4)
- Save: saved in viewer -> close -> card's bookmark still "Save", unpressed
Cause: FeedCard seeds useState once (CampusMobile.tsx:1877-1881); PostViewerMobile keeps
its own copy from /api/posts/[id] (PostViewerMobile.tsx:192-199, 315-360); nothing flows
back (CampusMobile.tsx:1342-1365 passes onClose/onDeleted/onBlocked/onEdited only).

## MOBILE 2: friend-repost pill (RENDERED WITH INJECTED TEST DATA)
The local DB has 0 post_reposts rows, so scripts/repost-pill.mjs injects
friend_reposters into the first 3 /api/feed posts in the browser (Maya Okafor, Jonah Reyes,
Hana Sato; counts 1, 7, 2). Not real data.
- Phone (m2-phone-repost-pill-today.png): green pill under the tags, 28px tall, 189-297px of
  a 358px card; two full names push it to 83% width; blank peach avatars (no initials).
- Desktop (m2-desktop-repost-pill-today.png, m2-desktop-pill-under-kebab.png): a full-width
  green bar (634 of 672px) above the author, and the post's ⋯ button sits on top of its
  right end (measured overlap). Cause: the article is a flex column
  (campus-home.tsx:8364-8366), so the pill's inline-flex becomes a stretched flex block.
