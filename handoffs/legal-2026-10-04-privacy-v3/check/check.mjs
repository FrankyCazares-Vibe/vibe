#!/usr/bin/env node
// Word-for-word check: is the Privacy Policy PAGE the same as the TEXT?
//
//   node check.mjs                 (defaults below)
//   node check.mjs --url http://localhost:3105/legal/privacy --md <file> --src <dir>
//
// Reads only. Writes report.txt and report.json next to this file.
// Exit code 0 = the page and the text are the same, 1 = they differ, 2 = could not run.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { anchorIssues, boldIssues, countMentions, dateIssues, mentionIssues, structureIssues, tableIssues } from "./checks.mjs";
import { findDifferences, toSentences, wordDiff } from "./compare.mjs";
import { extractInPage } from "./extract-page.mjs";
import { parseMd } from "./parse-md.mjs";
import { fileFor, loadSources, sectionLabel } from "./sources.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRATCH = join(HERE, "..", "..", "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const URL_ = arg("url", "http://localhost:3105/legal/privacy");
const MD = arg("md", join(SCRATCH, "privacy-v3", "privacy-policy-final.md"));
const SRC = arg("src", join(SCRATCH, "release", "src", "app", "legal", "privacy"));
const WIDTH = Number(arg("width", 1280));
const has = (name) => process.argv.includes("--" + name);
// The page's "Start here" answers have no full stop ("Section 5", not "Section 5.").
// Strict by default: that counts as a difference. With this flag it is listed and not counted.
const ALLOW_START_HERE_STOPS = has("allow-start-here-stops");
// --selftest breaks a copy of the page in the browser (never the files) to prove the checks bite.
const SELFTEST = has("selftest");
const PLAYWRIGHT = arg("playwright", "/Users/franciscocazares/.claude/skills/gstack/node_modules/playwright-core/index.mjs");

async function readPage() {
  const { chromium } = await import(PLAYWRIGHT);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 } });
    const response = await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (!response || response.status() !== 200) throw new Error(`${URL_} answered ${response ? response.status() : "nothing"}`);
    await page.waitForSelector("main article", { timeout: 30000 });
    await page.waitForTimeout(1500); // let the dev server hydrate (or show its error box)
    if (SELFTEST) await page.evaluate(breakThePage);
    const data = await page.evaluate(extractInPage);
    if (data.error) throw new Error(data.error);
    data.waitlistHoldsSection11 = await page.evaluate(() => {
      const w = document.getElementById("waitlist");
      const s = document.getElementById("section-11");
      return !!(w && s && (w === s || w.contains(s)));
    });
    return data;
  } finally {
    await browser.close();
  }
}

// Self-test only. Runs in the browser on the loaded copy of the page.
function breakThePage() {
  const art = document.querySelector("main article");
  const link = art.querySelector('p a[href="#section-3d"]');
  link.replaceWith(document.createTextNode(link.textContent)); // 1 a mention that is not a link
  art.querySelector('p a[href="#section-6"]').setAttribute("href", "#section-99"); // 2 a link to nowhere
  document.getElementById("section-5b").id = "section-5a"; // 3 an id twice, an id missing
  const cell = art.querySelectorAll("td")[3];
  cell.textContent = cell.textContent.replace(/\w+$/, "CHANGED"); // 4 a table cell
  const strong = art.querySelector("#section-2 ~ p strong");
  strong.replaceWith(document.createTextNode(strong.textContent)); // 5 bold lost
  const list = document.getElementById("section-1").nextElementSibling.nextElementSibling;
  list.insertBefore(list.children[1], list.children[0]); // 6 two list items swapped
  document.getElementById("section-7").nextElementSibling.remove(); // 7 a paragraph gone
  document.getElementById("section-3b").textContent = "3b. What is on my page?"; // 8 a heading reworded
  const p = document.getElementById("section-10").nextElementSibling;
  p.insertAdjacentHTML("afterend", "<p>This sentence is not in the text.</p>"); // 9 an extra sentence
  const q = document.getElementById("section-12").nextElementSibling;
  q.nextElementSibling.prepend(...q.childNodes, " "); q.remove(); // 10 two paragraphs run together
}

