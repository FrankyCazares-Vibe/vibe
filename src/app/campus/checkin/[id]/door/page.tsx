import { notFound } from "next/navigation";

import { DoorView, type DoorEvent } from "@/components/events/checkin/DoorView";
import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { doorPagePath } from "@/lib/events/event-checkin";
import { isUuid } from "@/lib/pgrest";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

export const metadata = {
  title: "Check-in screen · Vibe",
  robots: { index: false },
};

type Props = { params: Promise<{ id: string }> };

/** The club's name and handle for the header, or null (an org-less event, or no service key). */
async function clubFor(orgId: unknown): Promise<DoorEvent["org"]> {
  if (typeof orgId !== "string" || !isSupabaseServiceConfigured()) return null;
  // A club's name and handle are public on its page; the service read just
  // spares a second policy check for the header line.
  const { data, error } = await createSupabaseServiceClient()
    .from("orgs")
    .select("name,handle")
    .eq("id", orgId)
    .maybeSingle();
  if (error) {
    console.error("[campus/checkin/:id/door org]", error.code);
    return null;
  }
  if (!data || typeof data.name !== "string" || typeof data.handle !== "string") return null;
  return { name: data.name, handle: data.handle };
}

/**
 * `/campus/checkin/<event id>/door`: the officers' door screen (contract
 * §3.7, §4.3). Its own page, not an overlay, so it outlives the events list
 * dropping the card at the end time, works in the hour after, and opens on a
 * second device.
 *
 * The gate is told the bare door path (no query), so a sign-in comes back
 * here. Who may run check-in is the database's call (`can_manage_event`):
 * everyone else gets the "only the owner and admins" screen and no feed is
 * ever read for them.
 *
 * A failed read is not a missing event. A database hiccup on the event read
 * draws "Couldn't load check-in." with a retry, not a 404; a failed role
 * check lets the door try (the feed route checks the role itself, so a
 * non-officer still gets "only the owner and admins" and no codes) instead
 * of telling a real officer they aren't one, as the line is forming.
 */
export default async function DoorPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  await enforceCampusAccess(doorPagePath(id));

  const supabase = await createSupabaseServerClient();
  const { data: ev, error: evErr } = await supabase
    .from("events")
    .select("id,title,starts_at,ends_at,org_id")
    .eq("id", id)
    .maybeSingle();
  if (evErr) {
    console.error("[campus/checkin/:id/door event]", evErr.code);
    const unread: DoorEvent = { id, title: "", starts_at: "", ends_at: "", org: null };
    return <DoorView event={unread} canManage={false} loadFailed />;
  }
  if (!ev) notFound();

  const { data: canManage, error: manageErr } = await supabase.rpc("can_manage_event", {
    p_event_id: id,
  });
  if (manageErr) console.error("[campus/checkin/:id/door can_manage_event]", manageErr.code);

  const event: DoorEvent = {
    // Lower case, as the database writes ids (the address may not).
    id: id.toLowerCase(),
    title: String(ev.title ?? ""),
    starts_at: String(ev.starts_at ?? ""),
    ends_at: String(ev.ends_at ?? ""),
    org: await clubFor(ev.org_id),
  };

  return <DoorView event={event} canManage={manageErr ? true : canManage === true} />;
}
