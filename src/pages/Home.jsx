import { useMemo } from 'react'
import { sub, fill } from '../theme.js'
import { useCountUp } from '../lib/useCountUp.js'

// Smooth Catmull-Rom-ish path for a sparkline / line chart.
function linePath(arr, w, h, pad = 0) {
  const mn = Math.min(...arr)
  const mx = Math.max(...arr)
  const sp = mx - mn || 1
  const X = (i) => (i * (w - pad * 2)) / (arr.length - 1) + pad
  const Y = (v) => h - pad - ((v - mn) / sp) * (h - pad * 2)
  const pts = arr.map((v, i) => ({ x: X(i), y: Y(v) }))
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

const KPIS = [
  { label: 'Exercises solved', value: 1240, fmt: (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : '' + Math.round(n)), spark: [3, 5, 4, 6, 5, 7, 8], spot: false },
  { label: 'Mastery', value: 76, fmt: (n) => Math.round(n) + '%', spark: [60, 64, 66, 70, 72, 74, 76], spot: true },
  { label: 'Accuracy', value: 94, fmt: (n) => Math.round(n) + '%', spark: [88, 90, 89, 92, 93, 94, 94], spot: false },
  { label: 'Day streak', value: 12, fmt: (n) => '' + Math.round(n), spark: [6, 7, 9, 8, 10, 11, 12], spot: false },
  { label: 'Exams passed', value: 8, fmt: (n) => '' + Math.round(n), spark: [3, 4, 5, 5, 6, 7, 8], spot: false },
]

const ROWS = [
  { title: 'Mathematics', tag: 'Higher', score: 82 },
  { title: 'English Language', tag: 'IGCSE', score: 67 },
  { title: 'Combined Science', tag: 'Higher', score: 74 },
  { title: 'Global Perspectives', tag: 'A-Level', score: 58 },
]

export default function Home({ t, reduceMotion, onGo, store }) {
  const announcements = store?.announcements || []
  const teacherExams = store?.customExams || []
  const hasTeacher = announcements.length > 0 || teacherExams.length > 0
  const kp = useCountUp(1, reduceMotion, 1300)
  const you = [26, 32, 29, 40, 46, 38, 50, 57, 49, 61, 67, 72]
  const cls = [22, 25, 29, 27, 33, 35, 37, 39, 41, 43, 45, 47]
  const youPath = useMemo(() => linePath(you, 540, 180, 8), [])
  const clsPath = useMemo(() => linePath(cls, 540, 180, 8), [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: reduceMotion ? 'none' : `qgfade .5s ${t.EASE} both` }}>
      {/* HERO */}
      <section style={{ ...t.GLASS, position: 'relative', overflow: 'hidden', borderRadius: 24, padding: '42px 44px', minHeight: 220, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 520 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.4) }}>Ready when you are</div>
          <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, margin: '14px 0 0', fontSize: 'clamp(34px,5vw,58px)' }}>Ready to<br />practice?</h1>
          <p style={{ margin: '16px 0 26px', fontSize: 15, lineHeight: 1.6, color: sub(0.62), maxWidth: 400 }}>
            Sit an AI-graded mock, get instant equivalence-aware feedback, and close the gaps before your next assessment.
          </p>
          <button style={t.cta} onClick={() => onGo('exams')}>
            Start a mock exam
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
          </button>
        </div>
        <div style={{ position: 'absolute', right: -40, top: '50%', transform: 'translateY(-50%)', width: 360, height: 360, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 999, border: `1px solid ${fill(0.06)}` }} />
          <div style={{ position: 'absolute', inset: 46, borderRadius: 999, border: `1px solid ${fill(0.05)}` }} />
          <div style={{ position: 'absolute', left: 80, top: 64, width: 210, height: 210, borderRadius: 999, background: `radial-gradient(closest-side, ${t.hexA(t.accent, 0.55)}, ${t.hexA(t.accent2, 0.18)} 60%, transparent 75%)`, filter: 'blur(2px)' }} />
        </div>
      </section>

      {/* FROM YOUR TEACHER (appears as soon as a teacher posts) */}
      {hasTeacher && (
        <section style={{ ...t.GLASS, borderRadius: 24, padding: '22px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>From your teacher</span>
            <span style={{ fontSize: 12, color: sub(0.45), cursor: 'pointer' }} onClick={() => onGo('exams')}>Go to exams ›</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: announcements.length && teacherExams.length ? '1fr 1fr' : '1fr', gap: 16 }}>
            {announcements.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {announcements.slice(0, 3).map((a) => (
                  <div key={a.id} style={{ padding: '12px 14px', borderRadius: 14, background: fill(0.04), border: `1px solid ${fill(0.08)}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: t.accent, boxShadow: `0 0 7px ${t.accent}` }} />
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{a.title}</span>
                    </div>
                    {a.body && <div style={{ fontSize: 12.5, color: sub(0.6), marginTop: 5, lineHeight: 1.5 }}>{a.body}</div>}
                  </div>
                ))}
              </div>
            )}
            {teacherExams.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {teacherExams.slice(0, 3).map((e) => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: fill(0.04), border: `1px solid ${fill(0.08)}` }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: t.hexA(t.accent, 0.14), border: `1px solid ${t.hexA(t.accent, 0.32)}`, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="m8.5 13 2 2 4-4" /></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                      <div style={{ fontSize: 11.5, color: sub(0.5) }}>{e.subject} · {e.durationMin} min · Due {e.due}</div>
                    </div>
                    <button style={{ ...t.ghostBtn, padding: '8px 14px' }} onClick={() => onGo('exams')}>Open</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* KPI STRIP */}
      <section style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {KPIS.map((k) => {
          const v = k.value * kp
          return (
            <div
              key={k.label}
              style={
                k.spot
                  ? { position: 'relative', overflow: 'hidden', flex: '1.25', minWidth: 190, padding: '20px 22px', borderRadius: 22, border: `1px solid ${t.hexA(t.accent, 0.55)}`, background: `linear-gradient(135deg,${t.accent},${t.accent2})`, color: '#0B0D10', boxShadow: `0 18px 50px ${t.hexA(t.accent, 0.36)}` }
                  : { position: 'relative', overflow: 'hidden', flex: 1, minWidth: 150, padding: '20px 22px', borderRadius: 22, ...t.GLASS }
              }
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, fontSize: 'clamp(28px,3.4vw,44px)', color: k.spot ? '#0B0D10' : 'var(--ink)' }}>{k.fmt(v)}</div>
                <svg width="62" height="26" viewBox="0 0 92 28" fill="none" style={{ opacity: 0.85 }}>
                  <path d={linePath(k.spark, 92, 28)} stroke={k.spot ? 'rgba(11,13,16,0.55)' : sub(0.45)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginTop: 10, color: k.spot ? 'rgba(11,13,16,0.62)' : sub(0.4) }}>{k.label}</div>
            </div>
          )
        })}
      </section>

      {/* CHART + NEXT UP */}
      <section style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 20, alignItems: 'stretch' }}>
        <div style={{ ...t.GLASS, position: 'relative', borderRadius: 24, padding: '24px 26px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Your progress 💡</span>
            <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: sub(0.55) }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 2, borderRadius: 2, background: t.accent }} />You</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 2, borderRadius: 2, background: sub(0.5) }} />Class avg</span>
            </div>
          </div>
          <svg width="100%" viewBox="0 0 540 190" preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
            {[34, 86, 138].map((y) => <line key={y} x1="0" y1={y} x2="540" y2={y} stroke={fill(0.06)} />)}
            <path d={clsPath} fill="none" stroke={sub(0.5)} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 700, strokeDashoffset: reduceMotion ? 0 : 700 * (1 - kp) }} />
            <path d={youPath} fill="none" stroke={t.accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 700, strokeDashoffset: reduceMotion ? 0 : 700 * (1 - kp) }} />
          </svg>
        </div>
        <div style={{ ...t.GLASS, position: 'relative', overflow: 'hidden', borderRadius: 24, padding: '24px 26px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.4) }}>Next up</div>
          <div style={{ fontSize: 19, fontWeight: 700, marginTop: 10, lineHeight: 1.25 }}>IGCSE Mathematics<br />Mock Exam</div>
          <div style={{ fontSize: 12.5, color: sub(0.55), marginTop: 6 }}>Mixed topics · 10 questions · 20 min</div>
          <div style={{ marginTop: 'auto', padding: 16, borderRadius: 18, background: fill(0.04), border: `1px solid ${fill(0.08)}` }}>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: sub(0.4), marginBottom: 8 }}>AI-graded</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 22, letterSpacing: '-0.02em', color: t.accent }}>Ready now</div>
          </div>
          <button style={{ ...t.cta, marginTop: 16, justifyContent: 'center', width: '100%' }} onClick={() => onGo('exams')}>Start exam →</button>
        </div>
      </section>

      {/* CONTINUE LIST */}
      <section style={{ ...t.GLASS, borderRadius: 24, padding: '24px 26px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Continue where you left off</span>
          <span style={{ fontSize: 12, color: sub(0.45), cursor: 'pointer' }} onClick={() => onGo('mastery')}>View all ›</span>
        </div>
        {ROWS.map((r) => {
          const C = 2 * Math.PI * 20
          return (
            <div key={r.title} style={{ display: 'grid', gridTemplateColumns: '60px 1.6fr 0.8fr 1fr', gap: 14, alignItems: 'center', padding: '14px 6px', borderBottom: `1px solid ${fill(0.05)}` }}>
              <div style={{ position: 'relative', width: 52, height: 52 }}>
                <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="26" cy="26" r="20" fill="none" stroke={fill(0.08)} strokeWidth="4" />
                  <circle cx="26" cy="26" r="20" fill="none" stroke={t.accent} strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - (r.score / 100) * kp)} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 13 }}>{r.score}</div>
              </div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{r.title}</div>
                <div style={{ display: 'inline-block', marginTop: 5, fontSize: 10.5, letterSpacing: '0.04em', padding: '3px 9px', borderRadius: 999, background: fill(0.06), border: `1px solid ${fill(0.1)}`, color: sub(0.6) }}>{r.tag}</div>
              </div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 16, color: sub(0.85) }}>{r.score}%</div>
              <svg width="120" height="26" viewBox="0 0 120 26" fill="none"><path d={linePath([4, 7, 5, 9, 6, 10, 7, 11, 8], 120, 26)} stroke={t.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" /></svg>
            </div>
          )
        })}
      </section>
    </div>
  )
}
