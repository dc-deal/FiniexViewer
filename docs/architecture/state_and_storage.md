# State and Storage

This document answers where the reader's selection and preferences are kept, and how they come back after a reload. Read it before you change `context_store`, `arrangement_store`, `settings_store` or `tab_storage.ts`, and before you add anything a reader can choose or set.

## Selection State — `context_store` and `arrangement_store`

**The selection lives in a LINK, and the link lives in the context store.** `links.A` holds what the
reader is looking at — `run {id, units, position}`, `deployment {id}`, `market {broker, symbol}` —
and nothing outside a link carries a selection. Link A is the main one; more arrive with the docked
panels of viewer#31, where a panel reads its own link's context. There is no URL state (operator,
2026-10-12): a single-user, local-first viewer has no link to share yet, and a link command is
cheap to add back because the context keys are the old query keys.

**Every write is an action, and an action applies its cascade.** A restore applies stored values
as they are, without cascading:

| Action | sets | clears |
|---|---|---|
| `selectRun(id)` | `run.id` | `run.units`, `run.position` |
| `setUnits` · `toggleUnit` · `clearUnits` | `run.units` | — the mark stays, as it always did; a click puts one scenario in focus (`toggledFocus`) |
| `mark(position)` | `run.position` | — |
| `selectDeployment(id)` | `deployment.id` | — |
| `setBroker(broker)` | `market.broker` | `market.symbol` |
| `setSymbol(symbol)` | `market.symbol` | — |
| `restore(stored)` | everything | nothing |

**The arrangement store keeps it** under ONE versioned key — kept per browser tab, see below —
created in `App.vue` so every view mounts onto the restored selection:

```
arrangement.v1 = { version: 1,
                   links: { A: { run: { id, units, position }, deployment: { id }, market: { broker, symbol } } },
                   bars:  { 'run-picker': { selection, search, sort }, 'scenario-roster': { …, scope: <run id> } },
                   chart: { timeframe },
                   runChart: { run, unit, timeframe },
                   dock:  <dockview's toJSON()>,  places: { <panel id>: { besides, direction, index?, size? } },
                   panelViews: { <panel id>: { expanded: { 'periods-table': true },
                                               rows: { scope: <run id>, keys: { 'groups-closed': [<scenario>] } } } } }
```

It is reconciled field by field on load, never trusted: a field of the wrong shape is left empty,
an entry of another schema version is REMOVED rather than converted, and a corrupt one counts as
none. The timeframe belongs to the CHART, not to the link — it says how one chart is drawn, not what
is selected. `dock` and `places` are the dock store's (see [Docked Panels](../panels/panel_dock.md)).

