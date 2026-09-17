import type { SupabaseClient } from "@supabase/supabase-js";

import { isOrgRole, type OrgRole } from "@/lib/orgs/join-state";
import { isUuid } from "@/lib/pgrest";

/**
 * Club FOLLOWING: the rules and the reads every follow surface shares (spec
 * `handoffs/2026-09-16-org-following-spec.md`; wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §4.2, batch F1).
 * Following is not membership: anyone can follow a club they can see, and a
 * follow puts the club's posts in their feed. Membership still decides who
 * gets into the chats.
 *
 * NO `import "server-only"`. `node --test` loads this file, and the import
 * throws outside a server bundle (that is why `membership.ts` can't be
 * tested directly). Nothing here creates a client, and nothing throws: every
 * loader logs `[orgs/following <fn>]` and reports the failure in its return
 * value.
 *
 * WHICH CLIENT (migration `20260916120000_org_followers.sql`, header):
 *   - the org row, every follower COUNT and every follower LIST take the
 *     SERVICE client. Under the user client `org_followers_select` narrows a
 *     non-officer's count to 1-or-0, and `orgs_select` hides SAE from every
 *     non-member, so both answers would be silent lies;
 *   - the viewer's OWN follow rows may use either client.
 */

// ── Who may see followers ───────────────────────────────────────────────────

/**
 * The roles that may read a club's follower list and remove a follower.
 * Mirrors the `org_followers_select` policy (migration :726-731): change the
 * two together, or the list route and the database disagree about who is an
 * officer.
 */
export const FOLLOWER_LIST_ROLES: readonly OrgRole[] = Object.freeze(["owner", "admin"]);

export function canSeeFollowers(role: OrgRole | null | undefined): boolean {
  return role != null && FOLLOWER_LIST_ROLES.includes(role);
}

// ── Where a follow came from ────────────────────────────────────────────────

/** Mirrors `org_followers_source_check` (migration :676-677). */
export type FollowSource = "join" | "profile" | "discover" | "onboarding";

export const FOLLOW_SOURCES: readonly FollowSource[] = Object.freeze([
  "join",
  "profile",
  "discover",
  "onboarding",
]);

/** `join` is written by the membership trigger, never by a client. */
export type ClientFollowSource = Exclude<FollowSource, "join">;

export const CLIENT_FOLLOW_SOURCES: readonly ClientFollowSource[] = Object.freeze([
  "profile",
  "discover",
  "onboarding",
]);

export function isFollowSource(v: unknown): v is FollowSource {
  return typeof v === "string" && (FOLLOW_SOURCES as readonly string[]).includes(v);
}

/**
 * The source a route may write for a client's tap. Anything else, `"join"`
 * included, becomes `"profile"`: a client must not be able to pass its follow
 * off as a roster row (the leave trigger deletes `join` follows), and a bad
 * value must never reach the CHECK as a 23514 (critic C24).
 */
export function normalizeFollowSource(v: unknown): ClientFollowSource {
  return typeof v === "string" && (CLIENT_FOLLOW_SOURCES as readonly string[]).includes(v)
    ? (v as ClientFollowSource)
    : "profile";
}

/** The org follow field on every org row (§4.2). Not the PERSON `follow_state`. */
export type OrgFollowState = "following" | "not_following";

// ── The public count ────────────────────────────────────────────────────────

/**
 * Below this many followers the number names people (critic C13: SAE has one
 * member, so "1 follower" is him), so only the club's owner and admins see
 * it. Keep equal to `join-copy.ts` FOLLOWER_COUNT_FLOOR.
 */
export const FOLLOWER_COUNT_FLOOR = 5;

/**
 * The follower count a viewer may be shown. Officers get the raw number;
 * everyone else gets null below the floor. Null always means "render
 * nothing", never zero.
 */
export function publicFollowerCount(
  raw: number | null | undefined,
  viewerRole: OrgRole | null | undefined,
): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (canSeeFollowers(viewerRole)) return raw;
  return raw < FOLLOWER_COUNT_FLOOR ? null : raw;
}

/**
 * A PostgREST `followers:org_followers(count)` embed comes back as
 * `[{count: n}]`. Anything else (a failed embed, a missing key) is null, not
 * zero, so a broken read never renders as "0 followers".
 */
