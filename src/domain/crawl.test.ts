import { describe, expect, it } from 'vitest'
import { FAMILY_WORDS, failureInterval, normTitle, parseIcsDate, parseIcsEvents, parseJsonLdEvents, looksLikeIcs, nextInterval, normalizeHtml, normalizeIcs, robotsAllows, sha256 } from '../../supabase/functions/_shared/crawl'

describe('source watcher helpers', () => {
  it('ignores markup, scripts and whitespace when comparing pages', async () => {
    const a = '<html><script>var x=1</script><body><p>Krabbelgruppe  Montag 9:00</p></body></html>'
    const b = '<html><script>var x=2</script><body>\n<p>Krabbelgruppe Montag 9:00</p><!-- c --></body></html>'
    expect(normalizeHtml(a)).toBe(normalizeHtml(b))
    expect(await sha256(normalizeHtml(a))).toBe(await sha256(normalizeHtml(b)))
    expect(normalizeHtml('<p>Montag 9:00</p>')).not.toBe(normalizeHtml('<p>Montag 10:00</p>'))
  })
  it('ignores per-export timestamps in calendar feeds', () => {
    const a = 'BEGIN:VEVENT\nDTSTAMP:20261101T000000Z\nSUMMARY:Singen\nEND:VEVENT'
    const b = 'BEGIN:VEVENT\nDTSTAMP:20261102T000000Z\nSUMMARY:Singen\nEND:VEVENT'
    expect(normalizeIcs(a)).toBe(normalizeIcs(b))
    expect(normalizeIcs(a)).not.toBe(normalizeIcs(b.replace('Singen', 'Turnen')))
    expect(looksLikeIcs('BEGIN:VCALENDAR\n', 'https://x.test/feed')).toBe(true)
  })
  it('respects robots.txt', () => {
    const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/open\n\nUser-agent: BadBot\nDisallow: /'
    expect(robotsAllows(robots, '/angebote')).toBe(true)
    expect(robotsAllows(robots, '/private/x')).toBe(false)
    expect(robotsAllows(robots, '/private/open/y')).toBe(true)
    expect(robotsAllows('User-agent: *\nDisallow: /', '/')).toBe(false)
    expect(robotsAllows('', '/anything')).toBe(true)
    expect(robotsAllows('User-agent: QuartierjournalBot\nDisallow: /\n\nUser-agent: *\nDisallow:', '/a')).toBe(false)
  })
  it('checks quiet sources less often and failing sources with growing pauses', () => {
    expect([0, 2, 3, 6, 9, 30].map((n) => nextInterval(7, n))).toEqual([7, 7, 14, 28, 56, 56])
    expect([1, 2, 5].map((n) => failureInterval(7, n))).toEqual([14, 28, 28])
  })

  it('reads dates from calendar feeds in Zurich time', () => {
    expect(parseIcsDate('20261201T093000')).toEqual({ date: '2026-12-01', time: '09:30' })
    expect(parseIcsDate('20261201T083000Z')).toEqual({ date: '2026-12-01', time: '09:30' })   // winter: UTC+1
    expect(parseIcsDate('20260701T083000Z')).toEqual({ date: '2026-07-01', time: '10:30' })   // summer: UTC+2
    expect(parseIcsDate('20261201')).toEqual({ date: '2026-12-01', time: null })
    expect(parseIcsDate('nonsense')).toBeNull()
  })
  it('finds events in a calendar feed (folded lines, escapes, end time)', () => {
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:abc-1', 'SUMMARY:Baby-Singen\, Kreis 6', 'DTSTART;TZID=Europe/Zurich:20261203T100000', 'DTEND;TZID=Europe/Zurich:20261203T110000',
      'LOCATION:GZ Buchegg', 'DESCRIPTION:Lieder fuer die', ' Kleinsten', 'URL:https://gz.test/singen', 'END:VEVENT', 'BEGIN:VEVENT', 'SUMMARY:', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    const ev = parseIcsEvents(ics)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ key: 'abc-1', title: 'Baby-Singen, Kreis 6', start_date: '2026-12-03', start_time: '10:00', end_time: '11:00', location_text: 'GZ Buchegg', event_url: 'https://gz.test/singen' })
    expect(ev[0]!.description).toBe('Lieder fuer dieKleinsten')
  })
  it('finds schema.org events on a provider page, nested or in a graph', () => {
    const html = '<html><script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"GZ"},{"@type":"ChildrensEvent","name":"Zwergenturnen","startDate":"2026-12-05T09:30:00+01:00","endDate":"2026-12-05T10:30:00+01:00","url":"/anlass/1","location":{"name":"Turnhalle","address":{"streetAddress":"Weg 1"}}}]}</script><script type="application/ld+json">{broken</script></html>'
    const ev = parseJsonLdEvents(html, 'https://gz.test/')
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ title: 'Zwergenturnen', start_date: '2026-12-05', start_time: '09:30', end_time: '10:30', event_url: 'https://gz.test/anlass/1', location_text: 'Turnhalle, Weg 1' })
  })
  it('recognises family words and compares titles loosely', () => {
    expect(FAMILY_WORDS.test('Kinderkonzert im Zoo')).toBe(true)
    expect(FAMILY_WORDS.test('Generalversammlung Verein')).toBe(false)
    expect(normTitle('Baby-Singen!  Kreis 6')).toBe(normTitle('baby singen kreis 6'))
  })
})
