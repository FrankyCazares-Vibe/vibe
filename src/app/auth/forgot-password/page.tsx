"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setMessage(data.message ?? "Check your email for reset instructions.");
    } catch {
      setError("Request failed.");
    } finally {
      setLoading(false);
    }
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
        Reset password
      </h1>
      <p style={{ color: "#8A8580", marginBottom: 24 }}>
        We’ll email you a link to set a new password (via Resend).
      </p>

      <form
        onSubmit={onSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 14, color: "#1C1C1E" }}>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p style={{ marginTop: 20, fontSize: 14, color: "#8A8580" }}>
        <Link href="/auth/login" style={linkStyle}>
          Back to log in
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
