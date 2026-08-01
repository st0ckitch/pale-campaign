import { callAnthropic } from './anthropic.js'
import { MODEL } from './config.js'

const rid = (p) => p + Math.random().toString(36).slice(2, 9)

// Tolerant JSON-array parse (strips fences, brace-matches each object, skips a
// truncated/malformed one) — same idea as the scanner's salvage parser.
function parseArray(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const s = t.indexOf('[')
  if (s < 0) throw new Error('no array')
  const body = t.slice(s + 1)
  const objs = []
  let depth = 0
  let start = -1
  let inStr = false
  let esc = false
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') { if (depth === 0) start = i; depth++ }
    else if (c === '}') { depth--; if (depth === 0 && start >= 0) { try { objs.push(JSON.parse(body.slice(start, i + 1))) } catch { /* skip */ } start = -1 } }
    else if (c === ']' && depth === 0) break
  }
  return objs
}

function mapQ(it, subject) {
  const prompt = String(it.prompt || '').trim()
  if (!prompt) return null
  const topic = (it.topic || subject || 'General').toString()
  const marks = Math.max(1, Math.round(Number(it.marks) || 1))
  const latex = typeof it.latex === 'string' ? it.latex.trim() : ''
  if (it.type === 'mcq' && Array.isArray(it.options) && it.options.length >= 2) {
    const options = it.options.map((o) => String(o))
    let correct = String(it.correctAnswer ?? '')
    if (!options.includes(correct)) {
      const ci = options.find((o) => o.toLowerCase().trim() === correct.toLowerCase().trim())
      correct = ci || options[0]
    }
    return { id: rid('gen'), type: 'mcq', subject, topic, prompt, latex, options, correctAnswer: correct, acceptedAnswers: [], marks, workingNotes: it.markScheme || `Correct answer: ${correct}` }
  }
  const model = String(it.correctAnswer ?? '').trim()
  // Accepted equivalent forms let Layer-1 grading match offline; always include
  // the model answer itself.
  const acceptedAnswers = [
    ...new Set(
      [model, ...(Array.isArray(it.acceptedAnswers) ? it.acceptedAnswers : [])]
        .map((s) => String(s).trim())
        .filter(Boolean),
    ),
  ]
  return { id: rid('gen'), type: 'text', subject, topic, prompt, latex, correctAnswer: model, acceptedAnswers, markScheme: it.markScheme ? String(it.markScheme) : '', marks, workingNotes: it.markScheme ? String(it.markScheme) : model ? `Model answer: ${model}` : 'AI practice question.' }
}

// Generate `count` fresh questions similar in style/format/difficulty to `seeds`,
// focused on `topics`. Returns question objects ready for the ExamModule.
export async function generateSimilar({ seeds = [], topics = [], subject = 'General', count = 5, signal } = {}) {
  const examples = seeds.slice(0, 6).map((q, i) => {
    const opts = q.options && q.options.length ? ` Options: ${q.options.join(' | ')}.` : ''
    return `${i + 1}. [${q.topic || subject}] ${q.prompt}${opts} (answer: ${q.correctAnswer})`
  }).join('\n')
  const topicList = topics.length ? topics.join(', ') : subject

  const system =
    'You are an expert exam author. You write fresh practice questions that match ' +
    'the style, format and difficulty of the given examples, and always provide a ' +
    'correct answer and brief marking guidance. Respond with ONLY a JSON array.'
  const user =
    `Subject: ${subject}\nExample questions:\n${examples || '(none)'}\n\n` +
    `Write ${count} NEW practice questions focused on: ${topicList}. Keep a similar mix ` +
    'of multiple-choice and written questions and the same difficulty as the examples, ' +
    'but make them genuinely different (new numbers, scenarios) — not copies. ' +
    'Return ONLY a JSON array. Each item: { "type": "mcq" or "text", "topic": string, ' +
    '"prompt": string (plain text, readable notation like x^2 and 3/4), ' +
    '"latex": a clean KaTeX rendering of the key expression/equation, or "" if the question is prose-only, ' +
    '"options": [strings] (mcq only), "correctAnswer": (mcq: exact ' +
    'correct option text; text: a concise model answer), ' +
    '"acceptedAnswers": (text only) 3-5 equivalent accepted forms of the final answer ' +
    '(e.g. for x = 1/2: ["x = 1/2", "1/2", "0.5", "x = 0.5"]), ' +
    '"markScheme": brief notes or null, "marks": integer }.'

  const text = await callAnthropic({ system, messages: [{ role: 'user', content: user }], maxTokens: 4096, model: MODEL, signal })
  return parseArray(text).map((it) => mapQ(it, subject)).filter(Boolean)
}
