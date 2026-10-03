// moves.mjs — what a hand does on the phone, on top of a capture.mjs session: tap, scroll, type.
// Every move checks itself and fails the take with a plain sentence when it did not work.
//
//   const m = moves(session);
//   await m.tap(target, { what, expect })            a tap that stays on the screen (a chip, a field, Send)
//   await m.tap(target, { what, expect, cut: true }) a tap that changes the screen: recording STOPS at the
//                                                    touch; settle the new screen, then session.record(true)
//   await m.glide(dy, ms)                            eased scroll of whatever scrolls under the point
//   await m.type(text, field, { delay })             type into the focused field, key by key
//   await m.preload(dy)                              off camera: scroll down and back so pictures are in
//   await m.onScreen(locator, [top, bottom])         the match that is inside the visible band
import { SIZE, TakeError } from "./capture.mjs";

export function moves(session) {
  const { page, cdp, take } = session;

  /** The first match of a locator whose whole box is inside the viewport, between y = top and y = bottom. */
  async function onScreen(locator, [top, bottom] = [0, SIZE.height]) {
    const count = await locator.count();
    for (let i = 0; i < count; i++) {
      const b = await locator.nth(i).boundingBox();
      if (b && b.x >= 0 && b.x + b.width <= SIZE.width + 1 && b.y >= top && b.y + b.height <= bottom + 1) return locator.nth(i);
    }
    throw new TakeError(`nothing on screen to act on (${take.now})`);
  }

  async function centre(target) {
    const box = await target.boundingBox();
    if (!box) throw new TakeError(`nothing to tap (${take.now})`);
    const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
    if (x < 0 || x > SIZE.width || y < 0 || y > SIZE.height) throw new TakeError(`the thing to tap is off screen at (${x}, ${y}) (${take.now})`);
    return { x, y };
  }

  /**
   * Tap like a finger. The dot shows for `lead` ms (330: it fades in over 8 frames and then stays at full strength
   * for about 12, long enough to be seen on a phone before a cut), then touch-down and touch-up are sent one straight after
   * the other with NO frame between them (a frame in between made taps miss under load). Then two checks:
   *   1. the click reached the thing aimed at. If it did not, the tap is tried ONCE more, and the frames of
   *      the miss (its dot) are thrown away, so the film never shows it;
   *   2. `expect()` comes true: within `within` frames for a tap that stays on the screen, or off the record
   *      for a `cut` (a route change takes its time on the dev server; none of it is filmed).
   * target = a locator, or a function returning one (it is asked again for the second try).
   */
  async function tap(target, { what, expect, lead = 330, within = 24, cut = false } = {}) {
    if (!what || !expect) throw new Error("tap: say what is tapped and what should follow");
    for (let attempt = 1; ; attempt++) {
      take.now = `tapping ${what}`;
      const aim = typeof target === "function" ? await target() : target;
      const { x, y } = await centre(aim);
      const was = session.recording;
      session.begin();
      await aim.evaluate((el, [a, b]) => { window.__demoWant = el; window.__demoClick = null; window.__demoDot(a, b); }, [x, y]);
      await session.hold(lead);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      if (cut) session.record(false);
      else await page.evaluate(() => window.__demoLift());
      await session.until(() => page.evaluate(() => window.__demoClick !== null), { max: 8 });
      if (await page.evaluate(() => window.__demoClick === true).catch(() => false)) {
        take.now = `waiting for what follows the tap on ${what}`;
        if (!(await session.until(expect, { max: cut ? 1200 : within }))) throw new TakeError(`the tap on ${what} landed, but what should follow never came (${page.url()})`);
        await session.keep();
        if (cut) await page.evaluate(() => window.__demoClear()).catch(() => {});
        return { x, y, attempt };
      }
      const dropped = session.drop();
      await page.evaluate(() => window.__demoClear()).catch(() => {});
      take.retries.push({ what, attempt, droppedFrames: dropped });
      if (attempt >= 2) throw new TakeError(`the tap on ${what} missed, twice (${page.url()})`);
      if (cut && was) session.record(true);
    }
  }

  /** Eased scroll by dy CSS px over exactly ms of film, of whatever scrolls under the point `at` (else the page). */
  async function glide(dy, ms = 1500, at = [195, 500]) {
    take.now = `scrolling ${dy} px`;
    const from = await page.evaluate(([dy, ms, x, y]) => {
      let el = document.elementFromPoint(x, y);
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4) break;
        el = el.parentElement;
      }
      const target = el && el !== document.body ? el : document.scrollingElement;
      window.__vtGlide = target;
      window.__vt.scroll(target, null, target.scrollTop + dy, ms, window.__vt.ease.quad); // not awaited: Node steps the frames
      return target.scrollTop;
    }, [dy, ms, at[0], at[1]]);
    const first = take.frames, leftOut = take.skipped;
    // The eased ends move under a third of a pixel: those frames repeat the picture before them and are not kept.
    session.inMotion(true);
    try { await session.hold(ms + 34); } finally { session.inMotion(false); } // two frames more: the scroll lands on the frame after its last tick
    const to = await page.evaluate(() => window.__vtGlide.scrollTop);
    if (Math.abs(to - from - dy) > 2) throw new TakeError(`the scroll went ${Math.round(to - from)} px, not ${dy} (${page.url()})`);
    // Dead frames: a scroll on film must show a new picture every frame. More than a few repeats means it stood still.
    const repeats = take.skipped - leftOut;
    if (session.recording && repeats > 8) throw new TakeError(`dead frames: ${repeats} of ${session.frames(ms)} pictures did not change during the scroll (${page.url()})`);
    return { from, to, frames: take.frames - first };
  }

  /** Off camera: go down dy and back, so every picture the scroll will pass is fetched and drawn once. */
  async function preload(dy, at = [195, 500]) {
    if (session.recording) throw new Error("preload is for off camera");
    take.now = "preloading pictures";
    const jump = (d) => page.evaluate(([d, x, y]) => {
      let el = document.elementFromPoint(x, y);
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4) break;
        el = el.parentElement;
      }
      const target = el && el !== document.body ? el : document.scrollingElement;
      target.scrollTop += d;
      return target.scrollTop;
    }, [d, at[0], at[1]]);
    const start = await jump(0);
    for (let done = 0; Math.abs(done) < Math.abs(dy); done += Math.sign(dy) * 400) {
      await jump(Math.sign(dy) * 400);
      await session.settle("pictures on the way down", null, { quiet: 4 });
    }
    const back = (await jump(0)) - start;
    await jump(-back);
    await session.settle("back where the scroll starts", null, { quiet: 6 });
    return start;
  }

  /** Type into `field` (already focused by a tap), one key per `delay` ms of film, and check what it holds. */
  async function type(text, field, { delay = 34 } = {}) {
    take.now = `typing "${text}"`;
    for (const ch of text) {
      await page.keyboard.type(ch);
      await session.hold(delay);
    }
    const holds = await field.inputValue();
    if (holds !== text) throw new TakeError(`the field holds "${holds}", not "${text}"`);
  }

  return { tap, glide, preload, type, onScreen };
}
