import Link from "next/link";
import type { ReactNode } from "react";

const PAGE_BG =
  "radial-gradient(120% 80% at 0% 0%, rgba(255,222,180,0.45) 0%, rgba(255,222,180,0) 60%), " +
  "radial-gradient(110% 80% at 100% 100%, rgba(255,200,170,0.35) 0%, rgba(255,200,170,0) 60%), " +
  "linear-gradient(180deg, #FAF7F2 0%, #F4EDE2 100%)";

export function LegalLayout({
  eyebrow,
  title,
  effectiveDate,
  children,
}: {
  eyebrow: string;
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: PAGE_BG,
        padding: "48px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <p style={{ marginBottom: 24 }}>
          <Link
            href="/"
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              fontWeight: 700,
              color: "#5C5853",
              textDecoration: "none",
            }}
          >
            ← Back to Vibe
          </Link>
        </p>
        <header style={{ marginBottom: 28 }}>
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#C84A20",
              marginBottom: 6,
            }}
          >
            {eyebrow}
          </div>
          <h1
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: "clamp(30px, 4vw, 42px)",
              fontWeight: 900,
              color: "#1C1C1E",
              letterSpacing: "-0.02em",
              margin: "0 0 6px",
              lineHeight: 1.1,
            }}
          >
            {title}
          </h1>
          <div
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              color: "#8A8580",
            }}
          >
            Effective {effectiveDate}
          </div>
        </header>
        <article
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 15,
            lineHeight: 1.7,
            color: "#2A2620",
          }}
        >
          {children}
        </article>
        <p
          style={{
            marginTop: 40,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            color: "#8A8580",
          }}
        >
          <Link
            href="/legal/terms"
            style={{ color: "#5C5853", fontWeight: 700, textDecoration: "none" }}
          >
            Terms of Service
          </Link>
          <span style={{ margin: "0 8px" }}>·</span>
          <Link
            href="/legal/privacy"
            style={{ color: "#5C5853", fontWeight: 700, textDecoration: "none" }}
          >
            Privacy Policy
          </Link>
          <span style={{ margin: "0 8px" }}>·</span>
          <a
            href="mailto:hello@vibe-app.vercel.app"
            style={{ color: "#5C5853", fontWeight: 700, textDecoration: "none" }}
          >
            Contact
          </a>
        </p>
      </div>
    </main>
  );
}

export function LegalH2({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: "Fraunces, serif",
        fontSize: 22,
        fontWeight: 800,
        color: "#1C1C1E",
        letterSpacing: "-0.01em",
        margin: "32px 0 10px",
      }}
    >
      {children}
    </h2>
  );
}

export function LegalP({ children }: { children: ReactNode }) {
  return <p style={{ margin: "0 0 12px" }}>{children}</p>;
}

export function LegalUL({ children }: { children: ReactNode }) {
  return (
    <ul style={{ margin: "0 0 12px", paddingLeft: 22 }}>{children}</ul>
  );
}
