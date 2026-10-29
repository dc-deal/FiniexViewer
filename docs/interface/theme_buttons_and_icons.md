# Theme, Buttons and Icons

Every surface, control and glyph in the viewer comes from a small set of shared parts, and this document describes them. Read it before you add a colour, a control or an icon, so that the new part takes a role the existing ones already carry instead of inventing its own. The building blocks themselves, one line each, are mapped in [UI Building Blocks](ui_building_blocks.md).

## Theming — CSS Custom Properties

All colors, spacing, and type scale are defined as CSS custom properties in `src/styles/tokens.css`. The type sizes are in `rem`, so a small size inside a small size stays the same size — `--font-size-sm` was `0.85em` until 2026-10-14 and compounded, which set tab titles and the section toggles at 11.56 px under 13.6 px panel text. `--font-size-xs` (0.75rem) is what explains a row in its opened part, read once and so smaller than the row (2026-10-28). What floats over the page — a hover card, a menu, a filter popup — wears its own overlay surface, border and shadow (`--color-bg-overlay`, `--color-border-overlay`, `--shadow-overlay`): on the panel surface with the panel border a card could not be told from what it covered. The overlay surface stays a small step, because muted text has to keep 4.5:1 on it; the border and the shadow set it apart. The "whole run" mark beside a figure a narrowing cannot split is one component, `base/ScopeMark.vue`, drawn with an outline rather than a border so it takes no room in the line it stands in. Dark mode is the default; light mode overrides the same variables under `[data-theme='light']`. Each theme also sets `color-scheme`, so the browser's own parts — buttons, fields, scrollbars, a native list — follow the app's theme rather than a default of the browser's: a bare button's ink once stood white on the light theme, unseen. The active theme is controlled by a `data-theme` attribute on `<html>`, written in exactly one place — `App.vue` watches the settings store and sets the attribute. No panel receives the theme as a prop; it reads the tokens the attribute selects, which is why a theme change needs no re-render anywhere else. The one exception is a canvas, which is painted with values: `CandleChart.vue` reads the tokens itself and repaints through a `MutationObserver` on the attribute (see [Chart Engine](../panels/candle_charts.md#chart-engine--lightweight-charts-tradingview)). A future canvas layer — an indicator, the signal overlay, an algo's drawings — takes the same path.

This avoids a CSS-in-JS dependency, works natively in every browser, and is trivially inspectable in DevTools. Reka UI (headless component layer) is deferred — no concrete accessibility need has surfaced yet.

**Surfaces are not roles.** `bg-hover` and `bg-active` are lightness steps of one surface that a
control moves through as it is pointed at and pressed — lifting, then sinking, in both themes, so
"pressed" reads the same way whichever theme is on. They are not measured for hue distinctness the
way a role colour is; what they were measured for is text contrast, which is 12.97:1 or better over
all three button surfaces in both themes (2026-09-27).

**A role colour is computed, and the constraints can contradict each other.** Measured 2026-09-29:
the light theme's `--color-positive` was `#0f8a7e` — **4.24:1 against white, the only status colour
in that theme below WCAG AA for normal text**, and the only one under the 0.100 chroma floor. The
replacement was not chosen but searched for, and the search says how little room there is:

```
max chroma reachable in sRGB      >= 4.24:1   >= 4.50:1
hue 178-192  (the teal it is)        0.103       0.101
hue 165-178  (greener)               0.118       0.114
hue 150-165  (green)                 0.156       0.150
```

`#008674` takes that whole room: chroma 0.101, 4.504:1. A greener candidate reached 0.114 and
4.58:1 — better on both stated thresholds — and was rejected, because its distance from
`--color-negative` under deuteranopia fell from 11.7 to 8.3 ΔE. Green against red is the axis
red-green colour blindness collapses, so the better numbers would have been paid for on the channel
that matters most for a profit-and-loss palette. The sign in the figure itself is the second
channel that makes 10.7 ΔE enough.

**`text-secondary` on a surface is the look of a DISABLED control, and nothing clickable may wear
it.** A settings button did, and the first person to meet it read it as greyed out and unusable
although it worked. That is not a misreading — it is the correct reading of a wrong style.

## Buttons — `AppButton`, and why the states are the component

`base/AppButton.vue` is every button in three shapes: `solid` has a surface of its own, `quiet` is an
action inside a line of text and stays flat until pointed at, and `link` is a jump to another place
(below). Before it existed there were two bespoke button styles and five one-off text actions, and
none of them had a hover or a pressed state — a click produced no feedback at the control itself.

**Each state carries two channels, so none depends on one.** Hover lifts the surface *and* takes
the interactive border; the press sinks the surface *and* moves the control down a pixel. The
second half matters: the surface step is a luminance ratio of about 1.1, far too weak to carry
press feedback alone, while position works regardless of contrast sensitivity. Focus draws a ring
rather than recolouring the border, because a border that only changes colour is invisible against
a surface of similar lightness — and the keyboard reader is the one who needs it most.

A toggle reuses the pressed look as a lasting state instead of inventing a fifth appearance, and
`aria-pressed` is emitted only where `active` is actually used: a plain button carrying it claims
to be a toggle it is not.

**`marked` is the chosen look WITHOUT that announcement**, and the distinction is not pedantry. A
facet's popover trigger holds a state worth showing — values are picked — but it is a disclosure,
and Reka UI already gives it `aria-expanded`; `aria-pressed` beside that announces two roles at
once. So `marked` takes the border and the ink, and what the control states in words (the count
badge) is what carries the meaning aloud. `active` stays for a real toggle, such as the sort group
where one of several is chosen.

**`compact` is the second size**, and it exists because density is a requirement of these views
rather than a preference: a facet bar carries six or more chips side by side. It changes the
padding and nothing else, so every state still reads the same.

**A portalled trigger is not an exception — `as-child` is the answer.** The facet chips carried
sixty lines of CSS that restated `AppButton`'s four states with the same tokens, because two of the
three are Reka UI `PopoverTrigger`s. Wrapping them with `as-child` lets the primitive keep the
disclosure behaviour while `AppButton` carries the look, and the duplicate contract is gone — a
second copy drifts the moment the first one changes. Measured after the change: the chips are still
20 px tall with `2px 8px` of padding, so nothing got less dense. The same pattern already held the
dialog's close button.

**`link` is the third shape, and `base/JumpLink.vue` its one user.** A jump to another place — a
run id in a session row, a position id in a group header, a lane's label — is worn as a link:
accent ink, no padding and the font of its line, so its text stands exactly where text would stand
in a table cell. It keeps the four states: hover lifts a surface *and* underlines, the press sinks
it *and* moves it a pixel, and focus draws the ring — and also underlines and lifts the surface,
because a cell that cuts its text off cuts a ring drawn outside the link too, and focus must show
inside the link's own box where no clip reaches. `JumpLink` wears no arrow: the accent ink already
says it is clicked, and an arrow on some links only read as a second kind of link (operator,
2026-10-28). It shortens the name itself: a table cell cuts the text inside it with an ellipsis, but a button is one box to the
cell, which could only clip it whole. Where a place lets its values wrap instead (the run header's
definition list), it lets the name wrap too. Until 2026-10-12 the same look stood in six
components — four `RouterLink`s underlined on hover and nothing else, two jump buttons underlined
on hover and focus.

**A jump sits INSIDE the element that owns a column, never on it.** The timeline's label column is
a `span` holding the `JumpLink`, not a `JumpLink` carrying the column's class: put on the button,
the class lost to the link shape's inherited font, and the run ids were drawn at 16 px beside a
13.6 px axis caption, with a hover surface the width of the whole column.

**What is still not an `AppButton`:** the entries of a menu, the accordion header, the JSON fold,
and the option rows inside a facet's popover. Those are menu items and disclosure headers rather
than buttons — a different control type with a different shape, not the same one written twice.
The on/off lever is a control of its own, below.

## Switches — `AppSwitch`, one on/off for the whole app

**Every on/off choice outside a menu is a lever** (operator, 2026-10-19), decided once so that no
panel invents its own: a track with a knob, `role="switch"` with `aria-checked`. A menu keeps its
tick — there the whole entry is the switch, and every menu reads that way. There are no checkboxes:
two models for one choice is the inconsistency this document exists to prevent.

```
(●━━)  off        (━━●)  on        ◐ 70%   ← a slider's handle, below
```

- **The state is FORM first.** The knob stands left for off and right for on, which survives
  greyscale and red-green colour blindness; the link colour of the track only reinforces it.
- **The four states are the buttons'.** Hover rings the track in the link colour, in both positions;
  the press sinks it a pixel; focus takes the outline; disabled wears the muted ink and edge.
- **Its word is part of the click** (`label`), because a reader aims at the word as often as at the
  lever. Without one, the caller names it with `aria-label` — the Layers panel's rows, whose title
  opens the row instead.
- **`compact`** is the lever of a dense row, 22 × 12 px against 26 × 14: in the Layers panel the full
  one outweighed ◐ beside it (operator, 2026-10-28).

## Sliders — `AppSlider`, a share set by a lever that opens from its handle

**A setting along a scale is a handle where the thing is, and a vertical lever that opens from it**
(operator, 2026-10-19), the way a fader or a volume control opens. The handle shows the value where
it is below the top of the scale; a click opens the lever in a popover, and what it moves is drawn
while it moves. Vertical, because a row in a narrow panel has height to spare and no width. It is
built on reka-ui's slider rather than the browser's range input, whose colours follow the browser's
look rather than the tokens. The arrows step, Home and End go to the ends, Escape closes. One user so
far: a drawing layer's opacity.

## A change of state moves nothing

**A control keeps its size whatever it shows, and so does the row it stands in** (operator, on
screen, 2026-10-19). A toggle that drew a frame only while on changed its width, and the title
beside it moved at every click; a hint whose dismissals stood beside its text squeezed the text to
one word a line in a 240 px panel. So a glyph or a value that changes gets a fixed width (a
`min-width` in `ch`); an off state is said by the knob and by greying the row, never by taking a
frame away; and a box's actions wrap below its text before the text is squeezed (`HintLine`).

## Icons — `AppIcon` and the registry

**An icon is named by what it MEANS, and one registry decides how it is drawn.**
`src/icon_registry.ts` maps each meaning to a drawing — Tabler Icons (MIT), pinned exactly as
`@tabler/icons-vue` 3.49.0, stroke 2 — and `base/AppIcon.vue` draws one by name. A caller never
names a drawing, so one meaning has one icon everywhere and a wrong name is a type error rather
than an empty square. The names are the `IconName` union in `src/types/icon_types.ts`, and the
compiler holds the registry to it in both directions. The word is *icon* on purpose: a *symbol*
here is a traded instrument, and the *register* is the term map `scripts/check_terms.py` reads.

**Colour and size come from where the icon sits.** It draws in `currentColor`, the colour of the
element it is placed in — in a panel header that is the trigger's primary ink, a step stronger
than the secondary title beside it, as the emoji before it was. Its size is `1.2em`: about 16 px in
a panel header, the size stroke 2 was chosen for because a thinner line on secondary ink reads as
faint, and about 14 px in a menu or a tab, whose text is smaller. It is hidden from a
screen reader, because an icon travels with a word and the word is what is read out.

**One naming scheme, checked rather than trusted** (`tests/icon_registry.test.ts`): `form-*` the
shape a panel takes, `kind-*` a panel kind — named after the panel's id — `status-*` a state,
`action-*` a control and `nav-*` where a panel belongs. The check fails on a meaning nothing draws,
on two meanings that share a drawing, on a name outside the scheme, and on a panel whose icon is
not `kind-<its id>`. It reads the source as text: a name in quotes of either kind counts, and the
registry is left out by what it says rather than by its path, so moving the file cannot silence
the check. Today the registry holds the eleven panel kinds, which replaced the emoji in the panel
headers and in the section bar the Panels menu has since replaced; an emoji kept its own colours, so
that bar greyed it out for a hidden panel, and a line icon in the element's colour needs only the
fading. The app's other glyphs
follow in a sweep of their own.

**The browser tab carries the same library's `chart-candle`** (`public/favicon.svg`), in the two
accent values chosen by the browser's own colour scheme — a favicon cannot read the app's tokens.
