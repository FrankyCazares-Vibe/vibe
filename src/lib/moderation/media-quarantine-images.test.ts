/**
 * Tests for the photo-takedown planner (`media-quarantine-images.ts`).
 *
 * Run with:
 *   node --test src/lib/moderation/media-quarantine-images.test.ts
 *
 * WHY THE RESOLVE HOOK: media-quarantine-images.ts imports
 * ../media/profile-image-key extensionless (what Next and tsc expect); Node's
 * type stripping adds no extension. Same hook as tags.test.ts.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("media-quarantine-images.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const M = await import("./media-quarantine-images");

const PROJECT = "https://abcd1234.supabase.co";
const OWNER = "df5ab44e-1111-4222-8333-944445555666";
const VICTIM = "0a1b2c3d-1111-4222-8333-944445555666";
const pub = (path: string) => `${PROJECT}/storage/v1/object/public/profiles/${path}`;
const plan = (slot: "avatar" | "banner" | "logos" | "logo" | "photo", refs: string[], owner: string | null = OWNER) =>
  M.planImageRemoval({ slot, refs, ownerId: owner, supabaseUrl: PROJECT });

test("slots per target, and nothing else is a slot", () => {
  assert.deepEqual(M.IMAGE_SLOTS.user, ["avatar", "banner", "logos"]);
  assert.ok(M.isImageSlot("org", "logo"));
  assert.ok(!M.isImageSlot("org", "avatar"));
  assert.ok(!M.isImageSlot("channel", "banner"));
  assert.ok(!M.isImageSlot("user", "constructor"));
  assert.equal(M.imageSlotColumn("user", "logos"), null);
  assert.equal(M.imageSlotColumn("channel", "photo"), "photo_url");
  assert.ok(M.isImageTargetType("org") && !M.isImageTargetType("post"));
});

test("the student's own avatar and cover are moved; one move for a shared file", () => {
  const a = pub(`${OWNER}/avatar-11.jpg`);
  assert.deepEqual(plan("avatar", [a]).paths, [`${OWNER}/avatar-11.jpg`]);
  // avatar == banner: the route passes both refs; one path, not two.
  assert.deepEqual(plan("avatar", [a, a]).paths, [`${OWNER}/avatar-11.jpg`]);
  // A cover file named in the avatar column is still a root photo: moved.
  assert.deepEqual(plan("avatar", [pub(`${OWNER}/banner-2.png`)]).paths, [`${OWNER}/banner-2.png`]);
  // Bare bucket path works too.
  assert.deepEqual(plan("banner", [`${OWNER}/banner-3.webp`]).paths, [`${OWNER}/banner-3.webp`]);
});

test("another account's file is never moved, and its folder is reported", () => {
  const p = plan("avatar", [pub(`${VICTIM}/avatar-9.jpg`)]);
  assert.deepEqual(p.paths, []);
  assert.equal(p.left.foreign, 1);
  assert.deepEqual(p.foreignOwners, [VICTIM]);
});

test("the owner's own post photo is left to post removal", () => {
  const p = plan("avatar", [pub(`${OWNER}/posts/post-1.jpg`), pub(`${OWNER}/posters/poster-1.jpg`)]);
  assert.deepEqual(p.paths, []);
  assert.equal(p.left.post, 2);
});

test("logos move only for the logos slot", () => {
  const logo = pub(`${OWNER}/logos/logo-5.png`);
  assert.deepEqual(plan("logos", [logo]).paths, [`${OWNER}/logos/logo-5.png`]);
  const asAvatar = plan("avatar", [logo]);
  assert.deepEqual(asAvatar.paths, []);
  assert.equal(asAvatar.left.other, 1);
  // An avatar named in a logo field is not a logo: left, not moved.
  assert.equal(plan("logos", [pub(`${OWNER}/avatar-1.jpg`)]).left.other, 1);
});

test("traversal, escapes, a query, another host and junk are never moved", () => {
  for (const ref of [
    pub(`${OWNER}/../${VICTIM}/avatar-1.jpg`),
    pub(`${OWNER}/%2e%2e/avatar-1.jpg`),
    `${pub(`${OWNER}/avatar-1.jpg`)}?t=1`,
    `https://evil.example/storage/v1/object/public/profiles/${OWNER}/avatar-1.jpg`,
    "javascript:alert(1)",
    "not a url",
  ]) {
    assert.deepEqual(plan("avatar", [ref]).paths, [], ref);
  }
  assert.equal(plan("avatar", ["https://cdn.example.com/a.png"]).left.external, 1);
});

test("club and chat R2 keys are private: nothing moves; profiles files never move for a club", () => {
  const club = plan("logo", [`orgs/${VICTIM}/logo/4b1c2d3e-1111-4222-8333-944445555666.png`], null);
  assert.deepEqual(club.paths, []);
  assert.equal(club.left.private, 1);
  const chat = plan("photo", [`groups/${VICTIM}/x.jpg`], null);
  assert.equal(chat.left.private, 1);
  const hotlink = plan("banner", [pub(`${OWNER}/avatar-1.jpg`)], null);
  assert.deepEqual(hotlink.paths, []);
  assert.equal(hotlink.left.foreign, 1);
});

test("empty refs are skipped; notes name only what was left", () => {
  const p = plan("avatar", ["", "  "]);
  assert.deepEqual(p.paths, []);
  assert.deepEqual(M.leftNotes(p.left), []);
  assert.deepEqual(M.leftNotes({ foreign: 1, private: 3 }), [M.LEFT_NOTES.foreign]);
});

test("the sweep takes unused root photos only, never a kept one or another folder", () => {
  const names = ["avatar-1.jpg", "avatar-2.jpg", "banner-1.jpg", "resume-1.pdf", "logos", "posts"];
  const keep = [`${OWNER}/banner-1.jpg`];
  assert.deepEqual(M.sweepPaths(OWNER, names, keep, PROJECT), [
    `${OWNER}/avatar-1.jpg`,
    `${OWNER}/avatar-2.jpg`,
  ]);
  assert.deepEqual(M.sweepPaths(OWNER, ["../x/avatar-1.jpg"], [], PROJECT), []);
});

test("logos: collect both spellings, strip them all, put back only into an empty entry", () => {
  const we = [
    { title: "A", logo_url: pub(`${OWNER}/logos/logo-1.png`) },
    { title: "B", logo_url: null },
  ];
  const co = [{ text: "x", logoUrl: "https://cdn.example.com/l.png" }, "junk"];
  const refs = [...M.collectLogoRefs("work_experience", we), ...M.collectLogoRefs("current_on", co)];
  assert.equal(refs.length, 2);
  assert.deepEqual(refs[0], { column: "work_experience", index: 0, key: "logo_url", url: we[0].logo_url });
  const strippedWe = M.stripLogos(we) as Array<Record<string, unknown>>;
  assert.equal(strippedWe[0].logo_url, null);
  assert.equal(strippedWe[0].title, "A");
  assert.equal(we[0].logo_url !== null, true, "the input is not mutated");
  assert.deepEqual(M.collectLogoRefs("current_on", M.stripLogos(co)), []);
  // `only`: a logo the log row didn't record is left alone.
  const onlyOne = M.stripLogos([{ logo_url: "https://a.example/1.png" }, { logo_url: "https://a.example/2.png" }], [
    "https://a.example/1.png",
  ]) as Array<Record<string, unknown>>;
  assert.deepEqual(onlyOne.map((e) => e.logo_url), [null, "https://a.example/2.png"]);

  // Restore into the stripped column: back where empty.
  const back = M.restoreLogos("work_experience", strippedWe, refs);
  assert.equal(back.restored, 1);
  assert.equal(back.notPutBack, 0);
  // Running it again is a no-op that still counts as restored (a finished retry).
  assert.equal(M.restoreLogos("work_experience", back.next, refs).restored, 1);
  // The student set a new logo on that entry since: not overwritten.
  const replaced = [{ title: "A", logo_url: pub(`${OWNER}/logos/logo-new.png`) }];
  const r2 = M.restoreLogos("work_experience", replaced, refs);
  assert.equal(r2.restored, 0);
  assert.equal(r2.notPutBack, 1);
  // The entry was deleted since: counted, nothing thrown.
  assert.equal(M.restoreLogos("work_experience", [], refs).notPutBack, 1);
  assert.equal(M.logoValueKey([]), null);
  assert.equal(M.logoValueKey(refs), M.logoValueKey([...refs].reverse()));
});

const AV = pub(`${OWNER}/avatar-1.jpg`);
const removal = (slots: string[], previous: Record<string, unknown>, id = "r1") => ({
  id,
  action: "image_remove",
  meta: { slots, previous, paths: [`${OWNER}/avatar-1.jpg`], swept: [] },
});

test("readImageMeta refuses rows we didn't write", () => {
  assert.equal(M.readImageMeta(null), null);
  assert.equal(M.readImageMeta({ slots: ["bogus"] }), null);
  const m = M.readImageMeta(removal(["avatar"], { avatar: AV }).meta);
  assert.deepEqual(m?.slots, ["avatar"]);
  assert.equal(m?.previous.avatar, AV);
});

test("Remove: finish a pending removal, never log twice; a new photo gets a new row", () => {
  const latest = removal(["avatar"], { avatar: AV });
  assert.equal(M.removalStep(null, "avatar", { avatar: AV }), "new");
  assert.equal(M.removalStep(null, "avatar", { avatar: null }), "nothing");
  // Clear never happened (500 mid-way): same value still there -> finish.
  assert.equal(M.removalStep(latest, "avatar", { avatar: AV }), "finish");
  // Cleared already: pressing again finishes (moves are idempotent).
  assert.equal(M.removalStep(latest, "avatar", { avatar: null }), "finish");
  // They set a new photo since: a new removal.
  assert.equal(M.removalStep(latest, "avatar", { avatar: pub(`${OWNER}/avatar-2.jpg`) }), "new");
  // After a restore, a Remove is always a new row.
  const restored = { id: "r2", action: "image_restore", meta: { slots: ["avatar"], removal_id: "r1" } };
  assert.equal(M.removalStep(restored, "avatar", { avatar: AV }), "new");
  // One file in both slots: the banner button finds the same row.
  const both = removal(["avatar", "banner"], { avatar: AV, banner: AV });
  assert.equal(M.removalStep(both, "banner", { avatar: null, banner: null }), "finish");
});

test("Restore: nothing on record, finish, refuse over a new photo, else new", () => {
  const latest = removal(["avatar"], { avatar: AV });
  assert.equal(M.restoreStep(null, { avatar: null }), "nothing");
  assert.equal(M.restoreStep(latest, { avatar: null }), "new");
  assert.equal(M.restoreStep(latest, { avatar: AV }), "new");
  assert.equal(M.restoreStep(latest, { avatar: pub(`${OWNER}/avatar-2.jpg`) }), "replaced");
  const restored = { id: "r2", action: "image_restore", meta: { slots: ["avatar"], removal_id: "r1" } };
  assert.equal(M.restoreStep(restored, { avatar: AV }), "finish");
  // Both slots, only the cover replaced since: the photo still goes back.
  const both = removal(["avatar", "banner"], { avatar: AV, banner: AV });
  assert.equal(M.restoreStep(both, { avatar: null, banner: pub(`${OWNER}/banner-9.jpg`) }), "new");
  assert.equal(
    M.restoreStep(both, { avatar: pub(`${OWNER}/avatar-8.jpg`), banner: pub(`${OWNER}/banner-9.jpg`) }),
    "replaced",
  );
  // Logos never answer "replaced": they go back entry by entry.
  const logos = removal(["logos"], { logos: [{ column: "current_on", index: 0, key: "logoUrl", url: "https://x.example/l.png" }] });
  assert.equal(M.restoreStep(logos, { logos: "anything" }), "new");
});

test("latestPerSlot keeps the newest row for each slot", () => {
  const rows = [
    { id: "3", action: "image_restore", meta: { slots: ["banner"], removal_id: "1" } },
    { id: "2", action: "image_remove", meta: { slots: ["avatar"], previous: { avatar: AV } } },
    { id: "1", action: "image_remove", meta: { slots: ["avatar", "banner"], previous: { avatar: AV, banner: AV } } },
    { id: "0", action: "post_remove", meta: {} },
  ];
  const out = M.latestPerSlot(rows);
  assert.equal(out.banner?.id, "3");
  assert.equal(out.avatar?.id, "2");
  assert.equal(out.logos, undefined);
});

/* ---------------- repair round 1 (review-B1-breakage + review-B1-bypass) */

