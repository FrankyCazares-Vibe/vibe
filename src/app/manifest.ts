import type { MetadataRoute } from "next";

/**
 * The installable app's manifest. Next serves it at /manifest.webmanifest and
 * links it from every React page because this file exists, which is why the
 * root layout has no `manifest` key. The static pages under public/html link
 * it by hand.
 *
 * `id` is pinned to "/" from day one. Without it Chrome derives the app's
 * identity from start_url, so a later start_url change would install as a
 * second, different app next to the first.
 *
 * `start_url` is /campus: the first phone tab and where onboarding ends. The
 * existing gates route everyone else (signed out → login with next=/campus,
 * half-onboarded → their step, suspended → the notice). There's no
 * `?source=` marker because the first gate that fires drops the query;
 * "installed" is detected in the client from display-mode instead.
 *
 * `scope` is the whole origin so /auth, /legal, /account and the static
 * /html pages stay inside the app window. Anything narrower would show
 * browser chrome, or leave the app, on every gate hop.
 *
 * Cream for both colours: the Android splash then matches the first screen a
 * signed-in student sees, and theme_color matches the layout's themeColor.
 *
 * `launch_handler` reuses the open window when a link or a notification
 * launches the app, instead of stacking a second one. Chromium and Samsung
 * Internet honour it; Safari and Firefox ignore it.
 *
 * The icons come from src/app/icon.svg via scripts/gen-pwa-icons.mjs. Chrome
 * won't offer Install without the 512. `any` and `maskable` are separate
 * entries on purpose (web.dev: never one "any maskable" file), and
 * scripts/check-pwa.mjs expects exactly these four. iOS ignores them and uses
 * the apple-touch-icon.
 *
 * Get the name and icons right before testers install: an installed Android
 * app only picks up changes here when Chrome re-mints it (at most daily, with
 * every app window closed, on Wi-Fi and charging), and desktop Chrome never
 * updates icons at all.
 */

const CREAM = "#FAF7F2";

// Launcher shortcuts show on a long-press of the Android icon and a
// right-click of the desktop taskbar one. Each carries the 192 icon so the
// menu draws our logo beside it.
const SHORTCUT_ICONS: MetadataRoute.Manifest["icons"] = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
];

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Vibe",
    short_name: "Vibe",
    // Same line as the root layout's metadata description.
    description: "Your campus, your career, one profile.",
    start_url: "/campus",
    scope: "/",
    display: "standalone",
    background_color: CREAM,
    theme_color: CREAM,
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Messages", url: "/messages", icons: SHORTCUT_ICONS },
      { name: "My profile", url: "/profile", icons: SHORTCUT_ICONS },
    ],
  };
}
