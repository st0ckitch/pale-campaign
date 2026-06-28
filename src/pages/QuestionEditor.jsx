import { sub, fill } from '../theme.js'

// One editable question card. Used for every draft question (typed, scanned or
// from the bank) so a teacher can fix anything the AI got wrong before/after
// publishing. Emits patches via onChange.
export default function QuestionEditor({ t, q, index, onChange, onRemove, onMoveUp, onMoveDown, canUp, canDown }) {
  const input = { width: '100%', padding: '10px 12px', borderRadius: 10, background: 'var(--input-bg)', border: `1px solid ${fill(0.12)}`, color: 'var(--ink)', fontSize: 13.5, fontFamily: "'Manrope',sans-serif", outline: 'none' }
  const label = { fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.4), margin: '0 0 6px', display: 'block' }
  const isMcq = q.type === 'mcq'
  const options = q.options || []
  const correctIdx = options.indexOf(q.correctAnswer)

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

  const iconBtn = { width: 28, height: 28, borderRadius: 8, border: `1px solid ${fill(0.12)}`, background: fill(0.05), color: sub(0.7), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }
  const typeChip = (val, lbl) => (
    <button onClick={() => setType(val)} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope',sans-serif", border: `1px solid ${q.type === val ? t.hexA(t.accent, 0.5) : fill(0.12)}`, background: q.type === val ? t.hexA(t.accent, 0.16) : fill(0.04), color: q.type === val ? 'var(--ink)' : sub(0.6) }}>{lbl}</button>
  )

  return (
    <div style={{ padding: 16, borderRadius: 14, background: fill(0.03), border: `1px solid ${fill(0.08)}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13, color: t.accent }}>Q{index + 1}</span>
        <div style={{ display: 'flex', gap: 6 }}>{typeChip('text', 'Written')}{typeChip('mcq', 'Multiple choice')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <span style={{ fontSize: 11.5, color: sub(0.5) }}>Marks</span>
          <input type="number" min="1" value={q.marks ?? 1} onChange={(e) => onChange({ marks: Math.max(1, Math.round(Number(e.target.value) || 1)) })} style={{ ...input, width: 56, padding: '6px 8px', textAlign: 'center' }} />
          <button onClick={onMoveUp} disabled={!canUp} title="Move up" style={{ ...iconBtn, opacity: canUp ? 1 : 0.4 }}>↑</button>
          <button onClick={onMoveDown} disabled={!canDown} title="Move down" style={{ ...iconBtn, opacity: canDown ? 1 : 0.4 }}>↓</button>
          <button onClick={onRemove} title="Remove" style={{ ...iconBtn, color: t.CORAL, borderColor: t.hexA(t.CORAL, 0.4) }}>✕</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 8 }}>
        <div>
          <label style={label}>Question</label>
          <textarea value={q.prompt} onChange={(e) => onChange({ prompt: e.target.value })} style={{ ...input, minHeight: 46, resize: 'vertical' }} />
        </div>
        <div>
          <label style={label}>Topic</label>
          <input value={q.topic || ''} onChange={(e) => onChange({ topic: e.target.value })} style={input} />
        </div>
      </div>

      {isMcq ? (
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input value={(q.acceptedAnswers || []).join(', ')} onChange={(e) => onChange({ acceptedAnswers: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="Accepted exact answers (comma-sep)" style={input} />
            <input value={q.markScheme || ''} onChange={(e) => onChange({ markScheme: e.target.value })} placeholder="Mark-scheme note (optional)" style={input} />
          </div>
        </div>
      )}
    </div>
  )
}
