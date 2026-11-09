import type { ActivityCard, CareBlock, Weekday } from './types'
import { isoWeekday, toMinutes } from './time'

export interface DiscoverFilters {
  q: string
  districts: number[]          // empty = all
  weekday: Weekday | null
  timeOfDay: 'am' | 'pm' | null
  childAgeMonths: number | null
  category: string | null
  freeOnly: boolean
  noRegistration: boolean
  forCaregiver: 'all' | 'caregiver' | 'child'
  favouritesOnly: boolean
}

export const emptyFilters = (): DiscoverFilters => ({
  q: '', districts: [], weekday: null, timeOfDay: null, childAgeMonths: null, category: null,
  freeOnly: false, noRegistration: false, forCaregiver: 'all', favouritesOnly: false,
})

const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Days on which an activity takes place: weekly templates + upcoming dated sessions. */
export function activityWeekdays(a: ActivityCard): Set<Weekday> {
  const days = new Set<Weekday>()
  for (const t of a.templates) days.add(t.weekday)
  for (const o of a.upcoming) if (o.status !== 'cancelled') days.add(isoWeekday(o.date))
  return days
}

interface Slot { weekday: Weekday; start: string | null; end: string | null }
export function activitySlots(a: ActivityCard): Slot[] {
  return [
    ...a.templates.map((t) => ({ weekday: t.weekday, start: t.start, end: t.end })),
    ...a.upcoming.filter((o) => o.status !== 'cancelled').map((o) => ({ weekday: isoWeekday(o.date), start: o.start, end: o.end })),
  ]
}

/**
 * Age match. Unknown ages always match (and are labelled as unknown in the UI).
 * When numbers were read from text like "2–5 years", the upper bound means "up to and including age 5",
 * so we allow the rest of that year.
 */
export function ageMatches(a: Pick<ActivityCard, 'age_min_months' | 'age_max_months'> & { age_numbers_from?: string | null }, months: number): boolean {
  if (a.age_min_months != null && months < a.age_min_months) return false
  if (a.age_max_months != null) {
    const grace = a.age_numbers_from === 'source_text' ? 11 : 0
    if (months > a.age_max_months + grace) return false
  }
  return true
}

export function matches(a: ActivityCard, f: DiscoverFilters, favourites: Set<string>): boolean {
  if (f.q) {
    const hay = norm([a.title, a.venue_name, a.quartier, a.activity_type, a.district_number ? `kreis ${a.district_number}` : ''].join(' '))
    if (!norm(f.q).split(/\s+/).every((w) => hay.includes(w))) return false
  }
  if (f.districts.length && (a.district_number == null || !f.districts.includes(a.district_number))) return false
  if (f.category && a.category !== f.category) return false
  if (f.freeOnly && a.is_free !== true) return false
  if (f.noRegistration && a.registration !== 'not_required') return false
  if (f.forCaregiver === 'caregiver' && a.audience !== 'caregiver_with_childcare') return false
  if (f.forCaregiver === 'child' && a.audience === 'caregiver_with_childcare') return false
  if (f.favouritesOnly && !favourites.has(a.id)) return false
  if (f.childAgeMonths != null && !ageMatches(a, f.childAgeMonths)) return false
  if (f.weekday || f.timeOfDay) {
    const ok = activitySlots(a).some((s) => {
      if (f.weekday && s.weekday !== f.weekday) return false
      if (f.timeOfDay) {
        if (!s.start) return true // unknown time: don't hide
        const start = toMinutes(s.start)
        if (f.timeOfDay === 'am' && start >= 12 * 60) return false
        if (f.timeOfDay === 'pm' && start < 12 * 60) return false
      }
      return true
    })
    if (!ok) return false
  }
  return true
}

/**
 * "Fits my free time": a slot fits when its whole time range lies inside a care block
 * assigned to the caregiver that represents the user ("me"). Slots without times never fit
 * (we can't know), so they are excluded from this filter only.
 */
export function fitsFreeTime(a: ActivityCard, blocks: CareBlock[], meCaregiverIds: Set<string>): boolean {
  const mine = blocks.filter((b) => meCaregiverIds.has(b.caregiver_id))
  return activitySlots(a).some((s) => {
    if (!s.start) return false
    const start = toMinutes(s.start)
    const end = s.end ? toMinutes(s.end) : start + 60
    return mine.some((b) => b.weekday === s.weekday && toMinutes(b.start_time) <= start && toMinutes(b.end_time) >= end)
  })
}

export function sortCards(cards: ActivityCard[]): ActivityCard[] {
  const firstDate = (a: ActivityCard) => a.upcoming[0]?.date ?? '9999'
  return [...cards].sort((x, y) => firstDate(x).localeCompare(firstDate(y)) || x.title.localeCompare(y.title, 'de'))
}
