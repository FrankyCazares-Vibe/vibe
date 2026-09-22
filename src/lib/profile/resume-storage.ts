import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  RESUME_BUCKET,
  RESUME_KEY_RE,
  normalizeResumeRef,
  parseResumeDocRef,
  resumeDocProxyPath,
} from "@/lib/profile/resume-doc-url";
import { sanitizeResumeDocs } from "@/lib/profile/resume-docs";
import { renderRedactedDocument } from "@/lib/profile/resume-redact";
import {
  hasUnmatchedRedactions,
  redactionsForRef,
  resumePortfolioRefList,
  sanitizeResumeRedactions,
  type RedactionBar,
} from "@/lib/profile/resume-redactions";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export { resumeKeysReferenced } from "@/lib/profile/resume-doc-url";

/**
 * Server-only access to the PRIVATE `resumes` bucket. There are no
 * storage.objects policies on it (migration 20260904100000) — every
 * upload / sign / delete goes through the service role here, and the
 * only read path for browsers is GET /api/resume/<key>.
 *
 * Redaction invariant (session 53 / A2): a NON-OWNER viewer never receives
 * the original bytes of a document that has redaction bars, and never
 * receives the bar geometry. The proxy route asks
 * `resolveResumeKeyForViewer` which key to sign; when the document has
 * bars that returns a server-rendered DERIVATIVE under
 * `<uid>/redacted/<hash>.<ext>` with the bars burned in as opaque black
 * pixels (see resume-redact.ts — image-only PDF, no text layer). The
 * original is signed only when the document has no bars at all, and the
 * helper THROWS rather than falling back to the original on any failure.
 *
 * Bars name their document by `docKey` (its stored url) and profile-sync
 * moves them with it when the list changes, so removing one document can no
 * longer slide another document's bars off it. A row whose bars and list
 * are out of step anyway fails closed: every hosted document is refused.
 *
 * Residuals (intended): the owner can always fetch their own original
 * (`?view=public` on the proxy shows them the viewers' copy instead);
 * external-link docs with bars are hidden from viewers by the bootstrap
 * route because we cannot redact a file we do not host.
 */

const MAX_RESUME_BYTES = 8 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Key extension (RESUME_KEY_RE group 2, lower-cased) → MIME type. */
const KEY_EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Folder (under the owner prefix) that holds burned-in derivatives. */
const REDACTED_FOLDER = "redacted";

export function humanizeResumeStorageError(message: string): string {
  const m = message.trim();
  if (/bucket\s+not\s+found/i.test(m)) {
    return (
      `Storage bucket "${RESUME_BUCKET}" does not exist on this Supabase project. ` +
      "Apply migrations (e.g. `npx supabase db push` after `supabase link`), " +
      "or run `supabase/migrations/20260904100000_private_resumes_bucket.sql` in the Dashboard SQL editor."
    );
  }
  return m;
}

function normalizeContentType(contentType: string): string {
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  return ct === "image/jpg" ? "image/jpeg" : ct;
}

/**
 * Upload raw bytes as a new resume object owned by `userId`. Returns the
 * storage key (`<uid>/resume-<uuid>.<ext>`). Throws with a humanised
 * message on validation or storage failure.
 */
export async function uploadResumeObject(
  userId: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const ct = normalizeContentType(contentType);
  const ext = MIME_EXT[ct];
  if (!ext) throw new Error("Unsupported file type");
  if (bytes.length === 0 || bytes.length > MAX_RESUME_BYTES) {
    throw new Error("Invalid file size");
  }
  const key = `${userId}/resume-${randomUUID()}.${ext}`;
  const { error } = await createSupabaseServiceClient()
    .storage.from(RESUME_BUCKET)
    .upload(key, bytes, { contentType: ct, upsert: false });
  if (error) {
    console.error("[resume-storage] upload", error);
    throw new Error(humanizeResumeStorageError(error.message));
  }
  return key;
}

/**
 * Upload a `data:<mime>;base64,…` payload (legacy desktop profile.html
 * sends `resume_url` this way). Returns the key, or null when the payload
 * is malformed / unsupported / too large / the upload fails.
 */
export async function uploadResumeDataUrl(
  userId: string,
  dataUrl: string,
): Promise<string | null> {
  const m = dataUrl.trim().match(/^data:([\w/+.-]+);base64,(.+)$/i);
  if (!m) return null;
  const contentType = normalizeContentType(m[1]);
  if (!MIME_EXT[contentType]) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
  if (buf.length === 0 || buf.length > MAX_RESUME_BYTES) return null;
  try {
    return await uploadResumeObject(userId, buf, contentType);
  } catch (e) {
    console.error("[resume-storage] data-url upload failed", e);
    return null;
  }
}

