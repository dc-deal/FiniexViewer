# Indicator Series

A strategy decides on what its workers compute — an RSI, a set of Bollinger bands — and a chart of
candles alone leaves the reader guessing what it saw. Since contract 55, a session records each
drawing worker's outputs as an **indicator series**: one value per closed bar of the worker's own
timeframe, on the candles or in a pane of its own under them. The worker declares how its outputs
are drawn, the run keeps that declaration when it starts, and the run chart draws what the run
recorded — never what the worker declares today.

*Indicator series* and *worker* are FiniexTestingIDE's words; their document `indicator-series`
(under `/api/v1/docs`) says what each field holds.

## Where they come from

```
run chart: run · unit · the stretch its bars cover
        │
        ▼
indicator_series_store.follow(target, span)
        │  1. GET …/units/{unit}/recorded-streams        the timeline: a row per drawing worker
        │  2. GET …/recorded-streams/window?from=&to=     page by page, along next_from
        ▼
series: one entry per layer, the pages merged, the frames left behind
```

- **Only a session asks.** A backtest records its series too, but its streams over time are not
  served yet, so `run_chart_store` follows only a run whose `group` is `autotrader`.
- **Only what the timeline lists is read.** Their document: *"Draw only the series the run's
  timeline lists."* A unit whose timeline has no `indicator_series` row reads no window, and one
  whose streams are not recorded at all is an absence in the backend's words, never an error.
- **The stretch whose bars are loaded, and no more.** The series follow the bar loader: when the
  reader moves toward an edge and earlier or later bars arrive, the series of that stretch are read
  as well — only the part not read yet.
- **At most four pages a read, 8,000 records.** The window cannot be asked for the series alone: it
  merges every stream of the unit by time, so a page holds the unit's state frames beside the
  series' bars, and a thirty-day session at a minute's cadence holds some 43,000 frames, about
  60 MB. Where a read stops at its pages, `cutAt` says the instant the series reach to.
- **A page grows a series, never repeats it.** Each entry is keyed by its `layer`; a later page's
  bars join it in order of time, each instant once. What the series means — its title, its pane,
  its plots — is the run's recorded copy and the same on every page.

## What a series holds

| Field | What the chart does with it |
|---|---|
| `layer` | the row in the Layers panel: `worker:<instance>`, or `worker:<instance>:<name>` for a further series of one worker |
| `pane` | `price` draws on the candles; any other name is a pane of its own, shared by every series naming it |
| `title`, `inputs` | the legend and the row's name: `RSI 14` |
| `timeframe` | the bars the values belong to — the series' own, which need not be the chart's |
| `plots` | the outputs drawn, each a line, histogram, area or baseline |
| `price_lines`, `filled_areas` | reference lines on the series' scale, and an area between two edges |
| `times`, `data` | each bar's opening instant, and per plot one value per bar — a null is a gap |
