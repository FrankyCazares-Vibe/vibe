// storyboard.mjs — the film, shot by shot. This is the file to edit to change what the demo shows.
//
// Three reels: the landing page's hero (signed out), the app as Franky, the landing page's closing wordmark.
// cut.sh joins them with a short fade at each join; every other change inside the app reel is a hard cut,
// made here: a tap with `cut: true` stops the recording at the touch, the new screen is settled off the
// record, and s.record(true) starts the film again on it.
//
// Every wait says which screen it means with a positive test (its real words on screen), so a loading
// skeleton can never be taken for the screen. Times are film milliseconds.
import { moves } from "./moves.mjs";
import { TakeError } from "./capture.mjs";

/** The line Franky types to James. */
export const LINE = "hey are you going to blitz night tonight?";

/** The dip to black at each of the two joins (record.mjs and cut.sh read it from take.json). */
export const FADE_MS = 250;

/**
 * How long each beat lasts. The whole film is the sum of these minus the two fades (see record.mjs's timeline).
 * Every tap adds the finger dot's 330 ms lead (moves.mjs) to the beat it ends, so the hold before a tap is that
 * much shorter than what is seen.
 */
export const T = {
  openAt: 950, // the sky's own clock when the film starts (shim.mjs): two lights coming up, four to follow
  open: 1850, // the hero; the last label is lit 1500 ms in, before the dip to black into the feed
  feed: { hold: 800, scroll: 1900, rest: 390 },
  visit: { hold: 1250, scroll: 1300, rest: 290 }, // Rylan's profile
  events: { before: 290, hold: 2000 },
  orgs: { list: 1490, page: 690, scroll: 900, rest: 450 }, // a beat on SAE's page after its scroll
  // homeAgain and homeAfter: with the tap's 330 ms they are on screen about 0.7 and 0.9 s, long enough to read
  // James's row coming to the top with the line just sent.
  messages: { home: 1080, lounge: 860, scroll: 900, poll: 580, homeAgain: 350, dm: 240, typed: 90, sent: 940, homeAfter: 550 },
  own: { hold: 800, scroll: 1650, rest: 780 },
  close: 1850, // the wordmark (the first 250 ms come up from black)
  key: 50, // per typed character: three frames, about twenty characters a second
};

/** The only writes the page may make: the story's own. `ids` comes from data.mjs. */
export const allow = (ids) => [
  new RegExp(`^POST /api/me/threads/${ids.dm}/messages$`), // the line Franky sends James
  /^POST \/api\/me\/threads\/[0-9a-f-]{36}\/read$/, // the app's read markers (put back after the take)
];

/** Reel a: the landing page from its first frame. */
export async function open(take) {
  const s = await take.session();
  await s.goto("/"); // once off camera, so the fonts are in the browser's cache
  await s.settle("the landing page (warming its fonts)", () => s.page.locator("canvas.vln-sky").isVisible());
  await s.goto("/", { until: "paint" });
  if (!(await s.page.evaluate(() => document.fonts.status === "loaded"))) throw new TakeError("the landing page painted before its fonts were in: the headline would jump");
  // The film starts on the sky's own clock, not a fixed time after the first paint: how long the page takes to
  // hydrate after it paints varies from run to run, and the lights are lit on the clock that starts there.
  await s.waitFor(() => s.page.evaluate((at) => window.__vtSkyAt != null && performance.now() - window.__vtSkyAt >= at, T.openAt), "the sky's clock reaching the first frame (off camera)", { max: 900 });
  await s.page.evaluate(() => {
    const sky = performance.now() - window.__vtSkyAt;
    // The six labels fade in on the page's CSS clock, which started at the first paint: put them on the sky's
    // clock too, so they come up after their lights the same way in every take.
    for (const label of document.querySelectorAll(".vln-light-label")) for (const a of label.getAnimations()) a.currentTime = sky;
    // Film-only: "Tap a light to see what's out there." asks for a tap nobody watching a video can make.
    document.querySelector(".vln-hint").style.visibility = "hidden";
  });
  await take.reel("a-open");
  s.record(true);
  take.mark("0 open: the landing page");
  await s.hold(T.open - FADE_MS);
  // Every light and every label must be fully lit before the dip to black starts.
  const lit = await s.page.evaluate(() => ({ sky: Math.round(performance.now() - window.__vtSkyAt), labels: [...document.querySelectorAll(".vln-light-label")].map((l) => +getComputedStyle(l).opacity) }));
  if (lit.sky < 1900 || lit.labels.length !== 6 || lit.labels.some((o) => o < 0.99)) throw new TakeError(`the hero is not fully lit before its fade (${JSON.stringify(lit)}): T.openAt / T.open, or the landing page changed`);
  await s.hold(FADE_MS);
  s.record(false);
  await s.close();
}

