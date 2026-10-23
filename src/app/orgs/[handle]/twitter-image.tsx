import {
  CLUB_CARD_ALT,
  CLUB_CARD_CONTENT_TYPE,
  CLUB_CARD_SIZE,
  renderClubCard,
} from "@/lib/og/club-card";

// Same card as opengraph-image.tsx, for X's summary_large_image (Oct 23,
// 2026). Its own file (not a re-export) so Next reads alt/size/contentType
// straight off it. The page names the site's picture on X too for a hidden
// or missing club, and this route draws the site's card for them anyway.
// As in opengraph-image.tsx, the image URL carries this file's hash, so a
// redrawn card needs an edit here.
export const dynamic = "force-dynamic";
export const alt = CLUB_CARD_ALT;
export const size = CLUB_CARD_SIZE;
export const contentType = CLUB_CARD_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return renderClubCard(handle);
}
