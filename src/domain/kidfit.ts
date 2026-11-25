// Is this offer really for small children and their carers? The feed entries (Chreis+) are a general community calendar:
// yoga, senior cafés, evening concerts. We only recommend what shows a clear sign of being for children, and we keep the rest
// out of the way (still findable with "also show general community events").
import { classify } from './taxonomy'
import { toMinutes } from './time'
import { activitySlots } from './filters'
import type { ActivityCard } from './types'

export type KidFit = 'yes' | 'maybe' | 'no'

const KID = /\b(kind(er)?|kids?|baby|babys|babies|familie|familien|family|krabbel\w*|kleinkind\w*|spielgruppe|zwerg\w*|mini\w*|eltern-?kind|chind\w*|bilderbuch\w*|märchen|puppen\w*|kasperli|zirkus|laterne\w*|samichlaus|spielplatz|spielnachmittag|enfants?|bambini|bimbi|famille|famiglia|toddler|wiegen\w*|rhythmik|purzel\w*)/i
const ADULT = /(senior\w*|\b\d{2}\+|alterszentrum|pflege|demenz|ap[ée]ro|vernissage|finissage|generalversammlung|jahrestreffen|vernetzt|themenabend|sprach-?caf[ée]|deutsch(kurs| lernen)?|bluegrass|\bjam\b|\bclub\b|party|\bü\d\d|yoga|taiji\w*|qigong|pilates|fitness|beratung|rechtsberatung|erwachsene|frauen(treff|abend)?|männer|gottesdienst|andacht|meditation|vortrag|lesung|diskussion|stammtisch|jass|konzert|ausstellung|kunsthandwerk|kirchturm|weihnachtsfeier|neujahrsapéro)/i
const LATE_FROM = 17 * 60 + 30   // from 17:30 most families with small children are at home

/** Start times (in minutes) of everything that is listed for this offer; unknown times are left out. */
function starts(a: ActivityCard): number[] {
  return activitySlots(a).map((s) => s.start).filter((x): x is string => !!x).map(toMinutes)
}
export const isLate = (a: ActivityCard) => { const s = starts(a); return s.length > 0 && s.every((m) => m >= LATE_FROM) }

const WITHOUT_CHILD = /ohne\s+kind(er)?|kunstausflug|\bausflug\b.*(erwachsene|senior)|nur f(ü|ue)r (erwachsene|eltern|mütter|väter)/i

export function kidFit(a: ActivityCard): KidFit {
  const text = `${a.title} ${a.activity_type ?? ''}`
  if (WITHOUT_CHILD.test(text)) return 'no'                       // e.g. a mothers' evening "ohne Kind"
  const strongKid = KID.test(text) || (a.age_min_months != null && a.age_min_months <= 60) || (a.age_max_months != null && a.age_max_months <= 84)
  if (a.age_min_months != null && a.age_min_months > 84 && !KID.test(text)) return 'no'      // 7 years and up
  if (a.verification === 'provider_verified' && a.audience !== 'caregiver_with_childcare' && (strongKid || !ADULT.test(text))) return 'yes'
  if (strongKid) return 'yes'
  const main = classify(a)?.main
  if (main === 'baby' || main === 'play') return 'yes'
  if (ADULT.test(text)) return 'no'
  if (isLate(a)) return 'no'
  return 'maybe'
}
