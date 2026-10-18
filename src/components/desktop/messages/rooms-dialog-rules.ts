/**
 * The Rooms dialog's pure rules (handoffs/chat-redesign/wave-3-desktop/
 * contract.md 4c.2, 4c.5; W3-5-rooms): the addresses the dialog asks, a row
 * of the room list as the dialog reads it, the line under each room, which
 * "who can post" options are offered, the form's validity, the body of a
 * create and of a save, the sentences the dialog shows, and (club model,
 * Oct 16) the Board's "Followers can read the Board" switch, which the club's
 * Settings → Followers shares.
 * No React, no DOM: `room-names.ts`, `room-rules.ts`, the phone's
 * `club/helpers.ts`, `types.ts` and `join-copy.ts` (the Board's words live in
 * `ORG_COPY.board`) only, so `node --test` loads it (rooms-dialog-rules.test.ts).
 *
 * THE DATABASE IS THE WALL (4c.2). Nothing here lets anyone in or keeps
 * anyone out: the routes and `can_post_org_channel` decide. These rules only
 * pick what the dialog draws and what it sends.
 *
 * "Officers" in every sentence here means owner and admin, as on a Board.
 */

import { chipLabel } from "@/components/mobile/messages/club/helpers";
import { roomDisplayName, roomSlug } from "@/lib/chat/room-names";
import { EXTRA_ROOM_CAP, isPostPolicy, isRoomKind } from "@/lib/chat/room-rules";
import { REFUSAL_SENTENCES, type PostPolicy, type RoomKind } from "@/lib/chat/types";
import { ORG_COPY } from "@/lib/orgs/join-copy";

// ── The routes (4c.5's three, plus `clubUrl` for the Board switch) ───────────

/** `GET` the club's rooms, `POST` a new one. */
export function roomsUrl(orgHandle: string): string {
  return `/api/orgs/${encodeURIComponent(orgHandle)}/channels`;
}

/** `PATCH` or `DELETE` one room. */
export function roomUrl(orgHandle: string, roomId: string): string {
  return `${roomsUrl(orgHandle)}/${encodeURIComponent(roomId)}`;
}

/**
 * The club's roster, UNFILTERED (1.3 K4): an officer deciding who may enter
 * a room sees every member, so this address never carries the block filter
 * the faces row and the Members dialog ask for.
 */
export function rosterUrl(orgHandle: string): string {
  return `/api/orgs/${encodeURIComponent(orgHandle)}/members`;
}

// ── The rows ─────────────────────────────────────────────────────────────────

/**
 * One row of `GET /api/orgs/<handle>/channels`, as the dialog reads it.
 * `kind` is null only on a database without `channels.kind`; `post_policy`
 * is `everyone` wherever the row did not carry one (a database without the
 * column: as-built wave 2, W3-2-roomroutes).
 */
export type RoomRow = { id: string; name: string; topic: string | null; is_private: boolean; kind: RoomKind | null; post_policy: PostPolicy };

/**
 * The rule a create or a save answered with (`channel.post_policy`: always in
 * a create's answer, in a save's whenever the body named it), or null when
 * the answer carries none of the three.
 */
export function answeredPolicy(data: unknown): PostPolicy | null {
  if (data === null || typeof data !== "object") return null;
  const channel = (data as { channel?: unknown }).channel;
  if (channel === null || typeof channel !== "object") return null;
  const policy = (channel as { post_policy?: unknown }).post_policy;
  return isPostPolicy(policy) ? policy : null;
}

/**
 * The list's rows in the server's order. Anything that is not a row with an
 * id and a name is dropped, and so is an event's chat (the route already
 * leaves them out; they are managed from their event).
 *
 * `answered` holds, by room id, the rule this dialog's own writes were
 * answered with (`answeredPolicy`). The list can come back WITHOUT
 * `post_policy` for a few minutes after the column appears (a server that
 * still remembers it as missing), and a rule just saved must not read as
 * `everyone` then. A row that carries a rule always wins.
 */
