## Inventory: where club events are read, written and shown, and what a "Members only" switch must cover

All paths are under `/Users/franciscocazares/vibe/.claude/worktrees/club-page-in-shell-0b76e3/`. Everything was read-only: catalog queries on the local DB (`supabase_db_vibe`) and file reads. The local DB has every repo migration applied, up to `20261024100000`.

### Headline: RLS alone will not close it
Most reads use the user's own client, so changing `event_visible()` filters them automatically. But these paths use the service role and **would still leak a members-only event**:
1. **Followers' club space.** `src/app/api/orgs/[slug]/space/route.ts:75-88` (`readUpcoming`), called by `followerSpace` at :201-202, sends `up_next`/`upcoming` to followers at :246-248.
2. **Event cards on the Board, as cards.** `src/lib/chat/cards/hydrate.ts:262-264` and the `eventRefsFor` call at :288. A follower's Board page hydrates cards through `message-read.ts:719` (`countsOnly` follower) and `readFollowerPage` at :1101.
3. **Event cards on the Board, as text.** A card's stored text is "Event: <title> · <when>" (`src/lib/chat/cards/fallback.ts:49-51`). Followers get it through `readFollowerPage` and through `src/app/api/me/club-boards/route.ts:36,187-199` (service-role Board previews).
4. **RSVP.** `rsvpBlocked` in `src/app/api/events/[id]/rsvp/route.ts:41` reads with the service role. The RLS check `rsvps_insert_own` only asks `event_org_visible` (is the club hidden). An RSVP then makes the event visible through `event_visible`'s RSVP arm.
5. **Self check-in.** `src/app/api/events/[id]/checkin/route.ts:108` calls `event_checkin_self_as` with the service role. The function lets in "anyone at the door"; it has no member check.
6. **Posting an event card.** `src/app/api/me/threads/[id]/cards/route.ts:138-151` (service read) and `chat_create_event_card` let any club event be carded on the Board, which followers read.

---

### 1. Schema, grants, RLS

**`events`** columns: `id, org_id, creator_id, title, description, starts_at, ends_at, location, created_at`. No `visibility` and no `updated_at`.
- CHECKs: title 1..120, description ≤2000, location ≤200, `ends_at >= starts_at`, at most 14 days.
- Trigger `chat_events_room` creates an event chat room for each club event.
- Grants (`relacl`): `authenticated=rd` (table-level SELECT and DELETE only), `service_role=arwdDxtm`, no anon. So:
  - A new column is SELECT-able by signed-in users with no grant change.
  - INSERT and UPDATE are service-only. The API routes are the only writers: INSERT revoked in `20260928130000_events_insert_service_only.sql:102-103`, UPDATE in `20260923090000_moderation_foundation.sql:2781` and `20260928110000_club_events_rules.sql:455-457`.

**Event policies** (live, from `pg_policies`):

| Policy | Rule | Latest migration |
|---|---|---|
| `events_select_visible` (SELECT, authenticated) | `event_visible(org_id, creator_id, id)` | Created `20260922110000_t1_close_world_readable_selects.sql:303`. Function body last in `20260928110000_club_events_rules.sql:374`. |
| `events_delete_manager` | Org-less: creator. Club: not restricted, and role owner/admin. | `20260928110000:442-449` |

**`event_visible()`** (SECURITY DEFINER, `md5(prosrc)=ca3d34f65cb01af1a826df053d97b384`; the migrations guard on these md5s, see `20260928110000:290-294`). It returns true when the caller is not anon and one of:
- an org-less event and the caller created it;
- the club isn't hidden, or the caller is a member;
- the caller holds an RSVP.

It has **no platform-admin arm** (`org_content_visible` has one).

