import { sub, fill } from '../theme.js'

// The dashboard shows only real things: what to do next, what the teacher
// published, saved practice sets, and actual recent results — no demo numbers.
export default function Home({ t, reduceMotion, onGo, store }) {
  const announcements = store?.announcements || []
  const teacherExams = store?.customExams || []
  const hasTeacher = announcements.length > 0 || teacherExams.length > 0
  const practiceCount = (store?.practiceSets || []).length
  const examCount = (store?.exams || []).length
  const recent = (store?.attempts || []).slice(0, 4)

  const quickCards = [
    {
      title: 'Sit an exam',
      desc: `${examCount} paper${examCount === 1 ? '' : 's'} available — AI-graded with instant feedback`,
      go: 'exams',
      icon: <><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M9 3.5h6V6H9z" /><path d="m8.5 13 2 2 4-4" /></>,
    },
    {
      title: 'Your practice sets',
      desc: practiceCount
        ? `${practiceCount} saved set${practiceCount === 1 ? '' : 's'} ready to re-sit`
        : 'Generate one from any exam result — it saves here',
      go: 'exams',
      icon: <path d="m12 3 2.2 5.2L20 9l-4 3.8L17 19l-5-2.8L7 19l1-6.2L4 9l5.8-.8z" />,
    },
    {
      title: 'Ask the AI tutor',
      desc: 'Explanations, hints and step-by-step working — any topic',
      go: 'tutor',
      icon: <><path d="M4 5.5h16v10H9.5L5 19.5z" /><path d="M8.5 10h7M8.5 13h4" /></>,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: reduceMotion ? 'none' : `qgfade .5s ${t.EASE} both` }}>
      {/* HERO */}
      <section style={{ ...t.GLASS, position: 'relative', overflow: 'hidden', borderRadius: 24, padding: '40px 44px', display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 560 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.45) }}>Ready when you are</div>
          <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '12px 0 0', fontSize: 'clamp(30px,4.2vw,46px)' }}>
            Ready to practice?
          </h1>
          <p style={{ margin: '14px 0 24px', fontSize: 15, lineHeight: 1.6, color: sub(0.62), maxWidth: 440 }}>
            Sit an AI-graded mock, get instant feedback that accepts every correct form of your answer, and close the gaps before your next assessment.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button style={t.cta} onClick={() => onGo('exams')}>
              Start a mock exam
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
            </button>
            <button style={t.ghostBtn} onClick={() => onGo('tutor')}>Ask the AI tutor</button>
          </div>
        </div>
        <div style={{ position: 'absolute', right: -30, top: '50%', transform: 'translateY(-50%)', width: 320, height: 320, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 999, border: `1px solid ${fill(0.06)}` }} />
          <div style={{ position: 'absolute', inset: 44, borderRadius: 999, border: `1px solid ${fill(0.05)}` }} />
          <div style={{ position: 'absolute', left: 70, top: 60, width: 190, height: 190, borderRadius: 999, background: `radial-gradient(closest-side, ${t.hexA(t.accent, 0.35)}, ${t.hexA(t.accent2, 0.12)} 60%, transparent 75%)`, filter: 'blur(2px)' }} />
        </div>
      </section>

      {/* FROM YOUR TEACHER */}
      {hasTeacher && (
        <section style={{ ...t.GLASS, borderRadius: 24, padding: '22px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>From your teacher</span>
            <span style={{ fontSize: 12, color: sub(0.5), cursor: 'pointer' }} onClick={() => onGo('exams')}>Go to exams ›</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: announcements.length && teacherExams.length ? '1fr 1fr' : '1fr', gap: 16 }}>
            {announcements.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {announcements.slice(0, 3).map((a) => (
                  <div key={a.id} style={{ padding: '12px 14px', borderRadius: 14, background: fill(0.03), border: `1px solid ${fill(0.08)}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: t.accent }} />
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
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: fill(0.03), border: `1px solid ${fill(0.08)}` }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: t.hexA(t.accent, 0.14), border: `1px solid ${t.hexA(t.accent, 0.32)}`, color: t.brand === 'BIST' ? '#8A6A00' : t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="m8.5 13 2 2 4-4" /></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                      <div style={{ fontSize: 11.5, color: sub(0.5) }}>{e.subject} · {e.durationMin} min{e.due && e.due !== 'Anytime' ? ` · Due ${e.due}` : ''}</div>
                    </div>
                    <button style={{ ...t.ghostBtn, padding: '8px 14px' }} onClick={() => onGo('exams')}>Open</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* QUICK ACTIONS */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {quickCards.map((c) => (
          <div
            key={c.title}
            onClick={() => onGo(c.go)}
            style={{ ...t.GLASS, borderRadius: 20, padding: '22px 24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 12, background: t.hexA(t.accent, 0.14), border: `1px solid ${t.hexA(t.accent, 0.3)}`, color: t.brand === 'BIST' ? '#8A6A00' : t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{c.icon}</svg>
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 700 }}>{c.title}</div>
            <div style={{ fontSize: 13, color: sub(0.55), lineHeight: 1.5 }}>{c.desc}</div>
          </div>
        ))}
      </section>

      {/* RECENT RESULTS — only real, recorded attempts */}
      {recent.length > 0 && (
        <section style={{ ...t.GLASS, borderRadius: 24, padding: '22px 24px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Recent results</div>
          {recent.map((a) => {
            const pct = a.totalMarks ? Math.round((a.earnedMarks / a.totalMarks) * 100) : 0
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 4px', borderBottom: `1px solid ${fill(0.05)}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.examTitle}</div>
                  <div style={{ fontSize: 11.5, color: sub(0.5) }}>
                    {a.student}{a.className ? ` · ${a.className}` : ''}{a.ts ? ` · ${new Date(a.ts).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <div style={{ width: 130, height: 7, borderRadius: 999, background: fill(0.07), overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: pct < 50 ? t.CORAL : `linear-gradient(90deg,${t.accent},${t.accent2})` }} />
                </div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14, width: 70, textAlign: 'right', flexShrink: 0 }}>
                  {a.earnedMarks}/{a.totalMarks}
                </div>
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
