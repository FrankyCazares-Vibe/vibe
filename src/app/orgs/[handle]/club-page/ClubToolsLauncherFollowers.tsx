"use client";

import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";

import { LoadFailed, asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { vibeRequest, type VibeFailure } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import {
  ORG_COPY,
  followsSinceText,
  inviteRowButton,
  type InviteCandidateState,
  type InviteIneligibleReason,
} from "@/lib/orgs/join-copy";

import { arcTool, displayName, followersSub } from "./club-tools-arc";
import type { ArcCardProps } from "./ClubToolsLauncherCards";
import {
  ArcCardFrame,
  ArcNote,
  ArcPageLink,
  ArcPersonRow,
  ArcRise,
  ArcSkeleton,
  ghostStyle,
  pillStyle,
  statusStyle,
} from "./ClubToolsLauncherParts";

/**
 * The Arc's Followers card (Oct 22, 2026): the newest people following the
 * club who aren't in it yet, from the invite sheet's own list
 * (GET /api/orgs/[slug]/invite-candidates?source=followers), each with
 * "Invite to join" (POST /api/orgs/[slug]/invites {user_id}). Every row says
 * what the Invite people sheet would (`inviteRowButton`, join-copy.ts):
 * Invited, Approve request when they already asked, Declined or Invited
 * enough with the day they can be asked again, Not eligible and why. A club
 * that can't invite (not verified, or hidden) shows no Invite at all, and
 * one line why. Members follow on their own, so the list leaves them out.
 * Nothing is optimistic: a row changes when the server answers, and a
 * refusal that names a state turns the row into it (OrgInviteSheet.tsx).
 */

const LOAD_LINE = "Couldn't load followers.";
const COPY = ORG_COPY.inviteSheet;

/** How many followers the card shows; the rest are on the Followers page. */
const SHOWN = 6;

type Candidate = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  state: InviteCandidateState;
  eligible: boolean;
  reason: InviteIneligibleReason;
  available_at: string | null;
  request_id: string | null;
  can_approve: boolean | null;
  follows_since: string | null;
};

type Blocked = "org_hidden" | "org_unverified" | null;

const STATES: ReadonlySet<string> = new Set(["member", "invited", "requested", "declined_recently", "invite_cap_reached", "none"]);

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** The route's rows; a state this build doesn't know reads "none" and not eligible, the one row that offers no tap. */
function parseCandidates(raw: unknown): Candidate[] {
  if (!Array.isArray(raw)) return [];
  const out: Candidate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = str(row.id);
    if (!id) continue;
    const known = typeof row.state === "string" && STATES.has(row.state);
    const reason = row.reason;
    out.push({
      id,
      name: str(row.name),
      handle: str(row.handle),
      avatar_url: str(row.avatar_url),
      state: known ? (row.state as InviteCandidateState) : "none",
      eligible: known && row.eligible === true,
      reason: reason === "audience_iu" || reason === "audience_purdue" || reason === "unverified" ? reason : null,
      available_at: str(row.available_at),
      request_id: str(row.request_id),
      can_approve: typeof row.can_approve === "boolean" ? row.can_approve : null,
      follows_since: str(row.follows_since),
    });
  }
  return out;
}

/** `audience_mismatch` names the university only in its sentence (the sheet's reading). */
function reasonFrom(r: VibeFailure, fallback: "audience_iu" | "audience_purdue"): InviteIneligibleReason {
  const error = r.error ?? "";
  if (/open to Purdue students only\.?$/.test(error)) return "audience_purdue";
  if (/open to IU students only\.?$/.test(error)) return "audience_iu";
  return fallback;
}

