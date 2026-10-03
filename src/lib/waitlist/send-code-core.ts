/**
 * "Send a code" as steps, with the database and the email passed in
 * (store.ts gives the real ones), so the order and the undo are unit-tested
 * (send-code-core.test.ts). No `server-only`, no `node:` and no `@/` imports.
 *
 * 1. Mint the invite email's own token (its "take me off the list" link).
 * 2. Issue the code: `public.waitlist_issue_code` stores the code's hash and
 *    the token's hash in one statement, keeping the replaced state.
 * 3. Send the email.
 * 4. If the send fails: revoke the code, which puts the replaced code, claim,
 *    redemption and token back (20261003120000), so a failed "Send a new
 *    code" leaves the person with the code they already had.
 */

/** `expiresAt`: the code's real end, which the email names. */
export type IssuedCode =
  | { ok: true; code: string; email: string; name: string; expiresAt: string }
  | { ok: false; reason: string };

export type SendCodeResult =
  | { outcome: "sent" }
  | { outcome: "skipped"; reason: string }
  | { outcome: "failed"; reason: "send_failed" | "store_failed" };

export type SendCodeSteps = {
  mintToken: () => { token: string; hash: string };
  /** Throws on a database error; `ok: false` is the database saying no. */
  issue: (inviteTokenHash: string) => Promise<IssuedCode>;
  /** Throws when the email didn't go. */
  send: (issued: { code: string; email: string; name: string; expiresAt: string }, inviteToken: string) => Promise<void>;
  /** The undo. Throws on a database error. */
  revoke: (code: string) => Promise<boolean>;
  /** Never given an address, a token or a code. */
  logError: (message: string, detail: unknown) => void;
};

export async function runSendAccessCode(steps: SendCodeSteps): Promise<SendCodeResult> {
  const invite = steps.mintToken();
  let issued: IssuedCode;
  try {
    issued = await steps.issue(invite.hash);
  } catch (err) {
    steps.logError("[waitlist] issue failed", err);
    return { outcome: "failed", reason: "store_failed" };
  }
  if (!issued.ok) return { outcome: "skipped", reason: issued.reason };

  try {
    await steps.send(
      { code: issued.code, email: issued.email, name: issued.name, expiresAt: issued.expiresAt },
      invite.token,
    );
    return { outcome: "sent" };
  } catch (err) {
    steps.logError("[waitlist] invite failed", err);
    try {
      const undone = await steps.revoke(issued.code);
      if (!undone) steps.logError("[waitlist] undo after a failed invite changed nothing", null);
    } catch (undo) {
      steps.logError("[waitlist] undo after a failed invite failed", undo);
    }
    return { outcome: "failed", reason: "send_failed" };
  }
}
