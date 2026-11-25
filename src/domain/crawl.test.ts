import { describe, expect, it } from 'vitest'
import { failureInterval, looksLikeIcs, nextInterval, normalizeHtml, normalizeIcs, robotsAllows, sha256 } from '../../supabase/functions/_shared/crawl'

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
})
