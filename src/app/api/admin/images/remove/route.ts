import { NextResponse } from "next/server";

import {
  ADMIN_WRITE_LIMIT,
  adminFail,
  adminWriteKey,
  logModerationAction,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import {
  CACHE_NOTE,
  type ImageMeta,
  type ImageSlot,
  imageSlotColumn,
  isPublicImageSlot,
  leftNotes,
  planImageRemoval,
  PRIVATE_CACHE_NOTE,
  readImageMeta,
  removalStep,
} from "@/lib/moderation/media-quarantine-images";
import { quarantineProfilesObjects } from "@/lib/moderation/media-quarantine-store";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getSupabaseUrl } from "@/lib/supabase/env";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { clearSlots } from "../_lib/apply";
import { isSlotToken, slotStillMatches, STALE_PANEL_MESSAGE } from "../_lib/slot-token";
import { sweepOlderCopies } from "../_lib/sweep";
import {
  closeReports,
  hasSlot,
  latestImageRow,
  logoRefsOf,
  openReportIds,
  parseTarget,
  readTarget,
  slotRefs,
  slotValues,
  text,
  userGuard,
} from "../_lib/target";

const MAX_REASON = 500;
const MAX_IDS = 100;

type Body = {
  targetType?: unknown;
  targetId?: unknown;
  slot?: unknown;
  reason?: unknown;
  reportIds?: unknown;
  expected?: unknown;
};

