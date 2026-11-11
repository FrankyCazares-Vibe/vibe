/**
 * Otto's desk, the pure half (Wave 2A, Nov 10, 2026; plan "Wave 2A", brief
 * WAVE2A-BRIEF.md "The contract"). `buildDesk(input, now)` turns facts the
 * server already read into the three paper sections (Ready for you,
 * Scheduled, Done this week), Otto saw, Earlier and Otto's one sky line.
 * desk-server.ts reads the facts; the phone and computer desks draw this.
 *
 * HONESTY. There is no AI model yet. Nothing here says Otto did, drafted,
 * sent, or will send or remind anything: every line describes what is on the
 * page or what a button does when the person taps it. Reminders read
 * "Reminder · Thu" because nothing delivers them yet. desk.test.ts scans
 * every string this file can print.
 *
 * ONE CORAL. Only `ready[0]`'s verb is the coral button (`primary: true`,
 * and `deskPrimaryId`); every other verb renders quiet.
 *
 * COUNTS. Counts, never who. Officers see their club's exact numbers;
 * anything another person's count shown to a non-officer goes through
 * `shownCount` (from 5 up, the follower and check-in rule).
 *
 * PURE: runtime imports are pure modules only (campus time, the Up next
 * steps, the cancelled-event words), so desk.test.ts loads it under plain
 * `node --test` with an "@/" resolve hook.
 */
import { campusDateTime, campusDay } from "@/components/campus/tonight/campus-time";
import { isMembersOnly } from "@/components/events/members-only";
import {
  ACTION_LABELS,
  campusDaysFrom,
  clubEventPath,
  pickUpNext,
  upNextView,
  type StepEvent,
} from "@/app/orgs/[handle]/club-page/up-next-steps";
import { cancelledLine, clubNameText } from "@/lib/push/event-notice";

// ── The contract (everyone codes to these) ─────────────────────────────────

export type DeskRole = "officer" | "student";
export type DeskClub = { orgId: string; name: string; handle: string; role: "owner" | "officer"; avatarUrl?: string | null };
export type DeskVerb =
  | { kind: "link"; label: string; href: string }
  | { kind: "join_request"; label: string; orgSlug: string; requestId: string };
export type DeskKind =
  | "join_request" | "up_next" | "setup_step" | "draft" | "follow_back" | "unread_dm" | "reminder"
  | "event" | "rsvp" | "post" | "checkin" | "cancelled" | "notification";
export type DeskItem = {
  id: string;
  kind: DeskKind;
  /** Sentence case. */
  title: string;
  /** One line, sentence case. */
  detail?: string;
  whenISO?: string;
  /** "Fri, Nov 13 · 6:30 PM", "Reminder · Thu". */
  whenLabel?: string;
  /** Where the row opens. */
  href?: string;
  /** Only ready[0] renders it as the coral button; others render it quiet. */
  verb?: DeskVerb;
  /** True on ready[0] only, when it has a verb: the frame's one coral fill. */
  primary?: true;
  /** "What will happen" lines with real counts, only when true today. */
  willHappen?: string[];
  stamp?: "done";
};
export type DeskModel = {
  role: DeskRole;
  /** Otto's lowercase sky line, built from counts. */
  say: string;
  actingAs: DeskClub | null;
  clubs: DeskClub[];
  ready: DeskItem[];
  scheduled: DeskItem[];
  done: DeskItem[];
  saw: DeskItem[];
  /** Done items 8-30 days ago (the computer desk). */
  earlier: DeskItem[];
  empty: { ready: string; scheduled: string; done: string; saw: string };
};

// ── The input (desk-server.ts fills it) ─────────────────────────────────────

export type DeskPerson = { id: string; name: string | null; handle: string | null };

/** A club event as the Up next card reads it, plus when it was posted. */
export type DeskClubEvent = StepEvent & { created_at?: string | null };

/** An event the person is going to or checked in to. */
export type DeskMyEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string | null;
  orgHandle?: string | null;
  visibility?: string | null;
};

export type DeskReminder = { id: string; title: string; remindAt: string | null; createdAt?: string | null };

