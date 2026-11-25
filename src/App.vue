<script setup lang="ts">
import { watch } from 'vue'
import AppHeader from './components/AppHeader.vue'
import AppFooter from './components/AppFooter.vue'
import { useAuth } from './stores/auth'
import { useMe } from './stores/me'
import { useSocial } from './stores/social'
import { setLocale, LOCALES, type Locale } from './i18n'

const auth = useAuth()
const me = useMe()
const social = useSocial()

// Load / clear private data when the session changes. Use the profile's language once loaded.
watch(() => auth.user?.id, async (id) => {
  me.reset()
  social.reset()
  if (!id) return
  try {
    await me.load()
    const l = me.profile?.locale
    if (l && (LOCALES as readonly string[]).includes(l)) setLocale(l as Locale)
  } catch { /* shown per view */ }
}, { immediate: true })
</script>

<template>
  <a class="skip" href="#main">{{ $t('nav.skip') }}</a>
  <AppHeader />
  <RouterView v-slot="{ Component }">
    <component :is="Component" />
  </RouterView>
  <AppFooter />
</template>
