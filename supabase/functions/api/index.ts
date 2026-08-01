// ---------------------------------------------------------------------------
// Learning Hub backend as a Supabase Edge Function.
//
// Same API as server/index.mjs, so the client works with either backend:
//   POST /api/anthropic            AI proxy — the key stays in Supabase secrets
//   POST /api/teacher/login        teacher sign-in (per-school access key)
//   GET  /api/teacher/state        classes / exams / announcements / attempts
//   POST /api/teacher/classes      + DELETE /api/teacher/classes/:id
//   POST /api/teacher/exams        + PUT/DELETE /api/teacher/exams/:id
//   POST /api/teacher/announcements + DELETE /api/teacher/announcements/:id
//   PATCH /api/teacher/attempts/:id  (mark override)  + DELETE /api/teacher/attempts
//   POST /api/join                 student joins a class by code
//   GET  /api/student/state?code=  published exams + announcements
//   POST /api/student/attempts     submit a graded attempt
//
// Deploy as a function named `api` with JWT verification DISABLED (the app has
// its own auth: teacher bearer tokens + class codes). Secrets to set:
//   ANTHROPIC_API_KEY   enables AI for every client
//   TEACHER_KEY         teacher access key (or TEACHER_KEY_BGA / TEACHER_KEY_BIST)
//
// Storage is the project's own Postgres, accessed through PostgREST with the
// service-role key (auto-injected as SUPABASE_SERVICE_ROLE_KEY). All tables
// have RLS on with no policies, so only this function can reach them.
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const UPSTREAM = Deno.env.get('APP_ANTHROPIC_BASE_URL') || 'https://api.anthropic.com'
const SCHOOLS = ['BGA', 'BIST']

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

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
async function newClassCode(): Promise<string> {
  for (;;) {
    let code = ''
    const bytes = crypto.getRandomValues(new Uint8Array(6))
    for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length]
    const clash = await db(`classes?code=eq.${code}&select=code`)
    if (!clash.length) return code
  }
}

async function readJSON(req: Request) {
  try {
    return await req.json()
  } catch {
    throw new HttpError(400, 'invalid JSON body')
  }
}

async function teacherAuth(req: Request) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '')
  if (m) {
    const rows = await db(`teacher_tokens?token=eq.${encodeURIComponent(m[1])}&select=school`)
    if (rows.length) return rows[0].school as string
  }
  throw new HttpError(401, 'not signed in as a teacher')
}

async function classByCode(codeRaw: unknown) {
  const code = String(codeRaw || '').trim().toUpperCase()
  const rows = code ? await db(`classes?code=eq.${encodeURIComponent(code)}&select=*`) : []
  if (!rows.length) throw new HttpError(404, 'unknown class code')
  return rows[0]
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

  // ---- open endpoints -----------------------------------------------------
  if (route === 'GET /health') {
    return json(200, {
      ok: true,
      service: 'learning-hub',
      ai: !!Deno.env.get('ANTHROPIC_API_KEY'),
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
    const s = String(school || '').toUpperCase()
    if (!SCHOOLS.includes(s)) return json(400, { error: 'unknown school' })
    const expected = teacherKeyFor(s)
    if (!expected) return json(503, { error: `no teacher key configured for ${s} (set the TEACHER_KEY secret)` })
    if (String(key || '') !== expected) return json(403, { error: 'wrong access key' })
    const token = rid('t') + crypto.randomUUID().replace(/-/g, '')
    await db('teacher_tokens', { method: 'POST', body: { token, school: s, created_at: Date.now() } })
    return json(200, { token, school: s })
  }

  if (route === 'POST /join') {
    const { code, name } = await readJSON(req)
    const cleanName = String(name || '').trim().slice(0, 60)
    if (!cleanName) return json(400, { error: 'name required' })
    const cls = await classByCode(code)
    const roster: string[] = cls.roster || []
    if (!roster.includes(cleanName)) {
      await db(`classes?id=eq.${cls.id}`, { method: 'PATCH', body: { roster: [...roster, cleanName] } })
    }
    return json(200, { school: cls.school, classCode: cls.code, className: cls.name, name: cleanName })
  }

  if (route === 'GET /student/state') {
    const cls = await classByCode(url.searchParams.get('code'))
    const [exams, announcements] = await Promise.all([
      db(`exams?school=eq.${cls.school}&select=data&order=created_at.desc`),
      db(`announcements?school=eq.${cls.school}&select=*&order=date.desc`),
    ])
    return json(200, {
      school: cls.school,
      className: cls.name,
      classCode: cls.code,
      exams: exams.map((r: { data: unknown }) => r.data),
      announcements,
    })
  }

  if (route === 'POST /student/attempts') {
    const { code, attempt } = await readJSON(req)
    const cls = await classByCode(code)
    if (!attempt || !Array.isArray(attempt.items)) return json(400, { error: 'attempt required' })
    const rec = {
      ...attempt,
      id: rid('a'),
      school: cls.school,
      classCode: cls.code,
      className: cls.name,
      ts: Date.now(),
    }
    recomputeEarned(rec)
    await db('attempts', {
      method: 'POST',
      body: { id: rec.id, school: cls.school, class_code: cls.code, data: rec, ts: rec.ts },
    })
    // Bound growth: drop everything beyond the newest 400 per school.
    try {
      const extra = await db(`attempts?school=eq.${cls.school}&select=id&order=ts.desc&offset=400`)
      if (extra.length) {
        const ids = extra.map((r: { id: string }) => r.id).join(',')
        await db(`attempts?id=in.(${ids})`, { method: 'DELETE' })
      }
    } catch {
      /* best effort */
    }
    return json(200, { id: rec.id })
  }

  // ---- teacher endpoints (Bearer token) -------------------------------------
  const school = await teacherAuth(req)

  if (route === 'GET /teacher/state') {
    const [classes, exams, announcements, attempts] = await Promise.all([
      db(`classes?school=eq.${school}&select=*&order=created_at.asc`),
      db(`exams?school=eq.${school}&select=data&order=created_at.desc`),
      db(`announcements?school=eq.${school}&select=*&order=date.desc`),
      db(`attempts?school=eq.${school}&select=data&order=ts.desc`),
    ])
    return json(200, {
      school,
      classes,
      exams: exams.map((r: { data: unknown }) => r.data),
      announcements,
      attempts: attempts.map((r: { data: unknown }) => r.data),
    })
  }

  if (route === 'POST /teacher/classes') {
    const { name } = await readJSON(req)
    const cleanName = String(name || '').trim().slice(0, 80)
    if (!cleanName) return json(400, { error: 'class name required' })
    const cls = {
      id: rid('c'),
      school,
      name: cleanName,
      code: await newClassCode(),
      roster: [],
      created_at: Date.now(),
    }
    await db('classes', { method: 'POST', body: cls })
    return json(200, { ...cls, createdAt: cls.created_at })
  }

  let m = /^DELETE \/teacher\/classes\/(.+)$/.exec(route)
  if (m) {
    await db(`classes?id=eq.${encodeURIComponent(m[1])}&school=eq.${school}`, { method: 'DELETE' })
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
