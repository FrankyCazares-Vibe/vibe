import {
  describeFailure,
  type FailureSignal,
  type ToastAction,
} from "@/lib/feedback/failure-copy";
import { toast } from "@/lib/feedback/toast";

/**
 * Client-side request helpers that can't fail silently (silent-failure
 * design §3a, §3d). Every caller names its own one-line failure ("Couldn't
 * post your comment."); a refused request becomes that line, or the mapped
 * line from failure-copy.ts, in a toast, with Sign in / Review Terms where it
 * applies.
 *
 * `vibeRequest` never throws: callers branch on `r.ok`. A thrown fetch is
 * status 0, and an HTML error page or an empty body parses to null instead of
 * throwing the way `res.json()` does.
 *
 * Static pages use the twins in public/html/_persistence.js
 * (window.vibeRequest, window.vibeCopy).
 */
export type VibeRequestInit = Omit<RequestInit, "body"> & {
  /** Stringified into the body; sets content-type: application/json. */
  json?: unknown;
  /** Raw body, e.g. FormData uploads. Ignored when `json` is given. */
  body?: BodyInit | null;
  /** Required one-line verb message, e.g. "Couldn't post your comment." */
  failure: string;
  /** Info toast on success, only where the UI otherwise shows nothing. */
  success?: string;
  /** No failure toast; the caller renders `message` inline instead. */
  quiet?: boolean;
};

export type VibeFailure = {
  ok: false;
  status: number;
  code: string | null;
  error: string | null;
  message: string;
  action?: ToastAction;
};

export type VibeResult<T> = { ok: true; status: number; data: T } | VibeFailure;

const NETWORK_FAILURE: FailureSignal = {
  status: 0,
  code: null,
  error: null,
  retryAfterSec: null,
};

/** The page the student is on, for the `next` of Sign in / Review Terms. */
function here(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

/** Retry-After is delta-seconds (what rate-limit.ts sends) or an HTTP date. */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/** The body as JSON, or null for an empty body, an HTML error page, or a failed read. */
async function readJson(res: Response): Promise<unknown> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function asObject(body: unknown): Record<string, unknown> | null {
  return body !== null && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function signalFrom(res: Response, obj: Record<string, unknown> | null): FailureSignal {
  return {
    status: res.status,
    code: typeof obj?.code === "string" ? obj.code : null,
    error: typeof obj?.error === "string" ? obj.error : null,
    retryAfterSec: parseRetryAfter(res.headers.get("retry-after")),
  };
}

/** Maps the signal to the student's line and, unless quiet, shows it. */
function fail(signal: FailureSignal, failure: string, quiet: boolean): VibeFailure {
  const { message, action } = describeFailure(signal, failure, here());
  if (!quiet) toast({ message, tone: "error", action });
  return {
    ok: false,
    status: signal.status,
    code: signal.code,
    error: signal.error,
    message,
    action,
  };
}

/**
 * `fetch` that always resolves. Failed when the status isn't 2xx or the body
 * says `ok: false`; then the error toast (with its action) shows unless
 * `quiet`. `success` shows as an info toast whenever the request succeeds.
 * Credentials default to same-origin.
 */
export async function vibeRequest<T = Record<string, unknown>>(
  url: string,
  init: VibeRequestInit,
): Promise<VibeResult<T>> {
  const { json, body, failure, success, quiet = false, headers, ...rest } = init;
  let res: Response;
  try {
    const h = new Headers(headers);
    let payload: BodyInit | null | undefined = body;
    if (json !== undefined) {
      h.set("content-type", "application/json");
      payload = JSON.stringify(json);
    }
    // A body with no method would be a GET-with-body, which fetch rejects
    // before sending — and that would read to the student as "can't reach
    // Vibe". Anything carrying a body defaults to POST.
    const method = rest.method ?? (payload != null ? "POST" : undefined);
    res = await fetch(url, {
      credentials: "same-origin",
      ...rest,
      method,
      headers: h,
      body: payload,
    });
  } catch (err) {
    // An abort is the caller's own doing (unmount, a newer request), not
    // something to tell the student about.
    const aborted =
      rest.signal?.aborted === true ||
      (err as { name?: unknown } | null)?.name === "AbortError";
    return fail(NETWORK_FAILURE, failure, quiet || aborted);
  }

  const parsed = await readJson(res);
  const obj = asObject(parsed);
  if (!res.ok || obj?.ok === false) return fail(signalFrom(res, obj), failure, quiet);

  if (success) toast({ message: success, tone: "info" });
  // An empty 2xx body reads as {} so `r.data.x` is undefined rather than a crash.
  return { ok: true, status: res.status, data: (parsed ?? {}) as T };
}

/** Pre-Clipboard-API fallback: an off-screen textarea and execCommand("copy"). */
function copyWithTextarea(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const active = document.activeElement as HTMLElement | null;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  // 12pt keeps iOS from zooming in on focus; fixed + transparent keeps it unseen.
  ta.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:12pt;border:0;padding:0;";
  document.body.appendChild(ta);
  let copied = false;
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  ta.remove();
  active?.focus?.();
  return copied;
}

/**
 * Copies `text` and says so: "Link copied" (or `opts.success`) on success,
 * `opts.failure` ?? "Couldn't copy the link." when both the Clipboard API and
 * the textarea fallback fail. Call it straight from the click handler.
 */
export async function copyText(
  text: string,
  opts?: { success?: string; failure?: string },
): Promise<boolean> {
  let copied = false;
  try {
    // The first await in the call, so the click's user activation still counts.
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch {
    copied = false;
  }
  if (!copied) copied = copyWithTextarea(text);

  if (copied) toast({ message: opts?.success ?? "Link copied", tone: "info" });
  else toast({ message: opts?.failure ?? "Couldn't copy the link.", tone: "error" });
  return copied;
}

/**
 * Downloads `url` as `filename`, replacing a synthetic `<a download>`, which
 * saves whatever comes back. A refusal is JSON (a signed-out 401, say), and
 * that must never be saved as the file, so this requires a 2xx that isn't
 * JSON and toasts the mapped failure otherwise.
 */
export async function downloadFile(
  url: string,
  filename: string,
  opts: { failure: string; success?: string },
): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "include" });
  } catch {
    fail(NETWORK_FAILURE, opts.failure, false);
    return false;
  }

  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || /\bjson\b/i.test(type)) {
    fail(signalFrom(res, asObject(await readJson(res))), opts.failure, false);
    return false;
  }

  let blob: Blob;
  try {
    blob = await res.blob();
  } catch {
    fail(NETWORK_FAILURE, opts.failure, false);
    return false;
  }

  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 0);

  if (opts.success) toast({ message: opts.success, tone: "info" });
  return true;
}
