<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMe } from '@/stores/me'
import { useCatalogue } from '@/stores/catalogue'
import { useFormat } from '@/composables/useFormat'
import { blocksOn as careOn } from '@/domain/care'
import { useSocial, type Guest } from '@/stores/social'
import ShareButtons from '@/components/ShareButtons.vue'
import { useRouter } from 'vue-router'
import { buildIcs, googleCalendarUrl, type IcsItem } from '@/domain/ics'
import { addDays, hhmm, isoWeekday, toMinutes, todayInZurich } from '@/domain/time'
import type { CareBlock, TemplateSlot, Occurrence, Weekday } from '@/domain/types'
import { downloadIcs, icsLabels } from '@/lib/calendar'
import { appUrl, supabase } from '@/lib/supabase'

const { t } = useI18n()
const me = useMe()
const social = useSocial()
const router = useRouter()
const cat = useCatalogue()
const f = useFormat()
const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]
const COLOURS = ['#FFD54F', '#5DCBE8', '#4DBB6F', '#8E6BAA', '#F2C9A5', '#D2357F']
const HOUR_PX = 44

onMounted(() => cat.load())

const error = ref<string | null>(null)
async function run(fn: () => Promise<unknown>) {
  error.value = null
  try { await fn(); return true } catch (e) { error.value = t('auth.errors.generic', { msg: (e as Error).message }); return false }
}

// ───────────── navigation ─────────────
const today = todayInZurich()
const tab = ref<'week' | 'month'>('week')
const weekStart = ref(addDays(today, 1 - isoWeekday(today)))
const monthStart = ref(today.slice(0, 7) + '-01')
const dates = computed(() => DAYS.map((d) => addDays(weekStart.value, d - 1)))
const rangeLabel = computed(() => `${f.date(dates.value[0]!, { day: 'numeric', month: 'numeric' })} – ${f.date(dates.value[6]!, { day: 'numeric', month: 'numeric' })}`)
const monthLabel = computed(() => f.date(monthStart.value, { month: 'long', year: 'numeric' }))
const shiftWeek = (n: number) => { weekStart.value = addDays(weekStart.value, 7 * n) }
function shiftMonth(n: number) {
  const d = new Date(monthStart.value + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n)
  monthStart.value = d.toISOString().slice(0, 7) + '-01'
}

// narrow screens show four days at a time
const narrow = ref(false)
const page = ref(0)
let mq: MediaQueryList | null = null
const onMq = () => { narrow.value = !!mq?.matches }
onMounted(() => { mq = window.matchMedia('(max-width: 720px)'); onMq(); mq.addEventListener('change', onMq) })
onBeforeUnmount(() => mq?.removeEventListener('change', onMq))
const shown = computed(() => (narrow.value ? (page.value === 0 ? DAYS.slice(0, 4) : DAYS.slice(4)) : DAYS))

// ───────────── caregivers ─────────────
const personDlg = ref<HTMLDialogElement | null>(null)
const newCg = reactive({ label: '', color: COLOURS[1]! })
const addMe = () => run(() => me.addCaregiver(t('week.meDefault'), COLOURS[0]!, true))
async function savePerson() {
  if (!newCg.label.trim()) return
  if (await run(() => me.addCaregiver(newCg.label.trim(), newCg.color))) { newCg.label = ''; personDlg.value?.close() }
}
function removeCaregiver(id: string) {
  if (me.blocks.some((b) => b.caregiver_id === id)) { error.value = t('week.deleteCaregiverFirst'); return }
  void run(() => me.removeCaregiver(id))
}
const cgById = computed(() => new Map(me.caregivers.map((c) => [c.id, c])))

// ───────────── care blocks (add / edit in a dialog) ─────────────
const dlg = ref<HTMLDialogElement | null>(null)
const form = reactive({ id: '', who: '', day: 1 as Weekday, from: '08:00', to: '12:00', repeat: 'weekly' as 'weekly' | 'once', date: '' })
const formError = ref<string | null>(null)
function defaultWho() { return (me.caregivers.find((c) => c.is_self) ?? me.caregivers[0])?.id ?? '' }
function openAdd(day: Weekday = 1) {
  Object.assign(form, { id: '', who: defaultWho(), day, from: '08:00', to: '12:00', repeat: 'weekly', date: dates.value[day - 1] }); formError.value = null; dlg.value?.showModal()
}
function openEdit(b: CareBlock) {
  Object.assign(form, { id: b.id, who: b.caregiver_id, day: b.weekday, from: hhmm(b.start_time), to: hhmm(b.end_time), repeat: b.on_date ? 'once' : 'weekly', date: b.on_date ?? dates.value[b.weekday - 1] }); formError.value = null; dlg.value?.showModal()
}
async function saveBlock() {
  formError.value = null
  if (!form.from || !form.to || toMinutes(form.to) <= toMinutes(form.from)) { formError.value = t('week.invalidTime'); return }
  const once = form.repeat === 'once'
  const row = { caregiver_id: form.who, weekday: (once ? isoWeekday(form.date) : form.day) as Weekday, start_time: form.from, end_time: form.to, on_date: once ? form.date : null }
  try {
    if (form.id) await me.updateBlock(form.id, row); else await me.addBlock(row)
    dlg.value?.close()
  } catch (e) { formError.value = t('auth.errors.generic', { msg: (e as Error).message }) }
}
const formBlock = computed(() => me.blocks.find((b) => b.id === form.id))
const formSkipDate = computed(() => dates.value[(formBlock.value?.weekday ?? 1) - 1]!)
const formSkipped = computed(() => me.skips.find((k) => k.block_id === form.id && k.date === formSkipDate.value))
async function skipThisWeek() {
  if (!form.id) return
  try { await me.skipWeek(form.id, formSkipDate.value); dlg.value?.close() } catch (e) { formError.value = t('auth.errors.generic', { msg: (e as Error).message }) }
}
async function deleteBlock() {
  if (!form.id) return
  try { await me.removeBlock(form.id); dlg.value?.close() } catch (e) { formError.value = t('auth.errors.generic', { msg: (e as Error).message }) }
}

