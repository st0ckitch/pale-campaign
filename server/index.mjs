// ---------------------------------------------------------------------------
// Learning Hub backend — the "platform spine".
//
// A single-file, zero-dependency Node server (Node 18+) that provides what
// static hosting cannot:
//   • POST /api/anthropic        — Anthropic proxy; the API key stays server-side
//   • POST /api/teacher/login    — teacher sign-in with a per-school access key
//   • class join-codes           — students join a class once, by code + name
//   • synced content             — exams & announcements a teacher publishes are
//                                  visible to every student device, and student
//                                  attempts flow back to the teacher's queue
//   • static hosting of dist/    — one host runs the whole app
//
// Storage is a single JSON file (atomic tmp+rename writes) — deliberately
// simple pilot infrastructure for a two-school deployment, not a general SaaS.
// Run on any Node host:
//
//   ANTHROPIC_API_KEY=sk-ant-...  TEACHER_KEY=choose-a-secret  node server/index.mjs
//
// Env vars:
//   PORT                  default 8787
//   ANTHROPIC_API_KEY     enables AI grading/tutor/scanning for every client
//   APP_ANTHROPIC_BASE_URL  override the Anthropic API base (rarely needed)
//   TEACHER_KEY           teacher access key for all schools
//   TEACHER_KEY_BGA / TEACHER_KEY_BIST   per-school overrides
//   DATA_FILE             where to persist (default <repo>/server/data.json)
//   ALLOWED_ORIGIN        CORS origin for split hosting (default *)
// ---------------------------------------------------------------------------

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 8787
const UPSTREAM = process.env.APP_ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json')
const DIST_DIR = path.join(__dirname, '..', 'dist')
const ORIGIN = process.env.ALLOWED_ORIGIN || '*'
const SCHOOLS = ['BGA', 'BIST']

const teacherKeyFor = (school) =>
  process.env[`TEACHER_KEY_${school}`] || process.env.TEACHER_KEY || ''

// ---------------------------------------------------------------------------
// Persistence — load once, save debounced with atomic rename.
// ---------------------------------------------------------------------------
function blankData() {
  return { tokens: {}, classes: [], exams: [], announcements: [], attempts: [] }
}

let data = blankData()
try {
  data = { ...blankData(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }
} catch {
  /* first boot */
}

let saveTimer = null
function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const tmp = `${DATA_FILE}.tmp`
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
      fs.writeFileSync(tmp, JSON.stringify(data))
      fs.renameSync(tmp, DATA_FILE)
    } catch (err) {
      console.error('Could not persist data:', err)
    }
  }, 250)
}

const rid = (p) => p + crypto.randomBytes(6).toString('hex')

// Join codes avoid ambiguous characters (0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function newClassCode() {
  for (;;) {
    let code = ''
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]
    if (!data.classes.some((c) => c.code === code)) return code
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function json(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limitBytes) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function readJSON(req, limitBytes = 5 * 1024 * 1024) {
  const raw = await readBody(req, limitBytes)
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    throw Object.assign(new Error('invalid JSON body'), { status: 400 })
  }
}

// Teacher auth: Authorization: Bearer <token issued by /api/teacher/login>.
function teacherAuth(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')
  const rec = m && data.tokens[m[1]]
  if (!rec) throw Object.assign(new Error('not signed in as a teacher'), { status: 401 })
  return rec // { school, createdAt }
}

function classByCode(code) {
  const c = data.classes.find((k) => k.code === String(code || '').trim().toUpperCase())
  if (!c) throw Object.assign(new Error('unknown class code'), { status: 404 })
  return c
}

// Simple per-IP sliding-window rate limit for the AI proxy.
const aiCalls = new Map() // ip -> [timestamps]
function aiRateLimited(ip) {
  const now = Date.now()
  const windowMs = 60_000
  const max = 40
  const arr = (aiCalls.get(ip) || []).filter((t) => now - t < windowMs)
  if (arr.length >= max) {
    aiCalls.set(ip, arr)
    return true
  }
  arr.push(now)
  aiCalls.set(ip, arr)
  return false
}

