"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type CSSProperties, type JSX } from "react";

import { vibeRequest, type VibeFailure } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import { ORG_COPY, fillCopy, leaveToastText, orgErrorCopy, orgMenuItems } from "@/lib/orgs/join-copy";
import type { OrgRole } from "@/lib/orgs/join-state";

import { LeaveWarning, useLeavePreview } from "./LeaveWarning";

/**
 * The club page's ⋯ menu (club model gaps 1 and 2, Franky's calls of Oct 16),
 * one control for phone and desktop: `/orgs/[handle]` serves both.
 *
 *   - Mute posts / Unmute posts, for everyone signed in. The club's posts
 *     leave this student's feed and nothing else changes: a member stays in
 *     every chat, and nobody who runs the club is told (`/api/orgs/[slug]/mute`).
 *   - Leave club, for members except the owner, who hands the club on first.
 *     The confirm asks whether to keep following (`DELETE /join` with
 *     `{keep_following}`); the box starts checked only for a follow they
 *     tapped themselves (`keepFollowingDefault`). It also warns about the
 *     club's Members only events they're going to, which a leave takes them
 *     off (`LeaveWarning`, Oct 22, 2026), and the toast says how many.
 *
 * The officers' "Let followers read the Board" row is gone (Franky, Oct 23,
 * 2026): Club settings holds that switch, on a phone and a computer alike.
 *
 * The rows and every word come from `join-copy.ts` (`orgMenuItems`,
 * `ORG_COPY.menu`). No optimistic flips: a tap waits for the server, and the
 * mute answer is kept locally until the page's own `muted` catches up.
 */
export type OrgMenuProps = {
  orgHandle: string;
  orgName: string;
  role: OrgRole | null;
  /** The viewer muted this club's posts (false when the read failed: a second mute is harmless). */
  muted: boolean;
  /** Where the leave confirm's "Keep following" box starts. */
  keepFollowing: boolean;
  /**
   * The club's "Followers can read the Board" switch, for a MEMBER only (null
   * for anyone else: next to a card that isn't there it would tell a barred
   * follower what happened). The leave confirm's keep-following line reads it.
   */
  boardReadersOn?: boolean | null;
};

