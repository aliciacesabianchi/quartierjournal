// The signed-in user's private data. Every query is additionally restricted by RLS to auth.uid().
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db } from '@/lib/supabase'
import type { NewBlock, Op } from '@/domain/series'
import { isAvatarKind, type AvatarKind } from '@/domain/avatars'
import type { Caregiver, CareBlock, Weekday } from '@/domain/types'

export interface Profile { user_id: string; display_name: string | null; home_district_id: number | null; locale: string; email_plan_confirmations?: boolean; avatar?: string | null; updated_at?: string }
export interface Child { id: string; nickname: string | null; birth_year: number | null; birth_month: number | null }
export interface PlanItem { id: string; activity_id: string; template_id: string | null; occurrence_id: string | null; note: string | null }
export interface UserEvent { id: string; title: string; place: string | null; note: string | null; date: string; start_time: string | null; end_time: string | null; visibility: 'private' | 'public_request' }
export interface InvitedEvent { invite_id: string; status: string; title: string; date: string | null; start_time: string | null; end_time: string | null; place: string | null; inviter_name: string | null; activity_id: string | null; template_id: string | null; occurrence_id: string | null }
export interface Lead { id: string; url: string | null; name: string | null; note: string | null; status: string; created_at: string }

export const useMe = defineStore('me', () => {
  const profile = ref<Profile | null>(null)
  const children = ref<Child[]>([])
  const caregivers = ref<(Caregiver & { is_self: boolean })[]>([])
  const blocks = ref<CareBlock[]>([])
  const plan = ref<PlanItem[]>([])
  const favourites = ref<Set<string>>(new Set())
  const leads = ref<Lead[]>([])
  const skips = ref<{ id: string; block_id: string; date: string }[]>([])
  const events = ref<UserEvent[]>([])
  const invited = ref<InvitedEvent[]>([])
  const loaded = ref(false)
  const photoUrl = ref<string | null>(null)

  const selfIds = computed(() => new Set(caregivers.value.filter((c) => c.is_self).map((c) => c.id)))

  function check<T>(r: { data: T | null; error: { message: string } | null }): NonNullable<T> {
    if (r.error) throw new Error(r.error.message)
    return r.data as NonNullable<T>
  }

  let loadGeneration = 0

  async function load() {
    const generation = ++loadGeneration
    const s = db()
    const [p, c, cg, b, pl, f, l, sk, ev, inv] = await Promise.all([
      s.from('profiles').select('*').maybeSingle(),
      s.from('children').select('id, nickname, birth_year, birth_month').order('created_at'),
      s.from('caregivers').select('id, label, color, sort_order, is_self').order('sort_order'),
      s.from('care_blocks').select('id, caregiver_id, weekday, start_time, end_time, on_date, valid_from, valid_until, interval_weeks').order('weekday').order('start_time'),
      s.from('plan_items').select('id, activity_id, template_id, occurrence_id, note').order('created_at'),
      s.from('favourites').select('activity_id'),
      s.from('leads').select('id, url, name, note, status, created_at').order('created_at', { ascending: false }),
      s.from('care_skips').select('id, block_id, date'),
      s.from('user_events').select('id, title, place, note, date, start_time, end_time, visibility').order('date'),
      s.rpc('my_invited_events'),
    ])
    // A response started before logout/account switching must never repopulate private state.
    if (generation !== loadGeneration) return
    const nextProfile = check(p)
    const nextChildren = check(c)
    const nextCaregivers = check(cg)
    const nextBlocks = check(b)
    const nextPlan = check(pl)
    const nextFavourites = new Set<string>(check(f).map((x: { activity_id: string }) => x.activity_id))
    const nextLeads = check(l)
    const nextSkips = check(sk)
    const nextEvents = check(ev)
    const nextInvited = check(inv) as InvitedEvent[]
    profile.value = nextProfile
    children.value = nextChildren
    caregivers.value = nextCaregivers
    blocks.value = nextBlocks
    plan.value = nextPlan
    favourites.value = nextFavourites
    leads.value = nextLeads
    skips.value = nextSkips
    events.value = nextEvents
    invited.value = nextInvited
    loaded.value = true
    void refreshPhoto()
  }

  /** Own photo (private bucket): a short-lived signed link, only for the signed-in owner. */
  async function refreshPhoto() {
    const uid = profile.value?.user_id
    if (!uid || profile.value?.avatar !== 'photo') { photoUrl.value = null; return }
    const r = await db().storage.from('avatars').createSignedUrl(`${uid}/avatar.jpg`, 3600)
    photoUrl.value = r.data?.signedUrl ? `${r.data.signedUrl}&v=${encodeURIComponent(profile.value?.updated_at ?? '')}` : null
  }
  const avatarKind = computed<AvatarKind | null>(() => { const a = profile.value?.avatar; return a?.startsWith('fantasy:') && isAvatarKind(a.slice(8)) ? (a.slice(8) as AvatarKind) : null })
  async function chooseAvatar(kind: AvatarKind | null) { await updateProfile({ avatar: kind ? `fantasy:${kind}` : null }); photoUrl.value = null }
  /** Uploads an already resized image (see lib/image.ts) and switches the profile to it. */
  async function uploadPhoto(blob: Blob) {
    const uid = profile.value?.user_id
    if (!uid) return
    const up = await db().storage.from('avatars').upload(`${uid}/avatar.jpg`, blob, { upsert: true, contentType: 'image/jpeg' })
    if (up.error) throw new Error(up.error.message)
    await updateProfile({ avatar: 'photo' })
    await refreshPhoto()
  }
  async function removePhoto() {
    const uid = profile.value?.user_id
    if (!uid) return
    await db().storage.from('avatars').remove([`${uid}/avatar.jpg`])
    await updateProfile({ avatar: null }); photoUrl.value = null
  }

  function reset() {
    ++loadGeneration
    profile.value = null; children.value = []; caregivers.value = []; blocks.value = []
    plan.value = []; favourites.value = new Set(); leads.value = []; skips.value = []; events.value = []; invited.value = []; loaded.value = false; photoUrl.value = null
  }

  async function updateProfile(patch: Partial<Omit<Profile, 'user_id'>>) {
    const uid = profile.value?.user_id
    if (!uid) return
    profile.value = check(await db().from('profiles').update(patch).eq('user_id', uid).select().single())
  }

  async function addChild(c: Omit<Child, 'id'>) {
    children.value.push(check(await db().from('children').insert(c).select('id, nickname, birth_year, birth_month').single()))
  }
  async function removeChild(id: string) {
    check(await db().from('children').delete().eq('id', id))
    children.value = children.value.filter((c) => c.id !== id)
  }

  async function addCaregiver(label: string, color: string, isSelf = false) {
    const row = check(await db().from('caregivers')
      .insert({ label, color, is_self: isSelf, sort_order: caregivers.value.length })
      .select('id, label, color, sort_order, is_self').single())
    caregivers.value.push(row)
    return row
  }
  async function updateCaregiver(id: string, patch: { label?: string; color?: string }) {
    const row = check(await db().from('caregivers').update(patch).eq('id', id).select('id, label, color, sort_order, is_self').single())
    caregivers.value = caregivers.value.map((c) => (c.id === id ? row : c))
  }
  async function removeCaregiver(id: string) {
    check(await db().from('caregivers').delete().eq('id', id))
    caregivers.value = caregivers.value.filter((c) => c.id !== id)
  }

  async function addBlock(b: Partial<NewBlock> & { caregiver_id: string; weekday: Weekday; start_time: string; end_time: string }) {
    blocks.value.push(check(await db().from('care_blocks').insert(b).select('id, caregiver_id, weekday, start_time, end_time, on_date, valid_from, valid_until, interval_weeks').single()))
  }
  async function updateBlock(id: string, patch: Partial<NewBlock>) {
    const row = check(await db().from('care_blocks').update(patch).eq('id', id).select('id, caregiver_id, weekday, start_time, end_time, on_date, valid_from, valid_until, interval_weeks').single())
    blocks.value = blocks.value.map((b) => (b.id === id ? row : b))
  }
  async function removeBlock(id: string) {
    check(await db().from('care_blocks').delete().eq('id', id))
    blocks.value = blocks.value.filter((b) => b.id !== id)
  }

  /** Runs the steps of a calendar-style change (see domain/series.ts). Stops at the first error and reloads care times so the screen matches the database. */
  async function applyOps(ops: Op[]) {
    try {
      for (const o of ops) {
        if (o.op === 'insert') await addBlock(o.row)
        else if (o.op === 'update') await updateBlock(o.id, o.patch)
        else if (o.op === 'skip') await skipWeek(o.block_id, o.date)
        else await removeBlock(o.id)
      }
    } catch (e) {
      const s = db()
      const [b, k] = await Promise.all([s.from('care_blocks').select('id, caregiver_id, weekday, start_time, end_time, on_date, valid_from, valid_until, interval_weeks').order('weekday').order('start_time'), s.from('care_skips').select('id, block_id, date')])
      if (b.data) blocks.value = b.data
      if (k.data) skips.value = k.data
      throw e
    }
  }
  /** "Not this week" (holidays): hides one weekly time on one date only. */
  async function skipWeek(blockId: string, date: string) {
    skips.value.push(check(await db().from('care_skips').insert({ block_id: blockId, date }).select('id, block_id, date').single()))
  }
  async function unskip(id: string) {
    check(await db().from('care_skips').delete().eq('id', id))
    skips.value = skips.value.filter((x) => x.id !== id)
  }

  async function addEvent(e: Omit<UserEvent, 'id'>) {
    const row = check(await db().from('user_events').insert(e).select('id, title, place, note, date, start_time, end_time, visibility').single()) as UserEvent
    events.value = [...events.value, row].sort((a, b) => a.date.localeCompare(b.date))
    return row
  }
  async function removeEvent(id: string) {
    check(await db().from('user_events').delete().eq('id', id))
    events.value = events.value.filter((e) => e.id !== id)
  }
  async function leaveInvited(inviteId: string) {
    check(await db().from('event_guests').delete().eq('invite_id', inviteId))
    invited.value = invited.value.filter((i) => i.invite_id !== inviteId)
  }

  /** Adds to the plan, then asks the email function to send a confirmation to the user's own address (never blocks or fails the add).
   *  Returns why no email was sent, so the page can say so honestly instead of staying silent. */
  async function addToPlan(item: { activity_id: string; template_id?: string; occurrence_id?: string }): Promise<{ emailed: boolean; to?: string; reason?: string }> {
    const row = check(await db().from('plan_items').insert(item).select('id, activity_id, template_id, occurrence_id, note').single()) as unknown as PlanItem
    plan.value.push(row)
    if (profile.value?.email_plan_confirmations === false) return { emailed: false, reason: 'opted_out' }
    try {
      const call = db().functions.invoke('plan-confirmation', { body: { plan_item_id: row.id } })
      const res = (await Promise.race([call, new Promise<null>((r) => setTimeout(() => r(null), 12000))])) as { data?: { sent?: boolean; to?: string; reason?: string } | null; error?: { message?: string; context?: Response } } | null
      if (!res) return { emailed: false, reason: 'timeout' }
      if (res.error) {
        let reason = 'error'
        try { const j = await (res.error.context as Response).clone().json(); reason = j?.detail ? `${j.reason}: ${j.detail}` : (j?.reason ?? (res.error.context as Response).status + '') } catch { reason = res.error.message ?? 'error' }
        return { emailed: false, reason }
      }
      return res.data?.sent ? { emailed: true, to: res.data.to } : { emailed: false, reason: res.data?.reason ?? 'unknown' }
    } catch (e) { return { emailed: false, reason: (e as Error).message?.slice(0, 60) ?? 'error' } }
  }
  async function removeFromPlan(id: string) {
    check(await db().from('plan_items').delete().eq('id', id))
    plan.value = plan.value.filter((p) => p.id !== id)
  }
  const inPlan = (slotId: string) => plan.value.some((p) => p.template_id === slotId || p.occurrence_id === slotId)

  async function toggleFavourite(activityId: string) {
    const next = new Set(favourites.value)
    if (next.has(activityId)) {
      check(await db().from('favourites').delete().eq('activity_id', activityId))
      next.delete(activityId)
    } else {
      check(await db().from('favourites').insert({ activity_id: activityId }))
      next.add(activityId)
    }
    favourites.value = next
  }

  async function submitLead(l: { url: string | null; name: string | null; note: string | null }) {
    const row = check(await db().from('leads').insert(l).select('id, url, name, note, status, created_at').single())
    leads.value.unshift(row)
    return row
  }

  return {
    profile, photoUrl, avatarKind, chooseAvatar, uploadPhoto, removePhoto, children, caregivers, blocks, plan, favourites, leads, skips, events, invited, loaded, selfIds, skipWeek, unskip, applyOps, addEvent, removeEvent, leaveInvited,
    load, reset, updateProfile, addChild, removeChild, addCaregiver, updateCaregiver, removeCaregiver,
    addBlock, updateBlock, removeBlock, addToPlan, removeFromPlan, inPlan, toggleFavourite, submitLead,
  }
})

