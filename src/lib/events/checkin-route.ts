import "server-only";

import { NextResponse } from "next/server";

import {
  CHECKIN_CLOSES_AFTER_MS,
  CHECKIN_ERRORS,
  CHECKIN_OPENS_BEFORE_MS,
  checkinLink,
  isCheckinToken,
  isDoorCode,
  parseCheckinStateRows,
  type CheckinErrorCode,
  type CheckinViewerState,
  type DoorFeed,
  type DoorResponse,
  type DoorStep,
  type MyEventCheckin,
} from "@/lib/events/event-checkin";
import { toCount } from "@/lib/events/event-item";
import { accountRestrictedResponse } from "@/lib/moderation/access";
import { tooManyRequests, type RateLimitResult } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The server half of event check-in's routes (contract
 * handoffs/2026-10-19-checkin-build/CONTRACT.md, 3.0 to 3.5): the refusal
 * body, the maps from the database's one-word answers to responses, the door
 * screen's feed, the viewer's state read and the POST body check. The
 * routes stay short and every one of them words a refusal the same way.
 *
 * Nothing here logs or returns a door code, a QR token or a user id: a code
 * in a log line is a code anyone reading the logs could type.
 */

type ViewerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** `{ ok: false, code, error }`, the sentence from CHECKIN_ERRORS so every screen reads the same. */
export function checkinFail(status: number, code: CheckinErrorCode): NextResponse {
  return NextResponse.json({ ok: false, code, error: CHECKIN_ERRORS[code] }, { status });
}

/** The 500 every route answers when the database fails or says something unexpected. */
export function checkinFailed(): NextResponse {
  return checkinFail(500, "request_failed");
}

/**
 * The same response, never kept by a browser or anything in between: a
 * check-in state, a list of your check-ins or a door code is only true now.
 */
