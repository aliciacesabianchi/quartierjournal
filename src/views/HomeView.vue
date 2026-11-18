<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useCatalogue } from '@/stores/catalogue'
import { useAuth } from '@/stores/auth'
import { useDesign } from '@/composables/useDesign'
import ActivityTile from '@/components/ActivityTile.vue'
import ExampleWeek from '@/components/ExampleWeek.vue'
import MemberHome from '@/components/MemberHome.vue'
import { useDayIdeas } from '@/composables/useDayIdeas'
const copy = useDesign()
const cat = useCatalogue()
const auth = useAuth()
onMounted(() => cat.load())
const slides = ['home-indoor','home-josefwiese','home-playground','home-water','home-zurich']
const slide = ref(0)
const planLink = computed(() => auth.loggedIn ? { name:'week' } : { name:'login',query:{mode:'signup'} })
const ideas = useDayIdeas()
const storyHeading = computed(() => { const s=copy.value.story.stH; const p=s.indexOf('.'); return [s.slice(0,p+1),s.slice(p+1).trim()] })
</script>
<template>
 <MemberHome v-if="auth.loggedIn" />
 <main v-else id="main" class="wrap home">
  <section class="hero">
   <div class="hero-copy"><h1>{{ copy.guest.h1 }}</h1><p>{{ copy.guest.p }}</p><p class="made">{{ $t('ui.madeBy') }}</p><div class="row"><RouterLink :to="{name:'discover'}" class="btn primary">{{ copy.guest.b1 }}</RouterLink><RouterLink :to="planLink" class="btn">{{ copy.guest.b2 }}</RouterLink></div></div>
   <div class="hero-photo"><img :src="`/photos/${slides[slide]}.webp`" alt="" fetchpriority="high" width="1000" height="750"><div class="photo-controls"><button @click="slide=(slide+4)%5" aria-label="Previous">←</button><span aria-hidden="true">{{slide+1}} / 5</span><button @click="slide=(slide+1)%5" aria-label="Next">→</button></div></div>
  </section>
  <section id="about" class="story">
   <div class="story-copy"><h2><span>{{ storyHeading[0] }}</span><span class="underline">{{ storyHeading[1] }}</span></h2><p>{{ copy.story.stP1 }}</p><p>{{ copy.story.stP2a }}<strong>{{ copy.story.stEm }}</strong>{{ copy.story.stP2b }}</p><p>{{ copy.story.stP3 }}</p><p class="ending">{{ copy.story.stEnd }}</p><RouterLink :to="{name:'discover'}" class="btn primary">{{ copy.story.explore }} →</RouterLink></div>
  </section>
  <section id="how" class="how"><h2>{{ copy.guest.how }}</h2><ol class="steps"><li><span class="number">01</span><h3>{{ copy.story.s1T }}</h3><p>{{ copy.story.s1C }}</p><div class="mini-discover"><img src="/photos/home-playground.webp" alt="" loading="lazy"><span>{{copy.story.act2}}<br><small>{{copy.story.cAge}} · Zürich</small></span></div></li><li><span class="number">02</span><h3>{{copy.story.s2T}}</h3><p>{{copy.story.s2C}}</p><div class="mini-blocks"><span>{{copy.story.kita}}</span><span>{{copy.story.mir}}</span><span>{{copy.story.actT}}</span></div></li><li><span class="number">03</span><h3>{{copy.story.s3T}}</h3><p>{{copy.story.s3C}}</p><blockquote>{{copy.story.msg}}</blockquote><small>{{copy.guest.ex}}</small></li></ol><RouterLink :to="{name:'how'}" class="how-link">{{ copy.guest.how }} →</RouterLink></section>
  <section v-if="ideas.cards.length" class="discover-section"><div class="section-title"><h2>{{ $t('ui.home.'+ideas.key) }}</h2></div><div class="grid-cards"><ActivityTile v-for="a in ideas.cards" :key="a.id" :a="a"/></div><p class="small muted ideas-note">{{ $t('ui.home.ideasNote') }}</p><RouterLink :to="{name:'discover'}" class="btn">{{ copy.guest.all }} →</RouterLink></section>
  <div v-else-if="cat.status==='unconfigured'" class="notice">{{$t('config.missing')}}</div>
  <section class="join"><div><h2>{{copy.guest.finT}}</h2><p>{{copy.story.mkP}}</p><RouterLink :to="planLink" class="btn primary">{{auth.loggedIn?copy.story.openW:copy.guest.finB}}</RouterLink><RouterLink :to="{name:'discover'}" class="guest-link">{{copy.story.mkLink}}</RouterLink></div><ExampleWeek/></section>
  <section class="gem"><h2>{{copy.guest.gemT}}</h2><p>{{copy.guest.gemP}}</p><RouterLink :to="{name:'suggest'}" class="btn">{{copy.guest.gemB}} →</RouterLink></section>
 </main>
