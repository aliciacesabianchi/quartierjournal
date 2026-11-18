<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { ActivityCard } from '@/domain/types'
import { useFormat } from '@/composables/useFormat'
import { useAuth } from '@/stores/auth'
import { useMe } from '@/stores/me'
import { appUrl } from '@/lib/supabase'
import { shareText, whatsappUrl } from '@/domain/share'
import { todayInZurich } from '@/domain/time'
import { tileFor } from '@/domain/taxonomy'

const props = defineProps<{ a: ActivityCard }>()
const { t } = useI18n()
const f = useFormat()
const auth = useAuth()
const me = useMe()
const router = useRouter()
const busy = ref(false)
const failed = ref<string | null>(null)

const when = computed(() => f.templateSummary(props.a.templates) ?? f.nextDate(props.a))
const confirmed = computed(() => props.a.verification === 'provider_verified')
const moreDates = computed(() => (props.a.templates.length ? 0 : Math.max(0, props.a.upcoming.length - 1)))
const place = computed(() => props.a.venue_name || props.a.location_text)
const sourceUrl = computed(() => props.a.organiser_url || props.a.listing_url)
const imgOk = ref(true)
const theme = computed(() => tileFor(props.a))
const fromChreis = computed(() => props.a.data_origin === 'feed:chreis')
const fav = computed(() => me.favourites.has(props.a.id))
const planned = computed(() => me.plan.some((p) => p.activity_id === props.a.id))
const link = computed(() => `${appUrl()}/a/${props.a.id}`)

/** Slots a user could plan: every weekly template and every listed future date. */
const slots = computed(() => {
  const today = todayInZurich()
  return [
    ...props.a.templates.map((x) => ({ template_id: x.id })),
    ...props.a.upcoming.filter((o) => o.date >= today && o.status !== 'cancelled').map((o) => ({ occurrence_id: o.id })),
  ]
})

async function addToPlan() {
  failed.value = null
  if (!auth.loggedIn) return router.push({ name: 'login', query: { next: `/a/${props.a.id}` } })
  if (planned.value || slots.value.length !== 1) return router.push({ name: 'activity', params: { id: props.a.id } })
  busy.value = true
  try { await me.addToPlan({ activity_id: props.a.id, ...slots.value[0]! }) }
  catch (e) { failed.value = t('auth.errors.generic', { msg: (e as Error).message }) }
  finally { busy.value = false }
}

async function share() {
  const text = shareText(props.a.title, link.value, t('activity.shareIntro'))
  if ('share' in navigator) { try { await navigator.share({ title: props.a.title, text: t('activity.shareIntro'), url: link.value }); return } catch { return } }
  window.open(whatsappUrl(text), '_blank', 'noopener')
}
</script>

<template>
  <article class="tile">
    <div class="ph" aria-hidden="false">
      <img v-if="a.image_url && imgOk" :src="a.image_url" alt="" loading="lazy" referrerpolicy="no-referrer" class="pic" @error="imgOk = false" />
      <div v-else-if="theme" class="theme" :style="{ background: theme.bg, color: theme.fg }"><span>{{ $t(theme.labelKey) }}</span></div>
      <span v-if="!confirmed" class="flag">{{ fromChreis ? $t('ui.tile.unconfirmed') : $t('ui.tile.notChecked') }}</span>
      <span v-if="a.image_url && imgOk" class="credit">{{ $t('ui.tile.image', { host: a.image_credit || '' }) }}</span>
      <svg v-if="!(a.image_url && imgOk) && !theme" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-5 4 4 3-3 4 4"/></svg>
      <span v-if="!(a.image_url && imgOk) && !theme">{{ a.title }}</span>
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
        <span>{{ when || $t('card.noUpcoming') }}<template v-if="moreDates"> · {{ $t('ui.tile.moreDates', { n: moreDates }) }}</template></span>
      </div>
      <div class="meta">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>
        <span>{{ place || $t('ui.tile.noPlace') }}<template v-if="a.district_number">, {{ f.kreis(a.district_number) }}</template></span>
      </div>
      <div class="small">{{ f.price(a) }} · {{ f.age(a) }}</div>
      <div v-if="a.schedule_notes" class="tiny muted note">{{ a.schedule_notes }}</div>
      <div class="small reg">
        <span>{{ $t(`card.reg.${a.registration}`) }}</span>
        <template v-if="sourceUrl"> · <a :href="sourceUrl" target="_blank" rel="noopener">{{ a.organiser_url ? $t('card.organiser') : $t('ui.tile.source') }}</a></template>
      </div>
      <div class="foot">
        <button class="btn small" :class="planned ? 'on' : 'primary'" :disabled="busy" @click="addToPlan">
          {{ planned ? $t('card.inPlan') : (auth.loggedIn && slots.length > 1 ? $t('ui.tileAdd') : $t('card.addToPlan')) }}
        </button>
        <button class="btn small" @click="share">{{ $t('activity.share') }}</button>
      </div>
      <p v-if="failed" class="tiny err" role="alert">{{ failed }}</p>
    </div>
  </article>
</template>

<style scoped>
.tile { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 20px; overflow: hidden; background: #fff; }
.ph { position: relative; height: 170px; background: #e8e6e1; border-bottom: 1px dashed #cfcac2; color: #6b6963; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 0 16px; text-align: center; font-size: 13px; }
.ph span { overflow-wrap: anywhere; }
.pic { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.credit { position: absolute; left: 8px; bottom: 8px; background: rgba(255,255,255,.88); border-radius: var(--pill); padding: 2px 8px; font-size: 11px; color: var(--ink); }
.theme { position: absolute; inset: 0; display: flex; align-items: flex-end; padding: 14px 16px; text-align: left; font-size: 28px; font-weight: 700; line-height: 1.02; letter-spacing: -.01em; }
.theme span { overflow-wrap: anywhere; }
.flag { z-index: 1; position: absolute; left: 12px; top: 12px; max-width: calc(100% - 70px); background: #fff; border-radius: var(--pill); padding: 4px 10px; font-size: 12px; color: var(--ink); text-align: left; }
.fav { z-index: 1; position: absolute; right: 12px; top: 12px; width: 38px; height: 38px; border-radius: 50%; border: 0; background: #fff; color: var(--ink); font-size: 19px; cursor: pointer; line-height: 1; }
.fav[aria-pressed='true'] { color: var(--magenta-ink); }
.body { padding: 16px; display: flex; flex-direction: column; gap: 7px; flex: 1; }
h3 { font-size: 22px; line-height: 1.15; font-weight: 400; }
.title { text-decoration: none; }
.title:hover { text-decoration: underline; }
.meta { display: flex; gap: 8px; align-items: flex-start; font-weight: 300; font-size: 14px; }
.meta svg { flex: none; margin-top: 3px; }
.small { font-weight: 300; }
.note { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.reg { margin-top: auto; padding-top: 10px; }
.reg a { color: var(--ink); }
.foot { display: flex; gap: 8px; align-items: center; padding-top: 6px; flex-wrap: wrap; }
.foot .btn.primary { flex: 1 1 auto; }
.err { color: var(--danger); margin: 0; }
</style>
