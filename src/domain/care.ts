// Care times for a given calendar date: weekly times (unless that week is skipped, e.g. holidays) plus one-off times on that date.
import type { ActivityCard, CareBlock, Weekday } from './types'
import { addDays, isoWeekday, toMinutes } from './time'

export interface CareSkip { block_id: string; date: string }

export function blocksOn(blocks: CareBlock[], skips: CareSkip[], date: string): CareBlock[] {
  const wd = isoWeekday(date) as Weekday
  return blocks.filter((b) =>
    b.on_date ? b.on_date === date : b.weekday === wd && !skips.some((s) => s.block_id === b.id && s.date === date))
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
