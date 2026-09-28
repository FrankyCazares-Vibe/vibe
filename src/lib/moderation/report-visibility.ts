/**
 * Reporting works across a block (S67 security wave 2, A2; waveA-build.md
 * product call 5 "Reports keep working across a block").
 *
 * /api/me/reports reads the reported post or comment through the reporter's
 * own client, so RLS answers "may this student see it". Since
 * 20260928120000_blocks_in_rls.sql that answer also says no to a block pair,
 * in either direction. Left alone, a harasser who blocks their victim first
 * would make every post and comment of theirs unreportable by the victim. So
 * when the reporter's read comes back empty, the route re-reads the row with
 * the service role and asks this module: judged by the rules as they were
 * BEFORE blocks were added (deleted, draft, removed by a moderator, restricted
 * author, hidden club), and only when a block with the reporter is a possible
 * reason it was hidden, may this report go ahead?
 *
 * Pure: no imports, so `node --test` loads it directly. The route reads the
 * facts; this decides.
 */

/** A post as the service role read it, plus the two facts the route looks up. */
export type PostFacts = {
  /** The post's author. */
  userId: string;
  status: string | null;
  removedAt: string | null;
  /** The author has no suspension or ban in force (public.user_visible). */
  authorVisible: boolean;
  /** No club, or the club's content is visible to the reporter (org_content_visible). */
  clubAllowed: boolean;
};

/** A comment as the service role read it, and its post (null when that is gone). */
export type CommentFacts = {
  /** The comment's author. */
  userId: string;
  removedAt: string | null;
  authorVisible: boolean;
  post: PostFacts | null;
};

export type ReportTargetFacts =
  | { kind: "post"; post: PostFacts }
  | { kind: "comment"; comment: CommentFacts };

/**
 * posts_select_authenticated WITHOUT its block clause: your own post always;
 * anyone else's only when published, not removed, by a visible author, and
 * not in a club hidden from you.
 */
export function postVisibleIgnoringBlocks(viewerId: string, post: PostFacts): boolean {
  if (sameId(post.userId, viewerId)) return true;
  return (
    post.status === "published" &&
    post.removedAt === null &&
    post.authorVisible &&
    post.clubAllowed
  );
}

/**
 * post_comments_select_authenticated WITHOUT its block clauses: your own
 * comment always; anyone else's only when not removed, by a visible author,
 * on a post you could read by the rule above.
 */
export function commentVisibleIgnoringBlocks(viewerId: string, comment: CommentFacts): boolean {
  if (sameId(comment.userId, viewerId)) return true;
  if (comment.removedAt !== null || !comment.authorVisible) return false;
  return comment.post !== null && postVisibleIgnoringBlocks(viewerId, comment.post);
}

/**
 * The people whose block with the reporter could be why the reporter's own
 * read came back empty: a post's author; a comment's author and its post's
 * author. Distinct, lower case, never the reporter. The route asks
 * loadPairBlock about exactly these, with the reporter's own client.
 */
export function blockSuspects(viewerId: string, facts: ReportTargetFacts): string[] {
  const ids =
    facts.kind === "post"
      ? [facts.post.userId]
      : [facts.comment.userId, ...(facts.comment.post ? [facts.comment.post.userId] : [])];
  const me = viewerId.toLowerCase();
  const out: string[] = [];
  for (const id of ids) {
    const low = id.toLowerCase();
    if (low && low !== me && !out.includes(low)) out.push(low);
  }
  return out;
}

/**
 * The verdict once the reporter's own read was empty.
 *   - "allow": someone in blockSuspects is in a block pair with the reporter
 *     (`blockedWithViewer`, either direction), AND the thing passes the
 *     no-blocks rule above. The block is why it was hidden; the report goes on.
 *   - "not_found": otherwise. Nobody in a block pair with the reporter means
 *     the empty read had another reason (deleted, draft, removed, restricted,
 *     hidden club, or product call 5's comment rule between two OTHER people),
 *     and that answer stands.
 */
export function crossBlockReportVerdict(
  viewerId: string,
  facts: ReportTargetFacts,
  blockedWithViewer: ReadonlySet<string>,
): "allow" | "not_found" {
  const blocked = new Set(Array.from(blockedWithViewer, (id) => id.toLowerCase()));
  const suspectBlocked = blockSuspects(viewerId, facts).some((id) => blocked.has(id));
  if (!suspectBlocked) return "not_found";
  const visible =
    facts.kind === "post"
      ? postVisibleIgnoringBlocks(viewerId, facts.post)
      : commentVisibleIgnoringBlocks(viewerId, facts.comment);
  return visible ? "allow" : "not_found";
}

function sameId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
