> Read-only session. Nothing in the repo or DB was modified. Every claim below carries a `file:line`, a schema fact, or a number measured with SQL on 2026-09-12.

---

## 1. What campus actually is today

Campus is a **self-declared free-text string**, not an entity.

| Table | Campus column | Type | Rows today |
|---|---|---|---|
| `users` | `school` | `text NOT NULL DEFAULT ''::text` | 8 (7 = `''`, 1 = `IU Indianapolis`) |
| `orgs` | `school` | `text NOT NULL DEFAULT ''::text` | 5 (all `''`) |
| `events` | **none** | — | 8 (all past; `ends_at >= now()` = **0**) |
| `posts` | **none** | — | 25 (23 `type='post'`) |
| `channels` | **none** | — | 12 with `org_id` set |

The canonical list is a hardcoded TS array of 9 IU campuses at `src/lib/iu/campuses.ts:33-45`, with a duplicated copy in the static page at `public/html/onboarding.html:561-571` (whose comment at :558-559 admits it must be kept in sync by hand). Adding Purdue requires a code deploy and a second hand-sync.

**The storage format is the label, not the id** (`campuses.ts:16-20`): `users.school` holds the literal string `"IU Indianapolis"`. That string is the join key everywhere. This matters more than it sounds — this exact campus was *renamed* from IUPUI (per project context), and a rename today would orphan every row that references the old label.

**`school` is not a privacy boundary and must never become one.** Stated at `campuses.ts:11-14` and again at `campus-scope.ts:11-14`. RLS confirms it: `users_select_authenticated` is `USING (true)`, so any authenticated user can already read any user row. Cross-campus profiles and people search work at the DB level today with no change.

### The name collision — two meanings of "school"

`src/lib/iu/majors.ts:17` exports `IU_SCHOOLS`, which is **academic schools** (School of Informatics), not campuses. `campus-home.tsx:21` imports it alongside campus code. Anyone doing a mechanical rename of "school" will corrupt the majors taxonomy. Likewise `/the-map` (`src/app/the-map/page.tsx`, 1078 lines) is the **investor pitch page**, not the campus map; the campus map is `MapTabBody` (`campus-home.tsx:9218`) + `MapMobile.tsx` + `/api/campus-map`.

---

## 2. Why the map is empty for everyone

Two different causes, both confirmed by SQL:

- **The 7 campus-less accounts** hit `campus-map/route.ts:43-55` — `if (!school)` returns `{majors: [], orgs: [], reason: "no_school"}`.
- **The one account with a campus** hits `campus-map/route.ts:59-62` — `.eq("school", school)` returns exactly one row (itself), and line 67 filters self out. `peers = []`, so `majors = []` (lines 109-127).

So the map is honest and empty, not broken. **The back-fill is the fix, not a query change.**

### The strict-equality bug: two real sites, not three

The shared helper `campusOrFilter()` (`campus-scope.ts:100-102`) emits `col.eq."Label",col.eq."",col.is.null` — campus-less rows appear in *every* campus view, deliberately (`campus-scope.ts:88-98`). Orgs (`orgs/route.ts:174`) and events (`events/route.ts:176,188`) adopted it. Two sites never did:

1. **`src/app/api/trending/hashtags/route.ts:57`** — `query.eq("author.school", school)`. Excludes every post by a campus-less author. **10 of 25 posts** have such authors. The fix is one line, mirroring `events/route.ts:188` exactly: `query.or(campusOrFilter("school", label), { referencedTable: "author" })`.
   *Honest caveat:* in the current 7-day window all 3 posts are by the campus-set author, so this does **not** bite today. It is structural, and it bites the moment any of the other 7 accounts picks a campus.

2. **`src/app/api/search/route.ts:265`** — `if (viewerSchool && r.creator?.school !== viewerSchool) continue;`. Same exclusion for event search. It carries a **second, worse bug**: it scopes events by the *creator's* campus, while `/api/events` scopes by the **org's** campus (docblock `events/route.ts:67-69`, query :173-177). The same event can appear in the Events tab and be invisible in search.

**The campus map should keep strict equality on purpose.** Applying `campusOrFilter` to `campus-map/route.ts:62` would place all 7 campus-less students onto every campus map as if they were physically there. The map is a physical-presence metaphor; that is fabrication. The rule differs by entity type on purpose:

> A campus-less **org** appears everywhere (dropping it would silently delete it from all views). A campus-less **person** appears nowhere on a map, and the map says "7 students haven't set a campus yet" instead of placing them.

### No client has ever sent `?campus=`

