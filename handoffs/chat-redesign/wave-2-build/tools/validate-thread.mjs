#!/usr/bin/env node
/**
 * validate-thread.mjs — checks a saved `ThreadMessagesResponse` JSON against
 * `src/lib/chat/types.ts` (wave-2 contract 5.4; SCHEDULE-M6).
 *
 * Usage (from the repo root):
 *   node handoffs/chat-redesign/wave-2-build/tools/validate-thread.mjs <file> --role member|officer --room board|lounge|event|dm [--types src/lib/chat/types.ts]
 *
 * What it checks:
 *   - the top level (`ok`, `messages`, `viewer_id`, `peer_last_read_at`,
 *     `peer_typing`, `room`, `viewer`; wave-1 contract 6.1);
 *   - every field of every `ChatMessage` (type and value), the `Person`,
 *     the `AttachmentRow`, the `ParentPreview`, the `ReactionGroup`s, the
 *     `RemovedInfo`;
 *   - a stub (`hidden: true`): every field at its pinned value (8.1);
 *   - a `PollCard` / `EventCard` under a card row, an `EventRef` under an
 *     Event card and under the room (5.2, 5.5, 6.0);
 *   - `room` and `viewer` against --room and --role: a dm has `room: null`
 *     and the outside-rooms viewer; a club room has its kind, its club, its
 *     event only when it is an event chat, `can_reply` only on a Board,
 *     `can_moderate` for an officer only;
 *   - the KEY SETS of `ChatMessage`, `PollCard`, `PollCardOption`,
 *     `EventCard`, `EventRef`, `ThreadRoom`, `ViewerInRoom`, `OrgRef`,
 *     `Person`, `RemovedInfo` are read from types.ts itself, so a field
 *     added there and missing in the JSON (or the other way round) fails.
 * Exit 0 with one summary line when everything holds; exit 1 with every
 * problem, each with its JSON path.
 *
 * `validateThread(body, { role, room, typesSource })` is exported for the
 * fixture test (validate-thread.test.mjs).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** The repo root: four levels above tools/. */
const REPO_ROOT = resolve(HERE, "../../../..");
export const DEFAULT_TYPES = resolve(REPO_ROOT, "src/lib/chat/types.ts");

const ROLES = ["member", "officer"];
const ROOMS = ["board", "lounge", "event", "dm"];
const ROOM_KINDS = ["board", "lounge", "officers", "event", "room"];
const CLUB_ROLES = ["owner", "admin", "mod", "member"];
const ROOM_STATES = ["soon", "live", "after", "closed"];
const MESSAGE_KINDS = ["text", "poll", "event_card"];

