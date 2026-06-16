import { useCallback, useEffect, useState } from 'react'
import { getTheme, pill, navStyle } from './theme.js'
import { useReducedMotion } from './lib/useReducedMotion.js'
import ExamModule from './exam/ExamModule.jsx'

const NAV = [
  ['home', 'Home', (p) => <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.4V20h14V9.4" /></>],
  ['practice', 'Practice', () => <path d="m12 3 2.2 5.2L20 9l-4 3.8L17 19l-5-2.8L7 19l1-6.2L4 9l5.8-.8z" />],
  ['exams', 'Exams', () => <><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M9 3.5h6V6H9z" /><path d="m8.5 13 2 2 4-4" /></>],
  ['mastery', 'Mastery', () => <><circle cx="12" cy="12" r="8.2" /><circle cx="12" cy="12" r="3.2" /></>],
  ['tutor', 'AI Tutor', () => <><path d="M4 5.5h16v10H9.5L5 19.5z" /><path d="M8.5 10h7M8.5 13h4" /></>],
  ['library', 'Library', () => <><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M9 3.5v17" /></>],
]

export default function App() {
  const [brand, setBrand] = useState('BIST')
  const [tab, setTab] = useState('exams') // open on the Exams module (the deliverable)
  const [toasts, setToasts] = useState([])
  const reduceMotion = useReducedMotion()
  const t = getTheme(brand)

  const toast = useCallback((msg) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((ts) => [...ts, { id, msg }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3400)
  }, [])

  return (
    <div style={{ position: 'relative', minHeight: '100vh', width: '100%', overflowX: 'hidden', background: 'linear-gradient(180deg,#0B0D10 0%,#121519 100%)' }}>
      <div style={t.bloom} />
      {/* fine noise overlay */}
      <div
        style={{
          position: 'absolute',
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
            background: 'rgba(255,255,255,0.045)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.16)',
            position: 'sticky',
            top: 18,
            height: 'calc(100vh - 36px)',
          }}
        >
          <div style={t.brandMark} onClick={() => setBrand((b) => (b === 'BIST' ? 'BGA' : 'BIST'))} title="Switch school">
            {brand}
          </div>
          <div style={{ width: 26, height: 1, background: 'rgba(255,255,255,0.10)' }} />
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
            <div style={{ width: 38, height: 38, borderRadius: 13, background: 'linear-gradient(135deg,#3a3f47,#23272d)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13 }}>
              NM
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* TOPBAR */}
          <header style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>
                Welcome back, Nino 👋
              </div>
              <div style={{ fontSize: 12.5, color: 'rgba(244,246,248,0.4)', marginTop: 3, letterSpacing: '0.02em' }}>
                {brand} · Sixth Form · British curriculum
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
                <span style={{ fontSize: 14 }}>🔥</span>
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14 }}>12</span>
                <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(244,246,248,0.45)' }}>day streak</span>
                <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)' }} />
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 13, color: t.accent }}>2,480 XP</span>
              </div>
              <div style={{ display: 'flex', padding: 4, gap: 3, borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
                <div style={pill(t, brand === 'BGA')} onClick={() => setBrand('BGA')}>BGA</div>
                <div style={pill(t, brand === 'BIST')} onClick={() => setBrand('BIST')}>BIST</div>
              </div>
            </div>
          </header>

          {/* CONTENT */}
          {tab === 'exams' && <ExamModule theme={t} toast={toast} />}
          {tab !== 'exams' && <Placeholder t={t} tab={tab} onGoExams={() => setTab('exams')} reduceMotion={reduceMotion} />}
        </main>
      </div>

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
              background: 'rgba(18,21,25,0.9)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 16px 44px rgba(0,0,0,0.5)',
              fontSize: 13.5,
              fontWeight: 500,
              animation: 'qgfade .3s cubic-bezier(.22,1,.36,1) both',
            }}
          >
            <span style={{ width: 22, height: 22, borderRadius: 999, background: 'rgba(125,227,176,0.18)', border: '1px solid rgba(125,227,176,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7DE3B0', fontSize: 12 }}>✓</span>
            {to.msg}
          </div>
        ))}
      </div>
    </div>
  )
}

// Other tabs are out of scope for this module; we keep them on-brand and point
// the user to the live exam simulator.
function Placeholder({ t, tab, onGoExams, reduceMotion }) {
  const copy = {
    home: ['Your learning hub', 'Track streaks, mastery and upcoming assessments. The live module in this build is the AI-graded Math Exam Simulator.'],
    practice: ['Practice generator', 'Generate fresh exercise sets by topic and difficulty. Wired up next — for now, jump into a full mock exam.'],
    mastery: ['Knowledge map', 'A per-topic view of strengths and focus areas. Your exam results feed straight into this.'],
    tutor: ['AI Tutor', 'A full conversational tutor. Inside the exam, a question-scoped tutor is already live under "Ask AI".'],
    library: ['Your library', 'Saved notes, worked solutions and revision packs will collect here as you study.'],
  }
  const [title, body] = copy[tab] || copy.home
  return (
    <div style={{ ...t.GLASS, borderRadius: 24, padding: 54, textAlign: 'center', animation: reduceMotion ? 'none' : `qgfade .4s ${t.EASE} both` }}>
      <div style={{ width: 64, height: 64, margin: '0 auto 18px', borderRadius: 18, background: `linear-gradient(135deg,${t.accent},${t.accent2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0B0D10' }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="m8.5 13 2 2 4-4" />
        </svg>
      </div>
      <div style={{ fontSize: 19, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 14, color: 'rgba(244,246,248,0.55)', marginTop: 8, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
        {body}
      </div>
      <button style={{ ...t.cta, marginTop: 24 }} onClick={onGoExams}>
        Open the exam simulator →
      </button>
    </div>
  )
}
