<script setup lang="ts">
import { MAINS, classify, subsOf, type Main } from '@/domain/taxonomy'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCatalogue } from '@/stores/catalogue'
import { useAuth } from '@/stores/auth'
import { useMe } from '@/stores/me'
import { emptyFilters, fitsFreeTime, isEnded, isVerified, matches, mixCategories, sortCards, type DiscoverFilters } from '@/domain/filters'
import { todayInZurich } from '@/domain/time'
import type { Weekday } from '@/domain/types'
import { useFormat } from '@/composables/useFormat'
import ActivityTile from '@/components/ActivityTile.vue'
import PlaceList from '@/components/PlaceList.vue'

const cat = useCatalogue()
const auth = useAuth()
const me = useMe()
const route = useRoute()
const router = useRouter()
const f = useFormat()

const AGES = [6, 12, 24, 36, 48, 60] // months; label as "under 1", "1 year", …
const PAGE = 12

// ── filters <-> URL query (shareable, survives reload) ──
function fromQuery(): DiscoverFilters & { fit: boolean } {
  const q = route.query
  const num = (v: unknown) => (v == null || v === '' ? null : Number(v))
  return {
    ...emptyFilters(),
    q: String(q.q ?? ''),
    districts: String(q.k ?? '').split(',').filter(Boolean).map(Number),
    weekday: num(q.d) as Weekday | null,
    timeOfDay: (q.t === 'am' || q.t === 'pm' ? q.t : null),
    childAgeMonths: num(q.age),
    categories: String(q.c ?? '').split(',').filter(Boolean),
    subcategories: String(q.sc ?? '').split(',').filter(Boolean),
    freeOnly: q.free === '1',
    noRegistration: q.noreg === '1',
    forCaregiver: (q.for === 'caregiver' || q.for === 'child' ? q.for : 'all'),
    favouritesOnly: q.fav === '1',
    fit: q.fit === '1',
    scope: q.scope === 'v' ? 'verified' : 'all',
    when: (q.w === 'today' || q.w === 'week' || q.w === 'month' ? q.w : 'any'),
    includeUnknownAge: q.uage === '1',
    includeUnknownKreis: q.ukreis === '1',
  }
}
const s = reactive(fromQuery())
const filtersOpen = ref(false)
const limit = ref(PAGE)

watch(s, () => {
  limit.value = PAGE
  const q: Record<string, string> = {}
  if (s.q) q.q = s.q
  if (s.districts.length) q.k = s.districts.join(',')
  if (s.weekday) q.d = String(s.weekday)
  if (s.timeOfDay) q.t = s.timeOfDay
  if (s.childAgeMonths != null) q.age = String(s.childAgeMonths)
  if (s.categories.length) q.c = s.categories.join(',')
  if (s.subcategories.length) q.sc = s.subcategories.join(',')
  if (s.freeOnly) q.free = '1'
  if (s.noRegistration) q.noreg = '1'
  if (s.forCaregiver !== 'all') q.for = s.forCaregiver
  if (s.favouritesOnly) q.fav = '1'
  if (s.fit) q.fit = '1'
  if (s.scope === 'verified') q.scope = 'v'
  if (s.when !== 'any') q.w = s.when
  if (s.includeUnknownAge) q.uage = '1'
  if (s.includeUnknownKreis) q.ukreis = '1'
  router.replace({ query: q })
}, { deep: true })

onMounted(() => cat.load())

const extraCount = computed(() =>
  [s.districts.length > 0, s.timeOfDay, s.childAgeMonths != null, s.freeOnly, s.noRegistration,
    s.forCaregiver !== 'all', s.favouritesOnly, s.fit, s.when !== 'any'].filter(Boolean).length)

const hasSchedule = computed(() => me.blocks.some((b) => me.selfIds.has(b.caregiver_id)))

const today = todayInZurich()
const live = computed(() => cat.cards.filter((a) => !isEnded(a, today)))
const verifiedCount = computed(() => live.value.filter(isVerified).length)

