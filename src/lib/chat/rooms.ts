/**
 * The room rules that need a database client
 * (handoffs/chat-redesign/wave-1-contracts.md section 8, second bullet, and
 * section 14.4 for the four return types).
 *
 * The pure rules (`postRefusal`, `canModerate`, `outranks`, `clubRoomLabel`,
 * the two role lists) live in room-rules.ts.
 *
 * THE DATABASE IS THE WALL. `can_post_org_channel`, `can_view_org_channel`
 * and the policies decide; nothing here repeats a rule in TypeScript. These
 * four only ask and carry the answer.
 *
 * NOTHING HERE THROWS. A read that fails is logged (once per cause per server
 * instance) and answers the closed side: no room, may not post, reads
 * nothing, no role. The one open answer is the contract's (section 3.10): on
 * a database without `can_post_org_channel` the send gate answers "allowed",
 * today's rule.
 *
 * A ROUTE MUST TELL "NO" FROM "THE READ FAILED" (section 14.4: a failed send
 * gate is 503 `try_again`, never a refusal). Two rules, both stated again on
 * the functions:
 *   - the send gate: ask `canPostAnswer`, which says "failed" in words.
 *     `canPost` is the same question folded to yes / no.
 *   - the room: `ensureMember` carried a `kind` and `loadRoom` answered
 *     null = the read failed.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

import { isClubRole, isRoomKind } from "./room-rules";
import { isMissingChatSchema, warnMissingChatSchemaOnce } from "./schema";
import type { ClubRole, Room } from "./types";

/** The viewer's cookie client: RLS and `auth.uid()` answer for the person asking. */
type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * A uuid in its usual written form, any version. Its one job is to keep a
 * value that would fail the uuid cast away from the database; whether the id
 * names anything is the database's answer. `ensureMember`, which a route asks
 * first, is stricter about the room's id (`isUuid`, RFC versions only). The
 * ids checked here are mostly not the room's: people, clubs, events and Board
 * posts, read from the database or already cleaned by the route.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id that can be sent to a uuid column or parameter without failing the cast. */
function isId(value: unknown): value is string {
  return typeof value === "string" && UUID_SHAPE.test(value);
}

/** `filterRoomReaders` asks the database once per person, this many at a time. */
const READERS_AT_ONCE = 20;

/** How much of a cause tells it apart from another (the code and the start of the message). */
const CAUSE_KEY_LENGTH = 60;

/** The most different (caller, cause) pairs one server instance logs; past it the log stays quiet. */
const LOGGED_FAILURES_MAX = 40;

const loggedFailures = new Set<string>();

/**
 * One line per caller AND cause per server instance: a database that is down
 * does not fill the log, and a second, different failure is still said. The
 * set is capped so that causes which differ every time cannot fill it either;
 * the line that reaches the cap says so.
 */
function logFailureOnce(tag: string, what: string): void {
  const key = `${tag}|${what.slice(0, CAUSE_KEY_LENGTH)}`;
  if (loggedFailures.has(key) || loggedFailures.size >= LOGGED_FAILURES_MAX) return;
  loggedFailures.add(key);
  const last = loggedFailures.size >= LOGGED_FAILURES_MAX ? " (no further failures are logged by this instance)" : "";
  console.error(`[${tag}] the read failed; answering the closed side until it works${last}:`, what);
}

/** The code and message of a Supabase error, never the whole object (it can carry the query). */
function errorSummary(error: unknown): string {
  if (error instanceof Error) return error.message || "unknown error";
  if (!error || typeof error !== "object") return String(error);
  const { code, message } = error as { code?: unknown; message?: unknown };
  return [code, message].filter((part) => typeof part === "string" && part !== "").join(" ") || "unknown error";
}

/** The service-role client, or null (logged once) where the key is not set. */
function serviceClient(tag: string): SupabaseClient | null {
  if (!isSupabaseServiceConfigured()) {
    logFailureOnce(tag, "SUPABASE_SERVICE_ROLE_KEY is not set");
    return null;
  }
  try {
    return createSupabaseServiceClient();
  } catch (err) {
    logFailureOnce(tag, errorSummary(err));
    return null;
  }
}

