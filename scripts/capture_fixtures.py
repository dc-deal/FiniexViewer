"""Re-capture the test fixtures from the running backend through the dev proxy.

Same inputs as the existing captures, so a diff shows only what the contract changed. Run it from
the project root with the dev container up:

    python scripts/capture_fixtures.py --dry     # what would move, nothing written
    python scripts/capture_fixtures.py

It exists because the contract moved through seven versions in five days, and each time the mirror,
the fixtures and EXPECTED_CONTRACT have to move together — the mirror follows the current contract
and no other. Doing that by hand once is fine; doing it by hand seven times is how one capture is
forgotten and a test then asserts against a shape the backend no longer serves.

The three ids below are the captures' SOURCE runs and are deliberately constants: a fixture whose
source changes on every capture is a fixture whose diff says nothing.

**An id is a pointer to something that is allowed to disappear.** This project is in alpha: runs are
regenerated, and a breaking change takes the ledger and the whole run history with it. So beside
each pin stands what QUALIFIES it, as code rather than prose — a comment saying why a run was chosen
rots unread, and a check that runs every time does not. Three consequences:

  - the pin is still a pin. Nothing is ever substituted silently, because that is what would make
    the fixture diff meaningless.
  - a pin that is GONE stops the capture dead and prints the stored runs that satisfy the same
    requirements, so replacing it is a one-line edit rather than an afternoon of measuring.
  - where nothing satisfies them, the request to FiniexTestingIDE is printed ready to send, as
    OBSERVED, NEEDED and IMPACT — because by then the archive genuinely cannot answer and asking is
    the only move left.

Nothing is written unless EVERY target answered. A half-capture — two list fixtures refreshed beside
fourteen stale ones, with a manifest claiming today's date — reads as a whole one and is worse than
no capture at all.

Not to be confused with `classify_runs.py`, which asks the opposite question: which viewer SITUATION
each stored run produces, over the whole archive, for the smoke protocol's case catalogue. This one
asks only whether ONE pinned run still qualifies as the fixture source, and searches only when it
does not.
"""
import datetime
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = 'http://localhost:5173/api/v1'

# The simulation source, chosen 2026-10-08: the only run that satisfies all NINE requirements
# below at once. It comes from FiniexTestingIDE's committed set `report_coverage_reference`, built
# for exactly this purpose — so the fixture source is REPRODUCIBLE rather than a pointer to
# something that can vanish with the next archive wipe. Measured: four order statuses with 35
# refusals, two account currencies, `close_type` full AND partial with `position_closes` up to 3,
# a scenario absent with its error, `run_outcome: failed`.
#
# Re-pinned 2026-10-13 to the fixture catalog's `report_coverage` entry, produced again after a
# warmup change on their side with no contract change — the id FiniexTestingIDE named in its
# announcement. The catalog reproduces the case rather than replacing it.
#
# Re-pinned 2026-10-22 to the same entry's production of 2026-10-18, the id FiniexTestingIDE named:
# it lists seven warning rows where the earlier one listed five, an accepted move.
RUN = '20261018_105012_fde28d5d'

# The AutoTrader configuration fixture, and nothing else. Chosen for the RICHEST shape of the two
# served under `config`: a real-venue profile carries `dry_run`, `execution` and `safety` beside
# the strategy, where a mock session's profile has ten keys to its twelve.
LIVE_RUN = '20261007_152959_0275a107'

# The ledger fixtures. Produced by FiniexTestingIDE on 2026-10-08 on request, and verified here
# against all six properties `tests/api_contract.test.ts` asserts: four sessions, an advisory
# (`strategy_stands 2 · operation_stands 2`), one session with `strategy_changed` and another with
# `operation_changed`, eight periods over eight distinct opens — five replay days rather than five
# replays of one window, which is what makes the timeline's geometry testable at all.
#
# It also carries `unfinished: 1` — a fifth session killed before its close, so it has a run header
# and no ledger row. That shape had NO captured case and the contract test says so in its own
# comment; the capture closes it.
#
# Reproducible: `python python/experiments/generate_demo_deployment/generate_demo_deployment.py` on
# their side, about four minutes, and each run adds two NEW histories rather than replacing these.
#
# Re-pinned 2026-10-13 to the catalog's `demo_deployment` entry, produced again with `RUN` above:
# the main history, whose last session is again killed before its close.
DEPLOY = 'deploy_20261012_205734'

