// Source watcher. Runs once a day (database schedule) and checks only the few sources that are DUE.
// It changes nothing in the public catalogue: it only records "this page changed since you last looked" so that new
// offers can be read from the provider's own page and proposed for approval.
import { BOT_NAME, PAUSE_AFTER_FAILURES, failureInterval, looksLikeIcs, nextInterval, normalizeHtml, normalizeIcs, robotsAllows, sha256 } from '../_shared/crawl.ts'

const SB = Deno.env.get('SUPABASE_URL')!
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const MAX_PER_RUN = 8          // few requests per run: friendly to the sites, light on our free limits
const MAX_BYTES = 300_000      // never read more than this from a page
const TIMEOUT_MS = 10_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } })
  if (!r.ok) throw new Error(`${path} ${r.status} ${await r.text()}`)
  return r.status === 204 ? null : r.json()
}

async function readLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []; let n = 0
  while (n < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value); n += value.length
  }
  try { await reader.cancel() } catch { /* ignore */ }
  const all = new Uint8Array(Math.min(n, MAX_BYTES)); let o = 0
  for (const c of chunks) { const part = c.subarray(0, Math.max(0, all.length - o)); all.set(part, o); o += part.length }
  return new TextDecoder().decode(all)
}

const robotsCache = new Map<string, string | null>()
async function allowedByRobots(u: URL): Promise<boolean> {
  if (!robotsCache.has(u.origin)) {
    try {
      const r = await fetch(`${u.origin}/robots.txt`, { headers: { 'User-Agent': BOT_NAME }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      robotsCache.set(u.origin, r.ok ? await readLimited(r) : null)
    } catch { robotsCache.set(u.origin, null) }
  }
  const txt = robotsCache.get(u.origin)
  return txt == null ? true : robotsAllows(txt, u.pathname + u.search)
}

interface Target { id: string; url: string; interval_days: number; base_interval_days: number | null; etag: string | null; last_modified: string | null; content_hash: string | null; unchanged_streak: number; fail_streak: number; last_changed_at: string | null; last_success_at: string | null }

async function check(t: Target) {
  const base = t.base_interval_days ?? t.interval_days
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {}
  try {
    const u = new URL(t.url)
    if (!/^https?:$/.test(u.protocol)) throw new Error('not http(s)')
    if (!(await allowedByRobots(u))) {
      Object.assign(patch, { last_note: 'Not checked: robots.txt asks bots to stay away', interval_days: 28, last_success_at: now })
      return { outcome: 'skipped', patch }
    }
    const headers: Record<string, string> = { 'User-Agent': `${BOT_NAME} (+https://quartierjournal.pages.dev)`, Accept: 'text/html,text/calendar,*/*;q=0.5' }
    if (t.etag) headers['If-None-Match'] = t.etag
    if (t.last_modified) headers['If-Modified-Since'] = t.last_modified
    const res = await fetch(t.url, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })
    let changed = false
    if (res.status === 304) {
      await res.body?.cancel()
    } else if (res.ok) {
      const body = await readLimited(res)
      const text = looksLikeIcs(body, t.url) ? normalizeIcs(body) : normalizeHtml(body)
      const hash = await sha256(text)
      changed = t.content_hash != null && hash !== t.content_hash   // the very first check only records a baseline
      Object.assign(patch, { content_hash: hash, etag: res.headers.get('etag'), last_modified: res.headers.get('last-modified') })
    } else {
      throw new Error(`HTTP ${res.status}`)
    }
    const streak = changed ? 0 : t.unchanged_streak + 1
    Object.assign(patch, {
      last_success_at: now, fail_streak: 0, unchanged_streak: streak,
      interval_days: changed ? base : nextInterval(base, streak),
      last_note: changed ? 'Changed since the previous check' : res.status === 304 ? 'Unchanged (server said so)' : t.content_hash ? 'Unchanged' : 'First check: baseline saved',
      ...(changed ? { last_changed_at: now } : {}),
    })
    return { outcome: changed ? 'changed' : 'unchanged', patch }
  } catch (e) {
    const fails = t.fail_streak + 1
    Object.assign(patch, {
      last_failure_at: now, fail_streak: fails, interval_days: failureInterval(base, fails),
      last_note: `Failed: ${String((e as Error).message).slice(0, 120)}`,
      ...(fails >= PAUSE_AFTER_FAILURES ? { status: 'paused' } : {}),
    })
    return { outcome: 'failed', patch }
  }
}

Deno.serve(async (req) => {
  // only the database schedule may start a run: a shared secret kept in admin_settings
  const given = req.headers.get('x-cron-secret') ?? ''
  const rows = await rest('admin_settings?select=value&key=eq.crawl_secret')
  if (!given || !rows?.[0]?.value || given !== rows[0].value) return new Response('forbidden', { status: 403 })

  const nowMs = Date.now()
  const active: Target[] = await rest('crawl_targets?select=id,url,interval_days,base_interval_days,etag,last_modified,content_hash,unchanged_streak,fail_streak,last_changed_at,last_success_at&status=eq.active&order=last_success_at.asc.nullsfirst&limit=200')
  const due = active.filter((t) => !t.last_success_at || nowMs - Date.parse(t.last_success_at) >= t.interval_days * 86_400_000).slice(0, MAX_PER_RUN)

  const summary = { due: due.length, changed: 0, unchanged: 0, failed: 0, skipped: 0 }
  let lastHost = ''
  for (const t of due) {
    const host = (() => { try { return new URL(t.url).host } catch { return '' } })()
    if (host && host === lastHost) await sleep(1500)   // be polite to the same site
    lastHost = host
    const r = await check(t)
    summary[r.outcome as 'changed' | 'unchanged' | 'failed' | 'skipped']++
    await rest(`crawl_targets?id=eq.${t.id}`, { method: 'PATCH', body: JSON.stringify(r.patch) })
  }
  return new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } })
})
