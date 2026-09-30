/**
 * Initials-on-colour avatars for the wave-2 screens
 * (handoffs/chat-redesign/wave-2-contracts.md 1.4, last row): used only when a
 * club's `logo_url` / a person's `avatar_url` is null. No payload carries a
 * colour (MK:1 table), so the colour is picked by a hash of the id — stable
 * for one id across screens and mounts, spread across the set.
 *
 * The values are the mockups' own (wave-2-asis/mockups-map.md 0.2; the
 * `boards/W0_*.dc.html` sources): FOUR club gradients (`145deg`; Salsa Club's
 * is the first) and SIX person colours (`#2E4A5A/#CFE6F2` DO, `#4A3A5E/#E6D8F5`
 * PS, `#5E4A2A/#F5E1B8` JK, `#5A3A2E/#FFD3C2` MR, `#2A4550/#CFE6F2` ST,
 * `#2F4A3A/#CDEBD9` AL). The contract's "six" for clubs is recorded under
 * STOPPED in S1-notes.md: the mockups hold four, and none is invented here.
 *
 * Pure: no React, no DOM, no import. Tested in avatar.test.ts.
 */

/** The club gradients, in the mockups' order (Salsa Club first). Initials in `#FAF7F2` on them. */
export const CLUB_GRADIENTS: readonly string[] = [
  "linear-gradient(145deg, #C23A72, #962858)",
  "linear-gradient(145deg, #1F7580, #155158)",
  "linear-gradient(145deg, #337A5A, #245942)",
  "linear-gradient(145deg, #8A6A22, #664C14)",
];

export type PersonColor = { bg: string; ink: string };

/** The person colours, in the mockups' order (DO, PS, JK, MR, ST, AL). */
export const PERSON_COLORS: readonly PersonColor[] = [
  { bg: "#2E4A5A", ink: "#CFE6F2" },
  { bg: "#4A3A5E", ink: "#E6D8F5" },
  { bg: "#5E4A2A", ink: "#F5E1B8" },
  { bg: "#5A3A2E", ink: "#FFD3C2" },
  { bg: "#2A4550", ink: "#CFE6F2" },
  { bg: "#2F4A3A", ink: "#CDEBD9" },
];

/** FNV-1a over the id's UTF-16 code units: deterministic, cheap, well spread for uuids. */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The club's gradient background when it has no logo. */
export function clubGradient(id: string): string {
  return CLUB_GRADIENTS[hashId(id) % CLUB_GRADIENTS.length];
}

/** The person's disc colour and initials ink when they have no avatar. */
export function personColor(id: string): PersonColor {
  return PERSON_COLORS[hashId(id) % PERSON_COLORS.length];
}
