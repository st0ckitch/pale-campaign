import { callAnthropic } from './anthropic.js'
import { MODEL } from './config.js'

// Downscale an image File to a JPEG base64 payload for the Anthropic vision API.
export async function fileToImage(file, maxDim = 1568, quality = 0.82) {
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result)
    fr.onerror = rej
    fr.readAsDataURL(file)
  })
  const img = await new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = rej
    im.src = dataUrl
  })
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(img, 0, 0, w, h)
  return { media_type: 'image/jpeg', data: canvas.toDataURL('image/jpeg', quality).split(',')[1] }
}

// Read any file to raw base64 (used for PDFs, which Claude can read directly).
export async function fileToBase64(file) {
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result)
    fr.onerror = rej
    fr.readAsDataURL(file)
  })
  return String(dataUrl).split(',')[1]
}

const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')

const SYSTEM =
  'You digitise photographed exam papers (which may span several images = pages) ' +
  'into structured data. Respond with ONLY valid JSON — a single object, no ' +
  'markdown fences, no commentary.'

const PROMPT =
  'The attached file(s) are one exam paper — images and/or a PDF, in order. Read ALL pages and ' +
  'return ONLY this JSON object:\n' +
  '{\n' +
  '  "title": exam name/title or null,\n' +
  '  "description": exam description or instructions for students, or null,\n' +
  '  "durationMin": time allowed in minutes if stated, else null,\n' +
  '  "questions": [ {\n' +
  '    "type": "mcq" or "text",\n' +
  '    "topic": short topic string,\n' +
  '    "prompt": the full question text,\n' +
  '    "options": [strings] (multiple-choice only),\n' +
  '    "correctAnswer": for mcq the exact text of the correct option; for written a concise model answer,\n' +
  '    "markScheme": brief marking notes or null,\n' +
  '    "marks": integer marks for this question (use what the paper shows, else 1)\n' +
  '  } ]\n' +
  '}\n' +
  'Use answers shown on the paper if present; otherwise work them out yourself. ' +
  'Capture every question across every page. Keep mathematical notation as ' +
  'readable plain text (e.g. x^2, 3/4). Output JSON only.'

function parseObjectJSON(text) {
  if (!text) throw new Error('empty')
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no json object')
  return JSON.parse(t.slice(start, end + 1))
}

// Pull every top-level {...} object out of an array body, parsing each on its
// own. Tolerant of truncation and missing commas — a malformed/cut-off object
// is simply skipped, so we still recover all the complete questions.
function extractObjects(body) {
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

// Best-effort recovery when strict JSON parsing fails (truncated / malformed).
export function salvageExam(text) {
  const grab = (key) => {
    const m = text.match(new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'))
    return m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ') : ''
  }
  const dm = text.match(/"durationMin"\s*:\s*(\d+)/)
  const qi = text.indexOf('"questions"')
  let questions = []
  if (qi >= 0) {
    const br = text.indexOf('[', qi)
    if (br >= 0) questions = extractObjects(text.slice(br + 1))
  }
  return { title: grab('title'), description: grab('description'), durationMin: dm ? Number(dm[1]) : null, questions }
}

const rid = (p) => p + Math.random().toString(36).slice(2, 9)

function mapQuestion(it, subject) {
  const topic = (it.topic || subject || 'General').toString()
  const prompt = String(it.prompt).trim()
  const marks = Math.max(1, Math.round(Number(it.marks) || 1))
  if (it.type === 'mcq' && Array.isArray(it.options) && it.options.length >= 2) {
    const options = it.options.map((o) => String(o))
    let correct = String(it.correctAnswer ?? '')
    if (!options.includes(correct)) {
      const ci = options.find((o) => o.toLowerCase().trim() === correct.toLowerCase().trim())
      correct = ci || options[0]
    }
    return { id: rid('sc'), type: 'mcq', subject, topic, prompt, latex: '', options, correctAnswer: correct, acceptedAnswers: [], marks, workingNotes: it.markScheme || 'Imported from a scanned paper.' }
  }
  const model = String(it.correctAnswer ?? '').trim()
  return {
    id: rid('sc'), type: 'text', subject, topic, prompt, latex: '',
    correctAnswer: model, acceptedAnswers: [], markScheme: it.markScheme ? String(it.markScheme) : '', marks,
    workingNotes: it.markScheme ? String(it.markScheme) : model ? `Model answer: ${model}` : 'Imported from a scanned paper.',
  }
}

// Scan one or more page images into { title, description, durationMin, questions[] }.
export async function scanPaper(files, subject, signal) {
  const list = Array.from(files).slice(0, 8) // cap files to keep the request reasonable
  const blocks = []
  for (const f of list) {
    if (isPdf(f)) {
      const data = await fileToBase64(f)
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } })
    } else {
      const im = await fileToImage(f)
      blocks.push({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } })
    }
  }

  const text = await callAnthropic({
    system: SYSTEM,
    messages: [{ role: 'user', content: [...blocks, { type: 'text', text: PROMPT }] }],
    maxTokens: 8192,
    model: MODEL,
    signal,
  })

  // Strict parse first; if the model's JSON is truncated/malformed (long papers),
  // fall back to a tolerant salvage that recovers every complete question.
  let obj
  try {
    obj = parseObjectJSON(text)
  } catch {
    obj = salvageExam(text)
  }
  if (!Array.isArray(obj.questions) || obj.questions.length === 0) {
    const salvaged = salvageExam(text)
    if (salvaged.questions.length) obj = { ...obj, ...salvaged, questions: salvaged.questions }
  }
  const questions = (Array.isArray(obj.questions) ? obj.questions : [])
    .filter((it) => it && it.prompt)
    .map((it) => mapQuestion(it, subject))
  return {
    title: obj.title ? String(obj.title) : '',
    description: obj.description ? String(obj.description) : '',
    durationMin: Number(obj.durationMin) > 0 ? Math.round(Number(obj.durationMin)) : null,
    questions,
    pages: list.length,
  }
}
