# Map: Privacy Policy, QR generation, local tooling (check-in build, Oct 19)

Read-only map. Nothing in the repo or any database was changed.

## 1. Privacy Policy

### How the policy is kept (do this, in this order)

- **Two copies that must read word for word the same:** the text
  `handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md` (641 lines) and
  the page `src/app/legal/privacy/*.tsx`. `page.tsx:1-3`: "Change the wording
  there first, then here: the two must read the same." Every section file's
  header repeats "do not reword it here".
- **Effective date:** `src/app/legal/privacy/page.tsx:24`
  `const EFFECTIVE_DATE = "October 18, 2026";` and the md's line 3
  `Effective October 18, 2026`. Set both to the ship day.
- **No "changes" log on the page.** Section 13 (`sections-11-15.tsx:73-78`)
  promises only: "When we change this page we put the new date at the top. For
  a change that matters, we also aim to tell people with accounts in the app or
  by email." History lives in git and in
  `handoffs/legal-2026-10-04-privacy-v3/decisions.md` (parts A..J, last part J
  is Oct 5; later changes went straight into the md + page, e.g. commit
  ddf52e7, Oct 18, "Privacy Policy updated, dated October 18, 2026").
- **The policy shares the Terms' version number** (`src/lib/legal/terms.ts:1`
  `TERMS_VERSION = "2026-05-07"`). Every policy change since Oct 5 shipped
  WITHOUT bumping it (section 13, `sections-11-15.tsx:59-67`). Check-in does not
  need a bump; whether it "matters" enough for an in-app/email notice is
  Franky's call (recommend: no notice, the date at the top is enough, same as
  the Oct 18 club-model change).
- **The word-for-word checker:** `handoffs/legal-2026-10-04-privacy-v3/check/check.mjs`
  (needs a running dev server; Playwright from gstack):
  `node handoffs/legal-2026-10-04-privacy-v3/check/check.mjs --url http://localhost:3000/legal/privacy`
  It writes `check/report.txt` + `report.json` (commit them; last run Oct 18
  18:56: PASS, 1215 sentences, 464 blocks, 5 tables).
  Its date rule (`check/checks.mjs:96-100`) allows only Oct 4/5/7/8/12/13/14
  and the effective date. If the new text says "Since our release of October
  N, 2026" with N = the ship day, that equals the effective date and passes;
  any other new date must be added to that list. It also needs the table row
  counts to match (adding a row to the section 8 table changes "table 4 rows"
  in both copies at once, fine) and every "section N" mention to be a `<Sec>`
  link.
- **Tests that read the policy text** (`npm test` runs every
  `src/**/*.test.ts`):
  - `src/lib/legal/cookie-notice.test.ts:114-125` reads
    `sections-6-8.tsx` + the md for the cookie-notice sentences (section 7).
  - `src/lib/pwa/leave-device-clean.test.ts:45-49` reads `sections-6-8.tsx` +
    the md (no "club titles you have already seen").
  - Both live in section 7; the check-in edits to the section 8 table in the
    same file `sections-6-8.tsx` will not trip them. Others only cite the
    policy in comments (send-log-core.test.ts:106 checks a code header, not the
    page).
  - Recommend a new test in the same style: the md and the page both name
    check-ins in 3c, 5f, the section 8 table and section 9.

### Sections check-in must change (page file:line, md line, current words)

Facts the wording rests on (confirm against the build before writing):
can_manage_event = a club event's CURRENT owner/admin, or an org-less event's
creator (`supabase/migrations/20260928110000_club_events_rules.sql:342-362`);
org-less events are legacy only, POST requires org_id
(`src/app/api/events/route.ts:229-232`), so "the club's owner and admins" stays
true. Cancel = delete (`src/app/api/events/[id]/route.ts:131,155-194`) and
RSVPs cascade off events (`20260430190000_phase1_initial_schema.sql:136`), so
check-ins should `on delete cascade` from events and users too. The officers'
RSVP list today shows name, handle, photo, major, year and RSVP time
(`src/app/api/events/[id]/attendees/route.ts:73-77`) and does NOT filter blocks.

1. **3c, what Vibe stores about what you do** — `sections-1-3.tsx:198-201`,
   md:103. Now: "Club events, your RSVPs (Going or Interested) and personal
   calendar entries." Add check-ins: which event, when, and how (the door
   code, the QR link, or marked by an officer). The officer action belongs in
   the clubs bullet `sections-1-3.tsx:191-197`, md:102, which already says "If
   a club's owner or admin takes you out of the club, adds you to a room ...
   we store who did it and when." Add "marks you as here" there (only if the
   build stores `marked_by`; recommend it does, same pattern).
