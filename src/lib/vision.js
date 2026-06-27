import { callAnthropic } from './anthropic.js'
import { MODEL } from './config.js'

// Downscale an image File to a JPEG base64 payload suitable for the Anthropic
// vision API (keeps the request small and within size limits).
export async function fileToImage(file, maxDim = 1568, quality = 0.85) {
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
  const out = canvas.toDataURL('image/jpeg', quality)
  return { media_type: 'image/jpeg', data: out.split(',')[1] }
}

const SYSTEM =
  'You convert photographed exam papers / worksheets into structured questions. ' +
  'Respond with ONLY valid JSON — a single array, no markdown fences, no commentary.'

const PROMPT =
  'Extract every question from this exam paper image. Return ONLY a JSON array. ' +
  'Each element: { "type": "mcq" or "text", "topic": short topic string, ' +
  '"prompt": the full question text, "options": [strings] (MCQ only), ' +
  '"correctAnswer": for MCQ the exact text of the correct option; for written, a ' +
  'concise model answer, "markScheme": brief marking notes or null }. ' +
  'If the paper shows the answers, use them; otherwise work out the correct ' +
  'answer yourself. Keep any mathematical notation as readable plain text ' +
  '(e.g. x^2, 3/4). Ignore headers, instructions and page numbers.'

// Defensive parse of a JSON array possibly wrapped in prose / fences.
export function parseQuestionsJSON(text) {
  if (!text) throw new Error('empty')
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = t.indexOf('[')
  const end = t.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error('no json array')
  const arr = JSON.parse(t.slice(start, end + 1))
  if (!Array.isArray(arr)) throw new Error('not an array')
  return arr
}

const rid = (p) => p + Math.random().toString(36).slice(2, 9)

// Extract questions from an image File, mapped into our question shape.
export async function scanPaper(file, subject, signal) {
  const image = await fileToImage(file)
  const text = await callAnthropic({
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
    maxTokens: 4000,
    model: MODEL,
    signal,
  })
  const items = parseQuestionsJSON(text)

  return items
    .filter((it) => it && it.prompt)
    .map((it) => {
      const topic = (it.topic || subject || 'General').toString()
      const prompt = it.prompt.toString()
      if (it.type === 'mcq' && Array.isArray(it.options) && it.options.length >= 2) {
        const options = it.options.map((o) => String(o))
        let correct = String(it.correctAnswer ?? '')
        if (!options.includes(correct)) {
          const ci = options.find((o) => o.toLowerCase().trim() === correct.toLowerCase().trim())
          correct = ci || options[0]
        }
        return { id: rid('sc'), type: 'mcq', subject, topic, prompt, latex: '', options, correctAnswer: correct, acceptedAnswers: [], workingNotes: it.markScheme || 'Imported from a scanned paper.' }
      }
      const model = String(it.correctAnswer ?? '').trim()
      return {
        id: rid('sc'), type: 'text', subject, topic, prompt, latex: '',
        correctAnswer: model, acceptedAnswers: [], markScheme: it.markScheme ? String(it.markScheme) : '',
        workingNotes: it.markScheme ? String(it.markScheme) : model ? `Model answer: ${model}` : 'Imported from a scanned paper.',
      }
    })
}
