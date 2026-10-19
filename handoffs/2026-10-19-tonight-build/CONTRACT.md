# CONTRACT: "What's the vibe tonight?" + "Your clubs" (build, Oct 19 2026)

Franky (Oct 19): build C2 (desktop feed), P2 (phone card + sheet), D2/P2 Events, and "turn on the school
and athletics part". This file is the build contract for 5 file-owned batches that run in parallel.
Line refs are at HEAD 7181bf3. Boards: `handoffs/2026-10-18-side-space/project/{C2_Desk,C2_Desk_Featured,
P2_Card,P2_Sheet,P2_Events,D2_Events}.dc.html`, renders in `../2026-10-18-side-space/shots/`.

## 0. Decisions (read first)

1. **School data = one new signed-in route, `GET /api/school-events`.** It fetches the calendars on the
   server (Next fetch Data Cache, 2 h), parses iCal by hand (no library), and never touches the database
   except the viewer's own campus row and an optional kill-switch row. No new table, no migration, no
   production write at ship time, no RSVP storage, so no Privacy Policy change.
2. **Club events tonight come from the existing `GET /api/events`** (already campus-scoped, hidden and
   unverified clubs dropped, counts attached). The client filters it to tonight. The phone and the desktop
   Events tab already hold that list; only the desktop Feed adds one read of it.
3. **Sources, v1:** IU Indy Athletics iCal, HOME games only; IU LiveWhale group 24 (IU Indianapolis
   Student Affairs, confirmed) with a filter; IU LiveWhale group 342 (IU Indianapolis Featured Events) as
   the school's own "Featured by your school" pick. 342 answered 200 with ZERO events on Oct 19 05:47 UTC,
   so until IU features something, #1 is always "Up next" or "Happening now".
4. **Switch: ON by default.** `SCHOOL_EVENTS_OFF` (server env, unset = on) hides all or some calendars at
   the next deploy; the `app_settings` row `school_events_off` hides them in about 30 s with no deploy.
5. **Ranking (pure, tested):** #1 = the school's featured item tonight, else the school event on now,
   else the soonest school event not ended; then other school events; then club events. With no school
   event tonight, the club event on now or soonest leads. Never by popularity. Club counts only from 5.
6. **"Your clubs" = no new route:** the client merges `GET /api/me/inbox` (member clubs) and
   `GET /api/me/club-boards` (followed clubs), exactly as Messages home does. No author names. No unread
   dots (the board draws none).
7. **Rate limit:** the new route gets a named budget `schoolEventsRead` in `budgets.ts` with a DAY window,
   so the count says only that an account opened Campus that day, never when (budgets.ts:9-14 rule).
8. **Every new component is its own file** under `src/components/campus/tonight/`. `campus-home.tsx` and
   `CampusMobile.tsx` get wiring only. New files never import runtime values from campus-home (type
   imports only), so there's no import cycle.

## 1. Verified in the code (and corrections to the maps)

- campus-home.tsx: `useCampusView` 474 (not exported; context 471), `onPickEvent` 589-592, TabBody
  6746-6783 (feed branch 6766-6775, FeedTabBody keyed by tag), the TabBody call 1107-1119 (keyed by
  campus), FeedTabBody section `id="campus-feed"` 7208-7220 / closes 7367, `FEED_CARD_SURFACE` 7022,
  `colorForOrg` 278 / `initialsForOrg` 285 / `relativeTime` 6995 / `hexToRgba` 17798 (none exported),
  `DARK_GLASS_SURFACE` 6804, `CampusEvent` 10246 (exported type), EventsTabBody 10275, `eventsUrl` 10289,
  highlight effect 10377-10393, section 10396-10406 (left-aligned, maxWidth 1100), header row 10407-10449,
  list switch 10451-10505, EventCard anchor `id="event-<id>"` 10659.
- CampusMobile.tsx: imports from campus-home 9-19, `homeId` 202, `useViewingCampus` 203, `eventsUrl` 267,
  `events` state **294** (event-data map said 303), `feedTag` 378, `pickEvent` 467-480, `refetchEvents`
  642-659, Feed pane `<section style={paneStyle}>` 1069, `<RollingStrip` 1076, `<EventsPane` mount
  1112-1141, `{openPostId ? (` 1258, `function EventsPane` 2456-2512, PostActionsSheet layering 4056-4110
  (overlay z 10000, content z 10001; tab bar z 9988).
- `src/lib/limits/budgets.ts` 18-43 (BUDGETS), header 9-14; `src/lib/rate-limit.test.ts` 362 source-scans
  every `windowSec` (must divide 86,400; `86_400` passes). No test requires a limiter on every route.
- `src/lib/chat/flag.ts` 57/65/74 (switch shape); `src/lib/waitlist/signup-open.ts` 22-63 (30 s memo);
  `public.app_settings` (20261003100000_waitlist.sql 135-150, RLS + revoked from anon/authenticated
  221-225; key regex `^[a-z0-9_]{1,64}$`; only the two existing keys are type-checked).
- `GET /api/events` (route.ts 105-): signed in, `ends_at >= now`, `starts_at <= now+60d`, start asc,
  limit 50 default, campus via `resolveCampusRequest` (campus-request.ts 108) + `scopeViewerFromRow` (78);
  no limiter on GET. Indianapolis is one id, `indianapolis` (campuses.ts 217), IU + Purdue.
- CSP (csp.ts 200): `style-src 'self' 'unsafe-inline'`, so inline styles and a component-imported CSS file
  both work. Server fetches need no CSP change. Club logos are proxied same-origin URLs (inbox and
  club-boards use `orgAssetProxyUrl`).
- `vibeRequest(url, { cache, quiet, failure })` (src/lib/feedback/request.ts 138) always resolves.
- `Reveal` (src/lib/motion/Reveal.tsx), `SPRING_SOFT` / `RISE_PX` (springs.ts 18/24), `.vibe-press`
  (globals.css motion block). `MOBILE_BREAKPOINT_PX = 900` (src/lib/use-is-mobile.ts 29).
- `CAMPUS_TIME_ZONE` = "America/Indiana/Indianapolis" (src/lib/push/event-notice.ts 51; that file has
  only `import type`, so a client or pure module may import it).
- Components already import their own CSS (src/components/legal/CookieNotice.tsx 18). eslint is
  next core-web-vitals + typescript (React 19 hooks rules: no `Date.now()` in render, no sync setState in
  an effect; a `useState(() => ...)` initializer is fine, as `useEventEnded` 11015 does).
- **Feeds, checked today (plain User-Agent, no email; robots.txt on events.iu.edu has no crawl delay):**
  group 342 = 200, empty calendar. `group_id/4/only_starred/true` = empty. group 4 = 1,000 events whose
  places are Bloomington buildings (IMU, Ballantine, Teter): NOT usable as "IU Indianapolis".
  `events.iu.edu/studentaffairs-indianapolis/` and `events.iu.edu/indianapolis/` both answer 200.
  Group 24 fixture after the §3.4 filter: 20 of 125 left (Graduate School Fair, flu clinics, Campus
  Cleanup, First Gen celebration, Stress Busters Week), mostly daytime. The raw bodies were not kept.
- Jaguars fixture: home LOCATION is `Indianapolis\, Ind., <Venue>` (only the first comma escaped);
  one swim meet = several VEVENTs at the same minute (one per opponent); DESCRIPTION carries
  `Tickets: <am.ticketmaster.com…>`, `TV: ESPN+`, `Streaming Video: <www.espn.com…>`.

## 2. Batch 0 (the orchestrator writes these two files VERBATIM before the wave starts)

No batch edits them. A change goes through the orchestrator, who tells every batch.

### 2.1 `src/lib/school-events/types.ts`

```ts
/**
 * School events on Campus ("What's the vibe tonight?", Oct 19 2026): the wire
 * types of GET /api/school-events, shared by the route, the screens and the
 * tests. PURE: types only, no imports.
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md.
 */

/** A school calendar Vibe reads. The list is fixed in code (sources.ts), never taken from a request. */
export type SchoolSourceKey = "athletics" | "iu-student-affairs" | "iu-featured";

export type SchoolSource = {
  key: SchoolSourceKey;
  /** The office beside the "School event" tag: "Athletics", "Student Affairs", "IU Indianapolis". */
  host: string;
  /** The credit, plain text: "From the IU Indy athletics calendar". */
  credit: string;
  /** The calendar's public page, https on the source's own host: what the credit links to. */
  calendar_url: string;
};

export type SchoolEvent = {
  /** "athletics:<UID>" or "iu:<LiveWhale id>". Stable across refreshes. Never an events-table uuid. */
  id: string;
  source: SchoolSourceKey;
  /** "game": an IU Indy HOME game (athletics). "event": anything else. */
  kind: "game" | "event";
  /** Plain text, at most 120 characters. Games: "IU Indy vs UT Martin". */
  title: string;
  /** Games: the two sides, for the italic "vs". Null for events, or a game whose title didn't parse. */
  matchup: { home: string; away: string } | null;
  /** Games: sentence case, "Men's basketball". Null for events. */
  sport: string | null;
  /** Games: the promo after " - " in the feed ("Senior Day"). Null otherwise. */
  promo: string | null;
  /** ISO 8601, UTC. */
  starts_at: string;
  /** ISO 8601, UTC. Games: the feed's end when it is at most 6 h after the start, else start + 2 h. */
  ends_at: string;
  /** Plain-text place ("James T. Morris Arena", "Campus Center"), or null. */
  location: string | null;
  /** Copied from the source, so a row needs no lookup. */
  host: string;
  /** This event's own page on its calendar: https, on the source's own host. Null when the feed has none. */
  url: string | null;
  /** "Tickets": https, a ticketmaster.com host, games only. Null when the feed lists none. */
  tickets_url: string | null;
  /** "Watch on ESPN+": only when the feed says "TV: ESPN+" and lists an espn.com stream. */
  watch_url: string | null;
  /** From the school's own Featured Events calendar (iu-featured). Only this can lead as "Featured by your school". */
  featured: boolean;
};

/**
 * GET /api/school-events (signed in). Every 200 carries this shape, also when
 * a calendar is down (that calendar's events are just missing).
 */
export type SchoolEventsResponse = {
  ok: true;
  /**
   * False when the switch is off, the campus on screen has no school calendar
   * (every campus but Indianapolis in v1), or the answer is not for one campus
   * (`?campus=all`, no home campus). The screens then hide every school part.
   */
  school_on: boolean;
  /** The campus the answer is for, by the `?campus=` rule of GET /api/events; null when not one campus. */
  campus_id: string | null;
  /** Starting from 4 days ago up to 8 days ahead, ended ones included, soonest first, at most 200. [] when off. */
  events: SchoolEvent[];
  /** The calendars that are switched on, in fixed order (their credits). [] when off. */
  sources: SchoolSource[];
};
```

