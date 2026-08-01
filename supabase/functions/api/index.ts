// ---------------------------------------------------------------------------
// Learning Hub backend as a Supabase Edge Function.
//
// Same API as server/index.mjs, so the client works with either backend.
//
//   Open:
//     GET  /api/health
//     POST /api/anthropic              AI proxy — key stays in Supabase secrets
//     POST /api/teacher/login          {school, key} -> teacher token
//     POST /api/student/login          {id, password} -> student token
//     GET  /api/invite?token=          who this invite belongs to
//     POST /api/invite/accept          {token, password} -> activate + sign in
//   Student (Bearer student token):
//     GET  /api/student/state          own profile + published exams/announcements
//     POST /api/student/password       {password} change password
//     POST /api/student/attempts       {attempt} submit a graded attempt
//   Teacher (Bearer teacher token):
//     GET  /api/teacher/state          classes/students/exams/announcements/attempts
//     POST /api/teacher/classes        + DELETE /api/teacher/classes/:id
//     POST /api/teacher/students       {id, email, name, classCode} -> account +
//                                      one-time password + invite link (emailed
//                                      when RESEND_API_KEY is configured)
//     POST /api/teacher/students/:id/reinvite   fresh OTP + invite link
//     DELETE /api/teacher/students/:id
//     POST/PUT/DELETE exams, announcements; PATCH/DELETE attempts
//
// Deploy as a function named `api` with JWT verification DISABLED (the app
// has its own auth). Secrets:
//   ANTHROPIC_API_KEY   enables AI for every client
//   TEACHER_KEY         teacher access key (or TEACHER_KEY_BGA)
//   RESEND_API_KEY      optional — emails invites via resend.com
//   EMAIL_FROM          optional — sender, e.g. "BGA Hub <hub@yourdomain>"
//   APP_URL             optional — site URL used in invite emails
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const UPSTREAM = Deno.env.get('APP_ANTHROPIC_BASE_URL') || 'https://api.anthropic.com'
const SCHOOLS = ['BGA']

const teacherKeyFor = (school: string) =>
  Deno.env.get(`TEACHER_KEY_${school}`) || Deno.env.get('TEACHER_KEY') || ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function json(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// PostgREST helper (service role bypasses RLS).
async function db(pathq: string, opts: { method?: string; body?: unknown; prefer?: string } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathq}`, {
    method: opts.method || 'GET',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.prefer ? { Prefer: opts.prefer } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const text = await res.text()
  if (!res.ok) throw new HttpError(500, `database error (${res.status}): ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

const rid = (p: string) => p + crypto.randomUUID().replace(/-/g, '').slice(0, 12)
const newToken = () => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function randomCode(len: number) {
  let code = ''
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return code
}

async function newClassCode(): Promise<string> {
  for (;;) {
    const code = randomCode(6)
    const clash = await db(`classes?code=eq.${code}&select=code`)
    if (!clash.length) return code
  }
}

// ---- password hashing (PBKDF2-SHA256, same format as the Node server) ------
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
const unhex = (s: string) => new Uint8Array((s.match(/.{2}/g) || []).map((x) => parseInt(x, 16)))

async function pbkdf2(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256)
  return hex(new Uint8Array(bits))
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$100000$${hex(salt)}$${await pbkdf2(password, salt)}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = String(stored || '').split('$')
  if (parts.length !== 4) return false
  return (await pbkdf2(password, unhex(parts[2]))) === parts[3]
}

async function readJSON(req: Request) {
  try {
    return await req.json()
  } catch {
    throw new HttpError(400, 'invalid JSON body')
  }
}

function bearer(req: Request) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '')
  return m ? m[1] : ''
}

async function teacherAuth(req: Request) {
  const token = bearer(req)
  if (token) {
    const rows = await db(`teacher_tokens?token=eq.${encodeURIComponent(token)}&select=school`)
    if (rows.length) return rows[0].school as string
  }
  throw new HttpError(401, 'not signed in as a teacher')
}

