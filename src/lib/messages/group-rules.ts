/**
 * The rules for who may join a group chat, shared by group create
 * (POST /api/me/threads) and group add (POST /api/me/threads/[id]/members)
 * so the two can't drift (S67 security wave 2, batch A2; report Lows "group
 * add skips blocks and the 50 cap").
 *
 * Pure: no imports, so `node --test` loads it directly. The routes read the
 * facts (with the service client, see loadGroupBlockConflict in
 * src/lib/safety/pair-block.ts) and turn the decision into a response.
 *
 * The copy never names a block or who is in it (waveA-build.md product call
 * 6): the person adding is a third party and must not learn who blocked whom.
 */

/** Everyone in the chat, the creator included. */
export const MAX_GROUP_MEMBERS = 50;

/** Adding one person who has a block with anyone already in the chat. */
export const GROUP_ADD_REFUSED = "You can't add this person to this chat.";

/** Starting a group where two of the people picked have a block between them. */
export const GROUP_CREATE_REFUSED = "You can't add one of these people to this chat.";

/** The chat already holds MAX_GROUP_MEMBERS people. */
export const GROUP_FULL = `This chat is full (${MAX_GROUP_MEMBERS} people).`;

export type GroupAddFacts = {
  /** How many people are in the chat now, the adder included. */
  memberCount: number;
  /** The person being added is already in it. */
  targetIsMember: boolean;
  /** The person being added has a block, either way, with someone in it. */
  blocked: boolean;
};

export type GroupAddDecision =
  | { kind: "already" }
  | { kind: "full" }
  | { kind: "refused" }
  | { kind: "add" };

/**
 * What happens to one add, in this order:
 *   1. already in the chat → "already" (the route's idempotent answer, even
 *      when the chat is full: nobody new comes in);
 *   2. the chat has MAX_GROUP_MEMBERS or more → "full". Before the block
 *      answer, so a full chat says only that;
 *   3. a block with anyone in the chat → "refused";
 *   4. otherwise "add".
 * A count that isn't a finite number is treated as full: fail closed.
 */
export function groupAddDecision(facts: GroupAddFacts): GroupAddDecision {
  if (facts.targetIsMember) return { kind: "already" };
  const n = facts.memberCount;
  if (!Number.isFinite(n) || n >= MAX_GROUP_MEMBERS) return { kind: "full" };
  if (facts.blocked) return { kind: "refused" };
  return { kind: "add" };
}

/** May a new group hold the creator plus these invitees? (Counts the creator.) */
export function groupSizeAllowed(inviteeCount: number): boolean {
  return Number.isFinite(inviteeCount) && inviteeCount >= 0 && inviteeCount + 1 <= MAX_GROUP_MEMBERS;
}
