import { NextResponse } from "next/server";

import { postAccessForCaller } from "@/lib/orgs/hidden-org-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Record a view on a post or clip. Per-user-per-day dedupe (UTC), enforced
 * inside the SECURITY DEFINER `record_post_view_as` RPC. Refreshing the same
 * post on the same day is a no-op; viewing it the next day counts again.
 *
 * WHY THE SERVICE ROLE (20261016120000). `record_post_view_as` takes the
 * account from here: the id the sign-in server verified (`getUser()`). It
 * refuses anon and authenticated inside (42501), so no browser can call it
 * and count views as anyone. The old `record_post_view` ran with the
 * person's own sign-in and could be called straight from the database's web
 * interface; after the deploy it answers false for everyone (20261016130000).
 *
 * `counted: false` covers every case where no row was written: a signed-out
 * viewer, a repeat view on the same day, a post that no longer exists, the
 * author looking at their own post, and a person past the day cap (5,000
 * posts a UTC day, counted in the database from that day's view rows: no
 * limiter key here, which would keep a record of when each person was
 * viewing, Privacy Policy 3d). Clients must not treat it as an error; the
 * campus post viewer uses it to decide whether to tick its local number,
 * which is exactly why an author's own view must answer false.
 *
 * A hidden club's post the caller may not see is one more `counted: false`
 * (postAccessForCaller, which also stops a blocked pair): the RPC is never
 * called, so no view row is written and no counter moves, and the answer is
 * the one a missing post gets. The RPC checks the hidden club again, against
 * the id it is given.
 *
 * Fire-and-forget from the client — failures are non-fatal.
 */
export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    // Anonymous viewers don't count yet — don't 401, just no-op so the
    // client doesn't have to special-case signed-out paths.
    return NextResponse.json({ ok: true, counted: false });
  }

  const access = await postAccessForCaller(supabase, id, user.id, "[posts/:id/view POST post check]");
  if (!access.ok) {
    if (access.reason === "error") {
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, counted: false });
  }

  let data: unknown;
  let error: { code?: string; message?: string } | null;
  try {
    ({ data, error } = await createSupabaseServiceClient().rpc("record_post_view_as", {
      p_user: user.id,
      p_post_id: id,
    }));
  } catch (err) {
    console.error("[posts/:id/view POST]", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  if (error) {
    console.error("[posts/:id/view POST]", error.code ?? "unknown", error.message);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, counted: data === true });
}