async function studentAuth(req: Request) {
  const token = bearer(req)
  if (token) {
    const rows = await db(`student_tokens?token=eq.${encodeURIComponent(token)}&select=school,student_id`)
    if (rows.length) {
      const s = await db(
        `students?school=eq.${rows[0].school}&id=eq.${encodeURIComponent(rows[0].student_id)}&select=*`,
      )
      if (s.length) return s[0]
    }
  }
  throw new HttpError(401, 'not signed in')
}

async function classNameFor(school: string, classCode: string | null) {
  if (!classCode) return null
  const rows = await db(`classes?school=eq.${school}&code=eq.${encodeURIComponent(classCode)}&select=name`)
  return rows.length ? rows[0].name : null
}

// Public shapes (never include password_hash).
function studentPub(row: Record<string, unknown>, className: string | null = null, withInvite = false) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    school: row.school,
    classCode: row.class_code || null,
    className,
    mustChange: !!row.must_change,
    activatedAt: row.activated_at || null,
    createdAt: row.created_at,
    ...(withInvite ? { inviteToken: row.invite_token || null } : {}),
  }
}

async function issueStudentToken(row: Record<string, unknown>) {
  const token = newToken()
  await db('student_tokens', {
    method: 'POST',
    body: { token, school: row.school, student_id: row.id, created_at: Date.now() },
  })
  return token
}

