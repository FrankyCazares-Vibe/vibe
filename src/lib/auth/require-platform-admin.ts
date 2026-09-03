import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

/**
 * Gate for operator-only route handlers (health probes, admin tooling).
 *
 * Session comes from the cookie/RLS client; the `is_platform_admin` flag is
 * read with the service client filtered to that user id, so it works even
 * when `authenticated` cannot select private `users` columns.
 *
 * 401 when signed out, 403 when signed in but not a platform admin.
 */
export async function requirePlatformAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; response: Response }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }

  if (!isSupabaseServiceConfigured()) {
    // Without the service role we cannot prove admin status; fail closed.
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 },
      ),
    };
  }

  const admin = createSupabaseServiceClient();
  const { data: row, error } = await admin
    .from("users")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[require-platform-admin] lookup failed", error.message);
  }

  if (!row?.is_platform_admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, userId: user.id };
}
