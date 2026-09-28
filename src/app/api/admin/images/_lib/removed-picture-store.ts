import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { firstRemovedPicture, type PictureLogRow } from "./removed-picture";

/**
 * The read behind the club PATCH (logo_url / banner_url), the club post
 * route (media_url / media_thumbnail_url: a club's own `orgs/<id>/` keys pass
 * its media check, logo and banner included) and the group chat PATCH
 * (photo_url) refusing a picture moderators took down (see removed-picture.ts
 * for the rules).
 *
 * SERVICE ROLE: moderation_actions has RLS on and no policies, and no client
 * role can read it. Only the image_* rows of THIS target are read, newest
 * first, and nothing from them leaves the server except the yes / no.
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
  const { data, error } = await service
    .from("moderation_actions")
    .select("id, action, meta")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .in("action", ["image_remove", "image_restore"])
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) {
    console.error("[removed-picture read]", targetType, error.message);
    return "error";
  }
  return firstRemovedPicture((data ?? []) as PictureLogRow[], values) ? "removed" : "ok";
}
