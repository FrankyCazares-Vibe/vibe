import Link from "next/link";

import { Arrow } from "@/components/brand/Arrow";

/**
 * The officers' two lines under the buttons and the desktop Club tools card
 * (the club's view, wave 2, C9 items 5 and 9). Server rendered, theme
 * tokens, owner and officers only (the page decides). Every row is a link
 * to the club's tools pages (C10).
 */

/**
 * "2 want to join · +6 followers this week" (`needsYouText`, C7), with a
 * coral dot: to Join requests when someone is waiting, else to Followers.
 * The page renders nothing when the text is null.
 */
export function NeedsYouLine({ handle, text, requests }: { handle: string; text: string; requests: number }) {
  const base = `/orgs/${encodeURIComponent(handle)}/tools`;
  return (
    <Link
      href={requests > 0 ? `${base}/requests` : `${base}/followers`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        minHeight: 44,
        marginTop: 10,
        padding: "0 14px",
        borderRadius: 14,
        border: "1px dashed rgba(var(--scrim-rgb),0.22)",
        color: "var(--charcoal)",
        textDecoration: "none",
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: "var(--coral)", flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{text}</span>
      <Arrow direction="right" />
    </Link>
  );
}

/** The desktop right column's card: the tools index's rows, as links. */
export function ClubToolsCard({
  handle,
  requests,
  members,
  followers,
}: {
  handle: string;
  /** Null when unknown (a failed read): the row shows no number. */
  requests: number | null;
  members: number | null;
  followers: number | null;
}) {
  const h = encodeURIComponent(handle);
  const base = `/orgs/${h}/tools`;
  const rows: Array<{ label: string; href: string; count?: number | null }> = [
    { label: "Join requests", href: `${base}/requests`, count: requests },
    { label: "Members", href: `${base}/members`, count: members },
    { label: "Followers", href: `${base}/followers`, count: followers },
    { label: "Officers and titles", href: `${base}/officers` },
    { label: "Past events and who came", href: `/orgs/${h}?tab=events` },
    { label: "Club settings", href: `${base}/settings` },
  ];
  return (
    <section
      aria-labelledby="club-tools-card-title"
      style={{
        borderRadius: 18,
        border: "1px solid var(--hairline)",
        background: "var(--glass-70)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "14px 16px 10px" }}>
        <h2
          id="club-tools-card-title"
          style={{
            margin: 0,
            flex: 1,
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontWeight: 800,
            color: "var(--charcoal)",
          }}
        >
          <Link href={base} style={{ color: "inherit", textDecoration: "none" }}>
            Club tools
          </Link>
        </h2>
        <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Only officers</span>
      </div>
      {rows.map((r) => (
        <Link
          key={r.label}
          href={r.href}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minHeight: 46,
            padding: "0 16px",
            borderTop: "1px solid var(--hairline)",
            color: "var(--charcoal)",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>{r.label}</span>
          {typeof r.count === "number" ? (
            <span style={{ color: "var(--ink-muted)", fontSize: 13 }}>{r.count.toLocaleString("en-US")}</span>
          ) : null}
          <span aria-hidden style={{ color: "var(--ink-muted)", display: "inline-flex" }}>
            <Arrow direction="right" />
          </span>
        </Link>
      ))}
    </section>
  );
}
