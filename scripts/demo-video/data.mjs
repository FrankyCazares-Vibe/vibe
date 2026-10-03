// data.mjs — the practice data around a take: check it is ready, remember it, put it back.
//
// A take writes two things through the app, on purpose: the line Franky sends James and the read markers the
// app moves when a chat is opened (the "active now" heartbeat and the profile-view ledger are refused in the
// browser; their rows are still checked and put back in case). Around them the app's own bookkeeping moves too
// (the send limiter's counter). restore() takes all of it back out, and digest() proves it: one
// fingerprint per table of the public schema, the same before the take and after the clean-up. Outside the
// public schema a run leaves one more thing, the sign-in it opened for Franky: signOut() closes it.
//
// LOCAL ONLY by construction: every statement goes through `docker exec` into the local Supabase database
// container named in supabase/config.toml. There is no URL and no key here, and no .env file is read.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const REPO = new URL("../../", import.meta.url).pathname;
const PROJECT = readFileSync(`${REPO}supabase/config.toml`, "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
const CONTAINER = `supabase_db_${PROJECT}`;
export const LEAD = "franky";

/** Run SQL in the local database; returns what psql printed (unaligned, tuples only). */
export function sql(text) {
  if (!PROJECT) throw new Error("data: no project_id in supabase/config.toml");
  return execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-v", "ON_ERROR_STOP=1"], { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
/** The rows of a SELECT, as objects. */
export const rows = (select) => JSON.parse(sql(`select coalesce(json_agg(q_), '[]'::json) from (${select}) q_;`) || "[]");
const one = (select) => rows(select)[0] ?? null;
const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);

const ME = `(select id from public.users where handle = ${lit(LEAD)})`;
const DM_WITH_JAMES = `(select c.id from public.channels c where c.type = 'dm'
  and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = ${ME})
  and exists (select 1 from public.channel_members m join public.users u on u.id = m.user_id where m.channel_id = c.id and u.handle = 'jamesandres'))`;
const CHESS_LOUNGE = `(select c.id from public.channels c join public.orgs o on o.id = c.org_id where o.handle = 'chess_club' and c.kind = 'lounge')`;

/** The two chats the film opens. */
export const ids = () => ({ dm: sql(`select ${DM_WITH_JAMES};`), lounge: sql(`select ${CHESS_LOUNGE};`) });

/**
 * Is the practice data ready to film? Returns a list of problems in plain words (empty = ready).
 * `line` is the message the take sends: it must not be in the thread already.
 */
export function preflight(line) {
  const problems = [];
  const t = one(`select to_char(now() at time zone 'America/Indiana/Indianapolis', 'HH24:MI') as clock,
    (now() at time zone 'America/Indiana/Indianapolis')::time >= time '21:30' as late`);
  if (t.late) problems.push(`it is ${t.clock} in Indianapolis: "Blitz Night" ends at 10 pm and then leaves the Events list and the chat card. Film before 9:30 pm.`);
  const ev = one(`select e.title, e.ends_at > now() + interval '15 minutes' as open,
      (e.starts_at at time zone 'America/Indiana/Indianapolis')::date = (now() at time zone 'America/Indiana/Indianapolis')::date as today,
      exists (select 1 from public.rsvps r where r.event_id = e.id and r.user_id = ${ME} and r.status = 'going') as going
    from public.events e join public.orgs o on o.id = e.org_id where o.handle = 'chess_club' and e.title = 'Blitz Night'`);
  if (!ev) problems.push('there is no "Blitz Night" event: run node scripts/demo-seed.mjs first.');
  else if (!ev.today || !ev.open) problems.push('"Blitz Night" is not today, or is nearly over: run node scripts/demo-seed.mjs again (the same day, before 9:30 pm).');
  else if (!ev.going) problems.push('Franky is not marked Going to "Blitz Night": run node scripts/demo-seed.mjs again.');
  const unread = one(`select count(*)::int as n from public.messages m join public.channel_members cm on cm.channel_id = m.channel_id and cm.user_id = ${ME}
    where m.channel_id = ${CHESS_LOUNGE} and m.user_id <> ${ME} and m.created_at > cm.last_read_at`);
  if (unread.n !== 3) problems.push(`the Chess Club row would show "${unread.n} new", not "3 new": run node scripts/demo-seed.mjs again (it puts Franky's read marker back).`);
  const sent = one(`select count(*)::int as n from public.messages where channel_id = ${DM_WITH_JAMES} and user_id = ${ME} and content = ${lit(line)}`);
  if (sent.n > 0) problems.push("the line the take sends is already in Franky's thread with James (a take that stopped before its clean-up): run node scripts/demo-seed.mjs again, it removes it.");
  const stray = one(`select count(*)::int as n from public.orgs o where o.hidden_at is null and o.handle like 'test\\_%' and o.campus_id = (select campus_id from public.users where id = ${ME})`);
  if (stray.n > 0) problems.push("a test club is visible on Franky's campus (it would show under the Orgs list): run node scripts/demo-seed.mjs again.");
  return problems;
}

/**
 * Close the sign-in sessions this run opened for Franky (capture.mjs lists their ids). They are rows in the
 * auth schema, which the fingerprints below do not cover. Only those exact sessions: a browser somebody else
 * has open as Franky stays signed in. Returns how many were closed.
 */
export function signOut(sessionIds) {
  const mine = sessionIds.filter((id) => /^[0-9a-f-]{36}$/.test(id));
  if (mine.length === 0) return 0;
  return sql(`delete from auth.sessions where user_id = ${ME} and id in (${mine.map(lit).join(", ")}) returning id;`).split("\n").filter((l) => /^[0-9a-f-]{36}$/.test(l)).length;
}

/** One fingerprint per table of the public schema (every row, every column). */
export function digest() {
  const tables = rows(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`).map((r) => r.table_name);
  const parts = tables.map((t) => `select ${lit(t)} as tbl, md5(coalesce(string_agg(x, ',' order by x), '')) as d from (select md5(r::text) as x from public."${t}" r) s`);
  return Object.fromEntries(rows(parts.join(" union all ")).map((r) => [r.tbl, r.d]));
}

/** Remember everything a take can move. */
export function snapshot() {
  return {
    at: one(`select now()::text as at`).at,
    markers: rows(`select channel_id, last_read_at::text as last_read_at from public.channel_members where user_id = ${ME}`),
    lastActive: one(`select last_active_at::text as v from public.users where id = ${ME}`).v,
    limits: rows(`select key, window_start::text as window_start, count from public.rate_limits where key like '%' || ${ME}::text`),
    digest: digest(),
  };
}

/**
 * Put the practice data back as snapshot() found it. Safe to run twice, and after a take that stopped half way.
 * Returns what it did and, table by table, anything that still differs from the snapshot.
 */
export function restore(snap, line) {
  const count = (text) => sql(text).split("\n").filter((l) => l && !/^(DELETE|UPDATE)/.test(l)).length;
  const done = {
    // The line sent on camera (its notices and push rows go with it: they hang off the message).
    linesDeleted: count(`delete from public.messages where channel_id = ${DM_WITH_JAMES} and user_id = ${ME} and content = ${lit(line)} and created_at >= ${lit(snap.at)} returning id;`),
    // "Franky looked at this profile today": only rows first written during the take.
    profileViewsDeleted: count(`delete from public.profile_views where viewer_user_id = ${ME} and first_viewed_at >= ${lit(snap.at)} returning profile_user_id;`),
    // Read markers: opening a chat (and sending) moves them; the Chess Club row must say "3 new" again.
    markersPutBack: snap.markers.reduce((n, m) => n + count(`update public.channel_members set last_read_at = ${lit(m.last_read_at)} where user_id = ${ME} and channel_id = ${lit(m.channel_id)} and last_read_at is distinct from ${lit(m.last_read_at)}::timestamptz returning channel_id;`), 0),
    lastActivePutBack: count(`update public.users set last_active_at = ${lit(snap.lastActive)} where id = ${ME} and last_active_at is distinct from ${lit(snap.lastActive)}::timestamptz returning id;`),
  };
  // The send limiter's counters for Franky: rows the take added go, rows it raised get their old count.
  const kept = snap.limits.map((l) => `(${lit(l.key)}, ${lit(l.window_start)}::timestamptz)`).join(", ");
  done.limiterRowsDeleted = count(`delete from public.rate_limits where key like '%' || ${ME}::text ${kept ? `and (key, window_start) not in (${kept})` : ""} returning key;`);
  done.limiterRowsPutBack = snap.limits.reduce((n, l) => n + count(`update public.rate_limits set count = ${Number(l.count)} where key = ${lit(l.key)} and window_start = ${lit(l.window_start)}::timestamptz and count <> ${Number(l.count)} returning key;`), 0);
  const after = digest();
  done.stillDifferent = Object.keys(after).filter((t) => after[t] !== snap.digest[t]);
  return done;
}
