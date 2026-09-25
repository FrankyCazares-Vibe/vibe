/**
 * What a push says, and the small rules around it (plan §7 2D; critic-push.md
 * items 6–13 and 26–27, which override the plan where they differ).
 *
 * PURE: no `server-only`, no `@/` import, and the only runtime imports are
 * `node:crypto` and the word filter (itself pure), so payload.test.ts can load
 * this file with `node --test`. The dispatcher (dispatch.ts) reads the
 * database, decides WHETHER a push goes out, and hands this file plain facts;
 * this file decides WHAT the lock screen shows.
 *
 * A LOCK SCREEN IS READABLE BY ANYONE HOLDING THE PHONE, and a push can't be
 * taken back once it lands. So every rule here leans towards showing less:
 * - Names are shown (decision D2). Message, comment and post text is shown
 *   only when the student leaves previews on, the text passes `checkText`,
 *   and, for comments, post mentions and message requests, the student
 *   follows the sender (critic items 7 and D2). Otherwise a plain line.
 * - A club is named only when anyone could find it anyway (clubMayBeNamed).
 *   A club chat is never named at all (critic item 6).
 * - A shared post reads "shared a post", a photo "sent a photo". Never the
 *   shared post's text, never the picture.
 * - Titles are at most 60 characters and never empty; bodies at most 100.
 *
 * THE WEB PAYLOAD IS EXACTLY PLAN R13, which public/sw.js parses and iOS 18.4+
 * shows without running our worker at all:
 *   {"web_push":8030,"notification":{"title","body","navigate","tag","app_badge"},
 *    "app_badge":N,"mutable":false}
 * `navigate` is absolute (WebKit rejects a relative one, research critic C2).
 * `app_badge` sits in both places (iOS 18.4–18.x read the inside copy, 26+ the
 * top level, C1), and both are left out when the count is unknown.
 *
 * CHAT TAGS ARE ONE PER MESSAGE. public/sw.js replaces a same-tag notification
 * quietly (no renotify), which is right for likes and wrong for messages: every
 * DM after the first in a thread would arrive silently in Chrome and Firefox.
 * sw.js isn't this batch's file, so this is critic item 11's fallback: the tag
 * is `dm:<channel>:<message>` and the thread (iOS thread-id, the Web Push
 * Topic) stays `dm:<channel>`. If sw.js later honours `renotify`, the tag can
 * go back to one per thread.
 */

import { createHash } from "node:crypto";

import { checkText } from "../moderation/text-filter";
import type { FcmMessage } from "./types";

// ── Kinds and the message ───────────────────────────────────────────────────

/** Every kind that can push. The dead `connection` kind never does. */
export type PushKind =
  | "follow"
  | "like"
  | "comment"
  | "mention"
  | "org_invite"
  | "org_request_approved"
  | "dm"
  | "group_message"
  | "message_request";

export const PUSH_KINDS: readonly PushKind[] = [
  "follow",
  "like",
  "comment",
  "mention",
  "org_invite",
  "org_request_approved",
  "dm",
  "group_message",
  "message_request",
];

export type PushMessage = {
  kind: PushKind;
  title: string;
  body: string;
  /** Absolute, on the push site origin (pushSiteOrigin in config.ts). */
  url: string;
  /** Replaces an earlier notification with the same tag on the device. */
  tag: string;
  /** The unread total for the app icon, or null when it couldn't be read. */
  badge: number | null;
  /** Groups a conversation's pushes (iOS thread-id, the Web Push Topic). */
  threadId?: string;
  /** A chat push: Android's "messages" channel instead of "activity". */
  chat: boolean;
};

export const TITLE_MAX = 60;
export const BODY_MAX = 100;
const NAME_MAX = 40;
const FALLBACK_TITLE = "Vibe";

// ── Text helpers ────────────────────────────────────────────────────────────

// Control characters (newlines included) become spaces. Direction overrides
// are dropped: on a lock screen they can make one name read as another.
const CONTROL_RE = /\p{Cc}+/gu;
const BIDI_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** One line of plain text: no control characters, single spaces, trimmed. */
export function oneLine(text: string | null | undefined): string {
  if (typeof text !== "string") return "";
  return text.replace(BIDI_RE, "").replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim();
}

/**
 * At most `max` characters, counted in code points so an emoji is never cut
 * in half. A cut ends with "…" (one character, counted).
 */
export function capText(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, Math.max(0, max - 1)).join("").trimEnd() + "…";
}

