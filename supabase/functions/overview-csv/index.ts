// Edge Function: read-only CSV overview of the PUBLIC catalogue for the owner's spreadsheet (Google Sheets IMPORTDATA / Excel "From Web").
//   ?sheet=offers      one row per published offer (provider, category, sub-category, type, source, Kreis, ages, price, dates, links)
//   ?sheet=places      one row per published place/provider with visit information
//   ?sheet=categories  the filters: main and sub categories with a short description and how many offers each has
// Only data that is already public on the website is exposed; nothing private, nothing writable.
import { classify, MAINS, RULES, LABEL_MAIN_DE, LABEL_SUB_DE, DESCRIPTION_MAIN_DE } from '../_shared/taxonomy.ts'

const SB = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const APP = Deno.env.get('APP_URL') ?? 'https://quartierjournal.pages.dev'
const DAYS = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

async function all(table: string, select: string, filter = '') {
  const out: Record<string, unknown>[] = []
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${SB}/rest/v1/${table}?select=${select}${filter}&order=id.asc&limit=1000&offset=${off}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
    if (!r.ok) throw new Error(`${table} ${r.status}`)
    const rows = await r.json(); out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}
const cell = (v: unknown) => { const s = v == null ? '' : String(v).replace(/\r?\n/g, ' '); return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const csv = (header: string[], rows: unknown[][]) => '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
const host = (u: unknown) => { try { return new URL(String(u)).hostname.replace(/^www\./, '') } catch { return '' } }
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date())

Deno.serve(async (req) => {
  const sheet = new URL(req.url).searchParams.get('sheet') ?? 'offers'
  const headers = { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' }
  try {
    if (sheet === 'offers' || sheet === 'categories') {
      const acts = await all('activity_cards', 'id,title,activity_type,category,verification,data_origin,venue_name,address,location_text,quartier,district_number,district_basis,age_text,price_text,is_free,registration,registration_text,templates,upcoming,organiser_url,listing_url,booking_url,last_checked_on', '&status=eq.published')
      const cls = acts.map((a) => ({ a, c: classify({ title: String(a.title), category: (a.category as string) ?? null }) }))
      if (sheet === 'categories') {
        const nMain = new Map<string, number>(), nSub = new Map<string, number>(); let none = 0
        for (const { c } of cls) { if (!c) { none++; continue } nMain.set(c.main, (nMain.get(c.main) ?? 0) + 1); if (c.sub) nSub.set(c.sub, (nSub.get(c.sub) ?? 0) + 1) }
        const rows: unknown[][] = []
        for (const m of MAINS) {
          rows.push([LABEL_MAIN_DE[m], '(ganze Kategorie)', DESCRIPTION_MAIN_DE[m], nMain.get(m) ?? 0])
          for (const r of RULES.filter((x) => x.main === m)) rows.push([LABEL_MAIN_DE[m], LABEL_SUB_DE[r.sub] ?? r.sub, '', nSub.get(r.sub) ?? 0])
        }
        rows.push(['(ohne Kategorie)', '', 'Nur unter «Alle» auffindbar (z. B. Titel in anderen Sprachen, Vorträge für Erwachsene).', none])
        return new Response(csv(['Hauptkategorie', 'Unterkategorie', 'Kurzbeschreibung', 'Anzahl Angebote'], rows), { headers })
      }
      const rows = cls.map(({ a, c }) => {
        const tpl = (a.templates as { weekday: number; start: string | null; recurrence: string }[]) ?? []
        const up = ((a.upcoming as { date: string; start: string | null; status: string }[]) ?? []).filter((o) => o.date >= today && o.status !== 'cancelled')
        const verified = a.verification === 'provider_verified'
        const web = (a.organiser_url ?? a.listing_url ?? '') as string
        return [a.title, a.venue_name ?? a.location_text ?? '', host(web),
          c ? LABEL_MAIN_DE[c.main] : '', c?.sub ? (LABEL_SUB_DE[c.sub] ?? c.sub) : '', a.activity_type ?? '',
          verified ? 'Beim Anbieter bestätigt' : a.data_origin === 'feed:chreis' ? 'Über Chreis+ (nicht bestätigt)' : 'Eigene Recherche (nicht beim Anbieter geprüft)',
          a.district_number ? `Kreis ${a.district_number}` : '', a.address ?? a.location_text ?? '', a.age_text ?? '', a.price_text ?? (a.is_free ? 'Gratis' : ''),
          a.registration ?? '', tpl.map((t) => `${DAYS[t.weekday]}${t.start ? ' ' + t.start.slice(0, 5) : ''}${t.recurrence === 'selected_dates' ? ' (ausgewählte Daten)' : ''}`).join(' · '),
          up[0] ? `${up[0].date}${up[0].start ? ' ' + up[0].start.slice(0, 5) : ''}` : '', up.length, a.last_checked_on ?? '', web, `${APP}/a/${a.id}`]
      })
      return new Response(csv(['Titel', 'Ort / Anbieter', 'Website des Anbieters', 'Hauptkategorie', 'Unterkategorie', 'Art des Angebots', 'Quelle', 'Kreis', 'Adresse', 'Alter', 'Preis', 'Anmeldung', 'Wiederkehrend', 'Nächster Termin', 'Anzahl Termine', 'Zuletzt geprüft', 'Link Anbieter', 'Link im Quartierjournal'], rows), { headers })
    }
    if (sheet === 'places') {
      const pl = await all('place_cards', 'id,name,kind,quartier,district_number,address,verification,data_origin,web_url,activity_count,opening_hours,admission,free_when,visit_tips,info_checked_on,features')
      const rows = pl.map((p) => [p.name, p.kind ?? '', p.district_number ? `Kreis ${p.district_number}` : '', p.quartier ?? '', p.address ?? '',
        p.verification === 'provider_verified' ? 'Beim Anbieter bestätigt' : 'Nicht beim Anbieter geprüft', p.data_origin ?? '', p.opening_hours ?? '', p.admission ?? '', p.free_when ?? '', p.visit_tips ?? '', p.features ?? '', p.info_checked_on ?? '', p.activity_count ?? 0, p.web_url ?? ''])
      return new Response(csv(['Name', 'Art', 'Kreis', 'Quartier', 'Adresse', 'Prüfstatus', 'Datenquelle', 'Öffnungszeiten', 'Eintritt', 'Gratis wann', 'Gut zu wissen', 'Ausstattung', 'Angaben geprüft am', 'Anzahl Angebote', 'Website'], rows), { headers })
    }
    return new Response('unknown sheet', { status: 400, headers })
  } catch (e) {
    return new Response('error: ' + (e as Error).message, { status: 500, headers })
  }
})
