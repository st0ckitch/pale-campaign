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
// Core request. Returns { text, stopReason, data }. `temperature` is included
// only when a number is given (so extraction/grading can pin it to 0 for
// consistency while generation stays creative at the API default).
export async function requestAnthropic({ system, messages, maxTokens = 1000, model = MODEL, temperature, signal }) {
  const direct = !!CLIENT_KEY
  const url = direct ? ANTHROPIC_DIRECT : ANTHROPIC_ENDPOINT
  const headers = { 'Content-Type': 'application/json' }
  if (direct) {
    headers['x-api-key'] = CLIENT_KEY
    headers['anthropic-version'] = '2023-06-01'
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
  }

  const doFetch = async (withTemp) => {
    try {
      return await fetch(url, {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          ...(withTemp && typeof temperature === 'number' ? { temperature } : {}),
          ...(system ? { system } : {}),
          messages,
        }),
      })
    } catch (err) {
      throw new AIUnavailableError('Network error reaching the AI service.', err)
    }
  }

  const errDetail = async (res) => {
    try {
      const j = await res.json()
      // Anthropic error shape: { type: 'error', error: { type, message } }
      return (
        (j.error && typeof j.error === 'object' && j.error.message) ||
        (typeof j.error === 'string' ? j.error : '') ||
        j.message ||
        ''
      )
    } catch {
      return ''
    }
  }

  let res = await doFetch(true)
  if (!res.ok) {
    let detail = await errDetail(res)
    // Newer models reject the temperature parameter — retry once without it.
    if (res.status === 400 && typeof temperature === 'number' && /temperature/i.test(detail)) {
      res = await doFetch(false)
      if (!res.ok) detail = await errDetail(res)
    }
    if (!res.ok) {
      throw new AIUnavailableError(detail ? `${detail} (HTTP ${res.status})` : `AI service returned ${res.status}.`)
    }
  }

  const data = await res.json()
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return { text, stopReason: data.stop_reason, data }
}

export async function callAnthropic(opts) {
  return (await requestAnthropic(opts)).text
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
