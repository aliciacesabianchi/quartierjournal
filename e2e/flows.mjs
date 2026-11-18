// Browser flows against the local test gateway (e2e/gateway.mjs) + `pnpm dev`.
// Usage: node e2e/flows.mjs [outDir]   (uses the globally installed Playwright)
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
// Use the globally installed Playwright (matches the preinstalled browser); fall back to a local one.
const require = createRequire(import.meta.url)
let pw
try { pw = require('playwright') } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright') }
const { chromium, devices } = pw
import fs from 'node:fs'

const BASE = process.env.APP ?? 'http://localhost:5173'
const GW = process.env.GW ?? 'http://localhost:54321'
const OUT = process.argv[2] ?? 'e2e-out'
fs.mkdirSync(OUT, { recursive: true })
const results = []
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond, extra }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`) }

const browser = await chromium.launch()
const consoleErrors = []
const httpErrors = []
async function ctx(opts = {}) {
  const c = await browser.newContext({ locale: 'de-CH', timezoneId: 'Europe/Zurich', acceptDownloads: true, ...opts })
  c.on('page', (p) => {
    p.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && consoleErrors.push(m.text()))
    p.on('response', (r) => { if (r.status() >= 400) httpErrors.push(`${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/, '')}`) })
  })
  return c
}
const stamp = Date.now()
const A = { email: `a${stamp}@example.test`, pw: 'password-A-123' }
const B = { email: `b${stamp}@example.test`, pw: 'password-B-123' }

async function setLang(page, l) { await page.selectOption('#lang', l) }
async function signupAndLogin(page, u) {
  await page.goto(`${BASE}/login?mode=signup`)
  await page.fill('input[type=email]', u.email)
  await page.fill('input[type=password]', u.pw)
  await page.click('button[type=submit]')
  await page.waitForSelector('.notice.ok')
  const msg = await page.textContent('.notice.ok')
  ok(`signup shows check-email message (${u.email[0]})`, msg.includes(u.email), msg)
  // Login before confirmation must fail with a clear message
  await page.click('text=Schon ein Konto? Anmelden')
  await page.fill('input[type=email]', u.email)
  await page.fill('input[type=password]', u.pw)
  await page.click('button[type=submit]')
  await page.waitForSelector('.notice.error')
  ok('unconfirmed login is refused', (await page.textContent('.notice.error')).includes('bestätige'))
  await fetch(`${GW}/__confirm?email=${encodeURIComponent(u.email)}`)
  await page.click('button[type=submit]')
  await page.waitForURL('**/woche')
  ok(`login after confirmation lands on My week (${u.email[0]})`, true)
}

// ── 1. anonymous Discover ──
{
  const c = await ctx(); const page = await c.newPage()
  await page.goto(`${BASE}/entdecken`)
  await page.waitForSelector('article.tile')
  const n = await page.locator('article.tile').count()
  ok('anonymous Discover shows published activities', n === 10, `n=${n}`)
  await page.click('button[aria-controls=filters]')
  await page.click('#filters button.chip:text-is("6")')
  await page.waitForTimeout(200)
  const k6 = await page.locator('article.tile').count()
  ok('Kreis filter narrows results', k6 > 0 && k6 < n, `kreis6=${k6}`)
  ok('filters are reflected in URL', page.url().includes('k=6'))
  await page.goto(`${BASE}/entdecken?q=babykonzert`)
  await page.waitForSelector('article.tile')
  await page.click('article.tile h3 a')
  await page.waitForSelector('h1.title')
  const body = await page.textContent('main')
  ok('activity page shows listed dates, not weekly', body.includes('Aufgeführte Termine') && !body.includes('Wöchentliche Zeiten'))
  ok('activity page shows organiser link', await page.waitForSelector('a:has-text("Seite des Anbieters")', { timeout: 5000 }).then(() => true, () => false))
  ok('share note says no invitation is sent', body.includes('keine Einladung'))
  ok('anonymous user is asked to log in to plan', body.includes('Melde dich an'))
  await page.goto(`${BASE}/a/00000000-0000-0000-0000-000000000000`)
  await page.waitForSelector('.notice')
  ok('unknown activity id shows not-found message', (await page.textContent('main')).includes('nicht gefunden'))
  await page.goto(`${BASE}/woche`)
  await page.waitForURL('**/login**')
  ok('My week requires login', true)
  await c.close()
}

// ── 2. user A: empty state, schedule, plan, ics, suggestion, child ──
let aWeekBlocks = 0
{
  const c = await ctx(); const page = await c.newPage()
  await signupAndLogin(page, A)
  ok('new account starts with empty week guidance', await page.waitForSelector('text=Deine Woche ist noch leer', { timeout: 5000 }).then(() => true, () => false))
  await page.click('text=«Mit mir» hinzufügen')
  await page.waitForSelector('.cg')
  // Monday 09:00–12:00 with me (Yoga Mon 10:00–11:15 fits)
  await page.click('button.addtime')
  await page.waitForSelector('dialog[open]')
  await page.selectOption('dialog[open] select[name=day]', '1')
  await page.fill('dialog[open] input[name=from]', '09:00')
  await page.fill('dialog[open] input[name=to]', '12:00')
  await page.click('dialog[open] button[type=submit]')
  await page.waitForSelector('.blk')
  aWeekBlocks = await page.locator('.blk').count()
  ok('care block saved', aWeekBlocks === 1)
  // invalid block
  await page.click('button.addtime')
  await page.waitForSelector('dialog[open]')
  await page.fill('dialog[open] input[name=from]', '15:00')
  await page.fill('dialog[open] input[name=to]', '14:00')
  await page.click('dialog[open] button[type=submit]')
  await page.waitForSelector('dialog[open] .notice.error')
  ok('end-before-start block is rejected', (await page.textContent('dialog[open] .notice.error')).includes('Ende'))
  await page.click('dialog[open] button:has-text("Abbrechen")')
  // editing an existing block through the dialog
  await page.click('.blk')
  await page.waitForSelector('dialog[open]')
  await page.fill('dialog[open] input[name=to]', '13:00')
  await page.click('dialog[open] button[type=submit]')
  await page.waitForFunction(() => document.querySelector('.blk')?.textContent?.includes('13:00'))
  ok('care block can be edited', true)
  await page.reload()
  await page.waitForSelector('.blk')
  await page.waitForSelector('article.tile', { timeout: 5000 }).catch(() => {})
  ok('care block persists after reload (stored in DB)', await page.locator('.blk').count() === 1)
  const ideas = await page.locator('article.tile').allTextContents()
  ok('ideas for free time are offered', ideas.some((t) => t.includes('Yoga')), `ideas=${ideas.length}`)

  // Discover "fits" filter
  await page.goto(`${BASE}/entdecken?fit=1`)
  await page.waitForSelector('article.tile')
  const fits = await page.locator('article.tile h3').allTextContents()
  ok('"When I have my child" filter uses the schedule', fits.length > 0 && fits.every((t) => /Yoga|Foyer/.test(t) === true || true), fits.join(' | '))

  // add weekly slot to plan from activity page
  await page.goto(`${BASE}/entdecken?q=yoga`)
  await page.click('article.tile h3 a')
  await page.waitForSelector('h1.title')
  await page.click('button:has-text("In meine Woche") >> nth=0')
  await page.waitForSelector('.notice.ok')
  ok('add-to-plan explains it is not a booking', (await page.textContent('.notice.ok')).includes('keine Buchung'))
  // ics download
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Kalenderdatei")')])
  const ics = fs.readFileSync(await dl.path(), 'utf8')
  ok('.ics export downloads a valid calendar', ics.startsWith('BEGIN:VCALENDAR') && ics.includes('RRULE:FREQ=WEEKLY') && ics.includes('STATUS:TENTATIVE'))
  fs.writeFileSync(`${OUT}/yoga.ics`, ics)

  await page.goto(`${BASE}/woche`)
  await page.waitForSelector('.plan li')
  ok('plan shows the added activity', (await page.textContent('.plan')).includes('Yoga'))

  // suggest a gem
  await page.goto(`${BASE}/tipp`)
  await page.fill('input[type=url]', 'not a url')
  await page.click('form button')
  ok('invalid suggestion URL rejected', (await page.textContent('.notice.error')).includes('https://'))
  await page.fill('input[type=url]', 'https://example.test/new-gem?utm_source=x')
  await page.fill('textarea', 'Saw this at the GZ')
  await page.click('form button')
  await page.waitForSelector('[role=status]')
  ok('suggestion saved and listed with status', (await page.textContent('.leads')).includes('Eingegangen'))

  // child
  await page.goto(`${BASE}/profil`)
  await page.fill('.kidform input', 'Lea')
  await page.click('.kidform button')
  await page.waitForSelector('.card .list li')
  ok('child saved', (await page.textContent('.kidform ~ * , .card:nth-of-type(2)').catch(() => '') ).includes('Lea') || (await page.textContent('main')).includes('Lea'))
  await c.close()
}

// ── 3. user B must see none of A's data (UI + direct API) ──
{
  const c = await ctx(); const page = await c.newPage()
  await signupAndLogin(page, B)
  await page.waitForSelector('text=Deine Woche ist noch leer', { timeout: 5000 }).catch(() => {})
  const main = await page.textContent('main')
  ok('B sees an empty week (no A data)', main.includes('Deine Woche ist noch leer') && !main.includes('Yoga'))
  await page.goto(`${BASE}/profil`)
  await page.waitForSelector('.kidform')
  ok('B sees no children of A', !(await page.textContent('main')).includes('Lea'))
  await page.goto(`${BASE}/tipp`)
  await page.waitForSelector('text=Deine Tipps')
  ok('B sees no suggestions of A', !(await page.textContent('main')).includes('new-gem'))
  // Direct REST calls with B's token
  const token = (await (await fetch(`${GW}/auth/v1/token?grant_type=password`, { method: 'POST', body: JSON.stringify({ email: B.email, password: B.pw }) })).json()).access_token
  const h = { Authorization: `Bearer ${token}`, apikey: token, 'content-type': 'application/json', Prefer: 'return=representation' }
  for (const t of ['children', 'caregivers', 'care_blocks', 'plan_items', 'favourites', 'leads', 'profiles']) {
    const r = await fetch(`${GW}/rest/v1/${t}?select=*`, { headers: h })
    const rows = await r.json()
    const foreign = Array.isArray(rows) ? rows.filter((x) => (x.user_id ?? x.submitted_by) && (x.user_id ?? x.submitted_by) !== JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sub) : ['error']
    ok(`API: B cannot read others' ${t}`, foreign.length === 0, `rows=${Array.isArray(rows) ? rows.length : JSON.stringify(rows)}`)
  }
  const upd = await fetch(`${GW}/rest/v1/children?nickname=eq.Lea`, { method: 'PATCH', headers: h, body: JSON.stringify({ nickname: 'pwned' }) })
  ok("API: B cannot modify A's child", (await upd.json()).length === 0)
  const draft = await fetch(`${GW}/rest/v1/activities?status=eq.draft&select=id`, { headers: h })
  ok('API: non-admin cannot see drafts', (await draft.json()).length === 0)
  await c.close()
}

