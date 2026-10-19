"use client";

/**
 * The small pieces every Tonight surface draws (Oct 19 2026): the "School
 * event" tag, the italic "vs" title, the reason for #1, outside links, the
 * calendar credit, club marks, the orbit, the icons and the skeleton. One
 * file so the desktop panel, the phone card and sheet and the Events tab
 * look like one feature.
 *
 * OUTSIDE LINKS ARE HTTPS ONLY. The server already keeps every school link
 * on its calendar's own https host; `httpsHref` checks again, in one place
 * for every surface (OutLink, LeadLinks and the rows that are their own
 * `<a>` through `schoolHref`), so a bad row can never become a `javascript:`
 * link and one rule change reaches them all.
 *
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md §5.5.
 */
import { Fragment, type CSSProperties, type ReactElement, type ReactNode } from "react";

import type { SchoolEvent, SchoolSource } from "@/lib/school-events/types";

import { colorForOrg, initialsForOrg, orgMarkBackground } from "./org-mark";
import { TONIGHT_COPY, reasonLabel } from "./tonight-view";
import type { LeadReason, TonightItem } from "./types";

import "./tonight.css";

// ── Words ─────────────────────────────────────────────────────────────────

/**
 * "School event". `tone="glass"`: on the dark-glass event cards (same look
 * in Light and Night). `size`: the boards draw two looks. "pill" (default) is
 * C2's small filled pill on the desktop Feed panel; the phone and Events
 * boards (P2_*, D2) draw an outline with no fill, "row" in list rows and
 * "hero" (a little larger) beside a #1 title, on the phone card and on cards.
 */
export function SchoolTag({
  tone = "page",
  size = "pill",
}: {
  tone?: "page" | "glass";
  size?: "pill" | "row" | "hero";
}): ReactElement {
  const classes = ["tonight-tag"];
  if (size !== "pill") classes.push(`tonight-tag--${size}`);
  if (tone === "glass") classes.push("tonight-tag--glass");
  return <span className={classes.join(" ")}>{TONIGHT_COPY.schoolTag}</span>;
}

/**
 * A bare school event's title: games as "IU Indy vs UT Martin" with an
 * italic, quieter "vs". A no-break space glues "vs" to the opponent, so a
 * wrapping title never leaves "vs" alone at the end of a line. Not an
 * inline-block: that would stop the one-line titles (phone card) from
 * ending in an ellipsis.
 */
export function MatchupTitle({ ev }: { ev: SchoolEvent }): ReactElement {
  if (ev.kind === "game" && ev.matchup) {
    return (
      <>
        {ev.matchup.home} <span className="tonight-vs">vs</span>
        {" "}
        {ev.matchup.away}
      </>
    );
  }
  return <>{ev.title}</>;
}

/** Any Tonight row's title. */
export function ItemTitle({ item }: { item: TonightItem }): ReactElement {
  if (item.kind === "school") return <MatchupTitle ev={item.ev} />;
  return <>{item.ev.title}</>;
}

/** "Up next" · "Happening now" (with the static coral dot) · "Featured by your school". */
export function ReasonLabel({ reason }: { reason: LeadReason }): ReactElement {
  if (reason === "live") {
    return (
      <span className="tonight-reason tonight-reason--live">
        {/* The dot never stands alone: the words say the same thing. */}
        <span className="tonight-live-dot" aria-hidden="true" />
        {reasonLabel(reason)}
      </span>
    );
  }
  return <span className="tonight-reason">{reasonLabel(reason)}</span>;
}

// ── Links ─────────────────────────────────────────────────────────────────

/** The address when it is a real https URL, else null. The one check every outside link goes through. */
export function httpsHref(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Where a school item opens: its own page, else its calendar's page (both
 * https, checked here), else null (the caller draws the row unlinked). For
 * rows that are their own `<a>` (TonightPanel, TonightSheet, TonightSection).
 */
export function schoolHref(ev: SchoolEvent, sources: readonly SchoolSource[]): string | null {
  return httpsHref(ev.url) ?? httpsHref(sources.find((s) => s.key === ev.source)?.calendar_url);
}

