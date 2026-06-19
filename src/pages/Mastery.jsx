import { sub, fill } from '../theme.js'
import { useCountUp } from '../lib/useCountUp.js'

const RINGS = [
  { t: 'Algebra', v: 88 }, { t: 'Geometry', v: 81 }, { t: 'Trigonometry', v: 54 }, { t: 'Statistics', v: 73 },
  { t: 'Calculus', v: 62 }, { t: 'Fractions', v: 90 }, { t: 'Percentages', v: 84 }, { t: 'Equations', v: 77 },
]
const STRENGTHS = ['Algebraic manipulation', 'Probability', 'Percentage change', 'Linear equations']
const FOCUS = ['Trigonometric identities', 'Calculus rules', 'Circle theorems']

export default function Mastery({ t, reduceMotion, onGo }) {
  const kp = useCountUp(1, reduceMotion, 1100)
  const mC = 2 * Math.PI * 26

  // deterministic activity heatmap (18 weeks × 7 days)
  const cells = Array.from({ length: 7 * 18 }).map((_, i) => {
    const v = (Math.sin(i * 1.7) * 0.5 + 0.5) * (((i * 53) % 7) / 7)
    return Math.max(0, Math.min(0.85, v))
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: reduceMotion ? 'none' : `qgfade .4s ${t.EASE} both` }}>
      <section style={{ ...t.GLASS, borderRadius: 24, padding: '26px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Knowledge map</div>
          <div style={{ fontSize: 12, color: sub(0.45) }}>All subjects · This term</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18 }}>
          {RINGS.map((m) => {
            const stroke = m.v < 60 ? t.CORAL : t.accent
            return (
              <div key={m.t} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 11, padding: 16, borderRadius: 18, background: fill(0.03), border: `1px solid ${fill(0.07)}` }}>
                <div style={{ position: 'relative', width: 74, height: 74 }}>
                  <svg width="74" height="74" viewBox="0 0 74 74" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="37" cy="37" r="26" fill="none" stroke={fill(0.08)} strokeWidth="6" />
                    <circle cx="37" cy="37" r="26" fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" strokeDasharray={mC} strokeDashoffset={mC * (1 - (m.v / 100) * kp)} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 18 }}>{Math.round(m.v * kp)}</div>
                </div>
                <div style={{ fontSize: 12.5, color: sub(0.7) }}>{m.t}</div>
              </div>
            )
          })}
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ ...t.GLASS, borderRadius: 24, padding: '24px 26px' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: t.OK, marginBottom: 15 }}>Strengths</div>
          {STRENGTHS.map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 14, marginBottom: 12 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: t.OK, boxShadow: `0 0 7px ${t.OK}` }} />{s}
            </div>
          ))}
        </div>
        <div style={{ ...t.GLASS, borderRadius: 24, padding: '24px 26px' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: t.CORAL, marginBottom: 15 }}>Focus areas</div>
          {FOCUS.map((w) => (
            <div key={w} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 14, marginBottom: 12 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: t.CORAL, boxShadow: `0 0 7px ${t.CORAL}` }} />{w}
            </div>
          ))}
          <button style={{ ...t.ghostBtn, marginTop: 6 }} onClick={() => onGo('exams')}>Practise weak topics →</button>
        </div>
      </section>

      <section style={{ ...t.GLASS, borderRadius: 24, padding: '24px 26px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Activity</div>
          <div style={{ fontSize: 12, color: sub(0.45) }}>Last 18 weeks</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(18,1fr)', gap: 5 }}>
          {cells.map((a, i) => (
            <div key={i} style={{ width: '100%', aspectRatio: '1', borderRadius: 5, background: a < 0.08 ? fill(0.04) : t.hexA(t.accent, 0.12 + a * 0.7), border: `1px solid ${fill(0.04)}` }} />
          ))}
        </div>
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${fill(0.06)}`, display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 22 }}>Level 14</div>
          <div style={{ flex: 1, height: 9, borderRadius: 999, background: fill(0.08), overflow: 'hidden' }}><div style={{ width: `${68 * kp}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg,${t.accent},${t.accent2})`, boxShadow: `0 0 14px ${t.hexA(t.accent, 0.5)}` }} /></div>
          <div style={{ fontSize: 12.5, color: sub(0.55) }}>680 / 1000 XP to Level 15</div>
        </div>
      </section>
    </div>
  )
}
