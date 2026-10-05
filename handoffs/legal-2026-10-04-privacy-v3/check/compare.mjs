// Normalising, sentence splitting and the in-order comparison.

/** What both sides are reduced to before comparing: straight quotes, plain
 *  spaces, one space between words. Dashes, dots and letters are NOT touched. */
export function norm(s) {
  return s
    .normalize("NFC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[     ]/g, " ")
    .replace(/[​‌‍⁠﻿­]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split one (normalised) block into sentences. The same splitter runs on
 *  both sides, so an odd split can never by itself make a difference. */
export function sentences(text) {
  const out = [];
  const re = /[.?!]["')\]]*\s+(?=["'(\[]?[A-Z0-9@])/g;
  let start = 0;
  let m;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].trimEnd().length;
    const head = text.slice(start, end);
    if (/\bCONNECTVIBE\.$/.test(head)) continue; // "CONNECTVIBE. LLC" is a name
    if (/\b(?:e\.g|i\.e|vs|etc|U\.S|No)\.$/.test(head)) continue;
    out.push(head.trim());
    start = m.index + m[0].length;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** Blocks → one flat list of sentences, each knowing its block. */
export function toSentences(blocks, side) {
  const list = [];
  blocks.forEach((block, b) => {
    const parts = sentences(norm(block.text));
    parts.forEach((key, s) => {
      list.push({ key, side, b, s, first: s === 0, last: s === parts.length - 1, block });
    });
  });
  return list;
}

function lcsTable(a, b, eq) {
  const w = b.length + 1;
  const t = new Uint16Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      t[i * w + j] = eq(a[i], b[j])
        ? t[(i + 1) * w + j + 1] + 1
        : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    }
  }
  return t;
}

/** In-order diff of two lists. Returns ops: {op:"same"|"del"|"ins", a, b}. */
export function diffSeq(a, b, eq = (x, y) => x === y) {
  const w = b.length + 1;
  const t = lcsTable(a, b, eq);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (eq(a[i], b[j])) { ops.push({ op: "same", a: i, b: j }); i += 1; j += 1; }
    else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) { ops.push({ op: "del", a: i }); i += 1; }
    else { ops.push({ op: "ins", b: j }); j += 1; }
  }
  for (; i < a.length; i += 1) ops.push({ op: "del", a: i });
  for (; j < b.length; j += 1) ops.push({ op: "ins", b: j });
  return ops;
}

const words = (s) => s.split(" ").filter(Boolean);

/** 0..1: how alike two sentences are, word by word, in order. */
export function similarity(x, y) {
  const a = words(x);
  const b = words(y);
  if (!a.length || !b.length) return 0;
  const t = lcsTable(a, b, (p, q) => p === q);
  return (2 * t[0]) / (a.length + b.length);
}

/** True when two sentences differ only in punctuation marks. */
export function samePunctuationAside(x, y) {
  const bare = (s) => s.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return bare(x) === bare(y);
}

/** A one-line word diff: [-only in the text-] {+only on the page+}. */
export function wordDiff(x, y) {
  const a = words(x);
  const b = words(y);
  const out = [];
  let del = [];
  let ins = [];
  const flush = () => {
    if (del.length) out.push("[-" + del.join(" ") + "-]");
    if (ins.length) out.push("{+" + ins.join(" ") + "+}");
    del = [];
    ins = [];
  };
  for (const op of diffSeq(a, b)) {
    if (op.op === "same") { flush(); out.push(a[op.a]); }
    else if (op.op === "del") del.push(a[op.a]);
    else ins.push(b[op.b]);
  }
  flush();
  return out.join(" ");
}

/** Group the ops into runs of differences, and inside each run pair a text
 *  sentence with the page sentence it most resembles ("changed"). What is
 *  left unpaired is missing from the page, or extra on it. */
export function findDifferences(md, page) {
  const ops = diffSeq(md, page, (x, y) => x.key === y.key);
  const same = ops.filter((o) => o.op === "same").map((o) => ({ md: md[o.a], page: page[o.b] }));
  const diffs = [];
  let dels = [];
  let inss = [];
  let lastSame = null;
  const close = (nextSame) => {
    const used = new Set();
    for (const d of dels) {
      let best = -1;
      let bestScore = 0.5; // at least half the words, in order
      inss.forEach((p, k) => {
        if (used.has(k)) return;
        const score = samePunctuationAside(d.key, p.key) ? 0.99 : similarity(d.key, p.key);
        if (score >= bestScore) { best = k; bestScore = score; }
      });
      if (best >= 0) {
        used.add(best);
        diffs.push({ type: "changed", md: d, page: inss[best], score: bestScore, before: lastSame, after: nextSame, punctuationOnly: samePunctuationAside(d.key, inss[best].key) });
      } else diffs.push({ type: "missing", md: d, before: lastSame, after: nextSame });
    }
    inss.forEach((p, k) => {
      if (!used.has(k)) diffs.push({ type: "extra", page: p, before: lastSame, after: nextSame });
    });
    dels = [];
    inss = [];
  };
  for (const o of ops) {
    if (o.op === "del") dels.push(md[o.a]);
    else if (o.op === "ins") inss.push(page[o.b]);
    else { const pair = { md: md[o.a], page: page[o.b] }; close(pair); lastSame = pair; }
  }
  close(null);

  // A sentence missing in one place and extra in another, word for word (or
  // nearly), is the same sentence out of order.
  const missing = diffs.filter((d) => d.type === "missing");
  const extra = diffs.filter((d) => d.type === "extra");
  for (const m of missing) {
    const hit = extra.find((e) => !e.gone && similarity(m.md.key, e.page.key) >= 0.8);
    if (!hit) continue;
    hit.gone = true;
    m.type = "moved";
    m.page = hit.page;
    m.exact = m.md.key === hit.page.key;
  }
  return { same, diffs: diffs.filter((d) => !d.gone) };
}
