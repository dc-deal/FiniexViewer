# Venue Account

What the venue itself held, beside the books a live session keeps. Read this before you change the *Venue account* section, `src/components/runs/VenueAccountPanel.vue`, `venue_account.ts` beside it, or how the venue's reads are loaded. The session's own account is the [Latest State Frame](latest_state_frame.md); this section is the other half of the same question (viewer#54).

## Two routes, each said as what it is

```
GET /api/v1/reports/runs/{run_id}/order-events     broker_truth — every read of the venue, from the first on
GET /api/v1/reports/runs/{run_id}/venue-account    the reads at the start and the end, and the comparison counted
```

- **The venue's reads** are the second list of the order-event stream. A session asks its venue
  before its first market data (`session_start`), whenever its comparison with the venue changes
  its picture (`reconcile`, at most every five minutes by default) and once it has handled its own
  orders at the end (`session_end`). They stand while the session runs.
- **`venue-account`** is written when the session ends. It counts the start and end reads and
  says, over the whole session, how often the comparison ran, could not reach the venue, or found
  the books apart. A running session answers 404 `run_not_completed`.

The Orders panel asks the stream one position at a time, and such a narrowed answer holds no read:
a read is the venue's whole account at a moment, never a step of one order. So the venue's reads
are asked for separately, from the **unnarrowed** stream, and only the reads are kept.

## Who has one

| Run | Reads | `venue-account` |
|---|---|---|
| real-money session (`orders_to: venue`) | yes | once it ended |
| mock session against a mock venue | yes | once it ended |
| dry run against the real venue | none — the session answers its own reads | none |
| backtest | none — its venue is its own book | none |

Measured 2026-11-02: the run host's rehearsal, a dry run, had no read and a 404; the development
server held 25 real-money certificates with two reads each. A section with neither leaves the column,
as every empty section does.

**Asked only for an AutoTrader session whose `stream_files` name the stream** (`group`, one of the
fields their `run-kinds` document names for telling the kinds apart). A backtest's whole stream holds
no read and can be the largest answer the API serves, so it is never asked for.

## What the section draws

```
                              Start            End
  Open orders at the venue    0                0
  XETH                        0.0031           0.0042
  ZUSD                        812.40           805.10
  XXBT                        0.0001           not listed
  ⚠ 3 cycles could not reach the venue · 2877 compared
  ▸ Every read of the venue (4)
```

- **Start and End** come from `venue-account` once the session ended, and until then from the
  stream: its `session_start` line is the start, and the End column says *End is read when the
  session ends*. Both name the same read by `seq`, so the account's figure and the line's are one
  figure. A count of open orders is the length of the list the venue served.
- **The venue's own asset codes and decimals**, never rounded (their `prices` document):
  `venueFigure` in `report_format.ts` prints the shortest form that reads back as the same number.
- **Three states, none of them a zero.** A value, an empty one included, is what the venue holds.
  `null` with the part named in `unread_parts` is *not read*: the read failed. An asset one read does
  not name is *not listed*. A part a read does not take — positions on a spot account — is a dash,
  and the positions row appears only where a read counts any.
- **Every read of the venue** opens on a fold: its `seq`, its time, why it was taken, and what it held —
  the size of the account for a start or an end, the verdict for a comparison, with the identities
  that were apart where it was divergent.

## The comparison speaks only where it is off

A check that passes says nothing. From the account's `reconciliation` and last line:

- switched off for the session — a warning
- never came due before the session ended — a plain line, because unchecked is not fine
- never reached the venue (`cycles_compared: 0` beside skipped cycles) — a warning: the session only
  looks clean
- some cycles could not reach the venue — a warning with both counts, as served
- the books apart at the last line — a warning naming who, in their own words (`ghost orders`,
  `orphan orders`, …)
- apart at some point and in agreement at the last line — a plain line

The live verdict while a session runs is the Latest State Frame's (`reconcile_clean`), and this section
does not repeat it. A record from before the counts existed says nothing either way.

## How often it asks

The reads load with the run's other sections. While the session records and the run bundle or this
section is on show, they are asked again with the state frame's check-in — once a cadence — and only
where the first ask found a read, so a dry run's stream is not asked every minute for nothing. What
is held stays on screen until the next answer. `venue-account` loads once, when the run's artifacts
name `venue_account.json`, which is when the session has ended.

## Fixtures

`tests/fixtures/venue_account.json` is the live run's account, captured beside its whole stream in
`order_events_live.json`. The capture replaces every `venue_balances` with neutral figures, so no
real account stands in the repository. The cases the stored runs do not hold — a part not read, an
asset gone, the books apart — are built in the tests from these answers without changing their shape.
