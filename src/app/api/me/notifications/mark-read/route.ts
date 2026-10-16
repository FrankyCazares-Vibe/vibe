import { NextResponse } from "next/server";

import { limitFor } from "@/lib/limits/budgets";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = { ids?: unknown; all?: unknown };

/** The most ids one call may name. Today's clients only send `{ all: true }`. */
const MAX_IDS = 200;

/**
 * Mark notifications as read.
 *   { all: true }       → mark every unread for this user
 *   { ids: ["uuid",…] } → mark those specific rows (still scoped to viewer via RLS);
 *                         more than 200 is a 400, never a silent cut
 *
 * Returns the count actually updated so the client can keep its dot in
 * sync without a refetch.
 *
 * `{ all: true }` has no budget: both Otto panels send it by themselves
 * each time they open with something unread, so counting it would keep a
 * per-account record of when someone opens Otto (Privacy Policy 3d), and
 * it is one update of the caller's own rows, as a chat read mark is. Any
 * other body counts against the `markRead` budget
 * (src/lib/limits/budgets.ts) before any row is touched.
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
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, updated: count ?? 0 });
  }

  const rl = await limitFor("markRead", user.id);
  if (!rl.allowed) return tooManyRequests(rl, "Too many tries. Try again in a few minutes.");

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    if (body.ids.length > MAX_IDS) {
      return NextResponse.json(
        { ok: false, error: `Pass at most ${MAX_IDS} ids` },
        { status: 400 },
      );
    }
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
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, updated: count ?? 0 });
  }

  return NextResponse.json(
    { ok: false, error: "Pass { all: true } or { ids: [...] }" },
    { status: 400 },
  );
}
