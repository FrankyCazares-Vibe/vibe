// The checks that are not the sentence diff: block shape, tables, dates,
// anchors, links, "section N" mentions, bold.
import { norm } from "./compare.mjs";

const kindOf = (b) => (b.kind === "div" ? "p" : b.kind);

/** How a block is laid out, in words a person can compare. */
export function shape(b) {
  const kind = kindOf(b);
  if (kind === "li") return `${b.ordered ? "numbered" : "bulleted"} list item, level ${b.depth}`;
  if (kind === "p") return b.depth ? `paragraph inside a list item (level ${b.depth})` : "paragraph";
  if (kind === "th") return `table ${b.table + 1} header, column ${b.col + 1}`;
  if (kind === "td") return `table ${b.table + 1} row ${b.row}, column ${b.col + 1}`;
  return `heading ${kind}`;
}

/** For sentences that match word for word: is each in the same kind of block,
 *  at the same place in it, with the same list number? */
export function structureIssues(same) {
  const out = [];
  const seen = new Set();
  for (const { md, page } of same) {
    const tag = md.b + ":" + page.b;
    if (seen.has(tag)) continue;
    const a = shape(md.block);
    const b = shape(page.block);
    if (a !== b) {
      seen.add(tag);
      out.push({ type: "shape", md, page, what: `the text has it as a ${a}; the page shows it as a ${b}` });
      continue;
    }
    if (md.first !== page.first) {
      seen.add(tag);
      out.push({
        type: "break", md, page,
        what: md.first
          ? "the text starts a new paragraph or item here; the page runs it on from the one before"
          : "the page starts a new paragraph or item here; the text runs it on from the one before",
      });
      continue;
    }
    if (md.first && kindOf(md.block) === "li" && md.block.ordered && md.block.item !== page.block.item) {
      seen.add(tag);
      out.push({ type: "number", md, page, what: `list number: ${md.block.item} in the text, ${page.block.item} on the page` });
    }
  }
  return out;
}

export function tableIssues(mdShapes, pageShapes) {
  const out = [];
  if (mdShapes.length !== pageShapes.length) {
    out.push(`the text has ${mdShapes.length} tables, the page has ${pageShapes.length}`);
  }
  mdShapes.forEach((rows, t) => {
    const p = pageShapes[t];
    if (!p) return;
    if (rows.length !== p.length) out.push(`table ${t + 1}: ${rows.length} rows in the text (header included), ${p.length} on the page`);
    rows.forEach((cols, r) => {
      if (p[r] !== undefined && p[r] !== cols) out.push(`table ${t + 1} row ${r}: ${cols} cells in the text, ${p[r]} on the page`);
    });
  });
  return out;
}

const DATE = /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/g;

export function dateIssues(mdBlocks, pageBlocks) {
  const out = [];
  const text = (blocks) => blocks.map((b) => norm(b.text)).join("\n");
  const page = text(pageBlocks);
  const md = text(mdBlocks);
  const count = (s) => {
    const c = {};
    for (const d of s.match(DATE) || []) c[d] = (c[d] || 0) + 1;
    return c;
  };
  const header = pageBlocks[1] ? norm(pageBlocks[1].text) : "";
  if (header !== "Effective October 13, 2026") out.push(`the line under the title reads "${header}", not "Effective October 13, 2026"`);
  for (const phrase of [
    "our release of October 5, 2026",
    "We published this policy on October 5, 2026",
    "Before October 4, 2026 the assistant could be shown records",
  ]) {
    if (!page.includes(phrase)) out.push(`the page does not say "${phrase}"`);
    if (!md.includes(phrase)) out.push(`the TEXT FILE does not say "${phrase}"`);
  }
  const pc = count(page);
  const mc = count(md);
  for (const d of new Set([...Object.keys(pc), ...Object.keys(mc)])) {
    if ((pc[d] || 0) !== (mc[d] || 0)) out.push(`"${d}" is ${mc[d] || 0} times in the text and ${pc[d] || 0} times on the page`);
    if (d !== "October 5, 2026" && d !== "October 4, 2026" && d !== "October 7, 2026" && d !== "October 8, 2026" && d !== "October 12, 2026" && d !== "October 13, 2026") out.push(`an unexpected date on the page or in the text: "${d}"`);
  }
  if ((pc["October 4, 2026"] || 0) !== 1) out.push(`"October 4, 2026" should be on the page exactly once (the counts-only rule); it is there ${pc["October 4, 2026"] || 0} times`);
  return { issues: out, pageDates: pc, mdDates: mc };
}

