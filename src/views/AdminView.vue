<script setup lang="ts">
// Admin review. Every action here is also enforced server-side by RLS / app.is_admin().
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { db } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { useCatalogue } from '@/stores/catalogue'
import { MAINS, classify } from '@/domain/taxonomy'
import AdminCrm from '@/components/AdminCrm.vue'
import { useFormat } from '@/composables/useFormat'

const { t } = useI18n()
const auth = useAuth()
const cat = useCatalogue()
const f = useFormat()

type Tab = 'leads' | 'proposals' | 'drafts' | 'sources' | 'runs'
const view = ref<'todo' | 'stats' | 'crm' | 'ref'>('todo')   // 'todo' = only what needs the owner; 'ref' = everything else, for reference
const tab = ref<Tab>('leads')
const todoDrafts = ref<any[]>([])
// watched sources: the daily job only notes "changed since last review"; reading the page and proposing entries is done on request
const sources = ref<any[]>([])
const found = ref<any[]>([])
const srcInfo = ref<{ active: number; paused: number; changed_unreviewed: number; failing: number; last_check: string | null; new_listings: number; new_from_providers: number } | null>(null)
async function loadSources() {
  const [l, n] = await Promise.all([
    db().from('crawl_targets').select('id, url, scope, status, last_success_at, last_changed_at, reviewed_at, last_note, fail_streak, interval_days').order('last_changed_at', { ascending: false, nullsFirst: false }).limit(100),
    db().rpc('admin_sources'),
  ])
  sources.value = l.data ?? []; srcInfo.value = (n.data as typeof srcInfo.value) ?? null
  const fl = await db().from('discovered_listings').select('id, title, start_date, start_time, location_text, event_url, source_url, field_main, from_provider, rrule')
    .eq('status', 'new').or(`start_date.gte.${new Date().toISOString().slice(0, 10)},start_date.is.null,rrule.not.is.null`).order('start_date', { nullsFirst: false }).limit(100)
  found.value = fl.data ?? []
}
const ignoreFound = (id: string) => act(() => db().from('discovered_listings').update({ status: 'ignored' }).eq('id', id), t('common.saved')).then(loadSources)
const isChanged = (x: any) => x.last_changed_at && (!x.reviewed_at || x.reviewed_at < x.last_changed_at)
const markReviewed = (id: string) => act(() => db().from('crawl_targets').update({ reviewed_at: new Date().toISOString() }).eq('id', id), t('common.saved')).then(loadSources)
const setSourceStatus = (id: string, status: string) => act(() => db().from('crawl_targets').update({ status, fail_streak: 0 }).eq('id', id), t('common.saved')).then(loadSources)
// Needs the owner: suggestions from people (not our own research notes), proposed changes, drafts waiting to be published
const OPEN = ['new', 'matched', 'in_review']
const todoLeads = computed(() => leads.value.filter((l) => l.origin === 'user' && OPEN.includes(l.status)))
const todoCount = computed(() => todoLeads.value.length + proposals.value.length + todoDrafts.value.length)
const leadList = computed(() => (view.value === 'todo' ? todoLeads.value : leads.value))
const draftRows = computed(() => (view.value === 'todo' ? todoDrafts.value : drafts.value))
const leads = ref<any[]>([])
const proposals = ref<any[]>([])
const drafts = ref<any[]>([])
const draftFilter = ref<'drafts' | 'feed' | 'confirmed'>('drafts')
const draftQuery = ref('')
const DRAFT_LIMIT = 100
const runs = ref<any[]>([])
const checks = ref<any[]>([])
const payloads = ref<Record<string, string>>({})
const msg = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const LEAD_STATUSES = ['new', 'matched', 'in_review', 'accepted', 'rejected', 'duplicate']

