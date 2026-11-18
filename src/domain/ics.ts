// RFC 5545 calendar export. Recurring templates become weekly RRULE events explicitly
// marked as unconfirmed; dated sessions become single events.
import type { ActivityCard, Occurrence, TemplateSlot } from './types'
import { nextDateForWeekday, todayInZurich } from './time'

const BYDAY = ['', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1), without splitting UTF-8 sequences. */
export function fold(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let curLen = 0
  for (const ch of line) {
    const len = enc.encode(ch).length
    const limit = parts.length === 0 ? 75 : 74 // continuation lines start with a space
    if (curLen + len > limit) { parts.push(cur); cur = ''; curLen = 0 }
    cur += ch
    curLen += len
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

const dt = (date: string, time: string) => date.replace(/-/g, '') + 'T' + time.slice(0, 5).replace(':', '') + '00'
const stamp = (now: Date) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Zurich',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE',
]

export interface IcsLabels {
  unconfirmed: string    // e.g. "Usual weekly time, not confirmed for each date. Check with the organiser."
  selectedDates: string  // e.g. "Only on selected dates. Check with the organiser."
  organiser: string      // e.g. "Organiser"
  link: string           // link back to the activity page
  endUnknown?: string    // shown when the source gives no end time (the calendar needs one, so 1 h is used)
}

export interface IcsItem { activity: ActivityCard; template?: TemplateSlot; occurrence?: Occurrence }

function location(a: ActivityCard) {
  return [a.venue_name, a.address, a.district_number ? `Kreis ${a.district_number}` : null, 'Zürich'].filter(Boolean).join(', ')
}

export function buildIcs(items: IcsItem[], labels: IcsLabels, opts: { now?: Date; appUrl: string }): string {
  const now = opts.now ?? new Date()
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Quartierjournal//Pilot//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...VTIMEZONE]
  for (const { activity: a, template: t, occurrence: o } of items) {
    const slot = t ?? o
    if (!slot || !slot.start) continue // no start time known -> nothing to put in a calendar
    const date = o ? o.date : nextDateForWeekday(t!.weekday, todayInZurich(now))
    const desc: string[] = []
    if (t) desc.push(t.recurrence === 'selected_dates' ? labels.selectedDates : labels.unconfirmed)
    if (!slot.end && labels.endUnknown) desc.push(labels.endUnknown)
    if (a.organiser_url) desc.push(`${labels.organiser}: ${a.organiser_url}`)
    desc.push(`${opts.appUrl}/a/${a.id}`)
    lines.push('BEGIN:VEVENT', `UID:${slot.id}@quartierjournal`, `DTSTAMP:${stamp(now)}`,
      `DTSTART;TZID=Europe/Zurich:${dt(date, slot.start)}`)
    if (slot.end) lines.push(`DTEND;TZID=Europe/Zurich:${dt(date, slot.end)}`)
    else lines.push('DURATION:PT1H')
    if (t && t.recurrence === 'weekly') lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[t.weekday]}`)
    lines.push(`SUMMARY:${escapeText(a.title)}`, `LOCATION:${escapeText(location(a))}`, `DESCRIPTION:${escapeText(desc.join('\n'))}`)
    if (t) lines.push('STATUS:TENTATIVE')
    if (a.organiser_url) lines.push(`URL:${a.organiser_url}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Google Calendar "add event" link for one slot. */
export function googleCalendarUrl(item: IcsItem, labels: IcsLabels, opts: { now?: Date; appUrl: string }): string | null {
  const { activity: a, template: t, occurrence: o } = item
  const slot = t ?? o
  if (!slot?.start) return null
  const date = o ? o.date : nextDateForWeekday(t!.weekday, todayInZurich(opts.now ?? new Date()))
  const end = slot.end ?? `${String(Number(slot.start.slice(0, 2)) + 1).padStart(2, '0')}${slot.start.slice(2)}`
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: a.title,
    dates: `${dt(date, slot.start)}/${dt(date, end)}`,
    ctz: 'Europe/Zurich',
    location: location(a),
    details: [t ? (t.recurrence === 'selected_dates' ? labels.selectedDates : labels.unconfirmed) : '', !slot.end ? (labels.endUnknown ?? '') : '', `${opts.appUrl}/a/${a.id}`].filter(Boolean).join('\n'),
  })
  if (t?.recurrence === 'weekly') p.set('recur', `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[t.weekday]}`)
  return `https://calendar.google.com/calendar/render?${p}`
}