export const REQUIRED_IDS = [
  ...Array.from({ length: 15 }, (_, i) => `section-${i + 1}`),
  ..."abcdefgh".split("").map((l) => `section-3${l}`),
  ..."abcdefghi".split("").map((l) => `section-5${l}`),
  "waitlist",
];

export function anchorIssues(pageData) {
  const out = [];
  const { ids, hashLinks, blocks } = pageData;
  for (const id of REQUIRED_IDS) {
    const n = ids[id] || 0;
    if (n !== 1) out.push({ what: `#${id} is on the page ${n} times (must be exactly once)`, id });
  }
  for (const [id, n] of Object.entries(ids)) {
    if (n > 1 && !REQUIRED_IDS.includes(id)) out.push({ what: `id "${id}" is on the page ${n} times`, id });
  }
  for (const a of hashLinks) {
    const target = decodeURIComponent(a.href.slice(a.href.indexOf("#") + 1));
    if (!target || !ids[target]) {
      out.push({ what: `a link "${a.text}" points at ${a.href}, which is not on the page`, link: a });
    }
  }
  // The contents list: fifteen entries, each the heading it jumps to.
  const toc = hashLinks.filter((a) => a.inContents);
  if (toc.length !== 15) out.push({ what: `the contents list has ${toc.length} entries, not 15` });
  for (const a of toc) {
    const heading = blocks.find((b) => b.id === a.href.slice(1));
    if (heading && norm(heading.text) !== norm(a.text)) {
      out.push({ what: `contents entry "${a.text}" does not read the same as its heading "${norm(heading.text)}"`, link: a });
    }
  }
  // A section link should name the section it jumps to.
  for (const a of hashLinks.filter((x) => x.inArticle && !x.inContents)) {
    const m = /^#section-(\d{1,2}[a-z]?)$/.exec(a.href);
    if (m && !new RegExp(`(^|[^0-9a-z])${m[1]}([^0-9a-z]|$)`, "i").test(a.text)) {
      out.push({ what: `a link reading "${a.text}" jumps to ${a.href}`, link: a });
    }
  }
  return out;
}

const MENTION = /\bsections?\s+\d{1,2}[a-i]?\b(?:(?:\s*,\s*|\s+(?:and|or|to)\s+)\d{1,2}[a-i]?\b)*/gi;

/** Every "section N" in the page's text must be a link to #section-N. */
export function mentionIssues(pageBlocks) {
  const out = [];
  let total = 0;
  for (const block of pageBlocks) {
    for (const m of block.text.matchAll(MENTION)) {
      for (const t of m[0].matchAll(/\d{1,2}[a-i]?\b/g)) {
        total += 1;
        const start = m.index + t.index;
        const end = start + t[0].length;
        const over = block.links.filter((l) => l.start <= start && l.end >= end);
        const want = `#section-${t[0]}`;
        if (over.some((l) => l.href === want)) continue;
        out.push({
          block, mention: m[0], token: t[0],
          what: over.length
            ? `"${norm(m[0])}": the ${t[0]} links to ${over[0].href}, not ${want}`
            : `"${norm(m[0])}": the ${t[0]} is not a link (should jump to ${want})`,
        });
      }
    }
  }
  return { issues: out, total };
}

export function countMentions(blocks) {
  let n = 0;
  for (const b of blocks) for (const m of b.text.matchAll(MENTION)) n += [...m[0].matchAll(/\d{1,2}[a-i]?\b/g)].length;
  return n;
}

/** Bold runs, block by block, for blocks whose first sentences match. */
export function boldIssues(same) {
  const out = [];
  const seen = new Set();
  for (const { md, page } of same) {
    if (!md.first || !page.first || seen.has(md.b)) continue;
    seen.add(md.b);
    const mdBold = md.block.bolds.map(norm).filter(Boolean);
    const runs = [];
    for (const r of page.block.bolds) {
      const last = runs[runs.length - 1];
      if (last && page.block.text.slice(last.end, r.start).trim() === "") last.end = r.end;
      else runs.push({ ...r });
    }
    const pageBold = runs.map((r) => norm(page.block.text.slice(r.start, r.end))).filter(Boolean);
    if (mdBold.join(" | ") !== pageBold.join(" | ")) {
      out.push({ md, page, what: `bold in the text: ${JSON.stringify(mdBold)}; bold on the page: ${JSON.stringify(pageBold)}` });
    }
  }
  return out;
}
