import { useCallback, useEffect, useState } from 'react'
import { getTheme, pill, navStyle, sub, fill } from './theme.js'
import { setClientApiKey } from './lib/anthropic.js'
import { useReducedMotion } from './lib/useReducedMotion.js'
import ExamsView from './exam/ExamsView.jsx'
import Home from './pages/Home.jsx'
import Tutor from './pages/Tutor.jsx'
import Teacher from './pages/Teacher.jsx'
import ConnectAI from './components/ConnectAI.jsx'
import BrandLogo from './components/BrandLogo.jsx'
import { useContentStore } from './lib/useContentStore.js'
import { api, detectBackend } from './lib/api.js'
import { loadSession, saveSession } from './lib/session.js'

const ICONS = {
  home: () => <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.4V20h14V9.4" /></>,
  exams: () => <><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M9 3.5h6V6H9z" /><path d="m8.5 13 2 2 4-4" /></>,
  tutor: () => <><path d="M4 5.5h16v10H9.5L5 19.5z" /><path d="M8.5 10h7M8.5 13h4" /></>,
  teacher: () => <><path d="M12 4 2 9l10 5 10-5z" /><path d="M6 11v4c0 1 2.7 3 6 3s6-2 6-3v-4" /></>,
}

export default function App() {
  const [tab, setTab] = useState('home')
  const [toasts, setToasts] = useState([])
  const [apiKey, setApiKey] = useState('')
  const [connectOpen, setConnectOpen] = useState(false)
  const [backend, setBackend] = useState(null) // /api/health payload when a server is reachable
  const [session, setSession] = useState(loadSession)
  const [gateOpen, setGateOpen] = useState(false)
  // Invite link from a teacher/email: https://app/#invite=<token>
  const [invite, setInvite] = useState(() => {
    if (typeof window === 'undefined') return null
    const m = /invite=([A-Za-z0-9]+)/.exec(window.location.hash)
    return m ? m[1] : null
  })
  const brand = 'BGA' // single-school deployment
  const reduceMotion = useReducedMotion()

  // Each role sees only its own surface: teachers get the dashboard (+ a
  // student-view preview of exams); students get Home/Exams/Tutor. Without a
  // server (or before signing in) the app keeps the open single-device view.
  const role = backend ? session?.role || null : null
  const NAV =
    role === 'teacher'
      ? [['teacher', 'Dashboard'], ['exams', 'Preview']]
      : role === 'student'
        ? [['home', 'Home'], ['exams', 'Exams'], ['tutor', 'AI Tutor']]
        : [['home', 'Home'], ['exams', 'Exams'], ['tutor', 'AI Tutor'], ['teacher', 'Teacher']]

  const toast = useCallback((msg) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((ts) => [...ts, { id, msg }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3400)
  }, [])

  const signOut = useCallback((msg) => {
    saveSession(null)
    setSession(null)
    if (msg) toast(msg)
  }, [toast])

  const store = useContentStore({
    cloud: !!backend,
    session,
    notify: toast,
    onAuthError: () => signOut('Session expired — please sign in again'),
  })
  const t = getTheme(brand)

  // Is a school server reachable? On static hosting this resolves to null and
  // the app runs in the same local mode as always.
  useEffect(() => {
    detectBackend().then((h) => {
      setBackend(h)
      if (h && !loadSession() && !invite) setGateOpen(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the active tab inside the current role's navigation.
  useEffect(() => {
    if (role === 'teacher') setTab((cur) => (cur === 'teacher' || cur === 'exams' ? cur : 'teacher'))
    else if (role === 'student') setTab((cur) => (cur === 'teacher' ? 'home' : cur))
  }, [role])

  // register the in-browser API key for direct calls (used on static hosting)
  useEffect(() => {
    setClientApiKey(apiKey)
  }, [apiKey])

  function adoptSession(s) {
    saveSession(s)
    setSession(s)
    setGateOpen(false)
  }

  // AI is on when the user pasted a key (static hosting) OR the server holds one.
  const aiOn = !!apiKey || !!backend?.ai
  const go = (key) => setTab(key)

  return (
    <div style={{ position: 'relative', minHeight: '100vh', width: '100%', overflowX: 'hidden', background: 'var(--canvas)' }}>
      <div style={t.bloom} />
      {/* fine noise overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          opacity: 0.035,
          mixBlendMode: 'overlay',
          backgroundImage:
            "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%222%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/></svg>')",
        }}
      />

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', gap: 18, minHeight: '100vh', padding: 18 }}>
        {/* LEFT RAIL */}
        <aside
          style={{
            width: 86,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '16px 0',
            gap: 16,
            borderRadius: 26,
            background: 'var(--rail-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--glass-border)',
            boxShadow: 'var(--glass-shadow)',
            position: 'sticky',
            top: 18,
            height: 'calc(100vh - 36px)',
          }}
        >
          <div style={{ ...t.brandMark, cursor: 'default' }}>
            <BrandLogo key={brand} brand={brand} variant="mark" height={30} fallback={brand} />
          </div>
          <div style={{ width: 30, height: 1, background: 'var(--glass-border)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            {NAV.map(([key, label]) => {
              const on = tab === key
              const iconKey = key === 'teacher' && role === 'teacher' ? 'teacher' : key
              return (
                <div key={key} style={navStyle(t, on)} onClick={() => setTab(key)} title={label}>
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={on ? t.brand === 'BIST' ? '#8A6A00' : t.accent : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {ICONS[iconKey]()}
                  </svg>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.02em' }}>{label}</span>
                </div>
              )
            })}
          </div>
        </aside>

        {/* MAIN */}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* TOPBAR */}
          <header style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <BrandLogo key={`wm-${brand}`} brand={brand} variant="wordmark" height={46} fallback={null} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>
                {session?.role === 'student'
                  ? `Welcome back, ${(session.name || session.id).split(' ')[0]} 👋`
                  : session?.role === 'teacher'
                    ? 'Welcome back, Teacher 👋'
                    : 'Welcome 👋'}
              </div>
              <div style={{ fontSize: 12.5, color: sub(0.45), marginTop: 3, letterSpacing: '0.02em' }}>
                {session?.role === 'student'
                  ? `${brand} · ${session.className || 'IB Diploma Programme'} · ID ${session.id}`
                  : session?.role === 'teacher'
                    ? `${session.school} · teacher account`
                    : `${brand} · IB Diploma Programme`}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {/* Identity (only when a school server is connected) */}
              {backend && (
                <button
                  onClick={() => (session ? signOut('Signed out') : setGateOpen(true))}
                  title={session ? 'Sign out' : 'Join your class or sign in'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 14px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    fontFamily: "'Manrope',sans-serif",
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: session ? t.accent : sub(0.7),
                    background: session ? t.hexA(t.accent, 0.12) : fill(0.05),
                    border: `1px solid ${session ? t.hexA(t.accent, 0.45) : fill(0.12)}`,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: session ? t.accent : sub(0.4) }} />
                  {session
                    ? session.role === 'teacher'
                      ? `${session.school} teacher · sign out`
                      : `${session.name || session.id} · sign out`
                    : 'Sign in'}
                </button>
              )}

              {/* Connect AI */}
              <button
                onClick={() => setConnectOpen(true)}
                title={aiOn ? 'AI connected' : 'Connect AI'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 14px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontFamily: "'Manrope',sans-serif",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: aiOn ? t.OK : sub(0.7),
                  background: aiOn ? 'rgba(52,199,150,0.12)' : fill(0.05),
                  border: `1px solid ${aiOn ? 'rgba(52,199,150,0.45)' : fill(0.12)}`,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 999, background: aiOn ? t.OK : sub(0.4), boxShadow: aiOn ? `0 0 8px ${t.OK}` : 'none' }} />
                {aiOn ? 'AI connected' : 'Connect AI'}
              </button>

            </div>
          </header>

          {/* CONTENT */}
          {tab === 'home' && <Home t={t} reduceMotion={reduceMotion} onGo={go} toast={toast} store={store} />}
          {tab === 'exams' && <ExamsView t={t} store={store} toast={toast} reduceMotion={reduceMotion} aiOn={aiOn} onConnect={() => setConnectOpen(true)} onGo={go} student={session?.role === 'student' ? session.name || session.id : ''} />}
          {tab === 'tutor' && <Tutor t={t} reduceMotion={reduceMotion} aiOn={aiOn} onConnect={() => setConnectOpen(true)} toast={toast} />}
          {tab === 'teacher' && (
            // With a school server connected, the teacher dashboard requires a
            // teacher sign-in; without one (static/local mode) it stays open
            // as before, since everything is on-device anyway.
            backend && session?.role !== 'teacher'
              ? <TeacherLoginCard t={t} schools={['BGA']} onLogin={adoptSession} toast={toast} />
              : <Teacher t={t} store={store} toast={toast} reduceMotion={reduceMotion} onGo={go} aiOn={aiOn} onConnect={() => setConnectOpen(true)} />
          )}
        </main>
      </div>

      {connectOpen && (
        <ConnectAI t={t} apiKey={apiKey} onSave={(k) => { setApiKey(k); toast(k ? 'AI connected' : 'AI disconnected'); }} onClose={() => setConnectOpen(false)} />
      )}

      {gateOpen && backend && !session && !invite && (
        <SessionGate t={t} schools={['BGA']} onJoin={adoptSession} onLogin={adoptSession} onClose={() => setGateOpen(false)} toast={toast} />
      )}

      {invite && (
        <InviteGate
          t={t}
          token={invite}
          toast={toast}
          onDone={(s) => {
            adoptSession(s)
            if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname + window.location.search)
            setInvite(null)
          }}
          onClose={() => {
            if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname + window.location.search)
            setInvite(null)
          }}
        />
      )}

      {session?.role === 'student' && session.mustChange && !invite && (
        <ChangePasswordGate
          t={t}
          session={session}
          toast={toast}
          onDone={() => {
            const s = { ...session, mustChange: false }
            saveSession(s)
            setSession(s)
          }}
          onSignOut={() => signOut('Signed out')}
        />
      )}

      {/* TOASTS */}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 90, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
        {toasts.map((to) => (
          <div
            key={to.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '13px 18px',
              borderRadius: 16,
              background: 'var(--toast-bg)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--glass-border)',
              boxShadow: '0 16px 44px rgba(0,0,0,0.3)',
              fontSize: 13.5,
              fontWeight: 500,
              color: 'var(--ink)',
              animation: 'qgfade .3s cubic-bezier(.22,1,.36,1) both',
            }}
          >
            <span style={{ width: 22, height: 22, borderRadius: 999, background: 'rgba(52,199,150,0.18)', border: '1px solid rgba(52,199,150,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34C796', fontSize: 12 }}>✓</span>
            {to.msg}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Session gate: shown when a school server is connected but this browser has
// no identity yet. Students join with a class code; teachers sign in with the
// school access key. Dismissible — the app still works read-only/local.
// ---------------------------------------------------------------------------
const gateInput = (t) => ({
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  background: 'var(--input-bg)',
  border: `1px solid ${fill(0.12)}`,
  color: 'var(--ink)',
  fontSize: 14,
  fontFamily: "'Manrope',sans-serif",
  outline: 'none',
})

function SessionGate({ t, schools, onJoin, onLogin, onClose, toast }) {
  const [role, setRole] = useState('student')
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--scrim)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div style={{ ...t.GLASS, borderRadius: 24, padding: '30px 32px', width: 'min(440px, 92vw)', background: 'var(--panel-bg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 19, fontWeight: 700 }}>Sign in to BGA Learning Hub</div>
        <div style={{ fontSize: 13, color: sub(0.55), marginTop: 6, lineHeight: 1.5 }}>
          Students sign in with their Student ID. Teachers use the school access key.
        </div>
        <div style={{ display: 'flex', padding: 4, gap: 3, borderRadius: 999, background: fill(0.05), border: `1px solid ${fill(0.1)}`, marginTop: 18, width: 'fit-content' }}>
          <div style={pill(t, role === 'student')} onClick={() => setRole('student')}>I'm a student</div>
          <div style={pill(t, role === 'teacher')} onClick={() => setRole('teacher')}>I'm a teacher</div>
        </div>
        <div style={{ marginTop: 18 }}>
          {role === 'student'
            ? <StudentLoginForm t={t} onLogin={onJoin} toast={toast} />
            : <TeacherLoginForm t={t} schools={schools} onLogin={onLogin} toast={toast} />}
        </div>
        <button onClick={onClose} style={{ marginTop: 16, background: 'none', border: 'none', color: sub(0.5), fontSize: 12.5, cursor: 'pointer', padding: 0, fontFamily: "'Manrope',sans-serif" }}>
          Continue without signing in (work stays on this device)
        </button>
      </div>
    </div>
  )
}

function StudentLoginForm({ t, onLogin, toast }) {
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (busy) return
    if (!id.trim() || !password) { toast('Enter your Student ID and password'); return }
    setBusy(true)
    try {
      const r = await api.studentLogin(id.trim(), password)
      onLogin({
        role: 'student',
        token: r.token,
        mustChange: !!r.mustChange,
        id: r.student.id,
        name: r.student.name,
        school: r.student.school,
        classCode: r.student.classCode,
        className: r.student.className,
      })
      toast(`Welcome, ${r.student.name || r.student.id}`)
    } catch (err) {
      toast(err.message || 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input style={{ ...gateInput(t), textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk',sans-serif" }} value={id} onChange={(e) => setId(e.target.value)} placeholder="Student ID (e.g. S12345)" />
      <input type="password" style={gateInput(t)} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <button style={{ ...t.cta, justifyContent: 'center', opacity: busy ? 0.6 : 1 }} onClick={submit} disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <div style={{ fontSize: 12, color: sub(0.5), lineHeight: 1.5 }}>
        First time here? Use the link your teacher sent you, or sign in with the one-time password from the email — you'll then set your own.
      </div>
    </div>
  )
}

// Invite link landing: the student sets their own password and is signed in.
function InviteGate({ t, token, toast, onDone, onClose }) {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.inviteInfo(token).then(setInfo).catch((err) => setError(err.message || 'Invalid invite link'))
  }, [token])

  async function submit() {
    if (busy) return
    if (pw1.length < 6) { toast('Password must be at least 6 characters'); return }
    if (pw1 !== pw2) { toast("Passwords don't match"); return }
    setBusy(true)
    try {
      const r = await api.acceptInvite(token, pw1)
      onDone({
        role: 'student',
        token: r.token,
        mustChange: false,
        id: r.student.id,
        name: r.student.name,
        school: r.student.school,
        classCode: r.student.classCode,
        className: r.student.className,
      })
      toast('Password set — welcome!')
    } catch (err) {
      toast(err.message || 'Could not set the password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 85, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--scrim)', backdropFilter: 'blur(6px)' }}>
      <div style={{ ...t.GLASS, borderRadius: 24, padding: '30px 32px', width: 'min(420px, 92vw)', background: 'var(--panel-bg)' }}>
        {error ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Invite link problem</div>
            <div style={{ fontSize: 13.5, color: sub(0.6), marginTop: 8, lineHeight: 1.55 }}>{error}</div>
            <button style={{ ...t.cta, marginTop: 18 }} onClick={onClose}>Close</button>
          </>
        ) : !info ? (
          <div style={{ fontSize: 14, color: sub(0.6) }}>Checking your invite…</div>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Welcome{info.name ? `, ${info.name}` : ''} 👋</div>
            <div style={{ fontSize: 13, color: sub(0.55), marginTop: 6, lineHeight: 1.5 }}>
              Student ID <strong style={{ color: 'var(--ink)' }}>{info.id}</strong> · {info.school}.
              Choose the password you'll sign in with from now on.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              <input type="password" style={gateInput(t)} value={pw1} onChange={(e) => setPw1(e.target.value)} placeholder="New password (min 6 characters)" />
              <input type="password" style={gateInput(t)} value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repeat the password" onKeyDown={(e) => e.key === 'Enter' && submit()} />
              <button style={{ ...t.cta, justifyContent: 'center', opacity: busy ? 0.6 : 1 }} onClick={submit} disabled={busy}>
                {busy ? 'Saving…' : 'Set password & sign in'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Forced password change after signing in with a one-time password.
function ChangePasswordGate({ t, session, toast, onDone, onSignOut }) {
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (busy) return
    if (pw1.length < 6) { toast('Password must be at least 6 characters'); return }
    if (pw1 !== pw2) { toast("Passwords don't match"); return }
    setBusy(true)
    try {
      await api.changePassword(session.token, pw1)
      toast('Password updated')
      onDone()
    } catch (err) {
      toast(err.message || 'Could not change the password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 85, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--scrim)', backdropFilter: 'blur(6px)' }}>
      <div style={{ ...t.GLASS, borderRadius: 24, padding: '30px 32px', width: 'min(420px, 92vw)', background: 'var(--panel-bg)' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Set your own password</div>
        <div style={{ fontSize: 13, color: sub(0.55), marginTop: 6, lineHeight: 1.5 }}>
          You signed in with a one-time password. Choose your own to continue — you'll use it with Student ID <strong style={{ color: 'var(--ink)' }}>{session.id}</strong> from now on.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <input type="password" style={gateInput(t)} value={pw1} onChange={(e) => setPw1(e.target.value)} placeholder="New password (min 6 characters)" />
          <input type="password" style={gateInput(t)} value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repeat the password" onKeyDown={(e) => e.key === 'Enter' && submit()} />
          <button style={{ ...t.cta, justifyContent: 'center', opacity: busy ? 0.6 : 1 }} onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Save password'}
          </button>
          <button onClick={onSignOut} style={{ background: 'none', border: 'none', color: sub(0.5), fontSize: 12.5, cursor: 'pointer', padding: 0, fontFamily: "'Manrope',sans-serif" }}>
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  )
}

function TeacherLoginForm({ t, schools = ['BGA', 'BIST'], onLogin, toast }) {
  const [school, setSchool] = useState(schools[0] || 'BIST')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (busy) return
    if (!key.trim()) { toast('Enter your teacher access key'); return }
    setBusy(true)
    try {
      const r = await api.teacherLogin(school, key.trim())
      onLogin({ role: 'teacher', school: r.school, token: r.token })
      toast(`Signed in — ${r.school} teacher`)
    } catch (err) {
      toast(err.message || 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', padding: 4, gap: 3, borderRadius: 999, background: fill(0.05), border: `1px solid ${fill(0.1)}`, width: 'fit-content' }}>
        {(schools || []).map((s) => (
          <div key={s} style={pill(t, school === s)} onClick={() => setSchool(s)}>{s}</div>
        ))}
      </div>
      <input type="password" style={gateInput(t)} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Teacher access key" onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <button style={{ ...t.cta, justifyContent: 'center', opacity: busy ? 0.6 : 1 }} onClick={submit} disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </div>
  )
}

// Full-page teacher sign-in shown on the Teacher tab in cloud mode.
function TeacherLoginCard({ t, schools, onLogin, toast }) {
  return (
    <div style={{ ...t.GLASS, borderRadius: 24, padding: '40px 42px', maxWidth: 460 }}>
      <div style={{ fontSize: 19, fontWeight: 700 }}>Teacher sign-in</div>
      <div style={{ fontSize: 13, color: sub(0.55), marginTop: 6, marginBottom: 18, lineHeight: 1.55 }}>
        This school server keeps student attempts and published exams in one place.
        Sign in with your school's teacher access key to open the dashboard.
      </div>
      <TeacherLoginForm t={t} schools={schools} onLogin={onLogin} toast={toast} />
    </div>
  )
}

