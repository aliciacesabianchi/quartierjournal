import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
// 'same-origin' is only used for local previews through the dev-server proxy
const url = rawUrl === 'same-origin' ? window.location.origin : rawUrl
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** null when the build has no Supabase configuration; the UI then says so instead of showing fake data. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } }) : null

export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export const appUrl = () => window.location.origin
export const contactEmail = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) || 'cesabianchi.a@gmail.com'
