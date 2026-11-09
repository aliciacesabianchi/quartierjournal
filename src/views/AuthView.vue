<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase, appUrl } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { currentLocale } from '@/i18n'

type Mode = 'login' | 'signup' | 'reset'
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuth()

const mode = ref<Mode>((route.query.mode as Mode) || 'login')
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const info = ref<string | null>(null)

const next = () => (typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/woche')
watch(() => auth.loggedIn, (v) => { if (v) router.replace(next()) }, { immediate: true })
watch(mode, () => { error.value = null; info.value = null })

function explain(e: { code?: string; message: string; status?: number }): string {
  const code = e.code ?? ''
  if (code === 'invalid_credentials') return t('auth.errors.invalid')
  if (code === 'email_not_confirmed') return t('auth.errors.notConfirmed')
  if (code.startsWith('over_') || e.status === 429) return t('auth.errors.rateLimit')
  if (code === 'weak_password') return t('auth.errors.weak')
  return t('auth.errors.generic', { msg: e.message })
}

async function submit() {
  if (!supabase) { error.value = t('config.missing'); return }
  error.value = null
  info.value = null
  if (mode.value !== 'reset' && password.value.length < 8 && mode.value === 'signup') { error.value = t('auth.errors.weak'); return }
  busy.value = true
  try {
    if (mode.value === 'login') {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.value, password: password.value })
      if (e) error.value = explain(e)
    } else if (mode.value === 'signup') {
      const { data, error: e } = await supabase.auth.signUp({
        email: email.value, password: password.value,
        options: { emailRedirectTo: `${appUrl()}/login`, data: { locale: currentLocale() } },
      })
      if (e) error.value = explain(e)
      else if (data.session) { /* email confirmation disabled: already logged in */ }
      else if (data.user && (data.user.identities?.length ?? 0) === 0) info.value = t('auth.maybeExists')
      else info.value = t('auth.checkEmail', { email: email.value })
    } else {
      const { error: e } = await supabase.auth.resetPasswordForEmail(email.value, { redirectTo: `${appUrl()}/passwort` })
      if (e) error.value = explain(e)
      else info.value = t('auth.resetSent', { email: email.value })
    }
  } finally { busy.value = false }
}
</script>

<template>
  <main id="main" class="wrap narrow">
    <h1 class="h1">{{ mode === 'signup' ? $t('auth.signupTitle') : mode === 'reset' ? $t('auth.resetTitle') : $t('auth.loginTitle') }}</h1>
    <div v-if="!supabase" class="notice error">{{ $t('config.missing') }}</div>
    <form class="stack" novalidate @submit.prevent="submit">
      <label class="field"><span>{{ $t('auth.email') }}</span>
        <input v-model.trim="email" class="input" type="email" autocomplete="email" required />
      </label>
      <label v-if="mode !== 'reset'" class="field"><span>{{ $t('auth.password') }}</span>
        <input v-model="password" class="input" type="password" :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'" minlength="8" required />
        <small v-if="mode === 'signup'" class="muted">{{ $t('auth.passwordHint') }}</small>
      </label>
      <div v-if="error" class="notice error" role="alert">{{ error }}</div>
      <div v-if="info" class="notice ok" role="status">{{ info }}</div>
      <button class="btn accent" type="submit" :disabled="busy || !email">
        {{ mode === 'signup' ? $t('auth.signup') : mode === 'reset' ? $t('auth.resetSend') : $t('auth.login') }}
      </button>
    </form>
    <div class="stack small">
      <button v-if="mode !== 'signup'" class="linkbtn" @click="mode = 'signup'">{{ $t('auth.toSignup') }}</button>
      <button v-if="mode !== 'login'" class="linkbtn" @click="mode = 'login'">{{ $t('auth.toLogin') }}</button>
      <button v-if="mode === 'login'" class="linkbtn" @click="mode = 'reset'">{{ $t('auth.forgot') }}</button>
    </div>
    <p class="tiny muted">{{ $t('auth.privacy') }} <RouterLink :to="{ name: 'privacy' }">{{ $t('auth.privacyLink') }}</RouterLink></p>
  </main>
</template>

<style scoped>
.narrow { max-width: 520px; }
.h1 { font-size: clamp(36px, 7vw, 56px); }
.stack > .linkbtn { align-self: flex-start; text-align: left; }
</style>