### 2.2 `src/components/campus/tonight/types.ts`

```ts
/**
 * The Tonight surfaces' shared shapes (Oct 19 2026): the view model that the
 * pure tonight-view.ts builds, the hooks' states and every component's props,
 * so the five build batches code against one file. Types only.
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md.
 */
import type { ReactNode } from "react";

import type { CampusEvent } from "@/app/campus/campus-home";
import type { OrgRef } from "@/lib/chat/types";
import type { SchoolEvent, SchoolSource } from "@/lib/school-events/types";

/** The Events tab's chips. Every other surface is "all". */
export type TonightFilter = "all" | "school" | "clubs";

/** Why #1 is #1: the school featured it, it's on now, or it starts soonest. */
export type LeadReason = "featured" | "live" | "next";

/** Every word a row prints, worked out once in campus time (tonight-view.ts). */
export type ItemText = {
  /** "5:00 PM". */
  time: string;
  /** "" or with its leading space: " tip-off", " to 8:00 PM", " to midnight". Never a game's end. */
  timeTail: string;
  /** "Thu 5" (week tiles, next-up rows). */
  day: string;
  /** The place, or "". */
  place: string;
  /** School game "Athletics · Men's basketball"; school event "Student Affairs"; club "Climbing Club" ("" with no club). */
  byline: string;
  /** Games "Men's basketball · Home"; otherwise "". */
  subline: string;
  /** Clubs: "12 going" from 5 up, else "". School: always "" in v1. */
  count: string;
  /** The row read aloud, without the action: "8:00 PM, Bouldering night, Climbing Club, Rec Center, 12 going". */
  spoken: string;
};

export type TonightItem =
  | { kind: "school"; key: string; ev: SchoolEvent; live: boolean; text: ItemText }
  | { kind: "club"; key: string; ev: CampusEvent; live: boolean; going: number | null; text: ItemText };

export type TonightLead = TonightItem & { reason: LeadReason };

export type TonightView = {
  /** The campus day: "2026-11-07". */
  dayKey: string;
  /** "Sat, Nov 7". */
  dayLabel: string;
  /** #1, or null when nothing is on tonight (for this filter). */
  lead: TonightLead | null;
  /** Tonight's other school items, soonest first. */
  school: TonightItem[];
  /** Tonight's club items (not the lead), soonest first. */
  clubs: TonightItem[];
  /** school.length + clubs.length: "+N more tonight". */
  more: number;
  /** Only when lead is null: up to 3 items in the next 7 campus days, soonest first; else []. */
  nextUp: TonightItem[];
  /** The calendars behind the school items on this view (lead, school, nextUp), in source order. */
  credits: SchoolSource[];
};

/** One tile of "Home games this week" (phone sheet). */
export type WeekTile = {
  key: string;
  ev: SchoolEvent;
  /** "Thu 5". */
  day: string;
  state: "final" | "live" | "today" | "later";
  /** "Final" | "Now" | "Tonight 5:00 PM" / "Today 12:00 PM" | "6:30 PM". */
  label: string;
  /** "Men's basketball". */
  sport: string;
  /** "vs SIUE". */
  versus: string;
  /** "Thursday, Nov 5: Men's basketball, IU Indy vs SIUE, final". */
  spoken: string;
};

/** One card of the Events tab's "Coming up". */
export type ComingUpEntry =
  | { kind: "club"; key: string; ev: CampusEvent }
  | { kind: "school"; key: string; ev: SchoolEvent; source: SchoolSource | null };

/** useSchoolEvents(): a failed read lands as "ready" with on: false, never as an error box. */
export type SchoolEventsState = {
  status: "loading" | "ready";
  on: boolean;
  events: SchoolEvent[];
  sources: SchoolSource[];
};

/** One club in "Your clubs". No author, ever (a follower never sees one). */
export type YourClubRow = {
  org: OrgRef;
  /** The Board's channel id: /messages?channel=<room_id>. */
  room_id: string;
  role: "member" | "follower";
  /** The Board's newest post; text may be "" (a photo-only post). Null when nothing is posted. */
  latest: { text: string; created_at: string } | null;
};

/** useYourClubs(): "error" only when BOTH reads failed (the panels hide). */
export type YourClubsState = { status: "loading" | "ready" | "error"; rows: YourClubRow[] };

// ── Component props (one owner each; CONTRACT.md §10) ─────────────────────────

/** Batch C. Wraps the keyed FeedTabBody: "Your clubs" left, the feed centred, "Tonight" right. */
export type FeedSideLayoutProps = {
  children: ReactNode;
  /** view.url("/api/events?limit=50"). */
  eventsUrl: string;
  /** view.url("/api/school-events"). */
  schoolUrl: string;
  /** Switch to Events and flash that card (CampusHome's onPickEvent). */
  onPickEvent: (eventId: string) => void;
  onOpenTab: (tab: "events" | "orgs") => void;
};

/** Batch C. The right panel. Renders null only when the club read failed AND school is off. */
export type TonightPanelProps = {
  school: SchoolEventsState;
  /** null while loading. */
  clubs: CampusEvent[] | null;
  clubsFailed: boolean;
  onPickEvent: (eventId: string) => void;
  onOpenEvents: () => void;
};

/** Batch C. The left panel (1400px and up). */
export type YourClubsPanelProps = { state: YourClubsState; onFindClubs: () => void };

/** Batch C. The folded strip on top of the right column (1100-1399px). */
export type YourClubsFoldProps = { state: YourClubsState };

/** Batch D. The phone Feed card. Null while loading and when nothing is on tonight. */
export type TonightCardProps = {
  school: SchoolEventsState;
  clubs: CampusEvent[] | null;
  onOpen: () => void;
};

/** Batch D. The phone sheet. */
export type TonightSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  school: SchoolEventsState;
  clubs: CampusEvent[] | null;
  /** Close the sheet, then CampusMobile's pickEvent(id). */
  onPickClubEvent: (eventId: string) => void;
  /** Close the sheet, then the Events tab. */
  onOpenEvents: () => void;
};

/** Batch E. The Events tab's "Tonight" block, phone and desktop. */
export type TonightSectionProps = {
  layout: "desktop" | "phone";
  school: SchoolEventsState;
  clubs: CampusEvent[] | null;
  filter: TonightFilter;
  /** Scroll to and flash that event's card in "Coming up". */
  onPickClubEvent: (eventId: string) => void;
};

/** Batch E. "All · School · Clubs". The caller renders it only when school.on. */
export type EventFilterChipsProps = { value: TonightFilter; onChange: (next: TonightFilter) => void };

/** Batch E. A school event in "Coming up": no Going, no Interested, no Report. */
export type SchoolEventCardProps = { ev: SchoolEvent; source: SchoolSource | null };
```

## 3. Data: `GET /api/school-events` (Batch A)

### 3.1 Request and answers

`GET /api/school-events[?campus=<id>]`, signed in. The client builds the URL with the campus helper
(`view.url(...)` on desktop, `withCampus(...)` on the phone), so `?campus=` appears only while visiting.
Development only: `&now=<ISO>` fakes the clock (ignored unless `NODE_ENV === "development"`).

| Case | Status | Body |
|---|---|---|
| not signed in | 401 | `{ ok:false, code:"unauthorized", error:"Unauthorized" }` |
| over budget | 429 | `tooManyRequests(rl, "Too many tries. Try again later.")` |
| bad or out-of-system `?campus=` | 400 / 403 | `campusScopeError(scope)` body, as GET /api/events does |
| switch off, not Indianapolis, not one campus | 200 | `{ ok:true, school_on:false, campus_id, events:[], sources:[] }` |
| normal (any calendar may be down) | 200 | `SchoolEventsResponse`, `school_on:true` |
| anything thrown past the steps below | 200 | the `school_on:false` body, logged once per instance |

Headers: `cache-control: private, no-store`. Never 500 for a calendar problem.

### 3.2 Route steps (`src/app/api/school-events/route.ts`)

1. `createSupabaseServerClient()`; `auth.getUser()`; no user → 401.
2. `const rl = await limitFor("schoolEventsRead", user.id)`; `!rl.allowed` → 429.
3. Read `users.select("school, campus_id, school_system").eq("id", user.id).maybeSingle()` on the viewer
   client → `scopeViewerFromRow` → `resolveCampusRequest(url.searchParams.get("campus"), viewer)`;
   `forbidden` → `campusScopeError`. A read error → treat as no campus (school_on false), log.
4. `campus_id = scope.kind === "campus" ? scope.campusId : null`. If `campus_id !== SCHOOL_CAMPUS_ID`
   ("indianapolis") → the off body.
5. `const sw = await readSchoolSwitch()`; `sw.all` → the off body.
6. `const { events, sources } = await readSchoolEvents({ now, skip: sw.sources })` (never throws).
7. 200 `{ ok:true, school_on: sources.length > 0, campus_id, events, sources }`.

### 3.3 Calendars (`src/lib/school-events/sources.ts`, pure, fixed order = credit order)

| key | host | credit | calendar_url | feed_url |
|---|---|---|---|---|
| athletics | Athletics | From the IU Indy athletics calendar | https://iuindyjags.com/calendar.aspx | https://iuindyjags.com/calendar.ashx/calendar.ics?sport_id=0 |
| iu-student-affairs | Student Affairs | From the IU Indianapolis Student Affairs calendar | https://events.iu.edu/studentaffairs-indianapolis/ | https://events.iu.edu/live/ical/events/group_id/24 |
| iu-featured | IU Indianapolis | From the IU Indianapolis events calendar | https://events.iu.edu/indianapolis/ | https://events.iu.edu/live/ical/events/group_id/342 |

