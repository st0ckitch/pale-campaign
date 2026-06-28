import { useRef, useState } from 'react'
import { sub, fill } from '../theme.js'
import { QUESTION_BANK, resolveQuestions } from '../lib/useContentStore.js'
import { scanPaper } from '../lib/vision.js'
import QuestionEditor from './QuestionEditor.jsx'

const rid = (p) => p + Math.random().toString(36).slice(2, 9)
const SUBJECT_SUGGESTIONS = [
  'Mathematics', 'Biology', 'Chemistry', 'Physics', 'Combined Science',
  'English Language', 'English Literature', 'History', 'Geography',
  'Computer Science', 'Economics', 'French', 'Spanish',
]

function blankQuestion(type, subject) {
  const base = { id: rid('q'), type, subject, topic: '', prompt: '', latex: '', marks: 1, acceptedAnswers: [] }
  return type === 'mcq'
    ? { ...base, options: ['', '', '', ''], correctAnswer: '', workingNotes: 'Set by your teacher.' }
    : { ...base, correctAnswer: '', markScheme: '', workingNotes: 'Set by your teacher.' }
}

export default function Teacher({ t, store, toast, reduceMotion, onGo, aiOn, onConnect }) {
  const fileRef = useRef(null)
  const [scanning, setScanning] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('Mathematics')
  const [durationMin, setDurationMin] = useState(20)
  const [due, setDue] = useState('')
  const [description, setDescription] = useState('')
  const [passMark, setPassMark] = useState(50)
  const [customQs, setCustomQs] = useState([])

  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')

  const isMaths = /math/i.test(subject)
  const totalMarks = customQs.reduce((s, q) => s + (Number(q.marks) || 1), 0)

  const label = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.4), marginBottom: 8, display: 'block' }
  const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 12, background: 'var(--input-bg)', border: `1px solid ${fill(0.12)}`, color: 'var(--ink)', fontSize: 14, fontFamily: "'Manrope',sans-serif", outline: 'none' }

  const updateQ = (i, patch) => setCustomQs((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))
  const removeQ = (i) => setCustomQs((qs) => qs.filter((_, j) => j !== i))
  const moveQ = (i, dir) => setCustomQs((qs) => {
    const j = i + dir
    if (j < 0 || j >= qs.length) return qs
    const n = qs.slice()
    ;[n[i], n[j]] = [n[j], n[i]]
    return n
  })
  const addBlank = (type) => setCustomQs((qs) => [...qs, blankQuestion(type, subject)])
  const addFromBank = (q) => setCustomQs((qs) => [...qs, { ...q, id: rid('bk'), subject, marks: q.marks || 1 }])

  function resetDraft() {
    setEditingId(null); setTitle(''); setSubject('Mathematics'); setDurationMin(20); setDue(''); setDescription(''); setPassMark(50); setCustomQs([])
  }

  async function onScanFiles(e) {
    // Snapshot the files BEFORE clearing the input — reading e.target.files after
    // resetting value would give an empty list (that was the "nothing happens" bug).
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    if (!aiOn) { toast('Connect AI first to scan a paper'); onConnect?.(); return }
    setScanning(true)
    try {
      const res = await scanPaper(files, subject || 'General')
      if (!res.questions.length) { toast('No questions found in those pages'); return }
      if (res.title && !title.trim()) setTitle(res.title)
      if (res.description && !description.trim()) setDescription(res.description)
      if (res.durationMin) setDurationMin(res.durationMin)
      setCustomQs((qs) => [...qs, ...res.questions])
      toast(`Imported ${res.questions.length} question${res.questions.length === 1 ? '' : 's'} — review & edit below`)
    } catch (err) {
      console.error('Scan failed:', err)
      toast('Could not read that — check AI is connected, then try again')
    } finally {
      setScanning(false)
    }
  }

  function startEdit(exam) {
    setEditingId(exam.id)
    setTitle(exam.title || '')
    setSubject(exam.subject || 'General')
    setDurationMin(exam.durationMin || 20)
    setDue(exam.due && exam.due !== 'Anytime' ? exam.due : '')
    setDescription(exam.description || '')
    setPassMark(Number(exam.passMark) >= 0 ? Number(exam.passMark) : 50)
    setCustomQs(resolveQuestions(exam).map((q) => ({ ...q, id: q.id || rid('q'), marks: q.marks || 1 })))
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  function save() {
    if (!title.trim()) { toast('Give the exam a title'); return }
    const clean = customQs.filter((q) => (q.prompt || '').trim())
    if (!clean.length) { toast('Add at least one question'); return }
    const payload = {
      title: title.trim(), subject: subject.trim() || 'General', durationMin: Number(durationMin) || 20,
      due: due.trim() || 'Anytime', description: description.trim(),
      passMark: Math.max(0, Math.min(100, Math.round(Number(passMark) || 0))),
      questionIds: [], customQuestions: clean,
    }
    if (editingId) { store.updateExam(editingId, payload); toast('Exam updated') }
    else { store.addExam(payload); toast('Exam published — students can see it now') }
    resetDraft()
  }

  function postAnnouncement() {
    if (!annTitle.trim()) { toast('Announcement needs a title'); return }
    store.addAnnouncement({ title: annTitle.trim(), body: annBody.trim() })
    setAnnTitle(''); setAnnBody('')
    toast('Posted to the student home')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: reduceMotion ? 'none' : `qgfade .4s ${t.EASE} both` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: `linear-gradient(135deg,${t.accent},${t.accent2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0B0D10' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4 2 9l10 5 10-5z" /><path d="M6 11v4c0 1 2.7 3 6 3s6-2 6-3v-4" /></svg>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Teacher dashboard</div>
          <div style={{ fontSize: 12.5, color: sub(0.5) }}>Scan papers or build exams in any subject — every question is editable, with marks, and AI-graded.</div>
        </div>
      </div>

      {/* CREATE / EDIT EXAM */}
      <section style={{ ...t.GLASS, borderRadius: 24, padding: '26px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{editingId ? 'Edit exam' : 'Create an exam'}</div>
          {editingId && <button onClick={resetDraft} style={{ fontSize: 12.5, fontWeight: 600, color: sub(0.6), background: 'none', border: 'none', cursor: 'pointer' }}>Cancel edit</button>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr', gap: 14 }}>
          <div><label style={label}>Title</label><input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Year 11 Biology — Cells" /></div>
          <div>
            <label style={label}>Subject (type any)</label>
            <input list="subjectlist" style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Biology" />
            <datalist id="subjectlist">{SUBJECT_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div><label style={label}>Minutes</label><input type="number" min="1" style={inputStyle} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} /></div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={label}>Description / instructions (shown to students)</label>
          <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Answer all questions. Calculators allowed. Show your working." />
        </div>

        {/* scan pages */}
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" multiple onChange={onScanFiles} style={{ display: 'none' }} />
        <div style={{ marginTop: 16, padding: 16, borderRadius: 16, background: fill(0.03), border: `1px dashed ${fill(0.18)}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: t.hexA(t.accent, 0.14), border: `1px solid ${t.hexA(t.accent, 0.32)}`, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L8 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3.2" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Scan a paper into questions</div>
            <div style={{ fontSize: 12.5, color: sub(0.55), marginTop: 2 }}>
              {scanning ? 'Reading the paper with AI…' : 'Upload a PDF, or photograph/upload page images — AI reads the title, instructions, questions, types & marks. You can edit everything after.'}
            </div>
          </div>
          <button onClick={() => (aiOn ? fileRef.current?.click() : onConnect?.())} disabled={scanning} style={{ ...t.cta, padding: '12px 20px', opacity: scanning ? 0.6 : 1 }}>
            {scanning
              ? <span style={{ width: 16, height: 16, borderRadius: 999, border: '2px solid rgba(11,13,16,0.35)', borderTopColor: '#0B0D10', display: 'inline-block', animation: reduceMotion ? 'none' : 'qgspin .8s linear infinite' }} />
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L8 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3.2" /></svg>}
            {scanning ? 'Scanning…' : aiOn ? 'Scan pages' : 'Connect AI to scan'}
          </button>
        </div>

        {/* add tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <span style={{ ...label, marginBottom: 0 }}>Questions ({customQs.length})</span>
          <button onClick={() => addBlank('text')} style={{ ...t.ghostBtn, padding: '8px 14px' }}>+ Written</button>
          <button onClick={() => addBlank('mcq')} style={{ ...t.ghostBtn, padding: '8px 14px' }}>+ Multiple choice</button>
        </div>

        {isMaths && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11.5, color: sub(0.45), marginBottom: 8 }}>Quick-add from the maths bank:</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {QUESTION_BANK.map((q) => (
                <button key={q.id} onClick={() => addFromBank(q)} title={q.prompt} style={{ padding: '6px 11px', borderRadius: 999, fontSize: 12, cursor: 'pointer', fontFamily: "'Manrope',sans-serif", background: fill(0.04), border: `1px solid ${fill(0.1)}`, color: sub(0.75) }}>
                  + {q.topic}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* editable question list */}
        {customQs.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {customQs.map((q, i) => (
              <QuestionEditor
                key={q.id}
                t={t}
                q={q}
                index={i}
                onChange={(patch) => updateQ(i, patch)}
                onRemove={() => removeQ(i)}
                onMoveUp={() => moveQ(i, -1)}
                onMoveDown={() => moveQ(i, 1)}
                canUp={i > 0}
                canDown={i < customQs.length - 1}
              />
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 18, flexWrap: 'wrap' }}>
          <input style={{ ...inputStyle, width: 180 }} value={due} onChange={(e) => setDue(e.target.value)} placeholder="Due (e.g. Fri 12 Jun)" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, color: sub(0.55) }}>Pass mark</span>
            <input type="number" min="0" max="100" value={passMark} onChange={(e) => setPassMark(e.target.value)} style={{ ...inputStyle, width: 72, textAlign: 'center' }} />
            <span style={{ fontSize: 12.5, color: sub(0.55) }}>%</span>
          </div>
          <button style={t.cta} onClick={save}>{editingId ? 'Save changes' : 'Publish exam'}</button>
          <span style={{ fontSize: 12.5, color: sub(0.5) }}>{customQs.length} question{customQs.length === 1 ? '' : 's'} · {totalMarks} mark{totalMarks === 1 ? '' : 's'} · {subject || 'General'}</span>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* ANNOUNCEMENT */}
        <div style={{ ...t.GLASS, borderRadius: 24, padding: '24px 26px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Post an announcement</div>
          <label style={label}>Title</label>
          <input style={inputStyle} value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="e.g. Mock exam next Monday" />
          <label style={{ ...label, marginTop: 14 }}>Message</label>
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
              store.customExams.map((e) => {
                const qn = (e.questionIds?.length || 0) + (e.customQuestions?.length || 0)
                const marks = (e.customQuestions || []).reduce((s, q) => s + (Number(q.marks) || 1), 0) + (e.questionIds?.length || 0)
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${fill(0.06)}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}{editingId === e.id ? ' · editing…' : ''}</div>
                      <div style={{ fontSize: 11.5, color: sub(0.5) }}>{e.subject} · {qn} Q · {marks} marks · {e.durationMin} min</div>
                    </div>
                    <button onClick={() => startEdit(e)} style={{ background: 'none', border: 'none', color: t.accent, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Edit</button>
                    <button onClick={() => { store.deleteExam(e.id); if (editingId === e.id) resetDraft(); toast('Exam removed') }} style={{ background: 'none', border: 'none', color: t.CORAL, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Delete</button>
                  </div>
                )
              })
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
