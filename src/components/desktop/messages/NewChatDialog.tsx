"use client";

import { useEffect, useRef, useState } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { personColor } from "@/components/mobile/messages/avatar";
import { initialsOf } from "@/components/mobile/messages/format";
import { CheckIcon } from "@/components/mobile/messages/home/ClubRow";
import { HomeSkeleton } from "@/components/mobile/messages/home/MessagesHome";
import { palette, type Palette } from "@/components/mobile/messages/v2-tokens";
import { describeFailure, type ToastAction } from "@/lib/feedback/failure-copy";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

import type { NewChatDialogProps } from "./contracts";
import { DesktopDialog } from "./DesktopDialog";

/**
 * New on desktop Messages (handoffs/chat-redesign/wave-3-desktop/contract.md
 * H8, 4.1, 6.5, section 8 W3-4-lists): ONE dialog for a direct message and a
 * group chat. Suggested people, a search, pick one or several; one picked is
 * `Message` (`POST /api/me/threads { handle }`, which also finds the dm that
 * already exists), several are `Create group` (`{ type: "group", name?,
 * members }`) with an optional name. The new chat's id goes to `onCreated`;
 * the shell opens it and takes the dialog away.
 *
 * The reads are the phone's (`ComposeOverlay`): `GET /api/me/
 * suggested-connections?limit=20`, and `GET /api/users/search?q=&limit=20`
 * 220 ms after the last key.
 *
 * The group rule (`threads/route.ts`: a group may only hold the creator's
 * connections). The first time a SECOND person is picked, every page of
 * `GET /api/me/connections` is read, once, and kept for the dialog's life.
 * While two or more are picked, a person who is not a connection cannot be
 * picked (`aria-disabled`, 6.5's line under the name), and one already picked
 * carries the same line (on their chip, and on their row when the list shows
 * them; both take them out when pressed) and holds `Create group` back until
 * they are removed. If that read fails nobody is greyed out; the server's
 * `not_connected` refusal is then the safety net: the dialog stays, names the
 * people and marks them the same way. The chips and that refusal sit with the
 * search, above the scrolling list, so the reason is on screen wherever the
 * list has been scrolled to. Suggested people are drawn for a direct message
 * only: none of them is a connection, so none could join a group.
 */

type Candidate = { id: string; name: string | null; handle: string | null; avatar_url?: string | null; major?: string | null };

/** 6.5, under a person who cannot be in a group with the viewer. */
const GROUP_RULE_LINE = "Group chats are for people you're connected with.";
/** The phone's line for a chat that could not be started (`MessagesMobile`). */
const FAILURE = "Couldn't start that conversation.";
const SEARCH_DELAY_MS = 220;
/** `/api/me/connections` gives 50 a page at most; 20 pages is the old page's own cap (`messages.html`, `__dmLoadConnections`). */
const CONNECTIONS_PAGE = 50;
const CONNECTIONS_PAGES_MAX = 20;
/** The picked people's box above the list: three lines of chips, or two held-back people and the top of a third; more scroll inside it. */
const CHIPS_MAX_HEIGHT = 124;
/** That block's height with nothing picked (the 40px search and 10px under it), until it is measured. */
const TOP_HEIGHT = 50;

const NEW_CSS = `
.vibe-new-row { background: transparent; }
.vibe-new-row:not([aria-disabled="true"]):not(:disabled):hover { background: rgba(var(--scrim-rgb), 0.045); }
.vibe-new-chip { background: rgba(var(--scrim-rgb), 0.06); }
.vibe-new-chip:hover { background: rgba(var(--scrim-rgb), 0.1); }
.vibe-new-row:focus-visible, .vibe-new-chip:focus-visible, .vibe-new-field:focus-visible { outline: 2px solid var(--coral); outline-offset: -2px; }
.vibe-new-cta:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
.vibe-new-field::placeholder { color: var(--vibe-new-ph); opacity: 1; }
`;

const personName = (u: Candidate): string => u.name || (u.handle ? `@${u.handle}` : "Member");

