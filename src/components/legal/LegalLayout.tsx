import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { LegalBackLink } from "@/components/legal/LegalBackLink";

// The warm cream wash in Light, a coral bloom on Night paper (globals.css).
const PAGE_BG = "var(--warm-backdrop)";

const LEGAL_LINK: CSSProperties = {
  color: "var(--ink-2)",
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

export function LegalLayout({
  eyebrow,
  title,
  effectiveDate,
  children,
}: {
  eyebrow: string;
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: PAGE_BG,
        padding: "48px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <p style={{ marginBottom: 24 }}>
          {/* Client island: "/" in a tab, /campus in the installed app. */}
          <LegalBackLink />
        </p>
        <header style={{ marginBottom: 28 }}>
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--eyebrow-ink)",
              marginBottom: 6,
            }}
          >
            {eyebrow}
          </div>
          <h1
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: "clamp(30px, 4vw, 42px)",
              fontWeight: 900,
              color: "var(--charcoal)",
              letterSpacing: "-0.02em",
              margin: "0 0 6px",
              lineHeight: 1.1,
            }}
          >
            {title}
          </h1>
          <div
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              color: "var(--ink-muted)",
            }}
          >
            Effective {effectiveDate}
          </div>
        </header>
        <article
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 15,
            lineHeight: 1.7,
            color: "var(--ink-prose)",
          }}
        >
          {children}
        </article>
        {/* Six links now, not three. A row of `·` spacers inside a <p>
            orphans a separator at the start of a wrapped line on a 375px
            phone, so the spacing is the layout's job: a flex-wrap row with
            real gaps, no separator characters to strand. */}
        <nav
          aria-label="Legal and safety"
          style={{
            marginTop: 40,
            display: "flex",
            flexWrap: "wrap",
            gap: "10px 24px",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            color: "var(--ink-muted)",
          }}
        >
          <Link href="/legal/terms" style={LEGAL_LINK}>
            Terms of Service
          </Link>
          <Link href="/legal/privacy" style={LEGAL_LINK}>
            Privacy Policy
          </Link>
          <Link href="/legal/community" style={LEGAL_LINK}>
            Community Guidelines
          </Link>
          <Link href="/legal/child-safety" style={LEGAL_LINK}>
            Child Safety
          </Link>
          {/* The published takedown process for an intimate image shared
              without consent (TAKE IT DOWN Act; security report #4). */}
          <Link href="/legal/community#intimate-images" style={LEGAL_LINK}>
            Intimate image removal
          </Link>
          <a href="mailto:hello@connectvibe.app" style={LEGAL_LINK}>
            Contact
          </a>
        </nav>
      </div>
    </main>
  );
}

// How far below the top edge a jumped-to heading lands (#section-3). The same
// 24px the community page gives its #intimate-images section.
const ANCHOR_OFFSET = 24;

const H2_STYLE: CSSProperties = {
  fontFamily: "Fraunces, serif",
  fontSize: 22,
  fontWeight: 800,
  color: "var(--charcoal)",
  letterSpacing: "-0.01em",
  margin: "32px 0 10px",
};

// A list with its markers back and a little air between items. The app's CSS
// reset strips list markers, so a bare <ul> or <ol> shows neither bullets nor
// numbers; the one-column grid is only there for the row gap.
function markedList(listStyleType: "disc" | "decimal"): CSSProperties {
  return {
    margin: "0 0 12px",
    paddingLeft: 22,
    listStyleType,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    rowGap: 6,
  };
}

/** `id` makes the heading a link target (`/legal/privacy#section-3`). Without
 *  one the heading renders exactly as it always has. */
export function LegalH2({
  children,
  id,
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <h2
      id={id}
      style={id ? { ...H2_STYLE, scrollMarginTop: ANCHOR_OFFSET } : H2_STYLE}
    >
      {children}
    </h2>
  );
}

export function LegalH3({
  children,
  id,
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <h3
      id={id}
      style={{
        fontFamily: "Fraunces, serif",
        fontSize: 17,
        fontWeight: 800,
        color: "var(--charcoal)",
        letterSpacing: "-0.005em",
        margin: "22px 0 8px",
        scrollMarginTop: id ? ANCHOR_OFFSET : undefined,
      }}
    >
      {children}
    </h3>
  );
}

