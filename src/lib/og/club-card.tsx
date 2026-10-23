import { ImageResponse } from "next/og";

import { campusRowById } from "@/lib/iu/campuses";
import { isSupabaseHttpsUrl } from "@/lib/org-asset-url";
import { backdropCss } from "@/lib/orgs/backdrops";
import { ORG_ASSET_KEY_PREFIX, signOrgAssetGetUrl } from "@/lib/r2";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { clubCardContent, type ClubCardContent, type ClubCardRow } from "./club-card-content";
import { SHARE_CARD_CONTENT_TYPE, SHARE_CARD_SIZE, renderShareCard } from "./share-card";

/**
 * A club's link picture (the club's view, wave 3, B2, Oct 23, 2026): the
 * club card from M_Cards.png in landscape, 1200×630, for iMessage, GroupMe,
 * Instagram and X. src/app/orgs/[handle]/opengraph-image.tsx and
 * twitter-image.tsx both draw it, so the two can never drift apart, and the
 * Share sheet shows it as its preview (club-page/ShareSheet.tsx).
 *
 * The club's own background (`backdropCss`; an unknown key paints Dusk),
 * the campus line ("INDIANAPOLIS · CLUB"), the logo or the initials tile,
 * the name in Fraunces, the bio's first line, "Follow us on vibe." and
 * @handle. No counts, no people: only what the public club page shows.
 *
 * A HIDDEN OR MISSING CLUB GETS THE SITE'S CARD (renderShareCard), never its
 * name: `clubCardContent` returns null for both, and a failed read counts as
 * missing, so it fails closed. The two answers are the same bytes, so the
 * picture can't tell a hidden club from a handle nobody registered. The
 * route reads the club fresh on every ask (`dynamic = "force-dynamic"` in
 * the two files, no CDN copy), so a club hidden or renamed is drawn as it
 * is now on the next ask; link previews keep their own copies, which is out
 * of our hands.
 *
 * Fonts: share-card.tsx's recipe (Google Fonts, static instances, subset to
 * the card's own words, `force-cache` so they are fetched once per set of
 * words), and next/og's Geist when Google is unreachable.
 */

export const CLUB_CARD_ALT = "The club's name, campus and handle, and how to follow it on vibe.";
export const CLUB_CARD_SIZE = SHARE_CARD_SIZE;
export const CLUB_CARD_CONTENT_TYPE = SHARE_CARD_CONTENT_TYPE;

const INK = "#0C0B0B";
const CREAM = "#F6F1EA";
const CORAL = "#FF5C35";
const SOFT = "rgba(246,241,234,0.84)";
const MUTED = "rgba(246,241,234,0.64)";

/** Next's own header for an ImageResponse: no CDN copy, so every ask reads the club now. */
const CACHE_CONTROL =
  process.env.NODE_ENV === "development" ? "no-cache, no-store" : "public, max-age=0, must-revalidate";

/** A logo bigger than this, slower than this, or not a PNG or JPEG draws the initials. */
const LOGO_MAX_BYTES = 4 * 1024 * 1024;
const LOGO_TIMEOUT_MS = 3000;

const CLUB_COLUMNS = "handle, name, description, logo_url, backdrop_preset, hidden_at, campus_id";

