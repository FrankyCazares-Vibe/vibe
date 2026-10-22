"use client";

/**
 * The pieces every Club tools page shares (the club's view, wave 2, C10;
 * the B_Board_Tools drawing): the back link and title, the grouped rows
 * with a chevron, a person's photo, the loading rows and the action sheet.
 * Theme tokens only (club-tool-styles), so Night mode follows. Every row and
 * button is at least 44px tall.
 */
import Link from "next/link";
import { createContext, useContext, type CSSProperties, type JSX, type ReactNode } from "react";
import { Drawer } from "vaul";

import { eyebrowStyle, lineStyle, quietStyle, titleStyle } from "@/components/orgs/club-tool-styles";

const SANS = "DM Sans, sans-serif";

/**
 * "‹ <club>" (or "‹ Club tools") at the top, then the page's title and its
 * grey line. A sub-page passes `club`: its grey line then starts with the
 * club's name as a link to the club page, so both ways back are one tap.
 *
 * In the computer's tools panel on the club page (ClubToolsPanel.tsx; Oct
 * 22, 2026) the screen never leaves the page: `onBack` makes ‹ a button
 * (back to the screen under it, or the arc), `onClose` puts the panel's ×
 * at the other end of that row, the title is the panel's heading (an h2,
 * `titleId` names the panel by it) and the club's name is plain words, since
 * the club page is already right there.
 */
type HeaderBack = { backHref: string; onBack?: never } | { onBack: () => void; backHref?: never };

export function ToolsHeader({
  backHref,
  onBack,
  backLabel,
  title,
  sub,
  club,
  onClose,
  closeLabel = "Close",
  titleId,
}: HeaderBack & {
  backLabel: string;
  title: string;
  sub?: string;
  club?: { name: string; handle: string };
  onClose?: () => void;
  closeLabel?: string;
  titleId?: string;
}): JSX.Element {
  const backInner = (
    <>
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{backLabel}</span>
    </>
  );
  const Heading = onBack ? "h2" : "h1";
  const back = onBack ? (
    <button type="button" className="vibe-press" aria-label={`Back to ${backLabel}`} onClick={onBack} style={backButtonStyle}>
      {backInner}
    </button>
  ) : (
    <Link href={backHref} className="vibe-press" style={backLinkStyle}>
      {backInner}
    </Link>
  );
  return (
    <header style={{ marginBottom: 18 }}>
      {/* The phone pages keep the bare link, as before; the row is the panel's. */}
      {onClose ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          {back}
          <button type="button" className="vibe-press" aria-label={closeLabel} onClick={onClose} style={closeButtonStyle}>
            <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ) : (
        back
      )}
      <Heading id={titleId} style={{ ...titleStyle, marginTop: 6 }}>
        {title}
      </Heading>
      {sub || club ? (
        <p style={{ ...quietStyle, marginTop: 4, fontSize: 13 }}>
          {club && onBack ? <span style={{ fontWeight: 600 }}>{club.name}</span> : null}
          {club && !onBack ? (
            <Link href={`/orgs/${encodeURIComponent(club.handle)}`} style={clubLinkStyle}>
              {club.name}
            </Link>
          ) : null}
          {club && sub ? " · " : null}
          {sub}
        </p>
      ) : null}
    </header>
  );
}

/** A labelled box of rows ("Bring people in", "People", "The club"). */
export function Group({ label, children }: { label?: string; children: ReactNode }): JSX.Element {
  return (
    <section style={{ margin: "0 0 18px" }}>
      {label ? <h2 style={{ ...eyebrowStyle, margin: "0 0 8px 2px" }}>{label}</h2> : null}
      <ul style={cardStyle}>{children}</ul>
    </section>
  );
}

