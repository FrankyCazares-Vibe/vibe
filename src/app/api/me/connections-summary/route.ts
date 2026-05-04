import { NextResponse } from "next/server";

import { getCountsFor } from "@/lib/connections/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Counts (followers / following / connections) for the signed-in user. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const counts = await getCountsFor(supabase, user.id);
  return NextResponse.json({ ok: true, counts });
}
