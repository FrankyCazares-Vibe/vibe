"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { CampusEvent } from "@/app/campus/campus-home";
import { asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

import { useLinkedEventParam } from "../linked-event";
import { CLUB_EVENTS_CHANGED_EVENT, type ClubEventsChangedDetail } from "./club-events-signal";

/** The two places the club page draws its upcoming events. */
export type EventsSurface = "upnext" | "list";

type ClubEvents = {
  /** Null while the first read is out (or after it failed). */
  events: CampusEvent[] | null;
  /** The first read's failure; a failed refresh keeps the events on screen. */
  loadErr: LoadFailure | null;
  retry: () => void;
  /** After an RSVP or a new event, started on `from`. A refusal toasts. */
  refresh: (from: EventsSurface) => Promise<void>;
  /** An officer's Cancel / Delete: the event leaves both surfaces at once. */
  remove: (id: string) => void;
  /** An officer's saved edit, made on `from`. */
  update: (next: CampusEvent, from: EventsSurface) => void;
  /**
   * Bumped for a surface when the OTHER one changed an event and the new
   * list has landed. EventCard keeps its RSVP and counts in its own state,
   * so a surface keys its cards on this to redraw from the fresh list; the
   * card the student tapped is never remounted (its focus stays put).
   */
  rev: Record<EventsSurface, number>;
  rsvpAtHomeOnly: boolean;
};

const ClubEventsContext = createContext<ClubEvents | null>(null);

export function useClubEvents(): ClubEvents {
  const value = useContext(ClubEventsContext);
  if (!value) throw new Error("useClubEvents needs a ClubEventsProvider");
  return value;
}

/**
 * The club's upcoming events, read once for the whole page (the club's view,
 * wave 2, C9): the pinned Up next card and the Events tab both read this, so
 * the page asks `/api/events?org_id=` once and a change on one shows on the
 * other. The read moved here from OrgEventsSection unchanged: events from
 * this club whatever the viewer's school, `include` carrying the `?event=`
 * id (a linked event past the list's 60 days or 50 rows), a 401 asking a
 * visitor to sign in, and only the newest refresh landing.
 *
 * `renderKey` is the server render's time. `router.refresh()` (a join, a
 * saved Edit page, a post or event from the + sheet) renders the page again
 * with a new one, and the list is read again, quietly. The + sheet can also
 * fire `CLUB_EVENTS_CHANGED_EVENT` (club-events-signal.ts).
 */
export function ClubEventsProvider({
  orgId,
  rsvpAtHomeOnly,
  renderKey,
  children,
}: {
  orgId: string;
  rsvpAtHomeOnly: boolean;
  renderKey: number;
  children: ReactNode;
}) {
  const [events, setEvents] = useState<CampusEvent[] | null>(null);
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [rev, setRev] = useState<Record<EventsSurface, number>>({ upnext: 0, list: 0 });
  const linkedParam = useLinkedEventParam();
  const listUrl = `/api/events?org_id=${encodeURIComponent(orgId)}&limit=50${
    linkedParam ? `&include=${encodeURIComponent(linkedParam)}` : ""
  }`;
  // Only the newest refresh lands. An officer's cancel / delete / edit bumps
  // it too: a read already out predates the change and would put the old
  // card back.
  const seqRef = useRef(0);

  const bumpOther = useCallback((from: EventsSurface) => {
    setRev((r) => (from === "upnext" ? { ...r, list: r.list + 1 } : { ...r, upnext: r.upnext + 1 }));
  }, []);

  const read = useCallback(
    async (from: EventsSurface | "background") => {
      const seq = ++seqRef.current;
      const quiet = from === "background";
      const r = await vibeRequest<{ events?: CampusEvent[] }>(listUrl, {
        cache: "no-store",
        quiet,
        failure: "Couldn't refresh events.",
      });
      if (seq !== seqRef.current) return;
      if (r.ok && Array.isArray(r.data.events)) {
        setLoadErr(null);
        setEvents(r.data.events);
        if (from !== "background") bumpOther(from);
      } else if (r.ok && !quiet) {
        toast({ message: "Couldn't refresh events. Try again.", tone: "error" });
      }
    },
    [listUrl, bumpOther],
  );

  // The first read (and Retry's). Quiet: the failure is drawn in the tab.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<{ events?: CampusEvent[] }>(listUrl, {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't load events.",
      });
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.events)) {
        setLoadErr(null);
        setEvents(r.data.events);
      } else if (!r.ok && r.status === 401) {
        // A visitor who was never signed in is asked to sign in, not told
        // they were signed out (feature report 3, #16).
        setLoadErr({ ...asLoadFailure(r, "Couldn't load events."), message: "Sign in to see this club's events." });
      } else {
        setLoadErr(asLoadFailure(r, "Couldn't load events."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listUrl, loadKey]);

  // A new server render (router.refresh): read again, quietly.
  const seenKey = useRef(renderKey);
  useEffect(() => {
    if (seenKey.current === renderKey) return;
    seenKey.current = renderKey;
    void read("background");
  }, [renderKey, read]);

  // The + sheet's New event (or any writer that can't reach this provider).
  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<ClubEventsChangedDetail>).detail;
      if (detail?.orgId === orgId) void read("list");
    };
    window.addEventListener(CLUB_EVENTS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CLUB_EVENTS_CHANGED_EVENT, onChanged);
  }, [orgId, read]);

  const value = useMemo<ClubEvents>(
    () => ({
      events,
      loadErr,
      retry: () => {
        setLoadErr(null);
        setLoadKey((k) => k + 1);
      },
      refresh: (from) => read(from),
      remove: (id) => {
        seqRef.current += 1;
        setEvents((prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
      },
      update: (next, from) => {
        seqRef.current += 1;
        // An edit can move an event's time, so the list is put back in time
        // order and Up next is always the soonest one (review F9).
        setEvents((prev) =>
          prev
            ? prev
                .map((e) => (e.id === next.id ? next : e))
                .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
            : prev,
        );
        bumpOther(from);
      },
      rev,
      rsvpAtHomeOnly,
    }),
    [events, loadErr, read, rev, rsvpAtHomeOnly, bumpOther],
  );

  return <ClubEventsContext.Provider value={value}>{children}</ClubEventsContext.Provider>;
}
