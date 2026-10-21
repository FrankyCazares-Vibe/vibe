import type { CSSProperties, ReactNode } from "react";

import { ORG_COPY, audienceChip, policyChip } from "@/lib/orgs/join-copy";
import type { JoinPolicy } from "@/lib/orgs/join-state";

import type { ClubPageOrg } from "./types";

/**
 * The top of the club page (the club's view, wave 2, C9 items 2 and 3),
 * Instagram-style: the cover, the logo over its lower edge with the two
 * counts beside it, the name, @handle and chips, the bio, the first link,
 * and a chip row (who can join, when it meets, More about us). Server
 * rendered; the interactive bits (⋯ menu, switch chevron, More about us,
 * the cover's officer buttons) are handed in as nodes.
 */

/** The cover (Banner as before: the club's 3:1 crop, or a soft gradient). */
export function ClubCover({ org, children }: { org: ClubPageOrg; children?: ReactNode }) {
  return (
    <div
      className="vibe-club-cover"
      style={{
        background: org.banner_url
          ? `url(${org.banner_url}) center/cover`
          : "linear-gradient(135deg, rgba(var(--scrim-rgb),0.12) 0%, rgba(var(--scrim-rgb),0.04) 100%)",
        border: "1px solid rgba(var(--scrim-rgb),0.1)",
        boxShadow: "inset 0 1px 0 rgba(var(--scrim-rgb),0.18), 0 12px 40px rgba(0,0,0,0.4)",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      {children ? (
        <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 8, zIndex: 1 }}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** 'Open · anyone can join', 'By request · officers approve requests'… in
 *  the shared join copy's words (`policyChip` and the settings options). */
export function joinChipText(policy: JoinPolicy): string | null {
  const head = policyChip(policy);
  if (!head) return null;
  const option = ORG_COPY.whoCanJoinOptions[policy];
  const tail = policy === "open" ? option.label : option.sub;
  return `${head} · ${tail.charAt(0).toLowerCase()}${tail.slice(1)}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

function Count({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 800,
          lineHeight: 1.1,
          color: "var(--charcoal)",
        }}
      >
        {n.toLocaleString("en-US")}
      </span>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-muted)",
        }}
      >
        {n === 1 ? one : many}
      </span>
    </div>
  );
}

function ChipPill({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 30,
        maxWidth: "100%",
        boxSizing: "border-box",
        padding: "5px 12px",
        borderRadius: 999,
        border: "1px solid rgba(var(--scrim-rgb),0.18)",
        background: "rgba(var(--scrim-rgb),0.04)",
        color: "var(--ink-2)",
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: 1.3,
        overflowWrap: "anywhere",
      }}
    >
      {icon}
      <span style={{ minWidth: 0 }}>{children}</span>
    </span>
  );
}

/**
 * The header. `menu` is the ⋯ OrgMenu (end of the name row, as before),
 * `switcher` the officers' chevron after the name (phones only), and
 * `moreAboutUs` the More about us button, which closes the chip row.
 */
export function ClubHeader({
  org,
  invited,
  menu,
  switcher,
  moreAboutUs,
}: {
  org: ClubPageOrg;
  /** The viewer has a live invite: the "Invited you" chip. */
  invited: boolean;
  menu?: ReactNode;
  switcher?: ReactNode;
  moreAboutUs?: ReactNode;
}) {
  const audience = audienceChip(org.audience);
  const joinChip = joinChipText(org.join_policy);
  const firstLink = org.links?.[0] ?? null;
  return (
    <header style={{ minWidth: 0 }}>
      <div className="vibe-club-id">
        <div
          className="vibe-club-logo"
          style={{
            background: org.logo_url
              ? `url(${org.logo_url}) center/cover`
              : "linear-gradient(135deg, #FF5C35 0%, #7B5FE0 100%)",
            border: "1px solid rgba(var(--scrim-rgb),0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontWeight: 900,
            fontSize: 30,
            color: "var(--charcoal)",
            boxShadow: "0 0 0 3px rgba(0,0,0,0.35), 0 12px 32px rgba(0,0,0,0.45)",
          }}
        >
          {!org.logo_url ? initials(org.name) : null}
        </div>
        {/* A count that is null (unknown, or under 5 for this viewer) is
            left out, never shown as 0. */}
        <div className="vibe-club-counts">
          {org.follower_count !== null ? <Count n={org.follower_count} one="Follower" many="Followers" /> : null}
          {org.member_count !== null ? <Count n={org.member_count} one="Member" many="Members" /> : null}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, minWidth: 0 }}>
        <h1
          style={{
            margin: 0,
            flex: "0 1 auto",
            minWidth: 0,
            fontFamily: "var(--font-display)",
            fontSize: "clamp(24px, 6.4vw, 34px)",
            fontWeight: 900,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            color: "var(--charcoal)",
            overflowWrap: "anywhere",
          }}
        >
          {org.name}
        </h1>
        {switcher}
        <span style={{ flex: 1 }} />
        {menu}
      </div>

      {/* @handle, Verified, and the chips that say something about this
          club or this viewer: audience, Hidden, Invited you, Dormant. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6, minWidth: 0 }}>
        <span
          style={{
            fontSize: 13.5,
            color: "var(--ink-muted)",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          @{org.handle}
        </span>
        {org.verified ? <VerifiedBadge /> : null}
        {audience ? <Chip color="#FFC48A">{audience}</Chip> : null}
        {org.hidden ? <Chip color="#C9C9D6">{ORG_COPY.meta.hidden}</Chip> : null}
        {invited ? <Chip color="#FF8A66">{ORG_COPY.chips.invitedYou}</Chip> : null}
        {org.dormant ? <Chip color="#E84D4D">Dormant</Chip> : null}
      </div>

      {org.description ? (
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 15,
            lineHeight: 1.5,
            color: "var(--ink-body)",
            whiteSpace: "pre-line",
            overflowWrap: "anywhere",
          }}
        >
          {org.description}
        </p>
      ) : null}

      {firstLink ? (
        <a
          href={firstLink.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minHeight: 44,
            maxWidth: "100%",
            color: "var(--charcoal)",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
            overflowWrap: "anywhere",
          }}
        >
          <LinkGlyph />
          <span style={{ minWidth: 0, textDecoration: "underline", textUnderlineOffset: 3, textDecorationColor: "var(--hairline)" }}>
            {firstLink.label}
          </span>
        </a>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: firstLink ? 2 : 12 }}>
        {joinChip ? (
          <ChipPill icon={org.join_policy === "open" ? null : <LockGlyph size={10} />}>{joinChip}</ChipPill>
        ) : null}
        {/* The club's own words, so a clock marks them as when it meets and
            they can't pass for one of the page's own chips ("Anyone can
            join", "Verified"): security pass L2. */}
        {org.meeting_time ? (
          <ChipPill icon={<ClockGlyph />}>
            <span style={visuallyHidden}>Meets </span>
            {org.meeting_time}
          </ChipPill>
        ) : null}
        {moreAboutUs}
      </div>
    </header>
  );
}

/** The club page's own chip colours, unchanged from the old header. */
export function VerifiedBadge() {
  return (
    <span
      title="Verified by Vibe"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#FFE8A8",
        background: "rgba(240,200,74,0.18)",
        border: "1px solid rgba(240,200,74,0.45)",
        flexShrink: 0,
      }}
    >
      <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
        <path
          fill="currentColor"
          d="M8 .5l1.7 1.7L12 1.5l.5 2.3 2.3.5-.7 2.3 1.7 1.7-1.7 1.7.7 2.3-2.3.5-.5 2.3-2.3-.7L8 15.5l-1.7-1.7-2.3.7-.5-2.3-2.3-.5.7-2.3L.2 8l1.7-1.7-.7-2.3 2.3-.5.5-2.3L6.3 2.2 8 .5zm-.6 9.7 4-4-1-1L7.5 8 6 6.5l-1 1L7.5 10z"
        />
      </svg>
      Verified
    </span>
  );
}

function Chip({ color, children }: { color: string; children: ReactNode }) {
  const tint = color
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((c) => parseInt(c, 16))
    .join(",");
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        background: `rgba(${tint},0.18)`,
        border: `1px solid rgba(${tint},0.4)`,
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

function ClockGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.5V8l2.4 1.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** The padlock the join chip and the join-policy notice share. */
export function LockGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path
        fill="currentColor"
        d="M8 1a3 3 0 0 0-3 3v2H4.25A1.25 1.25 0 0 0 3 7.25v6.5C3 14.44 3.56 15 4.25 15h7.5c.69 0 1.25-.56 1.25-1.25v-6.5C13 6.56 12.44 6 11.75 6H11V4a3 3 0 0 0-3-3zm0 1.5A1.5 1.5 0 0 1 9.5 4v2h-3V4A1.5 1.5 0 0 1 8 2.5z"
      />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden style={{ flexShrink: 0, color: "var(--ink-muted)" }}>
      <path
        d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.5 2.5 0 0 1 3.5 3.5L10.5 8M9 11.5l-1.2 1.2a2.5 2.5 0 0 1-3.5-3.5L5.5 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
