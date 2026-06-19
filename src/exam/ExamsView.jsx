import { useState } from 'react'
import { sub, fill } from '../theme.js'
import { resolveQuestions, examMeta } from '../lib/useContentStore.js'
import ExamModule from './ExamModule.jsx'

// Lists every available exam (the built-in mock + anything a teacher added) and
// launches the chosen one through the shared, data-driven ExamModule.
export default function ExamsView({ t, store, aiOn, onConnect, toast, reduceMotion, onGo }) {
  const [activeId, setActiveId] = useState(null)
  const active = store.exams.find((e) => e.id === activeId)

  if (active) {
    const questions = resolveQuestions(active).map((q) => ({ ...q, subject: q.subject || active.subject }))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <button
          onClick={() => setActiveId(null)}
          style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 15px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope',sans-serif", background: fill(0.05), border: `1px solid ${fill(0.12)}`, color: 'var(--ink)' }}
        >
          ‹ All exams
        </button>
        <ExamModule
          key={active.id}
          theme={t}
          toast={toast}
          aiOn={aiOn}
          onConnect={onConnect}
          questions={questions}
          meta={examMeta(active)}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: reduceMotion ? 'none' : `qgfade .4s ${t.EASE} both` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Available exams</div>
          <div style={{ fontSize: 13, color: sub(0.55), marginTop: 4 }}>Pick a paper to sit. Teacher-set exams appear here automatically.</div>
        </div>
        <button style={t.ghostBtn} onClick={() => onGo('teacher')}>Teacher dashboard →</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {store.exams.map((e) => {
          const qn = resolveQuestions(e).length
          return (
            <div key={e.id} style={{ ...t.GLASS, borderRadius: 20, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 11px', borderRadius: 999, background: e.builtin ? fill(0.06) : t.hexA(t.accent, 0.14), border: `1px solid ${e.builtin ? fill(0.1) : t.hexA(t.accent, 0.32)}`, color: e.builtin ? sub(0.6) : t.accent }}>
                  {e.builtin ? 'Built-in' : 'Set by teacher'}
                </span>
                <span style={{ fontSize: 12, color: sub(0.5) }}>{e.subject}</span>
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>{e.title}</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12.5, color: sub(0.6) }}>
                <span>{qn} question{qn === 1 ? '' : 's'}</span>
                <span>·</span>
                <span>{e.durationMin} min</span>
                {e.due && e.due !== 'Anytime' && (<><span>·</span><span>Due {e.due}</span></>)}
              </div>
              <button
                disabled={qn === 0}
                style={{ ...t.cta, marginTop: 4, justifyContent: 'center', width: '100%', opacity: qn === 0 ? 0.5 : 1 }}
                onClick={() => qn > 0 && setActiveId(e.id)}
              >
                {qn === 0 ? 'No questions yet' : 'Start exam →'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
