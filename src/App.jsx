import { useCallback, useEffect, useState } from 'react'
import { getTheme, pill, navStyle, sub, fill } from './theme.js'
import { setClientApiKey } from './lib/anthropic.js'
import { useReducedMotion } from './lib/useReducedMotion.js'
import ExamsView from './exam/ExamsView.jsx'
import Home from './pages/Home.jsx'
import Tutor from './pages/Tutor.jsx'
import Mastery from './pages/Mastery.jsx'
import Library from './pages/Library.jsx'
import Teacher from './pages/Teacher.jsx'
import ConnectAI from './components/ConnectAI.jsx'
import BrandLogo from './components/BrandLogo.jsx'
import { useContentStore } from './lib/useContentStore.js'

const NAV = [
  ['home', 'Home', () => <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.4V20h14V9.4" /></>],
  ['practice', 'Practice', () => <path d="m12 3 2.2 5.2L20 9l-4 3.8L17 19l-5-2.8L7 19l1-6.2L4 9l5.8-.8z" />],
  ['exams', 'Exams', () => <><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M9 3.5h6V6H9z" /><path d="m8.5 13 2 2 4-4" /></>],
  ['mastery', 'Mastery', () => <><circle cx="12" cy="12" r="8.2" /><circle cx="12" cy="12" r="3.2" /></>],
  ['tutor', 'AI Tutor', () => <><path d="M4 5.5h16v10H9.5L5 19.5z" /><path d="M8.5 10h7M8.5 13h4" /></>],
  ['library', 'Library', () => <><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M9 3.5v17" /></>],
  ['teacher', 'Teacher', () => <><path d="M12 4 2 9l10 5 10-5z" /><path d="M6 11v4c0 1 2.7 3 6 3s6-2 6-3v-4" /></>],
]

export default function App() {
  const [brand, setBrand] = useState('BIST')
  const [mode, setMode] = useState('dark')
  const [tab, setTab] = useState('home')
  const [toasts, setToasts] = useState([])
  const [apiKey, setApiKey] = useState('')
  const [connectOpen, setConnectOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const store = useContentStore()
  const t = getTheme(brand)

  // flip the whole neutral palette between dark/light
  useEffect(() => {
    document.documentElement.dataset.mode = mode
  }, [mode])

  // register the in-browser API key for direct calls (used on static hosting)
  useEffect(() => {
    setClientApiKey(apiKey)
  }, [apiKey])

  const toast = useCallback((msg) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((ts) => [...ts, { id, msg }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3400)
  }, [])

  const aiOn = !!apiKey
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
            width: 72,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '16px 0',
            gap: 18,
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
          <div style={t.brandMark} onClick={() => setBrand((b) => (b === 'BIST' ? 'BGA' : 'BIST'))} title="Switch school">
            <BrandLogo key={brand} brand={brand} variant="mark" height={30} fallback={brand} />
          </div>
          <div style={{ width: 26, height: 1, background: 'var(--glass-border)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            {NAV.map(([key, label, icon]) => {
              const on = tab === key
              return (
                <div key={key} style={navStyle(t, on)} onClick={() => setTab(key)} title={label}>
                  {on && (
                    <div style={{ position: 'absolute', left: -9, top: 13, bottom: 13, width: 3, borderRadius: 3, background: t.accent, boxShadow: `0 0 10px ${t.accent}` }} />
                  )}
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    {icon()}
                  </svg>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 38, height: 38, borderRadius: 13, background: 'linear-gradient(135deg,#3a3f47,#23272d)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13, color: '#F4F6F8' }}>
              NM
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* TOPBAR */}
          <header style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <BrandLogo key={`wm-${brand}`} brand={brand} variant="wordmark" height={46} fallback={null} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>
                Welcome back, Nino 👋
              </div>
              <div style={{ fontSize: 12.5, color: sub(0.45), marginTop: 3, letterSpacing: '0.02em' }}>
                {brand} · Sixth Form · British curriculum
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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

              {/* Dark / light toggle */}
              <button
                onClick={() => setMode((m) => (m === 'dark' ? 'light' : 'dark'))}
                title={mode === 'dark' ? 'Switch to light' : 'Switch to dark'}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: sub(0.7),
                  background: fill(0.05),
                  border: `1px solid ${fill(0.12)}`,
                }}
              >
                {mode === 'dark' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4.2" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z" />
                  </svg>
                )}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 999, background: fill(0.05), border: `1px solid ${fill(0.1)}` }}>
                <span style={{ fontSize: 14 }}>🔥</span>
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14 }}>12</span>
                <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: sub(0.45) }}>day streak</span>
                <span style={{ width: 1, height: 14, background: fill(0.12) }} />
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 13, color: t.accent }}>2,480 XP</span>
              </div>
              <div style={{ display: 'flex', padding: 4, gap: 3, borderRadius: 999, background: fill(0.05), border: `1px solid ${fill(0.1)}` }}>
                <div style={pill(t, brand === 'BGA')} onClick={() => setBrand('BGA')}>BGA</div>
                <div style={pill(t, brand === 'BIST')} onClick={() => setBrand('BIST')}>BIST</div>
              </div>
            </div>
          </header>

          {/* CONTENT */}
          {tab === 'home' && <Home t={t} reduceMotion={reduceMotion} onGo={go} toast={toast} store={store} />}
          {tab === 'exams' && <ExamsView t={t} store={store} toast={toast} reduceMotion={reduceMotion} aiOn={aiOn} onConnect={() => setConnectOpen(true)} onGo={go} />}
          {tab === 'tutor' && <Tutor t={t} reduceMotion={reduceMotion} aiOn={aiOn} onConnect={() => setConnectOpen(true)} toast={toast} />}
          {tab === 'mastery' && <Mastery t={t} reduceMotion={reduceMotion} onGo={go} />}
          {tab === 'library' && <Library t={t} reduceMotion={reduceMotion} onGo={go} toast={toast} />}
          {tab === 'teacher' && <Teacher t={t} store={store} toast={toast} reduceMotion={reduceMotion} onGo={go} aiOn={aiOn} onConnect={() => setConnectOpen(true)} />}
          {tab === 'practice' && <PracticeStub t={t} reduceMotion={reduceMotion} onGo={go} />}
        </main>
      </div>

      {connectOpen && (
        <ConnectAI t={t} apiKey={apiKey} onSave={(k) => { setApiKey(k); toast(k ? 'AI connected' : 'AI disconnected'); }} onClose={() => setConnectOpen(false)} />
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

// Practice tab kept as a tasteful stub that routes into the live exam.
function PracticeStub({ t, reduceMotion, onGo }) {
  return (
    <div style={{ ...t.GLASS, borderRadius: 24, padding: 54, textAlign: 'center', animation: reduceMotion ? 'none' : `qgfade .4s ${t.EASE} both` }}>
      <div style={{ width: 64, height: 64, margin: '0 auto 18px', borderRadius: 18, background: `linear-gradient(135deg,${t.accent},${t.accent2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0B0D10' }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 2.2 5.2L20 9l-4 3.8L17 19l-5-2.8L7 19l1-6.2L4 9l5.8-.8z" /></svg>
      </div>
      <div style={{ fontSize: 19, fontWeight: 700 }}>Practice generator</div>
      <div style={{ fontSize: 14, color: t.sub(0.55), marginTop: 8, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
        Build fresh exercise sets by topic and difficulty. For now, jump into a full AI-graded mock exam.
      </div>
      <button style={{ ...t.cta, marginTop: 24 }} onClick={() => onGo('exams')}>Open the exam simulator →</button>
    </div>
  )
}
