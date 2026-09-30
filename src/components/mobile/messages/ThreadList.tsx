"use client";

import Link from "next/link";

import { relativeTime, threadAvatar, threadTitle } from "./format";
import { type Tab, type ThreadEntry } from "./types";

export function TabPill({
  label,
  active,
  onClick,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 14px",
        borderRadius: 999,
        border: "1px solid rgba(var(--scrim-rgb),0.10)",
        background: active ? "var(--charcoal)" : "var(--paper-70)",
        color: active ? "var(--paper)" : "var(--ink-2)",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {label}
      {badge ? (
        <span
          style={{
            display: "inline-flex",
            minWidth: 18,
            height: 18,
            padding: "0 6px",
            borderRadius: 999,
            background: active ? "rgba(255,255,255,0.18)" : "#FF5C35",
            // On the active pill it follows the pill's ink (the pill inverts
            // in Night); on coral it stays white.
            color: active ? "var(--paper)" : "#fff",
            fontSize: 11,
            fontWeight: 800,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  );
}

export function ThreadRow({
  thread,
  onTap,
}: {
  thread: ThreadEntry;
  onTap: () => void;
}) {
  const { url: avatarUrl, initials } = threadAvatar(thread);
  const title = threadTitle(thread);
  // A photo, video or shared post sent without a caption has empty
  // content — say which instead of a blank line. "Attachment" is left for
  // a server that doesn't send the kinds.
  const lm = thread.last_message;
  const preview = !lm
    ? "No messages yet"
    : lm.content?.trim() ||
      (lm.media_kind === "video"
        ? "Video"
        : lm.media_kind === "image"
          ? "Photo"
          : lm.attachment_kind === "clip"
            ? "Shared a clip"
            : lm.attachment_kind === "post"
              ? "Shared a post"
              : "Attachment");
  const when = relativeTime(thread.last_message?.created_at);
  const unread = !!thread.unread;

  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          background: "transparent",
          border: "none",
          borderBottom: "1px solid rgba(var(--scrim-rgb),0.04)",
          cursor: "pointer",
          textAlign: "left",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: 999,
            background: avatarUrl
              ? `url(${avatarUrl}) center/cover`
              : "#FFD3C2",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1C1C1E",
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 17,
            border: "1px solid rgba(255,255,255,0.6)",
          }}
        >
          {!avatarUrl ? initials : null}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 16,
                fontWeight: unread ? 900 : 700,
                color: "var(--charcoal)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </span>
            <span
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 11.5,
                color: unread ? "#FF5C35" : "var(--ink-muted)",
                fontWeight: unread ? 800 : 600,
                flexShrink: 0,
              }}
            >
              {when}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 2,
            }}
          >
            <span
              style={{
                flex: 1,
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13,
                color: unread ? "var(--charcoal)" : "var(--ink-muted)",
                fontWeight: unread ? 600 : 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {preview}
            </span>
            {unread ? (
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#FF5C35",
                  flexShrink: 0,
                }}
              />
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}

export function ListSkeleton() {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <li
          key={i}
          style={{
            display: "flex",
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid rgba(var(--scrim-rgb),0.04)",
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 999,
              background: "rgba(var(--scrim-rgb),0.06)",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                width: "55%",
                height: 14,
                background: "rgba(var(--scrim-rgb),0.08)",
                borderRadius: 6,
                marginBottom: 6,
              }}
            />
            <div
              style={{
                width: "85%",
                height: 11,
                background: "rgba(var(--scrim-rgb),0.05)",
                borderRadius: 5,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ tab }: { tab: Tab }) {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        color: "var(--ink-2)",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 18,
          fontWeight: 800,
          color: "var(--charcoal)",
          marginBottom: 6,
        }}
      >
        {tab === "requests" ? "No message requests" : "No conversations yet"}
      </div>
      <p
        style={{
          fontSize: 13.5,
          lineHeight: 1.55,
          margin: "0 auto",
          maxWidth: 260,
        }}
      >
        {tab === "requests"
          ? "Requests from people you don't follow yet will show up here."
          : "Search for someone in Network and tap message to start a conversation."}
      </p>
      {tab !== "requests" ? (
        <Link
          href="/network"
          style={{
            display: "inline-block",
            marginTop: 14,
            padding: "9px 18px",
            borderRadius: 999,
            background: "var(--charcoal)",
            color: "var(--paper)",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Find people
        </Link>
      ) : null}
    </div>
  );
}
