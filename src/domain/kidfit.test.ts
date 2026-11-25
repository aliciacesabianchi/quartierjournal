import { describe, expect, it } from 'vitest'
import { isLate, kidFit } from './kidfit'
import type { ActivityCard } from './types'

const card = (o: Partial<ActivityCard> & { start?: string }): ActivityCard => ({
  id: 'x', title: 'T', activity_type: null, category: null, audience: 'family', verification: 'secondary_source', age_min_months: null, age_max_months: null,
  templates: [], upcoming: o.start ? [{ id: 'o', date: '2026-12-03', start: o.start, end: null, status: 'listed' }] : [], ...o,
} as unknown as ActivityCard)

describe('kidFit', () => {
  it('the three entries that were recommended wrongly are not suggested', () => {
    expect(kidFit(card({ title: '• DO 26. Nov. 18 Uhr | Adventsapéro unter den Vorderberg-Arkaden', start: '18:00' }))).toBe('no')
    expect(kidFit(card({ title: 'Afghanisch geniEssen', start: '18:00' }))).toBe('no')
    expect(kidFit(card({ title: 'Buch-Tausch', start: '16:00' }))).not.toBe('yes')
  })
  it('clear signs of children count as yes', () => {
    expect(kidFit(card({ title: 'Baby-Singen im GZ', start: '10:00' }))).toBe('yes')
    expect(kidFit(card({ title: 'Krabbelgruppe', start: '09:30' }))).toBe('yes')
    expect(kidFit(card({ title: 'Musikgeschichten', age_min_months: 48, start: '15:30' }))).toBe('yes')
    expect(kidFit(card({ title: 'Kinderkonzert', start: '18:00' }))).toBe('yes')       // a children's concert stays, even if late
    expect(kidFit(card({ title: 'Treffpunkt', verification: 'provider_verified', start: '10:00' }))).toBe('yes')
  })
  it('adult programme is out; general daytime events are only "maybe"', () => {
    expect(kidFit(card({ title: 'Yoga für alle', start: '09:30' }))).toBe('no')
    expect(kidFit(card({ title: 'Cafétreff für Senior*innen', start: '14:00' }))).toBe('no')
    expect(kidFit(card({ title: 'Weihnachtsmarkt im Wolfswinkel', start: '11:00' }))).toBe('maybe')
    expect(kidFit(card({ title: 'Keramik glasieren', start: '14:00' }))).toBe('maybe')
  })
  it('children above the target age and late starts without a child signal are out', () => {
    expect(kidFit(card({ title: 'Roboter bauen', age_min_months: 108, start: '14:00' }))).toBe('no')
    expect(kidFit(card({ title: 'Offener Treff', start: '19:00' }))).toBe('no')
    expect(isLate(card({ title: 'x', start: '17:30' }))).toBe(true)
    expect(isLate(card({ title: 'x', start: '17:00' }))).toBe(false)
  })
})