```ts
export const SCHOOL_CAMPUS_ID = "indianapolis";
export type SchoolFeed = SchoolSource & { feed_url: string; feed_host: string; format: "sidearm" | "livewhale" };
export const SCHOOL_FEEDS: readonly SchoolFeed[];               // the table above
export function normalizeFeed(text: string, feed: SchoolFeed): SchoolEvent[];   // parseIcs + the right normalizer; never throws
export function normalizeAthletics(events: IcsEvent[], feed: SchoolFeed): SchoolEvent[];
export function normalizeLiveWhale(events: IcsEvent[], feed: SchoolFeed): SchoolEvent[];
export function mergeSchoolEvents(lists: SchoolEvent[][], now: number): SchoolEvent[];
export function sameHost(url: string | null, host: string): string | null;     // https + host or www.host, else null
```

### 3.4 Normalizing (the rules the tests pin)

Athletics (`format: "sidearm"`):
- Keep only HOME and TIMED: LOCATION (unescaped) matches `/^Indianapolis,\s*Ind\.,?\s*(.*)$/i` and the
  start is not `VALUE=DATE`. Away games and all-day/TBA rows are dropped (v1).
- SUMMARY: strip `^\[[A-Z]\]\s*` (past results), then `/^IU Indy (.+?) (vs\.?|at) (.+?)(?: - (.+))?$/`:
  sport = group 1 in sentence case (first word as is, the rest lower case: "Men's basketball",
  "Women's swimming", "Volleyball"); away = group 3; promo = group 4 or null; title
  `IU Indy vs <away>` (≤ 120 chars); matchup `{ home: "IU Indy", away }`. No match → title = the cleaned
  summary, matchup / sport null, still `kind: "game"`.
- location = the venue after "Indianapolis, Ind., " ("James T. Morris Arena"), else "Indianapolis".
- ends_at = DTEND when it is after the start and ≤ 6 h later, else start + 2 h.
- url = `sameHost(URL with "&amp;" decoded, "iuindyjags.com")`.
- tickets_url = the `Tickets: <url>` line of DESCRIPTION, https, host `ticketmaster.com` or `*.ticketmaster.com`.
  watch_url = the `Streaming Video: <url>` line, https, host `espn.com` or `*.espn.com`, and ONLY when a
  `TV: ESPN+` line is present. Nothing else from DESCRIPTION is kept (no scores).
- One meet, many rows: rows with the same start, same venue and same sport merge into one item; away =
  opponents joined ", " (the first 3, then " and N more"); id and url from the first row.
- id `athletics:<UID>`, featured false, host "Athletics".

LiveWhale (`format: "livewhale"`, groups 24 and 342):
- Drop: STATUS CANCELLED; `X-LIVEWHALE-CANCELED` = 1/true; SUMMARY starting "CANCELED:" or "CANCELLED:";
  all-day (`VALUE=DATE` or `X-LIVEWHALE-ALL-DAY` = 1); a LOCATION that starts `http` (online only); longer
  than 12 h; any `X-LIVEWHALE-TAGS` entry (split on `|`, trimmed, case-insensitive) equal to "conference",
  "internal events", "travel required", "group fitness classes", "fitness classes", or starting with
  "professional development".
- RRULE is ignored (LiveWhale already writes the next occurrence as DTSTART; the fitness series are dropped).
- id `iu:<X-LIVEWHALE-ID>` (fallback UID), so one event in both IU groups is one id. title and location:
  unescaped, entities decoded, tags stripped; an ALL-CAPS location over 3 letters goes to Title Case
  ("CAMPUS CENTER" → "Campus Center"). url = `sameHost(URL, "events.iu.edu")`. kind "event"; matchup,
  sport, promo, tickets_url, watch_url null. featured = (key === "iu-featured"); host from the feed row.

`mergeSchoolEvents`: concat → dedupe by id (a featured copy wins) → keep `starts_at` in
`[now − 4 d, now + 8 d)` → sort by start, then title, then id → first 200.

### 3.5 The iCal parser (`src/lib/school-events/ics.ts`, PURE, no imports, erasable TS only)

```ts
export const ICS_MAX_CHARS = 2_000_000;
export const ICS_MAX_EVENTS = 2000;
export type IcsEvent = {
  uid: string;
  summary: string;            // unescaped, entities decoded, tags stripped, bidi/control chars removed, ≤ 300
  location: string;           // same cleaning, ≤ 200
  description: string;        // unescaped only (links are read from it), ≤ 4000
  url: string | null;         // unescaped + entities decoded; NOT host-checked here
  start: number;              // ms UTC
  end: number | null;         // ms UTC
  allDay: boolean;
  status: string | null;      // upper case
  x: Record<string, string>;  // X-LIVEWHALE-ID, X-LIVEWHALE-TAGS, X-LIVEWHALE-CANCELED, X-LIVEWHALE-ALL-DAY (first of each)
};
export function parseIcs(text: string, defaultZone?: string): IcsEvent[];  // never throws; [] for junk or over the size cap
export function unescapeText(value: string): string;    // \\ \; \, \n \N
export function decodeEntities(value: string): string;  // &amp; &lt; &gt; &quot; &apos; &nbsp; &#N; &#xH; (160 → space; 0 and surrogates dropped)
export function zonedWallTimeToUtc(y: number, month1: number, d: number, h: number, mi: number, s: number, zone: string): number;
```
Rules: unfold (`\r\n?` → `\n`, then drop `\n` + space/tab); walk lines; inside VEVENT skip nested
BEGIN/END blocks (VALARM); split a line at the first `:` outside a double-quoted parameter; property name
upper-cased; the FIRST occurrence wins. Dates: 8 digits or `VALUE=DATE` → all day, midnight in the zone;
`…Z` → `Date.UTC`; `TZID=` (quoted or not) → that zone, unknown zone → `defaultZone` (default
"America/Indiana/Indianapolis"); floating → `defaultZone`. A row without a valid start is skipped.
Stop after `ICS_MAX_EVENTS`.

### 3.6 Fetch, cache, failure (`src/lib/school-events/read-server.ts`, `import "server-only"`)

