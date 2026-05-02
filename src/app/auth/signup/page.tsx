"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { getAuthEmailCallbackUrl } from "@/lib/auth/email-confirm-redirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    const siteOrigin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const { data, error: signErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: getAuthEmailCallbackUrl(siteOrigin),
      },
    });
    setLoading(false);
    if (signErr) {
      setError(signErr.message);
      return;
    }
    if (data.session) {
      router.push("/onboarding");
      router.refresh();
      return;
    }
    setMessage(
      "Check this inbox for a confirmation link. After you click it, you’ll meet Otto to set up your profile — then we’ll ask for your school email to unlock campus.",
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
        Sign up
      </h1>
      <p style={{ color: "#8A8580", marginBottom: 16 }}>
        Create your <span style={{ color: "#FF5C35" }}>vibe.</span> account
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
        <strong style={{ color: "#1C1C1E" }}>Two different emails:</strong> this
        page is your <strong>login email</strong> (any address you can use for
        sign-in). After you confirm it, <strong>Otto</strong> walks you through
        your profile. Then we’ll ask for a separate <strong>.edu school
        email</strong> to unlock campus (second verification).
      </p>

      <form
        onSubmit={onSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 14, color: "#1C1C1E" }}>
            Login email{" "}
            <span style={{ color: "#8A8580", fontWeight: 400 }}>
              (sign-in & account mail)
            </span>
          </span>
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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>

      <p style={{ marginTop: 20, fontSize: 14, color: "#8A8580" }}>
        Already have an account?{" "}
        <Link href="/auth/login" style={linkStyle}>
          Log in
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
