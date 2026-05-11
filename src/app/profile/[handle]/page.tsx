import { redirect } from "next/navigation";

import { enforceCampusAccess } from "@/lib/auth/campus-access";

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const { handle } = await params;
  return {
    title: `@${handle} · Vibe`,
    description: "Profile",
  };
}

/**
 * `/profile/<handle>` route — auth-gates the request, then redirects to the
 * static prototype with `?handle=<handle>` so the same HTML/CSS the owner
 * sees on `/profile` is reused for visiting other users (viewer mode).
 *
 * `?welcome=1` is forwarded so the post-onboarding flow (and the Settings →
 * Replay tour entry) can fire Otto's spotlight tour on the static page —
 * without this passthrough the redirect strips the query and the tour
 * never starts.
 */
export default async function ProfileByHandlePage({
  params,
  searchParams,
}: Props) {
  const { handle } = await params;
  const sp = await searchParams;
  await enforceCampusAccess(`/profile/${handle}`);
  const welcome = sp?.welcome === "1" ? "&welcome=1" : "";
  const target =
    `/html/profile.html?app=1&handle=${encodeURIComponent(handle.toLowerCase())}${welcome}`;
  redirect(target);
}
