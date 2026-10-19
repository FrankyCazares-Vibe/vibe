import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";

// The landing's two faces live here, in their own module so the landing and
// the waitlist pages share them.
//
// The soft wordmark face (the share card's: SOFT 100, opsz 144). The app-wide
// Fraunces link (GOOGLE_FONTS_HREF, src/lib/theme/fonts.ts) is soft too since
// Oct 19, 2026 but keeps opsz at 14, so the landing's headlines still load
// this full file, under its own family name ("frauncesSoft", from the const):
// next/font/google names its face plain "Fraunces", and the layout's Google
// faces won over it.
// The file is Google Fonts' Fraunces latin subset (wght, opsz, SOFT axes),
// under the OFL: its licence sits beside it in fraunces-soft.OFL.txt. The
// stand-in until it loads is a serif sized to match, so the swap stays serif.
export const frauncesSoft = localFont({ src: "./fraunces-soft.woff2", weight: "100 900", style: "normal", variable: "--font-soft", display: "swap", adjustFontFallback: "Times New Roman" });

// The code font for the landing's small uppercase labels (landing.css reads
// --font-jetbrains). Oct 19, 2026: it moved here from the root layout, where
// every app page preloaded its 40 KB file and only the landing drew it.
// preload: false keeps it off every route's preload list, even if the build
// merges its CSS into a shared chunk; the labels sit below the hero.
export const landingMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", preload: false });
