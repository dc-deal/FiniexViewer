/**
 * How full the machine is — `GET /api/v1/machine-resources` (contract 31).
 *
 * The machine is the one the server, the backtests and the live sessions share. Memory that runs out
 * is the moment a process is ended by the operating system, and nothing refuses politely before
 * that; this answer says how close that moment is. The backend's document is `server`, section
 * *`/machine-resources` — how full the machine is*.
 */
export interface MachineCpu {
  /** The processors that bind — a container's quota where one binds, which may be FRACTIONAL. */
  count: number
  /** Where `count` was read: `cgroup` or `machine` — their vocabulary. */
  count_source: string
  /**
   * How busy the processors were over `window_s`: the seconds since the previous reading of this
   * route by ANY caller, so two clients polling share the readings and each sees a shorter window.
   * Both null on the very first reading after a restart — there is no window yet.
   */
  used_pct: number | null
  window_s: number | null
}

export interface MachineMemory {
  /** The limit that BINDS: a container's own where it is below the machine's, else the machine's. */
  limit_bytes: number
  used_bytes: number
  used_pct: number
  /** Where the limit was read: `cgroup` or `machine`. */
  limit_source: string
  /** The thresholds the level is graded against. They travel in the answer, so none is assumed. */
  warn_at_pct: number
  critical_at_pct: number
}

export interface MachineResources {
  measured_at: string
  cpu: MachineCpu
  memory: MachineMemory
  /**
   * `ok` · `warn` · `critical`, graded on MEMORY ALONE — a busy processor is the machine doing its
   * work, so it is shown and never graded. Their vocabulary, typed `string`: a grade this version
   * does not know is shown as itself.
   */
  pressure_level: string
  /** One sentence per reason, written for a person and shown as it comes. Empty at `ok`. */
  pressure_reasons: string[]
}

/**
 * One activity that runs on the machine — `GET /api/v1/activities` (contract 35), the backend's
 * document `activities`. A row is the ACTIVITY, never its process: two activities can share one
 * process — a sweep and the backtest of its current combination — and a process id is reused.
 */
export interface ActivityRow {
  activity_id: string
  /**
   * Their vocabulary — `backtest`, `sweep`, `autotrader_session`, `import`, `discovery_cache_build`,
   * `test_suite`, `api_server` — typed `string`: a kind this version does not know is shown as itself.
   */
  activity_kind: string
  /** `running` on every row today; `queued`, `finished` and `failed` are declared for a queue to come. */
  activity_state: string
  /** What it is about, for a person: a scenario set, a profile, a sweep, an import's id. */
  activity_label: string
  run_id: string | null
  sweep_id: string | null
  /** The activity it runs inside — a sweep's backtest names its sweep. One no longer listed has ended. */
  parent_activity_id: string | null
  /** Information only: meaningful on that machine, while it runs. */
  pid: number
  command_line: string
  started_at: string
  uptime_s: number
  /** The code it runs from: `.` for the code the server runs from, otherwise that code tree's name. */
  working_tree: string
  git_commit: string | null
  /** Who started it, the way the run list states it; null where it was not recorded. */
  origin_channel: string | null
  origin_client: string | null
  origin_principal: string | null
  origin_host: string | null
  console_session: string | null
  /**
   * The resident memory of its processes, an upper bound. `0` with `process_count: 0` where it runs
   * inside its parent's process: its memory is the parent's. `null` where a process could not be
   * read — never a zero in its place.
   */
  rss_bytes: number | null
  process_count: number
}

/** What runs on the machine at one instant: `measured_at` first, everything else read right after. */
export interface ActivityList {
  key: string[]
  measured_at: string
  /** The block `/machine-resources` serves, read at the same instant as the rows. */
  machine_memory: MachineMemory
  pressure_level: string
  pressure_reasons: string[]
  /** The answering server's own row; null where it is not in the list, which may then be incomplete. */
  server_activity_id: string | null
  /** Activities that run but whose entry this server cannot read — written by another version of the code. */
  unreadable_activity_ids: string[]
  activities: ActivityRow[]
}
