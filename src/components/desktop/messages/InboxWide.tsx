"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";

import { LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { ClubRow } from "@/components/mobile/messages/home/ClubRow";
import { HomeEmpty } from "@/components/mobile/messages/home/HomeEmpty";
import { allBadgeCount, badgeText, HOME_FILTERS, type HomeRow, mergeHomeRows } from "@/components/mobile/messages/home/home-rules";
import { FILTER_LABEL, HomeSkeleton, LIST_LABEL } from "@/components/mobile/messages/home/MessagesHome";
import { PersonRow } from "@/components/mobile/messages/home/PersonRow";
import { EmptyState, ThreadRow } from "@/components/mobile/messages/ThreadList";
import { FONT, palette, SERIF } from "@/components/mobile/messages/v2-tokens";
import type { InboxClub, RoomKind } from "@/lib/chat/types";

import type { InboxWideProps } from "./contracts";
import { searchRows } from "./desktop-rules";

/**
 * The wide list of desktop Messages (handoffs/chat-redesign/wave-3-desktop/
 * contract.md 3.2, 6.5, section 8 W3-4-lists; the board's step 0): the home's
 * left column. `Messages`, the search, `New`, the four filter pills and the
 * list, in a column that scrolls by itself.
 *
 * It reads nothing: `data` is the shell's ONE `useHomeData` (H2). The list
 * switch is the phone's (`MessagesHome`'s, branch for branch) and so are the
 * rows (`ClubRow`, `PersonRow`, `ThreadRow`), used as they are (H13); their
 * hover and focus styles come from this file's `<style>`.
 *
 * Search (H5) filters the loaded rows of the filter on screen by name
 * (`searchRows`): no route. Esc in the field clears the text, then closes the
 * field; both are stopped, so the shell's own Esc rule (3.5 rule 9) never
 * also blurs the field.
 *
 * The root is the body row's flex item (3.2: `flex 0 1 520`, `min-width
 * 360`): mount it straight in that row.
 */

/** 6.5: the wide list's own line where the phone draws `EmptyState tab="all"`, whose sentence is worded for a phone. The word `Network` is the link. */
const NO_CHATS_LINE = "No chats yet. Find someone in Network, or press New.";

const WIDE_CSS = `
.vibe-inbox-wide li > button { border-radius: 14px; }
.vibe-inbox-wide li > button:hover { background: rgba(var(--scrim-rgb), 0.045) !important; }
.vibe-inbox-wide li > button:focus-visible { outline: 2px solid var(--coral); outline-offset: -2px; }
.vibe-inbox-wide [role="tab"] { outline: none; }
.vibe-inbox-wide [role="tab"]:focus-visible > span { outline: 2px solid var(--coral); outline-offset: 2px; }
.vibe-inbox-ctl:hover { background: rgba(var(--scrim-rgb), 0.06) !important; }
.vibe-inbox-ctl:focus-visible, .vibe-inbox-field:focus-visible, .vibe-inbox-link:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
.vibe-inbox-field::placeholder { color: var(--vibe-inbox-ph); opacity: 1; }
`;

const LIST_STYLE: React.CSSProperties = { listStyle: "none", padding: 0, margin: 0, flexShrink: 0, display: "flex", flexDirection: "column" };

export function InboxWide({ data: d, filter, night, onFilter, onOpenClub, onOpenThread, onNew }: InboxWideProps) {
  const t = palette(night);
  const [searching, setSearching] = useState(false);
  const [text, setText] = useState("");
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const fieldId = useId();
  const query = searching ? text.trim() : "";

  const badge = useMemo(() => allBadgeCount(d.threads ?? [], d.clubs ?? [], d.now), [d.threads, d.clubs, d.now]);
  const requestCount = d.requests?.length ?? 0;
  // The phone's states (wave-2 contract 11.1): the skeleton until BOTH lists answered.
  const pending = (d.threads === null && !d.threadsErr) || (d.clubs === null && !d.clubsErr);
  const bothFailed = !!d.threadsErr && !!d.clubsErr;
  const failedBox = (failure: LoadFailure) => (
    <div style={{ padding: "12px 16px 4px" }}>
      <LoadFailed failure={failure} tone={night ? "dark" : "light"} onRetry={d.retryLists} />
    </div>
  );
  const openClub = (club: InboxClub) => (roomId: string, roomKind: RoomKind) => onOpenClub(club.org.handle, roomId, roomKind);

  const closeSearch = () => {
    setText("");
    setSearching(false);
  };

  // A quiet line in the list's place: nothing in the lists yet, or nothing under the search.
  const quietLine = (children: React.ReactNode) => (
    <p style={{ margin: 0, padding: "48px 24px", textAlign: "center", fontSize: 14, lineHeight: 1.5, color: t.secondary, textWrap: "pretty" }}>{children}</p>
  );
  const [beforeNetwork, afterNetwork] = NO_CHATS_LINE.split("Network");
  const noChats = quietLine(
    <>
      {beforeNetwork}
      <Link href="/network" className="vibe-inbox-link" style={{ color: t.coralText, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3, borderRadius: 4 }}>
        Network
      </Link>
      {afterNetwork}
    </>,
  );
  const noMatches = quietLine(`No matches for "${query}"`);

  // One list for every filter: the rows of the filter, cut by the search, drawn by the phone's row of each kind.
  const rowList = (rows: HomeRow[], requests: boolean) => (
    <ul style={LIST_STYLE}>
      {rows.map((r) =>
        r.kind === "club" ? (
          <ClubRow key={`c:${r.club.org.id}`} club={r.club} now={d.now} onOpen={openClub(r.club)} />
        ) : requests ? (
          <ThreadRow key={`t:${r.thread.id}`} thread={r.thread} onTap={() => onOpenThread(r.thread.id)} />
        ) : (
          <PersonRow key={`t:${r.thread.id}`} thread={r.thread} now={d.now} onTap={() => onOpenThread(r.thread.id)} />
        ),
      )}
    </ul>
  );
  /** The filter's rows: `empty` when there are none, the no-match line when the search leaves none. */
  const listOf = (all: HomeRow[], empty: React.ReactNode, requests = false) => {
    if (all.length === 0) return empty;
    const rows = searchRows(all, query);
    return rows.length === 0 ? noMatches : rowList(rows, requests);
  };

  let list: React.ReactNode;
  if (pending) {
    list = <HomeSkeleton />;
  } else if (bothFailed) {
    list = failedBox(d.threadsErr as LoadFailure);
  } else if (filter === "requests") {
    const all = (d.requests ?? []).map((thread): HomeRow => ({ kind: "thread", thread }));
    list = d.threadsErr ? failedBox(d.threadsErr) : listOf(all, <EmptyState tab="requests" />, true);
  } else if (filter === "chats") {
    const all = (d.threads ?? []).map((thread): HomeRow => ({ kind: "thread", thread }));
    list = d.threadsErr ? failedBox(d.threadsErr) : listOf(all, noChats);
  } else if (filter === "clubs") {
    const all = (d.clubs ?? []).map((club): HomeRow => ({ kind: "club", club }));
    list = d.clubsErr ? failedBox(d.clubsErr) : listOf(all, <HomeEmpty />);
  } else {
    const all = mergeHomeRows(d.clubs ?? [], d.threads ?? []);
    list = (
      <>
        {d.clubsErr ? failedBox(d.clubsErr) : null}
        {d.threadsErr ? failedBox(d.threadsErr) : null}
        {listOf(all, !d.threadsErr && !d.clubsErr ? noChats : null)}
      </>
    );
  }

  return (
    <section
      aria-label="Messages"
      className="vibe-inbox-wide"
      style={{ flex: "0 1 520px", minWidth: 360, height: "100%", minHeight: 0, boxSizing: "border-box", display: "flex", flexDirection: "column", color: t.ink, fontFamily: FONT }}
    >
      <style>{WIDE_CSS}</style>
      <header style={{ flexShrink: 0, height: 68, boxSizing: "border-box", padding: "4px 24px 0", display: "flex", alignItems: "center", gap: 8 }}>
        <h1 style={{ margin: 0, marginRight: "auto", fontFamily: SERIF, fontWeight: 800, fontSize: 26, lineHeight: 1, letterSpacing: "-0.7px", color: t.ink }}>Messages</h1>
        <button
          ref={searchButtonRef}
          type="button"
          className="vibe-inbox-ctl"
          aria-label="Search your chats"
          aria-expanded={searching}
          aria-controls={searching ? fieldId : undefined}
          onClick={() => (searching ? closeSearch() : setSearching(true))}
          style={{ width: 34, height: 34, flexShrink: 0, padding: 0, border: "none", borderRadius: 999, background: searching ? "rgba(var(--scrim-rgb), 0.08)" : "transparent", color: searching ? t.ink : t.secondary, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <SearchIcon size={16} />
        </button>
        <button
          type="button"
          className="vibe-inbox-ctl"
          aria-label="New message"
          onClick={onNew}
          style={{ height: 32, flexShrink: 0, boxSizing: "border-box", padding: "0 13px 0 10px", borderRadius: 999, border: `1px solid ${t.chipBorder}`, background: "transparent", color: t.ink, fontFamily: "inherit", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New
        </button>
      </header>

      {searching ? (
        <div style={{ flexShrink: 0, position: "relative", boxSizing: "border-box", padding: "0 24px 8px" }}>
          <span aria-hidden="true" style={{ position: "absolute", left: 36, top: 11, color: t.muted, display: "flex", pointerEvents: "none" }}>
            <SearchIcon size={15} />
          </span>
          <input
            id={fieldId}
            type="search"
            className="vibe-inbox-field"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
              // Esc clears, then closes the field; either way it goes no further (3.5 rule 9).
              e.preventDefault();
              e.stopPropagation();
              if (text) {
                setText("");
              } else {
                closeSearch();
                searchButtonRef.current?.focus();
              }
            }}
            aria-label="Search your chats"
            placeholder="Search your chats"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            style={{ ["--vibe-inbox-ph" as string]: t.muted, width: "100%", height: 38, boxSizing: "border-box", padding: "0 12px 0 36px", borderRadius: 12, border: `1px solid ${t.fieldBorder}`, background: "rgba(var(--scrim-rgb), 0.05)", color: t.ink, fontFamily: "inherit", fontSize: 14 }}
          />
        </div>
      ) : null}

      <div role="tablist" aria-label="Show" style={{ flexShrink: 0, height: 45, boxSizing: "border-box", padding: "0 21px", display: "flex", alignItems: "center", gap: 2 }}>
        {HOME_FILTERS.map((f) => {
          const active = f === filter;
          const count = f === "all" ? badge : f === "requests" ? requestCount : 0;
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={f === "requests" && count > 0 ? `Requests, ${count} waiting` : undefined}
              onClick={() => onFilter(f)}
              style={{ height: 44, padding: "0 3px", border: "none", background: "transparent", display: "flex", alignItems: "center", cursor: "pointer", fontFamily: "inherit" }}
            >
              <span
                style={{
                  height: 30,
                  boxSizing: "border-box",
                  padding: count > 0 ? "0 8px 0 13px" : "0 13px",
                  borderRadius: 999,
                  border: active ? "1px solid transparent" : `1px solid ${t.chipBorder}`,
                  background: active ? t.activeChip.bg : "transparent",
                  color: active ? t.activeChip.ink : t.secondary,
                  fontSize: 13,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  whiteSpace: "nowrap",
                }}
              >
                {FILTER_LABEL[f]}
                {count > 0 ? (
                  <span
                    aria-hidden="true"
                    style={{
                      minWidth: 18,
                      height: 18,
                      boxSizing: "border-box",
                      padding: "0 5px",
                      borderRadius: 999,
                      // All: the coral badge with the coral button's ink. Requests: the tinted
                      // count pill, the pill's own ink at .12 (on the active chip that ink is the chip's).
                      background: f === "all" ? t.coral : active ? "color-mix(in srgb, currentColor 12%, transparent)" : "rgba(var(--scrim-rgb), 0.12)",
                      color: f === "all" ? t.coralButton.ink : active ? t.activeChip.ink : t.ink,
                      fontSize: 11.5,
                      fontWeight: 800,
                      lineHeight: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {badgeText(count)}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <section aria-label={LIST_LABEL[filter]} style={{ flex: "1 1 0", minHeight: 0, overflowX: "hidden", overflowY: "auto", overscrollBehavior: "contain", boxSizing: "border-box", padding: "6px 8px 24px", display: "flex", flexDirection: "column" }}>
        {list}
      </section>
    </section>
  );
}

function SearchIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