/**
 * POST /api/admin/images/remove
 * Body: { targetType: 'user'|'org'|'channel', targetId, slot, reason, expected, reportIds? }
 *
 * Take a photo down: a student's profile photo, cover or experience /
 * working-on logos; a club's logo or banner; a group chat's photo.
 *
 * LOG FIRST, THEN ACT. The column is cleared, so the log row's
 * `meta.previous` is the only record of what was there (for a club or chat
 * photo, the private R2 key has no other trace at all). A failed log insert
 * is a 500 "Nothing was changed." — never a removal nobody can undo.
 * ORDER: gate → body → self guard → rate limit → read → admin guard → the
 * slot still holds what the panel showed → newest image row for the slot →
 * (a) named reports checked → (b) plan → (c) LOG →
 * (d) move the student's own files into `quarantine` → (e) clear the column
 * (compare-and-set) → (f) close the named reports.
 *
 * PRESSING AGAIN FINISHES. When the newest row for this slot is a removal
 * and nothing was set since, (d)-(f) run again from that row, with no second
 * log row (moves are idempotent, the clear is compare-and-set). The same
 * value back in the slot counts as "nothing set since" only when that removal
 * moved the picture offline; a club/chat key kept as evidence, another
 * account's file or an outside address put back is live again, so it gets a
 * new row (removalStep).
 *
 * ONLY NAMED REPORTS CLOSE. The Users and Clubs screens send none, and a
 * report card sends only the reports the moderator ticked, so a person's
 * open reports about something else stay in the queue. The answer lists the
 * ids it closed (`resolvedReportIds`) so the card drops exactly those.
 *
 * WHAT YOU SAW IS WHAT COMES DOWN. `expected` is the slot's token from
 * GET /api/admin/images (a hash of the value the panel showed). When the
 * slot holds something else now (the student set a new photo while the panel
 * sat open), the answer is 409 stale_panel and nothing is logged or moved.
 *
 * RESPONSES
 *   200 {ok, changed, finished, quarantined, swept, left_online, notes[], resolvedReports,
 *        resolvedReportIds[]}
 *   400 invalid_body · 401 · 403 cannot_act_on_self / cannot_act_on_admin ·
 *   404 not_found · 409 stale_panel · 429 · 500 request_failed ("Nothing was changed.") ·
 *   500 media_still_online (logged; press Take down again to finish)
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
  if (!reason) return adminFail(400, "invalid_body", "Write why it's coming down first.");
  const rawIds = Array.isArray(body.reportIds) ? body.reportIds : [];
  const reportIds = [...new Set(rawIds.filter(isUuid))];
  if (reportIds.length !== rawIds.length || reportIds.length > MAX_IDS) {
    return adminFail(400, "invalid_body", "reportIds must be up to 100 report ids");
  }
  if (!isSlotToken(body.expected)) {
    return adminFail(400, "invalid_body", "Refresh the panel and look again before taking a photo down.");
  }
  const expected = body.expected;
  const selfRefusal = userGuard(type, id, gate.userId, null);
  if (selfRefusal) return selfRefusal;

  const rl = await rateLimit(adminWriteKey(gate.userId), ADMIN_WRITE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many actions at once. Try again shortly.");

  const service = createSupabaseServiceClient();
  const supabaseUrl = getSupabaseUrl();
  try {
    const row = await readTarget(service, type, id);
    if (!row || !hasSlot(type, slot, row)) return adminFail(404, "not_found", "Not found");
    const refusal = userGuard(type, id, gate.userId, row);
    if (refusal) return refusal;

    const current = slotValues(type, row);
    if (!slotStillMatches(expected, type, id, slot, current[slot] ?? null)) {
      return adminFail(409, "stale_panel", STALE_PANEL_MESSAGE);
    }
    const latest = await latestImageRow(service, type, id, slot);
    const step = removalStep(latest, slot, current);
    const validIds = await openReportIds(service, type, id, reportIds);
    if (step === "nothing") {
      return NextResponse.json({
        ok: true,
        changed: false,
        finished: false,
        nothing: true,
        resolvedReports: 0,
        resolvedReportIds: [],
      });
    }

    let meta: ImageMeta;
    if (step === "finish") {
      meta = readImageMeta(latest?.meta) as ImageMeta;
    } else {
      // (b) One file shown in both the photo and cover slot comes down once, for both.
      const slots: ImageSlot[] = [slot];
      if (type === "user" && (slot === "avatar" || slot === "banner")) {
        const other: ImageSlot = slot === "avatar" ? "banner" : "avatar";
        if (current[other] !== null && current[other] === current[slot]) slots.push(other);
      }
      const refs = slots.flatMap((s) => slotRefs(type, s, row));
      const plan = planImageRemoval({ slot, refs, ownerId: type === "user" ? id : null, supabaseUrl });
      const previous: ImageMeta["previous"] = {};
      for (const s of slots) {
        if (s === "logos") previous.logos = logoRefsOf(row);
        else previous[s] = text(row[imageSlotColumn(type, s) ?? ""]) ?? undefined;
      }
      const swept =
        type === "user" && slot !== "logos" ? await sweepOlderCopies(service, id, row, slots, plan.paths, supabaseUrl) : [];
      meta = { slots, previous, paths: plan.paths, swept, left: plan.left, removalId: null };
      // (c) LOG FIRST.
      const logged = await logModerationAction(service, {
        actorId: gate.userId,
        action: "image_remove",
        targetType: type,
        targetId: id,
        reportId: validIds[0] ?? null,
        reason,
        meta: {
          slots,
          previous,
          paths: plan.paths,
          swept,
          left: plan.left,
          foreign_owners: plan.foreignOwners,
          requested_report_ids: validIds,
          handle: typeof row.handle === "string" ? row.handle : null,
        },
      });
      if (!logged) return adminFail(500, "request_failed", "Couldn't record this, so nothing was changed. Try again.");
    }

    // (d) Own files into quarantine (profile slots only; R2 keys stay put).
    const moves = [...meta.paths, ...meta.swept];
    const moved = moves.length > 0 ? await quarantineProfilesObjects(service, moves) : { moved: 0, alreadyGone: 0, failed: [] };
    if (moved.failed.length > 0) {
      return adminFail(500, "media_still_online", "The photo may still be online. Press Take down again to finish.");
    }
    // (e) Clear the column(s), compare-and-set.
    const cleared = await clearSlots(service, type, id, meta);
    if (!cleared.ok) {
      return adminFail(500, "request_failed", "The file is offline, but the page may still show it. Press Take down again to finish.");
    }
    // (f) Close only the named, open reports about this target.
    const closed = await closeReports(service, { adminId: gate.userId, type, id, ids: validIds, note: reason });

    const left = meta.left;
    const notes = leftNotes(left);
    notes.push(isPublicImageSlot(type) ? CACHE_NOTE : PRIVATE_CACHE_NOTE);
    const leftOnline = left.post + left.other + left.foreign + left.external;
    return NextResponse.json({
      ok: true,
      changed: step === "new",
      finished: step === "finish",
      slots: meta.slots,
      quarantined: moved.moved,
      swept: meta.swept.length,
      left_online: leftOnline,
      notes,
      resolvedReports: closed.length,
      resolvedReportIds: closed,
    });
  } catch (err) {
    console.error("[admin/images/remove]", err instanceof Error ? err.message : err);
    return adminFail(500, "request_failed", "Request failed");
  }
}