export function noStore<T extends Response>(res: T): T {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/**
 * The signed-in caller and their own client (RLS applies), or the 401.
 * Every check-in route starts here, right after its ids are checked.
 */
export async function signedInViewer(): Promise<{ client: ViewerClient; userId: string } | { response: NextResponse }> {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return { response: checkinFail(401, "unauthorized") };
  return { client, userId: user.id };
}

/**
 * The 429 for the `eventCheckin` budget (the day's 20 tries): worded so the
 * student knows to ask an officer, or, when the limiter couldn't count (it
 * fails closed), that it's the app and not them.
 */
export function checkinTriesRefused(rl: Pick<RateLimitResult, "retryAfterSec" | "reason">): Response {
  const code: CheckinErrorCode = rl.reason === "unavailable" ? "checkin_unavailable" : "checkin_too_many_tries";
  return tooManyRequests(rl, CHECKIN_ERRORS[code], code);
}

/** The 429 for every other check-in budget: a plain line, no code. */
export function checkinBusyRefused(rl: Pick<RateLimitResult, "retryAfterSec">): Response {
  return tooManyRequests(rl, "Too many check-in requests. Try again in a few minutes.");
}

/**
 * The officer functions' shared refusals (event_checkin_open / _close /
 * _door / _mark / _unmark / _clear): null for any other word, which the
 * caller handles. A hidden club is 403 `org_hidden` for an officer (they
 * know the club; a stranger never reaches this, can_manage_event refuses
 * them first). The routes send `not_manager` through notManagerResponse
 * first, so the 403 here is only ever said about an event the caller can see.
 */
export function officerRefusal(word: unknown): NextResponse | null {
  switch (word) {
    case "not_found":
      return checkinFail(404, "not_found");
    case "not_manager":
      return checkinFail(403, "org_role_required");
    case "restricted":
      return accountRestrictedResponse();
    case "org_hidden":
      return checkinFail(403, "org_hidden");
    default:
      return null;
  }
}

/**
 * The officer functions' "not_manager": a plain word (open, close, mark,
 * unmark) or the jsonb `status` (door, clear).
 */
export function isNotManager(answer: unknown): boolean {
  if (answer === "not_manager") return true;
  return !!answer && typeof answer === "object" && (answer as Record<string, unknown>).status === "not_manager";
}

/**
 * "You don't run this event", worded by what the caller may see. The officer
 * functions are SECURITY DEFINER and look the event up before
 * can_manage_event, so their not_manager would tell anyone holding an event
 * id that it exists, even one RLS hides from them (a hidden club's event,
 * someone else's org-less one). One cheap read on the caller's own client
 * settles it: an event they can't see is the same 404 as a missing one (the
 * attendees route's rule); one they can see keeps the 403 sentence. Only
 * non-officers pay for the read.
 */
export async function notManagerResponse(client: ViewerClient, eventId: string): Promise<NextResponse> {
  const { data, error } = await client.from("events").select("id").eq("id", eventId).maybeSingle();
  if (error) {
    console.error("[events/:id/checkin visible]", error.code);
    return checkinFailed();
  }
  return data ? checkinFail(403, "org_role_required") : checkinFail(404, "not_found");
}

/**
 * A word the database isn't meant to send: a 500, and one log line naming
 * only the step (no word, id, code or token).
 */
function unexpected(step: string): NextResponse {
  console.error(`[events/:id/checkin ${step}] unexpected answer`);
  return checkinFailed();
}

/** event_checkin_door's `status`: null for `ok` (send the feed), else the refusal. */
export function doorStatusResponse(status: unknown): NextResponse | null {
  if (status === "ok") return null;
  return officerRefusal(status) ?? unexpected("door");
}

/** event_checkin_open's word: null for open / already_open (read the door), else the refusal. */
export function openWordResponse(word: unknown): NextResponse | null {
  if (word === "open" || word === "already_open") return null;
  if (word === "outside_window") return checkinFail(409, "checkin_outside_window");
  return officerRefusal(word) ?? unexpected("open");
}

/** event_checkin_close's word: null for closed (read the door), else the refusal. */
export function closeWordResponse(word: unknown): NextResponse | null {
  if (word === "closed") return null;
  return officerRefusal(word) ?? unexpected("close");
}

/** event_checkin_mark's word: null for marked / already (they're on the record), else the refusal. */
export function markWordResponse(word: unknown): NextResponse | null {
  if (word === "marked" || word === "already") return null;
  if (word === "outside_window") return checkinFail(409, "checkin_mark_window");
  if (word === "not_on_list") return checkinFail(409, "checkin_not_on_list");
  return officerRefusal(word) ?? unexpected("mark");
}

/** event_checkin_unmark's word: null for removed, else the refusal (only two can come back). */
export function unmarkWordResponse(word: unknown): NextResponse | null {
  if (word === "removed") return null;
  if (word === "not_found" || word === "not_manager") return officerRefusal(word);
  return unexpected("unmark");
}

/** event_checkin_clear's jsonb: how many went, or the refusal. */
export function clearOutcome(json: unknown): { cleared: number } | { response: NextResponse } {
  const j = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  if (j.status === "cleared") return { cleared: toCount(j.cleared) };
  if (j.status === "not_found" || j.status === "not_manager") {
    return { response: officerRefusal(j.status) ?? unexpected("clear") };
  }
  return { response: unexpected("clear") };
}

/**
 * event_checkin_self_as's word (contract 3.2's table). A wrong code and a
 * bad token each have one answer, whatever was sent: nothing tells a near
 * miss from a far one.
 */
export function selfWordOutcome(word: unknown): { already: boolean } | { response: NextResponse } {
  switch (word) {
    case "checked_in":
      return { already: false };
    case "already":
      return { already: true };
    case "wrong_code":
      return { response: checkinFail(400, "checkin_code_wrong") };
    case "link_expired":
      return { response: checkinFail(409, "checkin_link_expired") };
    case "not_open":
      return { response: checkinFail(409, "checkin_closed") };
    case "outside_window":
      return { response: checkinFail(409, "checkin_outside_window") };
    case "not_found":
      return { response: checkinFail(404, "not_found") };
    case "restricted":
      return { response: accountRestrictedResponse() };
    case "terms_required":
      return { response: checkinFail(403, "terms_required") };
    default:
      return { response: unexpected("self") };
  }
}

// ── Times ───────────────────────────────────────────────────────────────────

/** `iso` moved by `ms`, as ISO; "" when it can't be read (a broken row must not throw). */
function shiftIso(iso: unknown, ms: number): string {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t + ms).toISOString() : "";
}

