import { describe, it, expect } from 'vitest'
import { ICONS } from '@/icon_registry'
import { allPanels } from '@/panel_registry'
import type { IconName } from '@/types/icon_types'

/**
 * The registry is the one place a drawing is chosen, so its rules are checked here rather than
 * trusted: a meaning nothing draws is an icon nobody maintains, two meanings on one drawing say two
 * things with one shape, and a name outside the scheme is a name nobody finds again.
 */

/** Every source file that could name an icon, read as text — the way a reviewer would search it. */
const ALL = import.meta.glob(['/src/**/*.vue', '/src/**/*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * The registry is left out by what it SAYS, not by where it lives: it names every meaning itself,
 * so a path that stopped matching after a move would quietly make every meaning count as drawn.
 */
const DEFINES_THE_REGISTRY = 'export const ICONS'
const SOURCES = Object.values(ALL).filter(text => !text.includes(DEFINES_THE_REGISTRY))

const NAMES = Object.keys(ICONS) as IconName[]

describe('the icon registry', () => {
  it('is found by what it says, in exactly one file', () => {
    expect(Object.values(ALL).filter(text => text.includes(DEFINES_THE_REGISTRY))).toHaveLength(1)
  })

  /**
   * Lexical, on purpose: a name in quotes of either kind counts — single in script, double in a
   * template attribute. So does a name inside a comment, which is the price of reading text rather
   * than a syntax tree.
   */
  it('names only meanings something draws', () => {
    const unused = NAMES.filter(name =>
      !SOURCES.some(text => text.includes(`'${name}'`) || text.includes(`"${name}"`)))
    expect(unused).toEqual([])
  })

  it('gives every meaning a drawing of its own', () => {
    const drawings = NAMES.map(name => ICONS[name])
    expect(new Set(drawings).size).toBe(drawings.length)
  })

  it('names every meaning in the scheme', () => {
    const scheme = /^(form|kind|status|action|nav)-[a-z0-9]+(-[a-z0-9]+)*$/
    expect(NAMES.filter(name => !scheme.test(name))).toEqual([])
  })

  /** A panel kind is named after the panel's id, so the registry and the panel list cannot drift. */
  it('draws every panel kind under the id of its panel', () => {
    const astray = allPanels().filter(panel => panel.icon !== `kind-${panel.id}`)
    expect(allPanels().length).toBeGreaterThan(0)
    expect(astray.map(panel => panel.id)).toEqual([])
  })
})
