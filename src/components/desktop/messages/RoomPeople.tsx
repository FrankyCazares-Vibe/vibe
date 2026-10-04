"use client";

import { useEffect, useRef, useState } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { personColor } from "@/components/mobile/messages/avatar";
import { authorName } from "@/components/mobile/messages/club/helpers";
import { initialsOf } from "@/components/mobile/messages/format";
import { palette } from "@/components/mobile/messages/v2-tokens";
import { vibeRequest } from "@/lib/feedback/request";

import type { RoomPeopleProps, RosterRow } from "./contracts";

/**
 * One room's by-name list inside the Rooms dialog (handoffs/chat-redesign/
 * wave-3-desktop/contract.md 4c.5, 1.3 K4 and K6, section 8 W3-5-people):
 * the people an officer added to this room, under `title` ("Also in this
 * room", "People who can see this room", "People who can post"), each with
 * Remove, and `Add someone`, which opens a searched list of the club's
 * members to pick from. Nobody is added by typing a handle.
 *
 * Reads and writes are the room's own routes, owner and admin only:
 * `GET /api/orgs/<handle>/channels/<roomId>/members`, `POST` the same with
 * `{ user_id }`, `DELETE .../members/<userId>`. The club's roster is NOT
 * read here: the Rooms dialog reads it once, unfiltered (an officer deciding
 * who may enter a room sees every member), and hands it down as `roster`.
 *
 * - Offered: `roster` rows not already on the room's list and whose role is
 *   not in `skipRoles`. Officers are in every room already, so they are
 *   never offered, and a by-name row one of them still holds (added before
 *   they became an officer) is not drawn either.
 * - `roster === null` (it is loading, or its read failed): the list and its
 *   Remove buttons work, the picker is replaced by one muted line.
 * - Esc anywhere in the OPEN picker (`Add someone`, the search, a row) is the
 *   picker's and never reaches the Rooms dialog: in the search with words
 *   typed it clears them, anywhere else it closes the picker. Esc on the
 *   list above, or with the picker closed, is the dialog's.
 * - A failed first read of the list is `LoadFailed` with Retry. A refused
 *   write shows the refusal's sentence in a toast (`vibeRequest`) and
 *   changes nothing on screen. One write at a time, and never from the
 *   second click of a double click (the rows move under the pointer).
 * - After each write that went through: `onChanged()`.
 */

/** A person on a list here: the roster row's own fields, nothing re-declared (the room's list answers these and `added_at`). */
type Listed = Pick<RosterRow, "user_id" | "name" | "handle" | "avatar_url">;
/** One read of the room's list, kept with the Retry count it answers. */
type Answer = { seq: number; rows: Listed[]; failure: null } | { seq: number; rows: null; failure: LoadFailure };

const LIST_FAILURE = "Couldn't load this room's people.";
const ADD_FAILURE = "Couldn't add them to this room.";
const REMOVE_FAILURE = "Couldn't remove them from this room.";
/** The room's list with nobody on it. */
const EMPTY_LINE = "No one added yet.";
/**
 * In the picker's place while the roster is not there (`roster === null`).
 * The prop cannot say whether it is still loading or its read failed, so the
 * words are true of both and promise nothing: no "yet". After a failed read
 * the Rooms dialog says so itself, right under this list, with a Retry (and
 * reads the roster again when a room's section is opened).
 */
const NO_ROSTER_LINE = "The member list isn't loaded, so no one can be added right now.";
/**
 * The picker with nobody to offer. It says nothing of who is on the list:
 * the people left out may be officers (`skipRoles`), not people listed, and
 * the line can sit right under `EMPTY_LINE`.
 */
const NOBODY_LEFT_LINE = "No one else to add.";
/** The picker's own scroll: about five people, then it scrolls inside the dialog. */
const PICKER_MAX_HEIGHT = 220;

const PEOPLE_CSS = `
.vibe-people-pick { background: transparent; }
.vibe-people-pick:not([aria-disabled="true"]):hover { background: rgba(var(--scrim-rgb), 0.045); }
.vibe-people-word { background: rgba(var(--scrim-rgb), 0.06); }
.vibe-people-word:not([aria-disabled="true"]):hover { background: rgba(var(--scrim-rgb), 0.1); }
.vibe-people-pick:focus-visible, .vibe-people-field:focus-visible { outline: 2px solid var(--coral); outline-offset: -2px; }
.vibe-people-word:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
.vibe-people-field::placeholder { color: var(--vibe-people-ph); opacity: 1; }
`;