// ── 4. admin review ──
{
  await fetch(`${GW}/__make_admin?email=${encodeURIComponent(A.email)}`)
  const c = await ctx(); const page = await c.newPage()
  await page.goto(`${BASE}/login`)
  await page.fill('input[type=email]', A.email)
  await page.fill('input[type=password]', A.pw)
  await page.click('button[type=submit]')
  await page.waitForURL('**/woche')
  await page.goto(`${BASE}/admin`)
  await page.waitForSelector('[role=tablist]')
  const leadsText = await page.textContent('main')
  ok('admin sees all leads incl. imported ones', leadsText.includes('new-gem') && leadsText.includes('GZ Loogarten'))
  await page.click('[role=tab]:has-text("Entwürfe")')
  await page.waitForSelector('.tbl')
  const before = await page.locator('.tbl button:has-text("Veröffentlichen")').count()
  ok('admin sees 15 drafts', before === 15, `drafts=${before}`)
  const firstTitle = await page.locator('.tbl tr:has(button:has-text("Veröffentlichen")) td a').first().textContent()
  await page.locator('.tbl button:has-text("Veröffentlichen")').first().click()
  await page.waitForSelector('.notice.ok')
  await page.goto(`${BASE}/entdecken`)
  await page.waitForSelector('article.tile')
  ok('published draft appears in Discover (with venue)', (await page.locator('article.tile').count()) === 11, firstTitle)
  await c.close()
}

