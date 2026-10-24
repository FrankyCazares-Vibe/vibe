import { NextResponse } from "next/server";

import {
  ADMIN_WRITE_LIMIT,
  adminFail,
  adminWriteKey,
  logModerationAction,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import {
  imageLogScope,
  type ImageLogRow,
  type ImageMeta,
  type ImageSlot,
  isSameTakedown,
  readImageMeta,
  restoreStep,
  scopeToLatestSlots,
} from "@/lib/moderation/media-quarantine-images";
import { releaseQuarantinedObjects } from "@/lib/moderation/media-quarantine-store";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { putBackSlots } from "../_lib/apply";
import { hasSlot, latestImageRow, parseTarget, readTarget, slotValues, userGuard } from "../_lib/target";

const MAX_REASON = 500;

type Body = { targetType?: unknown; targetId?: unknown; slot?: unknown; reason?: unknown; removalId?: unknown };

const NOT_LATEST =
  "A newer change to this photo came after this takedown, so nothing was put back. Open their Photos panel to see what's there now.";

/**
 * POST /api/admin/images/restore
 * Body: { targetType, targetId, slot, reason?, removalId? }
 *
 * Undo a photo takedown (an appeal the moderators granted, or a mistake).
 * `removalId` is the image_remove row the moderator pressed Put back on (the
 * Log tab sends its row id, the Photos panel the removal it shows). When the
 * newest row for the slot is not that removal, or a restore of it, the answer
 * is 409 not_latest and nothing moves: acting on the newest row would put
 * back a LATER takedown's picture. An event cover goes back like a club
 * banner: the key into the empty column, nothing moved (Oct 23, 2026).
 * The newest image row for the slot decides:
 *   - none, or nothing readable       → 200 changed:false
 *   - a restore within 10 minutes     → finish it (move back again, fill the
 *                                       empty column again), no second row
 *   - an older restore                → 200 nothing (never re-run days later:
 *                                       the student may have cleared it, or a
 *                                       report moved it back as evidence)
 *   - a removal, and they set a new   → 409 replaced_since: nothing is put
 *     photo since                        back; the removed one stays offline
 *   - a removal                       → LOG FIRST, move the files back from
 *                                       `quarantine`, then fill each column
 *                                       ONLY where it is still empty.
 * Older unused copies the removal swept (`meta.swept`) are not put back:
 * nothing used them. A restore of a club or chat photo just puts the private
 * key back; nothing moved. A removal that took one file down from two slots,
 * where one slot has a newer takedown since, is put back in the other slot
 * only (scopeToLatestSlots); the skipped slot counts as not put back.
 *
 * RESPONSES
 *   200 {ok, changed, finished, released, restored, not_put_back}
 *   400 · 401 · 403 cannot_act_on_self / cannot_act_on_admin · 404 · 409 replaced_since ·
 *   409 not_latest ·
 *   429 · 500 request_failed ("Nothing was changed.") · 500 media_still_quarantined
 */
export async function POST(req: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return adminFail(400, "invalid_body", "Invalid JSON");
  }
  const parsed = parseTarget(body.targetType, body.targetId, body.slot);
  if (!parsed.ok) return parsed.response;
  const { type, id, slot } = parsed.value;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, MAX_REASON) : "";
  const removalId = body.removalId === undefined || body.removalId === null ? null : body.removalId;
  if (removalId !== null && !isUuid(removalId)) return adminFail(400, "invalid_body", "removalId must be a uuid");
  const selfRefusal = userGuard(type, id, gate.userId, null);
  if (selfRefusal) return selfRefusal;

  const rl = await rateLimit(adminWriteKey(gate.userId), ADMIN_WRITE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many actions at once. Try again shortly.");

  const service = createSupabaseServiceClient();
  try {
    const row = await readTarget(service, type, id);
    if (!row || !hasSlot(type, slot, row)) return adminFail(404, "not_found", "Not found");
    const refusal = userGuard(type, id, gate.userId, row);
    if (refusal) return refusal;

    const latest = await latestImageRow(service, type, id, slot);
    if (!latest) return NextResponse.json({ ok: true, changed: false, finished: false, nothing: true });
    if (removalId !== null && !isSameTakedown(latest, removalId)) return adminFail(409, "not_latest", NOT_LATEST);
    // Other slots the row names keep a newer takedown of their own.
    const bySlot: Partial<Record<ImageSlot, ImageLogRow | null>> = { [slot]: latest };
    for (const s of readImageMeta(latest.meta)?.slots ?? []) {
      if (!(s in bySlot)) bySlot[s] = await latestImageRow(service, type, id, s);
    }
    const scoped = scopeToLatestSlots(latest, bySlot);
    const skipped = (readImageMeta(latest.meta)?.slots.length ?? 0) - (readImageMeta(scoped.meta)?.slots.length ?? 0);
    const step = restoreStep(scoped, slotValues(type, row), Date.now());
    if (step === "nothing") {
      return NextResponse.json({ ok: true, changed: false, finished: false, nothing: true });
    }
    if (step === "replaced") {
      return adminFail(
        409,
        "replaced_since",
        "They've set a new photo since, so nothing was put back. The removed one stays offline.",
      );
    }
    const meta = readImageMeta(scoped.meta) as ImageMeta;

    if (step === "new") {
      // LOG FIRST: a failed restore log would make the next Remove look like
      // a retry of the old removal and go unlogged.
      const logged = await logModerationAction(service, {
        actorId: gate.userId,
        action: "image_restore",
        targetType: type,
        targetId: id,
        reason,
        meta: {
          slots: meta.slots,
          removal_id: latest.id,
          previous: meta.previous,
          paths: meta.paths,
          handle: typeof row.handle === "string" ? row.handle : null,
          // An event cover's restore names the club too (imageLogScope), or
          // checkRemovedPicture would never see the put-back (Oct 23, 2026).
          ...imageLogScope(type, row, meta.previous.cover),
        },
      });
      if (!logged) return adminFail(500, "request_failed", "Couldn't record this, so nothing was changed. Try again.");
    }

    const released =
      meta.paths.length > 0 ? await releaseQuarantinedObjects(service, meta.paths) : { moved: 0, alreadyGone: 0, failed: [] };
    if (released.failed.length > 0) {
      return adminFail(500, "media_still_quarantined", "The photo is still held back. Press Put back again to finish.");
    }
    const put = await putBackSlots(service, type, id, meta);
    if (!put.ok) {
      return adminFail(500, "request_failed", "The file is back, but the page doesn't show it yet. Press Put back again to finish.");
    }
    return NextResponse.json({
      ok: true,
      changed: step === "new",
      finished: step === "finish",
      slots: meta.slots,
      released: released.moved,
      restored: put.changed,
      not_put_back: put.notPutBack + (step === "new" ? skipped : 0),
    });
  } catch (err) {
    console.error("[admin/images/restore]", err instanceof Error ? err.message : err);
    return adminFail(500, "request_failed", "Request failed");
  }
}
