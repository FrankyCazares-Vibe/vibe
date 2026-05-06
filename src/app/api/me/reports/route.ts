import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  target_type?: unknown;
  target_id?: unknown;
  reason_code?: unknown;
  reason?: unknown;
};

const ALLOWED_TARGETS: ReadonlySet<string> = new Set(["user", "post", "message", "channel"]);
const ALLOWED_CODES: ReadonlySet<string> = new Set([
  "spam",
  "harassment",
  "sexual",
  "hate",
  "self_harm",
  "other",
]);

const MAX_REASON = 1000;

/**
 * File a report. INSERT-only for non-admins; admins query the table via
 * the service role.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const targetType = typeof body.target_type === "string" ? body.target_type : "";
  const targetId = typeof body.target_id === "string" ? body.target_id : "";
  const reasonCode = typeof body.reason_code === "string" ? body.reason_code : "";
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, MAX_REASON) : "";

  if (!ALLOWED_TARGETS.has(targetType)) {
    return NextResponse.json({ ok: false, error: "Invalid target_type" }, { status: 400 });
  }
  if (!targetId) {
    return NextResponse.json({ ok: false, error: "Missing target_id" }, { status: 400 });
  }
  if (!ALLOWED_CODES.has(reasonCode)) {
    return NextResponse.json({ ok: false, error: "Invalid reason_code" }, { status: 400 });
  }

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: targetType,
    target_id: targetId,
    reason_code: reasonCode,
    reason,
  });

  if (error) {
    console.error("[reports.POST]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
