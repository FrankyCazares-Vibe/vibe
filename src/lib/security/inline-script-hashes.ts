/**
 * Hashes for the inline scripts of a hand-written HTML page, and the browser
 * code rule for /offline.html built from them.
 *
 * Why: /offline.html skips the proxy (its matcher), so it can't get a
 * per-request nonce. It has two inline scripts (the pre-paint theme script and
 * the "Try again" button) and no on*= handlers, so a hash rule fits it
 * exactly. next.config.ts reads public/offline.html at build time and puts
 * `offlinePageCsp(inlineScriptHashes(html))` on that path. Plan:
 * handoffs/2026-10-11-browser-rule-plan.md ("inline-script-hashes").
 *
 * Plain TS with `node:crypto` and no "@/" imports, because next.config.ts
 * imports it by relative path (like ./src/lib/supabase/key-guard).
 */

import { createHash } from "node:crypto";

/** `<script` as a tag name: followed by whitespace, `>` or `/`, never `<scripts`. */
const SCRIPT_OPEN = /<script(?=[\s/>])/gi;
/** A `src` attribute (bare or with a value), not `data-src`. */
const SRC_ATTR = /(?:^|\s)src(?:\s*=|\s|$)/i;

/**
 * `'sha256-<base64>'` for every `<script>…</script>` WITHOUT a `src`
 * attribute, in document order, hashing the exact text between the tags. No
 * trimming: the browser hashes the raw contents, so one stray space changes
 * the hash. The one normalisation is the HTML parser's own: CRLF and lone CR
 * become LF before any script sees its text, so a file saved with Windows line
 * endings still gets the hash the browser computes.
 *
 * HTML comments outside scripts are skipped (a commented-out script never
 * runs, so it needs no hash). Script contents are never searched for comments.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  let pos = 0;
  for (;;) {
    SCRIPT_OPEN.lastIndex = pos;
    const open = SCRIPT_OPEN.exec(html);
    const comment = html.indexOf("<!--", pos);
    if (!open) break;
    if (comment !== -1 && comment < open.index) {
      const end = html.indexOf("-->", comment + 4);
      if (end === -1) break;
      pos = end + 3;
      continue;
    }
    const tagEnd = html.indexOf(">", open.index);
    if (tagEnd === -1) break;
    const attrs = html.slice(open.index + "<script".length, tagEnd).replace(/\/$/, "");
    const closeRe = /<\/script\s*>/gi;
    closeRe.lastIndex = tagEnd + 1;
    const close = closeRe.exec(html);
    if (!close) break;
    if (!SRC_ATTR.test(attrs)) {
      const body = html.slice(tagEnd + 1, close.index).replace(/\r\n?/g, "\n");
      hashes.push(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
    }
    pos = close.index + close[0].length;
  }
  return hashes;
}

/**
 * The browser code rule for /offline.html: its own inline scripts by hash,
 * its inline <style>, same-site or data: images, and nothing else. With no
 * hashes, scripts are refused outright ('none') rather than writing an empty
 * (and therefore invalid) source list.
 */
export function offlinePageCsp(hashes: string[]): string {
  const scripts = hashes.length > 0 ? hashes.join(" ") : "'none'";
  return [
    "default-src 'self'",
    `script-src ${scripts}`,
    "style-src 'unsafe-inline'",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join("; ");
}
