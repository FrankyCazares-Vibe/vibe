// Reads privacy-policy-final.md into the same kind of blocks the page gives:
// headings, paragraphs, list items, table cells, in reading order, with the
// markdown marks stripped.

/** Strip the inline marks of one block. Returns the plain text and its bold runs. */
export function stripInline(raw) {
  const bolds = [];
  let s = raw;
  s = s.replace(/!?\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, "$1"); // [text](url)
  s = s.replace(/`([^`]+)`/g, "$1"); // `code`
  s = s.replace(/\*\*(.+?)\*\*/g, (_, t) => { bolds.push(t); return t; }); // **bold**
  s = s.replace(/__(.+?)__/g, (_, t) => { bolds.push(t); return t; }); // __bold__
  s = s.replace(/(^|[^\w*])\*(?!\s)([^*]+?)\*(?!\w)/g, "$1$2"); // *italic*
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1"); // \escapes
  s = s.replace(/<\/?(?:br|span|sup|sub|em|strong|b|i)\b[^>]*>/gi, " "); // stray inline html
  s = s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
  return { text: s, bolds };
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

export function parseMd(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  const anchors = [];
  const leftovers = [];
  let para = null;
  let lists = []; // open lists: { indent, ordered, n }
  let table = -1;
  let row = 0;
  let inTable = false;
  let h2 = "";
  let h3 = "";

  const push = (b) => {
    const { text, bolds } = stripInline(b.raw);
    const out = { ...b, text, bolds, h2, h3 };
    if (/\*\*|__|`|\]\(|^\s*>|^\s*#/.test(text)) leftovers.push({ line: b.line, text });
    blocks.push(out);
  };
  const flush = () => { if (para) { push(para); para = null; } };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const n = i + 1;
    if (!line.trim()) { flush(); inTable = false; continue; }

    const anchor = /^\s*<a\s+id="([^"]+)">\s*<\/a>\s*$/.exec(line);
    if (anchor) { flush(); anchors.push({ id: anchor[1], line: n }); continue; }

    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) { flush(); lists = []; continue; } // rule

    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush();
      lists = [];
      inTable = false;
      const level = heading[1].length;
      const text = stripInline(heading[2]).text;
      if (level === 2) { h2 = text; h3 = ""; }
      if (level === 3) h3 = text;
      push({ kind: "h" + level, raw: heading[2], depth: 0, ordered: null, line: n });
      continue;
    }

    if (/^\s*\|/.test(line)) {
      flush();
      lists = [];
      const cells = splitRow(line);
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // |---|---|
      if (!inTable) { inTable = true; table += 1; row = 0; }
      cells.forEach((raw, col) => {
        push({ kind: row === 0 ? "th" : "td", raw, table, row, col, depth: 0, ordered: null, line: n });
      });
      row += 1;
      continue;
    }
    inTable = false;

    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      flush();
      const indent = item[1].length;
      const ordered = /\d/.test(item[2]);
      while (lists.length && lists[lists.length - 1].indent > indent) lists.pop();
      const top = lists[lists.length - 1];
      if (!top || top.indent < indent) lists.push({ indent, ordered, n: 0 });
      else if (top.ordered !== ordered) lists[lists.length - 1] = { indent, ordered, n: 0 };
      const list = lists[lists.length - 1];
      list.n += 1;
      para = {
        kind: "li", raw: item[3], depth: lists.length, ordered,
        item: ordered ? Number.parseInt(item[2], 10) : list.n,
        position: list.n, line: n,
      };
      continue;
    }

    // A plain line of text: more of the open block, or a new paragraph. A new
    // paragraph is inside a list item when it is indented past the item's marker.
    if (para) { para.raw += " " + line.trim(); continue; }
    const indent = /^\s*/.exec(line)[0].length;
    while (lists.length && indent <= lists[lists.length - 1].indent) lists.pop();
    const list = lists[lists.length - 1];
    para = {
      kind: "p", raw: line.trim(), depth: lists.length,
      ordered: list ? list.ordered : null, line: n,
    };
  }
  flush();

  const tableShapes = [];
  for (const b of blocks) {
    if (b.kind !== "th" && b.kind !== "td") continue;
    (tableShapes[b.table] ||= [])[b.row] = b.col + 1;
  }
  return { blocks, anchors, leftovers, tableShapes };
}
