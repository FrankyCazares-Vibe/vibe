import { redirect } from "next/navigation";

import { enforceCampusAccess } from "@/lib/auth/campus-access";

type Props = { params: Promise<{ handle: string }> };

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
 * The static prototype's init detects `?handle=`, fetches
 * `/api/users/[handle]/bootstrap` (public-only fields), sets
 * `window.viewingRealUser` for the Connect button, and renders.
 *
 * 404 (handle doesn't exist) is handled inside the prototype rather than
 * here so we don't need a duplicate server-side fetch — keeps the route
 * cheap and the data path single-sourced.
 */
export default async function ProfileByHandlePage({ params }: Props) {
  const { handle } = await params;
  await enforceCampusAccess(`/profile/${handle}`);
  const target =
    `/html/profile.html?app=1&handle=${encodeURIComponent(handle.toLowerCase())}`;
  redirect(target);
}
