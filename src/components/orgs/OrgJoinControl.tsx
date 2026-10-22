"use client";

import Link from "next/link";
import { useState, type CSSProperties, type JSX } from "react";

import { vibeRequest, type VibeFailure } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import {
  ORG_COPY,
  cancelOutcome,
  changeAfter,
  fillCopy,
  joinOutcome,
  joinPressFailure,
  memoryFor,
  orgErrorCopy,
  orgFollowSlot,
  orgHeaderView,
  orgRowView,
  relationKey,
  shownRelation,
  type ControlMemory,
  type FollowSource,
  type OrgAction,
  type OrgControlChange,
  type OrgRelation,
} from "@/lib/orgs/join-copy";
import type { OrgAudience } from "@/lib/orgs/join-state";

/**
 * THE club button: follow and membership, on every surface (wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §6 F5a C).
 *
 * What it renders comes from `join-copy.ts` and nothing else — `orgHeaderView`
 * for the org page, `orgRowView(...).actions` for phone rows, desktop cards
 * and onboarding — so a label can't drift between surfaces. The caller
 * renders the row's chip, meta, sub and disclosure; this renders the buttons.
 *
 * NO OPTIMISTIC FLIPS. The pressed control shows '…' with `aria-busy` until
 * the server answers (the `MessagesMobile.tsx` Accept/Decline pattern), so a
 * refusal has nothing to roll back. A code that names a state (`invite_only`,
 * `audience_mismatch`, `school_unverified`, `member_follows`) flips to it
 * instead of toasting a red "failed"; anything else toasts vibeRequest's
 * mapped line with its action, which keeps Review Terms on `terms_required`.
 *
 * `replay` (onboarding's walkthrough) sends nothing at all: the next state is
 * computed locally with `changeAfter` and reported through `onChange`.
 *
 * ASKING FOLLOWS (club model, Oct 16). A request needs no follow first, and
 * the join route follows the club when it files one; its `org_follow_state`
 * is the answer this control reports, so Follow flips to Following with it.
 *
 * The answer is kept locally until the parent passes a different relation (a
 * refresh, or the parent's own state catching up), so a parent that ignores
 * `onChange` still shows what the server said. A new relation forgets it for
 * good (`memoryFor`): the club page's header and Board card both follow, and
 * an old answer must not outlive the other control's tap.
 *
 * THE CLUB PAGE, SINCE OCT 22, 2026. Its button row renders the `slot`
 * variant (follow only), and its Membership box renders the membership
 * actions through {@link useOrgControl}, the same taps this component makes,
 * plus Cancel request. Two controls, one relation: each tap refreshes the
 * page, so the other catches up.
 */

export type OrgJoinControlProps = {
  relation: OrgRelation;
  /**
   * `slot` (Oct 22, 2026) is the club page's button row: following only
   * (`orgFollowSlot`), because joining lives in the Membership box under it.
   */
  variant: "header" | "slot" | "phone_row" | "card" | "onboarding";
  /**
   * Header only: "membership" drops the follow column (the channels card),
   * "follow" drops the membership column (the Board card).
   */
  axis?: "both" | "membership" | "follow";
  /** Header only: the words on Follow ("Follow to read the Board"). */
  followLabel?: string;
  source: FollowSource;
  /** Needed for Decline; without it Decline isn't offered. */
  pendingInviteId?: string | null;
  replay?: boolean;
  onChange?: (next: OrgControlChange) => void;
};

/** What {@link useOrgControl} needs: the control's props, minus how it looks. */
export type OrgControlOptions = Pick<
  OrgJoinControlProps,
  "relation" | "source" | "pendingInviteId" | "replay" | "onChange"
>;

/** One club's controls, wired: what to render, and what a tap does. */
export type OrgControl = {
  /** The parent's relation with this control's own kept answer laid over it. */
  rel: OrgRelation;
  /** The server said the club is gone: every control disables. */
  gone: boolean;
  /** Which control is waiting on the server, by the key it was pressed with. */
  busyKey: string | null;
  press: (a: OrgAction, key: string) => Promise<void>;
  /** Decline needs the invite id; without one it isn't offered (replay excepted). */
  offered: (actions: OrgAction[]) => OrgAction[];
};

/** `equal`: the line layout's two same-width pills. `grow`: fill a header column. */
type Fill = "none" | "equal" | "grow";

/**
 * The taps, shared by {@link OrgJoinControl} and the club page's Membership
 * box (`club-page/MembershipBox.tsx`, Oct 22, 2026), so the box's Join,
 * Request, Cancel, Accept and Decline go through exactly the doors, refusals
 * and kept answers the old header's did. Rendering stays with the caller.
 */
