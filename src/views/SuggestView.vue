<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/stores/auth'
import { useMe } from '@/stores/me'
import { useFormat } from '@/composables/useFormat'

const { t } = useI18n()
const auth = useAuth()
const me = useMe()
const f = useFormat()
const form = reactive({ url: '', name: '', note: '' })
const busy = ref(false)
const error = ref<string | null>(null)
const saved = ref(false)

async function submit() {
  error.value = null
  const url = form.url.trim()
  const name = form.name.trim()
  if (!url && !name) { error.value = t('suggest.needOne'); return }
  if (url) {
    try {
      const u = new URL(url)
      if (!/^https?:$/.test(u.protocol)) throw new Error()
    } catch { error.value = t('suggest.invalidUrl'); return }
  }
  busy.value = true
  try {
    await me.submitLead({ url: url || null, name: name || null, note: form.note.trim() || null })
    saved.value = true // only after the row was stored
    Object.assign(form, { url: '', name: '', note: '' })
  } catch (e) {
    error.value = t('auth.errors.generic', { msg: (e as Error).message })
  } finally { busy.value = false }
}
</script>

<template>
  <main id="main" class="wrap" style="max-width: 760px">
    <h1 style="font-size: clamp(36px, 7vw, 64px)">{{ $t('suggest.title') }}</h1>
    <p class="lead">{{ $t('suggest.sub') }}</p>

    <div v-if="!auth.loggedIn" class="notice">
      {{ $t('suggest.loginNeeded') }}
      <RouterLink :to="{ name: 'login', query: { next: '/tipp' } }">{{ $t('nav.login') }}</RouterLink>
    </div>

    <template v-else>
      <div v-if="saved" class="panel cream stack" role="status">
        <strong>{{ $t('suggest.thanks') }}</strong>
        <span>{{ $t('suggest.thanksNote') }}</span>
        <div><button class="btn" @click="saved = false">{{ $t('suggest.another') }}</button></div>
      </div>
      <form v-else class="panel stack" novalidate @submit.prevent="submit">
        <label class="field"><span>{{ $t('suggest.url') }}</span><input v-model="form.url" type="url" inputmode="url" class="input" maxlength="2000" placeholder="https://" /></label>
        <label class="field"><span>{{ $t('suggest.name') }}</span><input v-model="form.name" class="input" maxlength="200" /></label>
        <label class="field"><span>{{ $t('suggest.note') }}</span><textarea v-model="form.note" class="input" maxlength="2000" /></label>
        <div v-if="error" class="notice error" role="alert">{{ error }}</div>
        <div><button class="btn primary" :disabled="busy">{{ $t('suggest.submit') }}</button></div>
      </form>

      <section class="stack">
        <h2 style="font-size: 26px; font-weight: 400">{{ $t('suggest.mine') }}</h2>
        <p v-if="!me.leads.length" class="muted">{{ $t('suggest.none') }}</p>
        <ul class="leads">
          <li v-for="l in me.leads" :key="l.id">
            <span class="stack" style="gap: 2px">
              <strong>{{ l.name || l.url }}</strong>
              <a v-if="l.url && l.name" :href="l.url" target="_blank" rel="noopener" class="small">{{ l.url }}</a>
              <span class="tiny muted">{{ f.date(l.created_at.slice(0, 10)) }}</span>
            </span>
            <span class="badge">{{ $t(`suggest.status.${l.status}`) }}</span>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.leads { list-style: none; padding: 0; margin: 0; }
.leads li { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid var(--line); word-break: break-word; }
</style>
