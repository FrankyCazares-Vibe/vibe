"use client";

/**
 * The club page's + (wave 2, C9): one place an officer starts something new.
 * A vaul sheet on a phone (≤ 720px, the page's breakpoint), a small centred
 * dialog on a computer, titled "Post to <club>." with three rows:
 *
 * - Post to the page: today's NewPostModal (the officer bar's "New post").
 * - New event: the campus CreateEventModal, scoped to this club the way
 *   OrgEventsSection scopes it. Only a checked club may hold events (the
 *   events route refuses the rest), so for an unchecked club the row is off
 *   and says why. A new event refreshes the page and tells the page's event
 *   list (CLUB_EVENTS_CHANGED) so Up next and the Events tab read it again.
 * - Board post or poll: the club's Board in Messages; left out with no Board.
 *
 * Mounted by RowPostButton (+ Post) when it is tapped, and it stays mounted
 * through whichever dialog a row opens, calling `onClose` when that is done.
 * The sheet and the dialog are portals on <body>, outside the page's
 * `vibe-night-island`, so each carries the class itself and its theme tokens
 * read as Night like the page around it. The sheet sits over the phone's tab
 * bar (z-index 10001 over 9988); the event form, a portal at 1000, hides the
 * bar while it is open (useHideTabBar), as the setup list does.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";

import { useHideTabBar } from "@/lib/chat/use-hide-tabbar";
import { toast } from "@/lib/feedback/toast";

import { NewPostModal } from "../admin-actions";

/** Fired on `window` after a new event, `{ detail: { orgId } }`; the page's event list refetches (C9). */
const CLUB_EVENTS_CHANGED = "vibe:club-events-changed";

/** Same breakpoint as the club page's phone layout. */
const PHONE_QUERY = "(max-width: 720px)";

type EventModalProps = ComponentProps<typeof import("@/app/campus/campus-home").CreateEventModal>;

/**
 * The event form lives in campus-home: fetched on the first "New event",
 * never with this sheet. If the file can't arrive (no signal, a new build),
 * the tap says so instead of breaking the page (the setup list's pattern).
 */
const CreateEventModal = dynamic<EventModalProps>(
  () =>
    import("@/app/campus/campus-home")
      .then((mod) => mod.CreateEventModal)
      .catch(() => EventFormFailed),
  { ssr: false },
);

function EventFormFailed({ onClose }: EventModalProps) {
  useEffect(() => {
    toast({ message: "Couldn't open the event form. Reload the page and try again.", tone: "error" });
    onClose();
  }, [onClose]);
  return null;
}

/** Hides the phone's tab bar while mounted (counted, so overlaps are safe). */
function HideTabBar() {
  useHideTabBar();
  return null;
}

export type PlusClub = {
  orgId: string;
  orgHandle: string;
  orgName: string;
  verified: boolean;
  viewerRole: "owner" | "admin";
  boardId: string | null;
};

type Step = "menu" | "post" | "event";

