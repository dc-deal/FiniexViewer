"""Which viewer situation does each stored run actually produce?

Read-only, through the dev proxy. The run index carries most of it since contract 18; the broker
route is asked only of runs that carry reports, because it is the one question the index cannot
answer.

    python scripts/classify_runs.py

It feeds the case catalogue in INTERNAL_viewer_smoke_protocol.md, and it is a script rather than a
table because the answer changes whenever the IDE produces or deletes a run. A situation that no
stored run produces any more must be visible as UNCOVERED rather than quietly absent — an uncovered
case is the one that breaks without anyone seeing it.
"""
import json
import urllib.request

BASE = 'http://localhost:5173/api/v1'


def get(path, timeout=90):
    with urllib.request.urlopen(f'{BASE}/{path}', timeout=timeout) as response:
        return json.loads(response.read().decode('utf-8'))


runs = get('reports/runs')['runs']
print(f'{len(runs)} runs in the index\n')

cases = {}


def note(case, run_id, detail=''):
    cases.setdefault(case, []).append((run_id, detail))


for run in runs:
    rid = run['run_id']
    results = run.get('results') or []
    currencies = {row['currency'] for row in results}
    trades = sum(row['total_trades'] for row in results)

    if run.get('run_outcome') == 'failed':
        note('a run graded FAILED', rid, run['name'])
    if len(currencies) > 1:
        note('several account currencies', rid, '/'.join(sorted(currencies)))
    if run.get('results') is None:
        note('the ledger holds nothing for it', rid, run['name'])
    if (run.get('error_count') or 0) > 0:
        note('unit errors', rid, f"{run['error_count']} errors")
    if (run.get('warning_count') or 0) > 3:
        note('several warnings', rid, f"{run['warning_count']} warnings")
    if not run.get('has_reports'):
        note('logs only, no reports', rid, run['name'])
    if run.get('parent_kind'):
        note(f"a child of a {run['parent_kind']}", rid, run['name'])
    if (run.get('tick_timespan_seconds') or 0) > 2_000 * 3600:
        note('a very long market span', rid, f"{run['tick_timespan_seconds'] / 3600:.0f} h")
    if trades > 300:
        note('many trades (row cap territory)', rid, f'{trades} trades')
    if run.get('run_outcome') is None:
        note('no outcome recorded (older artifact)', rid, run['name'])

# the two that need a second route, asked only of runs that carry reports
for run in runs:
    if not run.get('has_reports'):
        continue
    rid = run['run_id']
    try:
        broker = get(f'reports/runs/{rid}/broker', timeout=40)
    except Exception:                                            # noqa: BLE001
        continue
    units = broker.get('units') or []
    if len(units) > 1:
        note('SEVERAL BROKERS in one run', rid, ' + '.join(u['broker_type'] for u in units))
    if any(u['market_type'] == 'crypto' for u in units) and any(
        u['market_type'] == 'forex' for u in units
    ):
        note('forex and crypto side by side', rid, '')
    if any(u.get('leverage', 1) > 1 for u in units) and any(
        u.get('leverage', 1) == 1 for u in units
    ):
        note('margin and spot side by side', rid, '')

for case in sorted(cases):
    rows = cases[case]
    print(f'{case}  ({len(rows)})')
    for rid, detail in rows[:3]:
        print(f'    {rid}  {detail}')
    if len(rows) > 3:
        print(f'    … and {len(rows) - 3} more')
    print()