/**
 * Text a student wrote, ready for a lock screen, or null when it mustn't show:
 * empty, or caught by the word filter. The cut text is checked again, because
 * a cut can turn an ordinary longer word into one the filter catches.
 */
export function previewText(text: string | null | undefined, max: number): string | null {
  const line = oneLine(text);
  if (!line || !checkText(line).ok) return null;
  const cut = capText(line, max);
  return checkText(cut).ok ? cut : null;
}

/** Enough of a student's name to recognise them: name, else @handle, else "Someone". */
export function displayName(actor: PushActor | null | undefined): string {
  const name = previewText(actor?.name, NAME_MAX);
  if (name) return name;
  const handle = previewText(actor?.handle, NAME_MAX - 1);
  return handle ? `@${handle}` : "Someone";
}

/** A body line: `prefix` + the preview, the whole thing within BODY_MAX. */
function withPreview(prefix: string, text: string | null | undefined): string | null {
  const room = BODY_MAX - Array.from(prefix).length;
  if (room < 10) return null;
  const preview = previewText(text, room);
  return preview ? prefix + preview : null;
}

// ── The facts the dispatcher hands over ─────────────────────────────────────

export type PushActor = { name: string | null; handle: string | null };

/** The club columns the naming rule reads (orgs table). */
export type PushClub = {
  handle: string | null;
  name: string | null;
  hidden_at: string | null;
  join_policy: string | null;
  audience: string | null;
  is_public: boolean | null;
};

/** A chat message, as far as a push may describe it. */
export type PushChatContent = {
  text: string | null;
  /** messages.media_kind: "image" | "video" | null. */
  mediaKind: string | null;
  /** messages.attachment_kind: "post" | "clip" | null (a shared post). */
  attachmentKind: string | null;
};

export type PushEvent =
  | { kind: "follow"; actor: PushActor }
  | { kind: "like"; actor: PushActor; postId: string }
  | {
      kind: "comment";
      actor: PushActor;
      postId: string;
      text: string | null;
      recipientFollowsActor: boolean;
    }
  | {
      kind: "mention";
      where: "post";
      actor: PushActor;
      postId: string;
      text: string | null;
      recipientFollowsActor: boolean;
    }
  | {
      kind: "mention";
      where: "club_chat";
      actor: PushActor;
      club: PushClub;
      messageId: string;
      content: PushChatContent;
    }
  | {
      kind: "org_invite" | "org_request_approved";
      actor: PushActor;
      orgId: string;
      club: PushClub;
    }
  | { kind: "dm"; actor: PushActor; channelId: string; messageId: string; content: PushChatContent }
  | {
      kind: "group_message";
      actor: PushActor;
      channelId: string;
      messageId: string;
      groupName: string | null;
      content: PushChatContent;
    }
  | {
      kind: "message_request";
      actor: PushActor;
      channelId: string;
      content: PushChatContent;
      recipientFollowsActor: boolean;
    };

export type PushBuildContext = {
  /** pushSiteOrigin(): "https://www.connectvibe.app" in production. */
  origin: string;
  /** The student's "show previews" switch (otto_settings.push.previews). */
  previews: boolean;
  badge: number | null;
};

// ── Clubs ───────────────────────────────────────────────────────────────────

/**
 * May a push name this club? Only when anyone could find it anyway: not
 * hidden, not invite-only, open to both schools and public (critic item 6,
 * the one test for invites, approvals and club mentions). A club's name can
 * out someone (cultural, religious, LGBTQ+, Greek); these are the clubs whose
 * name the student's phone may show to whoever holds it.
 */
export function clubMayBeNamed(club: PushClub | null | undefined): boolean {
  return Boolean(
    club &&
      club.hidden_at == null &&
      club.join_policy !== "invite" &&
      club.join_policy != null &&
      club.audience === "both" &&
      club.is_public === true,
  );
}

// ── Preferences ─────────────────────────────────────────────────────────────

export type PushPrefs = { previews: boolean; off: ReadonlySet<PushKind> };

const KIND_SET: ReadonlySet<string> = new Set(PUSH_KINDS);

/**
 * `users.otto_settings.push` = `{previews?: boolean, off?: PushKind[]}`.
 * Anything that isn't that shape means the defaults (previews on, every kind
 * on, decision D1); unknown kinds are ignored. The Otto page's existing "Ping
 * on mentions" switch (`mention_pings: false`) also turns mention pushes off
 * (critic item 26), so a student who already said no is never buzzed.
 */
