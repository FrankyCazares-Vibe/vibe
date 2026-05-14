"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Channel = {
  id: string;
  name: string;
  topic: string | null;
  is_private: boolean;
  pinned: boolean | null;
  position: number | null;
};

/**
 * Lists the org's visible channels, grouped by Public / Private.
 * RLS filters out private channels the viewer can't see (non-staff /
 * non-members).
 *
 * For members: "+ Join all public" button at the top idempotently
 *   subscribes them to every non-private channel via the
 *   /channels/subscribe-public endpoint. Useful for users who joined
 *   before the auto-subscribe wiring or want to (re-)pick up newer
 *   public channels.
 *
 * For visitors: rows are dimmed + tap-suppressed; a "Join the org to
 *   chat" hint sits below the list.
 */
export function ChannelsSection({
  orgHandle,
  viewerIsMember,
}: {
  orgHandle: string;
  viewerIsMember: boolean;
}) {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/orgs/${encodeURIComponent(orgHandle)}/channels`,
          { cache: "no-store" },
        );
        const j = await r.json();
        if (cancelled) return;
        setChannels(
          j?.ok && Array.isArray(j.channels) ? (j.channels as Channel[]) : [],
        );
      } catch {
        if (!cancelled) setChannels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgHandle]);

  const joinAllPublic = useCallback(async () => {
    if (subscribing) return;
    setSubscribing(true);
    setToast(null);
    try {
      const r = await fetch(
        `/api/orgs/${encodeURIComponent(orgHandle)}/channels/subscribe-public`,
        { method: "POST" },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Failed");
      const n = typeof j.subscribed === "number" ? j.subscribed : 0;
      setToast(
        n === 0
          ? "Already in every public channel"
          : `Joined ${n} channel${n === 1 ? "" : "s"}`,
      );
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Couldn't join channels");
    } finally {
      setSubscribing(false);
    }
  }, [orgHandle, subscribing]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const publicChannels =
    channels?.filter((c) => !c.is_private).sort(sortChannels) ?? [];
  const privateChannels =
    channels?.filter((c) => c.is_private).sort(sortChannels) ?? [];

  return (
    <section
      style={{
        padding: "clamp(12px, 3.6vw, 16px)",
        borderRadius: 16,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.55)",
          }}
        >
          Channels
        </span>
        {viewerIsMember && publicChannels.length > 0 ? (
          <button
            type="button"
            onClick={() => void joinAllPublic()}
            disabled={subscribing}
            style={{
              padding: "5px 10px",
              borderRadius: 999,
              border: "none",
              background:
                "linear-gradient(135deg,#FF7A4D 0%,#FF5C35 60%,#E04A26 100%)",
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 11.5,
              fontWeight: 800,
              letterSpacing: "0.02em",
              cursor: subscribing ? "default" : "pointer",
              opacity: subscribing ? 0.7 : 1,
              boxShadow: "0 4px 12px rgba(255,92,53,0.32)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {subscribing ? "Joining…" : "+ Join all public"}
          </button>
        ) : null}
      </div>

      {toast ? (
        <div
          style={{
            margin: "0 0 10px",
            padding: "6px 10px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.85)",
            fontSize: 11.5,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      ) : null}

      {channels === null ? (
        <Skeleton />
      ) : channels.length === 0 ? (
        <p
          style={{
            margin: 0,
            color: "rgba(255,255,255,0.6)",
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          No channels here yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {publicChannels.length > 0 ? (
            <ChannelGroup
              label="Public"
              channels={publicChannels}
              viewerIsMember={viewerIsMember}
              orgHandle={orgHandle}
            />
          ) : null}
          {privateChannels.length > 0 ? (
            <ChannelGroup
              label="Private"
              channels={privateChannels}
              viewerIsMember={viewerIsMember}
              orgHandle={orgHandle}
            />
          ) : null}
          {!viewerIsMember ? (
            <div
              style={{
                marginTop: 2,
                padding: "8px 10px",
                borderRadius: 10,
                background: "rgba(255,92,53,0.08)",
                border: "1px solid rgba(255,92,53,0.16)",
                color: "rgba(255,255,255,0.78)",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              Join the org above to chat in these channels.
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ChannelGroup({
  label,
  channels,
  viewerIsMember,
  orgHandle,
}: {
  label: string;
  channels: Channel[];
  viewerIsMember: boolean;
  orgHandle: string;
}) {
  return (
    <div>
      <div
        style={{
          padding: "0 2px 6px",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.48)",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {channels.map((c) => (
          <ChannelRow
            key={c.id}
            channel={c}
            viewerIsMember={viewerIsMember}
            orgHandle={orgHandle}
          />
        ))}
      </div>
    </div>
  );
}

function ChannelRow({
  channel,
  viewerIsMember,
  orgHandle,
}: {
  channel: Channel;
  viewerIsMember: boolean;
  orgHandle: string;
}) {
  const href = viewerIsMember
    ? `/campus?tab=chat&org=${encodeURIComponent(orgHandle)}&channel=${encodeURIComponent(channel.id)}`
    : "#";
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (!viewerIsMember) e.preventDefault();
      }}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "#fff",
        textDecoration: "none",
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: viewerIsMember ? "pointer" : "default",
        opacity: viewerIsMember ? 1 : 0.65,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: channel.is_private
            ? "rgba(155,127,255,0.18)"
            : "rgba(157,216,255,0.18)",
          color: channel.is_private ? "#C6B0FF" : "#A8DAFF",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "DM Sans, sans-serif",
          fontWeight: 800,
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        {channel.is_private ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <rect x="2.5" y="5" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path d="M4 5V3.6a2 2 0 1 1 4 0V5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </svg>
        ) : (
          "#"
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13.5,
            fontWeight: 700,
          }}
        >
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {channel.name}
          </span>
          {channel.pinned ? (
            <span
              aria-label="Pinned"
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "rgba(255,224,168,0.92)",
                background: "rgba(240,200,74,0.16)",
                border: "1px solid rgba(240,200,74,0.35)",
                padding: "1px 5px",
                borderRadius: 999,
              }}
            >
              Pinned
            </span>
          ) : null}
        </div>
        {channel.topic ? (
          <div
            style={{
              marginTop: 2,
              fontSize: 11.5,
              color: "rgba(255,255,255,0.55)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {channel.topic}
          </div>
        ) : null}
      </div>
      <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, flexShrink: 0 }}>
        ↗
      </span>
    </Link>
  );
}

function sortChannels(a: Channel, b: Channel): number {
  // Pinned first, then by position, then alphabetical.
  if (!!b.pinned !== !!a.pinned) return Number(!!b.pinned) - Number(!!a.pinned);
  const ap = a.position ?? 1000;
  const bp = b.position ?? 1000;
  if (ap !== bp) return ap - bp;
  return a.name.localeCompare(b.name);
}

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 44,
            borderRadius: 10,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        />
      ))}
    </div>
  );
}
