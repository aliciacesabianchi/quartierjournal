<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSocial, type EventInviteInfo } from '@/stores/social'
import { useMe } from '@/stores/me'
import { useFormat } from '@/composables/useFormat'

const props = defineProps<{ kind: 'freund' | 'event'; token: string }>()
const { t } = useI18n()
const social = useSocial()
const me = useMe()
const f = useFormat()
const state = ref<'loading' | 'invalid' | 'ready' | 'done'>('loading')
const inviter = ref<string | null>(null)
const ev = ref<EventInviteInfo | null>(null)
const error = ref<string | null>(null)

const who = computed(() => inviter.value || t('soc.family'))
const when = computed(() => (ev.value?.date ? `${f.date(ev.value.date)} ${f.time(ev.value.start_time, ev.value.end_time)}`.trim() : ''))

async function load() {
  try {
    if (props.kind === 'freund') {
      const r = await social.peekFriend(props.token)
      inviter.value = r?.inviter_name ?? null
      state.value = r?.valid ? 'ready' : 'invalid'
    } else {
      const r = await social.getEventInvite(props.token)
      ev.value = r ?? null
      state.value = r?.valid ? 'ready' : 'invalid'
    }
  } catch { state.value = 'invalid' }
}
onMounted(load)

async function accept() {
  error.value = null
  try { await social.acceptFriend(props.token); state.value = 'done' } catch (e) { error.value = t('auth.errors.generic', { msg: (e as Error).message }) }
}
async function answer(s: 'going' | 'maybe' | 'declined') {
  error.value = null
  try { await social.respond(props.token, s); await me.load(); await load(); state.value = 'done' } catch (e) { error.value = t('auth.errors.generic', { msg: (e as Error).message }) }
}
</script>

<template>
  <main id="main" class="wrap">
    <p v-if="state === 'loading'">{{ $t('common.loading') }}</p>
    <div v-else-if="state === 'invalid'" class="notice error" role="alert">{{ $t('soc.linkInvalid') }}</div>

    <section v-else-if="kind === 'freund'" class="panel stack">
      <template v-if="state === 'ready'">
        <h1 style="font-size: 30px">{{ inviter ? $t('soc.inviteFriendTitle', { name: inviter }) : $t('soc.inviteFriendAnon') }}</h1>
        <p class="small muted" style="margin: 0">{{ $t('soc.friendLinkSafety') }}</p>
        <div v-if="error" class="notice error" role="alert">{{ error }}</div>
        <div class="row">
          <button class="btn primary" @click="accept">{{ $t('soc.accept') }}</button>
          <RouterLink class="btn" :to="{ name: 'discover' }">{{ $t('soc.notNow') }}</RouterLink>
        </div>
      </template>
      <template v-else>
        <h1 style="font-size: 30px">{{ $t('soc.connected') }}</h1>
        <div><RouterLink class="btn primary" :to="{ name: 'friends' }">{{ $t('soc.toFriends') }}</RouterLink></div>
      </template>
    </section>

    <section v-else-if="ev" class="panel stack">
      <h1 style="font-size: 30px">{{ ev.title }}</h1>
      <p style="margin: 0">{{ $t('soc.invitedBy', { name: who }) }}</p>
      <p v-if="when" style="margin: 0"><strong>{{ when }}</strong></p>
      <p v-if="ev.place" style="margin: 0">📍 {{ ev.place }}</p>
      <p v-if="ev.note" style="margin: 0">{{ ev.note }}</p>
      <p v-if="!ev.place && !ev.activity_id && !ev.my_status" class="small muted" style="margin: 0">{{ $t('soc.placeAfter') }}</p>
      <RouterLink v-if="ev.activity_id" :to="{ name: 'activity', params: { id: ev.activity_id } }">{{ $t('soc.offer') }}</RouterLink>
      <div v-if="error" class="notice error" role="alert">{{ error }}</div>
      <div v-if="ev.own" class="small muted">{{ $t('soc.inviteIntro') }}</div>
      <template v-else>
        <h2 class="small" style="margin: 4px 0">{{ $t('soc.yourAnswer') }}<template v-if="ev.my_status"> · {{ $t('soc.' + ev.my_status) }}</template></h2>
        <div class="row">
          <button class="btn primary" @click="answer('going')">{{ $t('soc.going') }}</button>
          <button class="btn" @click="answer('maybe')">{{ $t('soc.maybe') }}</button>
          <button class="btn" @click="answer('declined')">{{ $t('soc.declined') }}</button>
        </div>
        <p v-if="state === 'done'" class="small" style="margin: 0">{{ $t('soc.answered') }} <RouterLink :to="{ name: 'week' }">{{ $t('soc.toWeek') }}</RouterLink></p>
      </template>
    </section>
  </main>
</template>
