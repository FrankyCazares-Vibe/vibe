import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const TITLE_MAX = 240;
const BODY_MAX = 1000;

/**
 * POST /api/me/otto/reminders
 * Body: { title: string, remind_at?: string | null, body?: string | null }
 *
 * Manual reminder create from the "Tell otto something" input. Client parses
 * time phrases via parse-reminder and ships the resolved ISO string in
 * `remind_at`. Undated reminders (no time recognized) go to the "Asking for
 * you" section; dated ones go to "Coming up".
 *
 * `kind` is always 'manual' here — system-generated kinds (rsvp / mention /
 * milestone / unanswered_dm / connection) come from background jobs, not
 * the API surface.
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

  let body: { title?: unknown; body?: unknown; remind_at?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
  if (!rawTitle) {
    return NextResponse.json({ ok: false, error: "Title required" }, { status: 400 });
  }
  const title = rawTitle.slice(0, TITLE_MAX);

  const rawBody = typeof body.body === "string" ? body.body.trim() : "";
  const bodyText = rawBody ? rawBody.slice(0, BODY_MAX) : null;

  let remindAt: string | null = null;
  if (typeof body.remind_at === "string" && body.remind_at.length > 0) {
    const t = new Date(body.remind_at);
    if (!Number.isNaN(t.getTime())) remindAt = t.toISOString();
  }

  const { data, error } = await supabase
    .from("otto_reminders")
    .insert({
      user_id: user.id,
      kind: "manual",
      title,
      body: bodyText,
      remind_at: remindAt,
    })
    .select("id,title,body,remind_at,created_at,dismissed_at")
    .single();

  if (error) {
    console.error("[otto/reminders POST]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reminder: data });
}
