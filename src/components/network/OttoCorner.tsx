"use client";

import { useEffect, useState } from "react";

import { OttoSidePanel } from "./OttoSidePanel";

/**
 * Persistent bottom-right Otto presence — visual parity with the legacy
 * `_otto.js` corner ring (dark 52px shell, orange orbit + breathing pulse +
 * pulsing core, optional unread dot).
 *
 * Polls `/api/me/notifications/count` every 30s for the unread badge — same
 * cadence as `_otto.js`. Click opens the slide-out side panel; the panel
 * marks all notifications read so the dot disappears next poll.
 */
export function OttoCorner() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchCount = async () => {
      try {
        const res = await fetch("/api/me/notifications/count", {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (data?.ok && typeof data.unread === "number") {
          setUnread(data.unread);
        }
      } catch {
        /* keep prior value on error */
      }
    };

    void fetchCount();
    const id = window.setInterval(fetchCount, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <>
    <button
      type="button"
      onClick={() => {
        setOpen(true);
        // Optimistic — the panel will mark-read server-side; clear the
        // dot now so it doesn't blink for the polling interval.
        if (unread > 0) setUnread(0);
      }}
      aria-label={
        unread > 0 ? `Open Otto · ${unread} unread` : "Open Otto"
      }
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9990,
        display: "block",
        width: 52,
        height: 52,
        padding: 0,
        borderRadius: "50%",
        background: "#1C1C1E",
        border: "0.5px solid rgba(255,92,53,0.3)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px) scale(1.04)";
        e.currentTarget.style.boxShadow = "0 12px 32px rgba(255,92,53,0.25)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18)";
      }}
    >
      {/* Notification dot */}
      {unread > 0 ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            width: 11,
            height: 11,
            borderRadius: "50%",
            background: "#FF5C35",
            border: "2px solid #FAF7F2",
            boxShadow: "0 0 8px rgba(255,92,53,0.5)",
            zIndex: 2,
          }}
        />
      ) : null}

      {/* Centered viz: breath ring + orbit dot + pulsing core */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "relative",
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Inner breathing pulse ring (matches _otto.js .otto-pulse-o) */}
          <div
            style={{
              position: "absolute",
              inset: 4,
              borderRadius: "50%",
              border: "1px solid #FF5C35",
              animation: "otto-breath 2.8s ease-out infinite",
            }}
          />
          {/* Outer spinning orbit + tracer dot */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "0.5px solid rgba(255,92,53,0.3)",
              animation: "otto-orbit-spin 8s linear infinite",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: 3,
                height: 3,
                borderRadius: "50%",
                background: "#FF5C35",
              }}
            />
          </div>
          {/* Pulsing core — solid orange ball with glow (matches _otto.js .otto-core) */}
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "#FF5C35",
              boxShadow: "0 0 10px #FF5C35",
              animation: "otto-core-pulse 2.4s ease-in-out infinite",
            }}
          />
        </div>
      </div>
    </button>
    <OttoSidePanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
