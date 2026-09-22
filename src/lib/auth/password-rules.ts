/**
 * Password length rules for signup and reset (E1b). Pure, no imports:
 * `TextEncoder` is a global in Node and in browsers.
 *
 * WHY 72, AND WHY BYTES. GoTrue refuses a password longer than 72 BYTES of
 * UTF-8 (bcrypt reads only 72) with 400 `validation_failed`, "Password cannot
 * be longer than 72 characters", and has no config key for it. The old
 * client cap of 20 was ours alone. So: 8 to 72 characters, counted in code
 * points, plus a byte check so an emoji-heavy password is stopped here with
 * copy that says why, instead of by GoTrue.
 *
 * Nothing trims the password, and nothing here is ever a `maxLength`: that
 * silently cut pasted passwords, so a password manager saved a credential the
 * student never saw and couldn't reproduce at sign-in.
 *
 * Sign-in has no cap and gets none. Raising the cap can't lock anyone out:
 * GoTrue has always refused anything over 72 bytes.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

export const PASSWORD_HINT = "8–72 characters";
export const PASSWORD_TOO_SHORT = "Password must be at least 8 characters.";
export const PASSWORD_TOO_LONG = "Password must be 72 characters or fewer.";
export const PASSWORD_TOO_LONG_BYTES =
  "That password is too long. Emoji and accented letters count extra, so use fewer of them or a shorter password.";

export type PasswordLengthProblem = {
  kind: "short" | "long" | "long_bytes";
  message: string;
};

/** UTF-8 bytes, the unit GoTrue and bcrypt count. */
export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

/**
 * What's wrong with the length, or null. Checks in order: fewer than 8 code
 * points, more than 72 code points, more than 72 UTF-8 bytes.
 */
export function passwordLengthProblem(password: string): PasswordLengthProblem | null {
  const chars = [...password].length;
  if (chars < MIN_PASSWORD_LENGTH) return { kind: "short", message: PASSWORD_TOO_SHORT };
  if (chars > MAX_PASSWORD_BYTES) return { kind: "long", message: PASSWORD_TOO_LONG };
  if (passwordByteLength(password) > MAX_PASSWORD_BYTES) {
    return { kind: "long_bytes", message: PASSWORD_TOO_LONG_BYTES };
  }
  return null;
}

/** GoTrue's over-72 refusal, so callers show our copy instead of "pick a stronger one". */
export function isPasswordTooLongError(
  err: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  return err?.code === "validation_failed" && /longer than/i.test(err.message ?? "");
}
