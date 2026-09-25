/**
 * "Notifications on this device", for browsers (Web Push) and the store apps
 * (FCM) (handoffs/wave-plan-pwa/plan.md §8 W1, W2, W5, W6, W13 and §8.2;
 * critic-w3.md items 1, 2, 4, 7, 9, 10, 11, 20, 21 and 25).
 *
 * The Settings card reads and flips it, the registrar and NativeBridge resync
 * it once per load, and leave-device-clean.ts undoes it at sign-out. The rules
 * themselves (what a resync does, when the card shows) live in
 * device-push-logic.ts, which is pure and tested; this file only gathers the
 * facts and carries the answer out.
 *
 * Browser-only and React-free. Nothing here throws, navigates or shows a
 * toast: every request is `quiet`, and a failure comes back as a status or a
 * boolean. Every storage access is in try/catch (private windows, blocked
 * storage). Turn on, turn off, resync and leave run one at a time on a single
 * promise chain, so a resync can't read "a subscription and no record" in the
 * middle of a turn-on and evict the student's own new device.
 *
 * Imports go one way only: leave-device-clean → this → push-native → bridge
 * (critic-w3.md item 20). NEVER LOG AN ADDRESS: an endpoint or a token is a
 * capability to reach this student's lock screen.
 */

import { vibeRequest, type VibeResult } from "@/lib/feedback/request";
import { appShellOnClient, type AppShell } from "@/lib/native/detect";
import {
  nativeAppVersion,
  nativeCheckPermission,
  nativeClearDelivered,
  nativeDeleteToken,
  nativeGetToken,
  nativePushPluginPresent,
  nativeRequestPermission,
  type NativePermission,
} from "@/lib/native/push-native";
import {
  addressHash,
  backoffActive,
  base64UrlToBytes,
  evictAddresses,
  failureStartsBackoff,
  keysMatch,
  parseDeviceRecord,
  parseServerAnswer,
  pushPlatformFor,
  readFinal,
  readGate,
  resyncAction,
  resyncNeedsServer,
  turnOnRefusal,
  PUSH_DEVICE_KEY,
  PUSH_SYNC_FAIL_KEY,
  type CurrentDevice,
  type DevicePushStatus,
  type DeviceRecord,
  type DeviceTransport,
  type ServerDevices,
  type ServerOk,
  type TurnOnResult,
} from "@/lib/pwa/device-push-logic";
import { detectPlatform, isIosPlatform, isStandalone, type Platform } from "@/lib/pwa/display-mode";

export type { DevicePushStatus, TurnOnResult } from "@/lib/pwa/device-push-logic";
export { PUSH_DEVICE_KEY, PUSH_SYNC_FAIL_KEY };

const ENDPOINT = "/api/me/push-devices";

/** getRegistration, and `ready` when the registration has no active worker yet (critic-w3.md item 7). */
const REGISTRATION_MS = 4000;
/** getSubscription / unsubscribe on one push manager. */
const MANAGER_MS = 3000;
/** subscribe() talks to the browser's push service. */
const SUBSCRIBE_MS = 10_000;
/** Each request to our own API. */
const REQUEST_MS = 10_000;
/**
 * getToken: push-native allows 10 s, then 1.5 s, then a 10 s retry (the iOS
 * APNs token can trail the grant, critic-w3.md item 10), so wait for all of it.
 */
const TOKEN_MS = 23_000;
/** Any other plugin call. */
const NATIVE_MS = 3000;
/**
 * Each step of leaving, and each read (registration, then subscriptions):
 * 600 + 600 + 700 + 700 stays near leave-device-clean.ts's 2.5 s budget, and
 * the record's DELETE goes out before any of it.
 */
const LEAVE_STEP_MS = 700;
const LEAVE_READ_MS = 600;

const HIDDEN: DevicePushStatus = { kind: "hidden" };
const UNKNOWN: CurrentDevice = { k: "unknown" };
const TRY_AGAIN: TurnOnResult = { ok: false, status: { kind: "off" }, message: "Try again in a moment." };
const FAILURE = "Couldn't update notifications on this device.";

/** Turn on, turn off, resync and leave, one at a time. Never rejects. */
let chain: Promise<void> = Promise.resolve();
/** The one GET per page load, shared by the card and resync; dropped after any write. */
let serverAnswer: Promise<ServerDevices> | null = null;
/** The last good GET, so turn-on can check it without an await before the prompt. */
let knownServer: ServerOk | null = null;
/** Bumped when a turn-on, turn-off or leave starts; a resync that sees it move stops. */
let generation = 0;
let resyncedThisLoad = false;

