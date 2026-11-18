// One set of categories for the whole app. Each entry gets a category from its own category field (our researched entries)
// or, for the others, from its title. The same category drives the Discover filter and the fallback tile for entries
// without an image of their own: a flat colour with a short translated label (ui.theme.<id>). First match wins; no match → neutral placeholder.
import type { ActivityCard } from './types'

export type Category = 'baby' | 'playgroup' | 'play' | 'music' | 'movement' | 'creative' | 'culture' | 'festive' | 'learning' | 'health' | 'meetup'
export interface Theme { id: string; group: Category; bg: string; fg: string; re: RegExp }

const DARK = '#1b1b1b'
export const THEMES: Theme[] = [
  { id: 'concerts', group: 'music', bg: '#8667a5', fg: '#ffffff', re: /konzert|concert|jazz|open mic|konzärt/i },
  { id: 'singing', group: 'music', bg: '#5ec4e6', fg: DARK, re: /\bsing|singt|singen|chor\b|lieder|chinderlied/i },
  { id: 'music', group: 'music', bg: '#d0317a', fg: '#ffffff', re: /musik|musig|music|orchester|sistema|trommel|rhythm|instrument|\bband|bluegrass|\bjam\b|disco|carols|\bdj\b|folk|rock\b|klassik|chorprobe/i },
  { id: 'crafts', group: 'creative', bg: '#fdce4c', fg: DARK, re: /basteln|bastel|malen|malatelier|mal-atelier|kreativ|zeichn|kerze|verzieren|glitzer|hex[ei]n?h[uü]+s|kunsthandwerk|werkstatt|nähen|handarbeit|backen|kochen|töpfer|keramik|guetzle|grittibänz|einmachen|gestaltung/i },
  { id: 'movement', group: 'movement', bg: '#f28c3c', fg: DARK, re: /yoga|pilates|zumba|turnen|turnverein|gymnastik|akrobat|zirkus|circus|bewegung|\bmove\b|tanz|dance|schwimm|badi\b|hallenbad|aqua|fitness|sport|trampolin|ballett|judo|karate|klettern|boulder|fussball|fussbal|handball|eislauf|schlittschuh|glatteis|velo|skate|rollschuh/i },
  { id: 'playground', group: 'play', bg: '#52b86c', fg: DARK, re: /spielplatz|indoor|spielhaus/i },
  { id: 'baby', group: 'baby', bg: '#f4a9c4', fg: DARK, re: /baby|babies|krabbel|säugling|kleinkind|eltern-?kind|elterntreff|stillen|geburt|hebamme|schwangersch/i },
  { id: 'playgroup', group: 'playgroup', bg: '#7fa8e8', fg: DARK, re: /spielgruppe|\bkita\b|kindergarten|kinderhort|krippe|chinderhüeti|hütedienst|kinderbetreuung/i },
  { id: 'play', group: 'play', bg: '#a9d96c', fg: DARK, re: /spielen|spielnachmittag|spielraum|spielzimmer|\bspiel\b|puzzle|lego|gloggespiel|open play/i },
  { id: 'stories', group: 'culture', bg: '#2fa5a0', fg: DARK, re: /theater|bilderbuch|geschichte|vorlesen|märli|märchen|kino|film|lesung|bibliothek|ludothek/i },
  { id: 'culture', group: 'culture', bg: '#3b4a8c', fg: '#ffffff', re: /ausstellung|vernissage|museum|führung|kunst|galerie|fotograf|stadtrundgang|rundgang|finissage|art friday|ausstellig|lesen|impro|show\b/i },
  { id: 'festive', group: 'festive', bg: '#d9473f', fg: '#ffffff', re: /advent|weihnacht|christmas|samichlaus|chlaus|märt|markt|baumfeier|laternen|fest\b|fasnacht|ostern|gottesdienst|feier|fäscht|\bfest|christbaum|silvester|neujahr|jahresanfang|1\. august|anstossen|public viewing|bundesrat/i },
  { id: 'health', group: 'health', bg: '#9bd6c8', fg: DARK, re: /gesundheit|beratung|sprechstunde|selbstverteidigung|gewalt|trauer|therapie|achtsamkeit|meditation|massage|warzen|pflege|sucht|psych|stille\b/i },
  { id: 'learning', group: 'learning', bg: '#34495e', fg: '#ffffff', re: /workshop|kurs\b|kurse|lernraum|vortrag|information|einführung|berufswahl|schulsystem|lehre|sprach|deutsch|digital|3d-|handy|laptop|philosophie|podium|diskussion|\btalk\b|welcome|willkommen|evento|dobrodošlice|bildung|infoabend|infoanlass|\binfo\b|informazion|schule|schüler|berufe|\bberuf|coiffeur|detailhandel|\bbbf\b|fachtagung|chatgpt|migrat|begrüssung|prävention|gleichstellung|sprechen|lernen|erfahrungsfeld/i },
  { id: 'cafe', group: 'meetup', bg: '#fcf8e8', fg: DARK, re: /café|cafe|kafi|kaffee|treff|stammtisch|mittagessen|lunch|quartier|znüni|zmittag|quatschen|raclette|brunch|zmorge|frühstück|club|party|abend|frauen|männer|generalversammlung|nachbar|garten|senior|alter\b|tausch|flohmi|repair|\bbar\b|quiz|geniessen|genies|essen|apéro|aperitif|begegnung|together|gemeinsam|stand-up|comedy|jass|familientisch|spiel(e)?abend|stolze|zusammen/i },
]

const GROUPS = new Set<string>(THEMES.map((t) => t.group))

export function themeFor(a: Pick<ActivityCard, 'title' | 'image_url'>): Theme | null {
  if (a.image_url) return null
  return THEMES.find((t) => t.re.test(a.title)) ?? null
}

/** The category used by the Discover filter: our own category if the entry has one, otherwise derived from the title. */
export function categoryOf(a: Pick<ActivityCard, 'title' | 'category'>): Category | null {
  if (a.category && GROUPS.has(a.category)) return a.category as Category
  return THEMES.find((t) => t.re.test(a.title))?.group ?? null
}
