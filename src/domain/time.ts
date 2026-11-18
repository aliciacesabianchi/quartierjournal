import type { Weekday } from './types'

export const TZ = 'Europe/Zurich'

/** '09:30:00' | '09:30' -> minutes since midnight */
export function toMinutes(t: string): number {
  const [h, m] = t.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}

export function hhmm(t: string | null | undefined): string | null {
  return t ? t.slice(0, 5) : null
}

/** Today's date in Zürich as YYYY-MM-DD, independent of the browser's time zone. */
export function todayInZurich(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** ISO weekday (1 = Mon) of a YYYY-MM-DD date. */
export function isoWeekday(date: string): Weekday {
  const d = new Date(date + 'T12:00:00Z').getUTCDay()
  return (d === 0 ? 7 : d) as Weekday
}

/** Next date (YYYY-MM-DD, today included) that falls on the given weekday. */
export function nextDateForWeekday(weekday: Weekday, from: string): string {
  const base = new Date(from + 'T12:00:00Z')
  const diff = (weekday - isoWeekday(from) + 7) % 7
  base.setUTCDate(base.getUTCDate() + diff)
  return base.toISOString().slice(0, 10)
}

/** Localised weekday name for ISO weekday, e.g. (2, 'fr', 'short') -> 'mar.' */
export function weekdayName(weekday: Weekday, locale: string, width: 'long' | 'short' = 'long'): string {
  // 2024-01-01 was a Monday
  const d = new Date(Date.UTC(2024, 0, weekday, 12))
  return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' }).format(d)
}

export function formatDate(date: string, locale: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'long' }): string {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'))
}

/** Child's age in whole months on a given date, from birth year + month. */
export function ageInMonths(birthYear: number, birthMonth: number, on: string): number {
  const [y, m] = on.split('-').map(Number) as [number, number]
  return (y - birthYear) * 12 + (m - birthMonth)
}

/** YYYY-MM-DD plus n days (calendar arithmetic, no time-zone surprises). */
export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
