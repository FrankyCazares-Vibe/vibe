import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { clubInitials } from "@/app/c/club-link-view";
import { qrSvgFor } from "@/components/events/checkin/qr-path";
import { LoadFailed } from "@/components/feedback/LoadFailed";
import {
  columnStyle,
  eyebrowStyle,
  pageStyle,
  pillStyle,
  quietStyle,
} from "@/components/orgs/club-tool-styles";
import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { getSiteUrl } from "@/lib/auth/site-url";
import { appShellFromRequest } from "@/lib/native/server";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { officerGate } from "@/lib/orgs/hidden-gate";
import { SETTINGS_ROLES, isOrgRole } from "@/lib/orgs/join-state";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { PrintButton } from "./PrintButton";

/**
 * `/orgs/<handle>/table-card`: the club's table card (the club's view, wave
 * 3, B3; Oct 23, 2026; the right-hand card of M_Cards.png). A cream 5 × 7 in
 * card for the club's table at a fair or a meeting: the logo (or the
 * initials tile) and @handle, "Scan to follow <club> on vibe.", a large QR of
 * the club page's address, and the address under it. Print it, or leave
 * this page open on a screen: "Show on a screen" is just this page.
 *
 * Nothing new is shown: the name, handle, logo and address are what the
 * public club page already shows. The QR is drawn here on the server
 * (qr-path.ts), black on white, never by an outside QR service.
 *
 * Signed-in only. The owner and officers only, gated as the setup list is: a
 * hidden club is a 404 to anyone outside it, and a member or a visitor goes
 * to the club page. Not in the app frame and no tab bar: it is a sheet to
 * print, and the print rule below leaves only the card on the page.
 *
 * The card is cream in Light and Night alike, so it prints clean; its
 * colours are fixed on purpose (CARD_* below). The page around it follows
 * the theme tokens.
 */

type Props = { params: Promise<{ handle: string }> };

type ClubRow = {
  id: string;
  handle: string;
  name: string | null;
  logo_url: string | null;
  hidden_at: string | null;
};

/**
 * The club row, read once per request: the title below and the page both
 * ask for it, and React's `cache` lets the second ask reuse the first.
 */
