import { redirect } from "next/navigation";

import { enforceCampusAccess } from "@/lib/auth/campus-access";

export const metadata = {
  title: "Messages · Vibe",
  description: "DMs and channels",
};

type Props = {
  searchParams: Promise<{ to?: string | string[] }>;
};

/**
 * `/messages` route — auth-gates, then redirects to the static prototype.
 * Preserves `?to=<handle>` so the prototype can auto-create/open that DM
 * channel via /api/me/threads.
 */
export default async function MessagesPage({ searchParams }: Props) {
  await enforceCampusAccess("/messages");
  const { to } = await searchParams;
  const handle = Array.isArray(to) ? to[0] : to;
  const target = handle
    ? `/html/messages.html?app=1&to=${encodeURIComponent(handle.toLowerCase())}`
    : "/html/messages.html?app=1";
  redirect(target);
}
