import type { SupabaseClient } from "@supabase/supabase-js";

import { OFFICER_ROLES } from "./join-state";

/**
 * Blocks between one student and the people who speak for a club (S67
 * security wave 2 #15). Moved here from the private `isBlockedWithOrg` in
 * `api/orgs/[slug]/invites/route.ts` so join, request approval and invites
 * ask the same question the same way.
 *
 * THE ORG SIDE is the owner (`orgs.owner_id`) plus every member whose role is
 * in {@link OFFICER_ROLES} (owner, admin).
 *
 * ONE-DIRECTIONAL FOR GETTING IN (waveA-build product call 9):
 *   - an officer blocked the student → they can't join, request, accept an
 *     invite or be approved ("You can't join this club right now.");
 *   - the student blocked an officer → they may still join or request (a
 *     victim is never locked out because their harasser is an officer), and
 *     their request is hidden from that officer (the requests list reads
 *     `loadHiddenUsers`, not this file).
 *
 * INVITES (ruling 14, `loadInviteBlocks`): the same one direction for the
 * club, plus the SENDER either way. A person who blocked the owner or another
 * officer can still be invited by an officer they haven't blocked.
 *
 * SERVICE ROLE. The officer list of a hidden or private club is not readable
 * under the caller's RLS, and the answer must not depend on who is asking.
 * Every reader FAILS CLOSED: a read error is `{ ok: false }` / `"error"`, and
 * callers answer 500, never "not blocked".
 *
 * No `server-only` and no `@/` imports, so `org-blocks.test.ts` loads it with
 * a small resolve hook (for the extensionless `./join-state`).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Strict RFC-4122 UUID check, the same as `isUuid` in `src/lib/pgrest.ts`. */
function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// ── Pure ────────────────────────────────────────────────────────────────────

/**
 * The org side as a clean id list: the owner plus every member whose role is
 * an officer role. Lower case, UUIDs only, no duplicates, and never the
 * person being asked about (an officer is not "blocked by the club").
 */
export function orgSideIds(
  ownerId: unknown,
  members: ReadonlyArray<{ user_id?: unknown; role?: unknown }>,
  personId: string,
): string[] {
  const person = personId.toLowerCase();
  const out = new Set<string>();
  const add = (id: unknown) => {
    if (!isUuid(id)) return;
    const lower = id.toLowerCase();
    if (lower !== person) out.add(lower);
  };
  add(ownerId);
  for (const m of members) {
    if (typeof m?.role === "string" && (OFFICER_ROLES as readonly string[]).includes(m.role)) {
      add(m.user_id);
    }
  }
  return Array.from(out);
}

export type OrgBlocks = {
  /** Somebody on the org side blocked this person: keep them out. */
  blockedByOfficer: boolean;
  /** The org-side people this person blocked (they may still join). */
  personBlocked: string[];
};

/**
 * Fold the two block reads into the answer. `theyBlocked` = `blocked_id`s of
 * rows where the person is the blocker; `blockedThem` = `blocker_id`s of rows
 * where the person is the one blocked. Only ids on the org side count, so a
 * stray row from a wider read never moves the answer.
 */
export function summarizeOrgBlocks(
  orgSide: readonly string[],
  theyBlocked: readonly unknown[],
  blockedThem: readonly unknown[],
): OrgBlocks {
  const side = new Set(orgSide.map((id) => id.toLowerCase()));
  const onSide = (id: unknown) => typeof id === "string" && side.has(id.toLowerCase());
  const personBlocked = new Set<string>();
  for (const id of theyBlocked) if (onSide(id)) personBlocked.add((id as string).toLowerCase());
  return {
    blockedByOfficer: blockedThem.some(onSide),
    personBlocked: Array.from(personBlocked),
  };
}

// ── Reads (service role) ────────────────────────────────────────────────────

export type OrgSideResult = { ok: true; ids: string[] } | { ok: false; error: unknown };

