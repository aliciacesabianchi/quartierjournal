import { describe, expect, it } from 'vitest'
import { classify, tileFor, RULES, MAINS } from './taxonomy'
import { taxonomy } from '../i18n/taxonomy'
const c = (title: string, category: string | null = null) => { const x = classify({ title, category }); return x ? `${x.main}/${x.sub}` : null }
describe('taxonomy', () => {
  it('classifies by title', () => {
    expect(c('Eltern-Kind-Singen')).toBe('music/parentsinging')
    expect(c('Adventskonzert')).toBe('music/concerts')
    expect(c('Babyschwimmen')).toBe('movement/babyswim')
    expect(c('Kinderzirkus')).toBe('movement/circus')
    expect(c('Räbeliechtli-Umzug')).toBe('festive/lanterns')
    expect(c('Weihnachtsmarkt')).toBe('festive/advent')
    expect(c('Flohmarkt')).toBe('festive/markets')
    expect(c('Indoor-Spielplatz')).toBe('play/indoor')
    expect(c('Krabbelgruppe')).toBe('baby/crawling')
    expect(c('Geselliges Quartiermittagessen')).toBe('meetup/lunch')
    expect(c('Bilderbuchkino')).toBe('culture/picturebooks')
  })
  it('leaves Kita and registration playgroups uncategorised', () => {
    expect(c('Kita Selnau')).toBeNull()
    expect(c('Spielgruppe Regenbogen')).toBeNull()
    expect(c('Das Wissen ist da')).toBeNull()
  })
  it('keeps our own category and maps playgroup to play', () => {
    expect(c('Irgendetwas', 'playgroup')).toBe('play/null')
    expect(c('Yoga mit Kinderbetreuung', 'movement')).toBe('movement/yoga')
  })
  it('tile uses the image first, then main colour with sub label', () => {
    expect(tileFor({ title: 'Basteln', category: null, image_url: 'https://x.ch/a.jpg' })).toBeNull()
    expect(tileFor({ title: 'Basteln', category: null, image_url: null })?.labelKey).toBe('tax.sub.crafts')
  })
  it('every rule and main has a label in all four languages', () => {
    for (const l of ['de', 'en', 'it', 'fr'] as const) {
      for (const r of RULES) expect(taxonomy[l].sub[r.sub as keyof typeof taxonomy.de.sub], `${l}:${r.sub}`).toBeTruthy()
      for (const m of MAINS) expect(taxonomy[l].main[m], `${l}:${m}`).toBeTruthy()
    }
  })
})
