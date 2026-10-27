# Latest State Frame — How a Session Stands While It Runs

Every report section of an AutoTrader session is written when the session ends. While it runs,
its equity, its open positions and what it last decided are on none of them, and a session that is
running looks like one that died. Since contract 38 a session records its state as it goes, a
**state frame** at a time, and `GET /api/v1/reports/runs/{run_id}/state-frames/latest` serves the
latest one of each unit, how old it is, and whether the session still records. This section shows
that answer.

## Where it stands

- **First in the run bundle** (`latest-state` in the panel registry), because while a session runs
  it is the only section there is. A stored layout keeps its own order and appends a new section at
  the end; *Reset bundle* puts it first.
- **Only for a run whose `stream_files` names `state_frames.jsonl`.** A backtest, and a session
  recorded before contract 38, never asks for it, so the column leaves it out.
- It opens as a panel of its own like any section, and reads the run as every section does.

## What it says, line by line

```
● recording · written 41 s ago · cadence M1
As of 2026-10-22 12:41:00Z — the session clock · written for cadence
MEMORY   Latest frame  private 170.7 MB · resident 237.6 MB   First frame  private 160.2 MB · resident 227.2 MB
No reconciliation with the venue checked yet
Account · Decision · Worker rsi_fast · Worker bollinger_main   (figure blocks)
Open positions
    long 0.002 ETHUSD @ 2,398.97 · -0.04 USD
Resting orders none
```

- **The status line is the route's `recording` verdict**, with a glyph and a word:
  - `● recording`: the latest frame is younger than three cadences;
  - `⚠ recording stopped`: the frames stopped without an end, so the session hangs or its process
    died. The Activities panel tells which;
  - `■ ended` with the outcome as warnings-errors grades it: `run_outcome`, `shutdown_mode`, and
    *stopped by the operator* where `operator_interrupted` is true;
  - `◌ replaying recorded data` (null): a replay's frames come at replay speed, so their age is not
    said at all.
- **Two clocks, never one axis.** `frame_time` is the session's own clock (the market data it was
  processing, months behind in a replay) and is printed as a time, named as that clock.
  `written_at` is the machine's clock and appears only as the route's `age_s`, "written 41 s ago".
  Nothing here subtracts one time from another.
- **Memory at the latest frame beside memory at the first**, a figure block of two rows, both from the answer; the first frame's time is on hover. They are never
  subtracted: two points are not a series, and a climb that fell back would read as flat. No report
  states this, so it stays after the end.
- **A check that passes says nothing.** The circuit breaker blocking, stale market data, a stale
  signal and an unclean reconciliation speak in the warning role. A breaker, market or
  reconciliation check that was not made (null) is said in the quiet ink, because unchecked is not
  fine. `feed_stale` null is not said: it means the session reads no signal at all.
- **Account and decision as figure blocks.** Holdings and prices go to eight decimals, dropping
  the float noise a computed figure carries. Worker and decision outputs appear under the
  strategy's own keys, to four decimals.
- **Positions and resting orders** are the rows the portfolio and the pending orders serve. A
  resting order's `entry_price` is its limit or its trigger; a stop-limit's fill limit is said
  beside it.

## After the end

Once every unit reads `ended` and its outcome is written, the frame is the state the report
sections describe. The section keeps its status and memory lines and folds its frames behind
*Its frames over time — the last is the state its report sections describe*. A stopped session
keeps them open, because no report will describe it.

## Its frames over time (contract 43)

A session writes a frame a cadence, and every one of them can be stood on. Below the memory the
section plays them (`StateFramePlayer`): the first, one back, play or stop, one on, the newest; the
speed in frames per second; and a slider along the session's own clock — `frame_time`, the only
axis, since the machine's clock says only how long ago. The arrows on the slider step a frame, since
frames come at no fixed interval. The frame on show is drawn by `StateFrameBody`, the same body the
latest frame used, so a session reads one way whichever moment is on show.

```
⏮ ◀ ▶ ▶| ⏭  5 per s ▾   ├────────●───────────────────┤
2026-01-25 02:29:03Z — the session clock · frame 11 of 344 · written for cadence
```

- **Two routes per unit.** `…/units/{unit}/recorded-streams` is the timeline: how many frames, the
  first and the latest by time. `…/recorded-streams/window` serves the frames of `[from, to)`, oldest
  first, a page at a time, and says with `next_from` where a page was cut. Frames are told apart by
  `record_no`, the key the route declares, since two can share an instant.
- **Never the whole stream.** A thirty-day session at a minute's cadence holds some 43,000 frames,
  about 60 MB. `frame_player_store` reads a page of 1,000 around the frame on show and holds at most
  two pages. A step past the held stretch reads the next one in, and a jump reads the stretch around
  the instant sought. Measured 2026-10-27 on the 344 frames of `20261022_123550_0bfde90e`: the
  timeline in 0.38 s, the whole window in 0.27 s and 480 KB.
- **It opens on the newest frame**, the one the section showed before. A unit whose frames over time
  are not recorded (`streams_not_recorded`) shows its latest frame alone, as before.
- **The panel reads no store.** The root provides the player through a channel
  (`use_frame_player`), and forgets every unit, stopping what plays, when another run is chosen.

## How often it asks

The app root loads it with the run's other sections and asks again **once a cadence** (`cadence_s`,
a minute until an answer names one). It asks only while the run bundle or the section's own panel is
on show and the page is in view. A frame stays on screen until the next one arrives, so the section
never blanks between answers; a failure is said beside the frame held. When the session has ended
and written its outcome, the asking stops and the run index is read again. The bundle then loads
the reports the session wrote.

## A run without its report

A run without its report no longer says only *still running, or it died before its report phase*.
For a session that records state frames the run list's `recording` says which: *This session is
still running — its report is written when it ends*, or *This session stopped recording without
an end*. The bundle says it above its column, and a section opened as its own panel says the same
instead of *This run carries no such section*.
