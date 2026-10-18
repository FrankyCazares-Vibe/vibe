/**
 * Tests for `hidden-fields.ts` (S67 security wave 2, batch A1): what a hidden
 * profile widget means for a visitor, the résumé rule, and the two link-preview
 * rules.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/profile/hidden-fields.test.ts
 *
 * The module under test has only `import type`, so it loads through a dynamic
 * import of its ".ts" path (the `profile-layout.test.ts` pattern). The
 * routes that apply these rules import "server-only" and the Supabase
 * clients, so they are pinned as TEXT at the bottom (the
 * `self-write-columns.test.ts` pattern).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const specifier = "./hidden-fields.ts";
const {
  blankHiddenWidgets,
  clubsVisibleToViewer,
  hasResume,
  postPreviewIsPublic,
  profilePreviewDescription,
  resumeVisibleToViewer,
  stripResumeKeys,
} = (await import(specifier)) as typeof import("./hidden-fields");

type Hidden = "bio" | "experience" | "skills" | "working_on" | "resume";
const ORDER = ["posts", "bio", "experience", "skills", "resume", "working_on"] as const;

function profile(hidden: Hidden[] = [], extra: Record<string, unknown> = {}) {
  return {
    id: "u1",
    name: "Casey",
    tagline: "",
    bio: "Line one\nline two",
    skills: ["sql", "figma"],
    interests: ["film"],
    work_experience: [{ title: "Intern" }],
    work_order_manual: true,
    current_on: [{ icon: "x", text: "a thesis" }],
    resume_url: "/api/resume/u1/resume-1.pdf",
    resume_docs: [{ name: "CV", type: "pdf", url: "/api/resume/u1/resume-2.pdf" }],
    resume_redactions: [{ docKey: "u1/resume-2.pdf" }],
    profile_layout: { v: 1 as const, order: [...ORDER], hidden: [...hidden], bioSide: true },
    ...extra,
  };
}

// What each widget blanks, and nothing else.
const BLANKS: Record<Hidden, Record<string, unknown>> = {
  bio: { bio: "" },
  experience: { work_experience: [], work_order_manual: false },
  skills: { skills: [] },
  working_on: { current_on: [] },
  resume: { resume_url: null, resume_docs: [], resume_redactions: [] },
};

test("the owner gets the very same profile back, hidden list and all", () => {
  const p = profile(["bio", "resume"]);
  assert.equal(blankHiddenWidgets(p, { isOwner: true }), p);
  assert.deepEqual(p.profile_layout.hidden, ["bio", "resume"]);
});

test("a visitor of a profile that hides nothing gets every field, and an empty hidden list", () => {
  const p = profile();
  const out = blankHiddenWidgets(p, { isOwner: false });
  assert.deepEqual(out, p);
  assert.notEqual(out, p);
});

test("each hidden widget blanks exactly its own fields; order and bioSide stay", () => {
  for (const id of Object.keys(BLANKS) as Hidden[]) {
    const p = profile([id]);
    const out = blankHiddenWidgets(p, { isOwner: false });
    const expected = {
      ...profile([id]),
      ...BLANKS[id],
      profile_layout: { v: 1, order: [...ORDER], hidden: [], bioSide: true },
    };
    assert.deepEqual(out, expected, `hidden=${id}`);
  }
});

test("never a hidden widget in the list next to its data: the pair ships together", () => {
  const all: Hidden[] = ["bio", "experience", "skills", "working_on", "resume"];
  const out = blankHiddenWidgets(profile(all), { isOwner: false });
  assert.deepEqual(out.profile_layout.hidden, []);
  for (const id of all) {
    for (const [k, v] of Object.entries(BLANKS[id])) {
      assert.deepEqual((out as Record<string, unknown>)[k], v, `${id}.${k}`);
    }
  }
  // Not widgets: never touched.
  assert.equal(out.name, "Casey");
  assert.deepEqual(out.interests, ["film"]);
});

test("the input is never changed, and the copy owns its order array", () => {
  const p = profile(["bio", "skills", "resume"]);
  const before = JSON.stringify(p);
  const out = blankHiddenWidgets(p, { isOwner: false });
  assert.equal(JSON.stringify(p), before);
  out.profile_layout.order.reverse();
  assert.deepEqual(p.profile_layout.order, [...ORDER]);
});

test("stripResumeKeys empties the three résumé keys on a copy; hasResume reads url or docs", () => {
  const p = profile();
  const out = stripResumeKeys(p);
  assert.equal(out.resume_url, null);
  assert.deepEqual(out.resume_docs, []);
  assert.deepEqual(out.resume_redactions, []);
  assert.equal(p.resume_url, "/api/resume/u1/resume-1.pdf");
  assert.equal(hasResume(p), true);
  assert.equal(hasResume(out), false);
  assert.equal(hasResume({ resume_url: null, resume_docs: [{}] }), true);
  assert.equal(hasResume({ resume_url: "x", resume_docs: [] }), true);
});

test("résumé rule: the owner always; anyone else only verified, owner unrestricted, not hidden", () => {
  const base = { isOwner: false, viewerVerified: true, ownerRestricted: false, layoutHidesResume: false };
  assert.equal(resumeVisibleToViewer(base), true);
  assert.equal(resumeVisibleToViewer({ ...base, viewerVerified: false }), false);
  assert.equal(resumeVisibleToViewer({ ...base, ownerRestricted: true }), false);
  assert.equal(resumeVisibleToViewer({ ...base, layoutHidesResume: true }), false);
  assert.equal(
    resumeVisibleToViewer({ isOwner: true, viewerVerified: false, ownerRestricted: true, layoutHidesResume: true }),
    true,
  );
});

test("profile preview description: tagline, else a visible bio, else the name line", () => {
  const p = { name: "Casey", tagline: "  Builds things ", bio: "My bio", bioHidden: true };
  assert.equal(profilePreviewDescription(p), "Builds things");
  assert.equal(profilePreviewDescription({ ...p, tagline: "" }), "Casey's profile on Vibe");
  assert.equal(profilePreviewDescription({ ...p, tagline: null, bioHidden: false }), "My bio");
  assert.equal(profilePreviewDescription({ ...p, tagline: "", bio: "x".repeat(300), bioHidden: false }).length, 160);
  assert.equal(profilePreviewDescription({ ...p, tagline: "", bio: "   ", bioHidden: false }), "Casey's profile on Vibe");
});

test("post preview: removed, hidden or unreadable club, restricted or unknown author all go generic", () => {
  const ok = { removedAt: null, orgId: null, orgHiddenAt: undefined, author: "none" as const };
  assert.equal(postPreviewIsPublic(ok), true);
  assert.equal(postPreviewIsPublic({ ...ok, removedAt: "2026-09-27T00:00:00Z" }), false);
  assert.equal(postPreviewIsPublic({ ...ok, author: "restricted" }), false);
  assert.equal(postPreviewIsPublic({ ...ok, author: "unknown" }), false);
  // A public club keeps its preview (product call 3); a hidden one doesn't.
  assert.equal(postPreviewIsPublic({ ...ok, orgId: "o1", orgHiddenAt: null }), true);
  assert.equal(postPreviewIsPublic({ ...ok, orgId: "o1", orgHiddenAt: "2026-09-01T00:00:00Z" }), false);
  // The club row came back empty: fail closed.
  assert.equal(postPreviewIsPublic({ ...ok, orgId: "o1", orgHiddenAt: undefined }), false);
});

// ── text pins on the routes (they can't load under node:test) ─────────────
const REPO_ROOT = new URL("../../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, REPO_ROOT), "utf8");

test("bootstrap blanks hidden widgets BEFORE building the vibeUser, and gates résumé keys", () => {
  const src = read("src/app/api/users/[handle]/bootstrap/route.ts");
  const viewed = src.indexOf("const viewed = normalizeProfileView(rowForViewer);");
  const blank = src.indexOf("blankHiddenWidgets(viewed, { isOwner })");
  const build = src.indexOf("buildVibeUserV1FromProfile(profile");
  assert.ok(viewed > 0 && blank > viewed, "blankHiddenWidgets runs on the normalized profile");
  assert.ok(build > blank, "the build comes after the blank (tagline-from-bio leak)");
  assert.ok(src.includes("resumeVisibleToViewer("), "résumé keys follow the shared rule");
  assert.ok(src.indexOf("resumeVisibleToViewer(") < build);
});

test("a hidden Clubs widget: no clubs for anyone but the owner, decided before the blanking", () => {
  const hidden = { hidden: ["clubs" as const] };
  assert.equal(clubsVisibleToViewer({ isOwner: false, layout: hidden }), false);
  assert.equal(clubsVisibleToViewer({ isOwner: true, layout: hidden }), true);
  assert.equal(clubsVisibleToViewer({ isOwner: false, layout: { hidden: [] } }), true);
  assert.equal(clubsVisibleToViewer({ isOwner: false, layout: { hidden: ["bio", "resume"] } }), true);
  // In the route: read from the layout as saved (blanking empties `hidden`
  // for non-owners), and a hidden one never reaches loadShownClubs.
  const src = read("src/app/api/users/[handle]/bootstrap/route.ts");
  const rule = src.indexOf("clubsVisibleToViewer({ isOwner, layout: viewed.profile_layout })");
  const blank = src.indexOf("blankHiddenWidgets(viewed, { isOwner })");
  assert.ok(rule > 0 && rule < blank, "the clubs rule must read `hidden` before blankHiddenWidgets empties it");
  // The legacy select has no profile_layout: nothing says Clubs is shown, so
  // non-owners get none (fail closed, like the résumé's `!layoutRead`).
  assert.match(src, /const clubsShown =\s*isOwner \|\| \(layoutRead && clubsVisibleToViewer\(/);
  assert.match(src, /: clubsShown\s*\?\s*loadShownClubs\(service, targetId\)\s*:\s*Promise\.resolve\(\[\] as PublicProfileClub\[\]\)/);
  assert.equal(src.split("loadShownClubs(service, targetId)").length - 1, 1, "clubs are read in one place only");
});

test("the résumé proxy runs the A1 gate for non-owners only, never on the owner's ?view=public", () => {
  const src = read("src/app/api/resume/[...path]/route.ts");
  assert.ok(src.includes("profile_layout"), "the owner row is read with its layout");
  const guard = src.indexOf("if (!isOwner) {");
  const gate = src.indexOf("await nonOwnerResumeGate(");
  assert.ok(guard > 0 && gate > guard, "the gate sits inside the !isOwner block");
  const blockEnd = src.indexOf("// Redaction: swap the original");
  assert.ok(gate < blockEnd);
});

test("the signed-out posts grid checks the restriction and leaves club posts out", () => {
  const src = read("src/app/api/users/[handle]/posts/route.ts");
  assert.ok(src.includes("getActiveRestriction(target.id)"));
  assert.ok(src.includes('if (!user) q = q.is("org_id", null);'));
  assert.ok(src.includes("loadPairBlock(supabase, user.id, target.id)"));
});

test("share previews: removed / hidden-club / restricted posts and restricted profiles go generic", () => {
  const post = read("src/app/posts/[id]/page.tsx");
  assert.ok(post.includes('.is("removed_at", null)'));
  assert.ok(post.includes("org:orgs!posts_org_id_fkey(hidden_at)"));
  assert.ok(post.includes("postPreviewIsPublic("));
  // The body's existence check keeps removed posts (the author's removal notice).
  const body = post.slice(post.indexOf("export default async function PostPage"));
  assert.equal(body.includes("removed_at"), true); // only in the comment
  assert.equal(body.includes('.is("removed_at"'), false);
  assert.ok(body.indexOf("redirect(") < body.indexOf('.from("posts")'), "auth gate before the existence read");
  const profilePage = read("src/app/profile/[handle]/page.tsx");
  assert.ok(profilePage.includes("id,name,handle,tagline,bio,avatar_url,profile_layout"));
  assert.ok(profilePage.includes("profilePreviewDescription("));
  assert.ok(profilePage.includes("restriction.restriction) return { title: `@${handle} · Vibe` }"));
});
