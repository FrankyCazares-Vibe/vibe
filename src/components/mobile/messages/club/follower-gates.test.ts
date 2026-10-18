/**
 * Only MEMBERS type, react or vote in a club's chats (club model, Franky's
 * rules of Oct 16): the screens' side of it, read as text in the
 * `rooms-dialog-rules.test.ts` style (wave-2 repair, finding 19). The server
 * refuses a follower's writes either way (wave-1 tests); these keep a
 * follower from ever being SHOWN a composer, a room chip, a panel or a
 * reaction they can't use.
 *
 * Run with:
 *   node --test src/components/mobile/messages/club/follower-gates.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const at = (src: string, needle: string, file: string): number => {
  const i = src.indexOf(needle);
  assert.ok(i >= 0, `${file}: ${needle}`);
  return i;
};

test("RoomComposer: a follower gets the tile, before any composer or closed tile", () => {
  const src = read("./RoomComposer.tsx");
  const gate = at(src, "if (isFollower(viewer)) return <FollowerTile ", "RoomComposer");
  const body = src.slice(src.indexOf("export function RoomComposer"));
  const gateInBody = body.indexOf("if (isFollower(viewer)) return <FollowerTile ");
  assert.ok(gateInBody > 0 && gate > 0);
  for (const later of [/<ClosedTile\s/, /<textarea\s/, /<CardTray\s/, /aria-label=\{sendLabel\(/]) {
    const i = body.search(later);
    if (i >= 0) assert.ok(i > gateInBody, `${later} comes after the follower gate`);
  }
  // The tile itself: one control, the club page's membership action; nothing to send, react or vote.
  const tile = src.slice(src.indexOf("function FollowerTile("));
  for (const word of ["onReact", "onVote", "<textarea", "sendMessage"]) assert.ok(!tile.includes(word), word);
});

test("ClubSpace (phone): no room chips, no Board strip and no BoardView for a follower", () => {
  const src = read("./ClubSpace.tsx");
  at(src, "{follower ? null : <RoomChips ", "ClubSpace");
  at(src, '{!follower && activeRoom?.kind !== "board" && boardLatest && board ? (', "ClubSpace");
  const followerBoard = at(src, '{activeRoom.kind === "board" && follower ? (', "ClubSpace");
  const boardView = at(src, ') : activeRoom.kind === "board" ? (', "ClubSpace");
  assert.ok(followerBoard < boardView, "the follower's Board is decided before the member's");
  assert.ok(src.slice(followerBoard, boardView).includes("<FollowerBoard "));
});

test("ClubPane (desktop): no panel, no chips, no toggle and no BoardView for a follower; Up next for them", () => {
  const src = read("../../../desktop/messages/ClubPane.tsx");
  at(src, 'const mode = follower ? "hidden" : panelMode(', "ClubPane");
  at(src, "{follower ? null : space && org ? (", "ClubPane");
  const toggle = at(src, "{follower ? null : (", "ClubPane");
  assert.ok(src.slice(toggle, toggle + 400).includes("ref={toggleRef}"), "the panel toggle is behind the follower gate");
  at(src, ") : member ? (\n            <ClubPanel", "ClubPane");
  const followerBoard = at(src, '{kind === "board" && isFollower(viewer) ? (', "ClubPane");
  const boardView = at(src, ') : kind === "board" ? (', "ClubPane");
  assert.ok(followerBoard < boardView);
  at(src, "{follower && data && data.up_next.length > 0 ? (", "ClubPane");
});

test("FollowerBoard: read only, its one button is Earlier messages", () => {
  const src = read("./FollowerBoard.tsx");
  assert.equal((src.match(/<button/g) ?? []).length, 1);
  assert.equal((src.match(/onClick=/g) ?? []).length, 1);
  assert.match(src, /onClick=\{\(\) => void poll\.loadEarlier\(\)\}/);
  for (const word of ["onReact", "onVote", "onContextMenu", "onPointerDown", 'role="button"']) assert.ok(!src.includes(word), word);
});

test("OrgMenu hands the viewer's role to orgMenuItems unchanged (the owner is never offered Leave)", () => {
  const src = read("../../../orgs/OrgMenu.tsx");
  assert.match(src, /orgMenuItems\(\{ signedIn: true, role: p\.role, muted, readersOn \}\)/);
  assert.equal((src.match(/orgMenuItems\(/g) ?? []).length, 1);
});
