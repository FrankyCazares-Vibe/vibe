/**
 * The four signed-link upload routes, plus profile-upload's limiter (rate
 * limits and upload caps, wave 1, B1.2), against fakes:
 *   - each signed-link answer carries the exact type its link was signed for,
 *     so the client's PUT can send that string and nothing else;
 *   - every upload limiter counts on its own server when its database call
 *     fails (`failLocal`), never `failClosed`, which would turn a limiter
 *     blip into an upload outage (critique #19);
 *   - group photos and club uploads take the gate of the save that uses their
 *     keys, and a group photo needs a `group` channel and a current
 *     membership (threads/[id]/route.ts PATCH).
 * No daily upload budget: Franky's call, Oct 15.
 *
 * Run with:
 *   node --test src/lib/uploads/upload-routes.test.ts
 *
 * WHY THE RESOLVE HOOK (as src/lib/chat/threads-list-route.test.ts): the
 * routes import "next/server", "server-only" modules (r2, rate-limit,
 * moderation/access, channel-access) and the two Supabase clients; each
 * resolves to a small data: module that reads its fake from globalThis.
 * hidden-gate, join-state and chat/types are the real code.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("upload-routes.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "next/server": dataModule(
    "export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body }; } };",
  ),
  "@/lib/supabase/server": dataModule("export async function createSupabaseServerClient() { return globalThis.__vibeUp.cookie; }"),
  "@/lib/supabase/service": dataModule("export function createSupabaseServiceClient() { return globalThis.__vibeUp.service; }"),
  "@/lib/r2": dataModule(
    "const sign = (name) => async (key, opts) => { globalThis.__vibeUp.signed.push({ name, key, ...opts }); return 'https://r2.test/' + key; };\n" +
      "export const CLIP_KEY_PREFIX = 'clips/', GROUP_PHOTO_KEY_PREFIX = 'groups/', MESSAGE_MEDIA_KEY_PREFIX = 'messages/', ORG_ASSET_KEY_PREFIX = 'orgs/';\n" +
      "export function isR2Configured() { return true; }\n" +
      "export const signClipPutUrl = sign('clip'), signMessageMediaPutUrl = sign('messages'), signGroupPhotoPutUrl = sign('group'), signOrgAssetPutUrl = sign('org');",
  ),
  "@/lib/rate-limit": dataModule(
    "export async function rateLimit(key, opts) { globalThis.__vibeUp.limits.push({ key, opts }); return { allowed: true, retryAfterSec: 0 }; }\n" +
      "export function tooManyRequests() { return { status: 429, body: { ok: false } }; }",
  ),
  "@/lib/moderation/access": dataModule(
    "export async function requireCanPublish(id) { globalThis.__vibeUp.gated.push(id); return globalThis.__vibeUp.refuse; }",
  ),
  "@/lib/messages/channel-access": dataModule(
    "export async function ensureMember() { return { ok: true, isOrgChannel: false }; }",
  ),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

type Answer = { status: number; body: Record<string, unknown> };
type Post = (req: Request, ctx?: { params: Promise<{ slug: string }> }) => Promise<Answer>;
const ROUTE_FILES = {
  clip: "app/api/me/clip-upload-url/route.ts",
  messages: "app/api/me/messages-upload-url/route.ts",
  group: "app/api/me/group-photo-upload-url/route.ts",
  org: "app/api/orgs/[slug]/upload-url/route.ts",
} as const;
type RouteName = keyof typeof ROUTE_FILES;
const handlers = {} as Record<RouteName, Post>;
for (const name of Object.keys(ROUTE_FILES) as RouteName[]) {
  handlers[name] = ((await import(`../../${ROUTE_FILES[name]}`)) as { POST: Post }).POST;
}

// ── The world ────────────────────────────────────────────────────────────────

const ME = "11111111-1111-4111-8111-111111111111";
const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const ROOM = "bbbbbbbb-0000-4000-8000-000000000002";

type Signed = { name: string; key: string; contentType: string; contentLength: number };
type World = {
  cookie: unknown;
  service: unknown;
  signed: Signed[];
  limits: { key: string; opts: Record<string, unknown> }[];
  gated: string[];
  refuse: Answer | null;
  reads: string[];
};
type Row = Record<string, unknown> | null;
type Lookup = (table: string, eqs: Record<string, unknown>) => Row;

/** A PostgREST stand-in for `.from(t).select().eq()…maybeSingle()`; every read lands in `reads`. */
function fakeClient(lookup: Lookup, reads: string[], label: string) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: ME } }, error: null }) },
    from(table: string) {
      reads.push(`${label}:${table}`);
      const eqs: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (column: string, value: unknown) => {
          eqs[column] = value;
          return q;
        },
        maybeSingle: async () => ({ data: lookup(table, eqs), error: null }),
      };
      return q;
    },
  };
}

