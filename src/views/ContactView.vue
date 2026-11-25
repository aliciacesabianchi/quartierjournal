<script setup lang="ts">
import { ref } from 'vue'
import { contactEmail } from '@/lib/supabase'
import { useDesign } from '@/composables/useDesign'
const copy = useDesign()
const copied = ref(false)
async function copyAddress() {
  try { await navigator.clipboard.writeText(contactEmail ?? ''); copied.value = true; setTimeout(() => { copied.value = false }, 2500) } catch { /* the address is shown as text anyway */ }
}
</script>
<template>
  <main id="main" class="wrap narrow">
    <h1>{{ copy.story.ctH }}</h1>
    <div class="stack body">
      <p>{{ copy.story.ctB1 }}</p>
      <p>{{ copy.story.ctB2 }}</p>
    </div>
    <!-- No fake contact form and no mail button (it does nothing without a mail program): the address is shown and can be copied. -->
    <p v-if="!contactEmail" class="muted">{{ $t('ui.contact.soon') }}</p>
    <p v-if="contactEmail" class="addr">
      <span class="muted small">{{ $t('ui.contact.orWrite') }}</span><br />
      <strong class="mailaddr">{{ contactEmail }}</strong>
      <button class="btn small" type="button" @click="copyAddress">{{ copied ? $t('ui.contact.copied') : $t('ui.contact.copy') }}</button>
    </p>
    <p><RouterLink :to="{ name: 'suggest' }">{{ copy.story.ctGem }}</RouterLink></p>
  </main>
</template>
<style scoped>
.narrow { max-width: 780px; }
strong.mailaddr { font-weight: 500; font-size: 20px; margin-right: 8px; user-select: all; }
.addr { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 0; }
.addr > br { display: none; }
.addr > span { flex: 1 0 100%; }
h1 { font-size: clamp(38px, 6vw, 68px); line-height: 1.06; }
.body p { font-size: 19px; font-weight: 300; margin: 0; }
</style>
