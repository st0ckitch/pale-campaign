// Who is using this browser — persisted so students and teachers stay signed
// in across reloads.
//   { role: 'student', token, id, name, school, classCode, className, mustChange }
//   { role: 'teacher', school, token }
const KEY = 'lh_session_v1'

export function loadSession() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (s?.role === 'student' && s.token && s.id) return s
    if (s?.role === 'teacher' && s.school && s.token) return s
  } catch {
    /* ignore */
  }
  return null
}

export function saveSession(s) {
  if (typeof window === 'undefined') return
  try {
    if (s) window.localStorage.setItem(KEY, JSON.stringify(s))
    else window.localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
