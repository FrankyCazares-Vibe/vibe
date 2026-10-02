#!/usr/bin/env node
// Record the 30-second demo and cut it. LOCAL dev server and LOCAL database only.
//
//   node scripts/demo-video/record.mjs
//
// Before: node scripts/demo-seed.mjs (the same day, before 9:30 pm) and the demo dev server on :3102.
// What it does, in order: checks the server and the practice data; remembers the data; opens every screen
// once off camera (a first visit compiles on the dev server); films the three reels (storyboard.mjs);
// puts the practice data back and proves it; writes take.json; runs cut.sh.
// Output goes OUTSIDE the repo (the films show Franky's own pictures and the repo is public):
//   ~/vibe-demo-video/take/           the lossless reels and take.json (filmed into take.new/; it becomes take/
//                                     only once the take is good, and the take before it is kept as take.prev/)
//   ~/vibe-demo-video/vibe-demo-30s-master.mp4, vibe-demo-30s-1080x1920.mp4 (cut.sh swaps them in whole)
// Env: DEMO_BASE (the dev server; localhost only), DEMO_OUT (another output folder, outside the repo),
// DEMO_CUT=0 (film only, no cut).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/Users/franciscocazares/.claude/skills/gstack/node_modules/playwright-core/index.mjs";
import { BASE, SIZE, TakeError, cookieFor, guardWrites, signIns, start } from "./capture.mjs";
import { ids, preflight, restore, rows, signOut, snapshot } from "./data.mjs";
import { FADE_MS, LINE, campus, close, messages, open } from "./storyboard.mjs";

