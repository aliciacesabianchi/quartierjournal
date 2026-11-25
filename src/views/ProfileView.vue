<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMe } from '@/stores/me'
import { useAuth } from '@/stores/auth'
import { useCatalogue } from '@/stores/catalogue'
import { useFormat } from '@/composables/useFormat'
import { db } from '@/lib/supabase'
import { ageInMonths, todayInZurich } from '@/domain/time'
import UserAvatar from '@/components/UserAvatar.vue'
import { AVATAR_KINDS } from '@/domain/avatars'
import { squareJpeg } from '@/lib/image'
import { LOCALES, LOCALE_LABELS, setLocale, type Locale } from '@/i18n'

const { t } = useI18n()
const me = useMe()
const auth = useAuth()
const cat = useCatalogue()
const f = useFormat()
const router = useRouter()
cat.load()

const form = reactive({ display_name: '', home_district_id: null as number | null, locale: 'de', email_plan_confirmations: true })
watch(() => me.profile, (p) => { if (p) Object.assign(form, { display_name: p.display_name ?? '', home_district_id: p.home_district_id, locale: p.locale, email_plan_confirmations: p.email_plan_confirmations !== false }) }, { immediate: true })

const msg = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
async function save() {
  msg.value = null
  try {
    await me.updateProfile({ display_name: form.display_name.trim() || null, home_district_id: form.home_district_id, locale: form.locale, ...(form.email_plan_confirmations !== (me.profile?.email_plan_confirmations !== false) ? { email_plan_confirmations: form.email_plan_confirmations } : {}) })
    setLocale(form.locale as Locale)
    msg.value = { kind: 'ok', text: t('common.saved') }
  } catch (e) { msg.value = { kind: 'error', text: t('auth.errors.generic', { msg: (e as Error).message }) } }
}

const photoMsg = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const photoBusy = ref(false)
async function pickAvatar(kind: (typeof AVATAR_KINDS)[number] | null) {
  photoMsg.value = null
  try { await me.chooseAvatar(kind) } catch (e) { photoMsg.value = { kind: 'error', text: t('auth.errors.generic', { msg: (e as Error).message }) } }
}
async function onPhoto(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  photoMsg.value = null; photoBusy.value = true
  try { await me.uploadPhoto(await squareJpeg(file)); photoMsg.value = { kind: 'ok', text: t('common.saved') } }
  catch (err) { const m = (err as Error).message; photoMsg.value = { kind: 'error', text: m === 'type' || m === 'size' ? t('soc.photoErr') : t('auth.errors.generic', { msg: m }) } }
  finally { photoBusy.value = false }
}

const thisYear = Number(todayInZurich().slice(0, 4))
const YEARS = Array.from({ length: 8 }, (_, i) => thisYear - i)
const child = reactive({ nickname: '', birth_year: thisYear - 1, birth_month: 1 })
const childErr = ref<string | null>(null)
async function addChild() {
  childErr.value = null
  try {
    await me.addChild({ nickname: child.nickname.trim() || null, birth_year: child.birth_year, birth_month: child.birth_month })
    child.nickname = ''
  } catch (e) { childErr.value = (e as Error).message }
}
function ageLabel(y: number | null, m: number | null) {
  if (!y || !m) return ''
  const mo = ageInMonths(y, m, todayInZurich())
  return mo < 24 ? t('common.months', { n: mo }) : t('common.years', { n: Math.floor(mo / 12) })
}
const monthName = (m: number) => new Intl.DateTimeFormat(f.intl(), { month: 'long' }).format(new Date(2024, m - 1, 1))

// summary line under the name, e.g. "Zürich · Kreis 5 · Lea"
const kreisNumber = computed(() => cat.districts.find((d) => d.id === me.profile?.home_district_id)?.number ?? null)
const summary = computed(() => ['Zürich', kreisNumber.value ? f.kreis(kreisNumber.value) : '', ...me.children.map((c) => c.nickname).filter(Boolean)].filter(Boolean).join(' · '))

const favCards = computed(() => cat.cards.filter((c) => me.favourites.has(c.id)))
const planRows = computed(() => me.plan.map((p) => {
  const a = cat.byId(p.activity_id)
  const tp = a?.templates.find((x) => x.id === p.template_id)
  const oc = a?.upcoming.find((x) => x.id === p.occurrence_id)
  const when = tp ? `${f.day(tp.weekday, 'long')} ${f.time(tp.start, tp.end)}` : oc ? `${f.date(oc.date)} ${f.time(oc.start, oc.end)}` : ''
  return { p, a, when }
}))

