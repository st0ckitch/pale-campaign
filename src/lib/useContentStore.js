import { useCallback, useEffect, useRef, useState } from 'react'
import { EXAM_QUESTIONS, EXAM_META } from '../data/examQuestions.js'
import { api } from './api.js'

// Shared store for teacher-authored content and recorded attempts.
//
// Two modes, same interface, so every consumer (Teacher, TeacherInsights,
// ExamsView, Home) works unchanged:
//   • local — everything in this browser's localStorage (static hosting; the
//     behaviour the app has always had).
//   • cloud — a backend (server/index.mjs) is reachable AND the user has an
//     identity: teacher content syncs school-wide, student attempts flow to
//     the teacher's moderation queue from any device.
const KEY = 'lh_store_v1'

const rid = (p) => p + Math.random().toString(36).slice(2, 9)

function builtinExam() {
  return {
    id: 'builtin-mock',
    title: EXAM_META.title,
    subject: 'Mathematics',
    durationMin: Math.round(EXAM_META.durationSeconds / 60),
    questionIds: EXAM_QUESTIONS.map((q) => q.id),
    builtin: true,
    due: 'Anytime',
    passMark: 50,
  }
}

function load() {
  if (typeof window === 'undefined') return { customExams: [], announcements: [], attempts: [], practiceSets: [] }
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        customExams: p.customExams || [],
        announcements: p.announcements || [],
        attempts: p.attempts || [],
        practiceSets: p.practiceSets || [],
      }
    }
  } catch {
    /* ignore */
  }
  return { customExams: [], announcements: [], attempts: [], practiceSets: [] }
}

