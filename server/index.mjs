// ---------------------------------------------------------------------------
// Learning Hub backend — self-hosted Node alternative to the Supabase Edge
// Function (supabase/functions/api/index.ts). Identical API:
//
//   Open:      GET /api/health · POST /api/anthropic · POST /api/teacher/login
//              POST /api/student/login · GET /api/invite?token= · POST /api/invite/accept
//   Student:   GET /api/student/state · POST /api/student/password · POST /api/student/attempts
//   Teacher:   GET /api/teacher/state · classes/students/exams/announcements CRUD ·
//              PATCH/DELETE /api/teacher/attempts
//
// Student accounts are created by a teacher (ID + email). The server generates
// a one-time password and an invite link (emailed via Resend when configured);
// the student sets their own password and signs in with ID + password.
//
// Zero dependencies (Node 18+). Storage: one JSON file with atomic writes.
//
// Env vars:
//   PORT                  default 8787
//   ANTHROPIC_API_KEY     enables AI grading/tutor/scanning for every client
//   APP_ANTHROPIC_BASE_URL  override the Anthropic API base (rarely needed)
//   TEACHER_KEY           teacher access key (or TEACHER_KEY_BGA)
//   RESEND_API_KEY        optional — emails invites via resend.com
//   EMAIL_FROM            optional — sender address for invites
//   APP_URL               optional — site URL used in invite emails
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
const SCHOOLS = ['BGA']

const teacherKeyFor = (school) =>
  process.env[`TEACHER_KEY_${school}`] || process.env.TEACHER_KEY || ''

// ---------------------------------------------------------------------------
// Persistence — load once, save debounced with atomic rename.
// ---------------------------------------------------------------------------
function blankData() {
  return { tokens: {}, studentTokens: {}, classes: [], students: [], exams: [], announcements: [], attempts: [] }
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
const newToken = () => crypto.randomBytes(24).toString('hex')

// Codes avoid ambiguous characters (0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function randomCode(len) {
  let code = ''
  for (let i = 0; i < len; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]
  return code
}
function newClassCode() {
  for (;;) {
    const code = randomCode(6)
    if (!data.classes.some((c) => c.code === code)) return code
  }
}

// ---- password hashing (PBKDF2-SHA256, same format as the Edge Function) ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const h = crypto.pbkdf2Sync(String(password), salt, 100000, 32, 'sha256')
  return `pbkdf2$100000$${salt.toString('hex')}$${h.toString('hex')}`
}
function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$')
  if (parts.length !== 4) return false
  const h = crypto.pbkdf2Sync(String(password), Buffer.from(parts[2], 'hex'), Number(parts[1]) || 100000, 32, 'sha256')
  return h.toString('hex') === parts[3]
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

async function readJSON(req, limitBytes = 8 * 1024 * 1024) {
  const raw = await readBody(req, limitBytes)
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    throw Object.assign(new Error('invalid JSON body'), { status: 400 })
  }
}

const bearer = (req) => {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')
  return m ? m[1] : ''
}

function teacherAuth(req) {
  const rec = data.tokens[bearer(req)]
  if (!rec) throw Object.assign(new Error('not signed in as a teacher'), { status: 401 })
  return rec // { school, createdAt }
}

function studentAuth(req) {
  const rec = data.studentTokens[bearer(req)]
  const s = rec && data.students.find((x) => x.school === rec.school && x.id === rec.studentId)
  if (!s) throw Object.assign(new Error('not signed in'), { status: 401 })
  return s
}

const classNameFor = (school, classCode) => {
  if (!classCode) return null
  const c = data.classes.find((k) => k.school === school && k.code === classCode)
  return c ? c.name : null
}

// Public student shape (never includes the password hash).
function studentPub(s, withInvite = false) {
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    school: s.school,
    classCode: s.classCode || null,
    className: classNameFor(s.school, s.classCode),
    mustChange: !!s.mustChange,
    activatedAt: s.activatedAt || null,
    createdAt: s.createdAt,
    ...(withInvite ? { inviteToken: s.inviteToken || null } : {}),
  }
}

