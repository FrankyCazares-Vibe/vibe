import { NextResponse } from "next/server";

import {
  ADMIN_WRITE_LIMIT,
  adminFail,
  adminWriteKey,
  logModerationAction,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import { getActiveRestriction } from "@/lib/moderation/access";
import { restrictUser } from "@/lib/moderation/actions";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ id: string }> };
type Body = { kind?: unknown; days?: unknown; reasonCode?: unknown; note?: unknown };

const KINDS = new Set(["suspension", "ban"]);
const REASON_CODE_RE = /^[a-z][a-z0-9_]{1,39}$/;
const MAX_NOTE = 2000;
const MIN_DAYS = 1;
const MAX_DAYS = 365;

/**
 * Which HTTP status a failure from batch B's helper deserves.
 *
 * `no_identity` is a refusal, not a fault — the account has no address to key a
 * restriction on — so it is a 409 and never lands in the server log as an error.
 * Anything not named here is a real fault and falls through to 500.
 */
const STATUS_BY_CODE: Record<string, number> = {
  not_configured: 503,
  not_found: 404,
  no_identity: 409,
};

/**
 * POST /api/admin/users/[id]/restrict
 * Body: { kind: 'suspension'|'ban', days?: 1-365, reasonCode, note? }
 *
 * Suspend a student for a while, or ban them for good. A suspension has an end
 * date and leaves Vibe+ billing alone; a ban is permanent, stops sign-in, and
 * stops the billing too (Franky's decision 7).
 *
 * `reasonCode` IS CHECKED FOR SHAPE, NOT AGAINST A LIST — but the picker must
 * still send one of `RESTRICTION_REASON_CODES` (src/lib/moderation/reports.ts),
 * because that is the list /account/suspended turns into the sentence the
 * student reads. Any other token stores fine and shows them the generic
 * fallback instead of the plain reason decision 1 promises. Whether an unknown
 * code should be a 400 here is Franky's call, not this route's.
 *
 * ALL OF THE WORK BELONGS TO BATCH B. The restriction rows, the keyed hash of
 * the school address, the `app_metadata` mirror, the GoTrue ban and the Stripe
 * teardown all live in `restrictUser`. This route decides WHO may do it
 * and WHETHER the request makes sense, then says what happened. A second copy
 * of any of those steps here is how two half-applied bans start disagreeing.
 *
 * A PARTIAL APPLY IS NOT A 500. If the rows landed but, say, the billing
 * teardown did not, the answer is 200 with `incomplete: ['billing']` — the
 * student IS restricted, and the moderator is told the one step to retry
 * instead of a red error that suggests nothing happened.
 *
 * NOBODY RESTRICTS THEMSELVES, AND NO ADMIN RESTRICTS ANOTHER. Both are
 * checked here, against `is_platform_admin` read with the service role AT THIS
 * MOMENT — the flag is set by hand in SQL, so the queue a moderator is looking
 * at may have been drawn before it changed.
 *
 * ONE RESTRICTION AT A TIME. If something is already in force this refuses
 * rather than stacking a second row on top. Stacking is how the two records of
 * the truth start disagreeing: `restrictUser` rewrites the `app_metadata`
 * mirror unconditionally, so a 3-day suspension laid over a ban would give the
 * proxy an end date it honours while the ban row — and the queue — still say
 * banned. It also makes a double tap on a slow connection harmless instead of
 * a second Stripe teardown. To change a restriction, lift it and set the new one.
 *
 * RESPONSES
 *   200 {ok, kind, endsAt, restrictionId, incomplete, logged}
 *   400 invalid_body · 400 invalid_id · 401 · 403 cannot_restrict_self ·
 *   403 cannot_restrict_admin · 403 already_restricted · 404 not_found ·
 *   409 no_identity · 429 · 503 not_configured · 500 request_failed
 */
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  if (!isUuid(id)) return adminFail(400, "invalid_id", "Invalid id");
  if (id === gate.userId) {
    return adminFail(403, "cannot_restrict_self", "You can't restrict your own account.");
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return adminFail(400, "invalid_body", "Invalid JSON");
  }

  const kind = typeof body.kind === "string" ? body.kind : "";
  if (!KINDS.has(kind)) {
    return adminFail(400, "invalid_body", "kind must be 'suspension' or 'ban'");
  }
  const hasDays = body.days !== undefined && body.days !== null;
  if (kind === "ban" && hasDays) {
    // A ban has no end date. Accepting one and ignoring it would let the
    // screen show a date that nothing enforces.
    return adminFail(400, "invalid_body", "A ban is permanent — don't send days");
  }
  let days: number | null = null;
  if (kind === "suspension") {
    const n = typeof body.days === "number" ? Math.floor(body.days) : NaN;
    if (!Number.isFinite(n) || n < MIN_DAYS || n > MAX_DAYS) {
      return adminFail(400, "invalid_body", `days must be ${MIN_DAYS}-${MAX_DAYS}`);
    }
    days = n;
  }
  const reasonCode = typeof body.reasonCode === "string" ? body.reasonCode.trim() : "";
  if (!REASON_CODE_RE.test(reasonCode)) {
    return adminFail(400, "invalid_body", "reasonCode is required");
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE) : "";

  const rl = await rateLimit(adminWriteKey(gate.userId), ADMIN_WRITE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many actions at once. Try again shortly.");

  const service = createSupabaseServiceClient();
  const { data: targetRow, error: targetErr } = await service
    .from("users")
    .select("id, handle, is_platform_admin")
    .eq("id", id)
    .maybeSingle();
  if (targetErr) {
    console.error("[admin/users/[id]/restrict target]", targetErr.message);
    return adminFail(500, "request_failed", "Request failed");
  }
  if (!targetRow) return adminFail(404, "not_found", "Not found");
  const target = targetRow as { handle: string | null; is_platform_admin: boolean | null };
  if (target.is_platform_admin) {
    return adminFail(
      403,
      "cannot_restrict_admin",
      "That account is a platform admin. Remove the admin flag first.",
    );
  }

  // Read what is in force RIGHT NOW, for the same reason the admin flag is read
  // here and not taken from the queue: the queue may have been drawn before
  // another moderator acted. A failed read is fatal — laying a suspension over
  // a ban we could not see is exactly the case this check exists to stop.
  const live = await getActiveRestriction(id);
  if (!live.ok) return adminFail(500, "request_failed", "Request failed");
  if (live.restriction) {
    const word = live.restriction.kind === "ban" ? "banned" : "suspended";
    return adminFail(
      403,
      "already_restricted",
      `That account is already ${word}. Lift it first if you want to change it.`,
    );
  }

  const result = await restrictUser({
    userId: id,
    kind: kind as "suspension" | "ban",
    days,
    reasonCode,
    note: note || null,
    actorId: gate.userId,
  });
  if (!result.ok) {
    const status = STATUS_BY_CODE[result.code] ?? 500;
    if (status === 500) console.error("[admin/users/[id]/restrict apply]", result.code);
    return adminFail(status, result.code, result.error);
  }

  const incomplete = result.incomplete;
  const logged = await logModerationAction(service, {
    actorId: gate.userId,
    action: kind === "ban" ? "user_ban" : "user_suspend",
    targetType: "user",
    targetId: id,
    reason: reasonCode,
    meta: {
      handle: target.handle,
      days,
      ends_at: result.endsAt,
      restriction_id: result.restrictionId,
      // The note itself lives on the restriction row, which is where an
      // appeal gets read. One private sentence, one home.
      has_note: !!note,
      incomplete,
    },
  });

  return NextResponse.json({
    ok: true,
    kind,
    endsAt: result.endsAt,
    restrictionId: result.restrictionId,
    incomplete,
    logged,
  });
}
