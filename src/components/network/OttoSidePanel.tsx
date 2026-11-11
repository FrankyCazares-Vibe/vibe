"use client";

import "@/components/otto/kit/sky.css";
import "@/components/otto/kit/desk.css";
import "./otto-panel.css";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { MiniMessagesFrame, type MiniMessagesHandle } from "@/components/desktop/messages/MiniMessenger";
import { DESK_AS_KEY } from "@/components/mobile/use-otto-desk";
import { DeskDraft } from "@/components/otto/desk/DeskDraft";
import { DeskIcon, deskLine } from "@/components/otto/desk/DeskRow";
import { DeskList, DeskSection } from "@/components/otto/desk/DeskSection";
import { OttoPlanet } from "@/components/otto/planet/OttoPlanet";
import { DESK_AS_EVENT, useOttoDesk } from "@/components/otto/use-otto-desk";
import { vibeRequest } from "@/lib/feedback/request";
import { readSwitchedClub } from "@/lib/orgs/club-switch";
import type { DeskItem } from "@/lib/otto/desk";
import { moreLine, PANEL_READY_MAX, panelClubParam, panelDesk, panelLinks } from "@/lib/otto/panel-desk";
import { countOpen } from "@/lib/usage/touch-client";

import { OttoSidePanelLegacy } from "./OttoSidePanelLegacy";

/**
 * The computer's side panel (Wave 2B, Nov 11, 2026; board D3 frames 2 and 3).
 * A column of fluted glass at the right that stops above the corner Otto, so
 * the button that opened it closes it. THE PAGE IS NOT DIMMED (Franky's call
 * 12): no backdrop, the page stays readable and clickable, so the panel is a
 * non-modal region (`<aside>`): no focus trap; Escape or the corner closes it
 * and focus goes back to the corner.
 *
 * Header: a still 28px Otto, "otto", his one line from the desk. Tabs Otto |
 * Messages (Messages only with the new chat, its contents as before). The
 * Otto tab is a mini desk: the top two Ready items (the first may carry the
 * frame's one coral verb), a few "Otto saw" rows, then the whole desk and its
 * Stats. Same honesty as the desk: nothing says Otto did or will send
 * anything. It acts as the desk's saved pick on this device; no switcher here.
 *
 * `deskOn={false}` (OTTO_DESK=off, read from /api/me/features) draws today's
 * panel unchanged (OttoSidePanelLegacy.tsx). The static twin is #ottoPanel in
 * public/html/_otto.js. Opening marks notifications read, as before.
 */

type PanelTab = "otto" | "messages";
const TABS: { id: PanelTab; label: string }[] = [
  { id: "otto", label: "Otto" },
  { id: "messages", label: "Messages" },
];

const NO_DESK = Object.freeze({});
const PART_FAILED = "Part of this couldn't load, so it may be missing something.";

export type OttoSidePanelProps = {
  open: boolean;
  /** `focusCorner`: hand focus back to the corner (Escape, Close); not when a link inside was followed. */
  onClose: (focusCorner?: boolean) => void;
  /** Messages as the second tab (`useMiniMessages`): laptops with the new chat. */
  messages?: { available: boolean; unread: number };
  /** False only when OTTO_DESK=off: today's panel. Null while the answer is out: nothing shows yet. */
  deskOn?: boolean | null;
  /** The panel's id, for the corner's aria-controls. */
  id?: string;
};

export function OttoSidePanel({ deskOn = true, ...props }: OttoSidePanelProps) {
  if (deskOn === false) return <OttoSidePanelLegacy open={props.open} onClose={() => props.onClose(true)} messages={props.messages} />;
  // Until the flag answers (at most FLAG_WAIT_MS), nothing opens: the corner
  // shows it's pressed, as the static corner waits (_otto.js), so OTTO_DESK=off
  // never flashes the new panel before the old one (walk fix, Nov 11).
  if (deskOn === null) return null;
  return <OttoDeskPanel {...props} flagKnown />;
}

/** The flag's answer comes in well before this; a hung read still counts as on. */
const FLAG_WAIT_MS = 4000;

/**
 * Is the desk on (`otto_desk` from /api/me/features)? Asked once, when the
 * corner is first hovered, focused or clicked. Null until it answers; on if
 * the read fails or hangs: it's an off button.
 */
