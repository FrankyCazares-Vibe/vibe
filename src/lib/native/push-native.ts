/**
 * Push notifications in the store apps, web side (handoffs/wave-plan-pwa/plan.md
 * §8.2, W11 and W12; critic-w3.md items 4, 11, 13, 14 and 16).
 *
 * The apps carry `@capacitor-firebase/messaging` 8.5.2, and the shell injects
 * its stub as `window.Capacitor.Plugins.FirebaseMessaging` like every other
 * plugin, so this file talks to that stub through ./bridge: no npm import, and
 * browsers download nothing for it. Every method, event and field name below
 * was checked against the installed package (mobile/node_modules/
 * @capacitor-firebase/messaging: dist/esm/definitions.d.ts, ios/Plugin/*.swift,
 * android/src/main/java/**).
 *
 * Imports only ./bridge (critic-w3.md item 20). Nothing here throws or leaves
 * a rejected promise behind, and nothing ever logs a token.
 */
import { getPlugin, listenNative } from "./bridge";

export type NativePermission = "granted" | "denied" | "prompt";

type PermissionAnswer = { receive?: unknown } | undefined;

/** The slice of FirebaseMessagingPlugin (definitions.d.ts) that Vibe calls. */
type MessagingPlugin = {
  checkPermissions(): Promise<PermissionAnswer>;
  requestPermissions(): Promise<PermissionAnswer>;
  getToken(): Promise<{ token?: unknown } | undefined>;
  deleteToken(): Promise<void>;
  removeAllDeliveredNotifications(): Promise<void>;
};

/** @capacitor/app's getInfo, which bridge.ts's AppPlugin leaves out. */
type AppInfoPlugin = {
  getInfo(): Promise<{ version?: unknown } | undefined>;
};

/** NotificationActionPerformedEvent, as loosely as it can arrive. */
type ActionEvent = {
  actionId?: unknown;
  notification?: { id?: unknown; data?: unknown } | null;
};

const PLUGIN = "FirebaseMessaging";

/** How long each call may take before it counts as failed. The call itself isn't cancelled. */
const CHECK_MS = 5_000;
const TOKEN_MS = 10_000;
const DELETE_MS = 8_000;
const CLEAR_MS = 3_000;
const INFO_MS = 3_000;
/** The one retry after a failed getToken (the APNs token can land just after the prompt). */
const TOKEN_RETRY_MS = 1_500;

/** The server checks the token's real shape (src/lib/push/device-address.ts); this only refuses junk. */
const MAX_TOKEN = 4096;
const MAX_TAP_ID = 256;
const VERSION_SHAPE = /^[0-9A-Za-z._+-]{1,32}$/;

const TIMED_OUT = { timedOut: true } as const;

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

function messaging(): MessagingPlugin | null {
  return getPlugin<MessagingPlugin>(PLUGIN);
}

/**
 * Starts a native call at once, before any await (the permission prompt must
 * start inside the tap), and settles it: a throw, a rejection and a timeout
 * all end as `ok: false`. `timeoutMs` null waits as long as the call takes.
 */
function run<T>(call: () => Promise<T> | T, timeoutMs: number | null): Promise<Outcome<T>> {
  let started: Promise<T>;
  try {
    started = Promise.resolve(call());
  } catch (error) {
    return Promise.resolve({ ok: false, error });
  }
  return new Promise((resolve) => {
    const timer = timeoutMs === null ? null : setTimeout(() => resolve({ ok: false, error: TIMED_OUT }), timeoutMs);
    started.then(
      (value) => {
        if (timer !== null) clearTimeout(timer);
        resolve({ ok: true, value });
      },
      (error: unknown) => {
        if (timer !== null) clearTimeout(timer);
        resolve({ ok: false, error });
      },
    );
  });
}

