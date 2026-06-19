import { useState } from 'react'
import { sub, fill } from '../theme.js'

// Lets the user paste an Anthropic API key at runtime so AI features work on
// static hosting (GitHub Pages) where there's no server proxy. The key is held
// in React state only — never written to localStorage, never committed.
export default function ConnectAI({ t, apiKey, onSave, onClose }) {
  const [val, setVal] = useState(apiKey || '')
  const [show, setShow] = useState(false)

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--scrim)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', animation: 'qgfade .2s ease both' }} />
      <div
        role="dialog"
        style={{
          position: 'fixed',
          zIndex: 81,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 'min(520px, 92vw)',
          borderRadius: 22,
          background: 'var(--panel-bg)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 30px 90px rgba(0,0,0,0.5)',
          padding: 26,
          animation: 'qgpop .22s ease both',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 6 }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: `linear-gradient(135deg,${t.accent},${t.accent2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0B0D10', fontWeight: 700 }}>AI</div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Connect AI</div>
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: sub(0.65), margin: '8px 0 16px' }}>
          Paste an Anthropic API key to enable AI grading and the tutor. It's kept in
          this browser tab's memory only — never saved or uploaded anywhere. Get one at{' '}
          <span style={{ color: t.accent }}>console.anthropic.com</span>.
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 4px 4px 14px', borderRadius: 13, background: 'var(--input-bg)', border: `1px solid ${fill(0.12)}` }}>
          <input
            type={show ? 'text' : 'password'}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="sk-ant-…"
            spellCheck={false}
            autoComplete="off"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: 14, fontFamily: "'Space Grotesk',monospace" }}
          />
          <button onClick={() => setShow((s) => !s)} style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${fill(0.12)}`, background: fill(0.05), color: sub(0.7), cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            {show ? 'Hide' : 'Show'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {apiKey && (
            <button
              onClick={() => { onSave(''); onClose(); }}
              style={{ padding: '12px 18px', borderRadius: 999, border: `1px solid ${t.hexA(t.CORAL, 0.4)}`, background: t.hexA(t.CORAL, 0.12), color: t.CORAL, cursor: 'pointer', fontWeight: 600, fontSize: 13.5, fontFamily: "'Manrope',sans-serif" }}
            >
              Disconnect
            </button>
          )}
          <button onClick={onClose} style={{ padding: '12px 18px', borderRadius: 999, border: `1px solid ${fill(0.12)}`, background: fill(0.05), color: 'var(--ink)', cursor: 'pointer', fontWeight: 600, fontSize: 13.5, fontFamily: "'Manrope',sans-serif" }}>
            Cancel
          </button>
          <button onClick={() => { onSave(val.trim()); onClose(); }} style={{ ...t.cta, padding: '12px 22px' }}>
            Connect
          </button>
        </div>
      </div>
    </>
  )
}
