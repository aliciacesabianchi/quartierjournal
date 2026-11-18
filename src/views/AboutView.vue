<script setup lang="ts">
import { useDesign } from '@/composables/useDesign'
const copy = useDesign()
</script>
<template>
  <main id="main" class="wrap narrow">
    <h1>{{ copy.story.aboutH }}</h1>
    <p class="lead">{{ copy.story.aboutP }}</p>
    <div class="stack body">
      <p>{{ copy.story.ab1 }}</p>
      <p>{{ $t('ui.about.pilot') }}</p>
      <p>{{ copy.story.ab4 }}</p>
    </div>
    <div class="row">
      <RouterLink :to="{ name: 'discover' }" class="btn primary">{{ copy.story.explore }}</RouterLink>
      <RouterLink :to="{ name: 'suggest' }" class="btn">{{ copy.guest.gemB }}</RouterLink>
    </div>
  </main>
</template>
<style scoped>
.narrow { max-width: 780px; }
h1 { font-size: clamp(38px, 6vw, 68px); line-height: 1.06; }
.body p { font-size: 19px; font-weight: 300; margin: 0; }
</style>
