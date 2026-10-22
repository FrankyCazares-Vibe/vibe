"use client";

/**
 * Club tools › Followers (the club's view, wave 2, C10; the desktop's
 * Settings › Followers, phone first): who follows the club, newest first,
 * 30 at a time from the officer-only route, with "Load more". The count is
 * exact (only officers get here). A member's row says Member (members follow
 * automatically); anyone else's has Remove, behind a confirm sheet.
 *
 * Removing isn't a ban: they stop getting the club's posts, can't read its
 * Board unless they join, can follow again, and aren't told.
 *
 * INVITE FROM HERE (Oct 22, 2026; handoffs/2026-10-22-club-tools-arc/PLAN.md
 * B3). The people most likely to want in already follow, so each row that
 * isn't a member carries the "Invite people" sheet's own button, decided by
 * the sheet's own `inviteRowButton` (join-copy.ts) from the `invite` the
 * route now sends with each row: Invite, Invited ✓ with Undo, Approve
 * request, Declined or Invited enough until a date, Not eligible with the
 * reason. "Invite followers" at the top opens that sheet itself (search,
 * pending invites), and closing it re-reads this list. Inviting is the
 * row's main action now, so Remove became the quiet text beside it.
 *
 * NOTHING HERE IS OPTIMISTIC, like the sheet: a row flips when the server
 * answers, and a refusal that names a state flips the row to it. One that
 * needs a date or a request id the reply doesn't carry (vibeRequest keeps
 * only `code` and `error`) re-reads the list. Deny lives on Join requests,
 * one tap from here; this screen only approves. When the club can't invite
 * at all (hidden, not verified yet) or the standings couldn't be read, one
 * line says so and no row offers Invite; the list and Remove still work.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { LoadFailed, asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { OrgInviteSheet } from "@/components/orgs/OrgInviteSheet";
import {
  busyStyle,
  pillStyle,
  primaryButtonStyle,
  quietStyle,
  textActionStyle,
} from "@/components/orgs/club-tool-styles";
import { vibeRequest, type VibeFailure } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import type { FollowerInvite, FollowerInviteState } from "@/lib/orgs/follower-invite";
import {
  ORG_COPY,
  fillCopy,
  followsSinceText,
  inviteRowButton,
  orgErrorCopy,
  type InviteRowButton,
} from "@/lib/orgs/join-copy";
import type { OrgAudience } from "@/lib/orgs/join-state";

import { ConfirmSheet, EmptyLine, ListSkeleton, PersonLine, cardStyle, chipStyle, rowItemStyle } from "./tools-ui";
import type { FollowerRow, ToolsClub } from "./types";

/** A follower row as this screen keeps it: the route's row plus its invite standing. */
type Row = FollowerRow & { invite: FollowerInvite | null };

type BlockedReason = "org_hidden" | "org_unverified" | null;

type FollowersPage = {
  followers?: unknown[];
  next_cursor?: string | null;
  follower_count?: number | null;
  can_invite?: unknown;
  blocked_reason?: unknown;
  invite_read_failed?: unknown;
};

/** The route's invite facts about the whole list, from the newest page read. */
type InviteGate = { canInvite: boolean; blockedReason: BlockedReason; failed: boolean };

const LOAD_LINE = "Couldn't load followers.";
const COPY = ORG_COPY.inviteSheet;
const STANDING_FAILED = "Couldn't check who can be invited.";

/** The club page's phone breakpoint (ToolsIndex): a sheet below it, a window above. */
const PHONE_QUERY = "(max-width: 720px)";

const STATES: ReadonlySet<string> = new Set(["invited", "requested", "declined_recently", "invite_cap_reached", "none"]);

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * A row's `invite`, read defensively like the sheet's `parseCandidates`: a
 * state this screen doesn't know offers no tap ("Not eligible"), never Invite.
 */
