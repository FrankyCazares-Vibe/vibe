#!/usr/bin/env node
// sql-parse.mjs — the parse gate of migration B (wave-2-contracts.md 13.3, W2-B1).
//
//   node handoffs/chat-redesign/wave-2-build/tools/sql-parse.mjs [--lib <dir>] [--strip-psql] <file.sql>
//
// Parses the whole file with libpg-query's parseSync (the real Postgres 18
// parser), then every CREATE FUNCTION ... LANGUAGE plpgsql and every DO block
// with parsePlPgSQLSync (its text cut by stmt_location / stmt_len). Exit 0 =
// everything parses; exit 1 = the first error, with the file line. What the
// parser cannot see: the catalog logic inside the DO blocks (two reviewers
// read those), and anything that only a database answers.
//
// libpg-query is NEVER a repo dependency. Install it in a scratch folder:
//   mkdir -p /tmp/pgparse && cd /tmp/pgparse && npm init -y && npm install libpg-query@18
// and point the tool at it, either way:
//   --lib /tmp/pgparse/node_modules/libpg-query
//   LIBPG_QUERY_DIR=/tmp/pgparse/node_modules/libpg-query node .../sql-parse.mjs <file>
// (18.1.5 exports loadModule, parseSync, parsePlPgSQLSync; loadModule first.)
// --strip-psql drops the lines that start with a backslash (psql commands such
// as `\set ON_ERROR_STOP on`), for scripts/sql/chat-v2-cards-check.sql.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
let lib = process.env.LIBPG_QUERY_DIR || "";
let strip = false;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--lib") lib = args[++i] ?? "";
  else if (args[i] === "--strip-psql") strip = true;
  else files.push(args[i]);
}
if (files.length !== 1 || !lib) {
  console.error("usage: sql-parse.mjs [--lib <node_modules/libpg-query>] [--strip-psql] <file.sql>  (or LIBPG_QUERY_DIR)");
  process.exit(1);
}
const pg = createRequire(import.meta.url)(lib);
await pg.loadModule();

let sql = readFileSync(files[0], "utf8");
if (strip) sql = sql.split("\n").map((l) => (l.startsWith("\\") ? "" : l)).join("\n");
const bytes = Buffer.from(sql, "utf8");
const lineOf = (byteOffset) => bytes.subarray(0, byteOffset).toString("utf8").split("\n").length;

function fail(what, err, base) {
  const pos = err?.sqlDetails?.cursorPosition;
  const where = typeof pos === "number" ? ` (line ${lineOf(base + pos)})` : base ? ` (statement at line ${lineOf(base)})` : "";
  console.error(`sql-parse: ${files[0]}: ${what}${where}: ${err?.message ?? err}`);
  process.exit(1);
}

let stmts;
try {
  stmts = pg.parseSync(sql).stmts;
} catch (err) {
  fail("SQL", err, 0);
}
let fns = 0;
let dos = 0;
for (const raw of stmts) {
  const loc = raw.stmt_location ?? 0;
  const len = raw.stmt_len ?? bytes.length - loc;
  const kind = Object.keys(raw.stmt)[0];
  const isPlpgsqlFn =
    kind === "CreateFunctionStmt" &&
    (raw.stmt.CreateFunctionStmt.options ?? []).some(
      (o) => o.DefElem?.defname === "language" && o.DefElem.arg?.String?.sval === "plpgsql",
    );
  if (!isPlpgsqlFn && kind !== "DoStmt") continue;
  const text = bytes.subarray(loc, loc + len).toString("utf8");
  try {
    pg.parsePlPgSQLSync(text);
    if (kind === "DoStmt") dos++;
    else fns++;
  } catch (err) {
    fail(kind === "DoStmt" ? "PL/pgSQL in a DO block" : "PL/pgSQL in a function", err, loc);
  }
}
console.log(`sql-parse: ${files[0]}: ${stmts.length} statements, ${fns} plpgsql functions, ${dos} DO blocks: all parse`);
