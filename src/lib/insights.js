import { requestAnthropic } from './anthropic.js'
import { MODEL } from './config.js'

// ---------------------------------------------------------------------------
// Class insights: cluster the marks a class lost into shared misconceptions
// with a concrete reteach plan. Input is the attempts saved by the store.
// ---------------------------------------------------------------------------

const SYSTEM =
  'You are an experienced head of department analysing class exam results. You ' +
  'group lost marks into shared underlying misconceptions (not per-question ' +
  'restatements) and propose concrete, brief reteaching actions. Respond with ' +
  'ONLY valid JSON — a single object, no markdown fences.'

function parseObjectJSON(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no json object')
  return JSON.parse(t.slice(start, end + 1))
}

const trunc = (s, n) => {
  const t = String(s || '')
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

// Flatten attempts into the mistake list the model analyses.
export function collectMistakes(attempts, examTitle = null) {
  const out = []
  for (const a of attempts) {
    if (examTitle && a.examTitle !== examTitle) continue
    for (const it of a.items || []) {
      if (!it.answered) continue
      const score = Number(it.score) || 0
      if (score >= 1) continue
      out.push({
        student: a.student || 'Student',
        exam: a.examTitle,
        topic: it.topic || a.subject || 'General',
        question: trunc(it.prompt, 140),
        answer: trunc(it.answer, 120),
        errorStep: it.errorStep ? trunc(it.errorStep, 120) : null,
        scorePct: Math.round(score * 100),
      })
    }
  }
  return out.slice(0, 80) // keep the request bounded
}

// Returns { summary, clusters: [{ title, misconception, count, students[],
// examples[], reteach[], severity }] }
export async function analyzeErrors(attempts, { examTitle = null, signal } = {}) {
  const mistakes = collectMistakes(attempts, examTitle)
  if (!mistakes.length) return { summary: 'No lost marks to analyse yet.', clusters: [] }

  const user =
    'Lost-mark records from recent class exams (numbered, one JSON object per line):\n' +
    mistakes.map((m, i) => `${i}: ${JSON.stringify(m)}`).join('\n') +
    '\n\nGroup these into at most 6 clusters of SHARED underlying misconceptions ' +
    '(merge across questions/exams where the root cause is the same; ignore one-off slips ' +
    'unless nothing repeats). Return ONLY this JSON object:\n' +
    '{ "summary": two-sentence overview for the teacher, "clusters": [ { ' +
    '"title": short name of the misconception, ' +
    '"misconception": one sentence describing the underlying misunderstanding, ' +
    '"records": [the numbers of the lost-mark records that belong to this cluster], ' +
    '"reteach": [2-3 short concrete reteaching actions, e.g. a 10-min starter, a targeted worked example], ' +
    '"severity": "high" | "medium" | "low" } ] }\n' +
    'Order clusters by severity then size.'

  const { text } = await requestAnthropic({
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
    maxTokens: 3000,
    temperature: 0,
    model: MODEL,
    signal,
  })
  const obj = parseObjectJSON(text)
  return {
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    clusters: (Array.isArray(obj.clusters) ? obj.clusters : []).map((c) => {
      // The model only labels clusters; counts, student lists and example
      // quotes are recomputed locally from the records it assigned, so the
      // numbers a teacher sees always match the underlying data.
      const idx = Array.isArray(c.records)
        ? [...new Set(c.records.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < mistakes.length))]
        : []
      const recs = idx.map((i) => mistakes[i])
      return {
        title: String(c.title || 'Misconception'),
        misconception: String(c.misconception || ''),
        count: recs.length,
        students: [...new Set(recs.map((r) => r.student))],
        examples: recs.slice(0, 2).map((r) => `“${r.answer || '—'}” — ${r.question}`),
        reteach: Array.isArray(c.reteach) ? c.reteach.map(String) : [],
        severity: ['high', 'medium', 'low'].includes(c.severity) ? c.severity : 'medium',
      }
    }).filter((c) => c.count > 0),
  }
}
