// Care times for a given calendar date: weekly times (unless that week is skipped, e.g. holidays) plus one-off times on that date.
import type { ActivityCard, CareBlock } from './types'
import { addDays, isoWeekday, toMinutes } from './time'

export interface CareSkip { block_id: string; date: string }

const DAY_MS = 86_400_000
const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY_MS)
const mondayOf = (d: string) => addDays(d, 1 - isoWeekday(d))

/** Does this care time (a one-off or a series) take place on this date? Skipped single dates, start/end of the series and "every other week" are respected. */
export function occursOn(b: CareBlock, skips: CareSkip[], date: string): boolean {
  if (b.on_date) return b.on_date === date
  if (b.weekday !== isoWeekday(date)) return false
  if (b.valid_from && date < b.valid_from) return false
  if (b.valid_until && date > b.valid_until) return false
  if ((b.interval_weeks ?? 1) > 1) {
    const weeks = daysBetween(mondayOf(b.valid_from ?? date), mondayOf(date)) / 7
    if (weeks % (b.interval_weeks ?? 1) !== 0) return false
  }
  return !skips.some((s) => s.block_id === b.id && s.date === date)
}

export function blocksOn(blocks: CareBlock[], skips: CareSkip[], date: string): CareBlock[] {
  return blocks.filter((b) => occursOn(b, skips, date))
}

const sevenDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i))

/**
 * Does this offer have a session on one of the given dates that lies fully inside a time when "I" have the child?
 * Dated sessions count only on their own date; weekly patterns count on every date of that weekday. Unknown times never count.
 */
export function fitsDates(a: ActivityCard, blocks: CareBlock[], skips: CareSkip[], selfIds: Set<string>, dates: string[]): boolean {
  const mine = blocks.filter((b) => selfIds.has(b.caregiver_id))
  return dates.some((d) => {
    const care = blocksOn(mine, skips, d)
    if (!care.length) return false
    const wd = isoWeekday(d)
    const sessions = [
      ...a.templates.filter((t) => t.weekday === wd).map((t) => ({ start: t.start, end: t.end })),
      ...a.upcoming.filter((o) => o.date === d && o.status !== 'cancelled').map((o) => ({ start: o.start, end: o.end })),
    ]
    return sessions.some((s) => {
      if (!s.start) return false
      const start = toMinutes(s.start)
      const end = s.end ? toMinutes(s.end) : start + 60
      return care.some((b) => toMinutes(b.start_time) <= start && toMinutes(b.end_time) >= end)
    })
  })
}

export const weekDates = sevenDays