async function load() {
  const s = db()
  const [l, p, r, c] = await Promise.all([
    s.from('leads').select('*').order('created_at', { ascending: false }),
    s.from('proposals').select('*').in('status', ['pending', 'approved']).order('created_at'),
    s.from('refresh_runs').select('*').order('run_date', { ascending: false }).limit(20),
    s.from('source_checks').select('id, checked_on, outcome, note, sources(url)').order('checked_on', { ascending: false, nullsFirst: false }).limit(30),
  ])
  const err = l.error ?? p.error ?? r.error ?? c.error
  if (err) { msg.value = { kind: 'error', text: err.message }; return }
  leads.value = l.data!; proposals.value = p.data!; runs.value = r.data!; checks.value = c.data!
  await loadDrafts()
  const td = await s.from('activities').select('id, title, status, verification, last_checked_on, data_origin, venue_id, venues(name, status)').eq('status', 'draft').order('title').limit(50)
  todoDrafts.value = td.data ?? []
  payloads.value = Object.fromEntries(p.data!.map((x: any) => [x.id, JSON.stringify(x.payload, null, 2)]))
}
async function loadDrafts() {
  let q = db().from('activities').select('id, title, status, verification, last_checked_on, data_origin, venue_id, venues(name, status)')
  if (draftFilter.value === 'drafts') q = q.eq('status', 'draft')
  else if (draftFilter.value === 'feed') q = q.eq('data_origin', 'feed:chreis').eq('status', 'published')
  else q = q.eq('verification', 'provider_verified').eq('status', 'published')
  const term = draftQuery.value.trim().replace(/[%,()]/g, ' ')
  if (term) q = q.ilike('title', `%${term}%`)
  const { data, error } = await q.order('title').limit(DRAFT_LIMIT)
  if (error) { msg.value = { kind: 'error', text: error.message }; return }
  drafts.value = data ?? []
}
watch([draftFilter, draftQuery], () => { if (auth.isAdmin) void loadDrafts() })
// ── overview (totals only; see migration 14) ──
interface Stats {
  users: { total: number; confirmed: number; new7: number; new30: number; weekly: { week: string; n: number }[] }
  usage: { families_with_week: number; families_with_plan: number; plan_items: number; favourites: number; own_events: number; friend_pairs: number; event_invites: number; emails_30d: number; with_photo_or_avatar: number }
  catalogue: { activities: number; verified: number; upcoming_dates: number; places: number; providers_with_offers: number; stale_90d: number; by_origin: { origin: string; n: number }[]; last_refresh: string | null }
  leads: { open_from_people: number; total_from_people: number }
}
const stats = ref<Stats | null>(null)
const sheetUrl = ref<string | null>(null)
async function loadStats() {
  const [st, sh] = await Promise.all([db().rpc('admin_stats'), db().from('admin_settings').select('value').eq('key', 'overview_sheet_url').maybeSingle()])
  if (st.error) { msg.value = { kind: 'error', text: st.error.message }; return }
  stats.value = st.data as Stats
  sheetUrl.value = (sh.data as { value: string } | null)?.value ?? null
}
const byCategory = computed(() => {
  const m = new Map<string, number>()
  for (const a of cat.cards) { const c = classify(a); if (c) m.set(c.main, (m.get(c.main) ?? 0) + 1) }
  return MAINS.map((k) => ({ key: k, n: m.get(k) ?? 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)
})
const maxCat = computed(() => Math.max(1, ...byCategory.value.map((x) => x.n)))
const maxWeek = computed(() => Math.max(1, ...(stats.value?.users.weekly.map((w) => w.n) ?? [1])))
const originLabel: Record<string, string> = { 'feed:chreis': 'Chreis+ (open directory, unconfirmed)', 'legacy:sqlite': 'Earlier data set', 'provider:pbz': 'Pro Juventute / PBZ programme', 'provider:site': 'Provider websites (confirmed)' }
watch(view, (v) => { if (v === 'stats' && auth.isAdmin && !stats.value) { void loadStats(); void cat.load(); void loadSources() } })
watch([view, tab], () => { if (view.value === 'ref' && tab.value === 'sources' && auth.isAdmin) void loadSources() })
onMounted(() => { if (auth.isAdmin) void load() })

async function act(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
  msg.value = null
  const { error } = await fn()
  if (error) { msg.value = { kind: 'error', text: error.message }; return }
  msg.value = { kind: 'ok', text: ok }
  await load()
  await cat.load(true)
}

const setLeadStatus = (id: string, status: string) => act(() => db().from('leads').update({ status }).eq('id', id), t('common.saved'))

async function apply(id: string) {
  let payload: unknown
  try { payload = JSON.parse(payloads.value[id] ?? '{}') } catch { msg.value = { kind: 'error', text: t('admin.invalidJson') }; return }
  await act(async () => {
    const u = await db().from('proposals').update({ payload }).eq('id', id)
    if (u.error) return u
    return db().rpc('apply_proposal', { p_id: id })
  }, t('admin.applied'))
}
const reject = (id: string) => act(() => db().from('proposals').update({ status: 'rejected', reviewed_by: auth.user!.id, reviewed_at: new Date().toISOString() }).eq('id', id), t('admin.rejected'))

/** After checking an entry with the organiser: mark it as confirmed (it then counts as organiser-verified everywhere). */
const promote = (a: any) => act(async () => {
  const today = new Date().toISOString().slice(0, 10)
  const u = await db().from('activities').update({ verification: 'provider_verified', last_checked_on: today }).eq('id', a.id)
  if (u.error) return u
  return db().from('verifications').insert({ activity_id: a.id, checked_on: today, method: 'admin', result: 'confirmed with organiser', checked_by: auth.user!.id })
}, t('common.saved'))

/** Publishing an activity also publishes its venue (otherwise the public card would lose its location). */
async function setPublished(a: any, publish: boolean) {
  await act(async () => {
    if (publish && a.venue_id && a.venues?.status !== 'published') {
      const v = await db().from('venues').update({ status: 'published' }).eq('id', a.venue_id)
      if (v.error) return v
    }
    return db().from('activities').update({ status: publish ? 'published' : 'draft' }).eq('id', a.id)
  }, t('common.saved'))
}
</script>

<template>
  <main id="main" class="wrap">
    <h1 style="font-size: clamp(36px, 7vw, 64px)">{{ $t('admin.title') }}</h1>
    <p v-if="!auth.isAdmin" class="notice">{{ $t('admin.notAdmin') }}</p>
    <template v-else>
      <div class="chips" role="tablist">
        <button role="tab" class="chip" :aria-selected="view === 'todo'" :aria-pressed="view === 'todo'" @click="view = 'todo'">{{ $t('soc.adminTodo') }} ({{ todoCount }})</button>
 <button role="tab" class="chip" :aria-selected="view === 'stats'" :aria-pressed="view === 'stats'" @click="view = 'stats'">{{ $t('soc.adminOverview') }}</button>
 <button role="tab" class="chip" :aria-selected="view === 'crm'" :aria-pressed="view === 'crm'" @click="view = 'crm'">{{ $t('crm.tab') }}</button>
        <button role="tab" class="chip" :aria-selected="view === 'ref'" :aria-pressed="view === 'ref'" @click="view = 'ref'">{{ $t('soc.adminEverything') }}</button>
      </div>
      <p v-if="view === 'todo'" class="small muted" style="margin: 0">{{ $t('soc.adminTodoNote') }}</p>
      <div v-if="view === 'ref'" class="chips" role="tablist">
        <button v-for="tb in (['leads', 'proposals', 'drafts', 'sources', 'runs'] as Tab[])" :key="tb" role="tab" class="chip small" :aria-selected="tab === tb" :aria-pressed="tab === tb" @click="tab = tb">
          {{ $t(`admin.${tb}`) }}
          <span v-if="tb === 'leads'">({{ leads.length }})</span>
          <span v-if="tb === 'proposals'">({{ proposals.length }})</span>
        </button>
      </div>
      <AdminCrm v-if="view === 'crm'" />

      <section v-if="view === 'stats'" class="stack" aria-live="polite">
        <p v-if="!stats" class="muted">{{ $t('common.loading') }}</p>
        <template v-else>
          <div class="row">
            <a v-if="sheetUrl" class="btn primary" :href="sheetUrl" target="_blank" rel="noopener noreferrer">📊 {{ $t('soc.adminSheet') }}</a>
            <button class="btn" @click="loadStats">{{ $t('soc.adminRefresh') }}</button>
          </div>
          <p v-if="sheetUrl" class="tiny muted" style="margin: 0">{{ $t('soc.adminSheetNote') }}</p>

          <h2 class="sh">{{ $t('soc.adminPeople') }}</h2>
          <div class="tiles">
            <div class="tile"><strong>{{ stats.users.total }}</strong><span>{{ $t('soc.sUsers') }}</span></div>
            <div class="tile"><strong>{{ stats.users.new7 }}</strong><span>{{ $t('soc.sNew7') }}</span></div>
            <div class="tile"><strong>{{ stats.users.new30 }}</strong><span>{{ $t('soc.sNew30') }}</span></div>
            <div class="tile"><strong>{{ stats.users.confirmed }}</strong><span>{{ $t('soc.sConfirmed') }}</span></div>
          </div>
          <div class="bars" :aria-label="$t('soc.sWeekly')">
            <span class="tiny muted">{{ $t('soc.sWeekly') }}</span>
            <div class="wk"><div v-for="w in stats.users.weekly" :key="w.week" class="wcol" :title="`${f.date(w.week)}: ${w.n}`"><i :style="{ height: (w.n / maxWeek) * 52 + 'px' }" /><span class="tiny">{{ w.n }}</span></div></div>
          </div>

          <h2 class="sh">{{ $t('soc.adminUsage') }}</h2>
          <div class="tiles">
            <div class="tile"><strong>{{ stats.usage.families_with_week }}</strong><span>{{ $t('soc.sWithWeek') }}</span></div>
            <div class="tile"><strong>{{ stats.usage.families_with_plan }}</strong><span>{{ $t('soc.sWithPlan') }}</span></div>
            <div class="tile"><strong>{{ stats.usage.plan_items }}</strong><span>{{ $t('soc.sPlanItems') }}</span></div>
            <div class="tile"><strong>{{ stats.usage.own_events }}</strong><span>{{ $t('soc.sOwnEvents') }}</span></div>
            <div class="tile"><strong>{{ stats.usage.friend_pairs }}</strong><span>{{ $t('soc.sFriends') }}</span></div>
            <div class="tile"><strong>{{ stats.usage.event_invites }}</strong><span>{{ $t('soc.sInvites') }}</span></div>
            <div class="tile"><strong>{{ stats.usage.favourites }}</strong><span>{{ $t('soc.sFavs') }}</span></div>
            <div class="tile"><strong>{{ stats.usage.emails_30d }}</strong><span>{{ $t('soc.sEmails') }}</span></div>
          </div>
          <p class="tiny muted" style="margin: 0">{{ $t('soc.adminNoTracking') }}</p>

          <h2 class="sh">{{ $t('soc.adminCatalogue') }}</h2>
          <div class="tiles">
            <div class="tile"><strong>{{ stats.catalogue.activities }}</strong><span>{{ $t('soc.sOffers') }}</span></div>
            <div class="tile"><strong>{{ stats.catalogue.verified }}</strong><span>{{ $t('soc.sVerified') }}</span></div>
            <div class="tile"><strong>{{ stats.catalogue.upcoming_dates }}</strong><span>{{ $t('soc.sDates') }}</span></div>
            <div class="tile"><strong>{{ stats.catalogue.places }}</strong><span>{{ $t('soc.sPlaces') }}</span></div>
            <div class="tile"><strong>{{ stats.catalogue.providers_with_offers }}</strong><span>{{ $t('soc.sProviders') }}</span></div>
            <div class="tile"><strong>{{ stats.catalogue.stale_90d }}</strong><span>{{ $t('soc.sStale') }}</span></div>
            <div class="tile"><strong>{{ stats.leads.open_from_people }}</strong><span>{{ $t('soc.sOpenLeads') }}</span></div>
            <div v-if="srcInfo" class="tile"><strong>{{ srcInfo.new_listings }}</strong><span>{{ $t('soc.sNewFound') }}</span></div>
            <div v-if="srcInfo" class="tile"><strong>{{ srcInfo.changed_unreviewed }}</strong><span>{{ $t('soc.sSrcChanged') }}</span></div>
            <div v-if="srcInfo" class="tile"><strong>{{ srcInfo.failing }}</strong><span>{{ $t('soc.sSrcFailing') }}</span></div>
            <div class="tile"><strong>{{ stats.catalogue.last_refresh ? f.date(stats.catalogue.last_refresh, { day: 'numeric', month: 'numeric', year: 'numeric' }) : '—' }}</strong><span>{{ $t('soc.sLastRefresh') }}</span></div>
          </div>
          <h3 class="small" style="margin: 6px 0 0">{{ $t('soc.sByCategory') }}</h3>
          <ul class="hbars">
            <li v-for="c in byCategory" :key="c.key"><span class="lab">{{ $t(`tax.main.${c.key}`) }}</span><i :style="{ width: (c.n / maxCat) * 100 + '%' }" /><b>{{ c.n }}</b></li>
          </ul>
          <h3 class="small" style="margin: 6px 0 0">{{ $t('soc.sBySource') }}</h3>
          <ul class="hbars plain">
            <li v-for="o in stats.catalogue.by_origin" :key="o.origin"><span class="lab">{{ originLabel[o.origin] ?? o.origin }}</span><b>{{ o.n }}</b></li>
          </ul>
        </template>
      </section>

      <p v-if="view === 'todo' && !todoCount" class="notice" role="status">✓ {{ $t('soc.adminNothing') }}</p>
      <div v-if="msg" class="notice" :class="msg.kind" role="status">{{ msg.text }}</div>

      <section v-if="(view === 'todo' && leadList.length) || (view === 'ref' && tab === 'leads')" class="stack">
        <h2 v-if="view === 'todo'" class="sh">{{ $t('soc.adminTodoLeads') }}</h2>
        <p v-if="!leadList.length" class="muted">{{ $t('admin.none') }}</p>
        <article v-for="l in leadList" :key="l.id" class="panel stack" style="gap: 6px">
          <strong>{{ l.name || l.url }}</strong>
          <a v-if="l.url" :href="l.url" target="_blank" rel="noopener noreferrer" class="small" style="word-break: break-all">{{ l.url }}</a>
          <p v-if="l.note" class="small" style="margin: 0">{{ l.note }}</p>
          <span class="tiny muted">{{ $t('admin.origin') }}: {{ l.origin }} · {{ $t('admin.submitted', { date: f.date(l.created_at.slice(0, 10)) }) }}<template v-if="l.status_note"> · {{ l.status_note }}</template></span>
          <label class="row small">{{ $t('admin.markAs') }}
            <select class="input" style="width: auto" :value="l.status" @change="setLeadStatus(l.id, ($event.target as HTMLSelectElement).value)">
              <option v-for="s in LEAD_STATUSES" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
        </article>
      </section>

      <section v-if="(view === 'todo' && proposals.length) || (view === 'ref' && tab === 'proposals')" class="stack">
        <h2 v-if="view === 'todo'" class="sh">{{ $t('admin.proposals') }}</h2>
        <p v-if="!proposals.length" class="muted">{{ $t('admin.none') }}</p>
        <article v-for="p in proposals" :key="p.id" class="panel stack">
          <strong>{{ p.action }} · {{ p.target_table }}<template v-if="p.target_id"> · {{ p.target_id }}</template></strong>
          <span v-if="p.summary">{{ p.summary }}</span>
          <a v-if="p.evidence_url" :href="p.evidence_url" target="_blank" rel="noopener noreferrer" class="small">{{ p.evidence_url }}</a>
          <label class="field"><span>{{ $t('admin.payload') }}</span><textarea v-model="payloads[p.id]" class="input mono" rows="8" /></label>
          <div class="row">
            <button class="btn primary" @click="apply(p.id)">{{ $t('admin.approve') }}</button>
            <button class="btn" @click="reject(p.id)">{{ $t('admin.reject') }}</button>
          </div>
        </article>
      </section>

      <section v-if="(view === 'todo' && todoDrafts.length) || (view === 'ref' && tab === 'drafts')" class="stack">
        <h2 v-if="view === 'todo'" class="sh">{{ $t('soc.adminTodoDrafts') }}</h2>
        <div v-if="view === 'ref'" class="row">
          <select v-model="draftFilter" class="input" style="width: auto" aria-label="filter">
            <option value="drafts">{{ $t('ui.admin.showDrafts') }}</option>
            <option value="feed">{{ $t('ui.admin.showFeed') }}</option>
            <option value="confirmed">{{ $t('ui.admin.showConfirmed') }}</option>
          </select>
          <input v-model.trim="draftQuery" type="search" class="input pill" :placeholder="$t('ui.admin.search')" style="flex: 1 1 220px; max-width: 360px" />
        </div>
        <p v-if="view === 'ref' && drafts.length >= DRAFT_LIMIT" class="tiny muted">{{ $t('ui.admin.limited', { n: DRAFT_LIMIT }) }}</p>
        <p v-if="!draftRows.length" class="muted">{{ $t('admin.none') }}</p>
        <table class="tbl">
          <tbody>
            <tr v-for="a in draftRows" :key="a.id">
              <td><RouterLink :to="{ name: 'activity', params: { id: a.id } }">{{ a.title }}</RouterLink><div class="tiny muted">{{ a.venues?.name }}</div></td>
              <td><span class="badge" :class="a.verification === 'provider_verified' ? 'ok' : 'warn'">{{ $t(`card.verification.${a.verification}`) }}</span></td>
              <td class="small">{{ a.last_checked_on ?? '—' }}</td>
              <td>
                <span class="row">
                  <button v-if="a.status === 'draft'" class="btn small primary" @click="setPublished(a, true)">{{ $t('admin.publish') }}</button>
                  <button v-else class="btn small" @click="setPublished(a, false)">{{ $t('admin.unpublish') }}</button>
                  <button v-if="a.verification !== 'provider_verified'" class="btn small" @click="promote(a)">{{ $t('ui.admin.promote') }}</button>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="view === 'ref' && tab === 'sources'" class="stack">
        <p class="small muted" style="margin: 0">{{ $t('soc.srcNote') }}</p>
        <h2 class="sh">{{ $t('soc.foundTitle') }} ({{ found.length }})</h2>
        <p class="small muted" style="margin: 0">{{ $t('soc.foundNote') }}</p>
        <p v-if="!found.length" class="muted">{{ $t('admin.none') }}</p>
        <table v-else class="tbl">
          <tbody>
            <tr v-for="x in found" :key="x.id">
              <td><strong>{{ x.title }}</strong><div class="tiny muted">{{ x.location_text }}</div></td>
              <td class="small">{{ x.start_date ? f.date(x.start_date, { day: 'numeric', month: 'numeric', year: 'numeric' }) : '—' }} {{ x.start_time ? x.start_time.slice(0, 5) : '' }}<div v-if="x.rrule" class="tiny muted">{{ $t('soc.foundRepeats') }}</div></td>
              <td><span class="badge" :class="x.from_provider ? 'ok' : 'warn'">{{ x.from_provider ? $t('soc.foundProvider') : $t('soc.foundAggregator') }}</span><div class="tiny muted">{{ x.field_main ? $t(`tax.main.${x.field_main}`) : '' }}</div></td>
              <td><span class="row"><a v-if="x.event_url" class="btn small" :href="x.event_url" target="_blank" rel="noopener noreferrer">↗</a><button class="btn small" @click="ignoreFound(x.id)">{{ $t('soc.foundIgnore') }}</button></span></td>
            </tr>
          </tbody>
        </table>
        <h2 class="sh">{{ $t('soc.srcTitle') }}</h2>
        <p v-if="!sources.length" class="muted">{{ $t('admin.none') }}</p>
        <table class="tbl">
          <tbody>
            <tr v-for="x in sources" :key="x.id">
              <td><a :href="x.url" target="_blank" rel="noopener noreferrer" style="word-break: break-all">{{ x.url }}</a><div class="tiny muted">{{ x.scope }}</div></td>
              <td><span class="badge" :class="isChanged(x) ? 'warn' : x.status === 'paused' || x.fail_streak ? 'warn' : 'ok'">{{ isChanged(x) ? $t('soc.srcChanged') : x.status === 'paused' ? $t('soc.srcPaused') : x.fail_streak ? $t('soc.srcFailing') : $t('soc.srcOk') }}</span><div class="tiny muted">{{ x.last_note }}</div></td>
              <td class="small">{{ x.last_success_at ? f.date(x.last_success_at.slice(0, 10), { day: 'numeric', month: 'numeric', year: 'numeric' }) : '—' }}<div class="tiny muted">{{ $t('soc.srcEvery', { n: x.interval_days }) }}</div></td>
              <td><span class="row">
                <button v-if="isChanged(x)" class="btn small" @click="markReviewed(x.id)">{{ $t('soc.srcReviewed') }}</button>
                <button v-if="x.status === 'paused'" class="btn small" @click="setSourceStatus(x.id, 'active')">{{ $t('soc.srcResume') }}</button>
                <button v-else class="btn small" @click="setSourceStatus(x.id, 'paused')">{{ $t('soc.srcPause') }}</button>
              </span></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="view === 'ref' && tab === 'runs'" class="stack">
        <ul class="log">
          <li v-for="r in runs" :key="r.id"><strong>{{ r.run_date }}</strong> · {{ r.description }} <span class="tiny muted">({{ r.origin }})</span></li>
        </ul>
        <h2 style="font-size: 22px; font-weight: 400">{{ $t('admin.checks') }}</h2>
        <ul class="log">
          <li v-for="c in checks" :key="c.id"><span class="badge" :class="c.outcome === 'failed' ? 'warn' : 'ok'">{{ c.outcome }}</span> {{ c.checked_on ?? '—' }} · <span style="word-break: break-all">{{ c.sources?.url }}</span> <span class="tiny muted">{{ c.note }}</span></li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.sh { font-size: 24px; font-weight: 400; margin: 10px 0 0; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.tile { border: 1px solid var(--line); border-radius: 16px; padding: 12px 14px; display: grid; gap: 2px; background: #fff; }
.tile strong { font-size: 30px; font-weight: 300; line-height: 1.1; }
.tile span { font-size: 13px; color: var(--muted); }
.wk { display: flex; gap: 8px; align-items: flex-end; height: 76px; }
.wcol { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 2px; width: 34px; }
.wcol i { display: block; width: 100%; background: var(--magenta); border-radius: 4px 4px 0 0; min-height: 2px; }
.hbars { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.hbars li { display: grid; grid-template-columns: minmax(120px, 220px) 1fr auto; gap: 10px; align-items: center; }
.hbars.plain li { grid-template-columns: 1fr auto; }
.hbars i { display: block; height: 14px; background: var(--yellow); border: 1px solid var(--ink); border-radius: 8px; min-width: 2px; }
.hbars .lab { font-size: 14px; }
.mono { font-family: ui-monospace, monospace; font-size: 13px; }
.tbl { width: 100%; border-collapse: collapse; }
.tbl td { padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
.log { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.chip[aria-selected='true'] { background: var(--ink); color: #fff; }
@media (max-width: 640px) { .tbl td { display: block; border: 0; padding: 4px 0; } .tbl tr { display: block; border-bottom: 1px solid var(--line); padding: 8px 0; } }
</style>
