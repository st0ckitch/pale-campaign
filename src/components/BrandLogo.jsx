import { useState } from 'react'

// Shows a school logo image, switching by brand. Looks for files in public/logos
// (svg → png → webp), and renders `fallback` if none are present, so the UI
// never breaks while the artwork is being added.
//
// Expected files (drop into public/logos/):
//   bist.svg / bist.png         — BIST wordmark   (used in top bar, exam screens)
//   bga.svg  / bga.png          — BGA wordmark
//   bist-mark.svg / bist-mark.png — optional square crest for the sidebar
//   bga-mark.svg  / bga-mark.png  — optional square mark for the sidebar

function logoBase() {
  try {
    return (import.meta && import.meta.env && import.meta.env.BASE_URL) || '/'
  } catch {
    return '/'
  }
}

function candidates(brand, variant) {
  const name = variant === 'mark' ? `${brand.toLowerCase()}-mark` : brand.toLowerCase()
  const base = logoBase()
  return ['png', 'svg', 'webp'].map((ext) => `${base}logos/${name}.${ext}`)
}

export default function BrandLogo({ brand, variant = 'wordmark', height = 28, plaque = false, fallback = null }) {
  const srcs = candidates(brand, variant)
  const [i, setI] = useState(0)

  if (i >= srcs.length) return fallback

  const img = (
    <img
      src={srcs[i]}
      alt={`${brand} logo`}
      onError={() => setI((n) => n + 1)}
      style={{ height, width: 'auto', display: 'block', objectFit: 'contain' }}
    />
  )

  if (!plaque) return img

  // Dark plaque guarantees contrast for light/white logos (e.g. BGA) in any theme.
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 16px', borderRadius: 14, background: '#0B0D10', border: '1px solid rgba(255,255,255,0.10)' }}>
      {img}
    </span>
  )
}