/** Reel c: the landing page's closing wordmark, its orbits turning. */
export async function close(take) {
  const s = await take.session();
  await s.goto("/");
  await s.settle("the landing page", () => s.page.locator(".vln-close .vln-tagline").count().then((n) => n === 1));
  // Film-only: the wordmark's section alone. On the page the end of the "Bring your club." card sits above it and
  // the legal footer under it, and the film would end on "the bottom of a web page". The card is hidden (it keeps
  // its room, so nothing moves), the footer is taken out, and the section is made that much taller so its coral
  // glow, which hangs from the section's bottom edge, reaches the bottom of the phone. The "Sign up" button and
  // the "Log in" line, which nobody can tap in a video, are taken out too (their height goes to the same padding,
  // so the wordmark and the glow stay where they were); the wordmark, the tagline and "IU · PURDUE" stay.
  await s.page.evaluate(() => {
    const end = document.querySelector(".vln-close"), foot = document.querySelector(".vln-footer");
    for (const el of document.querySelectorAll(".vln-doors, .vln-rule")) el.style.visibility = "hidden";
    const tall = end.offsetHeight;
    for (const el of end.querySelectorAll(".vln-btn, .vln-textlink")) el.style.display = "none";
    end.style.paddingBottom = `${parseFloat(getComputedStyle(end).paddingBottom) + foot.offsetHeight + tall - end.offsetHeight}px`;
    foot.style.display = "none";
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  take.now = "the closing wordmark coming in";
  await s.hold(1500); // off camera: the section's own entrance plays out
  const at = await s.page.evaluate(() => {
    const box = (q) => document.querySelector(q).getBoundingClientRect();
    return { mark: [box(".vln-close .vln-wordmark").top, box(".vln-close .vln-wordmark").bottom], section: [box(".vln-close").top, box(".vln-close").bottom], last: box(".vln-close .vln-schools").bottom };
  });
  if (at.mark[0] < 200 || at.mark[1] > 560 || at.section[0] > 300 || at.section[1] < 843 || at.last > 760) throw new TakeError(`the closing wordmark is not framed as an end card (${JSON.stringify(at)}): the landing page changed`);
  await take.reel("c-close");
  s.record(true);
  take.mark("7 close: the wordmark");
  await s.hold(T.close);
  s.record(false);
  await s.close();
}

/**
 * Film-only, on a profile: the round "+" (New post) sat on the first post's "⋯" through the whole header hold.
 * It lives in the app's frame, not in the page, so it is put back (on = true) before the feed is filmed again.
 */
const filmStyle = (p, id, rules, on) => p.evaluate(([id, rules, on]) => {
  let css = document.getElementById(id);
  if (on && !css) { css = document.createElement("style"); css.id = id; css.textContent = rules; document.head.appendChild(css); }
  if (!on && css) css.remove();
}, [id, rules, on]);
const newPost = (p, on) => filmStyle(p, "demo-no-new-post", 'button[aria-label="New post"]{visibility:hidden!important}', !on);
/**
 * Film-only, on a profile that is NOT Franky's (Rylan's): the tab bar lit the Profile tab, which read as Franky's
 * own profile. There no tab is lit. Taken off (on = false) before Franky's own profile, where Profile is lit.
 */
const visiting = (p, on) => filmStyle(p, "demo-visiting", 'nav[aria-label="Primary"] a[href="/profile"].vibe-mobile-tab--active{color:var(--ink-muted)!important}nav[aria-label="Primary"] a[href="/profile"].vibe-mobile-tab--active::before{display:none!important}', on);

/** Reel b, first half: feed, a visit to Rylan's profile, events, orgs. Returns the session for the second half. */
export async function campus(take, ids) {
  const s = await take.session({ who: "franky", allow: allow(ids) });
  const p = s.page, m = moves(s);
  const tab = (href) => p.locator(`nav[aria-label="Primary"] a[href="${href}"]`);
  const chip = (name) => m.onScreen(p.getByRole("button", { name, exact: true }));
  // The campus panes sit side by side in one sideways track; a chip slides the track.
  const slid = (past) => () => p.evaluate((x) => [...document.querySelectorAll(".vibe-no-scrollbar")].find((el) => el.scrollWidth >= el.clientWidth * 2 && el.clientWidth === innerWidth).scrollLeft > x, past);
  // Is this exact text on screen, with its top between y = top and y = bottom?
  const shows = (text, [top, bottom]) => p.evaluate(([text, top, bottom]) => [...document.querySelectorAll("h1,h2,h3,h4,span,div,button,p")].some((el) => {
    if (el.children.length > 0 || el.textContent.trim() !== text) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= top && r.top <= bottom;
  }), [text, top, bottom]);
  // shim.mjs, dressing rule 6: no member, follower or "going" count left in sight.
  const noCounts = async (where) => {
    const left = await p.evaluate(() => [...document.querySelectorAll("span,div,button")].filter((el) => {
      if (el.children.length !== 0) return false;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (r.width === 0 || r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight || cs.visibility === "hidden") return false;
      return /\d+ (members?|followers?|going)\b|(Interested|Going|Maybe) · \d/.test(el.textContent);
    }).map((el) => el.textContent.trim()));
    if (left.length) throw new TakeError(`a count is still on screen on ${where} (${left.join(" | ")}): shim.mjs, dressing rule 6`);
  };
  // The feed is up, all three panes hold their rows, the chips are the four of the new app (no "Chat"), the
  // header's count line is out of the picture (shim.mjs, dressing rule 1), and we are at the top.
  const campusReady = () => p.evaluate(() => {
    const has = (t) => document.body.innerText.includes(t);
    const chips = [...document.querySelectorAll("#otto-mobile-tour-tabs button")].map((b) => b.innerText.trim()).join();
    return chips === "Feed,Events,Orgs,Map" && has("Blitz Night is tonight") && has("Resume Review Night") && !!document.querySelector('a[href="/orgs/sae"]') && !has("active now") && scrollY === 0;
  });
  // Film-only, on /campus:
  //  - the "Report event" buttons on the event cards are hidden (beside "Add to calendar" they keep their room;
  //    alone in a row, the row goes);
  //  - an org's line that wraps ("@tower_floor_3 · By request · 3 members") breaks after the handle, instead of
  //    wherever it falls, which left a "·" dangling at the end of the first line.
  // The Orgs pane is only drawn when its chip is tapped, and /campus is drawn again after every visit, so this is
  // an observer: it dresses whatever is added, before the browser paints it. Each fix is done once (a line that
  // already holds its break is left alone), so the observer's own changes do not set it off again.
  const dressCampus = () => p.evaluate(() => {
    if (window.__demoDressCampus) return;
    const fix = () => {
      for (const b of document.querySelectorAll("button")) {
        if (b.children.length !== 0 || b.textContent.trim() !== "Report event" || b.style.visibility === "hidden") continue;
        b.style.visibility = "hidden";
        // Alone in its row (an event with no "Add to calendar"), the row goes too, so the card has no empty strip.
        if (b.parentElement.children.length === 1) b.parentElement.style.display = "none";
      }
      for (const line of document.querySelectorAll('a[href^="/orgs/"]>div:nth-child(2)>div:nth-child(2)')) {
        if (line.dataset.demoSeen === line.textContent) continue;
        const dot = [...line.childNodes].find((n) => n.nodeType === 3 && n.data.includes(" · "));
        if (dot && !line.textContent.includes("\n")) {
          const range = document.createRange();
          range.selectNodeContents(line);
          if (new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size >= 2) {
            dot.data = dot.data.replace(" · ", "\n");
            line.style.setProperty("white-space", "pre-line", "important"); // over shim.mjs rule 4's "normal !important"
          }
        }
        line.dataset.demoSeen = line.textContent;
      }
    };
    window.__demoDressCampus = new MutationObserver(fix);
    window.__demoDressCampus.observe(document.body, { childList: true, subtree: true, characterData: true });
    fix();
  });

  // 1. The feed: settled, then one scroll past Hana's picture to Rylan's.
  await s.goto("/campus");
  await s.settle("the feed", campusReady);
  await dressCampus();
  const name = p.locator('a[href="/profile/rylanconaway"]:not([aria-hidden])').first();
  // His name ends up 144 px from the top, just under the chips, his picture under it. There the round "+" button
  // sits on the next post's picture; 60 px less and it covers the end of that post's first line.
  const dy = Math.round((await name.boundingBox()).y - 144);
  await m.preload(dy + 500);
  await take.reel("b-app");
  s.record(true);
  take.mark("1 feed");
  await s.hold(T.feed.hold);
  await m.glide(dy, T.feed.scroll);
  await s.hold(T.feed.rest);
  await m.tap(() => m.onScreen(name, [120, 760]), { what: "Rylan's name on his post", cut: true, expect: async () => p.url().endsWith("/profile/rylanconaway") });

  // 2. Rylan's profile: the header, then down to his posts. Back by the Campus tab.
  await s.settle("Rylan's profile", async () => (await p.locator("h1", { hasText: "Rylan Conaway" }).isVisible()) && (await p.getByText("Family dinner at the house.").count()) > 0);
  // Film-only: Rylan is seeded without a major (he is a real person and nobody has given his), and the app then
  // fills the study chip with the campus name, so "IU Bloomington" stood three times in one header. The chip
  // that only repeats the school badge is left out. Give him a major in demo-seed.mjs and this does nothing.
  await p.evaluate(() => {
    const school = [...document.querySelectorAll("span > strong")].find((el) => el.parentElement.textContent.startsWith("🎓"))?.textContent.trim();
    for (const chip of document.querySelectorAll("span")) if (school && chip.children.length === 0 && chip.textContent === `📚${school}`) chip.style.display = "none";
  });
  await newPost(p, false);
  await visiting(p, true);
  if (await p.evaluate(() => { const t = document.querySelector('nav[aria-label="Primary"] a[href="/profile"]'); return t.classList.contains("vibe-mobile-tab--active") && getComputedStyle(t, "::before").display !== "none"; })) throw new TakeError("the Profile tab is still lit on Rylan's profile (storyboard.mjs, visiting)");
  await m.preload(900);
  s.record(true);
  take.mark("2 visiting a profile");
  await s.hold(T.visit.hold);
  await m.glide(520, T.visit.scroll);
  await s.hold(T.visit.rest);
  await m.tap(tab("/campus"), { what: "the Campus tab", cut: true, expect: async () => p.url().endsWith("/campus") });

  // 3. Events: from the top of the feed (the panes share one scroll position), the Events chip, Blitz Night marked Going.
  await s.settle("the feed again", campusReady);
  await newPost(p, true);
  await visiting(p, false);
  await dressCampus();
  s.record(true);
  take.mark("3 events");
  await s.hold(T.events.before);
  await m.tap(() => chip("Events"), { what: "the Events chip", expect: slid(0) });
  await s.hold(T.events.hold);
  if (!(await shows("Blitz Night", [110, 500])) || !(await shows("Going", [110, 600]))) throw new TakeError('the Events pane did not end on "Blitz Night" marked Going');
  await noCounts("the Events pane");

  // 4. Orgs: the list, then SAE's page.
  take.mark("4 orgs");
  await m.tap(() => chip("Orgs"), { what: "the Orgs chip", expect: slid(390) });
  await s.hold(T.orgs.list);
  if (await p.evaluate(() => [...document.querySelectorAll("div")].some((d) => d.children.length === 0 && /^(verified|all clubs)$|\(test\)/i.test(d.textContent.trim())))) throw new TakeError("a test club or the VERIFIED section is in the Orgs list: run the seed again");
  const clipped = await p.evaluate(() => [...document.querySelectorAll('a[href^="/orgs/"]')].filter((a) => a.children.length === 2 && a.getBoundingClientRect().left >= 0 && a.getBoundingClientRect().right <= innerWidth)
    .flatMap((a) => [a.children[1].children[0]?.children[0], a.children[1].children[1]]).filter((el) => el && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent));
  if (clipped.length) throw new TakeError(`cut-off text in the Orgs list (${clipped.join(" | ")}): shim.mjs, dressing rule 4`);
  await noCounts("the Orgs list");
  await m.tap(() => m.onScreen(p.locator('a[href="/orgs/sae"]'), [130, 780]), { what: "SAE in the list", cut: true, expect: async () => p.url().endsWith("/orgs/sae") });
  await s.settle("SAE's page", async () => (await p.getByText("Return to Organizations").first().isVisible()) && (await p.getByText("Letters are up on the lawn").count()) > 0);
  await noCounts("SAE's page");
  await m.preload(700);
  s.record(true);
  await s.hold(T.orgs.page);
  await m.glide(330, T.orgs.scroll);
  await s.hold(T.orgs.rest);
  await m.tap(tab("/messages"), { what: "the Messages tab", cut: true, expect: async () => p.url().endsWith("/messages") });
  return s;
}

/** Reel b, second half: Messages (the home, Chess Club's Lounge, the line to James), then Franky's own profile. */
export async function messages(take, s) {
  const p = s.page, m = moves(s);
  const tab = (href) => p.locator(`nav[aria-label="Primary"] a[href="${href}"]`);
  const chessRow = p.getByRole("button", { name: /^Chess Club,/ });
  const jamesRow = p.getByRole("button", { name: /^James Andres,/ });
  const space = p.getByRole("dialog", { name: "Chess Club", exact: true });
  const dm = p.getByRole("dialog");
  const field = dm.getByPlaceholder("Message…");
  const home = async () => (await p.getByRole("dialog").count()) === 0 && (await p.getByText("Your week", { exact: true }).first().isVisible()) && (await chessRow.isVisible()) && (await jamesRow.isVisible()) && (await tab("/profile").isVisible());

  // 5a. The home: "Your week" and the rows, Chess Club with its "3 new".
  await s.settle("Messages", home);
  if (!/3 new in the Lounge/.test(await chessRow.getAttribute("aria-label"))) throw new TakeError('the Chess Club row does not say "3 new": run the seed again');
  s.record(true);
  take.mark("5 messages");
  await s.hold(T.messages.home);
  await m.tap(chessRow, { what: "the Chess Club row", cut: true, expect: () => space.isVisible() });

  // 5b. Chess Club's Lounge: the Blitz Night card and the last line, then up to the poll.
  await s.settle("Chess Club's Lounge", async () => (await space.getByText("See you all at 7").isVisible()) && (await space.getByText("Open event chat").isVisible()));
  // The list is cut by the Board bar wherever its top happens to fall: half an avatar, the last sliver of a card.
  // `rowEdge(up)` answers how far to scroll so the cut falls in the gap above a whole row, about `up` px higher.
  const rowEdge = (up, pad = false) => p.evaluate(([up, pad]) => {
    let box = document.elementFromPoint(195, 520);
    while (box && box !== document.body && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight + 4)) box = box.parentElement;
    let list = box; // the rows' parent: down the tallest child until one holds the rows
    for (let i = 0; i < 4 && list.childElementCount < 4; i++) list = [...list.children].sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    const tops = [...list.children].map((row) => Math.round(row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop));
    const want = box.scrollTop - up;
    const to = tops.filter((t) => !pad || t - 4 >= want).sort((a, b) => Math.abs(a - 4 - want) - Math.abs(b - 4 - want))[0] - 4;
    if (!pad) return to - box.scrollTop;
    // At the newest line the list cannot go further down: a few px of room under the last line (film-only).
    const more = to - box.scrollTop;
    if (more > 0 && more <= 40) { list.style.paddingBottom = `${parseFloat(getComputedStyle(list).paddingBottom) + more}px`; box.scrollTop = box.scrollHeight; }
    return more;
  }, [up, pad]);
  const room = await rowEdge(0, true);
  await s.settle("the Lounge, its top row whole", () => space.getByText("See you all at 7").isVisible(), { quiet: 6 });
  s.record(true);
  await s.hold(T.messages.lounge);
  const up = await rowEdge(300);
  if (!(up < -200 && up > -400)) throw new TakeError(`no whole row to stop on near 300 px up the Lounge (nearest is ${up} px; ${room} px of room was added at the bottom)`);
  await m.glide(up, T.messages.scroll, [195, 520]);
  await s.hold(T.messages.poll);
  if (!(await space.getByText("What should we play next week?").isVisible())) throw new TakeError("the poll is not on screen after the scroll up the Lounge");
  await m.tap(space.getByRole("button", { name: "Back to Messages", exact: true }), { what: "Back, out of the Lounge", cut: true, expect: async () => p.url().endsWith("/messages") && !(await space.isVisible()) });

  // 5c. The DM with James: type the line, send it.
  await s.settle("Messages again", home);
  s.record(true);
  await s.hold(T.messages.homeAgain);
  await m.tap(jamesRow, { what: "James's row", cut: true, expect: () => field.isVisible() });
  await s.settle("the thread with James", () => dm.getByText("nice, let's get food after the meeting").isVisible());
  s.record(true);
  await s.hold(T.messages.dm);
  await m.tap(field, { what: "the message field", expect: () => field.evaluate((el) => document.activeElement === el) });
  await m.type(LINE, field, { delay: T.key });
  await s.hold(T.messages.typed);
  await m.tap(dm.getByRole("button", { name: "Send", exact: true }), { what: "Send", within: 60, expect: async () => (await field.inputValue()) === "" && (await dm.getByText(LINE, { exact: true }).count()) === 1 });
  await s.hold(T.messages.sent);
  await m.tap(dm.getByRole("button", { name: "Back", exact: true }), { what: "Back, out of the thread", cut: true, expect: async () => p.url().endsWith("/messages") && (await p.getByRole("dialog").count()) === 0 });

  // 5d. The home again (James's row now carries the line), then the Profile tab.
  await s.settle("Messages, after the send", home);
  s.record(true);
  await s.hold(T.messages.homeAfter);
  await m.tap(tab("/profile"), { what: "the Profile tab", cut: true, expect: async () => p.url().endsWith("/profile") });

  // 6. Franky's own profile: cover, name, "vibin", then down to his posts.
  await s.settle("Franky's profile", async () => (await p.locator("h1", { hasText: "Franky Cazares" }).isVisible()) && (await p.getByRole("button", { name: "Post actions", exact: true }).count()) > 0);
  await newPost(p, false);
  await m.preload(900);
  s.record(true);
  take.mark("6 own profile");
  await s.hold(T.own.hold);
  await m.glide(660, T.own.scroll); // the turtle card whole with room above it, the field picture coming up under it
  await s.hold(T.own.rest);
  s.record(false);
  await s.close();
}
