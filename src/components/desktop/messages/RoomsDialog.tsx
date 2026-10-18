"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { Switch } from "@/components/mobile/messages/compose/CardSheet";
import { HomeSkeleton } from "@/components/mobile/messages/home/MessagesHome";
import { chatRefusalLine } from "@/components/mobile/messages/send-failure";
import { palette, type Palette } from "@/components/mobile/messages/v2-tokens";
import type { PostPolicy } from "@/lib/chat/types";
import { vibeRequest, type VibeFailure } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

import type { RoomsDialogProps, RosterResponse, RosterRow } from "./contracts";
import { DesktopDialog } from "./DesktopDialog";
import { RoomPeople } from "./RoomPeople";
import {
  answeredPolicy,
  BOARD_FOLLOWERS_LABEL,
  BOARD_SETTING_LOAD_LINE,
  BOARD_SETTING_SAVE_LINE,
  boardFollowersHelp,
  boardSettingBody,
  boardSettingOf,
  boardSettingSavedLine,
  capLine,
  checkForm,
  clubUrl,
  createBody,
  deleteConfirmLine,
  effectivePolicy,
  FIXED_ROOM_LINE,
  formOf,
  LISTED_PUBLIC_LINE,
  needsPrivateConfirm,
  NEW_ROOM_FORM,
  OFFICER_SKIP_ROLES,
  peopleTitle,
  postOptions,
  PRIVATE_CONFIRM_LINE,
  refusedField,
  roomMark,
  roomRuleLine,
  roomSection,
  roomsUrl,
  roomTitle,
  roomUrl,
  rosterUrl,
  saveBody,
  savedBoardSetting,
  savedAsLine,
  SEE_OPTIONS,
  toRoomRows,
  TOPIC_MAX,
  writeFailureLine,
  type RoomForm,
  type RoomRow,
} from "./rooms-dialog-rules";

/**
 * Rooms in a club, for its owner and admins (handoffs/chat-redesign/
 * wave-3-desktop/contract.md 4c.5, 1.3 K4 and K6, section 8 W3-5-rooms): one
 * dialog that lists every room of the club with its mark and one line (who
 * sees it, who posts), and lets an officer make an extra room, change who
 * sees it and who posts in it, pick the people on its list, and delete it.
 * `ClubPane` opens it from the `+` after the chips and from `Manage rooms` in
 * the club panel, both drawn for owner and admin only; the routes refuse
 * everyone else whatever a screen draws.
 *
 * - Board, Lounge: shown with their line, nothing to edit, no field. Under
 *   the Board, one switch (club model, Franky, Oct 16): `Followers can read
 *   the Board` (`BoardFollowers`), on unless an officer turns it off.
 * - Officers: its people list only (`Also in this room`). Officers are in it
 *   by their role; the list is the people added by name.
 * - An extra room: Name, What it's for, Who can see it, Who can post, the
 *   people list while the SAVED room has one (private: who can see it;
 *   public with `Officers and people you pick`: who can post), Delete.
 * - `New room`: the same form. At the cap its place is taken by the
 *   `room_limit` sentence.
 *
 * Reads: the room list (`roomsUrl`, again after every write that went
 * through) and the club's roster with NO block filter (`rosterUrl`): an
 * officer deciding who may enter a room sees every member. The roster is read
 * when the dialog opens and again only after a read that failed (its own
 * Retry under a people list, the list's Retry, or a room's section opening).
 * It is handed to `RoomPeople`, which reads and writes each room's own list
 * and makes no roster read itself. Writes: POST the list's address, PATCH and
 * DELETE one room's. Nothing else is asked from here.
 *
 * The rule a create or a save was answered with is kept (`answeredPolicy`)
 * and laid under the list's rows: the list read after the write can come back
 * without `post_policy` (as-built wave 2: a server that still remembers the
 * column as missing), and the room must not read as `everyone` then.
 *
 * A name is typed as words; the stored name stays a slug (`roomSlug`), shown
 * under the field as `Saved as <slug>`. A refused write shows its sentence
 * under the form and marks the field it is about; one that sends the person
 * somewhere (sign in, Terms) is a toast with that link instead. After every
 * write that went through: `onChanged()`, so `ClubPane` re-reads the space
 * and the chips follow.
 *
 * One section is open at a time. While a write is out the dialog is `busy`:
 * it does not close, and no second write starts. A control whose press moves
 * the layout under the pointer (a room's row, the two answers of a question,
 * the New room `Cancel`) does nothing on the second click of a double click
 * (as-built wave 4's rule; a key press counts 0, so Enter still works).
 */

