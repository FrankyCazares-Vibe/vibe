import Link from "next/link";

import { CampusAppShell } from "@/components/campus-app-shell";

export const metadata = {
  title: "Profile · Vibe",
  description: "Your profile",
};

export default function ProfilePage() {
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
