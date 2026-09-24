/**
 * The web side of the store apps' native bridge (handoffs/wave-plan-pwa/plan.md
 * §6 S2B; critic-s2s3.md items 3, 4, 6 and 18).
 *
 * The App Store and Google Play apps are a Capacitor shell around the live
 * site. The shell injects `window.Capacitor.Plugins.<Name>` into every page it
 * loads, one stub per native plugin it was built with, so this file talks to
 * those stubs directly. No `@capacitor/*` package is imported: the website
 * doesn't need them, and every browser would download them for nothing. The
 * types below are the slices of each plugin's published definitions (App
 * 8.1, StatusBar 8.0, Browser 8.0, Share 8.0, Filesystem 8.1) that Vibe calls,
 * with the enum values written as the plain strings they stand for.
 *
 * Safe to import anywhere: nothing touches `window` at module scope, and
 * outside the app every helper is a no-op or the plain web behaviour. No
 * function here throws or leaves a rejected promise behind; the Sentry client
 * records unhandled rejections, and a missing or failing plugin isn't
 * something a student can act on. No imports, only erasable TypeScript, so
 * `node --test` can load it as is.
 */

/** What `addListener` hands back: `{ remove }`, directly or in a promise. */
type ListenerHandle = { remove?: () => unknown };

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, unknown>;
};

/** @capacitor/app. `exitApp` only does anything on Android. */
export type AppPlugin = {
  addListener(eventName: string, listener: (event: unknown) => void): unknown;
  getLaunchUrl(): Promise<{ url?: string } | undefined>;
  exitApp(): Promise<void>;
};

/** @capacitor/status-bar. `"LIGHT"` is `Style.Light`: dark text, for light backgrounds. */
type StatusBarPlugin = {
  setStyle(options: { style: "LIGHT" | "DARK" | "DEFAULT" }): Promise<void>;
  setBackgroundColor(options: { color: string }): Promise<void>;
};

/** @capacitor/browser: SFSafariViewController on iPhone, a Custom Tab on Android. */
type BrowserPlugin = {
  open(options: { url: string; toolbarColor?: string }): Promise<void>;
};

/** @capacitor/share. `files` are `file://` URIs, which `writeCacheFile` returns. */
type SharePlugin = {
  share(options: { title?: string; text?: string; url?: string; files?: string[] }): Promise<unknown>;
};

/** @capacitor/filesystem. No `encoding` means `data` is base64 and written as bytes. */
type FilesystemPlugin = {
  writeFile(options: { path: string; data: string; directory: "CACHE" }): Promise<{ uri?: string }>;
};

/** Vibe's cream, the colour behind every page. */
const CREAM = "#FAF7F2";

/**
 * A native plugin's stub, or null in a browser, on the server, or when this
 * build of the app doesn't include that plugin. The website ships ahead of
 * the store binaries, so a newer page can meet an older app; every caller
 * treats null as "do what a browser would".
 */
export function getPlugin<T extends object>(name: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    if (!cap) return null;
    if (typeof cap.isNativePlatform === "function" && !cap.isNativePlatform()) return null;
    const plugin = cap.Plugins?.[name];
    return plugin && typeof plugin === "object" ? (plugin as T) : null;
  } catch {
    return null;
  }
}

/**
 * Runs a native call and settles quietly: a synchronous throw, a rejection
 * and a non-promise return all end here. Resolves to the call's value, or
 * `undefined` when it failed.
 */
async function settle<T>(call: () => Promise<T> | T): Promise<T | undefined> {
  try {
    return await call();
  } catch {
    return undefined;
  }
}

/**
 * Listens to a plugin event and returns the function that stops listening.
 *
 * The shell's own stub returns `{ remove }` straight away, while
 * `@capacitor/core` returns it in a promise, so both are accepted. If the
 * caller stops listening before the handle arrives, it's removed on arrival.
 * The shell also drops every listener when a page starts loading, so a
 * listener never outlives its page either way.
 */
