/**
 * Editing your own post: the text rules, the tag rule and the response shape,
 * shared by the edit route (`/api/posts/[id]` PATCH, batch E1), the phone
 * edit sheet (E2) and the desktop feed card (CH1). Plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §6 E0.
 *
 * PURE ON PURPOSE. No imports at all, so `edit.test.ts` loads it without a
 * bundler, and a server route, a client component and
 * `src/lib/composer/helpers.ts` can all import it.
 *
 * WHAT AN EDIT CAN CHANGE. Only a post's text, and the tags derived from that
 * text. The database enforces it too: migration
 * `20260916130000_post_edited_at.sql` leaves `authenticated` with UPDATE on
 * (content, tags, status) and nothing else, and its `posts_stamp_edited`
 * trigger sets `edited_at` whenever a PUBLISHED post's content changes. Clients
 * never send `edited_at` and never send tags; the route re-derives tags with
 * {@link extractPostTags}.
 *
 * NOT `edit_metadata`. That column holds video-post text overlays (legacy
 * "clip" naming). It is not an edit marker and nothing here reads it.
 */

/** Same limit as the publish route (`publish-post/route.ts` MAX_CONTENT_CHARS). */
export const POST_MAX_CHARS = 2000;

/** The marker shown next to the time on a post whose `edited_at` is set. */
export const EDITED_LABEL = "Edited";

/**
 * Pull the #hashtags out of a post's text: lowercase, deduped, at most 10,
 * each at most 32 characters (a longer run keeps its first 32).
 *
 * Byte-for-byte the algorithm `extractHashtags` in
 * `src/lib/composer/helpers.ts` has always used, so a tag written at publish
 * time and the same tag re-derived by an edit are identical. E1 turns
 * `extractHashtags` into a call to this function; keep the two from drifting
 * until then.
 */
export function extractPostTags(text: string): string[] {
  const matches = text.match(/#[A-Za-z0-9_]{1,32}/g);
  if (!matches) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const t = m.replace(/^#+/, "").toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 10) break;
  }
  return out;
}

export type PostEditCheck = { ok: true; content: string } | { ok: false; error: string };

/**
 * Validate new post text. Returns the trimmed text to save, or the error the
 * route sends back as a 400.
 *
 * `hasMedia` is whether the post already has a photo or video: a media post
 * may have its caption cleared, a text-only post may not. The empty-post
 * string matches `publish-post/route.ts` so both routes say the same thing.
 */
export function checkPostEdit(input: unknown, hasMedia: boolean): PostEditCheck {
  if (typeof input !== "string") return { ok: false, error: "Invalid content" };
  const content = input.trim();
  if (content.length > POST_MAX_CHARS) {
    return { ok: false, error: `Post exceeds ${POST_MAX_CHARS} characters` };
  }
  if (!content && !hasMedia) {
    return { ok: false, error: "Post needs text, an image, or a video" };
  }
  return { ok: true, content };
}

/**
 * The @handles in `next` that were not already in `prior`, lowercased and
 * deduped. The edit route notifies only these, so a handle that was already
 * in the text stays quiet. A handle removed in one edit and added back in a
 * later one does come back from here; the route's check for an existing
 * mention notification is what keeps that to one notification (plan Q17).
 */
export function addedHandles(prior: string[], next: string[]): string[] {
  const before = new Set(prior.map((h) => h.toLowerCase()));
  const out: string[] = [];
  for (const h of next) {
    const handle = h.toLowerCase();
    if (before.has(handle)) continue;
    before.add(handle);
    out.push(handle);
  }
  return out;
}

/** The fields a client patches back into its own copy after a saved edit. */
export type EditedPost = { id: string; content: string; tags: string[]; edited_at: string | null };

/**
 * Read an edited post out of an untrusted response body (`r.data.post`).
 * Returns null when there is no usable id, so a caller treats a malformed
 * success the same as a failure instead of patching a post it can't match.
 */
export function editedPostFrom(raw: unknown): EditedPost | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  return {
    id: r.id,
    content: typeof r.content === "string" ? r.content : "",
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
    edited_at: typeof r.edited_at === "string" ? r.edited_at : null,
  };
}
