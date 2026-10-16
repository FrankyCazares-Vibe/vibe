/**
 * Drift tests for the views, counted by the server (rate limits wave 3,
 * B3.4): `supabase/migrations/20261016120000_views_as_service.sql` (before
 * the deploy) and `20261016130000_views_old_functions_refuse.sql` (after
 * it), read as text, and the two routes that call the new pair, run
 * against fakes of the Supabase clients. Both files were applied and
 * checked on the local database (old and new pair compared person by
 * person, the caps filled, the refusals tried); these keep a later edit
 * from quietly undoing what was checked.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/views/views-as-migration.test.ts
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");
/** What Postgres runs: the file without its `--` notes. */
const strip = (s: string) => s.replace(/--[^\n]*/g, "");
/** The same, on one line, every run of spaces as one, lower case. */
const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

const PRE = readRoot("supabase/migrations/20261016120000_views_as_service.sql");
const POST = readRoot("supabase/migrations/20261016130000_views_old_functions_refuse.sql");
const TALLY = readRoot("supabase/migrations/20261014150000_usage_day_tally.sql");
const pre = strip(PRE);
const post = strip(POST);
const preFlat = squash(pre);
const postFlat = squash(post);

/** A function's body between its own dollar quotes, notes out, flattened. */
function bodyOf(code: string, tag: string): string {
  const m = new RegExp(`as \\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$;`).exec(code);
  assert.ok(m, `the body between $${tag}$ quotes`);
  return squash(m[1]);
}
const postView = bodyOf(pre, "postview");
const profileView = bodyOf(pre, "profileview");
const touchNew = bodyOf(pre, "touch");
const touchOld = bodyOf(strip(TALLY), "touch");
const oldPost = bodyOf(post, "oldpost");
const oldProfile = bodyOf(post, "oldprofile");

/** The day caps in the header and in the bodies. */
const POST_VIEW_DAY_CAP = 5000;
const PROFILE_VIEW_DAY_CAP = 1000;

const REFUSAL =
  "if current_setting('role', true) in ('anon', 'authenticated') then " +
  "raise exception 'not allowed' using errcode = '42501'; end if;";

test("the new pair runs as its owner with an empty search path, and refuses the browser's two roles first thing", () => {
  assert.ok(preFlat.includes(
    "create or replace function public.record_post_view_as(p_user uuid, p_post_id uuid) returns boolean " +
      "language plpgsql volatile security definer set search_path = '' as $postview$",
  ));
  assert.ok(preFlat.includes(
    "create or replace function public.record_profile_view_as(p_viewer uuid, p_profile_user_id uuid) returns boolean " +
      "language plpgsql volatile security definer set search_path = '' as $profileview$",
  ));
  for (const [name, body] of [["record_post_view_as", postView], ["record_profile_view_as", profileView]]) {
    const afterBegin = body.slice(body.indexOf(" begin ") + " begin ".length);
    assert.ok(afterBegin.startsWith(REFUSAL), `${name}: ${afterBegin.slice(0, 160)}`);
  }
});

test("the account comes from the route: no auth.uid(), and the hidden-club test is written against p_user (#2)", () => {
  for (const body of [postView, profileView]) {
    assert.equal(/auth\.uid|org_content_visible/.test(body), false);
  }
  assert.ok(postView.includes(
    "if v_org_id is not null and not exists (select 1 from public.orgs o where o.id = v_org_id and (o.hidden_at is null " +
      "or exists (select 1 from public.org_members m where m.org_id = v_org_id and m.user_id = p_user) " +
      "or exists (select 1 from public.users u where u.id = p_user and u.is_platform_admin))) then return false; end if;",
  ));
  // org_content_visible's three ways in, so the test above is the same one.
  const helper = squash(strip(readRoot("supabase/migrations/20260922140000_hidden_club_content_rls.sql")));
  for (const piece of ["o.hidden_at is null", "m.user_id = (select auth.uid())", "u.is_platform_admin"]) {
    assert.ok(helper.includes(piece), piece);
  }
});

