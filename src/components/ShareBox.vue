<script setup lang="ts">
// Shares a link via the user's own apps. Creates no invitation, sends nothing itself, records nothing.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { mailtoUrl, shareText, whatsappUrl } from '@/domain/share'

const props = defineProps<{ title: string; url: string }>()
const { t } = useI18n()
const copied = ref(false)
const text = computed(() => shareText(props.title, props.url, t('activity.shareIntro')))
const canNative = typeof navigator !== 'undefined' && 'share' in navigator

async function copy() {
  try {
    await navigator.clipboard.writeText(props.url)
    copied.value = true
    setTimeout(() => (copied.value = false), 2500)
  } catch { /* clipboard blocked: user can still copy from the address bar */ }
}
async function native() {
  try { await navigator.share({ title: props.title, text: t('activity.shareIntro'), url: props.url }) } catch { /* cancelled */ }
}
</script>

<template>
  <section class="panel cream stack" aria-labelledby="share-h">
    <h2 id="share-h" class="h">{{ $t('activity.share') }}</h2>
    <div class="row">
      <a class="btn primary" :href="whatsappUrl(text)" target="_blank" rel="noopener">{{ $t('activity.shareWhatsapp') }}</a>
      <a class="btn" :href="mailtoUrl(title, text)">{{ $t('activity.shareEmail') }}</a>
      <button class="btn" @click="copy">{{ copied ? $t('activity.copied') : $t('activity.shareCopy') }}</button>
      <button v-if="canNative" class="btn" @click="native">{{ $t('activity.shareMore') }}</button>
    </div>
    <p class="tiny" style="margin: 0">{{ $t('activity.shareNote') }}</p>
    <span class="sr-only" aria-live="polite">{{ copied ? $t('activity.copied') : '' }}</span>
  </section>
</template>
<style scoped>
.h { font-size: 24px; font-weight: 400; }
</style>
