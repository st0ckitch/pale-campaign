import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ---------------------------------------------------------------------------
// Anthropic proxy
// ---------------------------------------------------------------------------
// The browser never sees the API key. The client posts the exact Anthropic
// `/v1/messages` payload to `/api/anthropic`; this middleware injects the key
// from the server environment and forwards it on. If no key is configured the
// app degrades gracefully (local grading + a friendly "couldn't reach AI"
// message), so the simulator still works fully offline.
function anthropicProxy() {
  const UPSTREAM = process.env.APP_ANTHROPIC_BASE_URL || 'https://api.anthropic.com'

  const handler = async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    const key = process.env.ANTHROPIC_API_KEY
    res.setHeader('Content-Type', 'application/json')
    if (!key) {
      res.statusCode = 503
      res.end(JSON.stringify({
        error: 'no_api_key',
        message: 'ANTHROPIC_API_KEY is not set on the server. Falling back to local grading.',
      }))
      return
    }
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', async () => {
      try {
        const upstream = await fetch(`${UPSTREAM}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          },
          body,
        })
        const text = await upstream.text()
        res.statusCode = upstream.status
        res.end(text)
      } catch (err) {
        res.statusCode = 502
        res.end(JSON.stringify({ error: 'upstream_error', message: String(err) }))
      }
    })
  }

  return {
    name: 'anthropic-proxy',
    configureServer(server) {
      server.middlewares.use('/api/anthropic', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/anthropic', handler)
    },
  }
}

export default defineConfig({
  plugins: [react(), anthropicProxy()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
})