export function useOrgControl({
  relation,
  source,
  pendingInviteId = null,
  replay = false,
  onChange,
}: OrgControlOptions): OrgControl {
  const basis = relationKey(relation);
  const [memory, setMemory] = useState<ControlMemory>(() => ({ seen: basis, kept: null }));
  /** Which control is waiting on the server, by its position key. */
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // A new relation forgets the kept answer before anything renders (React's
  // "adjust state when a prop changes"), so a refresh back to the relation an
  // old tap was made on can't bring that answer back.
  const current = memoryFor(memory, relation);
  if (current !== memory) setMemory(current);
  const { rel, gone } = shownRelation(relation, current);

  /** Keep the server's answer for the relation this tap was made on. */
  const keep = (next: OrgControlChange, audience: OrgAudience, isGone: boolean) =>
    setMemory((m) => ({ seen: m.seen, kept: { ...next, basis, audience, gone: isGone } }));

  const apply = (next: OrgControlChange, audience: OrgAudience = rel.audience) => {
    keep(next, audience, false);
    onChange?.(next);
  };

  const refuse = (r: VibeFailure) => {
    if (r.status === 429) {
      // vibeRequest's line carries the route's own wait ("Try again in 8
      // minutes"): a fixed "in a minute" would send them back too soon.
      toast({ message: r.message, tone: "error" });
      return;
    }
    if (r.code === "not_found") {
      toast({ message: ORG_COPY.errors.notFound, tone: "error" });
      keep({ state: rel.state, following: rel.following, role: rel.role }, rel.audience, true);
      return;
    }
    const known = orgErrorCopy(r.code);
    toast({ message: known ?? r.message, tone: "error", action: known ? undefined : r.action });
  };

  const press = async (a: OrgAction, key: string) => {
    if (busyKey !== null || gone || a.disabled) return;
    const next = changeAfter(rel, a.kind);
    if (!next) return;
    if (replay) {
      apply(next);
      return;
    }

    const handle = encodeURIComponent(rel.handle);
    const orgName = rel.orgName.trim() || "this org";

    // Take back a pending request (Oct 22, 2026). The flag makes the route
    // cancel and never leave, even if an officer let them in meanwhile;
    // `cancelOutcome` reads the standing it sends back.
    if (a.kind === "cancel") {
      setBusyKey(key);
      const r = await vibeRequest<{ cancelled?: unknown; join_state?: unknown; org_follow_state?: unknown }>(
        `/api/orgs/${handle}/join`,
        { method: "DELETE", json: { cancel_request: true }, quiet: true, failure: ORG_COPY.membership.cancelFailed },
      );
      setBusyKey(null);
      const out = cancelOutcome(rel, r);
      if (out.kind === "change") {
        apply(out.next);
        if (out.message) toast({ message: out.message, tone: "info" });
      } else if (!r.ok) {
        refuse(r);
      }
      return;
    }

    if (a.kind === "decline") {
      if (!pendingInviteId) return;
      if (!window.confirm(fillCopy(ORG_COPY.control.declineConfirm, { org: orgName }))) return;
      setBusyKey(key);
      const r = await vibeRequest(`/api/me/org-invites/${encodeURIComponent(pendingInviteId)}`, {
        method: "POST",
        json: { action: "decline" },
        quiet: true,
        failure: ORG_COPY.control.declineFailed,
      });
      setBusyKey(null);
      if (r.ok) {
        apply(next);
      } else if (r.code === "invite_not_found" || r.code === "invite_not_pending") {
        // Already answered, revoked or expired: there's nothing left to decline.
        toast({ message: ORG_COPY.errors.inviteClosed, tone: "info" });
        apply(next);
      } else {
        refuse(r);
      }
      return;
    }

    if (a.kind === "follow" || a.kind === "unfollow") {
      const following = a.kind === "follow";
      setBusyKey(key);
      const r = await vibeRequest(`/api/orgs/${handle}/follow`, {
        method: following ? "POST" : "DELETE",
        ...(following ? { json: { source } } : {}),
        quiet: true,
        failure: following ? ORG_COPY.control.followFailed : ORG_COPY.control.unfollowFailed,
      });
      setBusyKey(null);
      if (r.ok) {
        apply(next);
      } else if (!following && r.code === "member_follows") {
        // They joined somewhere else since this rendered. Members follow.
        toast({ message: ORG_COPY.errors.memberFollows, tone: "info" });
        apply({ state: "member", following: true, role: rel.role ?? "member" });
      } else {
        refuse(r);
      }
      return;
    }

    // join, request and accept all go through the one door (join/route.ts);
    // what its answer means is `joinOutcome`'s, shared with the follower's
    // Board tile.
    if (a.kind !== "join" && a.kind !== "request" && a.kind !== "accept") return;
    const failure = joinPressFailure(a.kind);
    setBusyKey(key);
    const r = await vibeRequest<{
      joined?: unknown;
      pending?: unknown;
      role?: unknown;
      org_follow_state?: unknown;
    }>(
      `/api/orgs/${handle}/join`,
      { method: "POST", json: {}, quiet: true, failure },
    );
    setBusyKey(null);
    const out = joinOutcome(rel, a.kind, r);
    if (out.kind === "change") {
      apply(out.next, out.audience);
      if (out.welcome) toast({ message: fillCopy(ORG_COPY.control.welcome, { org: orgName }), tone: "info" });
      // "Not this time. You can ask again on Nov 5." (Oct 22, 2026): the
      // Request button just went away, so say why.
      if (out.notice) toast({ message: out.notice, tone: "info" });
    } else if (out.kind === "unclear") {
      toast({ message: out.message, tone: "error" });
    } else if (!r.ok) {
      refuse(r);
    }
  };

  const offered = (actions: OrgAction[]) =>
    actions.filter((a) => a.kind !== "decline" || replay || !!pendingInviteId);

  return { rel, gone, busyKey, press, offered };
}