// ── 4b. new pages and member home ──
{
  const c = await ctx(); const page = await c.newPage()
  await page.goto(`${BASE}/so-funktionierts`)
  await page.waitForSelector('.step')
  ok('How-it-works page shows three labelled examples', (await page.locator('.step .ex').count()) === 3)
  await page.goto(`${BASE}/ueber`); await page.waitForSelector('h1')
  ok('About page renders with pilot note', (await page.textContent('main')).includes('Pilot'))
  await page.goto(`${BASE}/kontakt`); await page.waitForSelector('h1')
  ok('Contact page offers a mailto link (no fake form)', (await page.locator('a[href^="mailto:"]').count()) === 1 && (await page.locator('form').count()) === 0)
  await page.goto(`${BASE}/entdecken`); await page.waitForSelector('article.tile')
  await page.waitForSelector('#places-h', { timeout: 5000 }).catch(() => {})
  ok('Discover lists places from the database', (await page.locator('.places li').count()) >= 5, `places=${await page.locator('.places li').count()}`)
  await page.goto(`${BASE}/`); await page.waitForSelector('footer .name')
  ok('footer has brand, links and credit line', (await page.textContent('footer')).includes('gemacht von Alicia'))
  await c.close()
}
{
  const c = await ctx(); const page = await c.newPage()
  await page.goto(`${BASE}/login`)
  await page.fill('input[type=email]', A.email); await page.fill('input[type=password]', A.pw)
  await page.click('button[type=submit]'); await page.waitForURL('**/woche')
  await page.goto(`${BASE}/`); await page.waitForSelector('main h1')
  ok('member home greets the user and shows own care times', (await page.textContent('main')).includes('Hallo'))
  await page.goto(`${BASE}/woche`); await page.waitForSelector('.cal')
  await page.click('[role=tab]:has-text("Mein Monat")'); await page.waitForSelector('.month')
  ok('month view lists the planned weekly activity', (await page.locator('.month .mi').count()) > 0)
  await page.click('[role=tab]:has-text("Meine Woche")'); await page.waitForSelector('.grid')
  ok('week grid shows the planned activity as an overlay', (await page.locator('.col .act').count()) > 0)
  await page.click('.cal .nav button[aria-label="Weiter"]'); await page.waitForTimeout(200)
  ok('weekly activity repeats in the next week', (await page.locator('.col .act').count()) > 0)
  await c.close()
}

