// Runs INSIDE the page (page.evaluate). Returns the visible policy text as
// blocks in reading order, plus every id and every in-page link.
//
// A block is one heading, paragraph, list item, table cell (or the "Effective"
// line). The contents list ("On this page") is left out: it exists only on
// the page. Each block carries where its links and bold runs are, so the
// caller can check that every "section N" is a link.
export function extractInPage() {
  const BLOCK = new Set([
    "P", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "TD", "TH", "DIV",
    "SECTION", "ARTICLE", "UL", "OL", "TABLE", "THEAD", "TBODY", "TR", "NAV",
    "HEADER", "FOOTER", "BLOCKQUOTE", "DL", "DT", "DD", "PRE", "FIGURE",
    "FIGCAPTION", "MAIN", "ASIDE", "HR",
  ]);
  const SKIP = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "SVG"]);
  const blocks = [];
  const skipped = [];
  let cur = null;
  let h2 = "";
  let h3 = "";
  const tables = [];

  function describe(el) {
    const tag = el.tagName.toLowerCase();
    const info = { kind: tag, id: el.id || null };
    // List context: how many lists deep, and which kind the nearest one is.
    let depth = 0;
    let nearest = null;
    for (let p = el; p && p.tagName !== "ARTICLE"; p = p.parentElement) {
      if (p.tagName === "UL" || p.tagName === "OL") {
        depth += 1;
        if (!nearest) nearest = p;
      }
    }
    info.depth = depth;
    info.ordered = nearest ? nearest.tagName === "OL" : null;
    const li = el.closest("li");
    if (li && li.parentElement) {
      const sibs = [...li.parentElement.children].filter((c) => c.tagName === "LI");
      const start = Number(li.parentElement.getAttribute("start") || 1);
      info.item = sibs.indexOf(li) + start;
    }
    if (tag === "td" || tag === "th") {
      const table = el.closest("table");
      let t = tables.indexOf(table);
      if (t < 0) t = tables.push(table) - 1;
      const rows = [...table.querySelectorAll("tr")];
      const tr = el.closest("tr");
      info.table = t;
      info.row = rows.indexOf(tr);
      info.col = [...tr.children].indexOf(el);
    }
    return info;
  }

  function flush() {
    if (cur && cur.text.trim()) {
      const info = describe(cur.owner);
      if (/^h[1-6]$/.test(info.kind)) {
        if (info.kind === "h2") { h2 = cur.text.trim(); h3 = ""; }
        if (info.kind === "h3") h3 = cur.text.trim();
      }
      blocks.push({ ...info, text: cur.text, links: cur.links, bolds: cur.bolds, h2, h3 });
    }
    cur = null;
  }

  function open(owner) {
    if (!cur) cur = { owner, text: "", links: [], bolds: [] };
    return cur;
  }

  function walk(node, ctx) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue;
      if (!text) return;
      const b = open(ctx.owner);
      const start = b.text.length;
      b.text += text;
      if (ctx.href !== null) b.links.push({ start, end: b.text.length, href: ctx.href });
      if (ctx.bold) b.bolds.push({ start, end: b.text.length });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    if (SKIP.has(el.tagName.toUpperCase())) return;
    if (el.matches('nav[aria-label="On this page"]')) {
      skipped.push("contents list: " + el.textContent.trim().slice(0, 60));
      return;
    }
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") {
      if (el.textContent.trim()) skipped.push("hidden: " + el.textContent.trim().slice(0, 80));
      return;
    }
    if (el.tagName === "BR") { open(ctx.owner).text += " "; return; }
    if (BLOCK.has(el.tagName)) {
      flush();
      for (const child of el.childNodes) walk(child, { owner: el, href: null, bold: false });
      flush();
      return;
    }
    // Inline. Two inline children of a flex row (a "Start here" question and
    // its answer) sit side by side with no space in the DOM: add one.
    const parentDisplay = el.parentElement ? getComputedStyle(el.parentElement).display : "";
    if (parentDisplay.includes("flex") || parentDisplay.includes("grid")) {
      open(ctx.owner).text += " ";
    }
    const next = { ...ctx };
    if (el.tagName === "A") next.href = el.getAttribute("href") || "";
    if (el.tagName === "STRONG" || el.tagName === "B" || Number(cs.fontWeight) >= 700 && el.tagName === "SPAN") next.bold = true;
    for (const child of el.childNodes) walk(child, next);
  }

  const article = document.querySelector("main article");
  const h1 = document.querySelector("main h1");
  if (!article || !h1) return { error: "no <main> <h1> or <article> on the page" };
  walk(h1, { owner: h1.parentElement, href: null, bold: false });
  flush();
  const dateLine = h1.nextElementSibling;
  if (dateLine) { walk(dateLine, { owner: dateLine.parentElement, href: null, bold: false }); flush(); }
  walk(article, { owner: article, href: null, bold: false });
  flush();

  const ids = {};
  for (const el of document.querySelectorAll("[id]")) ids[el.id] = (ids[el.id] || 0) + 1;
  const hashLinks = [...document.querySelectorAll("a[href]")]
    .map((a) => ({
      href: a.getAttribute("href"),
      text: a.textContent.trim(),
      inContents: !!a.closest('nav[aria-label="On this page"]'),
      inArticle: !!a.closest("article"),
    }))
    .filter((a) => a.href.startsWith("#") || /^\/legal\/privacy\/?#/.test(a.href));
  const idTags = {};
  for (const el of document.querySelectorAll("[id]")) (idTags[el.id] ||= []).push(el.tagName.toLowerCase());
  const tableShapes = tables.map((t) => [...t.querySelectorAll("tr")].map((tr) => tr.children.length));
  const overlay = !!document.querySelector("nextjs-portal [data-nextjs-dialog], [data-nextjs-error-overlay]");
  return { blocks, ids, idTags, hashLinks, tableShapes, skipped, overlay, title: document.title };
}