/** `Maya R.`, `Maya R. and Jonah K.`, `Maya R., Jonah K., and Sam T.` */
function listNames(names: string[]): string {
  try {
    return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(names);
  } catch {
    return names.join(", ");
  }
}

/**
 * The ids of everyone the viewer is connected with: every page, in order.
 * Null when a page failed or the list is longer than the cap: an incomplete
 * list would grey out real connections, so it counts as no list at all.
 */
async function readConnections(): Promise<ReadonlySet<string> | null> {
  const ids = new Set<string>();
  for (let page = 0; page < CONNECTIONS_PAGES_MAX; page++) {
    const r = await vibeRequest<{ users?: { id?: unknown }[]; has_more?: boolean }>(`/api/me/connections?limit=${CONNECTIONS_PAGE}&offset=${page * CONNECTIONS_PAGE}`, {
      cache: "no-store",
      quiet: true,
      failure: "Couldn't load your connections.",
    });
    if (!r.ok || !Array.isArray(r.data.users)) return null;
    for (const u of r.data.users) if (typeof u?.id === "string") ids.add(u.id);
    if (!r.data.has_more) return ids;
  }
  return null;
}

type GroupResult = { ok: true; channelId: string } | { ok: false; notConnected: string[] | null; field: string | null };

/**
 * `POST /api/me/threads` for a group. Read by hand, not through
 * `vibeRequest`: the `not_connected` refusal lists its people in the body
 * (`not_connected: <ids>`), which `vibeRequest` does not hand back. That
 * refusal is answered inline by the dialog; every other failure is toasted
 * here with the same mapped line `vibeRequest` would show.
 */
async function createGroup(name: string, members: string[]): Promise<GroupResult> {
  let status = 0;
  let retryAfter: string | null = null;
  let body: Record<string, unknown> | null = null;
  try {
    const res = await fetch("/api/me/threads", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "group", ...(name ? { name } : {}), members }),
    });
    status = res.status;
    retryAfter = res.headers.get("retry-after");
    const parsed: unknown = await res.json().catch(() => null);
    body = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    status = 0;
  }
  const ok = status >= 200 && status < 300 && body?.ok !== false;
  if (ok && typeof body?.channel_id === "string" && body.channel_id) return { ok: true, channelId: body.channel_id };
  if (!ok && Array.isArray(body?.not_connected)) {
    const ids = body.not_connected.filter((id): id is string => typeof id === "string");
    if (ids.length > 0) return { ok: false, notConnected: ids, field: null };
  }
  const text = (v: unknown): string | null => (typeof v === "string" ? v : null);
  // A 2xx with no id: the caller's line plus "Try again.", as the phone says it.
  const said: { message: string; action?: ToastAction; field?: string } = ok
    ? { message: `${FAILURE} Try again.` }
    : describeFailure(
        { status, code: text(body?.code), error: text(body?.error), retryAfterSec: retryAfter && /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter.trim()) : null, field: text(body?.field) },
        FAILURE,
        window.location.pathname + window.location.search,
      );
  toast({ message: said.message, tone: "error", action: said.action });
  return { ok: false, notConnected: null, field: said.field ?? null };
}

type Connections = { state: "idle" | "loading" | "failed" } | { state: "ready"; ids: ReadonlySet<string> };
/** One search's answer, kept with the query and the Retry count it answers. */
type Found = { q: string; seq: number; users: Candidate[] | null; failure: LoadFailure | null };

