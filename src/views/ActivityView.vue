<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCatalogue } from '@/stores/catalogue'
import { useAuth } from '@/stores/auth'
import { useMe } from '@/stores/me'
import { supabase, appUrl } from '@/lib/supabase'
import { useFormat } from '@/composables/useFormat'
import { buildIcs, googleCalendarUrl, type IcsItem } from '@/domain/ics'
import { todayInZurich } from '@/domain/time'
import { downloadIcs, icsLabels } from '@/lib/calendar'
import { tileFor } from '@/domain/taxonomy'
import SceneArt from '@/components/SceneArt.vue'
import type { ActivityCard } from '@/domain/types'
import ShareBox from '@/components/ShareBox.vue'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const cat = useCatalogue()
const auth = useAuth()
const me = useMe()
const f = useFormat()

const preview = ref<ActivityCard | null>(null)
const a = computed(() => cat.byId(props.id) ?? preview.value ?? undefined)
const sources = ref<{ role: string; url: string; host: string | null }[]>([])
const imgOk = ref(true)
const theme = computed(() => (a.value ? tileFor(a.value) : null))
const busy = ref<string | null>(null)
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)

onMounted(async () => {
  await cat.load()
  if (!a.value && auth.isAdmin) preview.value = await cat.fetchOne(props.id)
  if (!supabase || !a.value) return
  const { data } = await supabase.from('source_links').select('role, sources(url, host)').eq('activity_id', props.id)
  sources.value = (data ?? []).map((r: any) => ({ role: r.role, url: r.sources.url, host: r.sources.host }))
})

const today = todayInZurich()
const dated = computed(() => a.value?.upcoming.filter((o) => o.date >= today && o.status !== 'cancelled') ?? [])
const showAllDates = ref(false)
const datedShown = computed(() => (showAllDates.value ? dated.value : dated.value.slice(0, 8)))
const fromFeed = computed(() => a.value?.verification !== 'provider_verified')
const place = computed(() => a.value?.venue_name || a.value?.location_text || '')
const link = (role: string) => sources.value.filter((s) => s.role === role)

const labels = computed(() => icsLabels(t))
function itemsAll(): IcsItem[] {
  if (!a.value) return []
  return [...a.value.templates.map((tp) => ({ activity: a.value!, template: tp })), ...dated.value.map((o) => ({ activity: a.value!, occurrence: o }))]
}
const hasTimes = computed(() => itemsAll().some((i) => (i.template ?? i.occurrence)?.start))
function gcal(item: IcsItem) { return googleCalendarUrl(item, labels.value, { appUrl: appUrl() }) }
function exportIcs() { downloadIcs(buildIcs(itemsAll(), labels.value, { appUrl: appUrl() }), a.value!.title) }

async function add(item: { template_id?: string; occurrence_id?: string }) {
  if (!a.value) return
  busy.value = item.template_id ?? item.occurrence_id ?? null
  message.value = null
  try {
    await me.addToPlan({ activity_id: a.value.id, ...item })
    message.value = { kind: 'ok', text: t('activity.planNote') }
  } catch (e) {
    message.value = { kind: 'error', text: t('auth.errors.generic', { msg: (e as Error).message }) }
  } finally { busy.value = null }
}
</script>

