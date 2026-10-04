"use client";

import { useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

import { parseSignupOverride } from "./types";

/**
 * Is sign-up open for everyone? For client pages that link to sign-up (the
 * login page, the email-link cards). Asks `public.signup_is_open()` with the
 * public key (it is public information; the gate itself is the database
 * hook, never this). The dev-only `?signup=open|closed` on the page's own
 * address wins outside production, for the local browser pass.
 *
 * null while it asks: until they know, callers show the closed wording (the
 * email-link card, whose closed line has no waitlist in it) or nothing (the
 * login page), so nobody is sent to a sign-up form that would refuse them.
 * An error also reads as closed.
 */
export function useSignupOpen(): boolean | null {
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const override = parseSignupOverride(
      new URLSearchParams(window.location.search).get("signup"),
      process.env.NODE_ENV,
    );
    const ask: PromiseLike<boolean> =
      override !== null
        ? Promise.resolve(override)
        : getSupabaseBrowserClient()
            .rpc("signup_is_open")
            .then(
              ({ data, error }) => !error && data === true,
              () => false,
            );
    void Promise.resolve(ask).then((value) => {
      if (!cancelled) setOpen(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return open;
}
