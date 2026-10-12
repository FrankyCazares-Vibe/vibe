/**
 * Keeps the two copies of the chat photo shrinker in step:
 *
 *   src/lib/media/shrink-photo.ts   the rules; the phone chat imports them
 *   public/html/_shrinkPhoto.js     the same rules as a plain script, for
 *                                   public/html/messages.html (direct and
 *                                   group chats on a computer), which has no
 *                                   build step and cannot import a .ts file
 *
 * The copy has no exports, so it is run in a `node:vm` sandbox the way a
 * <script> tag would run it. Four checks, each of which fails while the copy
 * is behind the rules:
 *   1. every number and word the rules export has the same value in the copy
 *      (the size a photo must be over, the 2048 edge, the JPEG quality, the
 *      long-and-thin limit, the type it comes out as, the time limit), and
 *      the list of types that get shrunk is the same list, as written;
 *   2. every rule function answers the same for the same inputs (which types
 *      are touched, which sizes, what counts as long and thin, ...);
 *   3. the whole job, walked on a stand-in page, reads, draws, exports and
 *      answers the same in both;
 *   4. the code itself is the same once the types are taken out, comments and
 *      spacing aside. Checks 1 to 3 say WHICH rule moved; this one is the
 *      net under them, for a change they have no input for (a type nobody
 *      listed here, a new rule in the middle of the job).
 *
 * The last part runs the page's own send code, cut out of messages.html, to
 * pin what the upload route needs: the size and type declared, the upload's
 * Content-Type and the bytes sent all belong to ONE file.
 *
 * WHEN THIS FAILS after a change to shrink-photo.ts: make the same change in
 * public/html/_shrinkPhoto.js (it is the .ts file with its types removed and
 * nothing else changed), and change the Privacy Policy (section 3c) the same
 * day if a rule moved. The copy was first made by machine, and can be again:
 * everything after the .ts file's header comment goes through TypeScript's
 * `transpileModule` (target ES2020, comments kept), each `export` is dropped,
 * and the result is wrapped the way the copy is now.
 *
 * Run with:
 *   node --test src/lib/media/shrink-photo-static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

// Node's type stripping needs the ".ts" on disk; tsc refuses a literal ".ts"
// import (TS5097). A variable specifier keeps both happy.
const specifier = "./shrink-photo.ts";
const rules = (await import(specifier)) as typeof import("./shrink-photo");

const root = new URL("../../../", import.meta.url);
/** The rules as written, for the two checks that read the code and not its answers. */
const RULES_TEXT = readFileSync(new URL("src/lib/media/shrink-photo.ts", root), "utf8");
const SCRIPT = readFileSync(new URL("public/html/_shrinkPhoto.js", root), "utf8");
const PAGE = readFileSync(new URL("public/html/messages.html", root), "utf8");

type Fn = (...args: unknown[]) => unknown;
type Shrunk = { file: File; contentType: string } | null;
type CopyApi = { shouldShrinkPhoto: Fn; shrinkPhoto: (file: File, opts?: object) => Promise<Shrunk> };

/** The one line that hands the page its two functions. */
const HANDS_OUT = "window.__vibeShrinkPhoto = { shouldShrinkPhoto, shrinkPhoto };";
/** The copy's first line of code: a page that loads it twice keeps the first. */
const LOADED_ONCE = "if (window.__vibeShrinkPhoto) return;";

/** Run a script the way a <script> tag would, on a page that has `page` in it. */
function load(script: string, page: Record<string, unknown> = {}): Record<string, unknown> {
  const window: Record<string, unknown> = {};
  runInNewContext(script, { window, URL, File, Blob, setTimeout, clearTimeout, ...page });
  return window;
}

/**
 * The copy's rule functions by name. The page is handed two of them; to
 * compare the rest, the wrapper is opened: the hand-out line is swapped for
 * one that names them all.
 */
function copyRules(names: string[]): Record<string, Fn> {
  const opened = SCRIPT.replace(HANDS_OUT, `window.__rules = { ${names.join(", ")} };`);
  return load(opened).__rules as Record<string, Fn>;
}

/** An answer from the sandbox is built on another realm's Object: compare what it holds. */
const plain = (value: unknown): unknown =>
  value && typeof value === "object" ? { ...(value as object) } : value;

const exported = Object.entries(rules as Record<string, unknown>);
const CONSTANTS = exported.filter(([, value]) => typeof value !== "function");
const RULE_NAMES = exported.filter(([, value]) => typeof value === "function").map(([name]) => name);

test("the copy hands the page shouldShrinkPhoto and shrinkPhoto, once, and nothing else", () => {
  assert.equal(SCRIPT.split(HANDS_OUT).length, 2, `_shrinkPhoto.js must end with: ${HANDS_OUT}`);
  const window = load(SCRIPT);
  assert.deepEqual(Object.keys(window), ["__vibeShrinkPhoto"]);
  const api = window.__vibeShrinkPhoto as Record<string, unknown>;
  assert.deepEqual(Object.keys(api), ["shouldShrinkPhoto", "shrinkPhoto"]);
  // A page that loads the script twice keeps the first.
  runInNewContext(SCRIPT, { window });
  assert.equal(window.__vibeShrinkPhoto, api);
});