// ───────────── plan entries placed on the grid ─────────────
interface Row { p: (typeof me.plan)[number]; a?: ReturnType<typeof cat.byId>; tp?: TemplateSlot; oc?: Occurrence; weekday: Weekday | null }
const allPlanRows = computed<Row[]>(() => me.plan.map((p) => {
  const a = cat.byId(p.activity_id)
  const tp = a?.templates.find((x) => x.id === p.template_id)
  const oc = p.occurrence_id ? a?.upcoming.find((x) => x.id === p.occurrence_id) : undefined
  return { p, a, tp, oc, weekday: (tp?.weekday ?? (oc ? isoWeekday(oc.date) : null)) as Weekday | null }
}))
// The catalogue lists only upcoming sessions, so a dated plan entry whose session is no longer listed has passed: it moves to the archive.
const isArchived = (r: Row) => !!(r.a && r.p.occurrence_id && !r.oc)
const planRows = computed(() => allPlanRows.value.filter((r) => !isArchived(r)))
const archivedRows = computed(() => allPlanRows.value.filter(isArchived))
const pastInfo = ref<Record<string, { date: string; start_time: string | null; end_time: string | null }>>({})
watch(archivedRows, async (rows) => {
  const ids = rows.map((r) => r.p.occurrence_id!).filter((id) => !pastInfo.value[id])
  if (!ids.length || !supabase) return
  const { data } = await supabase.from('occurrences').select('id, date, start_time, end_time').in('id', ids)
  for (const o of data ?? []) pastInfo.value = { ...pastInfo.value, [o.id]: o }
}, { immediate: true })
const pastWhen = (r: Row) => { const i = pastInfo.value[r.p.occurrence_id!]; return i ? `${f.date(i.date)} ${f.time(i.start_time, i.end_time)}` : '' }
/** Plan rows that fall on a calendar date: weekly slots every week; dated sessions only on their date. */
const rowsOn = (date: string) => planRows.value.filter((r) => (r.oc ? r.oc.date === date : r.tp ? r.tp.weekday === isoWeekday(date) : false))
const slotOf = (r: Row) => r.tp ?? r.oc
interface EvRow { key: string; title: string; start: string | null; end: string | null; mine: boolean }
const eventsOn = (date: string): EvRow[] => [
  ...me.events.filter((e) => e.date === date).map((e) => ({ key: 'e' + e.id, title: e.title, start: e.start_time, end: e.end_time, mine: true })),
  ...me.invited.filter((e) => e.date === date).map((e) => ({ key: 'i' + e.invite_id, title: e.title, start: e.start_time, end: e.end_time, mine: false })),
]

const range = computed(() => {
  let lo = 7 * 60, hi = 19 * 60
  for (const b of me.blocks) { lo = Math.min(lo, toMinutes(b.start_time)); hi = Math.max(hi, toMinutes(b.end_time)) }
  for (const r of planRows.value) { const s = slotOf(r); if (s?.start) { lo = Math.min(lo, toMinutes(s.start)); hi = Math.max(hi, toMinutes(s.end ?? s.start) + (s.end ? 0 : 60)) } }
  for (const e of [...me.events, ...me.invited]) if (e.start_time) { lo = Math.min(lo, toMinutes(e.start_time)); hi = Math.max(hi, toMinutes(e.end_time ?? e.start_time) + (e.end_time ? 0 : 60)) }
  return { from: Math.floor(lo / 60), to: Math.ceil(hi / 60) }
})
const hours = computed(() => Array.from({ length: range.value.to - range.value.from + 1 }, (_, i) => range.value.from + i))
const gridHeight = computed(() => (range.value.to - range.value.from) * HOUR_PX)
const topOf = (start: string) => ((toMinutes(start) - range.value.from * 60) / 60) * HOUR_PX
const heightOf = (start: string, end: string | null) => Math.max(26, (((end ? toMinutes(end) : toMinutes(start) + 60) - toMinutes(start)) / 60) * HOUR_PX)
const blocksOn = (d: Weekday) => careOn(me.blocks, me.skips, dates.value[d - 1]!)
const skippedThisWeek = computed(() => me.skips.filter((k) => dates.value.includes(k.date)).map((k) => {
  const b = me.blocks.find((x) => x.id === k.block_id)
  return { id: k.id, text: t('soc.skippedOn', { who: (b && cgById.value.get(b.caregiver_id)?.label) || '—', date: f.date(k.date) }) }
}))
const untimed = (date: string) => rowsOn(date).filter((r) => !slotOf(r)?.start)
const untimedEv = (date: string) => eventsOn(date).filter((e) => !e.start)

