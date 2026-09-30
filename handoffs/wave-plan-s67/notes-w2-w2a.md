# W2a notes — profile_layout data layer (S67 wave 2)

Started 2026-09-26. Owner of: migration, profile-layout.ts (+test), self-write-columns (+test),
types.ts, normalize-profile-view.ts, build-vibe-user-v1.ts (+test), missing-column.ts (+NEW test),
profile-bootstrap route, users/[handle]/bootstrap route, profile-sync route, profile route.

## Plan (from contracts C3 + waves W2a)
1. Migration `20260926100000_users_profile_layout.sql` in the house format of `20260916130000_post_edited_at.sql`.
   Column: `profile_layout jsonb not null default '{}'::jsonb` + COMMENT. No authenticated grant.
2. `profile-layout.ts` pure, zero imports: WidgetId, ProfileLayout, WIDGET_IDS, DEFAULT_PROFILE_LAYOUT,
   sanitizeProfileLayout, isDefaultLayout. Default order: bio, experience, skills, posts, resume, working_on.
3. self-write-columns: add "profile_layout"; pinned test 21 -> 22.
4. types.ts + normalize-profile-view.ts: `profile_layout: ProfileLayout`, sanitized on read.
5. build-vibe-user-v1.ts: `u.profileLayout = profile.profile_layout`; extend "every other key is unchanged" test.
6. Three read routes: `profile_layout` joins OPTIONAL first-tier columns next to school_system,campus_id,campus_set_at
   (never BASE_*); every isMissingColumnError there -> `isMissingColumnError(error, [...M1_USER_COLUMNS, "profile_layout"])`.
7. missing-column.test.ts (NEW): fake 42703 naming profile_layout matches with extended list, not with default.
8. Both write routes accept `profile_layout`, run sanitizeProfileLayout, whole document only; unexpectedSelfWriteKeys stays in front.

## Decisions so far
- (none yet; reading source files next)

## Progress log
- [ ] 1 migration
- [ ] 2 profile-layout.ts + test
- [ ] 3 self-write-columns + test
- [ ] 4 types + normalize
- [ ] 5 build-vibe-user-v1 + test
- [ ] 6 three read routes
- [ ] 7 missing-column export + test
- [ ] 8 two write routes
- [ ] tsc + node --test

## Decisions (after reading the source, call ~12)
- `src/lib/db/missing-column.test.ts` ALREADY EXISTS and is tracked (waves.md said NEW). I extend it, not create it.
  Contract deviation to report. It already exports/tests M1_USER_COLUMNS, so no export change needed.
- The three "read" routes that get `profile_layout` in the first tier + the extended guard are profile-bootstrap,
  users/[handle]/bootstrap and profile-sync's echo (the only three isMissingColumnError call sites).
  PATCH /api/me/profile's echo is a RAW row that is "campus-blind on purpose" (route.ts:397-410) and returns
  `profile: row` unnormalized; I leave that select alone (adding the column there would be a fourth first-tier
  select with no guard, and the phone re-bootstraps after a save anyway).
- Both write routes: `if ("profile_layout" in body) patch.profile_layout = sanitizeProfileLayout(body.profile_layout)`.
  Snake key only (C3). The sanitizer always returns the whole document, so a partial can't land.
  In PATCH /api/me/profile the "No valid fields" gate checks Object.keys(patch).length, so a layout-only body passes.
- The word filter (`blockedProfileField`) receives `...patch`; checking `suspectProfileFields` to confirm it only
  looks at named free-text keys so an object value is ignored.
- `buildVibeUserV1FromProfile`: `u.profileLayout = profile.profile_layout` set ALWAYS (C3 says the key is set by the
  builder; the desktop page needs a document to apply even when the row is default). Test key list gains "profileLayout".
- `types.ts` gets `profile_layout: ProfileLayout` (required). Only normalize-profile-view.ts constructs ProfileView
  (the other "ProfileView*" hits are the profile-VIEWERS metrics, a different thing), so nothing else breaks.
- Migration LIVE STATE header comes from one read-only MCP SELECT (columns, ACL, latest schema_migrations version).

## Progress (call ~14): all eight items written, verification next
- [x] 1 migration (header + body, ~150 lines, in-transaction post-check pins service-role-only)
- [x] 2 profile-layout.ts + test (9 tests)
- [x] 3 self-write-columns + test (21 -> 22)
- [x] 4 types + normalize (`profile_layout: ProfileLayout`, sanitized on read)
- [x] 5 build-vibe-user-v1 (`u.profileLayout` always, copied) + test (key list + new test)
- [x] 6 three read routes: `,profile_layout` appended to the first-tier template, guard = [...M1_USER_COLUMNS, "profile_layout"]
- [x] 7 missing-column.test.ts extended (fake 42703/PGRST204 + text pins on the three routes)
- [x] 8 two write routes accept `profile_layout` via sanitizeProfileLayout (whole doc), unexpectedSelfWriteKeys untouched
- [ ] node --test on my five test files, then `npx tsc --noEmit`

## Verification round 1 (call ~16)
- node --test: 29/30 pass. The one failure, self-write-columns.test.ts "limiter must run before the Terms gate",
  is PRE-EXISTING: since f537aee (moderation) profile + profile-sync gate through requireNotRestricted(user.id),
  and the test still looked only for requireTermsAccepted(user.id) (HEAD has 0 occurrences in both routes).
  I own that test file, so I made the assertion accept either gate name (Math.max of the two indexOf). Reported.
- tsc: one error of mine (Object.freeze([]) is readonly never[]; fixed with `[] as WidgetId[]`), plus two in
  src/components/mobile/ProfileMobile.tsx (ArrangeProfileSheet missing, implicit any) = W2c's file, still in progress.

## Done (call ~18)
- node --test on the four W2a test files: 30/30 pass.
- npx tsc --noEmit: clean except ProfileMobile.tsx(2476, 2487) = W2c's file, still being built.
- Nothing committed, nothing pushed, nothing applied to any database (one read-only MCP SELECT for the LIVE STATE header).

## For the reviewer (W2d)
- The migration's in-transaction `do $$` post-check pins service-role-only; the read-only MCP walk line is
  `has_column_privilege('authenticated','public.users','profile_layout','UPDATE')` = f (waves.md walk, last line).
- `missing-column.test.ts` pins, as text, that each of the three routes: keeps profile_layout out of its BASE_*/SYNC_*
  string, ends its first-tier template with `,profile_layout`, and passes `[...M1_USER_COLUMNS, "profile_layout"]`
  on EVERY isMissingColumnError call. If W2b/W2c or a later wave adds a fourth select, extend PROFILE_SELECT_ROUTES.
- `u.profileLayout` is ALWAYS on vibeUser (default when the row has none) — W2b's applyProfileLayout can rely on it,
  but should still sanitize the localStorage copy (`vibe_user_v1` can be hand-edited; the walk deletes the key).
- PATCH /api/me/profile's raw echo select does NOT include profile_layout (it is campus-blind on purpose and returns
  the raw row); the phone re-bootstraps after a save, and profile-sync's echo DOES carry it (normalized).
- The schema_migrations max is 20260923090000 while the repo has 20260924120000_push_notifications.sql: check that
  row before applying this one (open question, not W2a's).
