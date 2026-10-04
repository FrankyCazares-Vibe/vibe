"use client";

import { useEffect, useState } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { personColor } from "@/components/mobile/messages/avatar";
import { authorName, roleWord } from "@/components/mobile/messages/club/helpers";
import { initialsOf } from "@/components/mobile/messages/format";
import { HomeSkeleton } from "@/components/mobile/messages/home/MessagesHome";
import { palette } from "@/components/mobile/messages/v2-tokens";
import type { ClubRole } from "@/lib/chat/types";
import { vibeRequest } from "@/lib/feedback/request";

import type { MembersDialogProps, RosterResponse, RosterRow } from "./contracts";
import { DesktopDialog } from "./DesktopDialog";

/**
 * "See all" under the club panel's faces (handoffs/chat-redesign/
 * wave-3-desktop/contract.md C4, 1.3 K4, 6.5, section 8 W3-5-people): who is
 * in this club, in a dialog inside Messages. The club page lists nobody, so
 * this is the one place that answers it.
 *
 * ONE read when the dialog opens: `GET /api/orgs/<handle>/members?visible=1`
 * (`RosterResponse`: every member, owner first). `visible=1` leaves out the
 * people in a block with the viewer, either way, as the faces row does; when
 * that block read fails the route answers 503 and the dialog shows
 * `LoadFailed` with Retry, never an unfiltered list.
 *
 * The search is over the rows on hand (name and handle), no request. A row
 * is the person's mark, name, `@handle` and role word, and a link to
 * `/profile/<handle>`; a member with no handle has no profile address, so
 * their row is plain. The link is a plain `<a>` (a full navigation, and
 * Cmd-click opens a tab): the dialog is left open under it, and its history
 * entry is tidied by the shell when the person comes Back (`adoptLayerEntry`).
 */

const FAILURE = "Couldn't load the members.";

const MEMBERS_CSS = `
a.vibe-members-row { background: transparent; }
a.vibe-members-row:hover { background: rgba(var(--scrim-rgb), 0.045); }
a.vibe-members-row:focus-visible, .vibe-members-field:focus-visible { outline: 2px solid var(--coral); outline-offset: -2px; }
.vibe-members-field::placeholder { color: var(--vibe-members-ph); opacity: 1; }
`;

/** One read of the roster, kept with the Retry count it answers. */
type Answer = { seq: number; members: RosterRow[]; failure: null } | { seq: number; members: null; failure: LoadFailure };

/** The search: every typed word is in the person's name or handle, any case. */
function matches(person: RosterRow, query: string): boolean {
  const hay = `${person.name ?? ""} ${person.handle ?? ""}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).every((word) => hay.includes(word.replace(/^@/, "")));
}

export function MembersDialog({ orgHandle, clubName, night, onClose }: MembersDialogProps) {
  const t = palette(night);
  const url = `/api/orgs/${encodeURIComponent(orgHandle)}/members?visible=1`;
  // Retry on a failed read bumps this: the roster is read again.
  const [seq, setSeq] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const r = await vibeRequest<Partial<RosterResponse>>(url, { cache: "no-store", quiet: true, failure: FAILURE });
      if (cancelled) return;
      const members = r.ok && Array.isArray(r.data.members) ? r.data.members : null;
      setAnswer(members ? { seq, members, failure: null } : { seq, members: null, failure: asLoadFailure(r, FAILURE) });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [url, seq]);

  const current = answer && answer.seq === seq ? answer : null;
  const q = query.trim();
  const found = current?.members ? current.members.filter((person) => matches(person, q)) : null;

  return (
    <DesktopDialog title={`Members of ${clubName}`} onClose={onClose}>
      <style>{MEMBERS_CSS}</style>
      {/* The search stays in view while the people under it scroll. As wide as the card, so a row passing under it does not show at its sides. */}
      <div style={{ position: "sticky", top: 0, zIndex: 1, margin: "0 -20px", padding: "0 20px 10px", background: t.surface }}>
        <div style={{ position: "relative" }}>
          <span aria-hidden="true" style={{ position: "absolute", left: 13, top: 12, color: t.muted, display: "flex", pointerEvents: "none" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input
            type="search"
            className="vibe-members-field"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search members"
            placeholder="Search members"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            style={{ ["--vibe-members-ph" as string]: t.muted, width: "100%", height: 40, boxSizing: "border-box", padding: "0 12px 0 38px", borderRadius: 12, border: `1px solid ${t.fieldBorder}`, background: "rgba(var(--scrim-rgb), 0.05)", color: t.ink, fontFamily: "inherit", fontSize: 14 }}
          />
        </div>
      </div>

      {/* The rows run edge to edge of the card (the dialog's body is padded 20px at the sides). */}
      <div style={{ margin: "0 -20px", minHeight: 264 }}>
        {!current ? (
          <HomeSkeleton />
        ) : current.members === null ? (
          <div style={{ padding: "12px 20px" }}>
            <LoadFailed failure={current.failure} tone={night ? "dark" : "light"} compact onRetry={() => setSeq((n) => n + 1)} />
          </div>
        ) : found && found.length > 0 ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {found.map((person) => (
              <li key={person.user_id}>
                <MemberRow person={person} muted={t.muted} secondary={t.secondary} ink={t.ink} />
              </li>
            ))}
          </ul>
        ) : q ? (
          <p style={{ margin: 0, padding: "48px 24px", textAlign: "center", fontSize: 13.5, lineHeight: 1.5, color: t.secondary }}>{`No matches for "${q}"`}</p>
        ) : null}
      </div>
    </DesktopDialog>
  );
}

/** One member: mark, name, `@handle`, the role word. A link to the profile when there is a handle, a plain row when not. */
function MemberRow({ person, muted, secondary, ink }: { person: RosterRow; muted: string; secondary: string; ink: string }) {
  const c = personColor(person.user_id);
  const role = roleWord(person.role as ClubRole);
  const style: React.CSSProperties = { minHeight: 56, boxSizing: "border-box", padding: "8px 20px", color: ink, textDecoration: "none", display: "flex", alignItems: "center", gap: 12 };
  const inner = (
    <>
      <span
        aria-hidden="true"
        style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 999, background: person.avatar_url ? `url(${person.avatar_url}) center/cover` : c.bg, color: c.ink, fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {person.avatar_url ? null : initialsOf(person.name || person.handle)}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{authorName(person)}</span>
        {person.handle ? <span style={{ fontSize: 12.5, lineHeight: 1.35, color: muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>@{person.handle}</span> : null}
      </span>
      {role ? <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: secondary }}>{role}</span> : null}
    </>
  );
  if (!person.handle) return <div style={style}>{inner}</div>;
  return (
    <a href={`/profile/${encodeURIComponent(person.handle)}`} className="vibe-members-row" style={style}>
      {inner}
    </a>
  );
}
