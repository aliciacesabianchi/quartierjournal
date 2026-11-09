import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export const useAuth = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const isAdmin = ref(false)
  const ready = ref(false)
  const passwordRecovery = ref(false)

  const user = computed(() => session.value?.user ?? null)
  const loggedIn = computed(() => !!session.value)

  async function refreshAdmin() {
    isAdmin.value = false
    if (!supabase || !session.value) return
    const { data } = await supabase.rpc('am_i_admin')
    isAdmin.value = data === true
  }

  async function init() {
    if (!supabase) { ready.value = true; return }
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    await refreshAdmin()
    ready.value = true
    supabase.auth.onAuthStateChange((event, s) => {
      session.value = s
      if (event === 'PASSWORD_RECOVERY') passwordRecovery.value = true
      void refreshAdmin()
    })
  }

  async function logout() {
    await supabase?.auth.signOut()
    session.value = null
    isAdmin.value = false
  }

  return { session, user, loggedIn, isAdmin, ready, passwordRecovery, init, logout }
})
