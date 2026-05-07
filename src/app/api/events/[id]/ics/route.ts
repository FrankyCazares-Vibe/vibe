import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * iCalendar feed for a single event. Browsers download it as `.ics`,
 * which Apple Calendar / Outlook / Google Calendar all recognize. Auth
 * is required so we don't leak event details to scrapers.
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

  type EvRow = {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    starts_at: string;
    ends_at: string;
    created_at: string;
    org: { name?: string } | { name?: string }[] | null;
  };

  const { data, error } = await supabase
    .from("events")
    .select(
      "id,title,description,location,starts_at,ends_at,created_at," +
        "org:orgs(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Not found" },
      { status: 404 },
    );
  }
  const ev = data as unknown as EvRow;

  const orgName =
    Array.isArray(ev.org) && ev.org.length > 0
      ? ev.org[0]?.name ?? "Vibe"
      : (ev.org && !Array.isArray(ev.org) ? ev.org.name : null) ?? "Vibe";

  const ics = buildIcs({
    uid: `${ev.id}@vibe`,
    title: ev.title,
    description: ev.description ?? "",
    location: ev.location ?? "",
    startsAt: ev.starts_at,
    endsAt: ev.ends_at,
    organizer: orgName,
    createdAt: ev.created_at,
  });

  const filename =
    ev.title.replace(/[^A-Za-z0-9 -]/g, "").trim().replace(/\s+/g, "-") || "event";

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}

type IcsInput = {
  uid: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  organizer: string;
  createdAt: string;
};

function buildIcs(e: IcsInput): string {
  // RFC 5545 — line-folded properties, UTC zulu times, escaped TEXT.
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vibe Campus//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${toIcsDate(e.createdAt)}`,
    `DTSTART:${toIcsDate(e.startsAt)}`,
    `DTEND:${toIcsDate(e.endsAt)}`,
    `SUMMARY:${escIcsText(e.title)}`,
    e.description ? `DESCRIPTION:${escIcsText(e.description)}` : "",
    e.location ? `LOCATION:${escIcsText(e.location)}` : "",
    e.organizer ? `ORGANIZER;CN=${escIcsText(e.organizer)}:mailto:noreply@vibe.local` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n") + "\r\n";
}

function toIcsDate(iso: string): string {
  // 20260507T180000Z — RFC 5545 UTC form, no separators.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escIcsText(s: string): string {
  // RFC 5545 §3.3.11 — escape backslashes, semicolons, commas, and newlines.
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
