import Link from "next/link";

import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { CampusAppShell } from "@/components/campus-app-shell";

export const metadata = {
  title: "otto · Vibe",
  description: "Your AI co-pilot",
};

/**
 * `/otto` shows a placeholder until the real Otto agent is wired. The
 * legacy prototype (`/html/otto.html`) was full of hardcoded recruiter
 * messages and inbox items, which is fine for an anonymous demo but
 * misleading for signed-in users. We surface a clean "in development"
 * state instead and route the contextual Otto features (Heads up,
 * Trending) into the campus right rail where they live for real.
 */
export default async function OttoPage() {
  await enforceCampusAccess("/otto");
  return (
    <CampusAppShell>
      <main
        style={{
          padding: "60px 32px",
          background:
            "linear-gradient(180deg, #0F0B1A 0%, #07050E 100%)",
          minHeight: "100vh",
          color: "#fff",
          fontFamily: "DM Sans, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            maxWidth: 520,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "rgba(255,184,150,0.9)",
              marginBottom: 16,
            }}
          >
            otto · in development
          </div>
          <h1
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 48,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              marginBottom: 16,
            }}
          >
            Your AI co-pilot is on the way.
          </h1>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.65)",
              marginBottom: 28,
            }}
          >
            Otto will surface your most-relevant campus signals — events
            people you trust are going to, posts that match your stack,
            mentions you missed, intros that make sense. We&apos;re
            wiring that brain right now.
          </p>
          <p
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.55)",
              marginBottom: 28,
            }}
          >
            In the meantime, Otto&apos;s real signals already live on the
            right rail of your campus page — RSVPs you&apos;re going to,
            and trending hashtags from your school.
          </p>
          <Link
            href="/campus"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "12px 22px",
              borderRadius: 999,
              background:
                "linear-gradient(180deg, rgba(255,140,90,0.55) 0%, rgba(255,92,53,0.32) 100%)",
              border: "1px solid rgba(255,180,150,0.45)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px rgba(255,92,53,0.2)",
            }}
          >
            ← Back to campus
          </Link>
        </div>
      </main>
    </CampusAppShell>
  );
}