test("record_post_view_as answers what record_post_view answered, in the same order, then the cap, then the count", () => {
  const at = (s: string) => {
    const i = postView.indexOf(s);
    assert.ok(i !== -1, s);
    return i;
  };
  const order = [
    "if p_user is null then return false; end if;",
    "select p.user_id, p.org_id, p.removed_at into v_author, v_org_id, v_removed_at from public.posts p where p.id = p_post_id;",
    "if v_author is null then return false; end if;",
    "if v_author = p_user then return false; end if;",
    "if v_removed_at is not null or not public.user_visible(v_author) then return false; end if;",
    "if v_org_id is not null and not exists",
    `limit ${POST_VIEW_DAY_CAP}) s) >= ${POST_VIEW_DAY_CAP} then return false; end if;`,
    "insert into public.post_views (post_id, user_id, viewed_on) values (p_post_id, p_user, v_today) " +
      "on conflict (post_id, user_id, viewed_on) do nothing returning true into v_inserted;",
    "if v_inserted then update public.posts set view_count = view_count + 1 where id = p_post_id; end if;",
    "return coalesce(v_inserted, false);",
  ].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  // The old body had the same four refusals, with auth.uid() for the person.
  const old = squash(strip(readRoot("supabase/migrations/20260923090000_moderation_foundation.sql")));
  for (const piece of [
    "if v_author is null then return false; end if;",
    "if v_author = v_user_id then return false; end if;",
    "if v_removed_at is not null or not public.user_visible(v_author) then return false; end if;",
    "if v_org_id is not null and not public.org_content_visible(v_org_id) then return false; end if;",
  ]) {
    assert.ok(old.includes(piece), piece);
  }
});

test("record_profile_view_as: your own profile never counts, no referrer, then the cap, then the count", () => {
  const order = [
    "if p_viewer is null then return false; end if;",
    "if p_viewer = p_profile_user_id then return false; end if;",
    `limit ${PROFILE_VIEW_DAY_CAP}) s) >= ${PROFILE_VIEW_DAY_CAP} then return false; end if;`,
    "insert into public.profile_views (profile_user_id, viewer_user_id, viewed_on) values (p_profile_user_id, p_viewer, v_today) " +
      "on conflict (profile_user_id, viewer_user_id, viewed_on) do nothing returning true into v_inserted;",
    "if v_inserted then update public.users set profile_view_count = profile_view_count + 1 where id = p_profile_user_id; end if;",
  ].map((s) => {
    const i = profileView.indexOf(s);
    assert.ok(i !== -1, s);
    return i;
  });
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(/referrer/.test(profileView), false, "the page the viewer came from is not stored (Privacy Policy 3d)");
});

test("the day caps count today's rows for the person, through a limit, on their own index, and nothing goes to rate_limits (#3)", () => {
  for (const body of [postView, profileView]) {
    assert.ok(body.includes("v_today date := (now() at time zone 'utc')::date;"));
  }
  assert.ok(postView.includes(
    "if (select count(*) from (select 1 from public.post_views v where v.user_id = p_user and v.viewed_on = v_today " +
      `limit ${POST_VIEW_DAY_CAP}) s) >= ${POST_VIEW_DAY_CAP} then return false; end if;`,
  ));
  assert.ok(profileView.includes(
    "if (select count(*) from (select 1 from public.profile_views v where v.viewer_user_id = p_viewer and v.viewed_on = v_today " +
      `limit ${PROFILE_VIEW_DAY_CAP}) s) >= ${PROFILE_VIEW_DAY_CAP} then return false; end if;`,
  ));
  assert.ok(preFlat.includes("create index if not exists idx_post_views_user_day on public.post_views (user_id, viewed_on);"));
  assert.ok(preFlat.includes("create index if not exists idx_profile_views_viewer_day on public.profile_views (viewer_user_id, viewed_on);"));
  // The post-check reads each index's columns back.
  assert.ok(preFlat.includes("not like '% on public.post_views using btree (user_id, viewed_on)'"));
  assert.ok(preFlat.includes("not like '% on public.profile_views using btree (viewer_user_id, viewed_on)'"));
  // The header names the same caps.
  assert.ok(PRE.includes("day cap (5,000 posts and 1,000 profiles a UTC day)"));
  for (const code of [pre, post]) assert.equal(/rate_limit/.test(code), false);
});

