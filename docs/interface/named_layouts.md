# Named Layouts

The placement of the panels saved under a name and loaded with one click (viewer#37) — MetaTrader's *profiles*, TradingView's *layouts*. Read this before you change `src/stores/named_layouts_store.ts`, `src/components/LayoutsMenu.vue`, the shipped layouts in `src/layout_presets.json`, or how the dock lays a stored layout out.

```
FiniexViewer  Panels ▾  Layouts ▾
                        ├ ✓ Backtests                            shipped
                        ├   Deploys                              shipped
                        ├   Morning review
                        ├ Save as … · Rename … · Delete … · Reset to shipped
                        └ Export all … · Import …
```

## What a layout holds — and what it never holds

```
HOLDS   the dock: the open panels, their splits and tab stacks · every panel's last place, a
        hidden one's included · what each panel shows expanded · a chart's layers · the bundles'
        columns: their sections in order, folded, pinned, locked or hidden
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

- **Save as …** makes a layout of this placement under a new name and loads it. A name is refused
  where it is empty or taken, whatever its case.
- **Rename …** and **Delete …** act on the loaded layout, and only on a reader's own. Delete asks on
  the first click and deletes on the second; the tab keeps its placement, loaded from none.
- **Reset to shipped** brings a shipped layout back as it shipped, laid out again where it is loaded.
- **Back to the suggested order** in the settings takes the tab off its layout: the suggested order
  is no layout, and the loaded one would otherwise take it in as its own placement.

## The shipped layouts

`src/layout_presets.json` holds *Backtests* and *Deploys*, each as the dock serialised it at
1600 × 900 — laid out by the dock itself, never written by hand. *Backtests* is the arrangement of
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
nothing out. A file of another version, or with no layout in it, is refused and said so. This
replaces the export and import of the bundle's column, which lived in the settings.

## Open in viewer#37

A placement per screen size, and a layout chosen by the run that is opened, stay in the issue with
their questions.
