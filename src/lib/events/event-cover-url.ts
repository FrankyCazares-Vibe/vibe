/**
 * An event's cover photo (Oct 23, 2026; club view wave 3, event covers,
 * batch B1: handoffs/2026-10-23-club-view-wave-3/COVERS-PLAN.md): which
 * stored keys are a cover at all, and the stable address the app shows one
 * at.
 *
 * Covers follow the club banner's path: the officer's browser PUTs the
 * picture straight to storage on a link `POST /api/orgs/[slug]/upload-url`
 * signs (kind "event-cover"), the database keeps the object KEY
 * (`events.cover_key`, never a URL), and `GET /api/events/[id]/cover`
 * answers a short-lived signed link after the database's own rule
 * (event_visible) has said the viewer may see the event.
 *
 * THE KEY SHAPE, as upload-url writes it: `orgs/<org_id>/events/<uuid>.<ext>`,
 * ext jpg, png or webp. `isEventCoverKey` accepts exactly that, inside ONE
 * club's folder, and nothing else; POST and PATCH /api/events refuse any
 * other value (`invalid_cover`), the picture route signs nothing else, and
 * the database's events_check_cover_key holds a looser copy of the same rule
 * (20261028100000: the club's events folder, one safe file name, one of the
 * three extensions). Keep the extension list and that file in step:
 * event-cover-url.test.ts reads the migration and fails when they drift.
 *
 * NO IMPORTS, so node:test loads it directly and a client component may
 * import it.
 */

/** The folder under a club's `orgs/<org_id>/` that holds its event covers. */
export const EVENT_COVER_SUBDIR = "events";

/** The picture types a cover may be, by its key's extension (upload-url's kind "event-cover"). */
export const EVENT_COVER_EXTENSIONS = ["jpg", "png", "webp"] as const;

/** A club id: a UUID in the text form Postgres emits (media-ownership.ts's OWNER_ID_RE). */
const ORG_ID_RE = /^[0-9a-f-]{36}$/;
/** The file upload-url names: a fresh lower-case UUID and one of the three extensions. */
const COVER_FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;

/** True when `key` is a cover uploaded for THIS club's events: `orgs/<orgId>/events/<uuid>.<ext>`. */
export function isEventCoverKey(key: unknown, orgId: unknown): key is string {
  if (typeof key !== "string" || typeof orgId !== "string") return false;
  if (!ORG_ID_RE.test(orgId)) return false;
  const head = `orgs/${orgId}/${EVENT_COVER_SUBDIR}/`;
  return key.startsWith(head) && COVER_FILE_RE.test(key.slice(head.length));
}

/**
 * The address an event's cover is shown at, `/api/events/<id>/cover?v=<file>`,
 * or null when it has none (the card then shows its icon). Never the raw key.
 *
 * `?v=` is the stored key's file name (a fresh UUID per upload), so a new
 * cover is a new URL: the route ignores it, and an Everyone event's answer
 * is kept in the browser for five minutes, which without it would keep the
 * officer who just changed the picture looking at the old one
 * (orgAssetProxyUrl in src/lib/org-asset-url.ts does the same for banners).
 */
export function eventCoverProxyUrl(eventId: string, stored: string | null | undefined): string | null {
  if (typeof stored !== "string" || !stored.startsWith("orgs/")) return null;
  const file = stored.slice(stored.lastIndexOf("/") + 1);
  if (!eventId || !file) return null;
  return `/api/events/${encodeURIComponent(eventId)}/cover?v=${encodeURIComponent(file)}`;
}