<template>
  <main id="main" class="wrap">
    <RouterLink :to="{ name: 'discover' }" class="small">← {{ $t('activity.back') }}</RouterLink>

    <p v-if="cat.status === 'loading' || cat.status === 'idle'">{{ $t('common.loading') }}</p>
    <div v-else-if="cat.status === 'unconfigured'" class="notice error">{{ $t('config.missing') }}</div>
    <p v-else-if="!a" class="notice">{{ $t('activity.notFound') }}</p>

    <article v-else class="detail">
      <div class="hero card">
        <img v-if="a.image_url && imgOk" :src="a.image_url" alt="" referrerpolicy="no-referrer" class="heroimg" @error="imgOk = false" />
        <div v-else-if="theme" class="theme" :style="{ background: theme.bg, color: theme.fg }"><span>{{ $t(theme.labelKey) }}</span></div>
        <SceneArt v-else :seed="a.id" :label="$t('card.noImage')" />
        <a v-if="a.image_url && imgOk" :href="a.image_source_url || a.image_url" target="_blank" rel="noopener noreferrer" class="credit">{{ $t('ui.tile.image', { host: a.image_credit || '' }) }}</a>
      </div>
      <div class="main stack">
        <div class="row">
          <span v-if="a.status && a.status !== 'published'" class="badge example">{{ a.status }}</span>
          <span class="badge" :class="a.verification === 'provider_verified' ? 'ok' : 'warn'">{{ $t(`card.verification.${a.verification}`) }}</span>
          <span class="small muted">{{ a.last_checked_on ? $t(a.data_origin === 'feed:chreis' ? 'ui.lastSeen' : 'activity.lastChecked', { date: f.date(a.last_checked_on, { day: 'numeric', month: 'long', year: 'numeric' }) }) : $t('activity.neverChecked') }}</span>
        </div>
        <h1 class="title">{{ a.title }}</h1>
        <p class="lead">{{ place || $t('ui.tile.noPlace') }}<template v-if="a.district_number"> · {{ f.kreis(a.district_number) }}</template></p>
        <p v-if="a.district_basis" class="tiny muted" style="margin: -6px 0 0">{{ $t(a.district_basis === 'postal_code' ? 'ui.tile.kreisDerived' : a.district_basis === 'street' ? 'ui.tile.kreisStreet' : a.district_basis === 'address' ? 'ui.tile.kreisAddress' : 'ui.tile.kreisArea') }}</p>
        <div v-if="fromFeed" class="notice" role="note">{{ $t('ui.feedInfo') }}</div>

        <section class="stack">
          <h2 class="h">{{ $t('activity.schedule') }}</h2>
          <template v-if="a.templates.length">
            <h3 class="small strong">{{ $t('activity.weekly') }}</h3>
            <ul class="slots">
              <li v-for="tp in a.templates" :key="tp.id">
                <span>
                  <strong>{{ f.day(tp.weekday, 'long') }}</strong> · {{ f.time(tp.start, tp.end) }}
                  <span v-if="tp.recurrence === 'selected_dates'" class="badge warn">{{ $t('week.selected') }}</span>
                  <span v-if="tp.note" class="small muted"><br />{{ tp.note }}</span>
                </span>
                <span class="row">
                  <a v-if="gcal({ activity: a, template: tp })" :href="gcal({ activity: a, template: tp })!" target="_blank" rel="noopener" class="small">{{ $t('activity.googleCal') }}</a>
                  <button v-if="auth.loggedIn" class="btn small" :class="me.inPlan(tp.id) ? 'on' : 'primary'" :disabled="me.inPlan(tp.id) || busy === tp.id" @click="add({ template_id: tp.id })">
                    {{ me.inPlan(tp.id) ? $t('activity.inPlan') : $t('activity.addSlot') }}
                  </button>
                </span>
              </li>
            </ul>
            <p class="tiny muted">{{ a.templates.some((x) => x.recurrence === 'selected_dates') ? $t('activity.selectedNote') : $t('activity.weeklyNote') }}</p>
          </template>
          <template v-if="dated.length">
            <h3 class="small strong">{{ $t('activity.upcoming') }}</h3>
            <ul class="slots">
              <li v-for="o in datedShown" :key="o.id">
                <span><strong>{{ f.date(o.date) }}</strong> · {{ f.time(o.start, o.end) }}</span>
                <span class="row">
                  <a v-if="gcal({ activity: a, occurrence: o })" :href="gcal({ activity: a, occurrence: o })!" target="_blank" rel="noopener" class="small">{{ $t('activity.googleCal') }}</a>
                  <button v-if="auth.loggedIn" class="btn small" :class="me.inPlan(o.id) ? 'on' : 'primary'" :disabled="me.inPlan(o.id) || busy === o.id" @click="add({ occurrence_id: o.id })">
                    {{ me.inPlan(o.id) ? $t('activity.inPlan') : $t('activity.addDate') }}
                  </button>
                </span>
              </li>
            </ul>
          </template>
          <button v-if="dated.length > 8" class="linkbtn small" @click="showAllDates = !showAllDates">{{ showAllDates ? $t('ui.fewerDates') : $t('ui.allDates', { n: dated.length }) }}</button>
          <p v-if="!a.templates.length && !dated.length">{{ $t('card.noUpcoming') }}</p>
          <p v-else-if="!hasTimes" class="small">{{ $t('activity.noTimes') }}</p>
          <div v-if="message" class="notice" :class="message.kind" role="status">{{ message.text }}</div>
          <p v-if="!auth.loggedIn" class="small"><RouterLink :to="{ name: 'login', query: { next: `/a/${a.id}` } }">{{ $t('activity.loginToPlan') }}</RouterLink></p>
          <div v-if="hasTimes"><button class="btn small" @click="exportIcs">{{ $t('activity.exportIcs') }}</button></div>
        </section>

        <dl class="facts">
          <dt>{{ $t('activity.ages') }}</dt><dd>{{ f.age(a) }}</dd>
          <dt>{{ $t('activity.price') }}</dt><dd>{{ f.price(a) }}</dd>
          <dt>{{ $t('activity.registration') }}</dt><dd>{{ $t(`card.reg.${a.registration}`) }}<span v-if="a.registration_text && a.registration_text.toLowerCase() !== 'unknown'" class="muted"> ({{ a.registration_text }})</span></dd>
          <template v-if="a.schedule_notes"><dt>{{ $t('activity.notes') }}</dt><dd>{{ a.schedule_notes }}</dd></template>
          <dt>{{ $t('activity.where') }}</dt><dd>{{ [a.venue_name || a.location_text, a.address, a.quartier, f.kreis(a.district_number)].filter(Boolean).join(', ') || $t('ui.tile.noPlace') }}</dd>
        </dl>
        <p class="tiny muted">{{ $t('activity.contentLanguage') }}</p>

        <section class="stack">
          <h2 class="h">{{ $t('activity.sources') }}</h2>
          <ul class="links">
            <li v-for="s in link('organiser')" :key="s.url"><a :href="s.url" target="_blank" rel="noopener">{{ $t('activity.organiserPage') }} ({{ s.host }}) ↗</a></li>
 <li v-for="s in link('listing')" :key="s.url"><a :href="s.url" target="_blank" rel="noopener">{{ $t('ui.tile.source') }} ({{ s.host }}) ↗</a></li>
            <li v-for="s in link('booking')" :key="s.url"><a :href="s.url" target="_blank" rel="noopener">{{ $t('activity.booking') }} ({{ s.host }}) ↗</a></li>
            <li v-for="s in [...link('evidence'), ...link('discovery')]" :key="s.url" class="small muted">{{ $t('activity.foundVia') }}: <a :href="s.url" target="_blank" rel="noopener">{{ s.host }}</a></li>
          </ul>
        </section>

        <p v-if="a.data_origin === 'feed:chreis'" class="tiny muted">{{ $t('ui.disc.attribution') }} <a href="https://chreis.plus" target="_blank" rel="noopener">{{ $t('ui.disc.chreisLink') }}</a></p>
        <ShareBox :title="a.title" :url="`${appUrl()}/a/${a.id}`" />
      </div>
    </article>
  </main>
