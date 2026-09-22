/** A single redaction bar drawn over a resume / portfolio page.
 *  Coordinates are percentages (0–100) of the page wrap the bar lives
 *  on, so the bar reflows correctly when the viewer is resized.
 *
 *  Which document a bar covers: `docKey` is that document's `url` exactly
 *  as stored in `users.resume_docs[i].url` (a `/api/resume/<key>` proxy path
 *  or an external link), or `users.resume_url` for a row with no docs list.
 *  `docIndex` is the document's position in that list; profile-sync keeps
 *  the two in step on every write. A bar without `docKey` was written before
 *  the key existed and is matched by position only (a "legacy" bar).
 *
 *  Binding by position alone let a bar slide onto a different document when
 *  one was removed, and the document it had covered was then served to other
 *  students without its bars. Readers now match by `docKey` first, and refuse
 *  every hosted document on a row whose bars and list are out of step.
 *
 *  This module has no imports so `node --test` can load it directly. */
export type RedactionBar = {
  docIndex: number;
  docKey?: string;
  pageNumber: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Cap so a runaway client can't flood the column. 200 is well above
 *  anything a real user draws on a 1-2 page resume. */
const MAX_BARS = 200;

/** Same cap as a stored external resume link (resume-doc-url.ts). */
const MAX_DOC_KEY_LEN = 2048;

function clampPct(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function asInt(n: unknown, min: number): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= min ? i : null;
}

/** A docKey has to be something a document list can hold: our proxy path or
 *  an http(s) link. Anything else (a `data:` or `blob:` url for a file the
 *  page has not uploaded yet) names no stored document, so the bar keeps
 *  only its position, like a legacy bar. */
const STORABLE_REF_RE = /^(\/api\/resume\/|https?:\/\/)/i;

function asDocKey(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.length <= MAX_DOC_KEY_LEN && STORABLE_REF_RE.test(t) ? t : null;
}

/**
 * What a strict read puts in place of a stored docKey that is present but
 * not a storable url (profile-sync never writes one; a direct column write
 * or a bad backfill could). It can never equal a listed document, so the
 * bar counts as unmatched and the row fails closed instead of the bar
 * quietly falling back to its position and covering the wrong file.
 */
export const UNMATCHABLE_DOC_KEY = "invalid:docKey";

/** One bar in a fixed key order, so two equal sets serialise the same. */
function makeBar(
  docIndex: number,
  docKey: string | null | undefined,
  b: Pick<RedactionBar, "pageNumber" | "x" | "y" | "w" | "h">,
): RedactionBar {
  const geometry = { pageNumber: b.pageNumber, x: b.x, y: b.y, w: b.w, h: b.h };
  return docKey ? { docIndex, docKey, ...geometry } : { docIndex, ...geometry };
}

/**
 * Coerce any value into a safe array of RedactionBar. Used both on
 * row reads (defensive — older rows might not have the column
 * populated) and on POSTs from profile.html (untrusted payload).
 *
 * Drops bars that are missing required fields or have absurd
 * coordinates. Caps total length at MAX_BARS. Keeps a well-formed `docKey`;
 * a bar that has one may omit `docIndex` (profile-sync recomputes it).
 *
 * A request body may carry a docKey that names no stored document yet (the
 * `data:` url of a file the page hasn't uploaded): that bar keeps only its
 * position. Readers pass `{ strict: true }` for STORED bars, where such a
 * key can only mean the column was written out of step: the bar is kept
 * with UNMATCHABLE_DOC_KEY so `hasUnmatchedRedactions` fails the row closed.
 */
export function sanitizeResumeRedactions(
  v: unknown,
  opts: { strict?: boolean } = {},
): RedactionBar[] {
  if (!Array.isArray(v)) return [];
  const out: RedactionBar[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const hasKey = o.docKey !== undefined && o.docKey !== null;
    const docKey =
      asDocKey(o.docKey) ?? (opts.strict && hasKey ? UNMATCHABLE_DOC_KEY : null);
    const docIndex = asInt(o.docIndex, 0) ?? (docKey ? 0 : null);
    const pageNumber = asInt(o.pageNumber, 1);
    const x = clampPct(o.x);
    const y = clampPct(o.y);
    const w = clampPct(o.w);
    const h = clampPct(o.h);
    if (
      docIndex === null ||
      pageNumber === null ||
      x === null ||
      y === null ||
      w === null ||
      h === null
    ) {
      continue;
    }
    // Sub-1% bars are misclicks (matches the client-side gesture
    // filter); skip them on the way in.
    if (w < 1 || h < 1) continue;
    out.push(makeBar(docIndex, docKey, { pageNumber, x, y, w, h }));
    if (out.length >= MAX_BARS) break;
  }
  return out;
}

/**
 * The document list bars point into, in `resumePortfolio` order: the docs
 * list when it is non-empty, otherwise the single resume link, otherwise
 * nothing. Pass already-sanitised values (sanitizeResumeDocs /
 * normalizeResumeRef with the owner's id) so the strings compare exactly
 * with the docKeys profile-sync stores.
 */
export function resumePortfolioRefList(
  docs: readonly { url: string }[],
  resumeUrl: string | null | undefined,
): string[] {
  if (docs.length > 0) return docs.map((d) => d.url);
  return typeof resumeUrl === "string" && resumeUrl ? [resumeUrl] : [];
}

/** True when `bar` covers the document `ref` (one entry of `refs`). A bar
 *  with a docKey matches by key only; a legacy bar by its position. */
export function redactionBarCoversRef(
  bar: RedactionBar,
  refs: readonly string[],
  ref: string,
): boolean {
  if (bar.docKey !== undefined) return bar.docKey === ref;
  return bar.docIndex < refs.length && refs[bar.docIndex] === ref;
}

/** Every bar covering the document `ref`. The same file listed twice gets
 *  the bars of both entries. */
export function redactionsForRef(
  bars: readonly RedactionBar[],
  refs: readonly string[],
  ref: string,
): RedactionBar[] {
  return bars.filter((b) => redactionBarCoversRef(b, refs, ref));
}

/** Positions in `refs` whose document has at least one bar. */
export function redactedDocIndexes(
  bars: readonly RedactionBar[],
  refs: readonly string[],
): Set<number> {
  const out = new Set<number>();
  refs.forEach((ref, i) => {
    if (bars.some((b) => redactionBarCoversRef(b, refs, ref))) out.add(i);
  });
  return out;
}

/** Position of `ref` in `refs`, preferring `preferred` when that entry is the
 *  same document (a file listed twice keeps the copy its bar was drawn on). */
function indexOfRef(refs: readonly string[], ref: string, preferred: number): number {
  return refs[preferred] === ref ? preferred : refs.indexOf(ref);
}

/** True when the bar covers no document in `refs`. */
function isUnmatched(bar: RedactionBar, refs: readonly string[]): boolean {
  if (bar.docKey !== undefined) return !refs.includes(bar.docKey);
  return bar.docIndex >= refs.length;
}

/**
 * Fail-closed check for readers. True when any bar covers no listed
 * document: its docKey is not in the list, or a legacy bar points past the
 * end. profile-sync writes bars and list together behind a compare-and-set,
 * so this means the columns were written out of step some other way
 * (another route, a direct column write, a bad backfill). Nobody can tell
 * which document such a bar was meant for, so a non-owner gets no hosted
 * document from that row until the owner's next save repairs the bars
 * (repairUnlistedRedactions). Readers pass bars sanitised with
 * `{ strict: true }`, so an unreadable stored key counts as unmatched.
 */
export function hasUnmatchedRedactions(
  bars: readonly RedactionBar[],
  refs: readonly string[],
): boolean {
  return bars.some((b) => isUnmatched(b, refs));
}

/** One bar's identity for de-duping: the document it covers plus its place
 *  on the page. Two bars with the same id cover exactly the same pixels. */
function barId(b: RedactionBar): string {
  return JSON.stringify([b.docKey, b.pageNumber, b.x, b.y, b.w, b.h]);
}

/** Same page, same place. Bars are drawn by dragging, so their numbers are
 *  arbitrary floats: two different bars practically never share all five,
 *  and a bar echoed back unchanged by a page always does. */
function sameGeometry(a: RedactionBar, b: RedactionBar): boolean {
  return (
    a.pageNumber === b.pageNumber && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
  );
}

export type BindRedactionsOptions = {
  /** The caller's normaliser (profile-sync: normalizeResumeRef with the
   *  owner's id), so a key sent in another form still finds its entry. */
  canonicalRef?: (ref: string) => string | null;
  /** When the request carries its own document list: entry i is the stored
   *  form of the client's document i, or null when that document is not
   *  being stored. An unkeyed bar's docIndex is read against THIS list. */
  clientRefs?: readonly (string | null)[];
  /** The bars already stored, each keyed (remapRedactionsToDocs over the
   *  stored list). An unkeyed bar identical to one of them IS that bar,
   *  echoed back by a page that loaded before bars had keys. */
  storedBars?: readonly RedactionBar[];
};

/**
 * Write side, for a request that CARRIES bars: bind every bar to the list
 * being stored (`refs`). A bar that names its document (docKey) keeps it,
 * looked up exactly, then through `canonicalRef`, and is dropped when that
 * document is not in the list. A bar with no docKey is placed by, in order:
 *   1. its stored twin (same geometry) on the document the client places it
 *      on;
 *   2. its stored twin on any listed document: a page that loaded before
 *      bars had keys shifts positions when a document is removed, so its
 *      position can name the neighbouring file;
 *   3. its position: in `clientRefs` when the request carries a list (the
 *      server drops entries it can't store, so the stored list can be
 *      shorter), else in `refs`. Dropped when that names nothing stored.
 * Fail safe: a stored twin that no bar claimed, but that has the geometry
 * of an unkeyed bar sent here, is kept too (only when the same bar is on
 * two documents). Exact duplicates are merged. Every bar returned has
 * `docKey === refs[docIndex]`.
 */
export function bindRedactionsToDocs(
  bars: readonly RedactionBar[],
  refs: readonly string[],
  opts: BindRedactionsOptions = {},
): RedactionBar[] {
  const { canonicalRef, clientRefs, storedBars = [] } = opts;
  const find = (key: string, preferred: number): number => {
    const i = indexOfRef(refs, key, preferred);
    if (i >= 0 || !canonicalRef) return i;
    const canonical = canonicalRef(key);
    return canonical ? indexOfRef(refs, canonical, preferred) : -1;
  };
  const claimed = (bar: RedactionBar): string | null =>
    (clientRefs ? clientRefs[bar.docIndex] : refs[bar.docIndex]) ?? null;
  const pool: { bar: RedactionBar; key: string; used: boolean }[] = [];
  for (const bar of storedBars) {
    if (bar.docKey !== undefined && refs.includes(bar.docKey)) {
      pool.push({ bar, key: bar.docKey, used: false });
    }
  }
  /** Claim an unused stored twin of `bar` (on `key`, when given); its index. */
  const takeTwin = (bar: RedactionBar, key?: string): number => {
    const hit = pool.find(
      (p) => !p.used && sameGeometry(p.bar, bar) && (key === undefined || p.key === key),
    );
    if (!hit) return -1;
    hit.used = true;
    return indexOfRef(refs, hit.key, hit.bar.docIndex);
  };

  const index = bars.map(() => -1);
  const unkeyed: number[] = [];
  bars.forEach((bar, n) => {
    if (bar.docKey === undefined) {
      unkeyed.push(n);
      return;
    }
    index[n] = find(bar.docKey, bar.docIndex);
    if (index[n] >= 0) takeTwin(bar, refs[index[n]]);
  });
  for (const n of unkeyed) {
    const key = claimed(bars[n]);
    if (key !== null) index[n] = takeTwin(bars[n], key);
  }
  for (const n of unkeyed) {
    if (index[n] >= 0) continue;
    index[n] = takeTwin(bars[n]);
    if (index[n] >= 0) continue;
    const key = claimed(bars[n]);
    if (key !== null) index[n] = find(key, bars[n].docIndex);
  }

  const out: RedactionBar[] = [];
  const seen = new Set<string>();
  const push = (i: number, bar: RedactionBar) => {
    const b = makeBar(i, refs[i], bar);
    const id = barId(b);
    if (seen.has(id)) return;
    seen.add(id);
    out.push(b);
  };
  bars.forEach((bar, n) => {
    if (index[n] >= 0) push(index[n], bar);
  });
  for (const p of pool) {
    if (!p.used && unkeyed.some((n) => sameGeometry(bars[n], p.bar))) {
      push(indexOfRef(refs, p.key, p.bar.docIndex), p.bar);
    }
  }
  return out;
}

/**
 * True when a request's bar positions cannot be trusted to REMOVE coverage:
 * some bar in it names no document (a tab that loaded before bars had keys
 * sends positions only) while the stored list holds MORE THAN ONE document,
 * so position 0 could mean any of them. One stored document has nothing to
 * be confused with, and a request whose bars all name their document says
 * exactly what it means.
 */
export function redactionPositionsAreAmbiguous(
  bars: readonly RedactionBar[],
  prevRefs: readonly string[],
): boolean {
  return prevRefs.length > 1 && bars.some((b) => b.docKey === undefined);
}

/**
 * bindRedactionsToDocs for a save whose positions may be stale, which is the
 * one the write path uses.
 *
 * Plain English: a desktop tab that loaded before bars had keys renumbers
 * them itself when the student removes a document, and sends the new numbers
 * with no list. The server's list is the older, longer one, so those numbers
 * point at the wrong files — that is how a document kept its place in the
 * list, lost its bars, and went out to other students in the original (S64).
 * When the numbers can't be trusted we let them ADD and MOVE coverage but
 * never take it away: every stored bar this request would have dropped is
 * kept, following its own document. The row can end up with a bar the
 * student thought they had erased; the next save from an up-to-date tab
 * (whose bars name their documents) clears it. Covering too much is a
 * nuisance, covering too little is a leak.
 */
export function bindRedactionsKeepingCoverage(
  bars: readonly RedactionBar[],
  refs: readonly string[],
  prevRefs: readonly string[],
  opts: BindRedactionsOptions = {},
): RedactionBar[] {
  if (!redactionPositionsAreAmbiguous(bars, prevRefs)) {
    return bindRedactionsToDocs(bars, refs, opts);
  }
  // Positions can't be trusted, so this request gets no say in what comes
  // OFF: the row keeps every stored bar, moved to its own document, and the
  // request's bars are added on top of them. Covering too much is a nuisance
  // the student's next up-to-date save clears; covering too little is a
  // leak, in both directions — a dropped stored bar bares a file, and a
  // dropped new bar bares what they just tried to hide.
  // `storedBars: []` on the bind is deliberate: letting it match a sent bar
  // to a stored one by SHAPE is what cost a whole document its cover, since
  // the erased bar's shape matched the bar on the OTHER file (S64,
  // reproduced live).
  const out = remapRedactionsToDocs(
    opts.storedBars ?? [],
    prevRefs,
    refs,
    opts.canonicalRef,
  );
  const seen = new Set(out.map(barId));
  for (const bar of bindRedactionsToDocs(bars, refs, { ...opts, storedBars: [] })) {
    if (out.length >= MAX_BARS) break;
    const id = barId(bar);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(bar);
  }
  return out;
}

/**
 * Write side, for a request that changes the document list WITHOUT carrying
 * bars (the phone's delete sends only the new list): the stored bars move
 * with their documents. A bar with a docKey follows that document to its new
 * position; a legacy bar first takes the docKey of the document at its old
 * position in `prevRefs`. A bar whose document is gone is dropped — that
 * document is no longer listed, so no other student can open it.
 */
export function remapRedactionsToDocs(
  bars: readonly RedactionBar[],
  prevRefs: readonly string[],
  nextRefs: readonly string[],
  canonicalRef?: (ref: string) => string | null,
): RedactionBar[] {
  const out: RedactionBar[] = [];
  for (const bar of bars) {
    const key = bar.docKey ?? prevRefs[bar.docIndex];
    if (key === undefined) continue;
    let index = indexOfRef(nextRefs, key, bar.docIndex);
    if (index < 0 && canonicalRef) {
      const canonical = canonicalRef(key);
      if (canonical) index = indexOfRef(nextRefs, canonical, bar.docIndex);
    }
    if (index < 0) continue;
    out.push(makeBar(index, nextRefs[index], bar));
  }
  return out;
}

/**
 * Repair for a row whose stored bars are out of step with its list (read
 * with `{ strict: true }`). When every unmatched bar is keyed to a document
 * that is no longer listed, those bars protect nothing (no one else can open
 * an unlisted document), so they are dropped and the rest are keyed to the
 * list; the row then stops failing closed. Null when there is nothing to
 * repair, or when an unmatched bar can't be placed safely (a legacy bar past
 * the end of the list, an unreadable key): that row stays closed until its
 * owner saves the bars again.
 */
export function repairUnlistedRedactions(
  bars: readonly RedactionBar[],
  refs: readonly string[],
  canonicalRef?: (ref: string) => string | null,
): RedactionBar[] | null {
  if (!hasUnmatchedRedactions(bars, refs)) return null;
  const unsafe = bars.some((b) =>
    b.docKey === undefined ? b.docIndex >= refs.length : b.docKey === UNMATCHABLE_DOC_KEY,
  );
  return unsafe ? null : remapRedactionsToDocs(bars, refs, refs, canonicalRef);
}

/**
 * For a one-off backfill (nothing runs it automatically): give a row's
 * legacy bars the docKey of the document at their current position. Bars
 * that already have a docKey are kept as they are, and a legacy bar that
 * points past the end of the list is KEPT without a key, so the row keeps
 * failing closed until a person looks at it. `changed` says whether the
 * column needs writing; `unmatched` counts bars that cover no document.
 *
 * `review` is true when a legacy bar was keyed on a list of more than one
 * document. Its position is the only evidence of which file it covers, and
 * the old position-only bugs may already have moved it onto a neighbour;
 * stamping would make that permanent. Report those rows for a person to
 * check against the pages instead of writing them blindly.
 */
export function stampRedactionDocKeys(
  bars: readonly RedactionBar[],
  refs: readonly string[],
): { bars: RedactionBar[]; changed: boolean; unmatched: number; review: boolean } {
  let changed = false;
  let unmatched = 0;
  let review = false;
  const out = bars.map((bar) => {
    if (isUnmatched(bar, refs)) {
      unmatched += 1;
      return makeBar(bar.docIndex, bar.docKey, bar);
    }
    if (bar.docKey !== undefined) {
      const index = indexOfRef(refs, bar.docKey, bar.docIndex);
      if (index !== bar.docIndex) changed = true;
      return makeBar(index, bar.docKey, bar);
    }
    changed = true;
    if (refs.length > 1) review = true;
    return makeBar(bar.docIndex, refs[bar.docIndex], bar);
  });
  return { bars: out, changed, unmatched, review };
}

/** Same bars in the same order, docKey and docIndex included. */
export function sameRedactions(
  a: readonly RedactionBar[],
  b: readonly RedactionBar[],
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
