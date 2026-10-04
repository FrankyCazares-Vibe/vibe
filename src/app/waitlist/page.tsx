import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { cleanSource } from "@/lib/waitlist/form";
import { isSignupOpen } from "@/lib/waitlist/signup-open";
import { parseSignupOverride, SIGNUP_PATH } from "@/lib/waitlist/types";

import { WaitlistForm } from "./waitlist-form";

export const dynamic = "force-dynamic";

const TITLE = "Join the Vibe waitlist";
const DESCRIPTION =
  "Vibe is the social app for college students, opening in waves. Join the waitlist with your school email and we'll send you an access code when it's your turn.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/waitlist" },
  openGraph: { type: "website", siteName: "Vibe", locale: "en_US", url: "/waitlist", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/**
 * The waitlist form. Once sign-up opens for everyone (the `signup_open`
 * switch), there is no list to join: the page sends people to sign-up.
 *
 * `?src=` tags where the visitor came from (a flyer, a club, the landing),
 * kept only when it is a short plain tag. `?officer=1` (the landing's "Bring
 * your club" door) opens the form with "I run a club" ticked.
 */
export default async function WaitlistPage({ searchParams }: Props) {
  const params = await searchParams;
  const override = parseSignupOverride(first(params.signup), process.env.NODE_ENV);
  if (await isSignupOpen(override)) redirect(SIGNUP_PATH);

  return (
    <WaitlistForm
      source={cleanSource(first(params.src))}
      officer={first(params.officer) === "1"}
    />
  );
}
