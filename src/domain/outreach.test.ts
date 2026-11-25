import { describe, expect, it } from 'vitest'
import { buildEmail } from './outreach'

describe('outreach drafts', () => {
  const ctx = { name: 'GZ Buchegg', examples: ['Baby-Singen', 'Spielgruppe', 'ignored third'], link: 'https://example.test' }
  it('exists in four languages, with the name, the link and an opt-out', () => {
    for (const lang of ['de', 'en', 'fr', 'it'] as const) {
      const m = buildEmail(lang, 'ask', ctx)
      expect(m.subject.length).toBeGreaterThan(10)
      expect(m.body).toContain('GZ Buchegg'); expect(m.body).toContain('https://example.test')
      expect(m.body).toContain('Baby-Singen'); expect(m.body).not.toContain('ignored third')
      expect(m.body).not.toMatch(/CHF|Franken|francs/)   // the fee is not part of the permission request
      expect(m.body).toMatch(/Nein danke|no thanks|non merci|no grazie/)
    }
  })
  it('works without examples and has a short reminder', () => {
    expect(buildEmail('de', 'ask', { ...ctx, examples: [] }).body).toContain('Ihre Angebote aufgefallen. Ich')
    expect(buildEmail('en', 'reminder', ctx).body.length).toBeLessThan(buildEmail('en', 'ask', ctx).body.length / 3)
  })
})