/** Calls a page callback without letting it throw into the native event dispatch. */
function safely(call: () => void): void {
  try {
    call();
  } catch {
    // The caller's own bug; the shell's event loop isn't the place to surface it.
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** "prompt-with-rationale" is Android after a first "Don't allow": it can still ask. */
function readPermission(answer: PermissionAnswer): NativePermission | null {
  const state = answer?.receive;
  if (state === "granted" || state === "denied") return state;
  if (state === "prompt" || state === "prompt-with-rationale") return "prompt";
  return null;
}

/**
 * True when this build has no Firebase config file, so no token can ever
 * come. iOS rejects with the code "UNAVAILABLE" (FirebaseMessagingPlugin.swift,
 * rejectCallAsUnavailable). Android has no code, only Firebase's own
 * "Default FirebaseApp is not initialized in this process …", which the plugin
 * catches and passes on as the message (FirebaseMessagingPlugin.java getToken).
 */
function firebaseMissing(error: unknown): boolean {
  const e = asRecord(error);
  if (!e) return false;
  if (e.code === "UNAVAILABLE") return true;
  const message = typeof e.message === "string" ? e.message : "";
  return /FirebaseApp is not initiali[sz]ed/i.test(message) || /Firebase is not configured/i.test(message);
}

/** True when this app build has the push plugin. Older binaries don't. */
export function nativePushPluginPresent(): boolean {
  return messaging() !== null;
}

/**
 * The OS notification permission, or null without the plugin or when the
 * call failed. Android 12 and older always answer "granted", even when the
 * student switched the app's notifications off in system settings
 * (FirebaseMessagingPlugin.java checkPermissions; critic-w3.md item 16), so
 * "granted" there doesn't prove anything will show.
 */
export async function nativeCheckPermission(): Promise<NativePermission | null> {
  const plugin = messaging();
  if (!plugin) return null;
  const res = await run(() => plugin.checkPermissions(), CHECK_MS);
  return res.ok ? readPermission(res.value) : null;
}

/**
 * Shows the OS prompt (or answers at once when the student already chose).
 * Not an async function: the plugin call starts synchronously, inside the
 * tap. No timeout, since the prompt waits for the student. Android 12 and
 * older answer "granted" without asking.
 */
export function nativeRequestPermission(): Promise<NativePermission | null> {
  const plugin = messaging();
  if (!plugin) return Promise.resolve(null);
  return run(() => plugin.requestPermissions(), null).then((res) =>
    res.ok ? readPermission(res.value) : null,
  );
}

type TokenTry = { ok: true; token: string } | { ok: false; unavailable: boolean; retry: boolean };

async function tokenOnce(plugin: MessagingPlugin): Promise<TokenTry> {
  const res = await run(() => plugin.getToken(), TOKEN_MS);
  if (res.ok) {
    const token = res.value?.token;
    if (typeof token === "string" && token.length > 0 && token.length <= MAX_TOKEN) {
      return { ok: true, token };
    }
    return { ok: false, unavailable: false, retry: true };
  }
  // A call that never answered won't answer faster 1.5 s later.
  if (res.error === TIMED_OUT) return { ok: false, unavailable: false, retry: false };
  const unavailable = firebaseMissing(res.error);
  return { ok: false, unavailable, retry: !unavailable };
}

/**
 * This device's FCM token. `unavailable` means this build can't have one: no
 * plugin, or no Firebase config file in the app. Otherwise a failure is
 * retried once after 1.5 s, because on an iPhone the first call right after
 * the prompt can beat the APNs token (FirebaseMessaging.swift getToken).
 *
 * Calling this switches Firebase's auto-init on for good; the plugin has no
 * way to switch it off again (critic-w3.md item 11). Only an opt-in, or a
 * resync for a device that already opted in, may call it.
 */
export async function nativeGetToken(): Promise<
  { ok: true; token: string } | { ok: false; unavailable: boolean }
> {
  const plugin = messaging();
  if (!plugin) return { ok: false, unavailable: true };
  let attempt = await tokenOnce(plugin);
  if (!attempt.ok && attempt.retry) {
    await wait(TOKEN_RETRY_MS);
    attempt = await tokenOnce(plugin);
  }
  return attempt.ok ? attempt : { ok: false, unavailable: attempt.unavailable };
}

/**
 * Drops this device's FCM token. True when the plugin said it was done;
 * Android says so as soon as the request is on its way. Firebase mints a new
 * token at a later launch (auto-init stays on), which no server row ever
 * learns without a new opt-in.
 */
export async function nativeDeleteToken(): Promise<boolean> {
  const plugin = messaging();
  if (!plugin) return false;
  const res = await run(() => plugin.deleteToken(), DELETE_MS);
  return res.ok;
}

/**
 * Clears every Vibe notification still showing on this phone (critic-w3.md
 * item 4): after a sign-out on a shared phone, the last student's "Name:
 * message" must not stay in Notification Center. Works without Firebase
 * config on both platforms; the app icon badge is a separate thing.
 */
export async function nativeClearDelivered(): Promise<void> {
  const plugin = messaging();
  if (!plugin) return;
  await run(() => plugin.removeAllDeliveredNotifications(), CLEAR_MS);
}

/** The app's version (App.getInfo), or null when it's missing or not a plain version string. */
export async function nativeAppVersion(): Promise<string | null> {
  const app = getPlugin<AppInfoPlugin>("App");
  if (!app) return null;
  const res = await run(() => app.getInfo(), INFO_MS);
  const version = res.ok ? res.value?.version : undefined;
  return typeof version === "string" && VERSION_SHAPE.test(version) ? version : null;
}

/**
 * The FCM message id, the same for every delivery of one push, so a replayed
 * tap can be recognised. iOS keeps it in the data as "gcm.message_id" (its
 * `id` is the OS request id); Android moves "google.message_id" out of the
 * data and makes it the `id` (FirebaseMessagingHelper.java).
 */
function tapId(notification: ActionEvent["notification"], data: Record<string, unknown> | null): string | null {
  const fromData = data?.["gcm.message_id"];
  const raw =
    typeof fromData === "string" && fromData
      ? fromData
      : typeof fromData === "number"
        ? String(fromData)
        : notification?.id;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id && id.length <= MAX_TAP_ID ? id : null;
}

/**
 * Calls `cb` with the notification's link and its dedupe id when the student
 * taps a Vibe notification (W12). Only a plain tap counts: iOS also reports
 * "dismiss" and custom actions here (FirebaseMessagingPlugin.swift
 * handleNotificationActionPerformed; critic-w3.md item 14). The link is the
 * raw `data.url` the sender set (src/lib/push/payload.ts toFcm); the caller
 * checks where it goes (bridge.ts pushTapPath) before opening anything.
 *
 * The plugin holds a tap that arrives before anyone listens, a cold start
 * included, and hands it to the first listener; the shell drops listeners at
 * every page load. So this belongs in a root component that listens on every
 * load (NativeBridge).
 */
export function onNativePushTap(cb: (url: string, id: string | null) => void): () => void {
  return listenNative<ActionEvent>(PLUGIN, "notificationActionPerformed", (e) => {
    if (e?.actionId !== "tap") return;
    const notification = e.notification;
    const data = asRecord(notification?.data);
    const url = data?.url;
    if (typeof url !== "string" || !url) return;
    const id = tapId(notification, data);
    safely(() => cb(url, id));
  });
}

/** Calls `cb` when Firebase hands this device a new FCM token (a rotation, or right after getToken). */
export function onNativeTokenRefresh(cb: (token: string) => void): () => void {
  return listenNative<{ token?: unknown }>(PLUGIN, "tokenReceived", (e) => {
    const token = e?.token;
    if (typeof token === "string" && token.length > 0 && token.length <= MAX_TOKEN) {
      safely(() => cb(token));
    }
  });
}

/**
 * Listens to the two plugin events Vibe doesn't use, and drops them
 * (critic-w3.md item 13). The plugin sends every push that arrives while the
 * app is open ("notificationReceived") and, on iPhones, the APNs token at
 * every launch ("apnsTokenReceived") as "keep until someone listens", and the
 * shell keeps each unheard one for the life of the app. Call it on every page
 * load, like the other listeners.
 */
export function drainUnusedPushEvents(): () => void {
  const stops = [
    listenNative(PLUGIN, "notificationReceived", () => {}),
    listenNative(PLUGIN, "apnsTokenReceived", () => {}),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