test("every number and word in the rules has the same value in the copy", () => {
  // The ones the behaviour hangs on. If shrink-photo.ts stops exporting one,
  // nothing below would compare it any more, so say so.
  const named = CONSTANTS.map(([name]) => name);
  for (const name of [
    "SHRINK_OVER_BYTES",
    "SHRINK_MAX_EDGE",
    "SHRINK_MAX_LONG_TO_SHORT",
    "SHRINK_JPEG_QUALITY",
    "SHRUNK_CONTENT_TYPE",
    "SHRINK_TIMEOUT_MS",
    "SOLID_FROM_ALPHA",
    "PROBE_RGB",
  ]) {
    assert.ok(named.includes(name), `shrink-photo.ts no longer exports ${name}; this test compared it`);
  }
  for (const [name, value] of CONSTANTS) {
    const line = SCRIPT.match(new RegExp(`^\\s*const ${name}\\s*=\\s*([^;]+);`, "m"));
    assert.ok(line, `_shrinkPhoto.js has no "const ${name} = ...;" (shrink-photo.ts exports it)`);
    assert.deepEqual(plain(runInNewContext(`(${line[1]})`)), plain(value), `${name} differs in _shrinkPhoto.js`);
  }
});

/** The list of types a pick is looked up in, as one of the two files writes it. */
function typeList(source: string, file: string): string[] {
  const written = source.match(/^\s*const SHRINKABLE_TYPES\b[^=]*= new Set\(\[([^\]]*)\]\);/m);
  assert.ok(written, `${file} no longer says "const SHRINKABLE_TYPES = new Set([...]);" and this test read the types there`);
  return [...(runInNewContext(`[${written[1]}]`) as string[])];
}

test("the types that get shrunk are the same list in the copy, as written", () => {
  // The list is not exported, so the loop above never sees it, and asking
  // shouldShrinkPhoto (below) only proves the types this file thought to ask
  // about. A type added to one file alone, say "image/bmp", fails here.
  const own = typeList(RULES_TEXT, "shrink-photo.ts");
  const copy = typeList(SCRIPT, "_shrinkPhoto.js");
  assert.ok(own.length > 0, "shrink-photo.ts lists no types at all");
  assert.deepEqual(copy, own, "SHRINKABLE_TYPES differs in _shrinkPhoto.js");
  // The list read is the list used: each file shrinks every type it lists.
  const copyApi = load(SCRIPT).__vibeShrinkPhoto as CopyApi;
  const big = rules.SHRINK_OVER_BYTES + 1;
  for (const contentType of own) {
    assert.equal(rules.shouldShrinkPhoto({ contentType, sizeBytes: big }), true, `shrink-photo.ts lists ${contentType}`);
    assert.equal(copyApi.shouldShrinkPhoto({ contentType, sizeBytes: big }), true, `_shrinkPhoto.js lists ${contentType}`);
  }
});

test("the copy's code is the rules' code with the types taken out, comments and spacing aside", async () => {
  // Both files go through TypeScript's own printer (the tool the copy was
  // first made with), which drops types and comments and writes the rest one
  // way. What is left to differ is the code. Loaded here and not at the top,
  // so the other tests still run on a machine without the package.
  const ts = (await import("typescript")).default;
  const printed = (code: string) =>
    ts
      .transpileModule(code, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, removeComments: true },
      })
      .outputText.replace(/^export \{\};?$/gm, "")
      .replace(/^export /gm, "")
      .replace(/\s+/g, " ")
      .trim();
  // The copy's code sits between its first line and the line that hands it out.
  const from = SCRIPT.indexOf(LOADED_ONCE);
  const to = SCRIPT.indexOf(HANDS_OUT);
  assert.ok(from >= 0 && to > from, `_shrinkPhoto.js must open with "${LOADED_ONCE}" and close with "${HANDS_OUT}"`);
  const own = printed(RULES_TEXT);
  const copy = printed(SCRIPT.slice(from + LOADED_ONCE.length, to));
  assert.ok(own.includes("async function shrinkPhoto("), "shrink-photo.ts printed to nothing: nothing was compared");
  if (copy === own) return;
  let at = 0;
  while (copy[at] === own[at]) at += 1;
  const around = (code: string) => code.slice(Math.max(0, at - 70), at + 90);
  assert.fail(
    "_shrinkPhoto.js is no longer shrink-photo.ts with its types removed. They part ways here:\n" +
      `  shrink-photo.ts:  ...${around(own)}...\n  _shrinkPhoto.js:  ...${around(copy)}...`,
  );
});

// ---------------------------------------------------------------------------
// 2. The rule functions, input for input. The inputs are built from the
// rules' own numbers, so they sit on each limit wherever it moves to.
// ---------------------------------------------------------------------------

const OVER = rules.SHRINK_OVER_BYTES;
const EDGE = rules.SHRINK_MAX_EDGE;
const RATIO = rules.SHRINK_MAX_LONG_TO_SHORT;
const SOLID = rules.SOLID_FROM_ALPHA;
const MB = 1024 * 1024;

const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ascii = (text: string) => Array.from(text, (ch) => ch.charCodeAt(0));

/** One PNG chunk: 4-byte length, name, data, 4-byte checksum (never checked). */
function pngChunk(name: string, dataLength: number): number[] {
  const length = [dataLength >>> 24, (dataLength >>> 16) & 255, (dataLength >>> 8) & 255, dataLength & 255];
  return [...length, ...ascii(name), ...new Array<number>(dataLength).fill(0), 0, 0, 0, 0];
}
const png = (...chunks: Array<[string, number]>) =>
  Uint8Array.from([...PNG_MAGIC, ...chunks.flatMap(([name, len]) => pngChunk(name, len))]);
/** "RIFF" <size> "WEBP" <first chunk> <chunk size> <flags byte at 20>. */
const webp = (firstChunk: string, flags = 0) =>
  Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), ...ascii(firstChunk), 10, 0, 0, 0, flags, 0, 0, 0]);

const STILL_PNG = png(["IHDR", 13], ["IDAT", 40]);

/** A canvas read of `width` x `height` solid pixels, with some set to another alpha. */
function pixels(width: number, height: number, holes: Array<[number, number, number]> = []): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [x, y, alpha] of holes) data[(y * width + x) * 4 + 3] = alpha;
  return data;
}

