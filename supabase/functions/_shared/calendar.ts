// Calendar helpers for the plan-confirmation email (Deno, no imports). Mirrors src/domain/ics.ts for ONE plan item;
// a test (src/domain/email.test.ts) checks the Google link is identical to the one the website builds.
export interface Slot { id: string; start: string | null; end: string | null }
export interface Template extends Slot { weekday: number; recurrence: 'weekly' | 'selected_dates' }
export interface Occurrence extends Slot { date: string; status: string }
export interface Card { id: string; title: string; venue_name: string | null; address: string | null; district_number: number | null; organiser_url: string | null }
export interface Labels { unconfirmed: string; selectedDates: string; organiser: string; endUnknown: string }

const BYDAY = ['', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
const dt = (date: string, time: string) => date.replace(/-/g, '') + 'T' + time.slice(0, 5).replace(':', '') + '00'
const stamp = (now: Date) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function todayInZurich(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function isoWeekday(date: string): number { const d = new Date(date + 'T12:00:00Z').getUTCDay(); return d === 0 ? 7 : d }
export function nextDateForWeekday(weekday: number, from: string): string {
  const base = new Date(from + 'T12:00:00Z')
  base.setUTCDate(base.getUTCDate() + ((weekday - isoWeekday(from) + 7) % 7))
  return base.toISOString().slice(0, 10)
}
export const location = (a: Card) => [a.venue_name, a.address, a.district_number ? `Kreis ${a.district_number}` : null, 'Zürich'].filter(Boolean).join(', ')

/** The concrete date of the slot: the session's date, or the next date of the weekly slot. */
export function slotDate(t: Template | undefined, o: Occurrence | undefined, now: Date): string {
  return o ? o.date : nextDateForWeekday(t!.weekday, todayInZurich(now))
}

export function googleUrl(a: Card, t: Template | undefined, o: Occurrence | undefined, labels: Labels, appUrl: string, now: Date): string | null {
  const slot = t ?? o
  if (!slot?.start) return null
  const date = slotDate(t, o, now)
  const end = slot.end ?? `${String(Number(slot.start.slice(0, 2)) + 1).padStart(2, '0')}${slot.start.slice(2)}`
  const p = new URLSearchParams({
    action: 'TEMPLATE', text: a.title, dates: `${dt(date, slot.start)}/${dt(date, end)}`, ctz: 'Europe/Zurich', location: location(a),
    details: [t ? (t.recurrence === 'selected_dates' ? labels.selectedDates : labels.unconfirmed) : '', !slot.end ? labels.endUnknown : '', `${appUrl}/a/${a.id}`].filter(Boolean).join('\n'),
  })
  if (t?.recurrence === 'weekly') p.set('recur', `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[t.weekday]}`)
  return `https://calendar.google.com/calendar/render?${p}`
}

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
function fold(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []; let cur = ''; let curLen = 0
  for (const ch of line) {
    const len = enc.encode(ch).length; const limit = parts.length === 0 ? 75 : 74
    if (curLen + len > limit) { parts.push(cur); cur = ''; curLen = 0 }
    cur += ch; curLen += len
  }
  parts.push(cur)
  return parts.join('\r\n ')
}
const VTIMEZONE = ['BEGIN:VTIMEZONE', 'TZID:Europe/Zurich', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT', 'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE']

export function buildIcs(a: Card, t: Template | undefined, o: Occurrence | undefined, labels: Labels, appUrl: string, now: Date): string | null {
  const slot = t ?? o
  if (!slot?.start) return null
  const date = slotDate(t, o, now)
  const desc: string[] = []
  if (t) desc.push(t.recurrence === 'selected_dates' ? labels.selectedDates : labels.unconfirmed)
  if (!slot.end) desc.push(labels.endUnknown)
  if (a.organiser_url) desc.push(`${labels.organiser}: ${a.organiser_url}`)
  desc.push(`${appUrl}/a/${a.id}`)
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Quartierjournal//Pilot//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...VTIMEZONE,
    'BEGIN:VEVENT', `UID:${slot.id}@quartierjournal`, `DTSTAMP:${stamp(now)}`, `DTSTART;TZID=Europe/Zurich:${dt(date, slot.start)}`]
  if (slot.end) lines.push(`DTEND;TZID=Europe/Zurich:${dt(date, slot.end)}`); else lines.push('DURATION:PT1H')
  if (t && t.recurrence === 'weekly') lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[t.weekday]}`)
  lines.push(`SUMMARY:${escapeText(a.title)}`, `LOCATION:${escapeText(location(a))}`, `DESCRIPTION:${escapeText(desc.join('\n'))}`)
  if (t) lines.push('STATUS:TENTATIVE')
  if (a.organiser_url) lines.push(`URL:${a.organiser_url}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
