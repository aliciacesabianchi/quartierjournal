// One two-level category set for the whole app (Discover filter, fallback tiles, gap report).
// An entry's category comes from its own category field (our researched entries) or from keywords in its title.
// First matching rule wins, so more specific rules come first. No match = no category ("Weitere Angebote": found under "Alle" only).
// Not categories on purpose: Kita and registration-only playgroups (they are not "go on the day" offers).
import type { ActivityCard } from './types'

export type Main = 'baby' | 'play' | 'music' | 'movement' | 'creative' | 'culture' | 'nature' | 'festive' | 'shopping' | 'parents' | 'meetup'
export const MAINS: Main[] = ['baby', 'play', 'music', 'movement', 'creative', 'culture', 'nature', 'festive', 'shopping', 'parents', 'meetup']

const DARK = '#1b1b1b'
export const COLOURS: Record<Main, { bg: string; fg: string }> = {
  baby: { bg: '#ffd54f', fg: DARK }, play: { bg: '#4dbb6f', fg: DARK }, music: { bg: '#d2357f', fg: '#ffffff' },
  movement: { bg: '#5dcbe8', fg: DARK }, creative: { bg: '#ffd54f', fg: DARK }, culture: { bg: '#8e6baa', fg: DARK },
  nature: { bg: '#4dbb6f', fg: DARK }, festive: { bg: '#d2357f', fg: '#ffffff' }, shopping: { bg: '#ffd54f', fg: DARK },
  parents: { bg: '#8e6baa', fg: DARK }, meetup: { bg: '#5dcbe8', fg: DARK },
}
/** File name of the designed tile image per main category: /labels/<lang>/<slug>.webp (made from the owner's label set). */
export const TILE_SLUG: Record<Main, string> = {
  baby: 'baby-kleinkind', play: 'spielen-spielplatz', music: 'musik-singen', movement: 'bewegung-sport', creative: 'basteln-kreatives',
  culture: 'kunst-geschichten-theater', nature: 'natur-tiere', festive: 'feste-feiern', shopping: 'shopping-secondhand',
  parents: 'eltern-betreuung', meetup: 'cafe-treff',
}

export interface Rule { main: Main; sub: string; re: RegExp }
const r = (main: Main, sub: string, re: RegExp): Rule => ({ main, sub, re })