# The sweep the ranking fixtures come from: a stored search of several combinations, every one of
# them usable, ranked by an objective the sweep DECLARED — the case the Sweeps panel has to get
# right. The preflight below checks exactly that; any sweep it accepts can replace this one.
SWEEP = 'sweep_20261012_210055'

# The run header written from a tree with uncommitted changes, whose `changes` is a SAMPLE shorter
# than its `uncommitted_count` - the case a panel gets wrong by counting the list. The catalog runs
# are produced from clean trees now, so it has a pin of its own: the earlier simulation pin, 65
# uncommitted changes against a sample of 20. Any header that is dirty with a short sample can
# replace it; the check below the fetch says whether this one still qualifies.
DIRTY_RUN = '20261012_205715_c3b41fff'

# The latest state frame of a session, in the two states a stored run can hold for good. ENDED: the
# fixture catalog's `state_frames_session`, produced for this repository on 2026-10-22 and
# reproducible on their side - a mock session run to its regular end, its outcome written, one
# position open in its last frame. STOPPED: a dry run on the live feed killed mid-run, whose last
# frame is the one its strategy wrote when it sent an order - not reproducible, a live market cannot
# be replayed, so it stays as it is. A running session cannot be pinned: it ends.
STATE_ENDED_RUN = '20261022_123550_0bfde90e'
STATE_STOPPED_RUN = '20261022_123713_e059d354'

TARGETS = [
    ('runs_list.json', 'reports/runs'),
    # The record a run writes BEFORE anything else, of the simulation run, so it describes the
    # same run as the sections beside it - and, from a tree that was dirty, the sample case.
    ('run_header.json', f'reports/runs/{RUN}/header'),
    ('run_header_dirty.json', f'reports/runs/{DIRTY_RUN}/header'),
    ('state_frames_ended.json', f'reports/runs/{STATE_ENDED_RUN}/state-frames/latest'),
    ('state_frames_stopped.json', f'reports/runs/{STATE_STOPPED_RUN}/state-frames/latest'),
    ('run_summary.json', f'reports/runs/{RUN}/run-summary'),
    ('portfolio.json', f'reports/runs/{RUN}/portfolio'),
    ('run_booking_periods.json', f'reports/runs/{RUN}/booking-periods'),
    ('trade_history.json', f'reports/runs/{RUN}/trade-history'),
    ('scenario_details.json', f'reports/runs/{RUN}/scenario-details'),
    ('warnings_errors.json', f'reports/runs/{RUN}/warnings-errors'),
    ('broker.json', f'reports/runs/{RUN}/broker'),
    ('aggregated_portfolio.json', f'reports/runs/{RUN}/aggregated-portfolio'),
    ('pending_orders.json', f'reports/runs/{RUN}/pending-orders'),
    ('order_history.json', f'reports/runs/{RUN}/order-history'),
    # NARROWED, because that is what the panel asks for: one position's steps. The partial
    # close is the richest position in the capture - 12 events across 4 orders, so the three
    # levels (position, order, step) all have something to show.
    ('order_events.json',
     f'reports/runs/{RUN}/order-events'
     '?scenario_name=EURGBP_partial_close&order_id=pos_eurgbp_1'),
    # UNNARROWED and from the live run, because `broker_truth` exists nowhere else: a backtest
    # has no venue to ask, and a narrowed request carries none by design. It is also the only
    # capture holding the live-only event types `cancel_deferred` and `cancel_requested`.
    ('order_events_live.json', f'reports/runs/{LIVE_RUN}/order-events'),
    ('run_config_simulation.json', f'reports/runs/{RUN}/config'),
    ('run_config_live.json', f'reports/runs/{LIVE_RUN}/config'),
    ('deployments_list.json', 'deployments'),
    ('deployment_detail.json', f'deployments/{DEPLOY}'),
    ('deployment_booking_periods.json', f'deployments/{DEPLOY}/booking-periods'),
    # the third plane: every parameter search, and one of them ranked by its own objective
    ('sweeps_list.json', 'sweeps'),
    ('sweep_detail.json', f'sweeps/{SWEEP}'),
    # A READING, not a record: its figures are whatever the machine held at capture time, so a
    # re-capture moves them every time. Nothing asserts a figure, only the shape and the rules
    # the answer states about itself.
    ('machine_resources.json', 'machine-resources'),
    # A READING as well: what runs on the machine at capture time — the server's own row at least.
    # Tests build the other rows from it; nothing asserts which activities happened to run.
    ('activities.json', 'activities'),
    # The two markets the fixture run traded, for the run chart. A READING as well: the archive
    # grows, so `end` moves with every capture and nothing asserts it.
    # the server's timeframes with their lengths — what the run chart orders and picks them by
    ('timeframes.json', 'timeframes'),
    ('coverage_mt5_EURGBP.json', 'brokers/mt5/symbols/EURGBP/coverage'),
    ('coverage_kraken_spot_ETHUSD.json', 'brokers/kraken_spot/symbols/ETHUSD/coverage'),
]