// ───────────── month view ─────────────
const monthCells = computed(() => {
  const first = monthStart.value
  const lead = isoWeekday(first) - 1
  const dim = new Date(Date.UTC(+first.slice(0, 4), +first.slice(5, 7), 0)).getUTCDate()
  const total = Math.ceil((lead + dim) / 7) * 7
  return Array.from({ length: total }, (_, i) => {
    const date = addDays(first, i - lead)
    return { date, inMonth: date.slice(0, 7) === first.slice(0, 7), items: rowsOn(date), evs: eventsOn(date) }
  })
})
const monthHasItems = computed(() => monthCells.value.some((c) => c.inMonth && (c.items.length || c.evs.length)))

// ───────────── plan list, export, ideas ─────────────
const label = (r: Row) => (r.oc ? t('week.dated', { date: f.date(r.oc.date) }) : r.tp?.recurrence === 'selected_dates' ? t('week.selected') : t('week.weekly'))
const gcal = (r: Row) => (r.a && (r.tp || r.oc) ? googleCalendarUrl({ activity: r.a, template: r.tp, occurrence: r.oc }, icsLabels(t), { appUrl: appUrl() }) : null)
function exportPlan() {
  const items: IcsItem[] = planRows.value.filter((r) => r.a && (r.tp || r.oc)).map((r) => ({ activity: r.a!, template: r.tp, occurrence: r.oc }))
  downloadIcs(buildIcs(items, icsLabels(t), { appUrl: appUrl() }), 'quartierjournal-plan')
}
const guideNames = [['partner', 'p_partner'], ['grandparents', 'p_grandparents'], ['daycare', 'p_daycare'], ['nanny', 'p_nanny']] as const
const quickPerson = (key: string) => run(() => me.addCaregiver(t('soc.' + key), COLOURS[(me.caregivers.length) % COLOURS.length]!))
const needsGuide = computed(() => me.caregivers.length > 0 && !me.blocks.length)

// ───────────── own events ─────────────
const evDlg = ref<HTMLDialogElement | null>(null)
const ev = reactive({ title: '', date: today, from: '', to: '', place: '', note: '', visibility: 'private' as 'private' | 'public_request' })
const evError = ref<string | null>(null)
const evInfo = ref<string | null>(null)
function openEvent() {
  Object.assign(ev, { title: '', date: dates.value.includes(today) ? today : dates.value[0]!, from: '', to: '', place: '', note: '', visibility: 'private' }); evError.value = null; evDlg.value?.showModal()
}
async function saveEvent() {
  evError.value = null
  if (!ev.title.trim()) return
  if (ev.to && (!ev.from || toMinutes(ev.to) <= toMinutes(ev.from))) { evError.value = t('week.invalidTime'); return }
  try {
    const row = await me.addEvent({ title: ev.title.trim(), date: ev.date, start_time: ev.from || null, end_time: ev.to || null, place: ev.place.trim() || null, note: ev.note.trim() || null, visibility: ev.visibility })
    evDlg.value?.close()
    evInfo.value = row.visibility === 'public_request' ? t('soc.evPublicSent') : null
    if (row.visibility === 'private') openInvite({ title: row.title, when: `${f.date(row.date)} ${f.time(row.start_time, row.end_time)}`.trim(), src: { userEventId: row.id } })
  } catch (e) { evError.value = t('auth.errors.generic', { msg: (e as Error).message }) }
}
function deleteEvent(id: string) { if (window.confirm(t('soc.evDelete') + '?')) void run(() => me.removeEvent(id)) }
const evGcal = (e: { title: string; date: string; start_time: string | null; end_time: string | null; place: string | null; note: string | null }) => {
  const d = e.date.replaceAll('-', '')
  const dt = e.start_time ? `${d}T${e.start_time.slice(0, 2)}${e.start_time.slice(3, 5)}00/${d}T${(e.end_time ?? e.start_time).slice(0, 2)}${(e.end_time ?? e.start_time).slice(3, 5)}00` : `${d}/${d}`
  const p = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: dt, ctz: 'Europe/Zurich', location: e.place ?? '', details: e.note ?? '' })
  return `https://calendar.google.com/calendar/render?${p}`
}

// ───────────── invitations ─────────────
type InviteSrc = { userEventId?: string; activityId?: string; templateId?: string | null; occurrenceId?: string | null }
const invDlg = ref<HTMLDialogElement | null>(null)
const inv = reactive({ title: '', when: '', url: '', busy: false, error: null as string | null, guests: [] as Guest[], ids: [] as string[], src: {} as InviteSrc })
async function loadGuests() {
  try { inv.ids = await social.inviteIds(inv.src); inv.guests = (await Promise.all(inv.ids.map((id) => social.guests(id).then((g) => g.map((x) => ({ ...x, _inv: id })))))).flat() } catch { /* list stays empty */ }
}
function openInvite(o: { title: string; when: string; src: InviteSrc }) {
  Object.assign(inv, { title: o.title, when: o.when, url: '', busy: true, error: null, guests: [], ids: [], src: o.src })
  invDlg.value?.showModal()
  void social.createEventLink(o.src).then((u) => { inv.url = u }).catch((e: Error) => { inv.error = t('auth.errors.generic', { msg: e.message }) }).finally(async () => { inv.busy = false; await loadGuests() })
}
async function removeGuest(g: Guest & { _inv?: string }) { if (g._inv) { try { await social.removeGuest(g._inv, g.guest_id); await loadGuests() } catch (e) { inv.error = (e as Error).message } } }
const planInvite = (r: Row) => openInvite({ title: r.a?.title ?? '', when: `${r.oc ? f.date(r.oc.date) : r.weekday ? f.day(r.weekday, 'long') : ''} ${f.time(slotOf(r)?.start ?? null, slotOf(r)?.end ?? null)}`.trim(),
  src: { activityId: r.p.activity_id, templateId: r.p.template_id, occurrenceId: r.p.occurrence_id } })