**Each panel keeps its own view in `panelViews`** (viewer#46) — HOW it shows its content, never
WHAT, which is the link's. A record by the panel's dock id, the id `places` uses, so a section keeps
ONE entry in the bundle's column and as a panel of its own. `expanded` holds the folds a panel can
open — today the booking-period list, `periods-table` — and is bound to no run: the list stays open
across a run change, a reload and ⇱ / ⇲. Only what differs from a default is stored, a name this
build does not know is never read, and the dock store drops the entry of a kind this build no longer
has when it attaches; the bundle's reset and the dock's leave it alone. A panel reads and writes it
through `use_panel_view`: `PanelHost` names the panel it draws, `PanelViewScope` names a section in
the column, and `useViewExpanded(fold)` is a writable boolean — without a host it lives for one
mount, as it did before anything was kept. Added under version 1: an entry written before it reads as
nothing kept, so no version had to change.

**`rows` keeps row keys of ONE run** — in Trade History the trades whose fills are open and the units
opened or closed by hand, in Orders the scenarios closed by hand — under `scope`, the run the panel's
own model names, read at use and never watched. Under any other run they count for nothing, and the
first change there replaces them whole, so a panel keeps one run's rows; going back before that
finds them again. `useViewRows(list, scope)` reads and writes them, each list keeps its newest
hundred (`VIEW_ROW_CAPS`), and a named layout may carry `expanded` but never `rows`, which belong to
what is shown. The positions opened in Orders are not kept: each one brought back would ask for its
step stream again.

**Each browser tab keeps its own** (`src/tab_storage.ts`, viewer#31, 2026-10-14) — the arrangement
and the column's `layout.v1` alike, which is what makes a second window the way to compare two runs.
A tab reads its own `sessionStorage` entry. A NEW tab has none: it adopts the last one any tab saved
and keeps it as its own, so another tab's later write never reaches it, not even on a reload. Every
write goes to both — the tab's own, and `localStorage` as the start of the next new tab. Settings
and banned hints are the reader's, not the tab's, and stay in `localStorage` alone; a hint merely
dismissed is stored nowhere and returns next visit.

**Adopted at the READ, not at the first write.** With one shared key, measured in the browser on
2026-10-14, a reload brought back the column the OTHER window had changed every time — the column's
layout is written only when it changes, and this tab had changed nothing — and the other window's
run whenever its delayed save landed between this tab's leaving and its reading.

**The data stores are facades over it.** `runs_store.selectedRunId` / `selectedUnits`,
`deployments_store.selectedDeploymentId` and `selection_store.broker` / `symbol` / `timeframe` are
read from the context and the arrangement; `selectRun(id)` sets the context and loads. `loadRun`
checks the id against the index, and an answer that arrives for a run no longer selected is
discarded — the case a restore and a quick click produce together. An id the index does not know is
asked for once more before it is called gone, because not known YET is not gone: a deployment can
name a session newer than the index the Runs panel loaded. `loadDeployment` does the same against
the ledger.

**Binders do the loading a view needs on mount:** `use_run_binding` and `use_deployment_binding`
load the index, then the stored selection; `use_chart_binding` resets a timeframe the symbol has no
coverage for. The run side is called at the APP ROOT since 2026-10-14, together with
`use_run_reports_loading` (the run's sections) and `use_run_report_channels` (the channels the
sections read): a section opened as a panel of its own needs all three while the run bundle is
closed or behind a tab, and a docked panel is drawn only once it is first shown. Fetching the index
again when the run list is shown again stays in that panel — it is the one place that knows. The bars store REPORTS that case (`timeframeUncovered`) and never writes a selection
itself — a data store that changes what the reader chose is the defect this replaced.

**A picker opens collapsed on a selection it finds at mount.** Its `watch` sees only a CHANGE, and a
restored selection is none — measured 2026-10-13 in the browser, where every restored run opened
with the whole list above it.

## Settings — three kinds of state, and which one needs an account

There are three kinds of state in this application and they do not share a home. Getting the line
wrong is what makes a restored view show the wrong thing or a preference travel to someone who did
not ask for it:

| | What it is | Where it lives | Needs an account? |
|---|---|---|---|
| **Selection** | which run, scenario, deployment, symbol, filter | the links and bars of `arrangement.v1`, per browser tab | never |
| **Presentation** | panel order and placement, collapsed state, a panel's own folds, a list's sort, a chart's timeframe, theme, thresholds, caps | per browser tab the column's `layout.v1` and the rest of `arrangement.v1` — `dock`, `places`, `panelViews`, the timeframes; the settings in `localStorage` | no |
| **Operation** | writing, triggering a run, changing a configuration | nowhere yet | **yes — and only this** |

Two consequences follow. **A settings menu needs no user system**: everything it holds today is
presentation, it is per-machine by nature, and putting it behind a login would make the viewer
worse rather than safer. And **a user system is driven by write, not by settings** — identity earns
its keep the moment the browser can change something on the other side, which the read-only API
does not allow (see [API Token](container_topology.md#api-token--the-dev-proxy-holds-it-the-browser-never-does), and issue #22).

- **`src/stores/settings_store.ts`** — presentation state under the single versioned key
  `settings.v1`. Reconciled on load field by field and never trusted: the result is built from the
  defaults and a stored field is adopted only when it passes its own check, so a key this build
  does not know is never copied and a key the stored value lacks takes its default. The schema
  version guards what a field check cannot — a field that kept its name and changed its meaning.
  An out-of-range value is **ignored, not clamped**: a number silently changed to a different one
  is a wrong answer.
- **`src/types/settings_types.ts`** — the shape and `DEFAULT_SETTINGS` beside it, because a default
  that drifts from its type is the defect that placement prevents.
- **`src/components/TopMenu.vue`** — the application menu in the shell header, behind one burger
  trigger: settings, a theme entry that names the theme it switches TO, and About.
- **`src/components/SettingsDialog.vue`** — two tabs: **Display** (the preferences) and **Layout**
  (the way back to the suggested order of the docked panels, and the export and import of the
  order of the sections in the run bundle). Every open starts on Display.
- **`src/components/AccountStatus.vue`** — the identity below, in the menu bar beside the
  application menu. Who the viewer works as is a fact to see at a glance rather than a setting to
  open, so it left the settings' Account tab on 2026-10-13.
- **`src/components/MachineStatus.vue`** — how full the machine is, in the menu bar before the
  account (see [How full the machine is](../interface/menu_bar_status.md#how-full-the-machine-is--get-apiv1machine-resources)).
- **`src/components/base/AppDialog.vue`** — every dialog's frame: what is set or read and then
  closed — the settings, About — rather than kept open beside the work, which is a panel. One
  frame, so no dialog re-invents the overlay or the close: 80 % of the window caps both sides, the
  content scrolls inside it, and a dialog whose content must not move the frame — the settings,
  switching tabs — gets a fixed height. `AboutDialog.vue` is the second user.
- **`src/stores/caller_store.ts`** — who the server takes this client to be.
- **`src/stores/machine_store.ts`** — the machine's last reading, asked again every few seconds.
- **`src/composables/use_display_settings.ts`** — how a preference reaches a panel.

**A panel does not read the store.** The app root provides the display subset (`use_run_report_channels`) and a panel injects
it, with the defaults as the fallback — so a panel mounted on its own, or by a future live host,
behaves exactly as it did before settings existed. Ambient rather than a prop for the same reason
the theme is: it applies to every panel, only some care, and passing it to all of them would hang a
stray attribute on the ones that do not declare it.

**Why one store even though the destination is a server.** These values will eventually be stored
by FiniexTestingIDE rather than the browser (issue #22). That is not an argument for waiting — it
is the argument for the store: the expensive part of the later move is not relocating the values,
it is *finding* them once they have spread across a dozen components. The same bet this project
makes at the display-string marker, for the same reason.

**The shape of that destination is agreed (2026-09-24), and it decides what this store is.**
Preferences will be a **generic document per account whose schema this project owns** — the backend
stores it opaquely. Scenario *configurations* are the opposite: typed and validated by the backend
against the components' parameter schema, never by the viewer's authority. So the settings store
stays a **thin cache** whose reconciliation is ours to keep, and it never reconciles a
configuration — which is the same line the Configuration panel already draws from the other side
(*show, never resolve*).

**One hazard recorded rather than solved.** Stored settings are discarded whole on a schema-version
mismatch, which is right for a per-machine file. Once the same document lives on a server and is
read by two machines, that rule lets an older client discard a newer document and write its own
back. It needs an answer in the change that moves the backing, not before — there is no shared
document yet.

**The first real setting is the scenario threshold.** Above that many units a panel makes the
summary primary and the individual unit secondary — Trade history collapses each unit to its group
row, which still carries the name, the net, the fees and the trade count. A thirteen-scenario run
is already hard to read and a forty-scenario run is unreadable; the threshold is what lets the
presentation know how many units it is dealing with. Nothing is ever hidden silently.
