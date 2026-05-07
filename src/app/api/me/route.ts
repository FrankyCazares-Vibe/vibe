import { NextResponse } from "next/server";

import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DeleteBody = { confirm_handle?: unknown };

/**
 * Permanent account deletion. Required for legal compliance with .edu
 * email hosting + lets users exercise the right-to-be-forgotten.
 *
 * Flow:
 *   1. Verify the signed-in user.
 *   2. Require `confirm_handle` to match the user's actual handle — guards
 *      against accidental double-clicks and confused-deputy attacks (a
 *      malicious site can't trigger this without knowing the handle).
 *   3. Delete the auth user via the service role. The `users` row +
 *      everything that references it (posts, connections, reactions, …)
 *      cascade via the existing FK constraints.
 *   4. Sign the cookie session out so the next request goes to /login.
 */
export async function DELETE(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: DeleteBody;
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const confirm =
    typeof body.confirm_handle === "string" ? body.confirm_handle.trim().toLowerCase() : "";
  if (!confirm) {
    return NextResponse.json(
      { ok: false, error: "Type your handle to confirm" },
      { status: 400 },
    );
  }

  const { data: row, error: lookupErr } = await supabase
    .from("users")
    .select("handle")
    .eq("id", user.id)
    .maybeSingle();
  if (lookupErr) {
    console.error("[me.DELETE lookup]", lookupErr);
    return NextResponse.json({ ok: false, error: lookupErr.message }, { status: 500 });
  }
  const actualHandle = String(row?.handle ?? "").trim().toLowerCase();
  if (!actualHandle || confirm !== actualHandle) {
    return NextResponse.json(
      { ok: false, error: "Handle confirmation didn't match" },
      { status: 400 },
    );
  }

  if (!isSupabaseServiceConfigured()) {
    console.error("[me.DELETE] missing SUPABASE_SERVICE_ROLE_KEY");
    return NextResponse.json(
      { ok: false, error: "Account deletion not configured" },
      { status: 500 },
    );
  }

  // Service role required: deleting an auth user is admin-scope.
  // The public.users row + all FK-cascaded content (posts, connections,
  // reactions, reposts, channel memberships, etc.) drop with it.
  const admin = createSupabaseServiceClient();
  const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
  if (deleteErr) {
    console.error("[me.DELETE auth.admin.deleteUser]", deleteErr);
    return NextResponse.json({ ok: false, error: deleteErr.message }, { status: 500 });
  }

  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
