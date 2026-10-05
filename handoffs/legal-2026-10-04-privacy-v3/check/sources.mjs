// Which file under src/app/legal/privacy/ holds a given sentence.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { norm } from "./compare.mjs";

const ENTITIES = {
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  apos: "'", quot: '"', amp: "&", nbsp: " ", lt: "<", gt: ">",
  eacute: "é", hellip: "…", mdash: "—", ndash: "–",
  middot: "·", times: "×",
};

/** A .tsx file as roughly the text it renders: comments, tags and JSX glue
 *  taken out, entities turned into characters. Good enough to search in. */
function toPlain(src) {
  let s = src;
  s = s.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
  s = s.replace(/\/\*[\s\S]*?\*\//g, " ");
  s = s.replace(/^\s*\/\/.*$/gm, " ");
  s = s.replace(/\{"\s*"\}/g, " ");
  s = s.replace(/\{"([^"\n]*)"\}/g, "$1");
  s = s.replace(/<Mail\s+box="(hello|help)"\s*\/>/g, "$1@connectvibe.app");
  s = s.replace(/<\/?[A-Za-z][^<>]*?>/g, "");
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)));
  s = s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
  s = s.replace(/&([a-z]+);/g, (m, name) => ENTITIES[name] ?? m);
  s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)));
  s = s.replace(/\\(["'`])/g, "$1");
  return norm(s);
}

export function loadSources(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".tsx")).sort();
  const sources = files.map((file) => {
    const raw = readFileSync(join(dir, file), "utf8");
    return { file, raw, plain: toPlain(raw) };
  });
  // Section → file, from where each heading is drawn.
  const sectionFile = {};
  for (const { file, raw } of sources) {
    if (file === "parts.tsx") continue;
    for (const m of raw.matchAll(/<SectionH2\s+n=\{(\d+)\}/g)) sectionFile[m[1]] = file;
    for (const m of raw.matchAll(/<SubH3\s+n="(\d+[a-z])"/g)) sectionFile[m[1]] = file;
    if (/<WaitlistSection>/.test(raw)) sectionFile["11"] = file;
    if (/<LegalCallout\b/.test(raw)) sectionFile.short = file;
    if (/<LegalStartHere\b/.test(raw)) sectionFile.start = file;
    if (/<LegalLayout\b/.test(raw)) sectionFile.top = file;
  }
  return { sources, sectionFile };
}

/** "5h", "5", "short", "start" or "top" for a block, from its headings. */
export function sectionKey(block) {
  const sub = /^(\d{1,2}[a-z])\./.exec(block.h3 || "");
  if (sub) return sub[1];
  const main = /^(\d{1,2})\./.exec(block.h2 || "");
  if (main) return main[1];
  if (/short version/i.test(block.h2 || "")) return "short";
  if (/start here/i.test(block.h2 || "")) return "start";
  return "top";
}

export function sectionLabel(block) {
  if (block.h3) return block.h3;
  if (block.h2) return block.h2;
  return "Top of the page (before \"The short version\")";
}

/** The file that holds this sentence: an exact hit first, then the file that
 *  holds the most runs of 8, 6 or 4 words of it, then the section's file. */
export function fileFor(ctx, key, block) {
  const { sources, sectionFile } = ctx;
  const sec = sectionKey(block);
  const home = sectionFile[sec] || sectionFile[sec.replace(/[a-z]$/, "")] || null;
  const exact = sources.filter((s) => s.plain.includes(key)).map((s) => s.file);
  if (exact.length === 1) return { file: exact[0], how: "exact" };
  if (exact.length > 1) {
    return { file: exact.includes(home) ? home : exact[0], how: "exact", also: exact };
  }
  const w = key.split(" ");
  for (const size of [8, 6, 4]) {
    if (w.length < size) continue;
    const counts = new Map();
    for (let i = 0; i + size <= w.length; i += 1) {
      const gram = w.slice(i, i + size).join(" ");
      for (const s of sources) {
        if (s.plain.includes(gram)) counts.set(s.file, (counts.get(s.file) || 0) + 1);
      }
    }
    if (counts.size) {
      const ranked = [...counts].sort((a, b) => b[1] - a[1] || (a[0] === home ? -1 : 1));
      return { file: ranked[0][0], how: `${size}-word run` };
    }
  }
  return { file: home, how: "section" };
}
