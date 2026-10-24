import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { firstRemovedPicture, type PictureLogRow } from "./removed-picture";

/**
 * The read behind the club PATCH (logo_url / banner_url), the club post
 * route (media_url / media_thumbnail_url: a club's own `orgs/<id>/` keys pass
 * its media check, logo and banner included), the event create / edit routes
 * (cover_key, Oct 23, 2026) and the group chat PATCH (photo_url) refusing a
 * picture moderators took down (see removed-picture.ts for the rules).
 *
 * SERVICE ROLE: moderation_actions has RLS on and no policies, and no client
 * role can read it. Only the image_* rows of THIS target (and, for a club,
 * of its events: below) are read, newest first, and nothing from them
 * leaves the server except the yes / no.
 *
 * A CLUB'S EVENT COVERS COUNT FOR THE CLUB (Oct 23, 2026). An event cover's
 * takedown is logged on the EVENT (so a report about the event closes with
 * it), with the club's id in `meta.org_id` (imageLogScope). For a club, its
 * events' image_* rows are read too: a removed cover sent back as another
 * event's cover, the club's logo or banner, or club post media is the same
 * picture. A restore row carries the same `meta.org_id`, so a put-back cover
 * is let through again. The two lists are simply joined: removedPictureRefs
 * doesn't depend on their order.
 *
 * Answers:
 *   "removed"  a value in `values` is a picture moderators removed from this target
 *   "ok"       none is
 *   "error"    the log couldn't be read; the caller refuses (fails closed), since
 *              letting it through could put a removed picture back online
 */

/** Far above any real club: a takedown is rare, and each has at most one restore. */
const MAX_ROWS = 1000;

export async function checkRemovedPicture(
  service: SupabaseClient,
  targetType: "org" | "channel",
  targetId: string,
  values: ReadonlyArray<unknown>,
): Promise<"removed" | "ok" | "error"> {
  if (!values.some((v) => typeof v === "string" && v.trim() !== "")) return "ok";
  // Both reads at once (Oct 23, 2026): the event cover route asks this on
  // every cover it serves, so a club's second read shouldn't wait on its first.
  const [own, events] = await Promise.all([
    service
      .from("moderation_actions")
      .select("id, action, meta")
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .in("action", ["image_remove", "image_restore"])
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS),
    targetType === "org"
      ? service
          .from("moderation_actions")
          .select("id, action, meta")
          .eq("target_type", "event")
          .in("action", ["image_remove", "image_restore"])
          .contains("meta", { org_id: targetId })
          .order("created_at", { ascending: false })
          .limit(MAX_ROWS)
      : null,
  ]);
  if (own.error) {
    console.error("[removed-picture read]", targetType, own.error.message);
    return "error";
  }
  if (events?.error) {
    console.error("[removed-picture read]", "event", events.error.message);
    return "error";
  }
  const rows = [...((own.data ?? []) as PictureLogRow[]), ...((events?.data ?? []) as PictureLogRow[])];
  return firstRemovedPicture(rows, values) ? "removed" : "ok";
}
