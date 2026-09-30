"use client";

import Link from "next/link";

import { useNightTheme } from "../theme";
import { FONT, palette, SERIF } from "../v2-tokens";

/**
 * "No clubs yet" (handoffs/chat-redesign/wave-2-contracts.md 11.9.2, 1.2;
 * W2-S1) — W0_EmptyClubs: the Clubs filter with `clubs: []`. The centred
 * block: the 24px/700 Fraunces line, the 14.5px/500 sentence (max-width
 * 306px, `--ink-2` — never muted for a sentence, B5 F1), the 48px gradient
 * pill `Find clubs on campus` and the 44px underlined `Start a club`, both to
 * `/campus?tab=orgs` (there is no phone create-club screen; open point 14.14).
 * With `All` active and no clubs the list shows threads only and no block
 * (the home decides; this draws nothing else).
 */
export function HomeEmpty() {
  const night = useNightTheme();
  const t = palette(night);
  return (
    <section
      aria-labelledby="no-clubs-heading"
      style={{
        boxSizing: "border-box",
        minHeight: 380,
        padding: "0 32px 36px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontFamily: FONT,
        color: t.ink,
      }}
    >
      <h2
        id="no-clubs-heading"
        style={{
          margin: 0,
          fontFamily: SERIF,
          fontWeight: 700,
          fontSize: 24,
          lineHeight: 1.15,
          letterSpacing: "-0.4px",
          color: t.ink,
        }}
      >
        Your clubs will live here.
      </h2>
      <p
        style={{
          margin: "10px 0 0",
          maxWidth: 306,
          fontSize: 14.5,
          fontWeight: 500,
          lineHeight: 1.45,
          color: t.secondary,
          textWrap: "pretty",
        }}
      >
        Join a club to get its Board, its Lounge and a chat for every event you&rsquo;re going to.
      </p>
      <Link
        href="/campus?tab=orgs"
        style={{
          marginTop: 22,
          height: 48,
          boxSizing: "border-box",
          padding: "0 24px",
          borderRadius: 999,
          background: t.coralButton.bg,
          color: t.coralButton.ink,
          fontSize: 15,
          fontWeight: 800,
          lineHeight: 1,
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          whiteSpace: "nowrap",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        Find clubs on campus
      </Link>
      <Link
        href="/campus?tab=orgs"
        style={{
          marginTop: 6,
          height: 44,
          boxSizing: "border-box",
          padding: "0 14px",
          color: t.secondary,
          fontSize: 14,
          fontWeight: 600,
          lineHeight: 1,
          textDecoration: "underline",
          // The secondary ink at .45 (the mockup's rgba(207,200,190,0.45) is
          // Night's --ink-2; Light takes its own --ink-2 #5C5853 the same way).
          textDecorationColor: night ? "rgba(207,200,190,0.45)" : "rgba(92,88,83,0.45)",
          textUnderlineOffset: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          whiteSpace: "nowrap",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        Start a club
      </Link>
    </section>
  );
}