# The run chart's candles: M1 bars over exactly the span each unit of the fixture run processed
# (`first_tick_time` … `last_tick_time` in the scenario details just captured), one file per market.
# M1 because that is what the chart picks for these windows — the finest timeframe that draws the
# window in at most 2,000 bars — and only the spans, because a market's whole archive is gigabytes.
BAR_TIMEFRAME = 'M1'

# The artifacts the mock has to be able to answer for. A run missing one of these cannot be the
# simulation source at all, and the run index states them, so the first pass costs one request.
NEEDED_ARTIFACTS = {
    'run_summary.json', 'portfolio.json', 'booking_periods.json', 'trade_history.json',
    'scenario_details.json', 'warnings_errors.json', 'broker.json', 'aggregated_portfolio.json',
    'pending_orders.json', 'order_history.json',
}

OUT = os.path.join('tests', 'fixtures')
dry = '--dry' in sys.argv


def fetch(path):
    """(body, contract). Raises, because every caller here treats a failure as fatal."""
    with urllib.request.urlopen(f'{BASE}/{path}', timeout=60) as response:
        return json.loads(response.read().decode('utf-8')), response.headers.get('X-Api-Contract', '?')


def try_fetch(path):
    try:
        return fetch(path)[0]
    except Exception:                                            # noqa: BLE001 - absence is the answer
        return None


def measure(summary, warnings_errors, orders_body, trades_body, pending_body):
    """The properties a capture is CHOSEN for, from the five responses that carry them.

    Kept to things a test actually depends on. `spread` is the one that reads oddly and matters
    most: how many scenarios the most widely shared position id appears in, and how many of those
    produced a trade — `position_link.spec.ts` is built on exactly that constellation, because a
    link must be drawn where it leads somewhere and absent where it does not.
    """
    orders = (orders_body or {}).get('orders') or []
    trades = (trades_body or {}).get('trades') or []

    where = {}
    for order in orders:
        if order.get('order_id'):
            where.setdefault(order['order_id'], set()).add(order.get('scenario_name'))
    traded = {(t.get('scenario_name'), t.get('position_id')) for t in trades}
    spread = (0, 0)
    for position, scenarios in where.items():
        with_trade = sum(1 for s in scenarios if (s, position) in traded)
        if with_trade and len(scenarios) > spread[0]:
            spread = (len(scenarios), with_trade)

    return {
        'scenarios_absent': len((summary or {}).get('units_absent') or []),
        'errors': len((warnings_errors or {}).get('errors') or []),
        'warnings': len((warnings_errors or {}).get('warnings') or []),
        'orders': len(orders),
        'order_groups': len({o.get('scenario_name') for o in orders}),
        'trades': len(trades),
        'trade_groups': len({t.get('scenario_name') for t in trades}),
        'spread_scenarios': spread[0],
        'spread_traded': spread[1],
        'pending_units': len((pending_body or {}).get('units') or []),
    }