/** Where a path really is: relative paths resolved, symlinks followed as far as the path exists, in the disk's own spelling. */
function real(path) {
  const full = resolve(path);
  if (existsSync(full)) return realpathSync.native(full);
  const up = dirname(full);
  return up === full ? full : join(real(up), basename(full));
}
const REPO = real(fileURLToPath(new URL("../../", import.meta.url)));
const OUT = real(process.env.DEMO_OUT ?? join(homedir(), "vibe-demo-video"));
const DIR = join(OUT, "take"), NEW = join(OUT, "take.new"), PREV = join(OUT, "take.prev");
const FADE = FADE_MS / 1000; // seconds, at each of the two joins (cut.sh reads it from take.json)
const WHOLE_TAKE_MS = 15 * 60 * 1000;
const say = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
// The films show Franky's own pictures and the repo is public: the output folder must be outside it, also
// when DEMO_OUT is a relative path, a symlink, or the repo's path in other letter case (this Mac's disk does
// not tell "VIBE" from "vibe"). Two tests: the paths, compared in lower case, and git itself, asked about the
// nearest folder that exists (any git work tree is refused, not only this one).
const lower = (x) => x.toLowerCase();
let near = OUT;
while (!existsSync(near)) near = dirname(near);
let inGit = false;
try { inGit = execFileSync("git", ["-C", near, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "true"; } catch {}
if (lower(OUT) === lower(REPO) || lower(OUT).startsWith(lower(REPO + sep)) || lower(REPO).startsWith(lower(OUT + sep)) || inGit) {
  console.error(`refusing: the output folder (${OUT}) is inside a git work tree or the repo, or holds the repo`);
  process.exit(2);
}

// 1. Is everything there?
try {
  const res = await fetch(BASE + "/", { signal: AbortSignal.timeout(20000) });
  if (res.status !== 200) throw new Error(`it answered ${res.status}`);
} catch (e) {
  console.error(`The demo dev server at ${BASE} does not answer (${e.message}). Start it, then run this again.`);
  process.exit(2);
}
const problems = preflight(LINE);
if (problems.length) { console.error("Not ready to film:\n- " + problems.join("\n- ")); process.exit(2); }
// Not a stop, a note: once Blitz Night has started (the Messages part is filmed about three minutes in), the
// Messages home and the Lounge say "Live now" where they said "7 PM", while the posts and the chat still say
// "tonight at 7". Film before about 6:55 pm for the "7 PM" version.
if (rows(`select 1 from public.events where title = 'Blitz Night' and now() + interval '4 minutes' >= starts_at`).length) {
  console.error('note: Blitz Night will have started when Messages is filmed, so the Messages home and the Lounge will say "Live now" instead of "7 PM". Film before about 6:55 pm (Indianapolis) for the "7 PM" version.');
}

rmSync(NEW, { recursive: true, force: true }); // a take that failed before; the last good one stays in take/
mkdirSync(NEW, { recursive: true });
const chats = ids();
const before = snapshot();
say("practice data remembered");

/** Off camera, in an ordinary browser: open every screen once so nothing compiles during the take. */
async function warm() {
  const browser = await chromium.launch();
  const refused = { allowed: [], refused: [] };
  for (const who of [null, "franky"]) {
    const context = await browser.newContext({ viewport: SIZE, isMobile: true, hasTouch: true, colorScheme: "dark" });
    if (who) await context.addCookies(cookieFor(who));
    await guardWrites(context, refused, []);
    const page = await context.newPage();
    const visits = who
      ? [["/campus", "Blitz Night is tonight"], ["/profile/rylanconaway", "Rylan Conaway"], ["/orgs/sae", "Return to Organizations"], ["/messages", "Your week"],
        [`/messages?channel=${chats.lounge}`, "See you all at 7"], [`/messages?channel=${chats.dm}`, "nice, let's get food"], ["/profile", "Franky Cazares"]]
      : [["/", "vibe"]];
    for (const [path, words] of visits) {
      const t = Date.now();
      await page.goto(BASE + path, { waitUntil: "load", timeout: 120000 });
      await page.getByText(words).first().waitFor({ state: "attached", timeout: 120000 });
      await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
      say(`  warm ${path.replace(/[0-9a-f-]{36}/, "<id>")} ${((Date.now() - t) / 1000).toFixed(1)} s`);
    }
    if (who) { // the route the story POSTs to, called from here (not from the page): an empty body compiles it and is refused
      const cookie = cookieFor(who).map((c) => `${c.name}=${c.value}`).join("; ");
      const res = await fetch(`${BASE}/api/me/threads/${chats.dm}/messages`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });
      if (res.status < 400) throw new TakeError(`warming the send route was meant to be refused, but it answered ${res.status}`);
    }
    await context.close();
  }
  await browser.close();
}

// What made this film: the repo's commit and a fingerprint of every script, read before filming (the scripts are
// edited between takes and may be uncommitted, so the commit alone does not say).
const git = (...a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8" }).trim();
const source = {
  head: git("rev-parse", "HEAD"),
  uncommitted: git("status", "--porcelain", "--", "scripts/demo-seed.mjs", "scripts/demo-video").split("\n").filter(Boolean),
  sha256: Object.fromEntries(["../demo-seed.mjs", "storyboard.mjs", "capture.mjs", "shim.mjs", "moves.mjs", "data.mjs", "record.mjs", "cut.sh"]
    .map((f) => [f.replace("../", ""), createHash("sha256").update(readFileSync(new URL(f, import.meta.url))).digest("hex")])),
};

let take = null, result = null, failed = null, stopping = false;
/**
 * Stop at once (Ctrl-C, a kill, the watchdog): the browser is killed first, so nothing it had queued can be sent
 * after the clean-up; then the practice data is put back, and looked at once more 1.5 s later, in case a line
 * already on its way to the server landed after the first look.
 */
function stopNow(why, code) {
  if (stopping) return;
  stopping = true;
  console.error(why);
  // Playwright runs the browser, and capture.mjs its ffmpegs, as children of this process: kill all of them.
  try { execFileSync("pkill", ["-KILL", "-P", String(process.pid)]); } catch {}
  cleanUp();
  setTimeout(() => { cleanUp(); process.exit(code); }, 1500);
}
const alarm = setTimeout(() => stopNow(`watchdog: the whole take is still running after ${WHOLE_TAKE_MS / 60000} minutes; stopping. Was doing: ${take?.now}`, 3), WHOLE_TAKE_MS);
// (A Mac that sleeps, or kill -9, cannot be caught: the next run's check finds the line and the markers and sends
// you to the seed.)
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => stopNow(`\nstopped (${signal}) while: ${take?.now ?? "getting ready"}`, 130));

function cleanUp() {
  try {
    const done = restore(before, LINE);
    done.signInsClosed = signOut(signIns);
    say("practice data put back:", JSON.stringify(done));
    if (done.stillDifferent.length) console.error(`WARNING: these tables are not as they were before the take: ${done.stillDifferent.join(", ")}. If nothing else was using the local database, run node scripts/demo-seed.mjs again.`);
    return done;
  } catch (e) {
    console.error("CLEAN-UP FAILED. The take's line may still be in Franky's thread with James, and his read markers moved. Run node scripts/demo-seed.mjs again.\n" + e.message);
    return null;
  }
}

try {
  say("warming the screens");
  await warm();
  take = await start({ dir: NEW, scale: 3, fps: 60 });
  say("filming: the landing page");
  await open(take);
  say("filming: the app");
  const s = await campus(take, chats);
  await messages(take, s);
  say("filming: the close");
  await close(take);
  result = await take.finish();
} catch (e) {
  failed = e;
  if (!stopping) await take?.abort();
}
if (stopping) await new Promise(() => {}); // stopNow() finishes the run
clearTimeout(alarm);
const cleaned = cleanUp();
if (failed) {
  console.error(`\nTHE TAKE FAILED${take ? ` while: ${take.now}` : ""}\n${failed instanceof TakeError ? failed.message : failed.stack}\n(The last good take is still in ${DIR}; this one's frames are in ${NEW}.)`);
  process.exit(1);
}

// The timeline: where each part starts in the finished film (reel b starts FADE before reel a ends, and so on).
const reel = Object.fromEntries(result.reels.map((r) => [r.name, r]));
const offset = { "a-open": 0, "b-app": reel["a-open"].seconds - FADE, "c-close": reel["a-open"].seconds + reel["b-app"].seconds - 2 * FADE };
const length = +(offset["c-close"] + reel["c-close"].seconds).toFixed(3);
const starts = result.marks.map((m) => ({ part: m.name, start: +(offset[m.reel] + m.frame / result.fps).toFixed(2) }));
const timeline = starts.map((m, i) => ({ ...m, end: i + 1 < starts.length ? starts[i + 1].start : length }));
say(`filmed ${length} s in ${result.wallSeconds} s (${result.screenshotMsAvg} ms a frame; ${result.repeatsLeftOut} repeats left out of the scrolls)`);
for (const t of timeline) console.log(`  ${String(t.start.toFixed(2)).padStart(6)} - ${String(t.end.toFixed(2)).padStart(6)}  ${t.part}`);
if (result.retries.length) console.log("  taps tried twice:", JSON.stringify(result.retries));
console.log("  writes let through:", JSON.stringify([...new Set(result.writesAllowed.map((w) => w.replace(/[0-9a-f-]{36}/g, "<id>")))]));
console.log("  writes refused:", JSON.stringify([...new Set(result.writesRefused.map((w) => w.replace(/[0-9a-f-]{36}/g, "<id>")))]));
if (length > 30) { console.error(`The film is ${length} s, over 30: shorten a beat in storyboard.mjs (T). (Its frames are in ${NEW}.)`); process.exit(1); }

// A good take: it becomes take/, and the one before it take.prev/ (so its films can still be cut again).
for (const r of result.reels) r.file = join(DIR, basename(r.file));
writeFileSync(`${NEW}/take.json`, JSON.stringify({ filmedAt: new Date().toISOString(), length, fade: FADE, timeline, cleanUp: cleaned, source, ...result }, null, 1));
rmSync(PREV, { recursive: true, force: true });
if (existsSync(DIR)) renameSync(DIR, PREV);
renameSync(NEW, DIR);
if (process.env.DEMO_CUT !== "0") execFileSync(new URL("./cut.sh", import.meta.url).pathname, [], { stdio: "inherit", env: { ...process.env, DEMO_OUT: OUT } });
