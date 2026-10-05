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

// What an inline style cannot say: a rule for a narrow screen, and spacing
// that depends on what an element sits inside. Everything else in this file
// stays inline. The classes carry the app's `vibe-` prefix. Only the pieces
// that need the sheet render it (LegalStyles), so a legal page that uses none
// of them is served exactly as before.
//
// Marked lists. The app's CSS reset strips list markers, so a bare <ul> or
// <ol> shows neither bullets nor numbers; these put them back. The items are
// in plain block flow so that their margins collapse: the gap around an item
// is 6px whether it holds a line of text, a paragraph or a nested list, and
// nothing adds up at the end of an item. LegalP sets its own margin inline,
// which is why the paragraph rule needs its !important. A bulleted list
// inside a bulleted list gets hollow bullets.
//
// Tables. Two columns from 480px up. Under that each row stacks: the left
// cell as a bold line, the right cell under it, so a long cell gets the full
// width of a phone and nothing scrolls sideways.
const LEGAL_CSS = `
.vibe-legal-list { margin: 0 0 12px; padding-left: 22px; }
ul.vibe-legal-list { list-style-type: disc; }
ol.vibe-legal-list { list-style-type: decimal; }
ul.vibe-legal-list ul.vibe-legal-list { list-style-type: circle; }
.vibe-legal-list > li + li { margin-top: 6px; }
.vibe-legal-list > li > .vibe-legal-list { margin: 6px 0; }
.vibe-legal-list > li > p { margin: 6px 0 !important; }

.vibe-legal-table th, .vibe-legal-table td { padding: 10px 12px; min-width: 136px; text-align: left; vertical-align: top; }
.vibe-legal-table th:first-child, .vibe-legal-table td:first-child { min-width: 124px; }
.vibe-legal-table th { font-weight: 700; color: var(--charcoal); }
.vibe-legal-table thead tr { background: var(--row-hover); }
.vibe-legal-table td { border-top: 1px solid var(--hairline); }
@media (max-width: 479.98px) {
  .vibe-legal-table, .vibe-legal-table thead, .vibe-legal-table tbody,
  .vibe-legal-table tr, .vibe-legal-table th, .vibe-legal-table td { display: block; }
  .vibe-legal-table tr { padding: 10px 12px; }
  .vibe-legal-table tbody tr { border-top: 1px solid var(--hairline); }
  .vibe-legal-table th, .vibe-legal-table td { padding: 0; min-width: 0; border-top: 0; }
  .vibe-legal-table th + th { font-weight: 400; color: inherit; }
  .vibe-legal-table td:first-child { margin-bottom: 2px; font-weight: 700; color: var(--charcoal); }
}
`;

const LIST_CLASS = "vibe-legal-list";
const TABLE_CLASS = "vibe-legal-table";

// React lifts a <style> that has `href` and `precedence` into <head> and
// keeps one copy however many lists and tables a page holds.
function LegalStyles() {
  return (
    <style href="vibe-legal" precedence="vibe-legal">
      {LEGAL_CSS}
    </style>
  );
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
 *  before it keep rendering as they do today (no markers: see LEGAL_CSS).
 *
 *  With `bullets`, an `<li>` can hold more than one line of text. Write the
 *  item's first words straight in the `<li>`, then any `<LegalP>`,
 *  `<LegalUL bullets>` or `<LegalOL>` after them: they stay indented under
 *  the item and the list sets their spacing. */
export function LegalUL({
  children,
  bullets = false,
}: {
  children: ReactNode;
  bullets?: boolean;
}) {
  if (!bullets) {
    return <ul style={{ margin: "0 0 12px", paddingLeft: 22 }}>{children}</ul>;
  }
  return (
    <>
      <LegalStyles />
      <ul className={LIST_CLASS}>{children}</ul>
    </>
  );
}

/** A numbered list. The numbers always show: steps get referred to by number
 *  ("if step 1 or 2 fails"). An `<li>` can hold a paragraph or a nested list
 *  after its first words, the same way as in `<LegalUL bullets>`. */
export function LegalOL({ children }: { children: ReactNode }) {
  return (
    <>
      <LegalStyles />
      <ol className={LIST_CLASS}>{children}</ol>
    </>
  );
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

/** "Start here": a plain block (no box) for the reader who came with one
 *  question. It draws its own h2, then one ruled row per item: the question
 *  on the left and where the answer is on the right, or under the question
 *  when a phone has no room beside it. `note` is one closing paragraph under
 *  the rows ("Two words to know"). `id` goes on the heading. */
export function LegalStartHere({
  title,
  id,
  items,
  note,
}: {
  title: ReactNode;
  id?: string;
  items: { question: ReactNode; answer: ReactNode }[];
  note?: ReactNode;
}) {
  return (
    <section style={{ margin: "28px 0 24px" }}>
      <h2
        id={id}
        style={{
          ...H2_STYLE,
          margin: "0 0 10px",
          scrollMarginTop: id ? ANCHOR_OFFSET : undefined,
        }}
      >
        {title}
      </h2>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        {items.map((item, index) => (
          <li
            key={index}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: "0 20px",
              padding: "8px 0",
              borderTop: "1px solid var(--hairline)",
            }}
          >
            <span>{item.question}</span>
            {/* The auto margin keeps the answers in one column down the
                right edge, on the question's line or on the line under it. */}
            <span
              style={{
                marginLeft: "auto",
                fontWeight: 600,
                color: "var(--ink-2)",
                whiteSpace: "nowrap",
              }}
            >
              {item.answer}
            </span>
          </li>
        ))}
      </ul>
      {note ? <p style={{ margin: "14px 0 0" }}>{note}</p> : null}
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

/** A small table: `head` is the header row, `rows` the body, first column
 *  first. A cell is text or any node (a link, a `<strong>`).
 *
 *  From 480px up it is a table with columns. Under 480px each row stacks: the
 *  first cell as a bold line, the other cells under it, and the header row
 *  the same way, so it reads as the key to the rows below. Nothing scrolls
 *  sideways on a phone, however long a cell is. The cells' look is in
 *  LEGAL_CSS, because it changes with the width. */
export function LegalTable({
  head,
  rows,
}: {
  head: ReactNode[];
  rows: ReactNode[][];
}) {
  // A two-column table always fits from 480px up (its columns need 124px and
  // 136px, padding included). A wider one may not, so its box scrolls
  // sideways by itself and takes keyboard focus so that the arrow keys can
  // scroll it.
  const mayScroll = head.length > 2;
  return (
    <div
      tabIndex={mayScroll ? 0 : undefined}
      style={{
        margin: "0 0 14px",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        background: "var(--paper-62)",
        border: "1px solid var(--hairline)",
        borderRadius: 12,
      }}
    >
      <LegalStyles />
      {/* The roles say what the tags already say. They are spelled out
          because a stacked row is `display: block`, and some browsers stop
          announcing a table as one once its parts are blocks. */}
      <table
        role="table"
        className={TABLE_CLASS}
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 14,
          lineHeight: 1.55,
        }}
      >
        <thead role="rowgroup">
          <tr role="row">
            {head.map((cell, column) => (
              <th key={column} role="columnheader" scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row, index) => (
            <tr key={index} role="row">
              {row.map((cell, column) => (
                <td key={column} role="cell">
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
