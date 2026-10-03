import { formatAccessCode, normalizeAccessCode } from "@/lib/waitlist/access-code";
import { isSignupOpen } from "@/lib/waitlist/signup-open";
import { parseSignupOverride } from "@/lib/waitlist/types";

import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/**
 * Sign-up. The form itself is the client component in signup-form.tsx; this
 * only reads what it needs on the server:
 *
 * - whether sign-up is open for everyone (the `signup_open` switch, or the
 *   dev-only `?signup=open|closed`). Closed, the form shows an Access code
 *   field. The database hook is the real gate either way; this only decides
 *   what the page asks for.
 * - `?access_code=` from the invite email's button, to fill the field. Never
 *   `?code=`: supabase-js would read that as a sign-in callback. Opening the
 *   link uses nothing up; the code is spent only when an account is made.
 *
 * `probe` (the dev override says closed) makes the hook act closed too, so
 * the local browser pass sees the real refusals without flipping the shared
 * switch.
 */
export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;
  const override = parseSignupOverride(first(params.signup), process.env.NODE_ENV);
  const signupOpen = await isSignupOpen(override);

  const raw = first(params.access_code)?.trim() ?? "";
  const normalized = raw ? normalizeAccessCode(raw) : null;
  // A code that doesn't read as one is still shown, so the page can say why.
  const initialAccessCode = normalized ? formatAccessCode(normalized) : raw.slice(0, 32);

  return (
    <SignupForm
      signupOpen={signupOpen}
      initialAccessCode={initialAccessCode}
      probe={override === false}
    />
  );
}
