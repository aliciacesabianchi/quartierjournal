import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { ActivityCard } from '@/domain/types'

export interface District { id: number; number: number; name: string }

export const useCatalogue = defineStore('catalogue', () => {
  const cards = ref<ActivityCard[]>([])
  const districts = ref<District[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error' | 'unconfigured'>('idle')
  const error = ref<string | null>(null)

  async function load(force = false) {
    if (!supabase) { status.value = 'unconfigured'; return }
    if (status.value === 'ready' && !force) return
    status.value = 'loading'
    const [a, d] = await Promise.all([
      // explicit filter: admins may read drafts via RLS, but Discover only ever shows published rows
      supabase.from('activity_cards').select('*').eq('status', 'published').order('title'),
      supabase.from('districts').select('id, number, name').eq('city_id', 'zurich').order('number'),
    ])
    if (a.error || d.error) {
      error.value = (a.error ?? d.error)!.message
      status.value = 'error'
      return
    }
    cards.value = a.data as ActivityCard[]
    districts.value = d.data as District[]
    status.value = 'ready'
  }

  const byId = (id: string) => cards.value.find((c) => c.id === id)

  /** Single card, e.g. a draft that an admin previews (RLS decides whether it is visible). */
  async function fetchOne(id: string): Promise<ActivityCard | null> {
    if (!supabase) return null
    const { data } = await supabase.from('activity_cards').select('*').eq('id', id).maybeSingle()
    return (data as ActivityCard | null) ?? null
  }

  return { cards, districts, status, error, load, byId, fetchOne }
})