/** Widths and heights on both sides of the edge, of the edge times the ratio, and junk. */
const LENGTHS = [
  1, 2, 300, 1080, EDGE / RATIO - 1, EDGE / RATIO, EDGE / RATIO + 1, EDGE - 1, EDGE, EDGE + 1,
  3024, 4032, EDGE * RATIO, EDGE * RATIO + 1, 16000, 0, -5, Number.NaN, Infinity,
];
const SHAPES: unknown[][] = [];
for (const width of LENGTHS) for (const height of LENGTHS) SHAPES.push([width, height]);
// Right on the long-and-thin line, a hair under it and a hair over.
for (const short of [700, 1080, 2000]) {
  for (const times of [RATIO - 0.01, RATIO, RATIO + 0.01, RATIO + 1]) {
    SHAPES.push([short, short * times], [short * times, short]);
  }
}
// A caller's own edge instead of the default.
for (const maxEdge of [1024, EDGE * 2, 1, 0, Number.NaN]) {
  SHAPES.push([4032, 3024, maxEdge], [1080, 7200, maxEdge], [800, 600, maxEdge]);
}

const TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/avif", "image/svg+xml",
  "image/jpg", "video/mp4", "video/quicktime", "video/webm", "application/pdf", "",
  " IMAGE/JPEG; charset=binary", "Image/WebP", 42, null, undefined,
];
const BYTE_SIZES = [0, 1, 200 * 1024, OVER - 1, OVER, OVER + 1, 2 * OVER, 15 * MB, Number.NaN, Infinity, -1];

const INPUTS: Record<string, unknown[][]> = {
  shouldShrinkPhoto: TYPES.flatMap((contentType) => BYTE_SIZES.map((sizeBytes) => [{ contentType, sizeBytes }])),
  stillPhotoFormat: [
    [Uint8Array.from(JPEG_MAGIC)], [Uint8Array.from([0xff, 0xd8])], [new Uint8Array(0)],
    [STILL_PNG], [png(["IHDR", 13], ["iCCP", 3000], ["iTXt", 900], ["IDAT", 40])],
    [png(["IHDR", 13], ["acTL", 8], ["IDAT", 40])], [png(["IHDR", 13])], [Uint8Array.from(PNG_MAGIC)],
    [webp("VP8 ")], [webp("VP8L")], [webp("VP8X", 0)], [webp("VP8X", 0x10)], [webp("VP8X", 0x02)],
    [webp("VP8X", 0x12)], [webp("VP8X").slice(0, 20)], [webp("ALPH")],
    [Uint8Array.from(ascii("GIF89a"))], [Uint8Array.from([0, 0, 0, 24, ...ascii("ftypmp42")])],
  ],
  tooLongAndThin: SHAPES,
  shrinkTargetSize: SHAPES,
  hasSeeThroughPixels: [
    [pixels(4, 4), 4, 4],
    ...[0, SOLID - 1, SOLID, 254].map((alpha) => [pixels(4, 4, [[1, 1, alpha]]), 4, 4]),
    ...[0, SOLID - 1].map((alpha) => [pixels(4, 4, [[2, 2, alpha]]), 4, 4]),
    // The outer ring: every corner and a pixel on each side.
    ...([[0, 0], [3, 0], [0, 3], [3, 3], [1, 0], [0, 2], [3, 1], [2, 3]] as const)
      .map(([x, y]) => [pixels(4, 4, [[x, y, 0]]), 4, 4]),
    // 1 or 2 pixels across is all ring.
    [pixels(2, 2, [[0, 0, 0]]), 2, 2], [pixels(2, 2, [[1, 1, SOLID]]), 2, 2], [pixels(1, 1, [[0, 0, SOLID - 1]]), 1, 1],
    [pixels(2, 5, [[1, 2, 0]]), 2, 5], [pixels(3, 3, [[1, 1, SOLID - 1]]), 3, 3], [pixels(5, 3, [[4, 1, 0]]), 5, 3],
    // A read that is empty or not the size it says.
    [pixels(4, 4), 4, 5], [pixels(4, 4), 0, 4], [pixels(4, 4), 2.5, 4], [new Uint8ClampedArray(0), 0, 0], [[], 1, 1],
  ],
  probeCameBackRight: [
    [[...rules.PROBE_RGB, 255]], [[...rules.PROBE_RGB, SOLID]], [[...rules.PROBE_RGB, SOLID - 1]], [[...rules.PROBE_RGB]],
    ...rules.PROBE_RGB.flatMap((_, at) =>
      [-9, -8, 8, 9].map((drift) => [rules.PROBE_RGB.map((v, i) => (i === at ? v + drift : v)).concat(255)]),
    ),
    [[255, 255, 255, 255]], [[0, 0, 0, 0]], [[]],
  ],
  shrunkIsBetter: [rules.SHRUNK_CONTENT_TYPE, "image/png", "image/webp", ""].flatMap((shrunkType) =>
    [0, 1, 999, 1000, 1001].map((shrunkBytes) => [{ originalBytes: 1000, shrunkBytes, shrunkType }]),
  ),
  shrunkFileName: [
    ["IMG_0042.PNG"], ["a.b.c.webp"], ["no-extension"], [".png"], [""], ["  spaced .jpeg"], ["dir/pic.jpg"],
    ["trailing."], [42], [undefined],
  ],
};

