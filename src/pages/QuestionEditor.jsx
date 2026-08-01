import { useState } from 'react'
import { sub, fill } from '../theme.js'

// ---------------------------------------------------------------------------
// Structured mark schemes. Stored as [{code:'M1'|'A1'|'B1'|'R1', desc}] —
// grading awards each point independently. Edited as plain lines
// ("M1 Attempts product rule"). Text with no recognisable codes stays a plain
// string (legacy prose note, used as grading context only).
// ---------------------------------------------------------------------------
const CODE_LINE = /^([A-Z]{1,2}\d)[:.)\-\s]\s*(.+)$/

export function schemeToText(ms) {
  if (Array.isArray(ms)) return ms.map((p) => `${p.code} ${p.desc}`).join('\n')
  return typeof ms === 'string' ? ms : ''
}

export function textToScheme(txt) {
  const raw = String(txt || '').trim()
  if (!raw) return ''
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.some((l) => CODE_LINE.test(l))) return raw
  return lines.map((l) => {
    const m = l.match(CODE_LINE)
    return m ? { code: m[1], desc: m[2].trim() } : { code: 'B1', desc: l }
  })
}

// Mark-scheme textarea with local text state so parsing never fights the
// caret. Commits the parsed value (array or prose string) upward on change.
function SchemeField({ value, onCommit, input, label }) {
  const [text, setText] = useState(() => schemeToText(value))
  const parsed = textToScheme(text)
  const nPoints = Array.isArray(parsed) ? parsed.length : 0
  return (
    <div>
      <label style={label}>
        Mark scheme — one point per line (M method · A accuracy · B answer · R reasoning)
        {nPoints ? <span style={{ color: sub(0.55), textTransform: 'none', letterSpacing: 0 }}> · {nPoints} point{nPoints === 1 ? '' : 's'} → AI awards each independently</span> : null}
      </label>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onCommit(textToScheme(e.target.value))
        }}
        placeholder={'M1 Attempts to use the product rule\nA1 Correct derivative\nA1 Correct value at x = 2'}
        style={{ ...input, minHeight: 56, resize: 'vertical', fontFamily: "'JetBrains Mono','SFMono-Regular',Menlo,monospace", fontSize: 12.5, lineHeight: 1.6 }}
      />
    </div>
  )
}

const partKey = (i) => String.fromCharCode(97 + i) // a, b, c…

