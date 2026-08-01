import { useMemo, useState } from 'react'
import { sub, fill } from '../theme.js'
import { analyzeErrors, collectMistakes } from '../lib/insights.js'

// Teacher-side intelligence on recorded attempts, split into the two jobs:
//  - MarkingQueue: two views. "Needs review" surfaces AI judgements that
//    deserve a human eye (low confidence, partial credit, handwriting,
//    offline fallbacks). "All attempts" shows every submission in full —
//    every answer, the AI's verdict and mark-scheme points — so the teacher
//    can audit the AI and adjust any mark, not just the flagged ones.
//  - ClassInsights: AI clusters lost marks into shared misconceptions with a
//    concrete reteach plan (counts recomputed locally from the records).

const chipBtn = (t, color) => ({
  padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  fontFamily: "'Manrope',sans-serif", background: t.hexA(color, 0.12), border: `1px solid ${t.hexA(color, 0.45)}`, color,
})

const fmtWhen = (ts) => {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

const fmt1 = (n) => {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

export function MarkingQueue({ t, store, toast }) {
  const attempts = store.attempts || []
  const [view, setView] = useState('queue') // queue | all

  const queue = useMemo(() => {
    const out = []
    for (const a of attempts) {
      ;(a.items || []).forEach((it, i) => {
        if (it.needsReview && !it.override) out.push({ attempt: a, item: it, index: i })
      })
    }
    return out.slice(0, 30)
  }, [attempts])

  const patchItem = (attemptId, index, patch, label) => {
    store.updateAttemptItem(attemptId, index, { ...patch, override: label })
    toast(`Marked: ${label}`)
  }

  const viewChip = (key, name, count) => {
    const on = view === key
    return (
      <button
        key={key}
        onClick={() => setView(key)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '8px 15px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
          fontFamily: "'Manrope',sans-serif",
          border: `1px solid ${on ? t.hexA(t.accent, 0.55) : fill(0.12)}`,
          background: on ? t.hexA(t.accent, 0.16) : '#FFFFFF',
          color: on ? 'var(--ink)' : sub(0.6),
        }}
      >
        {name}
        {count != null && count > 0 && (
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: on ? t.hexA(t.accent, 0.3) : fill(0.07) }}>{count}</span>
        )}
      </button>
    )
  }

  return (
    <div style={{ ...t.GLASS, borderRadius: 24, padding: '24px 26px', maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Marking</div>
        <span style={{ fontSize: 12, color: sub(0.5) }}>{attempts.length} attempt{attempts.length === 1 ? '' : 's'} recorded</span>
      </div>
      <div style={{ fontSize: 12.5, color: sub(0.55), marginBottom: 14 }}>
        AI marks everything and flags what it's less sure about — but every mark is yours to check and adjust.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {viewChip('queue', 'Needs review', queue.length)}
        {viewChip('all', 'All attempts', attempts.length)}
      </div>

      {view === 'queue' ? (
        queue.length === 0 ? (
          <div style={{ fontSize: 13.5, color: sub(0.5), padding: '18px 0' }}>
            Nothing waiting for review
            {attempts.length === 0
              ? store.mode === 'cloud-teacher'
                ? ' — results appear here as students in your classes submit exams (any device)'
                : ' — results appear here after students submit exams on this device'
              : ' — all AI marking looks confident. Open “All attempts” to audit everything.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {queue.map((e, qi) => (
              <div key={`${e.attempt.id}-${e.index}-${qi}`} style={{ padding: 14, borderRadius: 14, background: fill(0.03), border: `1px solid ${fill(0.08)}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: sub(0.5), marginBottom: 8, flexWrap: 'wrap' }}>
                  <span><strong style={{ color: 'var(--ink)' }}>{e.attempt.student}</strong>{e.attempt.className ? ` (${e.attempt.className})` : ''} · {e.attempt.examTitle}</span>
                  <span>{fmtWhen(e.attempt.ts)}</span>
                </div>
                <ItemReview t={t} it={e.item} onPatch={(patch, label) => patchItem(e.attempt.id, e.index, patch, label)} />
              </div>
            ))}
          </div>
        )
      ) : (
        <AttemptsBrowser t={t} attempts={attempts} onPatch={patchItem} storeMode={store.mode} />
      )}

      {attempts.length > 0 && (
        <button
          onClick={() => { store.clearAttempts(); toast('Attempt history cleared') }}
          style={{ marginTop: 16, background: 'none', border: 'none', color: sub(0.45), fontSize: 12, cursor: 'pointer', padding: 0 }}
        >
          Clear recorded attempts
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// All-attempts browser: every submission, expandable to every answer with the
// AI's full verdict — the teacher sees the complete picture and can adjust
// any mark (chips, exact marks, or toggling individual scheme points).
// ---------------------------------------------------------------------------
function AttemptsBrowser({ t, attempts, onPatch, storeMode }) {
  const [openId, setOpenId] = useState(null)
  const [examFilter, setExamFilter] = useState('')
  const [who, setWho] = useState('')

  const examTitles = useMemo(() => [...new Set(attempts.map((a) => a.examTitle).filter(Boolean))], [attempts])
  const list = useMemo(() => {
    const f = attempts.filter((a) =>
      (!examFilter || a.examTitle === examFilter) &&
      (!who || (a.student || '').toLowerCase().includes(who.toLowerCase())))
    return [...f].sort((x, y) => (y.ts || 0) - (x.ts || 0))
  }, [attempts, examFilter, who])

  const inputStyle = { padding: '9px 12px', borderRadius: 10, background: 'var(--input-bg)', border: `1px solid ${fill(0.12)}`, color: 'var(--ink)', fontSize: 12.5, fontFamily: "'Manrope',sans-serif", outline: 'none' }

  if (attempts.length === 0) {
    return (
      <div style={{ fontSize: 13.5, color: sub(0.5), padding: '18px 0' }}>
        No attempts recorded yet
        {storeMode === 'cloud-teacher'
          ? ' — submissions from students in your classes will appear here, from any device.'
          : ' — submissions on this device will appear here.'}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {(examTitles.length > 1 || attempts.length > 5) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <select value={examFilter} onChange={(e) => setExamFilter(e.target.value)} style={{ ...inputStyle, minWidth: 160 }}>
            <option value="">All exams</option>
            {examTitles.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Filter by student…" style={{ ...inputStyle, width: 180 }} />
        </div>
      )}

      {list.map((a) => {
        const open = openId === a.id
        const flags = (a.items || []).filter((it) => it.needsReview && !it.override).length
        const adjusted = (a.items || []).filter((it) => it.override).length
        const totalMk = Number(a.totalMarks) || (a.items || []).reduce((s, it) => s + (Number(it.marks) || 1), 0)
        const earnedMk = (a.items || []).reduce((s, it) => s + (Number(it.score) || 0) * (Number(it.marks) || 1), 0)
        const pct = totalMk ? Math.round((earnedMk / totalMk) * 100) : 0
        return (
          <div key={a.id} style={{ borderRadius: 14, background: fill(0.03), border: `1px solid ${open ? t.hexA(t.accent, 0.35) : fill(0.08)}`, overflow: 'hidden' }}>
            <button
              onClick={() => setOpenId(open ? null : a.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: "'Manrope',sans-serif", color: 'var(--ink)' }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 700, minWidth: 120 }}>{a.student || 'Anonymous'}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: sub(0.55), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.examTitle}{a.className ? ` · ${a.className}` : ''} · {fmtWhen(a.ts)}
              </span>
              {flags > 0 && (
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', padding: '3px 9px', borderRadius: 999, background: 'rgba(255,179,71,0.13)', border: '1px solid rgba(255,179,71,0.45)', color: '#B87514', whiteSpace: 'nowrap' }}>
                  {flags} flagged
                </span>
              )}
              {adjusted > 0 && (
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', padding: '3px 9px', borderRadius: 999, background: t.hexA(t.accent, 0.1), border: `1px solid ${t.hexA(t.accent, 0.35)}`, color: t.accent, whiteSpace: 'nowrap' }}>
                  {adjusted} adjusted
                </span>
              )}
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>
                {fmt1(earnedMk)}/{totalMk}
                <span style={{ fontSize: 11.5, color: sub(0.5), fontWeight: 600 }}> · {pct}%</span>
              </span>
              <span style={{ fontSize: 12, color: sub(0.45), transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
            </button>
            {open && (
              <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(a.items || []).map((it, i) => (
                  <div key={i} style={{ padding: '12px 14px', borderRadius: 12, background: '#FFFFFF', border: `1px solid ${fill(0.08)}` }}>
                    <ItemReview t={t} it={it} label={it.displayLabel || String(i + 1)} onPatch={(patch, lbl) => onPatch(a.id, i, patch, lbl)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {list.length === 0 && <div style={{ fontSize: 13, color: sub(0.5), padding: '12px 0' }}>No attempts match those filters.</div>}
    </div>
  )
}

// One graded answer with the AI's full verdict and the adjust controls.
// Used by both the review queue and the all-attempts browser.
function ItemReview({ t, it, label, onPatch }) {
  const marks = Number(it.marks) || 1
  const aiMarks = Math.round((Number(it.score) || 0) * marks * 10) / 10
  const points = Array.isArray(it.points) ? it.points : null
  const srcLabel = it.source === 'ai' ? 'AI graded' : it.source === 'local-fallback' ? 'offline check' : it.answered === false ? 'not answered' : 'auto-checked'

  const togglePoint = (pi) => {
    const pts = points.map((p, j) => (j === pi ? { ...p, awarded: !p.awarded } : p))
    const n = pts.length || 1
    const got = pts.filter((p) => p.awarded).length
    onPatch({ points: pts, score: got / n, correct: got === n }, `${got}/${n} points`)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.45, flex: 1, minWidth: 200 }}>
          {label ? <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, color: t.accent, marginRight: 7 }}>{label}</span> : null}
          {it.prompt}
        </div>
        <span style={{ fontSize: 11.5, color: sub(0.5), whiteSpace: 'nowrap' }}>
          {it.override ? <strong style={{ color: t.accent }}>you: {it.override} · </strong> : null}
          AI: {fmt1(aiMarks)}/{marks}
          {typeof it.confidence === 'number' ? ` · ${Math.round(it.confidence * 100)}% sure` : ''} · {srcLabel}
        </span>
      </div>
      {it.stem ? <div style={{ fontSize: 12, color: sub(0.5), marginTop: 4, lineHeight: 1.5 }}>{it.stem}</div> : null}

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

      {points && points.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {points.map((p, pi) => (
            <button
              key={pi}
              onClick={() => togglePoint(pi)}
              title={p.awarded ? 'Click to take this point away' : 'Click to award this point'}
              style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: "'Manrope',sans-serif" }}
            >
              <span style={{ flexShrink: 0, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 10.5, padding: '2px 8px', borderRadius: 999, background: t.hexA(p.awarded ? t.OK : t.CORAL, 0.12), border: `1px solid ${t.hexA(p.awarded ? t.OK : t.CORAL, 0.4)}`, color: p.awarded ? t.OK : t.CORAL, whiteSpace: 'nowrap' }}>
                {p.awarded ? '✓' : '✗'} {p.code}
              </span>
              <span style={{ fontSize: 12, color: sub(0.65), lineHeight: 1.45 }}>
                {p.desc}
                {!p.awarded && p.reason ? <span style={{ color: t.CORAL }}> — {p.reason}</span> : null}
              </span>
            </button>
          ))}
          <span style={{ fontSize: 10.5, color: sub(0.4) }}>Tap a point to award or remove it — the mark updates instantly.</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {it.needsReview && !it.override && (
          <button style={chipBtn(t, t.OK)} onClick={() => onPatch({}, 'approved')}>✓ Approve AI mark</button>
        )}
        <button style={chipBtn(t, '#3E6FE0')} onClick={() => onPatch({ score: 1, correct: true, ...(points ? { points: points.map((p) => ({ ...p, awarded: true })) } : {}) }, 'full marks')}>Full marks</button>
        <button style={chipBtn(t, t.CORAL)} onClick={() => onPatch({ score: 0, correct: false, ...(points ? { points: points.map((p) => ({ ...p, awarded: false })) } : {}) }, 'zero')}>Zero</button>
        <MarksOverride t={t} max={marks} onSet={(m) => onPatch({ score: Math.max(0, Math.min(1, m / marks)), correct: m >= marks }, `${m}/${marks}`)} />
      </div>
    </div>
  )
}

export function ClassInsights({ t, store, toast, aiOn, onConnect }) {
  const attempts = store.attempts || []
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

  const sev = { high: t.CORAL, medium: '#E09A3E', low: t.OK }
  const label = { fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.4) }

  return (
    <div style={{ ...t.GLASS, borderRadius: 24, padding: '24px 26px', maxWidth: 860 }}>
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
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: sev[c.severity] }} />
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
    </div>
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