const LOAD_LINE = "Couldn't load the rooms.";
const CREATE_FAILURE = "Couldn't create the room.";
const SAVE_FAILURE = "Couldn't save the room.";
const DELETE_FAILURE = "Couldn't delete the room.";
const ROSTER_FAILURE = "Couldn't load the members.";
/** `openId` while the New room form is the open section. */
const NEW_ROOM = "new";

const ROOMS_CSS = `
.vibe-rooms-row { background: transparent; }
.vibe-rooms-row:not([aria-disabled="true"]):hover { background: rgba(var(--scrim-rgb), 0.045); }
.vibe-rooms-word { background: rgba(var(--scrim-rgb), 0.06); }
.vibe-rooms-word:not([aria-disabled="true"]):hover { background: rgba(var(--scrim-rgb), 0.1); }
.vibe-rooms-row:focus-visible, .vibe-rooms-field:focus-visible { outline: 2px solid var(--coral); outline-offset: -2px; }
.vibe-rooms-word:focus-visible, .vibe-rooms-cta:focus-visible, .vibe-rooms-option input:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
`;

/** The chips' lock (`RoomChips`), at the row's 14px. */
function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** The Board's megaphone (`RoomChips`, `BoardStrip`), at the row's 14px. */
function MegaphoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M3 10.5v3a1 1 0 0 0 1 1h2.5L12 19V5L6.5 9.5H4a1 1 0 0 0-1 1z" />
      <path d="M16 9a4.5 4.5 0 0 1 0 6" />
      <path d="M18.5 6.5a8 8 0 0 1 0 11" />
    </svg>
  );
}

function Chevron({ open, color }: { open: boolean; color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, transform: open ? "rotate(90deg)" : "none" }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** A quiet 30px pill: `New room`, `Cancel`, `Delete` (the people list's own buttons look the same). */
function wordStyle(t: Palette, off: boolean): React.CSSProperties {
  return { height: 30, boxSizing: "border-box", flexShrink: 0, padding: "0 12px", border: "none", borderRadius: 999, color: t.ink, fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, cursor: off ? "default" : "pointer", opacity: off ? 0.5 : 1 };
}

/** A row's words: the mark and the name, the line (who sees it, who posts), and under a fixed room why nothing can be changed. */
function RoomLines({ room, t, fixed = false }: { room: RoomRow; t: Palette; fixed?: boolean }) {
  const mark = roomMark(room);
  return (
    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14.5, fontWeight: 700, lineHeight: 1.3 }}>
        {mark === "megaphone" ? <MegaphoneIcon /> : mark === "lock" ? <LockIcon /> : null}
        <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{roomTitle(room)}</span>
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: t.secondary }}>{roomRuleLine(room)}</span>
      {fixed ? <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: t.muted }}>{FIXED_ROOM_LINE}</span> : null}
    </span>
  );
}

/**
 * A question asked in place, before something that cannot be taken back:
 * the sentence, `Cancel` (focused when it opens) and the answer. Esc here is
 * `Cancel`, and is stopped: the dialog around it stays (6.1).
 */
