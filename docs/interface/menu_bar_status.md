# Menu Bar Status

The menu bar carries the readings that apply to every panel at once: who the server takes this viewer to be, how full the shared machine is, and which scenario is in focus. Read this document before you change `AccountStatus`, `MachineStatus`, `NarrowingStatement` or the stores behind them, or to know how current each reading is.

## Identity — `GET /api/v1/caller`, and the two rules that bound it

**Two principals.** A token identifies a **client**; an **account** identifies a person, and a token
is bound to exactly one account. Until a login exists, presenting this viewer's token is acting as
its account. The permission verb (`read` / `write` / `execute`) is a separate axis from the surface
with **a separate token per verb**, so a write path means the dev proxy holds one credential per
verb rather than one credential with more rights. None of that changes the header the proxy sends.

`caller_store` reads the route and keeps a STATE rather than a message, so the wording stays in the
component where the display-string marker reaches it. `AccountStatus` draws each state as a mark and
a word, never a colour alone. Its hover card carries, for an identity, the account, the client, the
grants, the token's note and when the server was last checked (*Last checked*); a sentence heads the
card only where something is not fine — where everything is, the rows say it all (operator,
2026-10-14). The machine's card follows the same rule, and names its grade *Memory pressure*, since
the backend grades memory alone:

| State | What it means | Menu bar: icon · word |
|---|---|---|
| `idle` / `loading` | the first read is under way | `status-connecting` · *connecting* |
| `ready` | gating is on and the identity is real | `status-account` · the display name, quiet |
| `unenforced` | a 200 arrived and **proves nothing** — the server verifies no token, so every identity field is null even for a caller that sent a valid one | `status-warning` · *no sign-in*, warning role |
| `unauthenticated` | 401: the credential was refused | `status-warning` · *token refused*, warning role |
| `failed` | the server did not answer — a different problem with a different fix | `status-error` · *server unreachable*, error role |

Only the FIRST read shows as `loading`. Every return to the tab reads again, and a re-read keeps
the last answer on show until the new one arrives — otherwise the menu bar would flicker through
`connecting` each time.

**`grants` is INFORMATION, never a capability list.** Settled with the backend on 2026-09-25: the
list is displayed, every surface stays reachable, and a refusal is the 403 — which names the surface
and what the token holds. A client that hid a view because the list lacked an entry would be a
second, weaker copy of a model it does not own, and it would fail in the silent direction: an absent
view looks like one that never existed. If the rights model ever needs a client to reason from it,
that arrives as its own announced contract change.

**The answer is never cached, because a restart is invisible from here.** An account or a grant
takes effect on the backend only across a restart of its process, and no response carries a boot id
or a start time — confirmed by the backend rather than assumed, and the build version does not move
either. So `App.vue` re-reads on `visibilitychange`, and the hover card states the identity *as of*
the instant it was read. That approximation is only safe because of the rule above: the answer decides
nothing, so a stale one costs a line of text.

## How full the machine is — `GET /api/v1/machine-resources`

Contract 31, behind the `machine` grant since contract 35 — without it the route answers 403 and the
reading is marked as stopped. The machine is the one the server, the backtests and the live sessions share, and memory
that runs out is the moment a process is ended by the operating system — nothing refuses politely
before that. `MachineStatus` draws it in the menu bar, before the account:

```
CPU  15% · Memory  17%                         ok: the two shares, nothing else
⚠ warn · CPU  63% · Memory  84%                the backend's grade, where it is not ok
CPU  15% · Memory  17% · ⚠ as of 14:37:22      the readings have stopped arriving
```

- **The two shares stand there always; the grade speaks only where it is not `ok`**, as a mark and
  the backend's own word, and a grade this version does not know shows as itself. `pressure_level`
  is graded by the backend on memory alone — a busy processor is the machine doing its work.
  Nothing is computed here: the thresholds (`warn_at_pct`, `critical_at_pct`) and the reasons travel
  in the answer and are shown as they come, on the hover card beside the limit, where it was read
  (`limit_source`, `count_source`) and the window the processors' share covers.
- **Each share sits in a slot three digits wide** — spaces, kept by `white-space: pre` — so a figure
  going from 9 to 100 moves nothing beside it, and the account keeps its place.
- **`machine_store` asks every 5 s while the page is in view and nothing while it is hidden**; back
  in view it reads at once. A slow answer is not asked for twice, and one unanswered after 4 s is
  given up. **The last reading is held through a failure**, and once three polls have brought
  nothing new it is shown with its time (`as of …`, warning role). The backend asks for exactly
  that, so a reading that stopped arriving is visibly old rather than silently current.
- **The polling starts at the app root**, like the caller, so the store holds one reading for
  whoever shows it: the menu bar now, a System panel later (viewer#31, S6).
- The processors' `used_pct` and `window_s` are both null on the first reading after a restart of
  the server: the bar shows `—`, and the card says there is no window yet.

**The narrowing is said once, in the menu bar** (`NarrowingStatement`, viewer#42). It stood in the
quick bar of the run bundle and of each section panel, so a bundle split into three groups said it
three times, and a narrow group lost its tabs to it. It names the scenario in focus, the whole line
in its title where the bar is too narrow to show it, and says where the run lacks that name. The
line is a grid whose text track is `minmax(0, max-content)`, so its least width is its mark and its
button alone, and it shrinks before the machine status beside it moves (`e2e/narrow_panels.spec.ts`,
at 760 px). The *Panels* trigger never gives way: it shared the shortfall once and wrapped its ▾.
