import { useEffect, useMemo, useRef, useState } from 'react'
import { EXAM_QUESTIONS, EXAM_META } from '../data/examQuestions.js'
import { gradeQuestion, isImageAnswer } from '../lib/grading.js'
import { generateSimilar } from '../lib/generate.js'
import AnswerInput from './AnswerInput.jsx'

// An answer counts as filled if it's non-empty text or an image (drawn/photo).
const answerFilled = (a) => a != null && (typeof a === 'object' ? !!a.image : String(a).trim() !== '')
import { useReducedMotion } from '../lib/useReducedMotion.js'
import MathText from '../components/MathText.jsx'
import BrandLogo from '../components/BrandLogo.jsx'
import AskAIPanel from './AskAIPanel.jsx'

// count-up animation for the score ring / number
function useCountUp(target, run, reduceMotion, dur = 900) {
  const [v, setV] = useState(run && !reduceMotion ? 0 : target)
  useEffect(() => {
    if (!run || reduceMotion) {
      setV(target)
      return
    }
    let raf
    const start = performance.now()
    const ease = (p) => 1 - Math.pow(1 - p, 3)
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur)
      setV(target * ease(p))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, run, reduceMotion, dur])
  return v
}

function fmtTime(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

// Format marks: whole numbers stay whole, partial credit shows one decimal
// (keeps the per-question cards and the total ring arithmetically consistent).
function fmtMarks(n) {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

// ---------------------------------------------------------------------------
// In-progress attempt persistence. The active exam autosaves to localStorage
// (keyed per exam) so a refresh or tab crash neither wipes the answers nor —
// because the timer is anchored to a wall-clock deadline — grants extra time.
// ---------------------------------------------------------------------------
const progressKey = (examId) => `lh_exam_progress_${examId}`

function readProgress(examId, qsig) {
  if (typeof window === 'undefined' || !examId) return null
  try {
    const raw = window.localStorage.getItem(progressKey(examId))
    if (!raw) return null
    const p = JSON.parse(raw)
    // Discard if the exam's questions changed since the attempt started.
    if (p.qsig !== qsig || !Number.isFinite(p.deadlineAt)) return null
    return p
  } catch {
    return null
  }
}

function clearProgressStorage(examId) {
  if (typeof window === 'undefined' || !examId) return
  try {
    window.localStorage.removeItem(progressKey(examId))
  } catch {
    /* ignore */
  }
}

// Small JPEG thumbnail of a drawn/photographed answer for the teacher's queue.
async function answerThumb(ans) {
  if (typeof document === 'undefined' || !ans || typeof ans !== 'object' || !ans.image) return null
  try {
    return await new Promise((res) => {
      const im = new Image()
      im.onload = () => {
        const sc = Math.min(1, 320 / Math.max(im.width, im.height))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(im.width * sc))
        c.height = Math.max(1, Math.round(im.height * sc))
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height)
        const out = c.toDataURL('image/jpeg', 0.6)
        res(out.length < 80000 ? out : null)
      }
      im.onerror = () => res(null)
      im.src = `data:${ans.media_type || 'image/jpeg'};base64,${ans.image}`
    })
  } catch {
    return null
  }
}