export function listenNative<E>(
  pluginName: string,
  eventName: string,
  listener: (event: E | undefined) => void,
): () => void {
  const plugin = getPlugin<{ addListener?: AppPlugin["addListener"] }>(pluginName);
  const add = plugin?.addListener;
  if (!plugin || typeof add !== "function") return () => {};

  let stopped = false;
  let handle: ListenerHandle | null = null;
  const remove = (h: ListenerHandle) => void settle(() => h.remove?.());

  void settle(() => add.call(plugin, eventName, (e) => listener(e as E | undefined))).then((h) => {
    if (!h || typeof h !== "object") return;
    if (stopped) remove(h as ListenerHandle);
    else handle = h as ListenerHandle;
  });

  return () => {
    stopped = true;
    if (handle) remove(handle);
    handle = null;
  };
}

/**
 * Opens an http(s) page outside Vibe's own screens: the in-app browser sheet
 * in the store apps (the student closes it and is back where they were), a
 * new tab everywhere else. Resolves true when something opened.
 *
 * The browser path runs synchronously, before any await, because popup
 * blockers only allow `window.open` inside the tap itself. Other schemes are
 * refused: `mailto:` and `tel:` are plain links, and nothing else belongs here.
 */
export function openInBrowser(url: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.href);
  } catch {
    return Promise.resolve(false);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return Promise.resolve(false);
  const href = parsed.href;

  const browser = getPlugin<BrowserPlugin>("Browser");
  if (!browser) {
    try {
      window.open(href, "_blank", "noopener");
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }

  return settle(async () => {
    await browser.open({ url: href, toolbarColor: CREAM });
    return true;
  }).then((opened) => {
    if (opened) return true;
    // The sheet refused. Another site can still go where the shell sends any
    // other-host navigation, the phone's browser; one of Vibe's own pages would
    // load over this one instead, which loses whatever the student was doing.
    if (parsed.origin === window.location.origin) return false;
    try {
      window.location.assign(href);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * The phone's own share sheet, in the store apps only. Resolves true once the
 * sheet has opened, including when the student then cancels (both plugins
 * reject with "Share canceled") or one is already up. False means it never
 * opened: a browser, an app without the plugin, nothing to share. Callers fall
 * back to their web path only on false.
 */
export async function nativeShare(options: {
  title?: string;
  text?: string;
  url?: string;
  files?: string[];
}): Promise<boolean> {
  const share = getPlugin<SharePlugin>("Share");
  if (!share) return false;
  // Only the fields that are there. A title alone, or an empty `files` list,
  // shares nothing, and both plugins refuse that.
  const payload: { title?: string; text?: string; url?: string; files?: string[] } = {};
  if (options.title) payload.title = options.title;
  if (options.text) payload.text = options.text;
  if (options.url) payload.url = options.url;
  if (options.files && options.files.length > 0) payload.files = options.files;
  if (!payload.text && !payload.url && !payload.files) return false;
  try {
    await share.share(payload);
    return true;
  } catch (err) {
    // The shell rejects with a plain `{ message }`, not always an Error.
    const message = (err as { message?: unknown } | null)?.message;
    return typeof message === "string" && /cancel|in progress/i.test(message);
  }
}

/**
 * Writes base64 bytes to `name` in the app's cache folder and resolves to the
 * file's `file://` URI (what `nativeShare({ files })` takes), or null outside
 * the app or when the write fails. The OS clears that folder on its own.
 */
export async function writeCacheFile(name: string, base64: string): Promise<string | null> {
  const fs = getPlugin<FilesystemPlugin>("Filesystem");
  if (!fs) return null;
  // A bare file name: the cache folder is the only place this ever writes.
  const path = name.replace(/[/\\]/g, "-").replace(/^\.+/, "");
  // Accept a whole data URL too; the plugin wants only what follows the comma.
  const data = base64.replace(/^data:[^,]*,/, "");
  if (!path || !data) return null;
  const res = await settle(() => fs.writeFile({ path, data, directory: "CACHE" }));
  return typeof res?.uri === "string" && res.uri ? res.uri : null;
}

/** The link that launched the app, or null. Falsy answers count as none. */
export async function nativeLaunchUrl(): Promise<string | null> {
  const app = getPlugin<AppPlugin>("App");
  if (!app) return null;
  const res = await settle(() => app.getLaunchUrl());
  return typeof res?.url === "string" && res.url ? res.url : null;
}

/**
 * Fired on `window` before the Android back button does anything
 * (src/components/native/NativeBridge.tsx). It is cancelable: a sheet or menu
 * that closes itself on back calls preventDefault(), and the press stops there.
 */
export const NATIVE_BACK_EVENT = "vibe:native-back";

/** Closes the app. Android only: iOS apps never quit themselves. */
export function exitApp(): void {
  const app = getPlugin<AppPlugin>("App");
  if (app) void settle(() => app.exitApp());
}

/**
 * Dark status-bar text over Vibe's cream. The background colour is Android
 * only, and Android 15+ ignores it (the page draws behind the bar there), so
 * nothing may depend on it.
 */
export function styleStatusBarForCream(android: boolean): void {
  const bar = getPlugin<StatusBarPlugin>("StatusBar");
  if (!bar) return;
  void settle(() => bar.setStyle({ style: "LIGHT" }));
  if (android) void settle(() => bar.setBackgroundColor({ color: CREAM }));
}

/** The one site a link from outside the app may open inside it. */
const APP_HOST = "www.connectvibe.app";

/**
 * Where a link handed over by the phone (a tapped email link today; a
 * notification later) should take the app: the path, query and hash of a
 * `https://www.connectvibe.app` URL, or null for anything else.
 *
 * A path, not a URL, so it opens on whatever the app is showing (the live
 * site, or `next dev` in a dev build). Leading slashes collapse to one: the
 * URL parser keeps `https://www.connectvibe.app//evil.example` as the path
 * `//evil.example`, which the browser would read as another site.
 */
export function appPathFromLink(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.host !== APP_HOST) return null;
  return parsed.pathname.replace(/^\/+/, "/") + parsed.search + parsed.hash;
}

/** The only files Vibe links for download today are event calendar files. */
const DEFAULT_DOWNLOAD_NAME = "vibe-event.ics";

export type AnchorAction =
  | { kind: "ignore" }
  | { kind: "in-place"; href: string }
  | { kind: "browser"; href: string }
  | { kind: "download"; href: string; filename: string };

/**
 * What the app does with a plain left tap on a link (critic-s2s3.md items 4
 * and 6). `href` is the anchor's resolved `href`, `target` and `download` its
 * attributes (null when absent).
 *
 * - Not http(s) (`mailto:`, `tel:`, `sms:`, `blob:`, `data:`, …): left alone.
 *   The protocol is checked rather than the origin, because a `blob:` URL
 *   reports the page's own origin.
 * - A download of one of Vibe's own files: fetched and handed to the share
 *   sheet, since neither web view saves downloads.
 * - A new-window link: Vibe's own pages load in place (the iPhone app would
 *   otherwise send them to Safari, which isn't signed in); other sites open
 *   in the in-app browser sheet.
 * - Everything else is a normal link and stays with the browser and Next.
 */
export function anchorAction(
  href: string,
  target: string | null,
  download: string | null,
  pageOrigin: string,
): AnchorAction {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: "ignore" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "ignore" };
  const sameOrigin = url.origin === pageOrigin;

  if (download !== null && sameOrigin) {
    return { kind: "download", href: url.href, filename: download.trim() || DEFAULT_DOWNLOAD_NAME };
  }
  const t = (target ?? "").trim().toLowerCase();
  if (t === "" || t === "_self") return { kind: "ignore" };
  return sameOrigin ? { kind: "in-place", href: url.href } : { kind: "browser", href: url.href };
}