/** A time from the database's jsonb as ISO (Postgres writes `+00:00` and microseconds); "" when unreadable. */
function isoOrEmpty(value: unknown): string {
  return shiftIso(value, 0);
}

// ── The door screen's feed ──────────────────────────────────────────────────

/**
 * event_checkin_door's jsonb as the screen's DoorFeed. `origin` is
 * getSiteOriginForRequest(req), never the Host header, so a forged request
 * can't make the QR point anywhere else. Codes only while open; `next` only
 * when the database sent it whole.
 */
export function doorFeedFrom(json: Record<string, unknown>, origin: string, eventId: string): DoorFeed {
  const j = json;
  const open = j.is_open === true;
  let current: DoorStep | null = null;
  let next: DoorStep | null = null;
  if (open && typeof j.code === "string" && typeof j.token === "string") {
    current = {
      code: j.code,
      link: checkinLink(origin, eventId, j.token),
      starts_at: isoOrEmpty(j.step_starts_at),
      ends_at: isoOrEmpty(j.step_ends_at),
    };
    if (typeof j.next_code === "string" && typeof j.next_token === "string") {
      next = {
        code: j.next_code,
        link: checkinLink(origin, eventId, j.next_token),
        starts_at: isoOrEmpty(j.step_ends_at),
        ends_at: isoOrEmpty(j.next_ends_at),
      };
    }
  }
  return {
    event_id: eventId,
    open,
    opens_at: isoOrEmpty(j.opens_at),
    closes_at: isoOrEmpty(j.closes_at),
    server_now: isoOrEmpty(j.server_now),
    current,
    next,
    count: toCount(j.here_count),
  };
}

/**
 * One read of the door on the officer's own client, as the response to
 * send: the feed (200), the refusal its `status` names, or a 500. Shared by
 * GET (the 10-second read) and the answers to Start and Stop.
 */
export async function doorResponse(client: ViewerClient, eventId: string, origin: string): Promise<NextResponse> {
  const { data, error } = await client.rpc("event_checkin_door", { p_event_id: eventId });
  if (error) {
    console.error("[events/:id/checkin door]", error.code);
    return checkinFailed();
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.error("[events/:id/checkin door] unexpected answer");
    return checkinFailed();
  }
  const j = data as Record<string, unknown>;
  if (isNotManager(j)) return notManagerResponse(client, eventId);
  const refused = doorStatusResponse(j.status);
  if (refused) return refused;
  return NextResponse.json({ ok: true, door: doorFeedFrom(j, origin, eventId) });
}

/**
 * The feed Stop answers when its door read-back doesn't come through (the
 * club was hidden since, the account is restricted, or the read failed).
 * Stop DID happen: the session row is gone and every code shown is dead. So
 * Stop answers this rather than the read's refusal, and a refusal from Stop
 * only ever means "not stopped". The times are unknown here ("", as the
 * POST checkin fallback does) and so is the count (0: the type has no
 * "unknown"); the screen's next read brings the real ones or its own
 * refusal. `server_now` is this server's clock, so a skew worked out from it
 * stays a number.
 */
export function closedDoorFeed(eventId: string): DoorFeed {
  return {
    event_id: eventId,
    open: false,
    opens_at: "",
    closes_at: "",
    server_now: new Date().toISOString(),
    current: null,
    next: null,
    count: 0,
  };
}

/**
 * Stop's answer once event_checkin_close said `closed`: the door read-back
 * when it comes through, else the closed feed above (never its 403 or 500).
 */
export async function stoppedResponse(client: ViewerClient, eventId: string, origin: string): Promise<NextResponse> {
  const read = await doorResponse(client, eventId, origin);
  if (read.status === 200) return read;
  const body: DoorResponse = { ok: true, door: closedDoorFeed(eventId) };
  return NextResponse.json(body);
}

// ── The viewer's state ──────────────────────────────────────────────────────

export type ViewerStateRead =
  | { ok: true; state: CheckinViewerState }
  | { ok: false; reason: "not_found" | "failed" };

