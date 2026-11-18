<script setup lang="ts">
import { contactEmail } from '@/lib/supabase'
import { useDesign } from '@/composables/useDesign'
const copy = useDesign()
</script>
<template>
  <main id="main" class="wrap narrow">
    <h1>{{ copy.story.ctH }}</h1>
    <div class="stack body">
      <p>{{ copy.story.ctB1 }}</p>
      <p>{{ copy.story.ctB2 }}</p>
    </div>
    <!-- No fake contact form: a message is only "sent" when the person's own email app sends it. -->
    <div class="row">
      <a v-if="contactEmail" class="btn primary" :href="`mailto:${contactEmail}`">{{ $t('ui.contact.write') }}</a>
      <p v-else class="muted">{{ $t('ui.contact.soon') }}</p>
    </div>
    <p><RouterLink :to="{ name: 'suggest' }">{{ copy.story.ctGem }}</RouterLink></p>
  </main>
</template>
<style scoped>
.narrow { max-width: 780px; }
h1 { font-size: clamp(38px, 6vw, 68px); line-height: 1.06; }
.body p { font-size: 19px; font-weight: 300; margin: 0; }
</style>
