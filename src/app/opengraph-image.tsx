import {
  SHARE_CARD_ALT,
  SHARE_CARD_CONTENT_TYPE,
  SHARE_CARD_SIZE,
  renderShareCard,
} from "@/lib/og/share-card";

// The site-wide link preview. Next adds the og:image tags for every route
// that doesn't set its own openGraph.images, so the root layout's metadata
// must not list an image of its own (that would win over this file).
// Caption: "THE SOCIAL APP FOR YOUR CAMPUS" (S72). The image URL carries this
// file's hash, not the card's, so a new caption needs an edit here too, or
// link previews keep the old picture from their caches.
export const alt = SHARE_CARD_ALT;
export const size = SHARE_CARD_SIZE;
export const contentType = SHARE_CARD_CONTENT_TYPE;

export default function Image() {
  return renderShareCard();
}
