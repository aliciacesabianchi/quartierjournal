<script setup lang="ts">
import { computed } from 'vue'
import type { ActivityCard } from '@/domain/types'
import { useFormat } from '@/composables/useFormat'
import { useAuth } from '@/stores/auth'
import { useMe } from '@/stores/me'
import SceneArt from './SceneArt.vue'

const props = defineProps<{ a: ActivityCard }>()
const f = useFormat()
const auth = useAuth()
const me = useMe()
const when = computed(() => f.templateSummary(props.a.templates) ?? (f.nextDate(props.a) ? `${f.nextDate(props.a)}` : null))
const fav = computed(() => me.favourites.has(props.a.id))
const planned = computed(() => me.plan.some((p) => p.activity_id === props.a.id))
</script>

<template>
  <article class="card tile">
    <div class="img">
      <SceneArt :seed="a.id" :label="$t('card.noImage')" />
      <button
        v-if="auth.loggedIn"
        class="fav"
        :aria-pressed="fav"
        :aria-label="fav ? $t('card.favRemove') : $t('card.favAdd')"
        @click="me.toggleFavourite(a.id)"
      >{{ fav ? '♥' : '♡' }}</button>
    </div>
    <div class="body">
      <h3><RouterLink :to="{ name: 'activity', params: { id: a.id } }" class="title">{{ a.title }}</RouterLink></h3>
      <div class="meta">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
        <span>{{ when || $t('card.noUpcoming') }}</span>
      </div>
      <div class="meta">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>
        <span>{{ a.venue_name }}<template v-if="a.district_number">, {{ f.kreis(a.district_number) }}</template></span>
      </div>
      <div class="small">{{ f.price(a) }} · {{ f.age(a) }}</div>
      <div class="small muted">{{ $t(`card.reg.${a.registration}`) }}</div>
      <div class="foot">
        <RouterLink :to="{ name: 'activity', params: { id: a.id } }" class="btn small" :class="planned ? 'on' : 'primary'">
          {{ planned ? $t('card.inPlan') : $t('card.details') }}
        </RouterLink>
        <a v-if="a.organiser_url" :href="a.organiser_url" target="_blank" rel="noopener" class="small">{{ $t('card.organiser') }} ↗</a>
      </div>
    </div>
  </article>
</template>

<style scoped>
.tile { display: flex; flex-direction: column; }
.img { height: 150px; position: relative; }
.fav { position: absolute; right: 12px; top: 12px; width: 44px; height: 44px; border-radius: 50%; border: 0; background: #fff; color: var(--magenta-ink); font-size: 20px; cursor: pointer; }
.body { padding: 16px; display: flex; flex-direction: column; gap: 7px; flex: 1; }
.title { text-decoration: none; }
.title:hover { text-decoration: underline; }
.meta { display: flex; gap: 8px; align-items: flex-start; font-weight: 300; font-size: 14px; }
.meta svg { flex: none; margin-top: 3px; }
.foot { display: flex; gap: 12px; align-items: center; margin-top: auto; padding-top: 8px; }
</style>
