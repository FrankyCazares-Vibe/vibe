# S71 amendment 2 — previews per room (migration C), and two card-input refusals

Written 2026-10-01 (Mac session 71) after the HTTP pass of wave 2 against the local database (`scratchpad/step3/`, verifier `step3/verify/`). Additive; folded into the contract as section 17.8 by the orchestrator. Base: branch `claude/relaxed-davinci-9d11h3` at `ccce913`; migration B is APPLIED to the LOCAL database (constants pasted, committed in `49ee404`); **migration B's file must not change** (its pinned constants would break).

## 1. The bug: a shared preview window starves rooms (PRODUCT BUG, reproduced twice)

`GET /api/me/inbox` (`src/app/api/me/inbox/route.ts` `readPreviews` ~:159-168, `readEventActivity` ~:244-254) and the old thread list `GET /api/me/threads` (`src/app/api/me/threads/route.ts` `readLastMessages` ~:661-667, which is ALSO on `main` = production today) read the newest messages of many rooms in ONE query with `.limit(ids.length * k)`. That is one window SHARED by all rooms, not k rows per room (the code's own comment at threads :646 says "its own window of 5 rows per channel"). One busy room pushes every other room's newest message out: blank previews, wrong unread dots, wrong `last_activity_at` and club order, and in the old list a stranger's DM **request disappears from Requests** while the recipient's other DMs are busy (verifier reproduced with emery and drew).

## 2. The fix: one database function, newest k rows PER ROOM, as the caller

New migration **C**: `supabase/migrations/20261001120000_chat_latest_per_room.sql` (a NEW file; never edit B). One transaction, in the repo's migration style (a short header saying what it does, what it changes for everyone — nothing but one new function — the apply order (after B; independent of B in fact), and a ROLLBACK block), a PRE-FLIGHT (`to_regprocedure` of the function is null; `public.messages` has `channel_id`, `created_at`, `thread_root_id`, `removed_at`; an index whose leading columns are `(channel_id, created_at)` exists on `messages` — read its name from the catalog, e.g. `idx_messages_channel_created`), the function, grants, a POST-CHECK, `notify pgrst, 'reload schema'`, `commit`.

```sql
create function public.chat_latest_per_channel(
  p_channels       uuid[],
  p_per            integer,
  p_top_level_only boolean default true,
  p_live_only      boolean default false
) returns setof public.messages
language sql
stable
security invoker          -- RLS of the CALLER applies inside: a caller can never read a row they could not read directly
set search_path = ''
as $$
  select m.*
    from unnest((p_channels)[1:500]) as c(id)
    cross join lateral (
      select x.*
        from public.messages x
       where x.channel_id = c.id
         and (not p_top_level_only or x.thread_root_id is null)
         and (not p_live_only or x.removed_at is null)
       order by x.created_at desc
       limit least(greatest(coalesce(p_per, 1), 1), 20)
    ) m
   order by m.created_at desc
$$;
-- CORRECTED after the SQL batch (the first text revoked anon: wrong, it breaks the repo's standing rule
-- "never refuse a public function to anon / authenticated / service_role: this Postgres image crashes"):
revoke all on function public.chat_latest_per_channel(uuid[], integer, boolean, boolean) from public;
grant execute on function public.chat_latest_per_channel(uuid[], integer, boolean, boolean) to anon, authenticated, service_role;
comment on function … is '…';
```

POST-CHECK: the function exists, is `security invoker` (`prosecdef = false`), `provolatile = 's'`, has `search_path=""` in `proconfig`, PUBLIC lacks EXECUTE, `anon`, `authenticated` and `service_role` have it (anon is refused at the `messages` table, 42501, which does not crash). A behaviour probe inside the same transaction (optional but preferred): with a few fixture rows in two rooms, k rows per room come back.

Check script: `scripts/sql/chat-latest-check.sql` (LOCAL only, one transaction ending in `rollback;`, the style of `chat-v2-cards-check.sql`, ends `chat-latest-check: all N cases passed`): per-room windows (a busy room with 30 rows and a quiet room with 1 row → the quiet room's row is returned); `p_per` clamped (0 → 1, 50 → 20); top-level-only and live-only filters; more than 500 ids → only the first 500 read; **RLS as a real caller** (`set local role authenticated` + `request.jwt.claims` of a seed user): ids of rooms the caller cannot read return nothing from them (a DM they are not in, a club room of a club they are not in, an Officers room for a plain member); an author sees their own removed row only when `p_live_only = false`; an `anon` call is refused at the messages table (42501) with the server still up; EXPLAIN shows an index scan per room on the `(channel_id, created_at)` index (record the plan line, not a hard assertion if the planner picks a seq scan on the tiny local table: then say so).

## 3. The callers (TS)

Switch every shared-window read to the function, with the SAME select list, filters and soft-fail behaviour as today:
- `src/app/api/me/threads/route.ts` `readLastMessages`: `supabase.rpc("chat_latest_per_channel", { p_channels: ids, p_per: 5, p_top_level_only: topLevelOnly, p_live_only: false }).select(<wide or base columns>)`.
- `src/app/api/me/inbox/route.ts` `readPreviews`: `p_per: 5, p_top_level_only: true, p_live_only: true`, `.select(PREVIEW_SELECT)` (the users embed must still work on the RPC's rows: PostgREST embeds on functions returning a table type; prove it locally).
- `readEventActivity`: `p_per: 1, true, true`, `.select("channel_id, created_at")`.
- Any other `.in("channel_id", …).limit(<n> * k)` shared window in `src/` (grep; e.g. `src/lib/chat/reads.ts`, the space route): same treatment, or say why it is not a shared window.
- **Fallback:** when the RPC answers a missing-schema error (`isMissingChatSchema`: `PGRST202` / `42883` are in its set), call `warnMissingChatSchemaOnce(<tag>)` and run TODAY's shared-window query unchanged (so the code can deploy before migration C and keeps today's behaviour). Any other error keeps today's handling (log + the existing fallbacks).
- The RPC is called with the COOKIE client (RLS of the user), exactly like today's reads. Never the service client for these reads.
- Order: the function returns newest first overall; the callers' "first row per channel is the newest" logic must stay correct (it does when rows are newest-first; keep `.order("created_at", { ascending: false })` on the RPC call too if PostgREST allows it, harmless).

## 4. Two card-input refusals (`src/lib/chat/cards/body.ts`)

- **NUL** (`\u0000`) anywhere in `question`, an option `label`, or `note` → `bad(<that field>)` → 400 `invalid_card` with `field` = `question` / `options.<n>` / `note` (today: 503 `try_again` forever, because Postgres refuses NUL in text).
- **Visibly blank** text: a `question` or `label` that is empty after removing whitespace AND invisible characters → the same refusal as an empty one; a `note` that is visibly blank → stored as `null` (like a blank note today). Invisible = the class in `src/lib/moderation/text-filter.ts:83` (export it, or a helper `isVisiblyBlank`) plus U+3164, U+115F, U+1160, U+FFA0 (Hangul fillers) and U+2800 (Braille blank). Text that has visible characters keeps its invisible ones (no stripping of real text).
- Tests in `body.test.ts` (or the existing card body tests: find them) for NUL in each field and visibly-blank question / label / note.

## 5. Contract notes (the orchestrator writes 17.8; builders do not edit the contract)

- 4.1.6's refusal `field` list gains `anonymous` and `multi` (the build already answers them; no code change). The `InvalidCardRefusal` comment in `src/lib/chat/types.ts` (~:166-170) gets the two names.
- 7.1.4 / 7.1.7 / the threads-list windows become "k rows per room through `chat_latest_per_channel`".

## 6. Rules (same as S71 amendment 1, Part C)

Work only in the worktree `/private/tmp/claude-501/-Users-franciscocazares-vibe/3f2b2faf-e272-43a9-b45e-25788db6edb8/scratchpad/wave2`; never touch `/Users/franciscocazares/vibe`; do not commit or push. LOCAL database only; every creating SQL run in one transaction ending in `rollback;` with a before/after proof (the function absent before and after a rehearsal; B's 5 tables and 5 functions still present; row counts of `messages`, `channels` unchanged). Do NOT apply migration C for real (the orchestrator does after review). A local dev server of this worktree runs on http://localhost:3101 against the local database: do not start, stop or restart it (it hot-reloads your edits; you may curl it, with `node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs <avery|blake|casey|drew|emery>`). Gates for TS: `npx tsc --noEmit`, `npm test` (baseline 1,709), `npx eslint` on changed files. File ownership: **SQL batch** owns the new migration C and `scripts/sql/chat-latest-check.sql`; **TS batch** owns `src/app/api/me/threads/route.ts`, `src/app/api/me/inbox/route.ts`, any other file with a shared window it switches (name it), `src/lib/chat/cards/body.ts` and its tests, `src/lib/moderation/text-filter.ts` (the export only), `src/lib/chat/types.ts` (the comment), new or extended tests. Each batch writes `handoffs/chat-redesign/wave-2-build/S71b-<batch>-notes.md` first and appends as it goes.