/** One notification, flattened from the route's activity rows. */
export type DeskNotice = {
  id: string;
  type: string;
  createdAt: string;
  actorName: string | null;
  orgName: string | null;
  orgHandle: string | null;
  postId: string | null;
  eventTitle: string | null;
  eventStartsAt: string | null;
};

/** What the desk knows about the club the officer is acting as. */
export type DeskClubFacts = {
  /** Members now, every role; null when the count couldn't be read. */
  memberCount: number | null;
  /** Pending join requests, oldest first, block pairs already left out. */
  requests: { id: string; person: DeskPerson; requestedAt: string; canAccept: boolean }[];
  /** Null when the club has no setup list (or it couldn't be read). */
  setup: { id: string; done: boolean }[] | null;
  /** The officer's own drafts (author-only). */
  drafts: { id: string; excerpt: string; createdAt: string }[];
  /** Upcoming (not ended) and recent past events, for Up next, Scheduled and Done. */
  events: DeskClubEvent[];
  /** The club's newest post (Up next's thank-you); null none, undefined unknown. */
  latestPostAt?: string | null;
  /** The club's posts of the last 30 days. */
  posts: { id: string; excerpt: string; createdAt: string }[];
  /** When each member of the last 30 days joined (never who). */
  joins: string[];
};

export type DeskInput = {
  clubs: DeskClub[];
  /** The club the officer is acting as; null for a student (or "as you"). */
  actingAs: DeskClub | null;
  club: DeskClubFacts | null;
  followers: (DeskPerson & { followedAt: string })[];
  /** Null when the unread read failed (the row is left out, not "0"). */
  unreadDms: number | null;
  reminders: DeskReminder[];
  going: DeskMyEvent[];
  checkedIn: DeskMyEvent[];
  rsvpsMade: (DeskMyEvent & { rsvpAt: string; status: "going" | "maybe" })[];
  notifications: DeskNotice[];
  /**
   * The route's own reads that failed (its `failed[]`: "dms", "asking",
   * "upcoming", "activity"). A student desk missing them must never say
   * "all clear" (Wave 2A review M1).
   */
  missing?: readonly string[];
};

// ── Rules and words ────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
/** Done this week: the last 7 days. Earlier: 8 to 30 days ago. */
export const DONE_DAYS = 7;
export const EARLIER_DAYS = 30;
/** Another person's count shows to a non-officer only from this many up. */
export const COUNT_FLOOR = 5;

const READY_REQUESTS_MAX = 5;
const LIST_MAX = { ready: 12, scheduled: 12, done: 12, saw: 12, earlier: 20 } as const;

export const DESK_EMPTY = Object.freeze({
  ready: "nothing needs you right now.",
  scheduled: "nothing on the calendar this week.",
  done: "nothing done yet this week. that's fine.",
  saw: "quiet so far.",
});

/** An officer's Scheduled holds every upcoming event, not just this week's. */
export const OFFICER_SCHEDULED_EMPTY = "nothing on the calendar yet.";

/** The setup page's step names (SetupList.tsx STEP_TEXT), for the one setup row. */
export const SETUP_STEP_NAMES: Readonly<Record<string, string>> = Object.freeze({
  photo: "Photo and cover",
  about: "One line about the club",
  who_can_join: "Who can join",
  officers: "Add your officers",
  first_event: "Post your first event",
  members_link: "Share the members’ link",
});

/** A count as a viewer may see it: exact for officers, else only from 5 up (null = don't show). */
export function shownCount(n: number | null | undefined, viewerIsOfficer: boolean): number | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  const whole = Math.trunc(n);
  if (viewerIsOfficer) return whole;
  return whole >= COUNT_FLOOR ? whole : null;
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** Otto's numbers: words to ten, digits after. */
export function countWord(n: number): string {
  const whole = Math.max(0, Math.trunc(n));
  return WORDS[whole] ?? whole.toLocaleString("en-US");
}

