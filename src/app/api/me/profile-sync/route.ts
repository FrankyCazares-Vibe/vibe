import { NextResponse } from "next/server";

import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { isMissingColumnError } from "@/lib/db/missing-column";
import { isSupabaseHttpsUrl } from "@/lib/org-asset-url";
import { normalizeCoverThemeInput } from "@/lib/profile/cover-themes";
import { sanitizeCurrentOn } from "@/lib/profile/current-on";
import { normalizeProfileView } from "@/lib/profile/normalize-profile-view";
import {
  PUBLIC_PROFILE_CAMPUS_COLUMNS,
  campusReadUnavailable,
  campusWriteFailed,
  decideProfileCampusWrite,
  readCampusIntent,
  readCampusWriteRow,
  type CampusWriteDecision,
} from "@/lib/profile/profile-campus-write";
import { parseLookingForBody } from "@/lib/profile/looking-for";
import { normalizeResumeRef, resumeKeyOwnerId } from "@/lib/profile/resume-doc-url";
import { sanitizeResumeDocs } from "@/lib/profile/resume-docs";
import {
  bindRedactionsKeepingCoverage,
  remapRedactionsToDocs,
  repairUnlistedRedactions,
  resumePortfolioRefList,
  sameRedactions,
  sanitizeResumeRedactions,
  type RedactionBar,
} from "@/lib/profile/resume-redactions";
import {
  deleteResumeObjects,
  purgeRedactedDerivatives,
  resolveResumeUrlInput,
  resumeKeysReferenced,
} from "@/lib/profile/resume-storage";
import { unexpectedSelfWriteKeys } from "@/lib/profile/self-write-columns";
import { inlineOrUploadProfileUrl } from "@/lib/profile/storage-upload";
import { sanitizeWorkExperience } from "@/lib/profile/work-experience";
import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** The profile echoed back to the client, without the campus columns. */
const SYNC_PROFILE_SELECT =
  "id,email,name,handle,school,school_email,school_verified,year,major,department,bio,tagline,website,headline,location_text,banner_gradient,avatar_url,banner_url,resume_url,resume_docs,interests,skills,looking_for,work_experience,work_order_manual,current_on,resume_redactions";

type ProfileRowRead = {
  data: Record<string, unknown> | null;
  error: { code?: string | null; message?: string | null } | null;
};

/**
 * The only way to clear a photo, the cover photo or the single resume link.
 * A client that caches the profile (the desktop page keeps a copy in
 * localStorage) sends `null` or "" for whatever its copy lacks, and that
 * copy can predate a photo added on the phone. So an absent, null or empty
 * `avatar_url` / `banner_url` / `resume_url` now leaves the column alone,
 * and the deliberate remove flows name what they clear:
 * `remove: ["banner"]`. Clearing `resume_url` also deletes the stored file
 * (the orphan cleanup below), so it must never happen by accident.
 */
const REMOVABLE_MEDIA = ["avatar", "banner", "resume"] as const;
type RemovableMedia = (typeof REMOVABLE_MEDIA)[number];

/** Absent → nothing removed; anything but a list of known names → null. */
function parseRemoveList(value: unknown): Set<RemovableMedia> | null {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || value.length > REMOVABLE_MEDIA.length) return null;
  const out = new Set<RemovableMedia>();
  for (const x of value) {
    if (typeof x !== "string" || !(REMOVABLE_MEDIA as readonly string[]).includes(x)) return null;
    out.add(x as RemovableMedia);
  }
  return out;
}

/** A value that asks to set the field: a non-empty string. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * The resume columns as stored, with the exact jsonb text of the two lists.
 * The write compares against that text (compare-and-set): a number read into
 * JS and written back can come out with different digits, so the parsed copy
 * can't be used for the comparison.
 */
type ResumeSnapshot = {
  found: boolean;
  resume_url: string | null;
  resume_docs: unknown;
  resume_redactions: unknown;
  docsText: string | null;
  barsText: string | null;
};

