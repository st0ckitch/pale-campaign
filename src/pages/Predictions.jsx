import { useEffect, useMemo, useState } from 'react'
import { sub, fill } from '../theme.js'
import { predictStudent, SUBJECT_PRESETS, GENERIC_PRESET, ENGINE } from '../lib/predict.js'

// ---------------------------------------------------------------------------
// Predicted-grade co-pilot tab. The teacher enters each student's evidence
// (IA score, timed mocks, stress factor); the engine calibrates it against
// the school's historical moderation drift and Monte-Carlo-maps it onto the
// IB 1–7 scale with a probability per grade. Advisory by design: the IBO
// requires the submitted PG to be the teacher's own judgement, so this tool
// explains its reasoning and flags volatility instead of dictating a number.
// ---------------------------------------------------------------------------

const STORE_KEY = 'lh_pg_rows_v1'
const rid = () => 'pg' + Math.random().toString(36).slice(2, 9)

// Demo rows so the tool explains itself on first open. "Alex" is the worked
// example from the design doc (composite ≈74.3% → P(7)≈81%).
const seedRows = () => [
  { id: rid(), student: 'Alex', subject: 'Physics HL', iaScore: '21', iaMax: '24', iaWeightPct: '20', driftPct: '-8.3', mocks: ['62', '71', '74'], epsilonPct: '-1.5' },
  { id: rid(), student: 'Nino', subject: 'Mathematics AA HL', iaScore: '15', iaMax: '20', iaWeightPct: '20', driftPct: '-3.5', mocks: ['48', '57', '63'], epsilonPct: '-1' },
  { id: rid(), student: 'Giorgi', subject: 'Economics SL', iaScore: '20', iaMax: '25', iaWeightPct: '30', driftPct: '-2.5', mocks: ['73', '71', '77'], epsilonPct: '-2' },
]

const loadRows = () => {
  if (typeof window === 'undefined') return seedRows()
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return seedRows()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) && arr.length ? arr : seedRows()
  } catch {
    return seedRows()
  }
}

const presetFor = (subject) => SUBJECT_PRESETS[subject] || GENERIC_PRESET

const gradeColor = (t, g) => (g >= 6 ? t.OK : g >= 4 ? '#E09A3E' : t.CORAL)

