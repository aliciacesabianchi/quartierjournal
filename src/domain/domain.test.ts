import { describe, expect, it } from 'vitest'
import type { ActivityCard } from './types'
import { ageMatches, emptyFilters, fitsFreeTime, isEnded, matches, occursBetween, sortCards } from './filters'
import { buildIcs, fold, escapeText, googleCalendarUrl } from './ics'
import { addDays, isoWeekday, nextDateForWeekday, todayInZurich, weekdayName, ageInMonths } from './time'
import { normaliseUrl, whatsappUrl } from './share'

const card = (over: Partial<ActivityCard> = {}): ActivityCard => ({
  id: 'a1', title: 'Krabbelgruppe', activity_type: 'Baby group', category: 'baby', audience: null, childcare_mode: null,
  age_text: 'From 4 months', age_min_months: 4, age_max_months: null, age_numbers_from: 'source_text',
  price_text: null, is_free: null, registration: 'unknown', registration_text: null, schedule_notes: null,
  content_language: null, verification: 'provider_verified', last_checked_on: '2026-11-04',
  venue_id: 'v1', venue_name: 'GZ Buchegg', venue_kind: 'GZ', address: null, quartier: 'Unterstrass', district_number: 6, city_id: 'zurich',
  templates: [{ id: 't1', weekday: 5, start: '10:00:00', end: '11:30:00', recurrence: 'weekly', note: null }],
  upcoming: [], organiser_url: 'https://gz-zh.ch/gz-buchegg/', booking_url: null,
  location_text: null, data_origin: 'legacy:sqlite', listing_url: null, district_basis: null, image_url: null, image_credit: null, image_source_url: null, ...over,
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
  it('adds days across month and year ends and across the DST change', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-03-27', 1)).toBe('2027-03-28') // Zürich switches to summer time on this night
    expect(addDays('2026-11-18', -7)).toBe('2026-11-11')
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

describe('feed entries and the larger catalogue', () => {
  const TODAY = '2026-11-18' // a Wednesday
  const feed = (over: Partial<ActivityCard> = {}) => card({
    id: 'f1', title: 'Digi-Kafi', verification: 'secondary_source', data_origin: 'feed:chreis', age_text: null, age_min_months: null, age_max_months: null,
    age_numbers_from: null, templates: [], upcoming: [{ id: 'o1', date: '2026-11-21', start: '10:00:00', end: null, status: 'listed' }],
    district_number: null, venue_name: null, location_text: 'Leimbachstrasse 200 8041 Zürich', ...over,
  })
  it('hides entries with nothing left to attend', () => {
    expect(isEnded(feed({ upcoming: [] }), TODAY)).toBe(true)
    expect(isEnded(feed(), TODAY)).toBe(false)
    expect(isEnded(card(), TODAY)).toBe(false) // weekly pattern: not ended
    expect(matches(feed({ upcoming: [] }), emptyFilters(), new Set(), TODAY)).toBe(false)
  })
  it('scope "verified" keeps only organiser-confirmed entries', () => {
    const f = { ...emptyFilters(), scope: 'verified' as const }
    expect(matches(feed(), f, new Set(), TODAY)).toBe(false)
    expect(matches(card(), f, new Set(), TODAY)).toBe(true)
  })
  it('age filter: feed entries with unknown age need an explicit opt-in; verified family offers stay', () => {
    const f = { ...emptyFilters(), childAgeMonths: 24 }
    expect(matches(feed(), f, new Set(), TODAY)).toBe(false)
    expect(matches(feed(), { ...f, includeUnknownAge: true }, new Set(), TODAY)).toBe(true)
    expect(matches(card({ age_min_months: null, age_max_months: null }), f, new Set(), TODAY)).toBe(true)
  })
  it('Kreis filter: unknown Kreis is hidden unless opted in', () => {
    const f = { ...emptyFilters(), districts: [2] }
    expect(matches(feed(), f, new Set(), TODAY)).toBe(false)
    expect(matches(feed(), { ...f, includeUnknownKreis: true }, new Set(), TODAY)).toBe(true)
    expect(matches(feed({ district_number: 2 }), f, new Set(), TODAY)).toBe(true)
  })
  it('"when" filter: dated sessions exactly, weekly patterns as "usually", selected-dates never', () => {
    const today = { ...emptyFilters(), when: 'today' as const }
    expect(matches(feed({ upcoming: [{ id: 'o', date: TODAY, start: null, end: null, status: 'listed' }] }), today, new Set(), TODAY)).toBe(true)
    expect(matches(feed(), today, new Set(), TODAY)).toBe(false) // session is on the 21st
    expect(matches(feed(), { ...emptyFilters(), when: 'week' as const }, new Set(), TODAY)).toBe(true)
    const weeklyWed = card({ templates: [{ id: 't', weekday: 3, start: '10:00:00', end: null, recurrence: 'weekly', note: null }] })
    expect(occursBetween(weeklyWed, TODAY, TODAY)).toBe(true)
    expect(occursBetween(card({ templates: [{ id: 't', weekday: 3, start: null, end: null, recurrence: 'selected_dates', note: null }] }), TODAY, TODAY)).toBe(false)
  })
  it('sorts confirmed entries first, then by date', () => {
    const a = feed({ id: 'a', upcoming: [{ id: 'x', date: '2026-11-19', start: null, end: null, status: 'listed' }] })
    const b = card({ id: 'b', title: 'Zeta' })
    const c = feed({ id: 'c', upcoming: [{ id: 'y', date: '2026-11-20', start: null, end: null, status: 'listed' }] })
    expect(sortCards([c, a, b]).map((x) => x.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('ics', () => {
  const labels = { unconfirmed: 'Usual time, not confirmed', selectedDates: 'Selected dates only', organiser: 'Organiser', link: 'Link', endUnknown: 'End time not published' }
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
    // the dated session has no end time: the assumed 1 h must be disclosed, the weekly one (has an end) must not
    expect(ics.match(/End time not published/g)).toHaveLength(1)
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