const inviteMessage = computed(() => t('soc.inviteMsg', { title: inv.title, when: inv.when }))
const findOffers = () => router.push({ name: 'discover', query: { fit: '1', w: 'week' } })

watch(narrow, () => { page.value = 0 })
</script>

<template>
  <main id="main" class="wrap">
    <div>
      <h1>{{ $t('week.title') }}</h1>
      <p class="lead" style="margin-top: 12px">{{ $t('week.sub') }}</p>
      <p class="small muted" style="margin: 6px 0 0">{{ $t('ui.week.note') }}</p>
    </div>
    <div v-if="error" class="notice error" role="alert">{{ error }}</div>
    <p v-if="!me.loaded || cat.status === 'loading' || cat.status === 'idle'">{{ $t('common.loading') }}</p>

    <template v-else>
      <section v-if="!me.caregivers.length" class="panel cream stack">
        <h2>{{ $t('week.emptyTitle') }}</h2>
        <p style="margin: 0">{{ $t('week.emptyBody') }}</p>
        <div><button class="btn primary" @click="addMe">{{ $t('week.addMe') }}</button></div>
      </section>

      <section v-else-if="needsGuide" class="panel cream stack guide">
        <h2>{{ $t('soc.guideTitle') }}</h2>
        <p style="margin: 0">{{ $t('soc.guideSub') }}</p>
        <h3>{{ $t('soc.guideStep1') }}</h3>
        <p class="small muted" style="margin: 0">{{ $t('soc.guideStep1Hint') }}</p>
        <ul class="cgs">
          <li v-for="c in me.caregivers" :key="c.id" class="cg"><span class="dot" :style="{ background: c.color }" aria-hidden="true" /><span>{{ c.label }}</span></li>
        </ul>
        <div class="row">
          <button v-for="[k, lab] in guideNames" :key="k" class="btn small" @click="quickPerson(lab)">+ {{ $t('soc.' + lab) }}</button>
          <button class="btn small" @click="personDlg?.showModal()">{{ $t('ui.week.addPerson') }}</button>
        </div>
        <h3>{{ $t('soc.guideStep2') }}</h3>
        <p class="small muted" style="margin: 0">{{ $t('soc.guideStep2Hint') }}</p>
        <div><button class="btn primary" @click="openAdd()">{{ $t('soc.guideAddTime') }}</button></div>
        <p class="tiny muted" style="margin: 0">{{ $t('soc.guideHolidays') }}</p>
      </section>

      <template v-if="me.caregivers.length">
        <div class="tabs" role="tablist">
          <button role="tab" :aria-selected="tab === 'week'" @click="tab = 'week'">{{ $t('ui.week.tabWeek') }}</button>
          <button role="tab" :aria-selected="tab === 'month'" @click="tab = 'month'">{{ $t('ui.week.tabMonth') }}</button>
        </div>

        <div class="row">
          <button class="btn accent addtime" @click="openAdd()">{{ $t('ui.week.addTime') }}</button>
          <button class="btn" @click="openEvent">{{ $t('soc.createEvent') }}</button>
        </div>
        <div v-if="evInfo" class="notice" role="status">{{ evInfo }}</div>

        <ul class="cgs" :aria-label="$t('week.caregivers')">
          <li v-for="c in me.caregivers" :key="c.id" class="cg">
            <span class="dot" :style="{ background: c.color }" aria-hidden="true" />
            <span>{{ c.label }}</span>
            <button v-if="!c.is_self" class="x" :aria-label="`${$t('common.delete')}: ${c.label}`" @click="removeCaregiver(c.id)">×</button>
          </li>
          <li><button class="btn small" @click="personDlg?.showModal()">{{ $t('ui.week.addPerson') }}</button></li>
        </ul>
        <p class="tiny muted" style="margin: 0">{{ $t('ui.week.hint') }}</p>

        <!-- ═════ week grid ═════ -->
        <section v-if="tab === 'week'" class="cal" aria-label="week">
          <div class="nav">
            <button class="round" :aria-label="$t('ui.week.prev')" @click="shiftWeek(-1)">‹</button>
            <strong>{{ rangeLabel }}</strong>
            <button class="round" :aria-label="$t('ui.week.next')" @click="shiftWeek(1)">›</button>
          </div>
          <div v-if="narrow" class="pager">
            <button class="btn small" :class="{ on: page === 0 }" @click="page = 0">{{ $t('ui.week.mobilePage') }}</button>
            <button class="btn small" :class="{ on: page === 1 }" @click="page = 1">{{ $t('ui.week.mobilePage2') }}</button>
          </div>
          <div class="grid" :style="{ gridTemplateColumns: `42px repeat(${shown.length}, minmax(0, 1fr))` }">
            <div />
            <div v-for="d in shown" :key="d" class="dh" :class="{ today: dates[d - 1] === today }">
              <strong>{{ f.day(d) }}</strong><span class="tiny">{{ f.date(dates[d - 1]!, { day: 'numeric', month: 'numeric' }) }}</span>
              <span v-for="r in untimed(dates[d - 1]!)" :key="r.p.id" class="untimed">{{ r.a?.title }}</span>
              <span v-for="e in untimedEv(dates[d - 1]!)" :key="e.key" class="untimed own">{{ e.title }}</span>
            </div>
            <div class="hours" :style="{ height: gridHeight + 'px' }" aria-hidden="true">
              <span v-for="h in hours" :key="h" :style="{ top: (h - range.from) * HOUR_PX + 'px' }">{{ String(h).padStart(2, '0') }}:00</span>
            </div>
            <div v-for="d in shown" :key="'c' + d" class="col" :style="{ height: gridHeight + 'px' }" @dblclick.self="openAdd(d)">
              <span v-for="h in hours" :key="h" class="line" :style="{ top: (h - range.from) * HOUR_PX + 'px' }" aria-hidden="true" />
              <button v-for="b in blocksOn(d)" :key="b.id" class="blk" :style="{ top: topOf(b.start_time) + 'px', height: heightOf(b.start_time, b.end_time) + 'px', background: cgById.get(b.caregiver_id)?.color }" @click="openEdit(b)">
                <strong>{{ cgById.get(b.caregiver_id)?.label }}</strong><span>{{ hhmm(b.start_time) }}–{{ hhmm(b.end_time) }}</span>
              </button>
              <template v-for="r in rowsOn(dates[d - 1]!)" :key="r.p.id">
                <RouterLink v-if="slotOf(r)?.start && r.a" class="act" :class="{ sel: r.tp?.recurrence === 'selected_dates' }" :to="{ name: 'activity', params: { id: r.a.id } }"
                  :style="{ top: topOf(slotOf(r)!.start!) + 'px', height: heightOf(slotOf(r)!.start!, slotOf(r)!.end) + 'px' }">
                  <strong>{{ r.a.title }}</strong><span>{{ f.time(slotOf(r)!.start, slotOf(r)!.end) }}</span>
                </RouterLink>
              </template>
              <template v-for="e in eventsOn(dates[d - 1]!)" :key="e.key">
                <div v-if="e.start" class="act evt" :class="{ theirs: !e.mine }" :style="{ top: topOf(e.start) + 'px', height: heightOf(e.start, e.end) + 'px' }">
                  <strong>{{ e.title }}</strong><span>{{ f.time(e.start, e.end) }}</span>
                </div>
              </template>
            </div>
          </div>
          <div v-if="skippedThisWeek.length" class="skips">
            <span class="tiny muted">{{ $t('soc.skippedTitle') }}:</span>
            <span v-for="k in skippedThisWeek" :key="k.id" class="tiny">{{ k.text }} <button class="linklike" @click="run(() => me.unskip(k.id))">{{ $t('soc.undo') }}</button></span>
          </div>
          <p v-if="!me.blocks.length" class="tiny muted pad">{{ $t('ui.week.emptyGrid') }}</p>
        </section>

        <!-- ═════ month view ═════ -->
        <section v-else class="cal" aria-label="month">
          <div class="nav">
            <button class="round" :aria-label="$t('ui.week.prev')" @click="shiftMonth(-1)">‹</button>
            <strong>{{ monthLabel }}</strong>
            <button class="round" :aria-label="$t('ui.week.next')" @click="shiftMonth(1)">›</button>
          </div>
          <div class="month">
            <div v-for="d in DAYS" :key="'h' + d" class="mh">{{ f.day(d) }}</div>
            <div v-for="c in monthCells" :key="c.date" class="mc" :class="{ off: !c.inMonth, today: c.date === today }">
              <span class="tiny">{{ Number(c.date.slice(8)) }}</span>
              <RouterLink v-for="r in c.items.slice(0, 3)" :key="r.p.id" class="mi" :to="{ name: 'activity', params: { id: r.a?.id ?? '' } }">{{ r.a?.title }}</RouterLink>
              <span v-for="e in c.evs.slice(0, 2)" :key="e.key" class="mi own">{{ e.title }}</span>
              <span v-if="c.items.length > 3" class="tiny muted">+{{ c.items.length - 3 }}</span>
            </div>
          </div>
          <p v-if="!monthHasItems" class="small muted pad">{{ $t('ui.week.monthNone') }}</p>
        </section>
      </template>

      <section v-if="me.caregivers.length" class="panel cream stack">
        <strong>{{ $t('soc.findForWeek') }}</strong>
        <p class="small muted" style="margin: 0">{{ $t('soc.findForWeekHint') }}</p>
        <div><button class="btn primary" @click="findOffers">{{ $t('soc.findForWeek') }} →</button></div>
      </section>

      <section class="panel stack">
        <h2 class="h">{{ $t('week.plan') }}</h2>
        <p v-if="!planRows.length" class="muted" style="margin: 0">{{ $t('week.planEmpty') }}</p>
        <ul v-else class="plan">
          <li v-for="r in planRows" :key="r.p.id">
            <span>
              <strong>{{ r.a?.title ?? '—' }}</strong>
              <span class="small"> · {{ r.weekday ? f.day(r.weekday, 'long') : '' }} {{ f.time(slotOf(r)?.start ?? null, slotOf(r)?.end ?? null) }} · {{ label(r) }}</span>
              <span v-if="r.oc && r.oc.date < today" class="badge">{{ $t('week.past') }}</span>
            </span>
            <span class="row">
              <a v-if="gcal(r)" class="btn small" :href="gcal(r)!" target="_blank" rel="noopener">📅 {{ $t('ui.plan.calendar') }}</a>
              <button class="btn small" @click="planInvite(r)">✉ {{ $t('soc.invite') }}</button>
              <RouterLink v-if="r.a" class="btn small" :to="{ name: 'activity', params: { id: r.a.id } }">{{ $t('ui.week.open') }}</RouterLink>
              <button class="btn small" @click="run(() => me.removeFromPlan(r.p.id))">{{ $t('week.remove') }}</button>
            </span>
          </li>
        </ul>
        <template v-if="me.events.length">
          <h3 class="small" style="margin: 14px 0 0">{{ $t('soc.myEvents') }}</h3>
          <ul class="plan">
            <li v-for="e in me.events" :key="e.id">
              <span><strong>{{ e.title }}</strong><span class="small"> · {{ f.date(e.date) }} {{ f.time(e.start_time, e.end_time) }}<template v-if="e.place"> · {{ e.place }}</template> · {{ e.visibility === 'private' ? $t('soc.privateTag') : $t('soc.publicTag') }}</span></span>
              <span class="row">
                <a class="btn small" :href="evGcal(e)" target="_blank" rel="noopener">📅 {{ $t('ui.plan.calendar') }}</a>
                <button class="btn small" @click="openInvite({ title: e.title, when: `${f.date(e.date)} ${f.time(e.start_time, e.end_time)}`.trim(), src: { userEventId: e.id } })">✉ {{ $t('soc.invite') }}</button>
                <button class="btn small" @click="deleteEvent(e.id)">{{ $t('week.remove') }}</button>
              </span>
            </li>
          </ul>
        </template>
        <template v-if="me.invited.length">
          <h3 class="small" style="margin: 14px 0 0">{{ $t('soc.invitedEvents') }}</h3>
          <ul class="plan">
            <li v-for="i in me.invited" :key="i.invite_id">
              <span><strong>{{ i.title }}</strong><span class="small"> · {{ i.date ? f.date(i.date) : '' }} {{ f.time(i.start_time, i.end_time) }}<template v-if="i.place"> · {{ i.place }}</template> · {{ $t('soc.invitedBy', { name: i.inviter_name || $t('soc.family') }) }} · {{ $t('soc.' + i.status) }}</span></span>
              <span class="row">
                <RouterLink v-if="i.activity_id" class="btn small" :to="{ name: 'activity', params: { id: i.activity_id } }">{{ $t('ui.week.open') }}</RouterLink>
                <button class="btn small" @click="run(() => me.leaveInvited(i.invite_id))">{{ $t('soc.leave') }}</button>
              </span>
            </li>
          </ul>
        </template>
        <details v-if="archivedRows.length" class="archive">
          <summary class="small muted">{{ $t('ui.week.archive', { n: archivedRows.length }) }}</summary>
          <ul class="plan">
            <li v-for="r in archivedRows" :key="r.p.id">
              <span><strong>{{ r.a?.title ?? '—' }}</strong><span class="small muted"> · {{ pastWhen(r) }}</span></span>
              <span class="row">
                <RouterLink v-if="r.a" class="btn small" :to="{ name: 'activity', params: { id: r.a.id } }">{{ $t('ui.week.open') }}</RouterLink>
                <button class="btn small" @click="run(() => me.removeFromPlan(r.p.id))">{{ $t('week.remove') }}</button>
              </span>
            </li>
          </ul>
        </details>
        <template v-if="planRows.length">
          <div><button class="btn" @click="exportPlan">{{ $t('week.exportAll') }}</button></div>
          <p class="tiny muted" style="margin: 0">{{ $t('week.exportNote') }}</p>
        </template>
      </section>

    </template>

    <!-- care time dialog -->
    <dialog ref="dlg" class="dlg" aria-labelledby="dlg-h">
      <form class="stack" @submit.prevent="saveBlock">
        <h2 id="dlg-h" class="h">{{ form.id ? $t('ui.week.editTime') : $t('ui.week.addTime').replace('+ ', '') }}</h2>
        <label class="field"><span>{{ $t('week.who') }}</span>
          <select v-model="form.who" name="who" class="input"><option v-for="c in me.caregivers" :key="c.id" :value="c.id">{{ c.label }}</option></select>
        </label>
        <fieldset class="rec">
          <legend>{{ $t('soc.recTitle') }}</legend>
          <label><input v-model="form.repeat" type="radio" value="weekly" name="repeat" /> {{ $t('soc.recWeekly') }}</label>
          <label><input v-model="form.repeat" type="radio" value="once" name="repeat" /> {{ $t('soc.recOnce', { date: form.date ? f.date(form.date) : '' }) }}</label>
        </fieldset>
        <label v-if="form.repeat === 'weekly'" class="field"><span>{{ $t('week.day') }}</span>
          <select v-model.number="form.day" name="day" class="input"><option v-for="d in DAYS" :key="d" :value="d">{{ f.day(d, 'long') }}</option></select>
        </label>
        <label v-else class="field"><span>{{ $t('soc.evDate') }}</span><input v-model="form.date" name="date" type="date" class="input" required /></label>
        <div class="two">
          <label class="field"><span>{{ $t('week.from') }}</span><input v-model="form.from" name="from" type="time" step="900" class="input" required /></label>
          <label class="field"><span>{{ $t('week.to') }}</span><input v-model="form.to" name="to" type="time" step="900" class="input" required /></label>
        </div>
        <div v-if="formError" class="notice error" role="alert">{{ formError }}</div>
        <div class="row">
          <button class="btn primary" type="submit">{{ $t('ui.week.saveBlock') }}</button>
          <button class="btn" type="button" @click="dlg?.close()">{{ $t('common.cancel') }}</button>
          <button v-if="form.id && formBlock && !formBlock.on_date && !formSkipped" class="btn" type="button" @click="skipThisWeek">{{ $t('soc.skipWeek') }}</button>
          <button v-if="form.id" class="btn" type="button" style="border-color: var(--danger); color: var(--danger)" @click="deleteBlock">{{ $t('ui.week.deleteBlock') }}</button>
        </div>
      </form>
    </dialog>

    <!-- create event dialog -->
    <dialog ref="evDlg" class="dlg" aria-labelledby="edlg-h">
      <form class="stack" @submit.prevent="saveEvent">
        <h2 id="edlg-h" class="h">{{ $t('soc.evHeading') }}</h2>
        <label class="field"><span>{{ $t('soc.evTitle') }}</span><input v-model="ev.title" name="title" class="input" maxlength="120" required /></label>
        <label class="field"><span>{{ $t('soc.evDate') }}</span><input v-model="ev.date" name="date" type="date" class="input" required /></label>
        <div class="two">
          <label class="field"><span>{{ $t('week.from') }}</span><input v-model="ev.from" name="from" type="time" step="900" class="input" /></label>
          <label class="field"><span>{{ $t('week.to') }}</span><input v-model="ev.to" name="to" type="time" step="900" class="input" /></label>
        </div>
        <label class="field"><span>{{ $t('soc.evPlace') }}</span><input v-model="ev.place" name="place" class="input" maxlength="200" /></label>
        <label class="field"><span>{{ $t('soc.evNote') }}</span><textarea v-model="ev.note" name="note" class="input" rows="2" maxlength="1000" /></label>
        <fieldset class="rec">
          <label><input v-model="ev.visibility" type="radio" value="private" name="vis" /> <strong>{{ $t('soc.evPrivate') }}</strong> · <span class="small">{{ $t('soc.evPrivateHint') }}</span></label>
          <label><input v-model="ev.visibility" type="radio" value="public_request" name="vis" /> <strong>{{ $t('soc.evPublic') }}</strong> · <span class="small">{{ $t('soc.evPublicHint') }}</span></label>
        </fieldset>
        <div v-if="evError" class="notice error" role="alert">{{ evError }}</div>
        <div class="row">
          <button class="btn primary" type="submit" :disabled="!ev.title.trim()">{{ $t('soc.evSave') }}</button>
          <button class="btn" type="button" @click="evDlg?.close()">{{ $t('common.cancel') }}</button>
        </div>
      </form>
    </dialog>

    <!-- invite dialog -->
    <dialog ref="invDlg" class="dlg" aria-labelledby="idlg-h">
      <div class="stack">
        <h2 id="idlg-h" class="h">{{ $t('soc.inviteTitle', { title: inv.title }) }}</h2>
        <p class="small" style="margin: 0">{{ $t('soc.inviteIntro') }}</p>
        <p v-if="inv.busy" class="muted" style="margin: 0">{{ $t('soc.creating') }}</p>
        <div v-if="inv.error" class="notice error" role="alert">{{ inv.error }}</div>
        <ShareButtons v-if="inv.url" :url="inv.url" :message="inviteMessage" :subject="$t('soc.emailSubject', { title: inv.title })" />
        <p class="tiny muted" style="margin: 0">{{ $t('soc.inviteSafety') }}</p>
        <h3 class="small" style="margin: 6px 0 0">{{ $t('soc.guests') }}</h3>
        <p v-if="!inv.guests.length" class="muted small" style="margin: 0">{{ $t('soc.noGuests') }}</p>
        <ul v-else class="plan">
          <li v-for="g in inv.guests" :key="g.guest_id + (g as any)._inv"><span>{{ g.display_name || $t('soc.family') }} · {{ $t('soc.' + g.status) }}</span><button class="btn small" @click="removeGuest(g)">{{ $t('soc.remove') }}</button></li>
        </ul>
        <div><button class="btn" @click="invDlg?.close()">{{ $t('common.close') }}</button></div>
      </div>
    </dialog>

    <!-- new person dialog -->
    <dialog ref="personDlg" class="dlg" aria-labelledby="pdlg-h">
      <form class="stack" @submit.prevent="savePerson">
        <h2 id="pdlg-h" class="h">{{ $t('ui.week.newPerson') }}</h2>
        <label class="field"><span>{{ $t('week.caregiverName') }}</span><input v-model="newCg.label" name="label" class="input" maxlength="40" required /></label>
        <div class="row" role="radiogroup" :aria-label="$t('week.colour')">
          <button v-for="c in COLOURS" :key="c" type="button" class="swatch" role="radio" :aria-checked="newCg.color === c" :style="{ background: c }" :aria-label="c" @click="newCg.color = c" />
        </div>
        <div class="row">
          <button class="btn primary" type="submit" :disabled="!newCg.label.trim()">{{ $t('common.save') }}</button>
          <button class="btn" type="button" @click="personDlg?.close()">{{ $t('common.cancel') }}</button>
        </div>
      </form>
    </dialog>
  </main>