export function toRoomRows(channels: unknown, answered?: ReadonlyMap<string, PostPolicy>): RoomRow[] {
  if (!Array.isArray(channels)) return [];
  const rows: RoomRow[] = [];
  for (const raw of channels) {
    if (raw === null || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== "string" || !c.id || typeof c.name !== "string") continue;
    const kind = isRoomKind(c.kind) ? c.kind : null;
    if (kind === "event") continue;
    rows.push({
      id: c.id,
      name: c.name,
      topic: typeof c.topic === "string" && c.topic.trim() ? c.topic : null,
      is_private: c.is_private === true,
      kind,
      // Only an extra room has a rule to remember (the routes refuse the field anywhere else).
      post_policy: isPostPolicy(c.post_policy) ? c.post_policy : ((kind === "room" ? answered?.get(c.id) : undefined) ?? "everyone"),
    });
  }
  return rows;
}

/** What the dialog offers for a room: nothing (Board, Lounge), the people list (Officers), or everything (an extra room). */
export type RoomSection = "fixed" | "officers" | "extra";

/** A row whose `kind` cannot be read is an extra room, as the routes treat it. */
export function roomSection(room: Pick<RoomRow, "kind">): RoomSection {
  if (room.kind === "board" || room.kind === "lounge") return "fixed";
  if (room.kind === "officers") return "officers";
  return "extra";
}

/** The room's name as the chips say it: `Board`, `Lounge`, `Officers`, or an extra room's name as words. */
export function roomTitle(room: Pick<RoomRow, "kind" | "name">): string {
  return chipLabel({ kind: room.kind ?? "room", name: room.name, event: null });
}

/** The row's mark: the megaphone on the Board, the lock on Officers and on every private room (4c.4's chip rule). */
export function roomMark(room: Pick<RoomRow, "kind" | "is_private">): "megaphone" | "lock" | null {
  if (room.kind === "board") return "megaphone";
  if (room.kind === "officers" || room.is_private) return "lock";
  return null;
}

// ── The words ────────────────────────────────────────────────────────────────

/** Under the Board and the Lounge (4c.5). */
export const FIXED_ROOM_LINE = "Every club has this room. It can't be renamed or removed.";
/** Asked before "Who can see it" turns private on a room that exists (4c.5). */
export const PRIVATE_CONFIRM_LINE = "Make this room private? Members who are not officers or on the list lose it, and their unread marks and votes in it are cleared.";
/** Under `Officers and people you pick` on a room everyone sees (4c.5). */
export const LISTED_PUBLIC_LINE = "Everyone in the club can read. Only officers and the people below can post.";
/** A name another room already shows (4c.5; also the routes' 409 "Channel name already exists"). */
export const NAME_TAKEN_LINE = "A room with that name already exists.";
/**
 * A name no slug the routes accept can be made of (`roomSlug` answered null):
 * fewer than two characters are left of it, or it starts with `_`. The words
 * name the letters that count, so they are true of a name typed in another
 * alphabet too; a name that does what they say always gives a slug.
 */
export const NAME_SHAPE_LINE = "Use at least two letters or numbers (a-z, 0-9), and start with one.";
/** `Board`, `Lounge`, `Officers`: caught before the request, whose 409 `room_locked` sentence reads wrongly for a new room. */
export const NAME_CORE_LINE = "Every club already has a Board, a Lounge and an Officers room. Pick another name.";
/** The longest "What it's for" the routes keep. */
export const TOPIC_MAX = 200;
/** Never listed and never offered in a room's people list: officers are in every room already. */
export const OFFICER_SKIP_ROLES: readonly string[] = Object.freeze(["owner", "admin"]);

/** `Delete <name>? Its messages are deleted too.` */
export function deleteConfirmLine(room: Pick<RoomRow, "kind" | "name">): string {
  return `Delete ${roomTitle(room)}? Its messages are deleted too.`;
}

/** Under the Name field: `Saved as exec-only`. */
export function savedAsLine(slug: string): string {
  return `Saved as ${slug}`;
}

/**
 * The one line under a room: who sees it, who posts (4c.2's table, row by
 * row). A private room's `listed` rule equals `everyone` there (its list is
 * who sees it), so it reads as `everyone`.
 */
