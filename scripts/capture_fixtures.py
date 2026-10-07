"""Re-capture the test fixtures from the running backend through the dev proxy.

Same inputs as the existing captures, so a diff shows only what the contract changed. Run it from
the project root with the dev container up:

    python scripts/capture_fixtures.py --dry     # what would move, nothing written
    python scripts/capture_fixtures.py

It exists because the contract moved through seven versions in five days, and each time the mirror,
the fixtures and EXPECTED_CONTRACT have to move together (CLAUDE.md §21). Doing that by hand once
is fine; doing it by hand seven times is how one capture is forgotten and a test then asserts
against a shape the backend no longer serves.

The three ids below are the captures' SOURCE runs and are deliberately constants: a fixture whose
source changes on every capture is a fixture whose diff says nothing. They are the same ids the
case catalogue in INTERNAL_viewer_smoke_protocol.md names, so a run deleted on the other side shows
up in both places at once.

**An id is a pointer to something that is allowed to disappear.** This project is in alpha: runs are
regenerated, and a breaking change takes the ledger and the whole run history with it. So beside
each pin stands what QUALIFIES it, as code rather than prose — a comment saying why a run was chosen
rots unread, and a check that runs every time does not. Three consequences:

  - the pin is still a pin. Nothing is ever substituted silently, because that is what would make
    the fixture diff meaningless.
  - a pin that is GONE stops the capture dead and prints the stored runs that satisfy the same
    requirements, so replacing it is a one-line edit rather than an afternoon of measuring.
  - where nothing satisfies them, the request to FiniexTestingIDE is printed ready to send — in the
    form CLAUDE.md asks for, because by then the archive genuinely cannot answer and asking is the
    only move left.

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
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = 'http://localhost:5173/api/v1'
RUN = '20260927_132124_10c3d2c7'
LIVE_RUN = '20260927_132812_176eba2d'
DEPLOY = 'deploy_20260927_132425'

TARGETS = [
    ('runs_list.json', 'reports/runs'),
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
    ('run_config_simulation.json', f'reports/runs/{RUN}/config'),
    ('run_config_live.json', f'reports/runs/{LIVE_RUN}/config'),
    ('deployments_list.json', 'deployments'),
    ('deployment_detail.json', f'deployments/{DEPLOY}'),
    ('deployment_booking_periods.json', f'deployments/{DEPLOY}/booking-periods'),
]

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
if LIVE_RUN not in known:
    sys.exit(f'pinned LIVE_RUN {LIVE_RUN} is ABSENT from the index. It supplies the AutoTrader '
             'configuration fixture only; any autotrader run serving `config` can replace it.')

deployments = try_fetch('deployments') or {}
if DEPLOY not in {row.get('deployment_id') for row in deployments.get('deployments') or []}:
    sys.exit(f'pinned DEPLOY {DEPLOY} is ABSENT. It supplies the ledger fixtures; any deployment '
             'serving `booking-periods` can replace it.')

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

if failures:
    print('NOTHING WRITTEN - the capture is all or nothing, and these targets did not answer:')
    for name, path, error in failures:
        print(f'  {name:34} {path}  {error}')
    sys.exit(1)

if len(served) > 1:
    sys.exit(f'NOTHING WRITTEN - mixed contracts across the captures: {sorted(served)}. '
             'The backend changed version mid-capture; run it again.')

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

# ---- what MOVED, and what no longer holds. Silent where both are fine (CLAUDE.md). ----

now = measure(bodies['run_summary.json'], bodies['warnings_errors.json'],
              bodies['order_history.json'], bodies['trade_history.json'],
              bodies['pending_orders.json'])
before = measure(old_fixture('run_summary.json'), old_fixture('warnings_errors.json'),
                 old_fixture('order_history.json'), old_fixture('trade_history.json'),
                 old_fixture('pending_orders.json'))

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
