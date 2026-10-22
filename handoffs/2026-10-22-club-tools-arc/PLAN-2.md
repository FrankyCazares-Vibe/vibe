# Part 2 (Oct 22, 2026): tools open in place + "Members only" events

Franky, after shipping `44b0923` / `b672927`:
1. In the Arc, pressing a card's "Open Join requests" / "See all members" / "Change roles and titles" sends him to
   a whole other page, then "Club tools", then the club, to get back. He wants it to open IN PLACE, "like how
   Otto does it, where it brings in your screen", or "the planet orb expands and turns into that".
2. "Yes, apply that switch: Everyone or Members only" for club events (fraternities: chats private, some events
   private). His yes covers the database change too (rehearse locally, pre-flight production, apply BEFORE the
   code deploys, post-check).

Inventories (read them, they are exact): `TOOLS-MAP.md` and `EVENTS-MAP.md` in this folder; key facts
are copied below. Branch `claude/club-page-in-shell-0b76e3`, after `b672927`.

## Decisions
**Tools in place (computer only; phones keep the /tools pages unchanged):**
- A card's full-page action ("Open Join requests", "See all members", "See all followers", "Change roles and
  titles", "Open Club settings", the tools index, the members' link / setup) no longer navigates. It opens the
  **tools panel**: the planet grows (its gradient circle scales out from the planet's centre, then fades) into a
  panel that slides in from the right edge, full height, about 560px wide (max: window less 280px), like Otto's
  side panel. Header: ← back to the arc, the tool's title, ×. The arc folds into the planet while the panel is out.
  ← closes the panel back to the arc (reverse motion); × or Escape (when no sheet is open) closes everything.
- The panel hosts the EXISTING screens: RequestsScreen, MembersScreen (mode members / officers), FollowersScreen,
  SettingsScreen, ToolsIndex (as "All Club tools"), and the setup list / members' link (SetupScreen). Their own
  page chrome is hidden (`embedded`), internal tools links switch the panel's screen instead of navigating,
  "Edit the page" closes the panel and opens Edit page directly (a module opener, not `?edit=1`), "Past events"
  closes it and goes to the Events tab. Settings' leave/delete close the panel and refresh / go as today.
- Motion: springs.ts only, transform and opacity only, reduced motion = fades.
- The panel lives inside the Arc root (z 1000): modals the screens open later (Upload photo, Create event) portal
  after it at the same z and so draw above; vaul sheets are at 10000.

**Members only events:**
- `events.visibility text not null default 'everyone' check (visibility in ('everyone','members'))`.
- A members-only event is seen only by the club's members (any role) and platform admins. Not by followers, not
  by ex-members (the RSVP arm of `event_visible` does NOT apply to members-only events), not signed out.
- Officers set it when creating or editing an event: "Who can see it: Everyone / Members only" (default Everyone).
- Everywhere an event shows (event card, Tonight card, event panels in Messages), a members-only one carries a
  small "Members only" chip (lock glyph). Members see these in the campus Events list and Tonight too.
- Only members can RSVP or self check-in to a members-only event; officers' marks are already RSVP-list-only.
- A members-only event can't be put on the Board as a card (followers read the Board); follower reads (the club
  space, the Board page, Board previews) leave out members-only events and their cards, which also covers an
  event flipped to members-only after it was carded. A flip to members-only deletes upcoming RSVPs from
  non-members.
- `event_checkin_mine` (your own check-in history in Settings) is unchanged: it's your own record.
- Privacy Policy changes the same day (5b, the section 5 table, 5f), effective **October 22, 2026**.

## Batches (strict file ownership; nobody but the lead edits `src/app/orgs/[handle]/page.tsx`)

