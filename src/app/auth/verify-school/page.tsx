"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { sanitizeSchoolVerifyNextParam } from "@/lib/auth/login-next";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function VerifySchoolInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const started = useRef(false);
  const [status, setStatus] = useState<"idle" | "working" | "ok" | "err">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    const nextRaw = searchParams.get("next");
    setStatus("working");
    void (async () => {
      try {
        const res = await fetch("/api/auth/school-email/confirm", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          message?: string;
        };
        if (!res.ok || !data.ok) {
          setStatus("err");
          setMessage(data.error ?? "Verification failed.");
          return;
        }
        setStatus("ok");
        setMessage(data.message ?? "Verified.");

        const nextPath =
          sanitizeSchoolVerifyNextParam(nextRaw) ?? "/onboarding";
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
          error: authErr,
        } = await supabase.auth.getUser();

        if (!authErr && user) {
          if (nextPath === "/profile") {
            router.replace("/profile?school_verified=1");
          } else {
            router.replace(nextPath);
          }
          router.refresh();
          return;
        }

        const loginNext =
          nextPath === "/profile"
            ? "/profile?school_verified=1"
            : nextPath;
        router.replace(
          `/auth/login?next=${encodeURIComponent(loginNext)}&school_verified=1`,
        );
      } catch {
        setStatus("err");
        setMessage("Request failed.");
      }
    })();
  }, [router, searchParams, token]);

  if (!token) {
    return (
      <p style={{ color: "#B42318", textAlign: "center", marginTop: 48 }}>
        Missing verification token. Open the link from your email.
      </p>
    );
  }

  if (status === "working" || status === "idle") {
    return (
      <p style={{ textAlign: "center", marginTop: 48, color: "#8A8580" }}>
        Verifying your school email…
      </p>
    );
  }

  if (status === "err") {
    return (
      <div style={{ maxWidth: 400, margin: "0 auto", paddingTop: 48 }}>
        <h1
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 32,
            fontWeight: 900,
            color: "#B42318",
            marginBottom: 16,
          }}
        >
          Could not verify
        </h1>
        <p style={{ color: "#8A8580", marginBottom: 24 }}>{message}</p>
        <Link href="/auth/school-email" style={linkStyle}>
          Try again
        </Link>
      </div>
    );
  }

  const nextPath =
    sanitizeSchoolVerifyNextParam(searchParams.get("next")) ?? "/onboarding";

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", paddingTop: 48 }}>
      <h1
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 32,
          fontWeight: 900,
          color: "#1C5C2E",
          marginBottom: 16,
        }}
      >
        You&apos;re verified
      </h1>
      <p style={{ color: "#8A8580", marginBottom: 24 }}>{message}</p>
      <p style={{ color: "#5C5956", fontSize: 14, marginBottom: 20 }}>
        {nextPath === "/profile"
          ? "Taking you to your profile…"
          : "Taking you to meet Otto — or sign in if this browser isn’t logged in yet."}
      </p>
      <p
        style={{
          color: "#8A8580",
          fontSize: 13,
          lineHeight: 1.55,
          marginBottom: 20,
        }}
      >
        School links often open in your email app&apos;s browser, which doesn&apos;t
        share cookies with Safari or Chrome. If we send you to log in, use your{" "}
        <strong>sign-up email and password</strong> — then we&apos;ll continue
        where you left off.
      </p>
      <Link
        href={
          nextPath === "/profile"
            ? "/profile?school_verified=1"
            : `/auth/login?next=${encodeURIComponent(nextPath)}&school_verified=1`
        }
        style={linkStyle}
      >
        Continue manually
      </Link>
    </div>
  );
}

export default function VerifySchoolPage() {
  return (
    <Suspense
      fallback={
        <p style={{ textAlign: "center", marginTop: 48, color: "#8A8580" }}>
          Loading…
        </p>
      }
    >
      <VerifySchoolInner />
    </Suspense>
  );
}

const linkStyle: CSSProperties = {
  color: "#FF5C35",
  textDecoration: "none",
  fontSize: 16,
};
