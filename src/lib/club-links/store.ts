import "server-only";

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  generateClubLinkCode,
  MEMBERS_LINK_MAX_SIGNUPS,
  MEMBERS_LINK_TTL_DAYS,
  normalizeClubLinkCode,
  SETUP_LINK_TTL_DAYS,
  type ClubLinkKind,
} from "./code";

/**
 * The database side of club links (the club's view, wave 1;
 * supabase/migrations/20261021110000_club_links.sql). SERVICE ROLE, ALWAYS:
 * both tables are service-role only, so every function takes a
 * `createSupabaseServiceClient()`. Nothing here authorises; the routes and
 * pages decide who may ask.
 */

const DAY_MS = 86_400_000;

/** SHA-256 hex of `club:` and the normalised code: `public.club_link_hash`. */
export function hashClubLinkCode(normalized: string): string {
  return createHash("sha256").update(`club:${normalized}`, "utf8").digest("hex");
}

export type ClubLinkRow = {
  id: string;
  kind: ClubLinkKind;
  org_id: string | null;
  club_name: string | null;
  club_handle: string | null;
  checked: boolean;
  max_signups: number;
  expires_at: string;
  off_at: string | null;
  used_at: string | null;
  used_by: string | null;
  created_by: string | null;
  created_at: string;
};

const LINK_COLUMNS =
  "id, kind, org_id, club_name, club_handle, checked, max_signups, expires_at, off_at, used_at, used_by, created_by, created_at";

/** Where a link stands, as the landing page tells it. */
export type ClubLinkState = "live" | "used" | "expired" | "off";

export function clubLinkState(link: Pick<ClubLinkRow, "kind" | "expires_at" | "off_at" | "used_at">, now = Date.now()): ClubLinkState {
  if (link.off_at) return "off";
  if (link.kind === "setup" && link.used_at) return "used";
  if (Date.parse(link.expires_at) <= now) return "expired";
  return "live";
}

/** The link a code opens, or null (not a code, or no such link). */
export async function findClubLinkByCode(
  service: SupabaseClient,
  rawCode: unknown,
): Promise<ClubLinkRow | null> {
  const code = normalizeClubLinkCode(rawCode);
  if (!code) return null;
  const { data, error } = await service
    .from("club_links")
    .select(LINK_COLUMNS)
    .eq("code_hash", hashClubLinkCode(code))
    .maybeSingle();
  if (error) {
    console.error("[club-links] find by code", error.message);
    return null;
  }
  return (data as ClubLinkRow | null) ?? null;
}

export async function findClubLinkById(service: SupabaseClient, id: string): Promise<ClubLinkRow | null> {
  const { data, error } = await service.from("club_links").select(LINK_COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    console.error("[club-links] find by id", error.message);
    return null;
  }
  return (data as ClubLinkRow | null) ?? null;
}

/** Is a handle free for a new setup link: no club has it and no live setup link holds it? */
export async function clubHandleFree(service: SupabaseClient, handle: string): Promise<boolean> {
  const [{ data: org }, { data: held }] = await Promise.all([
    service.from("orgs").select("id").eq("handle", handle).maybeSingle(),
    service
      .from("club_links")
      .select("id")
      .eq("kind", "setup")
      .eq("club_handle", handle)
      .is("used_at", null)
      .is("off_at", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1),
  ]);
  return !org && !(held && held.length > 0);
}

/**
 * A new setup link. Returns the code (shown once: only its hash is kept) and
 * the row. Retries a clash on the hash, which 80 random bits make theoretical.
 */
