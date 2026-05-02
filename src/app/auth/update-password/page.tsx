"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      const hash =
        typeof window !== "undefined" ? window.location.hash.slice(1) : "";
      if (!hash) {
        setSessionReady(true);
        return;
      }
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (!access_token || !refresh_token) {
        setSessionReady(true);
        return;
      }
      const { error: err } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (err) {
        setError(err.message);
      }
      window.history.replaceState(null, "", window.location.pathname);
      setSessionReady(true);
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    const { error: updErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    router.push("/auth/login");
    router.refresh();
  }

  if (!sessionReady) {
    return (
      <p style={{ textAlign: "center", marginTop: 48, color: "#8A8580" }}>
        Restoring session…
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
        New password
      </h1>
      <p style={{ color: "#8A8580", marginBottom: 24 }}>
        Choose a new password for your account.
      </p>

      <form
        onSubmit={onSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 14, color: "#1C1C1E" }}>New password</span>
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
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Saving…" : "Update password"}
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
