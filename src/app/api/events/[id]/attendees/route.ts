import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

type RsvpRow = {
  status: "going" | "maybe" | "no";
  created_at: string;
  user: {
    id: string;
    name: string | null;
    handle: string | null;
    avatar_url: string | null;
    major: string | null;
    year: number | null;
  } | null;
};

/**
 * Attendees on an event — gated to the event creator and (if the event is
 * scoped to an org) the org's owners/admins. Returns Going + Interested
 * lists separately so the caller can split the UI.
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing event id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: ev, error: evErr } = await supabase
    .from("events")
    .select("id,creator_id,org_id")
    .eq("id", id)
    .maybeSingle();
  if (evErr) {
    console.error("[events/:id/attendees event]", evErr);
    return NextResponse.json({ ok: false, error: evErr.message }, { status: 500 });
  }
  if (!ev) {
    return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
  }

  let allowed = ev.creator_id === user.id;
  if (!allowed && ev.org_id) {
    const { data: m } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", ev.org_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (m?.role === "owner" || m?.role === "admin") allowed = true;
  }
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("rsvps")
    .select(
      "status,created_at," +
        "user:users!rsvps_user_id_fkey!inner(id,name,handle,avatar_url,major,year)",
    )
    .eq("event_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[events/:id/attendees rsvps]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data as unknown as RsvpRow[]) ?? [];
  const going: RsvpRow[] = [];
  const interested: RsvpRow[] = [];
  for (const r of rows) {
    if (!r.user) continue;
    if (r.status === "going") going.push(r);
    else if (r.status === "maybe") interested.push(r);
  }

  return NextResponse.json({ ok: true, going, interested });
}
