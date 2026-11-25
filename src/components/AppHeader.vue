<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/stores/auth'
import { useMe } from '@/stores/me'
import UserAvatar from '@/components/UserAvatar.vue'
import { LOCALES, LOCALE_LABELS, setLocale, type Locale } from '@/i18n'

const { locale } = useI18n()
const auth = useAuth()
const me = useMe()
const router = useRouter()
const menuOpen = ref(false)

async function changeLang(e: Event) {
  const l = (e.target as HTMLSelectElement).value as Locale
  setLocale(l)
  if (auth.loggedIn && me.profile) await me.updateProfile({ locale: l }).catch(() => {})
}
async function logout() {
  menuOpen.value = false
  await auth.logout()
  router.push({ name: 'home' })
}
</script>

<template>
  <header class="wrap">
    <div class="hd">
      <RouterLink to="/" class="brand">
        <span class="name">Quartierjournal</span>
        <span class="city">Zürich</span>
      </RouterLink>
      <nav aria-label="Main" class="nv">
        <RouterLink :to="{ name: 'discover' }">{{ $t('nav.discover') }}</RouterLink>
        <RouterLink v-if="auth.loggedIn" :to="{ name: 'week' }">{{ $t('nav.week') }}</RouterLink>
        <RouterLink v-if="auth.loggedIn" :to="{ name: 'friends' }">{{ $t('soc.navFriends') }}</RouterLink>
        <RouterLink v-else :to="{ name: 'how' }">{{ $t('nav.how') }}</RouterLink>
      </nav>
      <div class="tools">
        <label class="sr-only" for="lang">{{ $t('nav.language') }}</label>
        <select id="lang" class="lang" :value="locale" @change="changeLang">
          <option v-for="l in LOCALES" :key="l" :value="l">{{ LOCALE_LABELS[l] }}</option>
        </select>
        <RouterLink v-if="!auth.loggedIn" :to="{ name: 'login' }" class="btn accent small">{{ $t('nav.login') }}</RouterLink>
        <div v-else class="acct">
          <button class="btn accent small" :aria-expanded="menuOpen" aria-haspopup="menu" @click="menuOpen = !menuOpen">
            <UserAvatar :size="24" /> {{ me.profile?.display_name || $t('nav.account') }} ▾
          </button>
          <div v-if="menuOpen" class="scrim" @click="menuOpen = false" />
          <div v-if="menuOpen" class="menu" role="menu" @click="menuOpen = false">
            <RouterLink role="menuitem" :to="{ name: 'week' }">{{ $t('nav.week') }}</RouterLink>
            <RouterLink role="menuitem" :to="{ name: 'friends' }">{{ $t('soc.navFriends') }}</RouterLink>
            <RouterLink role="menuitem" :to="{ name: 'profile' }">{{ $t('nav.profile') }}</RouterLink>
            <RouterLink role="menuitem" :to="{ name: 'suggest' }">{{ $t('nav.suggest') }}</RouterLink>
            <RouterLink role="menuitem" :to="{ name: 'how' }">{{ $t('nav.how') }}</RouterLink>
            <RouterLink v-if="auth.isAdmin" role="menuitem" :to="{ name: 'admin' }">{{ $t('nav.admin') }}</RouterLink>
            <button role="menuitem" @click.stop="logout">{{ $t('nav.logout') }}</button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.hd { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; padding: 18px 0 10px; border-bottom: 1px solid var(--ink); }
.acct .btn { display: inline-flex; align-items: center; gap: 8px; }
.brand { display: flex; flex-direction: column; text-decoration: none; line-height: 1.1; }
.name { font-weight: 300; font-size: clamp(21px, 5.6vw, 30px); letter-spacing: -0.02em; }
.city { color: var(--magenta-ink); font-size: 15px; }
.nv { display: flex; gap: 2px 6px; flex-wrap: wrap; order: 2; flex: 1; justify-content: center; }
.nv a { padding: 8px 14px; text-decoration: none; position: relative; }
.nv a.router-link-active::after { content: ''; position: absolute; left: 14px; right: 14px; bottom: 2px; height: 2px; background: var(--magenta); border-radius: 2px; }
.tools { display: flex; align-items: center; gap: 6px; position: relative; order: 3; }
.lang { border: 0; background: transparent; padding: 8px 6px; cursor: pointer; min-height: 40px; }
.acct { position: relative; }
.scrim { position: fixed; inset: 0; z-index: 19; }
.menu { position: absolute; right: 0; top: 48px; z-index: 20; background: #fff; border: 1px solid var(--ink); border-radius: 16px; padding: 6px; min-width: 200px; display: flex; flex-direction: column; }
.menu a, .menu button { padding: 10px 14px; border-radius: 10px; text-decoration: none; text-align: left; border: 0; background: none; cursor: pointer; }
.menu a:hover, .menu button:hover { background: var(--sand); }
@media (max-width: 640px) {
  .nv { order: 4; width: 100%; margin: 0 -12px; }
}
</style>
