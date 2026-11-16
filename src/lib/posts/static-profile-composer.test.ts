// The desktop profile composer (public/html/profile.html): a photo + caption
// post must carry the photo.
//
// Bug, Nov 16, 2026: the preview shows the moment a photo is picked, but the
// upload takes a few seconds (the server re-encodes it). A Publish clicked in
// that window sent the caption alone; production logs showed publish-post
// arriving 1-3 s before the photo was stored. A photo-only post never showed
// it, because Publish did nothing until the photo's URL was set.
//
// These tests run the page's own functions (cut out of the HTML) against a
// fake page and a fake network whose upload answers only when told to.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../../../public/html/profile.html", import.meta.url), "utf8");

function fnSource(src: string, name: string): string {
  const heads = [`async function ${name}(`, `function ${name}(`];
  const head = heads.find((h) => src.includes(h));
  assert.ok(head, `${name} is missing from profile.html`);
  assert.equal(src.split(head).length - 1, 1, `${head} must appear once in profile.html`);
  const a = src.indexOf(head);
  let depth = 0;
  for (let i = src.indexOf("{", a); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(a, i + 1);
  }
  throw new Error(`${name}: no closing brace`);
}

function letLine(name: string): string {
  const m = html.match(new RegExp(`^let ${name} = [^\\n]*;$`, "m"));
  assert.ok(m, `let ${name} is missing from profile.html`);
  return m[0];
}

const SOURCE = [
  letLine("_composerPendingImageUrl"),
  letLine("_composerUpload"),
  letLine("_composerUploadSeq"),
  ...["_composerUploadPhoto", "composerOnImagePicked", "composerClearImage", "publishProfilePost"].map(
    (n) => fnSource(html, n),
  ),
].join("\n");

type Deferred = { resolve: (body: unknown, ok?: boolean) => void };

function makePage() {
  const style = () => ({}) as Record<string, string>;
  const input = { style: style(), value: "" };
  const preview = { style: style() };
  const img = { style: style(), src: "" };
  const btn = { style: style(), disabled: false, textContent: "Publish" };
  const toasts: string[] = [];
  const published: Array<Record<string, unknown>> = [];
  const localCards: Array<{ text: string; image: string }> = [];
  const uploads: Deferred[] = [];

  const document = {
    getElementById: (id: string) =>
      ({
        profilePostInput: input,
        composerPostImagePreview: preview,
        composerPostImageImg: img,
      })[id] ?? null,
    querySelector: (sel: string) => (sel.includes("composer-publish") ? btn : null),
  };
  const fetch = (url: string, init: { body?: unknown }) => {
    if (url === "/api/me/profile-upload") {
      return new Promise((res) => {
        uploads.push({
          resolve: (body, ok = true) => res({ ok, json: async () => body }),
        });
      });
    }
    if (url === "/api/me/publish-post") {
      const body = JSON.parse(String(init.body));
      published.push(body);
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, post: { id: "p" + published.length, tags: [] } }),
      });
    }
    throw new Error("unexpected fetch " + url);
  };
  const URL = { createObjectURL: () => "blob:x", revokeObjectURL: () => {} };
  const deps = {
    document,
    fetch,
    URL,
    FormData,
    showToast: (m: string) => toasts.push(m),
    _isAppShell: () => true,
    _extractHashtags: () => [],
    // The real one draws the card from _composerPendingImageUrl, then clears
    // the composer; this keeps exactly that part.
    _publishProfilePostLocal: undefined as unknown,
    __cards: localCards,
  };
  const api = new Function(
    ...Object.keys(deps),
    `${SOURCE}
     _publishProfilePostLocal = function (text) {
       __cards.push({ text, image: _composerPendingImageUrl });
       composerClearImage();
     };
     return { composerOnImagePicked, composerClearImage, publishProfilePost,
              pendingUrl: () => _composerPendingImageUrl };`,
  )(...Object.values(deps)) as {
    composerOnImagePicked: (input: unknown) => Promise<void>;
    composerClearImage: () => void;
    publishProfilePost: () => Promise<unknown>;
    pendingUrl: () => string;
  };
  const pick = () => api.composerOnImagePicked({ files: [new Blob(["x"], { type: "image/jpeg" })], value: "" });
  return { api, pick, input, preview, btn, toasts, published, localCards, uploads };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const PHOTO = "https://abc.supabase.co/storage/v1/object/public/profiles/u/post-1.jpg";

test("caption + photo, Publish clicked while the photo is still uploading: the post carries the photo", async () => {
  const p = makePage();
  void p.pick();
  p.input.value = "Out in the forest #hike";
  const publishing = p.api.publishProfilePost();
  await tick();
  assert.equal(p.published.length, 0, "must not publish before the upload answers");
  assert.equal(p.btn.textContent, "Adding photo…");
  p.uploads[0].resolve({ ok: true, url: PHOTO });
  await publishing;
  assert.equal(p.published.length, 1);
  assert.equal(p.published[0].content, "Out in the forest #hike");
  assert.equal(p.published[0].media_url, PHOTO);
  assert.deepEqual(p.localCards, [{ text: "Out in the forest #hike", image: PHOTO }]);
  assert.equal(p.btn.textContent, "Publish");
  assert.equal(p.btn.disabled, false);
});

test("caption + photo, the upload fails: nothing is published and the caption stays", async () => {
  const p = makePage();
  void p.pick();
  p.input.value = "Out in the forest";
  const publishing = p.api.publishProfilePost();
  await tick();
  p.uploads[0].resolve({ ok: false, error: "Invalid file size" }, false);
  await publishing;
  assert.equal(p.published.length, 0);
  assert.equal(p.input.value, "Out in the forest");
  assert.deepEqual(p.toasts, ["Invalid file size"]);
  assert.equal(p.preview.style.display, "none");
});

test("photo only, Publish clicked during the upload: waits, then posts the photo", async () => {
  const p = makePage();
  void p.pick();
  const publishing = p.api.publishProfilePost();
  await tick();
  p.uploads[0].resolve({ ok: true, url: PHOTO });
  await publishing;
  assert.equal(p.published.length, 1);
  assert.equal(p.published[0].content, "");
  assert.equal(p.published[0].media_url, PHOTO);
});

test("photo finished uploading before Publish: posted with the caption, as before", async () => {
  const p = makePage();
  const picking = p.pick();
  p.uploads[0].resolve({ ok: true, url: PHOTO });
  await picking;
  p.input.value = "Trail day";
  await p.api.publishProfilePost();
  assert.equal(p.published[0].media_url, PHOTO);
  assert.equal(p.published[0].content, "Trail day");
});

test("text only: posts at once with no photo", async () => {
  const p = makePage();
  p.input.value = "Just words";
  await p.api.publishProfilePost();
  assert.equal(p.published.length, 1);
  assert.equal(p.published[0].media_url, undefined);
});

test("photo removed while uploading, then Publish: the caption goes alone and the late upload never attaches", async () => {
  const p = makePage();
  const picking = p.pick();
  p.api.composerClearImage();
  p.input.value = "Changed my mind";
  await p.api.publishProfilePost();
  assert.equal(p.published[0].media_url, undefined);
  p.uploads[0].resolve({ ok: true, url: PHOTO });
  await picking;
  assert.equal(p.api.pendingUrl(), "", "a late upload must not ride along on the next post");
  p.input.value = "Next post";
  await p.api.publishProfilePost();
  assert.equal(p.published[1].media_url, undefined);
});
