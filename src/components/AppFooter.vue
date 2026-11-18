<script setup lang="ts">
import { useDesign } from '@/composables/useDesign'
import { useAuth } from '@/stores/auth'
const copy = useDesign()
const auth = useAuth()
</script>
<template>
  <footer class="ft">
    <div class="wrap cols">
      <div class="brand">
        <div class="name">Quartierjournal</div>
        <p class="tag">{{ copy.story.fBrand }}</p>
        <p class="small">{{ copy.story.fBrandP }}</p>
      </div>
      <nav :aria-label="copy.story.fExp">
        <h2 class="hd">{{ copy.story.fExp }}</h2>
        <RouterLink :to="{ name: 'discover' }">{{ copy.story.fDisc }}</RouterLink>
        <RouterLink v-if="auth.loggedIn" :to="{ name: 'week' }">{{ $t('nav.week') }}</RouterLink>
        <RouterLink :to="{ name: 'how' }">{{ copy.story.fHow }}</RouterLink>
        <RouterLink :to="{ name: 'suggest' }">{{ copy.story.fSug }}</RouterLink>
      </nav>
      <nav :aria-label="copy.story.fAbH">
        <h2 class="hd">{{ copy.story.fAbH }}</h2>
        <RouterLink :to="{ name: 'about' }">{{ copy.story.fAbout }}</RouterLink>
        <RouterLink :to="{ name: 'contact' }">{{ copy.story.fContact }}</RouterLink>
        <RouterLink :to="{ name: 'privacy' }">{{ $t('footer.privacy') }}</RouterLink>
      </nav>
    </div>
    <div class="wrap bottom small">
      <span>© 2026 Quartierjournal · {{ $t('footer.pilot') }}</span>
      <span>{{ $t('ui.made') }}</span>
    </div>
  </footer>
</template>
<style scoped>
.ft { border-top: 1px solid var(--line); margin-top: 24px; padding: 48px 0 28px; }
.cols { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 32px; }
.name { font-weight: 300; font-size: 30px; letter-spacing: -0.02em; line-height: 1.1; }
.tag { color: var(--magenta-ink); margin: 6px 0 4px; font-size: 17px; }
.brand p { margin: 0; max-width: 28ch; }
nav { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.hd { font-size: 14px; font-weight: 500; letter-spacing: 0; margin: 0 0 4px; }
nav a { text-decoration: none; font-size: 17px; font-weight: 300; }
nav a:hover { text-decoration: underline; }
.bottom { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-top: 1px solid var(--line); margin-top: 32px; padding-top: 18px; }
@media (max-width: 760px) { .cols { grid-template-columns: 1fr 1fr; } .brand { grid-column: 1 / -1; } }
</style>
