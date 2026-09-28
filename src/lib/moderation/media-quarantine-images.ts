/**
 * Which files a moderator's PHOTO takedown moves, and how the log row decides
 * a retry (S67 security wave 2, wave B, batch B1; security report 2026-09-27
 * finding #2). The routes are src/app/api/admin/images/**; the move itself is
 * media-quarantine-store.ts, unchanged.
 *
 * WHERE EACH PHOTO LIVES (critique-B1, prod 2026-09-28):
 *   user avatar / banner   users.avatar_url / banner_url   public `profiles`
 *   user logos             users.work_experience[].logo_url and
 *                          users.current_on[].logoUrl (JSON)  public `profiles`
 *                          `<uid>/logos/…`, or any outside address
 *   club logo / banner     orgs.logo_url / banner_url      PRIVATE R2 key
 *   group chat photo       channels.photo_url              PRIVATE R2 key
 *
 * ONLY THE TARGET'S OWN FILES MOVE. Every one of these values is something a
 * student can send, so it can name ANOTHER student's file. Moving "whatever
 * the column says" would take the victim's picture down on the strength of the
 * attacker's own profile. B0's ownProfileImageKey decides ownership; this file
 * adds WHICH own files a given slot may move (act on the slot, never on
 * "not null"): avatar/banner removal moves root avatar-/banner- files, logos
 * removal moves `logos/` files. The owner's own post photo is never moved from
 * here (post removal owns it). Club/chat R2 keys are never moved: they are
 * private already, and the key left in R2 is the evidence.
 *
 * THE LOG ROW IS THE ONLY RECORD. The column is cleared, so `meta.previous`
 * is what a restore puts back. The routes write the row FIRST and use
 * {@link removalStep} / {@link restoreStep} to finish a half-done press.
 *
 * Imports: only B0's zero-import module (relative, extensionless, the house
 * pattern; the test registers the resolve hook).
 */

import { ownProfileImageKey, type ProfileImageSlot } from "../media/profile-image-key";

export type ImageTargetType = "user" | "org" | "channel";
export type ImageSlot = "avatar" | "banner" | "logos" | "logo" | "photo";

/** The slots a moderator can clear, per target. */
export const IMAGE_SLOTS: Readonly<Record<ImageTargetType, readonly ImageSlot[]>> = {
  user: ["avatar", "banner", "logos"],
  org: ["logo", "banner"],
  channel: ["photo"],
};

/** The table each target lives in. */
export const IMAGE_TARGET_TABLE: Readonly<Record<ImageTargetType, string>> = {
  user: "users",
  org: "orgs",
  channel: "channels",
};

export function isImageTargetType(value: unknown): value is ImageTargetType {
  return value === "user" || value === "org" || value === "channel";
}

export function isImageSlot(type: ImageTargetType, slot: unknown): slot is ImageSlot {
  return typeof slot === "string" && (IMAGE_SLOTS[type] as readonly string[]).includes(slot);
}

/** The text column a slot lives in; null for the JSON logos slot. */
export function imageSlotColumn(type: ImageTargetType, slot: ImageSlot): string | null {
  if (type === "user") {
    if (slot === "avatar") return "avatar_url";
    if (slot === "banner") return "banner_url";
    return null;
  }
  if (type === "org") return slot === "logo" ? "logo_url" : slot === "banner" ? "banner_url" : null;
  return slot === "photo" ? "photo_url" : null;
}

/** What the moderator reads for each slot. */
export function imageSlotLabel(type: ImageTargetType, slot: ImageSlot): string {
  if (type === "user") {
    if (slot === "avatar") return "Profile photo";
    if (slot === "banner") return "Cover photo";
    return "Experience and working-on logos";
  }
  if (type === "org") return slot === "logo" ? "Club logo" : "Club banner";
  return "Group chat photo";
}

/** Profile slots are public files behind a CDN; club and chat photos are signed per view. */
export function isPublicImageSlot(type: ImageTargetType): boolean {
  return type === "user";
}

/** The moderator notes (admin screens only; the legal pages keep their own wording). */
export const CACHE_NOTE = "A removed photo can take a few days to disappear from every cache.";
export const PRIVATE_CACHE_NOTE =
  "Club and group chat photos stop loading within an hour, when the last signed link runs out.";
export const UNFURL_NOTE =
  "Link previews already shared in other apps keep their own copy, which Vibe can't reach.";
