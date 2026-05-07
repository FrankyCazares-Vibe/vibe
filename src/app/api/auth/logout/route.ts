import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sign the current user out. Idempotent — calling without a session is a
 * no-op success. The cookie session is cleared via the SSR helper so the
 * next page navigation lands on `/auth/login`.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
