/**
 * The side panel's mini desk, the pure half (Wave 2B, Nov 11, 2026; plan
 * "Wave 2B", brief WAVE2B-BRIEF.md). The computer's corner panel shows a
 * small slice of Otto's desk (src/lib/otto/desk.ts): the top two Ready
 * items, a few "Otto saw" rows, and links to the whole desk and to Stats.
 * OttoSidePanel.tsx draws what this picks; the static twin in
 * public/html/_otto.js follows the same numbers.
 *
 * ONE CORAL. Only the first Ready item may keep `primary` (the model already
 * sets it on ready[0] alone); the second always renders quiet. On /otto the
 * page's own top item is the coral one, so the panel passes `coral: false`
 * and stays quiet.
 *
 * ACTING AS. The panel never switches clubs. It reads the desk's own pick on
 * this device (the phone desk's DESK_AS_KEY), else the club switch, and asks
 * for that desk with `?club=`; an unknown handle falls back to the server's
 * first club (chooseActingClub), as on /otto.
 *
 * PURE: type-only imports, so panel-desk.test.ts runs under plain `node --test`.
 */
import type { DeskItem, DeskModel } from "./desk";

export const PANEL_READY_MAX = 2;
export const PANEL_SAW_MAX = 3;

/** A `?club=` value: a handle's characters, or "me" (the route's own shape). */
const CLUB_PARAM = /^[a-z0-9_.-]{1,64}$/;

function clean(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return CLUB_PARAM.test(v) ? v : null;
}

/**
 * The `?club=` the panel asks for: the desk's saved pick on this device
 * ("me" or a handle), else the club switch's handle, else none (the
 * server's default). Junk in storage reads as no pick.
 */
export function panelClubParam(storedDeskAs: string | null | undefined, switchedHandle: string | null | undefined): string | null {
  return clean(storedDeskAs) ?? clean(switchedHandle);
}

export type PanelReady = {
  item: DeskItem;
  /** The top item opens on blueprint; the second folds to one row. Reminders are plain rows. */
  open: boolean;
};

export type PanelDesk = {
  ready: PanelReady[];
  /** Ready items left on the desk past the two shown. */
  readyMore: number;
  saw: DeskItem[];
  sawMore: number;
  /** A read behind a student's Ready pile failed: say so instead of the empty line. */
  readyPartial: boolean;
  /** The notifications read failed. */
  sawFailed: boolean;
};

/** What the panel's Otto tab shows from a desk and the route's `failed[]`. */
export function panelDesk(
  desk: Pick<DeskModel, "role" | "ready" | "saw">,
  failed: readonly string[] = [],
  { coral = true }: { coral?: boolean } = {},
): PanelDesk {
  const ready = desk.ready.slice(0, PANEL_READY_MAX).map((item, i): PanelReady => {
    // One coral per frame: the second item never keeps `primary`.
    const { primary, ...rest } = item;
    const keep: DeskItem = coral && i === 0 && primary && rest.verb ? { ...rest, primary } : rest;
    return { item: keep, open: i === 0 && item.kind !== "reminder" };
  });
  const missing = new Set(failed);
  return {
    ready,
    readyMore: Math.max(0, desk.ready.length - ready.length),
    saw: desk.saw.slice(0, PANEL_SAW_MAX),
    sawMore: Math.max(0, desk.saw.length - PANEL_SAW_MAX),
    readyPartial: desk.role === "student" && (missing.has("asking") || missing.has("dms")),
    sawFailed: missing.has("activity"),
  };
}

/**
 * The panel's two links, keeping the club the panel shows: the whole desk
 * (/otto) and its Stats tab (the board's "Full breakdown").
 */
export function panelLinks(desk: Pick<DeskModel, "actingAs" | "clubs"> | null): { desk: string; stats: string } {
  const club = desk?.actingAs ? clean(desk.actingAs.handle) : desk && desk.clubs.length > 0 ? "me" : null;
  const q = club ? `club=${encodeURIComponent(club)}` : "";
  return {
    desk: q ? `/otto?${q}` : "/otto",
    stats: q ? `/otto?tab=stats&${q}` : "/otto?tab=stats",
  };
}

/** "3 more on your desk" (sentence case, a plain count). */
export function moreLine(n: number): string {
  return n === 1 ? "1 more on your desk" : `${n.toLocaleString("en-US")} more on your desk`;
}
