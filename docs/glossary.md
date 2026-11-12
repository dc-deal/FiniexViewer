# Glossary

The words of the domain — run, scenario, run unit, report section, broker, deployment — are
FiniexTestingIDE's, defined in its `docs/glossary.md`, and every label on screen uses them (see
[The words](interface/figures_and_words_on_screen.md#the-words--the-backends-glossary-adopted-here)). This page holds only what
that glossary has no word for: the words this viewer coins for its own display.

Each was checked against FiniexTestingIDE's glossary and its documents before it was written here.
Where the same word means something else there, the entry says so, because a reader who knows one
project carries its meanings into the other.

---

**arrangement** — Everything the viewer restores on a reload: what is chosen (the *links*), how
each list is filtered and sorted, and where the panels are (the *placement*). Stored locally under
one versioned key and kept per browser tab: a new tab starts from the last one saved. Not *layout*,
which is only a placement.

**bundle** — A panel whose content is other panels, its *members*, stacked one below the other: the
run report is one, its report sections the members. The word is on screen: the panel *Run bundle*,
`Runs ▸ Run bundle` in the Panels menu, ⇲ *Back into the bundle* on a member's tab. Not *group* — in FiniexTestingIDE `group` is a
run's pipeline, and in the dock library a group is a stack of tabs. Not *container*, which is their
Docker container and the CSS size container a panel declares. Not the build's *bundle*, the
JavaScript a production build emits, which the performance figures call the *start bundle*.

**form** — What a panel does with its content, shown as its tab's symbol: a **list** (a reader
picks; the pick is written into the link), a **sheet** (a reader reads) or a **chart** (a time
axis). Not a venue's *balance sheet* (`venue_balances`).

**free chart** — The chart of a market — a broker, a symbol and a timeframe — chosen with no run
behind it: the panel *Free chart*, opened from the Panels menu. See *run-bound chart*.

**Layers panel** — The panel that arranges what a chart draws beside its candles, one row per
*drawing layer*: FiniexTestingIDE's word for one switchable set of drawings on a run's chart, and
their own name for this panel. Their glossary never uses *layer* alone, and neither does this one.

**link** — The set of choices a group of panels shares: a run, its narrowing and its marked
position, a deployment, a market. A list writes the choice it makes; every panel reads the choices
it needs. Not the HTTP `Link` header the API sends.

**list panel** — A panel whose form is a list and whose pick opens something: the run list, the
deployments. Never a member of a bundle.

**member** — A panel inside a bundle: a report section in the run bundle. It opens as a panel of its
own and goes back. Not the *member* of an archive FiniexTestingIDE re-imports, a file inside a zip.

**menu bar** — The frame above the panels, which chooses: the app's name, the Panels and Layouts
menus, the *narrowing* while one is set, and the application menu. It is never closed or moved. See
*status bar*.

**narrowing** — Putting one of a run's units in focus, so that the report sections which map over
units show only it, or mark it, and the *run-bound chart* draws it. Stated once, in the menu bar, and drawn as a dashed border — the
*narrowing frame* — around the run report, and around a section opened as a panel where it filters
that section's rows. Not the *subscription narrowing* of a worker in FiniexTestingIDE, and the
frame is not their recorded state *frame*.

**pane** — A band of a chart, stacked with the others on its one time axis and with a scale of its
own: the run chart's pane of the candles on top, the volume's own pane below (viewer#57), a seam
between two that the reader drags. FiniexTestingIDE's word from testingide#379, where a `pane` is a
name and `price` the price chart (decided there 2026-10-16); not in its glossary or consumer
documents, checked 2026-11-12. On screen as the volume's option *own pane*. Never the docked
*panel*, which holds the whole chart. See [Chart Panes](panels/chart_panes.md).

**panel** — Everything the reader keeps open beside the work: a list, a report section opened on its
own, a chart. It has a form, a link and a tab, and it is docked — it never floats over another. The
same idea as the panels of FiniexTestingIDE's AutoTrader console, which these mirror. Never
*window*: in FiniexTestingIDE a window is always a span of time (*data window*).

**placement** — Where the panels are: open or hidden, side by side or in tabs, which sections stand
in the run report and which are open as panels, and where a hidden panel stood last. The part of
the arrangement that is not a choice of what to show.

**quick bar** — The settings of the panel in front of a tab group, on the right of its tabs: the free
chart's broker, symbol and timeframe, the run chart's unit and timeframe.

**run-bound chart** — The chart of one unit of a run, its trades marked on the candles — the panel
*Run chart*, opened beside the run report from the Panels menu or by the chart mark on a trade or
an order. It shows the unit in focus (see *narrowing*), else its own choice. See *free chart*.

**status bar** — The frame below the panels, which states what the window works against: the
server, the account, the contract where it is not the viewer's, and the machine's load (2026-11-10).
Both bars give room by rank. Not in FiniexTestingIDE's glossary or consumer documents, checked
2026-11-12; the word of VS Code's and JetBrains' bars of the same kind.

**server** — One installation of the API as this viewer reaches it: an address and a token that come as a pair. Each browser window shows one. FiniexTestingIDE's word, in its document `server`, and agreed with it for this label on 2026-11-01. Not *host*, which is the machine's identity there (`origin.host`), and not *connection*, which there is an external call with its give-up rule; *installation* stays its word for what stands behind a server. See [Servers](interface/servers.md).

**tab** — A panel's handle in the dock: its form, its title, and one status that prints only when
it has something to say.

**time lane** — The band along the bottom of the run chart's pane of the candles for what has a time and no price:
the booking periods as a strip, the orders refused or expired as marks above it (viewer#41). Not in
FiniexTestingIDE's glossary or consumer documents, checked 2026-11-12, and not their *data window*:
the lane holds marks, never a span of data. See [Chart Drawings and
Layers](panels/chart_drawings_and_layers.md).
