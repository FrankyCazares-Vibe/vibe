import Link from "next/link";

import { KineticWordmark } from "@/components/brand/KineticWordmark";

/**
 * The pieces of the club link pages (the R2_Setup board, "The president scans
 * it"): the club's tile, its name as the headline, "Checked by Vibe", and the
 * page for a link that no longer works. Token colours only, so Night follows.
 */

/** Decorative: the headline next to it names the club. */
export function ClubTile({ initials, logoUrl }: { initials: string; logoUrl: string | null }) {
  const box: React.CSSProperties = {
    width: 56,
    height: 56,
    borderRadius: 16,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    background: "linear-gradient(135deg, #2A8A8E, #1C5E62)",
    color: "#F6F1EA",
    fontFamily: "Fraunces, serif",
    fontWeight: 800,
    fontSize: 20,
  };
  return (
    <div style={box} aria-hidden="true">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- the club's own asset route answers with a redirect
        <img src={logoUrl} alt="" width={56} height={56} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initials
      )}
    </div>
  );
}

export function CheckedBadge() {
  return (
    <span
      style={{
        alignSelf: "flex-start",
        height: 26,
        padding: "0 10px",
        borderRadius: 999,
        background: "rgba(79,208,138,0.14)",
        color: "var(--ok-ink-2)",
        fontSize: 12.5,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      Checked by Vibe
    </span>
  );
}

/** The headline block the sign-up form shows in place of "Create your account." */
export function ClubLinkHeader({
  kind,
  name,
  initials,
  logoUrl,
  checked,
  signInHref,
}: {
  kind: "setup" | "members";
  name: string;
  initials: string;
  logoUrl: string | null;
  checked: boolean;
  /** "Already on Vibe? Sign in", back to this link. */
  signInHref: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 4 }}>
      <ClubTile initials={initials} logoUrl={logoUrl} />
      <h1 className="vibe-auth-headline" style={{ overflowWrap: "anywhere" }}>
        {kind === "setup" ? `Set up ${name}` : `Join ${name} on Vibe`}
        <span className="vibe-auth-dot">.</span>
      </h1>
      {checked ? <CheckedBadge /> : null}
      <p className="vibe-auth-sub">
        {kind === "setup" ? (
          <>
            Sign up with your <strong>school email</strong>. You&apos;ll own the club&apos;s page and add your officers
            next. Nobody shares a club password.
          </>
        ) : (
          <>
            Sign up with your <strong>school email</strong>, the one ending in{" "}
            <code className="vibe-auth-code">.edu</code>. Then you can join {name}.
          </>
        )}
      </p>
      <p className="vibe-auth-sub" style={{ marginTop: -4 }}>
        Already on Vibe?{" "}
        <Link href={signInHref} className="vibe-auth-link vibe-auth-link--tap">
          Sign in
        </Link>
      </p>
    </div>
  );
}

/** A link that doesn't work: said plainly, with the way on. */
export function LinkGone({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="vibe-auth-page">
      <div className="vibe-auth-card">
        <div className="vibe-auth-brand vibe-auth-brand--kinetic">
          <KineticWordmark dotClassName="vibe-auth-dot" />
        </div>
        <h1 className="vibe-auth-headline">
          {title}
          <span className="vibe-auth-dot">.</span>
        </h1>
        <p className="vibe-auth-sub">{body}</p>
        <Link href={action?.href ?? "/"} className="vibe-auth-link vibe-auth-link--tap">
          {action?.label ?? "Go to Vibe"}
        </Link>
      </div>
    </div>
  );
}
