# Board rules (from the Design canvas type; each fails silently if broken)

Skeleton of one artboard file:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Spring Menu</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>
body{margin:0}
a{color:#666}a:hover{color:#333}
</style>
</helmet>
<div style="width: 880px; height: 560px; box-sizing: border-box; padding: 64px; display: flex; flex-direction: column; gap: 24px">
<h1 style="margin: 0; font-size: 56px; color: {{accent}}">Spring Menu</h1>
<div>Pea soup</div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"accent":{"editor":"color","default":"#666666"},"$preview":{"width":880,"height":560}}'>
class Component extends DCLogic {
renderVals() {
return { accent: this.props.accent ?? '#666666' };
}
}
</script>
</body>
</html>
```

- Keep `<script src="./support.js"></script>` in `<head>` EXACTLY.
- Close every non-void element; quote every attribute.
- Root FIXED at w x h for a phone mockup; fluid for a PAGE (desktop app screen): no px width on the root,
  `max-width` containers, %/rem/fr, px/rem heights (`vh` only for a whole-screen root, never `%`).
- `$preview` = the frame's w x h.
- Inline `style="…"` is what the properties panel edits; `<helmet><style>` only for page basics, the `a` /
  `a:hover` colors, font `<link>`s and things inline styles can't do (placeholder color).
- Lay out sibling groups with flex or grid plus `gap`.
- `{{hole}}` is a dotted lookup into `renderVals()` only, never an expression. Compute in renderVals().
- Copy stays literal markup (viewers retype it in place); `data-props` declares tweaks (levers), not copy.
- Always include the `<script type="text/x-dc" data-dc-script>` block, classic JS
  (`class Component extends DCLogic`, no imports).
- All UI is `<x-dc>` markup, never script-built (no innerHTML/appendChild/window.X).
- No network except a Google Fonts css2 `<link>` in `<helmet>`. No `<iframe>`, `<object>`, `<embed>`, no
  global keydown handlers. Icons: inline stroke SVG, never emoji.
- A theme switch (the `night` tweak): compute a `t` object of colors in renderVals() from `this.props.night`
  and bind style holes to it (`style="background: {{t.page}}"`). That is allowed for a declared tweak.
- No fake iOS status bar or keyboard on phone boards.
- Accessible as drawn: real `<button>`, `<a href>`, `<input>` + `<label>`; aria-label on icon-only buttons;
  decorative SVG `aria-hidden="true"`; text 4.5:1 (3:1 at 24px+).
