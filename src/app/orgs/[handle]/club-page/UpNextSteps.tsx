"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { AttendeesModal, CreateEventModal, type CampusEvent, useEventCoverSrc } from "@/app/campus/campus-home";
import { emitCalendarChanged } from "@/lib/calendar/calendar-sync";
import { useHideTabBar } from "@/lib/chat/use-hide-tabbar";
import { CHECKIN_COPY, doorPagePath, type DoorResponse } from "@/lib/events/event-checkin";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

import { NewPostModal } from "../admin-actions";
import { useClubEvents } from "./ClubEventsProvider";
import { shareClubEvent } from "./share-event";
import {
  ACTION_LABELS,
  STEP_SPOKEN,
  eventShareWhen,
  thankYouStarter,
  upNextView,
  type StepState,
  type UpNextAction,
  type UpNextPick,
} from "./up-next-steps";

type Opened = "edit" | "attendees" | "thanks";

/**
 * The officers' Up next card (Oct 23, 2026; wave 3, B1, board
 * Pick_UpNext.png "one card for the whole night"): the event's time and
 * place, its title, a badge, the night's five steps and one line of facts,
 * with one coral button that is always the next thing to do and at most one
 * quiet one beside it. Which event and step, and every word, come from
 * up-next-steps.ts; UpNext.tsx picks and keys this on the event's id.
 *
 * The buttons reuse what the page already has: Edit is the event form in
 * edit mode (as the event card opens it), Who came is the officers'
 * attendee list, Start check-in is StartCheckinAction's start (POST the
 * door route, then the door page), Post a thank-you is the club's post form
 * opened on a starter text the officer edits. Its post refreshes the page,
 * the page's newest post moves past the event's end, and the card moves on
 * to the next event by itself. `onChanged` re-reads the page's lists after
 * the attendee list closes (a mark changes "N came"). `onHold` says when a
 * dialog opens (true) and closes (false), so UpNext keeps the card on this
 * event meanwhile: a new pick would remount it and throw the dialog away
 * (review, Oct 23, 2026).
 */