export async function createSetupLink(
  service: SupabaseClient,
  input: { name: string; handle: string; checked: boolean; actorId: string },
): Promise<{ ok: true; code: string; link: ClubLinkRow } | { ok: false; reason: "failed" }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateClubLinkCode();
    const { data, error } = await service
      .from("club_links")
      .insert({
        kind: "setup",
        code_hash: hashClubLinkCode(code),
        club_name: input.name,
        club_handle: input.handle,
        checked: input.checked,
        max_signups: 1,
        expires_at: new Date(Date.now() + SETUP_LINK_TTL_DAYS * DAY_MS).toISOString(),
        created_by: input.actorId,
      })
      .select(LINK_COLUMNS)
      .single();
    if (!error && data) return { ok: true, code, link: data as ClubLinkRow };
    if (error?.code !== "23505") {
      console.error("[club-links] create setup link", error?.message);
      return { ok: false, reason: "failed" };
    }
  }
  return { ok: false, reason: "failed" };
}

export type SetupLinkListItem = ClubLinkRow & { club: { handle: string; name: string } | null };

/** The founders' list in Admin › Clubs: newest first. */
export async function listSetupLinks(service: SupabaseClient, limit = 100): Promise<SetupLinkListItem[]> {
  const { data, error } = await service
    .from("club_links")
    .select(`${LINK_COLUMNS}, club:orgs(handle, name)`)
    .eq("kind", "setup")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[club-links] list setup links", error.message);
    return [];
  }
  return (data ?? []) as unknown as SetupLinkListItem[];
}

