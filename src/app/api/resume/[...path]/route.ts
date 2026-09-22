import { NextResponse } from "next/server";

import {
  RESUME_KEY_RE,
  resumeKeyOwnerId,
} from "@/lib/profile/resume-doc-url";
import {
  ResumeRedactionsOutOfStepError,
  resolveResumeKeyForViewer,
  resumeKeysReferenced,
  signResumeGetUrl,
  type ResumeOwnerRow,
} from "@/lib/profile/resume-storage";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ path: string[] }> };

export const runtime = "nodejs";
// Non-owner requests may rasterise a PDF on first view (PDFium + sharp);
// well under a second in practice, but give the lambda headroom.
export const maxDuration = 60;

const SIGNED_TTL_SEC = 300;
const NO_STORE = { "cache-control": "private, no-store" } as const;

/** What a student reads when the document isn't servable right now. Same
 *  sentence for both 503s: from the outside they are one thing — the copy
 *  everyone else gets isn't ready — and a student can only wait either way. */
const UNAVAILABLE_TEXT = "This document is being updated. Try again in a minute.";

/** True when this request came from a browser opening the URL itself (the
 *  phone's "Open file", the desktop's "View as others see it", a pasted
 *  link), which is the only case that must be answered with a page. `fetch`
 *  callers ask for anything, or for json, and keep reading JSON; a client
 *  that asks for both gets JSON unless it puts html first. */
function prefersHtml(req: Request): boolean {
  const accept = (req.headers.get("accept") || "").toLowerCase();
  const html = accept.indexOf("text/html");
  if (html < 0) return false;
  const json = accept.indexOf("application/json");
  return json < 0 || html < json;
}

/** The refusal as a page instead of a JSON body: a student who opened the
 *  document in a tab was being shown `{"ok":false,…}`. Everything else about
 *  the answer (status, no-store, retry-after) is unchanged. Inline styles —
 *  no bundle is loaded on an API route — and only our own text goes in. */