# What qualifies the simulation source, and WHO depends on each one. The consumer is named so a
# requirement can be retired with the test that needed it, rather than outliving it unnoticed.
REQUIREMENTS = [
    ('errors', 1, 'Warnings & Errors has an error to draw (smoke case 2)'),
    ('warnings', 1, 'the advisory tiers have a row'),
    ('scenarios_absent', 1, 'a scenario that produced nothing, with its reason (smoke case 3)'),
    ('order_groups', 3, 'the order list has groups to narrow (orders_panel, list_ranks.spec)'),
    ('trades', 2, 'the trade list has rows'),
    ('trade_groups', 2, 'the trade groups open and close (trade_groups.spec)'),
    ('spread_scenarios', 3, 'one position id appears in several scenarios'),
    ('spread_traded', 2, 'and only SOME of them produced a trade (position_link.spec)'),
    ('pending_units', 1, 'a scenario funnel stands over the orders (orders_panel)'),
]


def unmet(properties):
    return [(key, floor, why) for key, floor, why in REQUIREMENTS if properties.get(key, 0) < floor]


def measure_run(run_id):
    """Everything `measure` needs for one run, as five requests. Used only when searching."""
    return run_id, measure(
        try_fetch(f'reports/runs/{run_id}/run-summary'),
        try_fetch(f'reports/runs/{run_id}/warnings-errors'),
        try_fetch(f'reports/runs/{run_id}/order-history'),
        try_fetch(f'reports/runs/{run_id}/trade-history'),
        try_fetch(f'reports/runs/{run_id}/pending-orders'),
    )


COLUMNS = [
    ('errors', 'errs'), ('warnings', 'warns'), ('scenarios_absent', 'absent'),
    ('order_groups', 'ordgrps'), ('trades', 'trades'), ('trade_groups', 'trdgrps'),
    ('spread_scenarios', 'spread'), ('spread_traded', 'traded'), ('pending_units', 'pending'),
]


def report_candidates(index):
    """Which stored runs could replace the simulation pin. Only reached when the pin is gone."""
    shortlist = [row['run_id'] for row in index.get('runs') or []
                 if row.get('group') == 'simulation'
                 and NEEDED_ARTIFACTS <= set(row.get('artifacts') or [])]
    print(f'  searching {len(shortlist)} simulation runs that carry every needed artifact')
    with ThreadPoolExecutor(max_workers=6) as pool:
        measured = list(pool.map(measure_run, shortlist))

    qualified = [(run_id, props) for run_id, props in measured if not unmet(props)]
    if not qualified:
        print()
        print('  NOTHING in the index satisfies this capture. The archive cannot answer, so this is')
        print('  a request for a RUN rather than a defect. Ready to send:')
        print()
        print(f'    OBSERVED: {len(shortlist)} stored simulation runs carry every report artifact,')
        print('    and none of them satisfies the requirements below.')
        print('    NEEDED: one simulation run, and each line says what depends on it:')
        for key, floor, why in REQUIREMENTS:
            print(f'      {key:18} >= {floor}   {why}')
        print('    IMPACT: the viewer replays its whole test corpus from ONE captured run, so the')
        print('    browser tier has nothing coherent to answer from until such a run exists.')
        return

    print()
    print('  these stored runs satisfy the same requirements:')
    print('  ' + 'run'.ljust(26) + ' '.join(label.rjust(8) for _, label in COLUMNS))
    for run_id, props in sorted(qualified):
        print('  ' + run_id.ljust(26) + ' '.join(str(props[key]).rjust(8) for key, _ in COLUMNS))
    print()
    print('  set RUN to one of these and run again. Nothing was written.')


def old_fixture(name):
    target = os.path.join(OUT, name)
    if not os.path.exists(target):
        return None
    with open(target, encoding='utf-8') as handle:
        return json.load(handle)


# ---- preflight: the pins have to be there before anything is fetched, let alone written ----

try:
    index, _ = fetch('reports/runs')
except Exception as error:                                       # noqa: BLE001 - report, never mask
    sys.exit(f'run index unreachable: {error}')

known = {row['run_id'] for row in index.get('runs') or []}
if RUN not in known:
    print(f'pinned RUN {RUN} is ABSENT from the index.')
    report_candidates(index)
    sys.exit(1)