test("EXECUTE for every API role (the standing rule): granted, never revoked, and the only revokes are these", () => {
  for (const sig of ["public.record_post_view_as(uuid, uuid)", "public.record_profile_view_as(uuid, uuid)"]) {
    assert.ok(preFlat.includes(`revoke all on function ${sig} from public;`), sig);
    assert.ok(preFlat.includes(`grant execute on function ${sig} to anon, authenticated, service_role;`), sig);
  }
  for (const code of [pre, post]) assert.equal(/revoke\s+execute/i.test(code), false);
  assert.deepEqual((pre.match(/^revoke [^;]*;/gm) ?? []).map(squash).sort(), [
    "revoke all on function public.record_post_view_as(uuid, uuid) from public;",
    "revoke all on function public.record_profile_view_as(uuid, uuid) from public;",
    "revoke insert, update, delete on public.bookmark_collections from anon, authenticated;",
    "revoke insert, update, delete on public.reminders from anon, authenticated;",
  ]);
  assert.deepEqual(pre.match(/^grant [^;]*;/gm)?.length, 2);
  // The post-check: every API role may still call the new pair and the
  // check-in; who may call the old pair and the check-in did not move.
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.ok(preFlat.includes(`has_function_privilege('${role}', f, 'execute')`), role);
  }
  assert.ok(preFlat.includes("is distinct from current_setting('vibe.views_as_acl', true)"));
  assert.ok(preFlat.includes("when insufficient_privilege then null;"));
  assert.ok(/^begin;$/m.test(pre) && /^commit;$/m.test(pre) && preFlat.includes("notify pgrst, 'reload schema';"));
});

test("usage_touch: 20261014150000's body word for word, plus a no-lock block before the restriction test and the lock", () => {
  const block =
    "if p_open is null then select u.last_active_at into v_old from public.users u where u.id = p_user; " +
    "if v_old > v_now - interval '60 seconds' and (v_old at time zone 'utc')::date >= v_today then return; end if; end if; ";
  assert.equal(touchNew.split(block).length, 2, "the block, once");
  assert.equal(touchNew.replace(block, ""), touchOld, "nothing else changed");
  const at = (s: string) => touchNew.indexOf(s);
  assert.ok(at("v_week := v_today - (extract(isodow from v_today)::int - 1); " + block) !== -1, "right after the dates");
  assert.ok(at(block) < at("from public.account_restrictions r") && at(block) < at("for update of u;"));
  assert.equal(/for update/.test(block), false);
  // The same signature and settings, so create or replace keeps the grants.
  assert.ok(preFlat.includes(
    "create or replace function public.usage_touch(p_user uuid, p_device text default 'unknown', p_open text default null) " +
      "returns void language plpgsql volatile security definer set search_path = '' as $touch$",
  ));
  assert.equal(/(grant|revoke)[^;]*usage_touch/.test(preFlat), false);
  assert.ok(preFlat.includes("usage_touch has no no-lock path before the lock"));
});

/** Every file under a folder with one of these endings (node_modules left out). */
function filesUnder(dir: string, endings: string[]): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(new URL(rel, root))) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const child = `${rel}/${name}`;
      if (statSync(new URL(child, root)).isDirectory()) walk(child);
      else if (endings.some((e) => name.endsWith(e))) out.push(child);
    }
  };
  walk(dir);
  return out;
}

