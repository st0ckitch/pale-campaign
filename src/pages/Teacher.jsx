import { useMemo, useRef, useState } from 'react'
import { sub, fill } from '../theme.js'
import { QUESTION_BANK, resolveQuestions } from '../lib/useContentStore.js'
import { scanPaper } from '../lib/vision.js'
import QuestionEditor from './QuestionEditor.jsx'
import { MarkingQueue, ClassInsights } from './TeacherInsights.jsx'

const rid = (p) => p + Math.random().toString(36).slice(2, 9)
const SUBJECT_SUGGESTIONS = [
  'Mathematics AA', 'Mathematics AI', 'Biology', 'Chemistry', 'Physics',
  'English A', 'English B', 'Georgian A', 'French B', 'Spanish B',
  'History', 'Geography', 'Economics', 'Business Management',
  'Computer Science', 'Theory of Knowledge',
]

function blankQuestion(type, subject) {
  const base = { id: rid('q'), type, subject, topic: '', prompt: '', latex: '', marks: 1, acceptedAnswers: [] }
  return type === 'mcq'
    ? { ...base, options: ['', '', '', ''], correctAnswer: '', workingNotes: 'Set by your teacher.' }
    : { ...base, correctAnswer: '', markScheme: '', workingNotes: 'Set by your teacher.' }
}

