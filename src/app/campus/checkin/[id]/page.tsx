import type { Metadata } from "next";

import { CheckinLanding, type CheckinLandingEvent } from "@/components/events/checkin/CheckinLanding";
import { enforceCampusAccess } from "@/lib/auth/campus-access";
import {
  CHECKIN_CLOSES_AFTER_MS,
  CHECKIN_LINK_PARAM,
  CHECKIN_OPENS_BEFORE_MS,
  checkinPagePath,
  isCheckinToken,
  parseCheckinStateRows,
  type CheckinViewerState,
} from "@/lib/events/event-checkin";
import { isUuid } from "@/lib/pgrest";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * `/campus/checkin/<event id>`: where the door's QR lands, and where a
 * student types the code (contract 3.7 and 4.4). Under /campus because the
 * Android app already claims that path (D5).
 *
 * The QR's token rides in `?checkin=` (never `code`: supabase-js would take
 * `?code=` for a sign-in code). The sign-in gate gets the path WITHOUT it,
 * so a token never enters a login address or a log; a student who has to
 * sign in first comes back here with no token, and the code box takes over
 * (the token is dead by then anyway).
 *
 * The viewer's own client reads the event (RLS decides who may see it) and
 * the check-in state; the club's name comes through the service role. A
 * hidden club's event reads the same as a missing one.
 */
export const metadata: Metadata = {
  title: "Check in · Vibe",
  robots: { index: false },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The first value of a query setting, as it was asked. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** `iso` moved by `deltaMs`, as ISO; "" when it doesn't parse. */
function shiftIso(iso: string, deltaMs: number): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms + deltaMs).toISOString() : "";
}

type EventRow = {
  id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  org_id: string | null;
};

export default async function CheckinPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  // Not an event id at all: the same words as a missing event, with no
  // sign-in step and no database call.
  if (!isUuid(id)) return <CheckinLanding event={null} initial={null} token={null} />;

  await enforceCampusAccess(checkinPagePath(id));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("id,title,starts_at,ends_at,location,org_id")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[campus/checkin page] event read", error.code);
  const row = (data ?? null) as EventRow | null;
  if (!row) return <CheckinLanding event={null} initial={null} token={null} />;

  // The club (name, handle, hidden) and the viewer's check-in state, side by
  // side. A failed club read fails closed: it could be a hidden club.
  const [orgRead, stateRead] = await Promise.all([
    row.org_id
      ? createSupabaseServiceClient()
          .from("orgs")
          .select("name,handle,hidden_at")
          .eq("id", row.org_id)
          .maybeSingle()
      : Promise.resolve(null),
    supabase.rpc("event_checkin_state", { p_event_ids: [id] }),
  ]);

  let org: CheckinLandingEvent["org"] = null;
  if (orgRead) {
    if (orgRead.error) console.error("[campus/checkin page] club read", orgRead.error.code);
    const o = orgRead.data as { name: string | null; handle: string | null; hidden_at: string | null } | null;
    if (!o || o.hidden_at) return <CheckinLanding event={null} initial={null} token={null} />;
    org = o.handle ? { name: o.name ?? o.handle, handle: o.handle } : null;
  }

  // The state the card's GET would answer (contract 3.2), or null when it
  // couldn't be read: the page then asks the route itself.
  let initial: CheckinViewerState | null = null;
  if (stateRead.error) {
    console.error("[campus/checkin page] state read", stateRead.error.code);
  } else {
    // By the row's own id: the address may spell the uuid in upper case,
    // the database's answer never does.
    const s = parseCheckinStateRows(stateRead.data).get(row.id);
    if (s) {
      initial = {
        event_id: row.id,
        open: s.open,
        checked_in: s.viewerCheckedIn,
        count: s.count,
        opens_at: shiftIso(row.starts_at, -CHECKIN_OPENS_BEFORE_MS),
        closes_at: shiftIso(row.ends_at, CHECKIN_CLOSES_AFTER_MS),
      };
    }
  }

  const raw = first(sp[CHECKIN_LINK_PARAM]);
  const token = isCheckinToken(raw) ? raw : null;

  const event: CheckinLandingEvent = {
    id: row.id,
    title: row.title ?? "",
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    location: row.location ?? "",
    org,
  };
  return <CheckinLanding event={event} initial={initial} token={token} />;
}
