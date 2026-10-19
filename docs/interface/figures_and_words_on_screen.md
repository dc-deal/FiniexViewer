# Figures and Words on Screen

A figure on screen is the API's value as served, and a word on screen is FiniexTestingIDE's word, marked so that a later translation can find it. Read this document before you add a figure, a label, an empty state or a hint to any panel.

## Units and undefined values

The models carry numbers, not units. These are contract, confirmed by the backend, and the conversion happens at the render edge:

- `win_rate` is a **ratio 0..1** — multiply for display.
- `max_drawdown` is a **positive magnitude** in account currency. The sign is a display choice, not data.
- `expectancy` is mean R, meaningful only when `r_trade_count > 0`.
- `profit_factor` is `null` when it is **undefined** (a run without a losing trade), never 0.
- `avg_win_r` / `avg_loss_r` are `null` when their subset is empty. Gate each on **its own** count (`r_win_count` / `r_loss_count`): a run can have R-defined trades with no winner among them, so `r_trade_count` alone would still print a mean nobody measured.
- `signal_fresh_ratio` is `null` when no SIGNAL worker was involved — deliberately not 1.0, which would claim a perfect feed.
- **`portfolio` does not use `null` for this.** An untraded unit arrives with `win_rate: 0.0` and `profit_factor: 0.0`, so the gate there is `total_trades`, not the value. The distinction matters in both directions: a unit with one losing trade and no winner has a profit factor that really *is* 0, and printing `n/a` for it would hide a measured result.

The rule behind all of them: **a value that means "not measured" must never render as a number.** It renders as `n/a`. Which field says "not measured" differs per section — check the model, do not assume `null`.

Its sibling on the categorical side: **a value that means "not applicable" must never render as a state.** `run_outcome` is `''` on artifacts written before the grading existed, so the panel says "no outcome recorded" rather than showing an empty verdict. `shutdown_mode` is AutoTrader-only and `''` on a backtest, so it is absent rather than rendered — and where it *is* present it is detail, never a verdict: an operator stopping a healthy session with Ctrl+C produces the same `emergency` as a crash, so it is shown as alarming only where `run_outcome` is `failed`. `operator_interrupted` would resolve that ambiguity, but it is newer than most artifacts, which default it to `false`; it is mirrored and deliberately not rendered until an artifact can carry a true value. `refused_at_first_tick` separates a second kind of `emergency` from a crash: a live session that stopped at its first tick because its warmup history had a gap the venue could not fill yet. It is graded `failed`, because a restart is the remedy, but nothing broke — so the shutdown detail reads *emergency (refused at the first tick)* and its reason stands in the warning role with the warning mark, where a crash's reason stands in the error role with the error mark. The backend's console draws the same distinction, yellow against red. The mark is an icon in the line's own colour rather than the console's ⛔, which renders as a red emoji whatever the line's role.

## The printout never computes

The backend derives every figure once, off the hot loop, and its renderers only format. The viewer follows the same rule: no KPI is re-derived here. If a figure a panel needs is not on a model, it is requested as a model field rather than calculated locally — a second calculation drifts from the first, which is exactly the defect the backend removed from its own console (`execution_rate_pct` and `max_dd_pct` were divisions inside a renderer and are now fields).

## The words — the backend's glossary, adopted here

The API's vocabulary is fixed in FiniexTestingIDE's `docs/glossary.md`, and the four kinds of run in
its `docs/introduction_to_the_ide.md` ("The kinds of run"). Every label on screen uses those words,
because a word invented here would mean something different from the same word in a report. The
words this viewer coins for its own display — panel, bundle, link, narrowing and the rest — are in
[the glossary](../glossary.md), each saying which of FiniexTestingIDE's words it is not.

| Kind | `group` | `ticks_from` | `orders_to` |
|---|---|---|---|
| **Backtest** | `simulation` | `archive` | `simulated` |
| **Mock session** | `autotrader` | `archive` | `simulated` |
| **Dry run** | `autotrader` | `venue` | `simulated` |
| **Real-money session** | `autotrader` | `venue` | `venue` |