export function OrgMenu(p: OrgMenuProps): JSX.Element | null {
  const router = useRouter();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** The server's mute answer, until the page passes a different `muted`. */
  const [local, setLocal] = useState<{ basis: boolean; muted: boolean } | null>(null);
  const muted = local && local.basis === p.muted ? local.muted : p.muted;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const org = p.orgName.trim() || "this club";
  const items = orgMenuItems({ signedIn: true, role: p.role, muted });

  useEffect(() => {
    if (!open) return;
    wrapRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        // Arrow keys walk the rows, wrapping at either end (menu pattern).
        const rows = Array.from(wrapRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
        if (rows.length === 0) return;
        e.preventDefault();
        const at = rows.indexOf(document.activeElement as HTMLButtonElement);
        const step = e.key === "ArrowDown" ? 1 : -1;
        const next = at < 0 ? (step > 0 ? 0 : rows.length - 1) : (at + step + rows.length) % rows.length;
        rows[next]?.focus();
        return;
      }
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  const refuse = (r: VibeFailure) => {
    // A 429 carries the route's own wait; a fixed "in a minute" would be wrong.
    const known = r.status === 429 ? null : orgErrorCopy(r.code);
    toast({ message: known ?? r.message, tone: "error", action: known ? undefined : r.action });
  };

  const toggleMute = async () => {
    const next = !muted;
    setOpen(false);
    setBusy(true);
    const r = await vibeRequest(`/api/orgs/${encodeURIComponent(p.orgHandle)}/mute`, {
      method: next ? "POST" : "DELETE",
      quiet: true,
      failure: fillCopy(next ? ORG_COPY.menu.muteFailed : ORG_COPY.menu.unmuteFailed, { org }),
    });
    setBusy(false);
    if (!r.ok) return refuse(r);
    setLocal({ basis: p.muted, muted: next });
    const line = !next ? ORG_COPY.menu.unmuted : p.role ? ORG_COPY.menu.mutedMember : ORG_COPY.menu.muted;
    toast({ message: fillCopy(line, { org }), tone: "info" });
  };

  const leave = async (keepFollowing: boolean) => {
    setBusy(true);
    const r = await vibeRequest<{ left?: unknown; org_follow_state?: unknown; rsvps_dropped?: unknown }>(
      `/api/orgs/${encodeURIComponent(p.orgHandle)}/join`,
      {
        method: "DELETE",
        json: { keep_following: keepFollowing },
        quiet: true,
        failure: fillCopy(ORG_COPY.menu.leaveFailed, { org }),
      },
    );
    setBusy(false);
    if (!r.ok) return refuse(r);
    setLeaving(false);
    if (r.data.left === true) toast({ message: leaveToastText(org, r.data), tone: "info" });
    // Left, or already out: either way the page's standing is stale.
    router.refresh();
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={fillCopy(ORG_COPY.menu.label, { org })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        style={{ ...triggerStyle, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
      >
        <DotsGlyph />
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-label={fillCopy(ORG_COPY.menu.label, { org })} style={menuStyle}>
          {items.map((item) => (
            <button
              key={item.kind}
              type="button"
              role="menuitem"
              onClick={() => {
                if (item.kind === "leave") {
                  setOpen(false);
                  setLeaving(true);
                } else void toggleMute();
              }}
              style={{ ...itemStyle, color: item.kind === "leave" ? "var(--error-ink)" : "var(--charcoal)" }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {leaving ? (
        <LeaveDialog
          handle={p.orgHandle}
          org={org}
          busy={busy}
          initialKeep={p.keepFollowing}
          boardOn={p.boardReadersOn === true}
          onCancel={() => {
            setLeaving(false);
            triggerRef.current?.focus();
          }}
          onLeave={(keep) => void leave(keep)}
        />
      ) : null}
    </div>
  );
}

/**
 * "Leave SAE?" with the keep-following choice. Inline (not portaled) at the
 * org page's own dialog layer, so `.vibe-tabbar-page:has([aria-modal])` hides
 * the phone tab bar while it is open. Escape and the scrim cancel, except
 * while the leave is on its way. The members-only warning, when there is
 * one, sits right above the buttons; it scrolls with the dialog on a short
 * phone (`maxHeight` below), so Leave and Cancel are never pushed off.
 */
function LeaveDialog({
  handle,
  org,
  busy,
  initialKeep,
  boardOn,
  onCancel,
  onLeave,
}: {
  handle: string;
  org: string;
  busy: boolean;
  initialKeep: boolean;
  /** Followers may read the Board: the keep-following line says so, as on desktop. */
  boardOn: boolean;
  onCancel: () => void;
  onLeave: (keepFollowing: boolean) => void;
}): JSX.Element {
  const titleId = useId();
  const [keep, setKeep] = useState(initialKeep);
  const membersOnly = useLeavePreview(handle);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  // The latest busy flag and cancel handler, for the one Escape listener
  // below: re-subscribing each render would also steal focus on every tick.
  const live = useRef({ busy, onCancel });
  useEffect(() => {
    live.current = { busy, onCancel };
  });

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !live.current.busy) live.current.onCancel();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      style={scrimStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={dialogStyle}>
        <h2 id={titleId} style={dialogTitleStyle}>
          {fillCopy(ORG_COPY.menu.leaveTitle, { org })}
        </h2>
        <p style={dialogBodyStyle}>{ORG_COPY.menu.leaveBody}</p>
        <label style={keepRowStyle}>
          <input
            type="checkbox"
            checked={keep}
            disabled={busy}
            onChange={(e) => setKeep(e.target.checked)}
            style={{ width: 20, height: 20, margin: "1px 0 0", accentColor: "var(--coral)", flexShrink: 0 }}
          />
          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontWeight: 700, color: "var(--charcoal)" }}>
              {fillCopy(ORG_COPY.menu.keepFollowing, { org })}
            </span>
            <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>{boardOn ? ORG_COPY.menu.keepFollowingSubBoard : ORG_COPY.menu.keepFollowingSub}</span>
          </span>
        </label>
        <LeaveWarning events={membersOnly} />
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} style={cancelStyle}>
            {ORG_COPY.menu.cancel}
          </button>
          <button
            type="button"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={() => onLeave(keep)}
            style={{ ...leaveStyle, opacity: busy ? 0.7 : 1 }}
          >
            {busy ? ORG_COPY.buttons.busy : ORG_COPY.menu.leaveConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function DotsGlyph(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden fill="currentColor">
      <circle cx="3.5" cy="9" r="1.6" />
      <circle cx="9" cy="9" r="1.6" />
      <circle cx="14.5" cy="9" r="1.6" />
    </svg>
  );
}

// ── Looks ───────────────────────────────────────────────────────────────────
// The trigger sits on the org page's own fixed-dark glass, like the header's
// Follow pill. The menu and the dialog float above the page and follow Night
// and Light through the shared tokens.

const triggerStyle: CSSProperties = {
  width: 44,
  height: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 12,
  color: "rgba(255,255,255,0.9)",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.14)",
  WebkitTapHighlightColor: "transparent",
};

const menuStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  zIndex: 50,
  minWidth: 180,
  maxWidth: "calc(100vw - 32px)",
  padding: 6,
  borderRadius: 14,
  background: "var(--paper)",
  border: "1px solid var(--hairline)",
  boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
  display: "flex",
  flexDirection: "column",
};

const itemStyle: CSSProperties = {
  minHeight: 44,
  padding: "0 14px",
  border: "none",
  borderRadius: 10,
  background: "transparent",
  textAlign: "left",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
  WebkitTapHighlightColor: "transparent",
};

const scrimStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  padding: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,0.5)",
};

const dialogStyle: CSSProperties = {
  width: "min(400px, 100%)",
  maxHeight: "100%",
  overflowY: "auto",
  boxSizing: "border-box",
  padding: 20,
  borderRadius: 18,
  background: "var(--paper)",
  border: "1px solid var(--hairline)",
  boxShadow: "0 20px 64px rgba(0,0,0,0.45)",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const dialogTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "Fraunces, serif",
  fontSize: 20,
  fontWeight: 900,
  lineHeight: 1.2,
  overflowWrap: "anywhere",
};

const dialogBodyStyle: CSSProperties = { margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--ink-2)" };

const keepRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid var(--hairline)",
  fontSize: 14,
  lineHeight: 1.4,
  cursor: "pointer",
  overflowWrap: "anywhere",
};

const pillStyle: CSSProperties = {
  flex: "1 1 0",
  minWidth: 0,
  minHeight: 44,
  borderRadius: 999,
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const cancelStyle: CSSProperties = {
  ...pillStyle,
  color: "var(--charcoal)",
  background: "transparent",
  border: "1px solid var(--hairline)",
};

const leaveStyle: CSSProperties = {
  ...pillStyle,
  color: "var(--paper)",
  background: "var(--error-ink)",
  border: "1px solid var(--error-ink)",
};