export function OrgJoinControl({
  relation,
  variant,
  axis = "both",
  followLabel,
  source,
  pendingInviteId = null,
  replay = false,
  onChange,
}: OrgJoinControlProps): JSX.Element | null {
  const { rel, gone, busyKey, press, offered } = useOrgControl({
    relation,
    source,
    pendingInviteId,
    replay,
    onChange,
  });
  const palette = PALETTES[variant];

  const button = (a: OrgAction, key: string, extra?: { pressed?: boolean; fill?: Fill }) => (
    <OrgControlButton
      key={key}
      action={a}
      palette={palette}
      busy={busyKey === key}
      locked={gone || busyKey !== null}
      pressed={extra?.pressed}
      fill={extra?.fill ?? "none"}
      onPress={() => void press(a, key)}
    />
  );

  // The club page's button row (Oct 22, 2026): one column, the follow slot
  // and its fine print. Same one-element shape as the header, so
  // globals.css's `.vibe-club-join > *` rules still fit it to the row.
  if (variant === "slot") {
    const slot = orgFollowSlot(rel);
    if (!slot.action) return null;
    const a = slot.action;
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px 12px", minWidth: 0 }}>
        <div style={headerColumnStyle}>
          {button(a, "follow", {
            pressed: a.kind === "follow" || a.kind === "unfollow" ? rel.following : undefined,
          })}
          {slot.sub ? <span style={palette.sub}>{slot.sub}</span> : null}
        </div>
      </div>
    );
  }

  if (variant === "header") {
    const view = orgHeaderView(rel);
    const membership = axis === "follow" ? [] : offered(view.membership);
    const showFollow = axis !== "membership" && view.follow !== null;
    const follow =
      view.follow && followLabel && view.follow.kind === "follow"
        ? { ...view.follow, label: followLabel }
        : view.follow;
    // The disclosure lives in the follow column; without one, a Request
    // still carries it (asking follows, so officers see the follow).
    const subs = [
      ...membership.map((a) => a.sub),
      !showFollow && membership.some((a) => a.kind === "request") ? view.disclosure : null,
    ].filter((s): s is string => !!s);
    if (!showFollow && membership.length === 0) return null;
    return (
      // ONE element: globals.css makes `.vibe-club-join > *` fill its half of the club page's button row.
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          gap: "10px 12px",
          minWidth: 0,
        }}
      >
        {showFollow && follow ? (
          <div style={headerColumnStyle}>
            {button(follow, "follow", { pressed: rel.following })}
            {view.followSub ? <span style={palette.sub}>{view.followSub}</span> : null}
            {/* The Board card ("follow" axis) sits under the header, whose
                own Follow already carries the line: once per page. */}
            {view.disclosure && axis !== "follow" ? <span style={palette.sub}>{view.disclosure}</span> : null}
          </div>
        ) : null}
        {membership.length > 0 ? (
          <div style={headerColumnStyle}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, width: "100%" }}>
              {membership.map((a, i) => button(a, `membership-${i}`, { fill: "grow" }))}
            </div>
            {subs.map((s) => (
              <span key={s} style={palette.sub}>
                {s}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const view = orgRowView(rel, variant);
  const actions = offered(view.actions);
  const line = view.layout === "line";
  return (
    <div
      style={{
        display: line ? "flex" : "inline-flex",
        alignItems: "center",
        gap: 8,
        width: line ? "100%" : undefined,
        flexShrink: 0,
      }}
    >
      {actions.map((a, i) =>
        button(a, `row-${i}`, {
          pressed: a.kind === "follow" || a.kind === "unfollow" ? a.kind === "unfollow" : undefined,
          fill: line ? "equal" : "none",
        }),
      )}
    </div>
  );
}

/**
 * One club control: a link for Sign in and Verify, a button for everything
 * else, '…' while its tap waits. Exported for the Membership box (Oct 22,
 * 2026), which passes its own palette.
 */
export function OrgControlButton({
  action: a,
  palette,
  busy,
  locked,
  pressed,
  fill,
  onPress,
}: {
  action: OrgAction;
  palette: Palette;
  busy: boolean;
  /** Another control is waiting, or the club is gone. */
  locked: boolean;
  pressed?: boolean;
  fill: Fill;
  onPress: () => void;
}): JSX.Element {
  const style: CSSProperties = {
    ...palette.base,
    ...palette[a.tone],
    ...(fill === "equal" ? { flex: "1 1 0", minWidth: 0 } : null),
    ...(fill === "grow" ? { flex: "1 1 auto" } : null),
  };

  if (a.href && (a.kind === "sign_in" || a.kind === "verify_email")) {
    return (
      <Link
        href={a.href}
        // A row or card may itself be tappable; the link is its own tap.
        onClick={(e) => e.stopPropagation()}
        style={style}
      >
        {a.label}
      </Link>
    );
  }

  const disabled = a.disabled || locked;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-busy={busy || undefined}
      aria-pressed={pressed}
      aria-label={busy ? a.label : undefined}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      }}
      // Join / Follow press like every other tap (motion pass, Oct 18 2026).
      className="vibe-press"
      style={{
        ...style,
        cursor: disabled ? "default" : "pointer",
        // A status label is disabled by nature and stays fully legible; only a
        // control locked by a pending tap fades.
        opacity: !a.disabled && locked && !busy ? 0.6 : 1,
      }}
    >
      {busy ? ORG_COPY.buttons.busy : a.label}
    </button>
  );
}