export function UpNextSteps({
  pick,
  nowMs,
  handle,
  onChanged,
  onHold,
}: {
  pick: UpNextPick<CampusEvent>;
  nowMs: number;
  handle: string;
  onChanged: () => void;
  onHold: (held: boolean) => void;
}) {
  const { refresh, update } = useClubEvents();
  const ev = pick.event;
  const view = upNextView(pick, nowMs);
  // The event's cover photo (Oct 23, 2026): a slim strip across the top, or
  // nothing (none, or it failed to load).
  const cover = useEventCoverSrc(ev.cover_url);
  const titleId = useId();
  const [opened, setOpened] = useState<Opened | null>(null);
  // The button that opened a dialog, to hand focus back on close.
  const openerRef = useRef<HTMLElement | null>(null);
  const [starting, setStarting] = useState(false);
  // Synchronous twin of `starting`, so a double tap can't send two starts.
  const startingRef = useRef(false);

  // Back from the door with the browser's Back button: a page restored from
  // the back-forward cache would still say "Starting…" with nothing out.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      startingRef.current = false;
      setStarting(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const open = (which: Opened) => {
    onHold(true);
    setOpened(which);
  };

  const close = () => {
    setOpened(null);
    onHold(false);
    openerRef.current?.focus();
  };

  const startCheckin = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    // Not quiet: a refusal is said in the server's own sentence. Already
    // open (another officer, or a stale list) answers ok too.
    const r = await vibeRequest<DoorResponse>(`/api/events/${encodeURIComponent(ev.id)}/checkin/door`, {
      method: "POST",
      failure: "Couldn't start check-in.",
    });
    if (r.ok) {
      // Stays "Starting…" while the door page loads.
      window.location.assign(doorPagePath(ev.id));
      return;
    }
    startingRef.current = false;
    setStarting(false);
  };

  const run = (action: UpNextAction, opener: HTMLElement) => {
    openerRef.current = opener;
    if (action === "share") {
      void shareClubEvent({
        handle,
        eventId: ev.id,
        title: ev.title,
        when: eventShareWhen(ev.starts_at),
        place: ev.location,
      });
    } else if (action === "edit") open("edit");
    else if (action === "start_checkin") void startCheckin();
    else if (action === "who_came" || action === "see_who_came") open("attendees");
    else if (action === "post_thanks") open("thanks");
  };

  const button = (action: UpNextAction, primary: boolean): ReactNode => {
    const style = primary ? primaryStyle : secondaryStyle;
    // Show check-in is a plain link to the door page, as on the event card.
    if (action === "show_checkin") {
      return (
        <a href={doorPagePath(ev.id)} className="vibe-press" style={style}>
          {ACTION_LABELS.show_checkin}
        </a>
      );
    }
    const busy = action === "start_checkin" && starting;
    const opensDialog = action === "edit" || action === "who_came" || action === "see_who_came" || action === "post_thanks";
    return (
      <button
        type="button"
        className="vibe-press"
        aria-haspopup={opensDialog ? "dialog" : undefined}
        // aria-disabled, not disabled: a disabled button drops keyboard focus.
        aria-disabled={busy || undefined}
        onClick={(e) => run(action, e.currentTarget)}
        style={{ ...style, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
      >
        {busy ? CHECKIN_COPY.starting : ACTION_LABELS[action]}
      </button>
    );
  };

  return (
    <article aria-labelledby={titleId} style={cardStyle}>
      {/* Decoration: the title is right under it. */}
      {cover.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- the event's own picture route answers with a redirect
        <img src={cover.src} alt="" loading="lazy" decoding="async" onError={cover.onError} style={coverStripStyle} />
      ) : null}
      <div style={topRowStyle}>
        <span style={whenStyle}>{view.when}</span>
        <span style={badgeStyle}>{view.badge}</span>
      </div>
      {/* A plain title, as on the event card; the card is named by it. */}
      <div id={titleId} style={titleStyle}>
        {view.title}
      </div>
      <ol aria-label="Steps" style={railStyle}>
        {view.steps.map((s) => (
          <li key={s.label} aria-current={s.state === "current" ? "step" : undefined} style={stepStyle}>
            <StepMark state={s.state} n={s.n} />
            <span style={{ ...stepLabelStyle, color: STEP_LABEL_INK[s.state] }}>
              {s.label}
              <span style={visuallyHidden}>, {STEP_SPOKEN[s.state]}</span>
            </span>
          </li>
        ))}
      </ol>
      <p style={lineStyle}>{view.line}</p>
      <div style={actionsStyle}>
        {button(view.primary, true)}
        {view.secondary ? button(view.secondary, false) : null}
      </div>

      {opened === "edit" ? (
        <>
          <HideTabBar />
          <CreateEventModal
            editing={ev}
            eligibleOrgs={[]}
            onClose={close}
            onSaved={(next) => {
              close();
              toast({ message: "Event updated", tone: "info" });
              // The Events tab's copy follows; an edit that saved but
              // couldn't be read back is read again.
              if (next) update(next, "upnext");
              else void refresh("upnext");
              // A moved time moves the sidebar calendar's copy too.
              emitCalendarChanged();
            }}
          />
        </>
      ) : null}
      {opened === "attendees" ? (
        <AttendeesModal
          eventId={ev.id}
          eventTitle={ev.title}
          onClose={() => {
            close();
            // A mark, a removal or a clear may have changed "N came".
            onChanged();
          }}
        />
      ) : null}
      {opened === "thanks" ? (
        <NewPostModal
          orgHandle={handle}
          initialContent={thankYouStarter(ev, pick.nextUp, nowMs)}
          onClose={close}
        />
      ) : null}
    </article>
  );
}

/**
 * The event form portals out of the page, past the `.vibe-tabbar-page
 * :has([aria-modal])` rule, so the phone tab bar would sit over its footer;
 * while it's open the bar is hidden by hand (OrgEventsSection's twin).
 */
function HideTabBar(): null {
  useHideTabBar();
  return null;
}

/**
 * One step's mark: a cream disc with a tick (done), a coral ring round its
 * number (the step the night is on), a hairline ring with a dash (skipped)
 * or with its number (to come). The words beside it say the same, so the
 * state is never told by colour alone.
 */
function StepMark({ state, n }: { state: StepState; n: number }) {
  if (state === "done") {
    return (
      <span aria-hidden style={{ ...markStyle, background: "var(--charcoal)", color: "var(--cream)", border: "none" }}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === "current") {
    return (
      <span aria-hidden style={{ ...markStyle, border: "2px solid var(--coral)", color: "var(--tag-ink)", background: "var(--tag-bg)" }}>
        {n}
      </span>
    );
  }
  return (
    <span aria-hidden style={markStyle}>
      {state === "skipped" ? "–" : n}
    </span>
  );
}

// ── Looks: theme tokens (the club page is a Night island) ──────────────────

/** Coral is #FF5C35 in both looks; the card's ring is it at half strength. */
const CORAL_RING = "rgba(255,92,53,0.5)";

const cardStyle: CSSProperties = {
  padding: "14px 16px 16px",
  borderRadius: 18,
  border: `1px solid ${CORAL_RING}`,
  background: "var(--glass-70)",
  boxShadow: "0 0 28px rgba(255,92,53,0.12)",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
};

/**
 * The cover strip: out to the card's edges (past its 14px / 16px padding),
 * its top corners the card's less its 1px ring, and slim, a quarter as tall
 * as it is wide and never past 120px, so the steps stay the card's point.
 */
const coverStripStyle: CSSProperties = {
  display: "block",
  width: "calc(100% + 32px)",
  margin: "-14px -16px 12px",
  aspectRatio: "4 / 1",
  maxHeight: 120,
  objectFit: "cover",
  borderRadius: "17px 17px 0 0",
  background: "rgba(var(--scrim-rgb),0.08)",
};

const topRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 10,
};

const whenStyle: CSSProperties = {
  minWidth: 0,
  fontSize: 12.5,
  color: "var(--ink-2)",
  overflowWrap: "anywhere",
};

const badgeStyle: CSSProperties = {
  flexShrink: 0,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--tag-ink)",
  whiteSpace: "nowrap",
};

