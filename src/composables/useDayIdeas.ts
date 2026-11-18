import { computed } from 'vue'
import { useCatalogue } from '@/stores/catalogue'
import { activitySlots } from '@/domain/filters'
import { addDays, isoWeekday, toMinutes, todayInZurich } from '@/domain/time'
import type { ActivityCard } from '@/domain/types'

/**
 * "Today in Zürich" on the home page. Honest by construction:
 *  - a dated session counts for that exact date;
 *  - a weekly template counts as "usually on this weekday" (the UI says so; it is not a confirmed session);
 *  - offers that only run on selected dates are never shown as weekly.
 * Falls back to tomorrow, then to the next listed dated sessions.
 */
export function useDayIdeas(limit = 3, confirmedOnly = true) {
  const cat = useCatalogue()
  // The home page is for families: show organiser-confirmed entries (feed entries are not checked for suitability).
  const pool = () => (confirmedOnly ? cat.cards.filter((c) => c.verification === 'provider_verified') : cat.cards)
  return computed<{ key: 'onToday' | 'onTomorrow' | 'onNext'; cards: ActivityCard[] }>(() => {
    const today = todayInZurich()
    const startOn = (a: ActivityCard, date: string): number | null => {
      const wd = isoWeekday(date)
      const hits = [
        ...a.upcoming.filter((o) => o.date === date && o.status !== 'cancelled').map((o) => o.start),
        ...a.templates.filter((tp) => tp.weekday === wd && tp.recurrence === 'weekly').map((tp) => tp.start),
      ]
      if (!hits.length) return null
      const times = hits.filter(Boolean).map((h) => toMinutes(h!))
      return times.length ? Math.min(...times) : 24 * 60
    }
    const forDate = (date: string) =>
      pool().map((a) => ({ a, s: startOn(a, date) })).filter((x) => x.s !== null).sort((x, y) => x.s! - y.s!).map((x) => x.a)
    const t0 = forDate(today)
    if (t0.length) return { key: 'onToday', cards: t0.slice(0, limit) }
    const t1 = forDate(addDays(today, 1))
    if (t1.length) return { key: 'onTomorrow', cards: t1.slice(0, limit) }
    const next = pool()
      .map((a) => ({ a, d: a.upcoming.find((o) => o.date >= today && o.status !== 'cancelled')?.date }))
      .filter((x) => x.d).sort((x, y) => x.d!.localeCompare(y.d!)).map((x) => x.a)
    return { key: 'onNext', cards: (next.length ? next : pool().filter((a) => activitySlots(a).length)).slice(0, limit) }
  })
}
