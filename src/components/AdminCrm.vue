<script setup lang="ts">
// Provider outreach (who was asked, who said what) and the list of funding options. Admin only; every query is also limited by RLS.
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { db } from '@/lib/supabase'
import { useCatalogue } from '@/stores/catalogue'
import { useFormat } from '@/composables/useFormat'
import { buildEmail, type Kind, type Lang } from '@/domain/outreach'

const { t } = useI18n()
const cat = useCatalogue()
const f = useFormat()
interface Org { id: string; name: string; host: string | null; website: string | null; segment: string | null; language: Lang; status: string; notes: string | null }
interface Contact { id: string; organisation_id: string; name: string | null; role: string | null; email: string | null; source_url: string | null; do_not_contact: boolean }
interface Inter { id: string; organisation_id: string; kind: string; occurred_on: string; summary: string | null }
interface Fund { id: string; name: string; funder: string; level: string; url: string | null; what_it_funds: string | null; eligibility: string | null; deadline_text: string | null; amount_text: string | null; requires_legal_entity: boolean | null; fit: string; status: string; next_step: string | null; source_checked_on: string | null; notes: string | null }

const sub = ref<'providers' | 'funding'>('providers')
const orgs = ref<Org[]>([]); const contacts = ref<Contact[]>([]); const inters = ref<Inter[]>([]); const funds = ref<Fund[]>([])
const msg = ref<string | null>(null); const err = ref<string | null>(null)
const q = ref(''); const statusF = ref('all'); const open = ref<string | null>(null)
const STATUSES = ['open', 'qualified', 'contacted', 'yes', 'no', 'no_reply', 'later']

async function load() {
  const s = db()
  const [o, c, i, fu] = await Promise.all([
    s.from('crm_organisations').select('*').order('name'), s.from('crm_contacts').select('*'),
    s.from('crm_interactions').select('*').order('occurred_on', { ascending: false }).order('created_at', { ascending: false }),
    s.from('funding_opportunities').select('*').order('created_at'),
  ])
  const e = o.error ?? c.error ?? i.error ?? fu.error
  if (e) { err.value = e.message; return }
  orgs.value = o.data as Org[]; contacts.value = c.data as Contact[]; inters.value = i.data as Inter[]; funds.value = fu.data as Fund[]
}
onMounted(() => { void load(); void cat.load() })
async function act(fn: () => PromiseLike<{ error: { message: string } | null }>) {
  err.value = null; msg.value = null
  const r = await fn()
  if (r.error) { err.value = r.error.message; return false }
  msg.value = t('crm.noteSaved'); await load(); return true
}

const counts = computed(() => { const m: Record<string, number> = { all: orgs.value.length }; for (const o of orgs.value) m[o.status] = (m[o.status] ?? 0) + 1; return m })
const shown = computed(() => orgs.value.filter((o) => (statusF.value === 'all' || o.status === statusF.value)
  && (!q.value.trim() || `${o.name} ${o.host ?? ''} ${contacts.value.filter((c) => c.organisation_id === o.id).map((c) => c.email).join(' ')}`.toLowerCase().includes(q.value.trim().toLowerCase()))))
const contactsOf = (id: string) => contacts.value.filter((c) => c.organisation_id === id)
const historyOf = (id: string) => inters.value.filter((x) => x.organisation_id === id)
const hostOf = (o: Org) => (o.host ?? '').replace(/^www\./, '')
const offersOf = (o: Org) => cat.cards.filter((a) => a.organiser_url && hostOf(o) && new URL(a.organiser_url).host.replace(/^www\./, '') === hostOf(o))
const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); msg.value = t('crm.copied') } catch { err.value = text } }

const setStatus = (o: Org, status: string) => act(() => db().from('crm_organisations').update({ status }).eq('id', o.id))
const setLang = (o: Org, language: string) => act(() => db().from('crm_organisations').update({ language }).eq('id', o.id))
const log = (o: Org, kind: string, summary: string | null, status?: string) => act(async () => {
  const r = await db().from('crm_interactions').insert({ organisation_id: o.id, kind, summary })
  if (r.error || !status) return r
  return db().from('crm_organisations').update({ status }).eq('id', o.id)
})

// add contact
const nc = reactive({ name: '', role: '', email: '', source_url: '' })
async function addContact(o: Org) {
  if (!nc.email.trim() && !nc.name.trim()) return
  const ok = await act(() => db().from('crm_contacts').insert({ organisation_id: o.id, name: nc.name.trim() || null, role: nc.role.trim() || null, email: nc.email.trim() || null, source_url: nc.source_url.trim() || null, verified_on: new Date().toISOString().slice(0, 10) }))
  if (ok) Object.assign(nc, { name: '', role: '', email: '', source_url: '' })
}
const toggleDnc = (c: Contact) => act(() => db().from('crm_contacts').update({ do_not_contact: !c.do_not_contact }).eq('id', c.id))

