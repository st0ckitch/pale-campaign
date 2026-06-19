import { useState } from 'react'
import { sub, fill } from '../theme.js'
import { QUESTION_BANK } from '../lib/useContentStore.js'

const rid = (p) => p + Math.random().toString(36).slice(2, 9)
const SUBJECT_SUGGESTIONS = [
  'Mathematics', 'Biology', 'Chemistry', 'Physics', 'Combined Science',
  'English Language', 'English Literature', 'History', 'Geography',
  'Computer Science', 'Economics', 'French', 'Spanish',
]

export default function Teacher({ t, store, toast, reduceMotion, onGo }) {
  // exam draft
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('Mathematics')
  const [durationMin, setDurationMin] = useState(20)
  const [due, setDue] = useState('')
  const [selected, setSelected] = useState({})
  const [customQs, setCustomQs] = useState([])

  // question authoring
  const [qType, setQType] = useState('text') // 'mcq' | 'text'
  const [topic, setTopic] = useState('')
  const [prompt, setPrompt] = useState('')
  // mcq
  const [opts, setOpts] = useState(['', '', '', ''])
  const [correct, setCorrect] = useState(0)
  // written
  const [model, setModel] = useState('')
  const [accepted, setAccepted] = useState('')
  const [scheme, setScheme] = useState('')

  // announcement
  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')

  const isMaths = /math/i.test(subject)
  const bankCount = isMaths ? Object.values(selected).filter(Boolean).length : 0
  const selCount = bankCount + customQs.length

  const labelStyle = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.4), marginBottom: 8, display: 'block' }
  const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 12, background: 'var(--input-bg)', border: `1px solid ${fill(0.12)}`, color: 'var(--ink)', fontSize: 14, fontFamily: "'Manrope',sans-serif", outline: 'none' }

  function resetQForm() {
    setPrompt(''); setTopic(''); setOpts(['', '', '', '']); setCorrect(0); setModel(''); setAccepted(''); setScheme('')
  }

  function addQuestion() {
    if (!prompt.trim()) { toast('Add the question prompt first'); return }
    if (qType === 'mcq') {
      const o = opts.map((x) => x.trim())
      if (o.some((x) => !x)) { toast('Fill all four options'); return }
      setCustomQs((qs) => [...qs, {
        id: rid('tc'), type: 'mcq', subject, topic: topic.trim() || subject,
        prompt: prompt.trim(), latex: '', options: o, correctAnswer: o[correct],
        acceptedAnswers: [], workingNotes: 'Set by your teacher.',
      }])
    } else {
      if (!model.trim()) { toast('Add a model answer the AI can grade against'); return }
      const alts = accepted.split(',').map((x) => x.trim()).filter(Boolean)
      setCustomQs((qs) => [...qs, {
        id: rid('tc'), type: 'text', subject, topic: topic.trim() || subject,
        prompt: prompt.trim(), latex: '', correctAnswer: model.trim(),
        acceptedAnswers: alts, markScheme: scheme.trim(),
        workingNotes: scheme.trim() || `Model answer: ${model.trim()}`,
      }])
    }
    resetQForm()
    toast('Question added to this exam')
  }

  function createExam() {
    if (!title.trim()) { toast('Give the exam a title'); return }
    const questionIds = isMaths ? QUESTION_BANK.filter((q) => selected[q.id]).map((q) => q.id) : []
    if (questionIds.length + customQs.length === 0) { toast('Add at least one question'); return }
    store.addExam({ title: title.trim(), subject: subject.trim() || 'General', durationMin: Number(durationMin) || 20, due: due.trim() || 'Anytime', questionIds, customQuestions: customQs })
    setTitle(''); setDue(''); setSelected({}); setCustomQs([]); setDurationMin(20)
    toast('Exam published — students can see it now')
  }

  function postAnnouncement() {
    if (!annTitle.trim()) { toast('Announcement needs a title'); return }
    store.addAnnouncement({ title: annTitle.trim(), body: annBody.trim() })
    setAnnTitle(''); setAnnBody('')
    toast('Posted to the student home')
  }

  const typeBtn = (val, label) => (
    <button onClick={() => setQType(val)} style={{ padding: '8px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope',sans-serif", border: `1px solid ${qType === val ? t.hexA(t.accent, 0.5) : fill(0.12)}`, background: qType === val ? t.hexA(t.accent, 0.16) : fill(0.04), color: qType === val ? 'var(--ink)' : sub(0.62) }}>{label}</button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: reduceMotion ? 'none' : `qgfade .4s ${t.EASE} both` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: `linear-gradient(135deg,${t.accent},${t.accent2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0B0D10' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4 2 9l10 5 10-5z" /><path d="M6 11v4c0 1 2.7 3 6 3s6-2 6-3v-4" /></svg>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Teacher dashboard</div>
          <div style={{ fontSize: 12.5, color: sub(0.5) }}>Publish exams in any subject — written answers are graded by AI against your model answer.</div>
        </div>
      </div>

      {/* CREATE EXAM */}
      <section style={{ ...t.GLASS, borderRadius: 24, padding: '26px 28px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 18 }}>Create an exam</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr', gap: 14 }}>
          <div><label style={labelStyle}>Title</label><input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Year 11 Biology — Cells" /></div>
          <div>
            <label style={labelStyle}>Subject (type any)</label>
            <input list="subjectlist" style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Biology" />
            <datalist id="subjectlist">{SUBJECT_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div><label style={labelStyle}>Minutes</label><input type="number" min="1" style={inputStyle} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} /></div>
        </div>

        {/* maths bank only when relevant */}
        {isMaths && (
          <div style={{ marginTop: 18 }}>
            <label style={labelStyle}>Include from the maths question bank ({bankCount} selected)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {QUESTION_BANK.map((q) => {
                const on = !!selected[q.id]
                return (
                  <button key={q.id} onClick={() => setSelected((s) => ({ ...s, [q.id]: !s[q.id] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '10px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: "'Manrope',sans-serif", fontSize: 13, background: on ? t.hexA(t.accent, 0.12) : fill(0.04), border: `1px solid ${on ? t.hexA(t.accent, 0.45) : fill(0.1)}`, color: 'var(--ink)' }}>
                    <span style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${on ? t.accent : fill(0.3)}`, background: on ? t.accent : 'transparent', color: '#0B0D10' }}>
                      {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: sub(0.5), marginRight: 6 }}>{q.topic}</span>{q.prompt}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* author questions */}
        <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: fill(0.03), border: `1px solid ${fill(0.08)}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Add a question</label>
            <div style={{ display: 'flex', gap: 6, marginLeft: 6 }}>{typeBtn('text', '✍️ Written (AI-graded)')}{typeBtn('mcq', '◉ Multiple choice')}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 10 }}>
            <input style={inputStyle} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Question prompt" />
            <input style={inputStyle} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic" />
          </div>

          {qType === 'mcq' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              {opts.map((o, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setCorrect(i)} title="Mark correct" style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 999, cursor: 'pointer', border: `1px solid ${correct === i ? t.OK : fill(0.3)}`, background: correct === i ? t.OK : 'transparent', color: '#0B0D10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{correct === i ? '✓' : ''}</button>
                  <input style={inputStyle} value={o} onChange={(e) => setOpts((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${String.fromCharCode(65 + i)}${correct === i ? ' (correct)' : ''}`} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={labelStyle}>Model answer <span style={{ textTransform: 'none', letterSpacing: 0, color: sub(0.4) }}>— the AI grades student answers against this</span></label>
                <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. Photosynthesis converts light energy into chemical energy (glucose) in chloroplasts…" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input style={inputStyle} value={accepted} onChange={(e) => setAccepted(e.target.value)} placeholder="Accepted exact answers (comma-sep, optional)" />
                <input style={inputStyle} value={scheme} onChange={(e) => setScheme(e.target.value)} placeholder="Mark-scheme note for the AI (optional)" />
              </div>
            </div>
          )}

          <button style={{ ...t.ghostBtn, marginTop: 12 }} onClick={addQuestion}>+ Add this question</button>

          {customQs.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {customQs.map((q, i) => (
                <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: sub(0.75) }}>
                  <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 999, background: fill(0.06), border: `1px solid ${fill(0.1)}`, color: sub(0.6) }}>{q.type === 'mcq' ? 'MCQ' : 'Written'}</span>
                  {i + 1}. {q.prompt}
                  <button onClick={() => setCustomQs((qs) => qs.filter((x) => x.id !== q.id))} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: t.CORAL, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 18, flexWrap: 'wrap' }}>
          <input style={{ ...inputStyle, width: 200 }} value={due} onChange={(e) => setDue(e.target.value)} placeholder="Due (e.g. Fri 12 Jun)" />
          <button style={t.cta} onClick={createExam}>Publish exam</button>
          <span style={{ fontSize: 12.5, color: sub(0.5) }}>{selCount} question{selCount === 1 ? '' : 's'} · {subject || 'General'}</span>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* ANNOUNCEMENT */}
        <div style={{ ...t.GLASS, borderRadius: 24, padding: '24px 26px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Post an announcement</div>
          <label style={labelStyle}>Title</label>
          <input style={inputStyle} value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="e.g. Mock exam next Monday" />
          <label style={{ ...labelStyle, marginTop: 14 }}>Message</label>
          <textarea style={{ ...inputStyle, minHeight: 84, resize: 'vertical' }} value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder="Details for your students…" />
          <button style={{ ...t.cta, marginTop: 16 }} onClick={postAnnouncement}>Post to students</button>
        </div>

        {/* PUBLISHED LISTS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ ...t.GLASS, borderRadius: 24, padding: '22px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Your exams</div>
              <button style={{ fontSize: 12, color: t.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }} onClick={() => onGo('exams')}>View as student →</button>
            </div>
            {store.customExams.length === 0 ? (
              <div style={{ fontSize: 13, color: sub(0.5) }}>No exams published yet. Create one above.</div>
            ) : (
              store.customExams.map((e) => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${fill(0.06)}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                    <div style={{ fontSize: 11.5, color: sub(0.5) }}>{e.subject} · {(e.questionIds?.length || 0) + (e.customQuestions?.length || 0)} Q · {e.durationMin} min</div>
                  </div>
                  <button onClick={() => { store.deleteExam(e.id); toast('Exam removed') }} style={{ background: 'none', border: 'none', color: t.CORAL, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Delete</button>
                </div>
              ))
            )}
          </div>
          <div style={{ ...t.GLASS, borderRadius: 24, padding: '22px 24px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Your announcements</div>
            {store.announcements.length === 0 ? (
              <div style={{ fontSize: 13, color: sub(0.5) }}>Nothing posted yet.</div>
            ) : (
              store.announcements.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: `1px solid ${fill(0.06)}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.title}</div>
                    {a.body && <div style={{ fontSize: 12, color: sub(0.55), marginTop: 2 }}>{a.body}</div>}
                  </div>
                  <button onClick={() => { store.deleteAnnouncement(a.id); toast('Announcement removed') }} style={{ background: 'none', border: 'none', color: t.CORAL, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Delete</button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