function ms(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/** First name, else @handle, else "Someone". */
export function firstName(p: { name: string | null; handle: string | null } | null | undefined): string {
  const first = p?.name?.trim().split(/\s+/)[0];
  if (first) return first;
  const handle = p?.handle?.trim();
  return handle ? `@${handle}` : "Someone";
}

/** A text as one row's title: one line, trimmed, at most `max` characters. */
export function oneLine(text: string | null | undefined, max = 80): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** "Today", "Yesterday", "Tue" this past week, "Nov 3" before that. */
export function pastDayLabel(atMs: number, nowMs: number): string {
  const days = campusDaysFrom(atMs, nowMs);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  const label = campusDay(atMs).label; // "Tue, Nov 3"
  return days <= 6 ? label.split(",")[0] : label.split(", ")[1] ?? label;
}

/** "Reminder · Today", "Reminder · Thu", "Reminder · Nov 20"; undated: "Reminder". */
export function reminderLabel(remindAt: string | null | undefined, nowMs: number): string {
  const at = ms(remindAt);
  if (!Number.isFinite(at)) return "Reminder";
  const days = campusDaysFrom(nowMs, at);
  const label = campusDay(at).label;
  const day = days <= 0 ? "Today" : days <= 6 ? label.split(",")[0] : label.split(", ")[1] ?? label;
  return `Reminder · ${day}`;
}

/** "now", "5m", "2h", "3d", then "Nov 3": Otto saw's times. */
export function agoLabel(atMs: number, nowMs: number): string {
  const diff = nowMs - atMs;
  if (!Number.isFinite(diff) || diff < 60_000) return "now";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return campusDay(atMs).label.split(", ")[1] ?? campusDay(atMs).label;
}

/** "Fri, Nov 13 · 6:30 PM". */
export function eventWhenLabel(startsAt: string): string | undefined {
  const at = ms(startsAt);
  return Number.isFinite(at) ? campusDateTime(at) : undefined;
}

function clubPath(handle: string): string {
  return `/orgs/${encodeURIComponent(handle)}`;
}

function myEventHref(ev: DeskMyEvent): string {
  return ev.orgHandle
    ? clubEventPath(ev.orgHandle, ev.id)
    : `/campus?tab=events&event=${encodeURIComponent(ev.id)}`;
}

// ── Ready for you ──────────────────────────────────────────────────────────

function joinRequestItems(club: DeskClub, facts: DeskClubFacts, nowMs: number): DeskItem[] {
  const tools = `${clubPath(club.handle)}/tools/requests`;
  const shown = facts.requests.slice(0, READY_REQUESTS_MAX);
  const items: DeskItem[] = shown.map((r) => {
    const who = firstName(r.person);
    const at = ms(r.requestedAt);
    // True for whichever one is accepted next; the desk reloads after each.
    const n = facts.memberCount === null ? null : facts.memberCount + 1;
    const base: DeskItem = {
      id: `join_request:${r.id}`,
      kind: "join_request",
      title: `${who} asked to join ${club.name}`,
      whenISO: r.requestedAt,
      whenLabel: Number.isFinite(at) ? pastDayLabel(at, nowMs) : undefined,
      href: tools,
    };
    if (!r.canAccept) {
      return { ...base, detail: "Open the request to see why it can't be accepted here.", verb: { kind: "link", label: "Review", href: tools } };
    }
    return {
      ...base,
      detail: n === null ? `Accept lets ${who} in.` : `Accept makes ${who} member ${n.toLocaleString("en-US")}.`,
      verb: { kind: "join_request", label: "Accept", orgSlug: club.handle, requestId: r.id },
      willHappen: [
        ...(n === null ? [`${who} becomes a member`] : [`${who} becomes member ${n.toLocaleString("en-US")}`]),
        `${who} gets a notice that you said yes`,
        `${who} joins the club's open chats`,
      ],
    };
  });
  const more = facts.requests.length - shown.length;
  if (more > 0) {
    items.push({
      id: `join_request:more:${club.orgId}`,
      kind: "join_request",
      title: `${more.toLocaleString("en-US")} more ${more === 1 ? "person" : "people"} asked to join`,
      href: tools,
      verb: { kind: "link", label: "See all requests", href: tools },
    });
  }
  return items;
}

function upNextItem(club: DeskClub, facts: DeskClubFacts, nowMs: number): DeskItem | null {
  const upcoming = facts.events.filter((e) => ms(e.ends_at) >= nowMs);
  const past = facts.events.filter((e) => ms(e.ends_at) < nowMs);
  const pick = pickUpNext({ upcoming, past, nowMs, latestPostAt: facts.latestPostAt });
  if (!pick) return null;
  const view = upNextView(pick, nowMs);
  const href = clubPath(club.handle);
  return {
    id: `up_next:${pick.event.id}:${pick.step}`,
    kind: "up_next",
    title: pick.event.title,
    // The button only opens the club page, where Up next does the step, so it
    // names where it goes and the step stays in the line (review L5).
    detail: `${view.badge} · ${view.line} Next: ${ACTION_LABELS[view.primary]}.`,
    whenISO: pick.event.starts_at,
    whenLabel: eventWhenLabel(pick.event.starts_at),
    href,
    verb: { kind: "link", label: "Open Up next", href },
  };
}

function setupItem(club: DeskClub, facts: DeskClubFacts): DeskItem | null {
  const steps = facts.setup;
  if (!steps || steps.length === 0) return null;
  const left = steps.filter((s) => !s.done);
  if (left.length === 0) return null;
  const href = `${clubPath(club.handle)}/setup`;
  const next = SETUP_STEP_NAMES[left[0].id] ?? "The next step";
  const done = steps.length - left.length;
  return {
    id: `setup_step:${club.orgId}:${left[0].id}`,
    kind: "setup_step",
    title: `Finish setting up ${club.name}`,
    detail: `${done} of ${steps.length} done. Next: ${next}.`,
    href,
    verb: { kind: "link", label: "Finish setup", href },
  };
}

function draftItems(facts: DeskClubFacts, nowMs: number): DeskItem[] {
  return facts.drafts.map((d) => {
    const at = ms(d.createdAt);
    const href = `/posts/${encodeURIComponent(d.id)}`;
    return {
      id: `draft:${d.id}`,
      kind: "draft",
      title: oneLine(d.excerpt) || "Your draft",
      detail: "Your draft. Only you can see it.",
      whenISO: d.createdAt,
      whenLabel: Number.isFinite(at) ? `Saved ${pastDayLabel(at, nowMs)}` : undefined,
      href,
      verb: { kind: "link", label: "Open draft", href },
    };
  });
}

function officerReady(club: DeskClub, facts: DeskClubFacts, nowMs: number): DeskItem[] {
  const upNext = upNextItem(club, facts, nowMs);
  const setup = setupItem(club, facts);
  return [
    ...joinRequestItems(club, facts, nowMs),
    ...(upNext ? [upNext] : []),
    ...(setup ? [setup] : []),
    ...draftItems(facts, nowMs),
  ];
}

function studentReady(input: DeskInput, nowMs: number): DeskItem[] {
  const items: DeskItem[] = [];
  const unread = input.unreadDms;
  if (typeof unread === "number" && unread > 0) {
    items.push({
      id: "unread_dm",
      kind: "unread_dm",
      title: unread === 1 ? "1 unread message" : `${unread.toLocaleString("en-US")} unread messages`,
      href: "/messages",
      verb: { kind: "link", label: "Open Messages", href: "/messages" },
    });
  }
  for (const f of input.followers) {
    const who = firstName(f);
    const at = ms(f.followedAt);
    const href = f.handle ? `/profile/${encodeURIComponent(f.handle)}` : undefined;
    items.push({
      id: `follow_back:${f.id}`,
      kind: "follow_back",
      title: `${who} followed you`,
      detail: "You don't follow them back yet.",
      whenISO: f.followedAt,
      whenLabel: Number.isFinite(at) ? pastDayLabel(at, nowMs) : undefined,
      href,
      ...(href ? { verb: { kind: "link" as const, label: "See profile", href } } : {}),
    });
  }
  for (const r of input.reminders) {
    if (r.remindAt) continue; // dated ones are Scheduled
    items.push({
      id: `reminder:${r.id}`,
      kind: "reminder",
      title: oneLine(r.title) || "Reminder",
      whenISO: r.createdAt ?? undefined,
      whenLabel: reminderLabel(null, nowMs),
    });
  }
  return items;
}

// ── Scheduled ──────────────────────────────────────────────────────────────

function officerScheduled(club: DeskClub, facts: DeskClubFacts, nowMs: number): DeskItem[] {
  return facts.events
    .filter((e) => ms(e.ends_at) >= nowMs)
    .sort((a, b) => ms(a.starts_at) - ms(b.starts_at))
    .map((e) => {
      const going = shownCount(e.going_count, true);
      const parts = ["Posted", ...(going === null ? [] : [`${going.toLocaleString("en-US")} going`])];
      if (isMembersOnly(e)) parts.push("Members only");
      return {
        id: `event:${e.id}`,
        kind: "event" as const,
        title: e.title,
        detail: parts.join(" · "),
        whenISO: e.starts_at,
        whenLabel: eventWhenLabel(e.starts_at),
        href: clubEventPath(club.handle, e.id),
      };
    });
}

function studentScheduled(input: DeskInput, nowMs: number): DeskItem[] {
  const weekOut = nowMs + DONE_DAYS * DAY_MS;
  const events: DeskItem[] = input.going
    .filter((e) => ms(e.endsAt) >= nowMs && ms(e.startsAt) <= weekOut)
    .map((e) => ({
      id: `rsvp:${e.id}`,
      kind: "rsvp" as const,
      title: e.title,
      detail: isMembersOnly(e) ? "You're going · Members only" : "You're going",
      whenISO: e.startsAt,
      whenLabel: eventWhenLabel(e.startsAt),
      href: myEventHref(e),
    }));
  const reminders: DeskItem[] = input.reminders
    .filter((r) => r.remindAt && ms(r.remindAt) >= nowMs)
    .map((r) => ({
      id: `reminder:${r.id}`,
      kind: "reminder" as const,
      title: oneLine(r.title) || "Reminder",
      whenISO: r.remindAt ?? undefined,
      whenLabel: reminderLabel(r.remindAt, nowMs),
    }));
  return [...events, ...reminders].sort((a, b) => ms(a.whenISO) - ms(b.whenISO));
}

// ── Done this week and Earlier ─────────────────────────────────────────────

type Dated = { at: number; item: DeskItem };

function doneItem(at: number, nowMs: number, item: Omit<DeskItem, "stamp" | "whenLabel">): Dated {
  return { at, item: { ...item, whenLabel: pastDayLabel(at, nowMs), stamp: "done" } };
}

function officerDone(club: DeskClub, facts: DeskClubFacts, nowMs: number): Dated[] {
  const out: Dated[] = [];
  for (const p of facts.posts) {
    out.push(doneItem(ms(p.createdAt), nowMs, {
      id: `post:${p.id}`,
      kind: "post",
      title: oneLine(p.excerpt) || "A post with a photo or video",
      detail: `Posted on ${club.name}'s Board`,
      whenISO: p.createdAt,
      href: `/posts/${encodeURIComponent(p.id)}`,
    }));
  }
  for (const e of facts.events) {
    if (!e.created_at) continue;
    out.push(doneItem(ms(e.created_at), nowMs, {
      id: `event:posted:${e.id}`,
      kind: "event",
      title: e.title,
      detail: "Event posted",
      whenISO: e.created_at,
      href: clubEventPath(club.handle, e.id),
    }));
  }
  for (const e of facts.events) {
    const end = ms(e.ends_at);
    const n = shownCount(e.checked_in_count, true);
    if (!(end < nowMs) || n === null || n === 0) continue;
    out.push(doneItem(end, nowMs, {
      id: `checkin:${e.id}`,
      kind: "checkin",
      title: `${n.toLocaleString("en-US")} checked in at ${e.title}`,
      whenISO: e.ends_at,
      href: clubEventPath(club.handle, e.id),
    }));
  }
  // New members, counted per section (never who): one row this week, one earlier.
  const joins = facts.joins.map(ms).filter((t) => Number.isFinite(t) && t <= nowMs);
  for (const [bucket, inBucket] of [
    ["week", (t: number) => nowMs - t <= DONE_DAYS * DAY_MS],
    ["earlier", (t: number) => nowMs - t > DONE_DAYS * DAY_MS && nowMs - t <= EARLIER_DAYS * DAY_MS],
  ] as const) {
    const these = joins.filter(inBucket);
    if (these.length === 0) continue;
    const newest = Math.max(...these);
    out.push(doneItem(newest, nowMs, {
      id: `join_request:joined:${bucket}:${club.orgId}`,
      kind: "join_request",
      title: these.length === 1 ? "1 new member" : `${these.length.toLocaleString("en-US")} new members`,
      detail: `Joined ${club.name}`,
      whenISO: new Date(newest).toISOString(),
      href: clubPath(club.handle),
    }));
  }
  return out;
}

function studentDone(input: DeskInput, nowMs: number): Dated[] {
  const out: Dated[] = [];
  for (const e of input.checkedIn) {
    // Check-in opens an hour early: a check-in before the start is still done now.
    const at = Math.min(ms(e.startsAt), nowMs);
    out.push(doneItem(at, nowMs, {
      id: `checkin:${e.id}`,
      kind: "checkin",
      title: `Checked in at ${e.title}`,
      whenISO: e.startsAt,
      href: myEventHref(e),
    }));
  }
  for (const r of input.rsvpsMade) {
    out.push(doneItem(ms(r.rsvpAt), nowMs, {
      id: `rsvp:made:${r.id}`,
      kind: "rsvp",
      title: r.status === "going" ? `Going to ${r.title}` : `Interested in ${r.title}`,
      detail: eventWhenLabel(r.startsAt),
      whenISO: r.rsvpAt,
      href: myEventHref(r),
    }));
  }
  return out;
}

/** Splits done items into this week (0-7 days) and Earlier (8-30 days), newest first. */
export function splitDone(dated: Dated[], nowMs: number): { done: DeskItem[]; earlier: DeskItem[] } {
  const valid = dated.filter((d) => Number.isFinite(d.at) && d.at <= nowMs).sort((a, b) => b.at - a.at);
  const age = (d: Dated) => nowMs - d.at;
  return {
    done: valid.filter((d) => age(d) <= DONE_DAYS * DAY_MS).map((d) => d.item).slice(0, LIST_MAX.done),
    earlier: valid
      .filter((d) => age(d) > DONE_DAYS * DAY_MS && age(d) <= EARLIER_DAYS * DAY_MS)
      .map((d) => d.item)
      .slice(0, LIST_MAX.earlier),
  };
}

// ── Otto saw (notifications) ───────────────────────────────────────────────

/** One notification's line, sentence case (OttoActivity.tsx's words). */
export function noticeTitle(n: DeskNotice): string {
  if (n.type === "event_cancelled") {
    return `${clubNameText({ name: n.orgName })} ${cancelledLine(n.eventTitle, n.eventStartsAt)}`;
  }
  const actor = n.actorName?.trim().split(/\s+/)[0] || "Someone";
  const club = n.orgName?.trim() || "a club";
  switch (n.type) {
    case "like": case "post_like": return `${actor} liked your post`;
    case "comment": case "post_comment": return `${actor} commented on your post`;
    case "comment_like": return `${actor} liked your comment`;
    case "comment_reply": return `${actor} replied to your comment`;
    case "follow": case "new_follower": return `${actor} followed you`;
    case "mention": case "post_mention": return `${actor} mentioned you`;
    case "message_mention": return `${actor} mentioned you in a chat`;
    case "repost": case "post_repost": return `${actor} reposted your post`;
    case "save": case "post_save": return `${actor} saved your post`;
    case "org_invite": return `${actor} invited you to join ${club}`;
    case "org_request_approved": return `${actor} approved your request to join ${club}`;
    case "org_join_request": return `${actor} asked to join ${n.orgName?.trim() || "your club"}`;
    default: return "Something new on your account";
  }
}

/** Where a notification opens (OttoActivity.tsx's hrefFor). */
export function noticeHref(n: DeskNotice): string | undefined {
  const club = n.orgHandle ? clubPath(n.orgHandle) : null;
  if (n.type === "org_join_request") return club ? `${club}/tools/requests` : "/campus?tab=orgs";
  if (n.type === "org_invite" || n.type === "org_request_approved" || n.type === "event_cancelled") {
    return club ?? "/campus?tab=orgs";
  }
  return n.postId ? `/posts/${encodeURIComponent(n.postId)}` : undefined;
}

function sawItems(notices: DeskNotice[], nowMs: number): DeskItem[] {
  return notices.slice(0, LIST_MAX.saw).map((n) => {
    const at = ms(n.createdAt);
    return {
      id: `notification:${n.id}`,
      kind: n.type === "event_cancelled" ? ("cancelled" as const) : ("notification" as const),
      title: noticeTitle(n),
      whenISO: n.createdAt,
      whenLabel: Number.isFinite(at) ? agoLabel(at, nowMs) : undefined,
      href: noticeHref(n),
    };
  });
}

// ── The sky line ───────────────────────────────────────────────────────────

/**
 * Otto's one lowercase line, from counts only. Officers hear "nothing goes
 * out without you" (their drafts and Accepts wait for them); a student has no
 * send queue, so theirs only says what is waiting. `partial`: one of the
 * reads behind Ready or Scheduled failed, so never "all clear".
 */
export function skyLine(counts: { ready: number; scheduled: number; role?: DeskRole; partial?: boolean }): string {
  const { ready, scheduled, role = "officer", partial = false } = counts;
  if (ready > 0 && role === "student") {
    return ready === 1 ? "one thing is waiting for you." : `${countWord(ready)} things are waiting for you.`;
  }
  if (ready === 1) return "one thing is ready. nothing goes out without you.";
  if (ready > 1) return `${countWord(ready)} things are ready. nothing goes out without you.`;
  if (partial) return "part of my desk didn't load. try again in a bit.";
  if (scheduled === 1) return "all clear. one thing on the calendar.";
  if (scheduled > 1) return `all clear. ${countWord(scheduled)} things on the calendar.`;
  return "all clear. i'll put things here when they need you.";
}

// ── The desk ───────────────────────────────────────────────────────────────

/** The id of the one item whose verb is the coral button (ready[0], with a verb), or null. */
export function deskPrimaryId(model: Pick<DeskModel, "ready">): string | null {
  const top = model.ready[0];
  return top?.verb ? top.id : null;
}

/** Which club the desk acts as: `?club=me` none, a handle that matches, else the first club. */
export function chooseActingClub(clubs: DeskClub[], clubParam: string | null): DeskClub | null {
  const want = (clubParam ?? "").trim().toLowerCase();
  if (want === "me") return null;
  return clubs.find((c) => c.handle.toLowerCase() === want) ?? clubs[0] ?? null;
}

export function buildDesk(input: DeskInput, now: Date): DeskModel {
  const nowMs = now.getTime();
  const club = input.actingAs && input.club ? input.actingAs : null;
  const facts = club ? input.club : null;
  const role: DeskRole = club ? "officer" : "student";

  let ready = club && facts ? officerReady(club, facts, nowMs) : studentReady(input, nowMs);
  const scheduled = (club && facts ? officerScheduled(club, facts, nowMs) : studentScheduled(input, nowMs)).slice(
    0,
    LIST_MAX.scheduled,
  );
  const { done, earlier } = splitDone(club && facts ? officerDone(club, facts, nowMs) : studentDone(input, nowMs), nowMs);

  // One coral per frame: ready[0] alone carries `primary`; nobody else may.
  ready = ready.slice(0, LIST_MAX.ready).map((item, i) => {
    const { primary: _drop, ...rest } = item;
    void _drop;
    return i === 0 && rest.verb ? { ...rest, primary: true as const } : rest;
  });

  // "N more people asked to join" is N things, not one (review L9).
  const moreRequests = facts ? Math.max(0, facts.requests.length - READY_REQUESTS_MAX) : 0;
  const readyCount = ready.length + (moreRequests > 1 ? moreRequests - 1 : 0);
  const missing = new Set(input.missing ?? []);
  const partial = role === "student" && ["dms", "asking", "upcoming"].some((f) => missing.has(f));

  return {
    role,
    say: skyLine({ ready: readyCount, scheduled: scheduled.length, role, partial }),
    actingAs: club,
    clubs: input.clubs,
    ready,
    scheduled,
    done,
    saw: sawItems(input.notifications, nowMs),
    earlier,
    empty: role === "officer" ? { ...DESK_EMPTY, scheduled: OFFICER_SCHEDULED_EMPTY } : { ...DESK_EMPTY },
  };
}