// e-mail draft: filled in from the organisation, editable, copied into the owner's own mail program
const draft = reactive({ org: '' as string, kind: 'ask' as Kind, lang: 'de' as Lang, subject: '', body: '' })
function prepare(o: Org, kind: Kind = draft.kind, lang: Lang = o.language) {
  const m = buildEmail(lang, kind, { name: o.name, examples: offersOf(o).map((a) => a.title), link: window.location.origin })
  Object.assign(draft, { org: o.id, kind, lang, subject: m.subject, body: m.body })
}
const note = ref('')
const addNote = (o: Org) => { const s = note.value.trim(); if (s) { void log(o, 'note', s); note.value = '' } }

const setFund = (x: Fund, patch: Partial<Fund>) => act(() => db().from('funding_opportunities').update(patch).eq('id', x.id))
const kindLabel = (k: string) => ({ email_sent: '✉', reply: '↩', call: '☎', meeting: '👥', note: '📝' } as Record<string, string>)[k] ?? k
</script>

<template>
  <section class="stack">
    <div class="chips" role="tablist">
      <button class="chip small" role="tab" :aria-pressed="sub === 'providers'" @click="sub = 'providers'">{{ $t('crm.providers') }} ({{ orgs.length }})</button>
      <button class="chip small" role="tab" :aria-pressed="sub === 'funding'" @click="sub = 'funding'">{{ $t('crm.funding') }} ({{ funds.length }})</button>
    </div>
    <div v-if="err" class="notice error" role="alert">{{ err }}</div>
    <div v-else-if="msg" class="notice" role="status">{{ msg }}</div>

    <template v-if="sub === 'providers'">
      <p class="tiny muted" style="margin: 0">{{ $t('crm.privacy') }}</p>
      <div class="row">
        <input v-model.trim="q" type="search" class="input pill" :placeholder="$t('crm.search')" style="flex: 1 1 240px; max-width: 380px" />
      </div>
      <div class="chips">
        <button class="chip small" :aria-pressed="statusF === 'all'" @click="statusF = 'all'">{{ $t('crm.all') }} ({{ counts.all }})</button>
        <button v-for="s in STATUSES" :key="s" class="chip small" :aria-pressed="statusF === s" @click="statusF = s">{{ $t('crm.status.' + s) }} ({{ counts[s] ?? 0 }})</button>
      </div>
      <p v-if="!shown.length" class="muted">{{ $t('crm.none') }}</p>
      <article v-for="o in shown" :key="o.id" class="panel stack org">
        <div class="head">
          <div>
            <strong>{{ o.name }}</strong>
            <div class="tiny muted"><a v-if="o.website" :href="o.website" target="_blank" rel="noopener noreferrer">{{ hostOf(o) }}</a> · {{ o.segment }} · {{ $t('crm.offers', { n: offersOf(o).length }) }}<template v-if="historyOf(o.id)[0]"> · {{ $t('crm.lastContact') }}: {{ f.date(historyOf(o.id)[0]!.occurred_on, { day: 'numeric', month: 'numeric', year: 'numeric' }) }}</template></div>
          </div>
          <label class="row small">
            <select class="input" style="width: auto" :value="o.status" aria-label="Status" @change="setStatus(o, ($event.target as HTMLSelectElement).value)">
              <option v-for="s in STATUSES" :key="s" :value="s">{{ $t('crm.status.' + s) }}</option>
            </select>
          </label>
        </div>
        <ul v-if="contactsOf(o.id).length" class="cl">
          <li v-for="c in contactsOf(o.id)" :key="c.id" :class="{ dnc: c.do_not_contact }">
            <span><strong>{{ c.email ?? c.name }}</strong><span v-if="c.name && c.email" class="tiny muted"> · {{ c.name }}</span><span v-if="c.role" class="tiny muted"> · {{ c.role }}</span>
              <a v-if="c.source_url" :href="c.source_url" target="_blank" rel="noopener noreferrer" class="tiny"> ↗</a></span>
            <span class="row">
              <button v-if="c.email" class="btn small" @click="copy(c.email)">{{ $t('crm.copyTo') }}</button>
              <button class="btn small" @click="toggleDnc(c)">{{ c.do_not_contact ? $t('crm.undoDnc') : $t('crm.doNotContact') }}</button>
            </span>
          </li>
        </ul>
        <p v-else class="small muted" style="margin: 0">{{ $t('crm.noContacts') }}</p>
        <div class="row">
          <button class="btn small primary" @click="open = open === o.id ? null : o.id; prepare(o)">{{ $t('crm.prepare') }}</button>
          <button class="btn small" @click="log(o, 'reply', null, 'yes')">{{ $t('crm.replyYes') }}</button>
          <button class="btn small" @click="log(o, 'reply', null, 'no')">{{ $t('crm.replyNo') }}</button>
          <button class="btn small" @click="log(o, 'note', null, 'later')">{{ $t('crm.replyLater') }}</button>
        </div>

        <div v-if="open === o.id" class="stack drawer">
          <div class="row">
            <label class="small">{{ $t('crm.language') }}
              <select v-model="draft.lang" class="input" style="width: auto" @change="prepare(o, draft.kind, draft.lang); setLang(o, draft.lang)"><option v-for="l in ['de', 'en', 'fr', 'it']" :key="l" :value="l">{{ l.toUpperCase() }}</option></select></label>
            <label class="small">{{ $t('crm.kindAsk') }} / {{ $t('crm.kindReminder') }}
              <select v-model="draft.kind" class="input" style="width: auto" @change="prepare(o, draft.kind, draft.lang)"><option value="ask">{{ $t('crm.kindAsk') }}</option><option value="reminder">{{ $t('crm.kindReminder') }}</option></select></label>
          </div>
          <label class="field"><span>{{ $t('crm.subject') }}</span><input v-model="draft.subject" class="input" /></label>
          <label class="field"><span>{{ $t('crm.text') }}</span><textarea v-model="draft.body" class="input" rows="14" /></label>
          <div class="row">
            <button class="btn small" @click="copy(draft.subject)">{{ $t('crm.copy') }}: {{ $t('crm.subject') }}</button>
            <button class="btn small primary" @click="copy(draft.body)">{{ $t('crm.copy') }}: {{ $t('crm.text') }}</button>
            <button class="btn small" @click="log(o, 'email_sent', draft.subject, 'contacted'); open = null">{{ $t('crm.markSent') }}</button>
          </div>
          <p class="tiny muted" style="margin: 0">{{ $t('crm.sentHint') }}</p>

          <h4 class="small" style="margin: 6px 0 0">{{ $t('crm.addContact') }}</h4>
          <div class="grid2">
            <input v-model.trim="nc.email" class="input" :placeholder="$t('crm.email')" type="email" />
            <input v-model.trim="nc.name" class="input" :placeholder="$t('crm.name')" />
            <input v-model.trim="nc.role" class="input" :placeholder="$t('crm.role')" />
            <input v-model.trim="nc.source_url" class="input" :placeholder="$t('crm.sourceUrl')" />
          </div>
          <div><button class="btn small" @click="addContact(o)">{{ $t('crm.save') }}</button></div>

          <h4 class="small" style="margin: 6px 0 0">{{ $t('crm.log') }}</h4>
          <ul class="hist"><li v-for="h in historyOf(o.id).slice(0, 8)" :key="h.id">{{ kindLabel(h.kind) }} <span class="tiny muted">{{ f.date(h.occurred_on, { day: 'numeric', month: 'numeric', year: 'numeric' }) }}</span> {{ h.summary }}</li></ul>
          <div class="row"><input v-model="note" class="input" :placeholder="$t('crm.note')" style="flex: 1" @keyup.enter="addNote(o)" /><button class="btn small" @click="addNote(o)">{{ $t('crm.addNote') }}</button></div>
        </div>
      </article>
    </template>

    <template v-else>
      <p class="tiny muted" style="margin: 0">{{ $t('crm.verifyNote') }}</p>
      <article v-for="x in funds" :key="x.id" class="panel stack">
        <div class="head">
          <div><strong>{{ x.name }}</strong><div class="tiny muted">{{ x.funder }}<template v-if="x.source_checked_on"> · {{ $t('crm.checkedOn', { date: f.date(x.source_checked_on, { day: 'numeric', month: 'numeric', year: 'numeric' }) }) }}</template></div></div>
          <span class="row">
            <select class="input" style="width: auto" :value="x.fit" @change="setFund(x, { fit: ($event.target as HTMLSelectElement).value })"><option v-for="k in ['good', 'maybe', 'unclear']" :key="k" :value="k">{{ $t('crm.fits.' + k) }}</option></select>
            <select class="input" style="width: auto" :value="x.status" @change="setFund(x, { status: ($event.target as HTMLSelectElement).value })"><option v-for="k in ['idea', 'checking', 'preparing', 'submitted', 'granted', 'declined', 'not_eligible']" :key="k" :value="k">{{ $t('crm.fstatus.' + k) }}</option></select>
          </span>
        </div>
        <p v-if="x.what_it_funds" class="small" style="margin: 0"><strong>{{ $t('crm.whatFunds') }}:</strong> {{ x.what_it_funds }}</p>
        <p v-if="x.eligibility" class="small" style="margin: 0"><strong>{{ $t('crm.eligibility') }}:</strong> {{ x.eligibility }}</p>
        <p v-if="x.requires_legal_entity" class="tiny" style="margin: 0">⚠ {{ $t('crm.legalEntity') }}</p>
        <p v-if="x.notes" class="tiny muted" style="margin: 0">{{ x.notes }}</p>
        <label class="field"><span>{{ $t('crm.nextStep') }}</span><textarea class="input" rows="2" :value="x.next_step ?? ''" @change="setFund(x, { next_step: ($event.target as HTMLTextAreaElement).value || null })" /></label>
        <div><a v-if="x.url" class="btn small" :href="x.url" target="_blank" rel="noopener noreferrer">{{ $t('crm.open') }} ↗</a></div>
      </article>
    </template>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.cl, .hist { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.cl li { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; align-items: center; }
.cl li.dnc { opacity: .5; text-decoration: line-through; }
.drawer { border-top: 1px solid var(--line); padding-top: 12px; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
</style>