async function logout() { await auth.logout(); router.push({ name: 'home' }) }
const deleting = ref(false)
async function deleteAccount() {
  if (!window.confirm(t('profile.deleteConfirm'))) return
  deleting.value = true
  const { error } = await db().rpc('delete_my_account')
  deleting.value = false
  if (error) { msg.value = { kind: 'error', text: t('auth.errors.generic', { msg: error.message }) }; return }
  await auth.logout()
  window.alert(t('profile.deleted'))
  router.push({ name: 'home' })
}
</script>

<template>
  <main id="main" class="wrap prof">
    <p v-if="!me.loaded">{{ $t('common.loading') }}</p>
    <template v-else>
      <header class="who">
        <UserAvatar :size="84" />
        <div>
          <h1>{{ me.profile?.display_name || $t('profile.title') }}</h1>
          <p class="lead">{{ summary }}</p>
        </div>
      </header>

      <section class="card pics" aria-labelledby="pic-h">
        <h2 id="pic-h">{{ $t('soc.avatarTitle') }}</h2>
        <p class="small muted" style="margin: 0">{{ $t('soc.avatarHint') }}</p>
        <div class="avs" role="group" :aria-label="$t('soc.avatarTitle')">
          <button type="button" class="avbtn" :aria-pressed="!me.profile?.avatar" :aria-label="$t('soc.av_none')" @click="pickAvatar(null)"><UserAvatar :size="56" :kind="null" /></button>
          <button v-for="k in AVATAR_KINDS" :key="k" type="button" class="avbtn" :aria-pressed="me.profile?.avatar === 'fantasy:' + k" :aria-label="$t('soc.av_' + k)" @click="pickAvatar(k)"><UserAvatar :size="56" :kind="k" /></button>
        </div>
        <div class="row">
          <label class="btn small" :class="{ disabled: photoBusy }">{{ photoBusy ? $t('common.loading') : $t('soc.uploadPhoto') }}
            <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" :disabled="photoBusy" @change="onPhoto" />
          </label>
          <button v-if="me.profile?.avatar === 'photo'" type="button" class="btn small" @click="me.removePhoto().catch((e: Error) => (photoMsg = { kind: 'error', text: e.message }))">{{ $t('soc.removePhoto') }}</button>
        </div>
        <p class="tiny muted" style="margin: 0">{{ $t('soc.photoPrivate') }}</p>
        <p v-if="photoMsg" class="notice" :class="{ error: photoMsg.kind === 'error' }" role="status" style="margin: 0">{{ photoMsg.text }}</p>
      </section>

      <div class="cards">
        <form class="card" @submit.prevent="save">
          <h2>{{ $t('ui.profile.aboutMe') }}</h2>
          <label class="field"><span>{{ $t('profile.displayName') }}</span><input v-model="form.display_name" class="input pill" maxlength="80" autocomplete="given-name" /></label>
          <label class="field"><span>{{ $t('profile.email') }}</span><input :value="auth.user?.email" class="input pill" readonly /></label>
          <label class="field"><span>{{ $t('profile.homeKreis') }}</span>
            <select v-model="form.home_district_id" class="input pill">
              <option :value="null">{{ $t('profile.noKreis') }}</option>
              <option v-for="d in cat.districts" :key="d.id" :value="d.id">{{ $t('common.kreis', { n: d.number }) }}</option>
            </select>
          </label>
          <label class="field"><span>{{ $t('profile.language') }}</span>
            <select v-model="form.locale" class="input pill"><option v-for="l in LOCALES" :key="l" :value="l">{{ LOCALE_LABELS[l] }}</option></select>
          </label>
          <label class="row small" style="gap: 8px"><input v-model="form.email_plan_confirmations" type="checkbox" /> <span>{{ $t('ui.plan.emailPref') }}</span></label>
          <div v-if="msg" class="notice" :class="msg.kind" role="status">{{ msg.text }}</div>
          <div><button class="btn primary">{{ $t('common.save') }}</button></div>
        </form>

        <section class="card">
          <h2>{{ $t('profile.children') }}</h2>
          <p v-if="!me.children.length" class="muted small" style="margin: 0">{{ $t('profile.noChildren') }}</p>
          <ul class="list">
            <li v-for="c in me.children" :key="c.id">
              <span>{{ c.nickname || '—' }} · {{ c.birth_month && monthName(c.birth_month) }} {{ c.birth_year }} <span class="muted">({{ $t('profile.ageNow', { age: ageLabel(c.birth_year, c.birth_month) }) }})</span></span>
              <button class="btn small" @click="me.removeChild(c.id)">{{ $t('common.delete') }}</button>
            </li>
          </ul>
          <form class="kidform" @submit.prevent="addChild">
            <label class="field"><span>{{ $t('profile.childNickname') }}</span><input v-model="child.nickname" class="input pill" maxlength="40" /></label>
            <fieldset class="field"><legend>{{ $t('profile.birth') }}</legend>
              <div class="row" style="flex-wrap: nowrap">
                <select v-model.number="child.birth_month" class="input pill" :aria-label="$t('profile.birth')"><option v-for="m in 12" :key="m" :value="m">{{ monthName(m) }}</option></select>
                <select v-model.number="child.birth_year" class="input pill" :aria-label="$t('profile.birth')"><option v-for="y in YEARS" :key="y" :value="y">{{ y }}</option></select>
              </div>
            </fieldset>
            <div><button class="btn small">{{ $t('profile.addChild') }}</button></div>
          </form>
          <p class="tiny muted" style="margin: 0">{{ $t('profile.childrenNote') }}</p>
          <div v-if="childErr" class="notice error">{{ childErr }}</div>
        </section>

        <section class="card">
          <h2>♥ {{ $t('ui.profile.favourites') }}</h2>
          <p v-if="!favCards.length" class="muted small" style="margin: 0">{{ $t('ui.profile.noFavs') }}</p>
          <ul class="list">
            <li v-for="a in favCards" :key="a.id">
              <RouterLink :to="{ name: 'activity', params: { id: a.id } }">{{ a.title }}</RouterLink>
              <button class="btn small" @click="me.toggleFavourite(a.id)">{{ $t('ui.profile.remove') }}</button>
            </li>
          </ul>
        </section>

        <section class="card">
          <h2>{{ $t('ui.profile.myPlan') }}</h2>
          <p v-if="!planRows.length" class="muted small" style="margin: 0">{{ $t('ui.profile.noPlan') }}</p>
          <ul class="list">
            <li v-for="r in planRows" :key="r.p.id">
              <span class="stack" style="gap: 0"><RouterLink v-if="r.a" :to="{ name: 'activity', params: { id: r.a.id } }">{{ r.a.title }}</RouterLink><span class="small muted">{{ r.when }}<template v-if="r.a?.venue_name"> · {{ r.a.venue_name }}</template></span></span>
              <button class="btn small" @click="me.removeFromPlan(r.p.id)">{{ $t('ui.profile.remove') }}</button>
            </li>
          </ul>
        </section>
      </div>

      <div class="row">
        <button class="btn" @click="logout">{{ $t('ui.profile.logout') }}</button>
        <button class="btn" style="border-color: var(--danger); color: var(--danger)" :disabled="deleting" @click="deleteAccount">{{ $t('profile.deleteAccount') }}</button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.prof { max-width: 1000px; }