/**
 * Resolve a client-supplied `resume_url` for the row owned by `userId`.
 *   undefined   → field omitted (caller leaves the column alone)
 *   null        → clear
 *   data: URL   → upload to `resumes` → proxy path (null if upload fails)
 *   otherwise   → normalizeResumeRef (own proxy/legacy ref or external link)
 * Non-string, non-null values are treated as "omitted" so a malformed
 * client payload can't silently wipe an existing resume.
 */
export async function resolveResumeUrlInput(
  userId: string,
  value: unknown,
): Promise<string | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (!t) return null;
  if (/^data:/i.test(t)) {
    const key = await uploadResumeDataUrl(userId, t);
    return key ? resumeDocProxyPath(key) : null;
  }
  return normalizeResumeRef(t, userId);
}

/** Short-TTL signed GET URL for a resume object. Throws on error. */
export async function signResumeGetUrl(key: string, expiresInSec = 300): Promise<string> {
  const { data, error } = await createSupabaseServiceClient()
    .storage.from(RESUME_BUCKET)
    .createSignedUrl(key, expiresInSec);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Could not sign resume URL");
  }
  return data.signedUrl;
}

/** Best-effort delete. Logs and swallows errors — never throws. */
export async function deleteResumeObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    const { error } = await createSupabaseServiceClient()
      .storage.from(RESUME_BUCKET)
      .remove(keys);
    if (error) console.error("[resume-storage] remove", error.message, keys);
  } catch (e) {
    console.error("[resume-storage] remove threw", e, keys);
  }
}

/* ----------------------------------------------------------------------
 * Server-side redaction derivatives
 * -------------------------------------------------------------------- */

/** The owner-row columns `resolveResumeKeyForViewer` needs. Raw column
 *  values (unknown) — everything is re-sanitised here. */
export type ResumeOwnerRow = {
  id: string;
  resume_url: unknown;
  resume_docs: unknown;
  resume_redactions: unknown;
};

/**
 * The document refs a viewer's profile lists, in `resumePortfolio` order.
 * Mirrors normalize-profile-view + build-vibe-user-v1: the sanitised
 * `resume_docs` array when it is non-empty, otherwise `[resume_url]`.
 * A redaction bar's `docKey` is one of these strings, and its `docIndex`
 * (all a legacy bar has) is a position in THIS list.
 */
export function resumePortfolioRefs(row: ResumeOwnerRow): string[] {
  return resumePortfolioRefList(
    sanitizeResumeDocs(row.resume_docs, row.id),
    normalizeResumeRef(row.resume_url, row.id),
  );
}

/** Index of `key` in the row's portfolio, or -1 when it is not listed. */
export function resumeDocIndexForKey(row: ResumeOwnerRow, key: string): number {
  return resumePortfolioRefs(row).findIndex(
    (ref) => parseResumeDocRef(ref)?.key === key,
  );
}

/** The row's stored bars, read strictly: a key that names nothing storable
 *  is kept as unmatchable, so the row fails closed instead of the bar
 *  quietly covering whatever file sits at its position. */
function storedRedactions(row: ResumeOwnerRow): RedactionBar[] {
  return sanitizeResumeRedactions(row.resume_redactions, { strict: true });
}

/** Bars covering the document at the given portfolio slot: by docKey when
 *  the bar has one, by position for a legacy bar. */
export function redactionBarsForDoc(row: ResumeOwnerRow, docIndex: number): RedactionBar[] {
  const refs = resumePortfolioRefs(row);
  if (docIndex < 0 || docIndex >= refs.length) return [];
  return redactionsForRef(storedRedactions(row), refs, refs[docIndex]);
}

/**
 * Thrown by `resolveResumeKeyForViewer` when the row has a bar that covers
 * no listed document (see `hasUnmatchedRedactions`). The proxy answers 503
 * "being updated" for every hosted document on the row — never an original.
 */
export class ResumeRedactionsOutOfStepError extends Error {
  constructor() {
    super("Redaction bars do not match the document list");
    this.name = "ResumeRedactionsOutOfStepError";
  }
}

/**
 * Stable identity of "this source key with exactly these bars". The bars
 * are canonicalised (fixed key order, sorted) so the same set in a
 * different array order maps to the same derivative.
 */
