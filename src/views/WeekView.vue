<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMe } from '@/stores/me'
import { useCatalogue } from '@/stores/catalogue'
import { useFormat } from '@/composables/useFormat'
import { fitsFreeTime, sortCards } from '@/domain/filters'
import { buildIcs, type IcsItem } from '@/domain/ics'
import { hhmm, toMinutes, todayInZurich, isoWeekday } from '@/domain/time'
import type { Weekday } from '@/domain/types'
import { downloadIcs, icsLabels } from '@/lib/calendar'
import { appUrl } from '@/lib/supabase'
import ActivityTile from '@/components/ActivityTile.vue'

const { t } = useI18n()
const me = useMe()
const cat = useCatalogue()
const f = useFormat()
const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]
const COLOURS = ['#FFD54F', '#5DCBE8', '#4DBB6F', '#8E6BAA', '#F2C9A5', '#D2357F']

onMounted(() => cat.load())

const error = ref<string | null>(null)
async function run(fn: () => Promise<unknown>) {
  error.value = null
  try { await fn() } catch (e) { error.value = t('auth.errors.generic', { msg: (e as Error).message }) }
}

// ── caregivers ──
const newCg = reactive({ label: '', color: COLOURS[1]! })
const addMe = () => run(() => me.addCaregiver(t('week.meDefault'), COLOURS[0]!, true))
const addCaregiver = () => run(async () => {
  if (!newCg.label.trim()) return
  await me.addCaregiver(newCg.label.trim(), newCg.color)
  newCg.label = ''
})
const removeCaregiver = (id: string) => {
  if (me.blocks.some((b) => b.caregiver_id === id)) { error.value = t('week.deleteCaregiverFirst'); return }
  void run(() => me.removeCaregiver(id))
}
const cgById = computed(() => new Map(me.caregivers.map((c) => [c.id, c])))

// ── blocks ──
const nb = reactive({ caregiver_id: '', weekday: 1 as Weekday, start: '08:00', end: '12:00' })
// default the 'who' select to "With me" (or the first caregiver) once caregivers are known
watch(() => me.caregivers.map((c) => c.id).join(), () => {
  if (!me.caregivers.some((c) => c.id === nb.caregiver_id)) nb.caregiver_id = (me.caregivers.find((c) => c.is_self) ?? me.caregivers[0])?.id ?? ''
}, { immediate: true })
const addBlock = () => run(async () => {
  if (toMinutes(nb.end) <= toMinutes(nb.start)) throw new Error(t('week.invalidTime'))
  await me.addBlock({ caregiver_id: nb.caregiver_id || me.caregivers[0]!.id, weekday: nb.weekday, start_time: nb.start, end_time: nb.end })
})
const blocksOn = (d: Weekday) => me.blocks.filter((b) => b.weekday === d).sort((a, b) => a.start_time.localeCompare(b.start_time))

// ── plan ──
const today = todayInZurich()
const planRows = computed(() => me.plan.map((p) => {
  const a = cat.byId(p.activity_id)
  const tp = a?.templates.find((x) => x.id === p.template_id)
  const oc = p.occurrence_id ? a?.upcoming.find((x) => x.id === p.occurrence_id) : undefined
  return { p, a, tp, oc, weekday: (tp?.weekday ?? (oc ? isoWeekday(oc.date) : null)) as Weekday | null }
}))
const planOn = (d: Weekday) => planRows.value.filter((r) => r.weekday === d)
const unplaced = computed(() => planRows.value.filter((r) => r.weekday === null))

function exportPlan() {
  const items: IcsItem[] = planRows.value.filter((r) => r.a && (r.tp || r.oc)).map((r) => ({ activity: r.a!, template: r.tp, occurrence: r.oc }))
  downloadIcs(buildIcs(items, icsLabels(t), { appUrl: appUrl() }), 'quartierjournal-plan')
}

