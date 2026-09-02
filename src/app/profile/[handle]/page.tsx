import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/auth/site-url";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { ProfileHandleSwitch } from "./ProfileHandleSwitch";

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type PublicProfileRow = {
  id: string;
  name: string | null;
  handle: string | null;
  tagline: string | null;
  bio: string | null;
  avatar_url: string | null;
};

/** Deduped across generateMetadata + the page so we don't hit Supabase twice. */
const loadPublicProfile = cache(async (handle: string) => {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("users")
    .select("id,name,handle,tagline,bio,avatar_url")
    .eq("handle", handle)
    .maybeSingle();
  return (data as PublicProfileRow | null) ?? null;
});

function ogAvatarUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return t;
  } catch {
    return undefined;
  }
}

/**
 * `/profile/<handle>` is a public share-link target — iMessage / Discord
 * unfurls, plus anyone (logged in or not) tapping the URL. OG meta is
 * built with the service-role client because `users` RLS is
 * authenticated-only; crawlers have no session.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle: raw } = await params;
  const handle = (raw || "").trim().toLowerCase();
  if (!handle) return { title: "Profile · Vibe" };

  try {
    const row = await loadPublicProfile(handle);
    if (!row) return { title: `@${handle} · Vibe` };

    const name = (row.name || "").trim() || `@${row.handle || handle}`;
    const at = row.handle || handle;
    const title = `${name} (@${at}) · Vibe`;
    const description =
      (row.tagline || "").trim() ||
      (row.bio || "").trim().slice(0, 160) ||
      `${name}'s profile on Vibe`;
    const image = ogAvatarUrl(row.avatar_url);
    const url = `${getSiteUrl()}/profile/${encodeURIComponent(at)}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url,
        type: "profile",
        images: image ? [{ url: image }] : undefined,
      },
      twitter: {
        card: image ? "summary" : "summary",
        title,
        description,
        images: image ? [image] : undefined,
      },
    };
  } catch {
    return { title: `@${handle} · Vibe` };
  }
}

/**
 * `/profile/<handle>` route — public profile view, then a client-side
 * viewport fork.
 *
 * Mobile: renders ProfileMobile in visitor mode (Connect/Follow CTA,
 * Posts/Clips/Portfolio tabs read from the per-handle public APIs).
 * Desktop: client-side redirects to /html/profile.html?handle=<handle>
 * so the static prototype keeps handling viewer mode there.
 *
 * Intentionally not campus-gated: share links have to work from
 * iMessage's in-app browser (no cookies) and from logged-out visitors.
 * Connect / Follow still require a session on the API.
 */
export default async function ProfileByHandlePage({
  params,
  searchParams,
}: Props) {
  const { handle: raw } = await params;
  const handle = (raw || "").trim().toLowerCase();
  if (!handle) notFound();

  try {
    const row = await loadPublicProfile(handle);
    if (!row) notFound();
  } catch {
    // Service role missing/down: still mount the client and let the
    // bootstrap fetch surface the error, rather than 500 the share link.
  }

  const sp = await searchParams;
  const welcome = sp?.welcome === "1";
  return <ProfileHandleSwitch handle={handle} welcome={welcome} />;
}
