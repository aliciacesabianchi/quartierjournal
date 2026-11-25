// Pure helpers for the source watcher (kept free of Deno-only calls so they can be unit-tested).
// Goal: spend as little as possible: ask the server "has it changed?" first, hash only readable text, check rarely, and check
// quiet sources even more rarely.

export const BOT_NAME = 'QuartierjournalBot'

/** Text that matters for "did the page change?": no scripts, styles, comments or markup; whitespace collapsed. */
export function normalizeHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Calendar feeds: ignore lines that change on every export (timestamps, sequence numbers) so only real changes count. */
export function normalizeIcs(ics: string): string {
  return ics
    .split(/\r?\n/)
    .filter((l) => !/^(DTSTAMP|CREATED|LAST-MODIFIED|SEQUENCE|PRODID|X-WR-TIMEZONE)[:;]/i.test(l))
    .join('\n')
    .trim()
}

export const looksLikeIcs = (body: string, url: string) => /\.ics(\?|$)/i.test(url) || /^BEGIN:VCALENDAR/m.test(body.slice(0, 200))

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Minimal robots.txt reading for our bot / "*": longest matching rule wins, Allow beats Disallow on a tie. */
export function robotsAllows(robots: string, path: string): boolean {
  let group: 'none' | 'ours' | 'star' | 'other' = 'none'
  const rules: { allow: boolean; path: string; ours: boolean }[] = []
  let inRules = false
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) continue
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const k = m[1]!.toLowerCase(); const v = m[2]!.trim()
    if (k === 'user-agent') {
      if (inRules) { group = 'none'; inRules = false }
      const ua = v.toLowerCase()
      if (ua === BOT_NAME.toLowerCase()) group = 'ours'
      else if (ua === '*' && group !== 'ours') group = 'star'
      else if (group === 'none') group = 'other'
    } else if ((k === 'allow' || k === 'disallow') && (group === 'ours' || group === 'star')) {
      inRules = true
      if (v) rules.push({ allow: k === 'allow', path: v, ours: group === 'ours' })
    }
  }
  const useOurs = rules.some((r) => r.ours)
  let best: { allow: boolean; len: number } | null = null
  for (const r of rules) {
    if (useOurs && !r.ours) continue
    const pat = r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')
    if (new RegExp('^' + pat).test(path)) {
      const len = r.path.length
      if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len }
    }
  }
  return best ? best.allow : true
}

/** Quiet sources are checked less and less often (every 3 unchanged checks the wait doubles, at most 8 weeks); a change resets it. */
export function nextInterval(base: number, unchangedStreak: number): number {
  return Math.min(base * 2 ** Math.floor(unchangedStreak / 3), 56)
}
/** Failing sources are retried with growing pauses (at most 4 weeks). */
export function failureInterval(base: number, failStreak: number): number {
  return Math.min(base * 2 ** failStreak, 28)
}
export const PAUSE_AFTER_FAILURES = 5

// ───────────── finding new listings in sources that publish structured data ─────────────
export interface Found {
  key: string; title: string; start_date: string | null; start_time: string | null; end_time: string | null
  location_text: string | null; description: string | null; event_url: string | null; rrule: string | null
}

const unescapeIcs = (v: string) => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').replace(/\s+/g, ' ').trim()
const zurichParts = (d: Date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}
/** "20261201T093000Z" | "20261201T093000" | "20261201" -> local Zurich date and time (time null for all-day). */
export function parseIcsDate(v: string): { date: string; time: string | null } | null {
  const m = v.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/)
  if (!m) return null
  if (!m[4]) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: null }
  if (m[7]) return zurichParts(new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0))))
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` }
}

export function parseIcsEvents(ics: string): Found[] {
  const text = ics.replace(/\r?\n[ \t]/g, '')
  const out: Found[] = []
  for (const block of text.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0] ?? ''
    const prop = (name: string) => {
      const m = body.match(new RegExp(`^${name}(?:;[^:\\n]*)?:(.*)$`, 'mi'))
      return m ? m[1]!.replace(/\r$/, '') : null
    }
    const title = unescapeIcs(prop('SUMMARY') ?? '')
    if (!title) continue
    const s = parseIcsDate(prop('DTSTART') ?? ''); const e = parseIcsDate(prop('DTEND') ?? '')
    const uid = (prop('UID') ?? '').trim()
    out.push({
      key: uid || `${title.toLowerCase()}|${s?.date ?? ''}|${s?.time ?? ''}`,
      title, start_date: s?.date ?? null, start_time: s?.time ?? null, end_time: e && s && e.date === s.date ? e.time : null,
      location_text: unescapeIcs(prop('LOCATION') ?? '') || null,
      description: (unescapeIcs(prop('DESCRIPTION') ?? '') || '').slice(0, 500) || null,
      event_url: (prop('URL') ?? '').trim() || null, rrule: (prop('RRULE') ?? '').trim() || null,
    })
  }
  return out
}

/** schema.org Event entries inside <script type="application/ld+json"> (many providers publish these for search engines). */
export function parseJsonLdEvents(html: string, baseUrl: string): Found[] {
  const out: Found[] = []
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    const o = n as Record<string, unknown>
    const types = ([] as unknown[]).concat(o['@type'] ?? []).map(String)
    if (types.some((t) => /Event$/.test(t)) && typeof o.name === 'string') {
      const start = typeof o.startDate === 'string' ? o.startDate : ''
      const end = typeof o.endDate === 'string' ? o.endDate : ''
      const loc = o.location as Record<string, unknown> | string | undefined
      const locText = typeof loc === 'string' ? loc : loc && typeof loc === 'object'
        ? [loc.name, (loc.address as Record<string, unknown> | undefined)?.streetAddress ?? (typeof loc.address === 'string' ? loc.address : null)].filter(Boolean).join(', ') : ''
      let url: string | null = null
      try { url = typeof o.url === 'string' ? new URL(o.url, baseUrl).href : null } catch { /* ignore */ }
      const date = /^\d{4}-\d{2}-\d{2}/.test(start) ? start.slice(0, 10) : null
      const time = /T\d{2}:\d{2}/.test(start) ? start.slice(11, 16) : null
      out.push({
        key: url ?? `${o.name}|${start}`.toLowerCase(), title: unescapeIcs(String(o.name)), start_date: date, start_time: time,
        end_time: date && end.startsWith(date) && /T\d{2}:\d{2}/.test(end) ? end.slice(11, 16) : null,
        location_text: locText || null, description: typeof o.description === 'string' ? o.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) || null : null,
        event_url: url, rrule: null,
      })
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v)
  }
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1]!)) } catch { /* invalid JSON: skip */ }
  }
  return out
}

/** Is this about children / families? (Used for provider pages that also list adult events.) */
export const FAMILY_WORDS = /\b(kind|kinder|kids?|baby|babys|babies|familie|familien|family|eltern|parent|mama|papa|mutter|vater|krabbel|kleinkind|spielgruppe|ki-?tu|enfants?|bambini|bimbi|famille|famiglia|toddler|jugend|spiel|märchen|puppen|zirkus|kasperli)/i
export const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9äöüéèàç ]+/g, ' ').replace(/\s+/g, ' ').trim()