/** Null when the read failed. A missing row reads as empty. */
async function readResumeSnapshot(userId: string): Promise<ResumeSnapshot | null> {
  try {
    const { data, error } = await createSupabaseServiceClient()
      .from("users")
      .select("resume_url, docs_text:resume_docs::text, bars_text:resume_redactions::text")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("[profile-sync] resume read", error.message);
      return null;
    }
    if (!data) {
      return {
        found: false,
        resume_url: null,
        resume_docs: [],
        resume_redactions: [],
        docsText: null,
        barsText: null,
      };
    }
    const row = data as { resume_url: unknown; docs_text: unknown; bars_text: unknown };
    const docsText = typeof row.docs_text === "string" ? row.docs_text : null;
    const barsText = typeof row.bars_text === "string" ? row.bars_text : null;
    return {
      found: true,
      resume_url: typeof row.resume_url === "string" ? row.resume_url : null,
      resume_docs: docsText === null ? [] : JSON.parse(docsText),
      resume_redactions: barsText === null ? [] : JSON.parse(barsText),
      docsText,
      barsText,
    };
  } catch (e) {
    console.error("[profile-sync] resume read threw", e);
    return null;
  }
}

/** The API gateway refuses request lines past about 8 KB, and the compare-
 *  and-set rides in the URL. A row whose resume columns don't fit re-reads
 *  them right before the write instead: one round trip of exposure. */
const RESUME_GUARD_MAX_CHARS = 4000;
const RESUME_WRITE_ATTEMPTS = 3;

type ResumeGuard = { url: string | null; docs: string; bars: string };

function resumeWriteGuard(s: ResumeSnapshot): ResumeGuard | null {
  if (!s.found || s.docsText === null || s.barsText === null) return null;
  const size = new URLSearchParams({
    u: `eq.${s.resume_url ?? ""}`,
    d: `eq.${s.docsText}`,
    r: `eq.${s.barsText}`,
  }).toString().length;
  if (size > RESUME_GUARD_MAX_CHARS) return null;
  return { url: s.resume_url, docs: s.docsText, bars: s.barsText };
}

/**
 * A row whose bars cover a document it no longer lists makes the file route
 * refuse other students every hosted document on it (fail closed). profile-
 * sync never writes that, but another route can (PATCH /api/me/profile sets
 * resume_url without moving bars). When the only unmatched bars are keyed to
 * an unlisted document, they protect nothing, so the owner's next save of
 * anything drops them (compare-and-set: skipped if the row moved meanwhile).
 * Anything less certain stays closed. Updates `row` for the echo.
 */
async function repairOutOfStepRedactions(
  row: Record<string, unknown>,
  userId: string,
): Promise<void> {
  try {
    const url = normalizeResumeRef(row.resume_url, userId);
    const refs = resumePortfolioRefList(sanitizeResumeDocs(row.resume_docs, userId), url);
    const fixed = repairUnlistedRedactions(
      sanitizeResumeRedactions(row.resume_redactions, { strict: true }),
      refs,
      (ref) => normalizeResumeRef(ref, userId),
    );
    if (!fixed) return;
    const guard = resumeWriteGuard({
      found: true,
      resume_url: typeof row.resume_url === "string" ? row.resume_url : null,
      resume_docs: row.resume_docs,
      resume_redactions: row.resume_redactions,
      docsText: JSON.stringify(row.resume_docs ?? []),
      barsText: JSON.stringify(row.resume_redactions ?? []),
    });
    if (!guard) return;
    let q = createSupabaseServiceClient()
      .from("users")
      .update({ resume_redactions: fixed })
      .eq("id", userId);
    q = guard.url === null ? q.is("resume_url", null) : q.eq("resume_url", guard.url);
    const { data, error } = await q
      .eq("resume_docs", guard.docs)
      .eq("resume_redactions", guard.bars)
      .select("id");
    if (error || !data || data.length === 0) return;
    row.resume_redactions = fixed;
    const n = await purgeRedactedDerivatives(userId);
    console.log(`[profile-sync] repaired out-of-step redactions (purged ${n})`);
  } catch (e) {
    console.error("[profile-sync] redaction repair", e);
  }
}

