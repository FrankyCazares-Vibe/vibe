#!/usr/bin/env node
// Count uploaded photos that still carry metadata (EXIF / XMP / IPTC, and
// GPS inside EXIF) in the LOCAL Supabase stack. S67 security wave B, B3.
//
//   node scripts/count-exif-uploads.mjs           # counts only
//   node scripts/count-exif-uploads.mjs --apply   # re-encode those in place
//
// WHAT IT LOOKS AT: every `profiles` object a row still shows (users
// avatar_url / banner_url, work-experience and working-on logos, posts
// media_url / media_thumbnail_url) and every image résumé in `resumes`
// (burned-in `redacted/` copies are generated clean and skipped). Orphaned
// files nobody shows are B2's count (scripts/sql/profiles-orphans-count.sql).
//
// --apply re-encodes each flagged file IN PLACE (same key, upsert, same
// type, same size in pixels) through src/lib/media/strip-image.ts, the code
// the upload routes use, so no database column changes.
//
// PRINTS COUNTS ONLY: never a user id, handle, file name or URL.
//
// SAFETY: the URL and key come ONLY from `supabase status -o env` (the local
// CLI stack). No .env file is read. It refuses to run unless the API host is
// 127.0.0.1 or localhost. A production run is a separate founder yes, after
// the wave B deploy (so no raw upload lands after it), and a CDN copy of an
// old file can outlive it until the cache fix.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

const res = spawnSync("supabase", ["status", "-o", "env"], { cwd: REPO_ROOT, encoding: "utf8" });
if (res.error || res.status !== 0) {
  console.error("Refusing to run: `supabase status -o env` failed. Start the local stack first.");
  process.exit(1);
}
const STATUS = {};
for (const line of res.stdout.split("\n")) {
  const m = line.trim().match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m) STATUS[m[1]] = m[2];
}
const API_URL = STATUS.API_URL ?? "";
const SERVICE_KEY = STATUS.SERVICE_ROLE_KEY ?? "";
let apiHost = "";
try {
  apiHost = new URL(API_URL).hostname;
} catch {
  // falls through to the refusal below
}
if (apiHost !== "127.0.0.1" && apiHost !== "localhost") {
  console.error(`Refusing to run: API_URL is "${API_URL}". Local stack (127.0.0.1 / localhost) only.`);
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error("Refusing to run: SERVICE_ROLE_KEY missing from `supabase status -o env`.");
  process.exit(1);
}

// Loaded only after the gate has passed.
const { createClient } = await import("@supabase/supabase-js");
const { default: sharp } = await import("sharp");
const { stripImage } = await import("../src/lib/media/strip-image.ts");
const { ownProfileImageKey } = await import("../src/lib/media/profile-image-key.ts");

const admin = createClient(API_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function allRows(table, columns) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

/** kind -> Set of object paths, per bucket. */
const targets = { profiles: new Map(), resumes: new Map() };
function add(bucket, kind, path) {
  if (!targets[bucket].has(kind)) targets[bucket].set(kind, new Set());
  targets[bucket].get(kind).add(path);
}
function addProfileRef(kind, ref, ownerId) {
  const key = ownProfileImageKey(ref, ownerId, API_URL);
  if (key) add("profiles", kind, key.path);
}

for (const u of await allRows("users", "id,avatar_url,banner_url,work_experience,current_on")) {
  addProfileRef("avatar", u.avatar_url, u.id);
  addProfileRef("banner", u.banner_url, u.id);
  for (const list of [u.work_experience, u.current_on]) {
    for (const item of Array.isArray(list) ? list : []) {
      addProfileRef("logo", item?.logo_url ?? item?.logoUrl, u.id);
    }
  }
}
for (const p of await allRows("posts", "user_id,media_url,media_thumbnail_url")) {
  addProfileRef("post", p.media_url, p.user_id);
  addProfileRef("poster", p.media_thumbnail_url, p.user_id);
}
const { data: folders, error: listErr } = await admin.storage.from("resumes").list("", { limit: 1000 });
if (listErr) throw new Error(`resumes list failed: ${listErr.message}`);
for (const folder of folders ?? []) {
  const { data: files } = await admin.storage.from("resumes").list(folder.name, { limit: 1000 });
  for (const f of files ?? []) {
    if (f.id && /\.(jpe?g|png|webp)$/i.test(f.name)) add("resumes", "resume image", `${folder.name}/${f.name}`);
  }
}

/** Does this EXIF block (sharp's `metadata().exif`) point at a GPS IFD? */
function hasGpsIfd(exif) {
  if (!exif || exif.length < 14) return false;
  const tiff = exif.subarray(0, 6).toString("latin1") === "Exif\0\0" ? exif.subarray(6) : exif;
  const le = tiff.subarray(0, 2).toString("latin1") === "II";
  const u16 = (o) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  try {
    const ifd0 = u32(4);
    const n = u16(ifd0);
    for (let i = 0; i < n; i++) if (u16(ifd0 + 2 + i * 12) === 0x8825) return true;
  } catch {
    return false;
  }
  return false;
}

const rows = [];
for (const bucket of Object.keys(targets)) {
  for (const [kind, paths] of targets[bucket]) {
    const c = { kind, checked: 0, withMetadata: 0, withGps: 0, reencoded: 0, failed: 0 };
    for (const path of paths) {
      const { data: blob, error } = await admin.storage.from(bucket).download(path);
      if (error || !blob) { c.failed++; continue; }
      const buf = Buffer.from(await blob.arrayBuffer());
      c.checked++;
      let meta;
      try { meta = await sharp(buf).metadata(); } catch { c.failed++; continue; }
      if (!meta.exif && !meta.xmp && !meta.iptc) continue;
      c.withMetadata++;
      if (hasGpsIfd(meta.exif)) c.withGps++;
      if (!APPLY) continue;
      const out = await stripImage(buf, { maxEdge: null });
      if (!out.ok || out.contentType !== blob.type) { c.failed++; continue; }
      const { error: upErr } = await admin.storage
        .from(bucket)
        .upload(path, out.bytes, { contentType: out.contentType, upsert: true });
      if (upErr) c.failed++;
      else c.reencoded++;
    }
    rows.push(c);
  }
}

console.log(`Local stack, ${APPLY ? "--apply (re-encode in place)" : "count only"}:`);
if (rows.length === 0) console.log("  no referenced uploads found");
for (const r of rows) {
  console.log(
    `  ${r.kind.padEnd(13)} checked ${r.checked}, with metadata ${r.withMetadata} (GPS ${r.withGps})` +
      (APPLY ? `, re-encoded ${r.reencoded}` : "") +
      (r.failed ? `, failed ${r.failed}` : ""),
  );
}
