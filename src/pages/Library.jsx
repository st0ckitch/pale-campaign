import { useState } from 'react'
import { sub, fill } from '../theme.js'

const FILTERS = ['All', 'Revision packs', 'Worked solutions', 'Notes']

const ITEMS = [
  { kind: 'Revision packs', tag: 'Algebra', title: 'Quadratics — factorising & the formula', meta: '12 cards · updated today', icon: 'cards' },
  { kind: 'Worked solutions', tag: 'Geometry', title: 'Circle theorems, fully worked', meta: '8 problems · from your mock', icon: 'check' },
  { kind: 'Notes', tag: 'Fractions', title: 'Adding & simplifying fractions', meta: '1 page · saved 2d ago', icon: 'note' },
  { kind: 'Revision packs', tag: 'Percentages', title: 'Percentage change & reverse %', meta: '9 cards · 80% recalled', icon: 'cards' },
  { kind: 'Worked solutions', tag: 'Equations', title: 'Simultaneous equations walkthrough', meta: '6 problems · AI-explained', icon: 'check' },
  { kind: 'Notes', tag: 'Trigonometry', title: 'SOH-CAH-TOA quick reference', meta: '1 page · saved 5d ago', icon: 'note' },
]

function Icon({ name }) {
  if (name === 'check') return <path d="m8.5 13 2 2 4-4M5 3.5h14v17H5z" />
  if (name === 'note') return <path d="M6 3.5h9l4 4V20.5H6zM15 3.5V8h4" />
  return <><rect x="4" y="6" width="13" height="14" rx="2" /><path d="M8 3.5h11v13" /></>
}

export default function Library({ t, reduceMotion, onGo, toast }) {
  const [filter, setFilter] = useState('All')
  const shown = filter === 'All' ? ITEMS : ITEMS.filter((i) => i.kind === filter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: reduceMotion ? 'none' : `qgfade .4s ${t.EASE} both` }}>
      <section style={{ ...t.GLASS, borderRadius: 24, padding: '26px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Your library</div>
            <div style={{ fontSize: 13, color: sub(0.55), marginTop: 4 }}>Saved revision packs, worked solutions and notes — collected as you study.</div>
          </div>
          <button style={t.ghostBtn} onClick={() => onGo('exams')}>+ Save from a mock exam</button>
        </div>
        <div style={{ display: 'flex', gap: 9, marginTop: 18, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => {
            const on = filter === f
            return (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 15px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope',sans-serif", border: `1px solid ${on ? t.hexA(t.accent, 0.5) : fill(0.12)}`, background: on ? t.hexA(t.accent, 0.16) : fill(0.04), color: on ? 'var(--ink)' : sub(0.62) }}>{f}</button>
            )
          })}
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {shown.map((it) => (
          <div key={it.title} style={{ ...t.GLASS, borderRadius: 20, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', transition: `transform .18s ${t.EASE}` }}
            onClick={() => toast(`Opening “${it.title}”…`)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: t.hexA(t.accent, 0.14), border: `1px solid ${t.hexA(t.accent, 0.32)}`, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><Icon name={it.icon} /></svg>
              </div>
              <span style={{ fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, background: fill(0.05), border: `1px solid ${fill(0.1)}`, color: sub(0.6) }}>{it.tag}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{it.title}</div>
            <div style={{ fontSize: 12, color: sub(0.5), marginTop: 'auto' }}>{it.meta}</div>
          </div>
        ))}
      </section>

      {shown.length === 0 && (
        <div style={{ ...t.GLASS, borderRadius: 24, padding: 54, textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>✨</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Nothing here yet</div>
          <div style={{ fontSize: 13.5, color: sub(0.5), marginTop: 6 }}>Save items from a mock exam to build this collection.</div>
        </div>
      )}
    </div>
  )
}