export const RULES: Rule[] = [
  // music
  r('music', 'concerts', /konzert|concert|jazz|open mic|konzärt|bluegrass|\bband\b|folk|klassik|\bdj\b|carols/i),
  r('music', 'babysinging', /babysing|baby-?sing|baby.*sing/i),
  r('music', 'parentsinging', /eltern-?kind-?sing|mami.*sing|papi.*sing/i),
  r('music', 'singcircle', /\bsing|singt|chor\b|lieder|chinderlied|mittagssing|värsli/i),
  r('music', 'lessons', /instrumentalunterricht|musikunterricht|klavier|geige|gitarre|blockflöte/i),
  r('music', 'instruments', /instrument|trommel|xylophon|orchester|jam\b/i),
  r('music', 'rhythm', /musik|musig|music|rhythm|rhythmik|disco/i),
  // movement
  r('movement', 'babyswim', /babyschwimm|babyswim/i),
  r('movement', 'toddlerswim', /schwimm|badi\b|hallenbad|aqua/i),
  r('movement', 'parenttumble', /eltern-?kind-?turn|muki|vaki|kinderturnen|mini move|spiel und sport/i),
  r('movement', 'circus', /zirkus|circus|akrobat|jonglier/i),
  r('movement', 'climbing', /kletter|boulder/i),
  r('movement', 'martial', /judo|karate|kampfsport|taekwondo|selbstverteidigung|aikido/i),
  r('movement', 'skating', /eislauf|schlittschuh|glatteis|eisfeld/i),
  r('movement', 'rollsport', /laufrad|skate|rollschuh|roller\b|velo|trottinett/i),
  r('movement', 'yoga', /yoga|pilates/i),
  r('movement', 'dance', /tanz|dance|ballett|zumba/i),
  r('movement', 'gym', /gymnastik|turnen|turnverein|fitness|sport\b|handball|fussball|fussbal|futsal/i),
  r('movement', 'movegames', /bewegung|\bmove\b|toben|trampolin|hüpf|bewegt/i),
  // nature & animals
  r('nature', 'zoo', /\bzoo\b|tierpark/i),
  r('nature', 'farms', /bauernhof|kinderbauernhof|hofladen/i),
  r('nature', 'animals', /\btiere?\b|\bpony|\besel\b|\bziegen?\b|alpaka|papagei/i),
  r('nature', 'forest', /wald|waldspiel/i),
  r('nature', 'gardening', /gärtner|gartentag|gartenpause|gemeinschaftsgarten|urban gardening/i),
  r('nature', 'parks', /\bpark\b|parkanlage|grünanlage/i),
  r('nature', 'walks', /spazier|wander|ausflug/i),
  r('nature', 'observing', /naturbeobacht|insekt|vögel|natur\b|entdeckungstour/i),
  // creative
  r('creative', 'cooking', /kochen|backen|guetzle|grittibänz|einmachen|zmittag.*selber/i),
  r('creative', 'clay', /töpfer|keramik|\bton\b|modellier/i),
  r('creative', 'painting', /malen|mal-?atelier|zeichn|farben/i),
  r('creative', 'paper', /papier|collage|glitzerkarten|\bkarten\b|origami/i),
  r('creative', 'textile', /nähen|stricken|textil|filz|handarbeit|fadenspule|weben/i),
  r('creative', 'natmaterials', /naturmaterial|blätter|äste/i),
  r('creative', 'making', /werken|werkstatt|bauen & |gestaltung|schreinern|3d-print|upcycling/i),
  r('creative', 'crafts', /basteln|bastel|kreativ|kerze|verzieren|hex[ei]n?h[uü]+s|kunsthandwerk|bastelnachmittag/i),
  // culture
  r('culture', 'kamishibai', /kamishibai|erzähltheater/i),
  r('culture', 'puppets', /puppen|figurentheater|kasperli|marionett/i),
  r('culture', 'kidstheatre', /kindertheater|theater|impro/i),
  r('culture', 'picturebooks', /bilderbuch/i),
  r('culture', 'stories', /geschichte|vorlesen|märli|märchen|erzähl|lesung|lesen\b|schreiben|rössli|kniereim|fingerspiel/i),
  r('culture', 'libraries', /bibliothek|bücherei|\bpbz\b|bücherbus/i),
  r('culture', 'museums', /museum|ausstellung|vernissage|finissage|galerie|art friday|kunsthaus/i),
  r('culture', 'tours', /\bführung|rundgang|stadtrundgang/i),
  r('culture', 'film', /kino|film|kinimatograf/i),
  // shopping & second-hand (before festive/meetup so flea markets and swaps land here)
  r('shopping', 'ludothek', /ludothek|spielzeugausleihe|spielzeug ausleihen/i),
  r('shopping', 'repair', /repair|reparatur|reparier/i),
  r('shopping', 'booksswap', /buch-?tausch|bücherbörse|bücherflohmarkt|bücherschrank|spielzeugtausch|spielzeugbörse/i),
  r('shopping', 'clothesswap', /kleidertausch|kleiderbörse|kleiderbazar|tauschbörse|\bswap\b|tauschmarkt|kleider.*tausch/i),
  r('shopping', 'babygear', /babyartikel|babybörse|kinderwagen|babyausstattung|kinderartikel|kinderbasar|kindersachen|chinderzüg/i),
  r('shopping', 'kidsflea', /flohmi|flohmarkt|flowmarkt|trödel|brockenstube|brocki|brockenhaus/i),
  r('shopping', 'secondhand', /secondhand|second hand|second-hand|occasion|gebraucht|krims-?krams/i),
  r('shopping', 'localshops', /quartierladen|dorfladen|hofladen|bio-?laden|unverpackt|quartierkiosk/i),
  // festive
  r('festive', 'lanterns', /räbeli|laternen|lichterumzug|plan lumière/i),
  r('festive', 'samichlaus', /samichlaus|chlaus|nikolaus/i),
  r('festive', 'advent', /advent|weihnacht|christmas|christbaum|krippenspiel/i),
  r('festive', 'carnival', /fasnacht|karneval|fasnächtlich/i),
  r('festive', 'easter', /ostern|osterfest|osternest|easter/i),
  r('festive', 'summerfest', /sommerfest|sommerfäscht/i),
  r('festive', 'harvest', /erntefest|herbstfest|chilbi|ernte/i),
  r('festive', 'markets', /markt|märt|basar/i),
  r('festive', 'culturalfests', /kulturfest|1\. august|fiesta|bundesfeier|neujahr|silvester|jahresanfang|anstossen/i),
  r('festive', 'neighbourhoodfests', /quartierfest|familienfest|\bfest\b|feier|fäscht|jubiläum|party|baumfeier/i),
  // parents & childcare
  r('parents', 'feeding', /stillen|stillgruppe|beikost|ernährung/i),
  r('parents', 'sleep', /schlaf/i),
  r('parents', 'babyhealth', /babymassage|babygesundheit|massage|achtsamkeit|meditation/i),
  r('parents', 'firstaid', /erste hilfe|notfall|nothelfer/i),
  r('parents', 'counselling', /beratung|sprechstunde|familienberatung|trauer|therapie/i),
  r('parents', 'organising', /betreuung organisier|tagesfamilie|babysitt|kinderbetreuung finden/i),
  r('parents', 'withchildcare', /mit kinderbetreuung|kinderbetreuung/i),
  r('parents', 'upbringing', /erziehung|entwicklung|elternbildung|elternarbeit|pädagog|elternseminar/i),
  r('parents', 'exchange', /elternaustausch|elterntreff|elterncafé|elternrunde|mami|papi|väter|mütter|mamas/i),
  // meet-ups
  r('meetup', 'parentchildcafe', /eltern-?kind-?caf|spielcaf|play caf|krabbelcaf/i),
  r('meetup', 'languagecafe', /sprachcaf|sprachtreff|conversation|deutsch.*treff/i),
  r('meetup', 'brunch', /brunch|frühstück|zmorge/i),
  r('meetup', 'lunch', /mittagessen|lunch|zmittag|raclette|znüni|geniessen|genies|apéro|essen\b/i),
  r('meetup', 'familycafe', /familiencaf|familienkaf|family caf|kaffee.*familie/i),
  r('meetup', 'groups', /begegnung|\bclub\b|frauen|männer|senior|alter\b|zusammen|gemeinsam|together|jass/i),
  r('meetup', 'openmeet', /treff|quartier|stammtisch|nachbar|café|cafe|kafi|kaffee|abend\b|quiz|stand-up|comedy|bar\b/i),
  // play
  r('play', 'indoor', /indoor/i),
  r('play', 'playground', /spielplatz|spielhaus|spielwiese/i),
  r('play', 'building', /lego|duplo|konstruier|klötz|bauen|baustelle/i),
  r('play', 'playafternoon', /spielnachmittag|spieleabend|spielabend/i),
  r('play', 'openplay', /offener spiel|open play|spielraum|spielzimmer|gloggespiel|offene spielgruppe|spielstube/i),
  r('play', 'freeplay', /freies spiel|spielen|\bspiel\b|puzzle/i),
  // baby & toddler
  r('baby', 'crawling', /krabbel/i),
  r('baby', 'sensory', /sinnes|sensor|entdeckungs/i),
  r('baby', 'toddlers', /kleinkind/i),
  r('baby', 'babygroup', /baby|babies|säugling/i),
  r('baby', 'parentchild', /eltern-?kind|elternkind|muki|vaki/i),
]