const KEY = `orgs/${VICTIM}/logo/4b1c2d3e-1111-4222-8333-944445555666.png`;
const FOREIGN = pub(`${VICTIM}/avatar-9.jpg`);
const row = (id: string, action: string, meta: Record<string, unknown>, created_at?: string) => ({
  id,
  action,
  meta,
  ...(created_at ? { created_at } : {}),
});

test("readImageMeta exposes `left`, whole positive numbers only", () => {
  const m = M.readImageMeta({ slots: ["avatar"], left: { foreign: 1, post: "2", other: -1, external: 1.5 } });
  assert.deepEqual(m?.left, { post: 0, other: 0, foreign: 1, external: 0, private: 0 });
  assert.deepEqual(M.readImageMeta({ slots: ["logo"] })?.left, { post: 0, other: 0, foreign: 0, external: 0, private: 0 });
});

test("Remove again: the same value back is live again unless the removal MOVED the file", () => {
  // Club logo: the R2 key is kept as evidence, only the column was cleared.
  const club = row("c1", "image_remove", { slots: ["logo"], previous: { logo: KEY }, paths: [], left: { private: 1 } });
  assert.equal(M.removalStep(club, "logo", { logo: KEY, banner: null }), "new", "officer re-set the removed key");
  // Still empty: a half-done press finishes (the clear is compare-and-set; no second row).
  assert.equal(M.removalStep(club, "logo", { logo: null, banner: null }), "finish");
  // Group chat photo, same rule.
  const chat = row("g1", "image_remove", { slots: ["photo"], previous: { photo: `groups/${VICTIM}/x.jpg` }, paths: [], left: { private: 1 } });
  assert.equal(M.removalStep(chat, "photo", { photo: `groups/${VICTIM}/x.jpg` }), "new");
  // Another account's file re-set as their avatar: live again, new row.
  const foreign = row("f1", "image_remove", { slots: ["avatar"], previous: { avatar: FOREIGN }, paths: [], left: { foreign: 1 } });
  assert.equal(M.removalStep(foreign, "avatar", { avatar: FOREIGN }), "new");
  // An outside logo left where it was, even alongside a moved own logo.
  const logoRefs = [{ column: "current_on", index: 0, key: "logoUrl", url: "https://cdn.example.com/l.png" }];
  const mixed = row("l1", "image_remove", {
    slots: ["logos"],
    previous: { logos: logoRefs },
    paths: [`${OWNER}/logos/logo-1.png`],
    left: { external: 1 },
  });
  const same = M.logoValueKey(M.readImageMeta(mixed.meta)?.previous.logos as never);
  assert.equal(M.removalStep(mixed, "logos", { logos: same }), "new");
  // The student's own file, moved into quarantine, value unchanged: a half-done press.
  const own = row("o1", "image_remove", { slots: ["avatar"], previous: { avatar: AV }, paths: [`${OWNER}/avatar-1.jpg`], left: {} });
  assert.equal(M.removalStep(own, "avatar", { avatar: AV }), "finish");
  assert.equal(M.removalStep(own, "avatar", { avatar: null }), "finish");
});

