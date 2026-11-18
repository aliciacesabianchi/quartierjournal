import { describe, expect, it } from 'vitest'
import { stockFor } from './stock'
describe('stockFor', () => {
  it('matches by title and never overrides a provider image', () => {
    expect(stockFor({ title: 'Kinderyoga', image_url: null })).toBe('/stock/movement.webp')
    expect(stockFor({ title: 'Spielplatz Bäckeranlage', image_url: null })).toBe('/stock/playground.webp')
    expect(stockFor({ title: 'Indoor-Spielplatz', image_url: null })).toBeNull()
    expect(stockFor({ title: 'Basteln im Quartier', image_url: null })).toBe('/stock/crafts.webp')
    expect(stockFor({ title: 'Basteln', image_url: 'https://x.ch/a.jpg' })).toBeNull()
    expect(stockFor({ title: 'Yoga für Erwachsene', image_url: null })).toBeNull()
  })
})