test("every rule answers the same in the copy, input for input", () => {
  // shrinkPhoto is the whole job: it is walked on a stand-in page below.
  const names = RULE_NAMES.filter((name) => name !== "shrinkPhoto");
  for (const name of names) {
    assert.match(SCRIPT, new RegExp(`^\\s*function ${name}\\(`, "m"), `_shrinkPhoto.js has no function ${name}`);
    assert.ok(INPUTS[name]?.length, `shrink-photo.ts exports a rule this test has no inputs for (${name}): add some to INPUTS`);
  }
  const copy = copyRules(names);
  const own = rules as unknown as Record<string, Fn>;
  let compared = 0;
  for (const name of names) {
    for (const args of INPUTS[name]) {
      const given = JSON.stringify(args).slice(0, 160);
      assert.deepEqual(plain(copy[name](...args)), plain(own[name](...args)), `${name} differs in _shrinkPhoto.js, given ${given}`);
      compared += 1;
    }
  }
  assert.ok(compared > 1000, "the inputs above were all compared");
});

// ---------------------------------------------------------------------------
// 3. The whole job on a stand-in page (no browser here). Each knob is one way
// a real browser can behave. Both files are walked through the same page and
// must leave the same trace: what they read, drew, exported and answered.
// ---------------------------------------------------------------------------

type Knobs = {
  /** The upright size the browser reports once the photo is decoded. */
  natural: { width: number; height: number };
  decode: "ok" | "error" | "never";
  /** false = the draw painted nothing (a phone out of memory). */
  paints: boolean;
  /** How solid one pixel in the middle of the drawn photo reads (255 = fully). */
  innerAlpha: number;
  /** What the 1 px probe reads back. */
  probe: number[];
  /** What the JPEG export hands back. */
  exported: Blob | null;
  turnsPhotosUpright: boolean;
  canvasThrows: boolean;
};
type Pick = { bytes: number; name: string; type: string; head: ArrayLike<number> };
type Seen = {
  images: number;
  drawn: number[] | null;
  /** How the photo's canvas was told to scale when the photo was drawn: on or off, and how well. */
  smoothing: unknown[] | null;
  exportAsked: { type: string; quality: number; width: number; height: number } | null;
  canvasesLeftAt: Array<[number, number]>;
};

/** A picked file that notes which bytes were read from it. */
class SpyFile extends File {
  sliced: Array<[number | undefined, number | undefined]> = [];
  slice(start?: number, end?: number, contentType?: string): Blob {
    this.sliced.push([start, end]);
    return super.slice(start, end, contentType);
  }
}

function standInPage(k: Knobs) {
  const seen: Seen = { images: 0, drawn: null, smoothing: null, exportAsked: null, canvasesLeftAt: [] };
  const canvases: Array<{ width: number; height: number }> = [];
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    set src(_url: string) {
      seen.images += 1;
      if (k.decode === "never") return;
      queueMicrotask(() => {
        if (k.decode === "error") return this.onerror?.();
        this.naturalWidth = k.natural.width;
        this.naturalHeight = k.natural.height;
        this.onload?.();
      });
    }
  }
  const createElement = () => {
    if (k.canvasThrows) throw new Error("no canvas for you");
    let photoDrawn = false;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => {
        const ctx: Record<string, unknown> = {
          fillRect: () => undefined,
          drawImage: (_img: unknown, ...box: number[]) => {
            photoDrawn = true;
            seen.drawn = box;
            // Whatever the job set on the canvas before it drew.
            seen.smoothing = [ctx.imageSmoothingEnabled, ctx.imageSmoothingQuality];
          },
          getImageData: (_x: number, _y: number, w: number, h: number) => {
            if (!photoDrawn) return { data: Uint8ClampedArray.from(k.probe), width: 1, height: 1 };
            const data = new Uint8ClampedArray(w * h * 4).fill(k.paints ? 255 : 0);
            if (k.paints) data[(Math.floor(h / 2) * w + Math.floor(w / 2)) * 4 + 3] = k.innerAlpha;
            return { data, width: w, height: h };
          },
        };
        return ctx;
      },
      toBlob: (done: (blob: Blob | null) => void, type: string, quality: number) => {
        seen.exportAsked = { type, quality, width: canvas.width, height: canvas.height };
        done(k.exported);
      },
    };
    canvases.push(canvas);
    return canvas;
  };
  const globals = { document: { createElement }, Image: FakeImage, CSS: { supports: () => k.turnsPhotosUpright } };
  const leave = () => void (seen.canvasesLeftAt = canvases.map((c) => [c.width, c.height]));
  return { seen, globals, leave };
}

const jpegBlob = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });

const USUAL: Knobs = {
  natural: { width: 4032, height: 3024 },
  decode: "ok",
  paints: true,
  innerAlpha: 255,
  probe: [...rules.PROBE_RGB, 255],
  exported: jpegBlob(400_000),
  turnsPhotosUpright: true,
  canvasThrows: false,
};
const PHOTO: Pick = { bytes: 3 * MB, name: "IMG_0042.JPG", type: "image/jpeg", head: JPEG_MAGIC };

/** Walk one file's shrinkPhoto over the page and say everything it did. */
async function walk(who: "rules" | "copy", knobs: Knobs, pick: Pick, timeoutMs?: number) {
  const page = standInPage(knobs);
  const body = new Uint8Array(pick.bytes);
  body.set(pick.head);
  const file = new SpyFile([body], pick.name, { type: pick.type });
  const whys: string[] = [];
  const timers: number[] = [];
  const opts = {
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    onKeptOriginal: (why: string) => void whys.push(why),
  };
  const realRevoke = URL.revokeObjectURL;
  let revoked = 0;
  URL.revokeObjectURL = (url: string) => {
    revoked += 1;
    realRevoke.call(URL, url);
  };
  const g = globalThis as Record<string, unknown>;
  let shrunk: Shrunk;
  try {
    if (who === "rules") {
      // The .ts file reads the page from the globals.
      Object.assign(g, page.globals);
      shrunk = await rules.shrinkPhoto(file, opts);
    } else {
      const noted = (fn: () => void, ms: number) => {
        timers.push(ms);
        return setTimeout(fn, ms);
      };
      const api = load(SCRIPT, { ...page.globals, setTimeout: noted }).__vibeShrinkPhoto as CopyApi;
      shrunk = await api.shrinkPhoto(file, opts);
    }
  } finally {
    for (const key of Object.keys(page.globals)) delete g[key];
    URL.revokeObjectURL = realRevoke;
  }
  page.leave();
  const answer = shrunk && {
    name: shrunk.file.name,
    type: shrunk.file.type,
    size: shrunk.file.size,
    contentType: shrunk.contentType,
  };
  return { trace: { answer, whys, sliced: file.sliced, revoked, ...page.seen }, timers };
}

