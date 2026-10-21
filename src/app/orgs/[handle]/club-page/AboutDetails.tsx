import type { ReactNode } from "react";

import { openToFact, whoCanJoinFact } from "@/lib/orgs/join-copy";

import type { ClubPageOrg } from "./types";

/**
 * What "More about us" holds (the club's view, wave 2, C9 item 3), server
 * rendered and handed to the sheet as children: every link, philanthropy,
 * and the club's facts. These were the old About column's cards. Theme
 * tokens: the sheet carries `vibe-night-island`, so they read dark.
 */
export function AboutDetails({ org }: { org: ClubPageOrg }) {
  const links = org.links ?? [];
  return (
    <>
      {links.length > 0 ? (
        <AboutBlock title="Links">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  minHeight: 44,
                  minWidth: 0,
                  boxSizing: "border-box",
                  padding: "8px 12px",
                  borderRadius: 12,
                  background: "rgba(var(--scrim-rgb),0.04)",
                  border: "1px solid var(--hairline)",
                  color: "var(--charcoal)",
                  textDecoration: "none",
                  fontSize: 13.5,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflowWrap: "anywhere" }}>{l.label}</span>
                <span aria-hidden style={{ color: "var(--ink-muted)", fontSize: 12, flexShrink: 0 }}>
                  ↗
                </span>
              </a>
            ))}
          </div>
        </AboutBlock>
      ) : null}
      {org.philanthropy ? (
        <AboutBlock title="Philanthropy">
          <p
            style={{
              margin: 0,
              fontSize: 13.5,
              lineHeight: 1.55,
              color: "var(--ink-body)",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {org.philanthropy}
          </p>
        </AboutBlock>
      ) : null}
      <AboutBlock title="About">
        <Facts org={org} />
      </AboutBlock>
    </>
  );
}

function Facts({ org }: { org: ClubPageOrg }) {
  // `follower_count` already carries this viewer's floor (`headerCount`):
  // no 'Followers' row below 5 unless they run the club (critic C13).
  const whoCanJoin = whoCanJoinFact(org.join_policy);
  const openTo = openToFact(org.audience);
  return (
    <div>
      {org.follower_count !== null ? <Fact label="Followers" value={String(org.follower_count)} /> : null}
      {org.member_count !== null ? <Fact label="Members" value={String(org.member_count)} /> : null}
      {whoCanJoin ? <Fact label="Who can join" value={whoCanJoin} /> : null}
      {openTo ? <Fact label="Open to" value={openTo} /> : null}
      <Fact label="Status" value={org.verified ? "Verified" : org.dormant ? "Dormant" : "Community"} />
      <Fact label="Last activity" value={org.last_activity_at ? fmtDate(org.last_activity_at) : "—"} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
        padding: "9px 0",
        borderBottom: "1px solid var(--hairline)",
        fontSize: 13,
        minWidth: 0,
      }}
    >
      <span style={{ color: "var(--ink-muted)", flexShrink: 0 }}>{label}</span>
      <span style={{ color: "var(--charcoal)", textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>
        {value}
      </span>
    </div>
  );
}

function AboutBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div
        style={{
          marginBottom: 8,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--ink-muted)",
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

/** "Oct 21, 2026" (the page's dates, formatted on the server). */
export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}