/** One row of a Group: an icon, the words, a count or a note, a chevron. A link or a button. */
export function NavRow({
  icon,
  label,
  href,
  onClick,
  count,
  dot,
  note,
}: {
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  count?: number | null;
  /** The coral dot: someone is waiting (join requests). */
  dot?: boolean;
  note?: string;
}): JSX.Element {
  const inner = (
    <>
      <span aria-hidden style={rowIconStyle}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{label}</span>
      {dot ? <span aria-hidden style={dotStyle} /> : null}
      {typeof count === "number" ? <span style={rowCountStyle}>{count}</span> : null}
      {note ? <span style={{ ...rowCountStyle, maxWidth: "45%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note}</span> : null}
      <Chevron />
    </>
  );
  // The count and dot are read out with the label, so a screen reader hears "Join requests, 2 waiting".
  const spoken =
    typeof count === "number" ? `${label}, ${count}${dot ? " waiting" : ""}` : note ? `${label}, ${note}` : label;
  return (
    <li style={rowItemStyle}>
      {href ? (
        <Link href={href} aria-label={spoken} className="vibe-press" style={rowStyle}>
          {inner}
        </Link>
      ) : (
        <button type="button" aria-label={spoken} onClick={onClick} className="vibe-press" style={rowStyle}>
          {inner}
        </button>
      )}
    </li>
  );
}

export function Chevron(): JSX.Element {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ink-muted)", flexShrink: 0 }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** A person's photo, or their initials on the tag colour when they have none. */
export function Avatar({ name, handle, url, size = 40 }: { name: string | null; handle: string | null; url: string | null; size?: number }): JSX.Element {
  const initials = (name ?? handle ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        flexShrink: 0,
        // JSON.stringify quotes the URL, so a ")" in it can't end the url().
        background: url ? `url(${JSON.stringify(url)}) center/cover` : "var(--tag-bg)",
        color: "var(--tag-ink)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Fraunces, serif",
        fontWeight: 800,
        fontSize: Math.round(size * 0.36),
      }}
    >
      {url ? null : initials}
    </span>
  );
}

/** Grey rows while the first read runs. */
export function ListSkeleton({ rows = 4 }: { rows?: number }): JSX.Element {
  return (
    <ul aria-hidden style={{ ...cardStyle, padding: "4px 14px" }}>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 64, borderTop: i ? "1px solid var(--hairline)" : "none" }}>
          <span style={{ ...skeletonStyle, width: 40, height: 40, borderRadius: 999 }} />
          <span style={{ flex: 1 }}>
            <span style={{ ...skeletonStyle, display: "block", width: "48%", height: 13 }} />
            <span style={{ ...skeletonStyle, display: "block", width: "30%", height: 10, marginTop: 7 }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The line a list shows when it has nothing ("No requests right now."). */
export function EmptyLine({ children }: { children: ReactNode }): JSX.Element {
  return <p style={{ ...lineStyle, padding: "22px 4px", textAlign: "center", color: "var(--ink-muted)" }}>{children}</p>;
}

/** A person's line in a list: photo, name, @handle and a grey line; `end` sits on the right. */
export function PersonLine({
  name,
  handle,
  avatarUrl,
  sub,
  end,
}: {
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
  sub?: ReactNode;
  end?: ReactNode;
}): JSX.Element {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, width: "100%" }}>
      <Avatar name={name} handle={handle} url={avatarUrl} />
      <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <span style={personNameStyle}>{name || (handle ? `@${handle}` : "Someone")}</span>
        <span style={personSubStyle}>
          {handle ? `@${handle}` : null}
          {sub ? (
            <>
              {handle ? " · " : null}
              {sub}
            </>
          ) : null}
        </span>
      </span>
      {end}
    </span>
  );
}

/** The filter box at the top of a list. 16px words, so iOS doesn't zoom in. */
export function FilterBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }): JSX.Element {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={label}
      aria-label={label}
      autoComplete="off"
      style={filterStyle}
    />
  );
}

/**
 * Where the sheets of a screen in the computer's tools panel go (Oct 22,
 * 2026; ClubToolsPanel.tsx provides it): along the bottom of the panel's
 * column, `width` wide, rather than the middle of the window, and dark like
 * the panel (`vibe-night-island`), in Light too. No provider (every phone
 * page), no change.
 */
export const ToolSheetPlacement = createContext<{ width: number } | null>(null);

/**
 * A bottom sheet (vaul), above the phone's tab bar (9988) and under the
 * toasts (12000), the layers ClubOptionsSheet uses. Swipe down, the
 * backdrop or a Cancel row closes it.
 */
