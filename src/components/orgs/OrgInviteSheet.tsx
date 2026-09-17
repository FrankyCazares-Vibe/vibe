"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";

import { LoadFailed, asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { vibeRequest, type VibeFailure } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import {
  ORG_COPY,
  fillCopy,
  followsSinceText,
  inviteRowButton,
  pendingInviteText,
  type InviteCandidateState,
  type InviteIneligibleReason,
} from "@/lib/orgs/join-copy";
import type { OrgAudience } from "@/lib/orgs/join-state";

/**
 * "Invite people" — how an owner or admin invites students to JOIN their club
 * (wave plan `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §6 F5a
 * E; invites spec §5.1). A bottom sheet on phones, a modal on desktop, or
 * inline in the desktop officer settings' Invites tab.
 *
 * IT OPENS ON THE CLUB'S FOLLOWERS. The people most likely to want in are the
 * ones already following, so an empty search lists them (F3's
 * `invite-candidates?source=followers`), newest follow first, with "Show more"
 * paging on the server's cursor. Two letters or more searches everyone.
 *
 * THE ROW BUTTON DECIDES BY `state` FIRST (`inviteRowButton` in join-copy.ts):
 * a member narrowed out of the audience still reads "Member", and somebody
 * who asked to join is approved through their REQUEST (critic A11) — this
 * sheet never sends an invite to a row that says "requested".
 *
 * NOTHING HERE IS OPTIMISTIC. A row flips when the server answers, and a
 * refusal that names a state (already a member, asked to join, declined
 * recently) flips the row to it instead of showing a failure. vibeRequest
 * keeps only `code` and `error` from a refusal, so a flip that needs a
 * `request_id` or `available_at` quietly re-reads the list to pick it up.
 *
 * A failed first load is never "nobody follows": it renders LoadFailed with
 * Retry. A failed reload or "Show more" keeps the rows already on screen.
 */

export type OrgInviteSheetProps = {
  handle: string;
  orgName: string;
  audience: OrgAudience;
  presentation: "sheet" | "modal" | "inline";
  onClose?: () => void;
};

type BlockedReason = "org_hidden" | "org_unverified" | null;

type Candidate = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  major: string | null;
  state: InviteCandidateState;
  eligible: boolean;
  reason: InviteIneligibleReason;
  available_at: string | null;
  request_id: string | null;
  follows_since: string | null;
};

/** One answered list read. `seq` orders it against row patches made since. */
type Page = {
  query: string;
  seq: number;
  users: Candidate[];
  nextCursor: string | null;
  canInvite: boolean;
  blockedReason: BlockedReason;
};

/** What a tap in this sheet learned about a row, newer than any page read before it. */
type RowPatch = Partial<
  Pick<Candidate, "state" | "eligible" | "reason" | "available_at" | "request_id">
> & { seq: number };

type PendingInvite = {
  id: string;
  created_at: string | null;
  invitee: { id: string; name: string | null; handle: string | null; avatar_url: string | null } | null;
  inviterFirstName: string | null;
};

type CandidatesBody = {
  can_invite?: unknown;
  blocked_reason?: unknown;
  next_cursor?: unknown;
  users?: unknown;
};

const COPY = ORG_COPY.inviteSheet;

/** `q` below this length doesn't search (invite-candidates `Q_MIN`). */
const Q_MIN = 2;
const DEBOUNCE_MS = 250;

const CANDIDATE_STATES: ReadonlySet<string> = new Set([
  "member",
  "invited",
  "requested",
  "declined_recently",
  "invite_cap_reached",
  "none",
]);

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Rows missing an id are dropped. A state this client doesn't know renders as
 * "Not eligible" — the one label that offers no tap — rather than as "Invite".
 */