const md = parseMd(readFileSync(MD, "utf8"));
let pageData;
try {
  pageData = await readPage();
} catch (error) {
  console.error("COULD NOT READ THE PAGE: " + error.message);
  process.exit(2);
}
const ctx = loadSources(SRC);
const mdS = toSentences(md.blocks, "md");
const pageS = toSentences(pageData.blocks, "page");
const { same, diffs } = findDifferences(mdS, pageS);

const issues = [];
const add = (severity, group, section, file, what, text, page, fix) =>
  issues.push({ severity, group, section, file, what, text: text ?? null, page: page ?? null, fix: fix ?? null });
const fileOfPage = (s) => fileFor(ctx, s.key, s.block).file;
// A sentence the page lacks belongs in the file that holds its neighbours.
const fileOfMissing = (d) => {
  const near = [d.before, d.after].find((p) => p && sectionLabel(p.md.block) === sectionLabel(d.md.block) && !/^h\d$/.test(p.page.block.kind));
  return near ? fileOfPage(near.page) : fileFor(ctx, "\u0000", d.md.block).file;
};
const where = (s) => `${shapeOf(s)}, text line ${s.block.line ?? "?"}`;
function shapeOf(s) {
  const b = s.block;
  if (b.kind === "li") return `${b.ordered ? "numbered" : "bulleted"} item ${b.item ?? ""}`.trim();
  if (b.kind === "td" || b.kind === "th") return `table ${b.table + 1}, row ${b.row}, column ${b.col + 1}`;
  if (/^h\d$/.test(b.kind)) return "heading";
  return "paragraph";
}

for (const d of diffs) {
  if (d.type === "changed") {
    const heading = /^h\d$/.test(d.md.block.kind) || /^h\d$/.test(d.page.block.kind);
    const cell = /^t[dh]$/.test(d.md.block.kind);
    // The one known layout difference: "Start here" puts each answer in a
    // right-hand column, and the page drops the full stop after it.
    const startHereStop = /start here/i.test(d.page.block.h2) && d.page.block.kind === "li" && d.md.key === d.page.key + ".";
    const accepted = startHereStop && ALLOW_START_HERE_STOPS;
    add(accepted ? "low" : startHereStop ? "medium" : "high",
      accepted ? "full stop only, accepted (not counted)" : heading ? "heading differs" : cell ? "table cell differs" : d.punctuationOnly ? "punctuation differs" : "changed words",
      sectionLabel(d.md.block), fileOfPage(d.page),
      `${where(d.md)}: ${wordDiff(d.md.key, d.page.key)}`, d.md.key, d.page.key,
      startHereStop ? "Add the full stop after the answer link in page.tsx, or accept it as layout: --allow-start-here-stops." : "Make the page read as the text does.");
  } else if (d.type === "missing") {
    add("high", "missing from the page", sectionLabel(d.md.block), fileOfMissing(d),
      `${where(d.md)} is in the text and not on the page` + (d.before ? `. It follows: "${d.before.md.key.slice(0, 90)}"` : ""),
      d.md.key, null, "Add the sentence to the page.");
  } else if (d.type === "extra") {
    add("high", "on the page, not in the text", sectionLabel(d.page.block), fileOfPage(d.page),
      `${shapeOf(d.page)} is on the page and not in the text` + (d.before ? `. It follows: "${d.before.page.key.slice(0, 90)}"` : ""),
      null, d.page.key, "Take it off the page (or it belongs in the text first).");
  } else if (d.type === "moved") {
    add("high", "out of order", sectionLabel(d.md.block), fileOfPage(d.page),
      `${where(d.md)} is in a different place on the page (page: ${sectionLabel(d.page.block)}, ${shapeOf(d.page)})` + (d.exact ? "" : `, and reworded: ${wordDiff(d.md.key, d.page.key)}`),
      d.md.key, d.page.key, "Put it where the text has it.");
  }
}
for (const s of structureIssues(same)) {
  add("medium", s.type === "number" ? "list number differs" : "layout differs", sectionLabel(s.md.block), fileOfPage(s.page),
    `${where(s.md)}: ${s.what}`, s.md.key, s.page.key, "Use the same block as the text (paragraph, list item, table cell).");
}
for (const t of tableIssues(md.tableShapes, pageData.tableShapes)) add("high", "table differs", "tables", null, t, null, null, "Match the table to the text.");
const dates = dateIssues(md.blocks, pageData.blocks);
for (const t of dates.issues) add("high", "date", "dates", "page.tsx", t, null, null, "Published October 5, 2026; only the counts-only rule keeps October 4, 2026.");
for (const a of anchorIssues(pageData)) add("high", "anchor or link", "anchors", a.id || a.link ? "parts.tsx" : null, a.what, null, null, "Every id once; every #link to an id that exists.");
if (!pageData.waitlistHoldsSection11) add("high", "anchor or link", "anchors", "parts.tsx", "#waitlist does not hold the section 11 heading", null, null, "Wrap section 11 in <WaitlistSection>.");
const mentions = mentionIssues(pageData.blocks);
for (const m of mentions.issues) add("high", "section mention is not a link", sectionLabel(m.block), fileFor(ctx, toSentences([m.block], "page").find((s) => s.key.includes(m.mention.replace(/\s+/g, " ")))?.key ?? "\u0000", m.block).file, m.what, null, m.block.text.replace(/\s+/g, " ").trim().slice(0, 200), `Wrap it: <Sec to="${m.token}">…</Sec>.`);
const mdMentions = countMentions(md.blocks);
if (mdMentions !== mentions.total) add("medium", "section mention is not a link", "whole page", null, `the text names a section ${mdMentions} times, the page ${mentions.total} times`, null, null, null);
for (const b of boldIssues(same)) add("low", "bold differs (not counted)", sectionLabel(b.md.block), fileOfPage(b.page), `${where(b.md)}: ${b.what}`, b.md.key, b.page.key, "Bold the same words as the text.");
for (const l of md.leftovers) add("medium", "checker: markdown left in the text", "text file", null, `line ${l.line}: ${l.text.slice(0, 120)}`, null, null, "Check the parser.");
if (pageData.overlay) add("high", "page", "whole page", null, "the dev server is showing an error box over the page", null, null, null);