/** The org side of one club, minus `personId`. */
export async function loadOrgSideIds(
  service: SupabaseClient,
  orgId: string,
  personId: string,
): Promise<OrgSideResult> {
  if (!isUuid(orgId) || !isUuid(personId)) return { ok: false, error: "bad id" };
  try {
    const [orgRes, membersRes] = await Promise.all([
      service.from("orgs").select("owner_id").eq("id", orgId).maybeSingle(),
      service
        .from("org_members")
        .select("user_id, role")
        .eq("org_id", orgId)
        .in("role", [...OFFICER_ROLES]),
    ]);
    if (orgRes.error || membersRes.error) {
      return { ok: false, error: orgRes.error ?? membersRes.error };
    }
    const ownerId = (orgRes.data as { owner_id?: unknown } | null)?.owner_id ?? null;
    const members = (membersRes.data ?? []) as Array<{ user_id?: unknown; role?: unknown }>;
    return { ok: true, ids: orgSideIds(ownerId, members, personId) };
  } catch (error) {
    return { ok: false, error };
  }
}

export type OrgBlocksResult = ({ ok: true } & OrgBlocks) | { ok: false; error: unknown };

/** The two block reads between one person and a list of ids, folded. */
async function readBlocksWithSide(
  service: SupabaseClient,
  personId: string,
  sideIds: readonly string[],
): Promise<OrgBlocksResult> {
  if (sideIds.length === 0) return { ok: true, blockedByOfficer: false, personBlocked: [] };
  try {
    const ids = [...sideIds];
    const [theyBlocked, blockedThem] = await Promise.all([
      service.from("blocks").select("blocked_id").eq("blocker_id", personId).in("blocked_id", ids),
      service.from("blocks").select("blocker_id").eq("blocked_id", personId).in("blocker_id", ids),
    ]);
    if (theyBlocked.error || blockedThem.error) {
      return { ok: false, error: theyBlocked.error ?? blockedThem.error };
    }
    return {
      ok: true,
      ...summarizeOrgBlocks(
        sideIds,
        ((theyBlocked.data ?? []) as Array<{ blocked_id?: unknown }>).map((r) => r.blocked_id),
        ((blockedThem.data ?? []) as Array<{ blocker_id?: unknown }>).map((r) => r.blocker_id),
      ),
    };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Where this person stands, block-wise, with everyone who speaks for the club. */
export async function loadOrgBlocks(
  service: SupabaseClient,
  orgId: string,
  personId: string,
): Promise<OrgBlocksResult> {
  const side = await loadOrgSideIds(service, orgId, personId);
  if (!side.ok) return side;
  return readBlocksWithSide(service, personId, side.ids);
}

// ── Invites (waveA-build ruling 14) ─────────────────────────────────────────

/**
 * The people whose blocks an invite asks about: the org side plus the SENDER
 * (always, even if their role moved a moment ago), lower case, no duplicates,
 * never the invitee.
 */
export function inviteSideIds(
  orgSide: readonly string[],
  senderId: string,
  personId: string,
): string[] {
  const person = personId.toLowerCase();
  const out = new Set<string>();
  for (const id of [...orgSide, senderId]) {
    if (!isUuid(id)) continue;
    const lower = id.toLowerCase();
    if (lower !== person) out.add(lower);
  }
  return Array.from(out);
}

/**
 * RULING 14, as one question: may this officer invite this person, block-wise?
 * NO when the sender and the invitee are a block pair (either way), or when
 * ANY officer, owner included, blocked the invitee. The invitee's OWN block of
 * some other officer or of the owner does NOT refuse: a victim is never locked
 * out of an invite-only club by their harasser (product call 9). `blocks`
 * must have been read over a side that includes the sender
 * ({@link inviteSideIds}).
 */
export function inviteRefusedByBlocks(blocks: OrgBlocks, senderId: string): boolean {
  const sender = senderId.toLowerCase();
  return blocks.blockedByOfficer || blocks.personBlocked.includes(sender);
}

export type InviteBlocksResult = { ok: true; refused: boolean } | { ok: false; error: unknown };

/** {@link inviteRefusedByBlocks} with its reads (service role, fails closed). */
export async function loadInviteBlocks(
  service: SupabaseClient,
  orgId: string,
  senderId: string,
  personId: string,
): Promise<InviteBlocksResult> {
  if (!isUuid(senderId)) return { ok: false, error: "bad id" };
  const side = await loadOrgSideIds(service, orgId, personId);
  if (!side.ok) return side;
  const blocks = await readBlocksWithSide(service, personId, inviteSideIds(side.ids, senderId, personId));
  if (!blocks.ok) return blocks;
  return { ok: true, refused: inviteRefusedByBlocks(blocks, senderId) };
}

/**
 * RULING 14 for a whole page of people at once: the invite picker
 * (`api/orgs/[slug]/invite-candidates`) hides exactly the people an invite
 * from this sender would refuse, no more and no fewer. Hiding MORE would be a
 * block oracle (someone missing from the picker whom a direct POST still
 * invites) and would keep a victim out of reach in the app; hiding fewer
 * would offer a tap that 404s.
 *
 * `blockerSide` is the org side plus the sender (owner, admin, sender).
 * `rows` are block rows `{blocker_id, blocked_id}`; a person is refused when
 *   - they blocked the SENDER (their block of the owner or another officer
 *     does not count), or
 *   - anyone in `blockerSide` blocked them.
 * Any other row (a candidate's block of the owner, blocks between two
 * candidates) never counts, so a wider read can't widen the answer. The
 * sender is never in the result. Lower-case ids.
 */
export function inviteRefusedIds(
  senderId: string,
  blockerSide: readonly string[],
  rows: ReadonlyArray<{ blocker_id?: unknown; blocked_id?: unknown }>,
): Set<string> {
  const out = new Set<string>();
  if (!isUuid(senderId)) return out;
  const sender = senderId.toLowerCase();
  const side = new Set<string>([sender]);
  for (const id of blockerSide) if (isUuid(id)) side.add(id.toLowerCase());
  for (const row of rows) {
    const rawBlocker = row?.blocker_id;
    const rawBlocked = row?.blocked_id;
    if (!isUuid(rawBlocker) || !isUuid(rawBlocked)) continue;
    const blocker = rawBlocker.toLowerCase();
    const blocked = rawBlocked.toLowerCase();
    if (blocker === blocked) continue;
    if (blocked === sender) out.add(blocker);
    if (side.has(blocker)) out.add(blocked);
  }
  out.delete(sender);
  return out;
}

/**
 * Is there a block, in EITHER direction, between this person and any of the
 * given ids? Moved here verbatim from the invite route (critic A7). Since
 * ruling 14 the invite route asks {@link loadInviteBlocks} instead (the owner
 * is no longer asked either way); the request approve/deny route still asks
 * this about the one officer acting. `"error"` on a failed read: the caller
 * answers 500, never "not blocked".
 */
export async function isBlockedWithOrg(
  service: SupabaseClient,
  personId: string,
  orgSideIds: Array<string | null>,
): Promise<boolean | "error"> {
  const others = orgSideIds.filter((id): id is string => isUuid(id) && id !== personId);
  if (others.length === 0) return false;
  const [theyBlocked, blockedThem] = await Promise.all([
    service.from("blocks").select("blocked_id").eq("blocker_id", personId).in("blocked_id", others),
    service.from("blocks").select("blocker_id").eq("blocked_id", personId).in("blocker_id", others),
  ]);
  if (theyBlocked.error || blockedThem.error) {
    console.error("[orgs/org-blocks isBlockedWithOrg]", theyBlocked.error ?? blockedThem.error);
    return "error";
  }
  return (theyBlocked.data?.length ?? 0) > 0 || (blockedThem.data?.length ?? 0) > 0;
}