2. **3e, the no-location promise** — `sections-1-3-c.tsx:22-31`, md:147. Now:
   "We do not ask your device for its location, and we do not work one out
   from your IP address. Three things come close." A check-in is a record that
   a person was at an event's place at about that time. Recommend "Four things
   come close" and one sentence: checking in records that you were at an
   event (3c); Vibe does not ask your device where it is to check you in. The
   build must keep it true: no geolocation call, no IP stored on the row
   (3d's "The parts of the database that we built hold no IP address",
   `sections-1-3-b.tsx:88`, md:125).
3. **Section 5 summary table** — `sections-4-5.tsx:119-122`, md:212. Now: "A
   club's follower list, and who RSVP'd to its events" / "The club's owner and
   admins. ...". Add "and who checked in at them". Add a row for the count:
   "How many people checked in at an event" / "Any signed-in account that can
   see the event, once it reaches 5". Adding a row changes table 1's row
   count in both copies (checker compares them, fine if both move).
4. **5a, what needs a sign-in** — `sections-4-5-a.tsx:52-55`, md:228. Now:
   "... chats, RSVP lists and member lists." Add "check-in lists".
5. **5b, every signed-in account** — `sections-4-5-a.tsx:80`, md:238. Now:
   "Club events, with Going and Interested totals." Add "and, once 5 or more
   checked in, how many were there". Same "once it reaches 5" phrasing as
   5a's club counts (`sections-4-5-a.tsx:42`).
6. **5f, what people who run a club see** — `sections-4-5-c.tsx:20-37`,
   md:290-296. Now: "The club's owner and admins see four more lists: ...
   who RSVP'd to the club's events; ...". Make it five: who checked in at the
   club's events and when, including people who are not members or did not
   RSVP, and who marked Going but did not check in. Add to the "They can ..."
   paragraph (`:30-37`): mark a person as here, and clear an event's
   check-ins. Must say non-members are included: "anyone at the event can
   check in" means a non-member's attendance is shown to the club.