const gating = issues.filter((i) => i.severity !== "low");
const pass = gating.length === 0;
const lines = [];
lines.push(`PRIVACY POLICY, PAGE AGAINST TEXT  (${new Date().toString().slice(0, 24)})`);
lines.push(`page: ${URL_}`);
lines.push(`text: ${MD}`);
lines.push(`sentences: ${mdS.length} in the text, ${pageS.length} on the page, ${same.length} the same and in the same order`);
lines.push(`blocks: ${md.blocks.length} in the text, ${pageData.blocks.length} on the page; tables: ${md.tableShapes.length} / ${pageData.tableShapes.length}`);
lines.push(`dates on the page: ${JSON.stringify(dates.pageDates)}; "section N" mentions: ${mentions.total} on the page, ${mentions.total - mentions.issues.length} of them links`);
lines.push(`left out of the page text on purpose: ${pageData.skipped.join("; ") || "nothing"}`);
lines.push(`RESULT: ${pass ? "PASS, the page and the text are the same" : `FAIL, ${gating.length} difference(s)`}${issues.length - gating.length ? ` (+${issues.length - gating.length} note(s) not counted: bold only, or accepted by a flag)` : ""}`);
issues.forEach((i, n) => {
  lines.push("");
  lines.push(`${n + 1}. [${i.severity}] ${i.group}  |  ${i.section}  |  ${i.file ? "src/app/legal/privacy/" + i.file : "(no single file)"}`);
  lines.push(`   ${i.what}`);
  if (i.text) lines.push(`   TEXT: ${i.text}`);
  if (i.page) lines.push(`   PAGE: ${i.page}`);
});
const report = lines.join("\n") + "\n";
if (SELFTEST) { console.log(report); console.log("(self-test: the page was broken on purpose in the browser; nothing saved)"); process.exit(pass ? 0 : 1); }
writeFileSync(join(HERE, "report.txt"), report);
writeFileSync(join(HERE, "report.json"), JSON.stringify({ pass, url: URL_, md: MD, counts: { mdSentences: mdS.length, pageSentences: pageS.length, same: same.length, mentions: mentions.total, dates: dates.pageDates }, issues }, null, 2));
console.log(report);
process.exit(pass ? 0 : 1);
