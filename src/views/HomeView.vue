<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCatalogue } from '@/stores/catalogue'
import { useAuth } from '@/stores/auth'
import ActivityTile from '@/components/ActivityTile.vue'
import SceneArt from '@/components/SceneArt.vue'

const { tm, rt } = useI18n()
const cat = useCatalogue()
const auth = useAuth()
onMounted(() => cat.load())

const steps = computed(() => (tm('home.steps') as any[]).map((s) => ({ t: rt(s.t), d: rt(s.d) })))
const example = computed(() => (tm('home.exampleRows') as any[]).map((r) => ({ day: rt(r.day), who: rt(r.who), time: rt(r.time), idea: r.idea ? rt(r.idea) : null })))
const recent = computed(() =>
  [...cat.cards].filter((c) => c.last_checked_on).sort((a, b) => b.last_checked_on!.localeCompare(a.last_checked_on!)).slice(0, 3))
</script>

<template>
  <main id="main" class="wrap">
    <section class="hero">
      <div class="stack" style="gap: 18px">
        <h1>{{ $t('home.h1') }}</h1>
        <p class="lead">{{ $t('home.p') }}</p>
        <div class="row">
          <RouterLink :to="{ name: 'discover' }" class="btn primary">{{ $t('home.ctaDiscover') }}</RouterLink>
          <RouterLink :to="auth.loggedIn ? { name: 'week' } : { name: 'login', query: { mode: 'signup' } }" class="btn">{{ $t('home.ctaPlan') }}</RouterLink>
        </div>
      </div>
      <div class="art card"><SceneArt seed="home" :label="$t('card.noImage')" /></div>
    </section>

    <section id="how" class="stack" style="gap: 20px">
      <h2>{{ $t('home.howTitle') }}</h2>
      <ol class="steps">
        <li v-for="(s, i) in steps" :key="i">
          <span class="n">0{{ i + 1 }}</span>
          <h3>{{ s.t }}</h3>
          <p class="muted">{{ s.d }}</p>
        </li>
      </ol>
      <!-- Explanatory example: static content, clearly labelled, never stored as user data -->
      <figure class="panel cream example">
        <figcaption class="row"><span class="badge example">{{ $t('common.example') }}</span><strong>{{ $t('home.exampleTitle') }}</strong><span class="small muted">{{ $t('home.exampleNote') }}</span></figcaption>
        <ul>
          <li v-for="(r, i) in example" :key="i"><strong>{{ r.day }}</strong> · {{ r.time }} · {{ r.who }}<span v-if="r.idea" class="muted"> → {{ r.idea }}</span></li>
        </ul>
      </figure>
    </section>

    <section v-if="recent.length" class="stack" style="gap: 20px">
      <h2>{{ $t('home.recent') }}</h2>
      <div class="grid-cards"><ActivityTile v-for="a in recent" :key="a.id" :a="a" /></div>
      <div><RouterLink :to="{ name: 'discover' }" class="btn accent">{{ $t('home.seeAll') }}</RouterLink></div>
    </section>
    <div v-else-if="cat.status === 'unconfigured'" class="notice error">{{ $t('config.missing') }}</div>
  </main>
</template>

<style scoped>
.hero { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: clamp(24px, 4vw, 56px); align-items: center; }
.art { aspect-ratio: 10 / 7; }
.steps { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 24px; }
.steps li { border-top: 1px solid var(--ink); padding-top: 12px; }
.n { color: var(--magenta-ink); font-weight: 500; }
.steps p { margin: 6px 0 0; }
.example { margin: 0; display: flex; flex-direction: column; gap: 10px; }
.example ul { margin: 0; padding-left: 18px; }
@media (max-width: 760px) { .hero { grid-template-columns: 1fr; } .art { aspect-ratio: auto; height: 200px; } }
</style>