export function FollowersCard({
  club,
  counts,
  onClose,
  onLeave,
  onChanged,
}: ArcCardProps & { onChanged: () => void }): JSX.Element {
  const base = `/api/orgs/${encodeURIComponent(club.handle)}`;
  const [rows, setRows] = useState<Candidate[] | null>(null);
  // The page already knows the two reasons a club can't invite; the read confirms it.
  const [blocked, setBlocked] = useState<Blocked>(club.hidden ? "org_hidden" : club.verified ? null : "org_unverified");
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [tick, setTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Invites this card sent, by person, so "Invited ✓" can offer Undo. */
  const [sent, setSent] = useState<Record<string, string>>({});
  const loaded = useRef(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await vibeRequest<{ can_invite?: unknown; blocked_reason?: unknown; users?: unknown }>(
        `${base}/invite-candidates?source=followers`,
        { cache: "no-store", quiet: true, failure: LOAD_LINE },
      );
      if (!live) return;
      if (r.ok && Array.isArray(r.data.users)) {
        loaded.current = true;
        const b = r.data.blocked_reason;
        setBlocked(b === "org_hidden" || b === "org_unverified" ? b : r.data.can_invite === false ? "org_unverified" : null);
        setFailure(null);
        setRows(parseCandidates(r.data.users).slice(0, SHOWN));
        return;
      }
      const f = asLoadFailure(r, LOAD_LINE);
      // A re-read after a refusal keeps the rows on screen and toasts.
      if (loaded.current) toast({ message: f.message, tone: "error", action: f.action });
      else setFailure(f);
    })();
    return () => {
      live = false;
    };
  }, [base, tick]);

  const reload = () => setTick((t) => t + 1);
  const patch = (id: string, p: Partial<Candidate>) =>
    setRows((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, ...p } : c)) : prev));
  const forget = (id: string) =>
    setSent((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  const refused = (r: VibeFailure) => toast({ message: r.message, tone: "error", action: r.action });
  const fallbackReason = club.audience === "purdue" ? "audience_purdue" : "audience_iu";

  const invite = async (c: Candidate) => {
    if (busyId) return;
    setBusyId(c.id);
    const r = await vibeRequest<{ already?: unknown; invite?: { id?: unknown } }>(`${base}/invites`, {
      method: "POST",
      json: { user_id: c.id },
      quiet: true,
      failure: COPY.inviteFailed,
    });
    setBusyId(null);
    if (r.ok) {
      // An invite that was already out isn't this card's to undo.
      const id = r.data.already === true ? null : str(r.data.invite?.id);
      if (id) setSent((prev) => ({ ...prev, [c.id]: id }));
      patch(c.id, { state: "invited" });
      if (r.data.already !== true) toast({ message: COPY.sent, tone: "info" });
      return;
    }
    if (r.status === 429) return void toast({ message: r.error?.trim() || COPY.tooManyInvites, tone: "error" });
    switch (r.code) {
      case "already_member":
        return void patch(c.id, { state: "member" });
      // The row turns into what the server named at once, as the sheet's
      // does, so Invite can't be sent twice while the re-read runs (review,
      // Oct 22, 2026); the request id or the date isn't in what vibeRequest
      // keeps, so the re-read brings it (Approve waits for the id).
      case "has_pending_request":
        patch(c.id, { state: "requested", request_id: null });
        return reload();
      case "recently_declined":
        patch(c.id, { state: "declined_recently", available_at: null });
        return reload();
      case "invite_cap_reached":
        patch(c.id, { state: "invite_cap_reached", available_at: null });
        return reload();
      case "audience_mismatch":
        return void patch(c.id, { state: "none", eligible: false, reason: reasonFrom(r, fallbackReason) });
      case "org_hidden":
      case "org_unverified":
        toast({ message: r.error ?? r.message, tone: "error" });
        return reload();
      default:
        refused(r);
    }
  };

  const undo = async (c: Candidate, inviteId: string) => {
    if (busyId) return;
    setBusyId(c.id);
    const r = await vibeRequest(`${base}/invites/${encodeURIComponent(inviteId)}`, { method: "DELETE", quiet: true, failure: COPY.undoFailed });
    setBusyId(null);
    if (r.ok) {
      forget(c.id);
      patch(c.id, { state: "none" });
      return void toast({ message: COPY.revoked, tone: "info" });
    }
    refused(r);
    if (r.code === "invite_not_pending" || r.code === "invite_not_found") {
      forget(c.id);
      reload();
    }
  };

  const approve = async (c: Candidate) => {
    if (busyId || !c.request_id) return;
    setBusyId(c.id);
    const r = await vibeRequest(`${base}/requests/${encodeURIComponent(c.request_id)}`, {
      method: "POST",
      json: { action: "approve" },
      quiet: true,
      failure: COPY.approveFailed,
    });
    setBusyId(null);
    if (r.ok) {
      patch(c.id, { state: "member" });
      onChanged();
      return void toast({ message: COPY.approved, tone: "info" });
    }
    refused(r);
    if (r.code === "audience_mismatch") patch(c.id, { state: "none", eligible: false, reason: reasonFrom(r, fallbackReason) });
    else if (r.code === "school_unverified") patch(c.id, { state: "none", eligible: false, reason: "unverified" });
    else if (r.code === "removed_needs_admin" || r.code === "approve_unavailable") patch(c.id, { can_approve: false });
    else if (r.code === "request_not_pending" || r.code === "request_not_found") reload();
  };

  let body: ReactNode;
  if (failure && !rows) {
    body = (
      <LoadFailed
        failure={failure}
        tone="dark"
        compact
        onRetry={() => {
          setFailure(null);
          reload();
        }}
      />
    );
  } else if (!rows) {
    body = <ArcSkeleton rows={3} />;
  } else if (rows.length === 0) {
    body = (
      <ArcRise index={1}>
        <ArcNote>No one outside the club follows it yet. Share the page, and the people who follow it show up here.</ArcNote>
      </ArcRise>
    );
  } else {
    body = (
      <>
        <ArcRise index={1}>
          <div style={eyebrowStyle}>Not in the club yet</div>
        </ArcRise>
        {rows.map((c, i) => (
          <FollowerLine
            key={c.id}
            c={c}
            index={i + 1}
            orgName={club.name}
            blocked={blocked}
            sentId={sent[c.id] ?? null}
            busy={busyId === c.id}
            locked={busyId !== null}
            onInvite={() => void invite(c)}
            onUndo={(id) => void undo(c, id)}
            onApprove={() => void approve(c)}
          />
        ))}
      </>
    );
  }

  return (
    <ArcCardFrame
      tool={arcTool("followers")}
      title="Followers"
      sub={followersSub(counts.followers)}
      onClose={onClose}
      footer={<ArcPageLink href={`/orgs/${encodeURIComponent(club.handle)}/tools/followers`} label="See all followers" onLeave={onLeave} />}
    >
      {blocked ? (
        <ArcRise index={0}>
          <ArcNote>{blocked === "org_hidden" ? COPY.blockedHidden : COPY.blockedUnverified}</ArcNote>
        </ArcRise>
      ) : null}
      {body}
    </ArcCardFrame>
  );
}

/**
 * One follower and what can be done about them. The button decides by
 * `state` first (`inviteRowButton`): a requested row approves their REQUEST,
 * never sends an invite, and one this officer can't approve says only where
 * it stands. Invite isn't offered at all when the club can't invite.
 */
function FollowerLine({
  c,
  index,
  orgName,
  blocked,
  sentId,
  busy,
  locked,
  onInvite,
  onUndo,
  onApprove,
}: {
  c: Candidate;
  index: number;
  orgName: string;
  blocked: Blocked;
  sentId: string | null;
  busy: boolean;
  locked: boolean;
  onInvite: () => void;
  onUndo: (inviteId: string) => void;
  onApprove: () => void;
}): JSX.Element {
  const who = displayName(c.name, c.handle);
  const button =
    c.state === "requested" && c.can_approve === false
      ? { kind: "status" as const, label: ORG_COPY.buttons.requested, sub: ORG_COPY.errors.approveUnavailable, disabled: true, undo: false }
      : inviteRowButton(c, { orgName, canInvite: blocked === null, blockedReason: blocked, sent: sentId !== null });

  let end: ReactNode = null;
  if (button.kind === "status") {
    end = (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        {button.undo && sentId ? (
          <button type="button" disabled={locked} onClick={() => onUndo(sentId)} style={undoStyle}>
            {COPY.undo}
          </button>
        ) : null}
        <span style={statusStyle}>{button.label}</span>
      </span>
    );
  } else if (button.kind === "approve" || blocked === null) {
    // Invite, only when the club can invite; Approve request, unless the club is hidden.
    const label = button.kind === "approve" ? button.label : "Invite to join";
    end = (
      <button
        type="button"
        className="vibe-arc-ghost"
        disabled={button.disabled || locked}
        aria-busy={busy || undefined}
        aria-label={`${label}: ${who}`}
        onClick={button.kind === "approve" ? onApprove : onInvite}
        style={{
          ...pillStyle,
          ...ghostStyle,
          padding: "0 14px",
          fontSize: 13,
          border: "1px solid var(--tag-ink)",
          color: "var(--tag-ink)",
          flexShrink: 0,
          opacity: button.disabled || (locked && !busy) ? 0.55 : 1,
          cursor: button.disabled || locked ? "default" : "pointer",
        }}
      >
        {busy ? ORG_COPY.buttons.busy : label}
      </button>
    );
  }

  return (
    <ArcPersonRow
      index={index}
      person={{
        id: c.id,
        name: who,
        handle: c.handle,
        avatarUrl: c.avatar_url,
        line: followsSinceText(c.follows_since) ?? (c.handle ? `@${c.handle}` : ""),
        tag: null,
      }}
      end={end}
      below={button.sub ? <span style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--ink-2)" }}>{button.sub}</span> : null}
    />
  );
}

const eyebrowStyle = {
  margin: "0 0 4px",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: "var(--tag-ink)",
};

const undoStyle = {
  minHeight: 44,
  padding: "0 8px",
  border: "none",
  background: "transparent",
  color: "var(--ink-2)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12.5,
  fontWeight: 600,
  textDecoration: "underline",
  textUnderlineOffset: 3,
  cursor: "pointer",
};