const titleStyle: CSSProperties = {
  marginTop: 8,
  fontFamily: "var(--font-display)",
  fontSize: 22,
  fontWeight: 800,
  lineHeight: 1.2,
  color: "var(--charcoal)",
  overflowWrap: "anywhere",
};

const railStyle: CSSProperties = {
  listStyle: "none",
  margin: "14px 0 0",
  padding: 0,
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 4,
};

const stepStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 5,
  minWidth: 0,
};

const markStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  boxSizing: "border-box",
  borderRadius: 999,
  border: "1px solid rgba(var(--scrim-rgb),0.28)",
  color: "var(--ink-muted)",
  fontSize: 12,
  fontWeight: 600,
};

/** The words under each mark: coral on the step, brighter behind it than ahead. */
const STEP_LABEL_INK: Record<StepState, string> = {
  done: "var(--ink-2)",
  current: "var(--tag-ink)",
  skipped: "var(--ink-muted)",
  later: "var(--ink-muted)",
};

const stepLabelStyle: CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.25,
  textAlign: "center",
  overflowWrap: "anywhere",
};

const lineStyle: CSSProperties = {
  margin: "14px 0 0",
  fontSize: 13.5,
  lineHeight: 1.45,
  color: "var(--ink-2)",
};

const actionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 12,
};

/** PILL's shape (OrgJoinControl.tsx): 44px tall, one line. */
const pillBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
  padding: "0 18px",
  boxSizing: "border-box",
  borderRadius: 999,
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.2,
  textDecoration: "none",
  whiteSpace: "nowrap",
  WebkitTapHighlightColor: "transparent",
};

const primaryStyle: CSSProperties = {
  ...pillBase,
  border: "1px solid var(--coral)",
  background: "var(--coral)",
  color: "var(--on-coral)",
};

const secondaryStyle: CSSProperties = {
  ...pillBase,
  border: "1px solid rgba(var(--scrim-rgb),0.28)",
  background: "transparent",
  color: "var(--charcoal)",
};

const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};