export function parsePushPrefs(ottoSettings: unknown): PushPrefs {
  const settings = isObject(ottoSettings) ? ottoSettings : {};
  const push = isObject(settings.push) ? settings.push : {};
  const off = new Set<PushKind>();
  if (Array.isArray(push.off)) {
    for (const k of push.off) if (typeof k === "string" && KIND_SET.has(k)) off.add(k as PushKind);
  }
  if (settings.mention_pings === false) off.add("mention");
  return { previews: push.previews !== false, off };
}

export function pushKindOn(prefs: PushPrefs, kind: PushKind): boolean {
  return !prefs.off.has(kind);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ── Building the message ────────────────────────────────────────────────────

/** Where a tap lands. Tap targets match the in-app rows (OttoSidePanel openRow). */
function siteUrl(origin: string, path: string): string {
  return origin.replace(/\/+$/, "") + path;
}
const postPath = (id: string) => `/posts/${encodeURIComponent(id)}`;
const profilePath = (handle: string | null) =>
  handle ? `/profile/${encodeURIComponent(handle)}` : "/campus";
// /messages lists DMs and groups only; ?channel= opens the thread (MessagesMobile).
const threadPath = (channelId: string) => `/messages?channel=${encodeURIComponent(channelId)}`;
// Club rows open the club; without its handle the Orgs tab is the closest place.
const clubPath = (handle: string | null) =>
  handle ? `/orgs/${encodeURIComponent(handle)}` : "/campus?tab=orgs";

/**
 * A chat message in a few words. The sender's own text when previews allow
 * and it passes the filter; otherwise what KIND of thing it was. A shared post
 * is never quoted.
 */
function chatLine(content: PushChatContent, previews: boolean, generic: string): string {
  if (!previews) return generic;
  const text = previewText(content.text, BODY_MAX);
  if (text) return text;
  if (content.mediaKind === "image") return "Sent a photo";
  if (content.mediaKind === "video") return "Sent a video";
  if (content.attachmentKind) return "Shared a post";
  return generic;
}

/** chatLine inside a group ("Maya: hi", "Maya sent a photo"), within BODY_MAX. */
function groupLine(name: string, content: PushChatContent): string {
  const said = withPreview(`${name}: `, content.text);
  if (said) return said;
  if (content.mediaKind === "image") return `${name} sent a photo`;
  if (content.mediaKind === "video") return `${name} sent a video`;
  if (content.attachmentKind) return `${name} shared a post`;
  return `${name} sent a message`;
}

/**
 * The one message for this event. Every push is titled with the person who
 * did it (never empty, at most 60 characters) except a group chat with
 * previews on, which is titled with the group. Wording follows the in-app
 * rows (OttoSidePanel verbFor), minus anything D2 keeps off a lock screen.
 */
export function buildPushMessage(event: PushEvent, ctx: PushBuildContext): PushMessage {
  const name = displayName(event.actor);
  const url = (path: string) => siteUrl(ctx.origin, path);
  const base = { kind: event.kind, badge: validBadge(ctx.badge), chat: false };
  // Comments, post mentions and requests carry text only from someone the
  // student follows (critic item 7, D2): a stranger's words are the
  // harassment path, and a direct database insert skips the route's filter.
  const trusted = (follows: boolean) => ctx.previews && follows;

  let m: PushMessage;
  switch (event.kind) {
    case "follow":
      m = { ...base, title: name, body: "Started following you", url: url(profilePath(event.actor.handle)), tag: "follows" };
      break;
    case "like":
      m = { ...base, title: name, body: "Liked your post", url: url(postPath(event.postId)), tag: `like:${event.postId}` };
      break;
    case "comment":
      m = {
        ...base,
        title: name,
        body:
          (trusted(event.recipientFollowsActor) && withPreview("Commented: ", event.text)) ||
          "Commented on your post",
        url: url(postPath(event.postId)),
        tag: `comment:${event.postId}`,
      };
      break;
    case "mention":
      if (event.where === "post") {
        m = {
          ...base,
          title: name,
          body:
            (trusted(event.recipientFollowsActor) && withPreview("Mentioned you: ", event.text)) ||
            "Mentioned you in a post",
          url: url(postPath(event.postId)),
          tag: `mention:${event.postId}`,
        };
      } else {
        // Never the club or the channel (critic item 6): a private channel's
        // name, or the club's, can say more than the student wants shown.
        m = {
          ...base,
          chat: true,
          title: name,
          body:
            (ctx.previews && withPreview("Mentioned you in a club chat: ", event.content.text)) ||
            "Mentioned you in a club chat",
          url: url(clubPath(event.club.handle)),
          tag: `mention:${event.messageId}`,
        };
      }
      break;
    case "org_invite":
    case "org_request_approved": {
      const club = ctx.previews && clubMayBeNamed(event.club) ? previewText(event.club.name, 50) : null;
      const invite = event.kind === "org_invite";
      m = {
        ...base,
        title: name,
        body: invite
          ? club ? `Invited you to join ${club}` : "Sent you a club invite"
          : club ? `Approved your request to join ${club}` : "Approved your club request",
        url: url(clubPath(event.club.handle)),
        tag: `${event.kind}:${event.orgId}`,
      };
      break;
    }
    case "dm":
      m = {
        ...base,
        chat: true,
        title: name,
        body: chatLine(event.content, ctx.previews, "Sent you a message"),
        url: url(threadPath(event.channelId)),
        tag: `dm:${event.channelId}:${event.messageId}`,
        threadId: `dm:${event.channelId}`,
      };
      break;
    case "group_message": {
      // Previews off hides the group's name too: it's text a student wrote.
      const group = ctx.previews ? previewText(event.groupName, TITLE_MAX) : null;
      m = {
        ...base,
        chat: true,
        title: ctx.previews ? group || "Group chat" : name,
        body: ctx.previews ? groupLine(name, event.content) : "Sent a message in a group chat",
        url: url(threadPath(event.channelId)),
        tag: `dm:${event.channelId}:${event.messageId}`,
        threadId: `dm:${event.channelId}`,
      };
      break;
    }
    case "message_request":
      // One push per request thread per 6 hours (critic item 8), so one tag
      // per thread is enough here.
      m = {
        ...base,
        chat: true,
        title: name,
        body: trusted(event.recipientFollowsActor)
          ? chatLine(event.content, true, "Sent you a message request")
          : "Sent you a message request",
        url: url(threadPath(event.channelId)),
        tag: `request:${event.channelId}`,
        threadId: `dm:${event.channelId}`,
      };
      break;
  }
  return { ...m, title: capText(oneLine(m.title), TITLE_MAX) || FALLBACK_TITLE, body: capText(m.body, BODY_MAX) };
}

/** A whole, non-negative count, or null. Never a negative, never NaN. */
function validBadge(badge: number | null | undefined): number | null {
  return typeof badge === "number" && Number.isInteger(badge) && badge >= 0 ? badge : null;
}

// ── Delivery: how long a push may wait, and how urgent it is ────────────────

export type PushDelivery = { ttlSec: number; urgency: "very-low" | "low" | "normal" | "high" };

/**
 * Critic item 27. A message is worth a day and wakes the phone; a like or a
 * follow an hour later is noise, so it expires and waits for a good moment.
 */
export function deliveryFor(kind: PushKind): PushDelivery {
  if (kind === "dm" || kind === "group_message" || kind === "message_request") {
    return { ttlSec: 86_400, urgency: "high" };
  }
  if (kind === "like" || kind === "follow") return { ttlSec: 3_600, urgency: "low" };
  return { ttlSec: 86_400, urgency: "normal" };
}

// ── The two wire shapes ─────────────────────────────────────────────────────

/** Plan R13, byte for byte in key order. Both badge keys go when the count is unknown. */
export function toWebPush(m: PushMessage): string {
  const badge = validBadge(m.badge);
  const notification: Record<string, unknown> = {
    title: m.title,
    body: m.body,
    navigate: m.url,
    tag: m.tag,
  };
  if (badge !== null) notification.app_badge = badge;
  const payload: Record<string, unknown> = { web_push: 8030, notification };
  if (badge !== null) payload.app_badge = badge;
  payload.mutable = false;
  return JSON.stringify(payload);
}

function sha256Base64url(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("base64url");
}

/**
 * The Web Push `Topic`: at most 32 URL-safe base64 characters, so it's a hash
 * rather than the tag itself (which holds ids and colons). One per thread for
 * chat, one per tag otherwise: a push the phone hasn't collected yet is
 * replaced by the newer one on the same topic.
 */
export function webPushTopic(m: Pick<PushMessage, "tag" | "threadId">): string {
  return sha256Base64url(m.threadId ?? m.tag).slice(0, 32);
}

/** Apple allows 64 bytes; a longer tag is hashed (43 characters) instead of cut. */
export function apnsCollapseId(tag: string): string {
  return Buffer.byteLength(tag, "utf8") <= 64 ? tag : sha256Base64url(tag);
}

/**
 * The FCM v1 message for the store apps (the INNER message: sendFcm wraps it
 * as `{message}` and adds the TTL and priority). `data` holds strings only.
 * No `android.collapse_key`: FCM ignores it on notification messages
 * (critic item 27); the notification `tag` does the replacing.
 */
export function toFcm(m: PushMessage, token: string): FcmMessage {
  const badge = validBadge(m.badge);
  return {
    token,
    notification: { title: m.title, body: m.body },
    data: { url: m.url, tag: m.tag, kind: m.kind },
    android: {
      notification: {
        channel_id: m.chat ? "messages" : "activity",
        icon: "ic_stat_vibe",
        color: "#FF5C35",
        tag: m.tag,
      },
    },
    apns: {
      headers: { "apns-collapse-id": apnsCollapseId(m.tag) },
      payload: {
        aps: {
          ...(badge !== null ? { badge } : {}),
          "thread-id": m.threadId ?? m.tag,
          sound: "default",
        },
      },
    },
  };
}

// ── Which devices, and what a row came to (pure policy for dispatch.ts) ─────
// These live here, not in dispatch.ts, only so node:test can load them.

const DAY_MS = 24 * 60 * 60 * 1000;
/** A device not seen for this long is deleted, not sent to (critic item 5). */
export const DEVICE_EXPIRY_MS = 60 * DAY_MS;
/** A store-app device seen this recently silences the web app on the same phone. */
export const APP_FRESH_MS = 30 * DAY_MS;
/** Older than this at send time and the moment has passed: skipped as "stale". */
export const STALE_MS = 30 * 60 * 1000;
/** claim_push_outbox's own ceiling: a third failed try is the last. */
export const MAX_ATTEMPTS = 3;

export type PushDeviceLike = {
  platform: string | null;
  origin: string | null;
  last_seen_at: string | null;
  created_at?: string | null;
};

function seenAt(d: PushDeviceLike): number {
  const t = Date.parse(d.last_seen_at ?? d.created_at ?? "");
  return Number.isFinite(t) ? t : Number.NaN;
}

/**
 * Split a recipient's devices into the ones to send to and the ones to delete.
 * - Another origin (a preview build, localhost) is neither: not ours to serve,
 *   not ours to delete (critic item 21).
 * - Not seen for 60 days, or no date at all: delete. A lab computer signed
 *   out long ago shouldn't keep showing someone's messages.
 * - A phone with the store app seen in the last 30 days doesn't also get the
 *   Home Screen web app's copy on the same system (critic item 12). A desktop
 *   browser always gets its own.
 */
export function pickDevices<T extends PushDeviceLike>(
  devices: readonly T[],
  opts: { origin: string; now: number },
): { send: T[]; expired: T[] } {
  const ours = devices.filter((d) => d.origin === opts.origin);
  const expired: T[] = [];
  const live: T[] = [];
  for (const d of ours) {
    const seen = seenAt(d);
    if (!Number.isFinite(seen) || opts.now - seen > DEVICE_EXPIRY_MS) expired.push(d);
    else live.push(d);
  }
  const freshApp = (platform: string) =>
    live.some((d) => d.platform === platform && opts.now - seenAt(d) <= APP_FRESH_MS);
  const iosApp = freshApp("ios-app");
  const androidApp = freshApp("android-app");
  const send = live.filter(
    (d) => !(iosApp && d.platform === "ios-web") && !(androidApp && d.platform === "android-web"),
  );
  return { send, expired };
}

export type SendOutcome =
  | { ok: true }
  | { ok: false; gone: boolean; retry: boolean; config: boolean };

export type RowOutcome = { kind: "sent" } | { kind: "retry" } | { kind: "skip"; reason: string };

/**
 * What one outbox row came to, from every device's answer (critic item 4):
 * - any device took it → sent (a device that succeeded is never sent it again);
 * - every device said "try later" → left for re-claim, or "failed" on the last try;
 * - otherwise it's finished: "config" if our keys are wrong, "gone" if every
 *   device has gone, "failed" for anything else.
 */
export function rowOutcome(results: readonly SendOutcome[], attempts: number): RowOutcome {
  if (results.length === 0) return { kind: "skip", reason: "no_device" };
  if (results.some((r) => r.ok)) return { kind: "sent" };
  const failures = results as ReadonlyArray<Extract<SendOutcome, { ok: false }>>;
  if (failures.every((r) => r.retry)) {
    return attempts >= MAX_ATTEMPTS ? { kind: "skip", reason: "failed" } : { kind: "retry" };
  }
  if (failures.some((r) => r.config)) return { kind: "skip", reason: "config" };
  if (failures.every((r) => r.gone)) return { kind: "skip", reason: "gone" };
  return { kind: "skip", reason: "failed" };
}
