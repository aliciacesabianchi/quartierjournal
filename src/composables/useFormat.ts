import { useI18n } from 'vue-i18n'
import type { ActivityCard, TemplateSlot, Weekday } from '@/domain/types'
import { formatDate, hhmm, todayInZurich, weekdayName } from '@/domain/time'
import { INTL_LOCALE, type Locale } from '@/i18n'

export function useFormat() {
  const { t, locale } = useI18n()
  const intl = () => INTL_LOCALE[locale.value as Locale]

  const day = (w: Weekday, width: 'long' | 'short' = 'short') => weekdayName(w, intl(), width)
  const date = (d: string, opts?: Intl.DateTimeFormatOptions) => formatDate(d, intl(), opts)
  const time = (s: string | null, e: string | null) =>
    s ? (e ? `${hhmm(s)}–${hhmm(e)}` : hhmm(s)!) : t('card.timeUnknown')

  /** "Usually Tue, Thu 09:00–11:00" or "On selected Wednesdays …" */
  function templateSummary(templates: TemplateSlot[]): string | null {
    if (!templates.length) return null
    const groups = new Map<string, Weekday[]>()
    for (const tp of templates) {
      const key = `${tp.recurrence}|${time(tp.start, tp.end)}`
      groups.set(key, [...(groups.get(key) ?? []), tp.weekday])
    }
    return [...groups.entries()].map(([key, days]) => {
      const [rec, tm] = key.split('|')
      const ds = days.sort().map((d) => day(d)).join(', ')
      return rec === 'selected_dates' ? t('card.selectedDays', { days: day(days[0]!, 'long') }) : `${t('card.usually', { days: ds })} · ${tm}`
    }).join(' / ')
  }

  function nextDate(a: ActivityCard): string | null {
    const today = todayInZurich()
    const o = a.upcoming.find((x) => x.date >= today && x.status !== 'cancelled')
    return o ? `${date(o.date)} · ${time(o.start, o.end)}` : null
  }

  function age(a: ActivityCard): string {
    return a.age_text || t('card.ageUnknown')
  }
  function price(a: ActivityCard): string {
    return a.price_text || t('card.priceUnknown')
  }
  const kreis = (n: number | null) => (n ? t('common.kreis', { n }) : '')

  return { day, date, time, templateSummary, nextDate, age, price, kreis, intl }
}
