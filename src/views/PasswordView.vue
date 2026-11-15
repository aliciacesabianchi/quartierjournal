<script setup lang="ts">
// Reached from the password-reset email. Supabase signs the user in with a recovery session first.
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuth()
const router = useRouter()
const password = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const done = ref(false)

async function save() {
  if (password.value.length < 8) { error.value = t('auth.errors.weak'); return }
  if (!supabase) return
  busy.value = true
  error.value = null
  try {
    const { error: e } = await supabase.auth.updateUser({ password: password.value })
    if (e) { error.value = t('auth.errors.generic', { msg: e.message }); return }
    done.value = true
    auth.passwordRecovery = false
    setTimeout(() => router.push({ name: 'week' }), 1500)
  } catch {
    error.value = t('common.error')
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <main id="main" class="wrap" style="max-width: 520px">
    <h1 style="font-size: clamp(36px, 7vw, 56px)">{{ $t('auth.resetTitle') }}</h1>
    <p v-if="!auth.loggedIn" class="notice">{{ $t('auth.linkInvalid') }} <RouterLink :to="{ name: 'login', query: { mode: 'reset' } }">{{ $t('auth.forgot') }}</RouterLink></p>
    <form v-else class="stack" @submit.prevent="save">
      <label class="field"><span>{{ $t('auth.newPassword') }}</span>
        <input v-model="password" class="input" type="password" autocomplete="new-password" minlength="8" required />
        <small class="muted">{{ $t('auth.passwordHint') }}</small>
      </label>
      <div v-if="error" class="notice error" role="alert">{{ error }}</div>
      <div v-if="done" class="notice ok" role="status">{{ $t('auth.passwordUpdated') }}</div>
      <button class="btn accent" :disabled="busy || done">{{ $t('auth.setPassword') }}</button>
    </form>
  </main>
</template>