export function flattenCountEmbed(embed: unknown): number | null {
  if (!Array.isArray(embed) || embed.length !== 1) return null;
  const first: unknown = embed[0];
  if (!first || typeof first !== "object") return null;
  const count = (first as { count?: unknown }).count;
  return typeof count === "number" && Number.isFinite(count) && count >= 0 ? count : null;
}

// ── Paging ──────────────────────────────────────────────────────────────────

export const PAGE_LIMIT_DEFAULT = 30;
export const PAGE_LIMIT_MAX = 50;

/** `?limit=`: non-numeric or below 1 gives the default; clamped to the max. */
export function parsePageLimit(raw: string | null): number {
  const n = raw == null || raw.trim() === "" ? NaN : Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return PAGE_LIMIT_DEFAULT;
  return Math.min(n, PAGE_LIMIT_MAX);
}

/**
 * A keyset position: `t` is the sort timestamp, `i` the row id that breaks a
 * tie inside one timestamp (critic C5).
 */
export type FollowCursor = { t: string; i: string };

const CURSOR_MAX_LEN = 256;

/**
 * The only timestamp shape a cursor may carry. It is interpolated into an
 * `.or()` filter inside double quotes, so this pattern is what keeps a quote,
 * a comma or a `)` out of the PostgREST grammar.
 */
const CURSOR_TS_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:\d{2})?)$/;

/**
 * base64url of UTF-8 text. `btoa`/`atob` rather than `Buffer` so the helper
 * works in the browser too, in case a client ever pages with it.
 */
