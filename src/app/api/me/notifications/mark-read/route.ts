import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = { ids?: unknown; all?: unknown };

/**
 * Mark notifications as read.
 *   { all: true }       → mark every unread for this user
 *   { ids: ["uuid",…] } → mark those specific rows (still scoped to viewer via RLS)
 *
 * Returns the count actually updated so the client can keep its dot in
 * sync without a refetch.
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
    body = {};
  }

  const nowIso = new Date().toISOString();

  if (body.all === true) {
    const { error, count } = await supabase
      .from("notifications")
      .update({ read_at: nowIso }, { count: "exact" })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) {
      console.error("[notifications/mark-read all]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, updated: count ?? 0 });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    const ids = body.ids.filter((x) => typeof x === "string") as string[];
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }
    const { error, count } = await supabase
      .from("notifications")
      .update({ read_at: nowIso }, { count: "exact" })
      .eq("user_id", user.id)
      .in("id", ids)
      .is("read_at", null);
    if (error) {
      console.error("[notifications/mark-read ids]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, updated: count ?? 0 });
  }

  return NextResponse.json(
    { ok: false, error: "Pass { all: true } or { ids: [...] }" },
    { status: 400 },
  );
}