**Other tables:**
- **`rsvps`** (`event_id, user_id, status` going/maybe/no, unique `(event_id, user_id)`). Grants `authenticated=arwd`.
  - `rsvps_insert_own` and `rsvps_update_own` WITH CHECK: own row, not restricted, `rsvp_on_home_campus(event_id)`, `event_org_visible(event_id)`. Latest `20260928110000:419,430`.
  - `rsvps_select_own_or_manager`: own row or `can_manage_event`. `20260922110000:307`.
  - `rsvps_delete_own`: phase1 `20260430190000:493`.
  - Trigger `chat_rsvps_room` (`20261001100000_chat_v2_rooms.sql:1065`) adds only **members** to the event room ("Members only (v1)").
- **`event_checkins`** (`event_id, user_id`). Grants `authenticated=rd`. Policies `event_checkins_select_own_or_manager` and `event_checkins_delete_own` (`20261019120000_event_checkins.sql:213,219`).
- **`event_checkin_sessions`**: RLS on, no policy, postgres only.
- **`channels`**: event room is `kind='event'`, `event_id`, name = title. `channels_select_org_member` → `can_view_org_channel` (latest `20261017110000_board_follower_read.sql:360`). Its event arm requires membership; a follower reads only a public Board. **Event chats are already members-only.**
- **`messages`**: `card_event_id` (FK, set null on delete). `messages_select_org_member` = `can_view_org_channel` AND `is_org_member` (`20261017110000:588`). Followers get Board rows only through service-role reads.
- **`chat_event_cards`**: note only; service-only.
- **`notifications`**: `event_title`, `event_starts_at`, type `event_cancelled`. Select/update/delete own rows only. Trigger `push_on_notification_insert` → `push_outbox` (service-only).
- **`personal_events`, `reminders`, `otto_reminders`**: own rows, no link to events.
- There is no saved-events table (`bookmarks` holds posts only) and no realtime publication on these tables.

**Definer functions that touch events:**

| Function (migration:line) | Visibility handling | Change for members-only? |
|---|---|---|
| `event_rsvp_counts` (`20260922100000:371`) | Calls `event_visible` | Covered by the RLS change |
| `event_checkin_state` (`20261019120000:651`) | Calls `event_visible` | Covered by the RLS change |
| `event_checkin_mine` (`:691`) | None; returns the caller's own check-ins with titles | Decide (an ex-member keeps seeing titles) |
| `event_checkin_self_as` (`:540`) | Refuses anon/authenticated roles; no member check | **Yes** |
| `event_checkin_mark` (`:421`) | Only people on the RSVP list | No |
| `can_manage_event` (`20260928110000:342`) | Owner/admin via `org_members` | No |
| `event_org_visible` (`:403`) | Hidden club only | Pair with a new members check |
| `org_content_visible` (`20260922140000:452`) | Has a platform-admin arm | — |
| `rsvp_on_home_campus` (`20260927100000:135`) | Home campus rule | No |
| `chat_create_event_card` (`20261001110000_chat_v2_cards.sql:786`) | Event must be this club's and not over | **Needs a visibility-vs-room check** |
| `org_members_drop_club_access` (`20260928100000:288`) | Drops upcoming RSVPs only on removal; a voluntary leave keeps them | Decide |

**Roles and data:**
- `org_members.role` is one of owner, admin, member. "Officers" means owner and admin; clubs have had no mods since `20261021100000`.
- Platform admin is `users.is_platform_admin`, a server-only column, readable inside a definer function.
- Local data: 1 of 17 orgs has an `owner_id` with no owner row in `org_members`.

---

### 2. Read paths

