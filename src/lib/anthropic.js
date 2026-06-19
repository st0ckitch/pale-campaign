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

// A "bring your own key" path for static hosting (e.g. GitHub Pages) where no
// server proxy exists. The key lives in memory only — never persisted, never
// committed. When set, calls go straight to Anthropic from the browser using
// the documented direct-browser-access header. When empty, calls use the dev
// proxy (which injects a server-side key).
const ANTHROPIC_DIRECT = 'https://api.anthropic.com/v1/messages'
let CLIENT_KEY = ''
export function setClientApiKey(key) {
  CLIENT_KEY = (key || '').trim()
}
export function hasClientKey() {
  return !!CLIENT_KEY
}

// Low-level call. Returns the concatenated text of the first content block(s).
// `messages` is the Anthropic messages array; `system` is an optional system
// prompt string.
export async function callAnthropic({ system, messages, maxTokens = 1000, model = MODEL, signal }) {
  const direct = !!CLIENT_KEY
  const url = direct ? ANTHROPIC_DIRECT : ANTHROPIC_ENDPOINT
  const headers = { 'Content-Type': 'application/json' }
  if (direct) {
    headers['x-api-key'] = CLIENT_KEY
    headers['anthropic-version'] = '2023-06-01'
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
  }

  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
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
