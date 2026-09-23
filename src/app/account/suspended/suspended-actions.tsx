"use client";

import { useState } from "react";

import { clearDraft } from "@/lib/onboarding/draft";

const DELETE_FAILED = "Couldn't delete your account. Try again in a minute.";

/**
 * The same address the page above prints. Written out again rather than
 * imported: that constant lives in a server component that pulls in the
 * service-role client, and this file ships to the browser.
 */
const SUPPORT_EMAIL = "help@connectvibe.app";

/**
 * Client half of /account/suspended: the two things a restricted student can
 * still do from here.
 *
 * Deleting has to live on THIS page. The proxy sends every page a restricted
 * student asks for to /account/suspended, so Settings — where the delete flow
 * normally lives — is unreachable, and a button that linked there would be a
 * dead end. For a banned student it is the whole point of leaving sign-in
 * open (Franky, 2026-09-22): this is where they get their data back off Vibe,
 * so neither button may ever be behind a condition. `DELETE /api/me` wants the handle typed back (it guards against a
 * mis-click and against another site triggering it), so the page shows the
 * student their own handle and posts the confirmation from here. That route
 * and /api/auth/logout are both on the proxy's short exempt list.
 */
export function SuspendedActions({ handle }: { handle: string | null }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // We show the handle with its `@` and put it in the placeholder, so most
  // students type the `@` too — and `DELETE /api/me` only trims and lowercases,
  // it doesn't strip one. Drop it here, on both the check and what we send, or
  // the button they were told to enable stays grey with nothing to explain it.
  // On this page that isn't an annoyance: it's the only way out of the account.
  const expected = (handle ?? "").trim().replace(/^@+/, "").toLowerCase();
  const typed = confirm.trim().replace(/^@+/, "").toLowerCase();
  const matches = expected.length > 0 && typed === expected;
  // No handle to type back — the service key is missing on this deploy, or the
  // users row was never written for this auth user. With `expected` empty the
  // button below can never light up, so showing the box at all would be a form
  // that can't be submitted, with nothing on screen explaining why, on the one
  // page that exists to let somebody take their data back. Say so instead, and
  // give them the address of a person who can do it.
  const canConfirm = expected.length > 0;

  async function onSignOut() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // Best effort; the login page copes with a lingering session.
    }
    // Same as the Settings sign-out: drop every onboarding draft on this
    // browser, then hard-reload so the cleared cookie is reflected everywhere.
    clearDraft();
    window.location.href = "/auth/login";
  }

  async function onDelete() {
    if (busy || !matches) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_handle: typed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? DELETE_FAILED);
        setBusy(false);
        return;
      }
      clearDraft();
      window.location.href = "/";
    } catch {
      setError(DELETE_FAILED);
      setBusy(false);
    }
  }

  return (
    <div className="vibe-auth-recovery">
      <div>
        <button type="button" onClick={onSignOut} className="vibe-auth-link">
          Sign out
        </button>{" "}
        on this browser.
      </div>

      {!open ? (
        <div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="vibe-auth-link"
            style={{ color: "#B83030" }}
          >
            Delete your account
          </button>{" "}
          instead — it removes your profile, posts, comments and messages for
          good.
        </div>
      ) : (
        <div
          style={{
            padding: 14,
            borderRadius: 14,
            background: "rgba(220,60,60,0.06)",
            border: "1px solid rgba(220,60,60,0.20)",
          }}
        >
          {/*
            The Vibe+ line is said here rather than in the collapsed row above,
            where it would be a warning about money attached to a button nobody
            has decided to press yet. "If you still have Vibe+" covers both
            students who land on this page: a suspension leaves billing alone,
            so deleting is what cancels it, while a ban already cancelled it
            (src/lib/moderation/actions.ts) and the ban paragraph on the page
            above says so in as many words — so "if you still have" reads to a
            banned student as the sentence that doesn't apply to her, which is
            the truth. Either way DELETE /api/me deletes the Stripe customer,
            which ends the subscription with no refund.
          */}
          {canConfirm ? (
            <>
              <p style={{ fontSize: 13, color: "#5a564f", margin: "0 0 10px" }}>
                This can&apos;t be undone, and if you still have Vibe+ it&apos;s
                canceled right away — no refund. Type your handle{" "}
                <strong style={{ color: "#1c1c1e" }}>@{expected}</strong> to
                confirm.
              </p>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={`@${expected}`}
                autoComplete="off"
                spellCheck={false}
                aria-label="Type your handle to confirm"
                className="vibe-auth-input"
                style={{ marginBottom: 10 }}
              />
            </>
          ) : (
            <p style={{ fontSize: 13, color: "#5a564f", margin: "0 0 10px" }}>
              We couldn&apos;t load your handle, so we can&apos;t take the
              confirmation here. Email{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="vibe-auth-link">
                {SUPPORT_EMAIL}
              </a>{" "}
              from the address you sign in with and we&apos;ll delete the
              account and everything in it for you.
            </p>
          )}
          {error ? <p className="vibe-auth-error">{error}</p> : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {canConfirm ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={!matches || busy}
                style={{
                  padding: "10px 18px",
                  borderRadius: 999,
                  border: "1px solid rgba(220,60,60,0.55)",
                  background:
                    matches && !busy
                      ? "linear-gradient(180deg, #E04848 0%, #B83030 100%)"
                      : "rgba(220,60,60,0.18)",
                  color: matches && !busy ? "#fff" : "#B83030",
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: matches && !busy ? "pointer" : "not-allowed",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? "Deleting…" : "Permanently delete"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirm("");
                setError(null);
              }}
              disabled={busy}
              className="vibe-auth-link"
            >
              Keep my account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
