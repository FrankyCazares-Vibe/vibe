import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { adminFail } from "@/lib/auth/require-platform-admin";
import {
  collectLogoRefs,
  IMAGE_SLOTS,
  IMAGE_TARGET_TABLE,
  imageSlotColumn,
  type ImageLogRow,
  type ImageSlot,
  type ImageTargetType,
  isImageSlot,
  isImageTargetType,
  type LogoRef,
  logoValueKey,
  type SlotValues,
} from "@/lib/moderation/media-quarantine-images";
import { isUuid } from "@/lib/pgrest";

/**
 * What the three image routes (GET slots, POST remove, POST restore) share:
 * reading the target with the service role, the per-slot values, the newest
 * image_* log row for a slot, the self/admin guard, and the named reports.
 * A private folder (`_lib`), so Next never routes it.
 */

type Service = SupabaseClient;
export type TargetRow = Record<string, unknown> & { id: string };

/**
 * Only the columns a photo lives in, plus what the guards need. No emails.
 * An event (Oct 23, 2026): its cover key, its club (the log row's
 * `meta.org_id`, see imageLogScope) and its title for the panel.
 */
const SELECT: Record<ImageTargetType, string> = {
  user: "id, handle, is_platform_admin, avatar_url, banner_url, work_experience, current_on",
  org: "id, handle, name, logo_url, banner_url",
  channel: "id, type, name, photo_url",
  event: "id, org_id, title, cover_key",
};

export type Parsed = { type: ImageTargetType; id: string; slot: ImageSlot };

/** targetType + targetId + slot from a body or query, or a 400 response. */
export function parseTarget(
  rawType: unknown,
  rawId: unknown,
  rawSlot: unknown,
): { ok: true; value: Parsed } | { ok: false; response: Response } {
  if (!isImageTargetType(rawType)) {
    return { ok: false, response: adminFail(400, "invalid_body", "targetType must be user, org, channel or event") };
  }
  if (!isUuid(rawId)) return { ok: false, response: adminFail(400, "invalid_body", "targetId must be a uuid") };
  if (!isImageSlot(rawType, rawSlot)) {
    return { ok: false, response: adminFail(400, "invalid_body", `slot must be one of ${IMAGE_SLOTS[rawType].join(", ")}`) };
  }
  return { ok: true, value: { type: rawType, id: rawId, slot: rawSlot } };
}

/** The target row, read with the service role; null when it's gone. Throws on a read error. */
export async function readTarget(service: Service, type: ImageTargetType, id: string): Promise<TargetRow | null> {
  const { data, error } = await service.from(IMAGE_TARGET_TABLE[type]).select(SELECT[type]).eq("id", id).maybeSingle();
  if (error) throw new Error(`[admin/images read ${type}] ${error.message}`);
  return (data as TargetRow | null) ?? null;
}

/**
 * Nobody takes down their own photos here, and no admin takes down another
 * admin's (the restrict route's rule; admins can't act on each other).
 */
export function userGuard(type: ImageTargetType, id: string, adminId: string, row: TargetRow | null): Response | null {
  if (type !== "user") return null;
  if (id === adminId) return adminFail(403, "cannot_act_on_self", "You can't take down your own photos here.");
  if (row && row.is_platform_admin === true) {
    return adminFail(403, "cannot_act_on_admin", "That account is a platform admin. Remove the admin flag first.");
  }
  return null;
}

/**
 * A chat has a photo slot only when it is a group chat or already carries one.
 * An event has a cover slot only when it is a club's event (covers live in the
 * club's folder) or already carries one (Oct 23, 2026).
 */
export function hasSlot(type: ImageTargetType, slot: ImageSlot, row: TargetRow): boolean {
  if (type === "event") return slot === "cover" && (text(row.org_id) !== null || text(row.cover_key) !== null);
  if (type !== "channel") return true;
  return slot === "photo" && (row.type === "group" || text(row.photo_url) !== null);
}

export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Every logo ref on a user row, both JSON columns. */
export function logoRefsOf(row: TargetRow): LogoRef[] {
  return [...collectLogoRefs("work_experience", row.work_experience), ...collectLogoRefs("current_on", row.current_on)];
}

/** Each slot's value in the form the retry rules compare. */
export function slotValues(type: ImageTargetType, row: TargetRow): SlotValues {
  const out: SlotValues = {};
  for (const slot of IMAGE_SLOTS[type]) {
    const col = imageSlotColumn(type, slot);
    out[slot] = col ? text(row[col]) : logoValueKey(logoRefsOf(row));
  }
  return out;
}

/** The raw references a removal of this slot plans over. */
export function slotRefs(type: ImageTargetType, slot: ImageSlot, row: TargetRow): string[] {
  const col = imageSlotColumn(type, slot);
  if (col) {
    const v = text(row[col]);
    return v ? [v] : [];
  }
  return logoRefsOf(row).map((r) => r.url);
}

/** The newest image_remove / image_restore row naming this slot, or null. Throws on a read error. */
export async function latestImageRow(
  service: Service,
  type: ImageTargetType,
  id: string,
  slot: ImageSlot,
): Promise<ImageLogRow | null> {
  const { data, error } = await service
    .from("moderation_actions")
    .select("id, action, meta, created_at")
    .eq("target_type", type)
    .eq("target_id", id)
    .in("action", ["image_remove", "image_restore"])
    .contains("meta", { slots: [slot] })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`[admin/images latest] ${error.message}`);
  return ((data ?? [])[0] as ImageLogRow | undefined) ?? null;
}

/** The named report ids that are OPEN and about THIS target; the rest are ignored. */
export async function openReportIds(service: Service, type: ImageTargetType, id: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await service
    .from("reports")
    .select("id")
    .in("id", ids)
    .eq("status", "open")
    .eq("target_type", type)
    .eq("target_id", id);
  if (error) throw new Error(`[admin/images reports] ${error.message}`);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

/**
 * Close the named reports as `actioned`, scoped to this target and to open
 * ones. Best-effort: the photo is already down; a failure costs a stale row.
 */
export async function closeReports(
  service: Service,
  args: { adminId: string; type: ImageTargetType; id: string; ids: string[]; note: string },
): Promise<string[]> {
  if (args.ids.length === 0) return [];
  const { data, error } = await service
    .from("reports")
    .update({ status: "actioned", resolved_by: args.adminId, resolved_at: new Date().toISOString(), resolution_note: args.note })
    .in("id", args.ids)
    .eq("status", "open")
    .eq("target_type", args.type)
    .eq("target_id", args.id)
    .select("id");
  if (error) {
    console.error("[admin/images close reports]", error.message);
    return [];
  }
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}
