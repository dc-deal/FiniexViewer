import {
  amount, drawdownFigure, duration, signClass, utcInstant,
} from '@/components/runs/report_format'
import type { Figure, FigureCard } from '@/types/figure_types'
import type { DeploymentCodeSummary, DeploymentRow } from '@/types/api/deployment_types'
import { plural, t } from '@/translate'

/**
 * A deployment's code over its sessions, from `code_summary`. Every commit counts and a change stays in
 * the history, so how long ago it moved is what tells a maintained deployment from one moved last week.
 * Its `sessions` stays unprinted: the count stands beside this wherever it is shown. `age_days` is whole
 * days, so 0 is a change of under a day and not of no time.
 */
export function codeSummaryText(summary: DeploymentCodeSummary): string {
  const stands = plural(summary.code_stands, t('code stand'), t('code stands'))
  if (summary.age_days === null) return stands
  return `${stands} · ${t('last moved')} ${summary.age_days === 0 ? t('under a day') : plural(summary.age_days, t('day'), t('days'))} ${t('ago')}`
}

/**
 * The longest idle stretch between two sessions. `null` where no such stretch EXISTS — a deployment
 * of one session has nothing between its sessions — which is an absence and not a zero.
 */
export function idleGap(row: DeploymentRow): string {
  return row.longest_gap_hours === null ? t('n/a') : duration(row.longest_gap_hours)
}

/**
 * What a ledger row has no width for — the card of a row in the deployment list and of the chosen
 * deployment's line in its bundle. Nothing is derived: every line names a field of the ledger row
 * that is on screen anyway, and the two stamps appear here on the CANONICAL clock beside the
 * column's rendering in the reader's own zone.
 */
export function deploymentCard(row: DeploymentRow): FigureCard {
  const details: Figure[] = [
    { label: t('First started'), value: utcInstant(row.first_started) },
    { label: t('Last started'), value: utcInstant(row.last_started) },
    { label: t('Sessions'), value: plural(row.sessions, t('session'), t('sessions')) },
    {
      label: t('Net P&L'),
      value: amount(row.net_pnl, row.currency),
      tone: signClass(row.net_pnl),
      title: t('A sum over the sessions. The drawdown beside it is NOT — see its own caveat.'),
    },
    {
      label: t('Max drawdown'),
      value: drawdownFigure(row.max_drawdown, row.max_drawdown_pct, row.currency),
      title: t('The deepest of the sessions, never their sum: each carries the running decline against the peak the deployment had reached, so adding them counts one decline once per session it spanned.'),
    },
    { label: t('Longest idle'), value: idleGap(row) },
  ]
  // the identity that does not move, and the only join that answers "is this the same bot as the
  // row above". Empty on a profile that declares none, so it is stated or it is absent.
  if (row.bot_id) details.push({ label: t('Bot id'), value: row.bot_id })
  // and where everything is fine, nothing is printed: one stand throughout is the ordinary case
  if (row.configuration_changed) {
    details.push({
      label: t('Configuration'),
      value: t('moved between sessions'),
      tone: 'warning',
      title: t('The sessions were not all produced by one configuration. Where the boundary falls is in the sessions table.'),
    })
  }
  // the code stands apart: it can move with the configuration holding, and the advisory then stays null
  if (row.code_summary) details.push({ label: t('Code'), value: codeSummaryText(row.code_summary) })
  return { title: `${row.deployment_id} · ${row.currency}`, details }
}