A repo-wide grep for `campus=` across `src/` and `public/html/` returns **only the API routes' own docblocks and code**. The `?campus=<id>` / `?campus=all` contract (`campus-scope.ts:16-24`) is fully implemented server-side with **zero callers**. The switcher does not exist. This is good news: the contract is already designed and tested-by-construction; Batch 2 is mostly wiring.

---

## 3. Data model: a real `campuses` table — yes

**Recommendation: create the table, with a UUID primary key and a unique slug.**

Not a slug PK. IUPUI → IU Indianapolis already happened to this very campus; a slug PK would cascade a rename through every FK. UUID PK + `slug text UNIQUE` lets the display name and the URL change without touching a single row.

```
campuses(
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,      -- 'iu-indianapolis'
  name          text not null,             -- 'IU Indianapolis'
  short_name    text not null,             -- 'Indianapolis'
  city          text not null,
  state         text not null,             -- 'IN'
  university    text not null,             -- 'Indiana University'
  email_domains text[] not null default '{}',
  athletics     text,                      -- 'Jaguars'
  is_open       boolean not null default false,
  opened_at     timestamptz,
  created_at    timestamptz not null default now()
)
```

`email_domains` is an array on the campus, not a single column, because `iu.edu` maps to nine campuses.

### Migration shape (reversible at every step)

1. Create `campuses`, seed the 9 IU rows from `campuses.ts:33-45`.
2. Add **nullable** `campus_id uuid REFERENCES campuses(id)` to `users`, `orgs`, `posts`, `events`. Nullable is load-bearing: NULL means "we genuinely don't know", which is the honest state for 7 of 8 users.
3. Back-fill `campus_id` from `school` via the label map. Exactly **1 user row** and **0 org rows** are affected.
4. Dual-write `school` **and** `campus_id` for one release, so a rollback loses nothing.
5. Cut reads over to `campus_id`.
6. **Drop `school` in a separate, much-later migration.** This is the one irreversible step.

Keep `src/lib/iu/campuses.ts`'s exported function signatures (`campusById`, `campusByLabel`, `normalizeCampusLabel`, `campusBadgeLabel`) and swap the backing store to a cached read of the table. That preserves ~20 call sites across `OnboardingMobile.tsx:16`, `ProfileMobile.tsx:17`, `SettingsClient.tsx:12`, `build-vibe-user-v1.ts:1`, `onboarding-prefill.ts:1` without touching them.

Migrations go in `supabase/migrations/YYYYMMDDHHMMSS_name.sql` and are applied by hand via the management API with **curl** (the MCP `execute_sql` is read-only), plus a `supabase_migrations.schema_migrations` INSERT. `20260911100000_channel_members_delete_own_pending.sql` is the header template to copy — what/why/live-state/deploy-order/how-to-apply/rollback.

### Should the .edu domain set home campus automatically?

**Within IU, it cannot.** `iu.edu` is issued university-wide (`campuses.ts:6-9`, `school-email-domains.ts:11-14` allowlists `iu.edu` + `iupui.edu`), so the domain proves IU membership and nothing about campus. All 8 users are `school_verified = true` and the column is still empty for 7 — verification and campus are orthogonal.

**Across universities, it can.** `purdue.edu` identifies the institution.

One rule covers both: **derive automatically when the domain maps to exactly one open campus; otherwise show a picker pre-filtered to that university's campuses.** Honest in both cases, no special-casing.

### Can a student change it?

Yes — it is self-editable today (`profile-sync/route.ts:85-97`, `profile/route.ts:174`, `SettingsClient.tsx:503,578`) and must stay so; a transfer student is real and campus is explicitly not a security boundary. But add **one change per 30 days**, and **do not retroactively move their existing posts** (see §5). Free campus-hopping is the spam vector.

---

## 4. Home campus vs viewing campus

- **Home campus** = `users.campus_id`. Identity, singular. Shown on the profile, determines where you may post, whether you appear on a map, and where bare `/campus` lands.
- **Viewing campus** = whose feed/orgs/events/map you are currently looking at. Ephemeral.

### Routing: a URL segment, `/campus/[slug]` — recommended over a stored preference

- **Linkable.** "Look at what Purdue is doing" is a link. A stored preference cannot be shared.
- **The pattern already exists.** `campus-home.tsx:314-345` already parses `?tab=`, `?post=` and `?tag=` from the URL.
- **The back button works.** A stored preference makes it lie.
- **No cross-device server state.**

