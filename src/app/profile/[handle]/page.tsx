import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requirePlatformAdmin } from "@/lib/auth/require-platform-admin";
import { getSiteUrl } from "@/lib/auth/site-url";
import { isPhoneRequest } from "@/lib/device-hint";
import { getActiveRestriction } from "@/lib/moderation/access";
import { profilePreviewDescription } from "@/lib/profile/hidden-fields";
import { sanitizeProfileLayout } from "@/lib/profile/profile-layout";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  /** Service-role only column; read so a hidden bio stays out of the preview. */
  profile_layout: unknown;
};

/** Deduped across generateMetadata + the page so we don't hit Supabase twice. */
const loadPublicProfile = cache(async (handle: string) => {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("users")
    .select("id,name,handle,tagline,bio,avatar_url,profile_layout")
    .eq("handle", handle)
    .maybeSingle();
  // Throw on transport/RLS errors so callers can tell "Supabase is down"
  // (keep the share link alive) from "no such handle" (404).
  if (error) throw error;
  return (data as PublicProfileRow | null) ?? null;
});

/**
 * The target's restriction, shared by generateMetadata and the page (S67
 * security wave 2, A1; report #2b). getActiveRestriction never throws: a
 * failed read comes back `{ ok: false }`.
 */
const loadRestriction = cache(async (userId: string) => getActiveRestriction(userId));

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
 *
 * Because that read bypasses RLS, the rules are restated here (S67 security
 * wave 2, A1; product call 3): a suspended or banned student — or one whose
 * restriction can't be read — gets EXACTLY the unknown-handle preview, so an
 * unfurl can't tell "restricted" from "no such user" and shows no name, bio
 * or avatar; and a bio the student hid is left out of the description.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle: raw } = await params;
  const handle = (raw || "").trim().toLowerCase();
  if (!handle) return { title: "Profile · Vibe" };

  try {
    const row = await loadPublicProfile(handle);
    if (!row) return { title: `@${handle} · Vibe` };
    const restriction = await loadRestriction(row.id);
    if (!restriction.ok || restriction.restriction) return { title: `@${handle} · Vibe` };

    const name = (row.name || "").trim() || `@${row.handle || handle}`;
    const at = row.handle || handle;
    const title = `${name} (@${at}) · Vibe`;
    const description = profilePreviewDescription({
      name,
      tagline: row.tagline,
      bio: row.bio,
      bioHidden: sanitizeProfileLayout(row.profile_layout).hidden.includes("bio"),
    });
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
 * viewport fork (started from the server's phone-or-not guess).
 *
 * Mobile: renders ProfileMobile in visitor mode (Connect/Follow CTA,
 * Posts/Clips/Portfolio tabs read from the per-handle public APIs).
 * Desktop: hops client-side to /html/profile.html?app=1&handle=<handle>,
 * carrying ?post / ?welcome, where the static page renders viewer mode
 * and then puts /profile/<handle> back in the address bar. Old
 * /html/profile.html?handle=<h> links redirect here (src/proxy.ts), so
 * they unfurl with this route's preview card too.
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

  // notFound() signals by throwing, so it must live OUTSIDE the try: the
  // bare catch below used to swallow it and every unknown handle returned a
  // 200 shell with a real-looking title (feature-sentinel #27/#37, S54).
  let row: PublicProfileRow | null | undefined;
  try {
    row = await loadPublicProfile(handle);
  } catch {
    // Service role missing/down: still mount the client and let the
    // bootstrap fetch surface the error, rather than 500 the share link.
  }
  if (row === null) notFound();

  // A suspended or banned student's page answers the same 404 as an unknown
  // handle (S67 security wave 2, A1), matching the bootstrap and the preview
  // above; otherwise "page 200, bootstrap 404" would tell anyone who a
  // moderator acted on. The same two people the bootstrap lets through still
  // get in: the student themselves, and a platform admin (the moderation
  // screens link straight here). A restriction read that FAILED keeps the
  // page mounted; the bootstrap then answers 500 and nothing is shown.
  if (row) {
    const restriction = await loadRestriction(row.id);
    if (restriction.ok && restriction.restriction) {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const allowed = user?.id === row.id || (user ? (await requirePlatformAdmin()).ok : false);
      if (!allowed) notFound();
    }
  }

  // The whole query goes down as a string; ProfileHandleSwitch carries only
  // the settings the static page reads (forwardedProfileParams). Reading it
  // here, not with useSearchParams, keeps the effect keyed to a server prop.
  const sp = await searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp ?? {})) {
    for (const one of Array.isArray(v) ? v : [v]) {
      if (typeof one === "string") query.append(k, one);
    }
  }
  // The server's guess at the screen this device needs (device-hint.ts). It
  // only picks what is built here; the hop to the static page is still
  // decided in the browser, by the window's width.
  return (
    <ProfileHandleSwitch
      handle={handle}
      query={query.toString()}
      firstGuessPhone={isPhoneRequest(await headers())}
    />
  );
}