test("Put back from an older takedown never acts on a newer one", () => {
  // R1 took down A; they set B; R2 took down B. Newest for the slot is R2.
  const r1 = row("r1", "image_remove", { slots: ["avatar"], previous: { avatar: AV }, paths: [`${OWNER}/avatar-1.jpg`] });
  const r2 = row("r2", "image_remove", { slots: ["avatar"], previous: { avatar: pub(`${OWNER}/avatar-2.jpg`) }, paths: [`${OWNER}/avatar-2.jpg`] });
  const latest = M.latestPerSlot([r2, r1]).avatar ?? null;
  assert.equal(latest?.id, "r2");
  assert.equal(M.isSameTakedown(latest, "r1"), false, "Put back on R1 -> 409 not_latest");
  assert.equal(M.isSameTakedown(latest, "r2"), true, "Put back on R2 -> goes ahead");
  // A restore of the same removal: finishing it is allowed; of another, no.
  const back = row("x1", "image_restore", { slots: ["avatar"], removal_id: "r2" });
  assert.equal(M.isSameTakedown(back, "r2"), true);
  assert.equal(M.isSameTakedown(back, "r1"), false);
  assert.equal(M.isSameTakedown(null, "r1"), false);
  assert.equal(M.isSameTakedown(row("p", "post_remove", {}), "p"), false);
});

