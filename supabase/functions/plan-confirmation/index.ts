// Edge Function: sends the plan-confirmation email to the LOGGED-IN user's own address (never to anyone else).
// Called by the website right after an item is added to the plan. Needs these function secrets:
//   BREVO_API_KEY (set by the owner in the Supabase dashboard), MAIL_FROM_EMAIL, MAIL_FROM_NAME, APP_URL, CONTACT_EMAIL (optional).
import { buildEmail, type Locale } from '../_shared/email.ts'

const SB = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const HOURLY_LIMIT = 20

async function rest(path: string, jwt: string, key = ANON) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${jwt}` } })
  if (!r.ok) throw new Error(`rest ${path.split('?')[0]} ${r.status}`)
  return await r.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ sent: false, reason: 'method' }, 405)
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ sent: false, reason: 'auth' }, 401)
    const { plan_item_id } = await req.json().catch(() => ({}))
    if (typeof plan_item_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(plan_item_id)) return json({ sent: false, reason: 'bad_request' }, 400)

    const who = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } })
    if (!who.ok) return json({ sent: false, reason: 'auth' }, 401)
    const user = await who.json()
    if (!user?.id || !user?.email) return json({ sent: false, reason: 'no_email' })

    // everything below is read with the USER's token, so row-level security guarantees it is the user's own plan item
    const items = await rest(`plan_items?id=eq.${plan_item_id}&select=id,activity_id,template_id,occurrence_id`, jwt)
    if (!items.length) return json({ sent: false, reason: 'not_found' }, 404)
    const item = items[0]
    const profile = (await rest(`profiles?user_id=eq.${user.id}&select=locale,display_name,email_plan_confirmations`, jwt))[0]
    if (profile && profile.email_plan_confirmations === false) return json({ sent: false, reason: 'opted_out' })

    // rate limit + once per plan item (private log table, service role only)
    const since = new Date(Date.now() - 3600_000).toISOString()
    const recent = await rest(`email_log?user_id=eq.${user.id}&created_at=gte.${since}&select=id`, SERVICE, SERVICE)
    if (recent.length >= HOURLY_LIMIT) return json({ sent: false, reason: 'rate_limited' }, 429)
    const dup = await rest(`email_log?kind=eq.plan_confirmation&plan_item_id=eq.${plan_item_id}&select=id`, SERVICE, SERVICE)
    if (dup.length) return json({ sent: false, reason: 'already_sent' })

    const card = (await rest(`activity_cards?id=eq.${item.activity_id}&select=id,title,venue_name,address,district_number,organiser_url,templates,upcoming`, jwt))[0]
    if (!card) return json({ sent: false, reason: 'not_found' }, 404)
    const template = item.template_id ? (card.templates ?? []).find((t: { id: string }) => t.id === item.template_id) : undefined
    const occurrence = item.occurrence_id ? (card.upcoming ?? []).find((o: { id: string }) => o.id === item.occurrence_id) : undefined
    if (!template && !occurrence) return json({ sent: false, reason: 'not_found' }, 404)

    const key = Deno.env.get('BREVO_API_KEY'); const from = Deno.env.get('MAIL_FROM_EMAIL')
    if (!key || !from) return json({ sent: false, reason: 'not_configured' }, 503)
    const appUrl = Deno.env.get('APP_URL') ?? 'https://quartierjournal.pages.dev'
    const contact = Deno.env.get('CONTACT_EMAIL') ?? null
    const mail = buildEmail({ locale: (profile?.locale ?? 'de') as Locale, name: profile?.display_name ?? null, card, template, occurrence, appUrl, contact })

    const body: Record<string, unknown> = {
      sender: { name: Deno.env.get('MAIL_FROM_NAME') ?? 'Quartierjournal', email: from },
      to: [{ email: user.email }],
      subject: mail.subject, htmlContent: mail.html, textContent: mail.text,
      ...(contact ? { replyTo: { email: contact } } : {}),
      ...(mail.ics ? { attachment: [{ name: 'quartierjournal.ics', content: btoa(String.fromCharCode(...new TextEncoder().encode(mail.ics))) }] } : {}),
    }
    const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) {
      const txt = (await r.text()).replace(/\s+/g, ' ').slice(0, 200)
      console.error('brevo', r.status, txt)
      // Brevo's answer contains no secret (only a code and a message), so it is passed on to make problems visible
      return json({ sent: false, reason: 'provider_error', detail: `Brevo ${r.status}: ${txt}` }, 502)
    }

    await fetch(`${SB}/rest/v1/email_log`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: user.id, kind: 'plan_confirmation', plan_item_id }) })
    return json({ sent: true, to: user.email })
  } catch (e) {
    const detail = (e as Error).message?.slice(0, 120) ?? 'unknown'
    console.error('plan-confirmation', detail)
    return json({ sent: false, reason: 'error', detail }, 500)
  }
})
