"use client";

import Link from "next/link";
import { useEffect } from "react";

import { CampusAppShell } from "@/components/campus-app-shell";

type Props = { showSchoolVerifiedBanner: boolean };

export function ProfileMain({ showSchoolVerifiedBanner }: Props) {
  useEffect(() => {
    if (!showSchoolVerifiedBanner || typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (u.searchParams.get("school_verified") !== "1") return;
    u.searchParams.delete("school_verified");
    const qs = u.searchParams.toString();
    window.history.replaceState(
      {},
      "",
      `${u.pathname}${qs ? `?${qs}` : ""}`,
    );
  }, [showSchoolVerifiedBanner]);

  return (
    <CampusAppShell>
      <main
        style={{
          borderRight: "1px solid rgba(28,28,30,0.08)",
          padding: "32px 28px",
          background: "#FAF7F2",
        }}
      >
        {showSchoolVerifiedBanner ? (
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              color: "#1C5C2E",
              background: "rgba(46, 125, 50, 0.1)",
              border: "1px solid rgba(46, 125, 50, 0.35)",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 28,
            }}
          >
            <strong>School email verified.</strong> You’re unlocked for campus.
            Finish your profile below, then explore from the nav.
          </p>
        ) : null}

        <h1
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 32,
            fontWeight: 900,
            color: "#1C1C1E",
            marginBottom: 12,
          }}
        >
          Profile
        </h1>
        <p
          style={{
            fontFamily: "DM Sans, sans-serif",
            color: "#8A8580",
            maxWidth: 480,
            lineHeight: 1.6,
          }}
        >
          Profile grid and edit flow are next. Nothing to show yet for new
          accounts.
        </p>
        <p style={{ marginTop: 24 }}>
          <Link
            href="/campus"
            style={{ color: "#FF5C35", fontWeight: 600, fontSize: 15 }}
          >
            ← Campus home
          </Link>
        </p>
      </main>
    </CampusAppShell>
  );
}
