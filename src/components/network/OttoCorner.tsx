"use client";

import { useEffect, useRef, useState } from "react";

import { OttoSidePanel } from "./OttoSidePanel";

/**
 * Persistent bottom-right Otto presence — visual parity with the legacy
 * `_otto.js` corner ring (dark 52px shell, orange orbit + breathing pulse +
 * pulsing core, optional unread dot).
 *
 * Polls `/api/me/notifications/count` every 30s for the unread badge — same
 * cadence as `_otto.js`. Click opens the slide-out side panel; the panel
 * marks all notifications read so the dot disappears next poll.
 *
 * Live mention pop-up: whenever the unread count increases between polls
 * we peek the newest notification. If it's a mention AND the actor is
 * mutually connected with the viewer, a toast slides up from the corner
 * with a one-tap link to the post. Non-mention notifications, or
 * mentions from non-connections, just bump the dot quietly.
 */
type MentionToast = {
  id: string;
  name: string;
  handle: string | null;
  postId: string | null;
  preview: string;
};

type NotifLite = {
  id: string;
  type: string;
  created_at: string;
  actor?: {
    id: string;
    name: string | null;
    handle: string | null;
  } | null;
  post?: { id: string; content: string | null } | null;
};

export function OttoCorner() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<MentionToast | null>(null);
  // Last unread count + newest notif id seen. Persisted via refs so the
  // 30s interval closure always sees the latest values without rebinding.
  const lastUnreadRef = useRef<number | null>(null);
  const lastNewestIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tryToastMention = async (notif: NotifLite) => {
      if (notif.type !== "mention") return;
      const actor = notif.actor;
      if (!actor?.id) return;
      // Only pop the toast when the mentioner is mutually connected.
      // Falls through to the silent dot when they aren't — matches the
      // user's mental model that "ping me only for people I know".
      try {
        const r = await fetch(
          `/api/me/follow-states?ids=${encodeURIComponent(actor.id)}`,
          { cache: "no-store" },
        );
        const j = await r.json();
        if (!j?.ok) return;
        const state = j.states?.[actor.id];
        if (state !== "connected") return;
      } catch {
        return;
      }
      if (cancelled) return;
      const display =
        actor.name ?? (actor.handle ? `@${actor.handle}` : "Someone");
      setToast({
        id: notif.id,
        name: display,
        handle: actor.handle,
        postId: notif.post?.id ?? null,
        preview: (notif.post?.content ?? "").slice(0, 120),
      });
    };

    const fetchCount = async () => {
      try {
        const res = await fetch("/api/me/notifications/count", {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (!data?.ok || typeof data.unread !== "number") return;
        const nextUnread = data.unread as number;
        const prev = lastUnreadRef.current;
        setUnread(nextUnread);
        lastUnreadRef.current = nextUnread;
        // Only peek the newest notif when we have an established baseline
        // AND the count just went up — keeps the cold-load case silent.
        if (prev !== null && nextUnread > prev) {
          try {
            const r2 = await fetch("/api/me/notifications?limit=1", {
              cache: "no-store",
            });
            const j2 = await r2.json();
            const newest: NotifLite | undefined = j2?.ok
              ? j2.notifications?.[0]
              : undefined;
            if (newest && newest.id !== lastNewestIdRef.current) {
              lastNewestIdRef.current = newest.id;
              await tryToastMention(newest);
            }
          } catch {
            /* silent — toast is best-effort */
          }
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

  // Auto-dismiss toast after 8s so it doesn't camp the corner forever.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 8_000);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <>
    <button
      id="otto-corner"
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
    {toast ? (
      <div
        role="alert"
        style={{
          position: "fixed",
          bottom: 92,
          right: 24,
          zIndex: 9991,
          maxWidth: 320,
          background:
            "linear-gradient(180deg, rgba(28,28,30,0.96) 0%, rgba(16,14,18,0.96) 100%)",
          border: "1px solid rgba(255,92,53,0.35)",
          borderRadius: 14,
          padding: "12px 14px",
          color: "#FAF7F2",
          fontFamily: "DM Sans, sans-serif",
          boxShadow:
            "0 18px 40px rgba(0,0,0,0.36), 0 0 24px rgba(255,92,53,0.22)",
          animation: "otto-toast-in 220ms cubic-bezier(.22,1,.36,1)",
        }}
      >
        <style>{`
          @keyframes otto-toast-in {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#FFB89C",
            marginBottom: 6,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#FF5C35",
              boxShadow: "0 0 8px rgba(255,92,53,0.7)",
            }}
          />
          otto · mention
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.45, marginBottom: 10 }}>
          <strong style={{ fontWeight: 700 }}>{toast.name}</strong>{" "}
          mentioned you{toast.preview ? ":" : "."}
          {toast.preview ? (
            <div
              style={{
                marginTop: 4,
                color: "rgba(250,247,242,0.65)",
                fontSize: 12,
                lineHeight: 1.45,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {toast.preview}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {toast.postId ? (
            <a
              href={`/profile?post=${encodeURIComponent(toast.postId)}`}
              onClick={() => setToast(null)}
              style={{
                flex: 1,
                display: "inline-block",
                textAlign: "center",
                padding: "7px 12px",
                borderRadius: 999,
                background: "#FF5C35",
                color: "#FAF7F2",
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              Open post →
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{
              padding: "7px 12px",
              borderRadius: 999,
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "rgba(250,247,242,0.7)",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    ) : null}
    </>
  );
}
