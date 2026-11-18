<script setup lang="ts">
// Admin review. Every action here is also enforced server-side by RLS / app.is_admin().
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { db } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { useCatalogue } from '@/stores/catalogue'
import { useFormat } from '@/composables/useFormat'

const { t } = useI18n()
const auth = useAuth()
const cat = useCatalogue()
const f = useFormat()

type Tab = 'leads' | 'proposals' | 'drafts' | 'runs'
const tab = ref<Tab>('leads')
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
        <button v-for="tb in (['leads', 'proposals', 'drafts', 'runs'] as Tab[])" :key="tb" role="tab" class="chip" :aria-selected="tab === tb" :aria-pressed="tab === tb" @click="tab = tb">
          {{ $t(`admin.${tb}`) }}
          <span v-if="tb === 'leads'">({{ leads.filter((l) => l.status === 'new').length }})</span>
          <span v-if="tb === 'proposals'">({{ proposals.length }})</span>
        </button>
      </div>
      <div v-if="msg" class="notice" :class="msg.kind" role="status">{{ msg.text }}</div>

      <section v-if="tab === 'leads'" class="stack">
        <p v-if="!leads.length" class="muted">{{ $t('admin.none') }}</p>
        <article v-for="l in leads" :key="l.id" class="panel stack" style="gap: 6px">
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

      <section v-if="tab === 'proposals'" class="stack">
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

      <section v-if="tab === 'drafts'" class="stack">
        <div class="row">
          <select v-model="draftFilter" class="input" style="width: auto" aria-label="filter">
            <option value="drafts">{{ $t('ui.admin.showDrafts') }}</option>
            <option value="feed">{{ $t('ui.admin.showFeed') }}</option>
            <option value="confirmed">{{ $t('ui.admin.showConfirmed') }}</option>
          </select>
          <input v-model.trim="draftQuery" type="search" class="input pill" :placeholder="$t('ui.admin.search')" style="flex: 1 1 220px; max-width: 360px" />
        </div>
        <p v-if="drafts.length >= DRAFT_LIMIT" class="tiny muted">{{ $t('ui.admin.limited', { n: DRAFT_LIMIT }) }}</p>
        <p v-if="!drafts.length" class="muted">{{ $t('admin.none') }}</p>
        <table class="tbl">
          <tbody>
            <tr v-for="a in drafts" :key="a.id">
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

      <section v-if="tab === 'runs'" class="stack">
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
.mono { font-family: ui-monospace, monospace; font-size: 13px; }
.tbl { width: 100%; border-collapse: collapse; }
.tbl td { padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
.log { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.chip[aria-selected='true'] { background: var(--ink); color: #fff; }
@media (max-width: 640px) { .tbl td { display: block; border: 0; padding: 4px 0; } .tbl tr { display: block; border-bottom: 1px solid var(--line); padding: 8px 0; } }
</style>