test("Restore finishes only while the restore is fresh", () => {
  const t0 = Date.parse("2026-09-28T12:00:00Z");
  const back = (at?: string) => row("x1", "image_restore", { slots: ["avatar"], removal_id: "r1" }, at);
  assert.equal(M.restoreStep(back("2026-09-28T12:00:00Z"), { avatar: null }, t0 + 60_000), "finish");
  assert.equal(M.restoreStep(back("2026-09-28T12:00:00Z"), { avatar: null }, t0 + M.RESTORE_FINISH_MS), "finish");
  assert.equal(M.restoreStep(back("2026-09-28T12:00:00Z"), { avatar: null }, t0 + M.RESTORE_FINISH_MS + 1), "nothing");
  assert.equal(M.restoreStep(back("2026-09-25T12:00:00Z"), { avatar: AV }, t0), "nothing", "days later: never re-run");
  assert.equal(M.restoreStep(back(), { avatar: null }, t0), "nothing", "no readable time counts as old");
  assert.equal(M.restoreStep(back("not a date"), { avatar: null }, t0), "nothing");
  // A removal is unaffected by the window.
  const r1 = row("r1", "image_remove", { slots: ["avatar"], previous: { avatar: AV } }, "2026-01-01T00:00:00Z");
  assert.equal(M.restoreStep(r1, { avatar: null }, t0), "new");
});