/**
 * The room behind a channel id, read with the service role: its kind, name,
 * club and, for an event's chat, the event. Null for a dm, a group, an id
 * that names nothing, or a database without `channels.kind`. A read that
 * fails also answers null (logged once).
 *
 * An event's chat always comes with its event: when the event cannot be read
 * the answer is null, never a room with `event: null`. The two dates are the
 * strings the database sent, untouched (`roomState` needs them that way).
 *
 * It answers "what is this room", never "may this person see it":
 * `ensureMember` is asked first.
 *
 * WHAT NULL MEANS IS THE CALLER'S TO READ, from what `ensureMember` already
 * said about the same id:
 *   - `isOrgChannel` false: a dm or a group. Null is the right answer.
 *   - `isOrgChannel` true and `kind` null: a database without the columns
 *     (or a club row that is not a room, type `org_subchannel`; no code
 *     makes one and migration A stops if it meets one). The section 3.10
 *     defaults apply.
 *   - `isOrgChannel` true and a `kind`: this IS a club room, so a null here
 *     is a read that failed (or a room deleted in between). The route
 *     answers 503 `try_again`. It never treats the room as a dm, never sends
 *     `room: null` with the 3.10 defaults, and never hands the null to
 *     `postRefusal`.
 */
export async function loadRoom(channelId: string): Promise<Room | null> {
  const tag = "chat/rooms.loadRoom";
  if (!isId(channelId)) return null;
  const service = serviceClient(tag);
  if (!service) return null;
  try {
    const { data, error } = await service
      .from("channels")
      .select("id, kind, name, org_id, event_id")
      .eq("id", channelId)
      .maybeSingle();
    if (error) {
      if (isMissingChatSchema(error)) warnMissingChatSchemaOnce(tag);
      else logFailureOnce(tag, errorSummary(error));
      return null;
    }
    if (!data) return null;
    const row = data as { id: unknown; kind: unknown; name: unknown; org_id: unknown; event_id: unknown };
    // A dm or a group has no club and no kind; neither is a room.
    if (!isId(row.id) || !isId(row.org_id) || !isRoomKind(row.kind)) return null;
    const room: Room = {
      id: row.id,
      kind: row.kind,
      name: typeof row.name === "string" ? row.name : "",
      org_id: row.org_id,
      event: null,
    };
    if (room.kind !== "event") return room;

    if (!isId(row.event_id)) return null;
    const { data: eventRow, error: eventError } = await service
      .from("events")
      .select("id, title, starts_at, ends_at")
      .eq("id", row.event_id)
      .maybeSingle();
    if (eventError) {
      logFailureOnce(tag, errorSummary(eventError));
      return null;
    }
    if (!eventRow) return null;
    const event = eventRow as { id: unknown; title: unknown; starts_at: unknown; ends_at: unknown };
    if (!isId(event.id) || typeof event.starts_at !== "string" || typeof event.ends_at !== "string") return null;
    room.event = {
      id: event.id,
      title: typeof event.title === "string" ? event.title : "",
      starts_at: event.starts_at,
      ends_at: event.ends_at,
    };
    return room;
  } catch (err) {
    logFailureOnce(tag, errorSummary(err));
    return null;
  }
}

/**
 * What the send gate said: the database's yes, the database's no, or "the
 * question could not be asked".
 */
export type CanPostAnswer = "yes" | "no" | "failed";

/**
 * May this person send this message here? The answer of
 * `can_post_org_channel(cid, uid, root)`, asked through the viewer's cookie
 * `client`. `rootId` is null for a new top-level message and the Board
 * post's id for a reply.
 *
 *   "yes"     the database said true, or the function is not in this
 *             database (section 3.10: "allowed", today's rule)
 *   "no"      the database answered and the answer was not true; also an id
 *             that is not a uuid, or a `rootId` that is not text, which are
 *             never asked. After a no, `postRefusal` (room-rules.ts) picks
 *             the code.
 *   "failed"  any other error, or a throw (logged). The route answers 503
 *             `try_again` (section 14.4) and does NOT call `postRefusal`:
 *             nobody was refused.
 *
 * ASK ONLY ABOUT A CLUB ROOM. The function answers no for a dm or a group
 * (they have no club), so the route asks `ensureMember` first and calls this
 * when `isOrgChannel` is true.
 *
 * ONE CLEANED ROOT. A blank `rootId` is read as no root and spaces around an
 * id are dropped, the way `postRefusal` reads it. The route therefore cleans
 * `thread_root_id` ONCE (trim; blank: null) and hands the SAME value to this
 * gate, to `postRefusal` and to the insert. Storing the body's own value
 * after the gate said yes to the cleaned one fails the uuid cast: a bare 500
 * where the contract has a 400 or a 409. A value that is there but is not
 * text (a number, a list) is never "no root": this gate answers no for it.
 */
