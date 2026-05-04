import Link from "next/link";

import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { CampusAppShell } from "@/components/campus-app-shell";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props) {
  const { handle } = await params;
  return {
    title: `@${handle} · Vibe`,
    description: "Profile",
  };
}

/**
 * Signed-in viewer route for `/profile/:handle`. Static HTML prototype still serves
 * the rich demo for logged-out visitors (middleware rewrite).
 */
export default async function ProfileByHandlePage({ params }: Props) {
  await enforceCampusAccess(`/profile/${(await params).handle}`);
  const { handle } = await params;

  return (
    <CampusAppShell>
      <main
        style={{
          borderRight: "1px solid rgba(28,28,30,0.08)",
          padding: "32px 28px",
          background: "#FAF7F2",
        }}
      >
        <h1
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 28,
            fontWeight: 900,
            color: "#1C1C1E",
            marginBottom: 12,
          }}
        >
          @{handle}
        </h1>
        <p
          style={{
            fontFamily: "DM Sans, sans-serif",
            color: "#8A8580",
            maxWidth: 480,
            lineHeight: 1.6,
          }}
        >
          Public profile grid and follow actions ship with P1-011 / P1-012. For the
          interactive demo (signed out), open this path in a private window.
        </p>
        <p style={{ marginTop: 24 }}>
          <Link
            href="/network"
            style={{ color: "#FF5C35", fontWeight: 600, fontSize: 15 }}
          >
            ← Network
          </Link>
        </p>
      </main>
    </CampusAppShell>
  );
}
