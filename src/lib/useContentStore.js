import { useEffect, useState } from 'react'
import { EXAM_QUESTIONS, EXAM_META } from '../data/examQuestions.js'

// Shared store for teacher-authored content. Persisted to localStorage so what a
// teacher adds is still there after a reload (the only option on static hosting,
// since there's no backend). Exam-taking answers stay in React state.
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

export function useContentStore() {
  const [data, setData] = useState(load)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      /* ignore quota / privacy mode */
    }
  }, [data])

  const addExam = (exam) =>
    setData((d) => ({ ...d, customExams: [{ ...exam, id: rid('x'), builtin: false }, ...d.customExams] }))
  const updateExam = (id, patch) =>
    setData((d) => ({ ...d, customExams: d.customExams.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))
  const deleteExam = (id) =>
    setData((d) => ({ ...d, customExams: d.customExams.filter((e) => e.id !== id) }))
  // Attempts: every submitted exam is recorded so the teacher can moderate AI
  // marking and get class-level error insights. Capped to keep localStorage sane.
  const saveAttempt = (attempt) =>
    setData((d) => ({ ...d, attempts: [attempt, ...(d.attempts || [])].slice(0, 40) }))
  const updateAttemptItem = (attemptId, index, patch) =>
    setData((d) => ({
      ...d,
      attempts: (d.attempts || []).map((a) => {
        if (a.id !== attemptId) return a
        const items = a.items.map((it, i) => (i === index ? { ...it, ...patch } : it))
        const earnedMarks = items.reduce((s, it) => s + (Number(it.score) || 0) * (Number(it.marks) || 1), 0)
        return { ...a, items, earnedMarks: Math.round(earnedMarks * 10) / 10 }
      }),
    }))
  const clearAttempts = () => setData((d) => ({ ...d, attempts: [] }))

  const addAnnouncement = (a) =>
    setData((d) => ({ ...d, announcements: [{ ...a, id: rid('a'), date: Date.now() }, ...d.announcements] }))
  const deleteAnnouncement = (id) =>
    setData((d) => ({ ...d, announcements: d.announcements.filter((a) => a.id !== id) }))

  // AI practice sets: persisted so a generated set survives reload and can be
  // re-sat later. Capped to keep localStorage quota sane.
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

  return {
    exams: [builtinExam(), ...data.customExams],
    customExams: data.customExams,
    announcements: data.announcements,
    addExam,
    updateExam,
    deleteExam,
    addAnnouncement,
    deleteAnnouncement,
    attempts: data.attempts || [],
    saveAttempt,
    updateAttemptItem,
    clearAttempts,
    practiceSets: data.practiceSets || [],
    addPracticeSet,
    deletePracticeSet,
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

// Resolve an exam definition into a concrete question array the ExamModule can run.
export function resolveQuestions(exam) {
  const byId = Object.fromEntries(EXAM_QUESTIONS.map((q) => [q.id, q]))
  const seed = (exam.questionIds || []).map((id) => byId[id]).filter(Boolean)
  const custom = exam.customQuestions || []
  return [...seed, ...custom]
}

export function examMeta(exam) {
  return {
    title: exam.title,
    subject: exam.subject,
    subtitle: exam.builtin ? 'Mixed topics · No calculator' : 'Set by your teacher',
    description: exam.description || '',
    durationSeconds: (exam.durationMin || 20) * 60,
    passMark: Number(exam.passMark) >= 0 ? Number(exam.passMark) : 50,
  }
}

// total marks for an exam's resolved question list
export function totalMarks(questions) {
  return questions.reduce((s, q) => s + (Number(q.marks) || 1), 0)
}

// the seed bank teachers pick from
export const QUESTION_BANK = EXAM_QUESTIONS