| # | file:line | Client | Returns | Needs a filter? |
|---|---|---|---|---|
| R1 | `src/app/api/events/route.ts:199-219` (baseQuery), `:269` org branch (club page Up next, Events tab, `when=past`), `:279-287` `include`, `:334-342` campus list (Events tab, Tonight) | **User** for events. Service only for hidden-org ids `:229`, campus org ids `:321`, attribution `:371` | `CampusEvent` list | RLS covers it. Add `visibility` to `EVENT_ROW_COLUMNS` for the chip |
| R2 | same file `:424`, `:430` (`event_rsvp_counts`, `event_checkin_state`) | User → definer with `event_visible` | Counts, check-in state | Covered |
| R3 | `src/app/api/events/[id]/route.ts:85-89` `loadForOfficer`; `itemFor` `:250-258` | Service (officer-gated); user | Event for DELETE/PATCH | No |
| R4 | `src/app/api/events/[id]/rsvp/route.ts:41` `rsvpBlocked` | **Service** | Event org and campus | **Yes** (404 to non-members) |
| R5 | `src/app/api/events/[id]/attendees/route.ts:112-116`, `:125`, `:138-153` | User + `can_manage_event` | Going, interested, walk-ins | No |
| R6 | `checkin/route.ts:34` → `src/lib/events/checkin-route.ts:343-346` `readViewerState`; `:129` `notManagerResponse` | User | Check-in state | Covered |
| R7 | `checkin/route.ts:108` → `event_checkin_self_as` | **Service RPC** | Check-in write and outcome | **Yes, in the DB function** |
| R8 | `checkin/door/route.ts:72,113`; `checkin-route.ts:280` (`event_checkin_door`); `checkin/marks/route.ts:42`; `marks/[userId]/route.ts:53,86` | User RPC, manager-gated | Door codes, marks | No |
| R9 | `src/app/api/events/[id]/ics/route.ts:38-45` | User | One-event .ics | Covered |
| R10 | `src/app/api/me/upcoming-events/route.ts:59-72` (rsvps → `events!inner`) | User | Strip, Otto "Coming up" | Covered (see the RSVP-arm decision) |
| R11 | `src/app/api/me/calendar/route.ts:132-151`; orgs `:50` service; `eventRefsFor` `:173` | User (rows), service (refs) | LeftNav and phone calendar | Covered |
| R12 | `src/app/api/me/calendar/ics/route.ts:54-66` | User | Calendar .ics | Covered |
| R13 | `src/app/api/me/otto/route.ts:274-285` | User | Otto upcoming | Covered |
| R14 | `src/app/api/me/event-checkins/route.ts:31` → `event_checkin_mine` | Definer, no visibility check | Own check-ins (Settings) | Decide |
| R15 | `src/app/api/me/inbox/route.ts:264-278` (+ `eventRefsFor` `:321`) | **Service** | `next_event` per club | No: the clubs are the viewer's own (role check `:123`, `:330`). Optional defensive filter |
| R16 | `src/app/api/orgs/[slug]/space/route.ts:75-88` `readUpcoming`, `:91-99` `readEventsById`; follower path `:198-203,225,246-248`; member path `:381-392,443,500-502` | **Service** | `up_next`, `upcoming`, room events | **Yes for the follower path**; member path no |
| R17 | `src/app/api/search/route.ts:184-195` | User | Search events | Covered |
| R18 | `src/app/campus/checkin/[id]/page.tsx:72-76` (user), `:85-91` (service, orgs), `:92` | User | Check-in landing | Covered |
| R19 | `src/app/campus/checkin/[id]/door/page.tsx:61-65`, `:74` | User | Door screen | Covered |
| R20 | `src/lib/chat/cards/hydrate.ts:262-264,288` (via `message-read.ts:719`) | **Service** | Event card's `EventRef` | **Yes (follower Board)** |
| R21 | Board text: `message-read.ts:1101` `readFollowerPage`; `club-boards/route.ts:36,187-199` | **Service** | Card text "Event: title · when" | **Yes** (best fixed at write time) |
| R22 | `src/lib/chat/rooms.ts:211-215`; `message-read.ts:1342` | Service | Event room header | No (event rooms are members-only) |
| R23 | `src/lib/chat/cards/snapshot.ts:94`; `src/app/api/admin/reports/route.ts:448` | Service | Moderator snapshots | No |
| R24 | `src/app/api/me/reports/route.ts:23,341-345` | User | Report target | Covered |
| R25 | `src/lib/club-links/setup.ts:30` | Service count | Officer setup progress | No |
| R26 | `src/lib/events/notify-cancel.ts:52-58` | Service | Cancel-notice recipients | Optional: current members only |
| R27 | `public/html/profile.html:7898` (`/api/me/calendar`), `:7997` (ics link); `public/html/_otto.js:807-821` (`event_cancelled` rows) | — | Static pages | Covered by R11 and R9 |
| — | `src/app/sitemap.ts` (fixed list), `opengraph-image.tsx` / `twitter-image.tsx` (static), `/api/feed` (no events), `/api/school-events` (outside school calendars, not this table), `admin_usage_summary` (admin counts) | — | — | No |