// Mirrors the client-side attempt-total arithmetic (useContentStore.js).
function recomputeEarned(attempt) {
  const earned = (attempt.items || []).reduce(
    (s, it) => s + (Number(it.score) || 0) * (Number(it.marks) || 1),
    0,
  )
  attempt.earnedMarks = Math.round(earned * 10) / 10
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`

  // ---- open endpoints -----------------------------------------------------
  if (route === 'GET /api/health') {
    return json(res, 200, {
      ok: true,
      service: 'learning-hub',
      ai: !!process.env.ANTHROPIC_API_KEY,
      schools: SCHOOLS,
    })
  }

  if (route === 'POST /api/anthropic') {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) {
      return json(res, 503, {
        error: 'no_api_key',
        message: 'ANTHROPIC_API_KEY is not set on the server. Falling back to local grading.',
      })
    }
    const ip = req.socket.remoteAddress || 'unknown'
    if (aiRateLimited(ip)) {
      return json(res, 429, { error: 'rate_limited', message: 'Too many AI requests — try again in a minute.' })
    }
    // Vision payloads (scanned papers, photographed answers) can be large.
    const body = await readBody(req, 40 * 1024 * 1024)
    try {
      const upstream = await fetch(`${UPSTREAM}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body,
      })
      const text = await upstream.text()
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
      return res.end(text)
    } catch (err) {
      return json(res, 502, { error: 'upstream_error', message: String(err) })
    }
  }

  if (route === 'POST /api/teacher/login') {
    const { school, key } = await readJSON(req)
    const s = String(school || '').toUpperCase()
    if (!SCHOOLS.includes(s)) return json(res, 400, { error: 'unknown school' })
    const expected = teacherKeyFor(s)
    if (!expected) return json(res, 503, { error: `no teacher key configured for ${s} (set TEACHER_KEY or TEACHER_KEY_${s})` })
    if (String(key || '') !== expected) return json(res, 403, { error: 'wrong access key' })
    const token = crypto.randomBytes(24).toString('hex')
    data.tokens[token] = { school: s, createdAt: Date.now() }
    save()
    return json(res, 200, { token, school: s })
  }

  if (route === 'POST /api/join') {
    const { code, name } = await readJSON(req)
    const cleanName = String(name || '').trim().slice(0, 60)
    if (!cleanName) return json(res, 400, { error: 'name required' })
    const cls = classByCode(code)
    if (!cls.roster.includes(cleanName)) {
      cls.roster.push(cleanName)
      save()
    }
    return json(res, 200, { school: cls.school, classCode: cls.code, className: cls.name, name: cleanName })
  }

  if (route === 'GET /api/student/state') {
    const cls = classByCode(url.searchParams.get('code'))
    return json(res, 200, {
      school: cls.school,
      className: cls.name,
      classCode: cls.code,
      exams: data.exams.filter((e) => e.school === cls.school),
      announcements: data.announcements.filter((a) => a.school === cls.school),
    })
  }

  if (route === 'POST /api/student/attempts') {
    const { code, attempt } = await readJSON(req, 8 * 1024 * 1024)
    const cls = classByCode(code)
    if (!attempt || !Array.isArray(attempt.items)) return json(res, 400, { error: 'attempt required' })
    const rec = {
      ...attempt,
      id: rid('a'),
      school: cls.school,
      classCode: cls.code,
      className: cls.name,
      ts: Date.now(),
    }
    recomputeEarned(rec)
    data.attempts.unshift(rec)
    // Bound growth: keep the most recent attempts per school.
    const bySchool = data.attempts.filter((a) => a.school === cls.school)
    if (bySchool.length > 400) {
      const keep = new Set(bySchool.slice(0, 400).map((a) => a.id))
      data.attempts = data.attempts.filter((a) => a.school !== cls.school || keep.has(a.id))
    }
    save()
    return json(res, 200, { id: rec.id })
  }

  // ---- teacher endpoints (Bearer token) ------------------------------------
  const auth = teacherAuth(req) // throws 401 for everything below
  const school = auth.school

  if (route === 'GET /api/teacher/state') {
    return json(res, 200, {
      school,
      classes: data.classes.filter((c) => c.school === school),
      exams: data.exams.filter((e) => e.school === school),
      announcements: data.announcements.filter((a) => a.school === school),
      attempts: data.attempts.filter((a) => a.school === school),
    })
  }

  if (route === 'POST /api/teacher/classes') {
    const { name } = await readJSON(req)
    const cleanName = String(name || '').trim().slice(0, 80)
    if (!cleanName) return json(res, 400, { error: 'class name required' })
    const cls = { id: rid('c'), school, name: cleanName, code: newClassCode(), roster: [], createdAt: Date.now() }
    data.classes.push(cls)
    save()
    return json(res, 200, cls)
  }

  let m = /^DELETE \/api\/teacher\/classes\/(.+)$/.exec(route)
  if (m) {
    data.classes = data.classes.filter((c) => !(c.id === m[1] && c.school === school))
    save()
    return json(res, 200, { ok: true })
  }

  if (route === 'POST /api/teacher/exams') {
    const body = await readJSON(req)
    const exam = { ...body, id: rid('x'), school, builtin: false, createdAt: Date.now() }
    data.exams.unshift(exam)
    save()
    return json(res, 200, exam)
  }

  m = /^PUT \/api\/teacher\/exams\/(.+)$/.exec(route)
  if (m) {
    const patch = await readJSON(req)
    const exam = data.exams.find((e) => e.id === m[1] && e.school === school)
    if (!exam) return json(res, 404, { error: 'exam not found' })
    Object.assign(exam, patch, { id: exam.id, school, builtin: false })
    save()
    return json(res, 200, exam)
  }

  m = /^DELETE \/api\/teacher\/exams\/(.+)$/.exec(route)
  if (m) {
    data.exams = data.exams.filter((e) => !(e.id === m[1] && e.school === school))
    save()
    return json(res, 200, { ok: true })
  }

  if (route === 'POST /api/teacher/announcements') {
    const { title, body } = await readJSON(req)
    if (!String(title || '').trim()) return json(res, 400, { error: 'title required' })
    const a = { id: rid('n'), school, title: String(title).trim(), body: String(body || '').trim(), date: Date.now() }
    data.announcements.unshift(a)
    save()
    return json(res, 200, a)
  }

  m = /^DELETE \/api\/teacher\/announcements\/(.+)$/.exec(route)
  if (m) {
    data.announcements = data.announcements.filter((a) => !(a.id === m[1] && a.school === school))
    save()
    return json(res, 200, { ok: true })
  }

  m = /^PATCH \/api\/teacher\/attempts\/(.+)$/.exec(route)
  if (m) {
    const { index, patch } = await readJSON(req)
    const attempt = data.attempts.find((a) => a.id === m[1] && a.school === school)
    if (!attempt) return json(res, 404, { error: 'attempt not found' })
    const i = Number(index)
    if (!Number.isInteger(i) || i < 0 || i >= (attempt.items || []).length) {
      return json(res, 400, { error: 'bad item index' })
    }
    attempt.items[i] = { ...attempt.items[i], ...patch }
    recomputeEarned(attempt)
    save()
    return json(res, 200, attempt)
  }

  if (route === 'DELETE /api/teacher/attempts') {
    data.attempts = data.attempts.filter((a) => a.school !== school)
    save()
    return json(res, 200, { ok: true })
  }

  return json(res, 404, { error: 'not found' })
}

// ---------------------------------------------------------------------------
// Static files (production build) with SPA fallback
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function serveStatic(res, urlPath) {
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
  let file = path.join(DIST_DIR, safe)
  if (!file.startsWith(DIST_DIR)) file = path.join(DIST_DIR, 'index.html')
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST_DIR, 'index.html')
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    return res.end('Build the app first: npm run build')
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}

// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url)
    return serveStatic(res, url.pathname === '/' ? '/index.html' : url.pathname)
  } catch (err) {
    const status = Number(err?.status) || 500
    if (status >= 500) console.error(err)
    return json(res, status, { error: err?.message || 'server error' })
  }
})

server.listen(PORT, () => {
  console.log(`Learning Hub backend on http://localhost:${PORT}`)
  console.log(`  AI proxy:     ${process.env.ANTHROPIC_API_KEY ? 'enabled' : 'DISABLED (set ANTHROPIC_API_KEY)'}`)
  for (const s of SCHOOLS) {
    console.log(`  ${s} teacher key: ${teacherKeyFor(s) ? 'configured' : 'NOT SET (set TEACHER_KEY or TEACHER_KEY_' + s + ')'}`)
  }
  console.log(`  Data file:    ${DATA_FILE}`)
})
