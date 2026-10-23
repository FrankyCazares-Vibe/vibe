# Club view wave 3: handoff (Oct 23, 2026)

Plan: `PLAN.md` (this folder). Two parts.

## Part 1, shipped Oct 23 (main `02e0fed`, merged as `3d8d3cd`; no database change, no Privacy Policy change)
Checked live: `/orgs/sae` names `/orgs/sae/opengraph-image`, which answers SAE's own card (crest, name, bio).
- **Up next with its steps** (owner and officers; everyone else keeps the event card): one card with the time and
  place, a badge, the five steps (Posted · Going · Check-in · Who came · Thank-you) and one button that is the next
  thing to do: Share the event (+ Edit) before; Start / Show check-in (+ Who came) in the check-in window; Post a
  thank-you (+ See who came) for 72 hours after, until the club posts. The thank-you opens the post form with a
  starter text that never names a Members only event. Pure logic + 18 tests: `club-page/up-next-steps.ts`.
- **Share sheet:** Share page (officers' pill and members' square) opens a sheet with the club's link picture,
  Send it (when the device has a share sheet), Copy link, and for officers QR for your table.
- **The club's link picture:** `src/app/orgs/[handle]/opengraph-image.tsx` + `twitter-image.tsx`
  (`src/lib/og/club-card.tsx`, rules in `club-card-content.ts` + 11 tests): the club's own background, campus line,
  logo or initials, name, bio line, "Follow us on vibe." + @handle. A hidden or missing club gets the site's
  picture and never its name. Logos: PNG/JPEG only (GIF/WebP draw the initials). Arabic/Hebrew names fall back to
  the site's card (renderer limit).
- **Signed-out limit:** the two picture routes now count against the signed-out read limit like the club page
  (`src/lib/security/anon-read-limit.ts`, tests updated).
- **Table card:** `/orgs/<h>/table-card` (owner and officers; others go to the club page; hidden = 404 outside):
  a cream 5 × 7 in card with the club's QR, Print and Back to the club; prints one page.
- Walked locally (Maya officer, Blake member) at 390 and 1440: Up next picked a just-ended local test event (Thank-you
  step, "Check-in wasn't run.", starter text right), members unchanged, the sheet with the picture, the officer-only
  QR row, the table card on screen and in print, the member redirect, the picture PNG for a real and a missing club.
  The local test event was deleted afterwards.

## Part 2, shipped Oct 23: event icons (Franky's yes in this session)
- Production: pre-flight [f | 0; anon f|f, authenticated f|f; t | t; 22 events; last 20261026100000], applied
  with the connector, history row renamed 20261023180122 → 20261027100000 `event_icons`, post-check [text, null,
  no default; events_icon_check the only rule, validated; 22 | 0 with an icon; grants as before].
- Privacy Policy effective October 23, 2026: 3c "the icon its club picked for it" (page + text; checker PASS;
  `src/lib/legal/event-icons-policy.test.ts`).

### Part 2 as built (kept for the record)
- Migration `supabase/migrations/20261027100000_event_icons.sql` (`events.icon` text null + a CHECK of twelve keys;
  PRE-FLIGHT / POST-CHECK / ROLLBACK in its header). Applied on the LOCAL stack only.
- Code (kept out of main until the migration is on production): `src/lib/events/event-icons.ts` (+ test),
  `event-item.ts`, `validate.ts`, `src/app/api/events/route.ts` + `[id]/route.ts`, `campus-home.tsx` (CampusEvent,
  CreateEventModal picker, EventCard tile), `OrgPastEvents.tsx`, and the event tests.
- **Order:** Franky's yes → pre-flight on production → apply → rename the history row → post-check → push the code →
  the Privacy Policy line (section 3c "the icon each shows"), its .md twin, EFFECTIVE_DATE, checks.mjs, all the
  same day. Before the column exists, every events list, create, edit and cancel would fail, so never the other way.

## Open
- QR scanning not checked with a real phone camera (same encoder as the door screen).
- Story cards, event pages, notices: week 1 (BUILD-ORDER.md). Hand-over moved to week 1.
