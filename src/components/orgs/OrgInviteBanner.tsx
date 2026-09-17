import type { JSX } from "react";

import { ORG_COPY, fillCopy, inviteSubText } from "@/lib/orgs/join-copy";

/**
 * "You're invited to join {org}" above the org page's description (wave plan
 * §6 F5a D). No buttons on purpose: the header right above it already carries
 * Accept invite and Decline, and two sets of the same buttons on one screen
 * would each need their own busy state.
 *
 * The inviter's first name comes from `visibleInviterFirstName`, so a null
 * here (a deleted account, or somebody this viewer blocked or muted, critic
 * A7) reads "Invited by an officer".
 *
 * Styled like the message request bar in `MessagesMobile.tsx`, on the org
 * page's dark glass. No hooks, so a server component can render it.
 */
export function OrgInviteBanner({
  orgName,
  inviterFirstName,
  expiresAt,
}: {
  orgName: string;
  inviterFirstName: string | null;
  expiresAt: string;
}): JSX.Element {
  const title = fillCopy(ORG_COPY.banner.title, { org: orgName.trim() || "this org" });
  // Pinned to campus time: a server render on Vercel runs in UTC, which moves
  // an evening expiry to the next day.
  const sub = inviteSubText(inviterFirstName, expiresAt, "America/Indiana/Indianapolis");

  return (
    <section
      aria-label={title}
      style={{
        padding: "12px 16px",
        borderRadius: 14,
        background: "rgba(255,92,53,0.12)",
        border: "1px solid rgba(255,92,53,0.32)",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 1.4,
          color: "#fff",
          overflowWrap: "anywhere",
        }}
      >
        {title}
      </p>
      {sub ? (
        <p
          style={{
            margin: "2px 0 0",
            fontSize: 13,
            lineHeight: 1.45,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          {sub}
        </p>
      ) : null}
    </section>
  );
}
