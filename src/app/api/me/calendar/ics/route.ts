import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const WINDOW_DAYS_PAST = 30;
const WINDOW_DAYS_AHEAD = 365;

type RsvpRow = {
  status: "going" | "maybe" | "no";
  event: {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    starts_at: string;
    ends_at: string;
    created_at: string;
    org: { name?: string } | null;
  } | null;
};

type PersonalRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  notes: string;
  created_at: string;
};

/**
 * Bundled iCalendar feed — every upcoming event the user is on (RSVP'd
 * public events + personal calendar entries). Apple Calendar / Google
 * Calendar / Outlook all accept this format on import.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const fromIso = new Date(
    Date.now() - WINDOW_DAYS_PAST * 24 * 60 * 60 * 1000,
  ).toISOString();
  const toIso = new Date(
    Date.now() + WINDOW_DAYS_AHEAD * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [rsvpRes, personalRes] = await Promise.all([
    supabase
      .from("rsvps")
      .select(
        "status," +
          "event:events!inner(id,title,description,location,starts_at,ends_at,created_at," +
          "org:orgs(name)" +
          ")",
      )
      .eq("user_id", user.id)
      .in("status", ["going", "maybe"])
      .gte("event.starts_at", fromIso)
      .lte("event.starts_at", toIso),
    supabase
      .from("personal_events")
      .select("id,title,starts_at,ends_at,location,notes,created_at")
      .eq("user_id", user.id)
      .gte("starts_at", fromIso)
      .lte("starts_at", toIso),
  ]);

  const blocks: string[] = [];
  for (const row of (rsvpRes.data as unknown as RsvpRow[]) ?? []) {
    if (!row.event) continue;
    const ev = row.event;
    blocks.push(
      buildVEvent({
        uid: `evt-${ev.id}@vibe`,
        title: ev.title,
        description: ev.description ?? "",
        location: ev.location ?? "",
        startsAt: ev.starts_at,
        endsAt: ev.ends_at,
        organizer: ev.org?.name ?? "Vibe",
        createdAt: ev.created_at,
      }),
    );
  }
  for (const row of (personalRes.data as unknown as PersonalRow[]) ?? []) {
    blocks.push(
      buildVEvent({
        uid: `pe-${row.id}@vibe`,
        title: row.title,
        description: row.notes ?? "",
        location: row.location ?? "",
        startsAt: row.starts_at,
        endsAt: row.ends_at ?? row.starts_at,
        organizer: "You",
        createdAt: row.created_at,
      }),
    );
  }

  const ics =
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Vibe Campus//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Vibe Calendar",
      ...blocks,
      "END:VCALENDAR",
    ].join("\r\n") + "\r\n";

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vibe-calendar.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}

type VEvent = {
  uid: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  organizer: string;
  createdAt: string;
};

function buildVEvent(e: VEvent): string {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${toIcsDate(e.createdAt)}`,
    `DTSTART:${toIcsDate(e.startsAt)}`,
    `DTEND:${toIcsDate(e.endsAt)}`,
    `SUMMARY:${escIcsText(e.title)}`,
    e.description ? `DESCRIPTION:${escIcsText(e.description)}` : "",
    e.location ? `LOCATION:${escIcsText(e.location)}` : "",
    e.organizer
      ? `ORGANIZER;CN=${escIcsText(e.organizer)}:mailto:noreply@vibe.local`
      : "",
    "END:VEVENT",
  ].filter(Boolean);
  return lines.join("\r\n");
}

function toIcsDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
