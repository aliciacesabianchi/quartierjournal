import { describe, expect, it } from 'vitest'
import type { ActivityCard } from './types'
import { ageMatches, emptyFilters, fitsFreeTime, matches } from './filters'
import { buildIcs, fold, escapeText, googleCalendarUrl } from './ics'
import { isoWeekday, nextDateForWeekday, todayInZurich, weekdayName, ageInMonths } from './time'
import { normaliseUrl, whatsappUrl } from './share'

const card = (over: Partial<ActivityCard> = {}): ActivityCard => ({
  id: 'a1', title: 'Krabbelgruppe', activity_type: 'Baby group', category: 'baby', audience: null, childcare_mode: null,
  age_text: 'From 4 months', age_min_months: 4, age_max_months: null, age_numbers_from: 'source_text',
  price_text: null, is_free: null, registration: 'unknown', registration_text: null, schedule_notes: null,
  content_language: null, verification: 'provider_verified', last_checked_on: '2026-11-04',
  venue_id: 'v1', venue_name: 'GZ Buchegg', venue_kind: 'GZ', address: null, quartier: 'Unterstrass', district_number: 6, city_id: 'zurich',
  templates: [{ id: 't1', weekday: 5, start: '10:00:00', end: '11:30:00', recurrence: 'weekly', note: null }],
  upcoming: [], organiser_url: 'https://gz-zh.ch/gz-buchegg/', booking_url: null, ...over,
})

describe('time', () => {
  it('computes ISO weekdays and next dates', () => {
    expect(isoWeekday('2026-11-09')).toBe(1) // Monday
    expect(isoWeekday('2026-11-15')).toBe(7)
    expect(nextDateForWeekday(5, '2026-11-09')).toBe('2026-11-13')
    expect(nextDateForWeekday(1, '2026-11-09')).toBe('2026-11-09')
  })
  it('uses Zürich time for "today"', () => {
    expect(todayInZurich(new Date('2026-11-09T23:30:00Z'))).toBe('2026-11-10')
  })
  it('names weekdays in all four languages', () => {
    expect(weekdayName(1, 'de')).toBe('Montag')
    expect(weekdayName(3, 'fr')).toBe('mercredi')
    expect(weekdayName(4, 'it')).toBe('giovedì')
    expect(weekdayName(7, 'en')).toBe('Sunday')
  })
  it('computes age in months', () => {
    expect(ageInMonths(2024, 3, '2026-11-09')).toBe(32)
  })
})

describe('filters', () => {
  it('keeps unknown ages and respects stated bounds', () => {
    expect(ageMatches({ age_min_months: null, age_max_months: null }, 30)).toBe(true)
    expect(ageMatches({ age_min_months: 4, age_max_months: null }, 2)).toBe(false)
    // "2–5 years" read from text: a 5½-year-old still matches
    expect(ageMatches({ age_min_months: 24, age_max_months: 60, age_numbers_from: 'source_text' }, 66)).toBe(true)
    expect(ageMatches({ age_min_months: 24, age_max_months: 60, age_numbers_from: 'source_text' }, 72)).toBe(false)
    // structured "until 9th birthday"
    expect(ageMatches({ age_min_months: 3, age_max_months: 108, age_numbers_from: 'source_structured' }, 109)).toBe(false)
  })
  it('filters by weekday, district, search and free', () => {
    const f = emptyFilters()
    expect(matches(card(), { ...f, weekday: 5 }, new Set())).toBe(true)
    expect(matches(card(), { ...f, weekday: 2 }, new Set())).toBe(false)
    expect(matches(card(), { ...f, districts: [6] }, new Set())).toBe(true)
    expect(matches(card(), { ...f, districts: [7] }, new Set())).toBe(false)
    expect(matches(card(), { ...f, q: 'buchegg krabbel' }, new Set())).toBe(true)
    expect(matches(card(), { ...f, q: 'zurich hb' }, new Set())).toBe(false)
    expect(matches(card(), { ...f, freeOnly: true }, new Set())).toBe(false) // unknown price is not "free"
    expect(matches(card(), { ...f, timeOfDay: 'am' }, new Set())).toBe(true)
    expect(matches(card(), { ...f, timeOfDay: 'pm' }, new Set())).toBe(false)
  })
  it('matches dated sessions by their weekday', () => {
    const c = card({ templates: [], upcoming: [{ id: 'o1', date: '2026-11-29', start: '10:15:00', end: null, status: 'listed' }] })
    expect(matches(c, { ...emptyFilters(), weekday: 7 }, new Set())).toBe(true)
  })
  it('fits free time only inside a "me" block', () => {
    const blocks = [
      { id: 'b1', caregiver_id: 'me', weekday: 5 as const, start_time: '09:00:00', end_time: '12:00:00' },
      { id: 'b2', caregiver_id: 'kita', weekday: 5 as const, start_time: '08:00:00', end_time: '17:00:00' },
    ]
    expect(fitsFreeTime(card(), blocks, new Set(['me']))).toBe(true)
    expect(fitsFreeTime(card(), blocks, new Set(['kita-only']))).toBe(false)
    expect(fitsFreeTime(card({ templates: [{ id: 't', weekday: 5, start: null, end: null, recurrence: 'weekly', note: null }] }), blocks, new Set(['me']))).toBe(false)
  })
})