- An **AutoTrader session** is any run of that pipeline; the three kinds above are its kinds.
  *Live trading* means a real-money session and nothing else.
- A **backtest** is a run of the simulation pipeline. A session is never a backtest — a mock session
  replays an archive window through the whole AutoTrader stack and is reported like every other
  session, not like a one-scenario backtest.
- **Never a bare `live`.** It named a pipeline, an adapter, a cadence and real money at once, which
  is why the backend retired it: `group` served `live` until contract 12 and serves `autotrader`
  now, in stored runs too. Where this repo means streamed data rather than a kind of run, it says
  *streamed*.
- `continuous` is not a kind of run. It joins sessions into a **deployment**, which `parent_kind`
  already answers.
- A **booking period** is what was called a *segment*; the field is `period_no` from contract 12.

**`ticks_from`, `orders_to` and `data_windows` are `null` on every run recorded before contract 12**
— measured 2026-09-29: null on all 40 runs here. Unknown, never guessed, and nothing may be derived
from their absence. A facet over them is therefore dropped by itself today, by the rule that a facet
whose single value every row carries cannot narrow anything.

## Display Strings — a marker, not a translation layer

Every user-facing string goes through `t()` (`src/translate.ts`), which returns its input unchanged. The interface is English-only and there is no language switch.

The marker exists because the expensive half of adding a language later is *finding* the display strings, not translating them. The English text is the key — `vue-i18n` supports message-as-key — so adopting a real module replaces one implementation and adds a catalogue, without touching a single call site.

Deliberately absent until a second language exists: a language switch (nothing to switch), and a key taxonomy (a scheme invented for 40 strings will not fit 400). When one English text ever needs two different translations, an optional context argument solves it then; adding one is backward compatible.

**`plural(count, one, many)` sits beside `t()`**, because a count and its noun have to agree:
`1 trade`, `2 trades`. Both words are passed in already marked — `plural(n, t('trade'), t('trades'))`
— so every display string stays literally inside a `t()` at its call site, which is the whole
mechanism by which they can be found later. A helper that marked them itself would hide them from
exactly the search `t()` exists to serve. It is English-only on purpose and lives in
`translate.ts`, because that is the file a real translation module replaces, and pluralisation is
one of the things such a module owns — languages with more than two forms need a rule this cannot
express.

Not every count needs it. `3 of 40`, `1 rejected` and `2/5 executed` read correctly as they are.
And a sentence whose VERB agrees as well as its noun is rewritten rather than patched: the
deployment advisory says *"One session, so a single configuration stands behind these rows"* rather
than joining an `s` onto a plural sentence, the same construction the scenario roster already used.

No tool enforces the marker — it is carried by review.

## Hints — one registry, two levels of "go away"

`hint_registry.ts` holds every explanation in ONE list, an id plus a sentence. Central rather than a
string per component, for two reasons: the texts are the only place the app explains itself and are
worth reading as a set, and a guided tour is the same data in a sequence — a step is an element plus
a sentence, which is exactly a row here. An id is stable across releases because it is what a
permanent dismissal is remembered by.

`hints_store.ts` keeps two levels apart. **Dismiss** means *not now*: it lasts the session and
writes nothing, so a reader who closed the line by accident is not punished for it. **Ban** means
*never again* and is the only one persisted, under one versioned key, reconciled on load like every
other stored preference — an id the registry no longer contains is dropped, or the list only grows
and a hint reintroduced under an old id returns already banned. The settings dialog resets both,
because a banned hint has no other way back: the control that banned it disappeared with it.

**The hints of one place stand in ONE box.** `HintLine` takes one id or several, and several share a
box and its two dismissals — the run bundle once stacked three boxes over its column, nine lines and
six clicks to clear. Each hint keeps its own id in the store, so one banned on its own stays away in
the box too, and a hint added to a place later shows there by itself.
