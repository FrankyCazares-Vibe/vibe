import Link from "next/link";
import { redirect } from "next/navigation";

import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { CampusAppShell } from "@/components/campus-app-shell";
import { isGlobalFeedSurfaceEnabled } from "@/lib/feature-flags";

export const metadata = {
  title: "Feed · Vibe",
  description: "Posts from people and orgs you follow",
};

export default async function FeedPage() {
  if (!isGlobalFeedSurfaceEnabled()) {
    redirect("/campus");
  }
  await enforceCampusAccess("/feed");
  return (
    <CampusAppShell>
      <main
        style={{
          borderRight: "1px solid var(--hairline)",
          background: "var(--cream)",
        }}
      >
        <div
          style={{
            padding: "0 20px",
            borderBottom: "1px solid var(--hairline)",
            position: "sticky",
            top: 0,
            background: "var(--cream-92)",
            backdropFilter: "blur(14px)",
            zIndex: 50,
            display: "flex",
          }}
        >
          {["Following", "Campus"].map((tab, i) => (
            <button
              key={tab}
              type="button"
              style={{
                fontSize: "14px",
                fontWeight: "600",
                color: i === 0 ? "var(--charcoal)" : "var(--ink-muted)",
                padding: "16px 18px",
                border: "none",
                background: "none",
                cursor: "default",
                borderBottom:
                  i === 0 ? "2px solid #FF5C35" : "2px solid transparent",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div
          style={{
            padding: "48px 28px",
            textAlign: "center",
            maxWidth: 420,
            margin: "0 auto",
          }}
        >
          <p
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 22,
              fontWeight: 800,
              color: "var(--charcoal)",
              marginBottom: 12,
            }}
          >
            Nothing here yet
          </p>
          <p
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 15,
              lineHeight: 1.6,
              color: "var(--ink-muted)",
              marginBottom: 24,
            }}
          >
            New accounts don’t get a demo feed. Posts will show once you follow
            people and join clubs — campus-first, no algorithmic “For you” in
            this phase.
          </p>
          <Link
            href="/campus"
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 15,
              fontWeight: 600,
              color: "#FF5C35",
              textDecoration: "none",
            }}
          >
            ← Campus home
          </Link>
        </div>
      </main>
    </CampusAppShell>
  );
}