function Confirm({ line, yes, danger = false, busy, t, onYes, onNo }: { line: string; yes: string; danger?: boolean; busy: boolean; t: Palette; onYes: () => void; onNo: () => void }) {
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={id}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
        e.stopPropagation();
        if (!busy) onNo();
      }}
      style={{ marginTop: 8, padding: 12, borderRadius: 12, border: `1px solid ${t.fieldBorder}`, background: "rgba(var(--scrim-rgb), 0.04)" }}
    >
      <p id={id} style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: t.ink }}>
        {line}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="vibe-rooms-word"
          autoFocus
          aria-disabled={busy || undefined}
          onClick={(e) => {
            // Not the second click of a double click: the question is gone by then and the form has moved up under the pointer.
            if (e.detail > 1) return;
            if (!busy) onNo();
          }}
          style={wordStyle(t, busy)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="vibe-rooms-word"
          aria-disabled={busy || undefined}
          onClick={(e) => {
            if (e.detail > 1) return;
            if (!busy) onYes();
          }}
          style={{ ...wordStyle(t, busy), color: danger ? "var(--danger-ink)" : t.ink }}
        >
          {yes}
        </button>
      </div>
    </div>
  );
}

/**
 * Under the Board (club model, Franky, Oct 16): may the club's followers read
 * it? On unless an officer turns it off. Read from the club (`clubUrl`) as the
 * dialog opens; a press saves at once (`boardSettingBody`), and a refusal
 * toasts why and leaves the switch as it was. Nothing is drawn while the
 * setting is unknown (still loading, or a server without it); a read that
 * failed says so, with Retry. Who may read is the database's rule (a verified
 * follower, not removed or blocked): this switch is only the club's say.
 */
function BoardFollowers({ orgHandle, night }: { orgHandle: string; night: boolean }) {
  const t = palette(night);
  const labelId = useId();
  const helpId = useId();
  const [on, setOn] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  // Retry on a failed read bumps this: the setting is read again.
  const [seq, setSeq] = useState(0);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const r = await vibeRequest<unknown>(clubUrl(orgHandle), { cache: "no-store", quiet: true, failure: BOARD_SETTING_LOAD_LINE });
      if (cancelled) return;
      setOn(r.ok ? boardSettingOf(r.data) : null);
      setFailure(r.ok ? null : asLoadFailure(r, BOARD_SETTING_LOAD_LINE));
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [orgHandle, seq]);

  const toggle = async () => {
    if (on === null || savingRef.current) return;
    savingRef.current = true;
    const next = !on;
    const r = await vibeRequest<unknown>(clubUrl(orgHandle), { method: "PATCH", json: boardSettingBody(next), failure: BOARD_SETTING_SAVE_LINE });
    savingRef.current = false;
    if (!r.ok) return;
    const saved = savedBoardSetting(r.data, next);
    setOn(saved);
    toast({ message: boardSettingSavedLine(saved), tone: "info" });
  };

  if (failure) {
    return (
      <div style={{ padding: "0 20px 12px" }}>
        <LoadFailed
          failure={failure}
          tone={night ? "dark" : "light"}
          compact
          onRetry={() => {
            setFailure(null);
            setSeq((n) => n + 1);
          }}
        />
      </div>
    );
  }
  if (on === null) return null;
  return (
    <div style={{ padding: "0 20px 10px", display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span id={labelId} style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3, color: t.ink }}>
          {BOARD_FOLLOWERS_LABEL}
        </span>
        <span id={helpId} style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: t.secondary }}>
          {boardFollowersHelp(on)}
        </span>
      </span>
      <Switch on={on} labelledBy={labelId} describedBy={helpId} night={night} onToggle={() => void toggle()} />
    </div>
  );
}

/** The room list, or why it could not be read. `answered`: the rules this dialog's own writes were answered with (`toRoomRows`). */
async function readRooms(orgHandle: string, answered: ReadonlyMap<string, PostPolicy>): Promise<{ rooms: RoomRow[]; failure: null } | { rooms: null; failure: LoadFailure }> {
  const r = await vibeRequest<{ channels?: unknown }>(roomsUrl(orgHandle), { cache: "no-store", quiet: true, failure: LOAD_LINE });
  if (r.ok && Array.isArray(r.data.channels)) return { rooms: toRoomRows(r.data.channels, answered), failure: null };
  return { rooms: null, failure: asLoadFailure(r, LOAD_LINE) };
}

