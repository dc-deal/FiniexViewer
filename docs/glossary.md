# Glossary

The words of the domain — run, scenario, run unit, report section, broker, deployment — are
FiniexTestingIDE's, defined in its `docs/glossary.md`, and every label on screen uses them (see
*The words* in [the frontend architecture](frontend_architecture.md)). This page holds only what
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
run report is one, its report sections the members. Not *group* — in FiniexTestingIDE `group` is a
run's pipeline, and in the dock library a group is a stack of tabs. Not *container*, which is their
Docker container and the CSS size container a panel declares. Not the build's *bundle*, the
JavaScript a production build emits, which the performance figures call the *start bundle*.

**form** — What a panel does with its content, shown as its tab's symbol: a **list** (a reader
picks; the pick is written into the link), a **sheet** (a reader reads) or a **chart** (a time
axis). Not a venue's *balance sheet* (`venue_balances`).

**free chart** — The chart of a market — a broker, a symbol and a timeframe — chosen with no run
behind it. See *run-bound chart*.

**link** — The set of choices a group of panels shares: a run, its narrowing and its marked
position, a deployment, a market. A list writes the choice it makes; every panel reads the choices
it needs. Not the HTTP `Link` header the API sends.

**list panel** — A panel whose form is a list and whose pick opens something: the run list, the
deployments. Never a member of a bundle.

**member** — A panel inside a bundle: a report section in the run report. It opens as a panel of its
own and goes back. Not the *member* of an archive FiniexTestingIDE re-imports, a file inside a zip.

**menu bar** — The frame above the panels: the app's name, the Panels menu, the machine's load, the
account and the application menu. It is never closed or moved.

**narrowing** — Choosing some of a run's units, so that the report sections which map over units
show only those, or mark them. Stated in the quick bar, and drawn as a dashed border — the
*narrowing frame* — around the run report, and around a section opened as a panel where it filters
that section's rows. Not the *subscription narrowing* of a worker in FiniexTestingIDE, and the
frame is not their recorded state *frame*.

**panel** — Everything the reader keeps open beside the work: a list, a report section opened on its
own, a chart. It has a form, a link and a tab, and it is docked — it never floats over another. The
same idea as the panels of FiniexTestingIDE's AutoTrader console, which these mirror. Never
*window*: in FiniexTestingIDE a window is always a span of time (*data window*).

**placement** — Where the panels are: open or hidden, side by side or in tabs, which sections stand
in the run report and which are open as panels, and where a hidden panel stood last. The part of
the arrangement that is not a choice of what to show.

**quick bar** — The one to three settings of the panel in front of a tab group, on the right of its
tabs: a chart's broker, symbol and timeframe, or a report's narrowing.

**run-bound chart** — The chart of one unit of a run, its trades marked on the candles, opened from
the run — planned in viewer#31. See *free chart*.

**tab** — A panel's handle in the dock: its form, its title, and one status that prints only when
it has something to say.
