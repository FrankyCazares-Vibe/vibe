"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

import {
  asLoadFailure,
  LoadFailed,
  type LoadFailure,
} from "@/components/feedback/LoadFailed";
import { OrgJoinControl } from "@/components/orgs/OrgJoinControl";
import { vibeRequest } from "@/lib/feedback/request";
import { channelsGateCopy, type BoardCard, type OrgRelation } from "@/lib/orgs/join-copy";

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
 * For non-members: the card shows its heading and one line from
 *   `channelsGateCopy` ("Chats are for members." plus what they can do about
 *   it), with the one membership control worth offering inline (Join on an
 *   open club, Request to join on a request club). It never asks for the list:
 *   the route answers non-members 403 `members_only`, so fetching anyway only
 *   ever painted a red failure line.
 *
 * `relation` null means the page couldn't load the viewer's membership. That
 *   is a failure, not a non-member, so it renders LoadFailed and still never
 *   fetches.
 */
export function ChannelsSection({
  orgHandle,
  relation,
}: {
  orgHandle: string;
  relation: OrgRelation | null;
}) {
  const router = useRouter();
  const viewerIsMember = relation?.state === "member";
  const [channels, setChannels] = useState<Channel[] | null>(null);
  // A failed read is not an org without channels: it renders as the failure
  // line, never "No channels here yet."
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [subscribing, setSubscribing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!viewerIsMember) return;
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<{ channels?: Channel[] }>(
        `/api/orgs/${encodeURIComponent(orgHandle)}/channels`,
        {
          cache: "no-store",
          quiet: true,
          failure: "Couldn't load this org's channels.",
        },
      );
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.channels)) {
        setLoadErr(null);
        setChannels(r.data.channels);
      } else {
        setLoadErr(asLoadFailure(r, "Couldn't load this org's channels."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgHandle, loadKey, viewerIsMember]);

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

  // Null for a member (and for a failed relation, handled first below).
  const gate = relation ? channelsGateCopy(relation) : null;

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
              // Dark words on the coral fill (4.8:1 at its darkest corner);
              // white was 3.1:1.
              color: "var(--on-coral, #160A06)",
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

      {relation === null ? (
        <LoadFailed
          tone="dark"
          failure={{ message: "Couldn't load this org's channels." }}
          onRetry={() => router.refresh()}
        />
      ) : !viewerIsMember ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p
            style={{
              margin: 0,
              color: "rgba(255,255,255,0.6)",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            {gate?.line}
          </p>
          {gate?.inline ? (
            <OrgJoinControl
              variant="header"
              axis="membership"
              source="profile"
              relation={relation}
              onChange={() => router.refresh()}
            />
          ) : null}
        </div>
      ) : channels === null && loadErr ? (
        <LoadFailed
          tone="dark"
          failure={loadErr}
          onRetry={() => {
            setLoadErr(null);
            setLoadKey((k) => k + 1);
          }}
        />
      ) : channels === null ? (
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
              orgHandle={orgHandle}
            />
          ) : null}
          {privateChannels.length > 0 ? (
            <ChannelGroup
              label="Private"
              channels={privateChannels}
              orgHandle={orgHandle}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

function ChannelGroup({
  label,
  channels,
  orgHandle,
}: {
  label: string;
  channels: Channel[];
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
          <ChannelRow key={c.id} channel={c} orgHandle={orgHandle} />
        ))}
      </div>
    </div>
  );
}

function ChannelRow({
  channel,
  orgHandle,
}: {
  channel: Channel;
  orgHandle: string;
}) {
  const href = `/campus?tab=chat&org=${encodeURIComponent(orgHandle)}&channel=${encodeURIComponent(channel.id)}`;
  return (
    <Link
      href={href}
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
        cursor: "pointer",
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

/**
 * The club's Announcement Board card (club model, Franky's calls of Oct 16).
 * The page decides which card, if any, with `boardCardView`: members get
 * Open, followers the database lets in get Read the Board, a visitor whom
 * following would let in gets Follow to read the Board, and one whose school
 * email is all that's missing gets Verify school email. Nobody else
 * gets this card at all, so a follower who was barred sees nothing different
 * from a club that keeps its Board to members.
 *
 * Open and Read go to `/messages?channel=<board>`, which opens a club room on
 * phone and desktop alike. Follow is the shared follow control (the header's
 * own, with this card's words), so it waits for the server and the page
 * refresh swaps the card for Read the Board. Verify links to
 * `/auth/school-email`.
 *
 * Laid out as one row that wraps: the words take the space, and when the
 * button can't fit beside them it drops to its own line (375 px phones).
 */
export function BoardSection({ card, relation }: { card: BoardCard; relation: OrgRelation }) {
  const router = useRouter();
  return (
    <section
      aria-label={card.title}
      style={{
        marginTop: 16,
        padding: "12px 14px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14)",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ flex: "999 1 240px", minWidth: 0, display: "flex", alignItems: "center", gap: 12 }}>
        <span
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFB59E",
            background: "rgba(255,92,53,0.16)",
            border: "1px solid rgba(255,92,53,0.32)",
          }}
        >
          <MegaphoneGlyph />
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.55)",
            }}
          >
            {card.title}
          </div>
          <div style={{ marginTop: 2, fontSize: 13.5, lineHeight: 1.45, color: "rgba(255,255,255,0.88)" }}>
            {card.line}
          </div>
        </div>
      </div>
      <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", justifyContent: "flex-end" }}>
        {card.kind === "follow" ? (
          <OrgJoinControl
            variant="header"
            axis="follow"
            followLabel={card.cta}
            source="profile"
            relation={relation}
            onChange={() => router.refresh()}
          />
        ) : card.href ? (
          <Link href={card.href} style={boardLinkStyle}>
            {card.cta}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/** The org page's coral glass pill (`OrgJoinControl`'s filled header look). */
const boardLinkStyle: CSSProperties = {
  flex: "1 1 auto",
  maxWidth: 280,
  minHeight: 44,
  padding: "0 18px",
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 12,
  color: "#fff",
  background: "linear-gradient(180deg, rgba(255,92,53,0.55) 0%, rgba(255,92,53,0.22) 100%)",
  border: "1px solid rgba(255,180,150,0.5)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13.5,
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
  WebkitTapHighlightColor: "transparent",
};

function MegaphoneGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3 8.5v3a1 1 0 0 0 1 1h2l6 3.5v-12L6 7.5H4a1 1 0 0 0-1 1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M6.5 12.5 7.5 17h2l-.8-3.4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M15 7.5a3.5 3.5 0 0 1 0 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