if DIRTY_RUN not in known:
    sys.exit(f'pinned DIRTY_RUN {DIRTY_RUN} is ABSENT from the index. It supplies the header of a '
             'dirty tree only; any run whose header is dirty with a sample shorter than its count can '
             'replace it.')
for pin, role in ((STATE_ENDED_RUN, 'an ended session'), (STATE_STOPPED_RUN, 'a session whose recording stopped')):
    if pin not in known:
        sys.exit(f'pinned {pin} is ABSENT from the index. It supplies the latest state frame of {role}; '
                 'any session whose run list row reads the same `recording` can replace it.')
if LIVE_RUN not in known:
    sys.exit(f'pinned LIVE_RUN {LIVE_RUN} is ABSENT from the index. It supplies the AutoTrader '
             'configuration fixture only; any autotrader run serving `config` can replace it.')

deployments = try_fetch('deployments') or {}
if DEPLOY not in {row.get('deployment_id') for row in deployments.get('deployments') or []}:
    sys.exit(f'pinned DEPLOY {DEPLOY} is ABSENT. It supplies the ledger fixtures; any deployment '
             'serving `booking-periods` can replace it.')

sweeps = try_fetch('sweeps') or {}
pinned_sweep = next((row for row in sweeps.get('sweeps') or [] if row.get('sweep_id') == SWEEP), None)
if pinned_sweep is None:
    sys.exit(f'pinned SWEEP {SWEEP} is ABSENT. It supplies the ranking fixtures; any sweep of several '
             'combinations, all of them ok, with a declared objective can replace it.')
if pinned_sweep['run_count'] < 2 or pinned_sweep['error_count'] or not pinned_sweep['objective']:
    sys.exit(f'pinned SWEEP {SWEEP} no longer QUALIFIES: run_count {pinned_sweep["run_count"]}, '
             f'error_count {pinned_sweep["error_count"]}, objective {pinned_sweep["objective"]!r}.')

# ---- fetch everything, THEN write. A target that fails stops the whole capture. ----

bodies = {}
served = set()
failures = []
for name, path in TARGETS:
    try:
        body, contract = fetch(path)
    except Exception as error:                                   # noqa: BLE001 - report, never mask
        failures.append((name, path, error))
        continue
    bodies[name] = body
    served.add(contract)

markets = {}
for unit in bodies.get('scenario_details.json', {}).get('units', []):
    if not unit.get('first_tick_time') or not unit.get('last_tick_time'):
        continue
    key = (unit['data_broker_type'], unit['symbol'])
    # asked from one minute earlier, as the run chart asks: the route answers the bars that OPEN in
    # the range, and the bar the first tick fell in opened before it
    start = datetime.datetime.fromisoformat(unit['first_tick_time']) - datetime.timedelta(minutes=1)
    path = (f"brokers/{key[0]}/symbols/{key[1]}/bars?timeframe={BAR_TIMEFRAME}"
            f"&from={urllib.parse.quote(start.isoformat())}&to={urllib.parse.quote(unit['last_tick_time'])}")
    try:
        rows, _ = fetch(path)
    except Exception as error:                                   # noqa: BLE001 - report, never mask
        failures.append((f'bars of {unit["name"]}', path, error))
        continue
    merged = markets.setdefault(key, {})
    for row in rows:
        merged[row['t']] = row
for (broker, symbol), rows in sorted(markets.items()):
    name = f'bars_{broker}_{symbol}_{BAR_TIMEFRAME}.json'
    bodies[name] = [rows[t] for t in sorted(rows)]
    TARGETS.append((name, f'bars of the fixture run over its units, {BAR_TIMEFRAME}'))

dirty = ((bodies.get('run_header_dirty.json') or {}).get('code_identity') or {}).get('framework') or {}
if 'run_header_dirty.json' in bodies and not (
        dirty.get('dirty') and (dirty.get('uncommitted_count') or 0) > len(dirty.get('changes') or [])):
    sys.exit(f'NOTHING WRITTEN - pinned DIRTY_RUN {DIRTY_RUN} no longer QUALIFIES: dirty '
             f'{dirty.get("dirty")}, uncommitted_count {dirty.get("uncommitted_count")}, '
             f'a sample of {len(dirty.get("changes") or [])}.')