function parseCandidates(raw: unknown): Candidate[] {
  if (!Array.isArray(raw)) return [];
  const out: Candidate[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    const id = str(row?.id);
    if (!row || !id) continue;
    const known = typeof row.state === "string" && CANDIDATE_STATES.has(row.state);
    const reason = row.reason;
    out.push({
      id,
      name: str(row.name),
      handle: str(row.handle),
      avatar_url: str(row.avatar_url),
      major: str(row.major),
      state: known ? (row.state as InviteCandidateState) : "none",
      eligible: known && row.eligible === true,
      reason:
        reason === "audience_iu" || reason === "audience_purdue" || reason === "unverified"
          ? reason
          : null,
      available_at: str(row.available_at),
      request_id: str(row.request_id),
      follows_since: str(row.follows_since),
    });
  }
  return out;
}

function parsePending(raw: unknown): PendingInvite[] {
  if (!Array.isArray(raw)) return [];
  const out: PendingInvite[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    const id = str(row?.id);
    if (!row || !id) continue;
    const invitee = asRecord(row.invitee);
    const inviteeId = str(invitee?.id);
    out.push({
      id,
      created_at: str(row.created_at),
      invitee:
        invitee && inviteeId
          ? {
              id: inviteeId,
              name: str(invitee.name),
              handle: str(invitee.handle),
              avatar_url: str(invitee.avatar_url),
            }
          : null,
      // `invited_by` is already a first name or null (critic A7); null → "an officer".
      inviterFirstName: str(asRecord(row.invited_by)?.name),
    });
  }
  return out;
}

/** `audience_mismatch` names the university only in its sentence. */
function reasonFromRefusal(r: VibeFailure, audience: OrgAudience): InviteIneligibleReason {
  const error = r.error ?? "";
  if (/open to Purdue students only\.?$/.test(error)) return "audience_purdue";
  if (/open to IU students only\.?$/.test(error)) return "audience_iu";
  return audience === "purdue" ? "audience_purdue" : "audience_iu";
}

function toastRefusal(r: VibeFailure): void {
  toast({ message: r.message, tone: "error", action: r.action });
}

