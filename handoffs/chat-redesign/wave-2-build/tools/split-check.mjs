#!/usr/bin/env node
/**
 * split-check.mjs — proves the extraction-only split of MessagesMobile.tsx
 * changed no declaration (wave-2 contract, the split's proof).
 *
 * Usage (from the repo root):
 *   node handoffs/chat-redesign/wave-2-build/tools/split-check.mjs [--base <git ref>] [--dir src/components/mobile/messages]
 *
 * It reads the ORIGINAL file from git (`<ref>:src/components/mobile/MessagesMobile.tsx`,
 * default ref = the commit before the split, passed with --base; default HEAD),
 * lists every top-level statement with the TypeScript compiler API, keys it by
 * name (function / const / let / type / interface / class / enum; an `export`
 * keyword and leading JSDoc are ignored), and normalises its text (whitespace
 * collapsed). Then it does the same over the working-tree MessagesMobile.tsx
 * plus every .ts/.tsx under --dir, and compares:
 *   - MISSING: a declaration of the original that no split file carries;
 *   - CHANGED: the same name with a different normalised text (a diff hint is printed);
 *   - ADDED:   a declaration in the split files the original did not have
 *              (expected: nothing but re-exports, which are not declarations);
 *   - DUPLICATE: a name declared in two split files.
 * Import declarations, `export { … } from`, `export *`, and bare `"use client"`
 * directives are not compared (the split rewrites those by design).
 * Exit 0 only when MISSING, CHANGED and DUPLICATE are all empty.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const BASE = opt("--base", "HEAD");
const DIR = opt("--dir", "src/components/mobile/messages");
const MAIN = "src/components/mobile/MessagesMobile.tsx";

function declarations(source, fileName) {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = new Map();
  const text = (node) => {
    // Full statement text without leading trivia (JSDoc/comments), export keyword stripped.
    let t = source.slice(node.getStart(sf), node.getEnd());
    t = t.replace(/^export\s+(default\s+)?/, "");
    return t.replace(/\s+/g, " ").trim();
  };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) || ts.isExportDeclaration(st) || ts.isExportAssignment(st)) continue;
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) continue; // "use client"
    let names = [];
    if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) {
      if (st.name) names = [st.name.text];
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) names.push(d.name.text);
        else names.push(d.name.getText(sf));
      }
    } else {
      names = [`<statement@${sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1}>`];
    }
    const t = text(st);
    for (const n of names) {
      const key = n;
      const line = sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1;
      if (out.has(key)) out.set(key + `#dup${line}`, { text: t, file: fileName, line });
      else out.set(key, { text: t, file: fileName, line });
    }
  }
  return out;
}

function listFiles(dir) {
  let files = [];
  try {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) files = files.concat(listFiles(p));
      else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) files.push(p);
    }
  } catch {
    /* no dir yet */
  }
  return files;
}

const original = execFileSync("git", ["show", `${BASE}:${MAIN}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const before = declarations(original, `${BASE}:${MAIN}`);

const after = new Map();
const duplicates = [];
for (const f of [MAIN, ...listFiles(DIR)]) {
  const src = readFileSync(f, "utf8");
  for (const [name, d] of declarations(src, f)) {
    if (after.has(name)) duplicates.push({ name, a: after.get(name), b: d });
    else after.set(name, d);
  }
}

const missing = [], changed = [], added = [];
for (const [name, d] of before) {
  const a = after.get(name);
  if (!a) missing.push({ name, ...d });
  else if (a.text !== d.text) changed.push({ name, before: d, after: a });
}
for (const [name, d] of after) if (!before.has(name)) added.push({ name, ...d });

function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { at: i, before: a.slice(Math.max(0, i - 60), i + 80), after: b.slice(Math.max(0, i - 60), i + 80) };
}

console.log(`split-check: ${before.size} declarations in ${BASE}:${MAIN}; ${after.size} across ${MAIN} + ${DIR}`);
console.log(`  missing ${missing.length} · changed ${changed.length} · added ${added.length} · duplicate ${duplicates.length}`);
for (const m of missing) console.log(`  MISSING   ${m.name} (was ${m.file}:${m.line})`);
for (const c of changed) {
  const d = firstDiff(c.before.text, c.after.text);
  console.log(`  CHANGED   ${c.name} (${c.before.file}:${c.before.line} -> ${c.after.file}:${c.after.line}) at char ${d.at}`);
  console.log(`            before: …${d.before}…`);
  console.log(`            after:  …${d.after}…`);
}
for (const a of added) console.log(`  ADDED     ${a.name} (${a.file}:${a.line})`);
for (const d of duplicates) console.log(`  DUPLICATE ${d.name} (${d.a.file}:${d.a.line} and ${d.b.file}:${d.b.line})`);
process.exit(missing.length || changed.length || duplicates.length ? 1 : 0);
