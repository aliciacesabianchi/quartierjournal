<script setup lang="ts">
// Add / change / delete a care time like in a calendar app: repeat options, and for repeating times the question
// "this event, this and following events, or all events?".
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/useFormat'
import { hhmm, isoWeekday, toMinutes } from '@/domain/time'
import { isSeries, planCreate, planDelete, planEdit, type Op, type Repeat, type RepeatKind, type Scope } from '@/domain/series'
import type { CareBlock, Caregiver, Weekday } from '@/domain/types'

const props = defineProps<{ caregivers: (Caregiver & { is_self?: boolean })[] }>()
const emit = defineEmits<{ apply: [ops: Op[]] }>()
const { t } = useI18n()
const f = useFormat()
const dlg = ref<HTMLDialogElement | null>(null)
const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]

const form = reactive({ who: '', date: '', from: '08:00', to: '12:00', kind: 'none' as RepeatKind, days: [] as Weekday[], ends: false, until: '' })
const block = ref<CareBlock | null>(null)   // the series/one-off being changed
const occDate = ref('')                     // the date of the occurrence that was tapped
const step = ref<'form' | 'scope'>('form')
const pending = ref<'save' | 'delete'>('save')
const scope = ref<Scope>('this')
const error = ref<string | null>(null)

const wdName = computed(() => (form.date ? f.day(isoWeekday(form.date), 'long') : ''))
const editingSeries = computed(() => !!block.value && isSeries(block.value))
const title = computed(() => (block.value ? t('soc.careEdit') : t('soc.careNew')))

