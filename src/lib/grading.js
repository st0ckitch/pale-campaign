import { callAnthropic, AIUnavailableError } from './anthropic.js'
import { MODEL } from './config.js'

// ===========================================================================
// LAYER 1 — Local normalization & equivalence (no API, always runs)
// ===========================================================================
// Catches the obvious cases offline and is the reliable fallback when the AI
// is unreachable.

// Map common unicode math to ascii so "x²" and "x^2" compare equal.
function unifyNotation(s) {
  return String(s)
    .replace(/[–—−]/g, '-') // various dashes -> minus
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/⁰/g, '^0').replace(/¹/g, '^1').replace(/²/g, '^2').replace(/³/g, '^3')
    .replace(/⁴/g, '^4').replace(/⁵/g, '^5').replace(/⁶/g, '^6').replace(/⁷/g, '^7')
    .replace(/⁸/g, '^8').replace(/⁹/g, '^9')
    .replace(/√/g, 'sqrt')
    .replace(/π/g, 'pi')
}

// Aggressive canonical form for string comparison: lowercase, strip all
// whitespace, normalise notation, drop a leading "<var> =" assignment.
export function canonical(s) {
  let out = unifyNotation(s).toLowerCase().trim()
  out = out.replace(/\s+/g, '')
  // strip a single leading variable assignment, e.g. "x=3" -> "3", "y=2x+1" stays meaningful
  out = out.replace(/^[a-z]=/, '')
  // remove a trailing solitary period
  out = out.replace(/\.$/, '')
  return out
}

const UNIT_RE = /(cm\^?[23]?|mm\^?[23]?|m\^?[23]?|km|kg|g|s|°|deg|degrees?|%|cm|m)$/i

// Parse a numeric value out of an answer that may carry a unit or be a
// fraction. Returns { value, unit } or null if not purely numeric.
export function parseNumeric(s) {
  let str = unifyNotation(s).toLowerCase().trim().replace(/\s+/g, '')
  str = str.replace(/^[a-z]=/, '') // drop "x="
  str = str.replace(/,/g, '') // thousands separators

  let unit = ''
  const um = str.match(UNIT_RE)
  if (um) {
    unit = um[0].replace(/^\^/, '')
    str = str.slice(0, str.length - um[0].length)
  }
  if (str === '') return null

  // fraction a/b
  const frac = str.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/)
  if (frac) {
    const denom = parseFloat(frac[2])
    if (denom === 0) return null
    return { value: parseFloat(frac[1]) / denom, unit }
  }
  // plain number incl. ".5"
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(str)) {
    return { value: parseFloat(str), unit }
  }
  return null
}

function unitsCompatible(a, b) {
  if (!a || !b) return true // one side gave no unit -> don't penalise here
  const norm = (u) => u.replace(/degrees?|deg/, '°').replace(/\^/, '')
  return norm(a) === norm(b)
}

// Layer-1 decision for a free-text answer.
// Returns { correct, matchedBy } where matchedBy is 'string' | 'numeric' | null.
export function checkLocally(studentRaw, acceptedAnswers = []) {
  const student = String(studentRaw ?? '').trim()
  if (!student) return { correct: false, matchedBy: null }

  const studentCanon = canonical(student)
  const studentNum = parseNumeric(student)

  for (const acc of acceptedAnswers) {
    if (canonical(acc) === studentCanon) return { correct: true, matchedBy: 'string' }
    const accNum = parseNumeric(acc)
    if (
      studentNum &&
      accNum &&
      Math.abs(studentNum.value - accNum.value) < 1e-6 &&
      unitsCompatible(studentNum.unit, accNum.unit)
    ) {
      return { correct: true, matchedBy: 'numeric' }
    }
  }
  return { correct: false, matchedBy: null }
}

// ===========================================================================
// LAYER 2 — AI semantic grading
// ===========================================================================

const GRADER_SYSTEM =
  'You are a precise, fair exam grader across all subjects (maths, sciences, ' +
  'humanities, languages). Decide whether the student answer is correct for the ' +
  'given question, judged against the expected answer / mark scheme. For maths, ' +
  'accept any mathematically equivalent form (fractions, decimals, factored vs ' +
  'expanded, with/without units). For written subjects, give credit when the ' +
  'answer conveys the required ideas even if worded differently or with minor ' +
  'spelling slips, and award partial credit for partially correct answers. ' +
  'Respond with ONLY the JSON object, no other text.'

