import { describe, it, expect } from 'vitest'
import { readQuery, writeParam } from '@/composables/query_param_utils'

describe('readQuery', () => {
  it('keeps string params', () => {
    expect(readQuery({ broker: 'mt5', symbol: 'EURUSD' })).toEqual({ broker: 'mt5', symbol: 'EURUSD' })
  })

  it('drops array and null params — no view uses them', () => {
    expect(readQuery({ broker: 'mt5', tags: ['a', 'b'], empty: null })).toEqual({ broker: 'mt5' })
  })

  it('returns a new object, so mutating the result cannot touch the route', () => {
    const source = { broker: 'mt5' }
    const result = readQuery(source)
    result['broker'] = 'kraken_spot'
    expect(source.broker).toBe('mt5')
  })
})

describe('writeParam', () => {
  it('sets a value', () => {
    const query: Record<string, string> = {}
    writeParam(query, 'run', '20260615_130000')
    expect(query).toEqual({ run: '20260615_130000' })
  })

  it('removes the key when the value is null', () => {
    const query: Record<string, string> = { run: '20260615_130000' }
    writeParam(query, 'run', null)
    expect(query).toEqual({})
  })

  it('leaves params owned by other views untouched', () => {
    const query: Record<string, string> = { broker: 'mt5', symbol: 'EURUSD' }
    writeParam(query, 'run', '20260615_130000')
    writeParam(query, 'group', null)
    expect(query).toEqual({ broker: 'mt5', symbol: 'EURUSD', run: '20260615_130000' })
  })
})