function issueStudentToken(s) {
  const token = newToken()
  data.studentTokens[token] = { school: s.school, studentId: s.id, createdAt: Date.now() }
  save()
  return token
}

// Best-effort invite email via Resend (skipped when not configured).
async function sendInviteEmail(student, otp, inviteToken) {
  const key = process.env.RESEND_API_KEY
  const to = String(student.email || '').trim()
  if (!key || !to) return false
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '')
  const link = appUrl ? `${appUrl}/#invite=${inviteToken}` : ''
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Learning Hub <onboarding@resend.dev>',
        to: [to],
        subject: 'Your Learning Hub account',
        html:
          `<p>Hi ${student.name || student.id},</p>` +
          `<p>Your teacher created a Learning Hub account for you.</p>` +
          `<p><b>Student ID:</b> ${student.id}<br/><b>One-time password:</b> ${otp}</p>` +
          (link
            ? `<p><a href="${link}">Click here to set your own password</a> — then sign in with your Student ID.</p>`
            : `<p>Open the school Learning Hub, sign in with your Student ID and this one-time password, and you'll be asked to set your own password.</p>`),
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Simple per-IP sliding-window rate limit for the AI proxy.
const aiCalls = new Map() // ip -> [timestamps]
function aiRateLimited(ip) {
  const now = Date.now()
  const arr = (aiCalls.get(ip) || []).filter((t) => now - t < 60_000)
  if (arr.length >= 40) {
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

  // ---- open endpoints -------------------------------------------------------
  if (route === 'GET /api/health') {
    return json(res, 200, {
      ok: true,
      service: 'learning-hub',
      ai: !!process.env.ANTHROPIC_API_KEY,
      email: !!process.env.RESEND_API_KEY,
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
    if (aiRateLimited(req.socket.remoteAddress || 'unknown')) {
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
    const s = String(school || SCHOOLS[0]).toUpperCase()
    if (!SCHOOLS.includes(s)) return json(res, 400, { error: 'unknown school' })
    const expected = teacherKeyFor(s)
    if (!expected) return json(res, 503, { error: `no teacher key configured for ${s} (set TEACHER_KEY)` })
    if (String(key || '') !== expected) return json(res, 403, { error: 'wrong access key' })
    const token = newToken()
    data.tokens[token] = { school: s, createdAt: Date.now() }
    save()
    return json(res, 200, { token, school: s })
  }

  if (route === 'POST /api/student/login') {
    const { id, password } = await readJSON(req)
    const cleanId = String(id || '').trim().toUpperCase()
    const s = data.students.find((x) => x.id === cleanId)
    if (!s || !verifyPassword(password, s.passwordHash)) {
      return json(res, 403, { error: 'wrong student ID or password' })
    }
    return json(res, 200, { token: issueStudentToken(s), mustChange: !!s.mustChange, student: studentPub(s) })
  }

  if (route === 'GET /api/invite') {
    const token = String(url.searchParams.get('token') || '')
    const s = token && data.students.find((x) => x.inviteToken === token)
    if (!s) return json(res, 404, { error: 'This invite link is no longer valid — ask your teacher for a new one.' })
    return json(res, 200, { id: s.id, name: s.name, school: s.school })
  }

  if (route === 'POST /api/invite/accept') {
    const { token, password } = await readJSON(req)
    if (String(password || '').length < 6) return json(res, 400, { error: 'password must be at least 6 characters' })
    const s = token && data.students.find((x) => x.inviteToken === String(token))
    if (!s) return json(res, 404, { error: 'This invite link is no longer valid — ask your teacher for a new one.' })
    s.passwordHash = hashPassword(password)
    s.mustChange = false
    s.inviteToken = null
    s.activatedAt = Date.now()
    save()
    return json(res, 200, { token: issueStudentToken(s), student: studentPub(s) })
  }

  // ---- student endpoints ------------------------------------------------------
  if (route === 'GET /api/student/state') {
    const s = studentAuth(req)
    return json(res, 200, {
      student: studentPub(s),
      exams: data.exams.filter((e) => e.school === s.school),
      announcements: data.announcements.filter((a) => a.school === s.school),
    })
  }

  if (route === 'POST /api/student/password') {
    const s = studentAuth(req)
    const { password } = await readJSON(req)
    if (String(password || '').length < 6) return json(res, 400, { error: 'password must be at least 6 characters' })
    s.passwordHash = hashPassword(password)
    s.mustChange = false
    s.inviteToken = null
    s.activatedAt = s.activatedAt || Date.now()
    save()
    return json(res, 200, { ok: true })
  }

  if (route === 'POST /api/student/attempts') {
    const s = studentAuth(req)
    const { attempt } = await readJSON(req)
    if (!attempt || !Array.isArray(attempt.items)) return json(res, 400, { error: 'attempt required' })
    const rec = {
      ...attempt,
      id: rid('a'),
      school: s.school,
      studentId: s.id,
      student: s.name || s.id,
      classCode: s.classCode || null,
      className: classNameFor(s.school, s.classCode),
      ts: Date.now(),
    }
    recomputeEarned(rec)
    data.attempts.unshift(rec)
    const bySchool = data.attempts.filter((a) => a.school === s.school)
    if (bySchool.length > 400) {
      const keep = new Set(bySchool.slice(0, 400).map((a) => a.id))
      data.attempts = data.attempts.filter((a) => a.school !== s.school || keep.has(a.id))
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
      students: data.students.filter((s) => s.school === school).map((s) => studentPub(s, true)),
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

  if (route === 'POST /api/teacher/students') {
    const { id, email, name, classCode } = await readJSON(req)
    const cleanId = String(id || '').trim().toUpperCase().slice(0, 40)
    if (!cleanId) return json(res, 400, { error: 'student ID required' })
    if (data.students.some((s) => s.school === school && s.id === cleanId)) {
      return json(res, 409, { error: `student ${cleanId} already exists` })
    }
    const otp = randomCode(8)
    const inviteToken = newToken()
    const s = {
      school,
      id: cleanId,
      name: String(name || '').trim().slice(0, 80),
      email: String(email || '').trim().slice(0, 120),
      classCode: String(classCode || '').trim().toUpperCase() || null,
      passwordHash: hashPassword(otp),
      mustChange: true,
      inviteToken,
      createdAt: Date.now(),
      activatedAt: null,
    }
    data.students.push(s)
    save()
    const emailSent = await sendInviteEmail(s, otp, inviteToken)
    return json(res, 200, { student: studentPub(s, true), otp, inviteToken, emailSent })
  }

  m = /^POST \/api\/teacher\/students\/(.+)\/reinvite$/.exec(route)
  if (m) {
    const s = data.students.find((x) => x.school === school && x.id === decodeURIComponent(m[1]))
    if (!s) return json(res, 404, { error: 'student not found' })
    const otp = randomCode(8)
    s.passwordHash = hashPassword(otp)
    s.mustChange = true
    s.inviteToken = newToken()
    save()
    const emailSent = await sendInviteEmail(s, otp, s.inviteToken)
    return json(res, 200, { student: studentPub(s, true), otp, inviteToken: s.inviteToken, emailSent })
  }

  m = /^DELETE \/api\/teacher\/students\/(.+)$/.exec(route)
  if (m) {
    const sid = decodeURIComponent(m[1])
    data.students = data.students.filter((s) => !(s.school === school && s.id === sid))
    for (const [tok, rec] of Object.entries(data.studentTokens)) {
      if (rec.school === school && rec.studentId === sid) delete data.studentTokens[tok]
    }
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
  console.log(`  AI proxy:      ${process.env.ANTHROPIC_API_KEY ? 'enabled' : 'DISABLED (set ANTHROPIC_API_KEY)'}`)
  console.log(`  Invite emails: ${process.env.RESEND_API_KEY ? 'enabled' : 'disabled (set RESEND_API_KEY to send)'}`)
  for (const s of SCHOOLS) {
    console.log(`  ${s} teacher key: ${teacherKeyFor(s) ? 'configured' : 'NOT SET (set TEACHER_KEY)'}`)
  }
  console.log(`  Data file:     ${DATA_FILE}`)
})
