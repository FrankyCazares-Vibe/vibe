import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { type ImageSlot, sweepPaths } from "@/lib/moderation/media-quarantine-images";
import { ownProfileImageKey } from "@/lib/media/profile-image-key";

import { type TargetRow, text } from "./target";

/**
 * Older, unused copies of a profile photo or cover in the student's own
 * `profiles/<id>/` root (waveB-build call 4): the link a reporter copied may
 * be one of them (about 80 such files existed live on 2026-09-28). Anything a
 * slot that is NOT being removed still shows is kept. Best-effort: a failed
 * listing sweeps nothing and the removal goes ahead; the log row records what
 * was swept, and a restore never puts swept files back (nothing used them).
 */
export async function sweepOlderCopies(
  service: SupabaseClient,
  ownerId: string,
  row: TargetRow,
  removing: ReadonlyArray<ImageSlot>,
  planned: ReadonlyArray<string>,
  supabaseUrl: string,
): Promise<string[]> {
  const keep: string[] = [...planned];
  for (const [slot, col] of [["avatar", "avatar_url"], ["banner", "banner_url"]] as const) {
    if (removing.includes(slot)) continue;
    const key = ownProfileImageKey(text(row[col]), ownerId, supabaseUrl);
    if (key) keep.push(key.path);
  }
  try {
    const { data, error } = await service.storage.from("profiles").list(ownerId, { limit: 1000 });
    if (error) {
      console.error("[admin/images sweep list]", error.message);
      return [];
    }
    const names = ((data ?? []) as Array<{ name?: unknown }>)
      .map((o) => (typeof o.name === "string" ? o.name : ""))
      .filter(Boolean);
    return sweepPaths(ownerId, names, keep, supabaseUrl).filter((p) => !planned.includes(p));
  } catch (err) {
    console.error("[admin/images sweep] unexpected", err);
    return [];
  }
}
