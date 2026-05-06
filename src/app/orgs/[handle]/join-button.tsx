"use client";

import Link from "next/link";
import { useState } from "react";

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

export function OrgProfileJoinButton({
  orgHandle,
  isPublic,
  initialRole,
  initialPending,
  signedIn,
}: {
  orgHandle: string;
  isPublic: boolean;
  initialRole: string | null;
  initialPending: boolean;
  signedIn: boolean;
}) {
  const [role, setRole] = useState(initialRole);
  const [pending, setPending] = useState(initialPending);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!signedIn) {
    // Anonymous — bounce to login with a return param.
    return (
      <Link
        href={`/auth/login?next=${encodeURIComponent(`/orgs/${orgHandle}`)}`}
        style={{
          ...buttonBase,
          color: "#fff",
          background:
            "linear-gradient(180deg, rgba(255,92,53,0.55) 0%, rgba(255,92,53,0.22) 100%)",
        }}
      >
        Sign in to {isPublic ? "join" : "request"}
      </Link>
    );
  }

  if (role) {
    // Already a member — link straight into Campus where the rail surfaces this org.
    return (
      <Link
        href="/campus"
        style={{
          ...buttonBase,
          color: "#fff",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)",
          border: "1px solid rgba(255,255,255,0.16)",
        }}
      >
        Open in Campus
      </Link>
    );
  }

  if (pending) {
    return (
      <span
        style={{
          ...buttonBase,
          color: "rgba(255,255,255,0.7)",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.14)",
          cursor: "default",
        }}
      >
        Request pending
      </span>
    );
  }

  const join = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/orgs/${orgHandle}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data?.ok) {
        setErr(data?.error || "Failed");
        return;
      }
      if (data.joined) setRole(data.role || "member");
      else if (data.pending) setPending(true);
    } catch (e) {
      console.error("[orgs profile] join", e);
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        type="button"
        onClick={join}
        disabled={busy}
        style={{
          ...buttonBase,
          color: "#fff",
          background:
            "linear-gradient(180deg, rgba(255,92,53,0.55) 0%, rgba(255,92,53,0.22) 100%)",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "…" : isPublic ? "Join" : "Request to join"}
      </button>
      {err ? (
        <span style={{ fontSize: 11, color: "#FFD0CC" }}>{err}</span>
      ) : null}
    </div>
  );
}