const fmtPct = (v) => {
  const r = Math.round(v * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

export default function Predictions({ t, store, toast, label, inputStyle }) {
  const [rows, setRows] = useState(loadRows)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(rows))
    } catch {
      /* storage full/blocked — the tab still works, it just won't persist */
    }
  }, [rows])

  const [newName, setNewName] = useState('')
  const [newSubject, setNewSubject] = useState('Mathematics AA HL')

  const attempts = store.attempts || []
  const attemptsByStudent = useMemo(() => {
    const map = {}
    for (const a of attempts) {
      const key = (a.student || '').trim().toLowerCase()
      if (!key) continue
      if (!map[key]) map[key] = []
      map[key].push(a)
    }
    for (const k of Object.keys(map)) map[k].sort((x, y) => (x.ts || 0) - (y.ts || 0))
    return map
  }, [attempts])

  const patchRow = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id))

  const addRow = () => {
    const name = newName.trim()
    if (!name) { toast('Give the student a name'); return }
    const p = presetFor(newSubject)
    setRows((rs) => [
      { id: rid(), student: name, subject: newSubject, iaScore: '', iaMax: '24', iaWeightPct: String(p.iaWeight), driftPct: String(p.drift), mocks: ['', '', ''], epsilonPct: '-1.5' },
      ...rs,
    ])
    setNewName('')
  }

  const pullAttempts = (row) => {
    const list = attemptsByStudent[(row.student || '').trim().toLowerCase()] || []
    const pcts = list.slice(-3).map((a) => {
      const total = Number(a.totalMarks) || (a.items || []).reduce((s, it) => s + (Number(it.marks) || 1), 0)
      const earned = (a.items || []).reduce((s, it) => s + (Number(it.score) || 0) * (Number(it.marks) || 1), 0)
      return total ? String(Math.round((earned / total) * 1000) / 10) : ''
    }).filter(Boolean)
    if (!pcts.length) { toast('No recorded exam results for that name'); return }
    // right-align: newest result lands in the DP2-final slot
    const mocks = [...Array(Math.max(0, 3 - pcts.length)).fill(''), ...pcts].slice(-3)
    patchRow(row.id, { mocks })
    toast(`Filled from ${pcts.length} recorded exam${pcts.length === 1 ? '' : 's'} (oldest → newest)`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* EXPLAINER */}
      <section style={{ ...t.GLASS, borderRadius: 24, padding: '24px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Predicted grades — co-pilot</div>
          <span style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: t.hexA(t.accent, 0.12), border: `1px solid ${t.hexA(t.accent, 0.35)}`, color: t.accent }}>
            Advisory — you make the final call
          </span>
        </div>
        <p style={{ fontSize: 13, color: sub(0.6), lineHeight: 1.65, margin: '10px 0 0', maxWidth: 760 }}>
          For each student the engine computes <strong style={{ color: 'var(--ink)' }}>M̂ = w₁·IA + w₂·Mocks + Trend + ε</strong>:
          the IA is calibrated by your school's historical moderation drift, timed mocks are recency-weighted
          (15/35/50), the trajectory slope rewards genuine improvement, and ε absorbs exam-day execution variance.
          The composite is then tested against <strong style={{ color: 'var(--ink)' }}>{ENGINE.runs} simulated exam sessions</strong> with
          historically shifted grade boundaries — so you get a probability per grade, not a guess. Predictions
          under 60% confidence are flagged as volatile.
        </p>
        <p style={{ fontSize: 11.5, color: sub(0.45), lineHeight: 1.6, margin: '8px 0 0', maxWidth: 760 }}>
          Boundary histories, moderation drifts and IA weights are demo values — replace them per subject with your
          school's IBO accuracy reports. The IBO requires submitted PGs to be the teacher's professional judgement;
          this tool argues its case and shows the risk, it never submits anything.
        </p>

        {/* add student */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ minWidth: 200 }}>
            <label style={label}>Student</label>
            <input
              style={inputStyle}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              list="pg-students"
              onKeyDown={(e) => e.key === 'Enter' && addRow()}
            />
            <datalist id="pg-students">
              {(store.students || []).map((s) => <option key={s.id} value={s.name || s.id} />)}
            </datalist>
          </div>
          <div style={{ minWidth: 200 }}>
            <label style={label}>Subject</label>
            <select style={{ ...inputStyle, padding: '12px 10px' }} value={newSubject} onChange={(e) => setNewSubject(e.target.value)}>
              {Object.keys(SUBJECT_PRESETS).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button style={{ ...t.cta, padding: '12px 20px' }} onClick={addRow}>+ Add prediction</button>
        </div>
      </section>

      {/* ROWS */}
      {rows.map((row) => (
        <PredictionCard
          key={row.id}
          t={t}
          row={row}
          onPatch={(patch) => patchRow(row.id, patch)}
          onRemove={() => removeRow(row.id)}
          onPull={() => pullAttempts(row)}
          hasAttempts={!!attemptsByStudent[(row.student || '').trim().toLowerCase()]}
          label={label}
          inputStyle={inputStyle}
        />
      ))}
    </div>
  )
}

