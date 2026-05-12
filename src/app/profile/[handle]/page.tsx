import { enforceCampusAccess } from "@/lib/auth/campus-access";

import { ProfileHandleSwitch } from "./ProfileHandleSwitch";

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
 * `/profile/<handle>` route — server auth gate, then a client-side
 * viewport fork.
 *
 * Mobile: renders ProfileMobile in visitor mode (Connect/Follow CTA,
 * Posts/Clips/Portfolio tabs read from the per-handle public APIs).
 * Desktop: client-side redirects to /html/profile.html?handle=<handle>
 * so the static prototype keeps handling viewer mode there.
 *
 * The switch is intentionally client-side — the server has no
 * reliable viewport signal, and UA sniffing breaks on iPad-class
 * devices that pretend to be desktop.
 */
export default async function ProfileByHandlePage({
  params,
  searchParams,
}: Props) {
  const { handle } = await params;
  const sp = await searchParams;
  await enforceCampusAccess(`/profile/${handle}`);
  const welcome = sp?.welcome === "1";
  return <ProfileHandleSwitch handle={handle} welcome={welcome} />;
}
