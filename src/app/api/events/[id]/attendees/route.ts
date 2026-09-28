import { NextResponse } from "next/server";

import { isUuid } from "@/lib/pgrest";
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
 * Attendees on an event, for whoever manages it: a CLUB event's CURRENT
 * owners/admins (never its creator as such, so a demoted or removed officer
 * loses the list the moment their role changes), an org-less event's creator.
 * Returns Going + Interested lists separately so the caller can split the UI.
 *
 * THE DATABASE DECIDES (security wave 2, #12): the gate is the same
 * public.can_manage_event() that rsvps_select_own_or_manager uses to show
 * these rows, so the route and the policy can't disagree. A TypeScript copy
 * that let the creator in would have answered 200 with an empty list.
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  // A malformed id would reach PostgREST as 22P02 and answer 500.
  if (!id || !isUuid(id)) {
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
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (evErr) {
    console.error("[events/:id/attendees event]", evErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!ev) {
    return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
  }

  const { data: canManage, error: manageErr } = await supabase.rpc("can_manage_event", {
    p_event_id: id,
  });
  if (manageErr) {
    console.error("[events/:id/attendees can_manage_event]", manageErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (canManage !== true) {
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
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
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