export function useOttoDeskFlag(armed: boolean): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (!armed || asked.current) return;
    asked.current = true;
    const settle = (v: boolean) => setOn((was) => (was === null ? v : was));
    const timer = window.setTimeout(() => settle(true), FLAG_WAIT_MS);
    fetch("/api/me/features", { credentials: "include", cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok?: boolean; otto_desk?: unknown }>)
      .then((j) => settle(!(j?.ok === true && j.otto_desk === false)))
      .catch(() => settle(true))
      .finally(() => window.clearTimeout(timer));
  }, [armed]);
  return on;
}

/** The desk's own pick on this device (the phone desk's DESK_AS_KEY), guarded. */
function readDeskAs(): string | null {
  try {
    return window.localStorage.getItem(DESK_AS_KEY);
  } catch {
    return null;
  }
}

/**
 * On /otto, the club the desk there shows (`?club=`, kept in the URL by its
 * Acting as): the panel beside it acts as the same one. Null elsewhere.
 */
function deskPageClub(): string | null {
  try {
    if (!window.location.pathname.startsWith("/otto")) return null;
    return new URLSearchParams(window.location.search).get("club");
  } catch {
    return null;
  }
}

/** Opening the panel marks notifications read, as it always has, so the corner's count clears. */
async function markSeen(): Promise<void> {
  const c = await vibeRequest<{ unread?: number }>("/api/me/notifications/count", {
    cache: "no-store",
    quiet: true,
    failure: "Couldn't load your activity counts.",
  });
  if (!c.ok || !((c.data.unread ?? 0) > 0)) return;
  await vibeRequest("/api/me/notifications/mark-read", {
    method: "POST",
    json: { all: true },
    quiet: true,
    failure: "Couldn't mark your notifications read.",
  });
}