/** Legacy category values (from our researched entries) → main category. Playgroup-style entries count as play. */
const LEGACY: Record<string, Main> = { play: 'play', baby: 'baby', playgroup: 'play', shopping: 'shopping', music: 'music', movement: 'movement', culture: 'culture', meetup: 'meetup', creative: 'creative', nature: 'nature', festive: 'festive', parents: 'parents' }

export interface Classified { main: Main; sub: string | null; rule: Rule | null }

export function classify(a: Pick<ActivityCard, 'title' | 'category'>): Classified | null {
  const own = a.category ? LEGACY[a.category] : undefined
  if (own) {
    const rule = RULES.find((x) => x.main === own && x.re.test(a.title)) ?? null
    return { main: own, sub: rule?.sub ?? null, rule }
  }
  const rule = RULES.find((x) => x.re.test(a.title))
  return rule ? { main: rule.main, sub: rule.sub, rule } : null
}

export interface Tile { main: Main; slug: string; labelKey: string; bg: string; fg: string }

/** Fallback tile for entries without an image: the designed tile of the entry's main category (label in the visitor's language). */
export function tileFor(a: Pick<ActivityCard, 'title' | 'category' | 'image_url'>): Tile | null {
  if (a.image_url) return null
  const c = classify(a)
  if (!c) return null
  return { main: c.main, slug: TILE_SLUG[c.main], labelKey: `tax.main.${c.main}`, ...COLOURS[c.main] }
}

export const subsOf = (main: Main): string[] => RULES.filter((x) => x.main === main).map((x) => x.sub)
