import type { Metadata } from "next";

import { ConfirmClient } from "./confirm-client";

// The link in the confirm email carries a private token: keep the page out
// of search engines, and send no Referer with the token anywhere.
export const metadata: Metadata = {
  title: "Your spot on the Vibe waitlist",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Where the confirm email's button lands. Opening it changes nothing (mail
 * scanners open links before people do); the page reads the state and shows
 * a button, and only tapping it confirms. It also serves as the person's
 * private status page for later visits. All of it happens in the client,
 * which reads the token from the address after load.
 */
export default function WaitlistConfirmPage() {
  return <ConfirmClient />;
}
