import { useEffect, useRef, useState } from 'react'

// Renders a LaTeX string with KaTeX when it's available (loaded via CDN in
// index.html). If KaTeX hasn't loaded — or the expression fails to parse — it
// falls back to the plain-text version so the question is always legible.
export default function MathText({ latex, fallback, display = false, style }) {
  const ref = useRef(null)
  const [, force] = useState(0)

  useEffect(() => {
    let cancelled = false
    let tries = 0

    const tryRender = () => {
      if (cancelled || !ref.current) return
      const katex = typeof window !== 'undefined' ? window.katex : null
      if (katex) {
        try {
          katex.render(latex, ref.current, {
            displayMode: display,
            throwOnError: false,
            output: 'htmlAndMathml',
          })
          return
        } catch {
          ref.current.textContent = fallback ?? latex
          return
        }
      }
      // KaTeX script may still be loading — retry briefly, then give up to text.
      if (tries++ < 20) {
        setTimeout(tryRender, 120)
      } else if (ref.current) {
        ref.current.textContent = fallback ?? latex
      }
    }

    tryRender()
    return () => {
      cancelled = true
    }
  }, [latex, fallback, display])

  // Ensure we re-mount cleanly when latex changes.
  return <span ref={ref} style={style}>{fallback ?? latex}</span>
}