// Defensive JSON parse: strips markdown fences / stray prose around the object.
export function parseGraderJSON(text) {
  if (!text) throw new Error('empty')
  let t = text.trim()
  // remove ```json ... ``` fences
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  // grab the first {...} block
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no json object')
  const obj = JSON.parse(t.slice(start, end + 1))
  return {
    correct: !!obj.correct,
    equivalent: obj.equivalent !== undefined ? !!obj.equivalent : !!obj.correct,
    score: typeof obj.score === 'number' ? Math.max(0, Math.min(1, obj.score)) : obj.correct ? 1 : 0,
    feedback: typeof obj.feedback === 'string' ? obj.feedback : '',
    errorStep: obj.errorStep == null || obj.errorStep === 'null' ? null : String(obj.errorStep),
  }
}

// Grade a single free-text answer. Always returns a result object; never
// throws. `local` is the Layer-1 result used as the fallback.
async function gradeTextWithAI(question, studentAnswer, local, signal) {
  const subject = question.subject ? `Subject: ${question.subject}\n` : ''
  const scheme = question.markScheme ? `Mark scheme: ${question.markScheme}\n` : ''
  const user =
    subject +
    `Question: ${question.prompt}\n` +
    `Expected answer: ${question.correctAnswer}\n` +
    scheme +
    `Student's answer: ${studentAnswer}\n\n` +
    'Return ONLY this JSON: ' +
    '{ "correct": true/false, "equivalent": true/false, "score": 0-1, ' +
    '"feedback": "one sentence", "errorStep": "where they went wrong or null" }'

  const text = await callAnthropic({
    system: GRADER_SYSTEM,
    messages: [{ role: 'user', content: user }],
    maxTokens: 1000,
    model: MODEL,
    signal,
  })
  return parseGraderJSON(text)
}

// ===========================================================================
// Public: grade one question (handles MCQ + text, both layers, fallbacks)
// ===========================================================================
export async function gradeQuestion(question, studentAnswer, signal) {
  const answered = studentAnswer != null && String(studentAnswer).trim() !== ''

  // ---- MCQ: deterministic ----
  if (question.type === 'mcq') {
    const correct = answered && studentAnswer === question.correctAnswer
    return {
      id: question.id,
      answered,
      correct,
      score: correct ? 1 : 0,
      source: 'local',
      feedback: !answered
        ? 'No answer selected.'
        : correct
          ? 'Correct.'
          : `Not quite — the correct option is "${question.correctAnswer}".`,
      errorStep: null,
    }
  }

  // ---- TEXT: Layer 1 always, Layer 2 when reachable ----
  const local = checkLocally(studentAnswer, question.acceptedAnswers)

  if (!answered) {
    return {
      id: question.id,
      answered: false,
      correct: false,
      score: 0,
      source: 'local',
      feedback: 'No answer entered.',
      errorStep: null,
    }
  }

  // If Layer 1 already confirms a match, we can trust it — but still ask AI for
  // a one-line of feedback opportunistically. To keep grading snappy and robust
  // we only call AI when Layer 1 is uncertain (not a clean match).
  if (local.correct) {
    return {
      id: question.id,
      answered: true,
      correct: true,
      score: 1,
      source: 'local',
      feedback: 'Correct — equivalent to the expected answer.',
      errorStep: null,
    }
  }

  try {
    const ai = await gradeTextWithAI(question, studentAnswer, local, signal)
    return {
      id: question.id,
      answered: true,
      correct: ai.correct || ai.equivalent,
      score: ai.score,
      source: 'ai',
      feedback: ai.feedback || (ai.correct ? 'Correct.' : 'Not quite.'),
      errorStep: ai.errorStep,
    }
  } catch (err) {
    // Fall back to Layer 1 result on any AI/parse failure.
    const isUnavailable = err instanceof AIUnavailableError
    return {
      id: question.id,
      answered: true,
      correct: local.correct,
      score: local.correct ? 1 : 0,
      source: 'local-fallback',
      feedback: local.correct
        ? 'Correct.'
        : isUnavailable
          ? `Marked using offline checking (AI unavailable). Expected: ${question.correctAnswer}.`
          : `Not quite. Expected: ${question.correctAnswer}.`,
      errorStep: null,
    }
  }
}
