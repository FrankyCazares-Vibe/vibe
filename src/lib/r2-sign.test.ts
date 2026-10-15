/**
 * The file type is locked end to end (rate limits and upload caps, wave 1,
 * B1.1): a PUT link signs the key's own Content-Type, a GET link asks
 * storage to answer with the key's own type and `inline` (octet-stream and
 * `attachment` for anything else), every upload route's allow-list agrees
 * with `r2-media-types.ts`, and every client PUT sends the type the route
 * signed. Signing happens offline with fake credentials; nothing here talks
 * to storage.
 *
 * Run with:
 *   node --test src/lib/r2-sign.test.ts
 *
 * WHY THE RESOLVE HOOK: r2.ts imports "server-only" (an empty module here,
 * as in threads-list-route.test.ts) and "@/lib/media/r2-media-types".
 */

import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("r2-sign.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../", import.meta.url);
const REPO_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    return nextResolve(specifier, context);
  },
});

// Fake credentials: presigning is pure computation, so no request is made.
process.env.R2_ACCOUNT_ID = "testaccount";
process.env.R2_ACCESS_KEY_ID = "AKIDTESTONLY";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-not-real";
process.env.R2_BUCKET_NAME = "test-bucket";

const r2Specifier = "./r2.ts";
const typesSpecifier = "./media/r2-media-types.ts";
const r2 = (await import(r2Specifier)) as typeof import("./r2");
const { R2_MEDIA_TYPES, mediaTypeForKey } = (await import(typesSpecifier)) as typeof import("./media/r2-media-types");

const U = "0f8b6a52-3c1d-4e2f-9a7b-1c2d3e4f5a6b";
const params = (url: string) => new URL(url).searchParams;
const signedHeaders = (url: string) => (params(url).get("X-Amz-SignedHeaders") ?? "").split(";");

type PutSigner = (key: string, o: { contentLength: number; contentType: string }) => Promise<string>;
type GetSigner = (key: string, expiresInSec?: number) => Promise<string>;
const FAMILIES: { name: string; prefix: string; put: PutSigner; get: GetSigner }[] = [
  { name: "clip", prefix: `clips/${U}/`, put: r2.signClipPutUrl, get: r2.signClipGetUrl },
  { name: "group photo", prefix: `groups/${U}/`, put: r2.signGroupPhotoPutUrl, get: r2.signGroupPhotoGetUrl },
  { name: "message media", prefix: `messages/${U}/`, put: r2.signMessageMediaPutUrl, get: r2.signMessageMediaGetUrl },
  { name: "club asset", prefix: `orgs/${U}/posts/`, put: r2.signOrgAssetPutUrl, get: r2.signOrgAssetGetUrl },
];

test("the table: seven types, read from the last segment's extension", () => {
  assert.deepEqual({ ...R2_MEDIA_TYPES }, {
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
    jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  });
  assert.ok(Object.isFrozen(R2_MEDIA_TYPES));
  assert.deepEqual(mediaTypeForKey(`clips/${U}/a.mov`), { contentType: "video/quicktime", disposition: "inline", known: true });
  assert.equal(mediaTypeForKey("orgs/x/logo/A.PNG").contentType, "image/png");
  const unknown = { contentType: "application/octet-stream", disposition: "attachment", known: false };
  for (const key of [
    "orgs/x/banner/a.html", "messages/x/a.svg", "clips/u/noext", "clips/u/.mp4", "clips/u.mp4/file",
    "groups/x/a.jpg.html", "groups/x/a.jpeg", "groups/x/a.", "groups/x/a.constructor", "groups/x/a.__proto__",
    "groups/x/a.toString", "groups/x/a.hasOwnProperty", "",
  ]) {
    assert.deepEqual(mediaTypeForKey(key), unknown, key);
  }
});

test("every PUT link signs content-type, content-length and host", async () => {
  for (const f of FAMILIES) {
    for (const [ext, type] of Object.entries(R2_MEDIA_TYPES)) {
      const url = await f.put(`${f.prefix}${U}.${ext}`, { contentLength: 1234, contentType: type });
      const signed = signedHeaders(url);
      for (const h of ["content-type", "content-length", "host"]) {
        assert.ok(signed.includes(h), `${f.name} .${ext}: ${h} not in SignedHeaders (${signed.join(";")})`);
      }
      assert.equal(params(url).get("X-Amz-Expires"), "300", `${f.name}: default expiry`);
    }
  }
});

/**
 * A SigV4 check written from the spec, not the SDK: does `headers` (what a
 * browser sends) match the signature in a presigned `url`? This is what
 * storage does on every PUT, so a false here is R2's 403.
 */
