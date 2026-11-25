<script setup lang="ts">
// Share a link by WhatsApp, e-mail (the user's own mail app) or copy. Nothing is sent from our servers.
import { computed, ref } from 'vue'

const props = defineProps<{ url: string; message: string; subject: string }>()
const copied = ref(false)
const text = computed(() => `${props.message} ${props.url}`)
const wa = computed(() => `https://wa.me/?text=${encodeURIComponent(text.value)}`)
const mail = computed(() => `mailto:?subject=${encodeURIComponent(props.subject)}&body=${encodeURIComponent(text.value)}`)
async function copy() {
  try { await navigator.clipboard.writeText(props.url); copied.value = true; setTimeout(() => (copied.value = false), 2000) } catch { /* shown field below can be copied by hand */ }
}
</script>

<template>
  <div class="stack">
    <div class="row">
      <a class="btn small" :href="wa" target="_blank" rel="noopener noreferrer">{{ $t('soc.inviteWhatsapp') }}</a>
      <a class="btn small" :href="mail">{{ $t('soc.inviteEmail') }}</a>
      <button class="btn small" type="button" @click="copy">{{ copied ? $t('soc.copied') : $t('soc.inviteCopy') }}</button>
    </div>
    <input class="input" readonly :value="url" aria-label="link" @focus="($event.target as HTMLInputElement).select()" />
  </div>
</template>