---

### 3. Write paths, and where `visibility` gets set

- **Create.** `src/app/api/events/route.ts:479-618`. The owner/admin check is at :590-593; the service-role insert at :598-610. Set and validate the enum here.
- **Edit.** `src/app/api/events/[id]/route.ts:318-403`. `loadForOfficer` (owner/admin, :111,123) gates it; the service-role update of `checked.value` is at :369-376. Add `visibility` as an editable field. If an edit flips an event to members-only, non-member RSVPs and existing Board cards need handling; the card refresh is at :388 (`src/lib/chat/cards/refresh-event-cards.ts`).
- **Validation.** `src/lib/events/validate.ts`: `EVENT_TEXT_FIELDS` :29, `StoredEventFields` :33, `EventFields` :42, `ValidEventFields` :51, `readEventFields` :73, `checkEventFields` :93. Treat `visibility` as an enum, not a text field, so it skips the word filter.
- **Row shape.** `src/lib/events/event-item.ts`: `EVENT_ROW_COLUMNS` :20-21, `EventListRow` :23, `toEventListItem` :62-100. Add the new key **last**: `event-item.test.ts:89-91` pins the key order.
- **Cancel.** DELETE `src/app/api/events/[id]/route.ts:156-232`. Deletes with the user client, then service-role notices.
- **RSVP.** PUT `rsvp/route.ts:130-180` (user-client upsert at :168-173). DELETE :197 stays ungated.
- **Check-in.** Self POST `checkin/route.ts:70-129`, DELETE :142. Officer marks: `marks/[userId]/route.ts:39,74`, `marks/route.ts:28`, `door/route.ts:56,99`.
- **Event card.** `src/app/api/me/threads/[id]/cards/route.ts:65-222` plus the `chat_create_event_card` RPC.
- **Form.** `CreateEventModal` in `src/app/campus/campus-home.tsx:12231-12460`: props :12231, `EventFormField` :12249, `eventFormFailure` :12258, state :12285-12300, edit diff :12306-12318, POST body :12348-12360. `CampusEvent` type at :10209.
  - Opened from: `campus-home.tsx:10568` (campus Events tab), `:11254` (Edit on EventCard), `src/app/orgs/[handle]/OrgEventsSection.tsx:171`, `src/app/orgs/[handle]/club-page/PlusSheet.tsx:107`, `src/app/orgs/[handle]/setup/SetupList.tsx:182`.
- **Who may set it.** Owner or admin, which is already enforced by both routes. Add a DB CHECK constraint (`visibility in ('everyone','members')`).

---

### 4. UI surfaces for a "Members only" chip

