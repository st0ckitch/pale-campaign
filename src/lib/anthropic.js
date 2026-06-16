import { MODEL, ANTHROPIC_ENDPOINT } from './config.js'

// Thrown when the AI is unreachable (no key, network error, bad status).
// Callers catch this and degrade gracefully.
export class AIUnavailableError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'AIUnavailableError'
    this.cause = cause
  }
}

// Low-level call. Returns the concatenated text of the first content block(s).
// `messages` is the Anthropic messages array; `system` is an optional system
// prompt string.
export async function callAnthropic({ system, messages, maxTokens = 1000, model = MODEL, signal }) {
  let res
  try {
    res = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages,
      }),
    })
  } catch (err) {
    throw new AIUnavailableError('Network error reaching the AI service.', err)
  }

  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = j.message || j.error || ''
    } catch {
      /* ignore */
    }
    throw new AIUnavailableError(detail || `AI service returned ${res.status}.`)
  }

  const data = await res.json()
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return text
}

// Streaming-friendly typewriter helper: we don't use SSE here (keeps the proxy
// simple), but we reveal the completed reply progressively so the UI still gets
// the "typing" feel the spec asks for.
export async function streamReveal(text, onChunk, { reduceMotion = false } = {}) {
  if (reduceMotion || !text) {
    onChunk(text)
    return
  }
  const step = Math.max(1, Math.round(text.length / 90))
  for (let i = 0; i <= text.length; i += step) {
    onChunk(text.slice(0, i))
    // ~22ms cadence
    await new Promise((r) => setTimeout(r, 18))
  }
  onChunk(text)
}