export function RoomsDialog({ orgHandle, clubName, night, onClose, onChanged }: RoomsDialogProps) {
  const t = palette(night);
  const baseId = useId();
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  // Retry on a failed read bumps this: the list is read again.
  const [seq, setSeq] = useState(0);
  // Null while it loads and after its read failed: `RoomPeople` then shows its lists without the picker.
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  // Why the roster's last read failed; null while a read is out and after one went through. `retryRoster` bumps `rosterSeq`.
  const [rosterFailure, setRosterFailure] = useState<LoadFailure | null>(null);
  const [rosterSeq, setRosterSeq] = useState(0);
  // The rule each of this dialog's own writes was answered with, by room id (`toRoomRows`).
  const answeredRef = useRef(new Map<string, PostPolicy>());
  // The open section: a room's id, `NEW_ROOM`, or none.
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // A write took the focused control away (the New room form, a deleted room's section): the
  // control named here takes focus once it is drawn, so focus never falls to the page under the dialog.
  const focusNextRef = useRef<string | null>(null);
  useEffect(() => {
    const id = focusNextRef.current;
    if (!id) return;
    focusNextRef.current = null;
    document.getElementById(id)?.focus();
  });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const r = await readRooms(orgHandle, answeredRef.current);
      if (cancelled) return;
      setRooms(r.rooms);
      setFailure(r.failure);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [orgHandle, seq]);

  // The roster, with no block filter (1.3 K4): read as the dialog opens, and again only after a read
  // that failed (`retryRoster`). A failure leaves it null and is kept, to be said under a people list.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const r = await vibeRequest<RosterResponse>(rosterUrl(orgHandle), { cache: "no-store", quiet: true, failure: ROSTER_FAILURE });
      if (cancelled) return;
      const members = r.ok && Array.isArray(r.data.members) ? r.data.members : null;
      setRoster(members);
      setRosterFailure(members ? null : asLoadFailure(r, ROSTER_FAILURE));
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [orgHandle, rosterSeq]);

  /** A roster read that failed is made again; nothing happens while one is out or after one went through. */
  const retryRoster = () => {
    if (!rosterFailure) return;
    setRosterFailure(null);
    setRosterSeq((n) => n + 1);
  };

  /** A write's answered rule, kept for the list's rows: the list read after it may carry none. */
  const keepRule = (roomId: string | null, data: unknown) => {
    const policy = answeredPolicy(data);
    if (roomId && policy) answeredRef.current.set(roomId, policy);
  };

  /** After a write that went through: the club pane re-reads its space, and the list is read again. */
  const afterWrite = async () => {
    onChanged();
    const r = await readRooms(orgHandle, answeredRef.current);
    if (!aliveRef.current) return;
    setRooms(r.rooms);
    setFailure(r.failure);
  };

  // The three writes. Each answers null when it went through, else the failure for the form to show.
  const create = async (form: RoomForm, slug: string): Promise<VibeFailure | null> => {
    setBusy(true);
    const r = await vibeRequest<{ channel?: { id?: unknown } }>(roomsUrl(orgHandle), { json: createBody(form, slug), quiet: true, failure: CREATE_FAILURE });
    const id = r.ok && typeof r.data.channel?.id === "string" ? r.data.channel.id : null;
    if (r.ok) keepRule(id, r.data);
    if (r.ok) await afterWrite();
    if (!aliveRef.current) return null;
    if (r.ok) {
      // The new room's own section opens: picking its people, when it has a list, is the next step.
      focusNextRef.current = id ? `${baseId}-row-${id}` : `${baseId}-new`;
      setOpenId(id);
    }
    setBusy(false);
    return r.ok ? null : r;
  };

  const save = async (room: RoomRow, form: RoomForm, slug: string): Promise<VibeFailure | null> => {
    setBusy(true);
    const r = await vibeRequest<{ channel?: unknown }>(roomUrl(orgHandle, room.id), { method: "PATCH", json: saveBody(form, room, slug), quiet: true, failure: SAVE_FAILURE });
    // The saved rule is the answer's (present whenever the body named it), not only the list's.
    if (r.ok) keepRule(room.id, r.data);
    if (r.ok) await afterWrite();
    if (aliveRef.current) setBusy(false);
    return r.ok ? null : r;
  };

  const remove = async (room: RoomRow): Promise<VibeFailure | null> => {
    setBusy(true);
    const r = await vibeRequest(roomUrl(orgHandle, room.id), { method: "DELETE", quiet: true, failure: DELETE_FAILURE });
    if (r.ok) await afterWrite();
    if (!aliveRef.current) return null;
    if (r.ok) {
      focusNextRef.current = `${baseId}-new`;
      setOpenId(null);
    }
    setBusy(false);
    return r.ok ? null : r;
  };

  /** The stored names of the club's other rooms: what a name may not show the same words as. */
  const otherNames = (except: string | null): string[] => (rooms ?? []).filter((r) => r.id !== except).map((r) => r.name);
  const cap = rooms ? capLine(rooms) : null;
  const rowStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 20px", display: "flex", alignItems: "center", gap: 12 };
  const peopleOf = (room: RoomRow): ReactNode => {
    const title = peopleTitle(room);
    if (!title) return null;
    return (
      <>
        <RoomPeople orgHandle={orgHandle} roomId={room.id} night={night} title={title} roster={roster} skipRoles={OFFICER_SKIP_ROLES} onChanged={onChanged} />
        {/* The roster's read failed: said under the list with its Retry, so a read that failed never looks like one still loading. */}
        {rosterFailure ? (
          <div style={{ marginTop: 8 }}>
            <LoadFailed failure={rosterFailure} tone={night ? "dark" : "light"} compact onRetry={retryRoster} />
          </div>
        ) : null}
      </>
    );
  };

  return (
    <DesktopDialog title={`Rooms in ${clubName}`} onClose={onClose} width={520} busy={busy}>
      <style>{ROOMS_CSS}</style>
      {failure ? (
        <LoadFailed
          failure={failure}
          tone={night ? "dark" : "light"}
          compact
          onRetry={() => {
            setFailure(null);
            setSeq((n) => n + 1);
            // The same blip usually took the roster's read too.
            retryRoster();
          }}
        />
      ) : !rooms ? (
        <div style={{ margin: "0 -20px" }}>
          <HomeSkeleton />
        </div>
      ) : (
        <>
          {/* The rows run edge to edge of the card (the dialog's body is padded 20px at the sides). */}
          <ul style={{ listStyle: "none", margin: "0 -20px", padding: 0 }}>
            {rooms.map((room, i) => {
              const section = roomSection(room);
              const open = openId === room.id;
              const panelId = `${baseId}-panel-${room.id}`;
              return (
                <li key={room.id} style={{ borderTop: i > 0 ? `1px solid ${t.hairline}` : "none" }}>
                  {section === "fixed" ? (
                    // The Board and the Lounge: their lines, and nothing to fill in. Under the Board, its followers switch.
                    <>
                      <div style={rowStyle}>
                        <RoomLines room={room} t={t} fixed />
                      </div>
                      {room.kind === "board" ? <BoardFollowers orgHandle={orgHandle} night={night} /> : null}
                    </>
                  ) : (
                    <>
                      <button
                        id={`${baseId}-row-${room.id}`}
                        type="button"
                        className="vibe-rooms-row"
                        aria-expanded={open}
                        aria-controls={open ? panelId : undefined}
                        aria-disabled={busy || undefined}
                        onClick={(e) => {
                          // Not the second click of a double click: the section would open and close at once.
                          if (e.detail > 1) return;
                          if (busy) return;
                          // A roster read that failed is made again as a section opens: its people list needs it.
                          if (!open) retryRoster();
                          setOpenId(open ? null : room.id);
                        }}
                        style={{ ...rowStyle, border: "none", color: t.ink, fontFamily: "inherit", textAlign: "left", cursor: busy ? "default" : "pointer" }}
                      >
                        <RoomLines room={room} t={t} />
                        <Chevron open={open} color={t.muted} />
                      </button>
                      {open ? (
                        <div id={panelId} style={{ padding: "6px 20px 18px" }}>
                          {section === "officers" ? (
                            peopleOf(room)
                          ) : (
                            <RoomEditor key={room.id} room={room} others={otherNames(room.id)} night={night} busy={busy} onSubmit={(form, slug) => save(room, form, slug)} onDelete={() => remove(room)} onCancel={null}>
                              {peopleOf(room)}
                            </RoomEditor>
                          )}
                        </div>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <div style={{ margin: "0 -20px", padding: "14px 20px 0", borderTop: `1px solid ${t.hairline}` }}>
            {openId === NEW_ROOM ? (
              <section aria-label="New room">
                <h3 style={{ margin: "0 0 10px", fontSize: 14.5, fontWeight: 700, lineHeight: 1.3 }}>New room</h3>
                <RoomEditor
                  room={null}
                  others={otherNames(null)}
                  night={night}
                  busy={busy}
                  onSubmit={create}
                  onDelete={null}
                  onCancel={() => {
                    focusNextRef.current = `${baseId}-new`;
                    setOpenId(null);
                  }}
                />
              </section>
            ) : cap ? (
              // At the cap: the sentence in the button's place.
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: t.secondary }}>{cap}</p>
            ) : (
              <button
                id={`${baseId}-new`}
                type="button"
                className="vibe-rooms-word"
                aria-disabled={busy || undefined}
                onClick={() => {
                  if (!busy) setOpenId(NEW_ROOM);
                }}
                style={wordStyle(t, busy)}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New room
              </button>
            )}
          </div>
        </>
      )}
    </DesktopDialog>
  );
}

type RoomEditorProps = {
  /** The saved room, or null for a new one. */
  room: RoomRow | null;
  /** The stored names of the club's other rooms. */
  others: string[];
  night: boolean;
  busy: boolean;
  onSubmit: (form: RoomForm, slug: string) => Promise<VibeFailure | null>;
  onDelete: (() => Promise<VibeFailure | null>) | null;
  /** A new room's `Cancel`; a saved room's section is closed by its row. */
  onCancel: (() => void) | null;
  /** The saved room's people list, between the form and Delete. */
  children?: ReactNode;
};

/**
 * One room's form: a new room's, or a saved extra room's (mounted with the
 * room's id as its key, so another room starts from its own answers). The
 * people list is NOT inside the `<form>`: Enter in its search must not save
 * the room.
 */
function RoomEditor({ room, others, night, busy, onSubmit, onDelete, onCancel, children }: RoomEditorProps) {
  const t = palette(night);
  const id = useId();
  const [form, setForm] = useState<RoomForm>(() => (room ? formOf(room) : { ...NEW_ROOM_FORM }));
  // A refused write's sentence, under the control that made it, and the field it is about.
  const [error, setError] = useState<{ at: "form" | "delete"; line: string } | null>(null);
  const [refused, setRefused] = useState<"name" | "topic" | null>(null);
  const [confirm, setConfirm] = useState<"private" | "delete" | null>(null);
  const publicRef = useRef<HTMLInputElement>(null);
  const privateRef = useRef<HTMLInputElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  // `Cancel` on the delete question: Delete is drawn again, and takes focus back.
  const refocusDeleteRef = useRef(false);
  useEffect(() => {
    if (confirm !== null || !refocusDeleteRef.current) return;
    refocusDeleteRef.current = false;
    deleteRef.current?.focus();
  }, [confirm]);

  const check = checkForm(form, room, others);
  const policy = effectivePolicy(form.isPrivate, form.policy);
  // A room whose kind cannot be read has no rule to set (the route refuses the field there).
  const asksPost = room === null || room.kind === "room";
  const canSend = check.ok && !busy;
  const nameBad = refused === "name" || check.nameLine !== null;

  const change = (patch: Partial<RoomForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(null);
    if ("name" in patch && refused === "name") setRefused(null);
    if ("topic" in patch && refused === "topic") setRefused(null);
  };

  const refuse = (at: "form" | "delete", r: VibeFailure) => {
    const line = chatRefusalLine(r) ?? writeFailureLine(r);
    // Sign in, Review Terms and the like: the toast carries the link.
    if (r.action) toast({ message: line, tone: "error", action: r.action });
    else setError({ at, line });
    setRefused(refusedField(r));
  };

  const submit = async () => {
    if (!canSend || !check.slug) return;
    setError(null);
    setRefused(null);
    const r = await onSubmit(form, check.slug);
    if (r) refuse("form", r);
  };

  const pickSee = (isPrivate: boolean) => {
    if (busy || isPrivate === form.isPrivate) return;
    // A saved room everyone sees: the question first, the flip only on its answer.
    if (needsPrivateConfirm(room, isPrivate)) setConfirm("private");
    else change({ isPrivate });
  };

  const fieldStyle = (bad: boolean): React.CSSProperties => ({ width: "100%", height: 40, boxSizing: "border-box", padding: "0 12px", borderRadius: 12, border: `1px solid ${bad ? "var(--danger-ink)" : t.fieldBorder}`, background: "rgba(var(--scrim-rgb), 0.05)", color: t.ink, fontFamily: "inherit", fontSize: 14 });
  const labelStyle: React.CSSProperties = { display: "block", margin: "0 0 6px", padding: 0, fontSize: 13, fontWeight: 700, lineHeight: "18px", color: t.secondary };
  const noteStyle: React.CSSProperties = { margin: "6px 0 0", fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: t.muted };
  const optionStyle: React.CSSProperties = { minHeight: 32, display: "flex", alignItems: "center", gap: 10, fontSize: 14, lineHeight: 1.35, color: t.ink, cursor: busy ? "default" : "pointer" };
  const groupStyle: React.CSSProperties = { margin: 0, padding: 0, border: "none", minWidth: 0 };
  const alert = (line: string) => (
    <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: "var(--error-ink)" }}>
      {line}
    </p>
  );

  return (
    <div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div>
          <label htmlFor={`${id}-name`} style={labelStyle}>
            Name
          </label>
          <input
            id={`${id}-name`}
            type="text"
            className="vibe-rooms-field"
            autoFocus={room === null}
            value={form.name}
            onChange={(e) => change({ name: e.target.value })}
            aria-invalid={nameBad || undefined}
            aria-describedby={check.slug || check.nameLine ? `${id}-name-note` : undefined}
            autoComplete="off"
            maxLength={60}
            style={fieldStyle(nameBad)}
          />
          {/* The stored name stays a slug: what the words become is said here, or why they cannot be used. */}
          {check.slug ? (
            <p id={`${id}-name-note`} style={noteStyle}>
              {savedAsLine(check.slug)}
            </p>
          ) : check.nameLine ? (
            <p id={`${id}-name-note`} style={{ ...noteStyle, color: "var(--error-ink)" }}>
              {check.nameLine}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor={`${id}-topic`} style={labelStyle}>
            What it&apos;s for
          </label>
          <input
            id={`${id}-topic`}
            type="text"
            className="vibe-rooms-field"
            value={form.topic}
            onChange={(e) => change({ topic: e.target.value })}
            aria-invalid={refused === "topic" || undefined}
            autoComplete="off"
            maxLength={TOPIC_MAX}
            style={fieldStyle(refused === "topic")}
          />
        </div>

        <fieldset style={groupStyle}>
          <legend style={labelStyle}>Who can see it</legend>
          {SEE_OPTIONS.map((option) => (
            <label key={option.label} className="vibe-rooms-option" style={optionStyle}>
              <input type="radio" ref={option.isPrivate ? privateRef : publicRef} name={`${id}-see`} checked={form.isPrivate === option.isPrivate} onChange={() => pickSee(option.isPrivate)} style={{ margin: 0, accentColor: t.coral }} />
              {option.label}
            </label>
          ))}
          {confirm === "private" ? (
            <Confirm
              line={PRIVATE_CONFIRM_LINE}
              yes="Make private"
              busy={busy}
              t={t}
              onYes={() => {
                change({ isPrivate: true });
                setConfirm(null);
                privateRef.current?.focus();
              }}
              onNo={() => {
                setConfirm(null);
                publicRef.current?.focus();
              }}
            />
          ) : null}
        </fieldset>

        {asksPost ? (
          <fieldset style={groupStyle}>
            <legend style={labelStyle}>Who can post</legend>
            {postOptions(form.isPrivate).map((option) => (
              <label key={option.policy} className="vibe-rooms-option" style={optionStyle}>
                <input
                  type="radio"
                  name={`${id}-post`}
                  checked={policy === option.policy}
                  onChange={() => {
                    if (!busy) change({ policy: option.policy });
                  }}
                  style={{ margin: 0, accentColor: t.coral }}
                />
                {option.label}
              </label>
            ))}
            {policy === "listed" && !form.isPrivate ? <p style={noteStyle}>{LISTED_PUBLIC_LINE}</p> : null}
          </fieldset>
        ) : null}

        {error?.at === "form" ? alert(error.line) : null}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* `aria-disabled`, not `disabled`: after a save this button is off while it still holds focus, and a disabled button would swallow Esc and Tab. */}
          <button
            type="submit"
            className="vibe-rooms-cta"
            aria-disabled={!canSend || undefined}
            style={{ height: 36, boxSizing: "border-box", padding: "0 18px", border: "none", borderRadius: 999, background: t.coralButton.bg, color: t.coralButton.ink, fontFamily: "inherit", fontSize: 14, fontWeight: 800, cursor: canSend ? "pointer" : "default", opacity: canSend ? 1 : 0.45 }}
          >
            {room ? "Save" : "Create room"}
          </button>
          {onCancel ? (
            <button
              type="button"
              className="vibe-rooms-word"
              aria-disabled={busy || undefined}
              onClick={(e) => {
                // Not the second click of a double click: the form is gone by then and the card has shrunk under the pointer.
                if (e.detail > 1) return;
                if (!busy) onCancel();
              }}
              style={wordStyle(t, busy)}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      {children ? <div style={{ marginTop: 18 }}>{children}</div> : null}

      {room && onDelete ? (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${t.hairline}`, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          {confirm === "delete" ? (
            <div style={{ alignSelf: "stretch" }}>
              <Confirm
                line={deleteConfirmLine(room)}
                yes="Delete"
                danger
                busy={busy}
                t={t}
                onYes={async () => {
                  setError(null);
                  const r = await onDelete();
                  if (!r) return;
                  // Refused: the question goes, Delete comes back with the sentence under it.
                  refocusDeleteRef.current = true;
                  setConfirm(null);
                  refuse("delete", r);
                }}
                onNo={() => {
                  refocusDeleteRef.current = true;
                  setConfirm(null);
                }}
              />
            </div>
          ) : (
            <button
              ref={deleteRef}
              type="button"
              className="vibe-rooms-word"
              aria-disabled={busy || undefined}
              onClick={() => {
                if (!busy) setConfirm("delete");
              }}
              style={{ ...wordStyle(t, busy), color: "var(--danger-ink)" }}
            >
              Delete
            </button>
          )}
          {error?.at === "delete" ? alert(error.line) : null}
        </div>
      ) : null}
    </div>
  );
}
