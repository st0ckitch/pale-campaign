import { useState } from 'react'
import { sub, fill } from '../theme.js'
import { resolveQuestions, examMeta, practiceMeta } from '../lib/useContentStore.js'
import ExamModule from './ExamModule.jsx'

// Lists every available exam (the built-in mock + anything a teacher added) and
// launches the chosen one through the shared, data-driven ExamModule.
export default function ExamsView({ t, store, aiOn, onConnect, toast, reduceMotion, onGo }) {
  const [activeId, setActiveId] = useState(null)
  const [practice, setPractice] = useState(null) // AI practice set being sat: { id, questions, meta }
  const active = store.exams.find((e) => e.id === activeId)

  const backBtn = (onClick, label) => (
    <button
      onClick={onClick}
      style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 15px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope',sans-serif", background: fill(0.05), border: `1px solid ${fill(0.12)}`, color: 'var(--ink)' }}
    >
      {label}
    </button>
  )

  // A freshly generated set is saved to the store first, so it survives a
  // reload and can be re-sat from the "Your practice sets" list below.
  const launchPractice = (qs, m) => {
    const id = store.addPracticeSet({
      title: m.title,
      subject: m.subject,
      description: m.description || '',
      durationMin: Math.max(1, Math.round((m.durationSeconds || 600) / 60)),
      passMark: m.passMark ?? 50,
      questions: qs,
    })
    setPractice({ id, questions: qs, meta: m })
  }

  const openPractice = (p) => setPractice({ id: p.id, questions: p.questions || [], meta: practiceMeta(p) })

  // A generated practice set takes precedence over the exam it came from.
  if (practice) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {backBtn(() => { setPractice(null); setActiveId(null) }, '‹ Back to exams')}
        <ExamModule
          key={practice.id}
          theme={t}
          toast={toast}
          aiOn={aiOn}
          onConnect={onConnect}
          questions={practice.questions}
          meta={practice.meta}
          examId={practice.id}
          onGeneratePractice={launchPractice}
          onGraded={store.saveAttempt}
        />
      </div>
    )
  }

  if (active) {
    const questions = resolveQuestions(active).map((q) => ({ ...q, subject: q.subject || active.subject }))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {backBtn(() => setActiveId(null), '‹ All exams')}
        <ExamModule
          key={active.id}
          theme={t}
          toast={toast}
          aiOn={aiOn}
          onConnect={onConnect}
          questions={questions}
          meta={examMeta(active)}
          examId={active.id}
          onGeneratePractice={launchPractice}
          onGraded={store.saveAttempt}
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
          const qs = resolveQuestions(e)
          const qn = qs.length
          const marks = qs.reduce((s, q) => s + (Number(q.marks) || 1), 0)
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
                <span>{marks} mark{marks === 1 ? '' : 's'}</span>
                <span>·</span>
                <span>{e.durationMin} min</span>
                <span>·</span>
                <span>pass {e.passMark ?? 50}%</span>
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

      {store.practiceSets.length > 0 && (
        <>
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Your practice sets</div>
            <div style={{ fontSize: 12.5, color: sub(0.55), marginTop: 3 }}>AI-generated sets you've created — saved so you can sit them again.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {store.practiceSets.map((p) => {
              const qn = (p.questions || []).length
              const marks = (p.questions || []).reduce((s, q) => s + (Number(q.marks) || 1), 0)
              return (
                <div key={p.id} style={{ ...t.GLASS, borderRadius: 20, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 11px', borderRadius: 999, background: t.hexA(t.accent2 || t.accent, 0.14), border: `1px solid ${t.hexA(t.accent2 || t.accent, 0.32)}`, color: t.accent }}>
                      AI practice
                    </span>
                    <span style={{ fontSize: 12, color: sub(0.5) }}>{p.subject}</span>
                  </div>
                  <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.3 }}>{p.title}</div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 12.5, color: sub(0.6) }}>
                    <span>{qn} question{qn === 1 ? '' : 's'}</span>
                    <span>·</span>
                    <span>{marks} mark{marks === 1 ? '' : 's'}</span>
                    <span>·</span>
                    <span>{p.durationMin} min</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                    <button
                      disabled={qn === 0}
                      style={{ ...t.cta, flex: 1, justifyContent: 'center', opacity: qn === 0 ? 0.5 : 1 }}
                      onClick={() => qn > 0 && openPractice(p)}
                    >
                      Practise →
                    </button>
                    <button
                      onClick={() => { store.deletePracticeSet(p.id); toast('Practice set removed') }}
                      style={{ ...t.ghostBtn, color: t.CORAL, borderColor: t.hexA(t.CORAL, 0.4) }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
