import { describe, expect, it } from 'vitest'
import { themeFor } from './themes'
const t = (title: string, image_url: string | null = null) => themeFor({ title, image_url })?.id ?? null
describe('themeFor', () => {
  it('matches titles and never overrides a provider image', () => {
    expect(t('Adventskonzert')).toBe('concerts')
    expect(t('Eltern-Kind-Singen')).toBe('singing')
    expect(t('Basteln im Quartier')).toBe('crafts')
    expect(t('Kinderyoga')).toBe('movement')
    expect(t('Spielplatz Bäckeranlage')).toBe('playground')
    expect(t('Geselliges Quartiermittagessen')).toBe('cafe')
    expect(t('Weihnachtsmarkt')).toBe('festive')
    expect(t('Babyschwimmen')).toBe('movement')
    expect(t('Kinderzirkus')).toBe('movement')
    expect(t('Mukiturnen')).toBe('movement')
    expect(t('Jass Turnier')).toBeNull()
    expect(t('Basteln', 'https://x.ch/a.jpg')).toBeNull()
    expect(t('Handy- & Laptop-Support')).toBeNull()
  })
})
