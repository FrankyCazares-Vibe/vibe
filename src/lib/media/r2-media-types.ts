/**
 * The one table of file types for media in R2 storage (rate limits and
 * upload caps, wave 1, B1.1). No imports, so the signers in `r2.ts`, the
 * upload routes' tests and anything else can read the same seven rows.
 *
 * WHY IT EXISTS. Until this wave the upload link left Content-Type out of
 * the signature, so an account could PUT any bytes under any type (an HTML
 * page saved as `….jpg`) and every signed GET handed the file back under
 * that type. Now both ends are locked:
 *  - a PUT link signs the type, and only the type this table gives the
 *    key's extension (`r2.ts` refuses to sign anything else);
 *  - a GET link names the type from this table and says `inline`, so what
 *    storage hands back is one of these seven, whatever was stored before.
 *
 * AN EXTENSION NOT IN THE TABLE (or no extension at all) comes back as
 * `application/octet-stream` with `attachment`: a browser downloads it and
 * never renders it. No upload route writes such a key today.
 *
 * THE ROUTES' ALLOW-LISTS must agree with this table, type for type
 * (`r2-sign.test.ts` reads each route and checks every row).
 */

/** Extension (lower case, no dot) → the Content-Type storage serves it as. */
export const R2_MEDIA_TYPES: Readonly<Record<string, string>> = Object.freeze({
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
});

export const R2_UNKNOWN_MEDIA_TYPE = "application/octet-stream";

export type R2MediaType = {
  /** The Content-Type a link signs (PUT) or asks storage to answer with (GET). */
  contentType: string;
  /** `inline` for the seven known types; `attachment` for anything else. */
  disposition: "inline" | "attachment";
  /** False when the extension is not in the table. */
  known: boolean;
};

/**
 * The type for an object key, from its extension: `clips/<uid>/<uuid>.mp4`
 * → `video/mp4`, inline. Only the last path segment counts, so a dot in a
 * folder name never reads as an extension. Matching ignores case; keys are
 * written lower case.
 */
export function mediaTypeForKey(key: string): R2MediaType {
  const name = key.slice(key.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  // hasOwnProperty, not a plain lookup: `constructor` or `__proto__` must
  // never read as a known extension.
  if (ext && Object.prototype.hasOwnProperty.call(R2_MEDIA_TYPES, ext)) {
    return { contentType: R2_MEDIA_TYPES[ext], disposition: "inline", known: true };
  }
  return { contentType: R2_UNKNOWN_MEDIA_TYPE, disposition: "attachment", known: false };
}
