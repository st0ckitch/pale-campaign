// ---------------------------------------------------------------------------
// Client for the Learning Hub backend (server/index.mjs).
//
// The backend is optional: on plain static hosting (GitHub Pages) detection
// fails fast and the app runs in the same local, single-browser mode as
// before. When VITE_API_BASE points at a deployed backend — or the app is
// served BY the backend (same origin) — everything upgrades to synced mode.
// ---------------------------------------------------------------------------

export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// GET /api/health with a short timeout. Resolves to the health object when a
// backend is reachable, or null when we're on static hosting / offline.
export async function detectBackend() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3500)
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal })
    if (!res.ok) return null
    const h = await res.json()
    return h && h.ok ? h : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function req(path, { method = 'GET', body, token } = {}) {
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  } catch (err) {
    throw new ApiError('Could not reach the school server.', 0)
  }
  let payload = null
  try {
    payload = await res.json()
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) throw new ApiError(payload?.error || payload?.message || `Server error (${res.status})`, res.status)
  return payload
}

export const api = {
  // teacher
  teacherLogin: (school, key) => req('/api/teacher/login', { method: 'POST', body: { school, key } }),
  teacherState: (token) => req('/api/teacher/state', { token }),
  createClass: (token, name) => req('/api/teacher/classes', { method: 'POST', body: { name }, token }),
  deleteClass: (token, id) => req(`/api/teacher/classes/${id}`, { method: 'DELETE', token }),
  createExam: (token, exam) => req('/api/teacher/exams', { method: 'POST', body: exam, token }),
  updateExam: (token, id, patch) => req(`/api/teacher/exams/${id}`, { method: 'PUT', body: patch, token }),
  deleteExam: (token, id) => req(`/api/teacher/exams/${id}`, { method: 'DELETE', token }),
  postAnnouncement: (token, a) => req('/api/teacher/announcements', { method: 'POST', body: a, token }),
  deleteAnnouncement: (token, id) => req(`/api/teacher/announcements/${id}`, { method: 'DELETE', token }),
  patchAttemptItem: (token, attemptId, index, patch) =>
    req(`/api/teacher/attempts/${attemptId}`, { method: 'PATCH', body: { index, patch }, token }),
  clearAttempts: (token) => req('/api/teacher/attempts', { method: 'DELETE', token }),
  // student
  join: (code, name) => req('/api/join', { method: 'POST', body: { code, name } }),
  studentState: (code) => req(`/api/student/state?code=${encodeURIComponent(code)}`),
  postAttempt: (code, attempt) => req('/api/student/attempts', { method: 'POST', body: { code, attempt } }),
}
