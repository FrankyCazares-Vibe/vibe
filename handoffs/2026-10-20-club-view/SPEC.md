# The club's view: board spec (for the artboard builders)

Board folder: `scratchpad/clubview/` (render: `node render.mjs <File.dc.html> <w> <h> [scale]`, output in `shots/`).
Every artboard is a `.dc.html` file in `project/`. Read `project/A_Desk_Phone.dc.html` and
`project/A_Desk_Desktop.dc.html` FIRST: they are the reference shell. Copy their `<head>`, `<helmet>`, root,
header, cards, buttons, tab bar and left nav exactly (same colors, radii, font sizes), and change only the content.

## Format rules (each fails silently if broken)
- Keep `<script src="./support.js"></script>` in `<head>` exactly. Close every element, quote every attribute.
- `{{hole}}` is a dotted lookup into `renderVals()` only, never an expression. Use `<sc-for list="{{x}}" as="i" hint-placeholder-count="N">` and `<sc-if value="{{flag}}" hint-placeholder-val="{{true}}">`.
- An SVG `<path d="{{i.icon}}">` inside an sc-for is fine (a console warning about it is normal).
- Always include the `<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":W,"height":H}}'>` block with `class Component extends DCLogic { renderVals() { return {...}; } }`. Classic JS, no imports.
- No innerHTML/appendChild, no network except the Google Fonts link already in the reference, no emoji, inline stroke SVG icons only, no fake iOS status bar or keyboard.
- Real `<button>`, `<a href="#">`, `<label>`+`<input>`/`<textarea>`; `aria-label` on icon-only buttons; decorative SVG `aria-hidden="true"`. Touch targets 44px on phone (small chips 36px are OK).
- Phone artboards: root fixed `width: 390px; height: <H>px` (H is usually 1240 so the whole scroll shows), plus the dashed "first screen ends" marker at top: 844px exactly as in the reference. Desktop artboards: fluid PAGE root (`min-height: <H>px`, the flex-wrap row of the 216px nav + main `flex: 999 1 560px`), `$preview` width 1440.
- Keep each Write under ~200 lines; if a board is bigger, write it then extend it with Edit.

## Look (Night, from the app)
Page #0C0B0B; card rgba(22,21,21,0.86) with border rgba(255,255,255,0.07), radius 14 to 18; ink #F6F1EA; ink-2 #CFC8BE;
muted #9C958C (only for 12.5px+ captions); coral #FF5C35 (one coral thing per screen: the main button); small coral text #FF8A66;
text on coral #160A06. Titles: Fraunces 800, letter-spacing -0.02em, sentence case ("Get ready for members."). Body: DM Sans.
The soft coral bloom in the corners, as in the reference. Events kind colour (gold #F6C468) may mark event things sparingly.

## The sample club (invented, same in every board)
Sixty-Four Chess (@sixtyfour), avatar "SC" teal gradient (#2A8A8E to #1C5E62). Open club (anyone can join).
Officers: Priya Raman (Owner, president), Noor Haddad (Admin, events chair), Theo Lindqvist (Mod, social chair).
Members 23, followers 41 (+6 this week). Up next: Blitz Night, Thu 7 PM, The Lantern Room, 14 going, 6 interested,
check-in opens 6:00 (one hour before). Last event: Rapid Night, 18 came. Later: Rapid Night Thu Oct 30, Simul: play the president Thu Nov 6 (draft).
2 people want to join. Setup 4 of 6 done (photo and cover, about, who can join, officers); left: post your first event, invite your members.
Other people for avatars: Maya Okafor (MO), Elena Cruz (EC), Leo Fischer (LF).

## Rules for the content
- Counts are public from 5 up; identities private. Officers see exact numbers and the check-in list; never show names to non-officers.
- Never show Otto as an AI or as live help. Say "video posts", never "clips".
- Don't remove any existing feature. Moving something behind a tap is fine (say where it went).
- No school names or school marks anywhere (no IU, Purdue, Jaguars). The campus is just "Indianapolis".
- No filler: every element is one of the jobs below.

## The three jobs every option must serve
1. Priya, new president: set up the page (photo, about, who can join, officers), post the first event, invite members.
2. Noor, events chair: post this week's event, get it shared, run check-in at the door, see who came, thank them.
3. Theo, social chair: reach members (Board post, poll), bring members onto Vibe, share the club outside the app.

## The options (each is phone + desktop)
- A · Officer desk (built, the reference): a separate page just for officers. Needs you / setup / up next / quick actions / this week numbers / list.
- B · Run it from the Board: no new page. The club's space in Messages (header, Up next, chips Lounge · Board · event chats) gains officer tools where officers already talk.
- C · Your page is the storefront: the public club page is the officer's home, edited in place, marketing first.
- D · The club's week: the home is a timeline of the club's events, each showing where it is (posted, going, check-in, who came, thank-you).
- M · Markets for us (shared by all options): the Share sheet, the story cards, the table QR, the member invite.
