"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { vibeRequest } from "@/lib/feedback/request";

/**
 * The one button of a club link for someone signed in: "Make me the owner"
 * (setup) or "Join <club>" (members), and on /c/welcome "Not now". POST
 * /api/club-links/redeem; on success the page goes where the answer says
 * (the setup list, or the club).
 */
export function ClubLinkAction({
  code,
  label,
  declineLabel,
}: {
  /** The link's code; none on /c/welcome (the link waiting for this account). */
  code: string | null;
  label: string;
  declineLabel?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"go" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(decline: boolean) {
    if (busy) return;
    setBusy(decline ? "decline" : "go");
    setError(null);
    const r = await vibeRequest<{ next?: string }>("/api/club-links/redeem", {
      method: "POST",
      json: { ...(code ? { code } : {}), ...(decline ? { decline: true } : {}) },
      failure: "Couldn't do that. Try again in a minute.",
      // Said here, under the button, not in a toast.
      quiet: true,
    });
    if (!r.ok) {
      setBusy(null);
      // The route's own sentence for a link or club refusal (it always sends
      // one); the general line for anything else (offline, a 500).
      setError(r.status >= 400 && r.status < 500 && r.error ? r.error : r.message);
      return;
    }
    router.push(decline ? "/campus" : (r.data.next ?? "/campus"));
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error ? (
        <p role="alert" className="vibe-auth-error">
          {error}
        </p>
      ) : null}
      <button type="button" className="vibe-auth-submit vibe-press" disabled={busy !== null} onClick={() => void send(false)}>
        {busy === "go" ? "One moment…" : label}
      </button>
      {declineLabel ? (
        <button
          type="button"
          className="vibe-auth-disclosure"
          disabled={busy !== null}
          onClick={() => void send(true)}
        >
          {declineLabel}
        </button>
      ) : null}
    </div>
  );
}
