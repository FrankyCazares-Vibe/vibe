/**
 * Who may read a club's Announcement Board, as the club page and the club GET
 * ask it (club model, Franky's calls of Oct 16; wave-2 repair, findings 15
 * and 16). One module, so the page and `GET /api/orgs/[slug]` can't drift.
 *
 * A MEMBER OR FOLLOWER: `can_view_org_channel` asked once on the viewer's own
 * client: the database's rule, never re-coded, so a follower an officer
 * removed or blocked, an unverified one, or one whose club turned reading
 * off all get the same false.
 *
 * SOMEONE WHO DOESN'T FOLLOW: the database can't be asked (its rule starts
 * from the follow row), so `followerArmHolds` checks, with the service role,
 * the conditions of its follower arm (20261017110000). `FOLLOWER_ARM_SQL`
 * names each one, and board-facts.test.ts reads the newest migration that
 * restates the function and fails when the two lists differ.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { loadOrgBlocks } from "@/lib/orgs/org-blocks";

export type BoardFacts = {
  boardId: string | null;
  /** The database's answer for a member or follower; null when not asked or unknown. */
  boardReadable: boolean | null;
  /** For a signed-in viewer who doesn't follow: would following let them read it? */
  followWouldRead: boolean;
  /** Everything holds but their school email: "Verify … to read" (bars stay unsaid). */
  verifyToRead: boolean;
  /**
   * The club's own switch (`orgs.followers_read_board`), null when unknown
   * and for anyone but a member. Members and officers only (the leave line,
   * the officers' row): never next to a card that isn't there.
   */
  readersOn: boolean | null;
};

export const NO_BOARD: BoardFacts = Object.freeze({ boardId: null, boardReadable: null, followWouldRead: false, verifyToRead: false, readersOn: null });

/** The follower arm's facts about one club and one viewer. */
export type FollowerArmFacts = {
  board: boolean;
  boardPrivate: unknown;
  verified: boolean;
  hidden: boolean;
  switchOn: boolean;
  barred: boolean;
  removed: boolean;
  blockedByOfficer: boolean;
};

/** The SQL each `FollowerArmFacts` field mirrors, in `can_view_org_channel`'s follower arm. */
export const FOLLOWER_ARM_SQL: Readonly<Record<keyof FollowerArmFacts, string>> = Object.freeze({
  board: "c.kind IS DISTINCT FROM 'board'",
  boardPrivate: "c.is_private IS DISTINCT FROM false",
  verified: "AND u.school_verified",
  hidden: "AND o.hidden_at IS NULL",
  switchOn: "AND o.followers_read_board",
  barred: "AND NOT EXISTS (SELECT 1 FROM public.org_board_bars",
  removed: "AND NOT EXISTS (SELECT 1 FROM public.org_removals",
  blockedByOfficer: "AND NOT EXISTS (SELECT 1 FROM public.blocks",
});

/** True when following would let this viewer read the Board (the SQL arm, in TS). */
export function followerArmHolds(f: FollowerArmFacts): boolean {
  return f.board && f.boardPrivate === false && f.verified && !f.hidden && f.switchOn && !f.barred && !f.removed && !f.blockedByOfficer;
}

/**
 * The club's Board id (service role), then `can_view_org_channel` on the
 * VIEWER's client. False when the club has no Board (or this database has no
 * rooms); null when a read failed, so a screen shows nothing rather than a
 * wrong card.
 */
export async function loadBoardReadable(
  supabase: SupabaseClient,
  service: SupabaseClient,
  orgId: string,
  userId: string,
  tag = "orgs/[slug] GET",
): Promise<boolean | null> {
  const { data, error } = await service.from("channels").select("id").eq("org_id", orgId).eq("kind", "board").limit(1).maybeSingle();
  if (error) {
    if (isMissingColumnError(error, ["kind"])) return false;
    console.error(`[${tag} board]`, error.code, error.message);
    return null;
  }
  const boardId = (data as { id?: unknown } | null)?.id;
  if (typeof boardId !== "string") return false;
  const { data: may, error: rpcError } = await supabase.rpc("can_view_org_channel", { cid: boardId, uid: userId });
  if (rpcError) {
    console.error(`[${tag} board_readable]`, rpcError.code, rpcError.message);
    return null;
  }
  return may === true;
}

/**
 * What the club page's Board card needs. Every doubt answers "no card".
 * Signed out there is no card at all: signing in comes first, and a private
 * window must not show a card the same student, barred, doesn't get.
 */
export async function loadBoardFacts(
  service: SupabaseClient,
  supabase: SupabaseClient,
  a: { orgId: string; hidden: boolean; viewerId: string | null; isMember: boolean; following: boolean; removed: boolean },
): Promise<BoardFacts> {
  const [boardRes, settingRes] = await Promise.all([
    service.from("channels").select("id, is_private").eq("org_id", a.orgId).eq("kind", "board").limit(1).maybeSingle(),
    service.from("orgs").select("followers_read_board").eq("id", a.orgId).maybeSingle(),
  ]);
  if (boardRes.error) {
    console.error("[orgs/[handle] page board]", boardRes.error.code, boardRes.error.message);
    return NO_BOARD;
  }
  const board = boardRes.data as { id?: unknown; is_private?: unknown } | null;
  if (typeof board?.id !== "string") return NO_BOARD;
  const boardId = board.id;
  if (!a.viewerId) return { ...NO_BOARD, boardId };
  // A database without the switch yet reads as off: no promise to follow.
  const setting = settingRes.error ? null : (settingRes.data as { followers_read_board?: unknown } | null)?.followers_read_board;
  const switchOn = setting === true;

  let boardReadable: boolean | null = null;
  if (a.isMember || a.following) {
    const { data, error } = await supabase.rpc("can_view_org_channel", { cid: boardId, uid: a.viewerId });
    if (error) console.error("[orgs/[handle] page board_readable]", error.code, error.message);
    boardReadable = error ? null : data === true;
    // A member, or a follower the database answered: nothing more to say.
    if (a.isMember) return { ...NO_BOARD, boardId, boardReadable, readersOn: typeof setting === "boolean" ? setting : null };
    if (boardReadable !== false) return { ...NO_BOARD, boardId, boardReadable };
  }

  if (!switchOn || a.hidden || board.is_private !== false || a.removed) return { ...NO_BOARD, boardId, boardReadable };
  const [userRes, barRes, blocks] = await Promise.all([
    service.from("users").select("school_verified").eq("id", a.viewerId).maybeSingle(),
    service.from("org_board_bars").select("user_id").eq("org_id", a.orgId).eq("user_id", a.viewerId).maybeSingle(),
    loadOrgBlocks(service, a.orgId, a.viewerId),
  ]);
  if (userRes.error || barRes.error || !blocks.ok) {
    console.error("[orgs/[handle] page board eligibility]", userRes.error ?? barRes.error ?? (blocks.ok ? null : blocks.error));
    return { ...NO_BOARD, boardId, boardReadable };
  }
  const facts: FollowerArmFacts = {
    board: true,
    boardPrivate: board.is_private,
    verified: (userRes.data as { school_verified?: unknown } | null)?.school_verified === true,
    hidden: a.hidden,
    switchOn,
    barred: !!barRes.data,
    removed: a.removed,
    blockedByOfficer: blocks.blockedByOfficer,
  };
  return {
    boardId,
    boardReadable,
    followWouldRead: !a.following && followerArmHolds(facts),
    verifyToRead: !facts.verified && followerArmHolds({ ...facts, verified: true }),
    readersOn: null,
  };
}
