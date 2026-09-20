import { callAnthropic } from './anthropic.js'
import { MODEL } from './config.js'

// ---------------------------------------------------------------------------
// Answer-key verification. For each question the model solves the question
// from scratch FIRST, then compares its own answer with the recorded key —
// this catches keys the scanner guessed wrong (scanned papers usually carry
// no answer key, so the AI derived them at import time).
// ---------------------------------------------------------------------------

const SYSTEM =
  'You are a meticulous examiner who audits exam answer keys across all ' +
  'subjects. You always solve the question independently before looking at ' +
  'the recorded key, and you are not afraid to say the key is wrong. ' +
  'Respond with ONLY a valid JSON object, no markdown fences, no commentary.'

const hasParts = (q) => Array.isArray(q.parts) && q.parts.length > 0

function promptFor(q, subject) {
  const head =
    `Subject: ${q.subject || subject || 'General'}\n` +
    `Question: ${q.prompt}\n`

  if (hasParts(q)) {
    const partLines = q.parts.map((p, i) => {
      const letter = p.label || String.fromCharCode(97 + i)
      const key = String(p.correctAnswer ?? '').trim()
      return `(${letter}) ${p.prompt}\n    Recorded key for (${letter}): ${key ? `"${key}"` : '(none recorded)'}` +
        (p.markScheme ? `\n    Mark scheme note: ${p.markScheme}` : '')
    }).join('\n')
    return (
      head + 'Parts:\n' + partLines + '\n\n' +
      'For EACH part: solve it yourself from scratch first (do NOT assume the recorded key is right), then compare with that part\'s recorded key.\n' +
      'Return ONLY this JSON: { "parts": [ { "part": the letter, ' +
      '"myAnswer": your own concise answer, ' +
      '"agrees": true/false — true only if the recorded key is correct or fully equivalent, ' +
      '"note": "one short sentence on any discrepancy, or empty string", ' +
      '"confidence": 0-1 } ] }'
    )
  }

  const opts = q.type === 'mcq' && Array.isArray(q.options) && q.options.length
    ? 'Options:\n' + q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n') + '\n'
    : ''
  const key = String(q.correctAnswer ?? '').trim()
  return (
    head + opts +
    (q.markScheme ? `Mark scheme note: ${q.markScheme}\n` : '') +
    '\nStep 1 — solve this question yourself, from scratch. Do NOT assume the recorded key below is right.\n' +
    `Step 2 — compare your answer with the recorded answer key: ${key ? `"${key}"` : '(none recorded)'}\n\n` +
    'Return ONLY this JSON: { ' +
    `"myAnswer": ${q.type === 'mcq' ? 'the exact text of the option you chose' : 'your own concise answer'}, ` +
    '"agrees": true/false — true only if the recorded key is correct or fully equivalent to your answer, ' +
    '"note": "one short sentence explaining any discrepancy, or empty string", ' +
    '"confidence": how certain you are in your own answer, 0-1 }'
  )
}

function parseJSONObject(text) {
  if (!text) throw new Error('empty')
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no json object')
  return JSON.parse(t.slice(start, end + 1))
}

const clamp01 = (v) => (typeof v === 'number' ? Math.max(0, Math.min(1, v)) : null)

// Turn a raw model reply into { status, myAnswer, note, confidence } for one question.
function toResult(q, obj) {
  if (hasParts(q)) {
    const arr = Array.isArray(obj.parts) ? obj.parts : []
    const bad = []
    let conf = null
    for (let i = 0; i < q.parts.length; i++) {
      const letter = q.parts[i].label || String.fromCharCode(97 + i)
      const v = arr.find((x) => String(x.part || '').toLowerCase().replace(/[()]/g, '') === String(letter).toLowerCase()) || arr[i]
      const keyMissing = String(q.parts[i].correctAnswer ?? '').trim() === ''
      if (!v) { bad.push(`(${letter}): no verdict returned`); continue }
      const c = clamp01(v.confidence)
      if (c !== null) conf = conf === null ? c : Math.min(conf, c)
      if (keyMissing) bad.push(`(${letter}): no key recorded — AI's answer: ${String(v.myAnswer ?? '').trim()}`)
      else if (!v.agrees) bad.push(`(${letter}): AI's answer: ${String(v.myAnswer ?? '').trim()}${v.note ? ` — ${v.note}` : ''}`)
    }
    if (bad.length) return { status: 'mismatch', myAnswer: '', note: bad.join(' · '), confidence: conf }
    return { status: conf !== null && conf < 0.7 ? 'unsure' : 'ok', myAnswer: '', note: '', confidence: conf }
  }

  const myAnswer = String(obj.myAnswer ?? '').trim()
  const note = typeof obj.note === 'string' ? obj.note : ''
  const confidence = clamp01(obj.confidence)
  const hasKey = String(q.correctAnswer ?? '').trim() !== ''
  const status = !hasKey || !obj.agrees
    ? 'mismatch'
    : confidence !== null && confidence < 0.7
      ? 'unsure'
      : 'ok'
  return { status, myAnswer, confidence, note: hasKey ? note : (note || 'No answer key recorded for this question.') }
}

// Verify a list of questions. Returns { [question.id]: result } where result is
// { status: 'ok' | 'mismatch' | 'unsure' | 'error', myAnswer, note, confidence }.
// Runs a few checks in parallel; onProgress(done, total) fires after each one.
export async function verifyQuestions(questions, subject, { onProgress, signal } = {}) {
  const results = {}
  const queue = questions.slice()
  const total = questions.length
  let done = 0

  async function worker() {
    while (queue.length) {
      const q = queue.shift()
      try {
        const text = await callAnthropic({
          system: SYSTEM,
          messages: [{ role: 'user', content: promptFor(q, subject) }],
          maxTokens: hasParts(q) ? 1500 : 700,
          temperature: 0,
          model: MODEL,
          signal,
        })
        results[q.id] = toResult(q, parseJSONObject(text))
      } catch (err) {
        results[q.id] = { status: 'error', myAnswer: '', confidence: null, note: err?.message || 'Check failed' }
      }
      done++
      onProgress?.(done, total)
    }
  }

  await Promise.all(Array.from({ length: Math.min(3, Math.max(1, total)) }, worker))
  return results
}