/** Plain text of simple children, for the "opens in a new tab" label. */
function textOf(children: ReactNode): string | null {
  if (typeof children === "string" || typeof children === "number") return String(children);
  return null;
}

/** A link out of Vibe: new tab, no opener, the arrow, and a label that says it opens a new tab. */
export function OutLink({
  href,
  children,
  className,
  label,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  label?: string;
}): ReactElement {
  const safe = httpsHref(href);
  // A refused address draws plain words: no link colour, no focus ring,
  // nothing that looks like it can be tapped.
  if (!safe) return <span>{children}</span>;
  const classes = ["tonight-link", "tonight-focus", className].filter(Boolean).join(" ");
  const name = label ?? textOf(children);
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className={classes}
      aria-label={name ? `${name}, opens in a new tab` : undefined}
    >
      {children}
      {name ? null : <span className="tonight-sr-only"> (opens in a new tab)</span>}
      <IconOut />
    </a>
  );
}

/**
 * "Tickets ↗" and "Watch on ESPN+ ↗" when the feed listed them; null when
 * neither is a safe https link (an action that can't work isn't drawn).
 * Each spoken name starts with the words on screen, so a voice-control user
 * can say "click Watch on ESPN+" (WCAG 2.5.3, Label in Name).
 */
export function LeadLinks({ ev }: { ev: SchoolEvent }): ReactElement | null {
  const tickets = httpsHref(ev.tickets_url);
  const watch = httpsHref(ev.watch_url);
  if (!tickets && !watch) return null;
  return (
    <>
      {tickets ? (
        <OutLink href={tickets} label={`${TONIGHT_COPY.tickets} for ${ev.title}`}>
          {TONIGHT_COPY.tickets}
        </OutLink>
      ) : null}
      {watch ? (
        <OutLink href={watch} label={`${TONIGHT_COPY.watch}: ${ev.title}`}>
          {TONIGHT_COPY.watch}
        </OutLink>
      ) : null}
    </>
  );
}

/** "School events: From the IU Indy athletics calendar ↗ · …", each credit linked to its calendar. */
export function CreditLine({ sources }: { sources: SchoolSource[] }): ReactElement | null {
  if (sources.length === 0) return null;
  return (
    <p className="tonight-credit">
      {TONIGHT_COPY.creditLead}{" "}
      {sources.map((s, i) => (
        <Fragment key={s.key}>
          {i > 0 ? " · " : null}
          <OutLink href={s.calendar_url} className="tonight-credit-link">
            {s.credit}
          </OutLink>
        </Fragment>
      ))}
    </p>
  );
}

// ── Club marks ────────────────────────────────────────────────────────────

/**
 * A logo URL as a CSS `url("…")`, or null. Club logos are same-origin proxy
 * paths (orgAssetProxyUrl); anything that isn't a same-origin path or an
 * https URL is dropped (plain http would be mixed content on the live site
 * and never load), and quotes and backslashes are escaped so the value
 * can't break out of the declaration.
 */
function cssUrl(raw: string | null): string | null {
  if (!raw) return null;
  const u = raw.trim();
  const ok = (u.startsWith("/") && !u.startsWith("//")) || /^https:\/\//i.test(u);
  if (!ok) return null;
  return `url("${u.replace(/[\n\r\f]/g, "").replace(/["\\]/g, (c) => `\\${c}`)}")`;
}

/**
 * A club's square mark: its logo, else its colour tile with white initials
 * (the post cards' look). The colour tile also sits UNDER a logo, so a logo
 * that fails to load (deleted, a proxy 404) leaves the club's colour, not an
 * empty gap, and a see-through logo sits on its own colour on both themes.
 */
export function ClubMark({
  org,
  size,
  radius,
}: {
  org: { id: string; name: string; logo_url: string | null } | null;
  size: number;
  radius: number;
}): ReactElement {
  const logo = cssUrl(org?.logo_url ?? null);
  const style: CSSProperties = { width: size, height: size, borderRadius: radius };
  if (logo && org) {
    style.background = `${logo} center / cover no-repeat, ${orgMarkBackground(org.id)}`;
  } else if (org) {
    style.background = orgMarkBackground(org.id);
    style.fontSize = Math.max(10, Math.round(size * 0.34));
  } else {
    style.background = "rgba(var(--scrim-rgb), 0.10)";
  }
  return (
    <span className="tonight-mark" style={style} aria-hidden="true">
      {!logo && org ? initialsForOrg(org.name) : null}
    </span>
  );
}