export function useContentStore({ cloud = false, session = null, notify, onAuthError } = {}) {
  const [data, setData] = useState(load)
  const [cloudData, setCloudData] = useState({ classes: [], students: [], exams: [], announcements: [], attempts: [] })
  const [syncing, setSyncing] = useState(false)

  const mode =
    cloud && session?.role === 'teacher' ? 'cloud-teacher'
    : cloud && session?.role === 'student' ? 'cloud-student'
    : 'local'
  const token = session?.token || null

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      /* ignore quota / privacy mode */
    }
  }, [data])

  // Callbacks live in refs so `fail`/`refresh` keep a stable identity even if
  // a caller passes fresh closures each render — otherwise the refresh effect
  // re-fires per render, and a failing sync + its toast re-render feed each
  // other into an endless "Sync failed" loop.
  const notifyRef = useRef(notify)
  notifyRef.current = notify
  const authErrorRef = useRef(onAuthError)
  authErrorRef.current = onAuthError
  // Background sync errors surface once per failure streak, not per attempt.
  const syncErrorShown = useRef(false)

  // Surface failures without crashing UI flows; kick expired sessions back to
  // the login card.
  const fail = useCallback((err, what) => {
    console.error(`${what} failed:`, err)
    if (err?.status === 401 && authErrorRef.current) authErrorRef.current()
    else notifyRef.current?.(`${what} failed: ${err?.message || 'server unreachable'}`)
  }, [])

  const refresh = useCallback(async () => {
    if (mode === 'local') return
    setSyncing(true)
    try {
      if (mode === 'cloud-teacher') {
        const s = await api.teacherState(token)
        setCloudData({
          classes: s.classes || [],
          students: s.students || [],
          exams: s.exams || [],
          announcements: s.announcements || [],
          attempts: s.attempts || [],
        })
      } else {
        const s = await api.studentState(token)
        setCloudData((d) => ({ ...d, exams: s.exams || [], announcements: s.announcements || [] }))
      }
      syncErrorShown.current = false // back online — allow the next error through
    } catch (err) {
      if (err?.status === 401) {
        fail(err, 'Sync')
      } else if (!syncErrorShown.current) {
        syncErrorShown.current = true
        fail(err, 'Sync')
      } else {
        console.error('Sync failed (suppressed toast):', err)
      }
    } finally {
      setSyncing(false)
    }
  }, [mode, token, fail])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Re-sync when the tab regains focus, so a teacher sees fresh submissions
  // and students pick up newly published exams without a manual reload.
  useEffect(() => {
    if (mode === 'local' || typeof window === 'undefined') return
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [mode, refresh])

  // ---- exams ----------------------------------------------------------------
  const addExam = (exam) => {
    if (mode === 'cloud-teacher') {
      api.createExam(token, exam)
        .then((created) => setCloudData((d) => ({ ...d, exams: [created, ...d.exams] })))
        .catch((err) => fail(err, 'Publishing the exam'))
      return
    }
    setData((d) => ({ ...d, customExams: [{ ...exam, id: rid('x'), builtin: false }, ...d.customExams] }))
  }
  const updateExam = (id, patch) => {
    if (mode === 'cloud-teacher') {
      api.updateExam(token, id, patch)
        .then((updated) => setCloudData((d) => ({ ...d, exams: d.exams.map((e) => (e.id === id ? updated : e)) })))
        .catch((err) => fail(err, 'Updating the exam'))
      return
    }
    setData((d) => ({ ...d, customExams: d.customExams.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))
  }
  const deleteExam = (id) => {
    if (mode === 'cloud-teacher') {
      setCloudData((d) => ({ ...d, exams: d.exams.filter((e) => e.id !== id) }))
      api.deleteExam(token, id).catch((err) => fail(err, 'Deleting the exam'))
      return
    }
    setData((d) => ({ ...d, customExams: d.customExams.filter((e) => e.id !== id) }))
  }

  // ---- attempts ---------------------------------------------------------------
  // Every submitted exam is recorded so the teacher can moderate AI marking and
  // get class-level error insights. In cloud mode the attempt goes to the
  // server (any device); locally it's capped to keep localStorage sane.
  const saveAttemptLocal = (attempt) =>
    setData((d) => ({ ...d, attempts: [attempt, ...(d.attempts || [])].slice(0, 40) }))
  const saveAttempt = (attempt) => {
    if (mode === 'cloud-student') {
      // The server stamps the student's identity from their session token.
      api.postAttempt(token, attempt).catch((err) => {
        saveAttemptLocal({ ...attempt, student: session.name || session.id })
        fail(err, 'Sending your result to the teacher')
      })
      return
    }
    if (mode === 'cloud-teacher') {
      // A teacher sitting an exam themselves (e.g. "view as student") still
      // records locally — their own attempt isn't class data.
      saveAttemptLocal(attempt)
      return
    }
    saveAttemptLocal(attempt)
  }
  const updateAttemptItem = (attemptId, index, patch) => {
    if (mode === 'cloud-teacher') {
      api.patchAttemptItem(token, attemptId, index, patch)
        .then((updated) =>
          setCloudData((d) => ({ ...d, attempts: d.attempts.map((a) => (a.id === attemptId ? updated : a)) })),
        )
        .catch((err) => fail(err, 'Saving the mark override'))
      return
    }
    setData((d) => ({
      ...d,
      attempts: (d.attempts || []).map((a) => {
        if (a.id !== attemptId) return a
        const items = a.items.map((it, i) => (i === index ? { ...it, ...patch } : it))
        const earnedMarks = items.reduce((s, it) => s + (Number(it.score) || 0) * (Number(it.marks) || 1), 0)
        return { ...a, items, earnedMarks: Math.round(earnedMarks * 10) / 10 }
      }),
    }))
  }
  const clearAttempts = () => {
    if (mode === 'cloud-teacher') {
      setCloudData((d) => ({ ...d, attempts: [] }))
      api.clearAttempts(token).catch((err) => fail(err, 'Clearing attempts'))
      return
    }
    setData((d) => ({ ...d, attempts: [] }))
  }

  // ---- announcements ----------------------------------------------------------
  const addAnnouncement = (a) => {
    if (mode === 'cloud-teacher') {
      api.postAnnouncement(token, a)
        .then((created) => setCloudData((d) => ({ ...d, announcements: [created, ...d.announcements] })))
        .catch((err) => fail(err, 'Posting the announcement'))
      return
    }
    setData((d) => ({ ...d, announcements: [{ ...a, id: rid('a'), date: Date.now() }, ...d.announcements] }))
  }
  const deleteAnnouncement = (id) => {
    if (mode === 'cloud-teacher') {
      setCloudData((d) => ({ ...d, announcements: d.announcements.filter((a) => a.id !== id) }))
      api.deleteAnnouncement(token, id).catch((err) => fail(err, 'Deleting the announcement'))
      return
    }
    setData((d) => ({ ...d, announcements: d.announcements.filter((a) => a.id !== id) }))
  }

  // ---- classes & students (cloud-teacher only) ------------------------------------
  const addClass = (name) => {
    if (mode !== 'cloud-teacher') return
    api.createClass(token, name)
      .then((cls) => setCloudData((d) => ({ ...d, classes: [...d.classes, cls] })))
      .catch((err) => fail(err, 'Creating the class'))
  }
  const deleteClass = (id) => {
    if (mode !== 'cloud-teacher') return
    setCloudData((d) => ({ ...d, classes: d.classes.filter((c) => c.id !== id) }))
    api.deleteClass(token, id).catch((err) => fail(err, 'Removing the class'))
  }

  // These return promises so the Students panel can show the generated
  // one-time password and invite link.
  const addStudent = (payload) => {
    if (mode !== 'cloud-teacher') return Promise.reject(new Error('not connected to the school server'))
    return api.addStudent(token, payload).then((r) => {
      setCloudData((d) => ({ ...d, students: [...d.students, r.student] }))
      return r
    })
  }
  const reinviteStudent = (id) => {
    if (mode !== 'cloud-teacher') return Promise.reject(new Error('not connected to the school server'))
    return api.reinviteStudent(token, id).then((r) => {
      setCloudData((d) => ({ ...d, students: d.students.map((s) => (s.id === id ? r.student : s)) }))
      return r
    })
  }
  const deleteStudent = (id) => {
    if (mode !== 'cloud-teacher') return
    setCloudData((d) => ({ ...d, students: d.students.filter((s) => s.id !== id) }))
    api.deleteStudent(token, id).catch((err) => fail(err, 'Removing the student'))
  }

  // ---- practice sets: always personal, always local -----------------------------
  const addPracticeSet = (set) => {
    const id = rid('p')
    setData((d) => ({
      ...d,
      practiceSets: [{ ...set, id, createdAt: Date.now() }, ...(d.practiceSets || [])].slice(0, 12),
    }))
    return id
  }
  const deletePracticeSet = (id) =>
    setData((d) => ({ ...d, practiceSets: (d.practiceSets || []).filter((p) => p.id !== id) }))

  const isCloud = mode !== 'local'
  const customExams = isCloud ? cloudData.exams : data.customExams
  return {
    mode,
    syncing,
    refresh,
    exams: [builtinExam(), ...customExams],
    customExams,
    announcements: isCloud ? cloudData.announcements : data.announcements,
    addExam,
    updateExam,
    deleteExam,
    addAnnouncement,
    deleteAnnouncement,
    attempts: mode === 'cloud-teacher' ? cloudData.attempts : data.attempts || [],
    saveAttempt,
    updateAttemptItem,
    clearAttempts,
    classes: mode === 'cloud-teacher' ? cloudData.classes : [],
    addClass,
    deleteClass,
    students: mode === 'cloud-teacher' ? cloudData.students : [],
    addStudent,
    reinviteStudent,
    deleteStudent,
    practiceSets: data.practiceSets || [],
    addPracticeSet,
    deletePracticeSet,
  }
}

// The exam's questions exactly as authored (multi-part questions intact) —
// what the teacher's editor works on.
export function rawQuestions(exam) {
  const byId = Object.fromEntries(EXAM_QUESTIONS.map((q) => [q.id, q]))
  const seed = (exam.questionIds || []).map((id) => byId[id]).filter(Boolean)
  const custom = exam.customQuestions || []
  return [...seed, ...custom]
}

// Marks carried by one authored question (sum of its parts, or its own marks).
export function questionMarks(q) {
  if (Array.isArray(q.parts) && q.parts.length) {
    return q.parts.reduce((s, p) => s + (Number(p.marks) || 1), 0)
  }
  return Number(q.marks) || 1
}

// Resolve an exam definition into the flat question array the ExamModule runs:
// a multi-part question becomes consecutive items sharing a stem, labelled
// 2(a), 2(b)… so grading, navigation and attempts stay per-part.
export function resolveQuestions(exam) {
  const out = []
  let n = 0
  for (const q of rawQuestions(exam)) {
    n++
    if (Array.isArray(q.parts) && q.parts.length) {
      q.parts.forEach((p, i) => {
        const letter = p.key || String.fromCharCode(97 + i)
        out.push({
          id: `${q.id}__${letter}`,
          type: 'text',
          subject: q.subject,
          topic: q.topic,
          stem: q.prompt,
          partLabel: letter,
          displayLabel: `${n}(${letter})`,
          prompt: p.prompt || '',
          latex: p.latex || '',
          marks: Number(p.marks) || 1,
          correctAnswer: p.correctAnswer || '',
          acceptedAnswers: p.acceptedAnswers || [],
          markScheme: p.markScheme,
          workingNotes: p.workingNotes || q.workingNotes || '',
        })
      })
    } else {
      out.push({ ...q, displayLabel: String(n) })
    }
  }
  return out
}

export function examMeta(exam) {
  return {
    title: exam.title,
    subject: exam.subject,
    subtitle: exam.builtin ? 'Mixed topics · No calculator' : 'Set by your teacher',
    description: exam.description || '',
    durationSeconds: (exam.durationMin || 20) * 60,
    passMark: Number(exam.passMark) >= 0 ? Number(exam.passMark) : 50,
    boundaries: exam.boundaries || null,
    paper: exam.paper || null,
  }
}

// Resolve a stored practice set into the meta shape ExamModule expects.
export function practiceMeta(p) {
  return {
    title: p.title,
    subject: p.subject,
    subtitle: 'AI practice set',
    description: p.description || 'Fresh AI-generated questions, similar in style to your exam.',
    durationSeconds: (Number(p.durationMin) || 10) * 60,
    passMark: Number(p.passMark) >= 0 ? Number(p.passMark) : 50,
  }
}

// total marks for an exam's resolved question list
export function totalMarks(questions) {
  return questions.reduce((s, q) => s + (Number(q.marks) || 1), 0)
}

// the seed bank teachers pick from
export const QUESTION_BANK = EXAM_QUESTIONS
