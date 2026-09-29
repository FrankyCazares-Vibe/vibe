/**
 * A club's "cancelled event" notice (S68 officer tools, contracts C1 and C4 in
 * handoffs/wave-plan-s68/officer-tools.md): the rules every reader shares.
 * The lists (/api/me/notifications, /api/me/otto), the unread counts, the
 * app-icon badge, the push and the three Otto renderers all come here.
 *
 * FROM THE CLUB, NEVER THE OFFICER. `actor_id` is the officer who pressed
 * Cancel (the column is NOT NULL), and nothing shows it: the lists send
 * `actor: null` for these rows, the rows render the club's name and picture,
 * and the push carries no actor at all.
 *
 * ALWAYS DELIVERED (ruling 14). A student's blocks and mutes of the officer
 * don't hide it: not in the lists, the counts, the badge or the push, and it
 * has no Settings switch. Someone who blocked a harassing officer still finds
 * out the event they RSVP'd to is off. The row itself is trustworthy: clients
 * can't insert notifications (T2, 20260922120000), only the events route can.
 *
 * PURE AND CLIENT-SAFE: no runtime import (the SupabaseClient import is a
 * type), so the Otto components can use it and node:test can load it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const EVENT_CANCELLED = "event_cancelled";

/** Types shown whoever the actor is. */
const CLUB_NOTICE_TYPES: readonly string[] = [EVENT_CANCELLED];

/** Is this a notice from a club (shown whoever pressed the button)? */
export function isClubNotice(type: unknown): boolean {
  return typeof type === "string" && CLUB_NOTICE_TYPES.includes(type);
}

/**
 * The PostgREST `.or(...)` filter for "not from anyone hidden, unless it's a
 * club notice": `type.in.("event_cancelled"),actor_id.not.in.("a","b")`. It
 * replaces `.notIn("actor_id", ids)` on a notifications query. Only call it
 * with a non-empty list (as the callers already do with `.notIn`). Values are
 * double-quoted, so even a malformed id can't break out of the list.
 */
export function visibleActorFilter(hiddenIds: readonly string[]): string {
  const quote = (v: string) => `"${v.replace(/["\\]/g, "")}"`;
  const types = CLUB_NOTICE_TYPES.map(quote).join(",");
  const ids = hiddenIds.map(quote).join(",");
  return `type.in.(${types}),actor_id.not.in.(${ids})`;
}

// ── When the event was ──────────────────────────────────────────────────────

/** Campus time: the same zone the rest of the app pins dates to. */
export const CAMPUS_TIME_ZONE = "America/Indiana/Indianapolis";

function parse(iso: string | null | undefined): Date | null {
  if (typeof iso !== "string" || iso === "") return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * "Fri, Oct 3, 7:00 PM" in campus time, or null for a missing or bad date.
 * A fixed zone, so the server render and the browser agree (no hydration
 * mismatch) and a phone set to another zone still reads the campus time.
 */
export function eventWhenText(iso: string | null | undefined): string | null {
  const d = parse(iso);
  if (!d) return null;
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: CAMPUS_TIME_ZONE,
  });
}

/** "Fri, Oct 3" in campus time (the push's short date), or null. */
export function eventShortDate(iso: string | null | undefined): string | null {
  const d = parse(iso);
  if (!d) return null;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: CAMPUS_TIME_ZONE,
  });
}

// ── The in-app row ──────────────────────────────────────────────────────────

/** The event's name for a row, or "an event" when the row lost it. */
export function eventTitleText(title: string | null | undefined): string {
  const t = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  return t || "an event";
}

/** The words after the club's name: "cancelled Game Night · Fri, Oct 3, 7:00 PM". */
export function cancelledLine(title: string | null | undefined, startsAt: string | null | undefined): string {
  const when = eventWhenText(startsAt);
  const what = `cancelled ${eventTitleText(title)}`;
  return when ? `${what} · ${when}` : what;
}

/** The club's name for a row; "A club" when it couldn't be read. */
export function clubNameText(org: { name?: string | null } | null | undefined): string {
  const name = typeof org?.name === "string" ? org.name.trim() : "";
  return name || "A club";
}

/** Up to two initials for the club's placeholder picture. */
export function clubInitials(org: { name?: string | null } | null | undefined): string {
  const name = typeof org?.name === "string" ? org.name : "";
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? "")
    .join("")
    .toUpperCase();
  return letters || "?";
}

// ── The list routes ─────────────────────────────────────────────────────────

export type EventNoticeFields = { event_title: string | null; event_starts_at: string | null };

/**
 * Adds `event_title` / `event_starts_at` to a page of notification rows and
 * sets `actor: null` on every club notice (the officer is never sent).
 *
 * A SECOND READ, only when the page holds a club notice. Such a row can only
 * exist once 20260930100000_event_cancel_notices.sql has added the columns,
 * so a database that's behind never sees a select naming them. It's read
 * with the student's own client (`notifications_select_own`) and scoped to
 * the ids in hand. A failed read keeps the rows with null fields, which
 * render "cancelled an event": losing the notice would be worse. Never throws.
 */
export async function withEventNotices<T extends { id: string; type?: string | null }>(
  client: SupabaseClient,
  rows: T[],
): Promise<Array<T & EventNoticeFields>> {
  const ids = rows.filter((r) => isClubNotice(r.type)).map((r) => r.id);
  const byId = new Map<string, EventNoticeFields>();
  if (ids.length > 0) {
    try {
      const { data, error } = await client
        .from("notifications")
        .select("id,event_title,event_starts_at")
        .in("id", ids);
      if (error) console.error("[push/event-notice]", error);
      for (const r of (data ?? []) as Array<{ id: string } & EventNoticeFields>) {
        byId.set(r.id, { event_title: r.event_title ?? null, event_starts_at: r.event_starts_at ?? null });
      }
    } catch (e) {
      console.error("[push/event-notice]", e);
    }
  }
  return rows.map((r) => {
    if (!isClubNotice(r.type)) return { ...r, event_title: null, event_starts_at: null };
    const fields = byId.get(r.id) ?? { event_title: null, event_starts_at: null };
    return { ...r, ...fields, actor: null };
  });
}
