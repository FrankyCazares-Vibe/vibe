"use client";

/**
 * The rows of the Members and Officers pages: photo, name, @handle and
 * title, the role chip for the owner and officers. A row someone may act on
 * is a button that opens their choices; anyone else's is a plain row, so a
 * tap never opens an empty sheet.
 */
import type { JSX } from "react";

import { busyStyle } from "@/components/orgs/club-tool-styles";

import { roleWord, type MemberAction } from "./member-rules";
import { Chevron, PersonLine, cardStyle, chipStyle, personRowStyle, rowItemStyle } from "./tools-ui";
import type { MemberRow } from "./types";

export function MemberList({
  rows,
  selfId,
  actionsFor,
  busyId,
  onOpen,
}: {
  rows: MemberRow[];
  selfId: string;
  actionsFor: (m: MemberRow) => MemberAction[];
  busyId: string | null;
  onOpen: (m: MemberRow) => void;
}): JSX.Element {
  return (
    <ul style={cardStyle}>
      {rows.map((m) => {
        const you = m.user_id === selfId;
        const chips = (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {you ? <span style={{ ...chipStyle, background: "transparent", color: "var(--ink-muted)", padding: 0 }}>You</span> : null}
            {m.role === "owner" || m.role === "admin" ? <span style={chipStyle}>{roleWord(m.role)}</span> : null}
          </span>
        );
        const line = (
          <PersonLine name={m.name} handle={m.handle} avatarUrl={m.avatar_url} sub={m.title ?? undefined} end={chips} />
        );
        const actionable = actionsFor(m).length > 0;
        return (
          <li key={m.user_id} style={rowItemStyle}>
            {actionable ? (
              <button
                type="button"
                className="vibe-press"
                disabled={busyId === m.user_id}
                aria-haspopup="dialog"
                aria-label={`${m.name || m.handle || "Member"}${m.title ? `, ${m.title}` : ""}, ${roleWord(m.role)}. Options`}
                onClick={() => onOpen(m)}
                style={{ ...personRowStyle, ...busyStyle(busyId === m.user_id) }}
              >
                {line}
                <Chevron />
              </button>
            ) : (
              <div style={{ ...personRowStyle, cursor: "default" }}>{line}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
