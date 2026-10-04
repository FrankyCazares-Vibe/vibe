import localFont from "next/font/local";

// The soft wordmark face (the share card's: SOFT 100, opsz 144). The app-wide
// Fraunces link in layout.tsx has no SOFT axis, so the landing loads its own,
// under its own family name ("frauncesSoft", from the const): next/font/google
// names its face plain "Fraunces", and the layout's Google faces won over it.
// The file is Google Fonts' Fraunces latin subset (wght, opsz, SOFT axes),
// under the OFL: its licence sits beside it in fraunces-soft.OFL.txt. The
// stand-in until it loads is a serif sized to match, so the swap stays serif.
// Its own module so the landing and the waitlist pages share one face.
export const frauncesSoft = localFont({ src: "./fraunces-soft.woff2", weight: "100 900", style: "normal", variable: "--font-soft", display: "swap", adjustFontFallback: "Times New Roman" });