/** The club, or null when there is none or the read failed (the generic card either way). */
async function readClub(handle: string): Promise<ClubCardRow | null> {
  try {
    const { data, error } = await createSupabaseServiceClient()
      .from("orgs")
      .select(CLUB_COLUMNS)
      .eq("handle", handle)
      .maybeSingle();
    if (error) {
      console.error("[club-card] club read failed:", error.message);
      return null;
    }
    return (data as ClubCardRow | null) ?? null;
  } catch (err) {
    console.error("[club-card] club read failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * What the bytes are, from their first ones: the two kinds the renderer
 * draws. Not WebP, and not GIF: the renderer takes a GIF without an error
 * and paints nothing, an empty box where the logo goes (review, Oct 23,
 * 2026), so a GIF logo gets the initials too.
 */
function imageType(b: Uint8Array): "image/png" | "image/jpeg" | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

/**
 * The club's logo as a data address, or null (the initials tile). The
 * stored value is the asset route's: an `orgs/…` key, signed here for two
 * minutes, or a direct https URL on our own Supabase host. Nothing else is
 * fetched, and no redirect is followed.
 */
async function logoDataUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  try {
    const url = stored.startsWith(ORG_ASSET_KEY_PREFIX)
      ? await signOrgAssetGetUrl(stored, 120)
      : isSupabaseHttpsUrl(stored)
        ? stored
        : null;
    if (!url) return null;
    const res = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
    });
    if (!res.ok || Number(res.headers.get("content-length")) > LOGO_MAX_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const type = bytes.byteLength <= LOGO_MAX_BYTES ? imageType(bytes) : null;
    return type ? `data:${type};base64,${Buffer.from(bytes).toString("base64")}` : null;
  } catch {
    return null;
  }
}

type FontSpec = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"];

/** share-card.tsx's loader: one static instance of `family`, subset to `text`. */
async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer> {
  const cssUrl =
    "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(family) + "&text=" + encodeURIComponent(text);
  const cssRes = await fetch(cssUrl, { cache: "force-cache" });
  if (!cssRes.ok) throw new Error(`css ${cssRes.status} for ${family}`);
  const css = await cssRes.text();
  const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
  if (!src) throw new Error(`no ttf/otf source for ${family}`);
  const fontRes = await fetch(src[1], { cache: "force-cache" });
  if (!fontRes.ok) throw new Error(`font ${fontRes.status} for ${family}`);
  return fontRes.arrayBuffer();
}

/** Fraunces 900 for the name, the tile and the wordmark; DM Sans 400 and 600 for the rest. */
async function loadCardFonts(c: ClubCardContent): Promise<FontSpec> {
  try {
    const [display, body, caps] = await Promise.all([
      loadGoogleFont("Fraunces:opsz,wght,SOFT,WONK@144,900,100,0", `${c.name}${c.initials}vibe.`),
      loadGoogleFont("DM Sans:wght@400", `Follow us on @${c.handle}${c.bio ?? ""}`),
      loadGoogleFont("DM Sans:wght@600", c.eyebrow),
    ]);
    return [
      { name: "Fraunces", data: display, weight: 900, style: "normal" },
      { name: "DM Sans", data: body, weight: 400, style: "normal" },
      { name: "DM Sans", data: caps, weight: 600, style: "normal" },
    ];
  } catch (err) {
    console.warn(
      "[club-card] brand fonts unavailable, rendering in Geist instead:",
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }
}

/** The logo, or the initials on the header's coral-into-violet (ClubHeader.tsx). */
function Tile({ c, logo }: { c: ClubCardContent; logo: string | null }) {
  const box = { width: 148, height: 148, borderRadius: 34, flexShrink: 0 } as const;
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- drawn by next/og, not a page
      <img
        src={logo}
        alt=""
        width={148}
        height={148}
        style={{ ...box, objectFit: "cover", border: "2px solid rgba(246,241,234,0.18)" }}
      />
    );
  }
  return (
    <div
      style={{
        ...box,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundImage: "linear-gradient(135deg, #FF5C35 0%, #7B5FE0 100%)",
        fontFamily: "Fraunces",
        fontWeight: 900,
        fontSize: 58,
        color: CREAM,
      }}
    >
      {c.initials}
    </div>
  );
}

function ClubCard({ c, logo }: { c: ClubCardContent; logo: string | null }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "58px 80px 54px",
        backgroundColor: INK,
        backgroundImage: backdropCss(c.backdropKey),
        color: CREAM,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontFamily: "DM Sans",
          fontWeight: 600,
          fontSize: 20,
          letterSpacing: 4,
          color: MUTED,
        }}
      >
        <div style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: CORAL, marginRight: 14 }} />
        {c.eyebrow}
      </div>

      <div style={{ display: "flex", flex: 1, alignItems: "center", minHeight: 0 }}>
        <Tile c={c} logo={logo} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, marginLeft: 44 }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Fraunces",
              fontWeight: 900,
              fontSize: c.nameSize,
              lineHeight: 1.04,
              letterSpacing: -Math.round(c.nameSize * 0.02),
              wordBreak: "break-word",
            }}
          >
            {c.name}
          </div>
          {/* break-word: a bio that opens with a long link (a sign-up form,
              a Linktree) wraps inside the card instead of running off its
              right edge (review, Oct 23, 2026). */}
          {c.bio ? (
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontFamily: "DM Sans",
                fontWeight: 400,
                fontSize: 30,
                lineHeight: 1.35,
                color: SOFT,
                wordBreak: "break-word",
              }}
            >
              {c.bio}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontFamily: "DM Sans", fontWeight: 400, fontSize: 22, color: MUTED }}>
            Follow us on
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              marginTop: 2,
              fontFamily: "Fraunces",
              fontWeight: 900,
              fontSize: 68,
              lineHeight: 1,
              letterSpacing: -2,
            }}
          >
            <span>vibe</span>
            <span style={{ color: CORAL }}>.</span>
          </div>
        </div>
        <div style={{ display: "flex", fontFamily: "DM Sans", fontWeight: 400, fontSize: 28, color: SOFT }}>
          {`@${c.handle}`}
        </div>
      </div>
    </div>
  );
}

/**
 * The picture for `/orgs/<handle>`: the club card, or the site's card for a
 * hidden, missing or unreadable club. Drawn here in full rather than
 * streamed, so a logo the renderer can't read falls back to the initials
 * tile, and any other failure to the site's card, instead of a broken
 * picture.
 */
export async function renderClubCard(handle: string): Promise<Response> {
  const row = await readClub(handle);
  const content = clubCardContent(row, row ? (campusRowById(row.campus_id)?.name ?? null) : null);
  if (!content) return renderShareCard();
  const [logo, fonts] = await Promise.all([logoDataUrl(content.logo), loadCardFonts(content)]);
  for (const attempt of logo ? [logo, null] : [null]) {
    try {
      const png = await new ImageResponse(<ClubCard c={content} logo={attempt} />, {
        ...CLUB_CARD_SIZE,
        fonts,
      }).arrayBuffer();
      return new Response(png, {
        headers: { "content-type": CLUB_CARD_CONTENT_TYPE, "cache-control": CACHE_CONTROL },
      });
    } catch (err) {
      console.warn("[club-card] draw failed:", err instanceof Error ? err.message : err);
    }
  }
  return renderShareCard();
}
