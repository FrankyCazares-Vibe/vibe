"use client";

/**
 * Settings → "Event check-ins" (contract 4.5, D11): every event the student
 * checked in at, newest first, each with a way to remove it, at any time.
 * An event's card leaves the lists when it ends, so this is the one place a
 * check-in can always be seen and taken back (the Privacy Policy, section 9,
 * points here).
 *
 * `cardStyle` and `title` are SettingsClient's own chrome (CARD_GLASS and
 * SectionTitle), passed in the way NotificationsCard takes them. Theme
 * tokens only, so Night mode follows.
 *
 * FOCUS. Each row's "Remove" turns into a Remove / Keep pair and a removed
 * row leaves the list, so the button a keyboard was on keeps disappearing.
 * Focus goes to Keep when the pair opens, back to the row's "Remove" on
 * Keep, and after a removal to the next row's "Remove" (or the one before,
 * or the empty line), never to <body>.
 */
import { useEffect, useId, useRef, useState } from "react";

import { checkinApiPath } from "@/components/events/checkin/use-checkin-state";
import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import {
  CHECKIN_COPY,
  CHECKIN_ERRORS,
  checkinPhase,
  type MyEventCheckin,
  type MyEventCheckinsResponse,
} from "@/lib/events/event-checkin";
import { vibeRequest } from "@/lib/feedback/request";

/** The open question on one row; `ended` = its check-in window is over, so it can't be added back. */
type Confirming = { id: string; ended: boolean };

