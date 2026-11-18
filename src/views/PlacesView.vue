<script setup lang="ts">
// Directory of places across Zürich, read page by page from the database (the list has hundreds of entries).
import { onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useFormat } from '@/composables/useFormat'
import type { Place } from '@/stores/catalogue'

const { t } = useI18n()
const f = useFormat()
const route = useRoute()
const router = useRouter()
const PAGE = 24

const s = reactive({
  q: String(route.query.q ?? ''),
  kreis: route.query.k ? Number(route.query.k) : null as number | null,
  onlyConfirmed: route.query.conf === '1',
})
const items = ref<Place[]>([])
const total = ref(0)
const loading = ref(false)
const failed = ref(false)

async function fetchPage(from: number) {
  if (!supabase) return
  loading.value = true
  failed.value = false
  let q = supabase.from('place_cards').select('*', { count: 'exact' })
  if (s.kreis) q = q.eq('district_number', s.kreis)
  if (s.onlyConfirmed) q = q.eq('verification', 'provider_verified')
  const term = s.q.trim().replace(/[%,()]/g, ' ')
  if (term) q = q.or(`name.ilike.%${term}%,address.ilike.%${term}%,quartier.ilike.%${term}%`)
  const { data, count, error } = await q.order('activity_count', { ascending: false }).order('name').range(from, from + PAGE - 1)
  loading.value = false
  if (error) { failed.value = true; return }
  items.value = from === 0 ? (data as Place[]) : [...items.value, ...(data as Place[])]
  total.value = count ?? 0
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(s, () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const query: Record<string, string> = {}
    if (s.q) query.q = s.q
    if (s.kreis) query.k = String(s.kreis)
    if (s.onlyConfirmed) query.conf = '1'
    router.replace({ query })
    void fetchPage(0)
  }, 250)
}, { deep: true })
onMounted(() => fetchPage(0))

const mapUrl = (p: Place) => `https://www.openstreetmap.org/search?query=${encodeURIComponent([p.name, p.address, 'Zürich'].filter(Boolean).join(', '))}`
</script>

<template>
  <main id="main" class="wrap">
    <div>
      <h1>{{ $t('ui.places.title') }}</h1>
      <p class="lead" style="margin-top: 12px">{{ $t('ui.placesPage.sub') }}</p>
    </div>

    <div class="row">
      <label class="sr-only" for="pq">{{ $t('ui.placesPage.search') }}</label>
      <input id="pq" v-model.trim="s.q" type="search" class="input pill" :placeholder="$t('ui.placesPage.search')" style="flex: 1 1 260px; max-width: 560px" />
      <button class="chip" :aria-pressed="s.onlyConfirmed" @click="s.onlyConfirmed = !s.onlyConfirmed">{{ $t('ui.placesPage.onlyConfirmed') }}</button>
    </div>
    <div class="chips" role="group" :aria-label="$t('discover.chooseKreis')">
      <button class="chip" :aria-pressed="s.kreis === null" @click="s.kreis = null">{{ $t('discover.allKreise') }}</button>
      <button v-for="n in 12" :key="n" class="chip" :aria-pressed="s.kreis === n" @click="s.kreis = s.kreis === n ? null : n">{{ n }}</button>
    </div>
    <hr class="rule" />

    <div v-if="!supabase" class="notice error">{{ $t('config.missing') }}</div>
    <div v-else-if="failed" class="notice error" role="alert">{{ $t('common.error') }} <button class="linkbtn" @click="fetchPage(0)">{{ $t('common.retry') }}</button></div>
    <template v-else>
      <p class="small" aria-live="polite" style="margin: 0">{{ $t('ui.placesPage.count', total) }}</p>
      <ul class="grid">
        <li v-for="p in items" :key="p.id" class="place">
          <strong>{{ p.name }}</strong>
          <span class="small muted">{{ [p.kind, f.kreis(p.district_number), p.quartier].filter(Boolean).join(' · ') }}</span>
          <span v-if="p.address" class="small">{{ p.address }}</span>
          <span v-if="p.features" class="tiny muted">{{ p.features }}</span>
          <span v-if="p.verification !== 'provider_verified'" class="badge warn">{{ $t('ui.placesPage.viaChreis') }}</span>
          <span class="row small">
            <RouterLink v-if="p.activity_count" :to="{ name: 'discover', query: { q: p.name } }">{{ $t('ui.placesPage.offers', { n: p.activity_count }) }} →</RouterLink>
            <a v-if="p.web_url" :href="p.web_url" target="_blank" rel="noopener">{{ $t('ui.tile.source') }} ↗</a>
            <a :href="mapUrl(p)" target="_blank" rel="noopener">{{ $t('ui.places.map') }}</a>
          </span>
        </li>
      </ul>
      <p v-if="!loading && !items.length">{{ $t('ui.placesPage.none') }}</p>
      <div v-if="items.length < total" class="more"><button class="btn" :disabled="loading" @click="fetchPage(items.length)">{{ $t('ui.placesPage.more') }} ({{ total - items.length }})</button></div>
      <p class="tiny muted">{{ $t('ui.disc.attribution') }} <a href="https://chreis.plus" target="_blank" rel="noopener">{{ $t('ui.disc.chreisLink') }}</a></p>
    </template>
  </main>
</template>

<style scoped>
.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 16px; }
.place { border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.place strong { font-weight: 400; font-size: 18px; }
.more { display: flex; justify-content: center; }
</style>
