/**
 * Tests for `avatar-upload.ts`: the local preflight, the refusal → §3.5 copy
 * mapping, and `uploadAvatar`'s two requests against a fake `fetch`.
 *
 * Uses node:test (built-in, no deps). Run with:
 *   node --test --experimental-strip-types src/lib/profile/avatar-upload.test.ts
 *
 * WHY THE RESOLVE HOOK: same as `onboarding-prefill.test.ts` ("@/x" →
 * "src/x.ts", extensionless relative specifiers retried with ".ts"). The only
 * dependency is the pure `@/lib/feedback/failure-copy`. Nothing is sent
 * anywhere: every request goes to the in-memory fake.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("avatar-upload.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const {
  AVATAR_CLIENT_MAX_BYTES,
  PHOTO_ERROR_COPY,
  avatarFailureMessage,
  normalizeAvatarContentType,
  preflightAvatarBlob,
  uploadAvatar,
} = await import("./avatar-upload");

const PUBLIC_URL = "https://abc.supabase.co/storage/v1/object/public/profiles/u/avatar-1.jpg";

type Call = { url: string; init: RequestInit | undefined };

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A fake fetch that answers each call from `responses` in order and records it. */
function fakeFetch(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const impl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, impl };
}

const jpeg = (bytes = 2048) => new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });

// ── normalizeAvatarContentType / preflightAvatarBlob ─────────────────────

test("content type: normalized like the route, untyped treated as JPEG", () => {
  assert.equal(normalizeAvatarContentType("image/JPG"), "image/jpeg");
  assert.equal(normalizeAvatarContentType("image/png; charset=binary"), "image/png");
  assert.equal(normalizeAvatarContentType(""), "image/jpeg");
  assert.equal(normalizeAvatarContentType(undefined), "image/jpeg");
  assert.equal(normalizeAvatarContentType("image/heic"), "image/heic");
});

test("preflight: empty or unreadable blob → couldn't process", () => {
  for (const b of [null, undefined, {}, { size: 0, type: "image/jpeg" }, { size: Number.NaN }]) {
    const r = preflightAvatarBlob(b);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.message, PHOTO_ERROR_COPY.processFailed);
  }
});

test("preflight: only JPG / PNG / WebP (GIF and HEIC refused), type checked before size", () => {
  for (const type of ["image/gif", "image/heic", "application/pdf"]) {
    const r = preflightAvatarBlob({ size: AVATAR_CLIENT_MAX_BYTES * 3, type });
    assert.deepEqual(r, { ok: false, message: PHOTO_ERROR_COPY.wrongType });
  }
  for (const type of ["image/jpeg", "image/png", "image/webp", ""]) {
    const r = preflightAvatarBlob({ size: 100, type });
    assert.equal(r.ok, true);
  }
});

test("preflight: over the client cap → too big; at the cap is fine", () => {
  assert.deepEqual(preflightAvatarBlob({ size: AVATAR_CLIENT_MAX_BYTES + 1, type: "image/png" }), {
    ok: false,
    message: PHOTO_ERROR_COPY.tooBig,
  });
  assert.deepEqual(preflightAvatarBlob({ size: AVATAR_CLIENT_MAX_BYTES, type: "image/png" }), {
    ok: true,
    contentType: "image/png",
  });
});

// ── avatarFailureMessage ─────────────────────────────────────────────────

const sig = (status: number, error: string | null = null, code: string | null = null) => ({
  status,
  code,
  error,
  retryAfterSec: null,
});

test("mapping: the upload route's 400 strings and Vercel's 413 get photo copy", () => {
  assert.equal(avatarFailureMessage("upload", sig(400, "Invalid file size")).message, PHOTO_ERROR_COPY.tooBig);
  assert.equal(
    avatarFailureMessage("upload", sig(400, "Unsupported file type")).message,
    PHOTO_ERROR_COPY.wrongType,
  );
  assert.equal(avatarFailureMessage("upload", sig(413)).message, PHOTO_ERROR_COPY.tooBig);
  assert.equal(avatarFailureMessage("upload", sig(400, "Missing file")).message, PHOTO_ERROR_COPY.uploadFailed);
  assert.equal(avatarFailureMessage("upload", sig(500, "Storage bucket …")).message, PHOTO_ERROR_COPY.uploadFailed);
  assert.equal(avatarFailureMessage("upload", sig(0)).message, PHOTO_ERROR_COPY.uploadFailed);
});

