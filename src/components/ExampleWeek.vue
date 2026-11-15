<script setup lang="ts">
import { useDesign } from '@/composables/useDesign'
const copy = useDesign()
</script>
<template>
  <figure class="example-week">
    <figcaption><span class="badge">{{ copy.story.ex }}</span> {{ copy.story.mkEx }}</figcaption>
    <div class="calendar">
      <div class="times" aria-hidden="true"><span>08</span><span>10</span><span>12</span><span>14</span><span>16</span><span>18</span></div>
      <div class="day"><strong>{{ copy.story.dW }}</strong><div class="slots"><div class="block green morning">Nonna <small>08–14</small></div><div class="block yellow afternoon">{{ copy.story.mir }} <small>14–18</small></div></div></div>
      <div class="day"><strong>{{ copy.story.dT }}</strong><div class="slots"><div class="block blue morning">{{ copy.story.kita }} <small>08–14</small></div><div class="block purple afternoon">Papa <small>14–18</small></div></div></div>
      <div class="day"><strong>{{ copy.story.dF }}</strong><div class="slots"><div class="block yellow friday">{{ copy.story.mir }} <small>09–14</small><div class="singing">{{ copy.story.actT }}<small>10–11</small></div></div><div class="block purple afternoon">Papa <small>14–18</small></div></div></div>
    </div>
    <p>{{ copy.story.book }}</p>
  </figure>
</template>
<style scoped>
.example-week{margin:0;border:1px solid var(--line);border-radius:26px;background:#faf9f7;padding:clamp(16px,2.5vw,28px);text-align:left}.example-week figcaption{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:20px;font-size:15px}.badge{background:var(--yellow-soft)}.calendar{display:grid;grid-template-columns:24px repeat(3,minmax(0,1fr));gap:8px}.day>strong{display:block;text-align:center;font-weight:400;margin-bottom:10px}.slots{height:260px;display:grid;grid-template-rows:repeat(10,1fr);background:white;border-radius:14px}.block{padding:8px;border-radius:12px;font-size:14px;overflow-wrap:anywhere}.block small{display:block;font-size:12px}.morning{grid-row:1/7}.afternoon{grid-row:7/11}.friday{grid-row:2/7}.green{background:#4dbb6f}.blue{background:#5dcbe8}.yellow{background:#ffda52}.purple{background:#bba6cf}.singing{background:#cf307e;color:white;padding:6px;border-radius:8px;margin-top:8px;font-size:12px;line-height:1.25}.times{display:flex;flex-direction:column;justify-content:space-between;padding-top:34px;font-size:11px}.example-week p{font-size:12px;line-height:1.5;margin:16px 0 0}
@media(max-width:400px){.block{padding:6px;font-size:12px}.calendar{gap:4px;grid-template-columns:18px repeat(3,minmax(0,1fr))}.example-week{padding:12px}.singing{padding:4px;font-size:11px}}
</style>
