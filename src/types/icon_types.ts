/**
 * Every meaning the app draws an icon for: the names of `ICONS` in `icon_registry.ts`, written out
 * so the type lives with the other shared types. The compiler holds the registry to this list in
 * both directions — a name without a drawing and a drawing without a name are both errors.
 */
export type IconName =
  | 'kind-executive'
  | 'kind-broker'
  | 'kind-scenario-roster'
  | 'kind-booking-periods'
  | 'kind-aggregated-portfolio'
  | 'kind-trade-history'
  | 'kind-orders'
  | 'kind-warnings-errors'
  | 'kind-feed-health'
  | 'kind-config'
  | 'kind-run-header'