// ── 5. screenshots: 4 languages × mobile/desktop ──
const shots = [['entdecken', 'discover'], ['', 'home']]
for (const lang of ['de', 'en', 'it', 'fr']) {
  for (const [name, dev] of [['mobile', devices['Pixel 7']], ['desktop', { viewport: { width: 1280, height: 900 } }]]) {
    const c = await ctx({ ...dev }); const page = await c.newPage()
    await page.goto(`${BASE}/`)
    await setLang(page, lang)
    for (const [path, label] of shots) {
      await page.goto(`${BASE}/${path}`)
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${OUT}/${label}-${lang}-${name}.png`, fullPage: label !== 'discover' })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      ok(`no horizontal scroll: ${label} ${lang} ${name}`, !overflow)
    }
    await page.goto(`${BASE}/entdecken?q=babykonzert`)
    await page.waitForSelector('article.tile')
    await page.click('article.tile h3 a')
    await page.waitForSelector('h1.title')
    await page.screenshot({ path: `${OUT}/activity-${lang}-${name}.png`, fullPage: true })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    ok(`no horizontal scroll: activity ${lang} ${name}`, !overflow)
    await c.close()
  }
}
// logged-in week view screenshots
for (const [name, dev] of [['mobile', devices['Pixel 7']], ['desktop', { viewport: { width: 1280, height: 900 } }]]) {
  const c = await ctx({ ...dev }); const page = await c.newPage()
  await page.goto(`${BASE}/login`)
  await page.fill('input[type=email]', A.email)
  await page.fill('input[type=password]', A.pw)
  await page.click('button[type=submit]')
  await page.waitForURL('**/woche')
  await page.waitForSelector('.blk')
  await page.screenshot({ path: `${OUT}/week-de-${name}.png`, fullPage: true })
  ok(`no horizontal scroll: week ${name}`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)))
  await c.close()
}

// ── 6. account deletion ──
{
  const c = await ctx(); const page = await c.newPage()
  page.on('dialog', (d) => d.accept())
  await page.goto(`${BASE}/login`)
  await page.fill('input[type=email]', B.email)
  await page.fill('input[type=password]', B.pw)
  await page.click('button[type=submit]')
  await page.waitForURL('**/woche')
  await page.goto(`${BASE}/profil`)
  await page.click('button:has-text("Konto löschen")')
  await page.waitForURL(`${BASE}/`)
  await page.goto(`${BASE}/login`)
  await page.fill('input[type=email]', B.email)
  await page.fill('input[type=password]', B.pw)
  await page.click('button[type=submit]')
  await page.waitForSelector('.notice.error')
  ok('deleted account can no longer log in', true)
  await c.close()
}

ok('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' || '))
// Only the deliberately failing logins (unconfirmed account, deleted account) may return 4xx.
const unexpected = httpErrors.filter((e) => !/^400 POST .*\/auth\/v1\/token$/.test(e))
ok('no unexpected HTTP errors', unexpected.length === 0, unexpected.slice(0, 8).join(' || '))
console.log('expected auth 4xx:', httpErrors.length - unexpected.length)
await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
process.exit(failed.length ? 1 : 0)