/** `channelType: null` is a channel the caller can't see (RLS hides it); `role` is the caller's club role. */
function install(opts: { channelType?: string | null; member?: boolean; refuse?: boolean; role?: string } = {}): World {
  const reads: string[] = [];
  const world: World = {
    cookie: fakeClient((table, eqs) => {
      if (table === "channels") return opts.channelType === null ? null : { id: eqs.id, type: opts.channelType ?? "group" };
      if (table === "channel_members") return opts.member === false ? null : { channel_id: eqs.channel_id };
      throw new Error(`unexpected read of ${table} on the caller's client`);
    }, reads, "cookie"),
    service: fakeClient((table) => {
      if (table === "orgs") return { id: ORG, hidden_at: null };
      if (table === "org_members") return { role: opts.role ?? "owner" };
      throw new Error(`unexpected read of ${table} on the service client`);
    }, reads, "service"),
    signed: [],
    limits: [],
    gated: [],
    refuse: opts.refuse ? { status: 403, body: { ok: false, code: "school_email_required" } } : null,
    reads,
  };
  (globalThis as Record<string, unknown>).__vibeUp = world;
  return world;
}

const post = (body: unknown) =>
  new Request("http://vibe.test/api/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** One good request per route, each sent with a type the route has to normalize. */
const CASES: Record<RouteName, { body: Record<string, unknown>; signedAs: string; limiterKey: string }> = {
  clip: { body: { contentType: "Video/MP4; codecs=avc1", sizeBytes: 1000 }, signedAs: "video/mp4", limiterKey: `upload:clip-upload-url:${ME}` },
  messages: { body: { channelId: ROOM, contentType: "image/PNG", sizeBytes: 1000 }, signedAs: "image/png", limiterKey: `upload:messages-upload-url:${ME}` },
  group: { body: { channelId: ROOM, contentType: " IMAGE/webp ; q=1", sizeBytes: 1000 }, signedAs: "image/webp", limiterKey: `upload:group-photo-upload-url:${ME}` },
  org: { body: { kind: "post-video", contentType: "video/QuickTime", sizeBytes: 1000 }, signedAs: "video/quicktime", limiterKey: `upload:org-upload-url:${ME}` },
};
const call = (name: RouteName, body: Record<string, unknown> = CASES[name].body) =>
  handlers[name](post(body), { params: Promise.resolve({ slug: "sae" }) });
const NAMES = Object.keys(ROUTE_FILES) as RouteName[];

// ── The tests ────────────────────────────────────────────────────────────────

test("each route answers with the exact type it signed, not the one it was sent", async () => {
  for (const name of NAMES) {
    const world = install();
    const answer = await call(name);
    assert.equal(answer.status, 200, name);
    assert.equal(world.signed.length, 1, name);
    assert.equal(world.signed[0].contentType, CASES[name].signedAs, name);
    assert.equal(answer.body.contentType, world.signed[0].contentType, name);
    assert.equal(answer.body.objectKey, world.signed[0].key, name);
  }
});

test("every upload limiter counts on its own server when its database call fails", async () => {
  for (const name of NAMES) {
    const world = install();
    await call(name);
    // deepEqual pins the whole option bag: same key, limit and window as
    // before, failLocal on, and no failClosed (critique #19).
    assert.deepEqual(world.limits, [
      { key: CASES[name].limiterKey, opts: { limit: 20, windowSec: 600, failLocal: true } },
    ], name);
  }
});

test("profile-upload's limiter counts locally too, and no upload route fails closed", () => {
  const source = (rel: string) => readFileSync(new URL(rel, SRC_ROOT), "utf8");
  const profile = source("app/api/me/profile-upload/route.ts");
  const limiter = profile.match(/rateLimit\(`upload:profile-upload:\$\{user\.id\}`,\s*\{([^}]*)\}\)/);
  assert.ok(limiter, "profile-upload still limits on upload:profile-upload:<uid>");
  assert.match(limiter[1], /limit:\s*30,/);
  assert.match(limiter[1], /windowSec:\s*600,/);
  assert.match(limiter[1], /failLocal:\s*true/);
  for (const rel of [...Object.values(ROUTE_FILES), "app/api/me/profile-upload/route.ts"]) {
    assert.doesNotMatch(source(rel), /failClosed/, rel);
  }
});

test("a group photo needs a group chat and a current membership, on the caller's own client", async () => {
  const refusals: [Parameters<typeof install>[0], number, string][] = [
    [{ channelType: "dm" }, 400, "Only group chats can be edited"],
    [{ channelType: "org_channel" }, 400, "Only group chats can be edited"],
    [{ channelType: null }, 404, "Not found"],
    [{ member: false }, 403, "Not a member"],
  ];
  for (const [opts, status, error] of refusals) {
    const world = install(opts);
    const answer = await call("group");
    assert.equal(answer.status, status, JSON.stringify(opts));
    assert.equal(answer.body.error, error);
    assert.equal(world.signed.length, 0, "nothing is signed for a refused photo");
  }
  const world = install();
  assert.equal((await call("group")).status, 200);
  assert.deepEqual(world.reads, ["cookie:channels", "cookie:channel_members"]);
});

test("all four routes take the publishing gate before anything is read or signed", async () => {
  for (const name of NAMES) {
    const world = install({ refuse: true });
    const answer = await call(name);
    assert.equal(answer.status, 403, name);
    assert.equal(answer.body.code, "school_email_required", name);
    assert.deepEqual(world.gated, [ME], name);
    assert.deepEqual(world.reads, [], `${name} reads nothing past the gate`);
    assert.equal(world.signed.length, 0, name);
  }
});

test("a club upload still needs an officer once the publishing gate passes", async () => {
  const world = install({ role: "member" });
  const answer = await call("org");
  assert.equal(answer.status, 403);
  assert.equal(answer.body.error, "Admin only");
  assert.deepEqual(world.gated, [ME]);
  assert.equal(world.signed.length, 0);
});