const WALKS: Array<[label: string, knobs: Partial<Knobs>, pick: Partial<Pick>, timeoutMs?: number]> = [
  ["a big phone photo", {}, {}],
  ["a photo the phone stored on its side", { natural: { width: 3024, height: 4032 } }, {}],
  ["an ordinary phone screenshot", { natural: { width: 1290, height: 2796 } }, {}],
  ["a photo that already fits the edge", { natural: { width: 1600, height: 1200 } }, {}],
  ["a big solid PNG", {}, { name: "Screenshot.png", type: "image/png", head: STILL_PNG }],
  ["a big still WebP", {}, { name: "pic.webp", type: "image/webp", head: webp("VP8 ") }],
  ["a see-through PNG", { innerAlpha: 0 }, { name: "logo.png", type: "image/png", head: STILL_PNG }],
  ["a pixel a little too soft", { innerAlpha: SOLID - 1 }, {}],
  ["a pixel just solid enough", { innerAlpha: SOLID }, {}],
  ["a draw that painted nothing", { paints: false }, {}],
  ["a long scrolling screenshot", { natural: { width: 1080, height: 7200 } }, {}],
  ["a panorama", { natural: { width: 16000, height: 3600 } }, {}],
  ["a copy that came out no smaller", { exported: jpegBlob(3 * MB) }, {}],
  ["a file the browser cannot decode", { decode: "error" }, {}],
  ["a decode that reports no size", { natural: { width: 0, height: 0 } }, {}],
  ["an export that hands back nothing", { exported: null }, {}],
  ["an export that is not a JPEG", { exported: new Blob([new Uint8Array(1000)], { type: "image/png" }) }, {}],
  ["a privacy mode that blanks canvas reads", { probe: [255, 255, 255, 255] }, {}],
  ["a probe that comes back a few points off", { probe: [...rules.PROBE_RGB.map((v) => v + 3), 252] }, {}],
  ["a browser too old to turn a photo upright", { turnsPhotosUpright: false }, {}],
  ["a canvas that throws", { canvasThrows: true }, {}],
  ["a decode that never answers", { decode: "never" }, {}, 20],
  ["a small photo", {}, { bytes: 300 * 1024 }],
  ["a photo exactly at the size limit", {}, { bytes: OVER }],
  ["a photo one byte over the size limit", {}, { bytes: OVER + 1 }],
  ["a big GIF", {}, { name: "party.gif", type: "image/gif", head: ascii("GIF89a") }],
  ["a video", {}, { name: "clip.mp4", type: "video/mp4", head: [0, 0, 0, 24] }],
  ["an animated WebP", {}, { name: "a.webp", type: "image/webp", head: webp("VP8X", 0x02) }],
  ["an animated PNG", {}, { name: "a.png", type: "image/png", head: png(["IHDR", 13], ["acTL", 8], ["IDAT", 40]) }],
  ["a GIF wearing a .png name", {}, { name: "b.png", type: "image/png", head: ascii("GIF89a") }],
];

test("the whole job leaves the same trace in the copy: what it read, drew, exported and answered", async () => {
  const waysOut = new Set<string>();
  for (const [label, knobs, pick, timeoutMs] of WALKS) {
    const own = await walk("rules", { ...USUAL, ...knobs }, { ...PHOTO, ...pick }, timeoutMs);
    const copy = await walk("copy", { ...USUAL, ...knobs }, { ...PHOTO, ...pick }, timeoutMs);
    assert.deepEqual(copy.trace, own.trace, `${label}: _shrinkPhoto.js did not do what shrink-photo.ts does`);
    waysOut.add(own.trace.answer ? "a smaller copy" : own.trace.whys.join());
  }
  // The walks reach a smaller copy and every one of the eleven reasons to
  // keep the original, so each way out of the job was compared.
  assert.ok(waysOut.has("a smaller copy"));
  assert.ok(waysOut.size >= 12, `only reached: ${[...waysOut].join(", ")}`);
});

test("the copy draws at the rules' edge, exports at the rules' quality and gives up at the rules' time limit", async () => {
  const { trace, timers } = await walk("copy", USUAL, PHOTO);
  const height = Math.round((EDGE * 3024) / 4032);
  assert.deepEqual(trace.drawn, [0, 0, EDGE, height]);
  assert.deepEqual(trace.exportAsked, {
    type: rules.SHRUNK_CONTENT_TYPE,
    quality: rules.SHRINK_JPEG_QUALITY,
    width: EDGE,
    height,
  });
  assert.deepEqual(timers, [rules.SHRINK_TIMEOUT_MS]);
  // What the page will declare and upload: the copy's own name, type and size.
  const type = rules.SHRUNK_CONTENT_TYPE;
  assert.deepEqual(trace.answer, { name: "IMG_0042.jpg", type, size: 400_000, contentType: type });
  // The blob: address is freed and the photo's canvas hands its memory back.
  assert.equal(trace.revoked, 1);
  assert.deepEqual(trace.canvasesLeftAt.at(-1), [0, 0]);
});