export async function canPostAnswer(
  client: ServerClient,
  channelId: string,
  userId: string,
  rootId: string | null,
): Promise<CanPostAnswer> {
  const tag = "chat/rooms.canPost";
  // A route may hand over a body value unchecked: a root that is there but is
  // not text is a send that carries a root, never "no root".
  const given: unknown = rootId;
  if (given !== null && given !== undefined && typeof given !== "string") return "no";
  const root = typeof given === "string" && given.trim() !== "" ? given.trim() : null;
  if (!isId(channelId) || !isId(userId)) return "no";
  if (root !== null && !isId(root)) return "no";
  try {
    const { data, error } = await client.rpc("can_post_org_channel", {
      cid: channelId,
      uid: userId,
      root,
    });
    if (error) {
      if (isMissingChatSchema(error)) {
        warnMissingChatSchemaOnce(tag);
        return "yes";
      }
      logFailureOnce(tag, errorSummary(error));
      return "failed";
    }
    return data === true ? "yes" : "no";
  } catch (err) {
    logFailureOnce(tag, errorSummary(err));
    return "failed";
  }
}

/**
 * `canPostAnswer` folded to yes / no, as section 14.4 types it: true on a
 * yes (a database without the function included), false on a no AND on a
 * failure. A caller that must tell a refusal from a failure (the send route:
 * 503 `try_again`) asks `canPostAnswer`.
 */
export async function canPost(
  client: ServerClient,
  channelId: string,
  userId: string,
  rootId: string | null,
): Promise<boolean> {
  return (await canPostAnswer(client, channelId, userId, rootId)) === "yes";
}

/**
 * Of `userIds`, the people who can read THIS room (service role). The
 * @mention fan-out notifies only them, so a mention in a private room never
 * reaches a member who cannot open it (section 6.2).
 *
 * The answer is `can_view_org_channel`'s, asked once per person (it is
 * SECURITY DEFINER and answers the service role truthfully). The ids come
 * back in the order they were given, each once. A person the database could
 * not answer for is left out (logged once): a mention that is not delivered
 * is the safe mistake. For a dm or a group the function answers no for
 * everyone, so this is for club rooms only.
 */
export async function filterRoomReaders(channelId: string, userIds: string[]): Promise<string[]> {
  const tag = "chat/rooms.filterRoomReaders";
  if (!isId(channelId) || !Array.isArray(userIds)) return [];
  const asked: string[] = [];
  const seen = new Set<string>();
  for (const id of userIds) {
    if (!isId(id)) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    asked.push(id);
  }
  if (asked.length === 0) return [];
  const service = serviceClient(tag);
  if (!service) return [];

  const mayRead = async (userId: string): Promise<boolean> => {
    try {
      const { data, error } = await service.rpc("can_view_org_channel", { cid: channelId, uid: userId });
      if (error) {
        logFailureOnce(tag, errorSummary(error));
        return false;
      }
      return data === true;
    } catch (err) {
      logFailureOnce(tag, errorSummary(err));
      return false;
    }
  };

  const readers: string[] = [];
  for (let start = 0; start < asked.length; start += READERS_AT_ONCE) {
    const group = asked.slice(start, start + READERS_AT_ONCE);
    const answers = await Promise.all(group.map(mayRead));
    group.forEach((id, index) => {
      if (answers[index]) readers.push(id);
    });
  }
  return readers;
}

/**
 * This person's role in this club (service role), or null when they are not
 * a member (any more). A read that fails also answers null (logged once):
 * no role is the side with no powers.
 */
export async function clubRole(orgId: string, userId: string): Promise<ClubRole | null> {
  const tag = "chat/rooms.clubRole";
  if (!isId(orgId) || !isId(userId)) return null;
  const service = serviceClient(tag);
  if (!service) return null;
  try {
    const { data, error } = await service
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      logFailureOnce(tag, errorSummary(error));
      return null;
    }
    const role = (data as { role?: unknown } | null)?.role;
    return isClubRole(role) ? role : null;
  } catch (err) {
    logFailureOnce(tag, errorSummary(err));
    return null;
  }
}
