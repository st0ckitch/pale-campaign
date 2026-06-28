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

const SYSTEM =
  'You digitise photographed exam papers (which may span several images = pages) ' +
  'into structured data. Respond with ONLY valid JSON — a single object, no ' +
  'markdown fences, no commentary.'

const PROMPT =
  'These images are the pages of one exam paper, in order. Read ALL pages and ' +
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
  const list = Array.from(files).slice(0, 8) // cap pages to keep the request reasonable
  const images = []
  for (const f of list) images.push(await fileToImage(f))

  const text = await callAnthropic({
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } })),
          { type: 'text', text: PROMPT },
        ],
      },
    ],
    maxTokens: 4096,
    model: MODEL,
    signal,
  })

  const obj = parseObjectJSON(text)
  const questions = Array.isArray(obj.questions)
    ? obj.questions.filter((it) => it && it.prompt).map((it) => mapQuestion(it, subject))
    : []
  return {
    title: obj.title ? String(obj.title) : '',
    description: obj.description ? String(obj.description) : '',
    durationMin: Number(obj.durationMin) > 0 ? Math.round(Number(obj.durationMin)) : null,
    questions,
    pages: list.length,
  }
}
