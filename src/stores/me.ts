// The signed-in user's private data. Every query is additionally restricted by RLS to auth.uid().
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db } from '@/lib/supabase'
import type { Caregiver, CareBlock, Weekday } from '@/domain/types'

export interface Profile { user_id: string; display_name: string | null; home_district_id: number | null; locale: string }
export interface Child { id: string; nickname: string | null; birth_year: number | null; birth_month: number | null }
export interface PlanItem { id: string; activity_id: string; template_id: string | null; occurrence_id: string | null; note: string | null }
export interface Lead { id: string; url: string | null; name: string | null; note: string | null; status: string; created_at: string }

export const useMe = defineStore('me', () => {
  const profile = ref<Profile | null>(null)
  const children = ref<Child[]>([])
  const caregivers = ref<(Caregiver & { is_self: boolean })[]>([])
  const blocks = ref<CareBlock[]>([])
  const plan = ref<PlanItem[]>([])
  const favourites = ref<Set<string>>(new Set())
  const leads = ref<Lead[]>([])
  const loaded = ref(false)

  const selfIds = computed(() => new Set(caregivers.value.filter((c) => c.is_self).map((c) => c.id)))

  function check<T>(r: { data: T | null; error: { message: string } | null }): NonNullable<T> {
    if (r.error) throw new Error(r.error.message)
    return r.data as NonNullable<T>
  }

  let loadGeneration = 0

  async function load() {
    const generation = ++loadGeneration
    const s = db()
    const [p, c, cg, b, pl, f, l] = await Promise.all([
      s.from('profiles').select('*').maybeSingle(),
      s.from('children').select('id, nickname, birth_year, birth_month').order('created_at'),
      s.from('caregivers').select('id, label, color, sort_order, is_self').order('sort_order'),
      s.from('care_blocks').select('id, caregiver_id, weekday, start_time, end_time').order('weekday').order('start_time'),
      s.from('plan_items').select('id, activity_id, template_id, occurrence_id, note').order('created_at'),
      s.from('favourites').select('activity_id'),
      s.from('leads').select('id, url, name, note, status, created_at').order('created_at', { ascending: false }),
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
    profile.value = nextProfile
    children.value = nextChildren
    caregivers.value = nextCaregivers
    blocks.value = nextBlocks
    plan.value = nextPlan
    favourites.value = nextFavourites
    leads.value = nextLeads
    loaded.value = true
  }

  function reset() {
    ++loadGeneration
    profile.value = null; children.value = []; caregivers.value = []; blocks.value = []
    plan.value = []; favourites.value = new Set(); leads.value = []; loaded.value = false
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

  async function addBlock(b: { caregiver_id: string; weekday: Weekday; start_time: string; end_time: string }) {
    blocks.value.push(check(await db().from('care_blocks').insert(b).select('id, caregiver_id, weekday, start_time, end_time').single()))
  }
  async function removeBlock(id: string) {
    check(await db().from('care_blocks').delete().eq('id', id))
    blocks.value = blocks.value.filter((b) => b.id !== id)
  }

  async function addToPlan(item: { activity_id: string; template_id?: string; occurrence_id?: string }) {
    plan.value.push(check(await db().from('plan_items').insert(item).select('id, activity_id, template_id, occurrence_id, note').single()))
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
    profile, children, caregivers, blocks, plan, favourites, leads, loaded, selfIds,
    load, reset, updateProfile, addChild, removeChild, addCaregiver, updateCaregiver, removeCaregiver,
    addBlock, removeBlock, addToPlan, removeFromPlan, inPlan, toggleFavourite, submitLead,
  }
})

