/**
 * The wave-2 screens' tokens and fonts (handoffs/chat-redesign/wave-2-contracts.md
 * 11.0; every literal from wave-2-asis/mockups-map.md 0.1, the two columns).
 *
 * `palette(night)` answers one object per theme so a screen reads
 * `const t = palette(useNightTheme())` once and styles inline from it. The
 * app's own tokens stand in wherever the contract says so (page, ink,
 * secondary, muted, surface, hairline): the Light mockup's ink literals
 * (`#141416 / #4A4541 / #6B645C`) are NOT adopted (MK:16.2). Muted is
 * `--ink-sub` in Light (`#5A564F`, 6.8:1 on cream; `--ink-muted` `#8A8580`
 * is 3.5:1 and never used on the new screens in Light; SCREENS-M4) and
 * `--ink-muted` in Night (`#9C958C`, the mockups' own muted).
 *
 * Pure: no React, no DOM. Nothing here is a `className`.
 */

/** Titles: the wordmark, club names, sheet titles (Fraunces 700/800). */
export const SERIF = "Fraunces, serif";
/** Body (DM Sans 300–800). */
export const FONT = "DM Sans, sans-serif";

export type Palette = {
  /** Page background: `--cream` (`#FAF7F2` / `#0C0B0B`). */
  page: string;
  /** Primary ink: `--charcoal` (`#1C1C1E` / `#F6F1EA`). */
  ink: string;
  /** Secondary ink, a sentence's colour: `--ink-2` (`#5C5853` / `#CFC8BE`). */
  secondary: string;
  /** Muted ink for labels, times and placeholders: `--ink-sub` in Light, `--ink-muted` in Night. */
  muted: string;
  /** Cards, bubbles, buttons: `--paper` (`#FFFFFF` / `#161515`). */
  surface: string;
  /** Borders and separators: `--hairline`. */
  hairline: string;
  /** The coral itself (dots, the send button, the picked bar). */
  coral: string;
  /** Coral as text on the page (links, `Live · 18 going`, vote counts). */
  coralText: string;
  /** Coral as a mark on a tinted surface: the Going check, the Soon ring, `Live` on the live/soon card. */
  coralMark: string;
  /** The coral button: gradient background and the ink on it. */
  coralButton: { bg: string; ink: string };
  /** The active chip in a chip row (inverted). */
  activeChip: { bg: string; ink: string };
  /** The unpicked radio's ring. */
  ringGrey: string;
  /** The live / soon event card's chrome. */
  liveCard: { bg: string; border: string; shadow: string };
  /** A quiet (later) event card's chrome. */
  quietCard: { bg: string; border: string; shadow: string };
  /** A poll option the viewer picked. */
  pickedOption: { border: string; bar: string; bg: string };
  /** A poll option the viewer did not pick. */
  unpickedOption: { border: string; bar: string; bg: string };
  /** The coral bloom behind "Your week" / Up next (drawn only when a live card exists). */
  bloom: string;
  /** The scrim under the "+" tray and the sheets (11.7). */
  scrim: string;
  /**
   * The border of a field, a header circle, the "+", the reply field, the
   * tray and a sheet's top edge (MK:0.2 `rgba(255,255,255,0.10)` in Night;
   * `--hairline` in Light; S2-DESIGN-6 / INT-ADJUDICATE-7).
   */
  fieldBorder: string;
  /** An inactive room chip's border (MK:0.2 `rgba(255,255,255,0.12)`; the Light mockup's `rgba(20,20,22,0.12)`). */
  chipBorder: string;
  /** The dashed `Add your first event` button's border (MK:16.10 `rgba(255,255,255,0.22)`; Light `rgba(20,20,22,0.22)`). */
  dashedBorder: string;
  /** A raised circle or tile over the page (the header circles, the Plans tiles): MK:0.2 `rgba(22,21,21,0.86)` in Night; `--paper` in Light. */
  raisedSurface: string;
};

const CORAL = "#FF5C35";

const NIGHT: Palette = {
  page: "var(--cream)",
  ink: "var(--charcoal)",
  secondary: "var(--ink-2)",
  muted: "var(--ink-muted)",
  surface: "var(--paper)",
  hairline: "var(--hairline)",
  coral: CORAL,
  coralText: "#FF8A66",
  coralMark: "#FF8A66",
  coralButton: { bg: "linear-gradient(180deg, #FF7B4A, #FF5C35)", ink: "#140806" },
  activeChip: { bg: "#F6F1EA", ink: "#0C0B0B" },
  ringGrey: "#6E6862",
  liveCard: {
    bg: "linear-gradient(120deg, rgba(58,22,20,0.96), rgba(30,20,19,0.96))",
    border: "rgba(255,92,53,0.45)",
    shadow: "0 6px 18px rgba(255,92,53,0.18), inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  quietCard: {
    bg: "rgba(22,21,21,0.92)",
    border: "rgba(255,255,255,0.08)",
    shadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  pickedOption: { border: "rgba(255,92,53,0.50)", bar: "rgba(255,92,53,0.24)", bg: "rgba(255,255,255,0.04)" },
  unpickedOption: { border: "rgba(255,255,255,0.10)", bar: "rgba(255,255,255,0.07)", bg: "rgba(255,255,255,0.04)" },
  bloom: "radial-gradient(closest-side, rgba(255,92,53,0.36) 0%, rgba(255,92,53,0.13) 52%, rgba(255,92,53,0) 100%)",
  scrim: "rgba(8,7,7,0.5)",
  fieldBorder: "rgba(255,255,255,0.10)",
  chipBorder: "rgba(255,255,255,0.12)",
  dashedBorder: "rgba(255,255,255,0.22)",
  raisedSurface: "rgba(22,21,21,0.86)",
};

const LIGHT: Palette = {
  page: "var(--cream)",
  ink: "var(--charcoal)",
  secondary: "var(--ink-2)",
  muted: "var(--ink-sub)",
  surface: "var(--paper)",
  hairline: "var(--hairline)",
  coral: CORAL,
  coralText: "#C8401E",
  coralMark: "#B5381A",
  coralButton: { bg: "linear-gradient(180deg, #FF7B4A, #FF5C35)", ink: "#140806" },
  activeChip: { bg: "#141416", ink: "#FAF7F2" },
  ringGrey: "#6E6862",
  liveCard: {
    bg: "linear-gradient(120deg, #FFE9E0, #FFFFFF)",
    border: "rgba(255,92,53,0.55)",
    shadow: "0 6px 18px rgba(255,92,53,0.16)",
  },
  quietCard: {
    bg: "#FFFFFF",
    border: "rgba(20,20,22,0.10)",
    shadow: "0 1px 2px rgba(20,20,22,0.04)",
  },
  pickedOption: { border: "rgba(255,92,53,0.55)", bar: "rgba(255,92,53,0.16)", bg: "#FFFFFF" },
  unpickedOption: { border: "rgba(20,20,22,0.10)", bar: "rgba(20,20,22,0.06)", bg: "rgba(20,20,22,0.02)" },
  bloom: "radial-gradient(closest-side, rgba(255,92,53,0.22) 0%, rgba(255,92,53,0.08) 52%, rgba(255,92,53,0) 100%)",
  scrim: "rgba(20,20,22,0.35)",
  fieldBorder: "var(--hairline)",
  chipBorder: "rgba(20,20,22,0.12)",
  dashedBorder: "rgba(20,20,22,0.22)",
  raisedSurface: "var(--paper)",
};

/** The tokens of one theme (`useNightTheme()` says which). */
export function palette(night: boolean): Palette {
  return night ? NIGHT : LIGHT;
}
