// B8 -> B6 handoff (Oct 19, 2026): the static desktop profile's calendar
// (public/html/profile.html, B6 step 6) joins the app's calendar sync and
// colour key. profile.html can't import src/lib/calendar/*, so this is the
// hand-copied twin. Paste the parts B6 needs; nothing here has been applied
// by B8 (profile.html is B6's file).
//
// REPAIR PASS (Oct 19, 2026, later), three changes B6's `cal-real` block
// must pick up to stay a twin of calendar-key.ts:
//   1. Coral is no longer a personal colour (it means an RSVP). In the New
//      Event form, the third swatch `#FF5C35` "Coral" becomes
//      `#26A69A` "Teal" (PERSONAL_COLOR_PRESETS: #5A9CFF, #9B7BFF, #26A69A,
//      #E0559B, #8A8580).
//   2. `vibeCalBar` maps a stored `#ff5c35` / `#f53` (the old default; the
//      database default and the personal-events route's fallback are still
//      `#FF5C35`) to the new default blue `#5A9CFF`. See section 3 below.
//   3. `.cal-chip--yours` uses `var(--ink-post)`, which profile.html defines
//      in Light and Night. (The first version said `--ink-body`, which only
//      the app's globals.css defines.)
// `refreshCalendar` below means B6's own one-read-at-a-time reader.
// GET /api/me/calendar now also names a private club for a non-member (the
// club behind a rush RSVP): `org` is no longer null for SAE prospects.
//
// Twins: src/lib/calendar/calendar-sync.ts (the channel and message) and
// src/lib/calendar/calendar-key.ts (the key, the links, barColor).
//
// Facts B6 can rely on:
// - GET /api/me/calendar: RSVP entries NO LONGER carry `color` (green/amber
//   are gone). Paint an RSVP by `viewer_status`: "going" | "maybe".
//   Personal entries still carry their `color` (a hex the person picked).
// - The word for "maybe" on screen is "Interested". The stored value stays
//   "maybe".
// - An RSVP entry with `org` links to /orgs/<handle>?event=<id> (the club page
//   scrolls to the card and flashes it). A personal entry has no link.
// - `room_id` (when not null) is the event chat: /messages?channel=<room_id>.

// ---- 1. Sync: hear RSVPs made in the Otto-corner window (an iframe of
// /messages?mini=1), in other tabs and on other pages; tell them about this
// page's own edits. `refreshCalendar` is whatever re-reads /api/me/calendar.
var vibeCalChannel = null;
try {
  vibeCalChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('vibe-calendar') : null;
} catch (e) { vibeCalChannel = null; }
var vibeCalHeardHidden = false;
if (vibeCalChannel) {
  vibeCalChannel.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.type !== 'calendar-changed' || d.v !== 1) return;
    // A hidden tab waits and reads once when it is looked at again.
    if (document.visibilityState === 'hidden') { vibeCalHeardHidden = true; return; }
    refreshCalendar();
  });
}
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && vibeCalHeardHidden) {
    vibeCalHeardHidden = false;
    refreshCalendar();
  }
});
// After this page saves or deletes a personal entry: tell everyone else.
// (The channel never delivers a post back to the page that sent it.)
function vibeCalEmit() {
  try { if (vibeCalChannel) vibeCalChannel.postMessage({ type: 'calendar-changed', v: 1 }); } catch (e) {}
}

// ---- 2. The key (same paint as calChipStyle in calendar-key.ts).
// .cal-chip { display:flex; align-items:center; gap:3px; height:18px; padding:0 6px;
//   border-radius:6px; font-size:10px; font-weight:700; line-height:18px; min-width:0; }
// .cal-chip > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
// .cal-chip--going      { background:var(--coral); color:var(--on-coral); box-shadow:inset 0 0 0 1px var(--coral); }
// .cal-chip--interested { background:var(--tag-bg); color:var(--charcoal); box-shadow:inset 0 0 0 1.5px var(--coral); }
// .cal-chip--yours      { padding-left:8px; color:var(--ink-post);
//   background:linear-gradient(90deg, var(--cal-bar) 0 3px, transparent 3px), rgba(var(--scrim-rgb),0.07); }
// Going gets the drawn check (never a glyph):
//   <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
//     stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
//     <path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
// Key line under the grid: the three chips with the words Going / Interested / Yours,
// then "Click an event to open its club." in muted ink.
function vibeCalKind(entry) {
  if (entry.kind === 'personal') return 'yours';
  return entry.viewer_status === 'going' ? 'going' : 'interested';
}
var VIBE_CAL_WORD = { going: 'Going', interested: 'Interested', yours: 'Yours' };
// A personal colour is used only when it is a plain hex (set it as --cal-bar).
// The old near-black preset (#1C1C1E) follows the ink token, so Night shows it.
// Coral means an RSVP, so an old coral entry gets the new default blue.
function vibeCalBar(color) {
  if (typeof color !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return 'var(--ink-muted)';
  var c = color.toLowerCase();
  if (c === '#1c1c1e') return 'var(--charcoal)';
  if (c === '#ff5c35' || c === '#f53') return '#5A9CFF';
  return color;
}
function vibeCalHref(entry) {
  if (entry.kind !== 'rsvp' || !entry.org || !entry.org.handle) return null;
  return '/orgs/' + encodeURIComponent(entry.org.handle) + '?event=' + encodeURIComponent(entry.id);
}