</template>

<style scoped>
.detail { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: clamp(20px, 4vw, 48px); align-items: start; }
.hero { aspect-ratio: 10 / 7; position: sticky; top: 16px; overflow: hidden; }
.theme { height: 100%; display: flex; align-items: flex-end; padding: clamp(14px, 3vw, 28px); font-size: clamp(30px, 5vw, 52px); font-weight: 700; line-height: 1.02; letter-spacing: -.01em; }
.heroimg { width: 100%; height: 100%; object-fit: cover; display: block; }
.credit { position: absolute; left: 10px; bottom: 10px; background: rgba(255,255,255,.9); border-radius: var(--pill); padding: 3px 10px; font-size: 12px; color: var(--ink); }
.title { font-size: clamp(34px, 6vw, 60px); }
.h { font-size: 24px; font-weight: 400; }
.strong { font-weight: 500; margin: 0; }
.slots { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.slots li { display: flex; justify-content: space-between; align-items: center; gap: 8px 16px; flex-wrap: wrap; padding: 10px 0; border-bottom: 1px solid var(--line); }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: 8px 20px; margin: 0; }
.facts dt { font-weight: 500; }
.facts dd { margin: 0; }
.links { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
@media (max-width: 760px) {
  .detail { grid-template-columns: 1fr; }
  .hero { position: static; aspect-ratio: auto; height: 180px; }
  .facts { grid-template-columns: 1fr; gap: 2px; }
  .facts dd { margin-bottom: 10px; }
}
</style>
