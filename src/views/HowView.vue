<script setup lang="ts">
import { computed } from 'vue'
import { useAuth } from '@/stores/auth'
import { useDesign } from '@/composables/useDesign'
import ExampleWeek from '@/components/ExampleWeek.vue'

const copy = useDesign()
const auth = useAuth()
const lines = computed(() => copy.value.story.introT.split(/(?<=[.!?])\s+/))
const planLink = computed(() => (auth.loggedIn ? { name: 'week' } : { name: 'login', query: { mode: 'signup' } }))
</script>

<template>
  <main id="main" class="wrap how">
    <header class="intro">
      <h1><span v-for="(l, i) in lines" :key="i">{{ l }}</span></h1>
      <p class="lead">{{ copy.story.introP }}</p>
    </header>

    <!-- 1 -->
    <section class="step">
      <div class="txt"><span class="number">01</span><h2>{{ copy.story.s1T }}</h2><p>{{ copy.story.s1C }}</p></div>
      <div class="mock">
        <span class="badge ex">{{ copy.story.ex }}</span>
        <div class="chips">
          <span class="chip on">{{ copy.story.cFri }}</span><span class="chip">{{ $t('common.kreis', { n: 6 }) }}</span><span class="chip">{{ copy.story.cAge }}</span>
        </div>
        <div class="item hot"><strong>{{ copy.story.actT }}</strong><span>10:00–11:00</span></div>
        <div class="item"><strong>{{ copy.story.act2 }}</strong><span>09:00–12:00</span></div>
      </div>
    </section>

    <!-- 2 -->
    <section class="step">
      <div class="txt"><span class="number">02</span><h2>{{ copy.story.s2T }}</h2><p>{{ copy.story.s2C }}</p></div>
      <div class="mock">
        <span class="badge ex">{{ copy.story.ex }}</span>
        <div class="row">
          <div class="item hot grow"><strong>{{ copy.story.actT }}</strong><span>10:00–11:00</span></div>
          <span class="cue">{{ copy.story.addCue }}</span>
        </div>
        <ExampleWeek />
      </div>
    </section>

    <!-- 3 -->
    <section class="step">
      <div class="txt"><span class="number">03</span><h2>{{ copy.story.s3T }}</h2><p>{{ copy.story.s3C }}</p></div>
      <div class="mock">
        <span class="badge ex">{{ copy.story.ex }}</span>
        <div class="item hot"><strong>{{ copy.story.actT }}</strong><span>10:00–11:00</span></div>
        <span class="btn small fake">{{ copy.guest.wa }}</span>
        <div class="bubble">{{ copy.story.msg }}</div>
        <p class="tiny muted">{{ $t('activity.shareNote') }}</p>
      </div>
    </section>

    <section class="cta">
      <h2>{{ copy.story.clT }}</h2>
      <div class="row">
        <RouterLink :to="{ name: 'discover' }" class="btn primary">{{ copy.story.explore }}</RouterLink>
        <RouterLink :to="planLink" class="btn">{{ auth.loggedIn ? copy.story.openW : copy.story.createW }}</RouterLink>
      </div>
      <p v-if="!auth.loggedIn" class="small">{{ copy.story.guestN }}</p>
    </section>
  </main>
</template>

<style scoped>
.how { gap: 0; max-width: 1020px; }
.intro { padding: 24px 0 48px; }
.intro h1 { font-size: clamp(38px, 6vw, 72px); line-height: 1.06; }
.intro h1 span { display: block; }
.lead { margin-top: 20px; font-size: clamp(18px, 2vw, 22px); font-weight: 300; max-width: 36ch; }
.step { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(24px, 5vw, 64px); align-items: center; padding: 56px 0; border-top: 1px solid var(--line); }
.txt { display: flex; flex-direction: column; gap: 16px; align-items: flex-start; }
.txt h2 { font-size: clamp(28px, 3.6vw, 44px); }
.txt p { margin: 0; font-size: 18px; font-weight: 300; max-width: 34ch; }
.number { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: var(--magenta); color: #fff; }
.mock { border: 1px solid var(--line); border-radius: 28px; background: #faf9f7; padding: clamp(16px, 3vw, 28px); display: flex; flex-direction: column; gap: 14px; align-items: flex-start; }
.mock > * { max-width: 100%; }
.ex { background: var(--yellow-soft); }
.chips .chip { cursor: default; }
.chip.on { background: var(--yellow); }
.item { width: 100%; border: 1px solid var(--line); background: #fff; border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; font-weight: 300; }
.item strong { font-weight: 400; font-size: 18px; }
.item.hot { background: var(--magenta); border-color: var(--magenta); color: #fff; }
.item.grow { flex: 1 1 200px; }
.cue { border: 1px dashed var(--ink); border-radius: 99px; padding: 10px 16px; background: var(--yellow-soft); font-size: 14px; }
.fake { cursor: default; background: #fff; }
.bubble { background: #dcf8c6; border-radius: 4px 18px 18px 18px; padding: 14px 16px; max-width: 30ch; font-size: 17px; }
.cta { border-top: 1px solid var(--ink); padding: 48px 0 8px; display: flex; flex-direction: column; gap: 20px; align-items: flex-start; }
.cta h2 { font-size: clamp(28px, 4vw, 48px); }
@media (max-width: 760px) { .step { grid-template-columns: 1fr; padding: 40px 0; } }
</style>
