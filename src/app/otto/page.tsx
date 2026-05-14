import { Suspense } from "react";
import { redirect } from "next/navigation";

import { CampusAppShell } from "@/components/campus-app-shell";
import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { headers } from "next/headers";

import { OttoSwitch } from "./OttoSwitch";

export const metadata = {
  title: "otto · vibe",
  description: "your campus compass.",
};

/**
 * /otto — Otto's Room.
 *
 * Server entry: auth-gates the page (campus-access redirects on its own),
 * fetches the composed payload from /api/me/otto in the same request, then
 * hands it to the client component. Doing the fetch here means the page is
 * already populated on first paint (no skeleton flash).
 */
export default async function OttoPage() {
  await enforceCampusAccess("/otto");

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host");
  if (!host) {
    redirect("/auth/login?next=%2Fotto");
  }
  const cookie = h.get("cookie") ?? "";

  // Same-origin fetch with the user's cookies — Supabase auth flows through.
  // We don't cache because the payload is per-user and changes constantly.
  const res = await fetch(`${proto}://${host}/api/me/otto`, {
    headers: { cookie },
    cache: "no-store",
  });

  if (!res.ok) {
    return (
      <CampusAppShell>
        <main className="otto-room">
          <div className="otto-room-main">
            <p className="otto-room-empty">otto&rsquo;s offline. try again in a sec.</p>
          </div>
        </main>
      </CampusAppShell>
    );
  }

  const payload = await res.json();

  // Suspense boundary: OttoPageClient reads useSearchParams (for the ?tab=
  // tab state), which Next 16 requires to be inside a Suspense — otherwise
  // any URL with searchParams forces the whole route into client-render.
  return (
    <Suspense fallback={null}>
      <OttoSwitch initial={payload} />
    </Suspense>
  );
}
