import {
  CLUB_CARD_ALT,
  CLUB_CARD_CONTENT_TYPE,
  CLUB_CARD_SIZE,
  renderClubCard,
} from "@/lib/og/club-card";

// A club's link picture (the club's view, wave 3, B2, Oct 23, 2026): the
// club card, drawn from the club's public page (src/lib/og/club-card.tsx).
// The page's generateMetadata names no picture for a visible club, so Next
// uses this file; for a hidden or missing club it names the site's picture
// outright, and this route draws the site's card for them anyway, never
// their name (club-card-content.ts holds both rules, with tests).
// Read fresh on every ask, so a club hidden or renamed shows as it is now.
// As in src/app/opengraph-image.tsx, the image URL carries this file's hash,
// so a redrawn card needs an edit here, or link previews keep the old one.
export const dynamic = "force-dynamic";
export const alt = CLUB_CARD_ALT;
export const size = CLUB_CARD_SIZE;
export const contentType = CLUB_CARD_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return renderClubCard(handle);
}
