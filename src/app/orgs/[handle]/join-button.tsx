"use client";

import Link from "next/link";
import { useState } from "react";

import { vibeRequest } from "@/lib/feedback/request";
import type {
  JoinDisplayState,
  JoinPolicy,
  OrgAudience,
} from "@/lib/orgs/join-state";

const buttonBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 18px",
  borderRadius: 12,
  fontFamily: "DM Sans, sans-serif",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  textDecoration: "none",
  border: "1px solid rgba(255,180,150,0.5)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)",
};

const actionStyle: React.CSSProperties = {
  ...buttonBase,
  color: "#fff",
  background:
    "linear-gradient(180deg, rgba(255,92,53,0.55) 0%, rgba(255,92,53,0.22) 100%)",
};

const quietStyle: React.CSSProperties = {
  ...buttonBase,
  color: "rgba(255,255,255,0.7)",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.14)",
  cursor: "default",
};

/** The one line a failed tap shows, by what the tap was trying to do. */
const FAILURE_COPY: Partial<Record<JoinDisplayState, string>> = {
  invited: "Couldn't accept the invite.",
  can_join: "Couldn't join this org.",
  can_request: "Couldn't send your join request.",
};

/**
 * The org page's join control. It renders the server's join decision
 * (`orgJoinState`, `join-state.ts`) and never re-derives it: before this, the
 * button read `is_public` and offered "Request to join" on invite-only clubs,
 * which the join route answers with 403 `invite_only`.
 *
 * `joinState` is null when the page couldn't load the viewer's membership, so
 * a member is never shown a door they already walked through.
 */
export function OrgProfileJoinButton({
  orgHandle,
  signedIn,
  joinState,
  joinPolicy,
  audience,
}: {
  orgHandle: string;
  signedIn: boolean;
  joinState: JoinDisplayState | null;
  joinPolicy: JoinPolicy;
  audience: OrgAudience;
}) {
  const [state, setState] = useState<JoinDisplayState | null>(
    signedIn ? joinState : "signed_out",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (state === "signed_out") {
    // Anonymous — bounce to login with a return param.
    return (
      <Link
        href={`/auth/login?next=${encodeURIComponent(`/orgs/${orgHandle}`)}`}
        style={actionStyle}
      >
        {joinPolicy === "open"
          ? "Sign in to join"
          : joinPolicy === "request"
            ? "Sign in to request"
            : "Sign in"}
      </Link>
    );
  }

  if (state === null) {
    return (
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
        Couldn&apos;t load your membership.
      </span>
    );
  }

  if (state === "member") {
    // Already a member — show a quiet "Joined" badge. The TopNav has the
    // dedicated "Return to Organizations" pill for the back-to-Campus action.
    return (
      <span
        style={{
          ...buttonBase,
          color: "rgba(255,255,255,0.9)",
          background:
            "linear-gradient(180deg, rgba(91,209,140,0.22) 0%, rgba(91,209,140,0.08) 100%)",
          border: "1px solid rgba(91,209,140,0.45)",
          cursor: "default",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        ✓ Joined
      </span>
    );
  }

  if (state === "requested") {
    return <span style={quietStyle}>Request pending</span>;
  }

  if (state === "invite_only" || state === "audience_blocked" || state === "hidden") {
    // Same rule as `orgJoinState`: `both` never blocks a verified student, so
    // a blocked viewer is always looking at one university's club.
    const label =
      state === "invite_only"
        ? "Invite only"
        : state === "hidden"
          ? "Hidden"
          : audience === "purdue"
            ? "Purdue students only"
            : "IU students only";
    return (
      <span aria-disabled="true" style={{ ...quietStyle, opacity: 0.75 }}>
        {label}
      </span>
    );
  }

  if (state === "unverified") {
    return (
      <Link href="/auth/school-email" style={actionStyle}>
        Verify your school email to join
      </Link>
    );
  }

  const join = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const r = await vibeRequest<{ joined?: boolean; pending?: boolean }>(
      `/api/orgs/${encodeURIComponent(orgHandle)}/join`,
      {
        method: "POST",
        json: {},
        quiet: true,
        failure: FAILURE_COPY[state] ?? "Couldn't send your join request.",
      },
    );
    setBusy(false);
    if (r.ok) {
      if (r.data.joined) setState("member");
      else if (r.data.pending) setState("requested");
      return;
    }
    // The server's decision moved since the page rendered: show what it is
    // now instead of a failure line under a button that can't work.
    if (r.code === "invite_only") setState("invite_only");
    else if (r.code === "audience_mismatch") setState("audience_blocked");
    else if (r.code === "school_unverified") setState("unverified");
    else setErr(r.message);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        type="button"
        onClick={() => void join()}
        disabled={busy}
        aria-busy={busy}
        style={{ ...actionStyle, opacity: busy ? 0.6 : 1 }}
      >
        {busy
          ? "…"
          : state === "invited"
            ? "Accept invite"
            : state === "can_join"
              ? "Join"
              : "Request to join"}
      </button>
      {err ? (
        <span style={{ fontSize: 11, color: "#FFD0CC" }}>{err}</span>
      ) : null}
    </div>
  );
}
