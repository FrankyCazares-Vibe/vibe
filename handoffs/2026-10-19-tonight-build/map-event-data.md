# Map: event data (lens) — Oct 19, 2026

Read-only map for the Tonight build. File:line refs are to the tree at 7181bf3.

## 1. Tables

- `public.events` — supabase/migrations/20260430190000_phase1_initial_schema.sql:121-132
  - id, org_id (FK orgs; ON DELETE CASCADE since 20260928110000 §8), creator_id (FK users),
    title, description, starts_at timestamptz, ends_at timestamptz, location text, created_at.
  - No campus_id column on events. Campus of an event = its org's campus_id
    (fallback creator's campus for legacy org-less rows; 0 live).
  - No "featured", no category, no image, no visibility/audience column on events.
  - CHECKs (20260928110000_club_events_rules.sql §7): title 1..120 non-blank,
    description <= 2000, location <= 200, ends_at - starts_at <= 14 days, ends_at >= starts_at.
- `public.rsvps` — same file :134-141: (event_id, user_id) unique, status going|maybe|no.
- `public.personal_events` — 20260508130000_personal_events.sql:13 (user's private calendar, not campus).
- INSERT on events is service-role only (20260928130000_events_insert_service_only.sql);
  POST /api/events is the only writer.
- Live counts noted in migrations: ~13 events (Sept 27), all on clubs, 3 on hidden test clubs.

## 2. Who may SEE an event (RLS)

- Policy `events_select_visible` USING `event_visible(org_id, creator_id, id)`
  (created 20260922110000_t1_close_world_readable_selects.sql:302-303).
- Final `event_visible` body: 20260928110000_club_events_rules.sql:374-391:
  not anon AND (org-less & you created it) OR (club not hidden OR you are a member)
  OR you RSVP'd. => Any signed-in user sees every event of every non-hidden club,
  PRIVATE clubs included ("rush events are public on purpose").
  There is NO members-only event and no audience (IU only/Purdue only) filter at the row level.
- `event_rsvp_counts(p_event_ids)` — 20260922100000_t1_count_and_visibility_fns.sql:371-388:
  going_count + maybe_count per visible event, numbers only, max 1000 ids. NO floor (raw counts).
- RSVP write: `rsvps_insert_own`/`update_own` require not restricted + `rsvp_on_home_campus`
  (20260927100000_rsvp_home_campus_rls.sql:135-160) + `event_org_visible` (20260928110000 §3).

- Org `audience` (both|iu|purdue) is a JOIN label only, not an event filter
  (20260916103000_org_join_policy_invites.sql:594-599 comment; src/lib/orgs/join-state.ts:277).
- `orgs.hidden_at` => the org's events leave every list, members included (same comment, :602).
- Private (invite-only) clubs' events ARE visible to all signed-in users (SAE rush events).

## 3. GET /api/events (src/app/api/events/route.ts)

- Signature: `GET /api/events?limit=&org_id=&campus=<id|all>` (docblock :52-99).
  Signed-in only (401). Default limit 50, max 200, window = now..now+60d (:21-23, :143-146).
- Row filter: `ends_at >= now()` AND `starts_at <= now+60d`, order `starts_at asc` (:151-162).
  => already includes events HAPPENING NOW (started, not ended).
- Campus branch (:214-271): service-role read of orgs `in campus_id, hidden_at is null,
  verified = true` (cap 1000) -> events `.in(org_id, ids)` under viewer RLS; plus legacy
  org-less events by creator campus. Unverified clubs' events are NOT in the campus list
  (only on the club page via `?org_id=`).
- `?org_id=` branch (:194-208) bypasses campus, still drops hidden orgs.
- Hidden orgs dropped twice (:172-189 service read; :275 belt and braces).
- Org attribution joined with SERVICE client (:281-296) because orgs RLS nulls private orgs.
- Counts: `event_rsvp_counts` RPC with the VIEWER client (:333-352) -> going_count,
  interested_count (= maybe). Viewer's own RSVP read from `rsvps` (:338-342).
- `viewer_can_manage` from viewer's owner/admin memberships (:307-319).
- Campus scope: `resolveCampusRequest` (src/lib/iu/campus-request.ts:108-121) over
  `resolveScopeV2` (src/lib/iu/campus-scope.ts:226-252). No param = home campus;
  `?campus=<id>` any known campus (visiting is read-open since S67); `?campus=all` = own
  university; no home = every campus in the system ("none" kind).
  Indianapolis is ONE shared id `indianapolis` for IU + Purdue (src/lib/iu/campuses.ts:215).
- NO rate-limit call on GET /api/events (only POST: `event-create`, :413). Check budgets.ts.
- Response: `{ ok, events: EventListItem[], school, viewerCampus, viewerCampusId, viewerSystem, campusScope }`.

## 4. Item shape (src/lib/events/event-item.ts)

- `EVENT_ROW_COLUMNS` = id,org_id,creator_id,title,description,starts_at,ends_at,location,created_at (:18-19).
- `toEventListItem` (:66-97): row (club rows `creator: null`) + going_count, interested_count,
  viewer_status ('going'|'maybe'|null), is_creator, viewer_can_manage,
  org {id,handle,name,logo_url (proxied),verified}|null.
- Client mirror type `CampusEvent`: src/app/campus/campus-home.tsx:10246-10273 (exported).

## 5. Count floors in code today

- NO floor on event going/interested counts. EventCard prints raw `{going} going`
  (campus-home.tsx:~10746) and `Interested · N` (~10793). RPC returns raw numbers.
- Existing floors to reuse for the Tonight card's "under 5 not shown":
  - `FOLLOWER_COUNT_FLOOR = 5` + `publicFollowerCount`/`publicMemberCount`
    (src/lib/orgs/following.ts:109-138; twin const in src/lib/orgs/join-copy.ts:112, :692-694).
  - `MEMBER_COUNT_FLOOR = 5` (src/lib/chat/reads.ts:320-329).
  - `SMALL_CELL_FLOOR = 5` "<5" (src/lib/usage/view.ts:29, :385-395) (admin only).
  => A new `TONIGHT_COUNT_FLOOR`/`publicGoingCount(raw) => raw >= 5 ? raw : null` is needed;
  suggest putting it next to FOLLOWER_COUNT_FLOOR or in a new src/lib/events/tonight.ts.

## 6. Time zones

- Campus zone constant: `CAMPUS_TIME_ZONE = "America/Indiana/Indianapolis"`
  (src/lib/push/event-notice.ts:51; twin in src/lib/profile/club-flair.ts:37).
  `eventWhenText` / `eventShortDate` there pin to campus time (:64-90).
- Desktop `formatEventTime` (campus-home.tsx:11763-11791) uses the BROWSER's zone
  (`toLocaleDateString([], ...)`, no timeZone) — fine on campus, wrong for a far-away browser.
- No "start/end of today in campus time" helper exists in src/lib yet (grep). "Tonight" needs one
  (Intl offset for America/Indiana/Indianapolis; Indianapolis observes DST: EDT UTC-4 / EST UTC-5,
  switch Nov 1 2026).

## 7. How the clients load events

- PHONE (src/components/mobile/CampusMobile.tsx):
  - `eventsUrl = withCampus("/api/events?limit=50", viewingId, homeId)` (:267); `withCampus`
    adds `?campus=` only when visiting (src/components/campus/viewing-campus.ts:72-78).
  - Loaded ON MOUNT with the feed, for every /campus visit, not on tab open
    (`refetchEvents("first")` in the mount effect :751-758; loader :641-659; state `events` :303).
    => The phone Feed pane ALREADY has the club-events list in memory: the Tonight card can
    derive "club events tonight" from `events` with NO new request.
  - `EventsPane` (:2456-2511) maps `events` to shared `EventCard` (visiting flag passed).
  - Mutations: onMutate refetches + `stripData.refresh()`; onRemoved/onUpdated bump
    `eventsSeqRef` (:1113-1142). A Tonight card fed from the same `events` state stays in sync for free.
  - RollingStrip ("today.") = `useStripData` (:425-430) -> /api/me/upcoming-events?days=14
    (viewer's own RSVPs) + /api/trending/hashtags. Tonight card must not duplicate it.
- DESKTOP (src/app/campus/campus-home.tsx):
  - `EventsTabBody` (:10275-10518) fetches `view.url("/api/events?limit=50")` (:10289) only
    while the Events tab is mounted; own seq ref, refresh, dropEvent, swapEvent.
  - The desktop FEED tab does NOT load /api/events (only :10289 calls it in this file).
    => the right panel needs its own read (or lift the events state to the page shell so the
    Feed panel and the Events tab share one list — that is what "Going stays in sync" needs).
  - `EventCard` exported (:10565-10885): optimistic going/interested math, RSVP via
    PUT/DELETE /api/events/[id]/rsvp, `useIsMyClub` (one shared /api/orgs?filter=mine read,
    :10524-10563) for the "You'll appear in the event chat." line (members only).
  - `view.isVisiting` / `useCampusView()` drives RSVP-at-home-only.
- Club page: src/app/orgs/[handle]/OrgEventsSection.tsx:65,81 uses `?org_id=`.
- Other callers of the events table (for awareness, all service role or RSVP-scoped):
  /api/orgs/[slug]/space (readUpcoming :74-88, board latest + next 3 events per club),
  /api/search (events typeahead), /api/me/inbox, chat cards (src/lib/chat/cards/*).
- /api/me/upcoming-events (src/app/api/me/upcoming-events/route.ts): viewer's going/maybe RSVPs
  not ended, `?days=`; embeds `org:orgs(...)` under VIEWER RLS (so a private club's org is null
  for a non-member — existing quirk; GET /api/events avoids it with the service-role join).

## 8. Who sees attendee NAMES

- Only current owner/admin of the club: /api/events/[id]/attendees (route.ts:61-70 `can_manage_event`).
- rsvps SELECT = own rows or events you manage (`rsvps_select_own_or_manager`).
- Tonight surfaces must use counts from `event_rsvp_counts` only.

## 9. THE QUERY: "club events happening today on this campus that the viewer may see"

Definition: club (org_id not null) event, org on campus C, org verified, org not hidden,
`ends_at >= now()` (so one on right now counts) AND `starts_at < next campus midnight`
(America/Indiana/Indianapolis). RLS adds nothing beyond "not hidden" for a non-member.

SQL form (for reference / tests):
```sql
select e.id, e.org_id, e.title, e.starts_at, e.ends_at, e.location
  from public.events e join public.orgs o on o.id = e.org_id
 where o.campus_id = :campus and o.hidden_at is null and o.verified
   and e.ends_at >= now()
   and e.starts_at < ((date_trunc('day', now() at time zone 'America/Indiana/Indianapolis')
                       + interval '1 day') at time zone 'America/Indiana/Indianapolis')
 order by e.starts_at;
```

DOES AN ENDPOINT ALREADY RETURN IT? YES, as the HEAD of an existing list:
`GET /api/events` (no param = home campus; `?campus=<id>` while visiting) returns exactly these
filters minus the "today" cutoff, ordered `starts_at asc`. So
`events.filter(e => Date.parse(e.starts_at) < nextCampusMidnight)` on the client = the answer,
with going_count / interested_count / viewer_status / org already attached. Limit 50 is safe:
ordered by start with ends_at >= now, today's events are always first (only >50 events ongoing
or starting today would truncate). NO new endpoint or DB change is needed for the CLUB half.

Live check (counts only, read-only, Oct 19): 19 events total, 1 not ended, 1 tonight on a
listed Indianapolis club, 0 org-less. Columns in prod match the migrations exactly:
events = id,org_id,creator_id,title,description,starts_at,ends_at,location,created_at;
orgs has no "official/school account" or "featured" column (…,campus_id,join_policy,audience,
hidden_at,followers_read_board). => club half of Tonight is usually 0-2 rows; school feeds fill it.

## 10. Gotchas for the build

1. COUNT FLOOR: event counts are RAW everywhere today (EventCard :10746 `{going} going`,
   Interested · N). The Tonight card/sheet/panel must floor (<5 -> render nothing). Decide whether
   the Events-tab Tonight section reuses EventCard (raw counts, current behaviour) or a new row
   with the floor. Recommendation: new compact `TonightRow` with the floor; leave EventCard as is
   in "Coming up" (changing it is a separate privacy call for Franky).
2. SCHOOL EVENTS ARE NOT `events` ROWS: EventCard assumes a uuid in `events` (RSVP PUT/DELETE
   /api/events/[id]/rsvp, ICS /api/events/[id]/ics, Report, officer actions, useIsMyClub,
   `id="event-<id>"` anchor). A school item needs its own row type (discriminated union
   `{kind:"school"} | {kind:"club", ev: CampusEvent}`); no Going button on school items in v1
   (no RSVP storage), which differs from P2_Sheet's "Going button" on the #1 item.
3. SYNC: EventCard seeds going/status from props ONCE (useState at :10590-10592, no resync
   effect). Two EventCards for the same event (Tonight + Coming up) would drift after an RSVP
   until remount. Either key the card on `${id}:${going_count}:${viewer_status}` or render the
   Tonight club items as non-RSVP rows that read the shared list.
4. DESKTOP SHARING: Feed tab has no events list; the right panel needs its own GET /api/events
   (same URL via `view.url(...)`) or a lifted shared list. Phone already has it in CampusMobile.
5. TIME ZONE: compute "tonight" in CAMPUS time, not the device's. Reuse
   `CAMPUS_TIME_ZONE` (src/lib/push/event-notice.ts:51) and the Intl part-splitter pattern in
   src/lib/chat/when.ts:88-118 (`zonedParts`, currently private; `eventWhen(starts_at, zone)`
   :203 is exported). `formatEventTime` (campus-home.tsx:11763) and `formatUpcomingChip`
   (src/components/campus/rolling-strip-view.ts:~50) use the device zone. DST ends Nov 1 2026.
   Product call: cutoff at campus midnight (recommended) vs a 3-4 AM "late night" cutoff.
6. "Happening now" = `starts_at <= now < ends_at`; already in the /api/events answer.
7. VISITING: Tonight follows the campus on screen (`?campus=`), RSVP stays home-only
   (EventCard `visiting` / 403 campus_visiting). School iCal feeds are Indianapolis-only, so a
   visitor to another campus should see no school section (or the campus's own, none exist).
8. RATE LIMIT: GET /api/events has NO limiter (route.ts; only POST `event-create` :413).
   Reusing it adds no route. A NEW school-events GET route needs a budget in
   src/lib/limits/budgets.ts (task constraint; no read-budget precedent there yet).
9. HIDDEN/UNVERIFIED: keep the existing service-role id-list pattern (hidden + verified) if any
   new server code lists club events; never embed `org:orgs(...)` under the viewer client
   (route.ts:72-90 docblock explains the SAE null-embed trap).