function storageAccepts(url: string, method: string, headers: Record<string, string>): boolean {
  const u = new URL(url);
  const q = u.searchParams;
  const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const query = [...q.entries()]
    .filter(([k]) => k !== "X-Amz-Signature")
    .map(([k, v]) => [enc(k), enc(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const signed = (q.get("X-Amz-SignedHeaders") ?? "").split(";");
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  if (signed.some((h) => lower[h] === undefined)) return false;
  const canonicalHeaders = signed.map((h) => `${h}:${lower[h].trim().replace(/\s+/g, " ")}\n`).join("");
  const canonical = [method, u.pathname, query, canonicalHeaders, signed.join(";"), "UNSIGNED-PAYLOAD"].join("\n");
  const [, ...scopeParts] = (q.get("X-Amz-Credential") ?? "").split("/");
  const [day, region, service] = scopeParts;
  const toSign = ["AWS4-HMAC-SHA256", q.get("X-Amz-Date"), scopeParts.join("/"), createHash("sha256").update(canonical).digest("hex")].join("\n");
  let key: Buffer = Buffer.from(`AWS4${process.env.R2_SECRET_ACCESS_KEY}`);
  for (const part of [day, region, service, "aws4_request"]) key = createHmac("sha256", key).update(part).digest();
  return createHmac("sha256", key).update(toSign).digest("hex") === q.get("X-Amz-Signature");
}

test("storage takes the PUT only with the signed type and length", async () => {
  const host = "testaccount.r2.cloudflarestorage.com";
  for (const f of FAMILIES) {
    const url = await f.put(`${f.prefix}${U}.webm`, { contentLength: 1234, contentType: "video/webm" });
    const ok = { host, "Content-Type": "video/webm", "Content-Length": "1234" };
    assert.equal(storageAccepts(url, "PUT", ok), true, `${f.name}: the exact upload`);
    assert.equal(storageAccepts(url, "PUT", { ...ok, "Content-Type": "text/html" }), false, `${f.name}: html`);
    assert.equal(storageAccepts(url, "PUT", { ...ok, "Content-Type": "video/mp4" }), false, `${f.name}: another video type`);
    assert.equal(storageAccepts(url, "PUT", { host, "Content-Length": "1234" }), false, `${f.name}: no type`);
    assert.equal(storageAccepts(url, "PUT", { ...ok, "Content-Length": "1235" }), false, `${f.name}: another length`);
  }
});

test("a PUT refuses any type that is not the key's own", async () => {
  for (const f of FAMILIES) {
    const refuse = async (key: string, contentType: unknown, why: string) =>
      assert.rejects(
        f.put(`${f.prefix}${key}`, { contentLength: 10, contentType: contentType as string }),
        /contentType must be the media type/,
        `${f.name}: ${why}`,
      );
    await refuse(`${U}.mp4`, "video/webm", "another known type");
    await refuse(`${U}.jpg`, "image/jpg", "a near miss");
    await refuse(`${U}.mp4`, "Video/MP4", "case differs");
    await refuse(`${U}.mp4`, "video/mp4; codecs=avc1", "parameters");
    await refuse(`${U}.mp4`, undefined, "missing");
    await refuse(`${U}.mp4`, "", "empty");
    await refuse(`${U}.html`, "text/html", "an extension outside the table");
    await refuse(`${U}.svg`, "image/svg+xml", "svg");
    await refuse(`${U}`, "application/octet-stream", "no extension");
    // The length check still runs, and runs first.
    await assert.rejects(
      f.put(`${f.prefix}${U}.png`, { contentLength: 0, contentType: "image/png" }),
      /contentLength must be a positive safe integer/,
    );
  }
});

test("every GET link names the key's type and inline", async () => {
  for (const f of FAMILIES) {
    for (const [ext, type] of Object.entries(R2_MEDIA_TYPES)) {
      const p = params(await f.get(`${f.prefix}${U}.${ext}`, 3600));
      assert.equal(p.get("response-content-type"), type, `${f.name} .${ext}`);
      assert.equal(p.get("response-content-disposition"), "inline", `${f.name} .${ext}`);
      assert.equal(p.get("X-Amz-Expires"), "3600");
    }
  }
});

test("a GET for an unknown extension is octet-stream and attachment", async () => {
  for (const f of FAMILIES) {
    for (const name of [`${U}.html`, `${U}.svg`, `${U}`, `${U}.jpeg`]) {
      const p = params(await f.get(`${f.prefix}${name}`));
      assert.equal(p.get("response-content-type"), "application/octet-stream", `${f.name} ${name}`);
      assert.equal(p.get("response-content-disposition"), "attachment", `${f.name} ${name}`);
    }
  }
});

// ── Source scans ─────────────────────────────────────────────────────────────

const read = (rel: string) => readFileSync(new URL(rel, REPO_ROOT), "utf8");

/** The four routes that sign a PUT, and the signer each one calls. */
const UPLOAD_ROUTES: Record<string, string> = {
  "src/app/api/me/clip-upload-url/route.ts": "signClipPutUrl",
  "src/app/api/me/group-photo-upload-url/route.ts": "signGroupPhotoPutUrl",
  "src/app/api/me/messages-upload-url/route.ts": "signMessageMediaPutUrl",
  "src/app/api/orgs/[slug]/upload-url/route.ts": "signOrgAssetPutUrl",
};

/** Every source file under src/ and public/, tests left out. */
function sourceFiles(): string[] {
  const out: string[] = [];
  for (const dir of ["src", "public"]) {
    for (const rel of readdirSync(new URL(`${dir}/`, REPO_ROOT), { recursive: true }) as string[]) {
      if (/\.(ts|tsx|js|mjs|html)$/.test(rel) && !/\.test\.ts$/.test(rel)) out.push(`${dir}/${rel}`);
    }
  }
  return out;
}

test("no PUT signer is called outside the four upload routes", () => {
  const callers = sourceFiles()
    .filter((f) => f !== "src/lib/r2.ts")
    .filter((f) => /\bsign(Clip|GroupPhoto|MessageMedia|OrgAsset)PutUrl\(/.test(read(f)))
    .sort();
  assert.deepEqual(callers, Object.keys(UPLOAD_ROUTES).sort());
});

test("every route's allow-list type is in the table, under the same extension", () => {
  for (const [file, signer] of Object.entries(UPLOAD_ROUTES)) {
    const src = read(file);
    const pairs = [...src.matchAll(/"((?:image|video)\/[^"]+)"\s*:\s*"([^"]+)"/g)];
    assert.ok(pairs.length >= 3, `${file}: allow-list not found`);
    for (const [, type, ext] of pairs) {
      assert.equal(R2_MEDIA_TYPES[ext], type, `${file}: "${type}" → .${ext} is not the table's row`);
    }
    // Any other media type the route spells must be one of the table's too.
    for (const [, type] of src.matchAll(/["'`]((?:image|video)\/[a-z0-9.+-]+)["'`]/gi)) {
      assert.ok(Object.values(R2_MEDIA_TYPES).includes(type), `${file}: "${type}" is not in the table`);
    }
    // The route signs `contentType` and answers with that same string.
    assert.match(src, new RegExp(`${signer}\\(objectKey, \\{\\s*contentType,`), `${file}: signs contentType`);
    assert.match(src, /NextResponse\.json\(\{ ok: true, uploadUrl, objectKey,[^}]*\bcontentType\b[^}]*\}\)/, `${file}: answers contentType`);
  }
});

/**
 * The seven client PUT sites (rate limits plan, critique #20), in file order,
 * each with the name its sign answer has there: the left side of the
 * Content-Type fallback has to be that answer's `contentType`, or the
 * fallback could be written backwards and always send the declared type.
 */
const CLIENT_PUT_SITES: Record<string, string[]> = {
  "src/app/campus/campus-home.tsx": ["sig"],
  "src/app/orgs/[handle]/admin-actions.tsx": ["signData", "signData"],
  "src/components/mobile/PostComposerMobile.tsx": ["sig.data"],
  "src/components/mobile/messages/ConversationView.tsx": ["sign.data"],
  "public/html/messages.html": ["signJson", "signJson"],
};

const PUT_SITE_RE = /(?:fetch|vibeRequest)\(\s*[\w.]*uploadUrl\b|\.open\(\s*["']PUT["']\s*,\s*[\w.]*uploadUrl\b/g;

test("there are exactly seven client PUT sites, where the list says", () => {
  const found: Record<string, number> = {};
  for (const f of sourceFiles()) {
    if (f.startsWith("src/app/api/")) continue;
    const n = [...read(f).matchAll(PUT_SITE_RE)].length;
    if (n) found[f] = n;
  }
  const listed = Object.fromEntries(Object.entries(CLIENT_PUT_SITES).map(([f, roots]) => [f, roots.length]));
  assert.deepEqual(found, listed);
  assert.equal(Object.values(found).reduce((a, b) => a + b, 0), 7);
});

test("every client PUT sends the route's contentType, else the declared one", () => {
  for (const [file, roots] of Object.entries(CLIENT_PUT_SITES)) {
    const src = read(file);
    for (const [i, m] of [...src.matchAll(PUT_SITE_RE)].entries()) {
      const start = m.index ?? 0;
      // This call only: up to the next request, at most 600 characters.
      const rest = src.slice(start + m[0].length, start + 600);
      const next = rest.search(/\b(?:fetch|vibeRequest)\(|\.open\(/);
      const call = next === -1 ? rest : rest.slice(0, next);
      if (!m[0].includes(".open(")) assert.match(call, /method:\s*["']PUT["']/, `${file}: not a PUT`);
      const header = call.match(/["']content-type["']\s*[:,]\s*(.+?)\s*(?:\}|\)\s*;)/i);
      assert.ok(header, `${file} @${start}: no Content-Type header on the PUT`);
      const signed = `${roots[i].replace(/\./g, "\\.")}\\.contentType`;
      assert.match(
        header[1],
        new RegExp(`^${signed} \\?\\? [\\w.]+$`),
        `${file} @${start}: sends "${header[1]}", not ${roots[i]}.contentType ?? the declared one`,
      );
    }
  }
});
