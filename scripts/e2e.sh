#!/usr/bin/env bash
#
# The browser suite, start to finish, with the browser guaranteed to die afterwards.
#
# It replaces a four-step procedure whose last step was "kill the browser by hand". That step was
# forgotten on 2026-10-08 and the browser ran ELEVEN HOURS, accumulating about 115 test contexts;
# the suite then took 8.6 minutes instead of 2.3 and four specs failed that had been green minutes
# before. Nothing was wrong with the code. A step that can be forgotten eventually is, so this
# script does not have that step — the trap does it, on every exit, including a failed suite and
# including Ctrl-C.
#
# Run it from the host (Git Bash). The container runs the specs; the browser runs here, because
# the image is Alpine on musl and Playwright's browsers are glibc builds.
#
#   bash scripts/e2e.sh                      the whole suite
#   bash scripts/e2e.sh e2e/order_steps.spec.ts --workers=1    anything playwright takes
#
set -uo pipefail

CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
PROFILE="${TEMP:-/tmp}/finiex-e2e"
PORT=9222

# The profile is the CONDITION, not hygiene. Started without its own --user-data-dir while the
# operator's Chrome is running, the debug flag is silently ignored and the command merely opens a
# tab in their session — and the kill below would then take their windows with it.
kill_ours() {
    powershell -NoProfile -Command "
        Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" |
            Where-Object { \$_.CommandLine -like '*finiex-e2e*' } |
            ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }
    " >/dev/null 2>&1
}

# ALWAYS, whatever happened. This is the whole point of the script.
trap 'kill_ours' EXIT INT TERM

# A browser left over from an earlier run is exactly the thing this guards against, so it goes
# before ours starts rather than being reused.
kill_ours
sleep 1

"$CHROME" --headless=new \
    --remote-debugging-port="$PORT" \
    --user-data-dir="$PROFILE" \
    --no-first-run --no-default-browser-check \
    >/dev/null 2>&1 &

# Wait for it from INSIDE the container, because that is the reachability that matters. The
# endpoint must be an IP: Chrome's DevTools endpoint validates the Host header against DNS
# rebinding and answers 500 to `host.docker.internal`, while the IP behind it answers normally.
ready=$(docker exec finiex-viewer sh -lc '
    for i in 1 2 3 4 5 6 7 8 9 10; do
        timeout 3 wget -qO- http://192.168.65.254:9222/json/version >/dev/null 2>&1 \
            && { echo ready; exit 0; }
        sleep 1
    done
    echo "not ready"')

if [ "$ready" != "ready" ]; then
    echo "The debug browser did not answer on port $PORT. Nothing was run." >&2
    exit 1
fi

if [ "$#" -eq 0 ]; then
    docker exec finiex-viewer sh -lc 'cd /app && npm run test:e2e'
else
    docker exec finiex-viewer sh -lc "cd /app && npx playwright test $*"
fi
status=$?

# the trap closes the browser; the suite's own verdict is what this script reports
exit "$status"