function parseInvite(raw: unknown): FollowerInvite | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const known = typeof o.state === "string" && STATES.has(o.state);
  return {
    state: known ? (o.state as FollowerInviteState) : "none",
    eligible: known && o.eligible === true,
    reason: o.reason === "audience_iu" || o.reason === "audience_purdue" || o.reason === "unverified" ? o.reason : null,
    available_at: str(o.available_at),
    request_id: str(o.request_id),
    removed_before: o.removed_before === true,
    can_approve: typeof o.can_approve === "boolean" ? o.can_approve : null,
  };
}

function toRows(raw: unknown[]): Row[] {
  return raw.flatMap((item) => {
    if (item === null || typeof item !== "object") return [];
    const row = item as FollowerRow & { invite?: unknown };
    if (typeof row.id !== "string") return [];
    return [{ ...row, invite: row.member_role != null ? null : parseInvite(row.invite) }];
  });
}

function gateOf(d: FollowersPage): InviteGate {
  const b = d.blocked_reason;
  return {
    canInvite: d.can_invite === true,
    blockedReason: b === "org_hidden" || b === "org_unverified" ? b : null,
    failed: d.invite_read_failed === true,
  };
}

/** A later page can repeat a row the first one had (someone re-followed): keep the first. */
function appendNew(rows: Row[], more: Row[]): Row[] {
  const seen = new Set(rows.map((r) => r.id));
  const out = rows.slice();
  for (const r of more) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

/** `audience_mismatch` names the university only in its sentence (the sheet's `reasonFromRefusal`). */
function audienceReason(r: VibeFailure, audience: OrgAudience): "audience_iu" | "audience_purdue" {
  const error = r.error ?? "";
  if (/open to Purdue students only\.?$/.test(error)) return "audience_purdue";
  if (/open to IU students only\.?$/.test(error)) return "audience_iu";
  return audience === "purdue" ? "audience_purdue" : "audience_iu";
}

function toastRefusal(r: VibeFailure): void {
  toast({ message: r.message, tone: "error", action: r.action });
}

export function FollowersScreen({ club }: { club: ToolsClub }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [gate, setGate] = useState<InviteGate | null>(null);
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirm, setConfirm] = useState<Row | null>(null);
  /** One row action at a time (Remove, Invite, Undo, Approve), like the sheet. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /** Invites this screen sent, by user id, so "Invited ✓" can offer Undo. */
  const [sent, setSent] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<"sheet" | "modal" | null>(null);
  /**
   * "Invite followers", where focus goes back when the desktop modal closes
   * (Oct 22, 2026). The modal takes focus into its search on open but never
   * hands it back, so without this a keyboard user lands on <body> and has
   * to Tab from the top of the page. The phone sheet (vaul) restores focus
   * itself.
   */
  const inviteButtonRef = useRef<HTMLButtonElement | null>(null);
  const aliveRef = useRef(true);
  /**
   * How many rows are on screen (null: none yet). A re-read keeps up to the
   * route's page cap of them in place, and its failure is a toast, not the
   * error page.
   */
  const shownRef = useRef<number | null>(null);
  const orgBase = `/api/orgs/${encodeURIComponent(club.handle)}`;
  const base = `${orgBase}/followers`;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    shownRef.current = rows === null ? null : rows.length;
  }, [rows]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // A re-read (the invite sheet closed, a refusal named a new state)
      // asks for as many rows as are showing, up to the route's cap of 50
      // (PAGE_LIMIT_MAX), so an officer 40 rows down isn't sent back to 30.
      const limit = Math.min(50, Math.max(30, shownRef.current ?? 0));
      const r = await vibeRequest<FollowersPage>(`${base}?limit=${limit}`, { cache: "no-store", quiet: true, failure: LOAD_LINE });
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.followers)) {
        setLoadErr(null);
        // The server's order (first followed, newest first), never re-sorted here.
        setRows(toRows(r.data.followers));
        setCursor(r.data.next_cursor ?? null);
        setCount(typeof r.data.follower_count === "number" ? r.data.follower_count : null);
        setGate(gateOf(r.data));
        return;
      }
      // A failed re-read (after the invite sheet closes) keeps the rows on
      // screen and says so; a failed first read is the error page with Retry.
      const failure = asLoadFailure(r, LOAD_LINE);
      if (shownRef.current !== null) toast({ message: failure.message, tone: "error", action: failure.action });
      else setLoadErr(failure);
    })();
    return () => {
      cancelled = true;
    };
  }, [base, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const r = await vibeRequest<FollowersPage>(`${base}?limit=30&cursor=${encodeURIComponent(cursor)}`, {
      cache: "no-store",
      quiet: true,
      failure: LOAD_LINE,
    });
    if (!aliveRef.current) return;
    setLoadingMore(false);
    if (r.ok && Array.isArray(r.data.followers)) {
      const more = toRows(r.data.followers);
      setRows((prev) => appendNew(prev ?? [], more));
      setCursor(r.data.next_cursor ?? null);
      if (typeof r.data.follower_count === "number") setCount(r.data.follower_count);
      setGate(gateOf(r.data));
      return;
    }
    const failure = asLoadFailure(r, LOAD_LINE);
    toast({ message: failure.message, tone: "error", action: failure.action });
  };

  /** What a tap learned about one row's standing. */
  const patchInvite = (userId: string, patch: Partial<FollowerInvite>) =>
    setRows((prev) =>
      (prev ?? []).map((x) => (x.id === userId && x.invite ? { ...x, invite: { ...x.invite, ...patch } } : x)),
    );
  /** They're in (approved here, or joined meanwhile): the row now says Member. */
  const becameMember = (userId: string) =>
    setRows((prev) =>
      (prev ?? []).map((x) => (x.id === userId ? { ...x, member_role: x.member_role ?? "member", invite: null } : x)),
    );
  const forgetSent = (userId: string) =>
    setSent((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });

  const remove = async (row: Row) => {
    if (busyId) return;
    setBusyId(row.id);
    const r = await vibeRequest<{ removed?: boolean; follower_count?: number | null }>(
      `${base}/${encodeURIComponent(row.id)}`,
      { method: "DELETE", quiet: true, failure: "Couldn't remove this follower." },
    );
    if (!aliveRef.current) return;
    setBusyId(null);
    setConfirm(null);
    if (r.ok) {
      setRows((prev) => (prev ?? []).filter((x) => x.id !== row.id));
      // No number: the count read failed on the way back; show none rather than one too many.
      setCount(typeof r.data.follower_count === "number" ? r.data.follower_count : null);
      // removed:false means they had already unfollowed; the row just goes.
      if (r.data.removed === true) toast({ message: "Follower removed.", tone: "info" });
      return;
    }
    if (r.code === "member_follows") {
      // They joined meanwhile: their row now says Member.
      becameMember(row.id);
      toast({ message: `${orgErrorCopy("member_follows")} Remove them from Members instead.`, tone: "error" });
      return;
    }
    const line = r.status === 429 ? "Too many tries. Try again in a minute." : (orgErrorCopy(r.code) ?? r.message);
    toast({ message: r.action ? r.message : line, tone: "error", action: r.action });
  };

  // ── Invite, Undo, Approve: the sheet's three row actions and its refusals ──

  const invite = async (row: Row) => {
    if (busyId) return;
    setBusyId(row.id);
    const r = await vibeRequest<{ already?: unknown; invite?: unknown }>(`${orgBase}/invites`, {
      method: "POST",
      json: { user_id: row.id },
      quiet: true,
      failure: COPY.inviteFailed,
    });
    if (!aliveRef.current) return;
    setBusyId(null);
    if (r.ok) {
      const already = r.data.already === true;
      // An invite that was already out isn't this screen's to undo: the row
      // reads a plain "Invited", and revoking stays in the sheet's Pending invites.
      const made = r.data.invite;
      const inviteId = already || !made || typeof made !== "object" ? null : str((made as { id?: unknown }).id);
      if (inviteId) setSent((prev) => ({ ...prev, [row.id]: inviteId }));
      patchInvite(row.id, { state: "invited" });
      if (!already) toast({ message: COPY.sent, tone: "info" });
      return;
    }
    if (r.status === 429) {
      // The server names which limit it was (this officer, the club, or the student).
      toast({ message: r.error?.trim() || COPY.tooManyInvites, tone: "error" });
      return;
    }
    switch (r.code) {
      case "already_member":
        becameMember(row.id);
        return;
      case "has_pending_request":
        // The request id isn't in what vibeRequest keeps; the re-read brings it.
        patchInvite(row.id, { state: "requested", request_id: null });
        reload();
        return;
      case "recently_declined":
        patchInvite(row.id, { state: "declined_recently", available_at: null });
        reload();
        return;
      case "invite_cap_reached":
        patchInvite(row.id, { state: "invite_cap_reached", available_at: null });
        reload();
        return;
      case "audience_mismatch":
        patchInvite(row.id, { state: "none", eligible: false, reason: audienceReason(r, club.audience) });
        return;
      case "user_not_found":
        // The one 404 for every "no" (an unfinished account, or a block since
        // this list was read): the same "Not eligible" the route would send,
        // and never why.
        patchInvite(row.id, { state: "none", eligible: false, reason: null });
        return;
      case "org_hidden":
      case "org_unverified":
        toast({ message: r.error ?? r.message, tone: "error" });
        // The re-read turns on the line at the top and takes every Invite away.
        reload();
        return;
      default:
        toastRefusal(r);
    }
  };

  const undo = async (row: Row, inviteId: string) => {
    if (busyId) return;
    setBusyId(row.id);
    const r = await vibeRequest(`${orgBase}/invites/${encodeURIComponent(inviteId)}`, {
      method: "DELETE",
      quiet: true,
      failure: COPY.undoFailed,
    });
    if (!aliveRef.current) return;
    setBusyId(null);
    if (r.ok) {
      forgetSent(row.id);
      patchInvite(row.id, { state: "none" });
      toast({ message: COPY.revoked, tone: "info" });
      return;
    }
    if (r.code === "invite_not_pending" || r.code === "invite_not_found") {
      // They already answered it (or it's gone): show what's true now.
      forgetSent(row.id);
      toastRefusal(r);
      reload();
      return;
    }
    toastRefusal(r);
  };

  const approve = async (row: Row) => {
    const requestId = row.invite?.request_id;
    if (busyId || !requestId) return;
    setBusyId(row.id);
    const r = await vibeRequest(`${orgBase}/requests/${encodeURIComponent(requestId)}`, {
      method: "POST",
      json: { action: "approve" },
      quiet: true,
      failure: COPY.approveFailed,
    });
    if (!aliveRef.current) return;
    setBusyId(null);
    if (r.ok) {
      becameMember(row.id);
      toast({ message: COPY.approved, tone: "info" });
      return;
    }
    switch (r.code) {
      case "audience_mismatch":
        patchInvite(row.id, { state: "none", eligible: false, reason: audienceReason(r, club.audience) });
        return;
      case "school_unverified":
        patchInvite(row.id, { state: "none", eligible: false, reason: "unverified" });
        return;
      case "request_not_pending":
      case "request_not_found":
        toastRefusal(r);
        reload();
        return;
      case "removed_needs_admin":
      case "approve_unavailable":
        // The server's sentence says why (never naming a block); the row
        // stops offering the button it just refused.
        toastRefusal(r);
        patchInvite(row.id, { can_approve: false });
        return;
      default:
        toastRefusal(r);
    }
  };

  if (rows === null) {
    if (loadErr) {
      return (
        <LoadFailed
          failure={loadErr}
          onRetry={() => {
            setLoadErr(null);
            reload();
          }}
        />
      );
    }
    return <ListSkeleton rows={5} />;
  }

  // The count includes people the list leaves out for blocks and mutes.
  const someUnlisted = cursor === null && count !== null && rows.length < count;
  const heading = count === null ? null : count === 1 ? "1 follower" : `${count} followers`;

  // The route's word (it reads the same two columns `loadOfficerClub` did);
  // the club's own columns only until a page has answered.
  const blockedReason: BlockedReason = gate
    ? gate.blockedReason
    : club.hidden
      ? "org_hidden"
      : club.verified
        ? null
        : "org_unverified";
  const opensSheet = blockedReason === null && (gate?.canInvite ?? true);
  const rowsInvite = gate?.canInvite === true;
  const gateLine =
    blockedReason === "org_hidden" ? COPY.blockedHidden : blockedReason === "org_unverified" ? COPY.blockedUnverified : null;

  // A request this officer can't approve: no Approve, just where it stands
  // and the requests list's own line, which never says why in terms of a block.
  const buttonFor = (inv: FollowerInvite, sentId: string | null): InviteRowButton =>
    inv.state === "requested" && inv.can_approve === false
      ? {
          kind: "status",
          label: ORG_COPY.buttons.requested,
          sub: ORG_COPY.errors.approveUnavailable,
          disabled: true,
          undo: false,
        }
      : inviteRowButton(inv, { orgName: club.name, canInvite: true, blockedReason: null, sent: sentId !== null });

  const memberItem = (row: Row) => (
    <li key={row.id} style={{ ...rowItemStyle, padding: "10px 14px" }}>
      <PersonLine
        name={row.name}
        handle={row.handle}
        avatarUrl={row.avatar_url}
        sub={followsSinceText(row.follows_since) ?? undefined}
        end={
          <span style={chipStyle}>
            {row.member_role === "owner" ? "Owner" : row.member_role === "admin" ? "Officer" : "Member"}
          </span>
        }
      />
    </li>
  );

  const followerItem = (row: Row) => {
    const who = row.name || (row.handle ? `@${row.handle}` : "this follower");
    const inv = rowsInvite ? row.invite : null;
    const sentId = sent[row.id] ?? null;
    const button = inv ? buttonFor(inv, sentId) : null;
    // Remove's own busy shows in its confirm sheet, not on this row's button.
    const busy = busyId === row.id && confirm === null;
    const removedTag = inv?.state === "requested" && inv.removed_before;
    const tapLocked = button !== null && (button.disabled || busyId !== null);
    return (
      // Two or three controls at 375px: the row wraps them onto their own
      // line (the sheet's request rows do the same) instead of squeezing the name.
      <li key={row.id} style={{ ...rowItemStyle, ...followerRowStyle }}>
        <div style={{ flex: "1 1 150px", minWidth: 0 }}>
          <PersonLine
            name={row.name}
            handle={row.handle}
            avatarUrl={row.avatar_url}
            sub={followsSinceText(row.follows_since) ?? undefined}
          />
          {removedTag || button?.sub ? (
            <div style={underNameStyle}>
              {removedTag ? <span style={chipStyle}>{ORG_COPY.meta.removedBefore}</span> : null}
              {button?.sub ? <span style={subStyle}>{button.sub}</span> : null}
            </div>
          ) : null}
        </div>
        <div style={controlsStyle}>
          {button?.undo && sentId ? (
            <button type="button" disabled={busyId !== null} onClick={() => void undo(row, sentId)} style={undoStyle}>
              {COPY.undo}
            </button>
          ) : null}
          {button ? (
            <button
              type="button"
              className={button.kind === "status" ? undefined : "vibe-press"}
              disabled={tapLocked}
              aria-busy={busy || undefined}
              aria-label={button.kind === "status" ? undefined : `${button.label}: ${who}`}
              onClick={() => {
                if (button.kind === "invite") void invite(row);
                else if (button.kind === "approve") void approve(row);
              }}
              style={{
                ...(button.kind === "status" ? statusPillStyle : rowPillStyle),
                ...(button.kind !== "status" ? busyStyle(tapLocked) : null),
              }}
            >
              {busy ? ORG_COPY.buttons.busy : button.label}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busyId === row.id}
            aria-label={`Remove ${who}`}
            onClick={() => setConfirm(row)}
            style={{ ...removeStyle, ...busyStyle(busyId === row.id) }}
          >
            Remove
          </button>
        </div>
      </li>
    );
  };

  return (
    <>
      <p style={{ ...quietStyle, margin: "0 2px 10px" }}>
        {heading ? `${heading} · ` : null}Only officers can see this list.
      </p>
      {someUnlisted ? (
        <p style={{ ...quietStyle, margin: "0 2px 10px" }}>Some followers aren&rsquo;t listed because of blocks or mutes.</p>
      ) : null}

      {opensSheet ? (
        <button
          ref={inviteButtonRef}
          type="button"
          className="vibe-press"
          onClick={() => setSheet(window.matchMedia(PHONE_QUERY).matches ? "sheet" : "modal")}
          style={{ ...primaryButtonStyle, marginBottom: 14 }}
        >
          Invite followers
        </button>
      ) : null}
      {gateLine ? (
        <p role="status" style={noteStyle}>
          {gateLine}
        </p>
      ) : gate?.failed ? (
        <div role="status" style={{ ...noteStyle, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <span>{STANDING_FAILED}</span>
          <button type="button" onClick={reload} style={textActionStyle}>
            Try again
          </button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyLine>{fillCopy(COPY.noFollowers, { org: club.name })}</EmptyLine>
      ) : (
        <ul style={cardStyle}>{rows.map((row) => (row.member_role != null ? memberItem(row) : followerItem(row)))}</ul>
      )}

      {cursor ? (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
          <button type="button" className="vibe-press" disabled={loadingMore} onClick={() => void loadMore()} style={{ ...pillStyle, ...busyStyle(loadingMore) }}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}

      {confirm ? (
        <ConfirmSheet
          title={`Remove ${confirm.name || (confirm.handle ? `@${confirm.handle}` : "this follower")}?`}
          note={`They'll stop getting ${club.name}'s posts and can't read its Board unless they join. They can follow again, and they aren't told.`}
          confirmLabel="Remove follower"
          busy={busyId !== null}
          onConfirm={() => void remove(confirm)}
          onClose={() => setConfirm(null)}
        />
      ) : null}

      {sheet ? (
        <OrgInviteSheet
          handle={club.handle}
          orgName={club.name}
          audience={club.audience}
          presentation={sheet}
          onClose={() => {
            const wasModal = sheet === "modal";
            setSheet(null);
            // What the sheet changed (invites sent or revoked, a request
            // approved or denied) shows on these rows at once.
            reload();
            // After the modal has unmounted; the button may be gone if the
            // re-read says the club can't invite any more, hence the `?.`.
            if (wasModal) requestAnimationFrame(() => inviteButtonRef.current?.focus({ preventScroll: true }));
          }}
        />
      ) : null}
    </>
  );
}

// ── Looks: theme tokens only (club-tool-styles), so Night follows ───────────

const followerRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: 8,
  rowGap: 2,
  padding: "10px 14px",
};

/** Under the name, lined up with it: the photo (40) and its gap (12). */
const underNameStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  marginTop: 4,
  paddingLeft: 52,
};

const subStyle: CSSProperties = { ...quietStyle, color: "var(--ink-2)" };

const controlsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 2,
  marginLeft: "auto",
  flexShrink: 0,
};

/** The row's one button: an outline pill (the screen's one coral button is "Invite followers"). */
const rowPillStyle: CSSProperties = { ...pillStyle, padding: "0 14px", fontSize: 13.5 };

/** Where they stand when there's nothing to tap: Invited, Declined, Not eligible. */
const statusPillStyle: CSSProperties = {
  ...rowPillStyle,
  border: "1px solid transparent",
  background: "rgba(var(--scrim-rgb),0.05)",
  color: "var(--ink-2)",
  cursor: "default",
};

const removeStyle: CSSProperties = { ...textActionStyle, padding: "0 8px", fontSize: 13 };

const undoStyle: CSSProperties = { ...textActionStyle, padding: "0 8px", fontSize: 13, color: "var(--eyebrow-ink)" };

const noteStyle: CSSProperties = { ...quietStyle, margin: "0 2px 12px", fontSize: 13, color: "var(--ink-2)" };
