"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function SchoolEmailPage() {
  const router = useRouter();
  const [schoolEmail, setSchoolEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [justVerifiedAccount, setJustVerifiedAccount] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("account_verified") === "1") {
      setJustVerifiedAccount(true);
      params.delete("account_verified");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${qs ? `?${qs}` : ""}`,
      );
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    let timeoutId: number | undefined;
    let unsub: (() => void) | undefined;

    void (async () => {
      for (let i = 0; i < 20; i++) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (user) {
          setAuthChecked(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 75));
      }

      if (cancelled) return;

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_evt, session) => {
        if (cancelled) return;
        if (session?.user) {
          setAuthChecked(true);
          subscription.unsubscribe();
          if (timeoutId !== undefined) clearTimeout(timeoutId);
        }
      });
      unsub = () => subscription.unsubscribe();

      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        subscription.unsubscribe();
        void supabase.auth.getUser().then(({ data: { user: u2 } }) => {
          if (cancelled) return;
          if (u2) setAuthChecked(true);
          else router.replace("/auth/login?next=/auth/school-email");
        });
      }, 4000);
    })();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      unsub?.();
    };
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/school-email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolEmail: schoolEmail.trim() }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Request failed.");
        return;
      }
      setMessage(data.message ?? "Check your inbox.");
    } catch {
      setError("Request failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!authChecked) {
    return (
      <p style={{ textAlign: "center", marginTop: 48, color: "#8A8580" }}>
        Loading…
      </p>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", paddingTop: 48 }}>
      {justVerifiedAccount ? (
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: "#1C5C2E",
            background: "rgba(46, 125, 50, 0.1)",
            border: "1px solid rgba(46, 125, 50, 0.35)",
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 20,
          }}
        >
          <strong>You’re confirmed.</strong> Your login email is set. This next
          step is <strong>different</strong>: add a <strong>.edu</strong> address
          so we can verify you’re on campus — we’ll email that address separately.
        </p>
      ) : null}
      <h1
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 32,
          fontWeight: 900,
          color: "#1C1C1E",
          marginBottom: 8,
        }}
      >
        School email
      </h1>
      <p style={{ color: "#8A8580", marginBottom: 16 }}>
        Verify a <strong>.edu</strong> address so we know you’re on campus.
      </p>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.55,
          color: "#5C5853",
          marginBottom: 24,
          padding: "14px 16px",
          background: "rgba(28,28,30,.04)",
          borderRadius: 10,
          border: "1px solid #E4E0D8",
        }}
      >
        This is <strong>not</strong> the same as your login email unless you
        sign up with your school address. Use the inbox for the{" "}
        <strong>.edu</strong> you enter here — that’s where the campus
        verification link goes.
      </p>

      <form
        onSubmit={onSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 14, color: "#1C1C1E" }}>
            Campus / school email <span style={{ color: "#8A8580" }}>(.edu)</span>
          </span>
          <input
            type="email"
            autoComplete="email"
            required
            placeholder="you@indiana.edu"
            value={schoolEmail}
            onChange={(e) => setSchoolEmail(e.target.value)}
            style={inputStyle}
          />
        </label>
        {error ? (
          <p style={{ color: "#B42318", fontSize: 14, margin: 0 }}>{error}</p>
        ) : null}
        {message ? (
          <p style={{ color: "#2E7D32", fontSize: 14, margin: 0 }}>{message}</p>
        ) : null}
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Sending…" : "Send verification link"}
        </button>
      </form>

      <p style={{ marginTop: 20, fontSize: 14, color: "#8A8580" }}>
        <Link href="/" style={linkStyle}>
          Home
        </Link>
      </p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #E4E0D8",
  fontSize: 16,
  background: "#fff",
  color: "#1C1C1E",
};

const buttonStyle: React.CSSProperties = {
  padding: "14px 18px",
  borderRadius: 10,
  border: "none",
  background: "#1C1C1E",
  color: "#fff",
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  marginTop: 4,
};

const linkStyle: React.CSSProperties = {
  color: "#FF5C35",
  textDecoration: "none",
};