7. **5e, event chat** — `sections-4-5-b.tsx:66-69`, md:275 ("Club members who
   marked Going or Interested, and the club's owner and admins"). Change ONLY
   if checking in gives access to the event's chat. Recommend it does not; then
   no change.
8. **Section 8 retention table** — `sections-6-8.tsx:113-120`, md:399-400. Now
   "RSVPs: You take yours back, the club takes you out (upcoming events only),
   or the event, the club or your account is deleted." New row after it:
   "Check-ins: You remove yours, the club's owner or an admin clears the
   event's check-ins (or takes yours off), or the event, the club or your
   account is deleted." The lead-in `sections-6-8.tsx:87-89` ("Vibe does not
   delete things just because they are old ... Only one thing is deleted on a
   schedule today") stays true only if no purge job is added. Table 4 gains a
   row in both copies.
9. **Section 9, account deletion** — `sections-9-10.tsx:100-103`, md:461. Now:
   "your follows, club memberships and titles, RSVPs, blocks and mutes, club
   mutes included;" add "check-ins". And `sections-9-10.tsx:122-128`, md:469:
   "Posts and events you made as a club are deleted, and each event takes
   everyone's RSVPs and its whole chat with it." add "check-ins". Decision
   for the build: when the OFFICER who marked someone deletes their account,
   recommend `marked_by ... on delete set null` so the student's check-in
   stays; then say so ("A check-in you marked for someone stays, without your
   name on it").
10. **Date** — `page.tsx:24` + md:3 to the ship day (section 13's promise).
11. **Optional, section 6 Vercel** — `sections-6-8-companies.tsx:30-38`, md:354:
   "Some web addresses carry personal details, such as search words or
   the link in one of our emails." The QR link lands in Vercel's visit log
   with the visitor's IP. The code dies in ~30 s, so recommend no change, or
   add "or an event's check-in link".
12. **No change needed:** short version (its location item 8 is about photo
   files only, `page-short-version.tsx:88-96`), Start here, 5g, 5h (the
   cofounder-with-access wording already covers every table), section 4
   ("We use your information to run Vibe").

Sentry: `src/lib/sentry-config.ts:23-24` already redacts a `code=` query
value (`AUTH_PARAM_KEYS` includes `code`). Put the door code in `?code=` (not
in the path and not `?checkin_code=`, which the regex would miss since the key
must follow `?`/`&` exactly) so 3d's "we strip sign-in links, access codes"
stays true for the QR link with no policy change. Better still, the landing
page strips the query with history.replaceState once read.

Terms (out of lens, one grep away): check the Terms for an events/RSVP line
before shipping; the version number does not need to move.
(Checked: `src/app/legal/terms/page.tsx` has no event, RSVP or attendance
line, so the Terms need no change.)

## 2. QR generation

Nothing QR-shaped is installed (`package.json` deps, `node_modules`, the
lockfile: no match). Registry facts (npm view, Oct 19 2026):

| Package | Version (date) | License | Runtime deps | Unpacked | Weekly dl | SVG string, no DOM | Types |
|---|---|---|---|---|---|---|---|
| `qrcode` | 1.5.4 (Aug 2024) | MIT | pngjs 5, dijkstrajs, **yargs 15** (+11: cliui, find-up, y18n, yargs-parser ... about 25 packages in all, for its CLI) | 135 KB | 18.5 M | yes, `QRCode.toString(text, {type: "svg"})` (async or callback) | none, needs `@types/qrcode` 1.5.6 |
| `uqr` (unjs) | 0.1.3 (Apr 2026) | MIT | **none** | 79 KB | 3.8 M | yes, `renderSVG(text, opts)`; `encode(text, {ecc, border})` gives a boolean matrix | built in, ESM + CJS |
| `lean-qr` | 2.7.4 (Sep 7 2026) | MIT | none | 69 KB | 50 K | yes, `lean-qr/extras/svg` `toSvgSource` | built in |
| `qr` (paulmillr) | 0.7.2 (Sep 28 2026) | MIT/Apache-2.0 | none | 539 KB (has a decoder too) | 175 K | yes, `encodeQR(text, "svg")` | built in |
| `qrcode-generator` | 2.0.4 (Aug 2025) | MIT | none | 555 KB (many builds) | 3.0 M | yes, `createSvgTag()` | built in |

Hand-written encoder: byte mode + Reed-Solomon ECC + version choice + 8 mask
patterns with the penalty rules + format/version bits. Nayuki's reference
(what `uqr` ports) is about 700 lines. A bug in masking or format bits gives a
code that some phone cameras read and others do not, which is exactly the
failure a door line cannot debug. Not worth it for one screen.

**Recommendation: `uqr`, pinned exactly (`"uqr": "0.1.3"`, no caret).** Zero
dependencies, MIT, TypeScript built in, pure functions that run in the
browser, Node or edge with no canvas or DOM, millions of weekly installs, and
the algorithm is Project Nayuki's well-tested generator. Use `encode()` and
draw the matrix as ONE `<path>` inside an inline React `<svg>` (crisp at any
size, no `dangerouslySetInnerHTML`, no data URL). `renderSVG` also works and
returns a string. Second choice: `lean-qr` (also zero-dep, newer releases,
fewer users). Avoid `qrcode` (yargs tree for a CLI we never run, no types).

Rules for the QR on screen:
- Generate it on the officer's own device (or server). NEVER a QR web
  service (api.qrserver.com etc.): it would send each event link to a new
  company (a section 6 change and a new CSP host in `src/lib/security/csp.ts`).
  Local generation needs no CSP change (`csp.ts:206` img-src already allows
  `data:` and `blob:` if a data URL is ever used).
- Always dark modules on a white card with a 4-module quiet zone, in Night
  mode too. Inverted (light-on-dark) codes fail on some cameras. This is a
  deliberate exception to theme tokens: name it a fixed "qr paper / qr ink"
  pair in the component with a comment.
- ECC level M (`ecc: "M"`); the link is about 70 characters, version 4 to 5,
  big modules, easy from a few feet away.
- Link shape: `https://www.connectvibe.app/<route>?code=1234` with the canonical
  host (`src/lib/push/config.ts:21` `PUSH_SITE_ORIGIN`, or
  `getSiteOriginForRequest` in `src/lib/auth/site-url.ts:19` so local dev
  makes localhost links). The apex would cost a redirect. Keep the code in
  `?code=` so the Sentry scrub already hides it (section 1 above).
- Re-render on each code change (about every 30 s); no animation on the code
  itself beyond a `src/lib/motion` opacity crossfade.
- A phone cannot open a `localhost` QR. Local testing: open the link in the
  desktop browser, or run `next dev -H 0.0.0.0` and visit by the Mac's LAN
  address. A Vercel preview cannot sign in (Turnstile key is Production only),
  so the real phone-camera test is on production after deploy.

## 3. Local database and tooling

### What is there (read Oct 19, read-only)

- CLI `~/.local/bin/supabase` 2.117.0 (it is on PATH; `scripts/local-seed.mjs`
  calls plain `supabase`). The local stack has been up 11 days (`docker ps`:
  `supabase_db_vibe` and the rest, all healthy). `supabase/config.toml`: API
  54321, db 54322, Postgres 17, `[db.seed] sql_paths = ["./seed.sql"]`.
- **The CLI is LINKED TO PRODUCTION** (`supabase/.temp/project-ref`,
  `linked-project.json`; `supabase/seed.sql:13-16` says so). So
  `supabase db push` hits production. Never run it.
- `next dev` reads `.env.development.local`, whose
  `NEXT_PUBLIC_SUPABASE_URL` is `http://127.0.0.1:54321` (the local stack).
- `package.json` scripts: only `dev`, `build`, `start`, `lint`, `typecheck`,
  `test` (`node --test` over every `src/**/*.test.ts`). No supabase script.
- Local `supabase_migrations.schema_migrations`: 92 rows, newest
  `20261008140000_school_checkin`. The 12 files after it
  (`20261011100000` .. `20261017120000`) were applied by hand WITHOUT a row
  (their objects exist: `org_board_bars`, `usage_day_tally`, `rate_limits`).
  Older gap too (`handoffs/chat-redesign/wave-1-asis.md:841-855`). So:
  pre-flights must test the catalog (`to_regclass`, function md5,
  `pg_policy`), never `schema_migrations`; `supabase migration up` would try
  to re-run those files and abort. `public.event_checkins` does not exist yet.

### Applying a new migration to LOCAL (the house recipe)

From the newest file's header (`supabase/migrations/20261017120000_member_lists_members_only.sql:104-112`)
and `handoffs/chat-redesign/wave-3-desktop/contract.md:508`:

    docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/2026101910xxxx_event_checkins.sql

then record it through the same docker exec:

    insert into supabase_migrations.schema_migrations (version, name)
    values ('2026101910xxxx', 'event_checkins') on conflict (version) do nothing;

Never `supabase db reset` (wipes every local row other sessions and the
browser passes use; `handoffs/s74-release/RUNBOOK.md:65`), never `supabase
migration up`, never `supabase db push` (`handoffs/s72-prep/waitlist/BUILD.md:45-48`).
One builder on the local database at a time (no seed or check script running
beside an apply). File name must sort after `20261017120000`.

Shape every migration here follows (`contract.md:502-506`; 20261017120000):
header comments PLAIN ENGLISH, WHAT IT DOES (numbered), DOES NOT, LIVE STATE,
LOCK, PRE-CHECK (read-only, counts and catalog only, expected answers in
brackets), HOW TO APPLY (local command + the production recipe + the
schema_migrations row), ROLLBACK (exact statements in one transaction,
including `delete from supabase_migrations.schema_migrations where version =
...`), REHEARSED notes. Body: `begin;` `set local lock_timeout = '5s';`
PRE-FLIGHT `do $$` that raises on "already applied" / drift, the statements,
POST-CHECK by catalog, POST-CHECK BY BEHAVIOUR in a nested block that rolls
itself back, `notify pgrst, 'reload schema';` `commit;`.
House rule from that contract (`contract.md:504`): never `REVOKE EXECUTE` on a
public function from anon/authenticated/service_role on this Postgres image;
refuse inside the function instead (`if current_setting('role', true) in
('anon','authenticated') then raise ... '42501'`). Table revokes are fine.

### Seed and test fixtures

- `supabase/seed.sql` (20 lines) only opens local sign-up, guarded to a
  database with no accounts. Runs on `db reset` only.
- `scripts/local-seed.mjs` (1042 lines; `scripts/README.md`): re-runnable,
  refuses any host but 127.0.0.1/localhost, reads keys only from `supabase
  status -o env`. Accounts `scripts/local-seed.mjs:166-182`: avery@example.test
  (`avery_owner`, IU, owns the test clubs), blake@example.test (`blake_iu`,
  IU, member of `chat_seed_club`), casey@example.test (`casey_purdue`,
  Purdue, mod), drew@example.test (`drew_new`, NOT verified, not onboarded),
  emery@example.test (`emery_admin`, IU, admin). One shared password,
  `PASSWORD` at `:115`. Roles `:490-492`. RSVPs `:533-534` (Blake Going,
  Casey Interested to "Chat Seed Game Night").
- **No seeded event is inside a check-in window** (1 h before start to 1 h
  after end): events are +3, +5, +10 days and ended 3, 5, 10 days ago
  (`:523-534`, `:779-787`; `eventWindow` = 23:00 UTC, two hours). The build
  needs either a "happening now" event in `local-seed.mjs` (new spec with a
  start a few minutes ago) or, better, its own fixtures in the SQL check.
- **Local DB check pattern** (`scripts/sql/club-model-check.sql:1-80`):
  first line a psql meta-command (`\set ON_ERROR_STOP on`, so the
  Management API / MCP refuse the file), one transaction ending in ROLLBACK,
  a guard `if inet_server_addr() is not null then raise` (unix socket =
  local only), its own throwaway accounts (it made 15; the "count from 5 up"
  rule needs at least 6 check-ins to test both sides), acting as a student
  via `set local role authenticated` + `request.jwt.claims`, `pg_temp.ok()`
  helpers, a NOTICE per passing case, last line "<name>: all N cases
  passed". Run:
  `docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/event-checkins-check.sql`
- App tests: `npm test`, `npm run typecheck`, `npm run lint`. Tests read
  source text: run the whole suite after any edit.

### Applying to PRODUCTION later (after Franky's yes, main session only)

- Franky's explicit OK each time (memory; `handoffs/2026-10-16-session-78-rate-limits-follow-wording.md:112-113`).
- Run the file's PRE-CHECK reads first with the connector's `execute_sql`
  (counts, catalog and md5 only, never people's records).
- Apply with the Supabase connector's `apply_migration` (the
  `mcp__95356d5d-...__apply_migration` tool; the other `mcp__supabase__`
  server has no apply), passing the body WITHOUT its `begin;` / `commit;`
  (`handoffs/2026-10-07-session-75-mini-messenger.md:126-128`;
  `handoffs/2026-10-13-session-76-close-six-calls-live-and-next-up.md:135-137`).
- The connector records the migration under its own timestamp; rename that
  row to the file's version and name (S75 did it with one `update` on
  `supabase_migrations.schema_migrations`; the newest header writes it as
  `insert ... values ('<version>', '<name>') on conflict (version) do
  nothing` plus removing the auto row).
- Order: a new table the old build never touches can go in just before the
  push (the 20261017 pattern: "APPLY JUST BEFORE THE PUSH"). Then the Privacy
  Policy, dated that day, ships in the same push.
- Undo = the file's ROLLBACK block.

### Naming collision to avoid

"Check-in" already means two other things in this codebase and the policy:
- the yearly school-inbox check: migration `20261008140000_school_checkin.sql`,
  `users.school_checkin_sent_at`, `/api/cron/school-checkin`, email kind
  `school_checkin`;
- the policy's 3d heartbeat: "your browser checks in with our server every
  few minutes" and "The first time your browser checks in on a day"
  (`sections-1-3-b.tsx:25-56`, md:122-123).
Name the table `event_checkins`, routes under `/api/events/[id]/checkin`,
budgets `eventCheckin*`, and in the policy always say "check in at an event"
/ "event check-ins" so a reader never confuses it with the heartbeat.

## 4. Build choices that change the policy's words (settle before drafting)

1. Stored per check-in: event, account, time, method (code / QR / marked),
   `marked_by`. No IP, no device, no location. (3c, 3e)
2. `marked_by` when the marking officer deletes their account: set null
   (recommended) or cascade. (section 9)
3. Can an officer take ONE person's check-in off, or only clear the whole
   event? (section 8 row)
4. Does a check-in open the event's chat? Recommend no. (5e)
5. Does the student get a notification when marked as here? (3c
   notifications; recommend no, to keep 3c/5g unchanged)
6. Blocks: does an officer a student blocked still see that student's
   check-in? Today's RSVP list ignores blocks
   (`src/app/api/events/[id]/attendees/route.ts:73-77`). Same answer for
   both, and say it in 5f if they differ.
7. The "N were there" count: who sees it (any signed-in account that can see
   the event), from 5 up, and whether the officer's own view shows the exact
   number under 5. (section 5 table, 5b)
8. Nothing deleted on a schedule (keeps section 8's "Only one thing is
   deleted on a schedule today" true).