function PredictionCard({ t, row, onPatch, onRemove, onPull, hasAttempts, label, inputStyle }) {
  const preset = presetFor(row.subject)
  const result = useMemo(() => predictStudent({
    student: row.student,
    subject: row.subject,
    iaScore: row.iaScore === '' ? NaN : Number(row.iaScore),
    iaMax: Number(row.iaMax),
    iaWeightPct: Number(row.iaWeightPct),
    driftPct: Number(row.driftPct),
    mocks: (row.mocks || []).map((m) => (m === '' ? NaN : Number(m))),
    epsilonPct: Number(row.epsilonPct),
    bounds: preset.bounds,
  }), [row, preset])

  const num = { ...inputStyle, padding: '9px 10px', fontSize: 13, textAlign: 'center' }
  const smallLabel = { ...label, fontSize: 10, marginBottom: 4 }

  const setSubject = (s) => {
    const p = presetFor(s)
    // switching subject re-seeds that subject's calibration defaults
    onPatch({ subject: s, driftPct: String(p.drift), iaWeightPct: String(p.iaWeight) })
  }

  const mockLabels = ['DP1 mock %', 'DP2 mid %', 'DP2 final %']

  return (
    <section style={{ ...t.GLASS, borderRadius: 24, padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          value={row.student}
          onChange={(e) => onPatch({ student: e.target.value })}
          style={{ ...inputStyle, width: 170, padding: '9px 12px', fontWeight: 700, fontSize: 14 }}
        />
        <select value={row.subject} onChange={(e) => setSubject(e.target.value)} style={{ ...inputStyle, width: 210, padding: '9px 10px', fontSize: 13 }}>
          {Object.keys(SUBJECT_PRESETS).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          {hasAttempts && (
            <button onClick={onPull} style={{ background: 'none', border: 'none', color: t.accent, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, padding: 0 }}>
              ⇣ Use recorded exam results
            </button>
          )}
          <button onClick={onRemove} style={{ background: 'none', border: 'none', color: t.CORAL, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, padding: 0 }}>Remove</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 20, alignItems: 'start' }}>
        {/* INPUTS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ ...smallLabel, marginBottom: 6 }}>Internal assessment (IAₛ)</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="number" value={row.iaScore} onChange={(e) => onPatch({ iaScore: e.target.value })} placeholder="21" style={{ ...num, width: 64 }} />
              <span style={{ fontSize: 12.5, color: sub(0.5) }}>/</span>
              <input type="number" value={row.iaMax} onChange={(e) => onPatch({ iaMax: e.target.value })} placeholder="24" style={{ ...num, width: 64 }} />
              <span style={{ fontSize: 11.5, color: sub(0.5) }}>weight</span>
              <input type="number" value={row.iaWeightPct} onChange={(e) => onPatch({ iaWeightPct: e.target.value })} style={{ ...num, width: 56 }} />
              <span style={{ fontSize: 11.5, color: sub(0.5) }}>% of grade</span>
            </div>
          </div>
          <div>
            <div style={smallLabel}>School IA moderation drift μ (%, from IBO reports — negative = usually moderated down)</div>
            <input type="number" step="0.1" value={row.driftPct} onChange={(e) => onPatch({ driftPct: e.target.value })} style={{ ...num, width: 84 }} />
          </div>
          <div>
            <div style={smallLabel}>Timed mocks (Mockₛ) — raw %, oldest → newest, weighted 15 / 35 / 50</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(row.mocks || ['', '', '']).map((m, i) => (
                <div key={i}>
                  <input
                    type="number"
                    value={m}
                    onChange={(e) => {
                      const mocks = [...(row.mocks || ['', '', ''])]
                      mocks[i] = e.target.value
                      onPatch({ mocks })
                    }}
                    placeholder="—"
                    style={{ ...num, width: 82 }}
                  />
                  <div style={{ fontSize: 9.5, color: sub(0.4), textAlign: 'center', marginTop: 3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{mockLabels[i]}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={smallLabel}>Stress / execution variance ε (%, timed vs untimed drop)</div>
            <input type="number" step="0.1" value={row.epsilonPct} onChange={(e) => onPatch({ epsilonPct: e.target.value })} style={{ ...num, width: 84 }} />
          </div>
        </div>

        {/* OUTPUT */}
        {result ? (
          <PredictionResult t={t} result={result} preset={preset} row={row} />
        ) : (
          <div style={{ padding: '22px 20px', borderRadius: 16, background: fill(0.03), border: `1px dashed ${fill(0.15)}`, fontSize: 13, color: sub(0.5), lineHeight: 1.6 }}>
            Enter at least one timed mock or the IA score — the engine needs evidence, not intuition.
          </div>
        )}
      </div>
    </section>
  )
}

function PredictionResult({ t, result: r, preset, row }) {
  const color = gradeColor(t, r.top.grade)
  const visible = [7, 6, 5, 4, 3, 2, 1].filter((g) => r.probs[g] >= 0.005)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* headline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.45) }}>Predicted</span>
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 42, lineHeight: 1, color }}>{r.top.grade}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: sub(0.6) }}>{Math.round(r.top.p * 100)}% confidence</span>
        </div>
        {r.flagged ? (
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 999, background: 'rgba(255,179,71,0.13)', border: '1px solid rgba(255,179,71,0.5)', color: '#B87514' }}>
            ⚠ Volatile — under 60%
          </span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 999, background: 'rgba(52,199,150,0.12)', border: '1px solid rgba(52,199,150,0.45)', color: t.OK }}>
            Stable evidence
          </span>
        )}
      </div>

      {/* probability band */}
      <div>
        <div style={{ display: 'flex', height: 26, borderRadius: 999, overflow: 'hidden', border: `1px solid ${fill(0.1)}` }}>
          {visible.map((g) => (
            <div
              key={g}
              title={`Grade ${g}: ${Math.round(r.probs[g] * 100)}%`}
              style={{
                width: `${r.probs[g] * 100}%`,
                background: t.hexA(gradeColor(t, g), g === r.top.grade ? 0.85 : 0.35),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 11.5,
                color: g === r.top.grade ? '#FFFFFF' : 'var(--ink)',
                minWidth: r.probs[g] >= 0.06 ? 30 : 0,
              }}
            >
              {r.probs[g] >= 0.06 ? g : ''}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap', fontSize: 11.5, color: sub(0.55) }}>
          {visible.map((g) => (
            <span key={g}><strong style={{ color: 'var(--ink)' }}>P({g})</strong> {Math.round(r.probs[g] * 100)}%</span>
          ))}
        </div>
      </div>

      {/* risk line for conditional offers */}
      {r.second.p >= 0.1 && (
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: sub(0.65), padding: '10px 13px', borderRadius: 12, background: fill(0.03), border: `1px solid ${fill(0.08)}` }}>
          {r.flagged
            ? <>Submitting a <strong>{r.top.grade}</strong> carries a <strong style={{ color: '#B87514' }}>{Math.round(r.second.p * 100)}% risk</strong> of the student landing on a {r.second.grade}. If a university offer strictly requires a {Math.max(r.top.grade, r.second.grade)}, gather one more timed mock before deciding.</>
            : <>Downside band: {Math.round(r.second.p * 100)}% chance of a {r.second.grade} if boundaries shift {r.second.grade < r.top.grade ? 'up' : 'down'} — safe enough to submit, worth mentioning to the counsellor for strict conditional offers.</>}
        </div>
      )}

      {/* explainability — every number the engine used */}
      <div style={{ padding: '12px 14px', borderRadius: 12, background: fill(0.03), border: `1px solid ${fill(0.08)}` }}>
        <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.4), marginBottom: 8 }}>Why — full working</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: sub(0.7), lineHeight: 1.55 }}>
          {r.iaPct != null && (
            <span>IA {fmtPct(r.iaPct)}% {r.drift !== 0 ? <>→ <strong style={{ color: 'var(--ink)' }}>{fmtPct(r.iaCal)}%</strong> after {r.drift > 0 ? '+' : ''}{r.drift}% historical moderation drift</> : null} · weight {Math.round(r.wIA * 100)}%</span>
          )}
          {r.mockAvg != null && (
            <span>Timed mocks [{r.mocksUsed.join(', ')}] → recency-weighted <strong style={{ color: 'var(--ink)' }}>{fmtPct(r.mockAvg)}%</strong> · weight {Math.round(r.wMock * 100)}%</span>
          )}
          {r.trend !== 0 && (
            <span>Trajectory {r.trend > 0 ? 'rising' : 'falling'} → <strong style={{ color: r.trend > 0 ? t.OK : t.CORAL }}>{r.trend > 0 ? '+' : ''}{fmtPct(r.trend)}%</strong> trend adjustment</span>
          )}
          {r.eps !== 0 && <span>Exam-day execution variance ε → {r.eps > 0 ? '+' : ''}{fmtPct(r.eps)}%</span>}
          <span>Composite <strong style={{ color: 'var(--ink)' }}>M̂ = {fmtPct(r.composite)}%</strong> · tested against {ENGINE.runs} sessions with boundaries shifted ±{ENGINE.boundarySigma}% (σ) around the {row.subject} history (7 ≥ {preset.bounds[7]}%, 6 ≥ {preset.bounds[6]}%, 5 ≥ {preset.bounds[5]}%…)</span>
        </div>
      </div>
    </div>
  )
}