// Best-effort invite email via Resend (skipped when not configured).
async function sendInviteEmail(student: Record<string, unknown>, otp: string, inviteToken: string) {
  const key = Deno.env.get('RESEND_API_KEY')
  const to = String(student.email || '').trim()
  if (!key || !to) return false
  const appUrl = (Deno.env.get('APP_URL') || '').replace(/\/$/, '')
  const link = appUrl ? `${appUrl}/#invite=${inviteToken}` : ''
  const name = String(student.name || student.id)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM') || 'Learning Hub <onboarding@resend.dev>',
        to: [to],
        subject: 'Your Learning Hub account',
        html:
          `<p>Hi ${name},</p>` +
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

// Mirrors the client-side attempt-total arithmetic.
function recomputeEarned(attempt: { items?: { score?: number; marks?: number }[]; earnedMarks?: number }) {
  const earned = (attempt.items || []).reduce(
    (s, it) => s + (Number(it.score) || 0) * (Number(it.marks) || 1),
    0,
  )
  attempt.earnedMarks = Math.round(earned * 10) / 10
}

// Best-effort per-isolate rate limit for the AI proxy.
const aiCalls: number[] = []
function aiRateLimited() {
  const now = Date.now()
  while (aiCalls.length && now - aiCalls[0] > 60_000) aiCalls.shift()
  if (aiCalls.length >= 120) return true
  aiCalls.push(now)
  return false
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url)
  // Path arrives as /functions/v1/api/<route> via the gateway (or /api/<route>
  // locally) — normalise to the bare route.
  const route = `${req.method} ${url.pathname.replace(/^.*?\/api(?=\/|$)/, '') || '/'}`

  // ---- open endpoints -------------------------------------------------------
  if (route === 'GET /health') {
    return json(200, {
      ok: true,
      service: 'learning-hub',
      ai: !!Deno.env.get('ANTHROPIC_API_KEY'),
      email: !!Deno.env.get('RESEND_API_KEY'),
      schools: SCHOOLS,
    })
  }

  if (route === 'POST /anthropic') {
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) {
      return json(503, {
        error: 'no_api_key',
        message: 'ANTHROPIC_API_KEY is not set in Supabase secrets. Falling back to local grading.',
      })
    }
    if (aiRateLimited()) {
      return json(429, { error: 'rate_limited', message: 'Too many AI requests — try again in a minute.' })
    }
    const body = await req.text()
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
      return new Response(text, { status: upstream.status, headers: { ...CORS, 'Content-Type': 'application/json' } })
    } catch (err) {
      return json(502, { error: 'upstream_error', message: String(err) })
    }
  }

  if (route === 'POST /teacher/login') {
    const { school, key } = await readJSON(req)
    const s = String(school || SCHOOLS[0]).toUpperCase()
    if (!SCHOOLS.includes(s)) return json(400, { error: 'unknown school' })
    const expected = teacherKeyFor(s)
    if (!expected) return json(503, { error: `no teacher key configured for ${s} (set the TEACHER_KEY secret)` })
    if (String(key || '') !== expected) return json(403, { error: 'wrong access key' })
    const token = newToken()
    await db('teacher_tokens', { method: 'POST', body: { token, school: s, created_at: Date.now() } })
    return json(200, { token, school: s })
  }

  if (route === 'POST /student/login') {
    const { id, password } = await readJSON(req)
    const cleanId = String(id || '').trim().toUpperCase()
    if (!cleanId || !password) return json(400, { error: 'student ID and password required' })
    const rows = await db(`students?id=eq.${encodeURIComponent(cleanId)}&select=*`)
    if (!rows.length || !(await verifyPassword(String(password), rows[0].password_hash))) {
      return json(403, { error: 'wrong student ID or password' })
    }
    const s = rows[0]
    const token = await issueStudentToken(s)
    return json(200, {
      token,
      mustChange: !!s.must_change,
      student: studentPub(s, await classNameFor(s.school, s.class_code)),
    })
  }

  if (route === 'GET /invite') {
    const token = String(url.searchParams.get('token') || '')
    const rows = token ? await db(`students?invite_token=eq.${encodeURIComponent(token)}&select=id,name,school`) : []
    if (!rows.length) return json(404, { error: 'This invite link is no longer valid — ask your teacher for a new one.' })
    return json(200, rows[0])
  }

  if (route === 'POST /invite/accept') {
    const { token, password } = await readJSON(req)
    if (String(password || '').length < 6) return json(400, { error: 'password must be at least 6 characters' })
    const rows = token ? await db(`students?invite_token=eq.${encodeURIComponent(String(token))}&select=*`) : []
    if (!rows.length) return json(404, { error: 'This invite link is no longer valid — ask your teacher for a new one.' })
    const s = rows[0]
    await db(`students?school=eq.${s.school}&id=eq.${encodeURIComponent(s.id)}`, {
      method: 'PATCH',
      body: {
        password_hash: await hashPassword(String(password)),
        must_change: false,
        invite_token: null,
        activated_at: Date.now(),
      },
    })
    const session = await issueStudentToken(s)
    return json(200, {
      token: session,
      student: studentPub({ ...s, must_change: false }, await classNameFor(s.school, s.class_code)),
    })
  }

  // ---- student endpoints (Bearer student token) -------------------------------
  if (route === 'GET /student/state') {
    const s = await studentAuth(req)
    const [exams, announcements] = await Promise.all([
      db(`exams?school=eq.${s.school}&select=data&order=created_at.desc`),
      db(`announcements?school=eq.${s.school}&select=*&order=date.desc`),
    ])
    return json(200, {
      student: studentPub(s, await classNameFor(s.school, s.class_code)),
      exams: exams.map((r: { data: unknown }) => r.data),
      announcements,
    })
  }

  if (route === 'POST /student/password') {
    const s = await studentAuth(req)
    const { password } = await readJSON(req)
    if (String(password || '').length < 6) return json(400, { error: 'password must be at least 6 characters' })
    await db(`students?school=eq.${s.school}&id=eq.${encodeURIComponent(s.id)}`, {
      method: 'PATCH',
      body: {
        password_hash: await hashPassword(String(password)),
        must_change: false,
        invite_token: null,
        activated_at: s.activated_at || Date.now(),
      },
    })
    return json(200, { ok: true })
  }

  if (route === 'POST /student/attempts') {
    const s = await studentAuth(req)
    const { attempt } = await readJSON(req)
    if (!attempt || !Array.isArray(attempt.items)) return json(400, { error: 'attempt required' })
    const rec = {
      ...attempt,
      id: rid('a'),
      school: s.school,
      studentId: s.id,
      student: s.name || s.id,
      classCode: s.class_code || null,
      className: await classNameFor(s.school, s.class_code),
      ts: Date.now(),
    }
    recomputeEarned(rec)
    await db('attempts', {
      method: 'POST',
      body: { id: rec.id, school: s.school, class_code: rec.classCode || '', data: rec, ts: rec.ts },
    })
    try {
      const extra = await db(`attempts?school=eq.${s.school}&select=id&order=ts.desc&offset=400`)
      if (extra.length) {
        const ids = extra.map((r: { id: string }) => r.id).join(',')
        await db(`attempts?id=in.(${ids})`, { method: 'DELETE' })
      }
    } catch {
      /* best effort */
    }
    return json(200, { id: rec.id })
  }

  // ---- teacher endpoints (Bearer teacher token) --------------------------------
  const school = await teacherAuth(req)

  if (route === 'GET /teacher/state') {
    const [classes, studentRows, exams, announcements, attempts] = await Promise.all([
      db(`classes?school=eq.${school}&select=*&order=created_at.asc`),
      db(`students?school=eq.${school}&select=*&order=created_at.asc`),
      db(`exams?school=eq.${school}&select=data&order=created_at.desc`),
      db(`announcements?school=eq.${school}&select=*&order=date.desc`),
      db(`attempts?school=eq.${school}&select=data&order=ts.desc`),
    ])
    const nameByCode = new Map(classes.map((c: { code: string; name: string }) => [c.code, c.name]))
    return json(200, {
      school,
      classes,
      students: studentRows.map((r: Record<string, unknown>) =>
        studentPub(r, (nameByCode.get(r.class_code as string) as string) || null, true),
      ),
      exams: exams.map((r: { data: unknown }) => r.data),
      announcements,
      attempts: attempts.map((r: { data: unknown }) => r.data),
    })
  }

  if (route === 'POST /teacher/classes') {
    const { name } = await readJSON(req)
    const cleanName = String(name || '').trim().slice(0, 80)
    if (!cleanName) return json(400, { error: 'class name required' })
    const cls = { id: rid('c'), school, name: cleanName, code: await newClassCode(), roster: [], created_at: Date.now() }
    await db('classes', { method: 'POST', body: cls })
    return json(200, { ...cls, createdAt: cls.created_at })
  }

  let m = /^DELETE \/teacher\/classes\/(.+)$/.exec(route)
  if (m) {
    await db(`classes?id=eq.${encodeURIComponent(m[1])}&school=eq.${school}`, { method: 'DELETE' })
    return json(200, { ok: true })
  }

  if (route === 'POST /teacher/students') {
    const { id, email, name, classCode } = await readJSON(req)
    const cleanId = String(id || '').trim().toUpperCase().slice(0, 40)
    if (!cleanId) return json(400, { error: 'student ID required' })
    const existing = await db(`students?school=eq.${school}&id=eq.${encodeURIComponent(cleanId)}&select=id`)
    if (existing.length) return json(409, { error: `student ${cleanId} already exists` })
    const otp = randomCode(8)
    const inviteToken = newToken()
    const row = {
      school,
      id: cleanId,
      name: String(name || '').trim().slice(0, 80),
      email: String(email || '').trim().slice(0, 120),
      class_code: String(classCode || '').trim().toUpperCase() || null,
      password_hash: await hashPassword(otp),
      must_change: true,
      invite_token: inviteToken,
      created_at: Date.now(),
      activated_at: null,
    }
    await db('students', { method: 'POST', body: row })
    const emailSent = await sendInviteEmail(row, otp, inviteToken)
    return json(200, {
      student: studentPub(row, await classNameFor(school, row.class_code), true),
      otp,
      inviteToken,
      emailSent,
    })
  }

  m = /^POST \/teacher\/students\/(.+)\/reinvite$/.exec(route)
  if (m) {
    const sid = decodeURIComponent(m[1])
    const rows = await db(`students?school=eq.${school}&id=eq.${encodeURIComponent(sid)}&select=*`)
    if (!rows.length) return json(404, { error: 'student not found' })
    const otp = randomCode(8)
    const inviteToken = newToken()
    await db(`students?school=eq.${school}&id=eq.${encodeURIComponent(sid)}`, {
      method: 'PATCH',
      body: { password_hash: await hashPassword(otp), must_change: true, invite_token: inviteToken },
    })
    const row = { ...rows[0], invite_token: inviteToken, must_change: true }
    const emailSent = await sendInviteEmail(row, otp, inviteToken)
    return json(200, {
      student: studentPub(row, await classNameFor(school, row.class_code), true),
      otp,
      inviteToken,
      emailSent,
    })
  }

  m = /^DELETE \/teacher\/students\/(.+)$/.exec(route)
  if (m) {
    const sid = decodeURIComponent(m[1])
    await db(`students?school=eq.${school}&id=eq.${encodeURIComponent(sid)}`, { method: 'DELETE' })
    await db(`student_tokens?school=eq.${school}&student_id=eq.${encodeURIComponent(sid)}`, { method: 'DELETE' })
    return json(200, { ok: true })
  }

  if (route === 'POST /teacher/exams') {
    const body = await readJSON(req)
    const exam = { ...body, id: rid('x'), school, builtin: false, createdAt: Date.now() }
    await db('exams', { method: 'POST', body: { id: exam.id, school, data: exam, created_at: exam.createdAt } })
    return json(200, exam)
  }

  m = /^PUT \/teacher\/exams\/(.+)$/.exec(route)
  if (m) {
    const patch = await readJSON(req)
    const rows = await db(`exams?id=eq.${encodeURIComponent(m[1])}&school=eq.${school}&select=data`)
    if (!rows.length) return json(404, { error: 'exam not found' })
    const exam = { ...rows[0].data, ...patch, id: m[1], school, builtin: false }
    await db(`exams?id=eq.${encodeURIComponent(m[1])}`, { method: 'PATCH', body: { data: exam } })
    return json(200, exam)
  }

  m = /^DELETE \/teacher\/exams\/(.+)$/.exec(route)
  if (m) {
    await db(`exams?id=eq.${encodeURIComponent(m[1])}&school=eq.${school}`, { method: 'DELETE' })
    return json(200, { ok: true })
  }

  if (route === 'POST /teacher/announcements') {
    const { title, body } = await readJSON(req)
    if (!String(title || '').trim()) return json(400, { error: 'title required' })
    const a = { id: rid('n'), school, title: String(title).trim(), body: String(body || '').trim(), date: Date.now() }
    await db('announcements', { method: 'POST', body: a })
    return json(200, a)
  }

  m = /^DELETE \/teacher\/announcements\/(.+)$/.exec(route)
  if (m) {
    await db(`announcements?id=eq.${encodeURIComponent(m[1])}&school=eq.${school}`, { method: 'DELETE' })
    return json(200, { ok: true })
  }

  m = /^PATCH \/teacher\/attempts\/(.+)$/.exec(route)
  if (m) {
    const { index, patch } = await readJSON(req)
    const rows = await db(`attempts?id=eq.${encodeURIComponent(m[1])}&school=eq.${school}&select=data`)
    if (!rows.length) return json(404, { error: 'attempt not found' })
    const attempt = rows[0].data
    const i = Number(index)
    if (!Number.isInteger(i) || i < 0 || i >= (attempt.items || []).length) {
      return json(400, { error: 'bad item index' })
    }
    attempt.items[i] = { ...attempt.items[i], ...patch }
    recomputeEarned(attempt)
    await db(`attempts?id=eq.${encodeURIComponent(m[1])}`, { method: 'PATCH', body: { data: attempt } })
    return json(200, attempt)
  }

  if (route === 'DELETE /teacher/attempts') {
    await db(`attempts?school=eq.${school}`, { method: 'DELETE' })
    return json(200, { ok: true })
  }

  return json(404, { error: 'not found' })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  try {
    return await handle(req)
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    if (status >= 500) console.error(err)
    return json(status, { error: err instanceof Error ? err.message : 'server error' })
  }
})