// One editable question card. Used for every draft question (typed, scanned or
// from the bank) so a teacher can fix anything the AI got wrong before/after
// publishing. Emits patches via onChange. Supports IB-style multi-part
// questions: the main prompt becomes the shared stem and each part carries its
// own prompt/marks/answer/scheme.
export default function QuestionEditor({ t, q, index, onChange, onRemove, onMoveUp, onMoveDown, canUp, canDown }) {
  const input = { width: '100%', padding: '10px 12px', borderRadius: 10, background: 'var(--input-bg)', border: `1px solid ${fill(0.12)}`, color: 'var(--ink)', fontSize: 13.5, fontFamily: "'Manrope',sans-serif", outline: 'none' }
  const label = { fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.4), margin: '0 0 6px', display: 'block' }
  const parts = Array.isArray(q.parts) && q.parts.length ? q.parts : null
  const isMcq = !parts && q.type === 'mcq'
  const options = q.options || []
  const correctIdx = options.indexOf(q.correctAnswer)
  const partsMarks = parts ? parts.reduce((s, p) => s + (Number(p.marks) || 1), 0) : 0

  const setType = (type) => {
    if (type === q.type) return
    if (type === 'mcq') {
      const o = options.length ? options : ['', '', '', '']
      onChange({ type: 'mcq', options: o, correctAnswer: o[0] || '' })
    } else {
      onChange({ type: 'text', correctAnswer: q.correctAnswer || '' })
    }
  }
  const setOption = (i, val) => {
    const o = options.map((x, j) => (j === i ? val : x))
    onChange({ options: o, correctAnswer: i === correctIdx ? val : q.correctAnswer })
  }
  const addOption = () => onChange({ options: [...options, ''] })
  const removeOption = (i) => {
    const o = options.filter((_, j) => j !== i)
    onChange({ options: o, correctAnswer: options[i] === q.correctAnswer ? (o[0] || '') : q.correctAnswer })
  }

  // ---- parts ----
  const splitIntoParts = () =>
    onChange({
      type: 'text',
      parts: [
        { key: 'a', prompt: '', marks: Number(q.marks) || 1, correctAnswer: q.correctAnswer || '', acceptedAnswers: q.acceptedAnswers || [], markScheme: q.markScheme || '', workingNotes: q.workingNotes || '' },
        { key: 'b', prompt: '', marks: 1, correctAnswer: '', acceptedAnswers: [], markScheme: '', workingNotes: '' },
      ],
    })
  const unsplit = () => {
    const p0 = parts[0] || {}
    onChange({
      parts: null,
      marks: partsMarks || Number(q.marks) || 1,
      correctAnswer: p0.correctAnswer || q.correctAnswer || '',
      acceptedAnswers: p0.acceptedAnswers || [],
      markScheme: p0.markScheme ?? q.markScheme ?? '',
      workingNotes: p0.workingNotes || q.workingNotes || '',
    })
  }
  const setPart = (i, patch) => onChange({ parts: parts.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const addPart = () => onChange({ parts: [...parts, { key: partKey(parts.length), prompt: '', marks: 1, correctAnswer: '', acceptedAnswers: [], markScheme: '', workingNotes: '' }] })
  const removePart = (i) => {
    const next = parts.filter((_, j) => j !== i).map((p, j) => ({ ...p, key: partKey(j) }))
    if (!next.length) return unsplit()
    onChange({ parts: next })
  }
  // Commit a scheme and keep marks aligned with the number of points ([3] = 3 points).
  const schemePatch = (scheme) => ({ markScheme: scheme, ...(Array.isArray(scheme) && scheme.length ? { marks: scheme.length } : {}) })

  const iconBtn = { width: 28, height: 28, borderRadius: 8, border: `1px solid ${fill(0.12)}`, background: fill(0.05), color: sub(0.7), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }
  const typeChip = (val, lbl) => (
    <button onClick={() => setType(val)} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope',sans-serif", border: `1px solid ${q.type === val ? t.hexA(t.accent, 0.5) : fill(0.12)}`, background: q.type === val ? t.hexA(t.accent, 0.16) : fill(0.04), color: q.type === val ? 'var(--ink)' : sub(0.6) }}>{lbl}</button>
  )
  const chipBtn = (active) => ({ padding: '5px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope',sans-serif", border: `1px solid ${active ? t.hexA(t.accent, 0.5) : fill(0.12)}`, background: active ? t.hexA(t.accent, 0.16) : fill(0.04), color: active ? 'var(--ink)' : sub(0.6) })

  return (
    <div style={{ padding: 16, borderRadius: 14, background: fill(0.03), border: `1px solid ${fill(0.08)}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13, color: t.accent }}>Q{index + 1}</span>
        {!parts && <div style={{ display: 'flex', gap: 6 }}>{typeChip('text', 'Written')}{typeChip('mcq', 'Multiple choice')}</div>}
        <button onClick={parts ? unsplit : splitIntoParts} style={chipBtn(!!parts)}>
          {parts ? `Parts (${parts.length}) — merge back` : 'Split into parts (a), (b)…'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <span style={{ fontSize: 11.5, color: sub(0.5) }}>Marks</span>
          {parts ? (
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', padding: '4px 10px', borderRadius: 8, background: fill(0.05), border: `1px solid ${fill(0.12)}` }}>{partsMarks}</span>
          ) : (
            <input type="number" min="1" value={q.marks ?? 1} onChange={(e) => onChange({ marks: Math.max(1, Math.round(Number(e.target.value) || 1)) })} style={{ ...input, width: 56, padding: '6px 8px', textAlign: 'center' }} />
          )}
          <button onClick={onMoveUp} disabled={!canUp} title="Move up" style={{ ...iconBtn, opacity: canUp ? 1 : 0.4 }}>↑</button>
          <button onClick={onMoveDown} disabled={!canDown} title="Move down" style={{ ...iconBtn, opacity: canDown ? 1 : 0.4 }}>↓</button>
          <button onClick={onRemove} title="Remove" style={{ ...iconBtn, color: t.CORAL, borderColor: t.hexA(t.CORAL, 0.4) }}>✕</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 8 }}>
        <div>
          <label style={label}>{parts ? 'Stem — context shared by all parts (data, scenario, diagram description)' : 'Question'}</label>
          <textarea value={q.prompt} onChange={(e) => onChange({ prompt: e.target.value })} style={{ ...input, minHeight: 46, resize: 'vertical' }} />
        </div>
        <div>
          <label style={label}>Topic</label>
          <input value={q.topic || ''} onChange={(e) => onChange({ topic: e.target.value })} style={input} />
        </div>
      </div>

      {parts ? (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {parts.map((p, i) => (
            <div key={i} style={{ padding: '12px 14px', borderRadius: 12, background: fill(0.02), border: `1px solid ${fill(0.1)}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13, color: t.accent }}>({p.key || partKey(i)})</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  <span style={{ fontSize: 11, color: sub(0.5) }}>Marks</span>
                  <input type="number" min="1" value={p.marks ?? 1} onChange={(e) => setPart(i, { marks: Math.max(1, Math.round(Number(e.target.value) || 1)) })} style={{ ...input, width: 52, padding: '5px 7px', textAlign: 'center' }} />
                  <button onClick={() => removePart(i)} title="Remove part" style={{ ...iconBtn, width: 26, height: 26, color: t.CORAL, borderColor: t.hexA(t.CORAL, 0.4) }}>✕</button>
                </div>
              </div>
              <textarea value={p.prompt || ''} onChange={(e) => setPart(i, { prompt: e.target.value })} placeholder={`Part (${p.key || partKey(i)}) question`} style={{ ...input, minHeight: 42, resize: 'vertical' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <input value={p.correctAnswer || ''} onChange={(e) => setPart(i, { correctAnswer: e.target.value })} placeholder="Model answer" style={input} />
                <input value={(p.acceptedAnswers || []).join(', ')} onChange={(e) => setPart(i, { acceptedAnswers: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="Accepted exact answers (comma-sep)" style={input} />
              </div>
              <div style={{ marginTop: 8 }}>
                <SchemeField value={p.markScheme} onCommit={(scheme) => setPart(i, schemePatch(scheme))} input={input} label={label} />
              </div>
            </div>
          ))}
          {parts.length < 8 && (
            <button onClick={addPart} style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, color: t.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              + Add part ({partKey(parts.length)})
            </button>
          )}
        </div>
      ) : isMcq ? (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={label}>Options — tap the circle to mark the correct one</label>
          {options.map((o, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => onChange({ correctAnswer: options[i] })} title="Mark correct" style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 999, cursor: 'pointer', border: `1px solid ${i === correctIdx ? t.OK : fill(0.3)}`, background: i === correctIdx ? t.OK : 'transparent', color: '#0B0D10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{i === correctIdx ? '✓' : ''}</button>
              <input value={o} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + i)}`} style={input} />
              {options.length > 2 && <button onClick={() => removeOption(i)} style={{ ...iconBtn, flexShrink: 0 }}>✕</button>}
            </div>
          ))}
          {options.length < 6 && <button onClick={addOption} style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, color: t.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>+ Add option</button>}
        </div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={label}>Model answer (AI grades against this)</label>
            <textarea value={q.correctAnswer || ''} onChange={(e) => onChange({ correctAnswer: e.target.value })} style={{ ...input, minHeight: 46, resize: 'vertical' }} />
          </div>
          <input value={(q.acceptedAnswers || []).join(', ')} onChange={(e) => onChange({ acceptedAnswers: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="Accepted exact answers (comma-sep)" style={input} />
          <SchemeField value={q.markScheme} onCommit={(scheme) => onChange(schemePatch(scheme))} input={input} label={label} />
        </div>
      )}
    </div>
  )
}
