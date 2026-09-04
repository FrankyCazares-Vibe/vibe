#!/usr/bin/env node
/**
 * Move resume / portfolio objects from the public `profiles` bucket to the
 * private `resumes` bucket and rewrite `users.resume_url` / `resume_docs`
 * to `/api/resume/<key>` proxy paths. Session 53 / A1.
 *
 *   node scripts/migrate-resumes-to-private.mjs             # dry run (no writes)
 *   node scripts/migrate-resumes-to-private.mjs --copy      # copy profiles → resumes
 *   node scripts/migrate-resumes-to-private.mjs --rewrite   # legacy URL → proxy path (only for keys present in resumes)
 *   node scripts/migrate-resumes-to-private.mjs --cleanup   # delete from profiles what verifiably exists in resumes
 *
 * Idempotent; safe to re-run. Exits 1 on any FAIL. Reads
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * Orphans (objects no row references) are copied too so nothing
 * un-redacted stays public — they become unreachable because the proxy
 * route checks row membership.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const DO_COPY = args.has("--copy");
const DO_REWRITE = args.has("--rewrite");
const DO_CLEANUP = args.has("--cleanup");
const DRY = !DO_COPY && !DO_REWRITE && !DO_CLEANUP;

const SRC = "profiles";
const DST = "resumes";
const PROXY = "/api/resume/";
const LEGACY = "/storage/v1/object/public/profiles/";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID}$`, "i");
const KEY_RE = new RegExp(`^${UUID}/resume-${UUID}\\.(pdf|jpe?g|png|webp)$`, "i");

// ---- env ------------------------------------------------------------------
function loadEnvLocal() {
  const out = {};
  let text = "";
  try {
    text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}
const env = { ...loadEnvLocal(), ...process.env };
const SUPABASE_URL = (env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
const SERVICE_KEY = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
for (const [name, val] of [["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL], ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY]]) {
  if (!val) {
    console.error(`Missing ${name} (set it in .env.local)`);
    process.exit(1);
  }
}
const HOST = new URL(SUPABASE_URL).hostname.toLowerCase();
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---- helpers --------------------------------------------------------------
const short = (s, n = 72) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`  FAIL ${msg}`);
};

/** List every entry under `prefix` (paginated). */
async function listAll(bucket, prefix) {
  const out = [];
  const limit = 1000;
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit, offset });
    if (error) throw new Error(`list ${bucket}/${prefix || "<root>"}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < limit) break;
  }
  return out;
}

/** Map key → { contentType } for every resume object in `bucket`. */
async function listResumeObjects(bucket) {
  const keys = new Map();
  const root = await listAll(bucket, "");
  const folders = root.filter((e) => e.id == null && UUID_RE.test(e.name)).map((e) => e.name);
  for (const folder of folders) {
    for (const it of await listAll(bucket, folder)) {
      if (it.id == null) continue; // sub-folder (posts/, posters/, …)
      const key = `${folder}/${it.name}`;
      if (KEY_RE.test(key)) keys.set(key, { contentType: it.metadata?.mimetype ?? null });
    }
  }
  return keys;
}

/** Classify one stored ref. */
function classifyRef(value) {
  if (typeof value !== "string" || !value.trim()) return { kind: "empty", key: null };
  const v = value.trim();
  if (v.startsWith(PROXY)) {
    const key = v.slice(PROXY.length).split(/[?#]/)[0];
    return KEY_RE.test(key) ? { kind: "proxy", key } : { kind: "foreign", key: null };
  }
  let u;
  try {
    u = new URL(v);
  } catch {
    return { kind: "foreign", key: null };
  }
  if (u.pathname.startsWith(PROXY)) {
    const key = u.pathname.slice(PROXY.length);
    return KEY_RE.test(key) ? { kind: "proxy", key } : { kind: "foreign", key: null };
  }
  if (u.hostname.toLowerCase() === HOST) {
    if (u.pathname.startsWith(LEGACY)) {
      const key = u.pathname.slice(LEGACY.length);
      if (KEY_RE.test(key)) return { kind: "legacy", key };
    }
    return { kind: "foreign", key: null }; // something else on our host
  }
  return { kind: "external", key: null };
}

async function loadRows() {
  const rows = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("users")
      .select("id, resume_url, resume_docs")
      .range(from, from + page - 1);
    if (error) throw new Error(`select users: ${error.message}`);
    for (const r of data ?? []) {
      const docs = Array.isArray(r.resume_docs) ? r.resume_docs : [];
      if (r.resume_url || docs.length) rows.push({ ...r, resume_docs: docs });
    }
    if (!data || data.length < page) break;
  }
  return rows;
}

// ---- discover -------------------------------------------------------------
console.log(`Mode: ${DRY ? "DRY RUN" : [DO_COPY && "copy", DO_REWRITE && "rewrite", DO_CLEANUP && "cleanup"].filter(Boolean).join(" + ")}`);
console.log(`Project host: ${HOST}`);

// Preflight: the private bucket must exist (migration 20260904100000).
{
  const { data: bucket, error } = await supabase.storage.getBucket(DST);
  if (error || !bucket) {
    console.log(`Bucket \`${DST}\`: MISSING — apply supabase/migrations/20260904100000_private_resumes_bucket.sql first`);
    if (!DRY) process.exit(1);
  } else {
    console.log(`Bucket \`${DST}\`: present, public=${bucket.public}`);
    if (bucket.public) {
      console.log(`  WARNING: \`${DST}\` is public — expected private`);
      if (!DRY) process.exit(1);
    }
  }
}
console.log("");