function unavailablePage(status: number, headers: Record<string, string>) {
  const body = `<!doctype html>
<html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Document unavailable · Vibe</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    padding:24px; background:#fff; color:#1c1c1e; text-align:center;
    font-family:system-ui,-apple-system,"Segoe UI",sans-serif; }
  .mark { width:34px; height:34px; border-radius:11px; background:#FF5C35; margin:0 auto 18px; }
  h1 { margin:0 0 10px; font-size:19px; font-weight:650; letter-spacing:-0.01em; }
  p { margin:0; max-width:22rem; font-size:15px; line-height:1.55; color:#555; }
  @media (prefers-color-scheme: dark) {
    body { background:#111214; color:#f2f2f2; }
    p { color:#a7a7ad; }
  }
</style>
<main><div class="mark"></div><h1>Hang tight</h1><p>${UNAVAILABLE_TEXT}</p></main>
</html>`;
  return new NextResponse(body, {
    status,
    headers: { ...headers, "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * GET /api/resume/<uid>/resume-<uuid>.<ext>[?json=1][&view=public]
 *
 * The only browser-facing read path for the PRIVATE `resumes` bucket.
 * 307-redirects (or, with `?json=1`, returns `{ ok, url, expiresIn }`) to
 * a signed URL that lives for SIGNED_TTL_SEC seconds.
 *
 * Invariant enforced before anything is signed:
 *   1. key matches RESUME_KEY_RE — the owner id is the key's first segment;
 *   2. requester is signed in (anonymous visitors never get resumes);
 *   3. requester === owner, OR both of:
 *      a. the OWNER row (looked up by the id derived from the key, never by
 *         the requester's row) still references this key in `resume_url`
 *         or `resume_docs` — so a removed doc is unreachable to others
 *         immediately, and a row that points at someone else's key buys
 *         nothing;
 *      b. no `blocks` row exists in either direction.
 *
 *   4. for a NON-OWNER, the key that gets signed is whatever
 *      `resolveResumeKeyForViewer` returns: the original only when the
 *      document has no redaction bars, otherwise a server-rendered
 *      derivative with the bars burned in as opaque pixels (image-only PDF
 *      / re-encoded image). A viewer therefore never receives redacted
 *      bytes, and the bar geometry itself never leaves the server (the
 *      bootstrap route strips it too). If the derivative cannot be
 *      produced the answer is 503 — NOT the original. Bars are matched to
 *      the document by docKey (legacy bars by position), and a row with a
 *      bar that covers no listed document answers 503 "being updated" for
 *      EVERY hosted document until the owner's next save repairs the bars.
 *
 * Every failure is a 404 (no distinction between missing / removed /
 * blocked) except auth (401), rate limit (429), signing errors (500) and
 * a document that could not be prepared or is out of step (503). A browser
 * that opened this URL itself gets those 503s as a small page — students
 * were being shown the raw JSON body (prefersHtml / unavailablePage).
 *
 * Accepted residual: the owner always gets their own original (they edit
 * the bars against it). `?view=public` asks for the copy everyone else
 * gets instead — the owner is then resolved exactly like a viewer (listed
 * documents only, burned-in copy when there are bars, the same 503s), so
 * "View as others see it" shows the real thing. Non-owners always get that
 * copy; the flag changes nothing for them. `?json=1` works with it.
 */
export async function GET(req: Request, ctx: RouteContext) {
  const { path } = await ctx.params;
  const key = Array.isArray(path) ? path.join("/") : "";
  if (!RESUME_KEY_RE.test(key)) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404, headers: { "x-repair-probe": "1" } });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`resume-get:${user.id}`, { limit: 120, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  const ownerId = resumeKeyOwnerId(key);
  if (!ownerId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const service = createSupabaseServiceClient();
  const { data: row, error: rowErr } = await service
    .from("users")
    .select("id, resume_url, resume_docs, resume_redactions")
    .eq("id", ownerId)
    .maybeSingle();
  if (rowErr) {
    console.error("[resume GET] owner lookup", rowErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // The key actually signed: the original for the owner, the redacted
  // derivative (or the original when there are no bars) for everyone else
  // and for the owner's own `?view=public`.
  let keyToSign = key;
  const searchParams = new URL(req.url).searchParams;
  const isOwner = user.id === ownerId;
  const asViewer = !isOwner || searchParams.get("view") === "public";

  if (asViewer) {
    // Membership is enforced for third-party viewers (and the owner's
    // "view as others see it"). The owner may otherwise fetch any key under
    // their own prefix: onboarding previews the file right after upload,
    // before the row references it, and an owner seeing their own
    // not-yet-purged object is harmless.
    const refs = resumeKeysReferenced(
      (row as { resume_url: unknown }).resume_url,
      (row as { resume_docs: unknown }).resume_docs,
    );
    if (!refs.has(key)) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // Both ids are validated UUIDs (auth + RESUME_KEY_RE), so the PostgREST
    // filter string is injection-safe. Same shape as users/[handle]/bootstrap.
    // The owner can't block themselves, so their "view as others" skips it.
    if (!isOwner) {
      const { data: blockRows, error: blockErr } = await service
        .from("blocks")
        .select("blocker_id, blocked_id")
        .or(
          `and(blocker_id.eq.${ownerId},blocked_id.eq.${user.id}),` +
            `and(blocker_id.eq.${user.id},blocked_id.eq.${ownerId})`,
        )
        .limit(1);
      if (blockErr) {
        console.error("[resume GET] block check", blockErr);
        return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
      }
      if ((blockRows ?? []).length > 0) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }
    }

    // Redaction: swap the original for the burned-in derivative when the
    // document has bars. Any failure here is a 503, never a fallback to
    // the original — see resume-storage.ts.
    try {
      const resolved = await resolveResumeKeyForViewer(row as ResumeOwnerRow, key);
      if (!resolved) {
        // Referenced by the row but not in the viewer-visible portfolio
        // (e.g. a stale resume_url next to a non-empty resume_docs).
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      keyToSign = resolved;
    } catch (e) {
      // A tab opened this URL itself, so the refusal is a page; `?json=1`
      // and every API caller keep the JSON body they already handle.
      const asPage = searchParams.get("json") !== "1" && prefersHtml(req);
      if (e instanceof ResumeRedactionsOutOfStepError) {
        // Fail closed: the bars and the list disagree, so no document on
        // this row is served until the owner's next save lines them up.
        console.error("[resume GET] redactions out of step", ownerId);
        const headers = { ...NO_STORE, "retry-after": "60" };
        return asPage
          ? unavailablePage(503, headers)
          : NextResponse.json(
              { ok: false, error: "This document is being updated. Try again later." },
              { status: 503, headers },
            );
      }
      console.error("[resume GET] redacted derivative", e);
      const headers = { ...NO_STORE, "retry-after": "5" };
      return asPage
        ? unavailablePage(503, headers)
        : NextResponse.json(
            { ok: false, error: "Document is being prepared" },
            { status: 503, headers },
          );
    }
  }

  let signed: string;
  try {
    signed = await signResumeGetUrl(keyToSign, SIGNED_TTL_SEC);
  } catch (e) {
    console.error("[resume GET] sign", e);
    return NextResponse.json(
      { ok: false, error: "Could not sign document" },
      { status: 500 },
    );
  }

  if (searchParams.get("json") === "1") {
    return NextResponse.json(
      { ok: true, url: signed, expiresIn: SIGNED_TTL_SEC },
      { headers: NO_STORE },
    );
  }
  return NextResponse.redirect(signed, { status: 307, headers: NO_STORE });
}
