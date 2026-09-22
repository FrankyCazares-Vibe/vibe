/**
 * Tests for `resume-redactions.ts`: bars bound to their document by docKey,
 * moved with it when the list changes, and the fail-closed check readers use.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/profile/resume-redactions.test.ts
 *
 * The module under test has zero imports, so it loads through a dynamic
 * import of its ".ts" path (the `looking-for.test.ts` pattern; the specifier
 * goes through a variable because tsc refuses a literal ".ts" specifier).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./resume-redactions.ts";
const {
  UNMATCHABLE_DOC_KEY,
  bindRedactionsKeepingCoverage,
  bindRedactionsToDocs,
  hasUnmatchedRedactions,
  redactedDocIndexes,
  redactionPositionsAreAmbiguous,
  redactionsForRef,
  remapRedactionsToDocs,
  repairUnlistedRedactions,
  resumePortfolioRefList,
  sameRedactions,
  sanitizeResumeRedactions,
  stampRedactionDocKeys,
} = (await import(specifier)) as typeof import("./resume-redactions");

type Bar = import("./resume-redactions").RedactionBar;

const UID = "7746ae58-4c96-4be7-a70c-062abd24b179";
const IMG = `/api/resume/${UID}/resume-11111111-1111-4111-8111-111111111111.png`;
const PDF = `/api/resume/${UID}/resume-22222222-2222-4222-8222-222222222222.pdf`;
const PDF2 = `/api/resume/${UID}/resume-33333333-3333-4333-8333-333333333333.pdf`;
const EXT = "https://drive.example.com/file/d/abc/view";

const geo = { pageNumber: 1, x: 0, y: 0, w: 100, h: 10 };
const legacy = (docIndex: number, extra: Partial<Bar> = {}): Bar => ({ docIndex, ...geo, ...extra });
const keyed = (docIndex: number, docKey: string, extra: Partial<Bar> = {}): Bar => ({
  docIndex,
  docKey,
  ...geo,
  ...extra,
});

test("sanitize keeps a storable docKey and drops one that names no stored document", () => {
  const out = sanitizeResumeRedactions([
    { docIndex: 1, docKey: ` ${PDF} `, ...geo },
    { docIndex: 0, docKey: EXT, ...geo },
    { docIndex: 2, docKey: "data:application/pdf;base64,AAAA", ...geo },
    { docIndex: 0, docKey: "blob:https://x/1", ...geo },
    { docIndex: 0, docKey: 42, ...geo },
    { docIndex: 0, docKey: `https://x.test/${"a".repeat(2100)}`, ...geo },
  ]);
  assert.deepEqual(out, [
    keyed(1, PDF),
    keyed(0, EXT),
    legacy(2),
    legacy(0),
    legacy(0),
    legacy(0),
  ]);
});

test("sanitize accepts a bar that names its document but has no position", () => {
  assert.deepEqual(sanitizeResumeRedactions([{ docKey: PDF, ...geo }]), [keyed(0, PDF)]);
  assert.deepEqual(sanitizeResumeRedactions([{ ...geo }]), []);
});

test("portfolio list: docs when present, else the single link, else nothing", () => {
  assert.deepEqual(resumePortfolioRefList([{ url: IMG }, { url: PDF }], PDF2), [IMG, PDF]);
  assert.deepEqual(resumePortfolioRefList([], PDF2), [PDF2]);
  assert.deepEqual(resumePortfolioRefList([], null), []);
  assert.deepEqual(resumePortfolioRefList([], ""), []);
});

test("phone delete of doc 0 moves doc 1's bars to index 0 (keyed bars)", () => {
  const stored = [keyed(1, PDF)];
  const moved = remapRedactionsToDocs(stored, [IMG, PDF], [PDF]);
  assert.deepEqual(moved, [keyed(0, PDF)]);
  assert.equal(redactionsForRef(moved, [PDF], PDF).length, 1);
  assert.equal(hasUnmatchedRedactions(moved, [PDF]), false);
});

test("phone delete of doc 0 moves legacy bars through the previous list", () => {
  // The exact row the leak reproduced: image at 0 (no bars), PDF at 1 with a
  // bar, then the phone sends only { resume_docs: [pdf] }.
  const moved = remapRedactionsToDocs([legacy(1)], [IMG, PDF], [PDF]);
  assert.deepEqual(moved, [keyed(0, PDF)]);
  assert.deepEqual(redactedDocIndexes(moved, [PDF]), new Set([0]));
});

test("bars for a removed document are dropped, the others keep theirs", () => {
  const stored = [keyed(0, IMG), legacy(1), keyed(2, PDF2, { pageNumber: 2 })];
  const moved = remapRedactionsToDocs(stored, [IMG, PDF, PDF2], [IMG, PDF2]);
  assert.deepEqual(moved, [keyed(0, IMG), keyed(1, PDF2, { pageNumber: 2 })]);
});

test("a reorder moves each bar with its document", () => {
  const moved = remapRedactionsToDocs([legacy(0), legacy(1)], [IMG, PDF], [PDF, IMG]);
  assert.deepEqual(moved, [keyed(1, IMG), keyed(0, PDF)]);
});

test("legacy bars past the end of the previous list are dropped on a re-map", () => {
  assert.deepEqual(remapRedactionsToDocs([legacy(3)], [IMG], [IMG]), []);
});

test("an unchanged list only stamps docKeys on legacy bars", () => {
  const stored = [legacy(0), keyed(1, PDF)];
  const moved = remapRedactionsToDocs(stored, [IMG, PDF], [IMG, PDF]);
  assert.deepEqual(moved, [keyed(0, IMG), keyed(1, PDF)]);
  assert.equal(sameRedactions(moved, remapRedactionsToDocs(moved, [IMG, PDF], [IMG, PDF])), true);
  assert.equal(sameRedactions(stored, moved), false);
});

test("desktop legacy single link: bars bind to it, a replaced link drops them", () => {
  // No resume_docs: the list is [resume_url]. Bars sent without docKey bind
  // by position, and get the link as their key.
  const bound = bindRedactionsToDocs([legacy(0)], [PDF]);
  assert.deepEqual(bound, [keyed(0, PDF)]);
  // The desktop swaps its resume (resume_url → PDF2) without sending bars:
  // the old file's bars do not land on the new file.
  assert.deepEqual(remapRedactionsToDocs(bound, [PDF], [PDF2]), []);
  // `remove: ["resume"]` empties the list.
  assert.deepEqual(remapRedactionsToDocs(bound, [PDF], []), []);
});

test("desktop remove on a docs row: keyed bars stay on their document", () => {
  // Server list [img, pdf] stays as is (desktop never sends resume_docs);
  // the page shifted its copy of the bar to docIndex 0 but kept the key.
  const bound = bindRedactionsToDocs([keyed(0, PDF)], [IMG, PDF]);
  assert.deepEqual(bound, [keyed(1, PDF)]);
  assert.equal(redactionsForRef(bound, [IMG, PDF], IMG).length, 0);
  assert.equal(redactionsForRef(bound, [IMG, PDF], PDF).length, 1);
});

test("desktop remove that sends the new list with the bars", () => {
  assert.deepEqual(bindRedactionsToDocs([keyed(0, PDF)], [PDF]), [keyed(0, PDF)]);
});

test("bound bars: a docKey outside the list is dropped, legacy past the end too", () => {
  const bound = bindRedactionsToDocs(
    [keyed(0, PDF2), legacy(5), legacy(1), keyed(9, IMG)],
    [IMG, PDF],
  );
  assert.deepEqual(bound, [keyed(1, PDF), keyed(0, IMG)]);
  for (const b of bound) assert.equal([IMG, PDF][b.docIndex], b.docKey);
});

test("bound bars: canonicalRef finds an absolute proxy url", () => {
  const abs = `https://vibe.example${PDF}`;
  const canonical = (ref: string) => {
    const i = ref.indexOf("/api/resume/");
    return i >= 0 ? ref.slice(i) : null;
  };
  assert.deepEqual(bindRedactionsToDocs([keyed(0, abs)], [IMG, PDF], { canonicalRef: canonical }), [
    keyed(1, PDF),
  ]);
  assert.deepEqual(bindRedactionsToDocs([keyed(0, abs)], [IMG, PDF]), []);
  // The re-map uses the same normaliser, and stores the listed form.
  assert.deepEqual(remapRedactionsToDocs([keyed(3, abs)], [], [IMG, PDF], canonical), [
    keyed(1, PDF),
  ]);
  assert.deepEqual(remapRedactionsToDocs([keyed(3, abs)], [], [IMG, PDF]), []);
});

test("fail closed: a bar that covers no listed document flags the row", () => {
  assert.equal(hasUnmatchedRedactions([keyed(0, PDF2)], [IMG, PDF]), true);
  assert.equal(hasUnmatchedRedactions([legacy(2)], [IMG, PDF]), true);
  assert.equal(hasUnmatchedRedactions([legacy(0)], []), true);
  assert.equal(hasUnmatchedRedactions([legacy(1), keyed(0, IMG)], [IMG, PDF]), false);
  assert.equal(hasUnmatchedRedactions([], []), false);
});

test("readers match by docKey first, ignoring a stale docIndex", () => {
  // docIndex says 0 but the key names the PDF: the image stays unredacted
  // and the PDF keeps its bar.
  const bars = [keyed(0, PDF)];
  assert.equal(redactionsForRef(bars, [IMG, PDF], IMG).length, 0);
  assert.equal(redactionsForRef(bars, [IMG, PDF], PDF).length, 1);
  assert.deepEqual(redactedDocIndexes(bars, [IMG, PDF]), new Set([1]));
});

test("external-link documents are keyed and tracked like hosted ones", () => {
  const moved = remapRedactionsToDocs([legacy(1)], [IMG, EXT], [EXT]);
  assert.deepEqual(moved, [keyed(0, EXT)]);
  assert.deepEqual(redactedDocIndexes(moved, [EXT]), new Set([0]));
  assert.deepEqual(bindRedactionsToDocs([keyed(3, EXT)], [PDF, EXT]), [keyed(1, EXT)]);
  assert.equal(hasUnmatchedRedactions([keyed(0, EXT)], [PDF]), true);
});

test("the same file listed twice gets the bars of both entries", () => {
  const refs = [PDF, IMG, PDF];
  const bars = [legacy(2), keyed(0, PDF, { pageNumber: 2 })];
  assert.equal(redactionsForRef(bars, refs, PDF).length, 2);
  assert.deepEqual(redactedDocIndexes(bars, refs), new Set([0, 2]));
  // Binding keeps a bar on the copy it was drawn on.
  assert.deepEqual(bindRedactionsToDocs([legacy(2)], refs), [keyed(2, PDF)]);
});

test("backfill helper stamps legacy bars and leaves unmatched ones failing closed", () => {
  const res = stampRedactionDocKeys([legacy(0), keyed(1, PDF), legacy(4)], [IMG, PDF]);
  assert.deepEqual(res.bars, [keyed(0, IMG), keyed(1, PDF), legacy(4)]);
  assert.equal(res.changed, true);
  assert.equal(res.unmatched, 1);
  assert.equal(hasUnmatchedRedactions(res.bars, [IMG, PDF]), true);

  const again = stampRedactionDocKeys(res.bars.slice(0, 2), [IMG, PDF]);
  assert.equal(again.changed, false);
  assert.equal(again.unmatched, 0);

  const stale = stampRedactionDocKeys([keyed(0, PDF)], [IMG, PDF]);
  assert.deepEqual(stale.bars, [keyed(1, PDF)]);
  assert.equal(stale.changed, true);
});

test("backfill helper flags guessed keys on multi-document rows for review", () => {
  // Stamping a legacy bar by position on a list of several documents is a
  // guess the old bugs may have made wrong: a person checks those rows.
  assert.equal(stampRedactionDocKeys([legacy(0), keyed(1, PDF)], [IMG, PDF]).review, true);
  assert.equal(stampRedactionDocKeys([legacy(0)], [PDF]).review, false);
  assert.equal(stampRedactionDocKeys([keyed(0, IMG), keyed(1, PDF)], [IMG, PDF]).review, false);
});

test("strict read: a stored key that names nothing storable fails the row closed", () => {
  const raw = [
    { docIndex: 0, docKey: "data:application/pdf;base64,AAAA", ...geo },
    { docIndex: 0, docKey: null, ...geo },
    { docKey: 7, ...geo },
  ];
  // A request body: the bad keys fall back to position (or the bar is dropped).
  assert.deepEqual(sanitizeResumeRedactions(raw), [legacy(0), legacy(0)]);
  // A stored row: the bad keys can't match, so readers refuse the row.
  const strict = sanitizeResumeRedactions(raw, { strict: true });
  assert.deepEqual(strict, [keyed(0, UNMATCHABLE_DOC_KEY), legacy(0), keyed(0, UNMATCHABLE_DOC_KEY)]);
  assert.equal(hasUnmatchedRedactions(strict, [PDF]), true);
  assert.equal(redactionsForRef(strict, [PDF], PDF).length, 1);
  assert.equal(sanitizeResumeRedactions([{ docKey: `https://x.test/${"a".repeat(2100)}`, ...geo }], {
    strict: true,
  })[0].docKey, UNMATCHABLE_DOC_KEY);
});

test("a request with its own list places unkeyed bars by the client's positions", () => {
  // Body list [img, data:x, pdf, pdf2]; the server can't store data:x, so it
  // stores [img, pdf, pdf2]. Bars sent for pdf (2) and pdf2 (3) must stay on
  // them, and a bar on data:x (1) goes with it.
  const clientRefs = [IMG, null, PDF, PDF2];
  const refs = [IMG, PDF, PDF2];
  const sent = [legacy(2), legacy(3, { pageNumber: 2 }), legacy(1, { pageNumber: 3 })];
  assert.deepEqual(bindRedactionsToDocs(sent, refs, { clientRefs }), [
    keyed(1, PDF),
    keyed(2, PDF2, { pageNumber: 2 }),
  ]);
  // By the stored list's positions they would have slid onto the neighbour.
  assert.deepEqual(bindRedactionsToDocs(sent, refs).map((b) => b.docKey), [PDF2, PDF]);
  // A client entry the server doesn't keep (over the cap) names nothing.
  assert.deepEqual(bindRedactionsToDocs([legacy(0)], [IMG], { clientRefs: [PDF2, IMG] }), []);
});

const g1 = { pageNumber: 1, x: 12.345678901234567, y: 40.1, w: 30.2, h: 3.3 };
const g2 = { pageNumber: 2, x: 5.5, y: 60.25, w: 44.4, h: 2.75 };

test("an old page's shifted, unkeyed bars go back to their stored documents", () => {
  // Server list [x, a, b]; bars on a (1) and b (2), already keyed. A desktop
  // tab loaded before keys existed removes x locally, shifts its copies to
  // 0 and 1, and sends them without keys or a list.
  const refs = [IMG, PDF, PDF2];
  const stored = [keyed(1, PDF, g1), keyed(2, PDF2, g2)];
  const sent = [legacy(0, g1), legacy(1, g2)];
  assert.deepEqual(bindRedactionsToDocs(sent, refs, { storedBars: stored }), stored);
  // Without the stored bars the positions win and both land one file early.
  assert.deepEqual(bindRedactionsToDocs(sent, refs).map((b) => b.docKey), [IMG, PDF]);
});

test("stored legacy bars are keyed through the stored list before matching", () => {
  // Right after deploy the row still has legacy bars: remap them over the
  // stored list (as profile-sync does) and the shifted page still lands.
  const refs = [IMG, PDF, PDF2];
  const pool = remapRedactionsToDocs([legacy(1, g1), legacy(2, g2)], refs, refs);
  const bound = bindRedactionsToDocs([legacy(0, g1), legacy(1, g2)], refs, { storedBars: pool });
  assert.deepEqual(bound, [keyed(1, PDF, g1), keyed(2, PDF2, g2)]);
});

test("a new unkeyed bar identical to a stored one still reaches its own document", () => {
  // Stored g1 on img. The page sends a copy of g1 for pdf FIRST, then the
  // stored one: the twin on the named document is claimed before any other.
  const refs = [IMG, PDF];
  const bound = bindRedactionsToDocs([legacy(1, g1), legacy(0, g1)], refs, {
    storedBars: [keyed(0, IMG, g1)],
  });
  assert.deepEqual(bound, [keyed(1, PDF, g1), keyed(0, IMG, g1)]);
});

test("keyed bars claim their stored twins before unkeyed ones look", () => {
  const refs = [IMG, PDF];
  const bound = bindRedactionsToDocs([keyed(0, IMG, g1), legacy(1, g1)], refs, {
    storedBars: [keyed(0, IMG, g1)],
  });
  assert.deepEqual(bound, [keyed(0, IMG, g1), keyed(1, PDF, g1)]);
});

test("fail safe: an ambiguous twin keeps every document it was on", () => {
  // The same bar on x and a, and the old page (x removed locally) sends one
  // copy at position 0, which the server still lists as x. Nobody can tell
  // which it meant, so both stay covered rather than one going bare.
  const bound = bindRedactionsToDocs([legacy(0, g1)], [IMG, PDF], {
    storedBars: [keyed(0, IMG, g1), keyed(1, PDF, g1)],
  });
  assert.deepEqual(bound, [keyed(0, IMG, g1), keyed(1, PDF, g1)]);
  // A bar erased on the old page (no unkeyed copy sent) really goes.
  assert.deepEqual(
    bindRedactionsToDocs([legacy(0, g1)], [IMG, PDF], {
      storedBars: [keyed(0, IMG, g1), keyed(1, PDF, g2)],
    }),
    [keyed(0, IMG, g1)],
  );
});

test("stored twins on a document leaving the list are not matched", () => {
  // The request removes pdf2 and sends its old bar unkeyed: the twin is not
  // in the list being stored, so the bar falls back to its position.
  const bound = bindRedactionsToDocs([legacy(0, g2)], [IMG], {
    storedBars: [keyed(2, PDF2, g2)],
  });
  assert.deepEqual(bound, [keyed(0, IMG, g2)]);
});

test("exact duplicates are merged", () => {
  assert.deepEqual(bindRedactionsToDocs([keyed(0, PDF), keyed(0, PDF), legacy(0)], [PDF]), [
    keyed(0, PDF),
  ]);
});

test("repair: bars on a document no longer listed are dropped, the rest keyed", () => {
  // A bar saved for pdf2 landed after pdf2 was removed: no one else can open
  // pdf2, so dropping its bar lifts the refusal without exposing anything.
  const refs = [IMG, PDF];
  assert.deepEqual(repairUnlistedRedactions([keyed(0, PDF2), legacy(1), keyed(0, IMG)], refs), [
    keyed(1, PDF),
    keyed(0, IMG),
  ]);
  // Nothing out of step: nothing to do.
  assert.equal(repairUnlistedRedactions([keyed(1, PDF)], refs), null);
  // A legacy bar past the end, or an unreadable key: nobody knows its file.
  assert.equal(repairUnlistedRedactions([keyed(0, PDF2), legacy(2)], refs), null);
  assert.equal(repairUnlistedRedactions([keyed(0, UNMATCHABLE_DOC_KEY)], refs), null);
  // A key in another form of a listed document is re-keyed, not dropped.
  const abs = `https://vibe.example${PDF}`;
  const canonical = (ref: string) => (ref.startsWith("https://vibe.example") ? ref.slice(20) : null);
  assert.deepEqual(repairUnlistedRedactions([keyed(0, abs)], refs, canonical), [keyed(1, PDF)]);
});

test("ambiguous positions: only a multi-document row with an unkeyed bar", () => {
  assert.equal(redactionPositionsAreAmbiguous([legacy(0)], [IMG, PDF]), true);
  // One stored document: position 0 can only mean that document.
  assert.equal(redactionPositionsAreAmbiguous([legacy(0)], [IMG]), false);
  // Every bar names its document, so the request says what it means.
  assert.equal(redactionPositionsAreAmbiguous([keyed(0, IMG)], [IMG, PDF]), false);
  // Erasing every bar carries no position at all and still clears the row.
  assert.equal(redactionPositionsAreAmbiguous([], [IMG, PDF]), false);
});

test("the leak: an old tab's removal can't strip a still-listed document", () => {
  // Stored [img, pdf] with a bar on each. A desktop tab from before docKeys
  // removes img locally, renumbers pdf's bar to 0 and sends it alone with no
  // list, so the server keeps both documents. img kept its place in the list
  // and lost its bar, and other students were served the original (S64).
  const refs = [IMG, PDF];
  const stored = [keyed(0, IMG, g1), keyed(1, PDF, g2)];
  const sent = [legacy(0, g2)];
  assert.deepEqual(bindRedactionsToDocs(sent, refs, { storedBars: stored }), [keyed(1, PDF, g2)]);
  // Nothing is taken off: both stored bars stay, and the sent bar is added
  // where its position claims (img), so img is covered twice rather than not
  // at all.
  assert.deepEqual(bindRedactionsKeepingCoverage(sent, refs, refs, { storedBars: stored }), [
    keyed(0, IMG, g1),
    keyed(1, PDF, g2),
    keyed(0, IMG, g2),
  ]);
});

test("coverage is kept per document, not per position", () => {
  // The old tab also drags pdf's bar somewhere new: the move is added, and
  // the bar it thinks it replaced stays until an up-to-date tab saves.
  const refs = [IMG, PDF];
  const stored = [keyed(0, IMG, g1), keyed(1, PDF, g2)];
  const moved = { pageNumber: 2, x: 9, y: 9, w: 20, h: 20 };
  assert.deepEqual(bindRedactionsKeepingCoverage([legacy(1, moved)], refs, refs, { storedBars: stored }), [
    keyed(0, IMG, g1),
    keyed(1, PDF, g2),
    keyed(1, PDF, moved),
  ]);
});

test("keyed saves still add, move and erase bars on a multi-document row", () => {
  // The student's own tab names every document, so nothing is held back —
  // erasing the last bar from img really leaves img bare (their choice).
  const refs = [IMG, PDF];
  const stored = [keyed(0, IMG, g1), keyed(1, PDF, g2)];
  assert.deepEqual(
    bindRedactionsKeepingCoverage([keyed(1, PDF, g2)], refs, refs, { storedBars: stored }),
    [keyed(1, PDF, g2)],
  );
  // Erasing everything.
  assert.deepEqual(bindRedactionsKeepingCoverage([], refs, refs, { storedBars: stored }), []);
});

test("a single-document row behaves exactly as it did", () => {
  // Nothing to confuse a position with, so an unkeyed save still clears it.
  const refs = [PDF];
  const stored = [keyed(0, PDF, g1)];
  assert.deepEqual(bindRedactionsKeepingCoverage([], refs, refs, { storedBars: stored }), []);
  assert.deepEqual(
    bindRedactionsKeepingCoverage([legacy(0, g2)], refs, refs, { storedBars: stored }),
    bindRedactionsToDocs([legacy(0, g2)], refs, { storedBars: stored }),
  );
});

test("kept coverage follows the list: a removed document's bars still go", () => {
  // The same old tab, but this one sends the new list too: img is really
  // gone, nobody else can open it, so its bar is not resurrected.
  const prevRefs = [IMG, PDF];
  const stored = [keyed(0, IMG, g1), keyed(1, PDF, g2)];
  assert.deepEqual(
    bindRedactionsKeepingCoverage([legacy(0, g2)], [PDF], prevRefs, {
      clientRefs: [PDF],
      storedBars: stored,
    }),
    [keyed(0, PDF, g2)],
  );
});
