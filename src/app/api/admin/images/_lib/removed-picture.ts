/**
 * Has Vibe's moderators taken THIS picture down from THIS club or group chat?
 * (S67 security wave 2, wave B follow-up P2; review-B1-bypass should-fix
 * "org/thread PATCH accept a just-removed R2 key".)
 *
 * A club's logo/banner and a group chat's photo are private R2 keys. A
 * takedown clears the column but leaves the object in R2 as evidence (call
 * 4), and `meta.previous` of the image_remove row records the key. Without
 * this check an officer (or any group member) could PATCH the very same key
 * back and the removed picture would be live again. The PATCH routes, and
 * the club post route (a removed logo or banner key sent as post media would
 * reach the whole campus feed), read the target's image_* rows (service
 * role) and refuse a value one of them names.
 *
 *  - Any slot of the same target counts: a removed logo sent back as the
 *    banner is the same picture.
 *  - A removal the moderators later PUT BACK (an image_restore row whose
 *    meta.removal_id is that removal and whose meta.slots holds the slot)
 *    no longer counts for that slot: they decided the picture is fine.
 *  - Values are compared in a canonical form (trimmed, empty and `.` path
 *    segments dropped, scheme + host lower-cased), because both key checks
 *    let `a//b` and `a/./b` through and those can reach the same object.
 *  - A genuinely new upload has a new random key, so it never matches.
 *
 * NO IMPORTS, so node:test loads it directly.
 */

export type PictureLogRow = { id: string; action: string; meta: unknown };

export const REMOVED_PICTURE_MESSAGE = "That picture was removed by Vibe moderators. Choose a different one.";

/** The comparable form of a stored or sent picture value; null for nothing. */
export function canonicalPictureRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  const m = /^([a-z][a-z0-9+.-]*:\/\/[^/]*)(\/.*)?$/i.exec(s);
  const head = m ? m[1].toLowerCase() : "";
  const path = m ? (m[2] ?? "") : s;
  const segments = path.split("/").filter((p) => p !== "" && p !== ".");
  if (!head && segments.length === 0) return null;
  return head ? `${head}/${segments.join("/")}` : segments.join("/");
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

/** Every picture value (canonical) a still-standing image_remove row names. */
export function removedPictureRefs(rows: ReadonlyArray<PictureLogRow>): Set<string> {
  // slot names put back, per removal id
  const putBack = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.action !== "image_restore") continue;
    const meta = record(row.meta);
    const removalId = meta && typeof meta.removal_id === "string" ? meta.removal_id : null;
    if (!removalId) continue;
    const slots = putBack.get(removalId) ?? new Set<string>();
    for (const s of stringList(meta?.slots)) slots.add(s);
    putBack.set(removalId, slots);
  }

  const out = new Set<string>();
  for (const row of rows) {
    if (row.action !== "image_remove") continue;
    const meta = record(row.meta);
    const previous = record(meta?.previous);
    if (!meta || !previous) continue;
    const restored = putBack.get(row.id);
    for (const slot of stringList(meta.slots)) {
      if (restored?.has(slot)) continue;
      const ref = canonicalPictureRef(previous[slot]);
      if (ref) out.add(ref);
    }
  }
  return out;
}

/** The first value in `values` that a moderator removed from this target, or null. */
export function firstRemovedPicture(
  rows: ReadonlyArray<PictureLogRow>,
  values: ReadonlyArray<unknown>,
): string | null {
  const removed = removedPictureRefs(rows);
  if (removed.size === 0) return null;
  for (const v of values) {
    const ref = canonicalPictureRef(v);
    if (ref && removed.has(ref)) return typeof v === "string" ? v : ref;
  }
  return null;
}