test("reminders and bookmark_collections stop taking browser writes, and nothing in the app writes them", () => {
  assert.ok(preFlat.includes("revoke insert, update, delete on public.reminders from anon, authenticated;"));
  assert.ok(preFlat.includes("revoke insert, update, delete on public.bookmark_collections from anon, authenticated;"));
  // SELECT stays, and the service role keeps everything (the post-check asks).
  assert.ok(preFlat.includes("if not has_table_privilege(api, tbl, 'select') then"));
  assert.ok(preFlat.includes("if has_table_privilege(api, tbl, 'insert,update,delete') then"));
  // The proof the revoke rests on, again on every run: no route, client or
  // static page names either table (Otto's reminders are otto_reminders).
  const writes = /bookmark_collections|from\(\s*["'`]reminders["'`]|rest\/v1\/reminders\b/;
  const named = filesUnder("src", [".ts", ".tsx"])
    .concat(filesUnder("public", [".js", ".html"]))
    .filter((file) => !file.endsWith(".test.ts"))
    .filter((file) => writes.test(readRoot(file)));
  assert.deepEqual(named, []);
});

test("after the deploy: the old pair answers false for everyone, with its grants and signature kept, never revoked", () => {
  assert.ok(POST.slice(0, 400).includes("APPLY ONLY AFTER THE CODE IS LIVE"));
  assert.equal(oldPost, "begin return false; end;");
  assert.equal(oldProfile, "begin return false; end;");
  assert.ok(postFlat.includes(
    "create or replace function public.record_post_view(p_post_id uuid) returns boolean language plpgsql " +
      "security definer set search_path = public as $oldpost$",
  ));
  assert.ok(postFlat.includes(
    "create or replace function public.record_profile_view(p_profile_user_id uuid, p_referrer text default null) " +
      "returns boolean language plpgsql security definer set search_path = public as $oldprofile$",
  ));
  // No grant and no revoke at all: create or replace keeps them, and the
  // post-check compares them with the pre-flight's.
  assert.equal(/^(grant|revoke) /m.test(post), false);
  assert.ok(postFlat.includes("is distinct from current_setting('vibe.views_old_acl', true)"));
  assert.ok(postFlat.includes("is distinct from 'begin return false; end;'"));
  // It cannot run before the new pair exists.
  assert.ok(postFlat.includes("the new pair is missing; apply 20261016120000 and deploy the code first"));
  assert.ok(/^begin;$/m.test(post) && /^commit;$/m.test(post) && postFlat.includes("notify pgrst, 'reload schema';"));
});

test("only the two routes call the new pair, with the verified id; nothing calls the old pair; no limiter key on views", () => {
  // Any quote (the static pages use single quotes), and `rpc/<fn>` only when
  // the name ends there, so the old name never matches the new `_as` one.
  const callers = (fn: string) => {
    const call = new RegExp(`rpc\\(\\s*['"\`]${fn}['"\`]|rpc/${fn}(?![\\w])`);
    return filesUnder("src", [".ts", ".tsx"])
      .concat(filesUnder("public", [".js", ".html"]))
      .filter((file) => !file.endsWith(".test.ts"))
      .filter((file) => call.test(readRoot(file)));
  };
  assert.deepEqual(callers("record_post_view_as"), ["src/app/api/posts/[id]/view/route.ts"]);
  assert.deepEqual(callers("record_profile_view_as"), ["src/app/api/profile-views/route.ts"]);
  assert.deepEqual(callers("record_post_view"), []);
  assert.deepEqual(callers("record_profile_view"), []);
  for (const file of ["src/app/api/posts/[id]/view/route.ts", "src/app/api/profile-views/route.ts", "src/app/api/me/heartbeat/route.ts"]) {
    assert.equal(/rateLimit|limitFor|@\/lib\/rate-limit|@\/lib\/limits/.test(readRoot(file)), false, file);
  }
});

// ── The two routes, against fakes (the resolve hook of heartbeat-route.test.ts) ──
type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("views-as-migration.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "next/server": dataModule(
    "export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body }; } };",
  ),
  "@/lib/supabase/server": dataModule("export async function createSupabaseServerClient() { return globalThis.__vibeViewUser; }"),
  "@/lib/supabase/service": dataModule("export function createSupabaseServiceClient() { return globalThis.__vibeViewService(); }"),
  "@/lib/orgs/hidden-org-access": dataModule(
    "export async function postAccessForCaller(_s, postId, userId) { globalThis.__vibeViewAccessAsked = [postId, userId]; return globalThis.__vibeViewAccess; }",
  ),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    return nextResolve(specifier, context);
  },
});

type Answer = { status: number; body: { ok: boolean; counted?: boolean; error?: string } };
const viewSpec = "../../app/api/posts/[id]/view/route.ts";
const profileSpec = "../../app/api/profile-views/route.ts";
const viewRoute = (await import(viewSpec)) as { POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Answer> };
const profileRoute = (await import(profileSpec)) as { POST: (req: Request) => Promise<Answer> };

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";
const POST_ID = "33333333-3333-4333-8333-333333333333";

/** Installs the fakes; returns what reached the service client. */
function fakes(opts: {
  user?: string | null;
  access?: { ok: true; hidden: boolean } | { ok: false; reason: "not_found" | "error" };
  data?: unknown;
  rpcError?: { code: string; message: string };
  serviceThrows?: boolean;
  handleRow?: { id: string } | null;
}): { rpc: [string, unknown][]; userRpc: string[] } {
  const seen = { rpc: [] as [string, unknown][], userRpc: [] as string[] };
  const g = globalThis as Record<string, unknown>;
  g.__vibeViewAccess = opts.access ?? { ok: true, hidden: false };
  g.__vibeViewUser = {
    auth: { getUser: async () => ({ data: { user: opts.user === null ? null : { id: opts.user ?? ME } }, error: null }) },
    rpc: async (fn: string) => {
      seen.userRpc.push(fn);
      return { data: true, error: null };
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.handleRow ?? null, error: null }) }) }),
    }),
  };
  g.__vibeViewService = () => {
    if (opts.serviceThrows) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    return {
      rpc: async (fn: string, args: unknown) => {
        seen.rpc.push([fn, args]);
        return { data: opts.data ?? true, error: opts.rpcError ?? null };
      },
    };
  };
  return seen;
}

