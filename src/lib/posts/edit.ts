/**
 * Editing your own post: the text rules, the tag rule and the response shape,
 * shared by the edit route (`/api/posts/[id]` PATCH, batch E1), the phone
 * edit sheet (E2) and the desktop feed card (CH1). Plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §6 E0.
 *
 * PURE ON PURPOSE. No imports at all, so `edit.test.ts` loads it without a
 * bundler, and a server route, a client component and
 * `src/lib/composer/helpers.ts` can all import it. That is also why the tag
 * write rule (Oct 19, 2026) is defined here and re-exported by tags.ts.
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

// --- The tag rule for NEW posts and edits (Oct 19, 2026) ---------------------
//
// Franky's critique decisions 3-5 (handoffs/2026-10-19-critique/DECISIONS.md):
// at most 5 tags a post, each 2-32 characters with at least one letter, and
// never a tag inside a word or a link. Before today every composer read tags
// its own way: "#café" saved as "caf" on the phone, "x.com/page#section"
// saved "section", a 40-character tag was cut to 32, and tags 11 and 12 were
// highlighted but never saved.
//
// WHY THE CODE LIVES HERE AND NOT IN tags.ts. This file must stay import-free
// (client components and edit.test.ts load it bare), and tags.ts pulls in the
// word filter. So the write rule is defined here and tags.ts re-exports it:
// one definition, two doors. The READ rule (`isValidPostTag`, 1-32, any mix)
// stays in tags.ts as the database twin, so old stored tags like "#1" still
// filter and link.
//
// THE STATIC TWIN. public/html/profile.html reads tags with its own copy of
// {@link POST_TAG_IN_TEXT_RE} and {@link blankPostLinks} (critique batch B6).
// Change both together.

/** Most tags one NEW post (or edit) may carry. Old posts keep up to 10. */
export const POST_TAG_MAX = 5;

/** A tag a new post may store: 2-32 of `a-z 0-9 _`, at least one letter. */
const NEW_POST_TAG_RE = /^(?=[a-z0-9_]*[a-z])[a-z0-9_]{2,32}$/;

/**
 * True for a tag a NEW post may store (already lower-case, no `#`): 2 to 32
 * of `a-z`, `0-9`, `_`, with at least one letter. "#1", "#2026" and "#a"
 * fail: a bare number or one letter isn't something a campus can follow.
 */
export function isNewPostTag(tag: unknown): tag is string {
  return typeof tag === "string" && NEW_POST_TAG_RE.test(tag);
}

/**
 * Where a #tag may sit in text. Group 2 is the tag as typed. Run it over
 * {@link blankPostLinks}(text), never the raw text: links are blanked first.
 *
 * - It starts at the beginning, after an emoji's invisible tail (U+FE0E,
 *   U+FE0F, or the keycap mark U+20E3), or after anything that isn't a letter
 *   (any language), a digit, a combining mark, `_`, `#` or `/`. So
 *   "hello#world", "x.com/#top" and "##hype" carry no tag, but "❤️#love"
 *   and "1️⃣#first" do. Why the emoji tails (Oct 19, 2026): the iOS keyboard
 *   puts U+FE0F after many emoji, and it counts as a combining mark, so
 *   without this a tag typed right after ❤️ or ⚽️ was silently lost. A real
 *   accent ("café#x", U+0301) is still refused: that tag is glued to a word.
 * - The body is 2-32 of `A-Za-z0-9_`, and the lookahead refuses a body that
 *   runs on into another letter, digit, mark or `_`. A 40-character run or
 *   "#café" is then no tag at all: the engine backs off and never finds a
 *   shorter cut that ends cleanly. Punctuation, a space, an emoji or the end
 *   of the text ends a tag ("#gameday!" is "gameday").
 *
 * No lookbehind (group 1 eats the character before the `#`), so the static
 * twin parses on every browser. Read it with `matchAll` on a fresh copy;
 * never `exec` this shared global object.
 */
export const POST_TAG_IN_TEXT_RE =
  /(^|[\uFE0E\uFE0F\u20E3]|[^\p{L}\p{N}\p{M}_#/])#([A-Za-z0-9_]{2,32})(?![\p{L}\p{N}\p{M}_])/gu;

/**
 * Where a link starts, through to the end of its word (Oct 19, 2026). A link
 * starts at "://", or at a domain followed by "/" ("x.com/", "en.wikipedia.
 * org/"). Why: the one-character rule above can't see a link. A #fragment
 * after ")", "=", "?", "-", "." or "&" was still saved as a tag, for example
 * "wikipedia.org/wiki/Indiana_(state)#History" saved "history".
 *
 * The domain's first label takes `_` and `-` as well as letters and digits,
 * and the engine finds the leftmost start, so a link never begins in the
 * middle of a tag: "#tagx.com/a" blanks from "tagx" and gives no tag, never
 * a cut-short "tag".
 */
export const POST_TAG_LINK_RE =
  /(?::\/\/|[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*\.\p{L}{2,}(?::\d+)?\/)\S*/gu;

/**
 * `text` with every link (see {@link POST_TAG_LINK_RE}) turned into spaces of
 * the same length, so a #fragment inside a link is never read as a tag. The
 * length stays the same, so a highlighter can match {@link POST_TAG_IN_TEXT_RE}
 * on the result and use the positions on the original caption.
 */
export function blankPostLinks(text: string): string {
  if (!text.includes("/")) return text; // every link form above has a "/"
  return text.replace(new RegExp(POST_TAG_LINK_RE.source, "gu"), (link) => " ".repeat(link.length));
}

/**
 * Pull the #tags out of a post's text, as the post will store them:
 * lower-case, deduped, each passing {@link isNewPostTag}, the first
 * {@link POST_TAG_MAX} only. A duplicate or a refused tag doesn't use up a
 * place. Never cuts a tag short: a run that doesn't end cleanly is dropped.
 *
 * The phone composer and the desktop feed composer use this
 * (`extractHashtags` in src/lib/composer/helpers.ts calls it), and the edit
 * route re-derives tags with it, so a tag written at publish and the same tag
 * after an edit can never differ. The desktop profile composer (static
 * profile.html) has its own copy of the regex, and publish-post now ignores
 * the tags a composer sends and reads them from the caption with this
 * (Oct 19, 2026), so every post's tags follow this one rule.
 */
export function extractPostTags(text: string): string[] {
  if (typeof text !== "string" || !text.includes("#")) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const scan = blankPostLinks(text);
  for (const m of scan.matchAll(new RegExp(POST_TAG_IN_TEXT_RE.source, "gu"))) {
    const t = m[2].toLowerCase();
    if (seen.has(t) || !isNewPostTag(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= POST_TAG_MAX) break;
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
