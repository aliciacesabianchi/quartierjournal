<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMe } from '@/stores/me'
import { useAuth } from '@/stores/auth'
import { useCatalogue } from '@/stores/catalogue'
import { db } from '@/lib/supabase'
import { ageInMonths, todayInZurich } from '@/domain/time'
import { LOCALES, LOCALE_LABELS, setLocale, type Locale } from '@/i18n'

const { t } = useI18n()
const me = useMe()
const auth = useAuth()
const cat = useCatalogue()
const router = useRouter()
cat.load()

const form = reactive({ display_name: '', home_district_id: null as number | null, locale: 'de' })
watch(() => me.profile, (p) => { if (p) Object.assign(form, { display_name: p.display_name ?? '', home_district_id: p.home_district_id, locale: p.locale }) }, { immediate: true })

const msg = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
async function save() {
  msg.value = null
  try {
    await me.updateProfile({ display_name: form.display_name.trim() || null, home_district_id: form.home_district_id, locale: form.locale })
    setLocale(form.locale as Locale)
    msg.value = { kind: 'ok', text: t('common.saved') }
  } catch (e) { msg.value = { kind: 'error', text: t('auth.errors.generic', { msg: (e as Error).message }) } }
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
const monthName = (m: number) => new Intl.DateTimeFormat(form.locale, { month: 'long' }).format(new Date(2024, m - 1, 1))

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
  <main id="main" class="wrap" style="max-width: 760px">
    <h1 style="font-size: clamp(36px, 7vw, 64px)">{{ $t('profile.title') }}</h1>
    <p v-if="!me.loaded">{{ $t('common.loading') }}</p>
    <template v-else>
      <form class="panel stack" @submit.prevent="save">
        <label class="field"><span>{{ $t('profile.displayName') }}</span><input v-model="form.display_name" class="input" maxlength="80" autocomplete="given-name" /></label>
        <label class="field"><span>{{ $t('profile.homeKreis') }}</span>
          <select v-model="form.home_district_id" class="input">
            <option :value="null">{{ $t('profile.noKreis') }}</option>
            <option v-for="d in cat.districts" :key="d.id" :value="d.id">{{ $t('common.kreis', { n: d.number }) }}</option>
          </select>
        </label>
        <label class="field"><span>{{ $t('profile.language') }}</span>
          <select v-model="form.locale" class="input"><option v-for="l in LOCALES" :key="l" :value="l">{{ LOCALE_LABELS[l] }}</option></select>
        </label>
        <div v-if="msg" class="notice" :class="msg.kind" role="status">{{ msg.text }}</div>
        <div><button class="btn primary">{{ $t('common.save') }}</button></div>
      </form>

      <section class="panel stack">
        <h2 class="h">{{ $t('profile.children') }}</h2>
        <p class="small muted" style="margin: 0">{{ $t('profile.childrenNote') }}</p>
        <p v-if="!me.children.length" class="muted">{{ $t('profile.noChildren') }}</p>
        <ul class="kids">
          <li v-for="c in me.children" :key="c.id">
            <span>{{ c.nickname || '—' }} · {{ c.birth_month && monthName(c.birth_month) }} {{ c.birth_year }} <span class="muted">({{ $t('profile.ageNow', { age: ageLabel(c.birth_year, c.birth_month) }) }})</span></span>
            <button class="btn small" @click="me.removeChild(c.id)">{{ $t('common.delete') }}</button>
          </li>
        </ul>
        <form class="kidform" @submit.prevent="addChild">
          <label class="field"><span>{{ $t('profile.childNickname') }}</span><input v-model="child.nickname" class="input" maxlength="40" /></label>
          <fieldset class="field"><legend style="font-weight: 500">{{ $t('profile.birth') }}</legend>
            <div class="row" style="flex-wrap: nowrap">
              <select v-model.number="child.birth_month" class="input" :aria-label="$t('profile.birth')"><option v-for="m in 12" :key="m" :value="m">{{ monthName(m) }}</option></select>
              <select v-model.number="child.birth_year" class="input" :aria-label="$t('profile.birth')"><option v-for="y in YEARS" :key="y" :value="y">{{ y }}</option></select>
            </div>
          </fieldset>
          <button class="btn">{{ $t('profile.addChild') }}</button>
        </form>
        <div v-if="childErr" class="notice error">{{ childErr }}</div>
      </section>

      <section class="panel stack">
        <h2 class="h">{{ $t('profile.account') }}</h2>
        <p style="margin: 0"><span class="muted">{{ $t('profile.email') }}:</span> {{ auth.user?.email }}</p>
        <div><button class="btn" style="border-color: var(--danger); color: var(--danger)" :disabled="deleting" @click="deleteAccount">{{ $t('profile.deleteAccount') }}</button></div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.h { font-size: 26px; font-weight: 400; }
.kids { list-style: none; padding: 0; margin: 0; }
.kids li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.kidform { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 12px; align-items: end; }
fieldset { border: 0; padding: 0; margin: 0; }
</style>
