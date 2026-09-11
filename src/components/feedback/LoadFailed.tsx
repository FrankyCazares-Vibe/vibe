"use client";

import type { JSX } from "react";

import { describeFailure, type ToastAction } from "@/lib/feedback/failure-copy";
import type { VibeResult } from "@/lib/feedback/request";

/**
 * The inline "couldn't load" line for a list whose first load failed
 * (empty-states design §2, handoffs/2026-09-11-empty-states-design.md). It
 * renders in place of the list, so a failed read never shows as the empty
 * copy or as a skeleton that never resolves. A refetch that fails keeps the
 * rows already on screen and uses the toast instead.
 *
 * Static pages use the twins in public/html/_persistence.js
 * (window.vibeLoadFailure, window.vibeLoadFailed).
 */
export type LoadFailure = { message: string; action?: ToastAction };

/**
 * A quiet vibeRequest failure keeps its mapped line and action. A 2xx with the
 * wrong shape becomes the caller's line + " Try again.". Client-only, like the
 * rest of this file: a server component passes a `failure` literal instead.
 */
export function asLoadFailure(r: VibeResult<unknown>, line: string): LoadFailure {
  if (!r.ok) return r.action ? { message: r.message, action: r.action } : { message: r.message };
  // No copy rule maps a 2xx, so this is the caller's line plus "Try again.",
  // the same line a 5xx gets.
  const { message } = describeFailure(
    { status: r.status, code: null, error: null, retryAfterSec: null },
    line,
    "/",
  );
  return { message };
}

type LoadFailedProps = {
  failure: LoadFailure;
  /** Omitted → window.location.reload() (server components can't pass one). */
  onRetry?: () => void;
  /** "light" on cream surfaces, "dark" on glass, Otto and the map. */
  tone?: "light" | "dark";
  /** One tight row: comments, search dropdowns, zone sheets, strip cards. */
  compact?: boolean;
};

/**
 * A role="alert" box with the message and one coral pill. The pill is the
 * failure's mapped action (Sign in / Review Terms) when it has one, since a
 * retry would only fail again; otherwise Retry. No margin or position of its
 * own, so it sits in the list's place inside the page's layout.
 */
export function LoadFailed({
  failure,
  onRetry,
  tone = "light",
  compact = false,
}: LoadFailedProps): JSX.Element {
  const dark = tone === "dark";
  const action = failure.action;

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: compact ? "row" : "column",
        flexWrap: compact ? "wrap" : "nowrap",
        alignItems: "center",
        justifyContent: compact ? "space-between" : "center",
        gap: compact ? "8px 12px" : 12,
        maxWidth: "100%",
        boxSizing: "border-box",
        padding: compact ? "10px 12px" : "20px 16px",
        borderRadius: compact ? 12 : 16,
        border: dark ? "1px dashed rgba(255,255,255,0.14)" : "1px dashed rgba(28,28,30,0.14)",
        color: dark ? "rgba(255,255,255,0.7)" : "#5C5853",
        fontFamily: "DM Sans, sans-serif",
        fontSize: compact ? 13 : 14,
        fontWeight: 500,
        lineHeight: 1.45,
        textAlign: compact ? "left" : "center",
      }}
    >
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{failure.message}</span>
      <button
        type="button"
        onClick={(e) => {
          // Kept from click-outside handlers: a retry can unmount this box
          // before the click reaches document, and a detached target reads
          // as "outside" to a dropdown's close check.
          e.preventDefault();
          e.stopPropagation();
          // Full navigation, so the server-side gates on the target run.
          if (action) window.location.assign(action.href);
          else if (onRetry) onRetry();
          else window.location.reload();
        }}
        style={{
          flexShrink: 0,
          margin: 0,
          padding: compact ? "5px 12px" : "7px 16px",
          borderRadius: 999,
          border: "none",
          background: "#FF5C35",
          color: "#FAF7F2",
          fontFamily: "DM Sans, sans-serif",
          fontSize: compact ? 12 : 13,
          fontWeight: 700,
          letterSpacing: "0.02em",
          lineHeight: 1.4,
          whiteSpace: "nowrap",
          cursor: "pointer",
        }}
      >
        {action ? action.label : "Retry"}
      </button>
    </div>
  );
}
