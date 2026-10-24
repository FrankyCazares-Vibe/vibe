import { NextResponse } from "next/server";

import { ADMIN_READ_LIMIT, adminFail, requirePlatformAdmin } from "@/lib/auth/require-platform-admin";
import {
  classifyImageRef,
  IMAGE_SLOTS,
  imageSlotLabel,
  type ImageTargetType,
  isImageTargetType,
  isPublicImageSlot,
  latestPerSlot,
  readImageMeta,
} from "@/lib/moderation/media-quarantine-images";
import { QUARANTINE_BUCKET_ID } from "@/lib/moderation/media-quarantine";
import { isUuid } from "@/lib/pgrest";
import { isR2Configured, signGroupPhotoGetUrl, signOrgAssetGetUrl } from "@/lib/r2";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getSupabaseUrl } from "@/lib/supabase/env";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { slotToken } from "./_lib/slot-token";
import { hasSlot, readTarget, slotRefs, slotValues, text } from "./_lib/target";

/** Short on purpose: a moderator looks, decides, and the link dies. */
const PREVIEW_SEC = 120;

type Service = ReturnType<typeof createSupabaseServiceClient>;

/**
 * GET /api/admin/images?type=user|org|channel|event&id=<uuid>
 *
 * The photo slots of one account, club, group chat or event, for the
 * moderator's panel: what is up now (with a way to look at it) and whether
 * the newest action on each slot is a removal (so the panel offers Restore).
 *
 * Reads only the photo columns (users: avatar, cover, the two logo JSON
 * lists; orgs: logo, banner; channels: type, photo; events since Oct 23,
 * 2026: club, title, cover), with the service role.
 * No emails, no other profile fields. Previews: a public `profiles` file is
 * its own address; a private club/chat/event key gets a 2-minute signed
 * link; a removed file gets a 2-minute signed link out of `quarantine`, and
 * a removed club, chat or event key one from R2 (it stays there). An outside
 * address is never loaded by the panel (it would tell that site the
 * moderator's IP); it comes back as a link to open on purpose.
 *
 * Each slot carries `token`, a hash of its value as read here (slot-token.ts).
 * The panel sends it back with Take down, and the remove route answers 409
 * when the slot holds something else by then: nobody takes down a photo
 * they never saw.
 *
 * RESPONSES 200 {target:{type,id,name}, slots:[…]} · 400 · 401 · 403 · 404 · 429 · 500
 */
export async function GET(req: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");
  if (!isImageTargetType(type)) return adminFail(400, "invalid_query", "type must be user, org, channel or event");
  if (!isUuid(id)) return adminFail(400, "invalid_query", "id must be a uuid");

  const rl = await rateLimit(`admin-images:${gate.userId}`, ADMIN_READ_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Slow down a moment.");

  const service = createSupabaseServiceClient();
  const supabaseUrl = getSupabaseUrl();
  try {
    const row = await readTarget(service, type, id);
    if (!row) return adminFail(404, "not_found", "Not found");

    const { data: logRows, error } = await service
      .from("moderation_actions")
      .select("id, action, meta, reason, created_at")
      .eq("target_type", type)
      .eq("target_id", id)
      .in("action", ["image_remove", "image_restore"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(`[admin/images log] ${error.message}`);
    const latest = latestPerSlot((logRows ?? []) as Array<{ id: string; action: string; meta: unknown }>);

    const ownerId = type === "user" ? id : null;
    const values = slotValues(type, row);
    const slots = [];
    for (const slot of IMAGE_SLOTS[type]) {
      if (!hasSlot(type, slot, row)) continue;
      const current = [];
      for (const ref of slotRefs(type, slot, row)) {
        const verdict = classifyImageRef(ref, slot, ownerId, supabaseUrl);
        const external = verdict.kind === "external";
        current.push({
          kind: verdict.kind,
          viewUrl: external ? null : await viewUrl(ref, verdict.kind === "private", supabaseUrl),
          href: external && /^https?:\/\//i.test(ref.trim()) ? ref.trim() : null,
        });
      }
      const last = latest[slot] as { id: string; action: string; meta: unknown; reason?: string; created_at?: string } | undefined;
      let removed = null;
      if (last && last.action === "image_remove") {
        const meta = readImageMeta(last.meta);
        const prev = meta?.previous[slot];
        removed = {
          actionId: last.id,
          at: last.created_at ?? null,
          reason: typeof last.reason === "string" ? last.reason : "",
          slots: meta?.slots ?? [slot],
          previewUrl: meta?.paths[0]
            ? await quarantineUrl(service, meta.paths[0])
            : typeof prev === "string" && classifyImageRef(prev, slot, ownerId, supabaseUrl).kind === "private"
              ? await viewUrl(prev, true, supabaseUrl)
              : null,
        };
      }
      slots.push({
        slot,
        label: imageSlotLabel(type, slot),
        isPublic: isPublicImageSlot(type),
        token: slotToken(type, id, slot, values[slot] ?? null),
        current,
        removed,
      });
    }
    return NextResponse.json({ target: { type, id, name: nameOf(type, row) }, slots });
  } catch (err) {
    console.error("[admin/images GET]", err instanceof Error ? err.message : err);
    return adminFail(500, "request_failed", "Request failed");
  }
}

function nameOf(type: ImageTargetType, row: Record<string, unknown>): string | null {
  if (type === "channel") return text(row.name);
  if (type === "event") return text(row.title);
  const handle = text(row.handle);
  return handle ? `@${handle}` : null;
}

/** A viewable address for a stored reference; null when there is none we'd load. */
async function viewUrl(ref: string, isPrivate: boolean, supabaseUrl: string): Promise<string | null> {
  const value = ref.trim();
  if (isPrivate) {
    if (!isR2Configured()) return null;
    try {
      if (value.startsWith("orgs/")) return await signOrgAssetGetUrl(value, PREVIEW_SEC);
      if (value.startsWith("groups/")) return await signGroupPhotoGetUrl(value, PREVIEW_SEC);
    } catch (err) {
      console.error("[admin/images sign]", err instanceof Error ? err.message : err);
    }
    return null;
  }
  if (/^[0-9a-f-]{36}\//.test(value)) return `${supabaseUrl}/storage/v1/object/public/profiles/${value}`;
  try {
    const u = new URL(value);
    return u.origin === new URL(supabaseUrl).origin ? value : null;
  } catch {
    return null;
  }
}

async function quarantineUrl(service: Service, path: string): Promise<string | null> {
  const { data, error } = await service.storage.from(QUARANTINE_BUCKET_ID).createSignedUrl(path, PREVIEW_SEC);
  if (error) return null;
  return data?.signedUrl ?? null;
}

