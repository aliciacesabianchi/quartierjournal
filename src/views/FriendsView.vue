<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSocial, type Overlap } from '@/stores/social'
import { useFormat } from '@/composables/useFormat'
import { hhmm } from '@/domain/time'
import type { Weekday } from '@/domain/types'
import ShareButtons from '@/components/ShareButtons.vue'

const { t } = useI18n()
const social = useSocial()
const f = useFormat()
const error = ref<string | null>(null)
const link = ref<string | null>(null)
const busy = ref(false)
const overlaps = reactive<Record<string, Overlap[] | undefined>>({})

async function run(fn: () => Promise<unknown>) {
  error.value = null
  try { await fn() } catch (e) { error.value = t('auth.errors.generic', { msg: (e as Error).message }) }
}
onMounted(() => run(() => social.loadFriends()))
const name = (n: string | null) => n || t('soc.family')
async function newLink() { busy.value = true; await run(async () => { link.value = await social.createFriendLink() }); busy.value = false }
const toggleShare = (id: string, on: boolean) => run(() => social.setShare(id, on))
const compare = (id: string) => run(async () => { overlaps[id] = await social.overlap(id) })
function unfriend(id: string, n: string | null) {
  if (window.confirm(t('soc.confirmUnfriend', { name: name(n) }))) void run(async () => { await social.unfriend(id); delete overlaps[id] })
}
</script>

<template>
  <main id="main" class="wrap">
    <div>
      <h1>{{ $t('soc.friendsTitle') }}</h1>
      <p class="lead" style="margin-top: 12px">{{ $t('soc.friendsSub') }}</p>
    </div>
    <div v-if="error" class="notice error" role="alert">{{ error }}</div>

    <section class="panel stack">
      <h2 class="h">{{ $t('soc.addFriend') }}</h2>
      <div v-if="!link"><button class="btn primary" :disabled="busy" @click="newLink">{{ busy ? $t('soc.creating') : $t('soc.addFriend') }}</button></div>
      <template v-else>
        <p style="margin: 0">{{ $t('soc.friendLinkReady') }}</p>
        <ShareButtons :url="link" :message="$t('soc.friendLinkMsg')" :subject="$t('soc.friendLinkMsg')" />
      </template>
      <p class="tiny muted" style="margin: 0">{{ $t('soc.friendLinkSafety') }}</p>
    </section>

    <section class="stack">
      <p v-if="!social.loaded" class="muted">{{ $t('common.loading') }}</p>
      <p v-else-if="!social.friends.length" class="muted">{{ $t('soc.noFriends') }}</p>
      <ul v-else class="friends">
        <li v-for="fr in social.friends" :key="fr.friend_id" class="panel stack">
          <strong class="nm">{{ name(fr.display_name) }}</strong>
          <label class="check">
            <input type="checkbox" :checked="fr.i_share" @change="toggleShare(fr.friend_id, ($event.target as HTMLInputElement).checked)" />
            <span>{{ $t('soc.youShare', { name: name(fr.display_name) }) }}</span>
          </label>
          <p class="small muted" style="margin: 0">{{ fr.shares_with_me ? $t('soc.theyShare', { name: name(fr.display_name) }) : $t('soc.theyNotShare', { name: name(fr.display_name) }) }}</p>
          <div class="row">
            <button class="btn small" :disabled="!fr.shares_with_me" @click="compare(fr.friend_id)">{{ $t('soc.compare') }}</button>
            <button class="btn small" style="border-color: var(--danger); color: var(--danger)" @click="unfriend(fr.friend_id, fr.display_name)">{{ $t('soc.unfriend') }}</button>
          </div>
          <p v-if="!fr.shares_with_me" class="tiny muted" style="margin: 0">{{ $t('soc.overlapNeed', { name: name(fr.display_name) }) }}</p>
          <div v-if="overlaps[fr.friend_id]">
            <h3 class="small" style="margin: 4px 0">{{ $t('soc.overlapTitle') }}</h3>
            <p v-if="!overlaps[fr.friend_id]!.length" class="muted" style="margin: 0">{{ $t('soc.overlapNone') }}</p>
            <ul v-else class="ov"><li v-for="(o, i) in overlaps[fr.friend_id]" :key="i"><strong>{{ f.day(o.weekday as Weekday, 'long') }}</strong> {{ hhmm(o.start_time) }}–{{ hhmm(o.end_time) }}</li></ul>
          </div>
        </li>
      </ul>
      <p class="tiny muted">{{ $t('soc.shareHelp') }}</p>
    </section>
  </main>
</template>

<style scoped>
.h { font-size: 26px; font-weight: 400; }
.friends { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
.nm { font-size: 20px; font-weight: 400; }
.check { display: flex; gap: 10px; align-items: center; cursor: pointer; }
.check input { width: 22px; height: 22px; }
.ov { margin: 0; padding-left: 18px; }
</style>
