<script setup lang="ts">
import { contactEmail } from '@/lib/supabase'
</script>
<template>
  <main id="main" class="wrap" style="max-width: 760px">
    <h1 style="font-size: clamp(36px, 7vw, 56px)">{{ $t('privacy.title') }}</h1>
    <p>{{ $t('privacy.p1') }}</p>
    <p>{{ $t('privacy.p2') }}</p>
    <p>{{ $t('privacy.p3') }}</p>
    <p>{{ $t('privacy.p4') }}</p>
    <p v-if="contactEmail">{{ $t('privacy.contact', { email: contactEmail }) }}</p>
  </main>
</template>
