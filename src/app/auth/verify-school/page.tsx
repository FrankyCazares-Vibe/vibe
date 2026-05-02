"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/email-confirm-redirect";

function VerifySchoolInner() {
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
    setStatus("working");
    void (async () => {
      try {
        const res = await fetch("/api/auth/school-email/confirm", {
          method: "POST",
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
      } catch {
        setStatus("err");
        setMessage("Request failed.");
      }
    })();
  }, [token]);

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

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", paddingTop: 48 }}>
      <h1
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 32,
          fontWeight: 900,
          color: status === "ok" ? "#1C1C1E" : "#B42318",
          marginBottom: 16,
        }}
      >
        {status === "ok" ? "You're verified" : "Could not verify"}
      </h1>
      <p style={{ color: "#8A8580", marginBottom: 24 }}>{message}</p>
      {status === "ok" ? (
        <Link
          href={`${DEFAULT_POST_LOGIN_PATH}?school_verified=1`}
          style={linkStyle}
        >
          Back to account
        </Link>
      ) : (
        <Link href="/auth/school-email" style={linkStyle}>
          Try again
        </Link>
      )}
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

const linkStyle: React.CSSProperties = {
  color: "#FF5C35",
  textDecoration: "none",
  fontSize: 16,
};
