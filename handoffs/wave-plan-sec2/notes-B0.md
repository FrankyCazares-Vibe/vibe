# notes-B0 (shared contracts) — 2026-09-28

Scope: exactly two contract modules + tests (waveB-build.md "B0 shared contracts"):
- src/lib/media/profile-image-key.ts (+ .test.ts)
- src/lib/posts/tags.ts (+ .test.ts) + src/lib/moderation/token-filter.ts (+ .test.ts)
Touch nothing else. No DB, no migrations.

## Progress
- read plan.md, waveA-build.md, plan-waveB.md, waveB-build.md
- read critique-B1 (path table + planner), critique-B3 (#5 parser spec), critique-B4 (tags + token filter), critique-Bcross F5/§6
- code read: media-quarantine.ts (authorPostMediaPath style), profile-upload KIND_PATH_PREFIX, storage-upload.ts, text-filter.ts (+test hook), publish-post normalizeTags, edit.ts extractPostTags

## Decisions
- D1 tag length = 32, NOT the "{1,30}" in waveB-build's B0 line. Evidence: extractPostTags (edit.ts:40, PATCH + phone composer) emits up to 32; publish-post MAX_TAG_LEN 32; profile.html POST_TAG_RE {2,32}; critique-B4 PRE-FLIGHT measured 0 live violators against {1,32}; critique-Bcross F5/§6 require the SQL rule to admit every extractPostTags output. A 30 rule would make a PATCH with a 31-32 char #tag hit the DB trigger -> 500. So POST_TAG_MAX_LEN = 32; B4's SQL must be ^[a-z0-9_]{1,32}$ (flag to orchestrator).
- D2 ASCII grammar ^[a-z0-9_]{1,32}$ (waveB-build product call 6, critique-B4 Q1).
- D3 ownProfileImageKey(ref, ownerId, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): spec's 2-arg call works; optional 3rd arg (additive) lets tests + B1 (which has supabaseUrl in hand) pass it explicitly.
- D4 strict: exact spelling `${origin}/storage/v1/object/public/profiles/` (no upper-case host, port, userinfo), no query/hash (both critics), no `%`, no `..`, no whitespace; origin must be http/https (blocks origin "null"). Bare path = `<ownerId>/...` object path in the bucket.
- D5 slot "other" = in the owner's folder, well-formed, but not a shape any upload writes today (legacy root file like resume-*.pdf, unknown subfolder). Junk/deeper/foreign/host -> null. Consumers MUST act on slot, never on non-null (a "post" slot avatar must not be retired/moved as an avatar).
- D6 folder -> slot via a Map (a Record lookup of "constructor"/"__proto__" would return Object.prototype members).
- D7 value imports: tags.ts -> ../moderation/token-filter -> ./text-filter -> ./text-filter-list are VALUE imports (unavoidable: checkToken wraps checkText; firstBlockedTag uses checkToken). Relative + extensionless, the house pattern (profile-filter.ts, text-filter.ts); tests use the registerHooks resolver from text-filter.test.ts. profile-image-key.ts has zero imports (variable-specifier test import).
- WROTE src/lib/media/profile-image-key.ts (+test, 9 tests) and src/lib/moderation/token-filter.ts (+test, 5 tests). node --test: 14/14 pass.
- WROTE src/lib/posts/tags.ts (+test, 8 tests incl. "every extractPostTags output is valid" and a normalize->filter publish-path probe). node --test: 8/8 pass.
- LOCAL DB probe (read-only select, no writes): `t ~ '^[a-z0-9_]{1,32}$'` on PG local agrees with POST_TAG_RE on 22 samples (café, ½, ², Ⅻ, Arabic-Indic 3, fullwidth a, Kelvin K, long s, "a\n", "\na", 32 vs 33 chars, "#a", upper-case): identical true/false. B4 can use that exact SQL pattern.
- GATES: node --test on the 3 new test files 22/22 pass; npx tsc --noEmit -p . clean (--listFiles confirms the 6 files are checked); npm test 1170/1171 (only the known parse-reminder failure); eslint clean on the 6 files. git status: only the 6 new files.

## Contracts for B1/B2/B3/B4
- ownProfileImageKey(ref, ownerId, supabaseUrl?) -> {path, slot} | null. Act on slot: B3 accepts avatar_url only for slot "avatar"|"banner" and retires only those; B1 moves avatar/banner for avatar/banner slots, "logo" for logos, leaves "post"/"poster" (left.post) and "other".
- Query/hash refused (both critics). Live values are plain getPublicUrl output (0 with a query), so nothing live breaks.
- tags.ts: POST_TAG_MAX 10, POST_TAG_MAX_LEN 32, POST_TAG_RE, isValidPostTag, normalizePostTags, firstBlockedTag. B4 SQL: '^[a-z0-9_]{1,32}$' (NOT 30).
- Any test that loads tags.ts or token-filter.ts needs the registerHooks resolver (copy from tags.test.ts). Import with relative paths in pure modules (the hook only handles "./" specifiers); routes can use "@/lib/posts/tags".
DONE.