// ---------------------------------------------------------------------------
// Teacher dashboard, organised by job: Exams (build & publish), Marking
// (review AI-flagged answers), Insights (class misconceptions), Classes
// (join codes & rosters), Announcements.
// ---------------------------------------------------------------------------
export default function Teacher({ t, store, toast, reduceMotion, onGo, aiOn, onConnect }) {
  const [view, setView] = useState('exams')

  const reviewCount = useMemo(() => {
    let n = 0
    for (const a of store.attempts || []) {
      for (const it of a.items || []) if (it.needsReview && !it.override) n++
    }
    return n
  }, [store.attempts])

  const TABS = [
    ['exams', 'Exams', store.customExams.length || null],
    ['marking', 'Marking', reviewCount || null],
    ['insights', 'Insights', null],
    ['students', 'Students', store.mode === 'cloud-teacher' ? store.students.length || null : null],
    ['announcements', 'Announcements', store.announcements.length || null],
  ]

  const label = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.4), marginBottom: 8, display: 'block' }
  const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 12, background: 'var(--input-bg)', border: `1px solid ${fill(0.12)}`, color: 'var(--ink)', fontSize: 14, fontFamily: "'Manrope',sans-serif", outline: 'none' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, animation: reduceMotion ? 'none' : `qgfade .4s ${t.EASE} both` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: `linear-gradient(135deg,${t.accent},${t.accent2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.ctaInk }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4 2 9l10 5 10-5z" /><path d="M6 11v4c0 1 2.7 3 6 3s6-2 6-3v-4" /></svg>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Teacher dashboard</div>
          <div style={{ fontSize: 12.5, color: sub(0.5) }}>Build IB exams, review AI marking, and manage your classes.</div>
        </div>
      </div>

      {/* Sub-navigation */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TABS.map(([key, name, count]) => {
          const on = view === key
          return (
            <button
              key={key}
              onClick={() => setView(key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '10px 18px', borderRadius: 999, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Manrope',sans-serif", transition: `all .2s ${t.EASE}`,
                border: `1px solid ${on ? t.hexA(t.accent, 0.55) : fill(0.12)}`,
                background: on ? t.hexA(t.accent, 0.16) : '#FFFFFF',
                color: on ? 'var(--ink)' : sub(0.6),
              }}
            >
              {name}
              {count != null && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: on ? t.hexA(t.accent, 0.3) : fill(0.07), color: on ? 'var(--ink)' : sub(0.55) }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {view === 'exams' && (
        <ExamsTab t={t} store={store} toast={toast} aiOn={aiOn} onConnect={onConnect} onGo={onGo} reduceMotion={reduceMotion} label={label} inputStyle={inputStyle} />
      )}
      {view === 'marking' && <MarkingQueue t={t} store={store} toast={toast} />}
      {view === 'insights' && <ClassInsights t={t} store={store} toast={toast} aiOn={aiOn} onConnect={onConnect} />}
      {view === 'students' && (
        store.mode === 'cloud-teacher'
          ? <StudentsPanel t={t} store={store} toast={toast} label={label} inputStyle={inputStyle} />
          : (
            <div style={{ ...t.GLASS, borderRadius: 24, padding: '32px 34px', maxWidth: 560 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Student accounts need the school server</div>
              <p style={{ fontSize: 13.5, color: sub(0.6), lineHeight: 1.6, margin: '10px 0 0' }}>
                When the app is connected to the school server you can create student
                accounts here (ID + email), send invite links, and see every student's
                results from any device. Right now the app is running in single-device mode.
              </p>
            </div>
          )
      )}
      {view === 'announcements' && <AnnouncementsTab t={t} store={store} toast={toast} label={label} inputStyle={inputStyle} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Exams tab: published list + builder (scan / bank / manual)
// ---------------------------------------------------------------------------
function ExamsTab({ t, store, toast, aiOn, onConnect, onGo, reduceMotion, label, inputStyle }) {
  const fileRef = useRef(null)
  const [scanning, setScanning] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('Mathematics AA')
  const [durationMin, setDurationMin] = useState(20)
  const [due, setDue] = useState('')
  const [description, setDescription] = useState('')
  const [passMark, setPassMark] = useState(50)
  const [customQs, setCustomQs] = useState([])

  const isMaths = /math/i.test(subject)
  const totalMarks = customQs.reduce((s, q) => s + (Number(q.marks) || 1), 0)

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
    setEditingId(null); setTitle(''); setSubject('Mathematics AA'); setDurationMin(20); setDue(''); setDescription(''); setPassMark(50); setCustomQs([])
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
      if (res.truncated) toast('Heads up: the paper was long and may have been cut off — check the last questions are all there')
    } catch (err) {
      console.error('Scan failed:', err)
      toast(`Scan failed: ${err?.message || 'check AI is connected, then try again'}`)
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* PUBLISHED EXAMS */}
      {store.customExams.length > 0 && (
        <section style={{ ...t.GLASS, borderRadius: 24, padding: '22px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Published exams</div>
            <button style={{ fontSize: 12, color: t.brand === 'BIST' ? '#8A6A00' : t.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }} onClick={() => onGo('exams')}>View as student →</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {store.customExams.map((e) => {
              const qn = (e.questionIds?.length || 0) + (e.customQuestions?.length || 0)
              const marks = (e.customQuestions || []).reduce((s, q) => s + (Number(q.marks) || 1), 0) + (e.questionIds?.length || 0)
              return (
                <div key={e.id} style={{ padding: '14px 16px', borderRadius: 14, background: fill(0.03), border: `1px solid ${fill(0.08)}` }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}{editingId === e.id ? ' · editing…' : ''}</div>
                  <div style={{ fontSize: 11.5, color: sub(0.5), marginTop: 4 }}>{e.subject} · {qn} Q · {marks} marks · {e.durationMin} min</div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                    <button onClick={() => startEdit(e)} style={{ background: 'none', border: 'none', color: t.brand === 'BIST' ? '#8A6A00' : t.accent, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, padding: 0 }}>Edit</button>
                    <button onClick={() => { store.deleteExam(e.id); if (editingId === e.id) resetDraft(); toast('Exam removed') }} style={{ background: 'none', border: 'none', color: t.CORAL, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, padding: 0 }}>Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* CREATE / EDIT EXAM */}
      <section style={{ ...t.GLASS, borderRadius: 24, padding: '26px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{editingId ? 'Edit exam' : 'Create an exam'}</div>
          {editingId && <button onClick={resetDraft} style={{ fontSize: 12.5, fontWeight: 600, color: sub(0.6), background: 'none', border: 'none', cursor: 'pointer' }}>Cancel edit</button>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr', gap: 14 }}>
          <div><label style={label}>Title</label><input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Maths AA — Functions test" /></div>
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
          <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: t.hexA(t.accent, 0.14), border: `1px solid ${t.hexA(t.accent, 0.32)}`, color: t.brand === 'BIST' ? '#8A6A00' : t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
              ? <span style={{ width: 16, height: 16, borderRadius: 999, border: '2px solid rgba(255,255,255,0.45)', borderTopColor: 'currentColor', display: 'inline-block', animation: reduceMotion ? 'none' : 'qgspin .8s linear infinite' }} />
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Announcements tab
// ---------------------------------------------------------------------------
function AnnouncementsTab({ t, store, toast, label, inputStyle }) {
  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')

  function post() {
    if (!annTitle.trim()) { toast('Announcement needs a title'); return }
    store.addAnnouncement({ title: annTitle.trim(), body: annBody.trim() })
    setAnnTitle(''); setAnnBody('')
    toast('Posted to the student home')
  }

  return (
    <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
      <div style={{ ...t.GLASS, borderRadius: 24, padding: '24px 26px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Post an announcement</div>
        <label style={label}>Title</label>
        <input style={inputStyle} value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="e.g. Mock exam next Monday" />
        <label style={{ ...label, marginTop: 14 }}>Message</label>
        <textarea style={{ ...inputStyle, minHeight: 84, resize: 'vertical' }} value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder="Details for your students…" />
        <button style={{ ...t.cta, marginTop: 16 }} onClick={post}>Post to students</button>
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
    </section>
  )
}

// ---------------------------------------------------------------------------
// Students & classes. The teacher creates student accounts (ID + email): the
// server generates a one-time password and an invite link — emailed when the
// server has an email key, and always shown here so the teacher can share it
// directly. Students then sign in with ID + their own password.
// ---------------------------------------------------------------------------
function copyText(text, toast, msg) {
  try {
    navigator.clipboard?.writeText(text)
    toast(msg)
  } catch {
    toast('Could not copy — select it manually')
  }
}

const inviteLinkFor = (token) =>
  `${typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''}#invite=${token}`

