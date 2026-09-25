/**
 * Tests for `payload.ts`: what a push says, the two wire shapes, and the small
 * rules the dispatcher leans on (handoffs/wave-plan-pwa/plan.md §3 D1/D2, §1
 * R13, §7 2D; critic-push.md items 4, 6–12, 26 and 27).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/push/payload.test.ts
 *
 * WHY THE RESOLVE HOOK: payload.ts imports "../moderation/text-filter" with no
 * extension, and that file imports "./text-filter-list" the same way. tsc and
 * Next resolve those; Node's type stripping doesn't. The hook retries a failed
 * relative specifier with ".ts" (the display-mode.test.ts pattern), and the
 * modules load through dynamic imports so the hook is registered first.
 *
 * NO SLUR IS TYPED HERE: the "caught by the filter" cases are built from the
 * encoded list itself, the way text-filter.test.ts does it.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("payload.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const P = await import("./payload");
const { filterTerms } = await import("../moderation/text-filter-list");

type PushEvent = import("./payload").PushEvent;
type PushClub = import("./payload").PushClub;

const ORIGIN = "https://www.connectvibe.app";
const POST = "11111111-1111-4111-8111-111111111111";
const CHANNEL = "22222222-2222-4222-8222-222222222222";
const MESSAGE = "33333333-3333-4333-8333-333333333333";
const ORG = "44444444-4444-4444-8444-444444444444";
const MAYA = { name: "Maya Lopez", handle: "maya" };
// A sentence the word filter refuses, built from the list (see header).
const BLOCKED = `hey ${filterTerms()[0].term} there`;

const ctx = (over: Partial<import("./payload").PushBuildContext> = {}) => ({
  origin: ORIGIN,
  previews: true,
  badge: 3,
  ...over,
});
const build = (e: PushEvent, over?: Partial<import("./payload").PushBuildContext>) =>
  P.buildPushMessage(e, ctx(over));
const text = (t: string | null): import("./payload").PushChatContent => ({
  text: t,
  mediaKind: null,
  attachmentKind: null,
});
const PUBLIC_CLUB: PushClub = {
  handle: "chess",
  name: "Chess Club",
  hidden_at: null,
  join_policy: "open",
  audience: "both",
  is_public: true,
};

// ── R13: the web payload ───────────────────────────────────────────────────

test("the web payload is exactly plan R13, keys in order, badge in both places", () => {
  const m = build({ kind: "like", actor: MAYA, postId: POST });
  const json = P.toWebPush(m);
  assert.equal(
    json,
    JSON.stringify({
      web_push: 8030,
      notification: {
        title: "Maya Lopez",
        body: "Liked your post",
        navigate: `${ORIGIN}/posts/${POST}`,
        tag: `like:${POST}`,
        app_badge: 3,
      },
      app_badge: 3,
      mutable: false,
    }),
  );
  const parsed = JSON.parse(json);
  assert.deepEqual(Object.keys(parsed), ["web_push", "notification", "app_badge", "mutable"]);
  assert.deepEqual(Object.keys(parsed.notification), ["title", "body", "navigate", "tag", "app_badge"]);
});

test("an unknown badge leaves out both app_badge keys, never null or negative", () => {
  for (const badge of [null, -1, 1.5, Number.NaN]) {
    const parsed = JSON.parse(P.toWebPush(build({ kind: "follow", actor: MAYA }, { badge })));
    assert.ok(!("app_badge" in parsed), `top level with ${badge}`);
    assert.ok(!("app_badge" in parsed.notification), `inside with ${badge}`);
    assert.equal(parsed.mutable, false);
  }
  const zero = JSON.parse(P.toWebPush(build({ kind: "follow", actor: MAYA }, { badge: 0 })));
  assert.equal(zero.app_badge, 0, "zero clears the badge, so it is sent");
  assert.equal(zero.notification.app_badge, 0);
});

test("navigate is absolute on the given origin, whatever the kind", () => {
  const events: PushEvent[] = [
    { kind: "follow", actor: MAYA },
    { kind: "dm", actor: MAYA, channelId: CHANNEL, messageId: MESSAGE, content: text("hi") },
    { kind: "org_invite", actor: MAYA, orgId: ORG, club: PUBLIC_CLUB },
  ];
  for (const e of events) {
    const n = JSON.parse(P.toWebPush(build(e))).notification;
    assert.ok(n.navigate.startsWith(`${ORIGIN}/`), n.navigate);
    assert.equal(new URL(n.navigate).origin, ORIGIN);
  }
  const local = build({ kind: "like", actor: MAYA, postId: POST }, { origin: "http://localhost:3000/" });
  assert.equal(local.url, `http://localhost:3000/posts/${POST}`);
});

// ── The FCM message ─────────────────────────────────────────────────────────

test("the FCM message: strings-only data, Android channel and icon, APNs thread and badge", () => {
  const m = build({ kind: "dm", actor: MAYA, channelId: CHANNEL, messageId: MESSAGE, content: text("hi") });
  const f = P.toFcm(m, "device-token");
  assert.deepEqual(f, {
    token: "device-token",
    notification: { title: "Maya Lopez", body: "hi" },
    data: { url: `${ORIGIN}/messages?channel=${CHANNEL}`, tag: `dm:${CHANNEL}:${MESSAGE}`, kind: "dm" },
    android: {
      notification: {
        channel_id: "messages",
        icon: "ic_stat_vibe",
        color: "#FF5C35",
        tag: `dm:${CHANNEL}:${MESSAGE}`,
      },
    },
    apns: {
      headers: { "apns-collapse-id": P.apnsCollapseId(`dm:${CHANNEL}:${MESSAGE}`) },
      payload: { aps: { badge: 3, "thread-id": `dm:${CHANNEL}`, sound: "default" } },
    },
  });
  for (const v of Object.values(f.data)) assert.equal(typeof v, "string");
  assert.ok(!("collapse_key" in f.android), "FCM ignores collapse_key on notification messages");
});

test("the FCM message leaves aps.badge out when the count is unknown", () => {
  const f = P.toFcm(build({ kind: "follow", actor: MAYA }, { badge: null }), "t");
  assert.ok(!("badge" in f.apns.payload.aps));
  assert.equal(f.apns.payload.aps["thread-id"], "follows");
});

test("Android channel: messages for chat and club-chat mentions, activity for the rest", () => {
  const channel = (e: PushEvent) => P.toFcm(build(e), "t").android.notification?.channel_id;
  assert.equal(channel({ kind: "dm", actor: MAYA, channelId: CHANNEL, messageId: MESSAGE, content: text("x") }), "messages");
  assert.equal(
    channel({ kind: "group_message", actor: MAYA, channelId: CHANNEL, messageId: MESSAGE, groupName: "G", content: text("x") }),
    "messages",
  );
  assert.equal(
    channel({ kind: "message_request", actor: MAYA, channelId: CHANNEL, content: text("x"), recipientFollowsActor: false }),
    "messages",
  );
  assert.equal(
    channel({ kind: "mention", where: "club_chat", actor: MAYA, club: PUBLIC_CLUB, messageId: MESSAGE, content: text("x") }),
    "messages",
  );
  assert.equal(channel({ kind: "mention", where: "post", actor: MAYA, postId: POST, text: "x", recipientFollowsActor: true }), "activity");
  assert.equal(channel({ kind: "like", actor: MAYA, postId: POST }), "activity");
  assert.equal(channel({ kind: "org_invite", actor: MAYA, orgId: ORG, club: PUBLIC_CLUB }), "activity");
});

test("the APNs collapse id stays within 64 bytes: short tags as they are, long ones hashed", () => {
  assert.equal(P.apnsCollapseId(`like:${POST}`), `like:${POST}`);
  const long = `dm:${CHANNEL}:${MESSAGE}`;
  assert.ok(Buffer.byteLength(long) > 64);
  const id = P.apnsCollapseId(long);
  assert.ok(Buffer.byteLength(id) <= 64);
  assert.match(id, /^[A-Za-z0-9_-]+$/);
  assert.equal(id, P.apnsCollapseId(long), "the same tag always hashes the same");
  assert.notEqual(id, P.apnsCollapseId(`dm:${CHANNEL}:${POST}`));
});

// ── Tags, threads and the Web Push Topic ────────────────────────────────────

test("tags per kind (critic items 8, 9 and 11)", () => {
  const tag = (e: PushEvent) => build(e).tag;
  assert.equal(tag({ kind: "follow", actor: MAYA }), "follows");
  assert.equal(tag({ kind: "like", actor: MAYA, postId: POST }), `like:${POST}`);
  assert.equal(tag({ kind: "comment", actor: MAYA, postId: POST, text: "x", recipientFollowsActor: true }), `comment:${POST}`);
  assert.equal(tag({ kind: "mention", where: "post", actor: MAYA, postId: POST, text: "x", recipientFollowsActor: true }), `mention:${POST}`);
  assert.equal(
    tag({ kind: "mention", where: "club_chat", actor: MAYA, club: PUBLIC_CLUB, messageId: MESSAGE, content: text("x") }),
    `mention:${MESSAGE}`,
  );
  assert.equal(tag({ kind: "org_invite", actor: MAYA, orgId: ORG, club: PUBLIC_CLUB }), `org_invite:${ORG}`);
  assert.equal(tag({ kind: "org_request_approved", actor: MAYA, orgId: ORG, club: PUBLIC_CLUB }), `org_request_approved:${ORG}`);
  assert.equal(
    tag({ kind: "message_request", actor: MAYA, channelId: CHANNEL, content: text("x"), recipientFollowsActor: false }),
    `request:${CHANNEL}`,
  );
});

test("chat tags are one per message and share one thread (sw.js has no renotify)", () => {
  const a = build({ kind: "dm", actor: MAYA, channelId: CHANNEL, messageId: MESSAGE, content: text("a") });
  const b = build({ kind: "dm", actor: MAYA, channelId: CHANNEL, messageId: POST, content: text("b") });
  assert.notEqual(a.tag, b.tag, "a second DM must alert, not replace the first quietly");
  assert.equal(a.threadId, `dm:${CHANNEL}`);
  assert.equal(b.threadId, `dm:${CHANNEL}`);
  assert.equal(P.webPushTopic(a), P.webPushTopic(b), "one Topic per thread");
  const g = build({ kind: "group_message", actor: MAYA, channelId: CHANNEL, messageId: MESSAGE, groupName: null, content: text("a") });
  assert.equal(g.threadId, `dm:${CHANNEL}`);
});

test("the Web Push Topic is 32 URL-safe characters from sha256 of the thread or tag", async () => {
  const { createHash } = await import("node:crypto");
  const like = build({ kind: "like", actor: MAYA, postId: POST });
  const expected = createHash("sha256").update(`like:${POST}`).digest("base64url").slice(0, 32);
  assert.equal(P.webPushTopic(like), expected);
  assert.match(P.webPushTopic(like), /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(P.webPushTopic(like), P.webPushTopic(build({ kind: "like", actor: MAYA, postId: CHANNEL })));
});

// ── Wording (decision D2 and its exceptions) ────────────────────────────────

test("follow and like: the name, a plain line, no text of any kind", () => {
  const f = build({ kind: "follow", actor: MAYA });
  assert.deepEqual([f.title, f.body, f.url], ["Maya Lopez", "Started following you", `${ORIGIN}/profile/maya`]);
  const l = build({ kind: "like", actor: MAYA, postId: POST });
  assert.deepEqual([l.title, l.body], ["Maya Lopez", "Liked your post"]);
});

test("a DM shows name and text by default, and the plain line with previews off", () => {
  const e: PushEvent = { kind: "dm", actor: MAYA, channelId: CHANNEL, messageId: MESSAGE, content: text("see you at 8?") };
  const on = build(e);
  assert.deepEqual([on.title, on.body], ["Maya Lopez", "see you at 8?"]);
  assert.equal(on.url, `${ORIGIN}/messages?channel=${CHANNEL}`);
  const off = build(e, { previews: false });
  assert.deepEqual([off.title, off.body], ["Maya Lopez", "Sent you a message"]);
});

test("media reads as what it is, a shared post is never quoted, previews off hides even that", () => {
  const dm = (content: import("./payload").PushChatContent, previews = true) =>
    build({ kind: "dm", actor: MAYA, channelId: CHANNEL, messageId: MESSAGE, content }, { previews }).body;
  assert.equal(dm({ text: "", mediaKind: "image", attachmentKind: null }), "Sent a photo");
  assert.equal(dm({ text: null, mediaKind: "video", attachmentKind: null }), "Sent a video");
  assert.equal(dm({ text: null, mediaKind: null, attachmentKind: "post" }), "Shared a post");
  assert.equal(dm({ text: null, mediaKind: null, attachmentKind: "clip" }), "Shared a post");
  assert.equal(dm({ text: null, mediaKind: "image", attachmentKind: null }, false), "Sent you a message");
  assert.equal(dm({ text: null, mediaKind: null, attachmentKind: null }), "Sent you a message");
});

test("text the word filter refuses never reaches the lock screen", () => {
  const dm = build({ kind: "dm", actor: MAYA, channelId: CHANNEL, messageId: MESSAGE, content: text(BLOCKED) });
  assert.equal(dm.body, "Sent you a message");
  const photo = build({
    kind: "dm", actor: MAYA, channelId: CHANNEL, messageId: MESSAGE,
    content: { text: BLOCKED, mediaKind: "image", attachmentKind: null },
  });
  assert.equal(photo.body, "Sent a photo");
  const c = build({ kind: "comment", actor: MAYA, postId: POST, text: BLOCKED, recipientFollowsActor: true });
  assert.equal(c.body, "Commented on your post");
  const g = build({ kind: "group_message", actor: MAYA, channelId: CHANNEL, messageId: MESSAGE, groupName: BLOCKED, content: text("hi") });
  assert.equal(g.title, "Group chat");
  const named = build({ kind: "follow", actor: { name: BLOCKED, handle: "maya" } });
  assert.equal(named.title, "@maya", "a name the filter refuses falls back to the handle");
});

test("a comment carries text only from someone the student follows (critic item 7)", () => {
  const e = (follows: boolean): PushEvent =>
    ({ kind: "comment", actor: MAYA, postId: POST, text: "great shot", recipientFollowsActor: follows });
  assert.equal(build(e(true)).body, "Commented: great shot");
  assert.equal(build(e(false)).body, "Commented on your post");
  assert.equal(build(e(true), { previews: false }).body, "Commented on your post");
  assert.equal(build(e(true)).url, `${ORIGIN}/posts/${POST}`);
});

test("a post mention follows the same rule as a comment", () => {
  const e = (follows: boolean): PushEvent =>
    ({ kind: "mention", where: "post", actor: MAYA, postId: POST, text: "with @you today", recipientFollowsActor: follows });
  assert.equal(build(e(true)).body, "Mentioned you: with @you today");
  assert.equal(build(e(false)).body, "Mentioned you in a post");
  assert.equal(build(e(true), { previews: false }).body, "Mentioned you in a post");
});

test("a message request from someone the student doesn't follow shows the name, never the text", () => {
  const e = (follows: boolean, content = text("hey it's me")): PushEvent =>
    ({ kind: "message_request", actor: MAYA, channelId: CHANNEL, content, recipientFollowsActor: follows });
  const stranger = build(e(false));
  assert.deepEqual([stranger.title, stranger.body], ["Maya Lopez", "Sent you a message request"]);
  assert.equal(build(e(false, { text: null, mediaKind: "image", attachmentKind: null })).body, "Sent you a message request");
  assert.equal(build(e(true)).body, "hey it's me");
  assert.equal(build(e(true), { previews: false }).body, "Sent you a message request");
  assert.equal(stranger.url, `${ORIGIN}/messages?channel=${CHANNEL}`);
});

test("a group chat: the group as title with previews on; previews off hides the group's name", () => {
  const e = (groupName: string | null, content = text("on my way")): PushEvent =>
    ({ kind: "group_message", actor: MAYA, channelId: CHANNEL, messageId: MESSAGE, groupName, content });
  const on = build(e("Study group"));
  assert.deepEqual([on.title, on.body], ["Study group", "Maya Lopez: on my way"]);
  assert.equal(build(e(null)).title, "Group chat");
  assert.equal(build(e("Study group", { text: null, mediaKind: "video", attachmentKind: null })).body, "Maya Lopez sent a video");
  const off = build(e("Study group"), { previews: false });
  assert.deepEqual([off.title, off.body], ["Maya Lopez", "Sent a message in a group chat"]);
});

test("club invites and approvals name only a club anyone could find (D2, critic item 6)", () => {
  const e = (kind: "org_invite" | "org_request_approved", club: PushClub): PushEvent =>
    ({ kind, actor: MAYA, orgId: ORG, club });
  assert.equal(build(e("org_invite", PUBLIC_CLUB)).body, "Invited you to join Chess Club");
  assert.equal(build(e("org_request_approved", PUBLIC_CLUB)).body, "Approved your request to join Chess Club");
  const secret: PushClub[] = [
    { ...PUBLIC_CLUB, join_policy: "invite" },
    { ...PUBLIC_CLUB, audience: "iu" },
    { ...PUBLIC_CLUB, audience: "purdue" },
    { ...PUBLIC_CLUB, is_public: false },
    { ...PUBLIC_CLUB, hidden_at: "2026-09-01T00:00:00Z" },
  ];
  for (const club of secret) {
    assert.equal(build(e("org_invite", club)).body, "Sent you a club invite", JSON.stringify(club));
    assert.equal(build(e("org_request_approved", club)).body, "Approved your club request");
  }
  assert.equal(build(e("org_invite", PUBLIC_CLUB), { previews: false }).body, "Sent you a club invite");
  assert.equal(build(e("org_invite", PUBLIC_CLUB)).url, `${ORIGIN}/orgs/chess`);
  assert.equal(build(e("org_invite", { ...PUBLIC_CLUB, handle: null })).url, `${ORIGIN}/campus?tab=orgs`);
});

test("a club-chat mention never names the club; text only with previews on", () => {
  const e: PushEvent = {
    kind: "mention", where: "club_chat", actor: MAYA, club: PUBLIC_CLUB, messageId: MESSAGE, content: text("@you bring chairs"),
  };
  const on = build(e);
  assert.equal(on.body, "Mentioned you in a club chat: @you bring chairs");
  assert.ok(!on.body.includes("Chess") && !on.title.includes("Chess"));
  assert.equal(on.url, `${ORIGIN}/orgs/chess`, "the club page: /messages lists DMs and groups only");
  assert.equal(build(e, { previews: false }).body, "Mentioned you in a club chat");
});

test("clubMayBeNamed is the one test: visible, not invite-only, both schools, public", () => {
  assert.equal(P.clubMayBeNamed(PUBLIC_CLUB), true);
  assert.equal(P.clubMayBeNamed({ ...PUBLIC_CLUB, join_policy: "request" }), true);
  assert.equal(P.clubMayBeNamed({ ...PUBLIC_CLUB, join_policy: null }), false, "unknown policy fails closed");
  assert.equal(P.clubMayBeNamed({ ...PUBLIC_CLUB, is_public: null }), false);
  assert.equal(P.clubMayBeNamed(null), false);
});

// ── Lengths and odd text ────────────────────────────────────────────────────

test("bodies stop at 100 characters and titles at 60, with an ellipsis", () => {
  const long = "word ".repeat(60).trim();
  const dm = build({ kind: "dm", actor: MAYA, channelId: CHANNEL, messageId: MESSAGE, content: text(long) });
  assert.equal(Array.from(dm.body).length, P.BODY_MAX);
  assert.ok(dm.body.endsWith("…"));
  const c = build({ kind: "comment", actor: MAYA, postId: POST, text: long, recipientFollowsActor: true });
  assert.ok(Array.from(c.body).length <= P.BODY_MAX && c.body.startsWith("Commented: "));
  const g = build({ kind: "group_message", actor: MAYA, channelId: CHANNEL, messageId: MESSAGE, groupName: long, content: text(long) });
  assert.ok(Array.from(g.title).length <= P.TITLE_MAX);
  assert.ok(Array.from(g.body).length <= P.BODY_MAX);
  const name = build({ kind: "follow", actor: { name: "A".repeat(80), handle: "a" } });
  assert.ok(Array.from(name.title).length <= 40, "a long name is cut to 40");
});

test("an emoji is never cut in half, and newlines and direction marks are flattened", () => {
  const emoji = "\u{1F600}".repeat(150);
  const body = build({ kind: "dm", actor: MAYA, channelId: CHANNEL, messageId: MESSAGE, content: text(emoji) }).body;
  assert.equal(Array.from(body).length, P.BODY_MAX);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(body), "no lone high surrogate");
  assert.equal(P.oneLine("  a\n\nb\tc‮d  "), "a b cd");
  assert.equal(P.capText("abc", 3), "abc");
  assert.equal(P.capText("abcd", 3), "ab…");
});

test("a title is never empty: no name and no handle reads Someone", () => {
  assert.equal(build({ kind: "follow", actor: { name: "   ", handle: null } }).title, "Someone");
  assert.equal(build({ kind: "follow", actor: { name: null, handle: "sam" } }).title, "@sam");
  assert.equal(build({ kind: "follow", actor: { name: null, handle: null } }).url, `${ORIGIN}/campus`);
});

// ── Preferences ─────────────────────────────────────────────────────────────

test("preferences default to previews on and every kind on (decision D1)", () => {
  for (const settings of [undefined, null, "x", 3, [], {}, { push: null }, { push: "on" }, { push: [] }]) {
    const prefs = P.parsePushPrefs(settings);
    assert.equal(prefs.previews, true, JSON.stringify(settings));
    assert.equal(prefs.off.size, 0);
  }
});

test("preferences: previews off, kinds off, unknown kinds ignored", () => {
  const prefs = P.parsePushPrefs({ push: { previews: false, off: ["like", "follow", "connection", 7, "nope"] } });
  assert.equal(prefs.previews, false);
  assert.deepEqual([...prefs.off].sort(), ["follow", "like"]);
  assert.equal(P.pushKindOn(prefs, "like"), false);
  assert.equal(P.pushKindOn(prefs, "dm"), true);
  assert.equal(P.parsePushPrefs({ push: { previews: "no" } }).previews, true, "only false turns previews off");
});

test("the Otto page's 'Ping on mentions' switch also turns mention pushes off (critic item 26)", () => {
  assert.equal(P.pushKindOn(P.parsePushPrefs({ mention_pings: false }), "mention"), false);
  assert.equal(P.pushKindOn(P.parsePushPrefs({ mention_pings: true }), "mention"), true);
  assert.equal(P.pushKindOn(P.parsePushPrefs({}), "mention"), true);
});

// ── Delivery ────────────────────────────────────────────────────────────────

test("TTL and urgency by kind (critic item 27)", () => {
  for (const k of ["dm", "group_message", "message_request"] as const) {
    assert.deepEqual(P.deliveryFor(k), { ttlSec: 86_400, urgency: "high" });
  }
  for (const k of ["comment", "mention", "org_invite", "org_request_approved"] as const) {
    assert.deepEqual(P.deliveryFor(k), { ttlSec: 86_400, urgency: "normal" });
  }
  for (const k of ["like", "follow"] as const) {
    assert.deepEqual(P.deliveryFor(k), { ttlSec: 3_600, urgency: "low" });
  }
  assert.equal(P.PUSH_KINDS.length, 9);
  assert.ok(!(P.PUSH_KINDS as readonly string[]).includes("connection"), "the dead kind never pushes");
});

// ── Devices ─────────────────────────────────────────────────────────────────

const NOW = Date.parse("2026-09-24T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const device = (id: string, platform: string, seenDaysAgo: number | null, origin = ORIGIN) => ({
  id,
  platform,
  origin,
  last_seen_at: seenDaysAgo === null ? null : daysAgo(seenDaysAgo),
  created_at: null,
});
const ids = (list: Array<{ id: string }>) => list.map((d) => d.id).sort();

test("devices on another origin are neither sent to nor deleted (critic item 21)", () => {
  const out = P.pickDevices([device("a", "desktop-web", 1, "https://preview.vercel.app")], { origin: ORIGIN, now: NOW });
  assert.deepEqual([out.send, out.expired], [[], []]);
});

test("a device not seen for 60 days, or never dated, is deleted instead of sent to", () => {
  const out = P.pickDevices(
    [device("fresh", "desktop-web", 59), device("old", "desktop-web", 61), device("undated", "desktop-web", null)],
    { origin: ORIGIN, now: NOW },
  );
  assert.deepEqual(ids(out.send), ["fresh"]);
  assert.deepEqual(ids(out.expired), ["old", "undated"]);
});

test("a store app seen this month silences the web app on the same system, never the desktop", () => {
  const out = P.pickDevices(
    [device("iapp", "ios-app", 2), device("iweb", "ios-web", 1), device("aweb", "android-web", 1), device("desk", "desktop-web", 1)],
    { origin: ORIGIN, now: NOW },
  );
  assert.deepEqual(ids(out.send), ["aweb", "desk", "iapp"]);
  const stale = P.pickDevices([device("iapp", "ios-app", 45), device("iweb", "ios-web", 1)], { origin: ORIGIN, now: NOW });
  assert.deepEqual(ids(stale.send), ["iapp", "iweb"], "an app not seen for 30 days doesn't silence the web app");
  const android = P.pickDevices([device("aapp", "android-app", 1), device("aweb", "android-web", 1)], { origin: ORIGIN, now: NOW });
  assert.deepEqual(ids(android.send), ["aapp"]);
});

// ── What a row comes to ─────────────────────────────────────────────────────

const OK = { ok: true } as const;
const fail = (f: { gone?: boolean; retry?: boolean; config?: boolean }) =>
  ({ ok: false, gone: false, retry: false, config: false, ...f }) as const;

test("any device that took it makes the row sent (critic item 4)", () => {
  assert.deepEqual(P.rowOutcome([fail({ retry: true }), OK], 1), { kind: "sent" });
  assert.deepEqual(P.rowOutcome([fail({ gone: true }), OK], 3), { kind: "sent" });
});

test("only an all-retry answer is left for re-claim, and the third try ends as failed", () => {
  assert.deepEqual(P.rowOutcome([fail({ retry: true }), fail({ retry: true })], 1), { kind: "retry" });
  assert.deepEqual(P.rowOutcome([fail({ retry: true })], 2), { kind: "retry" });
  assert.deepEqual(P.rowOutcome([fail({ retry: true })], 3), { kind: "skip", reason: "failed" });
  assert.deepEqual(P.rowOutcome([fail({ retry: true }), fail({ gone: true })], 1), { kind: "skip", reason: "failed" });
});

test("finished failures: config beats gone, gone only when every device has gone", () => {
  assert.deepEqual(P.rowOutcome([], 1), { kind: "skip", reason: "no_device" });
  assert.deepEqual(P.rowOutcome([fail({ gone: true }), fail({ gone: true })], 1), { kind: "skip", reason: "gone" });
  assert.deepEqual(P.rowOutcome([fail({ config: true }), fail({ gone: true })], 1), { kind: "skip", reason: "config" });
  assert.deepEqual(P.rowOutcome([fail({})], 1), { kind: "skip", reason: "failed" });
});