function derivativeHash(key: string, bars: readonly RedactionBar[]): string {
  const canonical = bars
    .map(({ pageNumber, x, y, w, h }) => ({ pageNumber, x, y, w, h }))
    .sort(
      (a, b) =>
        a.pageNumber - b.pageNumber || a.x - b.x || a.y - b.y || a.w - b.w || a.h - b.h,
    );
  return createHash("sha256")
    .update(`${key}|${JSON.stringify(canonical)}`)
    .digest("hex")
    .slice(0, 20);
}

function keyExtension(key: string): string {
  const m = RESUME_KEY_RE.exec(key);
  if (!m) throw new Error("Invalid resume key");
  const ext = m[2].toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}

/**
 * Which storage key to sign for a NON-OWNER viewer of `key` on the row
 * owned by `ownerRow.id`.
 *
 *   - key not in the row's portfolio          → null (nothing to show)
 *   - any bar on the row covers no listed doc → THROWS
 *     ResumeRedactionsOutOfStepError (fail closed, every document)
 *   - the document has no redaction bars      → `key` (original is fine)
 *   - the document has bars                   → derivative key
 *     `<uid>/redacted/<sha256(key|bars)[0..20]>.<ext>`, rendered and
 *     uploaded on first use, reused afterwards.
 *
 * Bars are matched to the document by docKey, or by position for a legacy
 * bar; a file listed twice gets the bars of both entries.
 *
 * THROWS when a derivative is needed but cannot be listed / rendered /
 * uploaded. Callers must surface an error — never sign the original.
 * The caller is responsible for auth, membership and block checks.
 */
export async function resolveResumeKeyForViewer(
  ownerRow: ResumeOwnerRow,
  key: string,
): Promise<string | null> {
  const refs = resumePortfolioRefs(ownerRow);
  const ref = refs.find((r) => parseResumeDocRef(r)?.key === key);
  if (ref === undefined) return null;
  const allBars = storedRedactions(ownerRow);
  if (hasUnmatchedRedactions(allBars, refs)) throw new ResumeRedactionsOutOfStepError();
  const bars = redactionsForRef(allBars, refs, ref);
  if (bars.length === 0) return key;

  const ext = keyExtension(key);
  const fileName = `${derivativeHash(key, bars)}.${ext}`;
  const folder = `${ownerRow.id}/${REDACTED_FOLDER}`;
  const derivativeKey = `${folder}/${fileName}`;
  const storage = createSupabaseServiceClient().storage.from(RESUME_BUCKET);

  // Cheap existence check first — derivatives are regenerated lazily and
  // invalidated by profile-sync whenever the docs or bars change.
  const { data: listed, error: listErr } = await storage.list(folder, {
    search: fileName,
    limit: 10,
  });
  if (listErr) throw new Error(`redacted list: ${listErr.message}`);
  if ((listed ?? []).some((f) => f.name === fileName)) return derivativeKey;

  const { data: blob, error: dlErr } = await storage.download(key);
  if (dlErr || !blob) throw new Error(`redacted download: ${dlErr?.message ?? "empty"}`);
  const source = new Uint8Array(await blob.arrayBuffer());
  const contentType = KEY_EXT_MIME[ext] ?? blob.type;

  const rendered = await renderRedactedDocument({ bytes: source, contentType, bars });
  if (rendered.ext !== ext) {
    // The renderer keeps the source format for every type we accept, so
    // this is a programming error, not a data condition.
    throw new Error(`redacted ext mismatch: ${rendered.ext} vs ${ext}`);
  }

  const { error: upErr } = await storage.upload(derivativeKey, rendered.bytes, {
    contentType: rendered.contentType,
    upsert: true,
  });
  if (upErr) throw new Error(`redacted upload: ${upErr.message}`);
  return derivativeKey;
}

/**
 * Best-effort: delete every derivative under `<uid>/redacted/` so the next
 * viewer request re-renders against the current docs + bars. Logs and
 * swallows errors — never throws.
 */
export async function purgeRedactedDerivatives(userId: string): Promise<number> {
  const folder = `${userId}/${REDACTED_FOLDER}`;
  try {
    const storage = createSupabaseServiceClient().storage.from(RESUME_BUCKET);
    const { data, error } = await storage.list(folder, { limit: 1000 });
    if (error) {
      console.error("[resume-storage] redacted list", error.message, folder);
      return 0;
    }
    const keys = (data ?? [])
      .filter((f) => f.id !== null)
      .map((f) => `${folder}/${f.name}`);
    if (keys.length === 0) return 0;
    const { error: rmErr } = await storage.remove(keys);
    if (rmErr) {
      console.error("[resume-storage] redacted remove", rmErr.message, keys);
      return 0;
    }
    return keys.length;
  } catch (e) {
    console.error("[resume-storage] redacted purge threw", e, folder);
    return 0;
  }
}