/** The stub of 8.1: every field but the three kept at its pinned value. */
export const STUB_PINNED = Object.freeze({
  kind: "text", hidden: true, content: "", user_id: "", users: null, card: null, reactions: [],
  attachment: null, attachment_id: null, attachment_kind: null, media_url: null, media_kind: null,
  parent_message_id: null, parent_preview: null, reply_count: null, author_role: null, removed: null,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A `timestamptz` as the database sends it: date, time, and its zone. */
const ZONED = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;

const isUuid = (v) => typeof v === "string" && UUID.test(v);
const isZoned = (v) => typeof v === "string" && ZONED.test(v);
const isInt = (v, min = 0) => Number.isInteger(v) && v >= min;
const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The field names of `export type <Name> = { … }` in types.ts, read from the
 * source: the block's braces are walked (a one-line type counts too),
 * comments are dropped, and a field is a depth-1 `name: …;` segment, so a
 * field typed with an object literal counts once.
 */
export function typeKeys(source, name) {
  const start = source.indexOf(`export type ${name} = {`);
  if (start < 0) throw new Error(`types.ts has no \`export type ${name} = {\``);
  const open = source.indexOf("{", start);
  let depth = 0;
  let close = -1;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) throw new Error(`types.ts: the block of ${name} never closes`);
  const block = source
    .slice(open + 1, close)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const keys = [];
  const take = (segment) => {
    const m = /^\s*([a-z_]+)\??\s*:/.exec(segment);
    if (m) keys.push(m[1]);
  };
  let nested = 0;
  let segment = "";
  for (const ch of block) {
    if (ch === "{") nested += 1;
    else if (ch === "}") nested -= 1;
    if (ch === ";" && nested === 0) {
      take(segment);
      segment = "";
    } else {
      segment += ch;
    }
  }
  take(segment);
  return keys;
}

const TYPE_NAMES = ["ChatMessage", "PollCard", "PollCardOption", "EventCard", "EventRef", "ThreadRoom", "ViewerInRoom", "OrgRef", "Person", "RemovedInfo"];

/** Every problem found, each with its JSON path. */
class Problems {
  constructor() {
    this.list = [];
  }
  add(path, what) {
    this.list.push(`${path}: ${what}`);
  }
  /** The value has exactly these keys (order aside). */
  keys(path, value, expected) {
    const have = Object.keys(value).sort();
    const want = [...expected].sort();
    const missing = want.filter((k) => !have.includes(k));
    const extra = have.filter((k) => !want.includes(k));
    if (missing.length) this.add(path, `missing field(s) ${missing.join(", ")}`);
    if (extra.length) this.add(path, `unexpected field(s) ${extra.join(", ")}`);
  }
  check(path, ok, what) {
    if (!ok) this.add(path, what);
    return ok;
  }
}

// ── The shapes ──────────────────────────────────────────────────────────────

function checkPerson(p, path, value) {
  if (!p.check(path, isRecord(value), "not an object")) return;
  p.keys(path, value, p.types.Person);
  p.check(`${path}.id`, isUuid(value.id), "not a uuid");
  p.check(`${path}.handle`, typeof value.handle === "string", "not a string");
  p.check(`${path}.name`, typeof value.name === "string", "not a string");
  p.check(`${path}.avatar_url`, value.avatar_url === null || typeof value.avatar_url === "string", "not a string or null");
}

function checkOrgRef(p, path, value) {
  if (!p.check(path, isRecord(value), "not an object")) return;
  p.keys(path, value, p.types.OrgRef);
  p.check(`${path}.id`, isUuid(value.id), "not a uuid");
  for (const k of ["handle", "name"]) p.check(`${path}.${k}`, typeof value[k] === "string" && value[k] !== "", "not a non-empty string");
  for (const k of ["logo_url", "banner_url"]) p.check(`${path}.${k}`, value[k] === null || typeof value[k] === "string", "not a string or null");
  p.check(`${path}.verified`, typeof value.verified === "boolean", "not a boolean");
}

function checkEventRef(p, path, value, extraKeys = []) {
  if (!p.check(path, isRecord(value), "not an object")) return;
  p.keys(path, value, [...p.types.EventRef, ...extraKeys]);
  p.check(`${path}.id`, isUuid(value.id), "not a uuid");
  p.check(`${path}.title`, typeof value.title === "string", "not a string");
  p.check(`${path}.starts_at`, isZoned(value.starts_at), "not a zoned timestamp");
  p.check(`${path}.ends_at`, isZoned(value.ends_at), "not a zoned timestamp");
  p.check(`${path}.location`, typeof value.location === "string", "not a string (\"\" when null)");
  p.check(`${path}.state`, ROOM_STATES.includes(value.state), `not one of ${ROOM_STATES.join("|")}`);
  p.check(`${path}.room_id`, value.room_id === null || isUuid(value.room_id), "not a uuid or null");
  p.check(`${path}.viewer_status`, [null, "going", "maybe"].includes(value.viewer_status), "not going|maybe|null");
  p.check(`${path}.going_count`, isInt(value.going_count), "not a whole number >= 0");
  p.check(`${path}.maybe_count`, isInt(value.maybe_count), "not a whole number >= 0");
}

function checkPollCard(p, path, card) {
  p.keys(path, card, p.types.PollCard);
  const signup = card.type === "signup";
  if (!p.check(`${path}.type`, card.type === "poll" || signup, "not poll|signup")) return;
  p.check(`${path}.question`, typeof card.question === "string" && card.question.trim() !== "" && [...card.question].length <= 200, "not a string of 1-200 characters");
  p.check(`${path}.anonymous`, typeof card.anonymous === "boolean", "not a boolean");
  p.check(`${path}.multi`, typeof card.multi === "boolean", "not a boolean");
  if (signup) {
    p.check(`${path}.anonymous`, card.anonymous === false, "a sign-up is never anonymous");
    p.check(`${path}.multi`, card.multi === true, "a sign-up is always multi");
  }
  p.check(`${path}.closes_at`, card.closes_at === null || isZoned(card.closes_at), "not a zoned timestamp or null");
  p.check(`${path}.closed`, typeof card.closed === "boolean", "not a boolean");
  p.check(`${path}.total_voters`, isInt(card.total_voters), "not a whole number >= 0");
  if (!p.check(`${path}.options`, Array.isArray(card.options), "not an array")) return;
  const min = signup ? 1 : 2;
  p.check(`${path}.options`, card.options.length >= min && card.options.length <= 10, `${min}-10 options`);
  card.options.forEach((o, n) => {
    const at = `${path}.options[${n}]`;
    if (!p.check(at, isRecord(o), "not an object")) return;
    p.keys(at, o, p.types.PollCardOption);
    p.check(`${at}.id`, isUuid(o.id), "not a uuid");
    p.check(`${at}.label`, typeof o.label === "string" && o.label.trim() !== "" && [...o.label].length <= 80, "not a string of 1-80 characters");
    p.check(`${at}.count`, isInt(o.count), "not a whole number >= 0");
    if (signup) p.check(`${at}.capacity`, isInt(o.capacity, 1) && o.capacity <= 50, "a sign-up slot has a capacity of 1-50");
    else p.check(`${at}.capacity`, o.capacity === null, "a poll option has no capacity");
    p.check(`${at}.full`, o.full === (o.capacity !== null && o.count >= o.capacity), "full = capacity !== null && count >= capacity");
    p.check(`${at}.mine`, typeof o.mine === "boolean", "not a boolean");
    if (p.check(`${at}.voters`, Array.isArray(o.voters), "not an array")) {
      o.voters.forEach((v, i) => checkPerson(p, `${at}.voters[${i}]`, v));
      p.check(`${at}.voters`, o.voters.length <= o.count, "more voters than votes");
      if (card.anonymous) p.check(`${at}.voters`, o.voters.length === 0, "an anonymous poll names nobody");
      if (!signup) p.check(`${at}.voters`, o.voters.length <= 12, "a poll names at most 12");
    }
    p.check(`${at}.voters_more`, isInt(o.voters_more), "not a whole number >= 0");
    if (signup || card.anonymous) p.check(`${at}.voters_more`, o.voters_more === 0, "0 for a sign-up and when anonymous");
  });
}

function checkEventCard(p, path, card) {
  p.keys(path, card, p.types.EventCard);
  p.check(`${path}.type`, card.type === "event", "not \"event\"");
  p.check(`${path}.note`, card.note === null || (typeof card.note === "string" && [...card.note].length <= 200), "not a string of <= 200 characters or null");
  if (card.event !== null) checkEventRef(p, `${path}.event`, card.event);
}

function checkReactions(p, path, value) {
  if (!p.check(path, Array.isArray(value), "not an array")) return;
  value.forEach((g, i) => {
    const at = `${path}[${i}]`;
    if (!p.check(at, isRecord(g), "not an object")) return;
    p.keys(at, g, ["emoji", "count", "viewer_reacted"]);
    p.check(`${at}.emoji`, typeof g.emoji === "string" && g.emoji !== "", "not a non-empty string");
    p.check(`${at}.count`, isInt(g.count, 1), "not a whole number >= 1");
    p.check(`${at}.viewer_reacted`, typeof g.viewer_reacted === "boolean", "not a boolean");
  });
}

function checkAttachment(p, path, value) {
  if (!p.check(path, isRecord(value), "not an object")) return;
  p.keys(path, value, ["id", "type", "content", "media_url", "media_thumbnail_url", "user_id", "author"]);
  p.check(`${path}.id`, isUuid(value.id), "not a uuid");
  p.check(`${path}.type`, typeof value.type === "string", "not a string");
  p.check(`${path}.content`, typeof value.content === "string", "not a string");
  for (const k of ["media_url", "media_thumbnail_url"]) p.check(`${path}.${k}`, value[k] === null || typeof value[k] === "string", "not a string or null");
  p.check(`${path}.user_id`, isUuid(value.user_id), "not a uuid");
  if (value.author !== null) checkPerson(p, `${path}.author`, value.author);
}

function checkParentPreview(p, path, value) {
  if (!p.check(path, isRecord(value), "not an object")) return;
  p.keys(path, value, ["id", "content", "user_id", "author", "media_kind", "attachment_kind"]);
  p.check(`${path}.id`, isUuid(value.id), "not a uuid");
  p.check(`${path}.content`, value.content === null || typeof value.content === "string", "not a string or null");
  p.check(`${path}.user_id`, isUuid(value.user_id), "not a uuid");
  if (value.author !== null) {
    if (p.check(`${path}.author`, isRecord(value.author), "not an object or null")) {
      p.keys(`${path}.author`, value.author, ["id", "handle", "name", "avatar_url"]);
      p.check(`${path}.author.id`, isUuid(value.author.id), "not a uuid");
    }
  }
  p.check(`${path}.media_kind`, [null, "image", "video"].includes(value.media_kind), "not image|video|null");
  p.check(`${path}.attachment_kind`, [null, "post", "clip"].includes(value.attachment_kind), "not post|clip|null");
}

function checkMessage(p, path, m, ctx) {
  if (!p.check(path, isRecord(m), "not an object")) return;
  p.keys(path, m, p.types.ChatMessage);
  p.check(`${path}.id`, isUuid(m.id), "not a uuid");
  p.check(`${path}.created_at`, isZoned(m.created_at), "not a zoned timestamp");
  p.check(`${path}.thread_root_id`, m.thread_root_id === null || isUuid(m.thread_root_id), "not a uuid or null");
  p.check(`${path}.hidden`, typeof m.hidden === "boolean", "not a boolean");
  if (m.hidden === true) {
    // The stub of 8.1: every pinned field at its value.
    ctx.stubs += 1;
    p.check(`${path}.hidden`, ctx.room !== "dm", "a dm or a group never stubs");
    for (const [k, v] of Object.entries(STUB_PINNED)) {
      const same = Array.isArray(v) ? Array.isArray(m[k]) && m[k].length === 0 : m[k] === v;
      p.check(`${path}.${k}`, same, `a stub pins ${k} at ${JSON.stringify(v)}`);
    }
    return;
  }
  p.check(`${path}.content`, typeof m.content === "string", "not a string");
  p.check(`${path}.user_id`, isUuid(m.user_id), "not a uuid");
  p.check(`${path}.attachment_id`, m.attachment_id === null || isUuid(m.attachment_id), "not a uuid or null");
  p.check(`${path}.attachment_kind`, [null, "post", "clip"].includes(m.attachment_kind), "not post|clip|null");
  p.check(`${path}.media_url`, m.media_url === null || (typeof m.media_url === "string" && m.media_url.startsWith("/api/me/threads/")), "not the same-origin proxy URL or null");
  p.check(`${path}.media_kind`, [null, "image", "video"].includes(m.media_kind), "not image|video|null");
  p.check(`${path}.parent_message_id`, m.parent_message_id === null || isUuid(m.parent_message_id), "not a uuid or null");
  if (m.users !== null) checkPerson(p, `${path}.users`, m.users);
  if (m.attachment !== null) checkAttachment(p, `${path}.attachment`, m.attachment);
  if (m.parent_preview !== null) {
    checkParentPreview(p, `${path}.parent_preview`, m.parent_preview);
    p.check(`${path}.parent_preview`, m.parent_message_id !== null, "a preview without parent_message_id");
  }
  checkReactions(p, `${path}.reactions`, m.reactions);
  if (!p.check(`${path}.kind`, MESSAGE_KINDS.includes(m.kind), `not one of ${MESSAGE_KINDS.join("|")}`)) return;
  if (m.kind === "text") {
    p.check(`${path}.card`, m.card === null, "a text message has no card");
  } else if (ctx.room === "dm") {
    p.add(`${path}.kind`, "a card in a dm or a group");
  } else if (m.card === null && m.removed !== null) {
    // The viewer's own removed card: never hydrated (5.2, 6.2), so no card.
  } else if (m.card === null) {
    // A database without migration B (3.10): allowed, counted.
    ctx.cardless += 1;
  } else if (!p.check(`${path}.card`, isRecord(m.card), "not an object or null")) {
    return;
  } else if (m.kind === "poll") {
    ctx.cards += 1;
    checkPollCard(p, `${path}.card`, m.card);
  } else {
    ctx.cards += 1;
    checkEventCard(p, `${path}.card`, m.card);
  }
  if (m.card !== null && m.kind !== "text") {
    p.check(`${path}.media_url`, m.media_url === null && m.attachment === null, "a card has no media and no attachment");
  }
  const boardPost = ctx.room === "board" && m.thread_root_id === null;
  if (boardPost) p.check(`${path}.reply_count`, m.reply_count === null || isInt(m.reply_count), "not a whole number >= 0 or null");
  else p.check(`${path}.reply_count`, m.reply_count === null, "only a Board post has a reply count");
  if (ctx.room === "dm") p.check(`${path}.author_role`, m.author_role === null, "null in a dm or a group");
  else p.check(`${path}.author_role`, m.author_role === null || CLUB_ROLES.includes(m.author_role), `not one of ${CLUB_ROLES.join("|")} or null`);
  if (m.removed !== null) {
    if (p.check(`${path}.removed`, isRecord(m.removed), "not an object or null")) {
      p.keys(`${path}.removed`, m.removed, p.types.RemovedInfo);
      p.check(`${path}.removed.by`, m.removed.by === "officer" || m.removed.by === "moderator", "not officer|moderator");
      p.check(`${path}.removed.at`, isZoned(m.removed.at), "not a zoned timestamp");
      p.check(`${path}.removed.reason`, m.removed.reason === null || typeof m.removed.reason === "string", "not a string or null");
      if (m.removed.by === "officer") p.check(`${path}.removed.reason`, m.removed.reason === null, "an officer's removal has no reason");
      p.check(`${path}.removed`, m.user_id === ctx.viewerId, "only the viewer's own removed message is sent");
    }
  }
}

function checkRoom(p, body, ctx) {
  if (ctx.room === "dm") {
    p.check("room", body.room === null, "null for a dm or a group");
    p.check("viewer", JSON.stringify(body.viewer) === JSON.stringify({ role: null, can_post: true, can_reply: false, can_moderate: false }), "the outside-rooms viewer");
    p.check("peer_typing", Array.isArray(body.peer_typing), "not an array");
    p.check("peer_last_read_at", body.peer_last_read_at === null || isZoned(body.peer_last_read_at), "not a zoned timestamp or null");
    return;
  }
  p.check("peer_last_read_at", body.peer_last_read_at === null, "always null for a club room");
  p.check("peer_typing", Array.isArray(body.peer_typing) && body.peer_typing.length === 0, "always [] for a club room");
  const room = body.room;
  if (!p.check("room", isRecord(room), "a club room's page carries its room (null = a database without migration A)")) return;
  p.keys("room", room, p.types.ThreadRoom);
  p.check("room.id", isUuid(room.id), "not a uuid");
  p.check("room.kind", ROOM_KINDS.includes(room.kind), `not one of ${ROOM_KINDS.join("|")}`);
  p.check("room.kind", room.kind === ctx.room, `--room ${ctx.room}`);
  p.check("room.name", typeof room.name === "string", "not a string");
  checkOrgRef(p, "room.org", room.org);
  if (room.kind === "event") {
    if (p.check("room.event", isRecord(room.event), "an event chat carries its event")) {
      checkEventRef(p, "room.event", room.event, ["going"]);
      p.check("room.event.room_id", room.event.room_id === room.id, "the room itself");
      if (p.check("room.event.going", Array.isArray(room.event.going), "not an array")) {
        p.check("room.event.going", room.event.going.length <= 8, "the first 8 at most");
        p.check("room.event.going", room.event.going.length <= room.event.going_count, "more people than the count");
        room.event.going.forEach((g, i) => checkPerson(p, `room.event.going[${i}]`, g));
      }
    }
  } else {
    p.check("room.event", room.event === null, "only an event chat has an event");
  }
  const viewer = body.viewer;
  if (!p.check("viewer", isRecord(viewer), "not an object")) return;
  p.keys("viewer", viewer, p.types.ViewerInRoom);
  p.check("viewer.role", CLUB_ROLES.includes(viewer.role), `not one of ${CLUB_ROLES.join("|")} (never null in a club room)`);
  for (const k of ["can_post", "can_reply", "can_moderate"]) p.check(`viewer.${k}`, typeof viewer[k] === "boolean", "not a boolean");
  p.check("viewer.can_reply", viewer.can_reply === (room.kind === "board"), "true only in a Board");
  if (ctx.role === "officer") {
    p.check("viewer.role", viewer.role === "owner" || viewer.role === "admin", "--role officer is owner|admin");
    p.check("viewer.can_moderate", viewer.can_moderate === true, "an officer moderates");
  } else {
    p.check("viewer.role", viewer.role === "member", "--role member");
    p.check("viewer.can_moderate", viewer.can_moderate === false, "a member does not moderate");
    if (room.kind === "board") p.check("viewer.can_post", viewer.can_post === false, "a member cannot post on a Board");
  }
}

// ── The whole body ──────────────────────────────────────────────────────────

/**
 * Every problem of `body` as a `ThreadMessagesResponse` for `--role` and
 * `--room`, and a summary. `typesSource` is the text of types.ts.
 */
export function validateThread(body, { role, room, typesSource }) {
  if (!ROLES.includes(role)) throw new Error(`--role must be ${ROLES.join("|")}`);
  if (!ROOMS.includes(room)) throw new Error(`--room must be ${ROOMS.join("|")}`);
  const p = new Problems();
  p.types = Object.fromEntries(TYPE_NAMES.map((n) => [n, typeKeys(typesSource, n)]));
  const ctx = { role, room, viewerId: null, stubs: 0, cards: 0, cardless: 0 };
  if (!isRecord(body)) {
    p.add("$", "not an object");
    return { problems: p.list, summary: "" };
  }
  p.keys("$", body, ["ok", "messages", "viewer_id", "peer_last_read_at", "peer_typing", "room", "viewer"]);
  p.check("ok", body.ok === true, "not true");
  p.check("viewer_id", isUuid(body.viewer_id), "not a uuid");
  ctx.viewerId = body.viewer_id;
  checkRoom(p, body, ctx);
  if (p.check("messages", Array.isArray(body.messages), "not an array")) {
    body.messages.forEach((m, i) => checkMessage(p, `messages[${i}]`, m, ctx));
    const ids = body.messages.map((m) => m?.id);
    p.check("messages", new Set(ids).size === ids.length, "an id appears twice");
    for (let i = 1; i < body.messages.length; i += 1) {
      const a = body.messages[i - 1]?.created_at;
      const b = body.messages[i]?.created_at;
      if (typeof a === "string" && typeof b === "string") {
        p.check(`messages[${i}].created_at`, Date.parse(a) <= Date.parse(b), "not oldest first");
      }
    }
  }
  const n = Array.isArray(body.messages) ? body.messages.length : 0;
  const summary = `validate-thread: ${n} message(s), ${ctx.cards} card(s), ${ctx.cardless} card row(s) without a card, ${ctx.stubs} stub(s); room ${room}, role ${role}`;
  return { problems: p.list, summary };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main(argv) {
  const args = argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
  };
  const file = args.find((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1].startsWith("--")));
  const role = opt("--role");
  const room = opt("--room");
  if (!file || !role || !room) {
    console.error("usage: node validate-thread.mjs <file> --role member|officer --room board|lounge|event|dm [--types <types.ts>]");
    return 2;
  }
  let body;
  try {
    body = JSON.parse(readFileSync(resolve(file), "utf8"));
  } catch (err) {
    console.error(`${file}: ${err instanceof Error ? err.message : err}`);
    return 2;
  }
  const typesSource = readFileSync(opt("--types") ? resolve(opt("--types")) : DEFAULT_TYPES, "utf8");
  let result;
  try {
    result = validateThread(body, { role, room, typesSource });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
  for (const problem of result.problems) console.error(`  ${problem}`);
  if (result.problems.length > 0) {
    console.error(`validate-thread: ${result.problems.length} problem(s) in ${file}`);
    return 1;
  }
  console.log(result.summary);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv);
}
