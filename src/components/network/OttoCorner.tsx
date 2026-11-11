"use client";

import { useEffect, useRef, useState } from "react";

import { useMiniMessages } from "@/components/desktop/messages/MiniMessenger";
import { OttoPlanet } from "@/components/otto/planet/OttoPlanet";

import { OttoSidePanel } from "./OttoSidePanel";
import "./otto-corner.css";

/**
 * Persistent bottom-right Otto presence: since Nov 10, 2026 (Otto build
 * wave 1) a 64px paper puck with Otto drawn as Planet inside (46px, live),
 * waiting while something is unseen. The static twin in `_otto.js` follows
 * in the same wave.
 *
 * Polls `/api/me/notifications/count` every 30s for the unread badge — same
 * cadence as `_otto.js`. Click opens the slide-out side panel; the panel
 * marks all notifications read so the count clears next poll.
 *
 * Live mention pop-up: whenever the unread count increases between polls
 * we peek the newest notification. If it's a mention AND the actor is
 * mutually connected with the viewer, a toast slides up from the corner
 * with a one-tap link to the post. Non-mention notifications, or
 * mentions from non-connections, just bump the count quietly.
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
  /** Set once it's been read: the panel, another tab, another device. */
  read_at?: string | null;
  actor?: {
    id: string;
    name: string | null;
    handle: string | null;
  } | null;
  post?: {
    id: string;
    content: string | null;
  } | null;
};

export function OttoCorner() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // Messages lives in the panel too (its second tab, laptops with the new
  // chat): the orb's number is Otto's news plus the unread chats.
  const chats = useMiniMessages(!open);
  const [toast, setToast] = useState<MentionToast | null>(null);
  // Last unread count + newest notif id seen. Persisted via refs so the
  // 30s interval closure always sees the latest values without rebinding.
  const lastUnreadRef = useRef<number | null>(null);
  const lastNewestIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tryToastMention = async (notif: NotifLite) => {
      if (notif.type !== "mention") return;
      // Read means seen already, so it isn't news. The count can rise on
      // an unread row while the newest row is one that's been read.
      if (notif.read_at) return;
      const actor = notif.actor;
      if (!actor?.id) return;
      // Only pop the toast when the mentioner is mutually connected.
      // Falls through to the silent count when they aren't — matches the
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

  // `popping` triggers the puck's one-shot pop when the unseen count ticks
  // up (not on a cold load with something unseen, not when the panel clears
  // it). The browser ignores a restart of the same animation name, so it is
  // toggled off, then on next frame, then off after the duration.
  // otto-corner.css stops it under reduced motion.
  const prevUnreadRef = useRef(0);
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    if (unread > prevUnreadRef.current) {
      setPopping(false);
      const raf = window.requestAnimationFrame(() => setPopping(true));
      const t = window.setTimeout(() => setPopping(false), 720);
      prevUnreadRef.current = unread;
      return () => {
        window.cancelAnimationFrame(raf);
        window.clearTimeout(t);
      };
    }
    prevUnreadRef.current = unread;
  }, [unread]);

  // Something unseen: Otto's news or an unread chat, the badge's count.
  const waiting = unread + chats.unread > 0;

  return (
    <>
    <button
      id="otto-corner"
      type="button"
      onClick={() => {
        setOpen(true);
        // Optimistic — the panel will mark-read server-side; clear the
        // badge now so it doesn't blink for the polling interval.
        if (unread > 0) setUnread(0);
      }}
      aria-label={
        unread + chats.unread > 0
          ? `Open Otto · ${unread} new${chats.unread > 0 ? `, ${chats.unread} unread ${chats.unread === 1 ? "chat" : "chats"}` : ""}`
          : chats.available
            ? "Open Otto and Messages"
            : "Open Otto"
      }
      // The board's corner puck (Nov 10, 2026): 64px, the page's paper,
      // a hairline and the card shadow, so Planet reads in Light and Night.
      // The pop still fires once each time the count ticks up
      // (otto-orb-pop in globals.css, transform only; otto-corner.css
      // stops it under reduced motion).
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9990,
        display: "block",
        width: 64,
        height: 64,
        padding: 0,
        borderRadius: "50%",
        background: "var(--paper)",
        border: "1px solid var(--hairline)",
        boxShadow: "var(--card-shadow)",
        cursor: "pointer",
        transformOrigin: "center",
        transition: "box-shadow 300ms ease",
        animation: popping
          ? "otto-orb-pop 700ms cubic-bezier(.22,1,.36,1) 1"
          : undefined,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow =
          "var(--card-shadow), 0 12px 32px rgba(255,92,53,0.22)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "var(--card-shadow)";
      }}
    >
      {/* The count (Nov 10, 2026): ink on the page colour, still. His
          coral moon at the ring's raised end is the one coral thing that
          says something waits (the board), so the coral pill, its pulse and
          its ripple are gone. The aria-label above carries the numbers. */}
      {unread + chats.unread > 0 ? (
        <span aria-hidden className="otto-corner-count">
          {unread + chats.unread > 9 ? "9+" : unread + chats.unread}
        </span>
      ) : null}

      {/* Otto as Planet (Nov 10, 2026, Otto build wave 1): 46px, live (the
          moon's 16 s lap, a bob and a blink, when the person's look is
          Living). Something unseen (the badge's count) makes him wait: one
          eye bigger and his coral moon at the ring's raised right end, no
          separate dot. Reduced motion holds him still, the moon parked. */}
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <OttoPlanet size={46} live state={waiting ? "wait" : "rest"} />
      </span>
    </button>
    <OttoSidePanel open={open} onClose={() => setOpen(false)} messages={chats} />
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
              href={`/posts/${encodeURIComponent(toast.postId)}`}
              onClick={() => setToast(null)}
              style={{
                flex: 1,
                display: "inline-block",
                textAlign: "center",
                padding: "7px 12px",
                borderRadius: 999,
                background: "#FF5C35",
                color: "var(--on-coral, #160A06)",
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
