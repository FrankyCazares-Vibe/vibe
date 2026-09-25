"use client";

import { useEffect, useState } from "react";

import { clearDraft } from "@/lib/onboarding/draft";
import { isTriggerDefaultHandle } from "@/lib/profile/onboarding-prefill";
import { pushLogoutBody } from "@/lib/pwa/device-push";
import { leaveDeviceClean } from "@/lib/pwa/leave-device-clean";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const DELETE_FAILED = "Couldn't delete your account. Try again in a minute.";
/** Settings' sign-out failure line, word for word. */
const SIGN_OUT_FAILED = "Couldn't sign you out. Try again.";

/**
 * The same address the page above prints. Written out again rather than
 * imported: that constant lives in a server component that pulls in the
 * service-role client, and this file ships to the browser. Exported for the
 * phone onboarding's account sheet, which says the same thing.
 */
export const SUPPORT_EMAIL = "help@connectvibe.app";

/**
 * What a student types to delete an account whose handle is still the
 * placeholder. Signup collects no handle, so until onboarding claims one it
 * is the trigger's `u<32 hex>`, and asking somebody on /auth/school-email to
 * type "@u3f2a9…" back is a trap on the one screen that exists to let them
 * out. The word is only what they type: the request still carries the real
 * handle, so `DELETE /api/me`'s check, and the guard it gives against another
 * site (which can't know the handle), are untouched.
 */
const DELETE_WORD = "delete";

/**
 * Where a deleted account lands: sign-up, so somebody who deleted to start
 * over can, rather than the marketing landing page. Exported so Settings'
 * delete — the path App Review walks, and the one /legal/delete-account
 * describes — lands in the same place and the two can't drift apart.
 */
export const AFTER_DELETE = "/auth/signup";

/**
 * leaveDeviceClean behind our own guard. It promises never to throw and to be
 * done within ~3 s; this makes sure, so a push clean-up problem can't strand
 * a student on a busy Sign out or Delete button: any error is dropped, and
 * after 4 s we move on whatever it's still doing.
 */
function leaveDeviceSafely(opts: { serverDelete: boolean }): Promise<void> {
  return Promise.race([
    Promise.resolve()
      .then(() => leaveDeviceClean(opts))
      .catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, 4000)),
  ]);
}

/**
 * The signed-in student's own handle, read in the browser for the screens
 * with no server half to hand it over (/auth/school-email, the phone
 * onboarding's account sheet). `undefined` while the read is in flight, then
 * the handle, or null when there isn't one to read. users.handle is readable
 * by any signed-in user (the same read ProfileHandleSwitch makes), and the
 * timeout keeps a stalled lookup from leaving the delete box on "Loading…".
 * Pass `userId` when the page already has it, to skip the session read.
 */
export function useOwnHandle(enabled: boolean, userId?: string): string | null | undefined {
  const [handle, setHandle] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      let own: string | null = null;
      try {
        const supabase = getSupabaseBrowserClient();
        let uid = userId;
        if (!uid) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          uid = session?.user.id;
        }
        if (uid) {
          const { data } = await supabase
            .from("users")
            .select("handle")
            .eq("id", uid)
            .abortSignal(AbortSignal.timeout(3000))
            .maybeSingle();
          const h = (data as { handle?: unknown } | null)?.handle;
          own = typeof h === "string" && h.trim() ? h.trim() : null;
        }
      } catch {
        // Nothing to confirm against: the box says so and names the address.
        own = null;
      }
      if (!cancelled) setHandle(own);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId]);

  return handle;
}

export type LeaveAccount = {
  /** The handle is still being read: nothing to confirm against yet. */
  loading: boolean;
  /** What the box asks for: the handle without its `@`, or the word "delete". */
  expected: string;
  /** True when `expected` is the word, because the handle is the placeholder. */
  byWord: boolean;
  /** False when there's no handle at all: the box can't be submitted. */
  canConfirm: boolean;
  confirm: string;
  setConfirm: (value: string) => void;
  matches: boolean;
  deleting: boolean;
  signingOut: boolean;
  /** The delete request failed: shown inside the confirm box. */
  error: string | null;
  /** The sign-out request failed: shown next to Sign out, which stays. */
  signOutError: string | null;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** Closing the confirm box: forget what was typed and any error. */
  reset: () => void;
};

