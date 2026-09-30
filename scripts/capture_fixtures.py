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
"""
import json
import os
import sys
import urllib.request

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
    ('run_config_simulation.json', f'reports/runs/{RUN}/config'),
    ('run_config_live.json', f'reports/runs/{LIVE_RUN}/config'),
    ('deployments_list.json', 'deployments'),
    ('deployment_detail.json', f'deployments/{DEPLOY}'),
    ('deployment_booking_periods.json', f'deployments/{DEPLOY}/booking-periods'),
]

OUT = os.path.join('tests', 'fixtures')
dry = '--dry' in sys.argv

for name, path in TARGETS:
    url = f'{BASE}/{path}'
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            contract = response.headers.get('X-Api-Contract', '?')
            body = json.loads(response.read().decode('utf-8'))
    except Exception as error:                                   # noqa: BLE001 - report, never mask
        print(f'{name:34} FAILED  {error}')
        continue

    target = os.path.join(OUT, name)
    old = None
    if os.path.exists(target):
        with open(target, encoding='utf-8') as handle:
            old = json.load(handle)

    added = removed = ''
    if isinstance(old, dict) and isinstance(body, dict):
        a = sorted(set(body) - set(old))
        r = sorted(set(old) - set(body))
        added = ('+' + ','.join(a)) if a else ''
        removed = ('-' + ','.join(r)) if r else ''

    if not dry:
        with open(target, 'w', encoding='utf-8', newline='\n') as handle:
            json.dump(body, handle, indent=2, ensure_ascii=False)
            handle.write('\n')

    print(f'{name:34} contract {contract:>3}  {added} {removed}'.rstrip())
