import { describe, expect, it } from 'vitest'
import { googleCalendarUrl, buildIcs as siteIcs } from './ics'
import { buildEmail } from '../../supabase/functions/_shared/email'
import { buildIcs, googleUrl } from '../../supabase/functions/_shared/calendar'
import type { ActivityCard } from './types'

const card = { id: 'a1', title: 'Geschichtenzeit – PBZ <Altstadt> & Co', venue_name: 'PBZ Altstadt', address: 'Zähringerstrasse 17, 8001 Zürich', district_number: 1, organiser_url: 'https://www.pbz.ch/kindertreff/' }
const tpl = { id: 't1', weekday: 4, start: '10:15:00', end: null, recurrence: 'weekly' as const }
const occ = { id: 'o1', date: '2027-01-14', start: '10:00:00', end: '10:45:00', status: 'listed' }
const labels = { unconfirmed: 'U', selectedDates: 'S', organiser: 'Anbieter', endUnknown: 'E' }
const now = new Date('2026-11-18T12:00:00Z')
const app = 'https://quartierjournal.pages.dev'

describe('plan confirmation email', () => {
  it('Google link is identical to the one the website builds (weekly slot and dated session)', () => {
    for (const [t, o] of [[tpl, undefined], [undefined, occ]] as const) {
      const site = googleCalendarUrl({ activity: card as unknown as ActivityCard, template: t as never, occurrence: o as never }, { ...labels, link: 'x' }, { appUrl: app, now })
      expect(googleUrl(card, t, o, labels, app, now)).toBe(site)
    }
  })
  it('the .ics has the same event lines as the website file', () => {
    const mine = buildIcs(card, undefined, occ, labels, app, now)!
    const site = siteIcs([{ activity: card as unknown as ActivityCard, occurrence: occ as never }], { ...labels, link: 'x' }, { appUrl: app, now })
    for (const key of ['DTSTART;TZID=Europe/Zurich:20270114T100000', 'DTEND;TZID=Europe/Zurich:20270114T104500', 'UID:o1@quartierjournal']) { expect(mine).toContain(key); expect(site).toContain(key) }
  })
  it('weekly slots are described as usual, not confirmed', () => {
    const m = buildEmail({ locale: 'en', name: 'Anna', card, template: tpl, appUrl: app, contact: 'x@y.ch', now })
    expect(m.text).toContain('Usually every')
    expect(m.text).toContain('not confirmed for each date')
    expect(m.text).toContain('not a booking')
    expect(m.google).toContain('RRULE%3AFREQ%3DWEEKLY')
    expect(m.subject).toBe('In your plan: ' + card.title)
  })
  it('escapes HTML in titles and has the Google button and the attachment hint', () => {
    const m = buildEmail({ locale: 'de', name: null, card, occurrence: occ, appUrl: app, contact: null, now })
    expect(m.html).not.toContain('<Altstadt>')
    expect(m.html).toContain('&lt;Altstadt&gt;')
    expect(m.html).toContain('Zu Google Kalender hinzufügen')
    expect(m.html).toContain('.ics')
    expect(m.text).toContain('Donnerstag')
  })
  it('works in all four languages', () => {
    for (const l of ['de', 'en', 'it', 'fr'] as const) {
      const m = buildEmail({ locale: l, name: 'A', card, occurrence: occ, appUrl: app, contact: null, now })
      expect(m.subject.endsWith(card.title)).toBe(true); expect(m.html.length).toBeGreaterThan(300)
    }
  })
})
