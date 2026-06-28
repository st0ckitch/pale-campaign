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
  }
}

function load() {
  if (typeof window === 'undefined') return { customExams: [], announcements: [] }
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return { customExams: p.customExams || [], announcements: p.announcements || [] }
    }
  } catch {
    /* ignore */
  }
  return { customExams: [], announcements: [] }
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
  const addAnnouncement = (a) =>
    setData((d) => ({ ...d, announcements: [{ ...a, id: rid('a'), date: Date.now() }, ...d.announcements] }))
  const deleteAnnouncement = (id) =>
    setData((d) => ({ ...d, announcements: d.announcements.filter((a) => a.id !== id) }))

  return {
    exams: [builtinExam(), ...data.customExams],
    customExams: data.customExams,
    announcements: data.announcements,
    addExam,
    updateExam,
    deleteExam,
    addAnnouncement,
    deleteAnnouncement,
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
  }
}

// total marks for an exam's resolved question list
export function totalMarks(questions) {
  return questions.reduce((s, q) => s + (Number(q.marks) || 1), 0)
}

// the seed bank teachers pick from
export const QUESTION_BANK = EXAM_QUESTIONS
