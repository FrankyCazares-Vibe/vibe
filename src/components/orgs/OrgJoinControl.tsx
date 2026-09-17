"use client";

import Link from "next/link";
import { useState, type CSSProperties, type JSX } from "react";

import { vibeRequest, type VibeFailure } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import {
  ORG_COPY,
  changeAfter,
  fillCopy,
  orgErrorCopy,
  orgHeaderView,
  orgRowView,
  type FollowSource,
  type OrgAction,
  type OrgControlChange,
  type OrgRelation,
} from "@/lib/orgs/join-copy";
import { isOrgRole, type OrgAudience } from "@/lib/orgs/join-state";

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
 * The answer is kept locally until the parent passes a relation that differs
 * from the one tapped on (a refresh, or the parent's own state catching up),
 * so a parent that ignores `onChange` still shows what the server said.
 */

export type OrgJoinControlProps = {
  relation: OrgRelation;
  variant: "header" | "phone_row" | "card" | "onboarding";
  /** Header only: "membership" drops the follow column (the channels card). */
  axis?: "both" | "membership";
  source: FollowSource;
  /** Needed for Decline; without it Decline isn't offered. */
  pendingInviteId?: string | null;
  replay?: boolean;
  onChange?: (next: OrgControlChange) => void;
};

/** `equal`: the line layout's two same-width pills. `grow`: fill a header column. */
type Fill = "none" | "equal" | "grow";

type Local = OrgControlChange & {
  /** The relation this answer was for; a different relation from the parent wins. */
  basis: string;
  audience: OrgAudience;
  /** The server said the club is gone (hidden or deleted): every control disables. */
  gone: boolean;
};

function relationKey(r: OrgRelation): string {
  return [r.handle, r.state, r.following, r.role, r.reason, r.audience, r.joinPolicy].join("|");
}

/** `audience_mismatch` names the university only in its sentence (vibeRequest keeps no extras). */
function audienceFromRefusal(r: VibeFailure, fallback: OrgAudience): OrgAudience {
  const error = r.error ?? "";
  if (/open to Purdue students only\.?$/.test(error)) return "purdue";
  if (/open to IU students only\.?$/.test(error)) return "iu";
  return fallback;
}

export function OrgJoinControl({
  relation,
  variant,
  axis = "both",
  source,
  pendingInviteId = null,
  replay = false,
  onChange,
}: OrgJoinControlProps): JSX.Element | null {
  const basis = relationKey(relation);
  const [local, setLocal] = useState<Local | null>(null);
  /** Which control is waiting on the server, by its position key. */
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const live = local && local.basis === basis ? local : null;
  const state = live?.state ?? relation.state;
  const rel: OrgRelation = {
    ...relation,
    state,
    following: state === "member" ? true : (live?.following ?? relation.following),
    role: live ? live.role : relation.role,
    audience: live?.audience ?? relation.audience,
  };
  const gone = live?.gone ?? false;
  const palette = PALETTES[variant];

  const apply = (next: OrgControlChange, audience: OrgAudience = rel.audience) => {
    setLocal({ ...next, basis, audience, gone: false });
    onChange?.(next);
  };

  const refuse = (r: VibeFailure) => {
    if (r.status === 429) {
      toast({ message: ORG_COPY.errors.tooMany, tone: "error" });
      return;
    }
    if (r.code === "not_found") {
      toast({ message: ORG_COPY.errors.notFound, tone: "error" });
      setLocal({
        state: rel.state,
        following: rel.following,
        role: rel.role,
        basis,
        audience: rel.audience,
        gone: true,
      });
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

    // join, request and accept all go through the one door (join/route.ts).
    const failure =
      a.kind === "accept"
        ? ORG_COPY.control.acceptFailed
        : a.kind === "request"
          ? ORG_COPY.control.requestFailed
          : ORG_COPY.control.joinFailed;
    setBusyKey(key);
    const r = await vibeRequest<{ joined?: unknown; pending?: unknown; role?: unknown }>(
      `/api/orgs/${handle}/join`,
      { method: "POST", json: {}, quiet: true, failure },
    );
    setBusyKey(null);
    if (r.ok) {
      if (r.data.joined === true) {
        apply({ state: "member", following: true, role: isOrgRole(r.data.role) ? r.data.role : "member" });
        if (a.kind === "accept") {
          toast({ message: fillCopy(ORG_COPY.control.welcome, { org: orgName }), tone: "info" });
        }
      } else if (r.data.pending === true) {
        apply({ state: "requested", following: rel.following, role: rel.role });
      } else {
        // A 2xx that says neither: nothing is known to have changed.
        toast({ message: `${failure} Try again.`, tone: "error" });
      }
      return;
    }
    switch (r.code) {
      case "invite_only":
        apply({ state: "invite_only", following: rel.following, role: rel.role });
        return;
      case "audience_mismatch":
        apply(
          { state: "audience_blocked", following: rel.following, role: rel.role },
          audienceFromRefusal(r, rel.audience),
        );
        return;
      case "school_unverified":
        apply({ state: "unverified", following: rel.following, role: rel.role });
        return;
      default:
        refuse(r);
    }
  };

  const button = (a: OrgAction, key: string, extra?: { pressed?: boolean; fill?: Fill }) => (
    <ControlButton
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

  /** Decline needs the invite id; without one it isn't offered (replay excepted). */
  const offered = (actions: OrgAction[]) =>
    actions.filter((a) => a.kind !== "decline" || replay || !!pendingInviteId);

  if (variant === "header") {
    const view = orgHeaderView(rel);
    const membership = offered(view.membership);
    const showFollow = axis === "both" && view.follow !== null;
    const subs = membership.map((a) => a.sub).filter((s): s is string => !!s);
    if (!showFollow && membership.length === 0) return null;
    return (
      // ONE element: globals.css makes `.vibe-org-header-join > *` full width on phones.
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
        {showFollow && view.follow ? (
          <div style={headerColumnStyle}>
            {button(view.follow, "follow", { pressed: rel.following })}
            {view.followSub ? <span style={palette.sub}>{view.followSub}</span> : null}
            {view.disclosure ? <span style={palette.sub}>{view.disclosure}</span> : null}
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

function ControlButton({
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

type Palette = {
  base: CSSProperties;
  filled: CSSProperties;
  outline: CSSProperties;
  quiet: CSSProperties;
  sub: CSSProperties;
};

const PILL: CSSProperties = {
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
  filled: { color: "#fff", background: "#FF5C35", border: "1px solid #FF5C35" },
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
  filled: { color: "#fff", background: "#FF5C35", border: "1px solid #FF5C35" },
  outline: {
    color: "#1C1C1E",
    background: "transparent",
    border: "1px solid rgba(28,28,30,0.14)",
  },
  quiet: {
    color: "#5C5853",
    background: "rgba(28,28,30,0.05)",
    border: "1px solid rgba(28,28,30,0.10)",
  },
  sub: { ...DARK_SUB, color: "#8A8580" },
};

const PALETTES: Record<OrgJoinControlProps["variant"], Palette> = {
  header: GLASS,
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