### E1 · Members only: database + server
Owns: NEW `supabase/migrations/20261025100000_event_visibility.sql`; `src/app/api/events/route.ts`,
`src/app/api/events/[id]/route.ts`, `src/app/api/events/[id]/rsvp/route.ts`,
`src/app/api/orgs/[slug]/space/route.ts`, `src/app/api/me/threads/[id]/cards/route.ts`,
`src/app/api/me/club-boards/route.ts`, `src/lib/chat/cards/hydrate.ts`, `src/lib/chat/message-read.ts`,
`src/lib/chat/event-refs.ts`, `src/lib/chat/types.ts` (EventRef gains `visibility`), `src/lib/events/validate.ts`,
`src/lib/events/event-item.ts` (add the key LAST: event-item.test pins order), `src/lib/events/notify-cancel.ts`,
`src/app/api/me/calendar/route.ts`, `src/app/api/me/upcoming-events/route.ts`, `src/app/api/me/otto/route.ts`,
`src/app/api/search/route.ts` (only to pass `visibility` through), and their tests.
- Migration: the column + CHECK; rewrite `event_visible(org_id, creator_id, event_id)` keeping its signature
  (reads the event's visibility by id; members-only: an `org_members` row for the caller or
  `users.is_platform_admin`; the RSVP arm only for `everyone`), behind an md5 drift guard on its CURRENT body
  (local md5 `ca3d34f65cb01af1a826df053d97b384`; read it, don't trust this note); a helper
  `event_audience_ok(p_event_id uuid, p_user uuid)`; `rsvps_insert_own` / `rsvps_update_own` WITH CHECK gain it;
  `event_checkin_self_as` refuses a non-member on a members-only event; `chat_create_event_card` refuses a
  members-only event in a Board room. Every function you redefine: copy its CURRENT body from the newest
  migration that defines it (and compare with the local catalog), change only what's needed, guard with its md5.
  Header in the house style (PLAIN ENGLISH, pre-flight, post-check, rollback, apply steps). Safe to run twice.
  You MAY rehearse it on the LOCAL stack only (`docker exec -i supabase_db_vibe psql -U postgres -d postgres
  -v ON_ERROR_STOP=1 < file`: apply, check, apply again, rollback, apply) and leave it applied locally with its
  `supabase_migrations.schema_migrations` row. NEVER production; never `db reset`.
- Server: create/edit accept and validate `visibility` (enum, not a text field); edit to `members` deletes
  upcoming RSVPs of non-members (service role) and refreshes cards; `rsvpBlocked` answers 404 to a non-member
  on a members-only event; the follower club space reads only `everyone` events; follower Board reads
  (`readFollowerPage`, `hydrateCards` for followers, Board previews) drop cards of members-only events; the
  cards route refuses a members-only event in a Board room (a clear error code); `notify-cancel` unchanged
  unless trivial. `visibility` flows to every payload listed (EventRef, CampusEvent rows, calendar entries,
  upcoming, Otto upcoming, search).

### E2 · Members only: the UI
Owns: `src/app/campus/campus-home.tsx` (CreateEventModal's "Who can see it" control, the `CampusEvent` type's
`visibility?: "everyone" | "members"`, EventCard's chip), `src/components/campus/tonight/TonightCard.tsx`,
`src/components/desktop/messages/EventPanel.tsx`, `src/components/mobile/messages/club/EventAbout.tsx`,
`src/components/mobile/messages/compose/ShareEventSheet.tsx` (the Board option off for a members-only event,
with a one-line why), `src/components/mobile/messages/cards/EventCardView.tsx`, and a small shared chip
component under `src/components/events/` (new). The control is a two-option segmented choice with one quiet
line: "Members only: only members of <club> see it." Edit keeps the current value. Theme tokens, 44px targets.

### E3 · Privacy Policy
Owns: `src/app/legal/privacy/*.tsx`, `handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md`, NEW
`src/lib/legal/event-visibility-policy.test.ts`. Update 5b (club events: "except an event its club marks Members
only, which only its members see"), the section 5 table rows on check-in counts and RSVPs, 5f's officers' lists,
and anywhere else that now says too much (the inventory names sections-1-3.tsx:210-219, sections-4-5-a.tsx:56,
sections-4-5-b.tsx:67-68). The two copies must match word for word; set the effective date to
"October 22, 2026" in both (page.tsx `EFFECTIVE_DATE` and the text file's line 3); run the checker
`node handoffs/legal-2026-10-04-privacy-v3/check/check.mjs` and the legal tests. Plain words, the policy's voice.

### T1 · Tools open in place
Owns: `src/app/orgs/[handle]/club-page/ClubToolsLauncher*.tsx`, `club-tools-arc.ts`, `club-tools-launcher.ts`,
`OfficerActions.tsx`, NEW `src/app/orgs/[handle]/club-page/ClubToolsPanel*.tsx` (or similar),
`src/components/orgs/tools/tools-ui.tsx` (ToolsHeader `onBack`), `ToolsIndex.tsx` (`onOpen`),
`SettingsScreen.tsx` (`onLeft` / `onDeleted`), `src/app/orgs/[handle]/setup/SetupScreen.tsx` (+ `SetupList.tsx`,
`StepPanels.tsx` only if needed: `embedded`, `initialStep`, `onClose`), and in `src/app/globals.css` ONLY the
block that starts `/* Club tools on a computer, the Arc (ClubToolsLauncher.tsx`. Defaults keep every phone page
exactly as today. The launcher may need two more props from the page (`setup` for the setup screen and the
officer's `role`): add them as OPTIONAL props and tell the lead the exact JSX.

## Lead
Wire page.tsx, run everything, rehearse/verify the migration, walk (computer + phone), whole-change review,
then ship: pre-flight production (catalog/md5/counts only), apply the migration, rename its schema_migrations
row, post-check, THEN push the code (the code needs the column), check the deploy and the page live.