const viewPost = (id = POST_ID) =>
  viewRoute.POST(new Request(`http://localhost/api/posts/${id}/view`, { method: "POST" }), { params: Promise.resolve({ id }) });
const profilePost = (body: unknown) =>
  profileRoute.POST(new Request("http://localhost/api/profile-views", { method: "POST", body: JSON.stringify(body) }));

test("a post view: the verified id goes to record_post_view_as through the service role, and the answers are as before", async () => {
  let seen = fakes({});
  assert.deepEqual((await viewPost()).body, { ok: true, counted: true });
  assert.deepEqual(seen.rpc, [["record_post_view_as", { p_user: ME, p_post_id: POST_ID }]]);
  assert.deepEqual(seen.userRpc, [], "never with the person's own sign-in");
  assert.deepEqual((globalThis as Record<string, unknown>).__vibeViewAccessAsked, [POST_ID, ME]);

  // A repeat, your own post, or past the day cap: the function says false.
  seen = fakes({ data: false });
  assert.deepEqual((await viewPost()).body, { ok: true, counted: false });

  // Signed out: no-op, nothing called.
  seen = fakes({ user: null });
  assert.deepEqual((await viewPost()).body, { ok: true, counted: false });
  assert.deepEqual(seen.rpc, []);

  // A post the caller may not see (hidden club, blocked, missing): as missing, no call.
  seen = fakes({ access: { ok: false, reason: "not_found" } });
  assert.deepEqual((await viewPost()).body, { ok: true, counted: false });
  assert.deepEqual(seen.rpc, []);

  for (const opts of [
    { access: { ok: false, reason: "error" } as const },
    { rpcError: { code: "42501", message: "not allowed" } },
    { serviceThrows: true },
  ]) {
    seen = fakes(opts);
    const res = await viewPost();
    assert.equal(res.status, 500, JSON.stringify(opts));
    assert.deepEqual(res.body, { ok: false, error: "Request failed" });
  }
});

test("a profile view: the verified id goes to record_profile_view_as; an id or referrer in the body is never used", async () => {
  let seen = fakes({});
  const res = await profilePost({ profile_user_id: THEM, p_viewer: THEM, viewer_user_id: THEM, referrer: "https://example.com" });
  assert.deepEqual(res.body, { ok: true, counted: true });
  assert.deepEqual(seen.rpc, [["record_profile_view_as", { p_viewer: ME, p_profile_user_id: THEM }]]);
  assert.deepEqual(seen.userRpc, []);
  assert.ok(!JSON.stringify(seen.rpc).includes("example.com"));

  // By handle: looked up with the person's own client, then the same call.
  seen = fakes({ handleRow: { id: THEM } });
  assert.deepEqual((await profilePost({ handle: "Them" })).body, { ok: true, counted: true });
  assert.deepEqual(seen.rpc, [["record_profile_view_as", { p_viewer: ME, p_profile_user_id: THEM }]]);

  seen = fakes({ data: false });
  assert.deepEqual((await profilePost({ profile_user_id: THEM })).body, { ok: true, counted: false });

  seen = fakes({ user: null });
  assert.deepEqual((await profilePost({ profile_user_id: THEM })).body, { ok: true, counted: false });
  assert.deepEqual(seen.rpc, []);

  seen = fakes({});
  assert.equal((await profilePost({})).status, 400);
  assert.equal((await profilePost({ handle: "nobody" })).status, 404);
  assert.deepEqual(seen.rpc, []);

  for (const opts of [{ rpcError: { code: "23503", message: "fk" } }, { serviceThrows: true }]) {
    seen = fakes(opts);
    const failed = await profilePost({ profile_user_id: THEM });
    assert.equal(failed.status, 500, JSON.stringify(opts));
    assert.deepEqual(failed.body, { ok: false, error: "Request failed" });
  }
});
