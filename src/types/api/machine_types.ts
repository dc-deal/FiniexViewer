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
