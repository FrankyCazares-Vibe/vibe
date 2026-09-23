import { NextResponse } from "next/server";

import {
  ADMIN_WRITE_LIMIT,
  adminFail,
  adminWriteKey,
  logModerationAction,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Body = { reportIds?: unknown; resolution?: unknown; note?: unknown };

const RESOLUTIONS = new Set(["actioned", "dismissed"]);
const MAX_IDS = 100;
const MAX_NOTE = 2000;

type FoundRow = { id: string; status: string | null; target_type: string; target_id: string };

/**
 * POST /api/admin/reports/resolve
 * Body: { reportIds: string[], resolution: 'actioned'|'dismissed', note?: string }
 *
 * Close reports. `actioned` means we did something about it, `dismissed` means
 * we looked and it was fine — the report itself is the record either way, and
 * nothing here touches the content (that is `/api/admin/content/remove`).
 *
 * IDEMPOTENT ON PURPOSE. A report that is already resolved is left exactly as
 * it was and counted under `unchanged`; only rows still `open` move. The
 * screen fires this on a tap, and a slow network turning a double-tap into a
 * 409 would be our bug shown to a moderator as their mistake. Leaving an
 * already-resolved row alone also keeps the first decision's note and
 * timestamp, which is the one that is true.
 *
 * ORDER: gate → validate → rate limit → service-role write → one log row.
 * The log row is written only when something actually changed; an append-only
 * trail of no-ops is noise pretending to be history.
 *
 * RESPONSES
 *   200 {ok, resolved, unchanged, missing, logged}
 *   400 invalid_body · 401 · 403 · 404 not_found · 429 · 500 request_failed
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

  const rawIds = Array.isArray(body.reportIds) ? body.reportIds : [];
  const reportIds = [...new Set(rawIds.filter(isUuid))];
  if (reportIds.length === 0 || reportIds.length !== rawIds.length || reportIds.length > MAX_IDS) {
    return adminFail(400, "invalid_body", "reportIds must be 1-100 report ids");
  }
  const resolution = typeof body.resolution === "string" ? body.resolution : "";
  if (!RESOLUTIONS.has(resolution)) {
    return adminFail(400, "invalid_body", "resolution must be 'actioned' or 'dismissed'");
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE) : "";

  const rl = await rateLimit(adminWriteKey(gate.userId), ADMIN_WRITE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many actions at once. Try again shortly.");

  const service = createSupabaseServiceClient();

  // Read first so the answer can tell an already-closed report apart from one
  // that never existed. Service role: `reports` has no SELECT policy at all.
  const { data: foundData, error: foundErr } = await service
    .from("reports")
    .select("id, status, target_type, target_id")
    .in("id", reportIds);
  if (foundErr) {
    console.error("[admin/reports/resolve read]", foundErr.message);
    return adminFail(500, "request_failed", "Request failed");
  }
  const found = (foundData ?? []) as FoundRow[];
  if (found.length === 0) return adminFail(404, "not_found", "Not found");

  const openIds = found.filter((r) => (r.status ?? "open") === "open").map((r) => r.id);
  const unchanged = found.length - openIds.length;
  const missing = reportIds.length - found.length;

  let resolved = 0;
  if (openIds.length > 0) {
    const { data: updated, error: updErr } = await service
      .from("reports")
      .update({
        status: resolution,
        resolved_by: gate.userId,
        resolved_at: new Date().toISOString(),
        resolution_note: note || null,
      })
      .in("id", openIds)
      .eq("status", "open")
      .select("id");
    if (updErr) {
      console.error("[admin/reports/resolve update]", updErr.message);
      return adminFail(500, "request_failed", "Request failed");
    }
    resolved = (updated ?? []).length;
  }

  let logged = true;
  if (resolved > 0) {
    // One row for the whole call. When every report named the same thing the
    // log points at that thing; a mixed batch points at the reports instead,
    // rather than at whichever one happened to come back first.
    const first = found[0];
    const sameTarget = found.every(
      (r) => r.target_type === first.target_type && r.target_id === first.target_id,
    );
    logged = await logModerationAction(service, {
      actorId: gate.userId,
      action: resolution === "actioned" ? "report_action" : "report_dismiss",
      targetType: sameTarget ? first.target_type : "report",
      targetId: sameTarget ? first.target_id : first.id,
      reportId: first.id,
      reason: note || null,
      meta: { report_ids: openIds, resolution, resolved, unchanged, missing },
    });
  }

  return NextResponse.json({ ok: true, resolved, unchanged, missing, logged });
}
