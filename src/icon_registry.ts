import type { Component } from 'vue'
import {
  IconActivityHeartbeat,
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconAlertTriangle,
  IconBook,
  IconBuildingBank,
  IconCalendarWeek,
  IconChartBar,
  IconChartCandle,
  IconCircleDashed,
  IconCircleX,
  IconHourglass,
  IconList,
  IconStack2,
  IconSum,
  IconTag,
  IconUser,
  IconX,
} from '@tabler/icons-vue'
import type { IconName } from '@/types/icon_types'

/**
 * Every icon the app draws, named by what it MEANS. This is the one place a drawing is chosen: a
 * caller names the meaning, so one meaning has one icon everywhere, and a wrong name is a type
 * error rather than an empty square.
 *
 * The names follow one scheme — `form-*` the shape a panel takes, `kind-*` a panel kind,
 * `status-*` a state that is always said in words as well, `action-*` a control, `nav-*` where a
 * panel belongs — and a test holds the registry to it: every meaning is drawn somewhere, and no two
 * meanings share a drawing. The drawings are Tabler Icons (MIT), stroke 2, in the colour of the
 * element they sit in. A panel kind is named after the panel's own id.
 */
export const ICONS = {
  'form-list': IconList,
  'form-chart': IconChartCandle,
  'status-warning': IconAlertCircle,
  'status-error': IconCircleX,
  'status-account': IconUser,
  'status-connecting': IconCircleDashed,
  'action-close': IconX,
  'kind-executive': IconChartBar,
  'kind-broker': IconBuildingBank,
  'kind-scenario-roster': IconStack2,
  'kind-booking-periods': IconCalendarWeek,
  'kind-aggregated-portfolio': IconSum,
  'kind-trade-history': IconBook,
  'kind-orders': IconHourglass,
  'kind-warnings-errors': IconAlertTriangle,
  'kind-feed-health': IconActivityHeartbeat,
  'kind-config': IconAdjustmentsHorizontal,
  'kind-run-header': IconTag,
} as const satisfies Record<IconName, Component>