describe('ics', () => {
  const labels = { unconfirmed: 'Usual time, not confirmed', selectedDates: 'Selected dates only', organiser: 'Organiser', link: 'Link' }
  const now = new Date('2026-11-09T10:00:00Z')
  it('escapes and folds per RFC 5545', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
    const long = 'SUMMARY:' + 'ä'.repeat(60)
    const folded = fold(long)
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(long)
  })
  it('exports weekly templates as tentative RRULE events and dated sessions as single events', () => {
    const c = card({ upcoming: [{ id: 'o1', date: '2026-11-29', start: '10:15:00', end: null, status: 'listed' }] })
    const ics = buildIcs([{ activity: c, template: c.templates[0] }, { activity: c, occurrence: c.upcoming[0] }], labels, { now, appUrl: 'https://qj.pages.dev' })
    expect(ics).toContain('DTSTART;TZID=Europe/Zurich:20261113T100000')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=FR')
    expect(ics).toContain('STATUS:TENTATIVE')
    expect(ics).toContain('DTSTART;TZID=Europe/Zurich:20261129T101500')
    expect(ics).toContain('DURATION:PT1H')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })
  it('skips slots without a start time and never adds RRULE for selected dates', () => {
    const c = card({ templates: [
      { id: 't1', weekday: 3, start: null, end: null, recurrence: 'weekly', note: null },
      { id: 't2', weekday: 3, start: '14:00:00', end: '17:00:00', recurrence: 'selected_dates', note: null },
    ] })
    const ics = buildIcs(c.templates.map((t) => ({ activity: c, template: t })), labels, { now, appUrl: 'x' })
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics).not.toContain('RRULE:FREQ=WEEKLY;BYDAY=WE')
    expect(ics).toContain('Selected dates only')
  })
  it('builds a Google Calendar link', () => {
    const url = googleCalendarUrl({ activity: card(), template: card().templates[0] }, labels, { now, appUrl: 'x' })!
    expect(url).toContain('dates=20261113T100000%2F20261113T113000')
    expect(url).toContain('ctz=Europe%2FZurich')
  })
})

describe('share', () => {
  it('normalises URLs for duplicate matching', () => {
    expect(normaliseUrl('http://WWW.gz-zh.ch/gz-buchegg/?utm_source=x#top')).toBe('https://gz-zh.ch/gz-buchegg')
    expect(normaliseUrl('javascript:alert(1)')).toBeNull()
    expect(normaliseUrl('not a url')).toBeNull()
  })
  it('encodes WhatsApp text', () => {
    expect(whatsappUrl('a b&c')).toBe('https://wa.me/?text=a%20b%26c')
  })
})