export const LEFT_NOTES = {
  post: "This picture is also one of their posts, so the file stays up. Remove that post to take it down.",
  other: "This file is theirs but stored for something else, so it wasn't moved. Check where else they use it.",
  foreign: "This picture is another account's file, so only the link here was cleared. The file itself is still online.",
  external: "This picture is hosted on another site, so only the link here was cleared. Vibe can't take that file down.",
} as const;

export type LeftKind = "post" | "other" | "foreign" | "external" | "private";

export type ImagePlan = {
  /** `profiles` object paths to move into quarantine, each once. */
  paths: string[];
  /** References left where they are, by kind. `private` is never public. */
  left: Record<LeftKind, number>;
  /** Folder ids of other accounts whose files were named (for the moderator). */
  foreignOwners: string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PUBLIC_PREFIX = "/storage/v1/object/public/profiles/";
/** A private R2 key for a club asset or a group photo: no scheme, known prefix. */
const PRIVATE_KEY_RE = /^(orgs|groups)\/[0-9a-f-]{36}\/[A-Za-z0-9._/-]+$/;

/** Which own-file kinds a removal of this slot may move. */
function movableKinds(slot: ImageSlot): readonly ProfileImageSlot[] {
  if (slot === "avatar" || slot === "banner") return ["avatar", "banner"];
  if (slot === "logos") return ["logo"];
  return [];
}

/** The folder id of a `profiles` reference on our project (URL or bare path), else null. */
function profilesFolder(ref: string, supabaseUrl: string): string | null {
  let path: string | null = null;
  if (/^[0-9a-f-]{36}\//.test(ref)) path = ref;
  else {
    try {
      const url = new URL(ref);
      const origin = new URL(supabaseUrl).origin;
      if (url.origin === origin && url.pathname.startsWith(PUBLIC_PREFIX)) {
        path = url.pathname.slice(PUBLIC_PREFIX.length);
      }
    } catch {
      return null;
    }
  }
  const folder = path?.split("/", 1)[0] ?? "";
  return UUID_RE.test(folder) ? folder : null;
}

export type RefVerdict = { kind: "own"; path: string } | { kind: LeftKind; folder: string | null };

/**
 * One stored reference, judged for a removal of `slot`. `ownerId` is the
 * student for a user target and null for a club or chat (nothing in
 * `profiles` is ever moved on a club's behalf: the uploader is unknowable).
 */
export function classifyImageRef(
  ref: string,
  slot: ImageSlot,
  ownerId: string | null,
  supabaseUrl: string,
): RefVerdict {
  const value = ref.trim();
  if (PRIVATE_KEY_RE.test(value) && !value.includes("..")) return { kind: "private", folder: null };
  if (ownerId) {
    const key = ownProfileImageKey(value, ownerId, supabaseUrl);
    if (key) {
      if (movableKinds(slot).includes(key.slot)) return { kind: "own", path: key.path };
      return { kind: key.slot === "post" || key.slot === "poster" ? "post" : "other", folder: ownerId };
    }
  }
  const folder = profilesFolder(value, supabaseUrl);
  if (folder) return { kind: ownerId && folder === ownerId ? "other" : "foreign", folder };
  return { kind: "external", folder: null };
}

/** Everything a removal of `slot` moves, and everything it leaves (counted). */
export function planImageRemoval(args: {
  slot: ImageSlot;
  refs: ReadonlyArray<string | null | undefined>;
  ownerId: string | null;
  supabaseUrl: string;
}): ImagePlan {
  const plan: ImagePlan = {
    paths: [],
    left: { post: 0, other: 0, foreign: 0, external: 0, private: 0 },
    foreignOwners: [],
  };
  for (const ref of args.refs) {
    if (typeof ref !== "string" || ref.trim() === "") continue;
    const verdict = classifyImageRef(ref, args.slot, args.ownerId, args.supabaseUrl);
    if (verdict.kind === "own") {
      if (!plan.paths.includes(verdict.path)) plan.paths.push(verdict.path);
      continue;
    }
    plan.left[verdict.kind] += 1;
    if (verdict.kind === "foreign" && verdict.folder && !plan.foreignOwners.includes(verdict.folder)) {
      plan.foreignOwners.push(verdict.folder);
    }
  }
  return plan;
}

/** The notes for what a removal left in place (private keys need none). */
export function leftNotes(left: Partial<Record<LeftKind, number>>): string[] {
  return (["post", "other", "foreign", "external"] as const)
    .filter((k) => (left[k] ?? 0) > 0)
    .map((k) => LEFT_NOTES[k]);
}

/**
 * Older, unused copies of a profile photo or cover in the student's own
 * folder root (waveB-build call 4): the link a reporter holds may be one of
 * them. `names` is the storage listing of `<ownerId>/`; `keep` are paths a
 * slot still shows. Not put back on restore (nothing used them).
 */
export function sweepPaths(
  ownerId: string,
  names: ReadonlyArray<string>,
  keep: ReadonlyArray<string>,
  supabaseUrl: string,
): string[] {
  const out: string[] = [];
  for (const name of names) {
    const key = ownProfileImageKey(`${ownerId}/${name}`, ownerId, supabaseUrl);
    if (!key || (key.slot !== "avatar" && key.slot !== "banner")) continue;
    if (keep.includes(key.path) || out.includes(key.path)) continue;
    out.push(key.path);
  }
  return out;
}

/* ------------------------------------------------ logos (JSON on users) */

export type LogoColumn = "work_experience" | "current_on";
export type LogoRef = { column: LogoColumn; index: number; key: "logo_url" | "logoUrl"; url: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Every logo address in one JSON column (both spellings, any element). */
export function collectLogoRefs(column: LogoColumn, value: unknown): LogoRef[] {
  if (!Array.isArray(value)) return [];
  const out: LogoRef[] = [];
  value.forEach((el, index) => {
    const rec = asRecord(el);
    if (!rec) return;
    for (const key of ["logo_url", "logoUrl"] as const) {
      const v = rec[key];
      if (typeof v === "string" && v.trim() !== "") out.push({ column, index, key, url: v });
    }
  });
  return out;
}

/**
 * A copy of the column with its logo addresses set to null: all of them, or
 * with `only`, just those addresses (the ones the log row recorded, so a logo
 * set in the same second is never cleared without a record).
 */
export function stripLogos(value: unknown, only?: ReadonlyArray<string>): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((el) => {
    const rec = asRecord(el);
    if (!rec) return el;
    const next = { ...rec };
    for (const key of ["logo_url", "logoUrl"] as const) {
      const v = next[key];
      if (typeof v === "string" && v.trim() !== "" && (!only || only.includes(v))) next[key] = null;
    }
    return next;
  });
}

/**
 * Put removed logos back where the entry still exists with no logo. A logo
 * the student set since is never overwritten; those count as not put back.
 */
export function restoreLogos(
  column: LogoColumn,
  value: unknown,
  refs: ReadonlyArray<LogoRef>,
): { next: unknown; restored: number; notPutBack: number } {
  const mine = refs.filter((r) => r.column === column);
  if (!Array.isArray(value)) return { next: value, restored: 0, notPutBack: mine.length };
  const next = value.map((el) => (asRecord(el) ? { ...(el as Record<string, unknown>) } : el));
  let restored = 0;
  let notPutBack = 0;
  const empty = (v: unknown) => v === null || v === undefined || v === "";
  for (const r of mine) {
    const rec = asRecord(next[r.index]);
    if (!rec) notPutBack += 1;
    else if (rec[r.key] === r.url) restored += 1;
    else if (empty(rec.logo_url) && empty(rec.logoUrl)) {
      rec[r.key] = r.url;
      restored += 1;
    } else notPutBack += 1;
  }
  return { next, restored, notPutBack };
}

/** One comparable string for a set of logo refs; null when there are none. */
export function logoValueKey(refs: ReadonlyArray<LogoRef>): string | null {
  if (refs.length === 0) return null;
  const rows = refs.map((r) => `${r.column}|${r.index}|${r.key}|${r.url}`).sort();
  return JSON.stringify(rows);
}

/* ------------------------------------------- the log row and the retries */

/** An image_* row from moderation_actions, as the routes read it. */
export type ImageLogRow = { id: string; action: string; meta: unknown; created_at?: string | null };

/** What an image_remove (or image_restore) row carries in `meta`. */
export type ImageMeta = {
  slots: ImageSlot[];
  /** Column value per slot; for `logos` the LogoRef list. */
  previous: Partial<Record<ImageSlot, string | LogoRef[]>>;
  /** Moved into quarantine, and moved back on restore. */
  paths: string[];
  /** Older unused copies also moved; never moved back. */
  swept: string[];
  /**
   * What the removal left where it was, by kind (all 0 when the row has none,
   * e.g. an image_restore row). Nonzero post/other/foreign/external means the
   * picture stayed reachable, so re-setting the same value makes it live again.
   */
  left: Record<LeftKind, number>;
  /** On an image_restore row: the image_remove row it undoes. */
  removalId: string | null;
};

const ALL_SLOTS: readonly ImageSlot[] = ["avatar", "banner", "logos", "logo", "photo"];

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

function logoRefs(value: unknown): LogoRef[] {
  if (!Array.isArray(value)) return [];
  const out: LogoRef[] = [];
  for (const el of value) {
    const r = asRecord(el);
    if (!r) continue;
    const column = r.column === "work_experience" || r.column === "current_on" ? r.column : null;
    const key = r.key === "logo_url" || r.key === "logoUrl" ? r.key : null;
    const index = typeof r.index === "number" && Number.isInteger(r.index) && r.index >= 0 ? r.index : -1;
    if (column && key && index >= 0 && typeof r.url === "string" && r.url) {
      out.push({ column, key, index, url: r.url });
    }
  }
  return out;
}

/** The typed `meta` of an image row, or null when it isn't one we wrote. */
export function readImageMeta(meta: unknown): ImageMeta | null {
  const m = asRecord(meta);
  if (!m) return null;
  const slots = strings(m.slots).filter((s): s is ImageSlot => (ALL_SLOTS as readonly string[]).includes(s));
  if (slots.length === 0) return null;
  const prev = asRecord(m.previous) ?? {};
  const previous: ImageMeta["previous"] = {};
  for (const s of slots) {
    const v = prev[s];
    if (s === "logos") previous.logos = logoRefs(v);
    else if (typeof v === "string" && v) previous[s] = v;
  }
  return {
    slots,
    previous,
    paths: strings(m.paths),
    swept: strings(m.swept),
    left: leftCounts(m.left),
    removalId: typeof m.removal_id === "string" ? m.removal_id : null,
  };
}

/** The `left` counts of a row, non-negative whole numbers only; 0 for anything else. */
function leftCounts(value: unknown): Record<LeftKind, number> {
  const rec = asRecord(value) ?? {};
  const out: Record<LeftKind, number> = { post: 0, other: 0, foreign: 0, external: 0, private: 0 };
  for (const k of Object.keys(out) as LeftKind[]) {
    const v = rec[k];
    if (typeof v === "number" && Number.isInteger(v) && v > 0) out[k] = v;
  }
  return out;
}

/**
 * True when the removal took every picture it named offline by MOVING it
 * (the student's own files, now in quarantine) and left nothing reachable.
 * Only then does a slot still holding the recorded value mean "a half-done
 * press" rather than "the same picture is live again".
 */
function movedEverything(meta: ImageMeta): boolean {
  const l = meta.left;
  return meta.paths.length > 0 && l.post === 0 && l.other === 0 && l.foreign === 0 && l.external === 0;
}

/** The comparable form of a stored previous value (string, or logos key). */
export function previousKey(meta: ImageMeta, slot: ImageSlot): string | null {
  const v = meta.previous[slot];
  if (Array.isArray(v)) return logoValueKey(v);
  return typeof v === "string" && v ? v : null;
}

/** Current slot values in comparable form: the column text, or logoValueKey. */
export type SlotValues = Partial<Record<ImageSlot, string | null>>;

/**
 * What a Remove press does, given the newest image_* row for this slot.
 *   finish  the newest row is a removal and nothing was set since (every slot
 *           it names is empty, or still the old value of a picture that
 *           removal MOVED offline): redo its moves and clears, no second row.
 *   nothing the slot is empty and no removal is pending.
 *   new     log a new removal, then act.
 * The same value back in a slot whose picture was NOT moved (a club or chat
 * R2 key kept as evidence, another account's file, an outside address) is the
 * picture live again: that is a new takedown with its own row and reason. A
 * half-done press on one of those then logs a harmless second row instead of
 * acting unlogged.
 */
export function removalStep(
  latest: ImageLogRow | null,
  slot: ImageSlot,
  current: SlotValues,
): "finish" | "nothing" | "new" {
  if (latest && latest.action === "image_remove") {
    const meta = readImageMeta(latest.meta);
    if (meta && meta.slots.includes(slot)) {
      const offline = movedEverything(meta);
      const untouched = meta.slots.every((s) => {
        const now = current[s] ?? null;
        return now === null || (offline && now === previousKey(meta, s));
      });
      if (untouched) return "finish";
    }
  }
  return (current[slot] ?? null) === null ? "nothing" : "new";
}

/**
 * Does the newest image_* row for a slot still belong to the takedown the
 * moderator pressed Put back on? Yes when it IS that removal, or a restore of
 * it (a half-done restore to finish). Anything newer (a later takedown, or a
 * restore of a later one) answers no: putting back from an older row would
 * act on the newer row's picture. `latest` null answers no.
 */
export function isSameTakedown(latest: ImageLogRow | null, removalId: string): boolean {
  if (!latest) return false;
  if (latest.action === "image_remove") return latest.id === removalId;
  if (latest.action === "image_restore") return readImageMeta(latest.meta)?.removalId === removalId;
  return false;
}

/** How long a restore can be finished by pressing again (a retry, not an old row). */
export const RESTORE_FINISH_MS = 10 * 60 * 1000;

/**
 * `row` narrowed to the slots whose newest image_* row is still `row`. One
 * file taken down from both photo and cover, then a later takedown of just
 * the photo: putting the first one back fills the cover only, and the later
 * takedown keeps the photo slot (and stays undoable). `latestBySlot` holds the
 * newest row per slot the route read; a slot missing from it is dropped.
 */
export function scopeToLatestSlots(
  row: ImageLogRow,
  latestBySlot: Partial<Record<ImageSlot, ImageLogRow | null>>,
): ImageLogRow {
  const meta = asRecord(row.meta);
  const slots = readImageMeta(row.meta)?.slots;
  if (!meta || !slots) return row;
  const kept = slots.filter((s) => latestBySlot[s]?.id === row.id);
  return kept.length === slots.length ? row : { ...row, meta: { ...meta, slots: kept } };
}

/**
 * What a Restore press does, given the newest image_* row for this slot.
 *   nothing  no removal on record (or a restore of something unreadable),
 *            or a restore older than RESTORE_FINISH_MS when `now` is given.
 *   finish   the newest row is a restore made within RESTORE_FINISH_MS:
 *            redo its moves and set-if-empty writes, no second row.
 *   replaced every slot it names holds a new photo since: put nothing
 *            back (409).
 *   new      log a restore, then act.
 * Logos never answer `replaced`: each one goes back only where its entry
 * still has no logo, and the rest are counted as not put back.
 * THE WINDOW: finishing re-moves files out of quarantine and fills empty
 * columns without a new row. That is right for a retry a minute later, and
 * wrong days later (the student may have cleared that photo since, or a report
 * may have moved it back into quarantine as evidence). The routes always pass
 * `now`; a restore row with no readable time is treated as old.
 */
export function restoreStep(
  latest: ImageLogRow | null,
  current: SlotValues,
  now?: number,
): "nothing" | "finish" | "replaced" | "new" {
  if (!latest) return "nothing";
  const meta = readImageMeta(latest.meta);
  if (!meta) return "nothing";
  if (latest.action === "image_restore") {
    if (now === undefined) return "finish";
    const at = typeof latest.created_at === "string" ? Date.parse(latest.created_at) : NaN;
    return Number.isFinite(at) && now - at <= RESTORE_FINISH_MS ? "finish" : "nothing";
  }
  if (latest.action !== "image_remove") return "nothing";
  // Refused only when EVERY photo slot it names holds a new photo. One file
  // shown as both photo and cover, with only the cover replaced since, still
  // goes back as the photo (the cover counts as not put back).
  const cols = meta.slots.filter((s) => s !== "logos");
  const replaced = (s: ImageSlot) => {
    const now = current[s] ?? null;
    return now !== null && now !== previousKey(meta, s);
  };
  if (cols.length > 0 && cols.every(replaced)) return "replaced";
  return "new";
}

/**
 * The newest image_* row per slot, from rows sorted newest first (the GET
 * reads one list for the whole target instead of one query per slot).
 */
export function latestPerSlot(rows: ReadonlyArray<ImageLogRow>): Partial<Record<ImageSlot, ImageLogRow>> {
  const out: Partial<Record<ImageSlot, ImageLogRow>> = {};
  for (const row of rows) {
    if (row.action !== "image_remove" && row.action !== "image_restore") continue;
    const meta = readImageMeta(row.meta);
    if (!meta) continue;
    for (const s of meta.slots) if (!out[s]) out[s] = row;
  }
  return out;
}