const srcObjects = await listResumeObjects(SRC);
let dstObjects = await listResumeObjects(DST);
const rows = await loadRows();

const referenced = new Set();
const foreign = [];
let rowsNeedingRewrite = 0;
for (const r of rows) {
  const refs = [r.resume_url, ...r.resume_docs.map((d) => d?.url)];
  let needs = false;
  for (const ref of refs) {
    const c = classifyRef(ref);
    if (c.key) referenced.add(c.key);
    if (c.kind === "legacy") needs = true;
    if (c.kind === "foreign") foreign.push({ id: r.id, ref: String(ref) });
  }
  if (needs) rowsNeedingRewrite += 1;
}
const orphanKeys = [...srcObjects.keys()].filter((k) => !referenced.has(k));
const alreadyCopied = [...srcObjects.keys()].filter((k) => dstObjects.has(k));
const dangling = [...referenced].filter((k) => !srcObjects.has(k) && !dstObjects.has(k));

console.log("Resume objects in `profiles`:    ", srcObjects.size);
console.log("  referenced by a users row:     ", srcObjects.size - orphanKeys.length);
console.log("  orphan (no row references it): ", orphanKeys.length);
console.log("  already present in `resumes`:  ", alreadyCopied.length);
console.log("Resume objects in `resumes`:     ", dstObjects.size);
console.log("Rows with resume refs:           ", rows.length);
console.log("  rows needing legacy→proxy:     ", rowsNeedingRewrite);
console.log("Refs pointing at a missing key:  ", dangling.length);
for (const k of dangling) console.log(`    ${k}`);
console.log("Refs on our host that are NOT resume keys (report only):", foreign.length);
for (const f of foreign) console.log(`    ${f.id}  ${short(f.ref)}`);
console.log("");

// ---- copy -----------------------------------------------------------------
if (DO_COPY) {
  const todo = [...srcObjects.keys()].filter((k) => !dstObjects.has(k));
  console.log(`Copy: ${todo.length} object(s) profiles → resumes`);
  for (const key of todo) {
    const { error } = await supabase.storage.from(SRC).copy(key, key, { destinationBucket: DST });
    if (!error) {
      console.log(`  OK   ${key}`);
      continue;
    }
    // Fallback: download + upload with the original content type.
    const { data: blob, error: dlErr } = await supabase.storage.from(SRC).download(key);
    if (dlErr || !blob) {
      fail(`${key} copy: ${error.message}; download: ${dlErr?.message ?? "no data"}`);
      continue;
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    const { error: upErr } = await supabase.storage.from(DST).upload(key, buf, {
      contentType: srcObjects.get(key)?.contentType || blob.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) fail(`${key} copy: ${error.message}; upload: ${upErr.message}`);
    else console.log(`  OK   ${key} (via download+upload)`);
  }
  dstObjects = await listResumeObjects(DST);
  const missing = todo.filter((k) => !dstObjects.has(k));
  for (const k of missing) fail(`${k} not present in resumes after copy`);
  console.log(`Copy done: ${todo.length - missing.length}/${todo.length} verified in resumes\n`);
}

// ---- rewrite --------------------------------------------------------------
if (DO_REWRITE) {
  const toProxy = (ref) => {
    const c = classifyRef(ref);
    if (c.kind === "legacy" && dstObjects.has(c.key)) return `${PROXY}${c.key}`;
    return null; // proxy / external / foreign / missing-in-resumes: leave alone
  };
  let changed = 0;
  console.log("Rewrite: legacy public URLs → /api/resume/<key>");
  for (const r of rows) {
    const patch = {};
    const nextUrl = toProxy(r.resume_url);
    if (nextUrl) patch.resume_url = nextUrl;
    let docsChanged = false;
    const nextDocs = r.resume_docs.map((d) => {
      const n = d && typeof d === "object" ? toProxy(d.url) : null;
      if (!n) return d;
      docsChanged = true;
      return { ...d, url: n };
    });
    if (docsChanged) patch.resume_docs = nextDocs;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await supabase.from("users").update(patch).eq("id", r.id);
    if (error) {
      fail(`${r.id} update: ${error.message}`);
      continue;
    }
    changed += 1;
    console.log(`  OK   ${r.id}`);
    if (patch.resume_url) console.log(`         resume_url: ${short(r.resume_url)}\n                  → ${patch.resume_url}`);
    if (docsChanged) {
      r.resume_docs.forEach((d, i) => {
        if (nextDocs[i]?.url !== d?.url) console.log(`         docs[${i}]:   ${short(String(d?.url))}\n                  → ${nextDocs[i].url}`);
      });
    }
  }
  console.log(`Rewrite done: ${changed} row(s) updated\n`);
}

// ---- cleanup --------------------------------------------------------------
if (DO_CLEANUP) {
  dstObjects = await listResumeObjects(DST); // fresh — never trust a stale listing before deleting
  const removable = [...srcObjects.keys()].filter((k) => dstObjects.has(k));
  console.log(`Cleanup: ${removable.length} object(s) in profiles verified present in resumes`);
  let removed = 0;
  for (let i = 0; i < removable.length; i += 100) {
    const batch = removable.slice(i, i + 100);
    const { data, error } = await supabase.storage.from(SRC).remove(batch);
    if (error) {
      fail(`remove batch ${i / 100 + 1}: ${error.message}`);
      continue;
    }
    removed += data?.length ?? 0;
    for (const o of data ?? []) console.log(`  OK   removed profiles/${o.name}`);
  }
  console.log(`Cleanup done: ${removed}/${removable.length} removed from profiles\n`);
}

if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log(DRY ? "Dry run complete — nothing was modified." : "Done.");