```ts
export const SCHOOL_EVENTS_USER_AGENT = "Vibe/1 (+https://www.connectvibe.app)";   // never an email
export async function readSchoolSwitch(env?: NodeJS.ProcessEnv): Promise<SchoolSwitch>;
export async function readSchoolEvents(opts: { now: number; skip: ReadonlySet<SchoolSourceKey> }):
  Promise<{ events: SchoolEvent[]; sources: SchoolSource[] }>;   // never throws
```
- Per calendar, a module memo `{ items: SchoolEvent[]; at: number }`: fresh for 10 min (no fetch at all
  inside that, so a dev hard refresh can't hammer the sites), plus one in-flight promise per calendar.
- Refresh = `fetch(feed_url, { headers: { "user-agent": SCHOOL_EVENTS_USER_AGENT, accept: "text/calendar" },
  next: { revalidate: 7200, tags: ["school-events", "school-events:" + key] },
  signal: AbortSignal.timeout(4000) })`. Next's Data Cache keeps only 200 answers and serves the stored
  copy while it refreshes in the background, so each site is read about once per 2 hours (the Jaguars
  robots.txt asks for 30 s between requests; this is far under). Do NOT use `use cache` or
  `unstable_cache` (both are wrong for this app: no Cache Components, and `unstable_cache` is replaced).
- Non-200, timeout, thrown fetch, body over `ICS_MAX_CHARS` → keep the last good list if it is under 24 h
  old, else []; `console.warn("[school-events]", key, reason)` once per calendar per reason per instance.
  A 200 that parses to zero events is a good answer (342 is empty today).
- All calendars in parallel (`Promise.all` over the ones not in `skip`), then `mergeSchoolEvents`.
  `sources` = `SCHOOL_FEEDS` minus `skip`, as `SchoolSource` (no feed_url).
- Dev only (`NODE_ENV === "development"`): `SCHOOL_EVENTS_FIXTURES=1` reads
  `src/lib/school-events/fixtures/<key>.ics` (missing file → [] ; iu-featured has none) instead of the
  network; `SCHOOL_EVENTS_FIXTURES=fail` makes every calendar fail (to test the down path).

### 3.7 The switch (ON by default; `src/lib/school-events/switch.ts` PURE + `readSchoolSwitch`)

```ts
export const SCHOOL_SOURCE_KEYS: readonly SchoolSourceKey[] = ["athletics", "iu-student-affairs", "iu-featured"];
export type SchoolSwitch = { all: boolean; sources: ReadonlySet<SchoolSourceKey> };
export const SCHOOL_ON: SchoolSwitch;                                   // { all: false, sources: empty }
export function parseSchoolOffEnv(raw: string | undefined): SchoolSwitch;
export function parseSchoolOffSetting(value: unknown): SchoolSwitch;   // the app_settings jsonb value
export function mergeSchoolSwitch(a: SchoolSwitch, b: SchoolSwitch): SchoolSwitch;   // off if either says off
```
- `SCHOOL_EVENTS_OFF` (server env, Production; never `NEXT_PUBLIC_`). Trimmed, lower case:
  unset, "", "false", "0", "no", "off" → on. "true", "1", "yes", "on", "*", "all" → every calendar off.
  A comma list of keys (`athletics,iu-featured`) → those off. Any other value (a typo) → every calendar
  off (a kill switch errs toward hiding) and one warning. Applies from the next deploy.
- Fast off, no deploy: `public.app_settings` row `school_events_off`, read with the service client
  (`.from("app_settings").select("value").eq("key","school_events_off").maybeSingle()`), remembered 30 s
  per instance, last good value kept on an error (none yet = on). Value `true` → all off; a JSON array of
  keys → those off; `false` or no row → on; anything else → all off. Shipping writes NO row. Using it is a
  production write, so it needs Franky's OK at that moment:
  `insert into public.app_settings (key, value) values ('school_events_off', 'true'::jsonb)
   on conflict (key) do update set value = excluded.value, updated_at = now();`
  Back on: `delete from public.app_settings where key = 'school_events_off';`
- `readSchoolSwitch()` = `mergeSchoolSwitch(parseSchoolOffEnv(env.SCHOOL_EVENTS_OFF), <row>)`.
- `.env.example` (Batch A) documents `SCHOOL_EVENTS_OFF` and `SCHOOL_EVENTS_FIXTURES`, commented out,
  in the file's own style.

### 3.8 Rate-limit budget (`src/lib/limits/budgets.ts`, Batch A, one entry)

```ts
  /**
   * Read the school calendars on Campus (GET /api/school-events). A DAY window on
   * purpose: the count says only that an account opened Campus that day, never
   * when (Privacy Policy, abuse counts). Normal use is a few dozen a day.
   */
  schoolEventsRead: { limit: 2000, windowSec: 86_400 },
```
No other new route ships, so nothing else needs a budget. "Your clubs" reuses inbox + club-boards, which
have no limiter on purpose (club-boards route.ts 71-73).

## 4. "Your clubs" data (Batch C, client only)

- `useYourClubs(): YourClubsState` reads, in parallel with `vibeRequest(..., { cache: "no-store",
  quiet: true })`: `GET /api/me/inbox` → `InboxResponse` and `GET /api/me/club-boards` →
  `FollowedBoardsResponse`. Neither is campus-scoped (the clubs are the student's own, also while visiting).
- Merge (`your-clubs-view.ts`, pure):
  ```ts
  export function mergeYourClubs(inbox: InboxClub[] | null, followed: FollowedBoard[] | null): YourClubRow[];
  export function relativeAge(iso: string, now: number): string;   // "45s" "20m" "3h" "2d" "1w", then "Oct 5" (twin of campus-home relativeTime)
  export const YOUR_CLUBS_MAX = 5;
  ```
  Member rows from inbox: `{ org, room_id: board.room_id, role: "member", latest: board.latest &&
  { text: board.latest.text, created_at: board.latest.created_at } }`. Follower rows from club-boards the
  same with `role: "follower"`. Dedupe by `org.id` (member wins). Order: newest `latest.created_at` first,
  nulls last, then `org.name` (`localeCompare`). `author_name` is never copied.
- Reads: on mount, then on `visibilitychange` → visible when the last read is 120 s old or more. No timer
  (OttoCorner already polls inbox every 30 s for its badge; sharing that read is v2).
- One read fails (or 404s with the chat flag off) → rows from the other, status "ready". Both fail →
  "error" (the panels render null). Both answer with no clubs → "ready", [] (the empty state).
- Row link: `<Link href={"/messages?channel=" + encodeURIComponent(room_id)}>`. "See all" → `/messages`.

## 5. The shared client layer (Batch B)

### 5.1 `campus-time.ts` (pure; imports `CAMPUS_TIME_ZONE` from `@/lib/push/event-notice`)

```ts
export type CampusDay = { key: string; label: string; start: number; end: number };  // "2026-11-07", "Sat, Nov 7", ms
export function campusDay(ms: number): CampusDay;                 // the campus calendar day holding ms (DST-safe: Nov 1 2026 is 25 h)
export function addCampusDays(day: CampusDay, n: number): CampusDay;   // by wall date, never by 24 h steps
export function campusClock(ms: number): string;                  // "5:00 PM"
export function campusShortDay(ms: number): string;               // "Thu 5"
export function campusLongDay(ms: number): string;                // "Thursday, Nov 5"
export function campusDateTime(ms: number): string;               // "Wed, Nov 11 · 6:30 PM" (school cards)
export function isCampusMidnight(ms: number): boolean;
export function campusHour(ms: number): number;                   // 0-23
```
All through `Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, … })`, never the device's zone.

### 5.2 `tonight-view.ts` (pure; type imports only, plus campus-time)

```ts
export const TONIGHT_COUNT_FLOOR = 5;
export function publicGoing(raw: number | null | undefined): number | null;   // raw >= 5 ? raw : null
export function isLive(start: number, end: number, now: number): boolean;     // start <= now < end
export function isTonight(start: number, end: number, now: number, day: CampusDay): boolean;
export function buildTonight(input: { school: SchoolEvent[]; clubs: CampusEvent[]; sources: SchoolSource[];
  filter?: TonightFilter; now: number }): TonightView;
export function reasonLabel(reason: LeadReason): string;
export function leadRuleLine(lead: TonightLead): string;
export function cardSpoken(view: TonightView): string;
export function sectionHeadings(view: TonightView, heroShown: boolean): { school: string | null; clubs: string | null };
export function tonightSectionVisible(view: TonightView | null, schoolOn: boolean): boolean;
export function buildHomeWeek(school: SchoolEvent[], now: number): WeekTile[];
export function upcomingSchool(school: SchoolEvent[], now: number): SchoolEvent[];
export function mergeComingUp(input: { clubs: CampusEvent[]; school: SchoolEvent[]; sources: SchoolSource[];
  filter: TonightFilter }): ComingUpEntry[];
export function sportTail(sport: string | null): string;   // " tip-off" basketball, " kickoff" soccer, " first serve" volleyball, else ""
export const TONIGHT_COPY: { … };                          // §5.6, `as const`
```
Rules (each one a test):
- `day = campusDay(now)`. **Tonight** = `end > now && start < day.end && (start >= day.start || end − start
  <= 12 h)` (a long multi-day club event that began before today is not "tonight").
- Filter: "school" drops clubs, "clubs" drops school, before anything else.
- Items: school and club lists each sorted by start, then title, then key. Keys: `school:<id>` / `club:<id>`.
- **Lead:** (1) a featured school item: the first live one, else the first; reason "featured". (2) else a
  school item: the first live one ("live"), else the first ("next"). (3) else a club item, same way.
  (4) else null. `school` / `clubs` = the rest, in order. `going_count` and `interested_count` are never
  read for order.
- Club item: `going = publicGoing(ev.going_count)`, `text.count = going ? going + " going" : ""`.
  School item: `text.count = ""`.
- `text.time = campusClock(start)`. `timeTail`: games `sportTail(sport)`; others: when end − start ≤ 12 h,
  " to midnight" if `isCampusMidnight(end)` else " to " + clock(end); else "".
- `text.byline`: game `${host} · ${sport}` (just host when sport is null); school event host; club org name.
  `text.subline`: game `${sport} · Home`, else "". `text.place`: location or "".
- `nextUp`: only when lead is null: items of both kinds (after the filter) with start ≥ `day.end`, start
  < `addCampusDays(day, 7).start`, not ended; soonest first; at most 3; `text.time` prefixed by
  `text.day + " · "` is the caller's choice (both strings are given).
- `credits`: the `SchoolSource` of every school item in lead, school and nextUp, de-duplicated, in
  `sources` order.
- `leadRuleLine`: school next "First because it starts soonest. Your school can feature one event a day
  instead."; school live "First because it's on right now. Your school can feature one event a day
  instead."; featured "Your school featured this today. Never paid, never ranked by popularity."; club
  lead "Nothing from your school tonight, so the soonest club event leads."
- `cardSpoken`: "What's the vibe tonight, Sat, Nov 7. Up next: IU Indy vs UT Martin, school event,
  Athletics, 5:00 PM, James T. Morris Arena. Plus 3 more tonight. Opens the list."
- `sectionHeadings(view, heroShown)`: school = "Also tonight" when `view.school.length`; clubs =
  "Also tonight from clubs" when the club rows sit under a school hero or school rows, else
  "Tonight from clubs"; null when that list is empty.
- `tonightSectionVisible`: `view !== null && (schoolOn || view.lead !== null)`.
- `buildHomeWeek`: athletics games with start in `[addCampusDays(day,−2).start, addCampusDays(day,5).start)`,
  at most 8, soonest first. state/label: ended → "final"/"Final"; live → "live"/"Now"; today → "today"/
  ("Tonight " if `campusHour(start) >= 17` else "Today ") + clock; later → "later"/clock. versus =
  `"vs " + matchup.away` (or the title).
- `upcomingSchool`: not ended, start ≥ `day.end`, start < `addCampusDays(day, 7).start`, soonest first.
- `mergeComingUp`: clubs (all of `/api/events`, tonight's included: the card stays the RSVP place) +
  the given school list (callers pass `upcomingSchool(...)`), the filter applied, sorted by start then
  title; school entries get their `SchoolSource` from `sources` (null if missing).

### 5.3 `org-mark.ts` (pure)

```ts
export const ORG_PALETTE: readonly string[];          // EXACT twin of campus-home.tsx 267-276, same order
export function colorForOrg(id: string): string;     // same 31-multiplier hash as campus-home 278-282
export function initialsForOrg(name: string): string; // twin of 285-293
export function hexToRgba(hex: string, alpha: number): string;
export function orgMarkBackground(id: string): string; // `linear-gradient(135deg, ${hexToRgba(c,0.95)} 0%, ${hexToRgba(c,0.6)} 100%)` (the post card's, 8561)
```
So a club's mark on the panels matches its post cards on the same page.

### 5.4 Hooks (all `"use client"`)

```ts
// use-campus-now.ts
export function useCampusNow(stepMs?: number): number;   // useSyncExternalStore: 0 on the server and in hydration, then
                                                         // Date.now() (+ dev offset), re-read every stepMs (default 60_000)
                                                         // and on visibilitychange → visible. One shared ticker per stepMs.
export function devNowOverride(): number | null;         // NODE_ENV development only: ?tonight_now=<ISO> → that ms; else null
// use-school-events.ts
export function useSchoolEvents(url: string): SchoolEventsState;
// use-tonight-view.ts
export function useTonightView(school: SchoolEventsState, clubs: CampusEvent[] | null, filter?: TonightFilter): TonightView | null;
export function useHomeWeek(school: SchoolEventsState): WeekTile[];
```
- `useSchoolEvents`: calls `vibeRequest<SchoolEventsResponse>(u, { cache: "no-store", quiet: true,
  failure: "Couldn't load school events." })` on mount and when `url` changes, and again on return to
  visible after 10 min. `u` is `url`, plus a `now=<ISO>` query parameter only in development when
  `devNowOverride()` is set (built with `new URL(url, location.origin)`, keeping path + search). Starts
  `{ status:"loading", on:false, events:[], sources:[] }`. Any failure → `{ status:"ready", on:false,
  events:[], sources:[] }`. A late answer for an
  old url is dropped (a sequence ref, like `eventsSeqRef`).
- `useTonightView`: null while `clubs === null`, `school.status === "loading"` or now is 0; else
  `useMemo(buildTonight({ school: school.on ? school.events : [], clubs, sources: school.sources,
  filter, now }))`. Each component that shows Tonight calls it itself, so the minute tick re-renders the
  card or panel, never CampusMobile or CampusHome.

### 5.5 `TonightBits.tsx` (`"use client"`; small pieces every surface uses)

```ts
export function SchoolTag(p: { tone?: "page" | "glass" }): JSX.Element;      // <span class="tonight-tag">School event</span>; "glass" = on dark event cards
export function ItemTitle(p: { item: TonightItem }): JSX.Element;           // games: IU Indy <span class="tonight-vs">vs</span> UT Martin; else the title
export function MatchupTitle(p: { ev: SchoolEvent }): JSX.Element;          // the same for a bare SchoolEvent
export function ReasonLabel(p: { reason: LeadReason }): JSX.Element;        // "Up next" | <dot/> "Happening now" | "Featured by your school"
export function OutLink(p: { href: string; children: ReactNode; className?: string; label?: string }): JSX.Element;
                                                                            // target="_blank" rel="noopener noreferrer", text + IconOut, aria-label `${label ?? text}, opens in a new tab`
export function LeadLinks(p: { ev: SchoolEvent }): JSX.Element | null;     // "Tickets ↗" / "Watch on ESPN+ ↗" when the urls exist
export function CreditLine(p: { sources: SchoolSource[] }): JSX.Element | null;  // "School events: From the IU Indy athletics calendar ↗ · …" (each linked to calendar_url)
export function ClubMark(p: { org: { id: string; name: string; logo_url: string | null } | null; size: number; radius: number }): JSX.Element;
                                                                            // logo as background-image, else orgMarkBackground + initials (Fraunces 800, white), aria-hidden
export function ClubSwatch(p: { orgId: string | null }): JSX.Element;      // 12px square, radius 4, colorForOrg (neutral var(--ink-muted) when null), aria-hidden
export function OrbitMark(p: { size?: number }): JSX.Element;              // D2's open-orbit SVG (path "M47.87 50 A24 24 0 1 1 54.44 40.5", coral 0.6 Night / 0.5 Light, dot r5 at 51.17,45.23), aria-hidden
export function IconClock(p: { size?: number }): JSX.Element;              // the boards' 16-grid stroke icons, currentColor, aria-hidden
export function IconPin(p: { size?: number }): JSX.Element;
export function IconChevron(p: { size?: number }): JSX.Element;
export function IconOut(p: { size?: number }): JSX.Element;
export function IconInfo(p: { size?: number }): JSX.Element;
export function TonightSkeleton(p: { rows?: number }): JSX.Element;       // static blocks (no shimmer), aria-busy wrapper, "Loading tonight" sr-only
```
Every one imports `./tonight.css`.

### 5.6 `tonight.css` (tokens + the shared classes; Batch B)

Tokens on `:root` (Light) and `:root[data-theme="dark"]` (Night), values from the boards:

| token | Light | Night |
|---|---|---|
| `--tonight-tray` | `rgba(120,96,70,0.045)` | `rgba(0,0,0,0.24)` |
| `--tonight-tray-border` | `rgba(20,20,22,0.10)` | `rgba(255,255,255,0.10)` |
| `--tonight-glow` | `radial-gradient(320px 120px at 82% 0%, rgba(255,92,53,0.12), rgba(255,92,53,0.035) 55%, rgba(255,92,53,0) 100%) no-repeat, #F4F0EA` | `radial-gradient(320px 120px at 82% 0%, rgba(255,92,53,0.20), rgba(255,92,53,0.06) 55%, rgba(255,92,53,0) 100%) no-repeat, rgba(0,0,0,0.24)` |
| `--tonight-pill-line` | `rgba(28,28,30,0.16)` | `rgba(255,255,255,0.16)` |
| `--tonight-pill-bg` | `rgba(255,255,255,0.7)` | `rgba(255,255,255,0.05)` |
| `--tonight-row-hover` | `rgba(127,120,112,0.12)` | `rgba(127,120,112,0.12)` |
| `--tonight-chip-on-bg` | `rgba(255,92,53,0.14)` | `linear-gradient(180deg, rgba(255,92,53,0.50) 0%, rgba(255,92,53,0.22) 100%), #161515` |
| `--tonight-chip-on-line` | `rgba(200,64,30,0.55)` | `rgba(255,180,150,0.55)` |
| `--tonight-chip-on-ink` | `#1C1C1E` | `#FFFFFF` |
| `--tonight-chip-off-line` | `rgba(20,20,22,0.12)` | `rgba(255,255,255,0.14)` |

Everything else uses the app's tokens: `--paper`, `--charcoal` (ink), `--ink-2`, `--ink-muted` (the only
small grey: 4.5:1), `--eyebrow-ink` / `--tag-ink` (coral words), `--coral` (fills, dots, rings only),
`--hairline`, `--glass`, `--glass-border`, `--card-shadow`, `--paper-55`, `rgba(var(--scrim-rgb), a)`.
Shared classes: `.tonight-tag` (10px/700, 0 5px, radius 999, `1px solid var(--tonight-pill-line)`,
`var(--tonight-pill-bg)`, `var(--ink-2)`; `.tonight-tag--glass` for dark cards), `.tonight-vs` (italic,
400, `var(--ink-muted)`), `.tonight-link` (`var(--tag-ink)`, 700, underline on hover), `.tonight-row`
(radius 14; hover `var(--tonight-row-hover)`), `.tonight-focus:focus-visible` and
`.tonight-row:focus-visible` (`outline: 2px solid var(--coral); outline-offset: 2px`), `.tonight-live-dot`
(7px coral circle, static: no pulse), `.tonight-eyebrow` (Fraunces 11/700, 0.18em, caps,
`var(--eyebrow-ink)`), `.tonight-clamp2`, `.tonight-skel` (`rgba(var(--scrim-rgb),0.08)`, radius 8),
`.tonight-credit` (11.5px, `var(--ink-muted)`). Fraunces is already SOFT 100 app-wide (fonts.ts 21):
never write `font-variation-settings`.

### 5.7 Copy (`TONIGHT_COPY`; plain English, the boards' words; straight apostrophes like the live app)

title "What's the vibe tonight?" · tonight "Tonight" · alsoTonight "Also tonight" · alsoClubs
"Also tonight from clubs" · clubsOnly "Tonight from clubs" · allInEvents "All in Events" · comingUp
"Coming up" · schoolTag "School event" · reasons "Up next" / "Happening now" / "Featured by your school" ·
more "+N more tonight" (N ≥ 1) / "Nothing else tonight" (N = 0) · empty "Nothing on campus tonight yet." ·
nextUp "Next up this week" · homeWeek "Home games this week" · homeWeekSub "IU Indy Athletics" ·
tickets "Tickets" · watch "Watch on ESPN+" · seeCalendar "See it on the calendar" · yourClubs "Your clubs" ·
seeAll "See all" · yourClubsSub "Latest on each club's Board" · findClubs "Find clubs on campus" ·
noClubs "Join or follow a club to see its Board here." · boardEmpty "Nothing on the Board yet" (same as
`ORG_COPY.board.followedEmpty`) · filterGroup "Show events from" · filters "All" / "School" / "Clubs" ·
noSchoolWeek "No school events this week" · noClubsComing "No club events coming up" · actionSchool
"Opens its calendar page in a new tab." · actionClub "Opens the event." · creditLead "School events:".

## 6. UI per surface

### 6.1 Desktop Feed, C2 (components: Batch C; mount: Batch E)

Mount (campus-home.tsx, Batch E): TabBody (6746) gains the prop `onOpenTab: (tab: "events" | "orgs") =>
void` and a first line `const view = useCampusView();`. Its feed branch (6766-6775) becomes
`<FeedSideLayout eventsUrl={view.url("/api/events?limit=50")} schoolUrl={view.url("/api/school-events")}
onPickEvent={onPickEvent} onOpenTab={onOpenTab}><FeedTabBody key=… (unchanged) /></FeedSideLayout>`.
The TabBody call (1107-1119) adds `onOpenTab={setTab}`. FeedTabBody itself is not touched; `#campus-feed`
stays on its section (the tour, 665). The panels sit outside the keyed FeedTabBody, so a tag pick never
refetches them; TabBody's campus key remounts them on a campus change.

`FeedSideLayout.tsx` (C): calls `useSchoolEvents(schoolUrl)`, `useClubEvents(eventsUrl)`,
`useYourClubs()`; renders
`<div class="tonight-feed-grid"><aside class="tonight-feed-left" aria-label="Your clubs"><YourClubsPanel/>
</aside><div class="tonight-feed-main">{children}</div><aside class="tonight-feed-right" aria-label=
"What's the vibe tonight"><YourClubsFold/><TonightPanel/></aside></div>`.
`useClubEvents(url): { events: CampusEvent[] | null; failed: boolean }` (C): `vibeRequest` quiet,
no-store; on mount, url change, and return to visible after 120 s; a failure → `{ events: [], failed: true }`.

`feed-side.css` (C), the board's rules with app names:
```css
.tonight-feed-grid { display:grid; width:100%; grid-template-columns:minmax(0,1fr) minmax(0,720px) minmax(0,1fr);
  grid-template-areas:"left feed right"; align-items:start; }
.tonight-feed-main { grid-area:feed; min-width:0; display:flex; flex-direction:column; }
.tonight-feed-left { grid-area:left; justify-self:end; align-self:start; position:sticky; top:0; box-sizing:border-box;
  width:calc(100% + 4px); max-width:320px; padding:28px 0 24px 20px; margin-right:-4px; display:flex; flex-direction:column; }
.tonight-feed-right { grid-area:right; justify-self:start; align-self:start; position:sticky; top:0; box-sizing:border-box;
  width:calc(100% + 4px); max-width:320px; padding:28px 20px 24px 0; margin-left:-4px; display:flex; flex-direction:column; gap:12px; }
.tonight-fold, .tonight-clubs-sum { display:none; }
.tonight-panel { max-height:calc(100vh - 192px); }            /* 64 bar + 28 pad + 24 + 52 orb + 24: the Otto corner stays clear */
.tonight-scroll { overflow-y:auto; scrollbar-width:thin; }
@media (max-width:1399px) {
  .tonight-feed-grid { grid-template-columns:minmax(0,1fr) minmax(0,720px) minmax(0,280px) minmax(0,1fr); grid-template-areas:". feed right ."; }
  .tonight-feed-left { display:none; }
  .tonight-feed-right { padding-right:12px; }
  .tonight-fold { display:flex; }
  .tonight-panel { max-height:calc(100vh - 262px); }
  .tonight-clubs-full { display:none; }
  .tonight-clubs-sum { display:flex; }
}
@media (min-width:1400px) and (max-height:879px) {
  .tonight-scroll { -webkit-mask-image:linear-gradient(180deg,#000 calc(100% - 32px),transparent); mask-image:linear-gradient(180deg,#000 calc(100% - 32px),transparent); }
}
@media (max-width:1099px) {
  .tonight-feed-grid { grid-template-columns:minmax(0,1fr) minmax(0,720px) minmax(0,1fr); grid-template-areas:". feed ."; }
  .tonight-feed-right { display:none; }
}
```
At 1400+ the feed is exactly centred; 1100-1399 the clubs fold into a strip on top of the right column and
the feed + right column centre as a pair; under 1100 the feed is alone (900-1099: no Tonight on the Feed).

`TonightPanel.tsx` (C), from C2_Desk (`useTonightView(school, clubs)`):
- Surface: `<section class="tonight-panel" aria-labelledby="tonight-panel-h">`, `background:
  var(--tonight-glow)`, `1px solid var(--tonight-tray-border)`, radius 18, overflow hidden, flex column,
  no shadow. Header band (padding 14px 16px 12px, bottom hairline): `.tonight-eyebrow` dayLabel, then
  `<h2 id="tonight-panel-h">` "What's the vibe tonight?" (Fraunces 15/800, line 20, one line).
- Hero (#1, no scroll, padding 12px 16px 13px, gap 10): ReasonLabel (11.5/700 `--ink-muted`); `<h3>`
  Fraunces 22/900/1.15 with ItemTitle (school: `<a>` to `ev.url ?? source.calendar_url`, new tab; club:
  `<button>` → `onPickEvent(ev.id)`); subline (12.5 muted); tag row (SchoolTag + host | ClubSwatch +
  club name); IconClock **time** + tail; IconPin place; club count (12.5/600 muted) when not ""; a links
  row over a top hairline: LeadLinks, then OutLink with the source's credit (school only).
- `.tonight-scroll` (border-top hairline, padding 8px 6px 6px): "Also tonight" (h3 Fraunces 13.5/700) +
  "All in Events ›" (12/600 muted button → `onOpenEvents`); school rows (`<a class="tonight-row">`, new tab,
  padding 6px 10px): title 13/700 + count slot, **time**+tail · place (11.5 muted, one line), SchoolTag +
  host. Club rows inside `.tonight-clubs-full` under "Also tonight from clubs" (`<button
  class="tonight-row">` → `onPickEvent`): title + count, **time** · place, ClubSwatch + club name. The
  folded twin `.tonight-clubs-sum` (`<button>` → `onOpenEvents`): "Also tonight from clubs" + "N more ›",
  aria-label "Also tonight from clubs: N events, <titles>". CreditLine last.
- Empty (lead null): "Nothing on campus tonight yet." (13.5/600 `--ink-2`, padding 14px 16px); then, when
  `nextUp.length`, "Next up this week" rows (`text.day · text.time`); then "All in Events ›".
- Loading: header + `TonightSkeleton rows={3}`. Content arrives in `<Reveal rise={false}>`.
- Null when `clubsFailed && school.status === "ready" && !school.on`.
- Row aria-labels: `item.text.spoken + ". " + actionSchool|actionClub`.

`YourClubsPanel.tsx` (C) exports `YourClubsPanel` and `YourClubsFold`, from C2_Desk's left panel:
- Panel: tray `var(--tonight-tray)` + `1px solid var(--tonight-tray-border)`, radius 18, overflow hidden.
  Header band (14px 16px 12px, bottom hairline): `<h2 class="tonight-eyebrow">Your clubs</h2>` + "See all"
  (`/messages`, 12/600 muted); "Latest on each club's Board" (12 muted). Rows (ul padding 6px, gap 2;
  `<Link class="tonight-row">` padding 10px, gap 12): ClubMark 36 / radius 10; name (Fraunces 14/800, one
  line) + `relativeAge` (11.5/600 muted); the Board line (12.5/1.4 `--ink-2`, `.tonight-clamp2`) or
  "Nothing on the Board yet" (muted). aria-label `"<name>, on the Board <age> ago: <text>"`. Footer (top
  hairline, 12px 16px 14px): "Find clubs on campus ›" (`.tonight-link` button → `onFindClubs`, which
  FeedSideLayout maps to `onOpenTab("orgs")`). At most `YOUR_CLUBS_MAX` rows.
- Empty: "Join or follow a club to see its Board here." + the footer. Loading: skeleton 3. Error: null.
- Fold (1100-1399): `<section class="tonight-fold" aria-label="Your clubs">`, same tray, padding 9px 10px
  9px 14px, space-between: "Your clubs ›" eyebrow link to `/messages`, then up to 6 tiles (`<Link>` padding
  2, radius 12, ClubMark 32 / radius 10, `title` = name, the row's aria-label). Null unless ready with rows.

### 6.2 Phone Feed: card + sheet, P2_Card / P2_Sheet (components and wiring: Batch D)

`TonightCard.tsx` (`useTonightView(school, clubs)`): null while loading or when `lead` is null (no
placeholder, the strip's rule). Wrapped in `<Reveal>`. `<section class="tonight-card"
aria-labelledby>`: grid `minmax(0,1fr) 28px`, padding 12px 10px 12px 12px, radius 18, `var(--glass)` +
`1px solid var(--glass-border)` + `var(--card-shadow)`, position relative. One stretched
`<button type="button" class="vibe-press" aria-haspopup="dialog" aria-label={cardSpoken(view)}
onClick={onOpen}>` (absolute, inset 0, radius 18). Five lines, so the height never changes:
(1) `<h2>` "What's the vibe tonight? · {dayLabel}" (11/800 `--tag-ink`) + ReasonLabel at the right
(10.5/600 muted); (2) ItemTitle (Fraunces 18/900, one line); (3) SchoolTag + byline, or ClubSwatch + club
name (12 muted, one line); (4) **time** · place, plus " · 12 going" for a club lead (12.5 `--ink-2`, one
line); (5) "+N more tonight" or "Nothing else tonight" (12/600 muted). Chevron tile 28px, radius 10,
`var(--paper-55)`, `1px solid rgba(var(--scrim-rgb),0.06)`, centred.

`TonightSheet.tsx` (vaul, one height, no detents; the repo never uses `snapPoints`):
- `Drawer.Root open onOpenChange`; `Drawer.Overlay` fixed inset 0, `rgba(0,0,0,0.40)`, z 10000;
  `Drawer.Content aria-describedby={undefined}` fixed bottom/left/right 0, `var(--paper)`, radius 24 24 0 0,
  `1px solid var(--glass-border)` top, shadow `0 -16px 48px rgba(0,0,0,0.35)`, z 10001, `maxHeight: 80dvh`,
  padding-bottom `env(safe-area-inset-bottom, 0px)`, outline none. Grabber bar (aria-hidden 38×4, radius 999,
  `rgba(var(--scrim-rgb),0.18)`). Title row: `<Drawer.Title class="tonight-eyebrow">` "Tonight · Sat, Nov 7"
  (visible) + a 44×44 close button (aria-label "Close", IconX 12). Body: `data-vaul-no-drag`,
  `maxHeight: calc(80dvh - 64px)`, `overflowY: auto`, `overscrollBehavior: contain`, padding 0 16px 20px.
- Order: hero (ReasonLabel; tag row; Fraunces 24/900 title; IconClock time+tail, IconPin place; LeadLinks
  + credit OutLink; IconInfo + `leadRuleLine`); hairline; "Also tonight" + "All in Events ›" (button →
  `onOpenEvents`); school rows (`<a>` new tab; 72px time column with the tail under it; title 14/700;
  SchoolTag + host; place); "Also tonight from clubs" rows (`<button>` → `onPickClubEvent(ev.id)`; title;
  club name · place · count); hairline; "Home games this week" + "IU Indy Athletics" (11 caps muted) and a
  2-column grid of `useHomeWeek(school)` tiles (`<a>` to `ev.url`, new tab; "final" muted; "today"/"live"
  border `rgba(255,92,53,0.38)` + `aria-current="date"`; lines: day + label, sport, versus; aria-label =
  `spoken`) only when tiles exist; CreditLine. Lead null → "Nothing on campus tonight yet." + nextUp rows.
- Club rows and "All in Events" close the sheet FIRST (the caller's callbacks do it, §6.2 wiring).

Wiring in `CampusMobile.tsx` (D):
1. Below `eventsUrl` (267): `const schoolUrl = withCampus("/api/school-events", viewingId, homeId);
   const school = useSchoolEvents(schoolUrl); const [eventsFilter, setEventsFilter] =
   useState<TonightFilter>("all"); const [tonightOpen, setTonightOpen] = useState(false);`
2. Feed pane, right before `<RollingStrip` (1076): `{feedTag ? null : <TonightCard school={school}
   clubs={events} onOpen={() => setTonightOpen(true)} />}` (hidden under a tag filter: the strip is the
   filter's control there). The pane's gap (10) spaces it.
3. Events pane `<section>` (1112), before `<EventsPane`: `{school.on ? <EventFilterChips
   value={eventsFilter} onChange={setEventsFilter} /> : null}` then `<TonightSection layout="phone"
   school={school} clubs={events} filter={school.on ? eventsFilter : "all"} onPickClubEvent={pickEvent} />`,
   and `<EventsPane` gets two more props: `school={school} filter={eventsFilter}`.
4. `EventsPane` (2456) gains `school: SchoolEventsState` and `filter: TonightFilter`. At its TOP (before the
   early returns): `const weekNow = useCampusNow(300_000);` and `const entries = useMemo(() =>
   mergeComingUp({ clubs: events ?? [], school: school.on && weekNow ? upcomingSchool(school.events,
   weekNow) : [], sources: school.sources, filter: school.on ? filter : "all" }), […])`. Loading/error
   early returns stay. Empty `entries`: filter "school" → `EmptyTab` "No school events this week" / "School
   events from the IU Indy athletics and IU Indianapolis calendars show here."; filter "clubs" with school on
   → "No club events coming up" + the existing body; else today's two empty states unchanged. Map
   `entries`: club → today's `<Reveal><EventCard … /></Reveal>`; school → `<Reveal key={entry.key}
   delayIndex={i} still={i >= REVEAL_SCREENFUL}><SchoolEventCard ev source /></Reveal>`.
5. Right before `{openPostId ? (` (1258): `<TonightSheet open={tonightOpen} onOpenChange={setTonightOpen}
   school={school} clubs={events} onPickClubEvent={(id) => { setTonightOpen(false); pickEvent(id); }}
   onOpenEvents={() => { setTonightOpen(false); setTab("events"); }} />`.
No other CampusMobile change. Keep each Edit under ~150 lines.

### 6.3 Events tab, D2 (desktop) and P2_Events (phone) (components: Batch E)

`EventFilterChips.tsx`: `<div role="group" aria-label="Show events from" class="tonight-chips">` (flex,
gap 8, wrap) with three `<button type="button" aria-pressed class="tonight-chip vibe-press vibe-toggle">`
"All" "School" "Clubs": 32px tall, padding 0 14px, radius 999, 13/700; off `var(--paper)` +
`1px solid var(--tonight-chip-off-line)` + `var(--ink-2)`; on `var(--tonight-chip-on-bg)` + `1px solid
var(--tonight-chip-on-line)` + `var(--tonight-chip-on-ink)`. All is on by default. The filter applies to
Tonight AND Coming up.

`TonightSection.tsx` (`useTonightView(school, clubs, filter)`): renders null unless
`tonightSectionVisible(view, school.on)` (so a campus with no school calendar and nothing tonight shows
nothing new); while loading, header + skeleton. Hero = a SCHOOL lead only; a club lead is drawn as the first
club row (its EventCard below is the RSVP place, so Tonight never draws a second Going button). Headings
from `sectionHeadings(view, heroShown)`. After the block it renders `<h3 class="tonight-coming-h">Coming
up</h3>` (Fraunces 20/800 `--charcoal`), so the caller adds no heading.
- desktop (D2): `<section aria-labelledby>`: `var(--paper)`, `1px solid rgba(var(--scrim-rgb),0.10)`,
  `var(--card-shadow)`, radius 18, padding 16px 22px 18px. Header: "Tonight" (Fraunces 20/800) + dayLabel
  (13/600 muted) + OrbitMark 28 at the right. Body flex-wrap: hero `<article>` `flex: 1 1 320px` (tag row
  with SchoolTag + host left and ReasonLabel right; Fraunces 28/900 linked title; subline; time + place;
  LeadLinks; rule line 12/1.5 muted with IconInfo) | rows column `flex: 1.4 1 360px` with a left hairline
  and padding-left 24 when the hero shows. Row = grid `72px minmax(0,1fr) auto 14px`, gap 12, padding
  10px 0, top hairline: time (13/700) with the tail under it (11.5 muted); title 14/700 + inline SchoolTag
  (school); host (600 `--ink-2`) · place (12.5 muted); count (12.5/600 muted, clubs 5+); IconChevron (club
  `<button>` → `onPickClubEvent`) or IconOut (school `<a>`, new tab). CreditLine at the bottom.
- phone (P2_Events): header row "Tonight" (Fraunces 20/800) + dayLabel right; hero card (`var(--glass)`,
  `var(--glass-border)`, `var(--card-shadow)`, radius 18, padding 14px 16px; title Fraunces 24/900); then
  one "also" card (same surface, padding 6px 14px) with 11/800 0.08em caps muted headings and rows (grid
  `72px 1fr`, gap 12, padding 10px 0; title 15/700; SchoolTag + host / club name · place · count).
- Empty with school on: header + "Nothing on campus tonight yet." (14/600 `--ink-2`).

Desktop wiring in `EventsTabBody` (campus-home.tsx, Batch E):
1. After `eventsUrl` (10289): `const school = useSchoolEvents(view.url("/api/school-events"));
   const [filter, setFilter] = useState<TonightFilter>("all"); const weekNow = useCampusNow(300_000);
   const shownFilter: TonightFilter = school.on ? filter : "all";` and `entries` = `useMemo` of
   `mergeComingUp({ clubs: events ?? [], school: school.on && weekNow ? upcomingSchool(school.events,
   weekNow) : [], sources: school.sources, filter: shownFilter })`.
2. Move the highlight effect's body (10377-10393) into `const flashEvent = useCallback((id: string) => {…})`
   (scroll to `#event-<id>`, block center, the 3px coral ring for 2.2 s); the effect calls it then
   `onHighlightDone?.()`. TonightSection's `onPickClubEvent={flashEvent}`.
3. After the header row closes (10449): `{school.on ? <EventFilterChips value={filter} onChange={setFilter}
   /> : null}<TonightSection layout="desktop" school={school} clubs={events} filter={shownFilter}
   onPickClubEvent={flashEvent} />`.
4. The list switch (10451-10505): the error and loading branches stay. Empty `entries`: visiting → the
   VISITING_COPY card (unchanged); shownFilter "school" → the card titled "No school events this week";
   "clubs" with school on → "No club events coming up" + today's body line; else today's "No upcoming events
   on campus" card unchanged. Otherwise the same grid (`repeat(auto-fill, minmax(280px, 1fr))`, gap 14) over
   `entries`: club → today's `<Reveal key={entry.key} delayIndex={i}><EventCard … /></Reveal>`; school →
   `<Reveal key={entry.key} delayIndex={i}><SchoolEventCard ev={entry.ev} source={entry.source} /></Reveal>`.
5. The section stays left-aligned (D2 centres it; not in v1). Each Edit under ~150 lines.

`SchoolEventCard.tsx`: the EventCard frame without its controls. `SCHOOL_CARD_SURFACE` = an exact twin
of `DARK_GLASS_SURFACE` (campus-home.tsx 6804-6816; say so in a comment), radius 18, `borderLeft: 3px
solid rgba(255,255,255,0.28)` (a school item never takes a club colour), padding 20, `#fff` text like
EventCard (these cards are dark glass in both looks). `<article aria-labelledby>`: `<h4>` Fraunces 800 17
MatchupTitle ("vs" at `rgba(255,255,255,0.6)`); SchoolTag `tone="glass"` + credit (12px
`rgba(255,255,255,0.72)`); calendar icon + `campusDateTime(start)` (+ " – " + clock(end) for events, not
games) 13px `rgba(255,255,255,0.85)`; IconPin + place; games: "<Sport>, home game." (+ " " + promo);
footer: OutLink "See it on the calendar" (`ev.url ?? source.calendar_url`) + LeadLinks, links `#FF8A66`.
No Going, no Interested, no Report, no `id="event-…"`.

### 6.4 Rules for every surface

- **States.** Loading: skeleton (desktop panel, Events section) or nothing (phone card). School read failed
  or off: the school parts vanish (rows, School chip, home-games block, credits); no error box, no toast.
  Club read failed: club rows vanish. Both gone and nothing tonight: desktop panel null (feed stays
  centred), card null, Events section null unless school is on. A calendar being down never changes the
  page around it.
- **Visiting.** Everything follows the campus on screen through the campus URL helpers; the server answers
  `school_on:false` off Indianapolis. "Your clubs" stays the student's own. RSVP stays home-only
  (EventCard, unchanged).
- **Privacy.** Counts only, from 5 (`publicGoing`), on club rows only. Never a name, face or author.
  Nothing new is stored; outside requests come from the server with the plain User-Agent and carry no
  person's data.
- **Motion.** `Reveal` for arrival (panel content `rise={false}`, the phone card with rise, Coming-up cards
  as today); `.vibe-press` on rows, chips, the card and buttons; vaul's own sheet motion. Transform and
  opacity only, no keyframes, no pulse on the live dot, no blur added. Reduce motion is handled by
  MotionRoot.
- **Accessibility.** Real `<a>` (out, `target="_blank" rel="noopener noreferrer"`, the label says it opens
  a new tab) and `<button type="button">` (in-app); headings in order (h2 panel, h3 groups); icons
  `aria-hidden`; the live dot is paired with the words "Happening now"; chips `aria-pressed` in a labelled
  group; the sheet has a visible `Drawer.Title` and a 44px Close; focus ring 2px `var(--coral)` offset 2;
  every small grey text is `--ink-muted` or darker; tap targets ≥ 44px tall on the phone.
- **Tokens.** No hex in a component except the dark-glass card twin and its whites (as EventCard does) and
  the `#FFFFFF` initials on a club mark. Night and Light both from §5.6.
- **No orb collision.** Desktop right column ends ≥ 24px above the Otto orb (the max-height rule); the
  orb's 4 s toast may sit over the panel's foot, which is fine (an overlay).

## 7. What v1 leaves out (one line each, for Franky)

1. No "Going" on school events and no counts on them: that needs a new table for RSVPs and a same-day
   Privacy Policy change.
2. "Featured by your school" is IU Indianapolis's own Featured Events calendar (group 342). It is empty
   today, so #1 stays "Up next" / "Happening now" until IU features something; a founder-picked feature
   needs an admin button plus a database change.
3. Away games are left out; Tonight shows IU Indy home games only.
4. IU's calendars: only Student Affairs (24) and Featured (342). The top-level "IU Indianapolis" group (4)
   returned 1,000 Bloomington events on Oct 19, so it's not used; no Purdue Indianapolis student-life
   calendar exists.
5. From Student Affairs, staff conferences, internal events, fitness classes, all-day and online-only items
   are filtered out (20 of 125 items pass today, mostly daytime).
6. "This week at the arena" reads "Home games this week": home games also happen at the Natatorium and
   Carroll Stadium.
7. Windows 900-1099px wide (half a laptop, iPad landscape) get Tonight in Events only, not on the Feed.
8. The phone sheet has one height (no half/full drag).
9. "Your clubs" shows no unread dots (the board draws none) and reuses the two Messages reads; a cheaper
   single read is later.
10. Rows open Messages in full; the Otto mini window can't open a club Board yet.
11. Purdue Indy students see the same "School event" and "Featured by your school" words (one campus).
12. A club event you RSVP'd can show in both the "today." strip and Tonight (kept on purpose).
13. "Tonight" ends at campus midnight (no late-night cutoff).
14. D2 centres the Events section; v1 keeps today's left-aligned Events tab.

## 8. Tests to add (node --test; pure files load directly or with the resolve hook of
`src/components/campus/rolling-strip-view.test.ts` 10-43; stubs as in `src/lib/limits/social-limits.test.ts`)

- `src/lib/school-events/ics.test.ts` (A): unfolding (CRLF + space, tab); `\, \; \n \\`; entities incl.
  `&#160\;` → space and `&amp;` in URLs; `Z`, `VALUE=DATE`, `TZID=America/New_York` at the Nov 1 2026
  fall-back hour (01:30 → 05:30Z), quoted `TZID="America/Chicago"`, unknown TZID → default zone; a VALARM
  inside a VEVENT ignored; first property wins; a quoted `:` in a parameter; over-size body → []; event cap;
  junk text → []; fixture counts (athletics 221, student affairs 125).
- `src/lib/school-events/sources.test.ts` (A): Jaguars home-only, timed-only, prefix strip, matchup and
  sentence-case sport, promo, venue extraction (unescaped second comma), end rule, `&amp;` URL host lock
  (a `javascript:` or other-host URL → null), tickets/watch host allowlist and the `TV: ESPN+` condition, the
  swim-meet merge; LiveWhale tag drops, all-day, online, cancelled (three ways), 12 h, ALL-CAPS place, id
  `iu:<lwid>`; featured copy wins the dedupe; window `[now−4d, now+8d)`; order; cap 200; the fixture yields
  20 student-affairs items (checked Oct 19 with these rules).
- `src/lib/school-events/switch.test.ts` (A): every env value class in §3.7 (incl. a typo → all off, a
  list, unknown keys ignored), every setting value class, merge.
- `src/app/api/school-events/route.test.ts` (A): 401 with no user; 429 when the limiter refuses (key
  `budget-schoolEventsRead:<id>`, numbers from BUDGETS); a non-Indianapolis campus → `school_on:false`
  with no fetch; switch off → no fetch; every calendar throwing → 200 with `events: []` (never 500).
- `src/components/campus/tonight/campus-time.test.ts` (B): day bounds on Nov 1 2026 (25 h) and Mar 14 2027
  (23 h); labels "Sat, Nov 7", "5:00 PM", "Thu 5"; midnight; `addCampusDays` across DST.
- `src/components/campus/tonight/tonight-view.test.ts` (B): the tonight rule (live, later today, ended,
  tomorrow, the multi-day exclusion); lead order featured > school live > school next > club live > club
  next; school always before clubs; **popularity never orders** (a 300-going club event after a school
  event with no count; two clubs ordered by start, not count); `publicGoing` 4 → null, 5 → 5; filter;
  `more`; headings; `nextUp` only when empty; credits; rule lines; `cardSpoken`; home week states and
  labels; `upcomingSchool`; `mergeComingUp` order and filter.
- `src/components/campus/tonight/org-mark.test.ts` (B): the palette equals campus-home's (read the source
  text, compare the hex list in order); hash and initials match campus-home's on sample ids.
- `src/components/campus/tonight/your-clubs-view.test.ts` (C): merge, member wins a duplicate, order (newest,
  nulls last, then name), no `author_name` anywhere in the output, `relativeAge` steps.
- Existing suites must stay green: `rate-limit.test.ts` (the new `86_400` window), `rate-limit-keys.test.ts`
  (no IP in any key), `theme.test.ts`, `social-limits.test.ts`.

## 9. Browser checks (after the wave; memory: the browser pass is not optional)

Local `next dev` with `SCHOOL_EVENTS_FIXTURES=1` (never hammer the live sites; a dev hard refresh skips
Next's fetch cache) and `?tonight_now=2026-10-22T18:00:00Z` (2 PM on campus, Oct 22: the Natatorium swim
meet is "Up next" at 3 PM). No production writes: use club events that already exist.
1. Desktop 1440×900 Night, signed in as a non-admin: `#campus-feed` gutters equal within 1px; "Your clubs"
   left, Tonight right, both framed; the panel's bottom clears the Otto orb by ≥ 24px before and after
   scrolling; both panels stick.
2. 1920×1080, 1280×800 (clubs fold into the strip, club rows become "Also tonight from clubs · N more"),
   1100 vs 1099 (rails gone at 1099), 900. Light theme: tokens flip, small text still 4.5:1.
3. Pick a tag on the strip: the panels stay and don't flash or refetch (Network tab).
4. Visit Bloomington with "Campuses": no school rows, no School chip; club rows from Bloomington or the
   empty state; back home restores.
5. Clicks: a school row opens its calendar page in a new tab (iuindyjags.com / events.iu.edu); a club row
   switches to Events and flashes its card; "All in Events"; "Find clubs on campus" → Orgs; a club in
   "Your clubs" → `/messages?channel=…`; "See all" → `/messages`.
6. Events (desktop): chips filter Tonight and Coming up; school cards have no Going/Interested/Report;
   RSVP on a club card still works; Tonight shows that club's count only from 5.
7. Phone 375×812 and 390×844, non-admin: the card sits above "today."; hidden under a tag filter; the sheet
   opens above the tab bar, scrolls, closes on the scrim, Close and Escape; a club row lands on its Events
   card; Events tab: chips, Tonight, "Coming up", school cards.
8. Kill switch: `SCHOOL_EVENTS_OFF=true`, restart dev → every school part gone everywhere; `athletics` only
   → just the games gone. `SCHOOL_EVENTS_FIXTURES=fail` → the feed, the panel and Events still load (club
   rows only), no console error, route answers 200.
9. Console clean (no hydration warning, no CSP report); keyboard: tab through rows and chips, rings visible,
   chips announce pressed; reduced motion: no rise.
10. One live check only (fixtures off, once): `/api/school-events` 200 with `school_on:true`, then back on
    fixtures. After deploy: the same on www.connectvibe.app, and the server log shows no repeated feed fetches.

## 10. Batches (all five start together after Batch 0; no file is in two batches)

| Batch | Owns (create unless marked "edit") | Codes against | Est. lines |
|---|---|---|---|
| **0 Types** (orchestrator, first) | `src/lib/school-events/types.ts`, `src/components/campus/tonight/types.ts` (§2, verbatim) | none | 330 |
| **A School data** | `src/lib/school-events/{ics.ts, ics.test.ts, sources.ts, sources.test.ts, switch.ts, switch.test.ts, read-server.ts}`, `src/lib/school-events/fixtures/athletics.ics` (copy of `handoffs/2026-10-19-tonight-build/jaguars.ics`), `src/lib/school-events/fixtures/iu-student-affairs.ics` (copy of `iu-group-24.trimmed.ics`), `src/app/api/school-events/{route.ts, route.test.ts}`, edit `src/lib/limits/budgets.ts` (one entry), edit `.env.example` | §2.1, §3 | ~1100 |
| **B Client core** | `src/components/campus/tonight/{campus-time.ts, campus-time.test.ts, tonight-view.ts, tonight-view.test.ts, org-mark.ts, org-mark.test.ts, use-campus-now.ts, use-school-events.ts, use-tonight-view.ts, TonightBits.tsx, tonight.css}` | §2, §5 | ~1300 |
| **C Desktop Feed panels** | `src/components/campus/tonight/{FeedSideLayout.tsx, TonightPanel.tsx, YourClubsPanel.tsx, your-clubs-view.ts, your-clubs-view.test.ts, use-your-clubs.ts, use-club-events.ts, feed-side.css}` | §2, §4, §5 signatures, §6.1 | ~900 |
| **D Phone** | `src/components/campus/tonight/{TonightCard.tsx, TonightSheet.tsx, tonight-phone.css}`, edit `src/components/mobile/CampusMobile.tsx` (§6.2 wiring only) | §2, §5, §6.2, E's three exports | ~700 |
| **E Events + desktop wiring** | `src/components/campus/tonight/{TonightSection.tsx, SchoolEventCard.tsx, EventFilterChips.tsx, tonight-events.css}`, edit `src/app/campus/campus-home.tsx` (§6.1 mount + §6.3 EventsTabBody only) | §2, §5, §6.1 mount, §6.3, C's `FeedSideLayout` | ~800 |

Import map (who imports whom, so parallel work lines up): A imports only §2.1 and `@/lib/...` server
helpers. B imports §2 and A's types (no A runtime). C, D, E import B's exports by the exact names in §5.
D imports E's `TonightSection`, `EventFilterChips`, `SchoolEventCard`; E's campus-home edit imports C's
`FeedSideLayout`, E's own three, and B's `useSchoolEvents`, `useCampusNow`, `upcomingSchool`,
`mergeComingUp`. No new file imports a runtime value from `campus-home.tsx` (type imports only).

Rules for every batch: read `AGENTS.md` (Next 16 differs; docs in `node_modules/next/dist/docs/`); new
files in the listed places only; Writes/Edits ≤ ~150 lines each; erasable TypeScript in pure files and
tests; no `NEXT_PUBLIC_` variable; no database write; no new outside host in the browser (CSP untouched);
theme tokens only (§5.6); comments say why, in plain English. Done when the batch's own tests pass with
`node --test <files>`.

After the wave (orchestrator): `npm run typecheck`, `npm run lint`, `npm test`; an adversarial review per
batch (stale props against §2, the 5+ floor, popularity never ordering, the kill switch, no 500 on a feed
failure, no author names, CSP, hydration); then §9; then commit and push (memory: mobile changes are
committed and pushed every time). Shipping needs no Vercel setting and no database write: the school part
is ON when `SCHOOL_EVENTS_OFF` is unset.
