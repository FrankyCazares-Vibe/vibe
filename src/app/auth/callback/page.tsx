"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { POST_EMAIL_CONFIRM_PATH } from "@/lib/auth/email-confirm-redirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function safeNextPath(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return null;
  }
  return next;
}

/**
 * Email confirm + OAuth: Supabase sends users here with ?code= (PKCE) or
 * occasionally hash tokens. Exchanging in the **browser** ensures @supabase/ssr
 * writes session cookies correctly (Route Handler + cookies() often drops them on redirect).
 */
function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ran = useRef(false);
  const [hint, setHint] = useState("Signing you in…");

  useEffect(() => {
    if (ran.current) return;
    const code = searchParams.get("code");
    const nextParam = safeNextPath(searchParams.get("next"));
    const hash =
      typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    const fromHash = hash ? new URLSearchParams(hash) : null;
    const access_token = fromHash?.get("access_token") ?? null;
    const refresh_token = fromHash?.get("refresh_token") ?? null;

    if (!code && !(access_token && refresh_token)) {
      router.replace("/auth/login?error=auth_callback");
      return;
    }

    ran.current = true;

    void (async () => {
      const supabase = getSupabaseBrowserClient();

      if (code) {
        const lockKey = `vibe_pkce_${code}`;
        if (sessionStorage.getItem(lockKey)) {
          router.replace(nextParam ?? POST_EMAIL_CONFIRM_PATH);
          router.refresh();
          return;
        }
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          router.replace("/auth/login?error=auth_callback");
          return;
        }
        sessionStorage.setItem(lockKey, "1");
      } else if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) {
          router.replace("/auth/login?error=auth_callback");
          return;
        }
      }

      if (typeof window !== "undefined" && window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }

      const dest = nextParam ?? POST_EMAIL_CONFIRM_PATH;
      setHint("Continuing…");
      router.replace(dest);
      router.refresh();
    })();
  }, [router, searchParams]);

  return (
    <p style={{ textAlign: "center", marginTop: 48, color: "#8A8580" }}>
      {hint}
    </p>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <p style={{ textAlign: "center", marginTop: 48, color: "#8A8580" }}>
          Loading…
        </p>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
