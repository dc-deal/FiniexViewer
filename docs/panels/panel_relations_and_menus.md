# Panel Relations and Menus

Panels never control one another: each kind declares the link keys it follows and the ones it chooses. Read this document after [Panel Dock](panel_dock.md) to see how panels relate, how a report section leaves the run bundle and goes back, and how a hidden panel returns where it stood.

**What a panel follows and chooses is DATA on its kind** (viewer#42 — VS Code's register of views
as the model: a register, the link it reads, one `reveal` that shows a view). `PanelKind.relations`
names the bundle a kind is a member of, the link keys it FOLLOWS — a change of which changes what it
shows: other figures, other rows, another unit drawn — and the keys a control in it CHOOSES. A key it
only marks a row by is not followed: a list that stays whole does not follow the pick it shows. A
section declares its own in the registry, the same in the bundle and as a panel. Who controls whom
is the chooser and the follower of a key, never one panel over another.

```
kind              member of   follows                  chooses
Deployments       —           deployment ¹             deployment · run
Sweeps            —           sweep ¹                  sweep · run
Runs              —           —                        run
Run bundle        —           run  + its members ²     its members ²
Run chart         —           run · scenario · position scenario
Free chart        —           market ¹                 market
Layers            —           the chart in front ³     —
Activities        —           —                        —
Scenarios         Run bundle  run                      scenario
Trade history     Run bundle  run · scenario           position
Orders            Run bundle  run · scenario           position
Booking periods   Run bundle  run · scenario           —
Warnings & errors Run bundle  run · scenario           —
every other       Run bundle  run                      —
```

