import { describe, it, expect } from 'vitest'
import {
  framePaneOf, frameworkGroupsOf, hiddenByGroup, instanceOf, isLayerGroupKey, paneGroup, sourceGroup, workerGroup,
  workerGroupsOf,
} from '@/layer_groups'

/**
 * The groups of a chart's layers, each a visibility of its own above its layers' switches (operator,
 * 2026-11-14: "ähnlich wie der Mute-Schalter in einer DAW"): the keys they are kept under, and which
 * groups a layer belongs to.
 */
describe('layer groups', () => {
  it('keys a pane, a source in it and a worker in it apart', () => {
    expect(paneGroup('price')).toBe('pane:price')
    expect(sourceGroup('price', 'framework')).toBe('framework:price')
    expect(sourceGroup('price', 'workers')).toBe('workers:price')
    expect(workerGroup('m15_bar:body', 'm15_bar')).toBe('worker:m15_bar:body|m15_bar')
    expect([paneGroup('rsi_fast'), workerGroup('price', 'tunnel')].every(isLayerGroupKey)).toBe(true)
    // read back, a key of another form is none
    expect(['levels', 'worker:', 'pane: x', 42, null].some(isLayerGroupKey)).toBe(false)
  })

  /** The volume stands in a pane of its own only while its option says so; every other layer of ours in the candles'. */
  it('puts a layer of ours in the pane it is drawn in', () => {
    expect(framePaneOf('volume', true)).toBe('volume')
    expect(framePaneOf('volume', false)).toBe('price')
    expect(framePaneOf('volume', null)).toBe('price')
    expect(framePaneOf('trades', true)).toBe('price')
    expect(framePaneOf('candles', undefined)).toBe('price')
  })

  it('hides a layer where a group it belongs to is hidden, and only there', () => {
    expect(instanceOf('worker:tunnel')).toBe('tunnel')
    expect(instanceOf('worker:m15_bar:body')).toBe('m15_bar')
    const series = workerGroupsOf('price', 'worker:tunnel')
    expect(series).toEqual(['pane:price', 'workers:price', 'worker:price|tunnel'])
    expect(hiddenByGroup(new Set(['worker:price|tunnel']), series)).toBe(true)
    expect(hiddenByGroup(new Set(['worker:price|trend']), series)).toBe(false)
    expect(hiddenByGroup(new Set(['framework:price']), series)).toBe(false)
    expect(hiddenByGroup(new Set(['framework:price']), frameworkGroupsOf('price'))).toBe(true)
    expect(hiddenByGroup(new Set(['pane:price']), frameworkGroupsOf('price'))).toBe(true)
    expect(hiddenByGroup(new Set(['pane:volume']), frameworkGroupsOf('price'))).toBe(false)
  })
})