type Settled<T> = { ok: true; value: T } | { ok: false };

/** `work()` with a deadline. Never rejects: a throw, a rejection and a timeout are all `{ok:false}`. */
function settle<T>(work: () => Promise<T> | T, ms: number): Promise<Settled<T>> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: Settled<T>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false }), ms);
    try {
      Promise.resolve(work()).then(
        (value) => finish({ ok: true, value }),
        () => finish({ ok: false }),
      );
    } catch {
      finish({ ok: false });
    }
  });
}

/** Runs `job` after everything already queued; its failure is `fallback`. */
function exclusive<T>(job: () => Promise<T>, fallback: T): Promise<T> {
  const result = chain.then(job).catch(() => fallback);
  chain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function inBrowser(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

// ── Storage (vibe_push_device_v1, vibe_push_sync_fail_v1) ────────────────────

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the next open rebuilds or evicts from the server's list.
  }
}

function readRecord(): DeviceRecord | null {
  return parseDeviceRecord(readRaw(PUSH_DEVICE_KEY));
}

function writeRecord(user: string, transport: DeviceTransport, address: string, at: number): void {
  const record: DeviceRecord = { v: 1, user, transport, address, at };
  writeRaw(PUSH_DEVICE_KEY, JSON.stringify(record));
}

function readFailedAt(): number | null {
  const raw = readRaw(PUSH_SYNC_FAIL_KEY);
  const at = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(at) ? at : null;
}

// ── Our API ──────────────────────────────────────────────────────────────────

/**
 * vibeRequest, always quiet, with a deadline (an abort reads as status 0). A
 * keepalive request is never aborted: it is the sign-out DELETE, which must
 * outlive the page; the caller stops waiting for it instead.
 */