export function ToolSheet({
  title,
  note,
  onClose,
  children,
}: {
  title: string;
  note?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  const inPanel = useContext(ToolSheetPlacement);
  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay style={sheetOverlayStyle} />
        <Drawer.Content
          className={inPanel ? "vibe-night-island" : undefined}
          style={inPanel ? { ...sheetContentStyle, left: "auto", width: inPanel.width, maxWidth: inPanel.width, margin: 0 } : sheetContentStyle}
          aria-describedby={undefined}
        >
          <Drawer.Handle style={sheetHandleStyle} />
          <Drawer.Title style={sheetHeadingStyle}>{title}</Drawer.Title>
          {note ? <div style={sheetNoteStyle}>{note}</div> : null}
          <div style={{ padding: "4px 0 12px", maxHeight: "70dvh", overflowY: "auto" }}>{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** One choice in a sheet. `danger` for Remove; `bold` for Cancel. */
export function SheetAction({
  label,
  onClick,
  danger,
  bold,
  disabled,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  bold?: boolean;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sheetRowStyle,
        fontWeight: bold ? 700 : 500,
        color: danger ? "var(--error-ink)" : "var(--charcoal)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

/** "Remove Maya?" and friends: the line, the red choice, Cancel. Never window.confirm. */
export function ConfirmSheet({
  title,
  note,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  note?: ReactNode;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <ToolSheet title={title} note={note} onClose={onClose}>
      <ConfirmRows confirmLabel={confirmLabel} busy={busy} onConfirm={onConfirm} onClose={onClose} />
    </ToolSheet>
  );
}

/** A confirm's two rows, for a sheet that asks inside itself (a member's Remove). */
export function ConfirmRows({
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <>
      <SheetAction label={busy ? "Working…" : confirmLabel} danger disabled={busy} onClick={onConfirm} />
      <SheetAction label="Cancel" bold disabled={busy} onClick={onClose} />
    </>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

/** The rounded box a group's rows sit in (--paper in Night and Light). */
export const cardStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  borderRadius: 16,
  border: "1px solid var(--hairline)",
  background: "var(--paper)",
  overflow: "hidden",
};

/** Each row after the first gets the hairline above it. */
export const rowItemStyle: CSSProperties = { borderTop: "1px solid var(--hairline)", marginTop: -1 };

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  minHeight: 52,
  boxSizing: "border-box",
  padding: "0 14px",
  border: "none",
  background: "transparent",
  color: "var(--charcoal)",
  fontFamily: SANS,
  fontSize: 15,
  textAlign: "left",
  textDecoration: "none",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

/** A list row that is a button (a member, a follower): taller, for the photo. */
export const personRowStyle: CSSProperties = { ...rowStyle, minHeight: 64, padding: "8px 14px" };

const rowIconStyle: CSSProperties = {
  display: "inline-flex",
  width: 22,
  justifyContent: "center",
  color: "var(--ink-2)",
  flexShrink: 0,
};

const rowCountStyle: CSSProperties = { fontSize: 13.5, color: "var(--ink-muted)", fontVariantNumeric: "tabular-nums" };

const dotStyle: CSSProperties = { width: 8, height: 8, borderRadius: 999, background: "var(--coral)", flexShrink: 0 };

/** The club's name in a sub-page's grey line: padded out to a 44px tap without moving the line. */
const clubLinkStyle: CSSProperties = {
  display: "inline-block",
  padding: "12px 0",
  margin: "-12px 0",
  color: "inherit",
  fontWeight: 600,
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
  maxWidth: "100%",
  minHeight: 44,
  marginLeft: -6,
  padding: "0 6px",
  color: "var(--ink-2)",
  fontFamily: SANS,
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
};

/** The panel's ‹: the link's look, as a button. */
const backButtonStyle: CSSProperties = {
  ...backLinkStyle,
  minWidth: 0,
  border: "none",
  borderRadius: 999,
  background: "transparent",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

/** The panel's ×: a 44px round, quiet. */
const closeButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  marginRight: -6,
  padding: 0,
  borderRadius: 999,
  border: "1px solid var(--hairline)",
  background: "rgba(var(--scrim-rgb),0.05)",
  color: "var(--charcoal)",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const personNameStyle: CSSProperties = {
  display: "block",
  fontFamily: SANS,
  fontSize: 15,
  fontWeight: 600,
  color: "var(--charcoal)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const personSubStyle: CSSProperties = {
  display: "block",
  marginTop: 2,
  fontFamily: SANS,
  fontSize: 12.5,
  color: "var(--ink-muted)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const filterStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  boxSizing: "border-box",
  margin: "0 0 12px",
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(var(--scrim-rgb),0.14)",
  background: "rgba(var(--scrim-rgb),0.04)",
  color: "var(--charcoal)",
  fontFamily: SANS,
  fontSize: 16,
};

const skeletonStyle: CSSProperties = { flexShrink: 0, borderRadius: 6, background: "rgba(var(--scrim-rgb),0.08)" };

/** A small chip next to a name: the role ("Officer"), "Removed before". */
export const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  flexShrink: 0,
  padding: "3px 9px",
  borderRadius: 999,
  background: "var(--tag-bg)",
  color: "var(--tag-ink)",
  fontFamily: SANS,
  fontSize: 11.5,
  fontWeight: 700,
};

const sheetOverlayStyle: CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.42)", zIndex: 10000 };

const sheetContentStyle: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  maxWidth: 560,
  margin: "0 auto",
  background: "var(--cream)",
  color: "var(--charcoal)",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
  zIndex: 10001,
  outline: "none",
};

const sheetHandleStyle: CSSProperties = { margin: "10px auto 4px", width: 38, height: 4, borderRadius: 999, background: "rgba(var(--scrim-rgb),0.18)" };

const sheetHeadingStyle: CSSProperties = {
  margin: 0,
  padding: "10px 18px 6px",
  fontFamily: "Fraunces, serif",
  fontSize: 16,
  fontWeight: 800,
  color: "var(--charcoal)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const sheetNoteStyle: CSSProperties = { ...quietStyle, padding: "0 18px 10px", fontSize: 13 };

export const sheetRowStyle: CSSProperties = {
  display: "block",
  width: "100%",
  minHeight: 48,
  padding: "14px 18px",
  background: "transparent",
  border: "none",
  borderTop: "1px solid rgba(var(--scrim-rgb),0.06)",
  fontFamily: SANS,
  fontSize: 15,
  color: "var(--charcoal)",
  textAlign: "left",
  WebkitTapHighlightColor: "transparent",
};
