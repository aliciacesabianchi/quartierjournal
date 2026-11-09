<script setup lang="ts">
import { contactEmail } from '@/lib/supabase'
</script>
<template>
  <footer class="wrap ft">
    <hr class="rule" />
    <div class="row small">
      <span>Quartierjournal · {{ $t('footer.pilot') }}</span>
      <RouterLink :to="{ name: 'privacy' }">{{ $t('footer.privacy') }}</RouterLink>
      <a v-if="contactEmail" :href="`mailto:${contactEmail}`">{{ $t('footer.contact') }}</a>
    </div>
  </footer>
</template>
<style scoped>
.ft { padding-bottom: 32px; display: flex; flex-direction: column; gap: 16px; }
</style>