Bare `/campus` **always** redirects to the home campus — predictable, and it keeps existing deep links alive (Otto's "Coming up" links to `/campus?tab=events`, S57 handoff §1). Touch points: `campus/page.tsx:15` (`enforceCampusAccess("/campus")`), `proxy.ts:35,38,112`, `feature-flags.ts:11-12`.

### The scoping split

| Scoped to the **viewing** campus | **Global**, never scoped |
|---|---|
| Live feed (Campus lane) | Connections / follows |
| Orgs & clubs list | DMs and threads |
| Org & club chat discovery | People search |
| Events tab | Profiles |
| Campus map | Notifications, bookmarks |
| Trending hashtags | Otto's personal sections |
| "on Vibe / active now" banner | Following lane of the feed |

This is exactly the founder's sentence: each campus gets its own feed / chat / events / map, while you connect with anyone anywhere and search finds anyone.

### The cross-campus feed tension

"Each campus has its own live feed" and "connect with anyone from any campus" conflict unless the feed has two lanes. The UI scaffolding already exists at `feed/page.tsx:38` — `{["Following", "Campus"].map(...)}` (currently behind the global-feed flag, `feature-flags.ts:11-12`).

> **Campus lane** = the viewing campus only. **Following lane** = everyone you follow, any campus.

A cross-campus connection that produces nothing in your feed is a dead connection, and that would make the whole "connect with anyone" promise hollow.

---

## 5. Permissions while visiting another campus

**Read everything. Write almost nothing.**

| Action on a campus that is not your home | Allowed? |
|---|---|
| Read feed, events, orgs, map, trending | **Yes** |
| Post to its feed | **No** |
| RSVP to its events | **Yes** |
| Join its orgs | **Request only** (`org_join_requests` already exists) |
| Post in its org chat | Only as a member (already enforced by `can_view_org_channel`) |
| Appear on its map | **No** |

**One-sentence defense:** reading is what makes another campus worth switching to, and writing is what makes a campus feel like *yours* — so visitors get every read plus the two writes that are physically real (attending an event, asking to join a club), and nothing that would let one person's voice appear in nine campus feeds at once.

RSVP is a deliberate yes: IU students travel between Indianapolis and Bloomington constantly, and an event is a real-world thing you can physically attend. Org join is a *request*, not an instant join, so the org owner decides — zero new mechanism, the flow already exists.

### What stops a student spamming every campus

The permission line **is** the anti-spam mechanism. You may only post to your home campus, and home campus changes are limited to one per 30 days. A spammer cannot fan out without waiting a month per campus. Layer on the existing limiter — `rateLimit(key, {limit, windowSec})` at `src/lib/rate-limit.ts:20-28` — keyed per `(user, campus)` for posts.

### The honest empty state of a brand-new campus

Vibe will be **first** on every campus it opens, so the zero state is the *normal* state, not an edge case. A seeded or fabricated feed is forbidden, and there is precedent in the code for doing this right: `campus-map/route.ts:169-170` ("Real data only… returns empty arrays") and `zone/route.ts:90-91` (both replaced fabricated rosters in S55).

A new campus shows: **"Nobody's here yet — you'd be the first"** plus a real invite action. Never a placeholder person, never a sample post.

Critically, **"empty" must not be reachable by failure.** Use `vibeRequest` + `LoadFailed` (`src/lib/feedback/request.ts`, `src/components/feedback/LoadFailed.tsx`) so a 500 while viewing another campus reads "couldn't load — Retry", not "this campus is empty." That is S57's open pick-up item #1 and it lands directly on this surface.

### How a campus gets opened

`campuses.is_open` (default `false`), toggled by Franky in admin. The switcher lists open campuses. A closed campus is still reachable by direct URL and shows the "be first" state, so a student whose domain maps to a not-yet-open campus can sign up and post rather than hitting a wall. Growth stays organic; nothing is faked.

---

## 6. Every query that changes

### Reads

| # | File:line | Change |
|---|---|---|
| 1 | `feed/route.ts:147-167` | Campus lane filters on `campus_id`; Following lane stays global. Docblock at `:62,71-78` must be rewritten — it currently states the opposite. |
| 2 | `feed/route.ts:506,533-536` | **Delete `SAME_CAMPUS_BOOST`.** In a single-campus feed it multiplies every row equally — mathematically inert. |
| 3 | `trending/hashtags/route.ts:57` | Strict-equality fix + accept `?campus=`. |
| 4 | `events/route.ts:101,173-177,186-188` | Take campus from the URL segment. Contract already built. The org-less fallback at `:186-188` is already dead data (`events_orgless = 0`). |
| 5 | `orgs/route.ts:69,167-175` | Same. Preserve the "explicit search ignores campus" decision at `:162-167`. |
| 6 | `campus-map/route.ts:43-62`, `zone/route.ts:52-65` | Accept a campus param instead of always reading `me.school`. **Keep strict equality.** |
| 7 | `search/route.ts:96-108,260-265` | Fix strict equality **and** switch event scoping from `creator.school` to the org's campus, to match `/api/events`. Users and orgs stay global. |
| 8 | `users/search/route.ts:84-90` | Already global — no filter change. Add a campus badge to results so "search anyone from anywhere" shows *where* they are. |
| 9 | `stats/campus/route.ts:28-34` | Counts **all** users, so every campus would display the same headcount — a lie on every campus but the largest. The route's own docblock at `:11-13` anticipates this. |
| 10 | `me/suggested-connections/route.ts:90,246-268` | **Already correct.** It ranks rather than filters (`:253-259`) and never excludes anyone. Only swap `school` → `campus_id`. |
| 11 | `me/otto/route.ts` | Sections are personal (`:202,241,321,393`) and stay global. Only the "nothing new on campus yet" copy at `:28` needs campus awareness. Otto's trending/people come from #3 and #10. |

### Writes

| # | File:line | Change |
|---|---|---|
| 12 | `me/publish-post/route.ts:177-184` | Stamp `campus_id` at insert = author's home campus. Refuse a client-asserted campus that isn't theirs. |
| 13 | `orgs/[slug]/posts/route.ts:114-116` | Stamp the **org's** campus. |
| 14 | `events/route.ts:283+` (POST) | Stamp campus from the org. |
| 15 | `orgs/route.ts:337-348` | Already inherits the creator's campus — switch to `campus_id`. |
| 16 | `me/profile-sync/route.ts:85-97`, `me/profile/route.ts:174` | Validate against the table; enforce the 30-day change limit. |

**Why posts must carry their own `campus_id`:** campus is derived at read time today (`feed/route.ts:534`, `trending:51-57`). So if a student switches campus, **every post they ever made retroactively moves with them.** That is wrong for a multi-campus product and it is the single strongest argument for denormalizing campus onto `posts` at insert.

### Clients

- `campus-home.tsx` (13,424 lines) — switcher + pass campus on: feed `:4387-4388`, events `:6745,6762`, orgs `:459`, map `:9247,10695-10696`, trending `:11034`, stats `:3346`, search `:3647`.
- `CampusMobile.tsx` (3,377) — `:210,234,257,312,1517,2953`.
- `MapMobile.tsx` — `:276,725-726`.
- Pickers to load from the table: `SettingsClient.tsx:578`, `ProfileMobile.tsx:1564`, `OnboardingMobile.tsx:633`, `onboarding.html:573-587`, `profile.html:3344`.

---

## 7. Sequencing

**B0 — ships now, no schema.** The two strict-equality fixes + a shared `matchesCampus()` predicate. Independent of everything else; no client change; verifiable today.

**B1 — schema.** `campuses` table, `campus_id` columns, back-fill, dual-write. No read changes, fully reversible.

**B2 — the smallest end-to-end slice that proves switching.** `/campus/[slug]` + switcher + **orgs and events only**, because those two already implement the `?campus=` contract. This proves the entire design with roughly two files of server change and no feed risk.

**B3 — feed.** Post campus stamping, then the Campus/Following lane split.

**B4 — remaining surfaces.** Map, trending, stats banner, event search.

**B5 — permissions and safety.** Visitor write rules, campus-change limit, open/closed, empty states.

**B6 — drop `school`.** Irreversible; separate migration; only once nothing reads it.

**Batch by file ownership.** `campus-home.tsx` (13.4k lines) and `CampusMobile.tsx` (3.4k) are touched by B2, B3 and B4 — they must have exactly one owner at a time or the merges will be brutal.

---

## 8. Expensive or irreversible — flagged

- **Dropping `users.school` / `orgs.school`** — irreversible. Last, alone, after dual-write has run a full release.
- **Hard-scoping the feed (B3)** — with 23 posts and 8 users, this makes the app look *emptier*. Indianapolis would show 15 posts; every other campus shows zero. Ship it behind the existing flag pattern (`feature-flags.ts`) and turn it on when a second campus has real people. The current global-feed docblock (`feed/route.ts:74-78`) makes precisely this argument and it is still correct.
- **Back-filling the 7 empty accounts to Indianapolis** — a guessed campus is indistinguishable from a declared one downstream, and the map and feed would then treat it as fact. Recommend leaving them NULL and prompting; it is 7 people Franky knows personally.
- **Auto-deriving campus from an IU email** — not possible, ever. One domain, nine campuses.
- **Both onboarding paths currently pre-select IU Indianapolis** (`OnboardingMobile.tsx:179` + `:330-331`, `onboarding.html:583` + `:846-847`), so every new signup silently stamps the pilot campus even if the student never touches the control. With multi-campus this becomes a real mis-assignment. Make the first option an explicit unset.