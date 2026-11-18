<script setup lang="ts">
// Home for a logged-in family. Everything shown comes from their own plan / care times; nothing is made up.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/stores/auth'
import { useMe } from '@/stores/me'
import { useCatalogue } from '@/stores/catalogue'
import { useFormat } from '@/composables/useFormat'
import { useDayIdeas } from '@/composables/useDayIdeas'
import { addDays, hhmm, isoWeekday, nextDateForWeekday, toMinutes, todayInZurich } from '@/domain/time'
import ActivityTile from './ActivityTile.vue'

const { t } = useI18n()
const auth = useAuth()
const me = useMe()
const cat = useCatalogue()
const f = useFormat()
onMounted(() => cat.load())

const today = todayInZurich()
const wd = isoWeekday(today)
const name = computed(() => me.profile?.display_name?.trim() || '')

interface Entry { id: string; activityId: string; title: string; venue: string | null; kreis: number | null; date: string; start: string | null; end: string | null; usual: boolean; url: string | null }
const entries = computed<Entry[]>(() => {
  const out: Entry[] = []
  for (const p of me.plan) {
    const a = cat.byId(p.activity_id)
    if (!a) continue
    const base = { id: p.id, activityId: a.id, title: a.title, venue: a.venue_name, kreis: a.district_number, url: a.organiser_url }
    const tp = a.templates.find((x) => x.id === p.template_id)
    const oc = a.upcoming.find((x) => x.id === p.occurrence_id)
    if (tp) {
      const date = tp.weekday === wd ? today : nextDateForWeekday(tp.weekday, addDays(today, 1))
      out.push({ ...base, date, start: tp.start, end: tp.end, usual: true })
    } else if (oc && oc.date >= today) out.push({ ...base, date: oc.date, start: oc.start, end: oc.end, usual: false })
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || toMinutes(x.start ?? '23:59') - toMinutes(y.start ?? '23:59'))
})
const todayEntries = computed(() => entries.value.filter((e) => e.date === today))
const nextEntries = computed(() => entries.value.filter((e) => e.date > today).slice(0, 3))

const careToday = computed(() => me.blocks
  .filter((b) => b.weekday === wd)
  .sort((a, b) => a.start_time.localeCompare(b.start_time))
  .map((b) => ({ id: b.id, text: `${hhmm(b.start_time)}–${hhmm(b.end_time)} ${me.caregivers.find((c) => c.id === b.caregiver_id)?.label ?? ''}`, color: me.caregivers.find((c) => c.id === b.caregiver_id)?.color ?? '#eee' })))

const ideas = useDayIdeas()
const dateLine = computed(() => f.date(today, { weekday: 'long', day: 'numeric', month: 'long' }))
</script>

<template>
  <main id="main" class="wrap member">
    <header>
      <h1>{{ name ? t('ui.home.hello', { name }) : t('ui.home.helloNoName') }}</h1>
      <p class="lead">{{ dateLine }}</p>
    </header>

    <section class="stack" aria-labelledby="today-h">
      <h2 id="today-h">{{ t('ui.home.today') }}</h2>
      <div v-if="careToday.length" class="pills" :aria-label="t('ui.home.careToday')">
        <span v-for="c in careToday" :key="c.id" class="pill" :style="{ background: c.color }">{{ c.text }}</span>
      </div>
      <p v-else class="muted small">{{ t('ui.home.noCare') }} <RouterLink :to="{ name: 'week' }">{{ t('ui.home.setUp') }}</RouterLink></p>

      <article v-for="e in todayEntries" :key="e.id" class="entry">
        <h3><RouterLink :to="{ name: 'activity', params: { id: e.activityId } }">{{ e.title }}</RouterLink></h3>
        <p>{{ f.time(e.start, e.end) }} · {{ e.venue }}<template v-if="e.kreis">, {{ f.kreis(e.kreis) }}</template></p>
        <p v-if="e.usual" class="small usual">{{ $t('activity.weeklyNote') }}</p>
        <div class="row">
          <RouterLink class="btn small" :to="{ name: 'activity', params: { id: e.activityId } }">{{ $t('card.details') }}</RouterLink>
          <a v-if="e.url" class="btn small" :href="e.url" target="_blank" rel="noopener">{{ $t('card.organiser') }} ↗</a>
        </div>
      </article>
      <p v-if="!todayEntries.length" class="muted">{{ t('ui.home.nothingToday') }}</p>
    </section>

    <section class="stack" aria-labelledby="next-h">
      <h2 id="next-h">{{ t('ui.home.upcoming') }}</h2>
      <ul v-if="nextEntries.length" class="next">
        <li v-for="e in nextEntries" :key="e.id">
          <RouterLink :to="{ name: 'activity', params: { id: e.activityId } }"><strong>{{ e.title }}</strong></RouterLink>
          <span class="small">{{ f.date(e.date) }} · {{ f.time(e.start, e.end) }}<template v-if="e.usual"> · {{ t('ui.week.weeklyShort') }}</template></span>
        </li>
      </ul>
      <template v-else>
        <p class="muted">{{ t('ui.home.nothingPlanned') }}</p>
        <div class="row">
          <RouterLink :to="{ name: 'week' }" class="btn primary">{{ $t('nav.week') }}</RouterLink>
          <RouterLink :to="{ name: 'discover' }" class="btn">{{ $t('nav.discover') }}</RouterLink>
        </div>
      </template>
    </section>

    <section v-if="ideas.cards.length" class="stack" aria-labelledby="ideas-h">
      <h2 id="ideas-h">{{ t('ui.home.ideasToday') }}</h2>
      <div class="grid-cards"><ActivityTile v-for="a in ideas.cards" :key="a.id" :a="a" /></div>
      <p class="small muted">{{ t('ui.home.ideasNote') }}</p>
    </section>
  </main>
</template>

<style scoped>
.member { gap: 48px; }
h1 { font-size: clamp(44px, 8vw, 88px); }
.lead { margin-top: 8px; }
h2 { font-size: clamp(28px, 4vw, 40px); }
.pills { display: flex; gap: 8px; flex-wrap: wrap; }
.pill { padding: 8px 16px; border-radius: var(--pill); font-size: 15px; }
.entry { border: 1px solid var(--ink); border-radius: 22px; padding: 20px 22px; display: flex; flex-direction: column; gap: 8px; }
.entry h3 { font-size: 26px; }
.entry h3 a { text-decoration: none; }
.entry p { margin: 0; }
.usual { color: var(--magenta-ink); }
.next { list-style: none; margin: 0; padding: 0; }
.next li { display: flex; flex-direction: column; gap: 2px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.next a { text-decoration: none; }
</style>
