// TEST-ONLY local gateway that mimics the Supabase URL layout for browser testing:
//   /rest/v1/*  -> real PostgREST (real migrations, real RLS, real seed)
//   /auth/v1/*  -> minimal auth stub (password login/signup/logout/user) issuing JWTs PostgREST trusts
//   /__confirm?email=…  -> simulates clicking the confirmation link (there is no email in this harness)
// Never deploy this. Production uses Supabase Auth (real email confirmation via SMTP).
import http from 'node:http'
import crypto from 'node:crypto'
import pg from 'pg'

const SECRET = process.env.E2E_JWT_SECRET ?? 'e2e-local-only-secret-0123456789abcdef'
const REST = process.env.E2E_REST ?? 'http://127.0.0.1:3001'
const db = new pg.Pool({ connectionString: process.env.E2E_DB ?? 'postgresql://postgres@127.0.0.1:54322/qj_e2e' })
db.on('error', (e) => console.error('pg pool error (ignored, e.g. database was reset):', e.message))
process.on('uncaughtException', (e) => console.error('uncaught (ignored):', e.message))

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
export function sign(payload) {
  const h = b64({ alg: 'HS256', typ: 'JWT' })
  const p = b64(payload)
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`
}
function verify(token) {
  const [h, p, s] = (token ?? '').split('.')
  if (!s || crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') !== s) return null
  return JSON.parse(Buffer.from(p, 'base64url').toString())
}
export const ANON_KEY = sign({ role: 'anon', iss: 'e2e', exp: 2000000000 })

const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.email_confirmed_at,
  user_metadata: u.raw_user_meta_data ?? {}, app_metadata: { provider: 'email' }, identities: [{ id: u.id, provider: 'email' }], created_at: u.created_at })
function session(u) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  return { access_token: sign({ sub: u.id, role: 'authenticated', email: u.email, aud: 'authenticated', exp }),
    token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: `rt.${u.id}`, user: userJson(u) }
}
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(body === undefined ? '' : JSON.stringify(body)) }
const err = (res, code, error_code, msg) => send(res, code, { code, error_code, msg })

async function body(req) { let s = ''; for await (const c of req) s += c; return s ? JSON.parse(s) : {} }

async function auth(req, res, url) {
  const path = url.pathname.replace('/auth/v1', '')
  if (path === '/token' && url.searchParams.get('grant_type') === 'password') {
    const { email, password } = await body(req)
    const { rows: [u] } = await db.query('select * from auth.users where email = $1', [email])
    if (!u || u.test_password !== password) return err(res, 400, 'invalid_credentials', 'Invalid login credentials')
    if (!u.email_confirmed_at) return err(res, 400, 'email_not_confirmed', 'Email not confirmed')
    return send(res, 200, session(u))
  }
  if (path === '/token' && url.searchParams.get('grant_type') === 'refresh_token') {
    const { refresh_token } = await body(req)
    const { rows: [u] } = await db.query('select * from auth.users where id = $1', [String(refresh_token).slice(3)])
    return u ? send(res, 200, session(u)) : err(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token')
  }
  if (path === '/signup') {
    const { email, password, data } = await body(req)
    if (!password || password.length < 8) return err(res, 422, 'weak_password', 'Password should be at least 8 characters.')
    const { rows: [existing] } = await db.query('select * from auth.users where email = $1', [email])
    if (existing) return send(res, 200, { ...userJson(existing), identities: [] }) // mimics Supabase's obfuscated response
    const { rows: [u] } = await db.query('insert into auth.users (email, test_password, raw_user_meta_data) values ($1, $2, $3) returning *', [email, password, data ?? {}])
    return send(res, 200, userJson(u)) // confirmation required: no session
  }
  if (path === '/user') {
    const claims = verify((req.headers.authorization ?? '').replace(/^Bearer /, ''))
    if (!claims?.sub) return err(res, 401, 'bad_jwt', 'invalid JWT')
    const { rows: [u] } = await db.query('select * from auth.users where id = $1', [claims.sub])
    return u ? send(res, 200, userJson(u)) : err(res, 404, 'user_not_found', 'User not found')
  }
  if (path === '/logout') return send(res, 204)
  if (path === '/recover') return send(res, 200, {})
  if (path === '/settings') return send(res, 200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: false })
  return err(res, 404, 'not_found', `stub: ${path}`)
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' })
    return res.end()
  }
  try {
    if (url.pathname === '/__confirm') {
      await db.query('update auth.users set email_confirmed_at = now() where email = $1', [url.searchParams.get('email')])
      return send(res, 200, { ok: true })
    }
    if (url.pathname === '/__make_admin') {
      await db.query('insert into app.admins (user_id) select id from auth.users where email = $1 on conflict do nothing', [url.searchParams.get('email')])
      return send(res, 200, { ok: true })
    }
    if (url.pathname.startsWith('/auth/v1')) return await auth(req, res, url)
    if (url.pathname.startsWith('/rest/v1')) {
      const target = REST + url.pathname.replace('/rest/v1', '') + url.search
      const headers = { ...req.headers }
      delete headers.host
      const r = await fetch(target, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : await (async () => { let s = ''; for await (const c of req) s += c; return s })() })
      const out = Buffer.from(await r.arrayBuffer())
      const h = Object.fromEntries([...r.headers].filter(([k]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(k)))
      res.writeHead(r.status, { ...h, 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' })
      return res.end(out)
    }
    err(res, 404, 'not_found', 'not found')
  } catch (e) { err(res, 500, 'gateway', String(e)) }
}).listen(54321, () => console.log('e2e gateway on :54321  anon key:', ANON_KEY))