function toBase64Url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The inverse of {@link toBase64Url}, or null for anything that isn't one. */
function fromBase64Url(raw: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * `ts` is the RAW PostgREST timestamptz string, microseconds included
 * (`"2026-05-06T06:24:44.908587+00:00"`). Never pass it through `Date`: that
 * truncates to milliseconds, and a `<` cursor on a truncated value skips the
 * rest of the row's own millisecond.
 */
export function encodeFollowCursor(ts: string, id: string): string {
  return toBase64Url(JSON.stringify({ t: ts, i: id }));
}

/**
 * `null` or `""` is the first page. Anything that isn't a cursor this module
 * wrote (too long, not base64url JSON, an id that isn't a uuid, a timestamp
 * with extra characters) is `{ok:false}`, and the route answers 400.
 */
export function decodeFollowCursor(
  raw: string | null,
): { ok: true; cursor: FollowCursor | null } | { ok: false } {
  if (raw == null || raw === "") return { ok: true, cursor: null };
  if (raw.length > CURSOR_MAX_LEN) return { ok: false };
  const text = fromBase64Url(raw);
  if (text == null) return { ok: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false };
  const { t, i } = parsed as { t?: unknown; i?: unknown };
  if (typeof t !== "string" || !CURSOR_TS_RE.test(t) || !isUuid(i)) return { ok: false };
  // The pattern admits month 13 or hour 99; Postgres would 400 the query on
  // those. Validation only: `t` itself stays raw so microseconds survive.
  if (!Number.isFinite(Date.parse(t))) return { ok: false };
  return { ok: true, cursor: { t, i } };
}

/**
 * The `.or()` filter for "rows after this cursor" under
 * `ORDER BY column DESC, id DESC`. Both halves matter: `column < t` alone
 * drops the rest of a tie group, and `<=` loops forever (critic C5). The
 * quotes are required for the timestamp's `:` and `+` (`pgrest.ts:3-8`); only
 * a decoded cursor may be passed in.
 */
export function followKeysetOrFilter(
  column: "first_followed_at" | "created_at",
  c: FollowCursor,
): string {
  return `${column}.lt."${c.t}",and(${column}.eq."${c.t}",id.lt.${c.i})`;
}

// ── Reads ───────────────────────────────────────────────────────────────────

/**
 * The clubs a viewer follows, newest follow first, deduplicated. The
 * `user_id` filter is ALWAYS applied: under the user client the policy also
 * returns the follower rows of every club the viewer owns or admins, and
 * without it an officer's feed would fill with their audience's clubs.
 */
export async function loadViewerFollowedOrgIds(
  client: SupabaseClient,
  viewerId: string,
  opts?: { limit?: number },
): Promise<{ ok: true; ids: string[] } | { ok: false; error: unknown }> {
  const { data, error } = await client
    .from("org_followers")
    .select("org_id")
    .eq("user_id", viewerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts?.limit ?? 1000);
  if (error) {
    console.error("[orgs/following loadViewerFollowedOrgIds]", error);
    return { ok: false, error };
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of data ?? []) {
    const orgId = (row as { org_id?: unknown }).org_id;
    if (typeof orgId !== "string" || seen.has(orgId)) continue;
    seen.add(orgId);
    ids.push(orgId);
  }
  return { ok: true, ids };
}

/** The viewer's follow row for one club, or `row: null` when they don't follow it. */
export async function loadViewerFollow(
  client: SupabaseClient,
  orgId: string,
  viewerId: string,
): Promise<
  | { ok: true; row: { source: FollowSource; created_at: string; first_followed_at: string } | null }
  | { ok: false; error: unknown }
> {
  const { data, error } = await client
    .from("org_followers")
    .select("source, created_at, first_followed_at")
    .eq("org_id", orgId)
    .eq("user_id", viewerId)
    .maybeSingle();
  if (error) {
    console.error("[orgs/following loadViewerFollow]", error);
    return { ok: false, error };
  }
  if (!data) return { ok: true, row: null };
  const r = data as { source: unknown; created_at: string; first_followed_at: string };
  return {
    ok: true,
    row: {
      // The CHECK makes anything else impossible; "profile" is the column default.
      source: isFollowSource(r.source) ? r.source : "profile",
      created_at: r.created_at,
      first_followed_at: r.first_followed_at,
    },
  };
}

/**
 * A viewer's role in one club, or `role: null` when they aren't a member.
 * Pass the SERVICE client: `org_members` under the user client hides the
 * roster of a club the viewer can't see.
 */
export async function loadOrgRole(
  service: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<{ ok: true; role: OrgRole | null } | { ok: false; error: unknown }> {
  const { data, error } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[orgs/following loadOrgRole]", error);
    return { ok: false, error };
  }
  const role = (data as { role?: unknown } | null)?.role;
  return { ok: true, role: isOrgRole(role) ? role : null };
}

/**
 * How many students follow a club, or null when the read failed. SERVICE
 * client only (the COUNTS RULE): under the user client this is 1-or-0 for
 * anyone who isn't an officer. Callers decide what a viewer may see with
 * {@link publicFollowerCount}; a null is never rendered as zero.
 */
export async function loadFollowerCount(
  service: SupabaseClient,
  orgId: string,
): Promise<number | null> {
  const { count, error } = await service
    .from("org_followers")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (error) {
    console.error("[orgs/following loadFollowerCount]", error);
    return null;
  }
  return typeof count === "number" && Number.isFinite(count) ? count : null;
}

/** What a feed row or list needs to name a club. `logo_url` is the raw stored value. */
export type OrgCard = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
  is_public: boolean;
};

/**
 * Cards for the clubs in `orgIds` that are NOT hidden, keyed by id. A hidden
 * or deleted club is simply absent from the map, so a caller can't tell the
 * two apart and can't leak which one it was. `hidden_at` is filtered in the
 * query and never selected. `logo_url` comes back raw: callers proxy it with
 * `orgAssetProxyUrl`.
 */
export async function loadVisibleOrgCards(
  service: SupabaseClient,
  orgIds: string[],
): Promise<{ ok: true; byId: Map<string, OrgCard> } | { ok: false; error: unknown }> {
  const ids = Array.from(new Set(orgIds.filter((id) => isUuid(id))));
  const byId = new Map<string, OrgCard>();
  if (ids.length === 0) return { ok: true, byId };
  const { data, error } = await service
    .from("orgs")
    .select("id,handle,name,logo_url,verified,is_public")
    .in("id", ids)
    .is("hidden_at", null);
  if (error) {
    console.error("[orgs/following loadVisibleOrgCards]", error);
    return { ok: false, error };
  }
  for (const row of data ?? []) {
    const r = row as OrgCard;
    byId.set(r.id, {
      id: r.id,
      handle: r.handle,
      name: r.name,
      logo_url: r.logo_url ?? null,
      verified: r.verified === true,
      is_public: r.is_public === true,
    });
  }
  return { ok: true, byId };
}