// ── Looks ───────────────────────────────────────────────────────────────────
//
// No theme prop: each surface already has one look. The org page header and
// desktop cards sit on dark glass, onboarding on charcoal, phone Orgs rows on
// cream. Every control is at least 44px tall.

export type Palette = {
  base: CSSProperties;
  filled: CSSProperties;
  outline: CSSProperties;
  quiet: CSSProperties;
  sub: CSSProperties;
};

export const PILL: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 44,
  padding: "0 16px",
  boxSizing: "border-box",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13.5,
  fontWeight: 700,
  lineHeight: 1.2,
  textAlign: "center",
  textDecoration: "none",
  whiteSpace: "nowrap",
  WebkitTapHighlightColor: "transparent",
};

const DARK_SUB: CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  lineHeight: 1.4,
  color: "rgba(255,255,255,0.6)",
  textAlign: "center",
};

/** The org page and desktop cards: the org page's own translucent coral. */
const GLASS: Palette = {
  base: { ...PILL, borderRadius: 12 },
  filled: {
    color: "#fff",
    background: "linear-gradient(180deg, rgba(255,92,53,0.55) 0%, rgba(255,92,53,0.22) 100%)",
    border: "1px solid rgba(255,180,150,0.5)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)",
  },
  outline: {
    color: "#fff",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.28)",
  },
  quiet: {
    color: "rgba(255,255,255,0.85)",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.14)",
  },
  sub: DARK_SUB,
};

/** Onboarding: charcoal, with the solid accent its primary buttons use. */
const CHARCOAL: Palette = {
  base: { ...PILL, borderRadius: 999 },
  // Dark words on solid coral (6.3:1); white was 3.1:1.
  filled: { color: "var(--on-coral, #160A06)", background: "#FF5C35", border: "1px solid #FF5C35" },
  outline: {
    color: "#fff",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.28)",
  },
  quiet: {
    color: "rgba(255,255,255,0.85)",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  sub: DARK_SUB,
};

/** Phone Orgs rows: cream cards, like the MessagesMobile request bar. */
const CREAM: Palette = {
  base: { ...PILL, borderRadius: 999 },
  filled: { color: "var(--on-coral, #160A06)", background: "#FF5C35", border: "1px solid #FF5C35" },
  // C0 tokens (S67 wave 3): the phone Orgs row card is var(--glass), which
  // turns near-black in Night. Light values are unchanged.
  outline: {
    color: "var(--charcoal)",
    background: "transparent",
    border: "1px solid rgba(var(--scrim-rgb),0.14)",
  },
  quiet: {
    color: "var(--ink-2)",
    background: "rgba(var(--scrim-rgb),0.05)",
    border: "1px solid rgba(var(--scrim-rgb),0.10)",
  },
  sub: { ...DARK_SUB, color: "var(--ink-muted)" },
};

const PALETTES: Record<OrgJoinControlProps["variant"], Palette> = {
  header: GLASS,
  slot: GLASS,
  card: GLASS,
  onboarding: CHARCOAL,
  phone_row: CREAM,
};

const headerColumnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 4,
  flex: "1 1 150px",
  minWidth: 0,
  maxWidth: 280,
};