</template>

<style scoped>
.h { font-size: 26px; font-weight: 400; }
.tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--line); }
.tabs button { border: 0; background: none; padding: 12px 6px; margin-right: 18px; font-size: 18px; cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -1px; }
.tabs button[aria-selected='true'] { border-bottom-color: var(--magenta); }
.cgs { list-style: none; padding: 0; margin: 0; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.cg { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: var(--pill); padding: 6px 12px; }
.dot { width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--ink); }
.x { border: 0; background: none; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 2px; min-width: 24px; min-height: 24px; }
.swatch { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--ink); cursor: pointer; }
.swatch[aria-checked='true'] { outline: 3px solid var(--ink); outline-offset: 2px; }

.cal { border: 1px solid var(--ink); border-radius: 26px; padding: clamp(10px, 2vw, 20px); background: #fff; }
.nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.round { width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--ink); background: #fff; font-size: 22px; cursor: pointer; line-height: 1; }
.pager { display: flex; gap: 8px; margin-bottom: 8px; }
.grid { display: grid; column-gap: 6px; }
.dh { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 2px; padding-bottom: 8px; min-width: 0; }
.dh strong { font-weight: 400; font-size: 17px; }
.dh.today strong { background: var(--ink); color: #fff; border-radius: var(--pill); padding: 0 12px; }
.untimed { background: var(--magenta); color: #fff; font-size: 11px; border-radius: 8px; padding: 2px 6px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hours { position: relative; font-size: 11px; color: var(--muted); }
.hours span { position: absolute; transform: translateY(-50%); }
.col { position: relative; min-width: 0; }
.line { position: absolute; left: 0; right: 0; height: 1px; background: #eceae6; }
.blk { position: absolute; left: 0; right: 0; border: 0; border-radius: 12px; padding: 6px 8px; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 0; overflow: hidden; font-size: 13px; line-height: 1.25; color: var(--ink); }
.blk span { font-size: 12px; opacity: .85; }
.blk:hover { filter: brightness(.96); }
.act { position: absolute; left: 22%; right: 3px; background: var(--magenta); color: #fff; border-radius: 10px; padding: 4px 7px; font-size: 12px; line-height: 1.2; text-decoration: none; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 0 0 2px #fff; z-index: 2; }
.act.sel { background: #fff; color: var(--magenta-ink); box-shadow: inset 0 0 0 2px var(--magenta); }
.pad { padding: 10px 4px 0; margin: 0; }
.evt { background: var(--ink); color: #fff; }
.evt.theirs { background: #fff; color: var(--ink); box-shadow: inset 0 0 0 2px var(--ink); }
.untimed.own, .mi.own { background: var(--ink); }
.skips { display: flex; gap: 6px 14px; flex-wrap: wrap; padding: 8px 4px 0; }
.linklike { border: 0; background: none; text-decoration: underline; cursor: pointer; padding: 0; font: inherit; }
.rec { border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; display: grid; gap: 8px; }
.rec legend { padding: 0 6px; }
.rec label { display: flex; gap: 8px; align-items: baseline; cursor: pointer; }
.guide h3 { font-size: 18px; font-weight: 500; margin: 8px 0 0; }

.month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.mh { text-align: center; font-size: 14px; padding: 4px 0; }
.mc { min-height: 92px; border: 1px solid var(--line); border-radius: 10px; padding: 4px 6px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.mc.off { opacity: .4; }
.mc.today { border-color: var(--ink); }
.mi { background: var(--magenta); color: #fff; border-radius: 6px; padding: 1px 5px; font-size: 11px; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.archive { margin-top: 8px; }
.archive summary { cursor: pointer; }
.plan { list-style: none; padding: 0; margin: 0; }
.plan li { display: flex; justify-content: space-between; gap: 8px 16px; flex-wrap: wrap; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--line); }

.dlg { border: 1px solid var(--ink); border-radius: 22px; padding: 24px; width: min(92vw, 460px); }
.dlg::backdrop { background: rgba(29, 29, 27, .45); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 720px) {
  .mc { min-height: 64px; padding: 3px; }
  .mi { font-size: 10px; }
  .blk { padding: 4px 5px; font-size: 12px; }
  .act { left: 16%; }
}
</style>
