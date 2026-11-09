<script setup lang="ts">
// Illustrations from the Quartierjournal prototype (drawn in SVG, no photos). Picked deterministically per id.
import { computed } from 'vue'
const props = defineProps<{ seed: string; label?: string }>()
const scene = computed(() => {
  let h = 0
  for (const ch of props.seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `s${(h % 6) + 1}`
})
</script>
<template>
  <svg class="art" viewBox="0 0 600 420" preserveAspectRatio="xMidYMid slice" role="img" :aria-label="label">
    <use :href="`/scenes.svg#${scene}`" width="600" height="420" />
  </svg>
</template>
<style scoped>
.art { width: 100%; height: 100%; display: block; background: var(--sand); }
</style>
