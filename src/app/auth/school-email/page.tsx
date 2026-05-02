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

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/auth/login?next=/auth/school-email");
        return;
      }
      setAuthChecked(true);
    });
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
      <p style={{ color: "#8A8580", marginBottom: 24 }}>
        Verify a <strong>.edu</strong> address so we know you’re on campus.
      </p>

      <form
        onSubmit={onSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 14, color: "#1C1C1E" }}>.edu email</span>
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
