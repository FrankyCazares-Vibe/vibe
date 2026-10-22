"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties, JSX } from "react";

import { OrgControlButton, PILL, useOrgControl, type Palette } from "@/components/orgs/OrgJoinControl";
import { ORG_COPY, membershipBoxView, type OrgRelation } from "@/lib/orgs/join-copy";

/**
 * The club page's Membership box (Franky, Oct 22, 2026: "I don't want people
 * to confuse following for request to join"). It sits under the Follow /
 * Share row for anyone who isn't a member: one plain line for where they
 * stand ("Officers approve new members. Asking also follows the club.",
 * "Request sent. An officer will look at it.", "Not this time. You can ask
 * again on Nov 5."…) and the one thing they can do about it. Members and
 * officers see no box; the words and the actions are `membershipBoxView`'s
 * (`join-copy.ts`), tested there.
 *
 * THE INVITE LIVES HERE NOW. "<Name> invited you to join." with Accept and
 * Decline, and the expiry under it, so the page needs no separate invite
 * banner and no second pair of buttons (the row above only follows).
 *
 * The taps are `useOrgControl`'s, the same doors, refusals and kept answers
 * as every other club control, plus Cancel request (DELETE /join with
 * `{cancel_request: true}`). Each one refreshes the server render, so the
 * row's Follow catches up with a request that followed, or a cancel that
 * dropped the follow asking made.
 *
 * Theme tokens throughout: the page is a night island, so they resolve to
 * Night's values on the club's dark backdrop in either app theme.
 */

/** The live invite, from what the page already read. */
export type MembershipBoxInvite = {
  /** `ctx.pendingInvite.id`: Decline needs it. */
  id: string;
  /** `ctx.pendingInvite.expires_at`. */
  expiresAt: string;
  /** The page's `invitedByName` (`visibleInviterFirstName`); null reads "An officer". */
  inviterFirstName: string | null;
};

export type MembershipBoxProps = {
  /**
   * The page's `relation`, with `askAgainAt` set from the decision when the
   * state is `declined`. Null (the membership read failed) renders nothing:
   * the row's "Couldn't load your membership" already says so.
   */
  relation: OrgRelation | null;
  /** The invite when `relation.state` is `invited`, else null. */
  invite: MembershipBoxInvite | null;
};

export function MembershipBox({ relation, invite }: MembershipBoxProps): JSX.Element | null {
  if (!relation || relation.state === "member" || relation.state === "hidden") return null;
  return <Box relation={relation} invite={invite} />;
}

function Box({ relation, invite }: { relation: OrgRelation; invite: MembershipBoxInvite | null }) {
  const router = useRouter();
  const { rel, gone, busyKey, press, offered } = useOrgControl({
    relation,
    source: "profile",
    pendingInviteId: invite?.id ?? null,
    onChange: () => router.refresh(),
  });
  const view = membershipBoxView(
    rel,
    invite ? { inviterFirstName: invite.inviterFirstName, expiresAt: invite.expiresAt } : null,
  );
  // A tap that made them a member: the refresh takes the box away.
  if (!view) return null;
  const actions = offered(view.actions);

  return (
    <section aria-label={ORG_COPY.membership.title} style={boxStyle}>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <p style={eyebrowStyle}>{ORG_COPY.membership.title}</p>
        {/* Polite, so "Request sent…" is read out after the tap. */}
        <div aria-live="polite">
          <p style={lineStyle}>{view.line}</p>
          {view.sub ? <p style={subStyle}>{view.sub}</p> : null}
        </div>
      </div>
      {actions.length > 0 ? (
        <div style={actionsStyle}>
          {actions.map((a, i) => {
            const key = `box-${i}`;
            return (
              <OrgControlButton
                key={key}
                action={a}
                palette={BOX}
                busy={busyKey === key}
                locked={gone || busyKey !== null}
                fill="none"
                onPress={() => void press(a, key)}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

// ── Looks ───────────────────────────────────────────────────────────────────

const boxStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "10px 14px",
  marginTop: 12,
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(var(--scrim-rgb),0.14)",
  background: "rgba(var(--scrim-rgb),0.06)",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--ink-muted)",
};

const lineStyle: CSSProperties = {
  margin: "3px 0 0",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.4,
  color: "var(--charcoal)",
  overflowWrap: "anywhere",
};

const subStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 12.5,
  lineHeight: 1.4,
  color: "var(--ink-muted)",
};

// Under 240px of line plus the buttons, they wrap to their own line, left
// aligned: the phone shape, with no media query.
const actionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
};

/** Solid coral for the one way in; the Follow above steps down to outline. */
const BOX: Palette = {
  base: { ...PILL, borderRadius: 12 },
  filled: { color: "var(--on-coral)", background: "var(--coral)", border: "1px solid var(--coral)" },
  outline: {
    color: "var(--charcoal)",
    background: "transparent",
    border: "1px solid rgba(var(--scrim-rgb),0.28)",
  },
  quiet: {
    color: "var(--ink-2)",
    background: "rgba(var(--scrim-rgb),0.06)",
    border: "1px solid rgba(var(--scrim-rgb),0.14)",
  },
  sub: subStyle,
};