export function NewChatDialog({ night, onClose, onCreated }: NewChatDialogProps) {
  const t = palette(night);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [suggested, setSuggested] = useState<Candidate[] | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  // Retry on a failed search bumps this: the same query is read again.
  const [searchSeq, setSearchSeq] = useState(0);
  const [picked, setPicked] = useState<Candidate[]>([]);
  const [groupName, setGroupName] = useState("");
  // The word filter refused the group's name: the field is marked until it is edited.
  const [nameRefused, setNameRefused] = useState(false);
  const [connections, setConnections] = useState<Connections>({ state: "idle" });
  // The people a `not_connected` refusal named; one leaves the set when they are unpicked.
  const [refused, setRefused] = useState<ReadonlySet<string>>(() => new Set());
  const [creating, setCreating] = useState(false);
  const connectionsAskedRef = useRef(false);
  // The block that stays above the list, and its height: a row or a field that Tab brings into
  // view stops under it, not behind it (`scroll-margin-top`).
  const topRef = useRef<HTMLDivElement>(null);
  const [topHeight, setTopHeight] = useState(TOP_HEIGHT);
  useEffect(() => {
    const top = topRef.current;
    if (!top || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setTopHeight(top.offsetHeight));
    observer.observe(top);
    return () => observer.disconnect();
  }, []);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Typing → the search's query, 220 ms after the last key.
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  // The first picks, before any typing. A failure is an empty list: the search is still there.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const r = await vibeRequest<{ suggestions?: Candidate[] }>("/api/me/suggested-connections?limit=20", { cache: "no-store", quiet: true, failure: "Couldn't load suggestions." });
      if (!cancelled) setSuggested(r.ok && Array.isArray(r.data.suggestions) ? r.data.suggestions : []);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!debounced) return;
    let cancelled = false;
    const run = async () => {
      const r = await vibeRequest<{ users?: Candidate[] }>(`/api/users/search?q=${encodeURIComponent(debounced)}&limit=20`, { cache: "no-store", quiet: true, failure: "Couldn't search people." });
      // A newer query (or Retry) owns the list now.
      if (cancelled) return;
      const users = r.ok && Array.isArray(r.data.users) ? r.data.users : null;
      setFound({ q: debounced, seq: searchSeq, users, failure: users ? null : asLoadFailure(r, "Couldn't search people.") });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [debounced, searchSeq]);

  const group = picked.length >= 2;

  // An emptied field shows the suggestions at once, not after the delay.
  const q = query.trim() ? debounced : "";
  const answer = q && found && found.q === q && found.seq === searchSeq ? found : null;
  // Suggested never holds a connection (`/api/me/suggested-connections` leaves out everyone the viewer
  // already follows), so in a group nobody on it could be added: the search's own line stands there
  // instead of twenty people who cannot be picked.
  const loading = q ? answer === null : !group && suggested === null;
  const list = q ? (answer?.users ?? null) : group ? [] : suggested;

  /** The group rule: while two or more are picked, someone the viewer is not connected with. */
  const outside = (u: Candidate): boolean => group && (refused.has(u.id) || (connections.state === "ready" && !connections.ids.has(u.id)));
  const held = picked.some(outside);
  const canCreate = picked.length > 0 && !held && !creating;
  const names = listNames(picked.filter((p) => refused.has(p.id)).map(personName));
  const refusal = group && names ? `${names} can't be added. Group chats are for people you're connected with.` : null;

  const loadConnections = async () => {
    setConnections({ state: "loading" });
    const ids = await readConnections();
    if (aliveRef.current) setConnections(ids ? { state: "ready", ids } : { state: "failed" });
  };

  const toggle = (u: Candidate) => {
    if (creating) return;
    if (picked.some((p) => p.id === u.id)) {
      setPicked(picked.filter((p) => p.id !== u.id));
      if (refused.has(u.id)) setRefused(new Set([...refused].filter((id) => id !== u.id)));
      return;
    }
    if (!u.handle || outside(u)) return;
    const next = [...picked, u];
    setPicked(next);
    // The first time a second person is picked: who the viewer is connected with, once.
    if (next.length >= 2 && !connectionsAskedRef.current) {
      connectionsAskedRef.current = true;
      void loadConnections();
    }
  };

  const create = async () => {
    if (!canCreate) return;
    setCreating(true);
    let channelId: string | null = null;
    if (picked.length === 1) {
      const r = await vibeRequest<{ channel_id?: string }>("/api/me/threads", { json: { handle: picked[0].handle }, failure: FAILURE });
      if (r.ok) {
        channelId = typeof r.data.channel_id === "string" && r.data.channel_id ? r.data.channel_id : null;
        if (!channelId) toast({ message: `${FAILURE} Try again.`, tone: "error" });
      }
    } else {
      const r = await createGroup(groupName.trim(), picked.map((p) => p.id));
      if (r.ok) channelId = r.channelId;
      else if (!aliveRef.current) return;
      else if (r.notConnected) setRefused(new Set(r.notConnected));
      else if (r.field === "name") setNameRefused(true);
    }
    if (!aliveRef.current) return;
    // The shell opens the chat and takes the dialog away; a dialog it left up is usable again.
    if (channelId) onCreated(channelId);
    setCreating(false);
  };

  const fieldStyle: React.CSSProperties = { ["--vibe-new-ph" as string]: t.muted, width: "100%", height: 40, boxSizing: "border-box", borderRadius: 12, border: `1px solid ${t.fieldBorder}`, background: "rgba(var(--scrim-rgb), 0.05)", color: t.ink, fontFamily: "inherit", fontSize: 14 };
  const quiet = (text: string) => <p style={{ margin: 0, padding: "48px 24px", textAlign: "center", fontSize: 13.5, lineHeight: 1.5, color: t.secondary }}>{text}</p>;

  return (
    <DesktopDialog
      title="New message"
      onClose={onClose}
      busy={creating}
      footer={
        <button
          type="button"
          className="vibe-new-cta"
          disabled={!canCreate}
          onClick={() => void create()}
          style={{ height: 36, boxSizing: "border-box", padding: "0 18px", border: "none", borderRadius: 999, background: t.coralButton.bg, color: t.coralButton.ink, fontFamily: "inherit", fontSize: 14, fontWeight: 800, cursor: canCreate ? "pointer" : "default", opacity: canCreate ? 1 : 0.45 }}
        >
          {group ? "Create group" : "Message"}
        </button>
      }
    >
      <style>{`${NEW_CSS}.vibe-new-row, .vibe-new-field { scroll-margin-top: ${topHeight}px; }`}</style>
      {/*
        The search, the picked people and a refusal stay in view while the people under them scroll:
        what holds `Create group` back is never scrolled away. As wide as the card, so a row passing
        under it does not show at its sides.
      */}
      <div ref={topRef} style={{ position: "sticky", top: 0, zIndex: 1, margin: "0 -20px", padding: "0 20px 10px", background: t.surface }}>
        <div style={{ position: "relative" }}>
          <span aria-hidden="true" style={{ position: "absolute", left: 13, top: 12, color: t.muted, display: "flex", pointerEvents: "none" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input
            type="search"
            className="vibe-new-field"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search people"
            placeholder="Search people"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            style={{ ...fieldStyle, padding: "0 12px 0 38px" }}
          />
        </div>

        {picked.length > 0 ? (
          // Many picked people scroll inside their own box: the block above the list keeps a bounded height.
          <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, maxHeight: CHIPS_MAX_HEIGHT, overflowY: "auto", overscrollBehavior: "contain", display: "flex", flexWrap: "wrap", gap: 6 }}>
            {picked.map((p) => {
              const out = outside(p);
              return (
                // Pressing a picked person takes them out. One the group rule holds back is a full row, with the line.
                <li key={p.id} style={{ flex: out ? "1 0 100%" : "0 1 auto", minWidth: 0, maxWidth: "100%" }}>
                  <button
                    type="button"
                    className="vibe-new-chip"
                    aria-pressed="true"
                    onClick={() => toggle(p)}
                    style={{ maxWidth: "100%", minHeight: 30, boxSizing: "border-box", padding: out ? "6px 10px 6px 6px" : "0 10px 0 5px", border: `1px solid ${out ? "var(--danger-ink)" : "transparent"}`, borderRadius: out ? 12 : 999, color: t.ink, fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}
                  >
                    <Face user={p} size={20} />
                    <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, lineHeight: "18px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{personName(p)}</span>
                      {out ? <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.35, color: t.secondary }}>{GROUP_RULE_LINE}</span> : null}
                    </span>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2.6" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0, marginLeft: out ? "auto" : 0 }}>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {refusal ? (
          <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: "var(--error-ink)" }}>
            {refusal}
          </p>
        ) : null}
      </div>

      {group ? (
        <input
          type="text"
          className="vibe-new-field"
          value={groupName}
          onChange={(e) => {
            setGroupName(e.target.value);
            setNameRefused(false);
          }}
          aria-label="Group name (optional)"
          aria-invalid={nameRefused || undefined}
          placeholder="Group name (optional)"
          autoComplete="off"
          maxLength={80}
          style={{ ...fieldStyle, marginBottom: 10, padding: "0 12px", borderColor: nameRefused ? "var(--danger-ink)" : t.fieldBorder }}
        />
      ) : null}

      {/* The rows run edge to edge of the card (the dialog's body is padded 20px at the sides). */}
      <div style={{ margin: "0 -20px", minHeight: 264 }}>
        {loading ? (
          <HomeSkeleton />
        ) : answer?.failure ? (
          <div style={{ padding: "12px 20px" }}>
            <LoadFailed failure={answer.failure} tone={night ? "dark" : "light"} compact onRetry={() => setSearchSeq((n) => n + 1)} />
          </div>
        ) : !list || list.length === 0 ? (
          quiet(q ? `No matches for "${q}"` : "Search above to start a new message.")
        ) : (
          <>
            {!q ? <p style={{ margin: 0, padding: "4px 20px 6px", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: t.muted }}>Suggested</p> : null}
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {list.map((u) => {
                const isPicked = picked.some((p) => p.id === u.id);
                // The rule's line shows under a picked person too (the reason `Create group` is held back,
                // here in the list); only one who is not picked is unpickable: pressing a picked one takes them out.
                const out = outside(u);
                const barred = out && !isPicked;
                const sub = out ? GROUP_RULE_LINE : [u.handle ? `@${u.handle}` : null, u.major].filter(Boolean).join(" · ");
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="vibe-new-row"
                      aria-pressed={isPicked}
                      aria-disabled={barred || undefined}
                      disabled={!u.handle}
                      onClick={() => toggle(u)}
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 20px", border: "none", color: t.ink, fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 12, cursor: u.handle && !barred ? "pointer" : "default" }}
                    >
                      <span style={{ display: "flex", opacity: barred || !u.handle ? 0.5 : 1 }}>
                        <Face user={u} size={40} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3, color: barred || !u.handle ? t.secondary : t.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{personName(u)}</span>
                        {sub ? <span style={{ fontSize: 12.5, lineHeight: 1.35, color: out ? t.secondary : t.muted, whiteSpace: out ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span> : null}
                      </span>
                      <PickMark picked={isPicked} off={barred || !u.handle} t={t} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </DesktopDialog>
  );
}

/** A person's photo, or their initials on `personColor(id)`. */
function Face({ user, size }: { user: Candidate; size: number }) {
  const c = personColor(user.id);
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, flexShrink: 0, borderRadius: 999, background: user.avatar_url ? `url(${user.avatar_url}) center/cover` : c.bg, color: c.ink, fontSize: size >= 40 ? 13.5 : 8.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {user.avatar_url ? null : initialsOf(user.name || user.handle)}
    </span>
  );
}

/** The row's end: a coral check when picked, a ring when not (a shape, not a colour alone). */
function PickMark({ picked, off, t }: { picked: boolean; off: boolean; t: Palette }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: 20, height: 20, flexShrink: 0, boxSizing: "border-box", borderRadius: 999, border: picked ? "none" : `1.5px solid ${t.ringGrey}`, background: picked ? t.coral : "transparent", color: t.coralButton.ink, opacity: off ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {picked ? <CheckIcon size={12} /> : null}
    </span>
  );
}