export function CheckinsCard({ cardStyle, title }: { cardStyle: React.CSSProperties; title: React.ReactNode }) {
  const [rows, setRows] = useState<MyEventCheckin[] | null>(null);
  // A failed read is not an empty list: it shows the failure line, never
  // "You haven't checked in at any events."
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [confirm, setConfirm] = useState<Confirming | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // Every row's "Remove" and "Keep" by event id, and where focus goes once
  // the next render is drawn.
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  const keepRefs = useRef(new Map<string, HTMLButtonElement>());
  const emptyRef = useRef<HTMLDivElement | null>(null);
  const focusNextRef = useRef<{ kind: "remove" | "keep"; id: string } | { kind: "empty" } | null>(null);

  useEffect(() => {
    const want = focusNextRef.current;
    if (!want) return;
    focusNextRef.current = null;
    const el =
      want.kind === "empty"
        ? emptyRef.current
        : (want.kind === "keep" ? keepRefs : removeRefs).current.get(want.id);
    el?.focus({ preventScroll: true });
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<MyEventCheckinsResponse>("/api/me/event-checkins", {
        cache: "no-store",
        quiet: true,
        failure: CHECKIN_ERRORS.request_failed,
      });
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.checkins)) {
        setLoadErr(null);
        setRows(r.data.checkins.filter(isRow));
      } else {
        setLoadErr(asLoadFailure(r, CHECKIN_ERRORS.request_failed));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadKey]);

  const remove = async (eventId: string) => {
    if (removingId) return;
    setRemovingId(eventId);
    try {
      // Not quiet: a refusal toasts. The row stays until the removal holds.
      const r = await vibeRequest(checkinApiPath(eventId), {
        method: "DELETE",
        failure: CHECKIN_ERRORS.request_failed,
      });
      if (r.ok) {
        const list = rows ?? [];
        const at = list.findIndex((x) => x.event_id === eventId);
        const rest = list.filter((x) => x.event_id !== eventId);
        const neighbour = rest[Math.min(Math.max(at, 0), rest.length - 1)];
        focusNextRef.current = neighbour ? { kind: "remove", id: neighbour.event_id } : { kind: "empty" };
        setRows((prev) => (prev ?? []).filter((x) => x.event_id !== eventId));
        setConfirm(null);
      }
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <section style={{ ...cardStyle, padding: 22, marginBottom: 16 }}>
      {title}
      <p style={leadStyle}>{CHECKIN_COPY.settingsLead}</p>
      {rows === null && loadErr ? (
        <LoadFailed
          failure={loadErr}
          onRetry={() => {
            setLoadErr(null);
            setLoadKey((k) => k + 1);
          }}
        />
      ) : rows === null ? (
        <div style={mutedStyle}>{CHECKIN_COPY.loading}</div>
      ) : rows.length === 0 ? (
        // Focusable from code only: where focus lands when the last row goes.
        <div ref={emptyRef} tabIndex={-1} style={emptyStyle}>
          {CHECKIN_COPY.settingsEmpty}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((c) => (
            <CheckinRow
              key={c.event_id}
              checkin={c}
              confirm={confirm?.id === c.event_id ? confirm : null}
              busy={removingId === c.event_id}
              removeRef={(el) => setRef(removeRefs.current, c.event_id, el)}
              keepRef={(el) => setRef(keepRefs.current, c.event_id, el)}
              onAsk={() => {
                // Asked once, when the question opens: whether its window is
                // over decides if "can't add it back" is true for this row.
                setConfirm({ id: c.event_id, ended: checkinPhase(c.starts_at, c.ends_at, Date.now()) === "after" });
                focusNextRef.current = { kind: "keep", id: c.event_id };
              }}
              onKeep={() => {
                setConfirm(null);
                focusNextRef.current = { kind: "remove", id: c.event_id };
              }}
              onRemove={() => void remove(c.event_id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Keep a row's button in its map while it is on the page. */
function setRef(map: Map<string, HTMLButtonElement>, id: string, el: HTMLButtonElement | null): void {
  if (el) map.set(id, el);
  else map.delete(id);
}

/** A row the card can draw: the route's shape, checked so one bad row can't break the list. */
function isRow(c: unknown): c is MyEventCheckin {
  if (!c || typeof c !== "object") return false;
  const r = c as Record<string, unknown>;
  return typeof r.event_id === "string" && typeof r.title === "string" && typeof r.starts_at === "string";
}

/** "Mon, Oct 20" in the device's own words; "" for a date that doesn't parse. */
function dayLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function CheckinRow({
  checkin,
  confirm,
  busy,
  removeRef,
  keepRef,
  onAsk,
  onKeep,
  onRemove,
}: {
  checkin: MyEventCheckin;
  confirm: Confirming | null;
  busy: boolean;
  removeRef: (el: HTMLButtonElement | null) => void;
  keepRef: (el: HTMLButtonElement | null) => void;
  onAsk: () => void;
  onKeep: () => void;
  onRemove: () => void;
}) {
  const questionId = useId();
  const meta = [checkin.org?.name ?? null, dayLabel(checkin.starts_at)].filter(Boolean).join(" · ");
  // Every button says which event it is for: a list of bare "Remove"s
  // reads the same for each row to a screen reader.
  const named = `${CHECKIN_COPY.remove}: ${checkin.title}`;
  return (
    <div style={rowStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={titleStyle}>{checkin.title}</div>
        {meta ? <div style={metaStyle}>{meta}</div> : null}
        {/* Only once the window is over is "can't add it back" true. */}
        {confirm?.ended ? (
          <div id={questionId} style={questionStyle}>
            {CHECKIN_COPY.removeConfirm}
          </div>
        ) : null}
      </div>
      {confirm ? (
        <div
          role="group"
          aria-label={named}
          aria-describedby={confirm.ended ? questionId : undefined}
          style={{ display: "flex", gap: 6, flexShrink: 0 }}
        >
          <button
            type="button"
            className="vibe-press"
            onClick={onRemove}
            disabled={busy}
            style={{ ...pillStyle, color: "var(--error-ink)", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}
          >
            {CHECKIN_COPY.removeYes}
          </button>
          <button ref={keepRef} type="button" className="vibe-press" onClick={onKeep} disabled={busy} style={pillStyle}>
            {CHECKIN_COPY.removeKeep}
          </button>
        </div>
      ) : (
        <button
          ref={removeRef}
          type="button"
          className="vibe-press"
          onClick={onAsk}
          disabled={busy}
          aria-label={named}
          style={{ ...pillStyle, flexShrink: 0 }}
        >
          {CHECKIN_COPY.removeYes}
        </button>
      )}
    </div>
  );
}


// ── Styles (theme tokens, BlockedUsersCard's look) ──────────────────────────

const leadStyle: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  color: "var(--ink-2)",
  margin: "0 0 14px",
  maxWidth: 520,
  lineHeight: 1.5,
};

const mutedStyle: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  color: "var(--ink-muted)",
};

const emptyStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  background: "rgba(var(--scrim-rgb),0.03)",
  border: "1px dashed rgba(var(--scrim-rgb),0.12)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  color: "var(--ink-muted)",
  textAlign: "center",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 12,
  background: "color-mix(in srgb, var(--paper) 55%, transparent)",
  border: "1px solid rgba(var(--scrim-rgb),0.06)",
};

const titleStyle: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  fontWeight: 600,
  color: "var(--charcoal)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const metaStyle: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  color: "var(--ink-2)",
  marginTop: 2,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const pillStyle: React.CSSProperties = {
  minHeight: 32,
  padding: "6px 14px",
  borderRadius: 999,
  border: "1px solid rgba(var(--scrim-rgb),0.14)",
  background: "rgba(var(--scrim-rgb),0.04)",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

/** The "can't add it back" line under an ended row's details while it asks. */
const questionStyle: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  lineHeight: 1.4,
  color: "var(--ink-2)",
  marginTop: 6,
};
