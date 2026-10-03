import { ImageResponse } from "next/og";

/**
 * The site's link-preview picture (iMessage, Instagram, X, LinkedIn): the
 * soft "vibe." wordmark and the tagline on near-black with a coral bloom.
 * src/app/opengraph-image.tsx and src/app/twitter-image.tsx both render it,
 * so the two can never drift apart.
 *
 * Fonts are FETCHED from Google Fonts, the recipe in the Next docs for
 * ImageResponse custom fonts. Satori can't read font-variation-settings, so
 * each face is asked for as a static instance: Fraunces pinned at wght 900,
 * SOFT 100, opsz 144 (the wordmark), Fraunces italic 400 (the tagline) and
 * DM Sans 600 (the caption), each subset to the characters on the card. The
 * route has no request-time input, so `next build` renders it once and the
 * PNG is served from then on; the fetches run at build time, not per visitor.
 * If Google is unreachable the card still renders, in next/og's built-in
 * Geist, and the build log says so, rather than one outage failing a deploy.
 */

export const SHARE_CARD_ALT = "vibe. Your campus. Your people. Yourself.";
export const SHARE_CARD_SIZE = { width: 1200, height: 630 };
export const SHARE_CARD_CONTENT_TYPE = "image/png";

const INK = "#0C0B0B";
const CREAM = "#F6F1EA";
const CORAL = "#FF5C35";

const WORDMARK = "vibe.";
const TAGLINE = "Your campus. Your people. Yourself.";
const CAPTION = "THE SOCIAL APP FOR YOUR CAMPUS";

type FontSpec = NonNullable<
  ConstructorParameters<typeof ImageResponse>[1]
>["fonts"];

async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer> {
  const cssUrl =
    "https://fonts.googleapis.com/css2?family=" +
    encodeURIComponent(family) +
    "&text=" +
    encodeURIComponent(text);
  const cssRes = await fetch(cssUrl, { cache: "force-cache" });
  if (!cssRes.ok) throw new Error(`css ${cssRes.status} for ${family}`);
  const css = await cssRes.text();
  const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
  if (!src) throw new Error(`no ttf/otf source for ${family}`);
  const fontRes = await fetch(src[1], { cache: "force-cache" });
  if (!fontRes.ok) throw new Error(`font ${fontRes.status} for ${family}`);
  return fontRes.arrayBuffer();
}

async function loadFonts(): Promise<FontSpec> {
  try {
    const [wordmark, tagline, caption] = await Promise.all([
      loadGoogleFont("Fraunces:opsz,wght,SOFT,WONK@144,900,100,0", WORDMARK),
      loadGoogleFont("Fraunces:ital,opsz,wght@1,72,400", TAGLINE),
      loadGoogleFont("DM Sans:wght@600", CAPTION),
    ]);
    return [
      { name: "Fraunces", data: wordmark, weight: 900, style: "normal" },
      { name: "Fraunces", data: tagline, weight: 400, style: "italic" },
      { name: "DM Sans", data: caption, weight: 600, style: "normal" },
    ];
  } catch (err) {
    console.warn(
      "[share-card] brand fonts unavailable, rendering in Geist instead:",
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }
}

/** "campus" in coral, its full stop in cream: one flex item per word. */
function Word({ text, coral }: { text: string; coral?: boolean }) {
  const stop = text.endsWith(".");
  const body = stop ? text.slice(0, -1) : text;
  return (
    <div style={{ display: "flex" }}>
      <span style={{ color: coral ? CORAL : CREAM }}>{body}</span>
      {stop ? <span>.</span> : null}
    </div>
  );
}

export async function renderShareCard(): Promise<ImageResponse> {
  const fonts = await loadFonts();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 92px",
          position: "relative",
          overflow: "hidden",
          backgroundColor: INK,
          color: CREAM,
        }}
      >
        {/* The bloom, centred on the top-right corner so only its soft
            falloff reaches the text. A card-sized layer with the centre
            placed inside the gradient: Satori drops the gradient of a box
            pushed past the card's edge with negative offsets. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: SHARE_CARD_SIZE.width,
            height: SHARE_CARD_SIZE.height,
            display: "flex",
            backgroundImage:
              "radial-gradient(circle 1000px at 1140px 0px, rgba(255,92,53,0.66) 0%, rgba(255,92,53,0.36) 20%, rgba(255,92,53,0.15) 42%, rgba(255,92,53,0.05) 66%, rgba(255,92,53,0) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontFamily: "Fraunces",
            fontWeight: 900,
            fontSize: 236,
            lineHeight: 1,
            letterSpacing: -8,
          }}
        >
          <span>vibe</span>
          <span style={{ color: CORAL }}>.</span>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            columnGap: 16,
            marginTop: 30,
            fontFamily: "Fraunces",
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: 60,
            lineHeight: 1.15,
          }}
        >
          <Word text="Your" />
          <Word text="campus." coral />
          <Word text="Your" />
          <Word text="people." coral />
          <Word text="Yourself." />
        </div>
        <div
          style={{
            position: "absolute",
            left: 92,
            bottom: 58,
            display: "flex",
            alignItems: "center",
            fontFamily: "DM Sans",
            fontWeight: 600,
            fontSize: 20,
            letterSpacing: 5,
            color: "rgba(246,241,234,0.62)",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              backgroundColor: CORAL,
              marginRight: 16,
            }}
          />
          {CAPTION}
        </div>
      </div>
    ),
    { ...SHARE_CARD_SIZE, fonts },
  );
}