const readClub = cache(async (handle: string) => {
  const { data, error } = await createSupabaseServiceClient()
    .from("orgs")
    .select("id, handle, name, logo_url, hidden_at")
    .eq("handle", handle)
    .maybeSingle();
  return { org: (data as ClubRow | null) ?? null, errorCode: error ? (error.code ?? "unknown") : null };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const { org } = await readClub(handle.toLowerCase());
  // A hidden club's name never reaches the tab title (as on the club page):
  // the title is decided before the page's gate, so it can't know who asks.
  const name = org && !org.hidden_at ? org.name || org.handle : null;
  return {
    title: name ? `Table card · ${name} · Vibe` : "Table card · Vibe",
    robots: { index: false },
  };
}

/** This page's address, for the sign-in gate to come back to. */
function tableCardPath(handle: string): string {
  return `/orgs/${encodeURIComponent(handle)}/table-card`;
}

/**
 * The address as printed under the code: no "https://" and no "www."
 * (connectvibe.app sends a visitor on to www, next.config.ts), so it is
 * short enough to type from the card.
 */
function shownAddress(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
}

/**
 * The headline's size, in cqw of the card: names run 2 to 50 characters
 * (api/orgs), and the longest still fits in four lines over the code.
 */
function headlineSize(name: string): string {
  const n = Array.from(name).length;
  if (n <= 20) return "8cqw";
  if (n <= 34) return "6.8cqw";
  return "5.8cqw";
}

/**
 * The card's own colours: the light column's values (globals.css :root) in
 * both looks, so it reads the same on a Night screen and prints clean. The
 * tile is the club link pages' teal (club-link-parts.tsx), as in the design.
 */
const CARD_PAPER = "#FAF7F2";
const CARD_BG = `radial-gradient(85% 55% at 100% 0%, rgba(255,92,53,0.18) 0%, rgba(255,92,53,0) 70%), ${CARD_PAPER}`;
const CARD_INK = "#1C1C1E";
const CARD_INK_2 = "#5C5853";
const CARD_QUIET = "#6C6761";
const CARD_CORAL = "#FF5C35";
const TILE_BG = "linear-gradient(135deg, #2A8A8E, #1C5E62)";
const TILE_INK = "#F6F1EA";
/** The QR's fixed pair, as on the door screen (QrCode.tsx): phone cameras misread an inverted code. */
const QR_PAPER = "#fff";
const QR_INK = "#000";

/**
 * The card's size, and the print rule. Every size inside the card is in cqw
 * (the card is its own container), so the card on a phone, on a computer and
 * on the printed sheet is the same picture at three sizes.
 *
 * Print: only the card, at 5 × 7 in with no margin, its cream and the tile
 * kept (print-color-adjust). `body *` goes invisible and the card comes back,
 * which also covers anything the root layout draws (the toast, the cursor);
 * the page's own words and buttons leave the flow, and html/body clip at one
 * sheet so nothing spills onto a second. It lives here, not in globals.css,
 * so the 5 × 7 sheet applies to this page alone.
 */
const TABLE_CARD_CSS = `
.vibe-table-card{container-type:inline-size;box-sizing:border-box;width:min(100%,420px);aspect-ratio:5/7;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{
@page{size:5in 7in;margin:0}
html,body{width:5in!important;height:7in!important;margin:0!important;padding:0!important;overflow:hidden!important;background:#fff!important}
body *{visibility:hidden!important}
.vibe-table-card,.vibe-table-card *{visibility:visible!important}
.vibe-table-card-page,.vibe-table-card-column{display:block!important;min-height:0!important;margin:0!important;padding:0!important;background:none!important}
.vibe-table-card-screen{display:none!important}
.vibe-table-card{width:5in!important;height:7in!important;aspect-ratio:auto!important;border:0!important;border-radius:0!important;box-shadow:none!important;break-inside:avoid}
}`;

/** The card itself (M_Cards.png, right): the same picture on screen and on paper. */
function TableCard({
  name,
  handle,
  logoUrl,
  address,
}: {
  name: string;
  handle: string;
  logoUrl: string | null;
  address: string;
}) {
  const qr = qrSvgFor(address);
  return (
    <section
      className="vibe-table-card"
      aria-label={`Table card for ${name}`}
      style={{
        borderRadius: 18,
        overflow: "hidden",
        background: CARD_BG,
        color: CARD_INK,
        border: "1px solid var(--hairline)",
        boxShadow: "0 18px 48px rgba(0,0,0,0.22)",
      }}
    >
      <div style={{ height: "100%", boxSizing: "border-box", padding: "8cqw", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "3.2cqw", minWidth: 0 }}>
          {/* Decorative: the @handle beside it and the headline name the club. */}
          <span
            aria-hidden="true"
            style={{
              width: "10.6cqw",
              height: "10.6cqw",
              borderRadius: "50%",
              overflow: "hidden",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: TILE_BG,
              color: TILE_INK,
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "4cqw",
            }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- the club's own asset route answers with a redirect
              <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              clubInitials(name)
            )}
          </span>
          <span
            style={{ minWidth: 0, fontSize: "4.4cqw", fontWeight: 600, color: CARD_INK_2, overflowWrap: "anywhere" }}
          >
            @{handle}
          </span>
        </div>
        <h1
          style={{
            margin: "6cqw 0 0",
            fontFamily: "var(--font-display)",
            fontSize: headlineSize(name),
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: CARD_INK,
            overflowWrap: "anywhere",
          }}
        >
          {/* "Scan to follow" on a line of its own, as in the design: the name
              then starts its own line instead of breaking at its hyphen. */}
          Scan to follow
          <br />
          {name} on{" "}
          <span className="vibe-wordmark">
            vibe<span style={{ color: CARD_CORAL }}>.</span>
          </span>
        </h1>
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "2.6cqw",
          }}
        >
          <svg
            role="img"
            aria-label={`QR code for ${name} on Vibe`}
            viewBox={`0 0 ${qr.size} ${qr.size}`}
            shapeRendering="crispEdges"
            style={{ display: "block", width: "60cqw", height: "60cqw", borderRadius: "2cqw" }}
          >
            <rect width={qr.size} height={qr.size} fill={QR_PAPER} />
            <path d={qr.path} fill={QR_INK} />
          </svg>
          <p style={{ margin: 0, fontSize: "3.9cqw", color: CARD_QUIET, textAlign: "center", overflowWrap: "anywhere" }}>
            {shownAddress(address)}
          </p>
        </div>
      </div>
    </section>
  );
}

