"use client";

import { useSyncExternalStore } from "react";

import {
  dismissToast,
  getToastSnapshot,
  subscribeToast,
  type ToastItem,
} from "@/lib/feedback/toast";
import { useIsMobile } from "@/lib/use-is-mobile";

/** Server render has no toast; the client picks up the store after hydration. */
function getServerSnapshot(): ToastItem | null {
  return null;
}

/**
 * The one toast on screen for every React route (silent-failure design §3a).
 * Mounted once in the root layout and fed by the module store in
 * src/lib/feedback/toast.ts, so there's no provider to thread through.
 *
 * Fixed bottom-center at z 12000 (the highest React layer elsewhere is 11000;
 * the custom cursor stays above). At mobile widths it sits 76px up so
 * `.vibe-mobile-tabbar` never covers it. Tap to dismiss. It can't reach into
 * the static-page iframes; those use window.vibeToast from
 * public/html/_persistence.js.
 */
export function ToastHost() {
  const item = useSyncExternalStore(subscribeToast, getToastSnapshot, getServerSnapshot);
  const isMobile = useIsMobile();
  const isError = item?.tone === "error";

  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: isMobile ? "calc(env(safe-area-inset-bottom, 0px) + 76px)" : 24,
        zIndex: 12000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      <style>{`
        @keyframes vibe-toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {/* Both live regions stay mounted so a screen reader hears the toast
          arrive: polite for info, an alert for failures. Both carry an
          explicit aria-live: a modal Radix dialog aria-hides everything
          outside it except [aria-live] nodes (aria-hidden's hideOthers), so
          without it a refusal inside the post viewer would be silent. */}
      <div role="status" aria-live="polite" style={{ maxWidth: "100%" }}>
        {item && !isError ? <ToastPill key={item.id} item={item} /> : null}
      </div>
      <div role="alert" aria-live="assertive" style={{ maxWidth: "100%" }}>
        {item && isError ? <ToastPill key={item.id} item={item} /> : null}
      </div>
    </div>
  );
}

/** Dark DM Sans pill; failures get a coral dot and border, actions a coral button. */
function ToastPill({ item }: { item: ToastItem }) {
  const isError = item.tone === "error";
  const action = item.action;

  return (
    <div
      data-cursor-hover
      onClick={dismissToast}
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: 520,
        boxSizing: "border-box",
        padding: action ? "7px 7px 7px 16px" : "11px 18px",
        borderRadius: 22,
        background: "#1C1C1E",
        border: isError
          ? "1px solid rgba(255,92,53,0.45)"
          : "1px solid rgba(255,255,255,0.08)",
        boxShadow: isError
          ? "0 12px 36px rgba(0,0,0,0.22), 0 0 20px rgba(255,92,53,0.18)"
          : "0 12px 36px rgba(0,0,0,0.18)",
        color: "#FAF7F2",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.4,
        cursor: "pointer",
        animation: "vibe-toast-in 220ms cubic-bezier(.22,1,.36,1)",
      }}
    >
      {isError ? (
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#FF5C35",
            boxShadow: "0 0 8px rgba(255,92,53,0.6)",
            flexShrink: 0,
          }}
        />
      ) : null}
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{item.message}</span>
      {action ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            dismissToast();
            // Full navigation, so the server-side gates on the target run.
            window.location.assign(action.href);
          }}
          style={{
            flexShrink: 0,
            padding: "6px 12px",
            borderRadius: 999,
            border: "none",
            background: "#FF5C35",
            color: "#FAF7F2",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