function OttoDeskPanel({ open, onClose, messages, id, flagKnown }: Omit<OttoSidePanelProps, "deskOn"> & { flagKnown: boolean }) {
  // Kept while the panel is closed: it opens on the tab it was left on.
  const [tab, setTab] = useState<PanelTab>("otto");
  const frameRef = useRef<MiniMessagesHandle | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Partial<Record<PanelTab, HTMLButtonElement | null>>>({});
  const withMessages = messages?.available === true;
  const showMessages = withMessages && tab === "messages";
  const d = useOttoDesk(NO_DESK, null);
  const { desk, load } = d;
  const [settled, setSettled] = useState(false);
  const paramRef = useRef<string | null>(null);
  const titleId = useId();
  const baseId = useId();

  // Escape closes, and focus goes back to the corner. Only from the panel
  // or the corner: the page stays usable, so an Escape meant for a sheet or
  // a field out there is not the panel's (review 2B, finding 1).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const at = document.activeElement;
      const inPanel = !!at && !!panelRef.current?.contains(at);
      if (inPanel || at?.id === "otto-corner") onClose(inPanel);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus moves into the panel when it opens; nothing traps it there.
  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Each open reads the desk again: on /otto for the club the desk there
  // shows (its `?club=`), elsewhere for the desk's saved pick on this device.
  // Quiet: a failure is the panel's own card, not a toast too. Closing resets
  // "settled", so a desk that failed last time opens on "opening…" again.
  useEffect(() => {
    if (!open || !flagKnown) return;
    let live = true;
    void (async () => {
      paramRef.current = panelClubParam(deskPageClub(), null) ?? panelClubParam(readDeskAs(), readSwitchedClub()?.handle);
      const ok = await load(paramRef.current, { quiet: true });
      if (!live) return;
      setSettled(true);
      if (ok) void markSeen();
    })();
    return () => {
      live = false;
      setSettled(false);
    };
  }, [open, flagKnown, load]);

  // A pick made on the desk beside the open panel (/otto's Acting as): the
  // panel follows it at once (use-otto-desk.ts tells it once that desk loads).
  useEffect(() => {
    if (!open || !flagKnown) return;
    const onPick = (e: Event) => {
      const next = panelClubParam((e as CustomEvent<unknown>).detail as string | null, null);
      if (!next || next === paramRef.current) return;
      paramRef.current = next;
      void load(next, { quiet: true });
    };
    window.addEventListener(DESK_AS_EVENT, onPick);
    return () => window.removeEventListener(DESK_AS_EVENT, onPick);
  }, [open, flagKnown, load]);

  // An Otto open for the use totals (src/lib/usage/touch.ts): the panel
  // opened on its Otto tab, or switched to it from Messages. The panel opens
  // on the tab it was left on, so an open on Messages is not one.
  useEffect(() => {
    if (open && (!withMessages || tab === "otto")) countOpen("otto");
  }, [open, tab, withMessages]);

  // The tabs pattern: one Tab stop, arrows and Home/End move between tabs.
  const onTabKey = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      const i = TABS.findIndex((t) => t.id === tab);
      const to =
        e.key === "ArrowRight" ? (i + 1) % TABS.length
        : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length
        : e.key === "Home" ? 0
        : e.key === "End" ? TABS.length - 1
        : -1;
      if (to < 0) return;
      e.preventDefault();
      const next = TABS[to].id;
      setTab(next);
      tabRefs.current[next]?.focus();
    },
    [tab],
  );

  // A link inside opens its page: the panel steps aside for it.
  const onPanelClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (a && !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) onClose(false);
    },
    [onClose],
  );

  if (!open) return null;

  const tabId = (t: PanelTab) => `${baseId}-tab-${t}`;
  const tabPanelId = (t: PanelTab) => `${baseId}-panel-${t}`;
  const say = desk ? desk.say : settled ? "couldn't load your desk. try again in a sec." : "opening your desk…";
  const acting = desk?.actingAs ?? null;

  return (
    <aside
      ref={panelRef}
      id={id}
      className="otp tx-host otp-glass"
      aria-labelledby={titleId}
      aria-busy={d.loading || undefined}
      tabIndex={-1}
      onClick={onPanelClick}
    >
      <i className="tx tx-flute" aria-hidden="true" />
      <div className="tx-host dk-card otp-head">
        <i className="tx tx-paper" aria-hidden="true" />
        <OttoPlanet size={28} />
        <div className="otp-head-tx">
          <h2 id={titleId} className="otp-name">
            otto
          </h2>
          <p className="otp-say">{say}</p>
          {acting ? (
            <p className="otp-as">
              Acting as <b>{acting.name}</b>
            </p>
          ) : null}
        </div>
        <button type="button" className="otp-x" aria-label="Close Otto" onClick={() => onClose(true)}>
          <svg className="dk-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {withMessages ? (
        <div className="otp-tabs" role="tablist" aria-label="Otto and Messages">
          {TABS.map((t) => {
            const unread = t.id === "messages" ? (messages?.unread ?? 0) : 0;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                id={tabId(t.id)}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={tab === t.id ? tabPanelId(t.id) : undefined}
                aria-label={unread > 0 ? `Messages, ${unread} unread` : undefined}
                tabIndex={tab === t.id ? 0 : -1}
                className={tab === t.id ? "otp-tab on" : "otp-tab"}
                onClick={() => setTab(t.id)}
                onKeyDown={onTabKey}
              >
                {t.id === "messages" ? <DeskIcon name="unread_dm" /> : null}
                {t.label}
                {unread > 0 ? (
                  <span className="otp-count" aria-hidden="true">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </button>
            );
          })}
          {/* The frame's two controls, in the row as today (and as the static twin). */}
          {showMessages ? (
            <>
              <button
                type="button"
                className="otp-tab-new"
                aria-label="New message"
                title="New message"
                onClick={() => frameRef.current?.compose()}
              >
                <svg className="dk-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M12 20h8" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5z" />
                </svg>
              </button>
              <button type="button" className="otp-tab-open" onClick={() => frameRef.current?.openInMessages()}>
                Open
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Mounted only while its tab shows: the frame's page keeps reading
          the lists for as long as it exists. */}
      {showMessages ? (
        <div id={tabPanelId("messages")} role="tabpanel" aria-labelledby={tabId("messages")} className="otp-frame">
          <MiniMessagesFrame ref={frameRef} followTheme />
        </div>
      ) : (
        <>
          <div
            className="otp-body"
            {...(withMessages ? { id: tabPanelId("otto"), role: "tabpanel", "aria-labelledby": tabId("otto") } : {})}
          >
            <MiniDesk d={d} settled={settled} onRetry={() => void load(paramRef.current, { quiet: true })} />
          </div>
          {/* The way on, pinned at the foot: always in sight, however full the desk. */}
          <DeskLinks desk={desk} />
        </>
      )}
    </aside>
  );
}

type DeskState = ReturnType<typeof useOttoDesk>;

/** A reminder: its title and label, and a quiet Done (nothing delivers reminders yet). */
function ReminderRow({ item, d }: { item: DeskItem; d: DeskState }) {
  const busy = d.busyId === item.id;
  return (
    <div className="dk-row">
      <span className="dk-row-ic">
        <DeskIcon name="reminder" />
      </span>
      <span className="dk-row-tx">
        <b>{item.title}</b>
        {deskLine(item) ? <span>{deskLine(item)}</span> : null}
      </span>
      <button
        type="button"
        className="dk-btn"
        aria-label={`Done: ${item.title}`}
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={() => void d.reminderDone(item)}
      >
        Done
      </button>
    </div>
  );
}

function Note({ children }: { children: string }) {
  return (
    <p className="tx-host dk-card otp-note">
      <i className="tx tx-paper" aria-hidden="true" />
      {children}
    </p>
  );
}

/** The Otto tab: the top two Ready items, a few Otto saw rows, and the way to the whole desk. */
function MiniDesk({ d, settled, onRetry }: { d: DeskState; settled: boolean; onRetry: () => void }) {
  const { desk } = d;
  // On /otto the page's top item is the frame's one coral button.
  const onDeskPage = (usePathname() ?? "").startsWith("/otto");
  if (!desk) {
    return settled ? (
      <div className="tx-host dk-card dk-fail" role="alert">
        <i className="tx tx-paper" aria-hidden="true" />
        <p>
          <b>Your desk didn&rsquo;t load.</b> Everything on it is still where it was.
        </p>
        <div className="dk-fail-go">
          <button type="button" className="dk-btn" disabled={d.loading} onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    ) : (
      <div className="tx-host dk-card otp-loading">
        <i className="tx tx-paper" aria-hidden="true" />
        <p>Opening your desk…</p>
      </div>
    );
  }

  const pd = panelDesk(desk, d.failed, { coral: !onDeskPage });
  return (
    <>
      <DeskSection title="Ready for you" count={desk.ready.length} level={3} empty={pd.readyPartial ? undefined : desk.empty.ready}>
        {/* In the desk's own order: a reminder first on the desk is first here. */}
        {pd.ready.map(({ item, open }) =>
          item.kind === "reminder" ? (
            <DeskList key={item.id}>
              <ReminderRow item={item} d={d} />
            </DeskList>
          ) : (
            <DeskDraft
              key={item.id}
              item={item}
              open={open}
              onVerb={(it) => void d.accept(it)}
              busy={d.busyId === item.id}
              foot={open && item.verb?.kind === "join_request" ? "Nothing changes until you tap Accept." : undefined}
            />
          ),
        )}
        {pd.readyPartial ? <Note>{PART_FAILED}</Note> : null}
      </DeskSection>

      <DeskSection title="Otto saw" count={desk.saw.length} level={3} empty={pd.sawFailed ? undefined : desk.empty.saw}>
        {pd.saw.length > 0 ? (
          <div className="tx-host dk-card otp-saw-card">
            <i className="tx tx-paper" aria-hidden="true" />
            {pd.saw.map((item) => {
              const body = (
                <>
                  <DeskIcon name={item.kind} />
                  <span className="otp-saw-tx">
                    <span>{item.title}</span>
                    {item.detail || item.whenLabel ? (
                      <span className="otp-saw-sub">
                        {item.detail}
                        {item.detail && item.whenLabel ? " · " : null}
                        {item.whenLabel ? <time dateTime={item.whenISO}>{item.whenLabel}</time> : null}
                      </span>
                    ) : null}
                  </span>
                </>
              );
              return item.href ? (
                <Link key={item.id} className="otp-saw" href={item.href}>
                  {body}
                </Link>
              ) : (
                <p key={item.id} className="otp-saw">
                  {body}
                </p>
              );
            })}
          </div>
        ) : null}
        {pd.sawFailed ? <Note>{pd.saw.length > 0 ? PART_FAILED : "What Otto saw didn't load. Try again in a bit."}</Note> : null}
      </DeskSection>
    </>
  );
}

/** The two ways on, keeping the club the panel shows: the whole desk (and how much more is on it), and its Stats. */
function DeskLinks({ desk }: { desk: DeskState["desk"] }) {
  const links = panelLinks(desk);
  const more = desk ? Math.max(0, desk.ready.length - PANEL_READY_MAX) : 0;
  return (
    <nav className="tx-host dk-card otp-links" aria-label="Otto's desk">
      <i className="tx tx-paper" aria-hidden="true" />
      <Link className="otp-link" href={links.desk}>
        <span>Open your desk →</span>
        {more > 0 ? <span className="otp-link-sub">{moreLine(more)}</span> : null}
      </Link>
      <Link className="otp-link" href={links.stats}>
        <span>Full breakdown →</span>
      </Link>
    </nav>
  );
}