// ---------------------------------------------------------------------------
// 4. The page. Its send code is cut out of messages.html by name and run on a
// stand-in chat. Which picks get shrunk is the copy's own shouldShrinkPhoto;
// the shrink itself is a job the test finishes by hand, so "the copy is still
// being made" can be held open while the student does something else.
// ---------------------------------------------------------------------------

const SIGN_URL = "/api/me/messages-upload-url";
const PAGE_FUNCTIONS = [
  "snd", "upd", "__dmSend", "__dmSendError", "__dmShrinkStart", "__dmShrinkKeptOriginal", "__dmUploadFor",
  "__dmComposeMediaChosen", "__dmComposeMediaClear", "__dmComposeMediaRenderStaged",
];

/** One top-level function of the page's inline script, as text. */
function pageFunction(name: string): string {
  const start = PAGE.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, `messages.html no longer has function ${name}`);
  return PAGE.slice(start, PAGE.indexOf("\n}\n", start) + 2);
}

/** Lets the promise chain behind a click run to its end. */
async function settle() {
  for (let i = 0; i < 5; i += 1) await new Promise((done) => setImmediate(done));
}

type Job = { file: File; finish: (answer: Shrunk) => void; fail: () => void };
type El = { value: string; disabled: boolean; innerHTML: string; [key: string]: unknown };

