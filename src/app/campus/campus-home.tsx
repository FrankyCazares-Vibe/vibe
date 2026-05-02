"use client";

import Link from "next/link";

import { CampusAppShell } from "@/components/campus-app-shell";

export function CampusHome({
  showSchoolVerifiedBanner,
}: {
  showSchoolVerifiedBanner: boolean;
}) {
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
            Next: finish your profile and find your clubs.
          </p>
        ) : null}

        <p
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#FF5C35",
            marginBottom: 12,
          }}
        >
          Campus · IU
        </p>
        <h1
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: "clamp(28px, 4vw, 40px)",
            fontWeight: 900,
            color: "#1C1C1E",
            letterSpacing: "-1px",
            marginBottom: 16,
            lineHeight: 1.1,
          }}
        >
          You’re in.
        </h1>
        <p
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 17,
            lineHeight: 1.55,
            color: "#5C5853",
            maxWidth: 520,
            marginBottom: 24,
          }}
        >
          This is the campus-first build: clubs, orgs, and Discover — not a
          generic social feed. Your timeline stays empty until you follow people
          and join communities.
        </p>
        <ul
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 15,
            color: "#1C1C1E",
            lineHeight: 1.7,
            paddingLeft: 20,
            marginBottom: 28,
          }}
        >
          <li>
            <Link href="/profile" style={{ color: "#FF5C35", fontWeight: 600 }}>
              Profile
            </Link>{" "}
            — your public grid (coming together next).
          </li>
          <li>
            <Link href="/network" style={{ color: "#FF5C35", fontWeight: 600 }}>
              Network
            </Link>{" "}
            — followers & connections.
          </li>
          <li>
            <Link href="/feed" style={{ color: "#FF5C35", fontWeight: 600 }}>
              Feed
            </Link>{" "}
            — empty until you have something to show.
          </li>
        </ul>
        <p style={{ fontSize: 14, color: "#8A8580" }}>
          Account:{" "}
          <Link href="/auth/school-email" style={{ color: "#FF5C35" }}>
            School email settings
          </Link>
        </p>
      </main>
    </CampusAppShell>
  );
}
