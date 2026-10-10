#!/usr/bin/env bash
#
# One long command in the container, with a deadline it cannot outlive.
#
# A `docker exec` that times out is NOT stopped — only the host side of it is. The tool backgrounds
# the local command; the process inside keeps its CPU and keeps its heap, and nothing reports that
# it is still there. Measured 2026-09-29: a `knip` call abandoned at a 300 s timeout was still
# running an hour later, the container reached 27.28 GB at a sustained 1300 % CPU, and that starved
# the Docker API itself into answering 500 — so the runaway could no longer even be LISTED.
#
# The deadline is INSIDE, so an abandoned run dies by itself. Measured 2026-10-10: killing the npm
# process cascades, and its workers release their memory within seconds.
#
# The cleanup is a TRAP, for the same reason `scripts/e2e.sh` has one: a step that can be forgotten
# eventually is. It speaks only when it had something to kill — a run that ended cleanly leaves
# nothing and prints nothing.
#
#   bash scripts/run.sh test             the unit suite
#   bash scripts/run.sh lint             eslint
#   bash scripts/run.sh build            the production build
#   bash scripts/run.sh knip             unreferenced files, exports, dependencies
#   bash scripts/run.sh -- <anything>    any command, with the default deadline
#
# ONE long command per call, never two: chaining hides how long the second has run, and a deadline
# then lands on whichever was still going.

set -uo pipefail

CONTAINER=finiex-viewer
DEFAULT_DEADLINE=420

# The deadlines are measured, not guessed. The unit suite takes 75-95 s on a healthy VM, so 420 s
# is loose enough never to fire on an ordinary run and tight enough that an abandoned one cannot
# fill the VM. `knip` and the production build are slower and get their own.
case "${1:-}" in
    test)  DEADLINE=420; COMMAND='npm run test' ;;
    lint)  DEADLINE=300; COMMAND='npm run lint:check' ;;
    build) DEADLINE=600; COMMAND='npm run build' ;;
    knip)  DEADLINE=600; COMMAND='npm run knip' ;;
    --)    shift; DEADLINE=$DEFAULT_DEADLINE; COMMAND="$*" ;;
    '')    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
    *)     DEADLINE=$DEFAULT_DEADLINE; COMMAND="$*" ;;
esac

if [ -z "${COMMAND// }" ]; then
    echo "run.sh: nothing to run" >&2
    exit 2
fi

# EVERY pattern carries a bracket, and it is not decoration. A matcher whose own command line
# contains the word it searches for finds ITSELF: `pkill -f vitest` from such a shell killed its
# own parent and reported exit 137, and the probe below, with a bare `vue-tsc` in it, reported
# killing a vue-tsc that was never running. Both measured 2026-10-10, minutes apart.
# `vites[t]` matches `vitest`; it does not match the literal `vites[t]` on the command line.
RUNNERS='vites[t] kni[p] esl[i]nt playwrigh[t] vue-ts[c]'

# A ZOMBIE is not a runaway. `pkill` matches one and reports success although signalling a process
# that has already exited does nothing — so the trap announced a cleanup after every run while the
# container held 33 of them (measured 2026-10-10, and the container has no init to reap them; the
# backend has been asked for `init: true`). A line that is always there teaches nobody, so the
# probe looks for a LIVE match first and the trap speaks only then.
PROBE='ps -A -o stat,args | grep -v "^ *Z" | grep -oE "vites[t]|kni[p]|esl[i]nt|playwrigh[t]|vue-ts[c]" | sort -u | tr "\n" " "'

clean_up() {
    local alive
    alive=$(docker exec "$CONTAINER" sh -lc "$PROBE" 2>/dev/null)
    alive=${alive% }
    [ -z "$alive" ] && return 0
    for pattern in $RUNNERS; do
        docker exec "$CONTAINER" pkill -f "$pattern" >/dev/null 2>&1
    done
    # Something left behind is a FINDING, not housekeeping: the run did not end on its own.
    echo "run.sh: a run was still alive and has been killed — $alive" >&2
}

trap 'clean_up' EXIT INT TERM

docker exec "$CONTAINER" sh -lc "cd /app && timeout -k 10 $DEADLINE $COMMAND"
status=$?

# BusyBox `timeout` lets the signal kill the child, so the deadline reads as 143 (SIGTERM) rather
# than GNU's 124. Both mean the same thing here and neither is a test failure.
if [ "$status" -eq 124 ] || [ "$status" -eq 143 ]; then
    echo "run.sh: the deadline of ${DEADLINE}s was reached — the run did NOT finish" >&2
    echo "run.sh: what is big and old inside the container, which is the diagnosis to read:" >&2
    # `etime` is the column that matters: a process older than the run that started it is an orphan
    docker exec "$CONTAINER" sh -lc 'ps -o pid,rss,etime,args -A | sort -k2 -rn | head -8' >&2
fi

exit $status
