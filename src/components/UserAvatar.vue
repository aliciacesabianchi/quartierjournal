<script setup lang="ts">
// The signed-in user's picture: own photo, a drawn avatar, or the first letter of the name.
import { computed } from 'vue'
import { useMe } from '@/stores/me'
import { useAuth } from '@/stores/auth'
import { avatarDataUrl, isAvatarKind, type AvatarKind } from '@/domain/avatars'

const props = withDefaults(defineProps<{ size?: number; kind?: AvatarKind | null }>(), { size: 44, kind: undefined })
const me = useMe()
const auth = useAuth()
const src = computed(() => {
  if (props.kind !== undefined) return props.kind && isAvatarKind(props.kind) ? avatarDataUrl(props.kind) : null
  return me.photoUrl ?? (me.avatarKind ? avatarDataUrl(me.avatarKind) : null)
})
const initial = computed(() => (me.profile?.display_name || auth.user?.email || '?').trim().charAt(0).toUpperCase())
</script>

<template>
  <span class="av" :style="{ width: size + 'px', height: size + 'px', fontSize: size * 0.4 + 'px' }" aria-hidden="true">
    <img v-if="src" :src="src" alt="" />
    <template v-else>{{ initial }}</template>
  </span>
</template>

<style scoped>
.av { flex: none; border-radius: 50%; background: #fdf1e3; border: 1px solid var(--ink); display: inline-grid; place-items: center; overflow: hidden; font-weight: 300; line-height: 1; }
.av img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