test("mapping: a refused save is always 'didn't upload' (never the raw route string)", () => {
  assert.equal(avatarFailureMessage("save", sig(400, "Invalid avatar_url")).message, PHOTO_ERROR_COPY.uploadFailed);
  assert.equal(avatarFailureMessage("save", sig(400, "Invalid file size")).message, PHOTO_ERROR_COPY.uploadFailed);
  assert.equal(avatarFailureMessage("save", sig(500, "Could not save profile")).message, PHOTO_ERROR_COPY.uploadFailed);
});

test("mapping: signed out, Terms and rate limit keep the shared lines with their action", () => {
  const out = avatarFailureMessage("upload", sig(401, "Unauthorized"), "/onboarding");
  assert.equal(out.action?.label, "Sign in");
  assert.equal(out.action?.href, "/auth/login?next=%2Fonboarding");

  const terms = avatarFailureMessage("save", sig(403, "Accept the Terms to continue", "terms_required"));
  assert.equal(terms.action?.label, "Review Terms");

  const fast = avatarFailureMessage("upload", sig(429, "Too many requests. Try again shortly."));
  assert.match(fast.message, /going a little fast/);
  assert.equal(fast.action, undefined);

  // A 403 that isn't terms_required is not given a session line.
  assert.equal(avatarFailureMessage("upload", sig(403, "Forbidden")).message, PHOTO_ERROR_COPY.uploadFailed);
});

// ── uploadAvatar ─────────────────────────────────────────────────────────

test("uploadAvatar: upload then PATCH with the exact field names", async () => {
  const f = fakeFetch([
    json(200, { ok: true, url: PUBLIC_URL, kind: "avatar" }),
    json(200, { ok: true, profile: { id: "u", avatar_url: PUBLIC_URL } }),
  ]);
  const r = await uploadAvatar(jpeg(), { fetchImpl: f.impl });
  assert.deepEqual(r, { ok: true, url: PUBLIC_URL });
  assert.equal(f.calls.length, 2);

  const [up, save] = f.calls;
  assert.equal(up!.url, "/api/me/profile-upload");
  assert.equal(up!.init?.method, "POST");
  const form = up!.init?.body as FormData;
  assert.ok(form instanceof FormData);
  assert.equal(form.get("kind"), "avatar");
  const part = form.get("file") as File;
  assert.equal(part.type, "image/jpeg");
  assert.equal(part.name, "avatar.jpg");
  assert.equal(part.size, 2048);

  assert.equal(save!.url, "/api/me/profile");
  assert.equal(save!.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(save!.init?.body)), { avatar_url: PUBLIC_URL });
  assert.equal(new Headers(save!.init?.headers).get("content-type"), "application/json");
});

test("uploadAvatar: an untyped blob goes up labelled image/jpeg; PNG keeps its type + extension", async () => {
  const f1 = fakeFetch([json(200, { ok: true, url: PUBLIC_URL }), json(200, { ok: true, profile: null })]);
  const r1 = await uploadAvatar(new Blob([new Uint8Array(10)]), { fetchImpl: f1.impl });
  assert.equal(r1.ok, true);
  assert.equal(((f1.calls[0]!.init?.body as FormData).get("file") as File).type, "image/jpeg");

  const f2 = fakeFetch([json(200, { ok: true, url: PUBLIC_URL }), json(200, { ok: true, profile: null })]);
  await uploadAvatar(new Blob([new Uint8Array(10)], { type: "image/png" }), { fetchImpl: f2.impl });
  const part = (f2.calls[0]!.init?.body as FormData).get("file") as File;
  assert.equal(part.type, "image/png");
  assert.equal(part.name, "avatar.png");
});

test("uploadAvatar: a failed preflight sends nothing", async () => {
  const f = fakeFetch([]);
  const r = await uploadAvatar(new Blob([new Uint8Array(10)], { type: "image/gif" }), { fetchImpl: f.impl });
  assert.deepEqual(r, { ok: false, message: PHOTO_ERROR_COPY.wrongType, stage: "check", status: 0 });
  assert.equal(f.calls.length, 0);
});

