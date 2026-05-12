"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  getAppShellHomeHref,
  isGlobalFeedSurfaceEnabled,
} from "@/lib/feature-flags";

export function ProfileHtmlBridge() {
  const [message, setMessage] = useState("Loading your profile…");
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // SSR + first-paint render this component on every viewport before
    // the useIsMobile hook in ProfileSwitch flips. If we redirected
    // unconditionally, mobile users would get yanked to the static
    // desktop page before ProfileMobile ever mounted — they'd be
    // permanently stuck on /html/profile.html. Bail on mobile widths;
    // ProfileSwitch will swap us out for ProfileMobile on hydration.
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 899px)").matches
    ) {
      return;
    }
    (async () => {
      try {
        const r = await fetch("/api/me/profile-bootstrap", {
          credentials: "include",
        });
        const data = (await r.json()) as {
          ok?: boolean;
          error?: string;
          vibeUser?: Record<string, unknown>;
        };
        if (cancelled) return;

        if (r.status === 401) {
          window.location.replace(
            `/auth/login?next=${encodeURIComponent("/profile")}`,
          );
          return;
        }

        if (!r.ok || !data?.ok || !data.vibeUser) {
          const detail =
            typeof data?.error === "string" && data.error
              ? data.error
              : `HTTP ${r.status}`;
          setFatal(
            r.status === 404
              ? `We couldn’t load your profile row (${detail}). Try signing out and back in, or contact support if this persists.`
              : `Could not load your profile (${detail}).`,
          );
          setMessage("");
          return;
        }

        localStorage.setItem("vibe_user_v1", JSON.stringify(data.vibeUser));
        // Carry `?welcome=1` (and other passthrough params) into the static
        // page so the Otto tour can pick them up. Without this the bridge
        // strips the query and the tour never fires.
        const incoming = new URLSearchParams(window.location.search);
        const out = new URLSearchParams();
        out.set("app", "1");
        const welcome = incoming.get("welcome");
        if (welcome === "1") out.set("welcome", "1");
        window.location.replace(`/html/profile.html?${out.toString()}`);
      } catch {
        if (!cancelled) {
          setFatal(
            "Network error while loading your profile. Check your connection and try again.",
          );
          setMessage("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (fatal) {
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          maxWidth: 420,
          margin: "0 auto",
          padding: 24,
          fontFamily: "system-ui, sans-serif",
          fontSize: 15,
          color: "#444",
          textAlign: "center",
        }}
      >
        <p style={{ margin: 0, lineHeight: 1.55 }}>{fatal}</p>
        <Link
          href="/auth/login?next=%2Fprofile"
          style={{ color: "#FF5C35", fontWeight: 600 }}
        >
          Sign in again
        </Link>
        <Link href={getAppShellHomeHref()} style={{ color: "#666" }}>
          {isGlobalFeedSurfaceEnabled() ? "Back to feed" : "Back to campus"}
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        fontSize: 15,
        color: "#444",
      }}
    >
      {message}
    </div>
  );
}