function pad(n: number) { return String(n).padStart(2, '0') }
const addMinutes = (hm: string, n: number) => { const m = Math.min(23 * 60 + 45, toMinutes(hm) + n); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}` }

/** New care time starting at a tapped date/time. */
function openNew(o: { date: string; from?: string; who?: string }) {
  block.value = null; occDate.value = o.date
  const from = o.from ?? '08:00'
  Object.assign(form, { who: o.who ?? (props.caregivers.find((c) => c.is_self) ?? props.caregivers[0])?.id ?? '', date: o.date, from, to: o.from ? addMinutes(from, 60) : '12:00', kind: 'none', days: [], ends: false, until: '' })
  step.value = 'form'; error.value = null; dlg.value?.showModal()
}
/** Existing care time, tapped on a given date. */
function openBlock(b: CareBlock, date: string) {
  block.value = b; occDate.value = date
  const kind: RepeatKind = b.on_date ? 'none' : (b.interval_weeks ?? 1) > 1 ? 'biweekly' : 'weekly'
  Object.assign(form, { who: b.caregiver_id, date, from: hhmm(b.start_time) ?? '08:00', to: hhmm(b.end_time) ?? '12:00', kind, days: [], ends: !!b.valid_until, until: b.valid_until ?? '' })
  step.value = 'form'; error.value = null; dlg.value?.showModal()
}
defineExpose({ openNew, openBlock })

function repeat(): Repeat { return { kind: form.kind, days: form.days, until: form.kind !== 'none' && form.ends && form.until ? form.until : null } }
const fields = () => ({ caregiver_id: form.who, date: form.date, start_time: form.from, end_time: form.to })
function toggleDay(d: Weekday) { form.days = form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d] }

function valid(): boolean {
  if (!form.who || !form.date || !form.from || !form.to || toMinutes(form.to) <= toMinutes(form.from)) { error.value = t('week.invalidTime'); return false }
  if (form.kind !== 'none' && form.ends && (!form.until || form.until < form.date)) { error.value = t('soc.untilBefore'); return false }
  return true
}
function finish(ops: Op[]) { emit('apply', ops); dlg.value?.close() }
function save() {
  error.value = null
  if (!valid()) return
  if (!block.value) return finish(planCreate(fields(), repeat()))
  if (!editingSeries.value) return finish(planEdit(block.value, occDate.value, 'all', fields(), repeat()))
  pending.value = 'save'; scope.value = 'this'; step.value = 'scope'
}
function remove() {
  if (!block.value) return
  if (!editingSeries.value) return finish(planDelete(block.value, occDate.value, 'all'))
  pending.value = 'delete'; scope.value = 'this'; step.value = 'scope'
}
function confirmScope() {
  if (!block.value) return
  finish(pending.value === 'delete' ? planDelete(block.value, occDate.value, scope.value) : planEdit(block.value, occDate.value, scope.value, fields(), repeat()))
}
</script>

<template>
  <dialog ref="dlg" class="dlg" aria-labelledby="cd-h">
    <form v-if="step === 'form'" class="stack" @submit.prevent="save">
      <h2 id="cd-h" class="h">{{ title }}</h2>
      <label class="field"><span>{{ $t('week.who') }}</span>
        <select v-model="form.who" class="input"><option v-for="c in caregivers" :key="c.id" :value="c.id">{{ c.label }}</option></select>
      </label>
      <label class="field"><span>{{ $t('soc.evDate') }}</span><input v-model="form.date" type="date" class="input" required /></label>
      <div class="two">
        <label class="field"><span>{{ $t('week.from') }}</span><input v-model="form.from" type="time" step="900" class="input" required /></label>
        <label class="field"><span>{{ $t('week.to') }}</span><input v-model="form.to" type="time" step="900" class="input" required /></label>
      </div>
      <label class="field"><span>{{ $t('soc.recTitle') }}</span>
        <select v-model="form.kind" class="input">
          <option value="none">{{ $t('soc.rep_none') }}</option>
          <option value="weekly">{{ $t('soc.rep_weekly', { day: wdName }) }}</option>
          <option value="biweekly">{{ $t('soc.rep_biweekly', { day: wdName }) }}</option>
          <option value="weekdays">{{ $t('soc.rep_weekdays') }}</option>
          <option value="custom">{{ $t('soc.rep_custom') }}</option>
        </select>
      </label>
      <div v-if="form.kind === 'custom'" class="days" role="group" :aria-label="$t('soc.rep_custom')">
        <button v-for="d in DAYS" :key="d" type="button" class="chip small" :aria-pressed="form.days.includes(d)" @click="toggleDay(d)">{{ f.day(d) }}</button>
      </div>
      <div v-if="form.kind !== 'none'" class="ends">
        <label class="chk"><input v-model="form.ends" type="checkbox" /> {{ $t('soc.repEnds') }}</label>
        <input v-if="form.ends" v-model="form.until" type="date" class="input" :min="form.date" :aria-label="$t('soc.repEnds')" />
      </div>
      <p v-if="editingSeries" class="tiny muted" style="margin: 0">{{ $t('soc.scopeNote') }}</p>
      <div v-if="error" class="notice error" role="alert">{{ error }}</div>
      <div class="row">
        <button class="btn primary" type="submit">{{ $t('ui.week.saveBlock') }}</button>
        <button class="btn" type="button" @click="dlg?.close()">{{ $t('common.cancel') }}</button>
        <button v-if="block" class="btn" type="button" style="border-color: var(--danger); color: var(--danger)" @click="remove">{{ $t('ui.week.deleteBlock') }}</button>
      </div>
    </form>

    <form v-else class="stack" @submit.prevent="confirmScope">
      <h2 id="cd-h" class="h">{{ pending === 'delete' ? $t('soc.scopeDelete') : $t('soc.scopeEdit') }}</h2>
      <fieldset class="rec">
        <label><input v-model="scope" type="radio" value="this" /> {{ $t('soc.scopeThis') }}</label>
        <label><input v-model="scope" type="radio" value="following" /> {{ $t('soc.scopeFollowing') }}</label>
        <label><input v-model="scope" type="radio" value="all" /> {{ $t('soc.scopeAll') }}</label>
      </fieldset>
      <div class="row">
        <button class="btn primary" type="submit">{{ $t('soc.ok') }}</button>
        <button class="btn" type="button" @click="step = 'form'">{{ $t('common.back') }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.h { font-size: 26px; font-weight: 400; }
.dlg { border: 1px solid var(--ink); border-radius: 22px; padding: 24px; width: min(92vw, 460px); }
.dlg::backdrop { background: rgba(29, 29, 27, .45); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.days { display: flex; gap: 6px; flex-wrap: wrap; }
.ends { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.chk { display: flex; gap: 8px; align-items: center; cursor: pointer; }
.rec { border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; display: grid; gap: 10px; }
.rec label { display: flex; gap: 8px; align-items: baseline; cursor: pointer; }
</style>