const hasSelfBlocks = computed(() => me.blocks.some((b) => me.selfIds.has(b.caregiver_id)))
const ideas = computed(() =>
  sortCards(cat.cards.filter((a) => !me.plan.some((p) => p.activity_id === a.id) && fitsFreeTime(a, me.blocks, me.selfIds))).slice(0, 6))
</script>

<template>
  <main id="main" class="wrap">
    <div>
      <h1>{{ $t('week.title') }}</h1>
      <p class="lead" style="margin-top: 12px">{{ $t('week.sub') }}</p>
    </div>
    <div v-if="error" class="notice error" role="alert">{{ error }}</div>
    <p v-if="!me.loaded || cat.status === 'loading' || cat.status === 'idle'">{{ $t('common.loading') }}</p>

    <template v-else>
      <!-- Empty state: no fabricated people or schedules -->
      <section v-if="!me.caregivers.length" class="panel cream stack">
        <h2>{{ $t('week.emptyTitle') }}</h2>
        <p style="margin: 0">{{ $t('week.emptyBody') }}</p>
        <div><button class="btn primary" @click="addMe">{{ $t('week.addMe') }}</button></div>
      </section>

      <template v-else>
        <section class="stack">
          <h2 class="h">{{ $t('week.caregivers') }}</h2>
          <ul class="cgs">
            <li v-for="c in me.caregivers" :key="c.id" class="cg">
              <span class="dot" :style="{ background: c.color }" aria-hidden="true" />
              <span>{{ c.label }}</span>
              <button v-if="!c.is_self" class="linkbtn small" :aria-label="`${$t('common.delete')}: ${c.label}`" @click="removeCaregiver(c.id)">×</button>
            </li>
          </ul>
          <form class="row" @submit.prevent="addCaregiver">
            <label class="sr-only" for="cg-name">{{ $t('week.caregiverName') }}</label>
            <input id="cg-name" v-model="newCg.label" class="input" maxlength="40" :placeholder="$t('week.caregiverName')" style="max-width: 280px" />
            <span class="row" role="radiogroup" :aria-label="$t('week.colour')">
              <button v-for="c in COLOURS" :key="c" type="button" class="swatch" role="radio" :aria-checked="newCg.color === c" :style="{ background: c }" :aria-label="c" @click="newCg.color = c" />
            </span>
            <button class="btn small" :disabled="!newCg.label.trim()">{{ $t('week.addCaregiver') }}</button>
          </form>
        </section>

        <section class="stack">
          <h2 class="h">{{ $t('week.blocks') }}</h2>
          <form class="blockform" @submit.prevent="addBlock">
            <label class="field"><span>{{ $t('week.who') }}</span>
              <select v-model="nb.caregiver_id" class="input">
                <option v-for="c in me.caregivers" :key="c.id" :value="c.id">{{ c.label }}</option>
              </select>
            </label>
            <label class="field"><span>{{ $t('week.day') }}</span>
              <select v-model.number="nb.weekday" class="input"><option v-for="d in DAYS" :key="d" :value="d">{{ f.day(d, 'long') }}</option></select>
            </label>
            <label class="field"><span>{{ $t('week.from') }}</span><input v-model="nb.start" type="time" step="900" class="input" required /></label>
            <label class="field"><span>{{ $t('week.to') }}</span><input v-model="nb.end" type="time" step="900" class="input" required /></label>
            <button class="btn primary">{{ $t('week.addBlock') }}</button>
          </form>

          <div class="days">
            <section v-for="d in DAYS" :key="d" class="day" :class="{ today: isoWeekday(today) === d }">
              <h3 class="dayname">{{ f.day(d, 'long') }}</h3>
              <ul>
                <li v-for="b in blocksOn(d)" :key="b.id" class="blk" :style="{ background: cgById.get(b.caregiver_id)?.color }">
                  <span>{{ hhmm(b.start_time) }}–{{ hhmm(b.end_time) }} · {{ cgById.get(b.caregiver_id)?.label }}</span>
                  <button class="x" :aria-label="$t('common.delete')" @click="run(() => me.removeBlock(b.id))">×</button>
                </li>
                <li v-for="r in planOn(d)" :key="r.p.id" class="act">
                  <RouterLink v-if="r.a" :to="{ name: 'activity', params: { id: r.a.id } }">{{ r.a.title }}</RouterLink>
                  <span class="tiny">{{ f.time((r.tp ?? r.oc)?.start ?? null, (r.tp ?? r.oc)?.end ?? null) }} ·
                    {{ r.oc ? $t('week.dated', { date: f.date(r.oc.date) }) : r.tp?.recurrence === 'selected_dates' ? $t('week.selected') : $t('week.weekly') }}</span>
                </li>
              </ul>
            </section>
          </div>
        </section>
      </template>

      <section class="stack">
        <h2 class="h">{{ $t('week.plan') }}</h2>
        <p v-if="!me.plan.length" class="muted">{{ $t('week.planEmpty') }}</p>
        <ul v-else class="plan">
          <li v-for="r in [...planRows]" :key="r.p.id">
            <span>
              <strong>{{ r.a?.title ?? '—' }}</strong>
              <span class="small"> · {{ r.weekday ? f.day(r.weekday, 'long') : '' }} {{ f.time((r.tp ?? r.oc)?.start ?? null, (r.tp ?? r.oc)?.end ?? null) }}
                · {{ r.oc ? $t('week.dated', { date: f.date(r.oc.date) }) : r.tp?.recurrence === 'selected_dates' ? $t('week.selected') : $t('week.weekly') }}</span>
              <span v-if="r.oc && r.oc.date < today" class="badge">{{ $t('week.past') }}</span>
            </span>
            <button class="btn small" @click="run(() => me.removeFromPlan(r.p.id))">{{ $t('week.remove') }}</button>
          </li>
        </ul>
        <template v-if="me.plan.length">
          <div><button class="btn" @click="exportPlan">{{ $t('week.exportAll') }}</button></div>
          <p class="tiny muted" style="margin: 0">{{ $t('week.exportNote') }}</p>
        </template>
        <p v-if="unplaced.length" class="tiny muted">{{ unplaced.length }} × {{ $t('activity.notFound') }}</p>
      </section>

      <section v-if="hasSelfBlocks" class="stack">
        <h2 class="h">{{ $t('week.ideas') }}</h2>
        <div v-if="ideas.length" class="grid-cards"><ActivityTile v-for="a in ideas" :key="a.id" :a="a" /></div>
        <p v-else class="muted">{{ $t('week.noFits') }}</p>
      </section>
    </template>
  </main>