</template>
<style scoped>
main.home{gap:clamp(64px,9vw,120px);padding-top:48px;padding-bottom:80px}.hero{display:grid;grid-template-columns:1fr 1.15fr;gap:48px;align-items:center}.hero h1{font-size:clamp(42px,5.2vw,72px);line-height:1.08}.hero-copy>p.made{font-size:clamp(16px,1.7vw,19px);font-weight:500;margin:-8px 0 28px;color:var(--ink)}.hero-copy>p{font-size:clamp(18px,2vw,24px);font-weight:300;margin:28px 0}.home .btn{font-size:17px;padding:15px 26px}.hero-photo{position:relative;aspect-ratio:1.25;overflow:hidden;border-radius:32px}.hero-photo>img{width:100%;height:100%;object-fit:cover}.photo-controls{position:absolute;bottom:16px;left:16px;right:16px;display:flex;align-items:center;justify-content:space-between}.photo-controls button{border:0;border-radius:50%;width:44px;height:44px;background:white;cursor:pointer}.photo-controls span{background:#fff;padding:4px 12px;border-radius:20px;font-size:12px}.story{padding:16px 0}.story-copy{max-width:680px;margin:auto;text-align:center;display:flex;flex-direction:column;align-items:center;gap:28px}.story h2{font-size:clamp(34px,4.3vw,56px);font-weight:600;line-height:1.22}.story h2 span{display:block}.underline{text-decoration:underline;text-decoration-color:var(--green);text-decoration-thickness:3px;text-underline-offset:8px}.story p{font-size:clamp(18px,1.65vw,21px);line-height:1.65;margin:0}.story .ending{font-weight:500;font-size:23px;margin-top:12px}.how>h2{margin-bottom:32px;font-size:clamp(32px,4vw,52px)}.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));list-style:none;margin:0;padding:0;gap:24px}.steps li{border:1px solid var(--ink);border-radius:26px;padding:26px;display:flex;flex-direction:column;align-items:flex-start;gap:18px}.number{display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:var(--magenta);color:white}.steps h3{font-size:25px}.steps p{margin:0}.steps blockquote{margin:0;background:var(--yellow-soft);border-radius:20px;padding:18px;font-size:18px}.mini-discover{margin-top:auto;border:1px solid var(--line);border-radius:16px;overflow:hidden;width:100%}.mini-discover img{width:100%;height:110px;object-fit:cover}.mini-discover span{display:block;padding:12px}.mini-blocks{display:grid;gap:6px;width:100%;margin-top:auto}.mini-blocks span{padding:12px;border-radius:10px;background:var(--blue)}.mini-blocks span:nth-child(2){background:var(--yellow)}.mini-blocks span:nth-child(3){background:var(--magenta);color:white}.section-title{display:flex;gap:24px;justify-content:space-between;align-items:center;flex-wrap:wrap;margin-bottom:28px}.join{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;background:#fffbe8;border-radius:32px;padding:clamp(24px,4vw,48px)}.join h2{font-size:clamp(34px,4vw,52px)}.join p,.gem p{font-size:20px;line-height:1.6;margin:28px 0}.guest-link{display:block;margin-top:24px}.gem{max-width:720px}.gem h2{font-size:clamp(30px,4vw,46px)}
@media(max-width:900px){.steps{grid-template-columns:1fr}.steps li{padding:24px}.mini-discover{max-width:360px}.mini-blocks{max-width:360px}.join{grid-template-columns:1fr}.hero{gap:24px}.hero h1{font-size:44px}}
@media(max-width:640px){.hero{grid-template-columns:1fr}.hero-photo{aspect-ratio:1.4}.hero .row{align-items:stretch}.hero .btn{flex:1}.join{padding:20px;gap:28px}.story-copy{gap:22px}.home .btn{font-size:16px;padding:14px 20px}.hero h1{font-size:44px}main.home{padding-top:28px}}
.how-link{display:inline-block;margin-top:24px}.ideas-note{margin:16px 0 20px}
</style>
