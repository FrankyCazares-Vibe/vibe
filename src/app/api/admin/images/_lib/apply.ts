import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  IMAGE_TARGET_TABLE,
  imageSlotColumn,
  type ImageMeta,
  type ImageSlot,
  type ImageTargetType,
  type LogoColumn,
  restoreLogos,
  stripLogos,
} from "@/lib/moderation/media-quarantine-images";

/**
 * The two column writes of a photo takedown, both with the service role
 * (no client role holds UPDATE on any of these columns; verified live).
 *
 *  CLEAR is compare-and-set: `where col = <the value the log row recorded>`.
 *  If the student set a new photo in between, the new one stays (and the log
 *  row still names only what it removed).
 *  PUT BACK only fills an EMPTY column (`where col is null`): a photo set
 *  after the removal is never overwritten by a restore.
 *
 * Logos live in two JSON columns; they are read, rewritten and written back
 * (only the addresses the log row recorded are touched).
 */

type Service = SupabaseClient;
const LOGO_COLUMNS: readonly LogoColumn[] = ["work_experience", "current_on"];

export type WriteOutcome = { ok: boolean; changed: number; notPutBack: number };

async function readLogos(service: Service, id: string): Promise<Record<LogoColumn, unknown> | null> {
  const { data, error } = await service.from("users").select("work_experience, current_on").eq("id", id).maybeSingle();
  if (error) {
    console.error("[admin/images logos read]", error.message);
    return null;
  }
  return (data as Record<LogoColumn, unknown> | null) ?? { work_experience: null, current_on: null };
}

/** Clear every slot the log row names. */
export async function clearSlots(
  service: Service,
  type: ImageTargetType,
  id: string,
  meta: Pick<ImageMeta, "slots" | "previous">,
): Promise<WriteOutcome> {
  let changed = 0;
  for (const slot of meta.slots) {
    const col = imageSlotColumn(type, slot);
    const prev = meta.previous[slot];
    if (col) {
      if (typeof prev !== "string") continue;
      const { data, error } = await service
        .from(IMAGE_TARGET_TABLE[type])
        .update({ [col]: null })
        .eq("id", id)
        .eq(col, prev)
        .select("id");
      if (error) {
        console.error("[admin/images clear]", type, slot, error.message);
        return { ok: false, changed, notPutBack: 0 };
      }
      changed += (data ?? []).length;
      continue;
    }
    if (slot !== "logos" || type !== "user" || !Array.isArray(prev) || prev.length === 0) continue;
    const cur = await readLogos(service, id);
    if (!cur) return { ok: false, changed, notPutBack: 0 };
    const urls = prev.map((r) => r.url);
    const patch: Partial<Record<LogoColumn, unknown>> = {};
    for (const c of LOGO_COLUMNS) {
      const next = stripLogos(cur[c], urls);
      if (JSON.stringify(next) !== JSON.stringify(cur[c])) patch[c] = next;
    }
    if (Object.keys(patch).length === 0) continue;
    const { error } = await service.from("users").update(patch).eq("id", id);
    if (error) {
      console.error("[admin/images clear logos]", error.message);
      return { ok: false, changed, notPutBack: 0 };
    }
    changed += 1;
  }
  return { ok: true, changed, notPutBack: 0 };
}

/** Put every slot the removal named back, only where it is still empty. */
export async function putBackSlots(
  service: Service,
  type: ImageTargetType,
  id: string,
  meta: Pick<ImageMeta, "slots" | "previous">,
): Promise<WriteOutcome> {
  let changed = 0;
  let notPutBack = 0;
  for (const slot of meta.slots as ImageSlot[]) {
    const col = imageSlotColumn(type, slot);
    const prev = meta.previous[slot];
    if (col) {
      if (typeof prev !== "string") continue;
      const { data, error } = await service
        .from(IMAGE_TARGET_TABLE[type])
        .update({ [col]: prev })
        .eq("id", id)
        .is(col, null)
        .select("id");
      if (error) {
        console.error("[admin/images put back]", type, slot, error.message);
        return { ok: false, changed, notPutBack };
      }
      const n = (data ?? []).length;
      changed += n;
      if (n === 0) {
        // Already back (a retry), or they set a new photo since: only the
        // second one is "not put back".
        const { data: now } = await service.from(IMAGE_TARGET_TABLE[type]).select(col).eq("id", id).maybeSingle();
        const value = (now as Record<string, unknown> | null)?.[col];
        if (value !== prev) notPutBack += 1;
      }
      continue;
    }
    if (slot !== "logos" || type !== "user" || !Array.isArray(prev) || prev.length === 0) continue;
    const cur = await readLogos(service, id);
    if (!cur) return { ok: false, changed, notPutBack };
    const patch: Partial<Record<LogoColumn, unknown>> = {};
    for (const c of LOGO_COLUMNS) {
      const r = restoreLogos(c, cur[c], prev);
      notPutBack += r.notPutBack;
      if (JSON.stringify(r.next) !== JSON.stringify(cur[c])) patch[c] = r.next;
    }
    if (Object.keys(patch).length === 0) continue;
    const { error } = await service.from("users").update(patch).eq("id", id);
    if (error) {
      console.error("[admin/images put back logos]", error.message);
      return { ok: false, changed, notPutBack };
    }
    changed += 1;
  }
  return { ok: true, changed, notPutBack };
}