async function request<T>(
  method: "GET" | "POST" | "DELETE",
  json: unknown,
  opts: { ms?: number; keepalive?: boolean; failure?: string } = {},
): Promise<VibeResult<T>> {
  const controller =
    !opts.keepalive && typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), opts.ms ?? REQUEST_MS) : null;
  try {
    return await vibeRequest<T>(ENDPOINT, {
      method,
      json,
      cache: "no-store",
      keepalive: opts.keepalive,
      signal: controller?.signal,
      failure: opts.failure ?? FAILURE,
      quiet: true,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** DELETE by address; the route removes it whoever owns it (W5). */
async function removeAddress(address: string, opts: { ms?: number; keepalive?: boolean } = {}): Promise<boolean> {
  const done = await settle(() => request("DELETE", { address }, opts), opts.ms ?? REQUEST_MS);
  return done.ok && done.value.ok;
}

async function fetchServer(): Promise<ServerDevices> {
  const r = await request<unknown>("GET", undefined);
  if (r.ok) return parseServerAnswer(r.data) ?? { k: "error", status: r.status };
  return r.status === 401 ? { k: "signed-out" } : { k: "error", status: r.status };
}

/** The shared GET. A failed one isn't kept, so a later read can try again. */
function serverState(): Promise<ServerDevices> {
  if (!serverAnswer) {
    const pending = fetchServer().catch((): ServerDevices => ({ k: "error", status: 0 }));
    serverAnswer = pending;
    void pending.then((answer) => {
      knownServer = answer.k === "ok" ? answer : null;
      if (answer.k !== "ok" && serverAnswer === pending) serverAnswer = null;
    });
  }
  return serverAnswer;
}

/** After any write the device list may have changed. */
function forgetServer(): void {
  serverAnswer = null;
}

// ── The browser ──────────────────────────────────────────────────────────────

function browserPlatform(): Platform {
  try {
    return detectPlatform({ ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints });
  } catch {
    return "other";
  }
}

function mediaMatches(query: string): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function standalone(): boolean {
  return isStandalone({
    navigatorStandalone: (navigator as Navigator & { standalone?: unknown }).standalone,
    matchStandalone: mediaMatches("(display-mode: standalone)"),
    matchFullscreen: mediaMatches("(display-mode: fullscreen)"),
  });
}

/** iOS 18.4+ (and Safari 18.5+ on the Mac) put a push manager on window itself, no worker needed. */
function windowPushManager(): PushManager | null {
  try {
    const pm = (window as Window & { pushManager?: PushManager }).pushManager;
    return pm && typeof pm.getSubscription === "function" ? pm : null;
  } catch {
    return null;
  }
}

function workerContainer(): ServiceWorkerContainer | null {
  try {
    return "serviceWorker" in navigator ? navigator.serviceWorker : null;
  } catch {
    return null;
  }
}

function webPushSupported(): boolean {
  try {
    if (typeof Notification === "undefined") return false;
    if (windowPushManager()) return true;
    return workerContainer() !== null && "PushManager" in window;
  } catch {
    return false;
  }
}

function webPermission(): NotificationPermission | null {
  try {
    return typeof Notification === "undefined" ? null : Notification.permission;
  } catch {
    return null;
  }
}

/**
 * Starts the browser's prompt NOW, inside the tap (iOS refuses it after an
 * await). Old Safari takes a callback and returns nothing; newer browsers
 * return a promise (and some call the callback too), so whichever answers
 * first counts. "unsupported" when there is no Notification API at all.
 */
function requestWebPermission(): Promise<NotificationPermission | "unsupported" | null> {
  if (typeof Notification === "undefined" || typeof Notification.requestPermission !== "function") {
    return Promise.resolve("unsupported");
  }
  return new Promise((resolve) => {
    let done = false;
    const answer = (value: unknown) => {
      if (done) return;
      done = true;
      resolve(value === "granted" || value === "denied" || value === "default" ? value : null);
    };
    try {
      const maybe: unknown = Notification.requestPermission(answer);
      if (maybe && typeof (maybe as Promise<unknown>).then === "function") {
        (maybe as Promise<unknown>).then(answer, () => answer(null));
      }
    } catch {
      answer(null);
    }
  });
}

type WebRead = {
  current: CurrentDevice;
  subs: PushSubscription[];
  registration: ServiceWorkerRegistration | null;
};

async function currentFor(address: string): Promise<CurrentDevice> {
  const hash = await addressHash(address);
  return hash ? { k: "some", address, hash } : UNKNOWN;
}

/**
 * Every subscription this browser holds for us: window.pushManager first, then
 * the worker's. "none" only when there is a registration and every manager
 * answered null; a missing registration, a rejection or a timeout is
 * "unknown" (critic-w3.md item 1), which never evicts or forgets anything.
 */
async function readWeb(ms = MANAGER_MS): Promise<WebRead> {
  const managers: PushManager[] = [];
  const own = windowPushManager();
  if (own) managers.push(own);
  let complete = false;
  let registration: ServiceWorkerRegistration | null = null;
  const container = workerContainer();
  if (container) {
    const found = await settle(() => container.getRegistration("/"), ms);
    const reg = found.ok ? found.value : undefined;
    if (reg) {
      complete = true;
      registration = reg;
      if (reg.pushManager && reg.pushManager !== own) managers.push(reg.pushManager);
    }
  }
  complete = complete && managers.length > 0;
  const answers = await Promise.all(managers.map((pm) => settle(() => pm.getSubscription(), ms)));
  const subs: PushSubscription[] = [];
  for (const answer of answers) {
    if (!answer.ok) complete = false;
    else if (answer.value && !subs.some((s) => s.endpoint === answer.value?.endpoint)) {
      subs.push(answer.value);
    }
  }
  if (subs.length > 0) {
    const current = subs[0].endpoint ? await currentFor(subs[0].endpoint) : UNKNOWN;
    return { current, subs, registration };
  }
  return { current: complete ? { k: "none" } : UNKNOWN, subs, registration };
}

/** True when every one is gone (false from unsubscribe() means it already was). */
async function unsubscribeAll(subs: PushSubscription[], ms = MANAGER_MS): Promise<boolean> {
  const results = await Promise.all(subs.map((sub) => settle(() => sub.unsubscribe(), ms)));
  return results.every((r) => r.ok);
}

/**
 * The push manager to subscribe with (critic-w3.md item 7): window.pushManager
 * needs no worker; otherwise a registration only once its worker is active
 * (subscribe() rejects before that), else `ready` raced against 4 s. It never
 * resolves where no worker registers, hence the race. null = no worker API.
 */
async function subscribingManager(): Promise<PushManager | "timeout" | null> {
  const own = windowPushManager();
  if (own) return own;
  const container = workerContainer();
  if (!container) return null;
  const found = await settle(() => container.getRegistration("/"), REGISTRATION_MS);
  if (found.ok && found.value?.active && found.value.pushManager) return found.value.pushManager;
  const ready = await settle(() => container.ready, REGISTRATION_MS);
  if (ready.ok && ready.value.active && ready.value.pushManager) return ready.value.pushManager;
  return "timeout";
}

function subscribeWith(manager: PushManager, key: Uint8Array<ArrayBuffer>): Promise<Settled<PushSubscription>> {
  return settle(() => manager.subscribe({ userVisibleOnly: true, applicationServerKey: key }), SUBSCRIBE_MS);
}

type WebBody = {
  transport: "webpush";
  address: string;
  keys: { p256dh: string; auth: string };
  platform: ReturnType<typeof pushPlatformFor>;
};
type AppBody = { transport: "fcm"; address: string; platform: AppShell; app_version?: string };

function webBody(sub: PushSubscription, platform: Platform): WebBody | null {
  try {
    const json = sub.toJSON();
    const address = json.endpoint ?? sub.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!address || !p256dh || !auth) return null;
    return { transport: "webpush", address, keys: { p256dh, auth }, platform: pushPlatformFor(platform) };
  } catch {
    return null;
  }
}

async function appBody(token: string, shell: AppShell): Promise<AppBody> {
  const version = await settle(() => nativeAppVersion(), NATIVE_MS);
  const appVersion = version.ok ? version.value : null;
  return { transport: "fcm", address: token, platform: shell, ...(appVersion ? { app_version: appVersion } : {}) };
}

/** The app's token, read only when a record says this device opted in (W6). */
async function readNative(): Promise<CurrentDevice> {
  const token = await settle(() => nativeGetToken(), TOKEN_MS);
  if (!token.ok || !token.value.ok) return UNKNOWN;
  return currentFor(token.value.token);
}

/**
 * Take the last student's words off the screen (critic-w3.md item 4, W9): the
 * worker closes every shown notification and clears the badge on SIGNED_OUT;
 * the app clears its delivered notifications itself.
 */
async function clearShown(native: boolean, ms = NATIVE_MS): Promise<void> {
  if (native) {
    await settle(() => nativeClearDelivered(), ms);
    return;
  }
  const container = workerContainer();
  if (!container) return;
  postSignedOut(null); // the page's own worker, at once
  const found = await settle(() => container.getRegistration("/"), ms);
  postSignedOut(found.ok ? (found.value?.active ?? null) : null);
}

/**
 * SIGNED_OUT, synchronously, to the worker controlling this page and to
 * `also` when it's a different one (a hard-reloaded page has no controller,
 * but its registration still has an active worker).
 */
function postSignedOut(also: ServiceWorker | null): void {
  try {
    const controller = workerContainer()?.controller ?? null;
    controller?.postMessage({ type: "SIGNED_OUT" });
    if (also && also !== controller) also.postMessage({ type: "SIGNED_OUT" });
  } catch {
    // No worker to tell: nothing it showed can still be on screen.
  }
}

/**
 * The shown-notification step of leaving, synchronously (MAJOR 1 of the 3′a
 * repair round): leave-device-clean.ts calls it when its budget runs out while
 * the queued clean-up is still waiting, because the caller navigates next.
 * Web: SIGNED_OUT to the controlling worker. App: the delivered list. Both:
 * the page badge.
 */
export function clearShownNow(): void {
  if (!inBrowser()) return;
  try {
    if (appShellOnClient() !== null) void nativeClearDelivered().catch(() => {});
    else postSignedOut(null);
  } catch {
    // Nothing it could clear.
  }
  clearPageBadge();
}

function clearPageBadge(): void {
  try {
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    nav.clearAppBadge?.().catch(() => {});
  } catch {
    // Not an installed app, or not permitted.
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * What the Settings card shows. Hidden until the server says yes (W2). It
 * lets queued work finish first (up to 5 s), so the card doesn't show "off"
 * a moment before this load's resync rebuilds the record.
 */
export function readDevicePush(): Promise<DevicePushStatus> {
  if (!inBrowser()) return Promise.resolve(HIDDEN);
  return settle(() => chain, 5000)
    .then(readStatus)
    .catch(() => HIDDEN);
}

async function readStatus(): Promise<DevicePushStatus> {
  const shell = appShellOnClient();
  const server = await serverState();
  const gate = readGate({
    server,
    app: shell !== null,
    pluginPresent: shell !== null && nativePushPluginPresent(),
    iosBrowserTab: shell === null && isIosPlatform(browserPlatform()) && !standalone(),
    webPushSupported: shell === null && webPushSupported(),
  });
  if (gate) return gate;
  if (server.k !== "ok") return HIDDEN;
  const record = readRecord();
  const user = server.user;

  if (shell !== null) {
    const asked = await settle(() => nativeCheckPermission(), NATIVE_MS);
    const permission = asked.ok ? asked.value : null;
    // getToken only for a device that opted in: it switches Firebase on for good (W6).
    if (permission !== "granted" || record?.transport !== "fcm" || record.user !== user) {
      return readFinal({ permission, current: UNKNOWN, record, user });
    }
    const token = await settle(() => nativeGetToken(), TOKEN_MS);
    if (token.ok && !token.value.ok && token.value.unavailable) {
      return { kind: "unsupported", why: "app-build" };
    }
    const current = token.ok && token.value.ok ? await currentFor(token.value.token) : UNKNOWN;
    return readFinal({ permission, current, record, user });
  }

  const permission = webPermission();
  if (permission !== "granted") return readFinal({ permission, current: UNKNOWN, record, user });
  const { current } = await readWeb();
  return readFinal({ permission, current, record, user });
}

// ── Turn on ──────────────────────────────────────────────────────────────────

const HIDDEN_RESULT: TurnOnResult = { ok: false, status: HIDDEN };

/**
 * NOT an async function: the permission prompt starts before the first await
 * (iOS only shows it inside the tap). Only after the answer does the rest join
 * the chain. Never prompts before a GET has said push is available here (W2).
 */
export function turnOnDevicePush(): Promise<TurnOnResult> {
  try {
    if (!inBrowser()) return Promise.resolve(HIDDEN_RESULT);
    generation += 1;
    const server = knownServer;
    if (!server || !server.available) return Promise.resolve(HIDDEN_RESULT);
    const shell = appShellOnClient();

    if (shell !== null) {
      if (!server.fcm) return Promise.resolve(HIDDEN_RESULT);
      if (!nativePushPluginPresent()) {
        return Promise.resolve({ ok: false, status: { kind: "unsupported", why: "app-update" } });
      }
      const answer = nativeRequestPermission(); // starts inside the tap
      return answer
        .catch(() => null)
        .then((permission) => exclusive(() => finishAppTurnOn(permission, shell, server), TRY_AGAIN));
    }

    if (!server.webpushKey) return Promise.resolve(HIDDEN_RESULT);
    const platform = browserPlatform();
    if (isIosPlatform(platform) && !standalone()) {
      return Promise.resolve({ ok: false, status: { kind: "needs-install" } });
    }
    if (!webPushSupported()) {
      return Promise.resolve({ ok: false, status: { kind: "unsupported", why: "browser" } });
    }
    // Browsers ignore a re-ask once denied (W14); the card shows how to undo it.
    if (webPermission() === "denied") return Promise.resolve({ ok: false, status: { kind: "denied" } });
    const answer = requestWebPermission(); // starts inside the tap
    return answer.then((permission) =>
      exclusive(() => finishWebTurnOn(permission, platform, server), TRY_AGAIN),
    );
  } catch {
    return Promise.resolve(TRY_AGAIN);
  }
}

/** The answer to a prompt that isn't "granted". "default"/"prompt" means not now. */
function unGranted(permission: string | null): TurnOnResult {
  if (permission === "denied") return { ok: false, status: { kind: "denied" } };
  return { ok: false, status: { kind: "off" } };
}

async function finishWebTurnOn(
  permission: NotificationPermission | "unsupported" | null,
  platform: Platform,
  server: ServerOk,
): Promise<TurnOnResult> {
  if (permission === "unsupported") return { ok: false, status: { kind: "unsupported", why: "browser" } };
  if (permission !== "granted") return unGranted(permission);
  const key = server.webpushKey ? base64UrlToBytes(server.webpushKey) : null;
  if (!key) return HIDDEN_RESULT;
  const manager = await subscribingManager();
  if (manager === null) return { ok: false, status: { kind: "unsupported", why: "browser" } };
  if (manager === "timeout") return TRY_AGAIN;

  const existing = await settle(() => manager.getSubscription(), MANAGER_MS);
  if (!existing.ok) return TRY_AGAIN;
  let sub = existing.value;
  // Made with another key (a rotated VAPID pair): the push service would refuse our sends.
  if (sub && !keysMatch(sub.options?.applicationServerKey, key)) {
    const old = sub;
    if (!(await settle(() => old.unsubscribe(), MANAGER_MS)).ok) return TRY_AGAIN;
    sub = null;
  }
  let created: PushSubscription | null = null;
  if (!sub) {
    const made = await subscribeWith(manager, key);
    if (!made.ok) return webPermission() === "denied" ? unGranted("denied") : TRY_AGAIN;
    sub = made.value;
    created = sub;
  }
  const body = webBody(sub, platform);
  if (!body) {
    if (created) await unsubscribeAll([created]);
    return TRY_AGAIN;
  }
  return registerDevice(body, server, created);
}

async function finishAppTurnOn(
  permission: NativePermission | null,
  shell: AppShell,
  server: ServerOk,
): Promise<TurnOnResult> {
  if (permission === null) return TRY_AGAIN;
  if (permission !== "granted") return unGranted(permission);
  // iOS: the APNs token can trail the grant; push-native retries once after 1.5 s.
  const token = await settle(() => nativeGetToken(), TOKEN_MS);
  if (!token.ok) return TRY_AGAIN;
  if (!token.value.ok) {
    return token.value.unavailable
      ? { ok: false, status: { kind: "unsupported", why: "app-build" } }
      : TRY_AGAIN;
  }
  // A refused POST keeps the token (critic-w3.md item 10); nothing to undo.
  return registerDevice(await appBody(token.value.token, shell), server, null);
}

/**
 * POST this device, then remember who turned it on (W5). A refusal undoes only
 * a subscription THIS call made and writes no record (critic-w3.md item 10);
 * push_unavailable (403) or a missing table (503) hides the card, a 429 shows
 * the route's own line, anything else the usual failure copy.
 */
async function registerDevice(
  body: WebBody | AppBody,
  server: ServerOk,
  created: PushSubscription | null,
): Promise<TurnOnResult> {
  const gen = generation;
  const previous = readRecord();
  const r = await request("POST", body, { failure: "Couldn't turn on notifications." });
  forgetServer();
  if (r.ok && gen !== generation) {
    // A sign-out (or another turn-on/off) began while this POST was out: it
    // has the last word, so this device must not stay registered behind it.
    if (created) await unsubscribeAll([created]);
    void removeAddress(body.address, { keepalive: true });
    return TRY_AGAIN;
  }
  if (r.ok) {
    writeRecord(server.user, body.transport, body.address, Date.now());
    writeRaw(PUSH_SYNC_FAIL_KEY, null);
    // Turned on over the last student's record (its evict didn't run this
    // load): the row is ours now, but their words may still be on screen.
    if (previous && previous.user !== server.user) await clearShown(body.transport === "fcm");
    // A rotated address, or the last student's: its row must not live on.
    if (previous && previous.address !== body.address) await removeAddress(previous.address);
    return { ok: true };
  }
  if (created) await unsubscribeAll([created]);
  if (turnOnRefusal(r.status, r.code) === "hidden") return HIDDEN_RESULT;
  const message = r.status === 429 && r.error ? r.error : r.message;
  return { ok: false, status: { kind: "off" }, message };
}

// ── Turn off ─────────────────────────────────────────────────────────────────

/** DELETE this device, unsubscribe / delete the token, drop the record. True if it's now off. */
export function turnOffDevicePush(): Promise<boolean> {
  if (!inBrowser()) return Promise.resolve(false);
  generation += 1;
  return exclusive(finishTurnOff, false);
}

/** The remembered address and every live endpoint, each once. */
function addressesOf(record: DeviceRecord | null, subs: PushSubscription[]): string[] {
  const out = record ? [record.address] : [];
  for (const sub of subs) if (sub.endpoint && !out.includes(sub.endpoint)) out.push(sub.endpoint);
  return out;
}

async function finishTurnOff(): Promise<boolean> {
  const native = appShellOnClient() !== null;
  const record = readRecord();
  let serverOff = false;
  let localOff: boolean;
  if (native) {
    if (!record) return true; // never opted in here, so nothing can arrive
    serverOff = await removeAddress(record.address);
    // Kept even though Firebase stays switched on (critic-w3.md item 11).
    const deleted = record.transport === "fcm" ? await settle(() => nativeDeleteToken(), NATIVE_MS) : null;
    localOff = deleted === null || (deleted.ok && deleted.value);
  } else {
    const { current, subs } = await readWeb();
    const addresses = addressesOf(record, subs);
    if (addresses.length === 0 && current.k === "none") return true;
    const removed = await Promise.all(addresses.map((address) => removeAddress(address)));
    serverOff = removed.length > 0 && removed.every(Boolean);
    // No subscription left counts only when every manager said so.
    localOff = subs.length > 0 ? await unsubscribeAll(subs) : current.k === "none";
  }
  forgetServer();
  // Either half is enough: no row means nothing is sent; no subscription means
  // a send fails and the sender drops the row. The next open tidies the other.
  if (!serverOff && !localOff) return false;
  writeRaw(PUSH_DEVICE_KEY, null);
  return true;
}

// ── Resync (W5 + W6) ─────────────────────────────────────────────────────────

/**
 * Safe on every load and from anywhere: never prompts, rarely writes. At most
 * once per page load ("token", from the app's tokenReceived, skips that gate
 * but not the 10-minute pause after a 429 or 5xx).
 */
export function resyncDevicePush(opts?: { reason?: "load" | "token" }): Promise<void> {
  try {
    if (!inBrowser()) return Promise.resolve();
    if (opts?.reason !== "token") {
      if (resyncedThisLoad) return Promise.resolve();
      resyncedThisLoad = true;
    }
    if (backoffActive(readFailedAt(), Date.now())) return Promise.resolve();
    return exclusive(runResync, undefined);
  } catch {
    return Promise.resolve();
  }
}

function markSyncFailed(status: number): void {
  if (failureStartsBackoff(status)) writeRaw(PUSH_SYNC_FAIL_KEY, String(Date.now()));
}

async function runResync(): Promise<void> {
  const gen = generation;
  const shell = appShellOnClient();
  const native = shell !== null;
  const recordRaw = readRaw(PUSH_DEVICE_KEY);
  const record = parseDeviceRecord(recordRaw);
  let current: CurrentDevice = UNKNOWN;
  let subs: PushSubscription[] = [];
  if (!native) ({ current, subs } = await readWeb());
  else if (record?.transport === "fcm" && nativePushPluginPresent()) current = await readNative();

  if (!resyncNeedsServer({ record, current, native })) return;
  const server = await serverState();
  if (server.k === "error") markSyncFailed(server.status);
  const action = resyncAction({ record, current, server, now: Date.now(), native });
  // current may be "unknown" only for an evict (row 5 before row 2).
  if (action === "none" || server.k !== "ok") return;
  // A turn-on, turn-off or leave that began meanwhile wins (critic-w3.md item 1).
  if (gen !== generation || readRaw(PUSH_DEVICE_KEY) !== recordRaw) return;

  switch (action) {
    case "rebuild":
      // Safari wiped storage but the row is ours. `at` 0: the next open refreshes it.
      if (current.k === "some") writeRecord(server.user, native ? "fcm" : "webpush", current.address, 0);
      return;
    case "forget":
      if (record) await removeAddress(record.address);
      writeRaw(PUSH_DEVICE_KEY, null);
      forgetServer();
      return;
    case "evict":
      await evict(record, current, subs, native);
      return;
    case "post":
    case "resubscribe":
      if (current.k === "some") {
        await refresh(action, record, current.address, subs, shell, server, gen);
      }
      return;
  }
}

/**
 * Another account's device, or a subscription nobody here turned on (W5): gone
 * from the server whoever owns it, gone locally, its notifications off the
 * screen, the record dropped.
 */
async function evict(
  record: DeviceRecord | null,
  current: CurrentDevice,
  subs: PushSubscription[],
  native: boolean,
): Promise<void> {
  // The table's addresses (record + live), plus any second web subscription.
  const addresses = addressesOf(record, subs);
  for (const address of evictAddresses(record, current)) {
    if (!addresses.includes(address)) addresses.push(address);
  }
  await Promise.all(addresses.map((address) => removeAddress(address)));
  if (native) await settle(() => nativeDeleteToken(), NATIVE_MS);
  else await unsubscribeAll(subs);
  await clearShown(native);
  clearPageBadge();
  writeRaw(PUSH_DEVICE_KEY, null);
  forgetServer();
}

/**
 * Rows 10–12: POST the live address again. Resubscribe (row 11, web) first
 * swaps a subscription the sender just found dead for a new one; permission is
 * already granted, so there is no prompt. A refusal changes nothing locally
 * (critic-w3.md item 1): the subscription and the record stay.
 */
async function refresh(
  action: "post" | "resubscribe",
  record: DeviceRecord | null,
  address: string,
  subs: PushSubscription[],
  shell: AppShell | null,
  server: ServerOk,
  gen: number,
): Promise<void> {
  let body: WebBody | AppBody | null;
  if (shell !== null) body = await appBody(address, shell);
  else if (action === "resubscribe") body = await resubscribe(subs, server);
  else {
    const sub = subs.find((s) => s.endpoint === address);
    body = sub ? webBody(sub, browserPlatform()) : null;
  }
  if (!body) return;
  const r = await request("POST", body);
  forgetServer();
  if (!r.ok) {
    markSyncFailed(r.status);
    return;
  }
  writeRaw(PUSH_SYNC_FAIL_KEY, null);
  if (gen !== generation) return; // a turn-off or leave began; it has the last word
  writeRecord(server.user, body.transport, body.address, Date.now());
  // Row 10: a restored backup or a rotated token must not leave the old row alive.
  if (record && record.address !== body.address) await removeAddress(record.address);
}

async function resubscribe(subs: PushSubscription[], server: ServerOk): Promise<WebBody | null> {
  if (webPermission() !== "granted") return null; // never a prompt from here
  const key = server.webpushKey ? base64UrlToBytes(server.webpushKey) : null;
  if (!key) return null;
  const manager = await subscribingManager();
  if (manager === null || manager === "timeout") return null;
  await unsubscribeAll(subs);
  const made = await subscribeWith(manager, key);
  return made.ok ? webBody(made.value, browserPlatform()) : null;
}

// ── Sign-out ─────────────────────────────────────────────────────────────────

/** `{ push_address }` for POST /api/auth/logout, from the record only. Synchronous. */
export function pushLogoutBody(): { push_address?: string } {
  const record = inBrowser() ? readRecord() : null;
  return record ? { push_address: record.address } : {};
}

/**
 * leave-device-clean.ts's device half (§8.2 steps 1–4; critic-w3.md items 4
 * and 21), on the same chain: the server DELETE (only when `serverDelete`,
 * while the session still exists), unsubscribe / deleteToken, the shown
 * notifications, the badge, then the record. The address comes from the
 * record, or else (web) the live subscription; the app never calls getToken
 * here, which would mint a token.
 */
export function leaveDevicePush(opts: { serverDelete: boolean }): Promise<void> {
  if (!inBrowser()) return Promise.resolve();
  generation += 1;
  knownServer = null; // no prompt from this page until a new GET says yes
  const serverDelete = opts.serverDelete === true;
  // Read now: if this waits behind other work past leave-device-clean's
  // budget, storage is already cleared when it runs.
  const atCall = readRecord();
  // Out now, not behind the queue: the caller navigates once its budget is
  // spent, and a keepalive request outlives the page. Idempotent.
  const early =
    serverDelete && atCall ? removeAddress(atCall.address, { ms: LEAVE_STEP_MS, keepalive: true }) : null;
  return exclusive(() => runLeave(serverDelete, atCall, early), undefined);
}

async function runLeave(
  serverDelete: boolean,
  atCall: DeviceRecord | null,
  early: Promise<boolean> | null,
): Promise<void> {
  const native = appShellOnClient() !== null;
  const record = readRecord() ?? atCall;
  const deletes: Promise<boolean>[] = early ? [early] : [];
  const sent = new Set<string>(early && atCall ? [atCall.address] : []);
  const remove = (addresses: string[]) => {
    for (const address of addresses) {
      if (!serverDelete || sent.has(address)) continue;
      sent.add(address);
      deletes.push(removeAddress(address, { ms: LEAVE_STEP_MS, keepalive: true }));
    }
  };
  remove(addressesOf(record, []));
  const web = native ? null : await readWeb(LEAVE_READ_MS);
  remove(addressesOf(null, web?.subs ?? []));
  await Promise.all(deletes);

  if (native) {
    if (record?.transport === "fcm") await settle(() => nativeDeleteToken(), LEAVE_STEP_MS);
    await settle(() => nativeClearDelivered(), LEAVE_STEP_MS);
  } else {
    if (web) await unsubscribeAll(web.subs, LEAVE_STEP_MS);
    // Synchronously, to the registration readWeb already found: no third wait.
    postSignedOut(web?.registration?.active ?? null);
  }
  clearPageBadge();
  writeRaw(PUSH_DEVICE_KEY, null);
  writeRaw(PUSH_SYNC_FAIL_KEY, null);
  forgetServer();
}