.who { display: flex; gap: 20px; align-items: center; }
.pics { display: grid; gap: 10px; margin-bottom: 18px; }
.avs { display: flex; flex-wrap: wrap; gap: 10px; }
.avbtn { border: 0; background: none; padding: 3px; border-radius: 50%; cursor: pointer; }
.avbtn[aria-pressed='true'] { outline: 3px solid var(--magenta); outline-offset: 1px; }
.disabled { opacity: .6; pointer-events: none; }
.avatar { flex: none; width: 84px; height: 84px; border-radius: 50%; background: #fdf1e3; border: 1px solid var(--ink); display: grid; place-items: center; font-size: 34px; font-weight: 300; }
h1 { font-size: clamp(40px, 7vw, 72px); }
.lead { margin-top: 4px; font-size: 18px; }
.cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: start; }
.card { border: 1px solid var(--ink); border-radius: 24px; padding: 24px; display: flex; flex-direction: column; gap: 14px; background: #fff; }
.card h2 { font-size: 26px; font-weight: 300; }
.list { list-style: none; margin: 0; padding: 0; }
.list li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.kidform { display: grid; gap: 12px; }
fieldset { border: 0; padding: 0; margin: 0; }
legend { font-weight: 500; font-size: 14px; margin-bottom: 6px; }
@media (max-width: 800px) { .cards { grid-template-columns: 1fr; } .avatar { width: 64px; height: 64px; font-size: 26px; } }
</style>