def state_units(name):
    return (bodies.get(name) or {}).get('units') or []

ended = state_units('state_frames_ended.json')
if 'state_frames_ended.json' in bodies and not (
        ended and all(unit.get('recording') == 'ended' and unit.get('outcome') for unit in ended)):
    sys.exit(f'NOTHING WRITTEN - pinned {STATE_ENDED_RUN} no longer QUALIFIES: every unit must read '
             f'recording ended with its outcome written.')
stopped = state_units('state_frames_stopped.json')
if 'state_frames_stopped.json' in bodies and not (
        stopped and all(unit.get('recording') == 'stopped' for unit in stopped)):
    sys.exit(f'NOTHING WRITTEN - pinned {STATE_STOPPED_RUN} no longer QUALIFIES: every unit must read '
             f'recording stopped.')

if failures:
    print('NOTHING WRITTEN - the capture is all or nothing, and these targets did not answer:')
    for name, path, error in failures:
        print(f'  {name:34} {path}  {error}')
    sys.exit(1)

if len(served) > 1:
    sys.exit(f'NOTHING WRITTEN - mixed contracts across the captures: {sorted(served)}. '
             'The backend changed version mid-capture; run it again.')

# The BEFORE reading has to be taken while the old fixtures are still on disk. It used to sit
# beside the comparison below, AFTER the write loop, so `old_fixture()` re-read the files that
# had just been written and every property compared equal to itself. The warning was therefore
# silent on every real capture and worked only under `--dry`, which is the one case where it is
# not needed. Found 2026-10-08.
before = measure(old_fixture('run_summary.json'), old_fixture('warnings_errors.json'),
                 old_fixture('order_history.json'), old_fixture('trade_history.json'),
                 old_fixture('pending_orders.json'))

for name, _ in TARGETS:
    body = bodies[name]
    old = old_fixture(name)
    added = removed = ''
    if isinstance(old, dict) and isinstance(body, dict):
        a = sorted(set(body) - set(old))
        r = sorted(set(old) - set(body))
        added = ('+' + ','.join(a)) if a else ''
        removed = ('-' + ','.join(r)) if r else ''

    if not dry:
        with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='\n') as handle:
            json.dump(body, handle, indent=2, ensure_ascii=False)
            handle.write('\n')

    contract = sorted(served)[0]
    print(f'{name:34} contract {contract:>3}  {added} {removed}'.rstrip())

# The manifest is what the contract test compares EXPECTED_CONTRACT against, so a capture that
# leaves it behind produces fixtures from one contract asserted as another. It was written by hand
# until the 19 capture, where it was simply forgotten.
if not dry:
    manifest = {
        'contract': int(sorted(served)[0]),
        'captured_from': 'GET /api/v1 through the dev proxy',
        'captured_on': datetime.date.today().isoformat(),
    }
    with open(os.path.join(OUT, 'capture_manifest.json'), 'w', encoding='utf-8', newline='\n') as handle:
        json.dump(manifest, handle, indent=2)
        handle.write('\n')
    print(f'capture_manifest.json               contract {manifest["contract"]:>3}  {manifest["captured_on"]}')

# ---- what MOVED, and what no longer holds. Silent where both are fine: a pass says nothing. ----

now = measure(bodies['run_summary.json'], bodies['warnings_errors.json'],
              bodies['order_history.json'], bodies['trade_history.json'],
              bodies['pending_orders.json'])
moved = [(key, before.get(key), value) for key, value in now.items() if before.get(key) != value]
if moved:
    print()
    print('PROPERTIES MOVED. A spec that transcribes one of these needs the new number:')
    for key, was, is_now in moved:
        print(f'  {key:20} {was} -> {is_now}')

short = unmet(now)
if short:
    print()
    print('REQUIREMENTS NOT MET by this capture. It was written anyway - the pin is a deliberate')
    print('choice and the fixtures follow it - but the tests below have nothing to stand on:')
    for key, floor, why in short:
        print(f'  {key:20} {now.get(key, 0)} < {floor}   {why}')
