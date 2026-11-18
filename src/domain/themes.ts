// Fallback tile for entries without an image of their own: a flat colour with a short translated label (ui.theme.<id>).
// Matched on the title; the first match wins. No match → the neutral placeholder.
import type { ActivityCard } from './types'

export interface Theme { id: string; bg: string; fg: string; re: RegExp }

const DARK = '#1b1b1b'
export const THEMES: Theme[] = [
  { id: 'concerts', bg: '#8667a5', fg: '#ffffff', re: /konzert|concert|jazz|open mic|konzärt/i },
  { id: 'singing', bg: '#5ec4e6', fg: DARK, re: /\bsing|singt|singen|chor\b|lieder|chinderlied/i },
  { id: 'music', bg: '#d0317a', fg: '#ffffff', re: /musik|musig|music|orchester|sistema|trommel|rhythm|instrument/i },
  { id: 'crafts', bg: '#fdce4c', fg: DARK, re: /basteln|bastel|malen|malatelier|kreativ|zeichn|kerzenzieh|hex[ei]n?h[uü]+s|kunsthandwerk|werkstatt|nähen|handarbeit|backen|kochen/i },
  { id: 'movement', bg: '#f28c3c', fg: DARK, re: /yoga|pilates|zumba|turnen|turnverein|gymnastik|akrobat|zirkus|circus|bewegung|\bmove\b|tanz|dance|schwimm|badi\b|hallenbad|aqua|fitness|sport|trampolin|ballett|judo|karate|klettern|boulder|fussball|fussbal|handball|eislauf|schlittschuh|glatteis|velo|skate|rollschuh/i },
  { id: 'playground', bg: '#52b86c', fg: DARK, re: /spielplatz|indoor|spielhaus/i },
  { id: 'play', bg: '#a9d96c', fg: DARK, re: /spielgruppe|krabbel|spielen|spielnachmittag|\bspiel\b|puzzle|lego/i },
  { id: 'stories', bg: '#2fa5a0', fg: DARK, re: /theater|bilderbuch|geschichte|vorlesen|märli|märchen|kino|film|lesung|bibliothek|ludothek/i },
  { id: 'festive', bg: '#d9473f', fg: '#ffffff', re: /advent|weihnacht|christmas|samichlaus|chlaus|märt|markt|baumfeier|laternen|fest\b|fasnacht|ostern/i },
  { id: 'cafe', bg: '#fcf8e8', fg: DARK, re: /café|cafe|kafi|kaffee|treff|stammtisch|mittagessen|lunch|quartier-?insel|znüni|zmittag|quatschen|raclette|brunch|zmorge|frühstück/i },
]

export function themeFor(a: Pick<ActivityCard, 'title' | 'image_url'>): Theme | null {
  if (a.image_url) return null
  return THEMES.find((t) => t.re.test(a.title)) ?? null
}