- **Desktop campus Events tab.** `campus-home.tsx` `EventsTabBody` :10248 (fetch :10310/:10328) renders `EventCard` :10625; title at :10761, "by {org}" at :10763-10780. `EventCard` is reused everywhere below that says "EventCard".
- **Club page.** Up next: `src/app/orgs/[handle]/club-page/UpNext.tsx:55`, fed by `ClubEventsProvider.tsx:85`. Events tab: `OrgEventsSection.tsx:155`. Past events: `OrgPastEvents.tsx:47`, titles at :94/107/121. Deep link `?event=`: `linked-event.tsx:37,53`.
- **Phone campus.** `src/components/mobile/CampusMobile.tsx:294` (URL), `:2593` (EventCard).
- **Tonight.** `src/components/campus/tonight/TonightPanel.tsx:52` (titles :72, :294), `TonightCard.tsx:61`, `use-club-events.ts:41`.
- **Feed strip.** `src/components/campus/RollingStrip.tsx:207`, data from `strip-data.ts:92`.
- **LeftNav calendar.** `src/components/LeftNav.tsx:511,539` (fetch), `:1465` (chip), `:1601`/`:1795` (ICS).
- **Otto.** `src/components/otto/OttoPageClient.tsx:73`, `src/components/mobile/OttoMobile.tsx:187-202`, `src/components/network/OttoSidePanel.tsx:68`.
- **Search typeahead.** `campus-home.tsx:5975` (type), `:6074` (fetch), `:6189` (`goEvent`).
- **Desktop messages.** `src/components/desktop/messages/ClubPane.tsx:218`, `ClubPanel.tsx:165/222` (titles :177/:230), `EventPanel.tsx:45`, `WeekBand.tsx:457/499`.
- **Phone messages.** `src/components/mobile/messages/club/ClubSpace.tsx:258`, `club/UpNext.tsx:66/143`, `EventAbout.tsx:90`, `EventChat.tsx:82/110`, `RsvpSheet.tsx:70`, `FollowerBoard.tsx` (must never get these events), `cards/EventCardView.tsx:65` (titles :119/:161), `compose/ShareEventSheet.tsx:66/154` (has `roomKind`: refuse or warn for the Board), `home/YourWeek.tsx:494`, `MonthBody.tsx:360`, `ClubRow.tsx` (`next_event`).
- **Check-in.** `src/components/events/checkin/CheckinLanding.tsx:91/192/289`, `DoorView.tsx`, `StartCheckinAction.tsx:67`; Settings `src/components/settings/CheckinsCard.tsx:65/164`.
- **Static page.** `public/html/profile.html:7871-7997` (calendar).
- **Payload types that need the field:**
  - `EventRef`: `src/lib/chat/types.ts:53-65`
  - `EventRow`: `src/lib/chat/event-refs.ts:32-39`
  - `CalendarEntry`: `me/calendar/route.ts:78-101`
  - upcoming map: `me/upcoming-events/route.ts:80-88`
  - Otto `UpcomingEvent`: `me/otto/route.ts:308-317`
  - search `eventsOut`

---

### 5. Privacy Policy

Text file: `handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md`. Page: `src/app/legal/privacy/*.tsx`. The two must match word for word.

- **5b, "What can every signed-in account see?"** (it says "This means every account, verified or not, at every campus"). Text :240, `sections-4-5-a.tsx:82-83`: "Club events, with Going and Interested totals and, once at least 5 people have checked in at one, how many did." **This becomes false.**
- **Table in section 5.** Text :214, `sections-4-5.tsx:132-133`: "How many people checked in at an event | Any signed-in account that can see the event, once at least 5 have checked in. The club's owner and officers see the exact number. So does anyone who can see the check-in screen at the door".
- **Same table.** Text :213, `sections-4-5.tsx:128-129`: "A club's follower list, who RSVP'd to its events and who checked in at them | The club's owner and officers. The people in an event's chat also see who is in it, and the first few who marked Going (up to 8)".
- **5f, officers' lists.** Text :296-297, `sections-4-5-c.tsx:28-31`: "who checked in at the club's events, including people who are not members or did not RSVP, and who marked Going but did not check in". Needs a qualifier for members-only events.
- **Also touched:**
  - What we collect: text :103-104, `sections-1-3.tsx:210-219`
  - Signed-in-only list: text :230, `sections-4-5-a.tsx:56`
  - Event chat row: text :277, `sections-4-5-b.tsx:67-68`
  - Retention: text :403-405, `sections-6-8.tsx:114-123`
  - Account deletion: `sections-9-10.tsx:103,129-130`

