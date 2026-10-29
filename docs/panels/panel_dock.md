# Panel Dock

The viewer has no pages: everything the reader keeps open is a panel in one dock, the way a code editor docks its views. Read this document first when you change anything on screen, and before you add a panel kind or a new way to show a panel.

## Docked Panels — `PanelDock`, `panel_kinds` and the dock store

**The application is a dock of panels, not a set of pages.** `PanelDock` wraps dockview (MIT,
pinned exactly together with its two packages through `overrides`, because it is released weekly):
tabs, groups and the seams between them. It knows PLACEMENT only — what a panel shows is its
KIND's, what it is about is its link's ([Selection State](../architecture/state_and_storage.md)). Floating groups are switched off: a
panel never floats over another (a non-goal, confirmed 2026-10-11). There is no router; the menu
bar and the tabs are the way between the views.

```
AppMenuBar   FiniexViewer  Panels ▾                         CPU · Memory   account   ☰
PanelDock    [☰ Deployments] [☰ Runs] [▤ Run bundle · 20261012_205715…] [◫ Run chart]
               ├─ PanelHost (kind: runs) → RunsView        the run list
               └─ PanelHost (kind: run)  → RunReportView   the run bundle
```

**The run list and the run bundle are two panels** (viewer#31, 2026-10-14). `runs` is the LIST — the
facet bar and the runs, nothing else; a pick chooses the run (`selectRun`) and brings `run` to the
front where it is open — a pick is a selection, and a selection never reopens a panel, nor covers
the list it was made in: where `run` stands as a tab beside the list, it stays behind. `run` is the
BUNDLE: the word is on its tab, *Run bundle · <run id>*, in the Panels menu and on ⇲ (viewer#42), so
the container has one name wherever it is named. It holds one line naming the run with *Show in
list*, and then the report's sections stacked as its members in one column.

**Show in list** (viewer#42, after VS Code's *Reveal in Explorer*; `useShowInList` in
`use_panel_jump.ts`) brings the run list to the front — reopened where it stood if it was closed —
opens the family holding the chosen run, centres its row in the list (the list only, never the view
around it) and marks it for a moment with a dashed edge in the annotation colour that fades
(`.record-row.flash`; standing still for the same moment without motion, and the scroll at once
rather than smooth). The keyboard is left in the LIST, never on the row, whose card opens on focus
and would cover the list unasked; left on the button, it stayed on a control the list had hidden. A
second call restarts the mark for its whole moment. A sweep's combination and a deployment's
session lead to the list that holds them instead — the Sweeps or the Deployments panel, through
`openInDock` — since the run list leaves them out by default (2026-10-20). It is not offered where
the list is on show with that row in view: the dock store keeps which panels are ON SHOW, as each
panel's host hears it from dockview (`shownIds`, `noteShown`), and the list measures whether the
chosen row stands in its own view with an IntersectionObserver (`runs_store.chosenRowInView`). The
button keeps its room while hidden, so the run line does not cut differently while the reader
scrolls. Where the list's filter or search hides the chosen run, the list says so with *Show every
run* — BELOW its rows, where the line's coming and going on a pick moves none of them; above them it
moved every row under the pointer by a line. The chosen run's family opens WITH the choice and can be closed again; it held itself open
before, so its heading was a button that did nothing. Its tab
names the run, so two browser windows comparing two runs are told apart at a glance — cut after the
date and time, whole in the tab's card (`PanelKind.subtitle`). The run's grade stands on the
bundle's tab, where the report is; the narrowing is said once, in the menu bar. The two failures are kept apart in
`runs_store`: the index failing is the list's to say (`indexError`), the summary failing the
report's (`summaryError`) — one shared ref let a broken summary blank the list it was picked from.
An index that could not be read says nothing about the chosen run: no panel calls the run gone, and
the run's panels say the index's failure in the error role. While the index is asked once more for
a run it did not hold, they say they load (`awaitingRun`) rather than that no run is chosen. A pick
of the run already on show does nothing; a pick of it after a failure is a retry of the SAME run,
which keeps its focus and its mark. A section that failed to load is not absent — the run carries
it — so it is not struck in the Panels menu (`run_sections_store.lacks`, the one rule for both).

- **`src/panel_kinds.ts`** — every kind in the SUGGESTED ORDER, from the general to the particular:
  a deployment holds runs, a run has its chart (operator, 2026-10-13). A kind names its title, the
  FORM its tab shows (`form-list`, `form-sheet`, `form-chart`), whether the first arrangement holds
  it, and the AREA whose submenu lists it in the Panels menu — the run list, the run bundle and the
  run chart share the area *Runs*, each under the name it has there (`menuTitle` where the tab's
  title would repeat the area's name: *Run list*). What
  is read or set and then closed — About, the settings — is a dialog and has no kind. Each component
  is loaded on demand into its own chunk, as the routes before them were.
- **`src/stores/dock_store.ts`** — the dock's API and the first arrangement: Deployments and Runs as
  tabs of one group, the run bundle as a split to their right (operator, 2026-10-20: a pick then
  shows the run without covering the list it was made in) with the deployment bundle as a tab behind
  it (viewer#43, 2026-10-27), and the run chart to the right of the
  bundle (operator, 2026-10-15), in front where the work is — the bundle where a run is restored,
  the run list where none is yet (`firstActiveKind`). Each column has a floor and the width beyond
  them is shared 28 · 38 · 34 (operator, 2026-10-20): the REPORT 860 px first, because its trade
  history and its orders keep the position column — the mark that opens a trade on the chart —
  only from 48rem of list, and at 682 px both lost it; the lists 470, below which the run list
  scrolls sideways (392 px of column, 420 needed); the chart 450. So the report stands beside the
  lists from a dock of 1330 px, the chart beside the report from 1780 — measured at 1787: 472 · 863
  · 452 — and below each the kind is a tab right after its anchor, where a split would leave the
  report's lists too narrow (measured 2026-10-15: at 620 px the run list overflowed its panel by
  95 px). The free chart is not in
  it and opens from the Panels menu. A stored layout that never held the run report gains it right
  after the run list where a run is chosen, in front where the list was, and one that never held
  the run chart gains it beside the report; never a panel the reader hid, which has a place to come
  back to. `reveal(kind, reason)` brings a panel to the front; a closed one opens where it
  last stood ([Closing hides](panel_relations_and_menus.md)), and beside the active one where nothing it stood beside is
  open — for a command only, never for a selection. A restored layout takes every panel's title
  from its kind: dockview stores the title with the layout, and an old one kept the tab's
  accessible name and the dock's announcements on a name the panel no longer has. `reset()` goes back to the suggested order and forgets every place — offered in the
  settings' Layout tab, beside everything else about arrangement, rather than as a menu of one
  entry. The layout is written
  into `arrangement.v1` once it has held still for 300 ms, and at once when the page goes or the dock
  is about to unmount — BEFORE, while dockview still holds the panels: written after, it was empty,
  and every hot reload during development replaced the reader's arrangement with the suggested one
  (reproduced 2026-10-14). A dock holding no panel is never written.
- **`src/components/dock/dock_layout.ts`** — the stored layout reconciled on load, never trusted. A
  panel of a kind this version does not know is dropped from its group, an emptied group from the
  grid, and floating and popout groups go. Where nothing usable is left — or dockview refuses what
  was stored — the suggested order is laid out instead, never an empty screen.
- **The dock is the window, and it CLIPS.** dockview draws every panel into an overlay of its own
  and sizes it from script, but only while the panel is on show: one behind another tab keeps the
  size it had. Made smaller, the window left such an overlay reaching past its bottom, unseen, and
  the page grew a scrollbar over empty space (measured 2026-10-16: the grid at 660 px, a hidden
  overlay at 918). `PanelDock` therefore hides its overflow. It clips only the unseen — a panel
  brought forward is laid out anew, and dockview shifts its own tab-overflow list inside the dock.
- **Every panel is shown through ONE `reveal(kind, reason)`** (the dock store, operator 2026-10-16,
  VS Code's `openView` as the model). It brings the panel to the front wherever it stands, in its
  own group, and it is the only way a jump, a link or a pick shows one — the store exports no
  `open`, so the type-check refuses a component that tries. The reason decides whether a CLOSED
  panel may open: a `command` (the Panels menu, a link or a jump the reader clicked) opens it where
  it stood; a `selection` (a pick in a list) never does. Seven call sites each decided that on their
  own before, and a pick in the run list reopened the run report the reader had closed, every
  section of it already out as a panel of its own.
- **A pick never covers the panel it was made in** (operator, 2026-10-20). A `selection` names the
  panel it came from, and where the target stands as a tab in that panel's group, it is left behind:
  the pick still chose, and every panel following the link switched. Picking through a sweep's
  ranking with the run bundle as a tab beside it hid the ranking at every click. In another group
  the target still comes forward, and a `command` always does.
- **A link goes to a bundle's members where they stand apart** (operator, 2026-10-28). A run id in
  a session, a booking period or an activity, and the deployment in a run's header, are a `link`:
  where members of the bundle stand open as panels of their own, the bundle stays as it is — closed,
  or behind its tab — and those members show what was chosen, each brought to the front of its
  group unless a member is there already or the click was made in that group. Who took members out
  chose to read them apart, and reopening the bundle they had closed moved the layout on a click
  about something else. With no member out the link opens the bundle as before, or the click would
  show nothing. A section to be shown while the bundle is closed and others stand apart — a jump
  from the orders to the trades, or the Panels menu showing a hidden one — joins them as a panel
  (`standsApart`). The Panels menu's own entry for the bundle always opens it.
- **A panel docks along a whole edge of the dock** (`DockEdges.vue`, operator 2026-10-16). Dragged
  to the outermost edge, a tab becomes a column over the dock's full height or a row over its full
  width, a quarter of it to start with; a drop on a group only splits that group. dockview has edge
  targets of its own (`dndEdges`) and they cannot do it here, for two reasons traced that day: the
  Vue binding declares the option a Boolean prop, so left unset it arrives as `false` and switches
  them off; and switched on, they see no drag over a panel kept in the page — `renderer: 'always'`
  puts its content in an overlay outside their element, so only the tab bars reached them. So the
  dock draws four bands of its own while a drag is under way (`onWillDragPanel`,
  `onWillDragGroup`), shows the room a drop will take in dockview's drop colours, and docks through
  the public API (`addGroup({ direction })`, `moveTo`). dockview's own edges are switched off
  explicitly, so the two never compete. The `dock-edges` hint says it, because nothing on screen
  shows an edge until a tab is dragged.
- **`PanelHost`** draws a panel the first time it is SHOWN and keeps it after: a tab behind another
  costs nothing until it is picked, and a panel returned to finds its scroll where it left it. It is
  the panel's error boundary, and it hands the panel its visibility — `onPanelShownAgain` fetches
  the run index and the ledger afresh, quietly and without a spinner, whenever their panel comes
  back, because a docked panel stays mounted where a route was entered anew.
- **`PanelTab`** shows the form icon, the title, ONE status where it says something, and ✕, which
  hides the panel; a section's tab also carries ⇲, *Back into the bundle*. A kind that offers
  commands about itself declares them (`PanelKind.actions`), and its tab carries ⋯ with them — the
  run bundle's *Collapse all* and *Reset bundle*, explained by the `bundle-commands` hint
  (viewer#42). The Panels menu held them until then; it now only shows and hides. Its card says what the
  panel is for, the bundle it is part of, what it follows and chooses, and the status in words —
  one builder, `tab_card.ts`, from the kind's declared relations ([Panel Relations and Menus](panel_relations_and_menus.md)). A section's card names
  the whole run in its heading, which its tab has no room for. The run bundle's tab carries the
  backend's grade of the open run (`run_outcome`) where it is not `success` — the icon in the
  warning or error role, its word read out with the tab and written in the card. Where everything
  went well, the tab says nothing. The card opens for a keyboard focus of the tab as well:
  dockview keeps that focus on its own element around the tab, so `PanelTab` listens there and opens
  it only where the focus is the keyboard's (`HoverCard`'s `open`, controlled where a caller needs it). **`dock_theme.css`** gives
  dockview's two themes this app's tokens: a tab behind another keeps the primary ink, because
  muted ink means *disabled* here, and the front tab is marked by its surface AND an accent rule.

**Measured 2026-10-13:** the start bundle grew from 393 to 744 kB (gzip 130 → 210 kB), and that is
dockview. The timings, taken again the same day on a quiet machine, moved by nothing beyond noise.