/** Cancel a setup link that hasn't made its club. False when there is nothing to cancel. */
export async function cancelSetupLink(service: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await service
    .from("club_links")
    .update({ off_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("kind", "setup")
    .is("used_at", null)
    .is("off_at", null)
    .select("id");
  if (error) {
    console.error("[club-links] cancel setup link", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

export type MembersLink = {
  id: string;
  code: string;
  expires_at: string;
  off_at: string | null;
  max_signups: number;
  /** People who signed up through it (the cap counts these). */
  signups: number;
  /** People who joined the club through it (all officers see). */
  joined: number;
};

async function membersLinkCounts(service: SupabaseClient, linkId: string): Promise<{ signups: number; joined: number }> {
  const [s, j] = await Promise.all([
    service.from("club_link_uses").select("id", { count: "exact", head: true }).eq("link_id", linkId).not("claimed_at", "is", null),
    service.from("club_link_uses").select("id", { count: "exact", head: true }).eq("link_id", linkId).not("joined_at", "is", null),
  ]);
  return { signups: s.count ?? 0, joined: j.count ?? 0 };
}

/** A club's members' link, or null when it has none yet. */
export async function getMembersLink(service: SupabaseClient, orgId: string): Promise<MembersLink | null> {
  const { data, error } = await service
    .from("club_links")
    .select("id, code, expires_at, off_at, max_signups")
    .eq("kind", "members")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) {
    console.error("[club-links] get members link", error.message);
    return null;
  }
  if (!data || typeof data.code !== "string") return null;
  return { ...(data as Omit<MembersLink, "signups" | "joined">), ...(await membersLinkCounts(service, data.id)) };
}

/** The club's members' link, made now if it has none (3 weeks, 150 sign-ups). */
export async function getOrCreateMembersLink(
  service: SupabaseClient,
  orgId: string,
  actorId: string,
): Promise<MembersLink | null> {
  const existing = await getMembersLink(service, orgId);
  if (existing) return existing;
  const code = generateClubLinkCode();
  const { error } = await service.from("club_links").insert({
    kind: "members",
    code_hash: hashClubLinkCode(code),
    code,
    org_id: orgId,
    max_signups: MEMBERS_LINK_MAX_SIGNUPS,
    expires_at: new Date(Date.now() + MEMBERS_LINK_TTL_DAYS * DAY_MS).toISOString(),
    created_by: actorId,
  });
  // 23505: another officer made it a moment ago (one per club); read theirs.
  if (error && error.code !== "23505") {
    console.error("[club-links] create members link", error.message);
    return null;
  }
  return getMembersLink(service, orgId);
}

/**
 * A new code for a club's members' link (the old one leaked, or went
 * somewhere it shouldn't): the old link stops working at once; the end date,
 * the 150 and the count of who joined stay with the club, and it is on.
 */
export async function renewMembersLinkCode(service: SupabaseClient, orgId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateClubLinkCode();
    const { data, error } = await service
      .from("club_links")
      .update({ code, code_hash: hashClubLinkCode(code), off_at: null, updated_at: new Date().toISOString() })
      .eq("kind", "members")
      .eq("org_id", orgId)
      .select("id");
    if (!error) return (data ?? []).length > 0;
    if (error.code !== "23505") {
      console.error("[club-links] renew members link", error.message);
      return false;
    }
  }
  return false;
}

/** Turn a club's members' link off or back on. */
export async function setMembersLinkOff(service: SupabaseClient, orgId: string, off: boolean): Promise<boolean> {
  const { data, error } = await service
    .from("club_links")
    .update({ off_at: off ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("kind", "members")
    .eq("org_id", orgId)
    .select("id");
  if (error) {
    console.error("[club-links] members link off/on", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

export type PendingClubLink =
  | { kind: "setup"; linkId: string }
  | { kind: "members"; linkId: string; orgId: string };

/**
 * The link waiting for an account (the place its address claimed at sign-up,
 * now tied to it), or null. Never throws.
 */
export async function pendingClubLink(service: SupabaseClient, userId: string): Promise<PendingClubLink | null> {
  const { data, error } = await service.rpc("club_link_pending", { p_user: userId });
  if (error) {
    console.error("[club-links] pending", error.message);
    return null;
  }
  const v = data as { kind?: unknown; link_id?: unknown; org_id?: unknown } | null;
  if (!v || typeof v.link_id !== "string") return null;
  if (v.kind === "setup") return { kind: "setup", linkId: v.link_id };
  if (v.kind === "members" && typeof v.org_id === "string") return { kind: "members", linkId: v.link_id, orgId: v.org_id };
  return null;
}

export type RedeemSetupResult =
  | { ok: true; handle: string; orgId: string; already: boolean }
  | { ok: false; reason: "invalid" | "used" | "off" | "expired" | "in_use" | "handle_taken" | "failed" };

/** A setup link makes its club for the account (club_link_redeem_setup). */
export async function redeemSetupLink(
  service: SupabaseClient,
  input: { linkId: string; userId: string; campusId: string; school: string },
): Promise<RedeemSetupResult> {
  const { data, error } = await service.rpc("club_link_redeem_setup", {
    p_link: input.linkId,
    p_user: input.userId,
    p_campus: input.campusId,
    p_school: input.school,
  });
  if (error) {
    console.error("[club-links] redeem setup", error.message);
    return { ok: false, reason: "failed" };
  }
  const v = data as { ok?: unknown; reason?: unknown; handle?: unknown; org_id?: unknown; already?: unknown } | null;
  if (v?.ok === true && typeof v.handle === "string" && typeof v.org_id === "string") {
    return { ok: true, handle: v.handle, orgId: v.org_id, already: v.already === true };
  }
  const reason = typeof v?.reason === "string" ? v.reason : "failed";
  const known = ["invalid", "used", "off", "expired", "in_use", "handle_taken"] as const;
  return { ok: false, reason: (known as readonly string[]).includes(reason) ? (reason as (typeof known)[number]) : "failed" };
}

/** Record that the account joined the club through a members' link. Best effort. */
export async function recordMembersLinkJoin(service: SupabaseClient, linkId: string, userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("club_link_uses")
    .update({ joined_at: now })
    .eq("link_id", linkId)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    console.error("[club-links] record join", error.message);
    return;
  }
  if ((data ?? []).length > 0) return;
  const { error: insErr } = await service.from("club_link_uses").insert({ link_id: linkId, user_id: userId, joined_at: now });
  if (insErr && insErr.code !== "23505") console.error("[club-links] record join (insert)", insErr.message);
}

/** "Not now" on a members' link's join question. Best effort. */
export async function dismissMembersLink(service: SupabaseClient, linkId: string, userId: string): Promise<void> {
  const { error } = await service
    .from("club_link_uses")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("link_id", linkId)
    .eq("user_id", userId);
  if (error) console.error("[club-links] dismiss", error.message);
}
