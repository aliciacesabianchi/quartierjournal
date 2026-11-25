import { describe, expect, it } from 'vitest'
import { blocksOn, fitsDates } from './care'
import type { ActivityCard, CareBlock } from './types'

const blk = (o: Partial<CareBlock>): CareBlock => ({ id: 'b1', caregiver_id: 'me', weekday: 2, start_time: '08:00:00', end_time: '12:00:00', on_date: null, ...o })
// 2026-12-01 is a Tuesday (weekday 2)
const card = (o: Partial<ActivityCard>) => ({ templates: [], upcoming: [], ...o }) as unknown as ActivityCard
const weekly = card({ templates: [{ id: 't', weekday: 2, start: '09:00', end: '10:00' }] as never })
const me = new Set(['me'])

describe('care times per date', () => {
  it('weekly times apply on every matching date', () => {
    expect(blocksOn([blk({})], [], '2026-12-01')).toHaveLength(1)
    expect(blocksOn([blk({})], [], '2026-12-08')).toHaveLength(1)
    expect(blocksOn([blk({})], [], '2026-12-02')).toHaveLength(0)
  })
  it('a skipped week removes only that date', () => {
    const skips = [{ block_id: 'b1', date: '2026-12-08' }]
    expect(blocksOn([blk({})], skips, '2026-12-08')).toHaveLength(0)
    expect(blocksOn([blk({})], skips, '2026-12-15')).toHaveLength(1)
  })
  it('a one-off time applies only on its date', () => {
    const one = blk({ on_date: '2026-12-01' })
    expect(blocksOn([one], [], '2026-12-01')).toHaveLength(1)
    expect(blocksOn([one], [], '2026-12-08')).toHaveLength(0)
  })
})

describe('fitsDates', () => {
  it('a weekly offer fits when it lies inside my time that day', () => {
    expect(fitsDates(weekly, [blk({})], [], me, ['2026-12-01'])).toBe(true)
  })
  it('does not fit on a skipped week or another day', () => {
    expect(fitsDates(weekly, [blk({})], [{ block_id: 'b1', date: '2026-12-01' }], me, ['2026-12-01'])).toBe(false)
    expect(fitsDates(weekly, [blk({})], [], me, ['2026-12-02'])).toBe(false)
  })
  it('a dated session counts only on its own date', () => {
    const dated = card({ upcoming: [{ id: 'o', date: '2026-12-08', start: '09:00', end: '10:00', status: 'listed' }] })
    expect(fitsDates(dated, [blk({})], [], me, ['2026-12-01'])).toBe(false)
    expect(fitsDates(dated, [blk({})], [], me, ['2026-12-08'])).toBe(true)
  })
  it('unknown start time or someone else care time never counts', () => {
    expect(fitsDates(card({ templates: [{ id: 't', weekday: 2, start: null, end: null }] as never }), [blk({})], [], me, ['2026-12-01'])).toBe(false)
    expect(fitsDates(weekly, [blk({ caregiver_id: 'gran' })], [], me, ['2026-12-01'])).toBe(false)
  })
})