/** The 12px colour square beside a club's name on a row (neutral grey with no club). */
export function ClubSwatch({ orgId }: { orgId: string | null }): ReactElement {
  return (
    <span
      className="tonight-swatch"
      style={{ background: orgId ? colorForOrg(orgId) : "var(--ink-muted)" }}
      aria-hidden="true"
    />
  );
}

/** The Events header's open orbit (D2): a coral ring with its dot, softer in Light. */
export function OrbitMark({ size = 28 }: { size?: number }): ReactElement {
  return (
    <svg className="tonight-orbit" width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <path className="tonight-orbit-ring" d="M47.87 50 A24 24 0 1 1 54.44 40.5" strokeWidth={3} strokeLinecap="round" />
      <circle className="tonight-orbit-dot" cx={51.17} cy={45.23} r={5} />
    </svg>
  );
}

// ── Icons (the boards' stroke icons on a 16 grid, currentColor) ───────────

function Icon({ size, strokeWidth, children }: { size: number; strokeWidth: number; children: ReactNode }): ReactElement {
  return (
    <svg
      className="tonight-icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconClock({ size = 14 }: { size?: number }): ReactElement {
  return (
    <Icon size={size} strokeWidth={1.4}>
      <circle cx={8} cy={8} r={6.2} />
      <path d="M8 4.6V8l2.4 1.6" />
    </Icon>
  );
}

export function IconPin({ size = 14 }: { size?: number }): ReactElement {
  return (
    <Icon size={size} strokeWidth={1.4}>
      <path d="M8 14.5s-4.8-4.3-4.8-8A4.8 4.8 0 0 1 12.8 6.5c0 3.7-4.8 8-4.8 8z" />
      <circle cx={8} cy={6.5} r={1.7} />
    </Icon>
  );
}

export function IconChevron({ size = 12 }: { size?: number }): ReactElement {
  return (
    <Icon size={size} strokeWidth={1.8}>
      <path d="M6 3.5L10.5 8 6 12.5" />
    </Icon>
  );
}

/** The "opens elsewhere" arrow (the boards' 12-grid arrow, scaled to 16). */
export function IconOut({ size = 11 }: { size?: number }): ReactElement {
  return (
    <Icon size={size} strokeWidth={2}>
      <path d="M5.33 3.33h7.34v7.34M12.67 3.33L3.33 12.67" />
    </Icon>
  );
}

/** The "why" mark before the rule line (the boards' 14-grid info icon, scaled to 16). */
export function IconInfo({ size = 13 }: { size?: number }): ReactElement {
  return (
    <Icon size={size} strokeWidth={1.5}>
      <circle cx={8} cy={8} r={6.4} />
      <path d="M8 7.2v3.9" />
      <circle cx={8} cy={5.03} r={0.91} fill="currentColor" stroke="none" />
    </Icon>
  );
}

// ── Loading ───────────────────────────────────────────────────────────────

const SKELETON_WIDTHS = ["78%", "64%", "71%"];

/** Static blocks (no shimmer: nothing moves while it waits), announced once as "Loading tonight". */
export function TonightSkeleton({ rows = 3 }: { rows?: number }): ReactElement {
  const count = Math.max(1, Math.min(8, Math.trunc(rows)));
  return (
    <div className="tonight-skeleton" role="status" aria-busy="true">
      <span className="tonight-sr-only">Loading tonight</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="tonight-skel-row" aria-hidden="true">
          <span className="tonight-skel" style={{ width: SKELETON_WIDTHS[i % SKELETON_WIDTHS.length], height: 12 }} />
          <span className="tonight-skel" style={{ width: "42%", height: 10 }} />
        </div>
      ))}
    </div>
  );
}