/** The page when the club couldn't be read: the line and a Retry (a reload). */
function Failed() {
  return (
    <main style={pageStyle}>
      <div style={columnStyle}>
        <LoadFailed failure={{ message: "Couldn't load your club. Try again." }} />
      </div>
    </main>
  );
}

export default async function TableCardPage({ params }: Props) {
  const { handle: rawHandle } = await params;
  const handle = rawHandle.toLowerCase();
  const { userId } = await enforceCampusAccess(tableCardPath(handle));

  const { org, errorCode } = await readClub(handle);
  if (errorCode) {
    console.error("[orgs/[handle]/table-card] club read", errorCode);
    return <Failed />;
  }
  if (!org) notFound();

  const { data: me, error: meErr } = await createSupabaseServiceClient()
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (meErr) {
    console.error("[orgs/[handle]/table-card] role read", meErr.code);
    return <Failed />;
  }
  const role = isOrgRole(me?.role) ? me.role : null;
  const gate = officerGate({ hidden: !!org.hidden_at, role, allowed: SETTINGS_ROLES });
  if (gate === "not_found") notFound();
  if (gate === "forbidden" || (role !== "owner" && role !== "admin")) {
    redirect(`/orgs/${encodeURIComponent(org.handle)}`);
  }

  const name = org.name || org.handle;
  const clubHref = `/orgs/${encodeURIComponent(org.handle)}`;
  // The club page's public address on this site, the one the QR opens.
  const address = `${getSiteUrl()}${clubHref}`;
  // The store apps' web views have no print dialog (PrintButton.tsx).
  const inApp = (await appShellFromRequest()) !== null;

  return (
    <main
      className="vibe-table-card-page"
      style={{
        ...pageStyle,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <style>{TABLE_CARD_CSS}</style>
      <div
        className="vibe-table-card-column"
        style={{
          ...columnStyle,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          padding: "max(28px, env(safe-area-inset-top)) 16px max(40px, env(safe-area-inset-bottom))",
        }}
      >
        <p className="vibe-table-card-screen" style={{ ...eyebrowStyle, margin: 0 }}>
          Table card
        </p>
        <TableCard
          name={name}
          handle={org.handle}
          logoUrl={orgAssetProxyUrl(org.handle, org.logo_url, "logo")}
          address={address}
        />
        <div
          className="vibe-table-card-screen"
          style={{ display: "flex", gap: 10, width: "min(100%, 420px)", marginTop: 4 }}
        >
          {inApp ? null : <PrintButton />}
          <Link
            href={clubHref}
            className="vibe-press"
            style={{ ...pillStyle, flex: inApp ? "1 1 auto" : "0 0 auto" }}
          >
            Back to the club
          </Link>
        </div>
        <div className="vibe-table-card-screen" style={{ width: "min(100%, 420px)", display: "grid", gap: 6 }}>
          <p style={{ ...quietStyle, textAlign: "center" }}>
            {inApp
              ? "To print it, open this page in a browser on a computer. To show it on a screen, keep this page open."
              : "Prints at 5 × 7 in. To show it on a screen, keep this page open."}
          </p>
          {org.hidden_at ? (
            <p style={{ ...quietStyle, textAlign: "center" }}>
              {name} is hidden right now, so people outside the club who scan it won&apos;t find it.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
