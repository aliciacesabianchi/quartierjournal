<script setup lang="ts">
// A few organiser-confirmed places at the bottom of Discover; the full directory lives on /orte.
import { useCatalogue } from '@/stores/catalogue'
import { useFormat } from '@/composables/useFormat'
const cat = useCatalogue()
const f = useFormat()
const mapUrl = (p: { name: string; address: string | null }) =>
  `https://www.openstreetmap.org/search?query=${encodeURIComponent([p.name, p.address, 'Zürich'].filter(Boolean).join(', '))}`
</script>
<template>
  <section v-if="cat.places.length" class="places" aria-labelledby="places-h">
    <h2 id="places-h">{{ $t('ui.places.title') }}</h2>
    <p class="muted small">{{ $t('ui.places.sub') }}</p>
    <ul>
      <li v-for="p in cat.places" :key="p.id">
        <strong>{{ p.name }}</strong>
        <span class="small muted">{{ [p.kind, f.kreis(p.district_number), p.quartier].filter(Boolean).join(' · ') }}</span>
        <span v-if="p.address" class="small">{{ p.address }}</span>
        <span v-if="p.features" class="tiny muted">{{ p.features }}</span>
        <a class="small" :href="mapUrl(p)" target="_blank" rel="noopener">{{ $t('ui.places.map') }}</a>
      </li>
    </ul>
    <div><RouterLink :to="{ name: 'places' }" class="btn">{{ $t('ui.placesPage.all', { n: cat.placeTotal }) }} →</RouterLink></div>
  </section>
</template>
<style scoped>
.places { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
h2 { font-size: clamp(28px, 4vw, 40px); }
ul { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: 16px; }
li { border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
li strong { font-weight: 400; font-size: 18px; }
</style>