</template>

<style scoped>
.h { font-size: 26px; font-weight: 400; }
.cgs { list-style: none; padding: 0; margin: 0; display: flex; gap: 8px; flex-wrap: wrap; }
.cg { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: var(--pill); padding: 6px 12px; }
.dot { width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--ink); }
.swatch { width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--ink); cursor: pointer; }
.swatch[aria-checked='true'] { outline: 3px solid var(--ink); outline-offset: 2px; }
.blockform { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 10px; align-items: end; }
.days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.day { border: 1px solid var(--line); border-radius: 14px; padding: 10px; min-height: 120px; }
.day.today { border-color: var(--ink); }
.dayname { font-size: 15px; font-weight: 500; margin-bottom: 8px; }
.day ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.blk { border-radius: 10px; padding: 6px 8px; font-size: 13px; display: flex; justify-content: space-between; gap: 4px; align-items: flex-start; }
.x { border: 0; background: none; cursor: pointer; font-size: 16px; line-height: 1; padding: 0 2px; min-width: 24px; min-height: 24px; }
.act { border: 1px dashed var(--ink); border-radius: 10px; padding: 6px 8px; font-size: 13px; display: flex; flex-direction: column; }
.plan { list-style: none; padding: 0; margin: 0; }
.plan li { display: flex; justify-content: space-between; gap: 8px 16px; flex-wrap: wrap; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--line); }
@media (max-width: 900px) {
  .days { grid-template-columns: 1fr; }
  .day { min-height: 0; }
}
</style>