export function roomRuleLine(room: Pick<RoomRow, "kind" | "is_private" | "post_policy">): string {
  if (room.kind === "board") return "Every member sees it. Only officers post; any member can reply under a post.";
  if (room.kind === "lounge") return "Every member sees it and can post.";
  if (room.kind === "officers") return "Officers and people added by name see it. Everyone who sees it can post.";
  const policy = effectivePolicy(room.is_private, room.post_policy);
  if (room.is_private) {
    return policy === "officers"
      ? "Only officers and people you pick see it. Only officers post."
      : "Only officers and people you pick see it. Everyone who sees it can post.";
  }
  if (policy === "officers") return "Every member sees it. Only officers post.";
  if (policy === "listed") return "Every member sees it. Only officers and people you pick post.";
  return "Every member sees it and can post.";
}

// ── The two questions ────────────────────────────────────────────────────────

export type SeeOption = { isPrivate: boolean; label: string };
export type PostOption = { policy: PostPolicy; label: string };

/** **Who can see it** (4c.5). */
export const SEE_OPTIONS: readonly SeeOption[] = Object.freeze([
  { isPrivate: false, label: "Everyone in the club" },
  { isPrivate: true, label: "Only officers and people you pick" },
]);

const POST_EVERYONE: PostOption = { policy: "everyone", label: "Everyone who can see it" };
const POST_OFFICERS: PostOption = { policy: "officers", label: "Only officers" };
const POST_LISTED: PostOption = { policy: "listed", label: "Officers and people you pick" };

/**
 * **Who can post** (4c.5): three options for a room everyone sees, two for a
 * private one. The third is never offered on a private room: its list is who
 * sees it, so `listed` there equals `everyone` (4c.2's last row).
 */
export function postOptions(isPrivate: boolean): PostOption[] {
  return isPrivate ? [POST_EVERYONE, POST_OFFICERS] : [POST_EVERYONE, POST_OFFICERS, POST_LISTED];
}

/** The rule as it works in the room: `listed` on a private room is `everyone`. */
export function effectivePolicy(isPrivate: boolean, policy: PostPolicy): PostPolicy {
  return isPrivate && policy === "listed" ? "everyone" : policy;
}

/**
 * The title of a room's people list, by what the room IS (its saved row, not
 * the form): the list is read and written at once, and it means what the
 * saved room makes it mean. Null where the room has no list to show.
 */
export function peopleTitle(room: Pick<RoomRow, "kind" | "is_private" | "post_policy">): string | null {
  const section = roomSection(room);
  if (section === "fixed") return null;
  if (section === "officers") return "Also in this room";
  if (room.is_private) return "People who can see this room";
  return room.post_policy === "listed" ? "People who can post" : null;
}

/** How many extra rooms the club holds (rows whose kind cannot be read are not counted, as in the create route). */
export function extraRoomCount(rooms: readonly Pick<RoomRow, "kind">[]): number {
  return rooms.filter((r) => r.kind === "room").length;
}

/** At the cap: the `room_limit` sentence, shown in place of `New room`. Null under it. */
export function capLine(rooms: readonly Pick<RoomRow, "kind">[]): string | null {
  return extraRoomCount(rooms) >= EXTRA_ROOM_CAP ? REFUSAL_SENTENCES.room_limit : null;
}

// ── The form ─────────────────────────────────────────────────────────────────

/**
 * What the form holds. `name` is words, as typed. `policy` is kept as it was
 * picked: a `listed` room turned private shows and sends `everyone`
 * (`effectivePolicy`), and gets `listed` back if it is turned public again
 * before the save.
 */
export type RoomForm = { name: string; topic: string; isPrivate: boolean; policy: PostPolicy };

/** A new room's form: everyone sees it, everyone posts. */
export const NEW_ROOM_FORM: Readonly<RoomForm> = Object.freeze({ name: "", topic: "", isPrivate: false, policy: "everyone" });

/** An existing room's form: its name as words, its saved answers. */
export function formOf(room: RoomRow): RoomForm {
  return { name: roomTitle(room), topic: room.topic ?? "", isPrivate: room.is_private, policy: room.post_policy };
}

