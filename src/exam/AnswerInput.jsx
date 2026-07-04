import { useEffect, useRef, useState } from 'react'
import { sub, fill } from '../theme.js'
import { fileToImage } from '../lib/vision.js'

// Answer a written question by typing, drawing (whiteboard), or photographing
// handwritten working. Emits either a string (typed) or an image answer object
// { image, media_type, kind } that the grader sends to Claude vision.
export default function AnswerInput({ t, value, onChange }) {
  const isImg = value && typeof value === 'object' && value.image
  const [mode, setMode] = useState(isImg ? (value.kind === 'photo' ? 'photo' : 'draw') : 'type')

  const tabBtn = (m, label) => (
    <button
      key={m}
      onClick={() => setMode(m)}
      style={{ padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope',sans-serif", border: `1px solid ${mode === m ? t.hexA(t.accent, 0.5) : fill(0.12)}`, background: mode === m ? t.hexA(t.accent, 0.16) : fill(0.04), color: mode === m ? 'var(--ink)' : sub(0.62) }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {tabBtn('type', '⌨ Type')}
        {tabBtn('draw', '✎ Draw')}
        {tabBtn('photo', '📷 Photo')}
      </div>

      {mode === 'type' && (
        <>
          <textarea
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type your answer and working…  e.g.  x = 7,  3/4,  20cm²"
            style={{ width: '100%', minHeight: 120, resize: 'vertical', padding: '14px 16px', borderRadius: 14, background: 'var(--input-bg)', border: `1px solid ${fill(0.1)}`, color: 'var(--ink)', fontSize: 15, fontFamily: "'Space Grotesk',sans-serif", lineHeight: 1.5, outline: 'none' }}
          />
          {isImg && <div style={{ fontSize: 12, color: '#FFB347', marginTop: 8 }}>You have a {value.kind === 'photo' ? 'photo' : 'drawing'} attached — typing here replaces it.</div>}
        </>
      )}

      {mode === 'draw' && <DrawBoard t={t} value={isImg && value.kind === 'draw' ? value : null} onCommit={onChange} />}
      {mode === 'photo' && <PhotoInput t={t} value={isImg && value.kind === 'photo' ? value : null} onPick={onChange} />}

      <div style={{ fontSize: 12, color: sub(0.4), marginTop: 9 }}>
        {mode === 'type' && 'Equivalent forms accepted — fractions, decimals, with/without units.'}
        {mode === 'draw' && 'Draw your working; the AI reads and grades your handwriting.'}
        {mode === 'photo' && 'Snap or upload a photo of your handwritten working — the AI grades it.'}
      </div>
    </div>
  )
}

function DrawBoard({ t, value, onCommit }) {
  const ref = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    const rect = c.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    c.width = rect.width * dpr
    c.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#141414'
    ctx.lineWidth = 2.6
    if (value && value.image) {
      const im = new Image()
      im.onload = () => ctx.drawImage(im, 0, 0, rect.width, rect.height)
      im.src = `data:${value.media_type};base64,${value.image}`
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const at = (e) => { const r = ref.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const down = (e) => { drawing.current = true; last.current = at(e); ref.current.setPointerCapture?.(e.pointerId) }
  const move = (e) => {
    if (!drawing.current) return
    const ctx = ref.current.getContext('2d')
    const p = at(e)
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    last.current = p
  }
  const up = () => {
    if (!drawing.current) return
    drawing.current = false
    const url = ref.current.toDataURL('image/jpeg', 0.85)
    onCommit({ image: url.split(',')[1], media_type: 'image/jpeg', kind: 'draw' })
  }
  const clear = () => {
    const c = ref.current
    const ctx = c.getContext('2d')
    const r = c.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, r.width, r.height)
    onCommit('')
  }

  return (
    <div>
      <canvas
        ref={ref}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        style={{ width: '100%', height: 240, borderRadius: 14, background: '#ffffff', border: `1px solid ${fill(0.12)}`, touchAction: 'none', cursor: 'crosshair', display: 'block' }}
      />
      <button onClick={clear} style={{ marginTop: 8, ...t.ghostBtn, padding: '8px 14px' }}>Clear board</button>
    </div>
  )
}

function PhotoInput({ t, value, onPick }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const dataUrl = value && value.image ? `data:${value.media_type};base64,${value.image}` : null

  async function onFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    try {
      const im = await fileToImage(f)
      onPick({ image: im.data, media_type: im.media_type, kind: 'photo' })
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
      {dataUrl ? (
        <img src={dataUrl} alt="Your answer" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 14, border: `1px solid ${fill(0.12)}`, display: 'block' }} />
      ) : (
        <div style={{ height: 160, borderRadius: 14, border: `1px dashed ${fill(0.2)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: sub(0.45), fontSize: 13.5 }}>
          No photo yet
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button onClick={() => ref.current?.click()} disabled={busy} style={{ ...t.ghostBtn, padding: '8px 14px', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Loading…' : dataUrl ? 'Replace photo' : 'Take / upload photo'}
        </button>
        {dataUrl && <button onClick={() => onPick('')} style={{ ...t.ghostBtn, padding: '8px 14px', borderColor: t.hexA(t.CORAL, 0.4), color: t.CORAL, background: t.hexA(t.CORAL, 0.12) }}>Remove</button>}
      </div>
    </div>
  )
}
