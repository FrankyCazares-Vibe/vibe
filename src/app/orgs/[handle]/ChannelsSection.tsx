"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Channel = {
  id: string;
  name: string;
  topic: string | null;
  is_private: boolean;
  pinned: boolean | null;
  position: number | null;
};

/**
 * Lists the org's visible channels. RLS filters out private channels
 * the viewer can't see (non-staff / non-members). Each row deep-links
 * into /messages, where the channel will appear in the viewer's
 * thread list (org members are auto-subscribed via the join
 * handler's channel_members upsert).
 *
 * For non-members of public orgs: channels still show, but the visit
 * to /messages won't reveal the channel until they hit Join first.
 * The empty / pinned visual treatment makes that obvious.
 */
export function ChannelsSection({
  orgHandle,
  viewerIsMember,
}: {
  orgHandle: string;
  /** True when the viewer is an org_member (any role). Drives the
   *  "Join to chat" hint vs. the deep-link CTA. */
  viewerIsMember: boolean;
}) {
  const [channels, setChannels] = useState<Channel[] | null>(null);

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
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.55)",
          marginBottom: 10,
        }}
      >
        Channels
      </div>

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
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {channels.map((c) => (
            <ChannelRow
              key={c.id}
              channel={c}
              viewerIsMember={viewerIsMember}
            />
          ))}
          {!viewerIsMember ? (
            <div
              style={{
                marginTop: 6,
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

function ChannelRow({
  channel,
  viewerIsMember,
}: {
  channel: Channel;
  viewerIsMember: boolean;
}) {
  const href = viewerIsMember
    ? `/messages?channel=${encodeURIComponent(channel.id)}`
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
