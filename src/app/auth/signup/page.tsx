import type { Metadata } from "next";

import { CookieNotice } from "@/components/legal/CookieNotice";
import { OpenBeacon } from "@/components/tally/OpenBeacon";
import { formatAccessCode, readTypedAccessCode } from "@/lib/waitlist/access-code";
import { isSignupOpen } from "@/lib/waitlist/signup-open";
import { parseSignupOverride } from "@/lib/waitlist/types";

import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

// The tab name, the search result and the link preview: the root layout's
// card takes its title and description from here.
export const metadata: Metadata = {
  title: "Create your account · Vibe",
  description: "Create your Vibe account with your school email.",
  // The invite email links here with the person's access code in the address.
  // One canonical address keeps that variant out of search results.
  alternates: { canonical: "/auth/signup" },
};

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
  const normalized = raw ? readTypedAccessCode(raw) : null;
  // A code that doesn't read as one (a link cut short: `VIBE-7KQ2`) is still
  // shown, as it came, so the page can say why.
  const initialAccessCode = normalized ? formatAccessCode(normalized) : raw.slice(0, 32);

  return (
    <>
      <SignupForm
        signupOpen={signupOpen}
        initialAccessCode={initialAccessCode}
        probe={override === false}
      />
      {/* Counts this open in Vibe's own day totals. Only `?src=` is read: the access code stays here. */}
      <OpenBeacon page="signup" />
      {/* The one-time cookie notice of the signed-out pages (a notice, nothing to accept). */}
      <CookieNotice />
    </>
  );
}
