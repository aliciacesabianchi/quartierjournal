import type { IcsLabels } from '@/domain/ics'

export function icsLabels(t: (k: string) => string): IcsLabels {
  return { unconfirmed: t('activity.weeklyNote'), selectedDates: t('activity.selectedNote'), organiser: t('card.organiser'), link: t('activity.share'), endUnknown: t('activity.endUnknown') }
}

export function downloadIcs(content: string, name: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = (name.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'quartierjournal') + '.ics'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
