import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_TITLE = 120;
const MAX_LOCATION = 200;
const MAX_NOTES = 1000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type CreateBody = {
  title?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  location?: unknown;
  notes?: unknown;
  color?: unknown;
};

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** List the viewer's personal events. Optional `from`/`to` ISO range. */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  let q = supabase
    .from("personal_events")
    .select("id,title,starts_at,ends_at,location,notes,color,created_at")
    .eq("user_id", user.id)
    .order("starts_at", { ascending: true })
    .limit(limit);

  if (from) q = q.gte("starts_at", from);
  if (to) q = q.lte("starts_at", to);

  const { data, error } = await q;
  if (error) {
    console.error("[personal-events GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, events: data ?? [] });
}

/** Create a personal event. */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
  }
  if (title.length > MAX_TITLE) {
    return NextResponse.json(
      { ok: false, error: `Title exceeds ${MAX_TITLE} characters` },
      { status: 400 },
    );
  }

  const startsAt = typeof body.starts_at === "string" ? body.starts_at.trim() : "";
  const startMs = Date.parse(startsAt);
  if (!Number.isFinite(startMs)) {
    return NextResponse.json(
      { ok: false, error: "Valid start time required" },
      { status: 400 },
    );
  }

  let endsAtIso: string | null = null;
  if (typeof body.ends_at === "string" && body.ends_at.trim()) {
    const endMs = Date.parse(body.ends_at.trim());
    if (!Number.isFinite(endMs)) {
      return NextResponse.json({ ok: false, error: "Invalid end time" }, { status: 400 });
    }
    if (endMs < startMs) {
      return NextResponse.json(
        { ok: false, error: "End time must be after start" },
        { status: 400 },
      );
    }
    endsAtIso = new Date(endMs).toISOString();
  }

  const location = typeof body.location === "string" ? body.location.trim() : "";
  if (location.length > MAX_LOCATION) {
    return NextResponse.json(
      { ok: false, error: `Location exceeds ${MAX_LOCATION} characters` },
      { status: 400 },
    );
  }
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (notes.length > MAX_NOTES) {
    return NextResponse.json(
      { ok: false, error: `Notes exceed ${MAX_NOTES} characters` },
      { status: 400 },
    );
  }

  const color =
    typeof body.color === "string" && HEX_COLOR.test(body.color.trim())
      ? body.color.trim()
      : "#FF5C35";

  const { data, error } = await supabase
    .from("personal_events")
    .insert({
      user_id: user.id,
      title,
      starts_at: new Date(startMs).toISOString(),
      ends_at: endsAtIso,
      location,
      notes,
      color,
    })
    .select("id,title,starts_at,ends_at,location,notes,color,created_at")
    .single();

  if (error || !data) {
    console.error("[personal-events POST]", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, event: data });
}