/** The composer of an open chat ("chat-x"), a signed-in student, storage that works. */
function openChat(helper: "loaded" | "missing" = "loaded") {
  const els = new Map<string, El>();
  const el = (id: string): El => {
    const made: El = els.get(id) ?? {
      value: "", disabled: false, innerHTML: "", style: {}, scrollTop: 0, scrollHeight: 0,
      classList: { add: () => undefined, remove: () => undefined },
    };
    els.set(id, made);
    return made;
  };
  const chat = {
    /** Every request the page made: the address and the JSON it sent. */
    asks: [] as Array<{ url: string; body: unknown }>,
    /** Every upload: the address, its Content-Type header and the bytes. */
    puts: [] as Array<{ url: string; contentType: string | undefined; body: unknown }>,
    alerts: [] as string[],
    /** Every quiet line shown at the foot of the page. */
    toasts: [] as string[],
    /** The shrink jobs the page started. */
    jobs: [] as Job[],
    /** What the upload route answers. */
    sign: { ok: true, uploadUrl: "https://storage.example/put", objectKey: "messages/1.jpg", kind: "image" } as object,
    /** true = an upload waits until `landUpload()` is called. */
    holdUpload: false,
    landUpload: null as null | (() => void),
  };
  class FakeXhr {
    status = 200;
    upload = {};
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    url = "";
    headers: Record<string, string> = {};
    open(_method: string, url: string) {
      this.url = url;
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    send(body: unknown) {
      chat.puts.push({ url: this.url, contentType: this.headers["Content-Type"], body });
      const land = () => this.onload?.();
      if (chat.holdUpload) chat.landUpload = land;
      else queueMicrotask(land);
    }
  }
  const fetch = (url: string, init?: { body?: string }) => {
    chat.asks.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    return Promise.resolve({ ok: true, json: async () => (url === SIGN_URL ? chat.sign : { ok: true }) });
  };
  const shrinker = {
    shouldShrinkPhoto: (load(SCRIPT).__vibeShrinkPhoto as CopyApi).shouldShrinkPhoto,
    shrinkPhoto: (file: File) =>
      new Promise<Shrunk>((finish, reject) => chat.jobs.push({ file, finish, fail: () => reject(new Error("boom")) })),
  };
  const nothing = () => undefined;
  const sandbox: Record<string, unknown> = {
    window: {
      vibeToast: (line: string) => void chat.toasts.push(line),
      __vibeShrinkPhoto: helper === "loaded" ? shrinker : undefined,
    },
    document: { getElementById: el },
    location: { hostname: "www.connectvibe.app" },
    console: { error: nothing, debug: nothing },
    alert: (line: string) => void chat.alerts.push(line),
    URL: { createObjectURL: () => "blob:preview", revokeObjectURL: nothing },
    fetch,
    XMLHttpRequest: FakeXhr,
    __realDM: { enabled: true, stagedMedia: null, T: {}, replyTo: null, lastTypingPing: 0, TYPING_PING_MS: 3000 },
    active: "chat-x",
    IS_PANE: false,
    __dmLoadMessages: async () => undefined,
    __dmLoadList: nothing,
    __paneSay: nothing,
    __panePinsPaint: nothing,
    __dmRenderReplyPill: nothing,
    __dmPaintComposer: nothing,
    __dmChatRefusalLine: () => "",
    __dmEsc: (text: unknown) => String(text),
  };
  runInNewContext(PAGE_FUNCTIONS.map(pageFunction).join("\n"), sandbox);
  const page = sandbox as unknown as {
    snd(): void;
    upd(): void;
    __dmComposeMediaChosen(ev: object): void;
    __dmComposeMediaClear(): void;
    __realDM: { stagedMedia: { file: File } | null };
  };
  return Object.assign(chat, {
    /** Typing into the box runs upd(), as its oninput does on the page. */
    type: (text: string) => {
      el("msgIn").value = text;
      page.upd();
    },
    text: () => el("msgIn").value,
    pick: (file: File) => page.__dmComposeMediaChosen({ target: { files: [file], value: "picked" } }),
    takeBack: () => page.__dmComposeMediaClear(),
    pressSend: async () => {
      page.snd();
      await settle();
    },
    goTo: (chatId: string) => void (sandbox.active = chatId),
    staged: () => page.__realDM.stagedMedia?.file ?? null,
    chip: () => el("compStaged").innerHTML,
    sendIsLive: () => !el("sndBtn").disabled,
    signs: () => chat.asks.filter((ask) => ask.url === SIGN_URL),
    messages: () => chat.asks.filter((ask) => /\/threads\/[^/]+\/messages$/.test(ask.url)),
    /** The words of every message sent, in order ("" is a photo or video alone). */
    sentTexts: () =>
      chat.asks
        .filter((ask) => /\/threads\/[^/]+\/messages$/.test(ask.url))
        .map((ask) => (ask.body as { content: string }).content),
  });
}
type Chat = ReturnType<typeof openChat>;

const photo = (bytes: number, name = "IMG_0042.PNG", type = "image/png") =>
  new File([new Uint8Array(bytes)], name, { type });
const JPEG = rules.SHRUNK_CONTENT_TYPE;
const smallerCopy = (bytes = 400_000) => ({
  file: new File([new Uint8Array(bytes)], "IMG_0042.jpg", { type: JPEG }),
  contentType: JPEG,
});

/** Exactly one upload went out, and what was declared, the header and the bytes are one file's. */
function wentUpOnce(chat: Chat, file: File, contentType: string, chatId = "chat-x") {
  assert.deepEqual(chat.alerts, []);
  assert.deepEqual(chat.signs().map((ask) => ask.body), [{ channelId: chatId, contentType, sizeBytes: file.size }]);
  assert.equal(chat.puts.length, 1);
  assert.equal(chat.puts[0].body, file, "the bytes sent are the declared file's");
  assert.equal(chat.puts[0].contentType, contentType, "the upload's Content-Type is the declared type");
  assert.deepEqual(chat.messages().map((ask) => ask.url), [`/api/me/threads/${chatId}/messages`]);
}
const nothingWentUp = (chat: Chat) =>
  assert.deepEqual([chat.signs().length, chat.puts.length, chat.messages().length, chat.alerts.length], [0, 0, 0, 0]);

test("messages.html loads the copy once, deferred", () => {
  assert.deepEqual(PAGE.match(/<script[^>]*_shrinkPhoto\.js[^>]*>/g), ['<script src="/html/_shrinkPhoto.js" defer>']);
});

test("the page: a small photo, a GIF and a video go up as picked, with nothing to wait for", async () => {
  const picks = [
    photo(300 * 1024, "small.jpg", "image/jpeg"),
    photo(5 * MB, "party.gif", "image/gif"),
    photo(5 * MB, "clip.mp4", "video/mp4"),
  ];
  for (const file of picks) {
    const chat = openChat();
    chat.pick(file);
    assert.equal(chat.jobs.length, 0, file.name);
    await chat.pressSend();
    wentUpOnce(chat, file, file.type);
  }
});

test("the page: a big photo goes up as its smaller copy, and the size, type, header and bytes are all the copy's", async () => {
  const chat = openChat();
  const original = photo(3 * MB);
  chat.pick(original);
  assert.deepEqual(chat.jobs.map((job) => job.file), [original]);
  assert.match(chat.chip(), /3\D?072 KB/);
  const smaller = smallerCopy(400_000);
  chat.jobs[0].finish(smaller);
  await settle();
  // The chip now shows the size that will really be sent.
  assert.match(chat.chip(), /· 391 KB/);
  await chat.pressSend();
  // A PNG was picked. A JPEG is declared, named in the header and sent.
  wentUpOnce(chat, smaller.file, JPEG);
  assert.equal(chat.staged(), null);
  assert.equal(chat.sendIsLive(), false, "nothing is left to send");
});

test("the page: Send pressed while the copy is still being made waits for it, and a second Enter does not send twice", async () => {
  const chat = openChat();
  chat.pick(photo(3 * MB));
  await chat.pressSend();
  nothingWentUp(chat);
  assert.equal(chat.sendIsLive(), false);
  await chat.pressSend();
  nothingWentUp(chat);
  // The second Enter is answered with a quiet line, not with silence.
  assert.deepEqual(chat.toasts, ["Still sending your photo."]);
  const smaller = smallerCopy();
  chat.jobs[0].finish(smaller);
  await settle();
  wentUpOnce(chat, smaller.file, JPEG);
});

test("the page: a shrink that fails or does not help sends the original, exactly as before", async () => {
  const endings: Array<(job: Job) => void> = [(job) => job.finish(null), (job) => job.fail()];
  for (const end of endings) {
    for (const sendFirst of [false, true]) {
      const chat = openChat();
      const original = photo(3 * MB);
      chat.pick(original);
      if (sendFirst) await chat.pressSend();
      end(chat.jobs[0]);
      await settle();
      if (!sendFirst) {
        assert.match(chat.chip(), /3\D?072 KB/);
        await chat.pressSend();
      }
      wentUpOnce(chat, original, "image/png");
    }
  }
  // The helper script never loaded: no job at all, the original goes up.
  const chat = openChat("missing");
  const original = photo(3 * MB);
  chat.pick(original);
  await chat.pressSend();
  wentUpOnce(chat, original, "image/png");
});

test("the page: taking the photo back while Send waits sends nothing and keeps the text", async () => {
  const chat = openChat();
  chat.type("look at this");
  chat.pick(photo(3 * MB));
  await chat.pressSend();
  chat.takeBack();
  chat.jobs[0].finish(smallerCopy());
  await settle();
  nothingWentUp(chat);
  assert.equal(chat.text(), "look at this");
  assert.equal(chat.sendIsLive(), true, "the text can still be sent");
  // With no text either, there is nothing to send and Send says so.
  const bare = openChat();
  bare.pick(photo(3 * MB));
  await bare.pressSend();
  bare.takeBack();
  bare.jobs[0].finish(smallerCopy());
  await settle();
  nothingWentUp(bare);
  assert.equal(bare.sendIsLive(), false);
});

test("the page: picking another photo while Send waits sends nothing, and Send then answers for the new one", async () => {
  const chat = openChat();
  chat.pick(photo(3 * MB, "first.png"));
  await chat.pressSend();
  const second = photo(200 * 1024, "second.jpg", "image/jpeg");
  chat.pick(second);
  // The first photo's copy arrives late. It changes nothing on the new chip.
  chat.jobs[0].finish(smallerCopy());
  await settle();
  nothingWentUp(chat);
  assert.equal(chat.staged(), second);
  assert.match(chat.chip(), /second\.jpg/);
  assert.match(chat.chip(), /· 200 KB/);
  assert.equal(chat.sendIsLive(), true, "Send is not left dead");
  await chat.pressSend();
  wentUpOnce(chat, second, "image/jpeg");
});

test("the page: the photo goes to the chat Send was pressed in, whichever chat is open when the copy is ready", async () => {
  // Pressed in chat-x, then moved on while the copy was being made.
  const moved = openChat();
  moved.pick(photo(3 * MB));
  await moved.pressSend();
  moved.goTo("chat-y");
  const smaller = smallerCopy();
  moved.jobs[0].finish(smaller);
  await settle();
  wentUpOnce(moved, smaller.file, JPEG, "chat-x");
  // Picked in chat-x, carried to chat-y, pressed there.
  const carried = openChat();
  carried.pick(photo(3 * MB));
  carried.goTo("chat-y");
  await carried.pressSend();
  const copy = smallerCopy();
  carried.jobs[0].finish(copy);
  await settle();
  wentUpOnce(carried, copy.file, JPEG, "chat-y");
});

test("the page: a refused upload keeps the photo staged and Send live, and the next try goes through", async () => {
  const chat = openChat();
  const original = photo(300 * 1024, "small.jpg", "image/jpeg");
  chat.pick(original);
  const working = chat.sign;
  chat.sign = { ok: false, error: "Media storage not configured" };
  await chat.pressSend();
  assert.deepEqual(chat.alerts, ["Could not send: Media storage not configured"]);
  assert.equal(chat.staged(), original);
  assert.equal(chat.sendIsLive(), true, "Send is not left dead");
  chat.sign = working;
  chat.alerts.length = 0;
  chat.asks.length = 0;
  await chat.pressSend();
  wentUpOnce(chat, original, "image/jpeg");
});

test("the page: a photo picked while another is going up stays staged, with a live Send", async () => {
  const chat = openChat();
  const first = photo(300 * 1024, "first.jpg", "image/jpeg");
  chat.pick(first);
  chat.holdUpload = true;
  await chat.pressSend();
  const second = photo(200 * 1024, "second.jpg", "image/jpeg");
  chat.pick(second);
  chat.landUpload?.();
  await settle();
  wentUpOnce(chat, first, "image/jpeg");
  assert.equal(chat.staged(), second);
  assert.equal(chat.sendIsLive(), true);
});

test("the page: words typed while a photo is going up are not erased, and go out with the next Send", async () => {
  const chat = openChat();
  const first = photo(300 * 1024, "first.jpg", "image/jpeg");
  chat.pick(first);
  chat.holdUpload = true;
  await chat.pressSend();
  chat.type("more text");
  await chat.pressSend();
  // That Enter sends nothing (the photo would go up twice) and says why.
  assert.deepEqual(chat.toasts, ["Still sending your photo."]);
  assert.equal(chat.puts.length, 1);
  assert.equal(chat.sendIsLive(), true);
  chat.landUpload?.();
  await settle();
  wentUpOnce(chat, first, "image/jpeg");
  assert.deepEqual(chat.sentTexts(), [""]);
  assert.equal(chat.text(), "more text", "the box still holds what was never sent");
  assert.equal(chat.sendIsLive(), true, "and Send answers for it");
  await chat.pressSend();
  assert.deepEqual(chat.sentTexts(), ["", "more text"]);
  assert.equal(chat.puts.length, 1, "the photo did not go up again");
  assert.equal(chat.text(), "");
  assert.equal(chat.sendIsLive(), false);

  // Words sent WITH the photo and left alone do leave the box.
  const together = openChat();
  together.type("look at this");
  together.pick(first);
  await together.pressSend();
  wentUpOnce(together, first, "image/jpeg");
  assert.deepEqual(together.sentTexts(), ["look at this"]);
  assert.equal(together.text(), "");
  assert.equal(together.sendIsLive(), false);

  // Words added to them while it went up stay, all of them.
  const added = openChat();
  added.type("look at this");
  added.pick(first);
  added.holdUpload = true;
  await added.pressSend();
  added.type("look at this, and this");
  added.landUpload?.();
  await settle();
  assert.deepEqual(added.sentTexts(), ["look at this"]);
  assert.equal(added.text(), "look at this, and this");
  assert.equal(added.sendIsLive(), true);
});

test("the page: words typed in another chat while a video is going up stay, and go to that chat", async () => {
  const chat = openChat();
  const clip = photo(5 * MB, "clip.mp4", "video/mp4");
  chat.pick(clip);
  chat.holdUpload = true;
  await chat.pressSend();
  chat.goTo("chat-y");
  chat.type("hi y");
  await chat.pressSend();
  assert.deepEqual(chat.toasts, ["Still sending your video."]);
  chat.landUpload?.();
  await settle();
  // The video went to the chat Send was pressed in, once, with no words.
  wentUpOnce(chat, clip, "video/mp4", "chat-x");
  assert.deepEqual(chat.sentTexts(), [""]);
  assert.equal(chat.text(), "hi y");
  assert.equal(chat.sendIsLive(), true);
  await chat.pressSend();
  assert.deepEqual(chat.messages().map((ask) => ask.url), ["/api/me/threads/chat-x/messages", "/api/me/threads/chat-y/messages"]);
  assert.deepEqual(chat.sentTexts(), ["", "hi y"]);
  assert.equal(chat.puts.length, 1);
  assert.equal(chat.text(), "");
});
