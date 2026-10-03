import {
  SHARE_CARD_ALT,
  SHARE_CARD_CONTENT_TYPE,
  SHARE_CARD_SIZE,
  renderShareCard,
} from "@/lib/og/share-card";

// Same card as opengraph-image.tsx, for X's summary_large_image. Its own file
// (not a re-export) so Next reads alt/size/contentType straight off it.
// Caption: "THE SOCIAL APP FOR YOUR CAMPUS" (S72). As in opengraph-image.tsx,
// the image URL carries this file's hash, so a new caption needs an edit here.
export const alt = SHARE_CARD_ALT;
export const size = SHARE_CARD_SIZE;
export const contentType = SHARE_CARD_CONTENT_TYPE;

export default function Image() {
  return renderShareCard();
}
