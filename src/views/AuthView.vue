<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase, appUrl } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { currentLocale } from '@/i18n'

type Mode = 'login' | 'signup' | 'reset'
const { t, locale } = useI18n()
const labels = computed(() => ({
 de: ['Mit Google fortfahren', 'Bestätigung erneut senden', 'Bestätigungs-E-Mail angefordert. Prüfe auch den Spamordner.'],
 en: ['Continue with Google', 'Resend confirmation', 'Confirmation email requested. Please check your spam folder too.'],
 it: ['Continua con Google', 'Invia di nuovo la conferma', 'E-mail di conferma richiesta. Controlla anche la cartella spam.'],
 fr: ['Continuer avec Google', 'Renvoyer la confirmation', 'E-mail de confirmation demandé. Vérifiez aussi les courriers indésirables.']
}[locale.value] || ['Continue with Google', 'Resend confirmation', 'Confirmation email requested.']))
// The Google button appears by itself as soon as Google sign-in is switched on in the Supabase project
// (its public settings say so), so no extra build setting is needed. VITE_GOOGLE_AUTH_ENABLED=true still forces it on.
const googleEnabled = ref(import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true')
onMounted(async () => {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (googleEnabled.value || !base || base === 'same-origin' || !key) return
  try {
    const r = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: key } })
    if (r.ok) googleEnabled.value = !!(await r.json())?.external?.google
  } catch { /* no button if the settings cannot be read */ }
})

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const mode = ref<Mode>((route.query.mode as Mode) || 'login')
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const info = ref<string | null>(null)

// Where to go after signing in. The page the visitor came from is kept in sessionStorage too, so it survives the round trip
// through Google or a confirmation e-mail (those return to /login without the original address).
const NEXT_KEY = 'qj_next'
const safePath = (v: unknown) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v : null)
const storedNext = () => { try { return safePath(sessionStorage.getItem(NEXT_KEY)) } catch { return null } }
const rememberNext = () => { const n = safePath(route.query.next); if (n) { try { sessionStorage.setItem(NEXT_KEY, n) } catch { /* ignore */ } } }
const forgetNext = () => { try { sessionStorage.removeItem(NEXT_KEY) } catch { /* ignore */ } }
const next = () => safePath(route.query.next) ?? storedNext() ?? '/woche'
rememberNext()
const planHint = computed(() => next().startsWith('/a/'))
watch(() => auth.loggedIn, (v) => { if (v) { const to = next(); forgetNext(); router.replace(to) } }, { immediate: true })
watch(mode, () => { error.value = null; info.value = null })

// Links from Supabase emails land here. An expired/used link comes back with error_code in the URL; a link opened
// in a different browser than the one used to sign up cannot start a session, but the address IS confirmed.
onMounted(() => {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const errCode = hash.get('error_code') ?? query.get('error_code')
  if (errCode) {
    error.value = errCode === 'otp_expired' ? t('auth.linkInvalid') : t('auth.errors.generic', { msg: hash.get('error_description') ?? query.get('error_description') ?? errCode })
    return
  }
  if (query.get('code')) setTimeout(() => { if (!auth.loggedIn) info.value = t('auth.confirmedLogin') }, 2500)
})

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
  } catch (e) { error.value = t('common.error') } finally { busy.value = false }
}
async function resend() {
  if (!supabase || !email.value || busy.value) return
  busy.value = true; error.value = null; info.value = null
  try {
    const { error: e } = await supabase.auth.resend({ type: 'signup', email: email.value, options: { emailRedirectTo: `${appUrl()}/login` } })
    if (e) error.value = explain(e)
    else info.value = labels.value[2] ?? t('auth.checkEmail', { email: email.value })
  } catch { error.value = t('common.error') } finally { busy.value = false }
}
async function googleLogin() {
  if (!supabase || busy.value) return
  busy.value = true; error.value = null
  try {
    const { error: e } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${appUrl()}/login` } })
    if (e) error.value = explain(e)
  } catch { error.value = t('common.error') } finally { busy.value = false }
}
</script>

<template>
  <main id="main" class="wrap narrow">
    <h1 class="h1">{{ mode === 'signup' ? $t('auth.signupTitle') : mode === 'reset' ? $t('auth.resetTitle') : $t('auth.loginTitle') }}</h1>
    <p v-if="planHint" class="notice" role="note">
      {{ $t('ui.plan.loginHint') }}
      <RouterLink :to="next()">{{ $t('ui.plan.backToEvent') }}</RouterLink>
    </p>
    <div v-if="!supabase" class="notice error">{{ $t('config.missing') }}</div>
    <form class="stack" @submit.prevent="submit">
      <label class="field"><span>{{ $t('auth.email') }}</span>
        <input v-model.trim="email" class="input pill" type="email" autocomplete="email" required />
      </label>
      <label v-if="mode !== 'reset'" class="field"><span>{{ $t('auth.password') }}</span>
        <input v-model="password" class="input pill" type="password" :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'" :minlength="mode === 'signup' ? 8 : undefined" required />
        <small v-if="mode === 'signup'" class="muted">{{ $t('auth.passwordHint') }}</small>
      </label>
      <div v-if="error" class="notice error" role="alert">{{ error }}</div>
      <div v-if="info" class="notice ok" role="status">{{ info }}</div>
      <button class="btn primary block" type="submit" :disabled="busy || !email">
        {{ mode === 'signup' ? $t('auth.signup') : mode === 'reset' ? $t('auth.resetSend') : $t('auth.login') }}
      </button>
    </form>
    <button v-if="googleEnabled && mode !== 'reset'" class="btn block" :disabled="busy || !supabase" @click="googleLogin">{{ labels[0] }}</button>
    <button v-if="mode !== 'reset'" class="linkbtn" :disabled="busy || !email || !supabase" @click="resend">{{ labels[1] }}</button>
    <div class="stack small">
      <button v-if="mode !== 'signup'" class="linkbtn" @click="mode = 'signup'">{{ $t('auth.toSignup') }}</button>
      <button v-if="mode !== 'login'" class="linkbtn" @click="mode = 'login'">{{ $t('auth.toLogin') }}</button>
      <button v-if="mode === 'login'" class="linkbtn" @click="mode = 'reset'">{{ $t('auth.forgot') }}</button>
    </div>
    <p class="tiny muted">{{ $t('auth.privacy') }} <RouterLink :to="{ name: 'privacy' }">{{ $t('auth.privacyLink') }}</RouterLink></p>
  </main>
</template>

<style scoped>
.narrow { max-width: 440px; margin: 0 auto; }
.block { width: 100%; padding: 14px 20px; }
.h1 { font-size: clamp(36px, 7vw, 56px); }
.stack > .linkbtn { align-self: flex-start; text-align: left; }
</style>