export function OrgInviteSheet({
  handle,
  orgName,
  audience,
  presentation,
  onClose,
}: OrgInviteSheetProps): JSX.Element {
  const base = `/api/orgs/${encodeURIComponent(handle)}`;
  const name = orgName.trim() || "this org";
  const dark = presentation === "inline";
  const t = dark ? DARK : LIGHT;

  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const pressedBackdropRef = useRef(false);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // The desktop modal takes the keyboard: focus the search, Escape closes.
  // (Not the phone sheet, where focusing would throw the keyboard up over the list.)
  useEffect(() => {
    if (presentation !== "modal") return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presentation]);

  // What's typed, and what's been still for DEBOUNCE_MS. Everything reads the second.
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  /** Bumped to re-read the current list, keeping its rows on screen meanwhile. */
  const [listTick, setListTick] = useState(0);
  const [page, setPage] = useState<Page | null>(null);
  const [pageErr, setPageErr] = useState<{ query: string; failure: LoadFailure } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreErr, setMoreErr] = useState<{ query: string; failure: LoadFailure } | null>(null);
  const [patches, setPatches] = useState<Record<string, RowPatch>>({});
  /** Invites this sheet sent, by user id, so "Invited ✓" can offer Undo. */
  const [sent, setSent] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  /** Orders page reads against row patches; only touched in effects and handlers. */
  const seqRef = useRef(0);
  const pageRef = useRef<Page | null>(null);
  const moreCtrlRef = useRef<AbortController | null>(null);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  // One AbortController per query: typing past a query cancels its read.
  useEffect(() => {
    if (query.length > 0 && query.length < Q_MIN) return;
    const ctrl = new AbortController();
    const seq = ++seqRef.current;
    void (async () => {
      const url =
        query.length >= Q_MIN
          ? `${base}/invite-candidates?q=${encodeURIComponent(query)}`
          : `${base}/invite-candidates?source=followers`;
      const r = await vibeRequest<CandidatesBody>(url, {
        cache: "no-store",
        quiet: true,
        failure: COPY.loadFailed,
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      if (r.ok && Array.isArray(r.data.users)) {
        const blocked = r.data.blocked_reason;
        setPageErr(null);
        setMoreErr(null);
        setPage({
          query,
          seq,
          users: parseCandidates(r.data.users),
          nextCursor: query.length === 0 ? str(r.data.next_cursor) : null,
          canInvite: r.data.can_invite !== false,
          blockedReason: blocked === "org_hidden" || blocked === "org_unverified" ? blocked : null,
        });
        return;
      }
      const failure = asLoadFailure(r, COPY.loadFailed);
      // Rows for this query already on screen stay; the toast says the re-read failed.
      if (pageRef.current?.query === query) toast({ ...failure, tone: "error" });
      else setPageErr({ query, failure });
    })();
    return () => {
      ctrl.abort();
      moreCtrlRef.current?.abort();
    };
  }, [base, query, listTick]);

  const [pendingTick, setPendingTick] = useState(0);
  const [pending, setPending] = useState<{ items: PendingInvite[]; loadedAt: number } | null>(null);
  const [pendingErr, setPendingErr] = useState<LoadFailure | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const r = await vibeRequest<{ invites?: unknown }>(`${base}/invites`, {
        cache: "no-store",
        quiet: true,
        failure: COPY.pendingLoadFailed,
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      if (r.ok && Array.isArray(r.data.invites)) {
        setPendingErr(null);
        setPending({ items: parsePending(r.data.invites), loadedAt: Date.now() });
      } else if (pendingRef.current) {
        toast({ ...asLoadFailure(r, COPY.pendingLoadFailed), tone: "error" });
      } else {
        setPendingErr(asLoadFailure(r, COPY.pendingLoadFailed));
      }
    })();
    return () => ctrl.abort();
  }, [base, pendingTick]);

  const patchRow = (userId: string, patch: Omit<RowPatch, "seq">) => {
    const seq = ++seqRef.current;
    setPatches((prev) => ({ ...prev, [userId]: { ...patch, seq } }));
  };
  const forgetSent = (userId: string) =>
    setSent((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  const reloadList = () => setListTick((n) => n + 1);
  const reloadPending = () => setPendingTick((n) => n + 1);

  const loadMore = async () => {
    const current = pageRef.current;
    if (!current?.nextCursor || moreBusy) return;
    moreCtrlRef.current?.abort();
    const ctrl = new AbortController();
    moreCtrlRef.current = ctrl;
    setMoreBusy(true);
    setMoreErr(null);
    const r = await vibeRequest<CandidatesBody>(
      `${base}/invite-candidates?source=followers&cursor=${encodeURIComponent(current.nextCursor)}`,
      { cache: "no-store", quiet: true, failure: COPY.loadMoreFailed, signal: ctrl.signal },
    );
    setMoreBusy(false);
    if (ctrl.signal.aborted) return;
    if (r.ok && Array.isArray(r.data.users)) {
      const more = parseCandidates(r.data.users);
      setPage((prev) => {
        // A newer read replaced the list while this page was in flight.
        if (!prev || prev.query !== current.query || prev.seq !== current.seq) return prev;
        const seen = new Set(prev.users.map((u) => u.id));
        return {
          ...prev,
          users: [...prev.users, ...more.filter((u) => !seen.has(u.id))],
          nextCursor: str(r.data.next_cursor),
        };
      });
    } else {
      setMoreErr({ query: current.query, failure: asLoadFailure(r, COPY.loadMoreFailed) });
    }
  };

  const invite = async (c: Candidate) => {
    if (busyId) return;
    setBusyId(c.id);
    const r = await vibeRequest<{ already?: unknown; invite?: unknown }>(`${base}/invites`, {
      method: "POST",
      json: { user_id: c.id },
      quiet: true,
      failure: COPY.inviteFailed,
    });
    setBusyId(null);
    if (r.ok) {
      const already = r.data.already === true;
      // An invite that was already out isn't this sheet's to undo: the row
      // reads a plain "Invited", and revoking stays in Pending invites.
      const inviteId = already ? null : str(asRecord(r.data.invite)?.id);
      if (inviteId) setSent((prev) => ({ ...prev, [c.id]: inviteId }));
      patchRow(c.id, { state: "invited" });
      if (!already) toast({ message: COPY.sent, tone: "info" });
      reloadPending();
      return;
    }
    if (r.status === 429) {
      // The server names which limit it was (this officer, the club, or the
      // student); the sheet's own line is the fallback.
      toast({ message: r.error?.trim() || COPY.tooManyInvites, tone: "error" });
      return;
    }
    switch (r.code) {
      case "already_member":
        patchRow(c.id, { state: "member" });
        return;
      case "has_pending_request":
        // The request id isn't in what vibeRequest keeps; the re-read brings it.
        patchRow(c.id, { state: "requested", request_id: null });
        reloadList();
        return;
      case "recently_declined":
        patchRow(c.id, { state: "declined_recently", available_at: null });
        reloadList();
        return;
      case "invite_cap_reached":
        patchRow(c.id, { state: "invite_cap_reached", available_at: null });
        reloadList();
        return;
      case "audience_mismatch":
        patchRow(c.id, { state: "none", eligible: false, reason: reasonFromRefusal(r, audience) });
        return;
      case "org_hidden":
      case "org_unverified":
        toast({ message: r.error ?? r.message, tone: "error" });
        // The re-read turns on the banner and disables every Invite.
        reloadList();
        return;
      default:
        toastRefusal(r);
    }
  };

  const undo = async (c: Candidate, inviteId: string) => {
    if (busyId) return;
    setBusyId(c.id);
    const r = await vibeRequest(`${base}/invites/${encodeURIComponent(inviteId)}`, {
      method: "DELETE",
      quiet: true,
      failure: COPY.undoFailed,
    });
    setBusyId(null);
    if (r.ok) {
      forgetSent(c.id);
      patchRow(c.id, { state: "none" });
      toast({ message: COPY.revoked, tone: "info" });
      reloadPending();
      return;
    }
    if (r.code === "invite_not_pending" || r.code === "invite_not_found") {
      // They already answered it (or it's gone): show what's true now.
      forgetSent(c.id);
      toastRefusal(r);
      reloadList();
      reloadPending();
      return;
    }
    toastRefusal(r);
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
      patchRow(c.id, { state: "member" });
      toast({ message: COPY.approved, tone: "info" });
      return;
    }
    switch (r.code) {
      case "audience_mismatch":
        patchRow(c.id, { state: "none", eligible: false, reason: reasonFromRefusal(r, audience) });
        return;
      case "school_unverified":
        patchRow(c.id, { state: "none", eligible: false, reason: "unverified" });
        return;
      case "request_not_pending":
      case "request_not_found":
        toastRefusal(r);
        reloadList();
        return;
      default:
        toastRefusal(r);
    }
  };

  const revoke = async (inv: PendingInvite) => {
    if (revokingId) return;
    setRevokingId(inv.id);
    const r = await vibeRequest(`${base}/invites/${encodeURIComponent(inv.id)}`, {
      method: "DELETE",
      quiet: true,
      failure: COPY.revokeFailed,
    });
    setRevokingId(null);
    setConfirmId(null);
    const inviteeId = inv.invitee?.id ?? null;
    if (r.ok) {
      toast({ message: COPY.revoked, tone: "info" });
      setPending((prev) =>
        prev ? { ...prev, items: prev.items.filter((item) => item.id !== inv.id) } : prev,
      );
      if (inviteeId) {
        forgetSent(inviteeId);
        patchRow(inviteeId, { state: "none" });
      }
      return;
    }
    toastRefusal(r);
    if (r.code === "invite_not_pending" || r.code === "invite_not_found") {
      reloadPending();
      reloadList();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const current = page && page.query === query ? page : null;
  const firstFailure = !current && pageErr && pageErr.query === query ? pageErr.failure : null;
  const followersMode = query.length === 0;

  const rowOf = (c: Candidate): Candidate => {
    const patch = patches[c.id];
    // A patch older than this page's read is already reflected in (or
    // overruled by) what the server said.
    if (!patch || !current || patch.seq < current.seq) return c;
    return {
      ...c,
      ...(patch.state !== undefined ? { state: patch.state } : null),
      ...(patch.eligible !== undefined ? { eligible: patch.eligible } : null),
      ...(patch.reason !== undefined ? { reason: patch.reason } : null),
      ...(patch.available_at !== undefined ? { available_at: patch.available_at } : null),
      ...(patch.request_id !== undefined ? { request_id: patch.request_id } : null),
    };
  };

  let list: ReactNode;
  if (query.length > 0 && query.length < Q_MIN) {
    list = <p style={t.note}>{COPY.typeMore}</p>;
  } else if (firstFailure) {
    list = (
      <LoadFailed
        failure={firstFailure}
        tone={dark ? "dark" : "light"}
        onRetry={() => {
          setPageErr(null);
          reloadList();
        }}
      />
    );
  } else if (!current) {
    list = <RowsSkeleton t={t} />;
  } else if (current.users.length === 0) {
    list = (
      <p style={t.note}>
        {followersMode ? fillCopy(COPY.noFollowers, { org: name }) : COPY.noResults}
      </p>
    );
  } else {
    list = (
      <>
        <ul style={listStyle}>
          {current.users.map((raw) => {
            const c = rowOf(raw);
            const sentId = sent[c.id] ?? null;
            const button = inviteRowButton(c, {
              orgName: name,
              canInvite: current.canInvite,
              blockedReason: current.blockedReason,
              sent: sentId !== null,
            });
            const sinceText = followersMode ? followsSinceText(c.follows_since) : null;
            const busy = busyId === c.id;
            return (
              <li key={c.id} style={t.row}>
                <Avatar name={c.name} handle={c.handle} url={c.avatar_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={t.rowName}>{c.name || (c.handle ? `@${c.handle}` : "Student")}</div>
                  <div style={t.rowMeta}>
                    {[c.handle ? `@${c.handle}` : null, c.major].filter(Boolean).join(" · ")}
                  </div>
                  {sinceText ? <div style={t.rowMeta}>{sinceText}</div> : null}
                  {button.sub ? <div style={t.rowSub}>{button.sub}</div> : null}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  {button.undo && sentId ? (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void undo(c, sentId)}
                      style={t.linkButton}
                    >
                      {COPY.undo}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={button.disabled || busyId !== null}
                    aria-busy={busy || undefined}
                    aria-label={busy ? button.label : undefined}
                    onClick={() => {
                      if (button.kind === "invite") void invite(c);
                      else if (button.kind === "approve") void approve(c);
                    }}
                    style={{
                      ...t.rowButton,
                      ...(button.kind === "status" ? t.statusButton : t.primaryButton),
                      cursor: button.disabled || busyId !== null ? "default" : "pointer",
                      opacity: button.kind !== "status" && busyId !== null && !busy ? 0.6 : 1,
                    }}
                  >
                    {busy ? ORG_COPY.buttons.busy : button.label}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {moreErr && moreErr.query === query ? (
          <LoadFailed
            failure={moreErr.failure}
            tone={dark ? "dark" : "light"}
            compact
            onRetry={() => void loadMore()}
          />
        ) : null}
        {followersMode && current.nextCursor ? (
          <button
            type="button"
            disabled={moreBusy}
            onClick={() => void loadMore()}
            style={{ ...t.moreButton, opacity: moreBusy ? 0.6 : 1 }}
          >
            {moreBusy ? COPY.loadingMore : COPY.showMore}
          </button>
        ) : null}
      </>
    );
  }

  const banner =
    current && !current.canInvite ? (
      <p role="status" style={t.banner}>
        {current.blockedReason === "org_hidden" ? COPY.blockedHidden : COPY.blockedUnverified}
      </p>
    ) : null;

  const pendingItems = pending?.items ?? [];
  const pendingSection = (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* The count only once it's known: "(0)" while loading would be a guess. */}
      {pending ? (
        <h3 style={t.sectionLabel}>{fillCopy(COPY.pendingTitle, { n: pendingItems.length })}</h3>
      ) : null}
      {pending === null ? (
        pendingErr ? (
          <LoadFailed
            failure={pendingErr}
            tone={dark ? "dark" : "light"}
            compact
            onRetry={() => {
              setPendingErr(null);
              reloadPending();
            }}
          />
        ) : (
          <RowsSkeleton t={t} count={1} />
        )
      ) : pendingItems.length === 0 ? (
        <p style={t.note}>{COPY.noPending}</p>
      ) : (
        <ul style={listStyle}>
          {pendingItems.map((inv) => {
            const who = inv.invitee;
            const confirming = confirmId === inv.id;
            const busy = revokingId === inv.id;
            return (
              <li key={inv.id} style={{ ...t.row, flexWrap: "wrap" }}>
                <Avatar name={who?.name ?? null} handle={who?.handle ?? null} url={who?.avatar_url ?? null} />
                <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                  <div style={t.rowName}>
                    {who?.name || (who?.handle ? `@${who.handle}` : "Student")}
                  </div>
                  <div style={t.rowMeta}>
                    {pendingInviteText(inv.created_at, inv.inviterFirstName, pending.loadedAt)}
                  </div>
                </div>
                {confirming ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={t.rowSub}>{COPY.revokeConfirm}</span>
                    <button
                      type="button"
                      disabled={revokingId !== null}
                      aria-busy={busy || undefined}
                      aria-label={busy ? COPY.revoke : undefined}
                      onClick={() => void revoke(inv)}
                      style={{ ...t.rowButton, ...t.primaryButton }}
                    >
                      {busy ? ORG_COPY.buttons.busy : COPY.revoke}
                    </button>
                    <button
                      type="button"
                      disabled={revokingId !== null}
                      onClick={() => setConfirmId(null)}
                      style={{ ...t.rowButton, ...t.statusButton, cursor: "pointer" }}
                    >
                      {COPY.keep}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={revokingId !== null}
                    onClick={() => setConfirmId(inv.id)}
                    style={{ ...t.rowButton, ...t.statusButton, cursor: "pointer" }}
                  >
                    {COPY.revoke}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  const body = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <input
        type="search"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={COPY.searchPlaceholder}
        aria-label={COPY.searchPlaceholder}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={40}
        ref={inputRef}
        style={t.input}
      />
      {banner}
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {followersMode ? <h3 style={t.sectionLabel}>{COPY.followersLabel}</h3> : null}
        {list}
      </section>
      {pendingSection}
    </div>
  );

  // ── Presentations ─────────────────────────────────────────────────────────

  if (presentation === "sheet") {
    return (
      <Drawer.Root
        open
        onOpenChange={(open) => {
          if (!open) onClose?.();
        }}
      >
        <Drawer.Portal>
          <Drawer.Overlay style={sheetOverlayStyle} />
          <Drawer.Content style={sheetContentStyle} aria-describedby={undefined}>
            <Drawer.Handle style={sheetHandleStyle} />
            <div
              style={{
                maxHeight: "calc(88dvh - 18px)",
                overflowY: "auto",
                overscrollBehavior: "contain",
              }}
              // Scrolling a long list shouldn't drag the sheet shut.
              data-vaul-no-drag
            >
              <Drawer.Title style={{ ...t.title, padding: "10px 18px 6px" }}>
                {COPY.title}
              </Drawer.Title>
              <div style={{ padding: "4px 18px 18px" }}>{body}</div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  if (presentation === "modal") {
    const modal = (
      <div
        role="presentation"
        // Close on a click that starts AND ends on the backdrop, so selecting
        // text in the search box and releasing outside the card doesn't close it.
        onMouseDown={(e) => {
          pressedBackdropRef.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          // Portaled clicks still bubble through React parents; keep them here.
          e.stopPropagation();
          if (pressedBackdropRef.current && e.target === e.currentTarget) onClose?.();
          pressedBackdropRef.current = false;
        }}
        style={modalOverlayStyle}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          style={modalCardStyle}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "16px 20px 8px",
            }}
          >
            <h2 id={titleId} style={t.title}>
              {COPY.title}
            </h2>
            {onClose ? (
              <button type="button" onClick={onClose} aria-label={COPY.close} style={closeButtonStyle}>
                ×
              </button>
            ) : null}
          </div>
          <div style={{ overflowY: "auto", padding: "4px 20px 20px" }}>{body}</div>
        </div>
      </div>
    );
    // To <body>: a `position: fixed` inside glass (backdrop-filter) or a
    // transform is fixed to that box, not to the window. It only ever opens
    // from a tap, so `document` exists.
    return typeof document === "undefined" ? modal : createPortal(modal, document.body);
  }

  return (
    <section aria-labelledby={titleId} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 id={titleId} style={t.title}>
        {COPY.title}
      </h2>
      {body}
    </section>
  );
}

function Avatar({
  name,
  handle,
  url,
}: {
  name: string | null;
  handle: string | null;
  url: string | null;
}): JSX.Element {
  const initials = (name ?? handle ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      aria-hidden
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        // JSON.stringify quotes the URL, so a ")" in it can't end the url().
        background: url ? `url(${JSON.stringify(url)}) center/cover` : "#FFD3C2",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#1C1C1E",
        fontFamily: "Fraunces, serif",
        fontWeight: 800,
        fontSize: 15,
      }}
    >
      {url ? null : initials}
    </div>
  );
}

function RowsSkeleton({ t, count = 3 }: { t: Theme; count?: number }): JSX.Element {
  return (
    <ul style={listStyle} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} style={t.row}>
          <div style={{ ...t.skeleton, width: 40, height: 40, borderRadius: 999, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...t.skeleton, width: "50%", height: 13, marginBottom: 6 }} />
            <div style={{ ...t.skeleton, width: "70%", height: 11 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Looks ───────────────────────────────────────────────────────────────────
//
// The phone sheet and the desktop modal are cream (like MutualsSheet and the
// ⋯ menus beside them); inline sits in desktop settings' dark glass.

type Theme = {
  title: CSSProperties;
  sectionLabel: CSSProperties;
  note: CSSProperties;
  banner: CSSProperties;
  input: CSSProperties;
  row: CSSProperties;
  rowName: CSSProperties;
  rowMeta: CSSProperties;
  rowSub: CSSProperties;
  rowButton: CSSProperties;
  primaryButton: CSSProperties;
  statusButton: CSSProperties;
  linkButton: CSSProperties;
  moreButton: CSSProperties;
  skeleton: CSSProperties;
};

const FONT = "DM Sans, sans-serif";

const ROW_BUTTON: CSSProperties = {
  minHeight: 40,
  padding: "0 14px",
  borderRadius: 999,
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
  WebkitTapHighlightColor: "transparent",
};

const PRIMARY: CSSProperties = {
  border: "1px solid #FF5C35",
  background: "#FF5C35",
  color: "#fff",
};

const ELLIPSIS: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const LIGHT: Theme = {
  title: { margin: 0, fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 800, color: "#1C1C1E" },
  sectionLabel: {
    margin: 0,
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#8A8580",
  },
  note: { margin: 0, padding: "6px 0", fontFamily: FONT, fontSize: 13, lineHeight: 1.5, color: "#8A8580" },
  banner: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255,92,53,0.08)",
    border: "1px solid rgba(255,92,53,0.25)",
    fontFamily: FONT,
    fontSize: 13,
    lineHeight: 1.45,
    color: "#5C5853",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 44,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid rgba(28,28,30,0.12)",
    background: "#fff",
    color: "#1C1C1E",
    fontFamily: FONT,
    // 16px keeps iOS from zooming in on focus.
    fontSize: 16,
    outline: "none",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 16,
    background: "rgba(255,253,248,0.78)",
    border: "1px solid rgba(28,28,30,0.06)",
  },
  rowName: { ...ELLIPSIS, fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#1C1C1E" },
  rowMeta: { ...ELLIPSIS, fontFamily: FONT, fontSize: 12.5, color: "#8A8580" },
  rowSub: { fontFamily: FONT, fontSize: 12, lineHeight: 1.4, color: "#5C5853" },
  rowButton: ROW_BUTTON,
  primaryButton: PRIMARY,
  statusButton: {
    border: "1px solid rgba(28,28,30,0.10)",
    background: "rgba(28,28,30,0.05)",
    color: "#5C5853",
  },
  linkButton: {
    minHeight: 40,
    padding: "0 8px",
    border: "none",
    background: "transparent",
    color: "#C54323",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "underline",
    cursor: "pointer",
  },
  moreButton: {
    alignSelf: "center",
    minHeight: 40,
    padding: "0 16px",
    borderRadius: 999,
    border: "1px solid rgba(28,28,30,0.12)",
    background: "rgba(255,255,255,0.7)",
    color: "#1C1C1E",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  skeleton: { background: "rgba(28,28,30,0.07)", borderRadius: 6 },
};

const DARK: Theme = {
  ...LIGHT,
  title: { ...LIGHT.title, color: "#fff" },
  sectionLabel: { ...LIGHT.sectionLabel, color: "rgba(255,255,255,0.55)" },
  note: { ...LIGHT.note, color: "rgba(255,255,255,0.62)" },
  banner: {
    ...LIGHT.banner,
    background: "rgba(255,92,53,0.12)",
    border: "1px solid rgba(255,92,53,0.32)",
    color: "rgba(255,255,255,0.85)",
  },
  input: {
    ...LIGHT.input,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    fontSize: 14,
  },
  row: {
    ...LIGHT.row,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  rowName: { ...LIGHT.rowName, color: "#fff" },
  rowMeta: { ...LIGHT.rowMeta, color: "rgba(255,255,255,0.55)" },
  rowSub: { ...LIGHT.rowSub, color: "rgba(255,255,255,0.7)" },
  statusButton: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.85)",
  },
  linkButton: { ...LIGHT.linkButton, color: "#FF9D7E" },
  moreButton: {
    ...LIGHT.moreButton,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
  },
  skeleton: { background: "rgba(255,255,255,0.08)", borderRadius: 6 },
};

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

// Bottom-sheet chrome, as MutualsSheet: above the phone tab bar (z 9988).
const sheetOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.42)",
  zIndex: 10000,
};

const sheetContentStyle: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  background: "#FAF7F2",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
  zIndex: 10001,
  outline: "none",
};

const sheetHandleStyle: CSSProperties = {
  margin: "10px auto 4px",
  width: 38,
  height: 4,
  borderRadius: 999,
  background: "rgba(28,28,30,0.18)",
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(8,4,16,0.62)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 10000,
};

const modalCardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  maxHeight: "min(720px, calc(100dvh - 40px))",
  display: "flex",
  flexDirection: "column",
  background: "#FAF7F2",
  borderRadius: 20,
  boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
  overflow: "hidden",
};

const closeButtonStyle: CSSProperties = {
  width: 40,
  height: 40,
  flexShrink: 0,
  borderRadius: 999,
  border: "none",
  background: "rgba(28,28,30,0.06)",
  color: "#1C1C1E",
  fontSize: 22,
  lineHeight: 1,
  cursor: "pointer",
};