export function PlusSheet({ club, onClose }: { club: PlusClub; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("menu");
  // Picked once, when + is tapped (this only mounts after a tap): a rotated
  // phone gets the right shape on the next open.
  const [presentation] = useState<"sheet" | "dialog">(() =>
    typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches ? "sheet" : "dialog",
  );

  if (step === "post") {
    return <NewPostModal orgHandle={club.orgHandle} onClose={onClose} />;
  }

  if (step === "event") {
    return (
      <>
        <HideTabBar />
        <CreateEventModal
          eligibleOrgs={[
            {
              id: club.orgId,
              name: club.orgName,
              handle: club.orgHandle,
              verified: club.verified,
              role: club.viewerRole,
            },
          ]}
          onClose={onClose}
          onCreated={() => {
            router.refresh();
            window.dispatchEvent(
              new CustomEvent(CLUB_EVENTS_CHANGED, { detail: { orgId: club.orgId } }),
            );
            onClose();
          }}
        />
      </>
    );
  }

  const rows = (
    <PlusRows
      club={club}
      onPost={() => setStep("post")}
      onEvent={() => setStep("event")}
      onBoard={onClose}
    />
  );
  const title = `Post to ${withStop(club.orgName)}`;

  return presentation === "sheet" ? (
    <PhoneSheet title={title} onClose={onClose}>
      {rows}
    </PhoneSheet>
  ) : (
    <DesktopDialog title={title} onClose={onClose}>
      {rows}
    </DesktopDialog>
  );
}

/** "Sixty-Four Chess." but never "Vibe Inc..". */
function withStop(name: string): string {
  const t = name.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function PlusRows({
  club,
  onPost,
  onEvent,
  onBoard,
}: {
  club: PlusClub;
  onPost: () => void;
  onEvent: () => void;
  onBoard: () => void;
}) {
  return (
    <div style={{ padding: "4px 0 12px" }}>
      <button type="button" className="vibe-press" onClick={onPost} style={rowStyle}>
        <RowFace icon={<PostGlyph />} label="Post to the page" sub="A photo or an update, on Posts" />
      </button>
      <button
        type="button"
        className={club.verified ? "vibe-press" : undefined}
        onClick={club.verified ? onEvent : undefined}
        disabled={!club.verified}
        style={{ ...rowStyle, ...(club.verified ? null : offRowStyle) }}
      >
        <RowFace
          icon={<EventGlyph />}
          label="New event"
          sub={club.verified ? "It goes on the Events tab" : "Events need a checked club"}
        />
      </button>
      {club.boardId ? (
        <Link
          href={`/messages?channel=${encodeURIComponent(club.boardId)}`}
          onClick={onBoard}
          className="vibe-press"
          style={rowStyle}
        >
          <RowFace icon={<BoardGlyph />} label="Board post or poll" sub="Opens the club's Board" />
        </Link>
      ) : null}
    </div>
  );
}

function RowFace({ icon, label, sub }: { icon: ReactNode; label: string; sub: string }) {
  return (
    <>
      <span aria-hidden style={iconTileStyle}>
        {icon}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={rowLabelStyle}>{label}</span>
        <span style={rowSubStyle}>{sub}</span>
      </span>
    </>
  );
}

/** The phone's bottom sheet, built like ClubOptionsSheet (ClubsSection.tsx). */
function PhoneSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay style={sheetOverlayStyle} />
        <Drawer.Content className="vibe-night-island" style={sheetContentStyle} aria-describedby={undefined}>
          <Drawer.Handle style={sheetHandleStyle} />
          <div style={headerStyle}>
            <Drawer.Title style={titleStyle}>{title}</Drawer.Title>
            <CloseButton onClose={onClose} />
          </div>
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * The computer's small dialog: Escape and the backdrop close it, focus goes
 * to its first row and back to + when it closes.
 */
function DesktopDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current
      ?.querySelector<HTMLElement>("button:not([disabled]), a[href]")
      ?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const open = document.querySelectorAll('[aria-modal="true"]');
      if (open[open.length - 1] !== rootRef.current) return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous && previous !== document.body && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={rootRef}
      className="vibe-night-island"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        // A portal still bubbles React events to the cover that opened it.
        e.stopPropagation();
        onClose();
      }}
      style={dialogBackdropStyle}
    >
      <div ref={panelRef} onClick={(e) => e.stopPropagation()} style={dialogPanelStyle}>
        <div style={headerStyle}>
          <h2 id={titleId} style={titleStyle}>
            {title}
          </h2>
          <CloseButton onClose={onClose} />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} aria-label="Close" style={closeButtonStyle}>
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

// ─── Looks (theme tokens; they read as Night inside vibe-night-island) ────

const SANS = "DM Sans, sans-serif";

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  width: "100%",
  minHeight: 60,
  boxSizing: "border-box",
  padding: "10px 18px",
  background: "transparent",
  border: "none",
  borderTop: "1px solid var(--hairline)",
  color: "var(--charcoal)",
  fontFamily: SANS,
  textAlign: "left",
  textDecoration: "none",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const offRowStyle: CSSProperties = { opacity: 0.5, cursor: "default" };

const iconTileStyle: CSSProperties = {
  width: 40,
  height: 40,
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  borderRadius: 12,
  background: "rgba(var(--scrim-rgb),0.07)",
  color: "var(--charcoal)",
};

const rowLabelStyle: CSSProperties = { fontSize: 15, fontWeight: 700, lineHeight: 1.3 };

const rowSubStyle: CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.4,
  color: "var(--ink-muted)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "6px 8px 8px 18px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  minWidth: 0,
  fontFamily: "Fraunces, serif",
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: "-0.01em",
  color: "var(--charcoal)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const closeButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  padding: 0,
  border: "none",
  borderRadius: 999,
  background: "transparent",
  color: "var(--ink-2)",
  cursor: "pointer",
};

const sheetOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  zIndex: 10000,
};

const sheetContentStyle: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  background: "var(--paper)",
  color: "var(--charcoal)",
  borderTop: "1px solid var(--hairline)",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
  zIndex: 10001,
  outline: "none",
};

const sheetHandleStyle: CSSProperties = {
  margin: "10px auto 4px",
  width: 38,
  height: 4,
  borderRadius: 999,
  background: "rgba(var(--scrim-rgb),0.18)",
};

const dialogBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  background: "rgba(0,0,0,0.5)",
};

const dialogPanelStyle: CSSProperties = {
  width: "min(400px, 100%)",
  boxSizing: "border-box",
  paddingTop: 8,
  borderRadius: 18,
  overflow: "hidden",
  background: "var(--paper)",
  color: "var(--charcoal)",
  border: "1px solid var(--hairline)",
  boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
  fontFamily: SANS,
};

// ─── Glyphs (decorative; every row has its words) ─────────────────────────

const glyph = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function PostGlyph() {
  return (
    <svg aria-hidden {...glyph}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M20.5 16l-4.8-4.8L7 19.5" />
    </svg>
  );
}

function EventGlyph() {
  return (
    <svg aria-hidden {...glyph}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

function BoardGlyph() {
  return (
    <svg aria-hidden {...glyph}>
      <path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5z" />
      <path d="M8 10h8M8 13h5" />
    </svg>
  );
}