const results = computed(() => {
  const out = cat.cards.filter((a) => matches(a, s, me.favourites, today))
  const fitted = s.fit && hasSchedule.value ? out.filter((a) => fitsFreeTime(a, me.blocks, me.selfIds)) : out
  const sorted = sortCards(fitted)
  return s.categories.length === 1 || s.subcategories.length ? sorted : mixCategories(sorted)
})
// entries that a filter hides only because a detail is unknown: say so, and offer to show them
const hiddenNoKreis = computed(() => (s.districts.length && !s.includeUnknownKreis
  ? cat.cards.filter((a) => a.district_number == null && matches(a, { ...s, includeUnknownKreis: true }, me.favourites, today)).length : 0))
const hiddenNoAge = computed(() => (s.childAgeMonths != null && !s.includeUnknownAge
  ? cat.cards.filter((a) => matches(a, { ...s, includeUnknownAge: true }, me.favourites, today)).length - results.value.length : 0))

// category panel (collapsed by default): several categories can be selected; counts reflect all other filters
const catsOpen = ref(s.categories.length > 0)
const forCounts = computed(() => cat.cards.filter((a) => matches(a, { ...s, categories: [], subcategories: [] }, me.favourites, today)))
const mainCounts = computed(() => {
  const m = new Map<string, number>()
  for (const a of forCounts.value) { const c = classify(a); if (c) m.set(c.main, (m.get(c.main) ?? 0) + 1) }
  return m
})
const subCounts = computed(() => {
  const m = new Map<string, number>()
  for (const a of forCounts.value) { const c = classify(a); if (c?.sub && s.categories.includes(c.main)) m.set(c.sub, (m.get(c.sub) ?? 0) + 1) }
  return m
})
const shownMains = computed(() => MAINS.filter((m) => (mainCounts.value.get(m) ?? 0) > 0 || s.categories.includes(m)))
const subsFor = (m: string) => subsOf(m as Main).filter((x) => (subCounts.value.get(x) ?? 0) > 0)
function toggleMain(m: string) {
  if (s.categories.includes(m)) {
    s.categories = s.categories.filter((x) => x !== m)
    s.subcategories = s.subcategories.filter((x) => !subsOf(m as Main).includes(x))
  } else s.categories = [...s.categories, m]
}
const toggleSub = (x: string) => { s.subcategories = s.subcategories.includes(x) ? s.subcategories.filter((y) => y !== x) : [...s.subcategories, x] }
function clearCats() { s.categories = []; s.subcategories = [] }

function toggleDistrict(n: number) {
  s.districts = s.districts.includes(n) ? s.districts.filter((x) => x !== n) : [...s.districts, n].sort((a, b) => a - b)
}
function clear() {
  Object.assign(s, { ...emptyFilters(), q: s.q, fit: false })
}
const ageLabel = (m: number) => (m < 12 ? 'discover.ageMonths' : null)
</script>