test("scopeToLatestSlots: one file off both slots, a later takedown of the photo only", () => {
  const r1 = row("r1", "image_remove", { slots: ["avatar", "banner"], previous: { avatar: AV, banner: AV }, paths: [`${OWNER}/avatar-1.jpg`] });
  const r2 = row("r2", "image_remove", { slots: ["avatar"], previous: { avatar: pub(`${OWNER}/avatar-2.jpg`) } });
  // All slots still on r1: the same row back.
  assert.equal(M.scopeToLatestSlots(r1, { avatar: r1, banner: r1 }), r1);
  const scoped = M.scopeToLatestSlots(r1, { avatar: r2, banner: r1 });
  const meta = M.readImageMeta(scoped.meta);
  assert.deepEqual(meta?.slots, ["banner"]);
  assert.deepEqual(Object.keys(meta?.previous ?? {}), ["banner"]);
  assert.deepEqual(meta?.paths, [`${OWNER}/avatar-1.jpg`]);
  assert.deepEqual(M.readImageMeta(r1.meta)?.slots, ["avatar", "banner"], "the input is not mutated");
  // Restore decides on the scoped slots only.
  assert.equal(M.restoreStep(scoped, { avatar: null, banner: null }, 0), "new");
  assert.equal(M.restoreStep(scoped, { avatar: null, banner: pub(`${OWNER}/banner-9.jpg`) }, 0), "replaced");
  // A slot the route didn't read is dropped; nothing left means nothing to do.
  const none = M.scopeToLatestSlots(r1, {});
  assert.equal(M.readImageMeta(none.meta), null);
  assert.equal(M.restoreStep(none, { avatar: null }, 0), "nothing");
});
