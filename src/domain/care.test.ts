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

import { planCreate, planDelete, planEdit } from './series'
const series = (o: Partial<CareBlock> = {}) => blk({ id: 's1', weekday: 2, valid_from: '2026-12-01', ...o })
const f = { caregiver_id: 'me', date: '2026-12-15', start_time: '09:00', end_time: '11:00' }

describe('series window', () => {
  it('respects start, end and every-other-week', () => {
    const b = series({ valid_until: '2026-12-22' })
    expect(blocksOn([b], [], '2026-11-24')).toHaveLength(0)
    expect(blocksOn([b], [], '2026-12-15')).toHaveLength(1)
    expect(blocksOn([b], [], '2026-12-29')).toHaveLength(0)
    const every2 = series({ interval_weeks: 2 })
    expect([ '2026-12-01', '2026-12-08', '2026-12-15', '2026-12-22' ].map((d) => blocksOn([every2], [], d).length)).toEqual([1, 0, 1, 0])
  })
})

describe('calendar-style changes', () => {
  it('create: none / weekly / weekdays / until', () => {
    expect(planCreate(f, { kind: 'none', days: [], until: null })).toMatchObject([{ op: 'insert', row: { on_date: '2026-12-15', weekday: 2 } }])
    expect(planCreate(f, { kind: 'weekdays', days: [], until: '2027-01-31' })).toHaveLength(5)
    expect(planCreate(f, { kind: 'biweekly', days: [], until: null })[0]).toMatchObject({ row: { interval_weeks: 2, valid_from: '2026-12-15' } })
  })
  it('delete: this = skip, following = end the day before, all = delete', () => {
    expect(planDelete(series(), '2026-12-15', 'this')).toEqual([{ op: 'skip', block_id: 's1', date: '2026-12-15' }])
    expect(planDelete(series(), '2026-12-15', 'following')).toEqual([{ op: 'update', id: 's1', patch: { valid_until: '2026-12-14' } }])
    expect(planDelete(series(), '2026-12-01', 'following')).toEqual([{ op: 'delete', id: 's1' }])
    expect(planDelete(series(), '2026-12-15', 'all')).toEqual([{ op: 'delete', id: 's1' }])
    expect(planDelete(blk({ on_date: '2026-12-01' }), '2026-12-01', 'this')).toEqual([{ op: 'delete', id: 'b1' }])
  })
  it('edit: this = skip + one-off, following = split, all = update', () => {
    const rep = { kind: 'weekly' as const, days: [], until: null }
    expect(planEdit(series(), '2026-12-15', 'this', f, rep).map((o) => o.op)).toEqual(['skip', 'insert'])
    const fol = planEdit(series(), '2026-12-15', 'following', f, rep)
    expect(fol[0]).toEqual({ op: 'update', id: 's1', patch: { valid_until: '2026-12-14' } })
    expect(fol[1]).toMatchObject({ op: 'insert', row: { valid_from: '2026-12-15', start_time: '09:00' } })
    expect(planEdit(series(), '2026-12-15', 'all', f, rep)).toMatchObject([{ op: 'update', id: 's1', patch: { start_time: '09:00', weekday: 2 } }])
    expect(planEdit(series(), '2026-12-15', 'all', f, { kind: 'weekdays', days: [], until: null })).toHaveLength(5)
  })
})
