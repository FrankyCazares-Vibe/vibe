/**
 * "Members only" club events, the screens' side (Oct 22, 2026,
 * handoffs/2026-10-22-club-tools-arc/PLAN-2.md, batch E2): the words every
 * surface prints, how a payload's `visibility` is read, and the one rule the
 * Share-an-event sheet needs. `MembersOnlyChip.tsx` draws the chip from these.
 *
 * WHY. Fraternities keep their chats private and some events too, so an
 * officer can mark an event "Members only": only the club's members (any
 * role) see it, not its followers and not signed-out visitors. The database
 * enforces that (event_visible, batch E1); these screens only say it, so a
 * member who sees the event in the campus list, Tonight or a chat knows it
 * isn't public before sharing a screenshot of it.
 *
 * WHY "MISSING = EVERYONE". The server batch adds `visibility` to every event
 * payload in the same deploy, but older payloads, fixtures and a cached tab
 * from before it don't carry it. Anything that isn't exactly "members" reads
 * as "everyone", which is also the column's default, so a missing field can
 * never show a chip on a public event.
 *
 * PURE: no React, no DOM, so node:test can load it.
 */

/** Who can see a club event: the `events.visibility` column's two values. */
export type EventVisibility = "everyone" | "members";

/** The two choices, in the order the create/edit form shows them. */
export const EVENT_VISIBILITIES: readonly EventVisibility[] = ["everyone", "members"];

export const MEMBERS_ONLY_COPY = {
  /** The chip, everywhere an event shows. */
  chip: "Members only",
  /** The form's question above the two choices. */
  question: "Who can see it",
  everyone: "Everyone",
  members: "Members only",
  /** Read after an event's spoken label (a card whose words are hidden). */
  spoken: "Members only.",
  /** The share sheet's one line when a members-only event can't go on the Board. */
  boardOff: "Members only events can't go on the Board: followers read it.",
  /** Added to a row's spoken label when the Board refuses it. */
  boardOffSpoken: "members only, can't be shared on the Board",
} as const;

/**
 * A payload's `visibility`, read safely: only an exact "members" is
 * members-only. Takes any object, not `{ visibility?: … }`: TypeScript
 * refuses a type with no property in common with an all-optional one, and
 * a payload type may not name the field yet (EventRef before batch E1).
 */
export function eventVisibility(ev: object | null | undefined): EventVisibility {
  return (ev as { visibility?: unknown } | null | undefined)?.visibility === "members" ? "members" : "everyone";
}

export function isMembersOnly(ev: object | null | undefined): boolean {
  return eventVisibility(ev) === "members";
}

/**
 * The form's one quiet line under the choice. It always says what "Members
 * only" means, with the club's name, so the choice is clear before it's
 * picked. On an edit that flips a public event to members-only it also says
 * what the server does next (it takes non-members' RSVPs off, E1), so an
 * officer isn't surprised by the Going count dropping.
 */
export function visibilityHint(clubName: string | null | undefined, flippingToMembers: boolean): string {
  const club = clubName?.trim() || "the club";
  const base = `Members only: only members of ${club} see it.`;
  return flippingToMembers ? `${base} RSVPs from people who aren't members come off.` : base;
}

/**
 * Whether the Share-an-event sheet must refuse this event in this room. The
 * Board is the one room followers read, so a members-only event can't be put
 * on it as a card (the cards route and chat_create_event_card refuse it too;
 * this only keeps the officer from picking a row that would be refused).
 * Every other room is members-only already, so the event can go there.
 */
export function shareRefused(roomKind: string, ev: object | null | undefined): boolean {
  return roomKind === "board" && isMembersOnly(ev);
}
