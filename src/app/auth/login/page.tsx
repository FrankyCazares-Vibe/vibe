"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/email-confirm-redirect";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const urlError = searchParams.get("error");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signErr) {
      setError(signErr.message);
      return;
    }
    const next = searchParams.get("next");
    router.push(
      next?.startsWith("/") && !next.startsWith("//")
        ? next
        : DEFAULT_POST_LOGIN_PATH,
    );
    router.refresh();
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
        Log in
      </h1>
      <p style={{ color: "#8A8580", marginBottom: 24 }}>
        Welcome back to{" "}
        <span style={{ color: "#FF5C35" }}>vibe.</span>
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
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 14, color: "#1C1C1E" }}>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </label>
        {error ? (
          <p style={{ color: "#B42318", fontSize: 14, margin: 0 }}>{error}</p>
        ) : null}
        {urlError === "auth_callback" ? (
          <p style={{ color: "#B42318", fontSize: 14, margin: 0 }}>
            That confirmation link is invalid or expired. Sign in if you
            already confirmed your email, or sign up again.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          style={buttonStyle}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p style={{ marginTop: 20, fontSize: 14, color: "#8A8580" }}>
        <Link href="/auth/forgot-password" style={linkStyle}>
          Forgot password?
        </Link>
        {" · "}
        <Link href="/auth/signup" style={linkStyle}>
          Create account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <p style={{ textAlign: "center", marginTop: 48, color: "#8A8580" }}>
          Loading…
        </p>
      }
    >
      <LoginForm />
    </Suspense>
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