/**
 * Sign out and Delete account, for every screen a student could otherwise be
 * stuck on: /account/suspended, /auth/school-email and the phone onboarding.
 * One copy of the requests, so none of them can drift from the others — or
 * from Settings, whose sign-out and delete these follow, `clearDraft()`
 * included. `handle` is `undefined` while it is still loading.
 */
export function useLeaveAccount(handle: string | null | undefined): LeaveAccount {
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  // Both buttons stay disabled while the page navigates away; re-arm them if
  // the browser restores this page from the back/forward cache.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setDeleting(false);
      setSigningOut(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // We show the handle with its `@` and put it in the placeholder, so most
  // students type the `@` too — and `DELETE /api/me` only trims and lowercases,
  // it doesn't strip one. Drop it here, on the check, or the button they were
  // told to enable stays grey with nothing to explain it. On the screens this
  // serves that isn't an annoyance: it's the only way out of the account.
  const actual = (handle ?? "").trim().replace(/^@+/, "").toLowerCase();
  const byWord = isTriggerDefaultHandle(actual);
  const expected = byWord ? DELETE_WORD : actual;
  const typed = confirm.trim().replace(/^@+/, "").toLowerCase();
  const matches = expected.length > 0 && typed === expected;
  // No handle to type back — the service key is missing on this deploy, the
  // read failed, or the users row was never written for this auth user. With
  // `expected` empty the button can never light up, so the screens say so
  // instead and give the address of a person who can do it.
  const canConfirm = expected.length > 0;

  async function signOut() {
    if (signingOut || deleting) return;
    setSigningOut(true);
    setSignOutError(null);
    let signedOut = false;
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // This device's push address, so the route drops its row too, even
        // one another account left behind on this phone (plan §8 W7).
        body: JSON.stringify(pushLogoutBody()),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      signedOut = res.ok && data.ok === true;
    } catch {
      signedOut = false;
    }
    if (!signedOut) {
      // Stay put, as Settings does: heading to /auth/login anyway could leave
      // a live session behind a page that looks signed out — on a shared
      // phone, for the next person to pick up. The route is idempotent (no
      // session is still a success), so this is only a network or server
      // failure, and trying again is the right advice.
      setSignOutError(SIGN_OUT_FAILED);
      setSigningOut(false);
      return;
    }
    // Only now, with the logout done: take this device off push, close what's
    // still on screen and drop the account's cached data, so the next person
    // on a shared phone starts from nothing. No server delete, because the
    // route already dropped every row and the session it would need is gone
    // (plan §8 W7). It can't throw or navigate and is over within 4 s; Sign
    // out stays busy meanwhile.
    await leaveDeviceSafely({ serverDelete: false });
    // Same as the Settings sign-out: drop every onboarding draft on this
    // browser (no id: the next person to sign in here must not inherit this
    // one's half-typed answers), then hard-reload so the cleared cookie is
    // reflected everywhere.
    clearDraft();
    window.location.href = "/auth/login";
  }

  async function deleteAccount() {
    if (deleting || signingOut || !matches) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        // The real handle, even when the student typed the word: it is what
        // the route compares against.
        body: JSON.stringify({ confirm_handle: actual }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? DELETE_FAILED);
        setDeleting(false);
        return;
      }
    } catch {
      setError(DELETE_FAILED);
      setDeleting(false);
      return;
    }
    // The account is gone. Out here, after the try, on purpose: nothing that
    // happens now may show the delete error for an account that's deleted.
    // Its push rows went with it (the delete cascades), so only this device
    // is left to clean: unsubscribe it and clear its screen and storage (plan
    // §8 W7). Then drop every onboarding draft on this browser.
    await leaveDeviceSafely({ serverDelete: false });
    clearDraft();
    window.location.href = AFTER_DELETE;
  }

  function reset() {
    setConfirm("");
    setError(null);
    setSignOutError(null);
  }

  return {
    loading: handle === undefined,
    expected,
    byWord,
    canConfirm,
    confirm,
    setConfirm,
    matches,
    deleting,
    signingOut,
    error,
    signOutError,
    signOut,
    deleteAccount,
    reset,
  };
}