**How the effective date is set and checked:**
- `src/app/legal/privacy/page.tsx:24` sets `const EFFECTIVE_DATE = "October 21, 2026";`. Text file line 3 must read "Effective <same>".
- `page.tsx:31-41` throws on a Vercel production build unless the value is a real "Month D, YYYY" date.
- The checker is `handoffs/legal-2026-10-04-privacy-v3/check/check.mjs`. It reads the date through `checks.mjs:105` `effectiveDateOf` and checks it in `dateIssues` at :73-101 (the line under the title must match; only an allow-list of other dates may appear). At `check.mjs:174` it warns when the date is in the past. October 21 is already past today (October 22).
- Tests: `src/lib/legal/event-checkin-policy.test.ts:128-152` (both copies must match, accept `<SHIP DAY>` or a real day, and the production guard must stay), plus the same test in `club-page-`, `club-links-` and `first-confirm-policy.test.ts`. Each feature adds its own `src/lib/legal/<feature>-policy.test.ts` with PHRASES that must appear in both copies.
- Convention from git history: draft with `<SHIP DAY>` ("docs(legal) … date set on ship day"), then a "chore(legal): Privacy Policy effective <date>" commit on ship day.

---

### 6. Recommended approach: RLS backbone plus targeted code filters

Code filters alone are not enough: `authenticated` has table-level SELECT on `events`, so a browser can query PostgREST directly. Only RLS closes that, and it also covers R1-R2, R6, R9-R13, R17-R19 and R24 for free.

1. **Migration.**
   - Add `visibility text not null default 'everyone' check (visibility in ('everyone','members'))`. No grant change is needed.
   - Rewrite `event_visible` and keep its 3-argument signature, so `events_select_visible`, `event_rsvp_counts` and `event_checkin_state` all pick it up. Read `visibility` by `p_event_id` inside the function. Use the md5 drift guard, with the current value above.
   - For `visibility='members'`, require an `org_members` row (any role) or `users.is_platform_admin`.
   - Decide whether the RSVP arm applies to members-only events. My recommendation is that it doesn't, so ex-members lose sight of the event.
2. **New helper** (e.g. `event_audience_ok(event_id, user)`). Use it in:
   - `rsvps_insert_own` and `rsvps_update_own` WITH CHECK;
   - `event_checkin_self_as` (it runs as the service role, so the helper needs the `p_user` form);
   - `chat_create_event_card`, refusing members-only events in Board rooms.
3. **Code filters.**
   - Space `followerSpace`: `readUpcoming` with `.eq('visibility','everyone')`.
   - Follower Board: in `hydrateCards`, null the event for followers.
   - Card writes: refuse members-only cards in Board rooms at `cards/route.ts:149`, and grey out the Board option in `ShareEventSheet`.
   - On a flip to members-only, rewrite or cancel existing Board cards' text.
   - `rsvpBlocked`: a members check that answers 404.
   - Optional: limit `notify-cancel` recipients to current members, and filter the inbox defensively.
4. **Leave and flip cleanup.** On a flip to members-only, delete upcoming non-member RSVPs. Optionally extend `org_members_drop_club_access` to drop members-only RSVPs on a voluntary leave as well.
5. **Product decisions:**
   - Do members-only events appear in the campus-wide list and Tonight for members? Under the RLS change they will, so they need the chip.
   - Does `event_checkin_mine` keep titles after someone leaves the club?
   - The `event_checkin_self_as` comment records "anyone at the event" as Franky's call; members-only check-in reverses that for these events.
6. **Payload field and chip.** Add the field to every type listed in section 4, then update the policy text (5b, the table, 5f) with a new policy test and `<SHIP DAY>`.

**Tests to update:**
- `src/lib/events/{events-list-route,event-route,event-item,validate,manage,checkin-routes,checkin-migration,attendees-route}.test.ts`
- `src/lib/chat/{event-refs,space-followers,message-read-followers}.test.ts`
- `manage.test.ts` reads the migration CHECK constraints.