¹ Said on the card only where ANOTHER kind can choose the key: a key nobody else chooses is the
panel's own pick, and *Follows* would send the reader looking for a panel that sets it. ² A bundle
says what the members standing in its column follow and choose; one open as a panel of its own,
hidden, or absent for the run takes its links with it. The card words them in one fixed phrase per
key, in the link's order: *Follows — the chosen run and the scenario in focus · Chooses — the
position · Part of — Run bundle*. A test holds every kind to its declaration: a section the
narrowing filters follows the scenario, one that only marks it does not, and nothing is followed
that no kind chooses. The run chart follows the position: a position chosen in a list re-centres
it and draws its marks larger, where it is of the unit on show. Not claimed: the run header links a
deployment only on a deployment's session, so it does not claim the deployment for every run.
³ FOCUS, not a link (viewer#41): the Layers panel works on the chart last in front, kept by the dock
store as `lastChart` from dockview's `onDidActivePanelChange` — a panel whose kind draws layers of
its own; any other coming to the front leaves it as it was. `PanelRelations.chartInFront` declares
it, and the card says *Follows — the chart last in front* (see
[Chart Drawings and Layers](chart_drawings_and_layers.md)).

**A section of the run bundle opens as a panel of its own** (viewer#31, decided 2026-10-14). The
run bundle stays one column and a section the reader wants beside another is pulled out: the button
among its header's controls (`action-open-panel`) opens it as a docked panel, and ⇲ on that panel's
tab (`action-back-into-column`, *Back into the bundle*) puts it back in the column. The texts on
screen name that button by its title: its drawing is a panel and an arrow, not the ⇲ these notes use. A section is in
one place at a time. An
AutoTrader session writes fewer sections than a backtest; the column absorbs that by growing
shorter, where a grid of eleven panels would have left empty areas or moved.

```
[☰ Runs] [▤ Run bundle · 20261012_…]     │ [☰ Trade history]
  the bundle's column                      │   the section, with its own scroll
  ▾ Executive summary                  ⇱   │
  ▸ Orders                             ⇱   │
```

- **One kind per section, `report-<section id>`** (`reportKindId` in `panel_kinds.ts`), kept out of
  the menu's top level: the Panels menu lists the sections in the submenu *Runs*. Its tab
  shows the FORM — `form-list` for
  the four lists, `form-sheet` for the others — and a section panel carries the narrowing's frame
  where the narrowing filters the section; the narrowing itself is said in the menu bar. The
  registry says how a section takes it, in `narrowing`: `filters` (Trade history, Orders, Booking periods, Warnings & errors) draws only the
  chosen scenarios' rows, `marks` (Scenarios) keeps every row and marks the chosen ones, `null`
  does not read it — the Executive summary reads it and narrows nothing, its mark saying the
  figures are the whole run's. The tab dims its title where the chosen run has nothing for
  the section, and shows ✖ *could not be loaded* where the section failed.
- **`components/dock/ReportSection.vue`** draws the section's component with the model the column
  hands it (`run_sections_store`), behind the same boundary. Where there is nothing to draw the
  panel STANDS and says why — the backend's sentence where it gave one, *This run carries no such
  section* where the run's artifact list lacks it, since which pipeline writes which section is the
  backend's rule. A size container, so the lists measure their caps against this panel, and framed
  dashed where the narrowing FILTERS it, like the column: a frame says *what you see is a part*,
  which is untrue of a list that still shows every row. It also tells the section it is the whole
  panel (`provideFillsPanel`, `composables/use_fills_panel.ts`): the booking periods then give
  their table the height the timeline leaves, where in the column, among stacked sections, it keeps
  its cap.
- **Where a section stands is derived, never stored.** The dock store keeps `openIds` from
  dockview's own `onDidAddPanel` / `onDidRemovePanel`, and the column leaves out a section whose
  panel is open; its place in `layout.v1` stays, so ⇲ restores it and a reset of the dock gives
  every section back. `openSection(id)` brings an open section to the front, or opens it — the
  first as a split to the right of the run bundle, each further one as a tab beside the last, so the
  screen is not cut thinner with every section. The lines above the column (absences, failures,
  older schemas) leave out a slot whose every reader is open as a panel: that panel says it.
- **The jump lands where the section IS:** its own panel comes to the front and is searched for the
  marked row; for a section in the column, the run bundle comes to the front first, since the jump
  may start in a section panel. A hint above the column (`open-as-panel`) says how a section comes
  out and goes back.
- **A bundle the reader emptied says so** (viewer#42): where every section stands as a panel of its
  own or is hidden, the column gives way to one sentence — *“Back into the bundle” on a panel's tab brings it back here,
  the Panels menu shows a hidden one* — and neither the frame nor the hint, which says the same,
  stands around nothing. Where what is left is sections the run does not carry, the sentence speaks
  of the sections it carries. A run that carries none had nothing taken out, and the lines above the
  column already say why (`use_section_states.ts` holds where each section stands).

**Closing hides, alike for every panel — and the Panels menu shows it again where it stood**
(viewer#31, 2026-10-14). The section bar above the column is gone; the Panels menu took its place.
A tick is a panel on show, a click hides it or shows it again, and the menu stays open so several
can be switched in one visit. The run bundle's sections stand in the submenu *Runs*, in
the column's order, each with where it is (`use_section_states.ts`): in the column, open as a panel
(⇱), hidden, or struck where the chosen run has none — listed rather than left out, because an
inventory that silently shortens is not one.

```
Panels ▾
├ ✓ Deployments
├   Sweeps
├   Runs ▸ ┬ ✓ Run list
│          ├ ✓ Run bundle
│          ├ ✓ Run chart
│          ├ ─────────
│          ├ ✓ Executive summary          in the bundle
│          ├ ✓ Trade history          ⇱   open as a panel
│          ├   Feed health                hidden
│          └   Scenarios                  struck: the run has none
├   Free chart
├   Layers
└   Activities

[▤ Run bundle · 20261012_… ⋯ ✕]     the bundle's own commands, on its tab
                 └ Collapse all · Reset bundle
```

- **Where a panel stood is noted just BEFORE the layout changes** — dockview's `onWillMutateLayout`
  fires while a panel about to be closed is still in place. A place names the panels it stood
  beside, not its group, because dockview issues group ids anew: the tabs it shared a group with and
  its index among them, or the panels of the neighbouring group (`adjacentGroupInDirection`), the
  side, and the width or height its own group had. Kept as `places` in `arrangement.v1`, so a panel
  hidden before a reload still comes back where it stood; on attach the places are kept against the
  kinds, so a retired kind's place goes, and so does its name from the panels another stood beside —
  unless it was the only one: a place is also the record that the panel was hidden.
- **Showing a panel again** uses its place while one of the panels it stood beside is still open,
  at the size it had; otherwise a main panel opens beside the active one, and a section goes back
  into the column, whose panel comes to the front. The Layers panel opens first as a split 240 px
  wide to the right of the chart last in front, at any width of the dock — as a tab it would hide
  the chart it arranges.
- **A section's panel closed is a section hidden** (`onDidRemovePanel`), however it was closed —
  its tab's ✕ or the menu. Only ⇲ sends it into the column, which forgets its place; the column's own
  ✕ goes the same way through `hideSection`. A rebuild of the dock — a reset — hides nothing.

**The quick bar beside a group's tabs** holds the few options of the panel in FRONT of that group
(`QuickBar`, from the kind's `quickBar`): for the free chart its broker, symbol and timeframe, for
the run chart its unit and timeframe and `≡ Layers` — marked while the Layers panel is open — as compact selects (`AppSelect` with `compact`) — the value is what shows, the name while nothing is chosen, and
each carries its name for a screen reader. A panel without options leaves the bar empty, and two
groups side by side each speak for their own front panel.

**The quick bar gives way before a tab does.** `dock_theme.css` gives dockview's actions container
an overwhelming shrink share against the tabs (`flex-shrink: 1000000`), down to the least width the
bar's content declares: the bar shortens first, and a tab goes into the overflow menu only after it.
A share of 100 to 1 still cost the tabs 2 px, and one pixel short is enough for dockview to move a
tab into that menu (measured at 560 px).
