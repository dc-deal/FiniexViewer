# Activities Panel

What runs on the machine right now — every backtest, sweep, live session, import, FiniexTestingIDE's
test suite and its API server — as a panel of its own (viewer#49). Read this before you change
`ActivitiesView.vue` or the activity half of `machine_store.ts`. How full the machine is, and the
card in the menu bar that names what runs in one line, is in [Menu Bar Status](../interface/menu_bar_status.md).

## Where it comes from

`GET /api/v1/activities` (contract 35, the `machine` grant) — *the machine's activity list* in
FiniexTestingIDE's glossary, described in their consumer document `activities`. One answer is one
instant: `measured_at` first, the list and every row's memory right after it. The panel is named
*Activities* because that is their word; *performance* would read as a strategy's result here.

```
[☰ Activities]
 💡 What runs on the machine right now, read every few seconds while this panel is on show …
 Measured 19:56:00
 ⌕  Kind ▾  Origin ▾  Code ▾                                   4 of 4 · Sort: newest ▾
 Started          Kind                Label                           Uptime    Memory
 19. Okt., 19:55  autotrader_session  mock_session_test                17 s     454.4 MB
 19. Okt., 18:41  sweep               my_sweep                         39 min   7.62 GB
 19. Okt., 18:58  backtest             ↳ my_set__sweep_…_c003          10 min   in its parent
 19. Okt., 19:43  api_server          port 8000  this server           12 min   351.8 MB
```

## Their rules, kept

- **A row is an activity, never a process** — keyed by `activity_id`, as the answer declares. Two
  activities can share one process (a sweep and the backtest of its current combination), and a
  process id is reused by the operating system.
- **An activity stands right beneath the one it runs inside**, `↳` before its label. Its memory is
  that one's: an inner activity serves `rss_bytes: 0` with `process_count: 0`, which the row says as
  *in its parent* — never as a zero. A row whose parent is no longer listed ran inside one that has
  ended, and its card says so.
- **Memory that could not be read is `unreadable`**, in the warning colour with its mark — `null`
  in the answer, and never a zero in its place. Memory is shown as served (`bytes`); no share of the
  machine is computed here.
- **Only what runs is listed.** The list is never a history — what ran is the run list.
- **The server's own row is listed and marked *this server*** (`server_activity_id`) — it holds
  memory like the rest. Where the answer names no server row, a notice says the list may not be
  complete.

## Asked while someone reads it

`machine_store` already asks `/machine-resources` every 5 s while the page is in view. The list is
asked on the same beat, but **only while there is a reader** (`watchActivities`, which returns the way
to stop): this panel while it is ON SHOW, and the menu bar's card while it is open. On show is read
off the dock's `shownIds` — a panel kept in the page stays mounted behind another tab of its group,
so mounted is not shown. A reading costs the server about a tenth of a second.

**The last answer is held through a failure**, as the backend asks. Once three polls have brought
nothing new, a notice says `as of …` with its time; a failed request says why, in the backend's own
sentence where it sent one — `500 activity_registry_unreadable` means "could not read", never
"nothing runs".

## The list

The app's own building blocks, the way the deployment and run lists are built: a `FacetBar` over a
`RecordList`, rows inert (nothing to pick), a card on each.

- **Columns**, ranked for a narrow panel: Started, Kind and Label, Uptime, Memory, Origin, Code. Every
  text cell cuts itself off at its track with the whole value on hover — uncut, `autotrader_session`
  ran on into the label beside it.
- **Facets**: Kind, Origin (`origin_channel`), Code (`working_tree`, `.` shown as *same as the
  server*). The search reads the label, the run id and the command line. Sorted newest, by memory
  (unreadable last) or by uptime.
- **The card** holds every field of the row: state, start (UTC), uptime, memory and processes, run
  and sweep ids, the activity it runs inside, code and commit, who started it, console session,
  process id and the command line.
- **Notices only where something is off**: a failed read, a stale answer, the server missing from
  its own list, activities whose entry this server cannot read (`unreadable_activity_ids` — written
  by another version of the code, holding memory all the same). A list that is fine says nothing
  about itself.

## Not yet

- **A jump from an activity to its run** — whether a running backtest's run already stands in the run
  index is not measured; until then the run id is in the card.
- **States beyond `running`** — `queued`, `finished` and `failed` are declared for a queue that will
  write into the same list; they show as their word when they come.

## How it is tested

- `machine_store.test.ts` — the list asked only while a reader is there, on the poll's beat, kept
  through a failure with the reason, called old after three silent polls, asked nothing while hidden.
- `activities_view.test.ts` — asked only while on show; rows newest first with each beneath its
  parent and the server marked; memory as served, inside a parent and unreadable; the card; notices
  only where something is off.
- `machine_status.test.ts` — the card's *Running* line, the server left out and the rest counted;
  asked while the card is open; the panel named, and the figures no control.
- `e2e/activities.spec.ts` — the card in a real browser, and the panel asking nothing while another
  tab of its group stands in front of it.