/**
 * Profile sync from `public/html/profile.html` and the phone profile
 * (authenticated, same-origin). Accepts vibe-shaped fields, each optional:
 * an absent field is left alone. The profile edit forms send only what the
 * student changed; a list save (the phone's resume docs, work, "Working on")
 * sends the whole list as that page has it. Uploads `data:` images to
 * Supabase Storage. Photo, cover photo and resume link are cleared only
 * through `remove` (REMOVABLE_MEDIA).
 *
 * Every column is validated here and written with the SERVICE role, scoped to
 * the caller's own id, in one statement guarded by the closed column list in
 * `self-write-columns.ts` (migration 20260922130000 takes skills, interests,
 * work_experience and looking_for off the `authenticated` UPDATE grant). The
 * cookie client is used for `getUser` only.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Every request. Desktop autosave debounces 1.2 s and mobile posts on Save
  // only, so 300 per 10 minutes is far above real use. The upload limiter
  // below still applies on top.
  const rl = await rateLimit(`profile-sync:${user.id}`, { limit: 300, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const removing = parseRemoveList(body.remove);
  if (removing === null) {
    return NextResponse.json({ ok: false, error: "Invalid remove" }, { status: 400 });
  }
  // A new value and a removal of the same field in one request can't both
  // be meant; no client sends that, so it is a slip, not a guess to make.
  for (const [kind, key] of [
    ["avatar", "avatar_url"],
    ["banner", "banner_url"],
    ["resume", "resume_url"],
  ] as const) {
    if (removing.has(kind) && isNonEmptyString(body[key])) {
      return NextResponse.json({ ok: false, error: "Invalid remove" }, { status: 400 });
    }
  }

  // Only inline `data:` payloads hit Storage (avatar / banner → `profiles`,
  // resume → `resumes`), so only those are throttled — plain text edits
  // must never be blocked by the upload budget.
  const hasInlineUpload = [body.avatar_url, body.banner_url, body.resume_url].some(
    (v) => typeof v === "string" && /^data:/i.test(v.trim()),
  );
  if (hasInlineUpload) {
    const uploadRl = await rateLimit(`upload:profile-sync:${user.id}`, {
      limit: 20,
      windowSec: 600,
    });
    if (!uploadRl.allowed) return tooManyRequests(uploadRl);
  }

  const patch: Record<string, unknown> = {};
  // avatar_url / banner_url are no longer UPDATE-granted to `authenticated`
  // (migration 20260912102000), so they are collected separately here and
  // written with the service role alongside banner_gradient further down.
  const mediaPatch: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const t = body.name.trim().slice(0, 120);
    if (t) patch.name = t;
  }

  for (const [key, max] of [
    ["tagline", 500],
    ["website", 2048],
    ["headline", 500],
    ["location_text", 300],
    ["bio", 4000],
  ] as const) {
    if (typeof body[key] === "string") {
      patch[key] = body[key].trim().slice(0, max);
    }
  }

  if (typeof body.major === "string") {
    patch.major = body.major.trim().slice(0, 200);
  }

  // Self-declared campus — the same two shapes, and the same rules, as
  // PATCH /api/me/profile (see the long comment there and critic A4).
  // profile.html and ProfileMobile send the legacy `school` label on EVERY
  // save, so re-sending the current campus (or "") must change nothing: it
  // must never re-arm the 30-day clock, never confirm a backfilled campus,
  // and never fail the save. The write goes through the service role below.
  const campusTouched = readCampusIntent(body).kind !== "absent";
  let campusDecision: CampusWriteDecision = { kind: "absent" };
  if (campusTouched) {
    const read = await readCampusWriteRow(createSupabaseServiceClient(), user.id);
    campusDecision = read.ok
      ? decideProfileCampusWrite({
          body,
          row: read.row,
          onboarded: isOttoOnboardingComplete(read.row.otto_answers),
        })
      : campusReadUnavailable();
  }

  if ("year" in body) {
    const y = body.year;
    if (y === null) {
      patch.year = null;
    } else if (typeof y === "number" && Number.isInteger(y) && y >= 1 && y <= 12) {
      patch.year = y;
    } else {
      return NextResponse.json(
        { ok: false, error: "year must be null or integer 1-12" },
        { status: 400 },
      );
    }
  }

  // headline is a derived field — buildVibeUserV1FromProfile prefers a
  // stored headline over the derived "<major> · Year <n>" string. So
  // when major or year change, clear the stored headline (unless the
  // request explicitly sent a new one) so the next bootstrap rebuilds
  // it from the fresh major + year.
  if (
    (patch.major !== undefined || patch.year !== undefined) &&
    patch.headline === undefined
  ) {
    patch.headline = "";
  }

  if ("interests" in body) {
    if (!Array.isArray(body.interests)) {
      return NextResponse.json({ ok: false, error: "Invalid interests" }, { status: 400 });
    }
    const interests: string[] = [];
    for (const x of body.interests) {
      if (typeof x !== "string") {
        return NextResponse.json({ ok: false, error: "Invalid interests" }, { status: 400 });
      }
      const t = x.trim().slice(0, 80);
      if (t) interests.push(t);
      if (interests.length >= 40) break;
    }
    patch.interests = interests;
  }

  if ("skills" in body) {
    if (!Array.isArray(body.skills)) {
      return NextResponse.json({ ok: false, error: "Invalid skills" }, { status: 400 });
    }
    const skills: string[] = [];
    for (const x of body.skills) {
      if (typeof x !== "string") {
        return NextResponse.json({ ok: false, error: "Invalid skills" }, { status: 400 });
      }
      const t = x.trim().slice(0, 80);
      if (t) skills.push(t);
      if (skills.length >= 60) break;
    }
    patch.skills = skills;
  }

  // "What are you here for?" tokens. Absent key = column untouched: the
  // desktop sends it only after a chip click, so a cached profile that
  // predates the field can never wipe the stored answer. `null` clears it.
  if ("looking_for" in body) {
    const lookingFor = parseLookingForBody(body.looking_for);
    if (lookingFor === null) {
      return NextResponse.json({ ok: false, error: "Invalid looking_for" }, { status: 400 });
    }
    if (lookingFor !== undefined) patch.looking_for = lookingFor;
  }

  if ("work_experience" in body) {
    patch.work_experience = sanitizeWorkExperience(body.work_experience);
  }

  // Manual-order override flag. Accepted under either snake_case (the
  // server-side column) or camelCase (the localStorage key on
  // profile.html). Stored as a plain boolean column on `users`.
  if ("work_order_manual" in body || "_workOrderManual" in body) {
    const raw =
      "work_order_manual" in body
        ? body.work_order_manual
        : (body as Record<string, unknown>)._workOrderManual;
    patch.work_order_manual = raw === true;
  }

  // "Working on" / "Currently into" items — accepted under either the
  // server-side snake_case key OR the profile.html camelCase key
  // (currentlyOn) so the existing payload builder doesn't have to know
  // about the rename. Sanitizer caps length + item count so the column
  // can't grow unbounded.
  if ("current_on" in body || "currentlyOn" in body) {
    const raw = "current_on" in body ? body.current_on : body.currentlyOn;
    patch.current_on = sanitizeCurrentOn(raw);
  }

  // Resume / portfolio redaction bars — same dual-key acceptance.
  // Sanitizer enforces percentage ranges + caps bar count. Each bar is bound
  // to its document further down (applyBars), once the list being stored is
  // known; only the bound bars go into `patch`.
  let requestBars: RedactionBar[] | null = null;
  if ("resume_redactions" in body || "resumeRedactions" in body) {
    const raw =
      "resume_redactions" in body
        ? body.resume_redactions
        : body.resumeRedactions;
    requestBars = sanitizeResumeRedactions(raw);
  }

  // The professional snapshot card is gone. Desktop bundles cached before
  // that still send its field on every save, so the field is ignored: never
  // written and never a 400.

  // An uploaded `data:` payload comes back as a public URL on our own
  // Supabase host; a plain http(s) string is passed straight through by
  // inlineOrUploadProfileUrl, which accepts ANY host. That value is rendered
  // into a CSS `url()` on other students' screens, so it is pinned to our
  // host here — the same pin org assets already use. Only a non-empty
  // string sets the photo: inlineOrUploadProfileUrl answers null for null,
  // "", garbage AND a failed upload, and none of those may clear a real
  // photo. Clearing takes `remove: ["avatar"]` (see REMOVABLE_MEDIA).
  if (isNonEmptyString(body.avatar_url)) {
    const avatar = await inlineOrUploadProfileUrl(user.id, body.avatar_url, "avatar");
    if (typeof avatar !== "string" || !isSupabaseHttpsUrl(avatar)) {
      return NextResponse.json({ ok: false, error: "Invalid avatar_url" }, { status: 400 });
    }
    mediaPatch.avatar_url = avatar;
  } else if (removing.has("avatar")) {
    mediaPatch.avatar_url = null;
  }

  // Resume objects live in the PRIVATE `resumes` bucket and are stored as
  // `/api/resume/<key>` proxy paths. Snapshot the current refs BEFORE the
  // update so we can delete objects this request un-references: repeated
  // uploads left 37 orphaned, un-redacted PDFs in prod in one month.
  // resume_url counts as touched only when this request sets or removes
  // it; a stale `resume_url: null` changes nothing, so it deletes nothing.
  const setsResumeUrl = isNonEmptyString(body.resume_url);
  const touchesResume = setsResumeUrl || removing.has("resume") || "resume_docs" in body;
  // Redaction bars change which DERIVATIVE viewers must be served, so the
  // pre-read also snapshots them (see the derivative purge below). It is no
  // longer best-effort: binding bars to documents needs the stored list and
  // bars, and a list change written without moving its bars is exactly how
  // one document's bars slid onto another. No pre-read, no resume write.
  // The write below is a compare-and-set against this snapshot, and a retry
  // re-reads it, so it is `let`.
  const touchesRedactions = requestBars !== null;
  const failed = () =>
    NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  let resumeBefore: ResumeSnapshot | null = null;
  if (touchesResume || touchesRedactions) {
    resumeBefore = await readResumeSnapshot(user.id);
    if (!resumeBefore) return failed();
  }

  // data: URL → uploaded to `resumes`; proxy / legacy / external refs are
  // re-validated against user.id (own-bucket keys must carry our prefix).
  // resolveResumeUrlInput answers null for a failed upload or a ref that
  // isn't ours, which used to clear the column and then delete the stored
  // file. A failed upload is now a refusal (the student has to know it
  // didn't save); any other ref we can't vouch for leaves the column as it
  // is, since a cached copy may simply be echoing an old link back. Only
  // `remove: ["resume"]` clears.
  if (setsResumeUrl) {
    const resume = await resolveResumeUrlInput(user.id, body.resume_url);
    if (typeof resume === "string") {
      patch.resume_url = resume;
    } else if (/^data:/i.test(String(body.resume_url).trim())) {
      return NextResponse.json({ ok: false, error: "Invalid resume_url" }, { status: 400 });
    }
  } else if (removing.has("resume")) {
    patch.resume_url = null;
  }

  // Multi-doc resume array — preferred over the single resume_url.
  // Pure data field; uploads already happened client-side via
  // /api/me/profile-upload, so this only persists refs.
  if ("resume_docs" in body) {
    patch.resume_docs = sanitizeResumeDocs(body.resume_docs, user.id);
  }

  // When the request carries its own list, an unkeyed bar's docIndex is a
  // position in THAT list. The server drops entries it can't store (a data:
  // url, a foreign key, past the cap), so each entry is sanitised on its own
  // to line the two lists up: null marks an entry that won't be stored.
  const clientRefs = Array.isArray(body.resume_docs)
    ? body.resume_docs
        .slice(0, 64)
        .map((d: unknown) => sanitizeResumeDocs([d], user.id)[0]?.url ?? null)
    : undefined;
  const canonicalRef = (ref: string) => normalizeResumeRef(ref, user.id);

  // Bind the bars to the documents they cover (C2). Every stored bar ends up
  // with a `docKey` (the document's stored url) and the matching `docIndex`
  // in the list being stored, so a reader can never pair a bar with the
  // wrong file:
  //   - bars sent in this request: a docKey names the document (dropped if
  //     it is not in the list); an unkeyed bar identical to a stored one is
  //     that bar (an old page shifts positions); otherwise its position,
  //     in the request's own list when it sent one (bindRedactionsToDocs);
  //   - and when ANY bar in the request names no document while more than one
  //     document is stored, those positions can't be trusted to mean what
  //     they say: the request may add and move bars but not take coverage
  //     away, so every stored bar it would have dropped is kept
  //     (bindRedactionsKeepingCoverage) — a pre-deploy desktop tab removing
  //     a document used to leave that document listed with none of its bars,
  //     and other students got it in the original;
  //   - a list change WITHOUT bars (the phone's delete): the stored bars
  //     move with their documents, and go with a removed one.
  // A re-map lands in `patch`, so the derivative purge below sees it. Runs
  // again against a fresh read when the compare-and-set write loses a race.
  let mirroredResumeUrl = false;
  const applyBars = (before: ResumeSnapshot) => {
    const docsBefore = sanitizeResumeDocs(before.resume_docs, user.id);
    const urlBefore = normalizeResumeRef(before.resume_url, user.id);
    const prevRefs = resumePortfolioRefList(docsBefore, urlBefore);
    // A list change that leaves resume_url behind (an older phone build's
    // delete sends the list alone): resume_url follows the list's first
    // document. Left stale, it came back as a live document once the list
    // emptied, after its bars had gone with it, and was served in full.
    if (mirroredResumeUrl) {
      delete patch.resume_url;
      mirroredResumeUrl = false;
    }
    if (
      "resume_docs" in patch &&
      !("resume_url" in patch) &&
      docsBefore.length > 0 &&
      urlBefore
    ) {
      const nextDocs = patch.resume_docs as typeof docsBefore;
      if (!nextDocs.some((d) => d.url === urlBefore)) {
        patch.resume_url = nextDocs[0]?.url ?? null;
        mirroredResumeUrl = true;
      }
    }
    const nextRefs = resumePortfolioRefList(
      "resume_docs" in patch ? (patch.resume_docs as typeof docsBefore) : docsBefore,
      "resume_url" in patch ? (patch.resume_url as string | null) : urlBefore,
    );
    const stored = sanitizeResumeRedactions(before.resume_redactions);
    if (requestBars) {
      patch.resume_redactions = bindRedactionsKeepingCoverage(
        requestBars,
        nextRefs,
        prevRefs,
        {
          canonicalRef,
          clientRefs,
          storedBars: remapRedactionsToDocs(stored, prevRefs, prevRefs, canonicalRef),
        },
      );
      return;
    }
    const moved = remapRedactionsToDocs(stored, prevRefs, nextRefs, canonicalRef);
    if (sameRedactions(stored, moved)) delete patch.resume_redactions;
    else patch.resume_redactions = moved;
  };
  if (resumeBefore) applyBars(resumeBefore);

  // Cover: an uploaded photo wins; otherwise a cover-theme preset KEY.
  // users.banner_gradient holds a key, never CSS (migration 20260912100000
  // CHECKs the key and takes the column off the authenticated UPDATE grant),
  // so it is written with the service role further down and a raw CSS value
  // from an older client is accepted only when it is exactly one of the
  // presets.
  //
  // A theme key on its own no longer clears the photo: the desktop page
  // used to send its cached theme with every save, so one save from a
  // stale copy wiped a cover photo added on the phone. The theme is stored
  // either way (a photo still wins on screen), and the photo goes only with
  // `remove: ["banner"]`, which the desktop sends when the student picks a
  // theme. Removing with no theme leaves the default cover, as `null` did.
  let coverThemePatch: string | undefined;
  const bu = body.banner_url;
  if (isNonEmptyString(bu)) {
    const resolved = await inlineOrUploadProfileUrl(user.id, bu, "banner");
    // Same host pin as the avatar above: an uploaded photo resolves to our
    // own Supabase host, and an arbitrary http(s) link must not become a
    // CSS `url()` fetch on every viewer's screen.
    if (resolved === undefined || resolved === null || !isSupabaseHttpsUrl(resolved)) {
      return NextResponse.json({ ok: false, error: "Invalid banner" }, { status: 400 });
    }
    mediaPatch.banner_url = resolved;
    coverThemePatch = "";
  } else {
    const bgKey =
      typeof body.banner_gradient === "string"
        ? normalizeCoverThemeInput(body.banner_gradient)
        : "";
    if (bgKey === null) {
      return NextResponse.json(
        { ok: false, error: "Invalid banner_gradient" },
        { status: 400 },
      );
    }
    if (bgKey !== "") coverThemePatch = bgKey;
    if (removing.has("banner")) {
      mediaPatch.banner_url = null;
      if (coverThemePatch === undefined) coverThemePatch = "";
    }
  }

  if (
    Object.keys(patch).length === 0 &&
    Object.keys(mediaPatch).length === 0 &&
    coverThemePatch === undefined &&
    !campusTouched
  ) {
    return NextResponse.json({ ok: false, error: "No valid fields to update" }, { status: 400 });
  }

  // ONE service-role statement for every profile column, scoped to the
  // caller's own id. Several of these columns are no longer UPDATE-granted
  // to `authenticated` (banner_gradient: 20260912100000; avatar_url /
  // banner_url: 20260912102000; skills, interests, work_experience,
  // looking_for: 20260922130000), and one statement means the fields can
  // never half-apply against each other. The service role passes every
  // grant, so the closed list in `self-write-columns.ts` stands in front of
  // it: a key outside the list is a coding slip and fails the save.
  const buildWritePatch = (): Record<string, unknown> => {
    const w: Record<string, unknown> = { ...patch, ...mediaPatch };
    if (coverThemePatch !== undefined) w.banner_gradient = coverThemePatch;
    return w;
  };
  let writePatch = buildWritePatch();

  // Resume writes are a compare-and-set on resume_url, resume_docs and
  // resume_redactions as snapshotted above. The bars written were worked out
  // from that snapshot; if another save (the phone drawing a bar while this
  // request deletes a document) changed any of the three in between,
  // writing anyway would put back the older bars and drop the newer one, or
  // key a bar to a document that is gone. On a lost race: re-read, bind
  // again, retry; after RESUME_WRITE_ATTEMPTS, 409.
  const refresh = async (): Promise<boolean> => {
    const fresh = await readResumeSnapshot(user.id);
    if (!fresh) return false;
    resumeBefore = fresh;
    applyBars(fresh);
    writePatch = buildWritePatch();
    return true;
  };
  let guardTooLong = false;
  for (let attempt = 1; Object.keys(writePatch).length > 0; attempt++) {
    const bad = unexpectedSelfWriteKeys(writePatch);
    if (bad.length > 0) {
      console.error("[profile-sync POST] unexpected columns", bad);
      return failed();
    }
    const guard = resumeBefore && !guardTooLong ? resumeWriteGuard(resumeBefore) : null;
    if (resumeBefore?.found && !guard && attempt === 1) {
      // Too long to compare in the URL: shrink the window to one round trip
      // by re-reading and binding again right before an unguarded write.
      if (!(await refresh())) return failed();
      if (Object.keys(writePatch).length === 0) break;
    }
    let q = createSupabaseServiceClient().from("users").update(writePatch).eq("id", user.id);
    if (guard) {
      q = guard.url === null ? q.is("resume_url", null) : q.eq("resume_url", guard.url);
      q = q.eq("resume_docs", guard.docs).eq("resume_redactions", guard.bars);
    }
    const { data: written, error: upErr, status } = await q.select("id");
    if (upErr) {
      if (guard && status === 414) {
        // The gateway's URL limit is lower than RESUME_GUARD_MAX_CHARS allows for.
        console.error("[profile-sync POST] resume guard too long for the gateway");
        guardTooLong = true;
        if (!(await refresh())) return failed();
        continue;
      }
      console.error("[profile-sync POST]", upErr);
      return failed();
    }
    if (!guard || (written ?? []).length > 0) break;
    if (attempt >= RESUME_WRITE_ATTEMPTS) {
      return NextResponse.json(
        { ok: false, error: "Your documents changed on another device. Reload and try again." },
        { status: 409 },
      );
    }
    if (!(await refresh())) return failed();
  }

  // Campus + its stamp + the dual-written legacy label, in one service-role
  // statement (no UPDATE grant on the campus columns).
  if (campusDecision.kind === "write") {
    const { error: campusErr } = await createSupabaseServiceClient()
      .from("users")
      .update(campusDecision.patch)
      .eq("id", user.id);
    if (campusErr) {
      console.error("[profile-sync POST campus]", campusErr);
      campusDecision = campusWriteFailed(campusErr);
    }
  }

  // Same rule as PATCH /api/me/profile: a campus rejection never fails the
  // fields that saved. With other fields written the response stays ok and
  // carries `campusError` — desktop skips the bootstrap adoption on a failed
  // sync, so a non-ok here would leave the stale campus in its payload and
  // fail every later save (critic A4).
  const campusError = campusDecision.kind === "reject" ? campusDecision.rejection : null;
  const wroteOtherFields = Object.keys(writePatch).length > 0;
  if (campusError && !wroteOtherFields) {
    return NextResponse.json(
      {
        ok: false,
        code: campusError.code,
        error: campusError.error,
        ...(campusError.availableAt ? { availableAt: campusError.availableAt } : {}),
      },
      { status: campusError.status },
    );
  }

  // Best-effort orphan cleanup: keys referenced before the update but not
  // after, restricted to objects under this user's own prefix. Failures
  // are logged and never fail the request.
  if (touchesResume && resumeBefore) {
    try {
      const before = resumeKeysReferenced(resumeBefore.resume_url, resumeBefore.resume_docs);
      const after = resumeKeysReferenced(
        "resume_url" in patch ? patch.resume_url : resumeBefore.resume_url,
        "resume_docs" in patch ? patch.resume_docs : resumeBefore.resume_docs,
      );
      const orphans = [...before].filter(
        (k) => !after.has(k) && resumeKeyOwnerId(k) === user.id,
      );
      if (orphans.length > 0) {
        await deleteResumeObjects(orphans);
        console.log(`[profile-sync] removed ${orphans.length} un-referenced resume object(s)`);
      }
    } catch (e) {
      console.error("[profile-sync] resume orphan cleanup", e);
    }
  }

  // Best-effort derivative invalidation: viewers are served burned-in
  // copies under `<uid>/redacted/` keyed by (source key, bars). Whenever
  // the docs, the legacy resume_url or the bars actually change, drop
  // every derivative so the next viewer request regenerates it lazily.
  // Bars moved by a list change count: their docKey / docIndex differ.
  if (touchesResume || touchesRedactions) {
    try {
      let changed = true;
      if (resumeBefore) {
        const canon = (docs: unknown, url: unknown, bars: unknown) =>
          JSON.stringify([
            sanitizeResumeDocs(docs, user.id),
            normalizeResumeRef(url, user.id),
            sanitizeResumeRedactions(bars),
          ]);
        const before = canon(
          resumeBefore.resume_docs,
          resumeBefore.resume_url,
          resumeBefore.resume_redactions,
        );
        const after = canon(
          "resume_docs" in patch ? patch.resume_docs : resumeBefore.resume_docs,
          "resume_url" in patch ? patch.resume_url : resumeBefore.resume_url,
          "resume_redactions" in patch
            ? patch.resume_redactions
            : resumeBefore.resume_redactions,
        );
        changed = before !== after;
      }
      if (changed) {
        const n = await purgeRedactedDerivatives(user.id);
        if (n > 0) console.log(`[profile-sync] purged ${n} redacted derivative(s)`);
      }
    } catch (e) {
      console.error("[profile-sync] redacted derivative purge", e);
    }
  }

  // email / school_email are private columns (no RLS read); self-read via
  // the service role scoped to the caller's id. The campus columns are asked
  // for too, so the echoed `profile` reports the campus this request just
  // wrote instead of a flat null (normalizeProfileView always emits both
  // fields); before migration M1 they don't exist, so a missing-column error
  // — and only that — retries without them.
  const echoService = createSupabaseServiceClient();
  let { data: row, error: selErr } = (await echoService
    .from("users")
    .select(`${SYNC_PROFILE_SELECT},${PUBLIC_PROFILE_CAMPUS_COLUMNS}`)
    .eq("id", user.id)
    .single()) as ProfileRowRead;
  if (selErr && isMissingColumnError(selErr)) {
    ({ data: row, error: selErr } = (await echoService
      .from("users")
      .select(SYNC_PROFILE_SELECT)
      .eq("id", user.id)
      .single()) as ProfileRowRead);
  }

  if (selErr || !row) {
    return NextResponse.json({ ok: true, profile: null, ...(campusError ? { campusError } : {}) });
  }

  // The echo already holds the resume columns: if the bars are out of step
  // with the list (other students are being refused every hosted document),
  // fix what can be fixed safely now instead of waiting for a resume save.
  await repairOutOfStepRedactions(row, user.id);

  return NextResponse.json({
    ok: true,
    profile: normalizeProfileView(row as Record<string, unknown>),
    ...(campusError ? { campusError } : {}),
  });
}