/**
 * What the viewer knows about one event's check-in, on their own client:
 * the event as RLS shows it to them (nothing back = 404, they may not see
 * it) and its event_checkin_state row (the from-5 floor is applied in the
 * database, so this can't read under it).
 */
export async function readViewerState(client: ViewerClient, eventId: string): Promise<ViewerStateRead> {
  const [eventRes, stateRes] = await Promise.all([
    client.from("events").select("id,starts_at,ends_at").eq("id", eventId).maybeSingle(),
    client.rpc("event_checkin_state", { p_event_ids: [eventId] }),
  ]);
  if (eventRes.error) {
    console.error("[events/:id/checkin event]", eventRes.error.code);
    return { ok: false, reason: "failed" };
  }
  if (!eventRes.data) return { ok: false, reason: "not_found" };
  if (stateRes.error) {
    console.error("[events/:id/checkin state]", stateRes.error.code);
    return { ok: false, reason: "failed" };
  }
  const row = parseCheckinStateRows(stateRes.data).get(eventId);
  if (!row) return { ok: false, reason: "not_found" };
  const ev = eventRes.data as { starts_at?: unknown; ends_at?: unknown };
  return {
    ok: true,
    state: {
      event_id: eventId,
      open: row.open,
      checked_in: row.viewerCheckedIn,
      count: row.count,
      opens_at: shiftIso(ev.starts_at, -CHECKIN_OPENS_BEFORE_MS),
      closes_at: shiftIso(ev.ends_at, CHECKIN_CLOSES_AFTER_MS),
    },
  };
}

/** A failed read as its response: 404 when the event can't be seen, else 500. */
export function viewerStateFailure(read: { reason: "not_found" | "failed" }): NextResponse {
  return read.reason === "not_found" ? checkinFail(404, "not_found") : checkinFailed();
}

/**
 * The state after a check-in that happened but couldn't be read back: the
 * person IS checked in, so the screen says so; the rest is unknown.
 */
export function checkedInFallback(eventId: string): CheckinViewerState {
  return { event_id: eventId, open: true, checked_in: true, count: null, opens_at: "", closes_at: "" };
}

// ── The POST body ───────────────────────────────────────────────────────────

export type ParsedCheckinBody =
  | { ok: true; code: string | null; token: string | null }
  | { ok: false; status: number; code: CheckinErrorCode };

/**
 * POST /api/events/[id]/checkin's body: exactly one of `code` (4 digits,
 * spaces and dashes dropped) or `token` (the QR's 22 characters). Checked
 * before the limiter, so a malformed try costs none of the day's 20.
 */
export function parseCheckinBody(raw: unknown): ParsedCheckinBody {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, status: 400, code: "invalid_body" };
  }
  const body = raw as Record<string, unknown>;
  const hasCode = typeof body.code === "string";
  const hasToken = typeof body.token === "string";
  if (hasCode === hasToken) return { ok: false, status: 400, code: "invalid_body" };
  if (hasCode) {
    const code = (body.code as string).replace(/[\s-]/g, "");
    if (!isDoorCode(code)) return { ok: false, status: 400, code: "checkin_code_format" };
    return { ok: true, code, token: null };
  }
  const token = body.token as string;
  // A token of the wrong shape is a link that can't work: the same answer as an old one.
  if (!isCheckinToken(token)) return { ok: false, status: 409, code: "checkin_link_expired" };
  return { ok: true, code: null, token };
}

// ── Settings: my check-ins ──────────────────────────────────────────────────

/**
 * event_checkin_mine's rows as Settings' list. `org` is null for an
 * org-less event (no handle); a row missing its event id or times is
 * skipped rather than drawn wrong.
 */
export function myCheckinsFrom(data: unknown): MyEventCheckin[] {
  if (!Array.isArray(data)) return [];
  const out: MyEventCheckin[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.event_id !== "string" || typeof r.starts_at !== "string" || typeof r.ends_at !== "string") continue;
    const handle = typeof r.org_handle === "string" ? r.org_handle : null;
    out.push({
      event_id: r.event_id,
      title: typeof r.title === "string" ? r.title : "",
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      org: handle === null ? null : { name: typeof r.org_name === "string" ? r.org_name : handle, handle },
    });
  }
  return out;
}