export function LegalP({ children }: { children: ReactNode }) {
  return <p style={{ margin: "0 0 12px" }}>{children}</p>;
}

/** `bullets` shows the bullet points. It is opt-in so the pages written
 *  before it keep rendering as they do today (no markers: see markedList). */
export function LegalUL({
  children,
  bullets = false,
}: {
  children: ReactNode;
  bullets?: boolean;
}) {
  const style = bullets
    ? markedList("disc")
    : { margin: "0 0 12px", paddingLeft: 22 };
  return <ul style={style}>{children}</ul>;
}

/** A numbered list. The numbers always show: steps get referred to by number
 *  ("if step 1 or 2 fails"). */
export function LegalOL({ children }: { children: ReactNode }) {
  return <ol style={markedList("decimal")}>{children}</ol>;
}

const CALLOUT_PAD_TOP = 18;

/** The boxed summary at the top of a long page ("The short version"). The
 *  box draws its own h2 so the heading sits tight in the box; `id` goes on
 *  that heading, and a jump to it shows the top of the box as well. */
export function LegalCallout({
  title,
  id,
  children,
}: {
  title: ReactNode;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        margin: "24px 0 20px",
        padding: `${CALLOUT_PAD_TOP}px 18px 8px`,
        background: "var(--paper-62)",
        border: "1px solid var(--hairline)",
        borderLeft: "3px solid var(--coral)",
        borderRadius: 14,
      }}
    >
      <h2
        id={id}
        style={{
          ...H2_STYLE,
          margin: "0 0 10px",
          scrollMarginTop: id ? ANCHOR_OFFSET + CALLOUT_PAD_TOP : undefined,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/** "On this page": jump links to a long page's sections. Two columns where
 *  there is room, one on a phone. */
export function LegalToc({
  items,
}: {
  items: { href: string; label: ReactNode }[];
}) {
  return (
    <nav aria-label="On this page" style={{ margin: "0 0 8px" }}>
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--eyebrow-ink)",
          marginBottom: 6,
        }}
      >
        On this page
      </div>
      <ol
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          columns: "2 260px",
          columnGap: 28,
          fontSize: 14,
          lineHeight: 1.45,
        }}
      >
        {items.map((item) => (
          <li key={item.href} style={{ breakInside: "avoid" }}>
            <a
              href={item.href}
              style={{
                display: "block",
                padding: "5px 0",
                color: "var(--ink-2)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

const TABLE_CELL: CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  verticalAlign: "top",
};

/** A small table: `head` is the header row, `rows` the body, first column
 *  first. The box scrolls sideways by itself when a phone cannot fit the
 *  columns' minimum widths, so the page never does. tabIndex lets a keyboard
 *  scroll the box. */
export function LegalTable({
  head,
  rows,
}: {
  head: ReactNode[];
  rows: ReactNode[][];
}) {
  // Border-box widths (the app's reset), so the padding is inside them. Sized
  // so the Privacy Policy's two-column tables fit a 375px phone without
  // scrolling, the one with an email address in its first column included.
  const minWidth = (column: number) => (column === 0 ? 124 : 136);
  return (
    <div
      tabIndex={0}
      style={{
        margin: "0 0 14px",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        background: "var(--paper-62)",
        border: "1px solid var(--hairline)",
        borderRadius: 12,
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 14,
          lineHeight: 1.55,
        }}
      >
        <thead>
          <tr>
            {head.map((cell, column) => (
              <th
                key={column}
                scope="col"
                style={{
                  ...TABLE_CELL,
                  minWidth: minWidth(column),
                  fontWeight: 700,
                  color: "var(--charcoal)",
                  background: "var(--row-hover)",
                }}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, column) => (
                <td
                  key={column}
                  style={{
                    ...TABLE_CELL,
                    minWidth: minWidth(column),
                    borderTop: "1px solid var(--hairline)",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