/** The names only a club's own three rooms carry (`isCoreRoomName` in the routes). */
const CORE_NAMES: readonly string[] = Object.freeze(["board", "lounge", "officers"]);

/**
 * The name field's answer. `ok`: the slug to send, and whether it differs
 * from the stored one. Not ok: the line to show, or null while the field is
 * empty (nothing to say yet; the button is just off).
 */
export type NameCheck = { ok: true; slug: string; renamed: boolean } | { ok: false; line: string | null };

/**
 * `room` is the saved room being edited, null for a new one; `others` are
 * the STORED names of the club's other rooms.
 *
 * - The words the field opened with, or words that give the stored slug
 *   back, are no rename: the stored name is kept as it is (`exec_only` shows
 *   as `Exec only`, and saving its topic must not turn it into `exec-only`).
 * - `Board`, `Lounge` and `Officers` are refused here, before the request.
 * - Two stored names can show the same words (`exec_only`, `exec-only`), so
 *   a clash is judged on the words (`roomDisplayName`), not on the slug.
 */
export function checkRoomName(input: string, room: Pick<RoomRow, "kind" | "name"> | null, others: readonly string[]): NameCheck {
  const typed = input.trim();
  if (!typed) return { ok: false, line: null };
  if (room && typed === roomTitle(room)) return { ok: true, slug: room.name, renamed: false };
  const slug = roomSlug(typed);
  if (!slug) return { ok: false, line: NAME_SHAPE_LINE };
  if (room && slug === room.name.trim().toLowerCase()) return { ok: true, slug: room.name, renamed: false };
  if (CORE_NAMES.includes(slug)) return { ok: false, line: NAME_CORE_LINE };
  const shown = roomDisplayName(slug).toLowerCase();
  if (others.some((name) => roomDisplayName(name).toLowerCase() === shown)) return { ok: false, line: NAME_TAKEN_LINE };
  return { ok: true, slug, renamed: room !== null };
}

/** The whole form: may it be sent (`ok`), with which slug, and the line under the name. */
export type FormCheck = { ok: boolean; slug: string | null; nameLine: string | null; changed: boolean };

/** A new room is always "changed"; a saved one only when an answer differs from its row. */
export function checkForm(form: RoomForm, room: RoomRow | null, others: readonly string[]): FormCheck {
  const name = checkRoomName(form.name, room, others);
  const topic = form.topic.trim();
  const changed =
    room === null ||
    (name.ok && name.renamed) ||
    topic !== (room.topic ?? "").trim() ||
    form.isPrivate !== room.is_private ||
    effectivePolicy(form.isPrivate, form.policy) !== effectivePolicy(room.is_private, room.post_policy);
  return {
    ok: name.ok && topic.length <= TOPIC_MAX && changed,
    slug: name.ok ? name.slug : null,
    nameLine: name.ok ? null : name.line,
    changed,
  };
}

/** True when picking `nextPrivate` must ask first: a saved room everyone sees, about to turn private. A new room has nobody to lose it. */
export function needsPrivateConfirm(room: Pick<RoomRow, "is_private"> | null, nextPrivate: boolean): boolean {
  return room !== null && !room.is_private && nextPrivate;
}

// ── What is sent ─────────────────────────────────────────────────────────────

/** `POST /api/orgs/<handle>/channels`. */
export type CreateRoomBody = { name: string; topic: string | null; is_private: boolean; post_policy: PostPolicy };
/** `PATCH /api/orgs/<handle>/channels/<id>`. */
export type SaveRoomBody = { name?: string; topic: string | null; is_private: boolean; post_policy?: PostPolicy };

/** `slug` is `checkForm`'s. */
export function createBody(form: RoomForm, slug: string): CreateRoomBody {
  return { name: slug, topic: form.topic.trim() || null, is_private: form.isPrivate, post_policy: effectivePolicy(form.isPrivate, form.policy) };
}

/**
 * `name` only when the room is renamed (an unchanged old name is never held
 * to today's name rule). `post_policy` only for a room whose kind reads
 * `room`: the route refuses the field on anything else (409 `room_locked`).
 */
