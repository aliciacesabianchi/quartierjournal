import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { ActivityCard } from '@/domain/types'

export interface District { id: number; number: number; name: string }
export interface Place { id: string; name: string; kind: string | null; features: string | null; address: string | null; quartier: string | null; district_number: number | null; verification: string; data_origin: string; web_url: string | null; activity_count: number; image_url?: string | null; image_credit?: string | null }

export const useCatalogue = defineStore('catalogue', () => {
  const cards = ref<ActivityCard[]>([])
  const districts = ref<District[]>([])
  const places = ref<Place[]>([])        // a few confirmed places for the bottom of Discover
  const placeTotal = ref(0)
  const status = ref<'idle' | 'loading' | 'ready' | 'error' | 'unconfigured'>('idle')
  const error = ref<string | null>(null)

  /** Reads every page of a PostgREST query (the API returns at most 1000 rows per request). */
  async function readAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
    const out: T[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error: e } = await build(from, from + 999)
      if (e) throw new Error(e.message)
      out.push(...(data ?? []))
      if (!data || data.length < 1000) return out
    }
  }

  async function load(force = false) {
    if (!supabase) { status.value = 'unconfigured'; return }
    if (status.value === 'ready' && !force) return
    status.value = 'loading'
    try {
      const sb = supabase
      const [a, d, pl, pc] = await Promise.all([
        // explicit filter: admins may read drafts via RLS, but Discover only ever shows published rows
        readAll<ActivityCard>((f, t) => sb.from('activity_cards').select('*').eq('status', 'published').order('id').range(f, t)),
        sb.from('districts').select('id, number, name').eq('city_id', 'zurich').order('number'),
        // places are secondary: a failure here must not break the activity list
        sb.from('place_cards').select('*').eq('verification', 'provider_verified').gt('activity_count', 0).order('name').limit(8),
        sb.from('place_cards').select('id', { count: 'exact', head: true }),
      ])
      if (d.error) throw new Error(d.error.message)
      cards.value = a
      districts.value = d.data as District[]
      places.value = (pl.data ?? []) as Place[]
      placeTotal.value = pc.count ?? 0
      status.value = 'ready'
    } catch (e) {
      error.value = (e as Error).message
      status.value = 'error'
    }
  }

  const byId = (id: string) => cards.value.find((c) => c.id === id)

  /** Single card, e.g. a draft that an admin previews (RLS decides whether it is visible). */
  async function fetchOne(id: string): Promise<ActivityCard | null> {
    if (!supabase) return null
    const { data } = await supabase.from('activity_cards').select('*').eq('id', id).maybeSingle()
    return (data as ActivityCard | null) ?? null
  }

  return { cards, districts, places, placeTotal, status, error, load, byId, fetchOne }
})