/**
 * Sign out and Delete account under a card on the light auth screens:
 * /account/suspended, and /auth/school-email once somebody is signed in.
 *
 * Deleting has to live on the suspended page. The proxy sends every page a
 * restricted student asks for to /account/suspended, so Settings — where the
 * delete flow normally lives — is unreachable, and a button that linked there
 * would be a dead end. For a banned student it is the whole point of leaving
 * sign-in open (Franky, 2026-09-22): this is where they get their data back
 * off Vibe, so neither button may ever be behind a condition. The school-email
 * screen is the same kind of wall for somebody who can't or won't verify, and
 * App Review checks that an account can be deleted from inside the app.
 * `DELETE /api/me` wants the handle typed back (it guards against a mis-click
 * and against another site triggering it), so the box shows the student their
 * own handle — or asks for "delete" while it is still the placeholder — and
 * posts the confirmation from here. That route and /api/auth/logout are both
 * on the proxy's short exempt list. The labels are exactly "Sign out" and
 * "Delete account": /legal/delete-account quotes them.
 */
export function SuspendedActions({ handle }: { handle: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const leave = useLeaveAccount(handle);
  const { expected, matches, deleting } = leave;

  return (
    <div className="vibe-auth-recovery">
      <div>
        <button
          type="button"
          onClick={() => void leave.signOut()}
          disabled={leave.signingOut || deleting}
          className="vibe-auth-link"
        >
          {leave.signingOut ? "Signing out…" : "Sign out"}
        </button>{" "}
        — you can sign back in any time.
      </div>
      {leave.signOutError ? (
        <p role="alert" className="vibe-auth-error">
          {leave.signOutError}
        </p>
      ) : null}

      {!open ? (
        <div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="vibe-auth-link"
            style={{ color: "#B83030" }}
          >
            Delete account
          </button>{" "}
          — removes your profile, posts, comments and messages for good.
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
            has decided to press yet. "If you still have Vibe+" covers everyone
            who lands on this box: a suspension leaves billing alone, so
            deleting is what cancels it, while a ban already cancelled it
            (src/lib/moderation/actions.ts) and the ban paragraph on the page
            above says so in as many words — so "if you still have" reads to a
            banned student as the sentence that doesn't apply to her, which is
            the truth. Either way DELETE /api/me deletes the Stripe customer,
            which ends the subscription with no refund.
          */}
          {leave.loading ? (
            <p style={{ fontSize: 13, color: "#5a564f", margin: "0 0 10px" }}>
              Loading…
            </p>
          ) : leave.canConfirm ? (
            <>
              <p style={{ fontSize: 13, color: "#5a564f", margin: "0 0 10px" }}>
                This can&apos;t be undone, and if you still have Vibe+ it&apos;s
                canceled right away — no refund.{" "}
                {leave.byWord ? (
                  <>
                    Type <strong style={{ color: "#1c1c1e" }}>{expected}</strong>{" "}
                    to confirm.
                  </>
                ) : (
                  <>
                    Type your handle{" "}
                    <strong style={{ color: "#1c1c1e" }}>@{expected}</strong> to
                    confirm.
                  </>
                )}
              </p>
              <input
                value={leave.confirm}
                onChange={(e) => leave.setConfirm(e.target.value)}
                placeholder={leave.byWord ? expected : `@${expected}`}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-label={
                  leave.byWord ? `Type ${expected} to confirm` : "Type your handle to confirm"
                }
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
          {leave.error ? (
            <p role="alert" className="vibe-auth-error" style={{ marginBottom: 10 }}>
              {leave.error}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {leave.canConfirm && !leave.loading ? (
              <button
                type="button"
                onClick={() => void leave.deleteAccount()}
                disabled={!matches || deleting}
                style={{
                  padding: "10px 18px",
                  borderRadius: 999,
                  border: "1px solid rgba(220,60,60,0.55)",
                  background:
                    matches && !deleting
                      ? "linear-gradient(180deg, #E04848 0%, #B83030 100%)"
                      : "rgba(220,60,60,0.18)",
                  color: matches && !deleting ? "#fff" : "#B83030",
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: matches && !deleting ? "pointer" : "not-allowed",
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? "Deleting…" : "Permanently delete"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                leave.reset();
              }}
              disabled={deleting}
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