export default function ExamModule({ theme: t, toast, aiOn = false, onConnect, questions = EXAM_QUESTIONS, meta = EXAM_META, examId = 'builtin-mock', initialStudentName = '', lockStudent = false, onGeneratePractice, onGraded }) {
  const reduceMotion = useReducedMotion()
  const total = questions.length
  const totalMkAll = questions.reduce((s, q) => s + (Number(q.marks) || 1), 0)
  const [genBusy, setGenBusy] = useState(false)
  const [studentName, setStudentName] = useState(initialStudentName)

  const [phase, setPhase] = useState('intro') // intro | active | grading | review
  const [answers, setAnswers] = useState({})
  const [flagged, setFlagged] = useState({})
  const [current, setCurrent] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(meta.durationSeconds)
  const [deadlineAt, setDeadlineAt] = useState(null) // wall-clock end of the attempt
  const [saveState, setSaveState] = useState('idle') // idle | saved | error
  const [resumeData, setResumeData] = useState(null) // unfinished attempt found in storage
  const [results, setResults] = useState(null)
  const [askFor, setAskFor] = useState(null) // question being discussed
  const abortRef = useRef(null)

  const qsig = useMemo(() => questions.map((q) => q.id).join('|'), [questions])

  const answeredCount = useMemo(
    () => questions.filter((q) => answerFilled(answers[q.id])).length,
    [answers, questions],
  )

  // Look for an unfinished attempt to offer resuming.
  useEffect(() => {
    const saved = readProgress(examId, qsig)
    if (saved) {
      setResumeData(saved)
      if (saved.studentName && !lockStudent) setStudentName(saved.studentName)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- timer: derived from the wall-clock deadline, so a refresh neither
  // resets it nor grants extra time ----
  useEffect(() => {
    if (phase !== 'active' || !deadlineAt) return
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [phase, deadlineAt])

  // auto-submit when time runs out
  useEffect(() => {
    if (phase === 'active' && secondsLeft === 0) submit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, phase])

  // ---- autosave the in-progress attempt (debounced) ----
  useEffect(() => {
    if (phase !== 'active' || typeof window === 'undefined' || !examId || !deadlineAt) return
    const id = setTimeout(() => {
      try {
        window.localStorage.setItem(
          progressKey(examId),
          JSON.stringify({ v: 1, qsig, answers, flagged, current, studentName, deadlineAt, savedAt: Date.now() }),
        )
        setSaveState('saved')
      } catch {
        setSaveState('error') // quota exceeded / privacy mode — say so instead of pretending
      }
    }, 350)
    return () => clearTimeout(id)
  }, [phase, examId, qsig, answers, flagged, current, studentName, deadlineAt])

  useEffect(() => () => abortRef.current?.abort(), [])

  function setAnswer(id, val) {
    setAnswers((a) => ({ ...a, [id]: val }))
  }
  function toggleFlag(id) {
    setFlagged((f) => ({ ...f, [id]: !f[id] }))
  }

  function begin() {
    clearProgressStorage(examId)
    setResumeData(null)
    setDeadlineAt(Date.now() + meta.durationSeconds * 1000)
    setPhase('active')
  }

  function resumeAttempt() {
    if (!resumeData) return
    setAnswers(resumeData.answers || {})
    setFlagged(resumeData.flagged || {})
    setCurrent(Math.max(0, Math.min(total - 1, Number(resumeData.current) || 0)))
    setDeadlineAt(resumeData.deadlineAt) // remaining time picks up where it left off
    setPhase('active')
  }

  async function submit() {
    if (phase === 'grading') return
    setAskFor(null)
    setPhase('grading')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const [res] = await Promise.all([
        Promise.all(questions.map((q) => gradeQuestion(q, answers[q.id], controller.signal))),
        delay(1300), // keep the shimmer state visible even if grading is instant
      ])
      setResults(res)
      setPhase('review')
      clearProgressStorage(examId) // the attempt is submitted — nothing left to resume
      setResumeData(null)
      // Record the attempt for teacher moderation + class insights (best effort).
      try {
        const items = await Promise.all(questions.map(async (q, i) => {
          const r = res[i]
          const raw = answers[q.id]
          const isImg = raw && typeof raw === 'object' && raw.image
          return {
            prompt: q.prompt,
            topic: q.topic || meta.subject || 'General',
            type: q.type,
            marks: Number(q.marks) || 1,
            correctAnswer: q.correctAnswer,
            answer: isImg ? (raw.kind === 'photo' ? '[photographed answer]' : '[drawn answer]') : String(raw ?? ''),
            thumb: isImg ? await answerThumb(raw) : null,
            answered: r.answered,
            score: r.score,
            correct: r.correct,
            feedback: r.feedback,
            errorStep: r.errorStep ?? null,
            confidence: r.confidence ?? null,
            source: r.source,
            needsReview: !!r.needsReview,
          }
        }))
        const totalMarks = items.reduce((s, it) => s + it.marks, 0)
        const earnedMarks = Math.round(items.reduce((s, it) => s + it.score * it.marks, 0) * 10) / 10
        onGraded?.({
          id: 'a' + Math.random().toString(36).slice(2, 9),
          ts: Date.now(),
          examTitle: meta.title,
          subject: meta.subject || 'General',
          student: studentName.trim() || 'Anonymous',
          totalMarks,
          earnedMarks,
          items,
        })
      } catch (err) {
        console.error('Could not record attempt:', err)
      }
    } catch {
      // gradeQuestion never throws, but guard anyway
      setPhase('active')
    }
  }

  function restart() {
    clearProgressStorage(examId)
    setResumeData(null)
    setAnswers({})
    setFlagged({})
    setResults(null)
    setCurrent(0)
    setSecondsLeft(meta.durationSeconds)
    setDeadlineAt(Date.now() + meta.durationSeconds * 1000)
    setPhase('active')
  }

  // Generate a fresh AI practice set similar to this exam and hand it to the
  // parent to launch as a new (practice) exam.
  async function makePractice(topics = [], seeds) {
    if (genBusy) return
    if (!aiOn) { toast('Connect AI to generate practice questions'); onConnect?.(); return }
    setGenBusy(true)
    toast('Generating practice questions…')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const qs = await generateSimilar({
        seeds: seeds && seeds.length ? seeds : questions,
        topics,
        subject: meta.subject || 'General',
        count: 5,
        signal: controller.signal,
      })
      if (!qs.length) { toast('Could not generate — try again'); return }
      const pmeta = {
        title: `Practice${topics && topics.length ? ` · ${topics.join(', ')}` : ` · ${meta.subject || 'set'}`}`,
        subject: meta.subject || 'General',
        subtitle: 'AI practice set',
        description: 'Fresh AI-generated questions, similar in style to your exam.',
        durationSeconds: Math.max(600, qs.length * 120),
        passMark: meta.passMark ?? 50,
      }
      onGeneratePractice?.(qs, pmeta)
    } catch (err) {
      console.error('Practice generation failed:', err)
      toast(`Generation failed: ${err?.message || 'check the AI connection'}`)
    } finally {
      setGenBusy(false)
    }
  }

  const lowTime = secondsLeft < 120
  const q = questions[current]

  return (
    <div style={{ animation: reduceMotion ? 'none' : `qgfade .4s ${t.EASE} both` }}>
      {phase === 'intro' && <Intro t={t} onStart={begin} resume={resumeData} onResume={resumeAttempt} reduceMotion={reduceMotion} aiOn={aiOn} onConnect={onConnect} total={total} marks={totalMkAll} meta={meta} studentName={studentName} onName={setStudentName} lockStudent={lockStudent} />}

      {phase === 'active' && (
        <ActiveExam
          t={t}
          q={q}
          questions={questions}
          total={total}
          current={current}
          setCurrent={setCurrent}
          answers={answers}
          setAnswer={setAnswer}
          flagged={flagged}
          toggleFlag={toggleFlag}
          answeredCount={answeredCount}
          secondsLeft={secondsLeft}
          lowTime={lowTime}
          onSubmit={submit}
          onAsk={() => setAskFor(q)}
          saveState={saveState}
        />
      )}

      {phase === 'grading' && <GradingSkeleton t={t} reduceMotion={reduceMotion} />}

      {phase === 'review' && results && (
        <Results
          t={t}
          results={results}
          answers={answers}
          questions={questions}
          total={total}
          meta={meta}
          reduceMotion={reduceMotion}
          onRestart={restart}
          onAsk={(question) => setAskFor(question)}
          toast={toast}
          onPractice={makePractice}
          genBusy={genBusy}
        />
      )}

      {askFor && (
        <AskAIPanel
          question={askFor}
          mode={phase === 'review' ? 'review' : 'exam'}
          theme={t}
          reduceMotion={reduceMotion}
          studentAnswer={answers[askFor.id]}
          onClose={() => setAskFor(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Intro
// ---------------------------------------------------------------------------
function Intro({ t, onStart, resume, onResume, reduceMotion, aiOn, onConnect, total, marks, meta, studentName, onName, lockStudent }) {
  const mins = Math.floor(meta.durationSeconds / 60)
  const remaining = resume ? Math.max(0, Math.ceil((resume.deadlineAt - Date.now()) / 1000)) : 0
  return (
    <div style={{ ...t.GLASS, borderRadius: 24, padding: '40px 42px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ marginBottom: 18 }}>
        <BrandLogo key={t.brand} brand={t.brand} variant="wordmark" height={46} fallback={null} />
      </div>
      <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(var(--text-rgb),0.4)' }}>
        Exam simulator{meta.subject ? ` · ${meta.subject}` : ''}
      </div>
      <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, letterSpacing: '-0.03em', fontSize: 'clamp(30px,4vw,46px)', margin: '12px 0 0' }}>
        {meta.title}
      </h1>
      {meta.description ? (
        <p style={{ margin: '14px 0 0', fontSize: 14.5, lineHeight: 1.6, color: 'rgba(var(--text-rgb),0.7)', maxWidth: 560, whiteSpace: 'pre-wrap' }}>
          {meta.description}
        </p>
      ) : (
        <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.6, color: 'rgba(var(--text-rgb),0.62)', maxWidth: 520 }}>
          {total} questions — multiple choice and written answers. You have {mins} minutes. Stuck? Ask the AI
          tutor for a hint on any question — it guides your method but won't hand you the answer until you submit.
        </p>
      )}
      <div style={{ display: 'flex', gap: 14, marginTop: 24, flexWrap: 'wrap' }}>
        {[
          [String(total), 'Questions'],
          [String(marks), marks === 1 ? 'Mark' : 'Marks'],
          [`${mins}:00`, 'Time limit'],
          ['AI', 'Graded'],
        ].map(([v, l]) => (
          <div
            key={l}
            style={{
              padding: '14px 20px',
              borderRadius: 16,
              background: 'rgba(var(--fill-rgb),0.04)',
              border: '1px solid rgba(var(--fill-rgb),0.08)',
            }}
          >
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 22, color: t.accent }}>{v}</div>
            <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.4)', marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 22, maxWidth: 320 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(var(--text-rgb),0.4)', marginBottom: 8 }}>Your name</div>
        {lockStudent ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', borderRadius: 12, background: 'rgba(var(--fill-rgb),0.04)', border: '1px solid rgba(var(--fill-rgb),0.1)', fontSize: 14, fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: t.OK, boxShadow: `0 0 7px ${t.OK}` }} />
            {studentName}
            <span style={{ fontSize: 11.5, color: 'rgba(var(--text-rgb),0.45)', fontWeight: 500 }}>· submitting to your class</span>
          </div>
        ) : (
          <input
            value={studentName}
            onChange={(e) => onName(e.target.value)}
            placeholder="So your teacher knows whose work this is"
            style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'var(--input-bg)', border: '1px solid rgba(var(--fill-rgb),0.12)', color: 'var(--ink)', fontSize: 14, fontFamily: "'Manrope',sans-serif", outline: 'none' }}
          />
        )}
      </div>
      {resume && (
        <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 14, background: t.hexA(t.accent, 0.08), border: `1px solid ${t.hexA(t.accent, 0.35)}`, maxWidth: 560 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Unfinished attempt found</div>
          <div style={{ fontSize: 12.5, color: 'rgba(var(--text-rgb),0.6)', marginTop: 3 }}>
            {remaining > 0
              ? `Your answers were saved — ${fmtTime(remaining)} remaining on the clock.`
              : 'Time ran out on this attempt — resuming will submit the saved answers for grading.'}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 14, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {resume && (
          <button style={t.cta} onClick={onResume}>
            {remaining > 0 ? `Resume attempt · ${fmtTime(remaining)} left` : 'Submit saved answers'}
          </button>
        )}
        <button style={resume ? t.ghostBtn : t.cta} onClick={onStart}>
          {resume ? 'Start over' : 'Start exam'}
          {!resume && (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h13M13 6l6 6-6 6" />
            </svg>
          )}
        </button>
        {!aiOn && (
          <div style={{ fontSize: 12.5, color: 'rgba(var(--text-rgb),0.55)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: 'rgba(var(--text-rgb),0.4)' }} />
            MCQ + written answers grade offline.
            <button onClick={onConnect} style={{ background: 'none', border: 'none', color: t.accent, cursor: 'pointer', fontWeight: 700, fontFamily: "'Manrope',sans-serif", fontSize: 12.5, padding: 0 }}>Connect AI</button>
            for semantic grading & the tutor.
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Active exam
// ---------------------------------------------------------------------------
function ActiveExam({
  t, q, questions, total, current, setCurrent, answers, setAnswer, flagged, toggleFlag,
  answeredCount, secondsLeft, lowTime, onSubmit, onAsk, saveState,
}) {
  const progress = (answeredCount / total) * 100
  const timerColor = lowTime ? t.CORAL : t.accent

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* progress bar */}
      <div style={{ height: 7, borderRadius: 999, background: 'rgba(var(--fill-rgb),0.07)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            borderRadius: 999,
            background: `linear-gradient(90deg,${t.accent},${t.accent2})`,
            transition: `width .3s ${t.EASE}`,
            boxShadow: `0 0 14px ${t.hexA(t.accent, 0.5)}`,
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* question card */}
        <div style={{ ...t.GLASS, borderRadius: 24, padding: '26px 30px', display: 'flex', flexDirection: 'column', minHeight: 440 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(var(--text-rgb),0.4)' }}>
                Question {current + 1} of {total}
              </div>
              <div
                style={{
                  display: 'inline-block',
                  marginTop: 8,
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  padding: '4px 11px',
                  borderRadius: 999,
                  background: t.hexA(t.accent, 0.12),
                  border: `1px solid ${t.hexA(t.accent, 0.3)}`,
                  color: t.accent,
                  fontWeight: 600,
                }}
              >
                {q.topic}
              </div>
            </div>
            {/* timer pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 16px',
                borderRadius: 999,
                background: lowTime ? t.hexA(t.CORAL, 0.12) : 'rgba(var(--fill-rgb),0.05)',
                border: `1px solid ${lowTime ? t.hexA(t.CORAL, 0.6) : t.hexA(t.accent, 0.5)}`,
                color: timerColor,
                fontFamily: "'Space Grotesk',sans-serif",
                fontWeight: 600,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              {fmtTime(secondsLeft)}
            </div>
          </div>

          {/* prompt */}
          <div style={{ marginTop: 24, fontSize: 19, fontWeight: 600, lineHeight: 1.5 }}>
            <MathText latex={q.latex} fallback={q.prompt} display />
          </div>
          <div style={{ marginTop: 8, fontSize: 13.5, color: 'rgba(var(--text-rgb),0.55)' }}>{q.prompt}</div>

          {/* answer area */}
          {q.type === 'mcq' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 22 }}>
              {q.options.map((opt, i) => {
                const sel = answers[q.id] === opt
                return (
                  <button
                    key={opt}
                    onClick={() => setAnswer(q.id, opt)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 16px',
                      borderRadius: 14,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 14.5,
                      fontFamily: "'Manrope',sans-serif",
                      transition: `all .18s ${t.EASE}`,
                      background: sel ? t.hexA(t.accent, 0.14) : 'rgba(var(--fill-rgb),0.04)',
                      border: `1px solid ${sel ? t.hexA(t.accent, 0.55) : 'rgba(var(--fill-rgb),0.10)'}`,
                      color: t.INK,
                    }}
                  >
                    <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, color: sel ? t.accent : 'rgba(var(--text-rgb),0.5)' }}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    {opt}
                  </button>
                )
              })}
            </div>
          ) : (
            <AnswerInput key={q.id} t={t} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
          )}

          {/* footer controls */}
          <div style={{ marginTop: 'auto', paddingTop: 24, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current === 0}
              style={navBtn(t, current === 0)}
            >
              ‹ Prev
            </button>
            <button
              onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))}
              disabled={current === total - 1}
              style={navBtn(t, current === total - 1)}
            >
              Next ›
            </button>
            <button onClick={() => toggleFlag(q.id)} style={{ ...t.ghostBtn, borderColor: flagged[q.id] ? t.hexA(t.CORAL, 0.6) : undefined, background: flagged[q.id] ? t.hexA(t.CORAL, 0.14) : t.hexA(t.accent, 0.12), color: flagged[q.id] ? t.CORAL : t.INK }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={flagged[q.id] ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 21V4h11l-1.5 4L16 12H5" />
              </svg>
              {flagged[q.id] ? 'Flagged' : 'Flag'}
            </button>
            <button onClick={onAsk} style={{ ...t.ghostBtn, marginLeft: 'auto' }}>
              Ask AI 💡
            </button>
          </div>
        </div>

        {/* navigator */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...t.GLASS, borderRadius: 24, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(var(--text-rgb),0.4)' }}>
                Question navigator
              </span>
              <span style={{ fontSize: 12, color: 'rgba(var(--text-rgb),0.5)', fontFamily: "'Space Grotesk',sans-serif" }}>
                {answeredCount}/{total}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 9 }}>
              {questions.map((qq, i) => {
                const isAnswered = answerFilled(answers[qq.id])
                const isFlag = flagged[qq.id]
                const isCur = i === current
                return (
                  <button
                    key={qq.id}
                    onClick={() => setCurrent(i)}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 42,
                      borderRadius: 12,
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: "'Space Grotesk',sans-serif",
                      cursor: 'pointer',
                      transition: `all .18s ${t.EASE}`,
                      border: `1px solid ${
                        isCur ? t.hexA(t.accent, 0.7) : isFlag ? t.hexA(t.CORAL, 0.4) : isAnswered ? t.hexA(t.accent, 0.3) : 'rgba(var(--fill-rgb),0.08)'
                      }`,
                      background: isCur ? t.hexA(t.accent, 0.2) : isAnswered ? t.hexA(t.accent, 0.1) : 'rgba(var(--fill-rgb),0.03)',
                      color: isAnswered || isCur || isFlag ? t.INK : 'rgba(var(--text-rgb),0.45)',
                    }}
                  >
                    {i + 1}
                    {/* status dot */}
                    <span
                      style={{
                        position: 'absolute',
                        top: 5,
                        right: 5,
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: isFlag ? t.CORAL : isAnswered ? t.accent : 'transparent',
                        border: isFlag || isAnswered ? 'none' : '1px solid rgba(var(--fill-rgb),0.3)',
                        boxShadow: isFlag ? `0 0 7px ${t.CORAL}` : isAnswered ? `0 0 7px ${t.accent}` : 'none',
                      }}
                    />
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 18, fontSize: 12, color: 'rgba(var(--text-rgb),0.55)' }}>
              <Legend color={t.accent} label="Answered" />
              <Legend color={t.CORAL} label="Flagged for review" />
              <Legend color="rgba(var(--fill-rgb),0.25)" label="Not answered" hollow />
            </div>
          </div>

          <div style={{ ...t.GLASS, borderRadius: 24, padding: '20px 22px' }}>
            <div style={{ fontSize: 12.5, color: 'rgba(var(--text-rgb),0.55)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: saveState === 'error' ? '#FFB347' : saveState === 'saved' ? t.OK : 'rgba(var(--text-rgb),0.35)', boxShadow: saveState === 'saved' ? `0 0 7px ${t.OK}` : 'none' }} />
              {saveState === 'error' ? 'Autosave unavailable — storage full' : saveState === 'saved' ? 'Answers autosaved — safe to refresh' : 'Autosave on'}
            </div>
            <button style={{ ...t.cta, width: '100%', justifyContent: 'center' }} onClick={onSubmit}>
              Submit exam
            </button>
            <div style={{ fontSize: 11.5, color: 'rgba(var(--text-rgb),0.4)', textAlign: 'center', marginTop: 10 }}>
              {answeredCount < total ? `${total - answeredCount} question(s) still blank` : 'All questions answered'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function navBtn(t, disabled) {
  return {
    padding: '11px 16px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "'Manrope',sans-serif",
    cursor: disabled ? 'default' : 'pointer',
    background: 'rgba(var(--fill-rgb),0.05)',
    border: '1px solid rgba(var(--fill-rgb),0.12)',
    color: disabled ? 'rgba(var(--text-rgb),0.3)' : t.INK,
    opacity: disabled ? 0.5 : 1,
  }
}

function Legend({ color, label, hollow }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: 999,
          background: hollow ? 'transparent' : color,
          border: hollow ? `1px solid ${color}` : 'none',
        }}
      />
      {label}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grading skeleton (shimmer, never a plain spinner)
// ---------------------------------------------------------------------------
function GradingSkeleton({ t, reduceMotion }) {
  const shimmer = {
    background: 'linear-gradient(100deg,rgba(var(--fill-rgb),0.04) 30%,rgba(var(--fill-rgb),0.10) 50%,rgba(var(--fill-rgb),0.04) 70%)',
    backgroundSize: '220% 100%',
    animation: reduceMotion ? 'none' : 'qgshim 1.3s linear infinite',
    border: '1px solid rgba(var(--fill-rgb),0.07)',
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 9, background: `linear-gradient(135deg,${t.accent},${t.accent2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.ctaInk, fontWeight: 700, fontSize: 12 }}>
          AI
        </div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Grading your exam…</div>
        <div style={{ fontSize: 13, color: 'rgba(var(--text-rgb),0.5)' }}>Checking written answers for mathematically equivalent forms</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20 }}>
        <div style={{ ...shimmer, height: 260, borderRadius: 24 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...shimmer, height: 122, borderRadius: 24, animationDelay: '.15s' }} />
          <div style={{ ...shimmer, height: 122, borderRadius: 24, animationDelay: '.3s' }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ ...shimmer, height: 76, borderRadius: 18, animationDelay: `${0.1 * i}s` }} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
function Results({ t, results, answers, questions, total, meta, reduceMotion, onRestart, onAsk, toast, onPractice, genBusy }) {
  const mk = (q) => Number(q.marks) || 1
  const totalMk = questions.reduce((s, q) => s + mk(q), 0)
  const earnedMk = results.reduce((s, r, i) => s + r.score * mk(questions[i]), 0)
  const scaled = useCountUp(earnedMk, true, reduceMotion, 900)
  const pct = totalMk ? earnedMk / totalMk : 0
  const passMark = meta.passMark ?? 50
  const passed = pct * 100 >= passMark
  const grade = gradeBand(pct)

  // ring
  const R = 52
  const C = 2 * Math.PI * R
  const off = C * (1 - pct)

  // per-topic breakdown (by score)
  const topics = useMemo(() => {
    const map = {}
    questions.forEach((q, i) => {
      const r = results[i]
      const w = mk(q)
      if (!map[q.topic]) map[q.topic] = { sum: 0, n: 0 }
      map[q.topic].sum += r.score * w
      map[q.topic].n += w
    })
    return Object.entries(map)
      .map(([topic, { sum, n }]) => ({ topic, pct: Math.round((sum / n) * 100) }))
      .sort((a, b) => b.pct - a.pct)
  }, [results, questions])

  const weakTopics = topics.filter((x) => x.pct < 70).map((x) => x.topic)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20 }}>
        {/* score ring */}
        <div style={{ ...t.GLASS, borderRadius: 24, padding: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ marginBottom: 20 }}>
            <BrandLogo key={t.brand} brand={t.brand} variant="wordmark" height={40} fallback={null} />
          </div>
          <div style={{ position: 'relative', width: 160, height: 160 }}>
            <svg width="160" height="160" viewBox="0 0 160 160" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="80" cy="80" r={R} fill="none" stroke="rgba(var(--fill-rgb),0.08)" strokeWidth="10" />
              <circle
                cx="80"
                cy="80"
                r={R}
                fill="none"
                stroke={t.accent}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={reduceMotion ? off : C * (1 - (totalMk ? scaled / totalMk : 0))}
                style={{ transition: reduceMotion ? 'none' : `stroke-dashoffset .9s ${t.EASE}` }}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 44, letterSpacing: '-0.03em' }}>
                {fmtMarks(scaled)}<span style={{ fontSize: 24, color: 'rgba(var(--text-rgb),0.45)' }}>/{totalMk}</span>
              </div>
              <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.45)' }}>
                {Math.round(pct * 100)}% · marks
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 17 }}>{grade}</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                padding: '5px 12px',
                borderRadius: 999,
                color: passed ? t.OK : t.CORAL,
                background: passed ? 'rgba(52,199,150,0.14)' : t.hexA(t.CORAL, 0.14),
                border: `1px solid ${passed ? 'rgba(52,199,150,0.5)' : t.hexA(t.CORAL, 0.5)}`,
              }}
            >
              {passed ? 'Pass' : 'Below pass'}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(var(--text-rgb),0.5)', marginTop: 6, textAlign: 'center' }}>
            Pass mark {passMark}% · IB band indicative — boundaries vary by session
          </div>
          <button style={{ ...t.ghostBtn, marginTop: 18 }} onClick={onRestart}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
            </svg>
            Retake exam
          </button>
        </div>

        {/* topic breakdown + summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...t.GLASS, borderRadius: 24, padding: 24 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(var(--text-rgb),0.4)', marginBottom: 16 }}>
              Per-topic breakdown
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {topics.map((b) => (
                <div key={b.topic}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span>{b.topic}</span>
                    <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, color: 'rgba(var(--text-rgb),0.7)' }}>{b.pct}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'rgba(var(--fill-rgb),0.07)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${b.pct}%`,
                        height: '100%',
                        borderRadius: 999,
                        transition: reduceMotion ? 'none' : `width .8s ${t.EASE}`,
                        background:
                          b.pct < 70
                            ? `linear-gradient(90deg,${t.hexA(t.CORAL, 0.7)},${t.CORAL})`
                            : `linear-gradient(90deg,${t.accent},${t.accent2})`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ ...t.GLASS, borderRadius: 24, padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 9, background: `linear-gradient(135deg,${t.accent},${t.accent2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.ctaInk, fontWeight: 700, fontSize: 12 }}>AI</div>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Where to focus next</span>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'rgba(var(--text-rgb),0.7)', margin: 0 }}>
              {weakTopics.length
                ? <>You're solid on <strong style={{ color: t.OK }}>{topics[0].topic}</strong>. Marks slipped on{' '}
                    <strong style={{ color: t.CORAL }}>{weakTopics.join(', ')}</strong> — worth another practice set before the real paper.</>
                : <>Excellent — strong, consistent work across <strong style={{ color: t.OK }}>every topic</strong>. Keep the momentum going.</>}
            </p>
            <button
              disabled={genBusy}
              style={{ ...t.ghostBtn, marginTop: 16, opacity: genBusy ? 0.6 : 1 }}
              onClick={() => onPractice(weakTopics.length ? weakTopics : topics.slice(0, 3).map((x) => x.topic))}
            >
              {genBusy ? 'Generating…' : (weakTopics.length ? 'Generate practice on my weak topics →' : 'Generate a fresh practice set →')}
            </button>
          </div>
        </div>
      </div>

      {/* per-question review */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>Question review</div>
        {questions.map((q, i) => (
          <ReviewCard key={q.id} t={t} q={q} r={results[i]} studentAnswer={answers[q.id]} onAsk={() => onAsk(q)} onPractice={onPractice} genBusy={genBusy} />
        ))}
      </div>
    </div>
  )
}

// Indicative IB 1–7 grade from the marks percentage. Real IB boundaries
// vary by subject and session — this is guidance, not an official conversion.
function gradeBand(pct) {
  const p = pct * 100
  if (p >= 80) return 'IB grade 7'
  if (p >= 65) return 'IB grade 6'
  if (p >= 52) return 'IB grade 5'
  if (p >= 40) return 'IB grade 4'
  if (p >= 27) return 'IB grade 3'
  if (p >= 14) return 'IB grade 2'
  return 'IB grade 1'
}

function ReviewCard({ t, q, r, studentAnswer, onAsk, onPractice, genBusy }) {
  const [open, setOpen] = useState(false)
  const ok = r.correct
  const partial = !ok && r.score > 0
  const color = ok ? t.OK : partial ? '#FFB347' : t.CORAL
  const marks = Number(q.marks) || 1
  // Keep one decimal so a partial score (e.g. 0.5) doesn't display as full marks.
  const earned = Math.round(r.score * marks * 10) / 10
  const imgAns = isImageAnswer(studentAnswer)
  const given = imgAns ? '' : ((studentAnswer ?? '').toString().trim() || '—')

  return (
    <div style={{ ...t.GLASS, borderRadius: 20, padding: '20px 22px' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {/* status badge */}
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: t.hexA(color, 0.15),
            border: `1px solid ${t.hexA(color, 0.5)}`,
            color,
          }}
        >
          {ok ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.45 }}>{q.prompt}</div>
            <span style={{ fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.4)', whiteSpace: 'nowrap' }}>
              {q.topic} · {fmtMarks(earned)}/{marks} mark{marks === 1 ? '' : 's'}
            </span>
          </div>

          {/* answers */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12, alignItems: 'flex-start' }}>
            {imgAns ? (
              <div style={{ padding: '9px 13px', borderRadius: 12, background: t.hexA(ok ? t.OK : t.CORAL, 0.1), border: `1px solid ${t.hexA(ok ? t.OK : t.CORAL, 0.3)}` }}>
                <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.45)', marginBottom: 6 }}>Your answer · {studentAnswer.kind === 'photo' ? 'photo' : 'drawing'}</div>
                <img src={`data:${studentAnswer.media_type};base64,${studentAnswer.image}`} alt="Your answer" style={{ maxWidth: 240, maxHeight: 130, borderRadius: 8, display: 'block' }} />
              </div>
            ) : (
              <Tag label="Your answer" value={given} color={ok ? t.OK : t.CORAL} t={t} />
            )}
            <Tag label="Correct answer" value={q.correctAnswer} color={t.OK} t={t} />
          </div>

          {/* AI feedback */}
          <div style={{ marginTop: 12, fontSize: 13.5, color: 'rgba(var(--text-rgb),0.75)', lineHeight: 1.55 }}>
            <span style={{ color, fontWeight: 600 }}>{ok ? '✓ ' : partial ? '◐ ' : '✗ '}</span>
            {r.feedback}
            {r.errorStep ? <span style={{ color: t.CORAL }}> — {r.errorStep}</span> : null}
            <SourceTag source={r.source} t={t} />
            {r.needsReview && (
              <span style={{ marginLeft: 8, fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999, background: 'rgba(255,179,71,0.12)', border: '1px solid rgba(255,179,71,0.4)', color: '#FFB347', whiteSpace: 'nowrap' }}>
                Teacher will review
              </span>
            )}
          </div>

          {/* actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={() => setOpen((o) => !o)} style={navBtn(t, false)}>
              {open ? 'Hide working' : 'Show working'}
            </button>
            <button onClick={onAsk} style={{ ...t.ghostBtn }}>Ask AI 💡</button>
            <button disabled={genBusy} onClick={() => onPractice([q.topic], [q])} style={{ ...t.ghostBtn, opacity: genBusy ? 0.6 : 1 }}>Practise similar ↻</button>
          </div>

          {open && (
            <div
              style={{
                marginTop: 14,
                padding: '14px 16px',
                borderRadius: 14,
                background: 'rgba(var(--fill-rgb),0.04)',
                border: '1px solid rgba(var(--fill-rgb),0.08)',
                fontSize: 13.5,
                lineHeight: 1.65,
                color: 'rgba(var(--text-rgb),0.8)',
                animation: 'qgpop .2s ease both',
              }}
            >
              <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.4)', marginBottom: 8 }}>
                Worked solution
              </div>
              {q.workingNotes}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Tag({ label, value, color, t }) {
  return (
    <div style={{ padding: '9px 13px', borderRadius: 12, background: t.hexA(color, 0.1), border: `1px solid ${t.hexA(color, 0.3)}` }}>
      <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.45)' }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 15, marginTop: 3 }}>{value}</div>
    </div>
  )
}

function SourceTag({ source, t }) {
  const map = {
    ai: { label: 'AI graded', c: t.accent },
    local: { label: 'Auto-checked', c: 'rgba(var(--text-rgb),0.45)' },
    'local-fallback': { label: 'Offline check', c: '#FFB347' },
  }
  const s = map[source] || map.local
  return (
    <span
      style={{
        marginLeft: 8,
        fontSize: 10,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        padding: '2px 8px',
        borderRadius: 999,
        background: t.hexA(typeof s.c === 'string' && s.c.startsWith('#') ? s.c : t.accent, 0.12),
        border: `1px solid ${t.hexA(typeof s.c === 'string' && s.c.startsWith('#') ? s.c : t.accent, 0.3)}`,
        color: s.c,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  )
}
