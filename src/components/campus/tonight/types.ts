/**
 * The Tonight surfaces' shared shapes (Oct 19 2026): the view model that the
 * pure tonight-view.ts builds, the hooks' states and every component's props,
 * so the five build batches code against one file. Types only.
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md.
 */
import type { ReactNode } from "react";

import type { CampusEvent } from "@/app/campus/campus-home";
import type { OrgRef } from "@/lib/chat/types";
import type { SchoolEvent, SchoolSource } from "@/lib/school-events/types";

/** The Events tab's chips. Every other surface is "all". */
export type TonightFilter = "all" | "school" | "clubs";

/** Why #1 is #1: the school featured it, it's on now, or it starts soonest. */
export type LeadReason = "featured" | "live" | "next";

/** Every word a row prints, worked out once in campus time (tonight-view.ts). */
export type ItemText = {
  /** "5:00 PM". */
  time: string;
  /** "" or with its leading space: " tip-off", " to 8:00 PM", " to midnight". Never a game's end. */
  timeTail: string;
  /** "Thu 5" (week tiles, next-up rows). */
  day: string;
  /** The place, or "". */
  place: string;
  /** School game "Athletics · Men's basketball"; school event "Student Affairs"; club "Climbing Club" ("" with no club). */
  byline: string;
  /** Games "Men's basketball · Home"; otherwise "". */
  subline: string;
  /** Clubs: "12 going" from 5 up, else "". School: always "" in v1. */
  count: string;
  /** The row read aloud, without the action: "8:00 PM, Bouldering night, Climbing Club, Rec Center, 12 going". */
  spoken: string;
};

export type TonightItem =
  | { kind: "school"; key: string; ev: SchoolEvent; live: boolean; text: ItemText }
  | { kind: "club"; key: string; ev: CampusEvent; live: boolean; going: number | null; text: ItemText };

export type TonightLead = TonightItem & { reason: LeadReason };

export type TonightView = {
  /** The campus day: "2026-11-07". */
  dayKey: string;
  /** "Sat, Nov 7". */
  dayLabel: string;
  /** #1, or null when nothing is on tonight (for this filter). */
  lead: TonightLead | null;
  /** Tonight's other school items, soonest first. */
  school: TonightItem[];
  /** Tonight's club items (not the lead), soonest first. */
  clubs: TonightItem[];
  /** school.length + clubs.length: "+N more tonight". */
  more: number;
  /** Only when lead is null: up to 3 items in the next 7 campus days, soonest first; else []. */
  nextUp: TonightItem[];
  /** The calendars behind the school items on this view (lead, school, nextUp), in source order. */
  credits: SchoolSource[];
};

/** One tile of "Home games this week" (phone sheet). */
export type WeekTile = {
  key: string;
  ev: SchoolEvent;
  /** "Thu 5". */
  day: string;
  state: "final" | "live" | "today" | "later";
  /** "Final" | "Now" | "Tonight 5:00 PM" / "Today 12:00 PM" | "6:30 PM". */
  label: string;
  /** "Men's basketball". */
  sport: string;
  /** "vs SIUE". */
  versus: string;
  /** "Thursday, Nov 5: Men's basketball, IU Indy vs SIUE, final". */
  spoken: string;
};

/** One card of the Events tab's "Coming up". */
export type ComingUpEntry =
  | { kind: "club"; key: string; ev: CampusEvent }
  | { kind: "school"; key: string; ev: SchoolEvent; source: SchoolSource | null };

/** useSchoolEvents(): a failed read lands as "ready" with on: false, never as an error box. */
export type SchoolEventsState = {
  status: "loading" | "ready";
  on: boolean;
  events: SchoolEvent[];
  sources: SchoolSource[];
};

/** One club in "Your clubs". No author, ever (a follower never sees one). */
export type YourClubRow = {
  org: OrgRef;
  /** The Board's channel id: /messages?channel=<room_id>. */
  room_id: string;
  role: "member" | "follower";
  /** The Board's newest post; text may be "" (a photo-only post). Null when nothing is posted. */
  latest: { text: string; created_at: string } | null;
};

/** useYourClubs(): "error" only when BOTH reads failed (the panels hide). */
export type YourClubsState = { status: "loading" | "ready" | "error"; rows: YourClubRow[] };

// ── Component props (one owner each; CONTRACT.md §10) ─────────────────────────

/** Batch C. Wraps the keyed FeedTabBody: "Your clubs" left, the feed centred, "Tonight" right. */
export type FeedSideLayoutProps = {
  children: ReactNode;
  /** view.url("/api/events?limit=50"). */
  eventsUrl: string;
  /** view.url("/api/school-events"). */
  schoolUrl: string;
  /** Switch to Events and flash that card (CampusHome's onPickEvent). */
  onPickEvent: (eventId: string) => void;
  onOpenTab: (tab: "events" | "orgs") => void;
};

/** Batch C. The right panel. Renders null only when the club read failed AND school is off. */
export type TonightPanelProps = {
  school: SchoolEventsState;
  /** null while loading. */
  clubs: CampusEvent[] | null;
  clubsFailed: boolean;
  onPickEvent: (eventId: string) => void;
  onOpenEvents: () => void;
};

/** Batch C. The left panel (1400px and up). */
export type YourClubsPanelProps = { state: YourClubsState; onFindClubs: () => void };

/** Batch C. The folded strip on top of the right column (1100-1399px). */
export type YourClubsFoldProps = { state: YourClubsState };

/** Batch D. The phone Feed card. Null while loading and when nothing is on tonight. */
export type TonightCardProps = {
  school: SchoolEventsState;
  clubs: CampusEvent[] | null;
  onOpen: () => void;
};

/** Batch D. The phone sheet. */
export type TonightSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  school: SchoolEventsState;
  clubs: CampusEvent[] | null;
  /** Close the sheet, then CampusMobile's pickEvent(id). */
  onPickClubEvent: (eventId: string) => void;
  /** Close the sheet, then the Events tab. */
  onOpenEvents: () => void;
};

/** Batch E. The Events tab's "Tonight" block, phone and desktop. */
export type TonightSectionProps = {
  layout: "desktop" | "phone";
  school: SchoolEventsState;
  clubs: CampusEvent[] | null;
  filter: TonightFilter;
  /** Scroll to and flash that event's card in "Coming up". */
  onPickClubEvent: (eventId: string) => void;
};

/** Batch E. "All · School · Clubs". The caller renders it only when school.on. */
export type EventFilterChipsProps = { value: TonightFilter; onChange: (next: TonightFilter) => void };

/** Batch E. A school event in "Coming up": no Going, no Interested, no Report. */
export type SchoolEventCardProps = { ev: SchoolEvent; source: SchoolSource | null };
