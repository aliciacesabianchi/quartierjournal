// Friends, invitations and shared free times. Everything goes through database functions that enforce consent;
// the browser never reads other people's rows.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, appUrl } from '@/lib/supabase'

export interface Friend { friend_id: string; display_name: string | null; i_share: boolean; shares_with_me: boolean }
export interface Overlap { weekday: number; start_time: string; end_time: string }
export interface Guest { guest_id: string; display_name: string | null; status: 'going' | 'maybe' | 'declined'; responded_at: string }
export interface EventInviteInfo {
  valid: boolean; own: boolean; title: string | null; date: string | null; start_time: string | null; end_time: string | null
  place: string | null; note: string | null; inviter_name: string | null; my_status: string | null
  activity_id: string | null; template_id: string | null; occurrence_id: string | null; invite_id: string | null
}

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

export const useSocial = defineStore('social', () => {
  const friends = ref<Friend[]>([])
  const loaded = ref(false)

  async function loadFriends() { friends.value = check(await db().rpc('my_friends')) ?? []; loaded.value = true }
  function reset() { friends.value = []; loaded.value = false }

  /** A one-time link. Opening it does nothing until the other person signs in and presses "accept". */
  async function createFriendLink(): Promise<string> {
    const tok = check(await db().rpc('create_friend_invite')) as string
    return `${appUrl()}/einladung/freund/${tok}`
  }
  const peekFriend = async (token: string) => (check(await db().rpc('peek_friend_invite', { p_token: token })) as { valid: boolean; inviter_name: string | null }[])[0]
  async function acceptFriend(token: string) { check(await db().rpc('accept_friend_invite', { p_token: token })); await loadFriends() }
  async function unfriend(id: string) { check(await db().from('friendships').delete().eq('friend_id', id)); friends.value = friends.value.filter((f) => f.friend_id !== id) }

  async function setShare(friendId: string, on: boolean) {
    if (on) check(await db().from('availability_shares').insert({ viewer_id: friendId }))
    else check(await db().from('availability_shares').delete().eq('viewer_id', friendId))
    friends.value = friends.value.map((f) => (f.friend_id === friendId ? { ...f, i_share: on } : f))
  }
  const overlap = async (friendId: string) => (check(await db().rpc('friend_overlap', { p_friend: friendId })) ?? []) as Overlap[]

  async function createEventLink(src: { userEventId?: string; activityId?: string; templateId?: string | null; occurrenceId?: string | null }): Promise<string> {
    const tok = check(await db().rpc('create_event_invite', {
      p_user_event: src.userEventId ?? null, p_activity: src.activityId ?? null, p_template: src.templateId ?? null, p_occurrence: src.occurrenceId ?? null,
    })) as string
    return `${appUrl()}/einladung/event/${tok}`
  }
  const getEventInvite = async (token: string) => (check(await db().rpc('get_event_invite', { p_token: token })) as EventInviteInfo[])[0]
  const respond = async (token: string, status: 'going' | 'maybe' | 'declined') => { check(await db().rpc('respond_event_invite', { p_token: token, p_status: status })) }
  /** Ids of the invitations I created for one event, so the guest list covers every link I sent. */
  async function inviteIds(src: { userEventId?: string; activityId?: string; templateId?: string | null; occurrenceId?: string | null }): Promise<string[]> {
    let q = db().from('event_invites').select('id')
    if (src.userEventId) q = q.eq('user_event_id', src.userEventId)
    else {
      q = q.eq('activity_id', src.activityId ?? '')
      q = src.templateId ? q.eq('template_id', src.templateId) : q.eq('occurrence_id', src.occurrenceId ?? '')
    }
    return (check(await q) ?? []).map((r: { id: string }) => r.id)
  }
  const guests = async (inviteId: string) => (check(await db().rpc('my_event_guests', { p_invite: inviteId })) ?? []) as Guest[]
  const removeGuest = async (inviteId: string, guestId: string) => { check(await db().rpc('remove_event_guest', { p_invite: inviteId, p_guest: guestId })) }

  return { friends, loaded, loadFriends, reset, createFriendLink, peekFriend, acceptFriend, unfriend, setShare, overlap, createEventLink, inviteIds, getEventInvite, respond, guests, removeGuest }
})