<template>
  <main id="main" class="wrap">
    <div>
      <h1>{{ $t('discover.title') }}</h1>
      <p class="lead" style="margin-top: 12px">{{ $t('discover.sub') }}</p>
    </div>

    <div class="row">
      <label class="sr-only" for="q">{{ $t('discover.search') }}</label>
      <input id="q" v-model.trim="s.q" type="search" class="input pill" :placeholder="$t('discover.search')" style="flex: 1 1 260px; max-width: 560px" />
      <button class="btn" :aria-expanded="catsOpen" aria-controls="cats" @click="catsOpen = !catsOpen">
        {{ $t('discover.category') }}
        <span v-if="s.categories.length" class="count">{{ s.categories.length }}</span>
      </button>
      <button class="btn" :aria-expanded="filtersOpen" aria-controls="filters" @click="filtersOpen = !filtersOpen">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>
        {{ $t('discover.filters') }}
        <span v-if="extraCount" class="count">{{ extraCount }}</span>
      </button>
    </div>

    <div class="chips days" role="group" :aria-label="$t('activity.schedule')">
      <button v-for="d in [1, 2, 3, 4, 5, 6, 7] as Weekday[]" :key="d" class="chip" :aria-pressed="s.weekday === d" @click="s.weekday = s.weekday === d ? null : d">
        {{ f.day(d) }}
      </button>
    </div>

    <div class="chips scope" role="group" :aria-label="$t('ui.disc.scopeAll')">
      <button class="chip" :aria-pressed="s.scope === 'all'" @click="s.scope = 'all'">{{ $t('ui.disc.scopeAll') }} ({{ live.length }})</button>
      <button class="chip" :aria-pressed="s.scope === 'verified'" @click="s.scope = 'verified'">{{ $t('ui.disc.scopeVerified') }} ({{ verifiedCount }})</button>
    </div>

    <section v-show="catsOpen" id="cats" class="panel stack">
      <div class="chips" role="group" :aria-label="$t('discover.category')">
        <button class="chip" :aria-pressed="!s.categories.length" @click="clearCats">{{ $t('discover.allCategories') }}</button>
        <button v-for="m in shownMains" :key="m" class="chip" :aria-pressed="s.categories.includes(m)" @click="toggleMain(m)">{{ $t(`tax.main.${m}`) }} ({{ mainCounts.get(m) ?? 0 }})</button>
      </div>
      <template v-for="m in s.categories" :key="m">
        <div v-if="subsFor(m).length" class="chips subs" role="group" :aria-label="$t(`tax.main.${m}`)">
          <span class="tiny muted">{{ $t(`tax.main.${m}`) }}:</span>
          <button v-for="x in subsFor(m)" :key="x" class="chip small" :aria-pressed="s.subcategories.includes(x)" @click="toggleSub(x)">{{ $t(`tax.sub.${x}`) }} ({{ subCounts.get(x) ?? 0 }})</button>
        </div>
      </template>
    </section>

    <section v-show="filtersOpen" id="filters" class="panel stack">
      <fieldset class="kreise">
        <legend class="small" style="font-weight: 500">{{ $t('discover.chooseKreis') }}</legend>
        <div class="chips">
          <button class="chip" :aria-pressed="!s.districts.length" @click="s.districts = []">{{ $t('discover.allKreise') }}</button>
          <button v-for="n in 12" :key="n" class="chip" :aria-pressed="s.districts.includes(n)" @click="toggleDistrict(n)">{{ n }}</button>
        </div>
      </fieldset>
      <div class="filters">
        <label class="field"><span>{{ $t('ui.disc.when') }}</span>
          <select v-model="s.when" class="input">
            <option value="any">{{ $t('ui.disc.whenAny') }}</option>
            <option value="today">{{ $t('ui.disc.whenToday') }}</option>
            <option value="week">{{ $t('ui.disc.whenWeek') }}</option>
            <option value="month">{{ $t('ui.disc.whenMonth') }}</option>
          </select>
        </label>
        <label class="field"><span>{{ $t('discover.age') }}</span>
          <select v-model="s.childAgeMonths" class="input">
            <option :value="null">{{ $t('discover.ageAny') }}</option>
            <option v-for="m in AGES" :key="m" :value="m">{{ ageLabel(m) ? $t('discover.ageMonths') : $t('discover.ageYears', m / 12) }}</option>
          </select>
        </label>
        <label class="field"><span>{{ $t('discover.time') }}</span>
          <select v-model="s.timeOfDay" class="input">
            <option :value="null">{{ $t('discover.anyTime') }}</option>
            <option value="am">{{ $t('discover.am') }}</option>
            <option value="pm">{{ $t('discover.pm') }}</option>
          </select>
        </label>
        <label class="field"><span>{{ $t('discover.audience') }}</span>
          <select v-model="s.forCaregiver" class="input">
            <option value="all">{{ $t('discover.audAll') }}</option>
            <option value="child">{{ $t('discover.audChild') }}</option>
            <option value="caregiver">{{ $t('discover.audCaregiver') }}</option>
          </select>
        </label>
      </div>
      <p class="tiny muted" style="margin: 0">{{ $t('discover.careHelp') }}</p>
      <div class="chips">
        <button class="chip" :aria-pressed="s.freeOnly" @click="s.freeOnly = !s.freeOnly">{{ $t('discover.free') }}</button>
        <button class="chip" :aria-pressed="s.noRegistration" @click="s.noRegistration = !s.noRegistration">{{ $t('discover.noReg') }}</button>
        <button class="chip" :aria-pressed="s.includeUnknownKreis" @click="s.includeUnknownKreis = !s.includeUnknownKreis">{{ $t('ui.disc.unknownKreis') }}</button>
        <button class="chip" :aria-pressed="s.includeUnknownAge" @click="s.includeUnknownAge = !s.includeUnknownAge">{{ $t('ui.disc.unknownAge') }}</button>
        <button v-if="auth.loggedIn" class="chip" :aria-pressed="s.favouritesOnly" @click="s.favouritesOnly = !s.favouritesOnly">♥ {{ $t('discover.favs') }}</button>
        <button v-if="auth.loggedIn" class="chip" :aria-pressed="s.fit" :disabled="!hasSchedule" @click="s.fit = !s.fit">{{ $t('discover.fit') }}</button>
      </div>
      <p v-if="auth.loggedIn && !hasSchedule" class="tiny muted" style="margin: 0">
        <RouterLink :to="{ name: 'week' }">{{ $t('discover.fitNeedsSchedule') }}</RouterLink>
      </p>
      <div><button class="linkbtn small" @click="clear">{{ $t('discover.clear') }}</button></div>
    </section>

    <hr class="rule" />

    <div v-if="cat.status === 'unconfigured'" class="notice error" role="alert">{{ $t('config.missing') }}</div>
    <div v-else-if="cat.status === 'error'" class="notice error" role="alert">
      {{ $t('common.error') }} <button class="linkbtn" @click="cat.load(true)">{{ $t('common.retry') }}</button>
    </div>
    <p v-else-if="cat.status === 'loading' || cat.status === 'idle'" aria-live="polite">{{ $t('common.loading') }}</p>
    <template v-else>
      <p class="small" aria-live="polite" style="margin: 0">{{ $t('discover.results', results.length) }}</p>
      <p v-if="hiddenNoKreis" class="small hint">{{ $t('ui.disc.hiddenKreis', { n: hiddenNoKreis }) }} <button class="linkbtn" @click="s.includeUnknownKreis = true">{{ $t('ui.disc.showThem') }}</button></p>
      <p v-if="hiddenNoAge > 0" class="small hint">{{ $t('ui.disc.hiddenAge', { n: hiddenNoAge }) }} <button class="linkbtn" @click="s.includeUnknownAge = true">{{ $t('ui.disc.showThem') }}</button></p>
      <div class="grid-cards">
        <ActivityTile v-for="a in results.slice(0, limit)" :key="a.id" :a="a" />
      </div>
      <p v-if="!results.length">{{ $t('discover.none') }}</p>
      <div v-if="results.length > limit" class="more"><button class="btn" @click="limit += PAGE">{{ $t('ui.moreCount', { n: results.length - limit }) }}</button></div>
      <PlaceList />
      <p class="tiny muted">{{ $t('ui.disc.attribution') }} <a href="https://chreis.plus" target="_blank" rel="noopener">{{ $t('ui.disc.chreisLink') }}</a></p>
    </template>
  </main>
</template>

<style scoped>
.count { background: var(--magenta); color: #fff; border-radius: var(--pill); min-width: 22px; padding: 1px 7px; font-size: 13px; }
.filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 12px; }
fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.chip:disabled { opacity: .5; cursor: not-allowed; }
.days .chip { min-width: 58px; }
.more { display: flex; justify-content: center; }
.hint { margin: 0; color: var(--magenta-ink); }
</style>
