// Illustration photos for entries that have no image of their own. Matched by title keywords, always labelled
// "Symbolbild" in the UI. Supplied by the project owner; source and licence still to be confirmed before the official launch
// (see docs/image-register.md). To switch them off, return null from stockFor().
import type { ActivityCard } from './types'

interface Theme { id: string; src: string; re: RegExp; not?: RegExp }

const THEMES: Theme[] = [
  { id: 'crafts', src: '/stock/crafts.webp', re: /basteln|malen|malatelier|kreativ|zeichn|kerzenzieh|hex[ei]n?h[uü]+s|bastel/i },
  { id: 'movement', src: '/stock/movement.webp', re: /kinderyoga|yoga|turnen|bewegung|\bmove\b|mini-?fit/i, not: /erwachsene|senior|frauen/i },
  { id: 'playground', src: '/stock/playground.webp', re: /spielplatz/i, not: /indoor/i },
]

export function stockFor(a: Pick<ActivityCard, 'title' | 'image_url'>): string | null {
  if (a.image_url) return null
  return THEMES.find((t) => t.re.test(a.title) && !(t.not && t.not.test(a.title)))?.src ?? null
}