function StudentsPanel({ t, store, toast, label, inputStyle }) {
  const [className, setClassName] = useState('')
  const [sid, setSid] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [classCode, setClassCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastInvite, setLastInvite] = useState(null) // { student, otp, inviteToken, emailSent }

  const accent = t.brand === 'BIST' ? '#8A6A00' : t.accent

  function createClass() {
    const clean = className.trim()
    if (!clean) { toast('Give the class a name'); return }
    store.addClass(clean)
    setClassName('')
  }

  async function addStudent() {
    if (busy) return
    if (!sid.trim()) { toast('Student ID is required'); return }
    setBusy(true)
    try {
      const r = await store.addStudent({ id: sid.trim(), email: email.trim(), name: name.trim(), classCode })
      setLastInvite(r)
      setSid(''); setEmail(''); setName('')
      toast(r.emailSent ? `Invite emailed to ${r.student.email}` : 'Account created — share the invite below')
    } catch (err) {
      toast(err.message || 'Could not create the student')
    } finally {
      setBusy(false)
    }
  }

  async function reinvite(id) {
    try {
      const r = await store.reinviteStudent(id)
      setLastInvite(r)
      toast(r.emailSent ? `New invite emailed to ${r.student.email}` : 'New invite generated — share it below')
    } catch (err) {
      toast(err.message || 'Could not regenerate the invite')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ADD STUDENT */}
      <section style={{ ...t.GLASS, borderRadius: 24, padding: '24px 26px' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Add a student</div>
        <div style={{ fontSize: 12.5, color: sub(0.55), marginTop: 4, marginBottom: 14 }}>
          The account gets a one-time password and an invite link. If the server has an email key, the invite is emailed automatically — either way you can copy and share it below.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.2fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div><label style={label}>Student ID *</label><input style={inputStyle} value={sid} onChange={(e) => setSid(e.target.value)} placeholder="S12345" /></div>
          <div><label style={label}>Email</label><input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@school.ge" /></div>
          <div><label style={label}>Name</label><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></div>
          <div>
            <label style={label}>Class</label>
            <select style={{ ...inputStyle, padding: '12px 10px' }} value={classCode} onChange={(e) => setClassCode(e.target.value)}>
              <option value="">— none —</option>
              {store.classes.map((c) => <option key={c.id} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <button style={{ ...t.cta, padding: '12px 20px', opacity: busy ? 0.6 : 1 }} onClick={addStudent} disabled={busy}>
            {busy ? 'Adding…' : '+ Add & invite'}
          </button>
        </div>

        {lastInvite && (
          <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 14, background: t.hexA(t.accent, 0.08), border: `1px solid ${t.hexA(t.accent, 0.35)}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>
              Invite for {lastInvite.student.name || lastInvite.student.id}
              <span style={{ fontWeight: 500, color: sub(0.55) }}> · {lastInvite.emailSent ? 'emailed ✓' : 'not emailed — share it yourself'}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button style={{ ...t.ghostBtn, padding: '8px 14px' }} onClick={() => copyText(inviteLinkFor(lastInvite.inviteToken), toast, 'Invite link copied')}>
                Copy invite link
              </button>
              <span style={{ fontSize: 12.5, color: sub(0.55) }}>One-time password:</span>
              <span
                onClick={() => copyText(lastInvite.otp, toast, 'One-time password copied')}
                style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: '0.14em', color: accent, cursor: 'pointer' }}
                title="Click to copy"
              >
                {lastInvite.otp}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: sub(0.5), marginTop: 8, lineHeight: 1.5 }}>
              The link lets them set their own password directly. The one-time password works too: they sign in with it (ID + OTP) and are asked to change it.
            </div>
          </div>
        )}
      </section>

      {/* STUDENT LIST */}
      <section style={{ ...t.GLASS, borderRadius: 24, padding: '24px 26px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Students ({store.students.length})</div>
        {store.students.length === 0 ? (
          <div style={{ fontSize: 13, color: sub(0.5) }}>No students yet — add the first one above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {store.students.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderBottom: `1px solid ${fill(0.05)}`, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13.5, width: 90 }}>{s.id}</span>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.name || '—'}</div>
                  <div style={{ fontSize: 11.5, color: sub(0.5) }}>{s.email || 'no email'}{s.className ? ` · ${s.className}` : ''}</div>
                </div>
                <span style={{
                  fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 700,
                  padding: '3px 10px', borderRadius: 999,
                  background: s.activatedAt ? 'rgba(52,199,150,0.13)' : t.hexA('#E09A3E', 0.13),
                  border: `1px solid ${s.activatedAt ? 'rgba(52,199,150,0.45)' : t.hexA('#E09A3E', 0.45)}`,
                  color: s.activatedAt ? t.OK : '#B87514',
                }}>
                  {s.activatedAt ? 'Active' : 'Invited'}
                </span>
                {s.inviteToken && (
                  <button style={{ background: 'none', border: 'none', color: accent, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, padding: 0 }} onClick={() => copyText(inviteLinkFor(s.inviteToken), toast, 'Invite link copied')}>
                    Copy link
                  </button>
                )}
                <button style={{ background: 'none', border: 'none', color: sub(0.55), cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: 0 }} onClick={() => reinvite(s.id)}>
                  Reinvite
                </button>
                <button style={{ background: 'none', border: 'none', color: t.CORAL, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: 0 }} onClick={() => { store.deleteStudent(s.id); toast(`${s.id} removed`) }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CLASSES */}
      <section style={{ ...t.GLASS, borderRadius: 24, padding: '24px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Classes</div>
          <span style={{ fontSize: 12, color: sub(0.5) }}>Group students so results and insights are easy to read.</span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...inputStyle, width: 260 }}
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="e.g. DP1 Maths AA"
            onKeyDown={(e) => e.key === 'Enter' && createClass()}
          />
          <button style={{ ...t.cta, padding: '12px 20px' }} onClick={createClass}>+ Create class</button>
        </div>
        {store.classes.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            {store.classes.map((c) => {
              const count = store.students.filter((s) => s.classCode === c.code).length
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 999, background: fill(0.04), border: `1px solid ${fill(0.1)}` }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</span>
                  <span style={{ fontSize: 11.5, color: sub(0.5) }}>{count} student{count === 1 ? '' : 's'}</span>
                  <button onClick={() => { store.deleteClass(c.id); toast('Class removed') }} style={{ background: 'none', border: 'none', color: t.CORAL, cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0 }}>✕</button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
