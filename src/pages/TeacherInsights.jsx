import { useMemo, useState } from 'react'
import { sub, fill } from '../theme.js'
import { analyzeErrors, collectMistakes } from '../lib/insights.js'

// Teacher-side intelligence on recorded attempts:
//  - Marking review queue: AI judgements that deserve a human eye (low
//    confidence, partial credit, handwriting, offline fallbacks) with 1-click
//    approve / override.
//  - Class insights: AI clusters lost marks into shared misconceptions with a
//    concrete reteach plan.
export default function TeacherInsights({ t, store, toast, aiOn, onConnect }) {
  const attempts = store.attempts || []

  // ---- moderation queue ----
  const queue = useMemo(() => {
    const out = []
    for (const a of attempts) {
      ;(a.items || []).forEach((it, i) => {
        if (it.needsReview && !it.override) out.push({ attempt: a, item: it, index: i })
      })
    }
    return out.slice(0, 30)
  }, [attempts])

  const resolve = (entry, patch, label) => {
    store.updateAttemptItem(entry.attempt.id, entry.index, { ...patch, override: label })
    toast(`Marked as ${label}`)
  }

  // ---- insights ----
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState(null)
  const mistakes = collectMistakes(attempts)

  async function runAnalysis() {
    if (busy) return
    if (!aiOn) { toast('Connect AI to analyse class errors'); onConnect?.(); return }
    setBusy(true)
    try {
      const rep = await analyzeErrors(attempts)
      setReport(rep)
    } catch (err) {
      console.error('Insights failed:', err)
      toast(`Analysis failed: ${err?.message || 'check the AI connection'}`)
    } finally {
      setBusy(false)
    }
  }

  const sev = { high: t.CORAL, medium: '#FFB347', low: t.OK }
  const label = { fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.4) }
  const chipBtn = (color) => ({
    padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    fontFamily: "'Manrope',sans-serif", background: t.hexA(color, 0.12), border: `1px solid ${t.hexA(color, 0.45)}`, color,
  })

  return (
    <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* ===== MODERATION QUEUE ===== */}
      <div style={{ ...t.GLASS, borderRadius: 24, padding: '24px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Marking review queue</div>
          <span style={{ fontSize: 12, color: sub(0.5) }}>{attempts.length} attempt{attempts.length === 1 ? '' : 's'} recorded</span>
        </div>
        <div style={{ fontSize: 12.5, color: sub(0.55), marginBottom: 16 }}>
          AI marks everything, but flags answers it's less sure about — you stay in control.
        </div>

        {queue.length === 0 ? (
          <div style={{ fontSize: 13.5, color: sub(0.5), padding: '18px 0' }}>
            Nothing waiting for review
            {attempts.length === 0
              ? store.mode === 'cloud-teacher'
                ? ' — results appear here as students in your classes submit exams (any device)'
                : ' — results appear here after students submit exams on this device'
              : ' — all AI marking looks confident'}.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {queue.map((e, qi) => {
              const it = e.item
              const marks = Number(it.marks) || 1
              const aiMarks = Math.round(it.score * marks * 10) / 10
              return (
                <div key={`${e.attempt.id}-${e.index}-${qi}`} style={{ padding: 14, borderRadius: 14, background: fill(0.03), border: `1px solid ${fill(0.08)}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: sub(0.5), marginBottom: 8, flexWrap: 'wrap' }}>
                    <span><strong style={{ color: 'var(--ink)' }}>{e.attempt.student}</strong>{e.attempt.className ? ` (${e.attempt.className})` : ''} · {e.attempt.examTitle}</span>
                    <span>
                      AI: {aiMarks}/{marks} mark{marks === 1 ? '' : 's'}
                      {typeof it.confidence === 'number' ? ` · ${Math.round(it.confidence * 100)}% sure` : ' · unchecked'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.45 }}>{it.prompt}</div>
                  {it.thumb ? (
                    <img src={it.thumb} alt="Student answer" style={{ marginTop: 8, maxWidth: '100%', maxHeight: 140, borderRadius: 10, border: `1px solid ${fill(0.12)}`, display: 'block' }} />
                  ) : (
                    <div style={{ marginTop: 8, fontSize: 13, color: sub(0.75), padding: '8px 12px', borderRadius: 10, background: 'var(--input-bg)', border: `1px solid ${fill(0.1)}` }}>
                      “{it.answer || '—'}”
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: sub(0.55), marginTop: 6 }}>
                    Expected: {it.correctAnswer || '—'}{it.feedback ? ` · AI: ${it.feedback}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button style={chipBtn(t.OK)} onClick={() => resolve(e, {}, 'approved')}>✓ Approve AI mark</button>
                    <button style={chipBtn(t.accent)} onClick={() => resolve(e, { score: 1, correct: true }, 'full marks')}>Full marks</button>
                    <button style={chipBtn(t.CORAL)} onClick={() => resolve(e, { score: 0, correct: false }, 'zero')}>Zero</button>
                    <MarksOverride t={t} max={marks} onSet={(m) => resolve(e, { score: Math.max(0, Math.min(1, m / marks)), correct: m >= marks }, `${m}/${marks}`)} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ===== CLASS INSIGHTS ===== */}
      <div style={{ ...t.GLASS, borderRadius: 24, padding: '24px 26px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Class insights</div>
        <div style={{ fontSize: 12.5, color: sub(0.55), marginBottom: 16 }}>
          AI groups the marks your class lost into shared misconceptions — and tells you what to reteach.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={runAnalysis}
            disabled={busy || mistakes.length === 0}
            style={{ ...t.cta, padding: '12px 20px', opacity: busy || mistakes.length === 0 ? 0.55 : 1 }}
          >
            {busy ? 'Analysing…' : 'Analyse lost marks'}
          </button>
          <span style={{ fontSize: 12.5, color: sub(0.5) }}>
            {mistakes.length === 0 ? 'No lost marks recorded yet' : `${mistakes.length} lost-mark record${mistakes.length === 1 ? '' : 's'} across ${attempts.length} attempt${attempts.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {report && (
          <div style={{ marginTop: 18 }}>
            {report.summary && <p style={{ fontSize: 13.5, lineHeight: 1.6, color: sub(0.75), margin: '0 0 14px' }}>{report.summary}</p>}
            {report.clusters.length === 0 && <div style={{ fontSize: 13, color: sub(0.5) }}>No repeated misconceptions found — mistakes look like one-off slips.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {report.clusters.map((c, i) => (
                <div key={i} style={{ padding: 14, borderRadius: 14, background: fill(0.03), border: `1px solid ${fill(0.08)}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: sev[c.severity], boxShadow: `0 0 7px ${sev[c.severity]}` }} />
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{c.title}</span>
                    <span style={{ fontSize: 11.5, color: sub(0.5) }}>
                      {c.count} lost mark{c.count === 1 ? '' : 's'}{c.students.length ? ` · ${c.students.slice(0, 4).join(', ')}${c.students.length > 4 ? '…' : ''}` : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: sub(0.7), marginTop: 6, lineHeight: 1.5 }}>{c.misconception}</div>
                  {c.examples.length > 0 && (
                    <div style={{ fontSize: 12, color: sub(0.5), marginTop: 6, fontStyle: 'italic' }}>e.g. {c.examples[0]}</div>
                  )}
                  {c.reteach.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <span style={{ ...label, fontSize: 10 }}>Reteach</span>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                        {c.reteach.map((r, ri) => <li key={ri} style={{ fontSize: 12.5, color: sub(0.75), margin: '2px 0' }}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {attempts.length > 0 && (
          <button
            onClick={() => { store.clearAttempts(); setReport(null); toast('Attempt history cleared') }}
            style={{ marginTop: 16, background: 'none', border: 'none', color: sub(0.45), fontSize: 12, cursor: 'pointer', padding: 0 }}
          >
            Clear recorded attempts
          </button>
        )}
      </div>
    </section>
  )
}

function MarksOverride({ t, max, onSet }) {
  const [v, setV] = useState('')
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input
        type="number"
        min="0"
        max={max}
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={`0–${max}`}
        style={{ width: 64, padding: '6px 8px', borderRadius: 9, background: 'var(--input-bg)', border: `1px solid ${fill(0.12)}`, color: 'var(--ink)', fontSize: 12.5, textAlign: 'center', outline: 'none' }}
      />
      <button
        style={{ padding: '6px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Manrope',sans-serif", background: fill(0.05), border: `1px solid ${fill(0.14)}`, color: 'var(--ink)' }}
        onClick={() => { const n = Number(v); if (Number.isFinite(n) && n >= 0 && n <= max) { onSet(n); setV('') } }}
      >
        Set marks
      </button>
    </span>
  )
}