export function saveBody(form: RoomForm, room: RoomRow, slug: string): SaveRoomBody {
  return {
    ...(slug !== room.name ? { name: slug } : {}),
    topic: form.topic.trim() || null,
    is_private: form.isPrivate,
    ...(room.kind === "room" ? { post_policy: effectivePolicy(form.isPrivate, form.policy) } : {}),
  };
}

// ── A refused write ──────────────────────────────────────────────────────────

/** What the dialog reads of a failed write (`VibeFailure`). */
export type WriteFailure = { status: number; code?: string | null; error: string | null; message: string; field?: string };

/** The routes' own words for a name already in use (`channels/route.ts`, `channels/[channelId]/route.ts`). */
const ROUTE_NAME_TAKEN = "Channel name already exists";

function nameTaken(failure: WriteFailure): boolean {
  return failure.status === 409 && failure.error === ROUTE_NAME_TAKEN;
}

/** The line for a failure that carries no chat refusal code: the name clash in 4c.5's words, else the mapped line. */
export function writeFailureLine(failure: WriteFailure): string {
  return nameTaken(failure) ? NAME_TAKEN_LINE : failure.message;
}

/** The field a refusal is about: the word filter names it (`content_blocked`), and a name clash is the name's. */
export function refusedField(failure: WriteFailure): "name" | "topic" | null {
  if (nameTaken(failure) || failure.field === "name") return "name";
  return failure.field === "topic" ? "topic" : null;
}

// ── The Board for followers (club model, Franky, Oct 16) ─────────────────────

/**
 * The club itself: `GET` reads `org.followers_read_board`, `PATCH` changes it
 * (owner or admin only; the route refuses everyone else whatever a screen
 * draws). The fourth address the dialog asks.
 */
export function clubUrl(orgHandle: string): string {
  return `/api/orgs/${encodeURIComponent(orgHandle)}`;
}

/** The switch's name, under the Board (here) and in the club's Settings → Followers. */
export const BOARD_FOLLOWERS_LABEL: string = ORG_COPY.board.readersLabel;

/**
 * Under the switch. Followers read officers' posts and nothing members wrote:
 * no replies, no reactions or votes, and never who made them (the read path
 * and the database's rule). Only members post and reply, either way.
 */
export function boardFollowersHelp(on: boolean): string {
  return on ? ORG_COPY.board.readersOnHelp : ORG_COPY.board.readersOffHelp;
}

/** A hidden club's followers read nothing, whatever the switch says (the database's rule). */
export const BOARD_FOLLOWERS_HIDDEN_LINE: string = ORG_COPY.board.readersHidden;

/** A read of the setting that failed. */
export const BOARD_SETTING_LOAD_LINE: string = ORG_COPY.board.readersLoadFailed;
/** A save of the setting that failed (vibeRequest's fallback line). */
export const BOARD_SETTING_SAVE_LINE: string = ORG_COPY.board.readersFailed;

/**
 * The setting from `GET /api/orgs/<handle>`: true or false, or null when it
 * can't be known (no `org`, or a server without the column, which answers
 * null). A screen draws no switch for null rather than a wrong one.
 */
export function boardSettingOf(data: unknown): boolean | null {
  if (data === null || typeof data !== "object") return null;
  const org = (data as { org?: unknown }).org;
  if (org === null || typeof org !== "object") return null;
  const value = (org as { followers_read_board?: unknown }).followers_read_board;
  return typeof value === "boolean" ? value : null;
}

/** `PATCH /api/orgs/<handle>`: the setting alone, never any other field. */
export function boardSettingBody(on: boolean): { followers_read_board: boolean } {
  return { followers_read_board: on };
}

/** What a save that went through stored: the answer's own value, else what was asked. */
export function savedBoardSetting(data: unknown, asked: boolean): boolean {
  return boardSettingOf(data) ?? asked;
}

/** The toast after a save. */
export function boardSettingSavedLine(on: boolean): string {
  return on ? ORG_COPY.board.readersOn : ORG_COPY.board.readersOff;
}