test("uploadAvatar: upload refusals map and stop before the PATCH", async () => {
  const cases: Array<[Response, string]> = [
    [json(400, { ok: false, error: "Invalid file size" }), PHOTO_ERROR_COPY.tooBig],
    [json(400, { ok: false, error: "Unsupported file type" }), PHOTO_ERROR_COPY.wrongType],
    [new Response("Request Entity Too Large", { status: 413 }), PHOTO_ERROR_COPY.tooBig],
    [json(500, { ok: false, error: "boom" }), PHOTO_ERROR_COPY.uploadFailed],
    [json(200, { ok: false, error: "weird" }), PHOTO_ERROR_COPY.uploadFailed],
    [json(200, { ok: true }), PHOTO_ERROR_COPY.uploadFailed], // no url
    [new Response("<html>oops</html>", { status: 502 }), PHOTO_ERROR_COPY.uploadFailed],
  ];
  for (const [res, message] of cases) {
    const f = fakeFetch([res]);
    const r = await uploadAvatar(jpeg(), { fetchImpl: f.impl });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.message, message);
      assert.equal(r.stage, "upload");
    }
    assert.equal(f.calls.length, 1);
  }
});

test("uploadAvatar: a 429 on upload carries its status and the shared line", async () => {
  const f = fakeFetch([json(429, { ok: false, error: "Too many requests. Try again shortly." }, { "retry-after": "600" })]);
  const r = await uploadAvatar(jpeg(), { fetchImpl: f.impl });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 429);
    assert.equal(r.message, "You're going a little fast. Try again later.");
  }
});

test("uploadAvatar: network failure on either request → didn't upload", async () => {
  const f1 = fakeFetch([new TypeError("Failed to fetch")]);
  const r1 = await uploadAvatar(jpeg(), { fetchImpl: f1.impl });
  assert.deepEqual(r1, { ok: false, message: PHOTO_ERROR_COPY.uploadFailed, stage: "upload", status: 0 });

  const f2 = fakeFetch([json(200, { ok: true, url: PUBLIC_URL }), new TypeError("Failed to fetch")]);
  const r2 = await uploadAvatar(jpeg(), { fetchImpl: f2.impl });
  assert.deepEqual(r2, { ok: false, message: PHOTO_ERROR_COPY.uploadFailed, stage: "save", status: 0 });
});

test("uploadAvatar: an abort is flagged so the caller can stay quiet", async () => {
  const ac = new AbortController();
  ac.abort();
  const f = fakeFetch([Object.assign(new Error("aborted"), { name: "AbortError" })]);
  const r = await uploadAvatar(jpeg(), { fetchImpl: f.impl, signal: ac.signal });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.aborted, true);
  assert.equal(f.calls[0]!.init?.signal, ac.signal);
});

test("uploadAvatar: save refusals — Terms keeps its action, others are didn't upload", async () => {
  const f1 = fakeFetch([
    json(200, { ok: true, url: PUBLIC_URL }),
    json(403, { ok: false, error: "Accept the Terms to continue", code: "terms_required" }),
  ]);
  const r1 = await uploadAvatar(jpeg(), { fetchImpl: f1.impl });
  assert.equal(r1.ok, false);
  if (!r1.ok) {
    assert.equal(r1.stage, "save");
    assert.equal(r1.status, 403);
    assert.equal(r1.action?.label, "Review Terms");
  }

  const f2 = fakeFetch([json(200, { ok: true, url: PUBLIC_URL }), json(400, { ok: false, error: "Invalid avatar_url" })]);
  const r2 = await uploadAvatar(jpeg(), { fetchImpl: f2.impl });
  assert.deepEqual(r2, { ok: false, message: PHOTO_ERROR_COPY.uploadFailed, stage: "save", status: 400 });
});

test("uploadAvatar: an echoed row with a different avatar means the write didn't land", async () => {
  const f = fakeFetch([
    json(200, { ok: true, url: PUBLIC_URL }),
    json(200, { ok: true, profile: { id: "u", avatar_url: "https://abc.supabase.co/old.jpg" } }),
  ]);
  const r = await uploadAvatar(jpeg(), { fetchImpl: f.impl });
  assert.deepEqual(r, { ok: false, message: PHOTO_ERROR_COPY.uploadFailed, stage: "save", status: 200 });

  // `profile: null` (the route's re-read failed) is trusted, as the route reports ok.
  const f2 = fakeFetch([json(200, { ok: true, url: PUBLIC_URL }), json(200, { ok: true, profile: null })]);
  assert.deepEqual(await uploadAvatar(jpeg(), { fetchImpl: f2.impl }), { ok: true, url: PUBLIC_URL });
});
