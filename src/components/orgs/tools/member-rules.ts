/**
 * Who may do what to whom in Club tools (the club's view, wave 2, C10).
 * The members route's rules (`api/orgs/[slug]/members/[userId]/route.ts`),
 * restated so a button only shows when the route would say yes. The route
 * still decides: a race (the owner changed someone's role meanwhile) comes
 * back as a 409 and the list is read again.
 *
 *   - Titles: the owner titles anyone, themselves included; an officer
 *     titles members and themselves (`patchTitle`'s reach).
 *   - Roles: the owner alone makes a member an officer or an officer a
 *     member again, never on the owner's row (Franky, Oct 20).
 *   - Remove: the owner removes officers and members; an officer removes
 *     members only; nobody removes the owner, or themselves (leaving is
 *     Club settings' Leave, a different route).
 *
 * PURE ON PURPOSE: type imports only, so `member-rules.test.ts` loads it
 * under plain `node --test`.
 */
import type { IneligibleReason, MemberRow } from "./types";

export type ViewerRole = "owner" | "admin";
export type Viewer = { role: ViewerRole; selfId: string };
type Target = Pick<MemberRow, "user_id" | "role">;

export type MemberAction = "title" | "make_officer" | "make_member" | "remove";

export function mayTitle(viewer: Viewer, m: Target): boolean {
  if (!isKnownRole(m.role)) return false;
  if (viewer.role === "owner") return true;
  return m.role === "member" || m.user_id === viewer.selfId;
}

export function mayChangeRole(viewer: Viewer, m: Target): boolean {
  return viewer.role === "owner" && (m.role === "admin" || m.role === "member");
}

export function mayRemove(viewer: Viewer, m: Target): boolean {
  if (m.user_id === viewer.selfId) return false;
  if (m.role === "member") return true;
  return m.role === "admin" && viewer.role === "owner";
}

/** The action sheet's rows for one member, in order. Empty: the row opens nothing. */
export function memberActions(viewer: Viewer, m: Target): MemberAction[] {
  const out: MemberAction[] = [];
  if (mayTitle(viewer, m)) out.push("title");
  if (mayChangeRole(viewer, m)) out.push(m.role === "admin" ? "make_member" : "make_officer");
  if (mayRemove(viewer, m)) out.push("remove");
  return out;
}

function isKnownRole(role: string): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

/** The role as the club says it. The stored `admin` is an Officer. */
export function roleWord(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Officer";
  return "Member";
}

const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, member: 2 };

/** The route's order: the owner, officers, members; each by when they joined. */
export function sortMembers<T extends Pick<MemberRow, "role" | "joined_at">>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ra = ROLE_RANK[a.role] ?? 99;
    const rb = ROLE_RANK[b.role] ?? 99;
    if (ra !== rb) return ra - rb;
    return (a.joined_at || "").localeCompare(b.joined_at || "");
  });
}

/** The filter box: name, @handle or title, any case; a leading @ is ignored. */
export function filterMembers<T extends Pick<MemberRow, "name" | "handle" | "title">>(
  rows: readonly T[],
  query: string,
): T[] {
  const q = query.trim().replace(/^@/, "").toLowerCase();
  if (!q) return [...rows];
  return rows.filter((m) =>
    [m.name, m.handle, m.title].some((v) => typeof v === "string" && v.toLowerCase().includes(q)),
  );
}

/** One row changed in place (a new role or title), the list kept in the route's order. */
export function withMember<T extends MemberRow>(rows: readonly T[], userId: string, patch: Partial<MemberRow>): T[] {
  return sortMembers(rows.map((m) => (m.user_id === userId ? { ...m, ...patch } : m)));
}

/** Why a request can't be approved, in the desktop's words (`REQUEST_INELIGIBLE_LABEL`). */
export function ineligibleLine(reason: IneligibleReason | null | undefined): string {
  if (reason === "audience_iu") return "Not eligible (Purdue student)";
  if (reason === "audience_purdue") return "Not eligible (IU student)";
  return "Not eligible (no verified school email)";
}

/** What a refused change does to the list: the row goes, the list is read again, or it stays. */
export type AfterRefusal = "drop" | "reload" | "keep";

/**
 * A refused PATCH or DELETE on a member: the line to show and what then.
 * 404 they already left; 409 their role moved, so the list is read again;
 * 429 is the officer budget. Anything else keeps the mapped line.
 */
export function memberRefusal(status: number, message: string): { line: string; then: AfterRefusal } {
  if (status === 404) return { line: "They're no longer in the club.", then: "drop" };
  if (status === 409) return { line: "Their role just changed, so the list was updated. Try again.", then: "reload" };
  if (status === 429) return { line: "Too many club changes at once. Try again in a few minutes.", then: "keep" };
  if (status === 403) return { line: message, then: "reload" };
  return { line: message, then: "keep" };
}

/**
 * A refused approve or deny (`api/orgs/[slug]/requests/[id]`), by code. A
 * request that's gone or already answered leaves the list; an approve the
 * club or the student changed under re-reads it, so each row's eligibility
 * is current.
 */
export function requestRefusal(
  status: number,
  code: string | null,
  message: string,
): { line: string; then: AfterRefusal } {
  if (status === 429) return { line: "Too many tries. Try again in a minute.", then: "keep" };
  switch (code) {
    case "request_not_found":
      return { line: "That request is no longer open.", then: "drop" };
    case "request_not_pending":
      return { line: "Someone already answered that request.", then: "drop" };
    case "org_hidden":
      return { line: "This club is hidden, so nobody new can join it.", then: "reload" };
    case "approve_unavailable":
      return { line: "You can't approve this request right now.", then: "reload" };
    case "removed_needs_admin":
      return { line: "Only the owner or an officer can let back someone who was removed.", then: "reload" };
    case "officers_only":
      return { line: "Only the owner and officers can answer requests.", then: "keep" };
    case "school_unverified":
    case "audience_mismatch":
      return { line: message, then: "reload" };
    default:
      return { line: message, then: "keep" };
  }
}
