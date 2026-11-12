# Named Layouts

The placement of the panels saved under a name and loaded with one click (viewer#37) — MetaTrader's *profiles*, TradingView's *layouts*. Read this before you change `src/stores/named_layouts_store.ts`, `src/components/LayoutsMenu.vue`, `src/components/LayoutsSettings.vue`, the shipped layouts in `src/layout_presets.json`, or how the dock lays a stored layout out.

```
FiniexViewer  Panels ▾  Layouts ▾
                        ├ ✓ Backtests                 shipped ▸ ┬ ✓ Full
                        ├   Deploys                   shipped ▸ ├   Medium
                        ├   Morning review                    ▸ └   Mobile
                        └ ⚙️ Manage layouts…        → Settings › Layouts

Settings › Layouts
┌─────────────────────────┬──────────────────────────────────────────┐
│ ✓ Backtests     shipped │ Name  Morning review                     │
│   Deploys       shipped │ [Rename] [Delete]                        │
│ ▸ Morning review        │                                          │
│ [+ Save this window as …]                                          │
│ [⬇️ Export all …] [⬆️ Import …]                                     │
├─────────────────────────┴──────────────────────────────────────────┤
│ Choose the layout by the run [Offer it ▾]  Backtest [Backtests ▾]  Session [Deploys ▾]
│ (●) Choose the size by the window   Medium from [900] Full from [1500]
│ Panels  [Back to the suggested order]                              │
└────────────────────────────────────────────────────────────────────┘
```

**The menu chooses, the settings manage** (operator, 2026-11-04). The Layouts menu lists the
layouts, ticks the loaded one and ends with *Manage layouts…*, which opens the settings on their
Layouts tab — the way the server switch ends with *Manage servers…*. Everything that makes, changes
or carries a layout stands there, as a list with a detail, never in the menu.

## What a layout holds — and what it never holds

```
HOLDS   the dock: the open panels, their splits and tab stacks · every panel's last place, a
        hidden one's included · what each panel shows expanded · a chart's layers, the heights of
        its panes and the one given the whole height · the bundles' columns: their sections in
        order, folded, pinned, locked or hidden
NEVER   the run, the deployment, the sweep, a narrowing, a marked position, the rows a panel keeps
        for one run, the server
```

**Loading one changes where things are, never what is shown.** A selection never moves the layout,
and a layout never moves the selection, so *Deploys* fits every deployment and *Backtests* every
backtest. The rows a panel keeps for the run it shows stay with the tab.

## Loading — at once, because the panels stay

`dockStore.restore(dock, prepare)` lays the layout's dock out with
`fromJSON(layout, { reuseExistingPanels: true })`. **A panel that stands in both layouts is moved,
never rebuilt:** it keeps its content, its scroll and its chart, and only what the layout adds is
drawn anew. No request is made, because what the panels show is in the stores already.

| Way | 5 → 15 panels (12 new) | 15 → 5 panels |
|---|---|---|
| panels kept (built) | 54–117 ms | 46–60 ms |
| every panel rebuilt | 169–240 ms | 93–171 ms |
| the page reloaded | 1.7 s | 1.7 s |

Measured 2026-11-03 at 1600 × 900 against the captured fixtures, three switches each way. Through the
menu, from the click to the second frame after it, `e2e/performance.spec.ts` reads 73–88 ms
(*a layout laid out*).

A load is reconciled like a start: `reconcileLayout` drops a panel this build does not know,
`reconcile` appends a section added since, and a bundle the layout never held is added the way a
stored arrangement without it gains one. `prepare` sets the places, the columns and the views only
once the dock is known to be usable — a layout that cannot be laid out changes nothing — and the
places go first, because they are also what keeps out a bundle the layout leaves out.

## The loaded layout follows the reader

Whatever a tab changes about its placement goes into the layout it loaded, half a second after it
rests (operator, 2026-11-03: the way MetaTrader keeps a profile). Back in it, everything stands as
it was left, and nothing asks to be saved. Which layout a tab loaded is `layout` in its
`arrangement.v1`; a new tab starts from it like from the rest of the arrangement.

In Settings › Layouts, on the layout picked in the list:

- **+ Save this window as …** makes a layout of this placement under a new name and loads it. A name
  is refused where it is empty or taken, whatever its case, and said so beneath the field.
- **Rename** and **Delete** act on a reader's own layout only; a shipped one's name is read, not
  typed. Delete asks on the first click and deletes on the second; a tab that had it loaded keeps its
  placement, loaded from none.
- **Reset to shipped** brings a shipped layout back as it shipped, laid out again where it is loaded.
- **Back to the suggested order**, below the layouts, takes the tab off its layout: the suggested
  order is no layout, and the loaded one would otherwise take it in as its own placement.

## Three sizes, each a layout of its own

*Full*, *Medium* and *Mobile* (operator, 2026-11-04): every layout keeps a placement for each, in
`placement` (Full) and `sizes.medium` / `sizes.mobile`, stored whole and never derived from one
another. A tab loads a layout in one size — `layoutSize` beside `layout` in its `arrangement.v1` —
and what it changes goes into that size alone; back in another size, that one stands as it was left.

- **The submenu** of a layout in the menu loads it in a size and ticks the loaded one. A click on
  the layout itself loads it in the size the tab stands in.
- **Every size starts from a placement made for it.** *Save this window as …* takes the size the tab
  stands in from this window, and the other two from the layout it was saved from, each in its own
  size — *Backtests* where none was loaded. A layout stored before sizes existed holds Full alone;
  its narrower sizes start from the shipped layout's, *Backtests* for a reader's own.
- **Reset to shipped** brings every size back as shipped.
- **Choose the size by the window**, in Settings › Layouts, is on by default since 2026-11-10, so a
  narrow window takes Mobile by itself; switched off, the size is the one chosen in the submenu,
  for a reader who would rather not be steered (operator). Switched on, the window's width chooses
  the size: Mobile below *Medium from* (900 px), Medium below *Full from*
  (1500 px), Full from there, in CSS pixels as the window reads them (`use_layout_size_by_window.ts`).
  The size changes once the window rests after crossing a width, and when the app opens, once the
  dock has laid out what was stored — so a size chosen by hand holds until the next crossing or the
  next opening (operator, 2026-11-10: the app had kept the size it was left in, and a narrow window
  opened onto Full squeezed into it); switching it on applies it at once. The two widths are refused where Medium's would stand at or above Full's.

*Mobile* is the arrangement for a narrow window, one column of the bundles, which are built for
little width. A phone below about 500 px would need more than an arrangement — a menu bar for it and
touch in the dock — and is not built.

## The shipped layouts

`src/layout_presets.json` holds *Backtests* and *Deploys* in all three sizes, each as the dock
serialised it — Full at 1600 × 900, Medium at 1200 × 800, Mobile at 600 × 800 — laid out by the dock
itself, never written by hand. Medium stands in two columns, Mobile in one: the lists above, the
bundle or the panels a reader of that layout looks at below. *Backtests* is the arrangement of
the README pictures (`e2e/readme_arrangement.json`) without its selection. *Deploys* is for following
a bot: the deployment list with the run list and the sweeps behind it, the sessions and the booking
periods across the deployment, the latest state frame, and the venue account with the orders behind
it, Activities below the lists. Its places keep the run bundle, the run chart and the deployment
bundle out and say where each comes back.

## Shared by every window

`layouts.v1` lives in `localStorage`, shared by every window. Every write reads the stored list again
first, and a write in another window reaches this one (`onSharedWrite` in `src/tab_storage.ts`), so
a layout saved there is never lost here; the settings and the banned hints follow another window the
same way since 2026-11-03. Two windows with the same layout loaded write into it in turn, and the
later change wins.

**Export all …** writes every layout into one file, `finiexviewer-layouts.json`. **Import …** takes a
file's layouts beside these — one with an id already here replaces it, the rest are added — and lays
nothing out. A file of another version, or with no layout in it, is refused and said so beneath the buttons. This
replaces the export and import of the bundle's column, which lived in the settings.

## The layout by the run

Picking a run chooses its layout (operator, 2026-11-04): a backtest maps to *Backtests*, an
AutoTrader session or a deployment to *Deploys* — the kind read from the run's `group`, the
pipeline that produced it (`simulation`, `autotrader`), as the backend's `run-kinds` names it. Both
mappings are chosen in Settings › Layouts among all layouts; one whose layout was deleted maps to
nothing. `use_layout_by_run.ts` does it, at the app root, in one of three modes:

```
FiniexViewer  Panels ▾  Layouts ▾  [⇄ Deploys]     ← offer: a session picked while Backtests is loaded
```

- **Offer it** (the default) puts the layout the run maps to beside the Layouts menu, as ⇄ and its
  name, where another layout is loaded; a click loads it in the size the tab stands in. Picking a
  run that fits the loaded layout takes it away. Nothing is offered while no layout is loaded: a
  reader who never loaded one is not using layouts.
- **Switch to it** loads it at the pick. Only a pick switches, never the selection a reload brings
  back — that is in place before the binding exists, so its watchers never see it.
- **Off** leaves the layout to the reader. Since a switch moves the panels at a selection, it is the
  one exception, chosen by the reader, to *a selection never moves the layout*.