/** The search: every typed word is in the person's name or handle, any case. */
function matches(person: Listed, query: string): boolean {
  const hay = `${person.name ?? ""} ${person.handle ?? ""}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).every((word) => hay.includes(word.replace(/^@/, "")));
}

export function RoomPeople(props: RoomPeopleProps) {
  // Keyed by the room: another room starts with its own list, a closed picker and no write in flight.
  return <People key={`${props.orgHandle}/${props.roomId}`} {...props} />;
}

function People({ orgHandle, roomId, night, title, roster, skipRoles, onChanged }: RoomPeopleProps) {
  const t = palette(night);
  const url = `/api/orgs/${encodeURIComponent(orgHandle)}/channels/${encodeURIComponent(roomId)}/members`;
  // Retry on a failed read bumps this: the list is read again.
  const [seq, setSeq] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  // The person whose add or remove is out; every other write waits for it.
  const [busy, setBusy] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const r = await vibeRequest<{ members?: Listed[] }>(url, { cache: "no-store", quiet: true, failure: LIST_FAILURE });
      if (cancelled) return;
      const rows = r.ok && Array.isArray(r.data.members) ? r.data.members : null;
      setAnswer(rows ? { seq, rows, failure: null } : { seq, rows: null, failure: asLoadFailure(r, LIST_FAILURE) });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [url, seq]);

  const current = answer && answer.seq === seq ? answer : null;
  const rows = current?.rows ?? null;
  const roleOf = new Map((roster ?? []).map((person) => [person.user_id, person.role]));
  const skipped = (userId: string): boolean => skipRoles.includes(roleOf.get(userId) ?? "");
  // Drawn: the by-name rows, less any an officer still holds.
  const shown = rows ? rows.filter((person) => !skipped(person.user_id)) : null;
  const q = query.trim();
  const offered = roster && rows ? roster.filter((person) => !skipRoles.includes(person.role) && !rows.some((row) => row.user_id === person.user_id)) : null;
  const found = offered ? offered.filter((person) => matches(person, q)) : null;

  const add = async (person: RosterRow) => {
    if (busy) return;
    setBusy(person.user_id);
    const r = await vibeRequest(url, { json: { user_id: person.user_id }, failure: ADD_FAILURE });
    if (r.ok) onChanged();
    if (!aliveRef.current) return;
    if (r.ok) {
      // The picked row leaves the picker; focus goes back to the search for the next one.
      searchRef.current?.focus();
      setAnswer((a) => (a?.rows && !a.rows.some((row) => row.user_id === person.user_id) ? { ...a, rows: [...a.rows, { user_id: person.user_id, name: person.name, handle: person.handle, avatar_url: person.avatar_url }] } : a));
    }
    setBusy(null);
  };

  const remove = async (person: Listed, button: HTMLButtonElement) => {
    if (busy) return;
    setBusy(person.user_id);
    const r = await vibeRequest(`${url}/${encodeURIComponent(person.user_id)}`, { method: "DELETE", failure: REMOVE_FAILURE });
    if (r.ok) onChanged();
    if (!aliveRef.current) return;
    if (r.ok) {
      // The row and its button go: focus moves on first, so it never falls to the page under the dialog.
      if (document.activeElement === button) (addRef.current ?? rootRef.current)?.focus();
      setAnswer((a) => (a?.rows ? { ...a, rows: a.rows.filter((row) => row.user_id !== person.user_id) } : a));
    }
    setBusy(null);
  };

  const closePicker = () => {
    setAdding(false);
    setQuery("");
    addRef.current?.focus();
  };

  const quiet = (text: string) => <p style={{ margin: 0, padding: "6px 0", fontSize: 13, lineHeight: 1.45, color: t.muted }}>{text}</p>;
  const wordStyle: React.CSSProperties = { height: 30, boxSizing: "border-box", flexShrink: 0, padding: "0 12px", border: "none", borderRadius: 999, color: t.ink, fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 };

  return (
    <section ref={rootRef} tabIndex={-1} aria-label={title} style={{ outline: "none", color: t.ink }}>
      <style>{PEOPLE_CSS}</style>
      <h3 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, lineHeight: "18px", color: t.secondary }}>{title}</h3>
      {!current ? (
        <ListSkeleton />
      ) : current.rows === null ? (
        <LoadFailed failure={current.failure} tone={night ? "dark" : "light"} compact onRetry={() => setSeq((n) => n + 1)} />
      ) : (
        <>
          {shown && shown.length > 0 ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {shown.map((person) => (
                <li key={person.user_id} style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 10 }}>
                  <Face person={person} size={32} />
                  <PersonLines person={person} muted={t.muted} />
                  <button
                    type="button"
                    className="vibe-people-word"
                    aria-label={`Remove ${authorName(person)}`}
                    aria-disabled={busy !== null || undefined}
                    onClick={(e) => {
                      // Not the second click of a double click: by then the next row has moved up under the pointer.
                      if (e.detail > 1) return;
                      void remove(person, e.currentTarget);
                    }}
                    style={wordStyle}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            quiet(EMPTY_LINE)
          )}

          {found === null ? (
            quiet(NO_ROSTER_LINE)
          ) : (
            <div
              onKeyDown={(e) => {
                if (!adding || e.key !== "Escape" || e.nativeEvent.isComposing) return;
                // The open picker's Esc, wherever focus is in it; the dialog around it stays (6.1). The search clears first.
                e.preventDefault();
                e.stopPropagation();
                if (e.target === searchRef.current && query) setQuery("");
                else closePicker();
              }}
              style={{ marginTop: 6 }}
            >
              <button
                ref={addRef}
                type="button"
                className="vibe-people-word"
                aria-expanded={adding}
                onClick={() => (adding ? closePicker() : setAdding(true))}
                style={{ ...wordStyle, cursor: "pointer", opacity: 1, display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add someone
              </button>
              {adding ? (
                <div style={{ marginTop: 8, border: `1px solid ${t.fieldBorder}`, borderRadius: 12, overflow: "hidden" }}>
                  <input
                    ref={searchRef}
                    type="search"
                    className="vibe-people-field"
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search members"
                    placeholder="Search members"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    style={{ ["--vibe-people-ph" as string]: t.muted, width: "100%", height: 40, boxSizing: "border-box", padding: "0 12px", border: "none", borderBottom: `1px solid ${t.hairline}`, borderRadius: "12px 12px 0 0", background: "rgba(var(--scrim-rgb), 0.05)", color: t.ink, fontFamily: "inherit", fontSize: 14 }}
                  />
                  {found.length === 0 ? (
                    <div style={{ padding: "6px 12px" }}>{quiet(q ? `No matches for "${q}"` : NOBODY_LEFT_LINE)}</div>
                  ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: PICKER_MAX_HEIGHT, overflowY: "auto", overscrollBehavior: "contain" }}>
                      {found.map((person) => (
                        <li key={person.user_id}>
                          <button
                            type="button"
                            className="vibe-people-pick"
                            aria-disabled={busy !== null || undefined}
                            onClick={(e) => {
                              // The same rule as Remove: the picked row leaves and the next one takes its place.
                              if (e.detail > 1) return;
                              void add(person);
                            }}
                            style={{ width: "100%", minHeight: 44, boxSizing: "border-box", padding: "6px 12px", border: "none", color: t.ink, fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 10, cursor: busy ? "default" : "pointer", opacity: busy && busy !== person.user_id ? 0.5 : 1 }}
                          >
                            <Face person={person} size={28} />
                            <PersonLines person={person} muted={t.muted} />
                            <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: t.coralText }}>Add</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** A person's photo, or their initials on `personColor(id)`. */
function Face({ person, size }: { person: Listed; size: number }) {
  const c = personColor(person.user_id);
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, flexShrink: 0, borderRadius: 999, background: person.avatar_url ? `url(${person.avatar_url}) center/cover` : c.bg, color: c.ink, fontSize: size >= 32 ? 11.5 : 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {person.avatar_url ? null : initialsOf(person.name || person.handle)}
    </span>
  );
}

/** The name, and `@handle` under it when there is one. */
function PersonLines({ person, muted }: { person: Listed; muted: string }) {
  return (
    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{authorName(person)}</span>
      {person.handle ? <span style={{ fontSize: 12.5, lineHeight: 1.35, color: muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>@{person.handle}</span> : null}
    </span>
  );
}

/** Two grey rows while the room's list is out. */
function ListSkeleton() {
  return (
    <ul aria-hidden="true" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {[0, 1].map((i) => (
        <li key={i} style={{ height: 44, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 999, background: "rgba(var(--scrim-rgb), 0.06)" }} />
          <div style={{ width: i === 0 ? "42%" : "30%", height: 12, borderRadius: 6, background: "rgba(var(--scrim-rgb), 0.08)" }} />
        </li>
      ))}
    </ul>
  );
}
