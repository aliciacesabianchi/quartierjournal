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
