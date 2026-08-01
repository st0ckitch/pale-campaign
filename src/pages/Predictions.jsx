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
  const [showMath, setShowMath] = useState(false)

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

        <button
          onClick={() => setShowMath((v) => !v)}
          style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: "'Manrope',sans-serif", background: showMath ? t.hexA(t.accent, 0.14) : fill(0.04), border: `1px solid ${showMath ? t.hexA(t.accent, 0.5) : fill(0.12)}`, color: showMath ? 'var(--ink)' : sub(0.65) }}
        >
          <span style={{ transform: showMath ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block' }}>›</span>
          {showMath ? 'Hide the formula explanation' : 'How the formula works — full explanation'}
        </button>

        {showMath && <FormulaExplainer t={t} />}

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

// ---------------------------------------------------------------------------
// Term-by-term walkthrough of the prediction formula, using the same worked
// example ("Alex", Physics HL) that ships as the first demo card below — so
// every number here can be checked against a live card.
// ---------------------------------------------------------------------------
function FormulaExplainer({ t }) {
  const mono = { fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700 }
  const h = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.4) }
  const body = { fontSize: 12.5, lineHeight: 1.65, color: sub(0.7), margin: 0 }
  const exBox = { marginTop: 8, padding: '8px 12px', borderRadius: 10, background: t.hexA(t.accent, 0.06), border: `1px solid ${t.hexA(t.accent, 0.22)}`, fontSize: 12, color: sub(0.75), lineHeight: 1.6 }
  const sym = (s) => (
    <span style={{ ...mono, fontSize: 12, padding: '2px 9px', borderRadius: 999, background: t.hexA(t.accent, 0.12), border: `1px solid ${t.hexA(t.accent, 0.35)}`, color: t.accent, whiteSpace: 'nowrap' }}>{s}</span>
  )

  const TERMS = [
    {
      s: 'IAₛ', name: 'Internal Assessment signal',
      what: <>The student's IA mark converted to a percentage, then <strong style={{ color: 'var(--ink)' }}>calibrated by your school's historical moderation drift μ</strong>. The IBO re-marks a sample of every school's IAs; if your department is consistently moderated down, raw teacher marks systematically over-predict — so the drift is applied before the IA is allowed to count.</>,
      ex: <>Alex's IA: 21/24 = 87.5%. School's Physics IAs historically moderated <strong>−8.3%</strong> → calibrated IAₛ = <strong>79.2%</strong>.</>,
    },
    {
      s: 'w₁ · w₂', name: 'Component weights',
      what: <>The IA's official share of the final subject grade (≈20% in maths and sciences, ≈30% in essay subjects) — w₂ = 1 − w₁ goes to the exam signal, mirroring how the IBO itself combines coursework and papers. If one signal is missing (no IA yet, or no mocks), its weight transfers to the other rather than dragging the composite to zero.</>,
      ex: <>Physics HL: w₁ = 0.20, w₂ = 0.80 → 0.20 × 79.2 = <strong>15.84</strong> and 0.80 × 71.15 = <strong>56.92</strong>.</>,
    },
    {
      s: 'Mockₛ', name: 'Timed exam signal',
      what: <>Scores from past papers sat under strict timed conditions — the single best predictor of exam-day performance. The three sits are <strong style={{ color: 'var(--ink)' }}>recency-weighted 15% / 35% / 50%</strong> (oldest → newest): the DP2 final mock says the most about where the student is now, but the DP1 baseline still anchors against one lucky paper. Classwork and homework are deliberately excluded — they measure effort in a familiar environment, not execution under pressure.</>,
      ex: <>Alex: 0.15×62 + 0.35×71 + 0.50×74 = <strong>71.15%</strong>.</>,
    },
    {
      s: 'Trendₛ', name: 'Learning trajectory (w₃ term)',
      what: <>A least-squares slope fitted across the mock series, then <strong style={{ color: 'var(--ink)' }}>damped by half and capped at ±5%</strong>. A genuinely rising student isn't anchored to their DP1 score (the anti-under-prediction guard), but a single good paper can't inflate the composite either. A falling series subtracts the same way.</>,
      ex: <>Alex: 62 → 71 → 74 fits a slope of +6 per mock → damped to <strong>+3.0%</strong>.</>,
    },
    {
      s: 'ε', name: 'Stress / execution variance',
      what: <>How much this particular student typically drops between untimed work and timed exam-hall conditions — time management, exam anxiety, silly slips under pressure. Until the app has enough timed-vs-untimed history to compute it per student, it's an editable estimate (default −1.5%).</>,
      ex: <>Alex loses ≈1.5% to time pressure on long Paper 2 questions → ε = <strong>−1.5%</strong>.</>,
    },
    {
      s: 'M̂ₛ', name: 'Composite percentage',
      what: <>The sum of everything above — the engine's best single estimate of the raw mark the student would score if the final exam were sat tomorrow.</>,
      ex: <>Alex: 15.84 + 56.92 + 3.0 − 1.5 = <strong>M̂ = 74.26%</strong>.</>,
    },
    {
      s: 'HistoricalShiftₛ', name: 'Boundary adjustment (w₄ term) — the Monte Carlo stage',
      what: <>IB grade boundaries are not fixed: the 7-boundary in a subject can sit at 67% one session and 73% the next, set after everyone has sat the paper. So comparing M̂ against a single cut-off is guesswork. Instead the engine runs <strong style={{ color: 'var(--ink)' }}>{ENGINE.runs} simulated exam sessions</strong>. Each run draws (1) one session-difficulty shift ~ N(0, {ENGINE.boundarySigma}%) applied to every boundary together — an easy paper raises them all — and (2) one exam-day performance draw for the student ~ N(M̂, {ENGINE.examSigma}%). The run's grade is wherever the simulated score lands among the simulated boundaries; counting all runs turns the single composite into a probability per grade.</>,
      ex: <>Alex vs the Physics HL history (7 ≥ ~70%): in 812 of 1,000 simulated sessions his draw clears the shifted 7-boundary, in 188 it doesn't → <strong>P(7) = 81%, P(6) = 19%</strong>.</>,
    },
  ]

  return (
    <div style={{ marginTop: 14, padding: '18px 20px', borderRadius: 16, background: fill(0.03), border: `1px solid ${fill(0.09)}` }}>
      {/* the formula itself */}
      <div style={h}>The formula</div>
      <div style={{ marginTop: 10, padding: '14px 18px', borderRadius: 12, background: '#FFFFFF', border: `1px solid ${fill(0.1)}`, overflowX: 'auto' }}>
        <div style={{ ...mono, fontSize: 16, whiteSpace: 'nowrap' }}>
          M̂ₛ <span style={{ color: sub(0.45) }}>=</span> <span style={{ color: t.accent }}>w₁·IAₛ</span> <span style={{ color: sub(0.45) }}>+</span> <span style={{ color: t.accent }}>w₂·Mockₛ</span> <span style={{ color: sub(0.45) }}>+</span> <span style={{ color: t.accent }}>Trendₛ</span> <span style={{ color: sub(0.45) }}>+</span> <span style={{ color: t.accent }}>ε</span>
          <span style={{ color: sub(0.45) }}>  →  Monte Carlo ×{ENGINE.runs} vs shifted boundaries  →  </span>
          <span style={{ color: t.OK }}>P(grade 1…7)</span>
        </div>
      </div>
      <p style={{ ...body, marginTop: 8, fontSize: 11.5, color: sub(0.5) }}>
        Same architecture as the reference model M̂ₛ = w₁·IAₛ + w₂·Mockₛ + w₃·Trendₛ + w₄·HistoricalShiftₛ + ε — the
        w₃ term is the damped trajectory bonus below, and the w₄ HistoricalShift term is applied where it belongs
        mathematically: not as a bonus on the student's score, but as the random movement of the grade boundaries
        inside the Monte Carlo simulation.
      </p>

      {/* term by term */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        {TERMS.map((term) => (
          <div key={term.name} style={{ padding: '12px 14px', borderRadius: 12, background: '#FFFFFF', border: `1px solid ${fill(0.08)}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 6 }}>
              {sym(term.s)}
              <span style={{ fontSize: 13, fontWeight: 700 }}>{term.name}</span>
            </div>
            <p style={body}>{term.what}</p>
            <div style={exBox}><strong style={{ color: t.accent }}>Worked example (Alex, Physics HL):</strong> {term.ex}</div>
          </div>
        ))}
      </div>

      {/* the two guards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(52,199,150,0.06)', border: '1px solid rgba(52,199,150,0.3)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: t.OK, marginBottom: 5 }}>Guard against over-predicting</div>
          <p style={body}>
            The moderation drift deflates optimistic internal marks before they count, and any prediction whose top
            grade is under <strong style={{ color: 'var(--ink)' }}>60% confidence is flagged volatile</strong> — the
            model refuses to present a coin-flip as a safe number. A teacher seeing Alex's raw 87.5% IA might call
            him a certain 7; the engine knows the department gets moderated −8.3% and prices that in.
          </p>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 12, background: t.hexA(t.accent, 0.05), border: `1px solid ${t.hexA(t.accent, 0.25)}` }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: t.accent, marginBottom: 5 }}>Guard against under-predicting</div>
          <p style={body}>
            The trajectory term stops a rising student being anchored to old evidence. A strict teacher seeing
            Alex's 62% DP1 mock might refuse to predict a 7; the engine sees 62 → 71 → 74, adds the damped +3%
            trend, and the simulation shows the 7 is in fact the 81%-likely outcome.
          </p>
        </div>
      </div>

      <p style={{ ...body, marginTop: 12, fontSize: 11.5, color: sub(0.5) }}>
        Every card below shows this exact pipeline applied to its own inputs under "Why — full working", so any
        prediction can be audited number by number. Randomness is seeded per student — the same inputs always
        reproduce the same probabilities.
      </p>
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

      {/* without vs with the simulation */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ padding: '12px 14px', borderRadius: 12, background: fill(0.03), border: `1px solid ${fill(0.09)}` }}>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.4), marginBottom: 6 }}>
            Without the simulation — static read
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 26, color: sub(0.55) }}>{r.staticGrade}</span>
            <span style={{ fontSize: 11.5, color: sub(0.5) }}>one number, no risk info</span>
          </div>
          <div style={{ fontSize: 11.5, color: sub(0.5), lineHeight: 1.55, marginTop: 4 }}>
            {fmtPct(r.composite)}% against boundaries frozen at their historical average
            (7 ≥ {preset.bounds[7]}%, 6 ≥ {preset.bounds[6]}%…) — how a spreadsheet would read it.
          </div>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 12, background: t.hexA(t.accent, 0.05), border: `1px solid ${t.hexA(t.accent, 0.3)}` }}>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: t.accent, marginBottom: 6 }}>
            With {ENGINE.runs} simulated sessions
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 26, color }}>{r.top.grade}</span>
            <span style={{ fontSize: 11.5, color: sub(0.6), fontWeight: 700 }}>{Math.round(r.top.p * 100)}% · plus the {Math.round(r.second.p * 100)}% risk of a {r.second.grade}</span>
          </div>
          <div style={{ fontSize: 11.5, color: sub(0.55), lineHeight: 1.55, marginTop: 4 }}>
            {r.staticGrade === r.top.grade
              ? <>Same headline grade — but now you can see how safe it actually is before submitting it.</>
              : <>The static read says <strong>{r.staticGrade}</strong>, but across realistically shifted boundaries <strong>{r.top.grade}</strong> is the more likely outcome — exactly the case a fixed cut-off gets wrong.</>}
          </div>
        </div>
      </div>

      <LiveSim t={t} draws={r.draws} bounds={preset.bounds} composite={r.composite} top={r.top} />

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

// ---------------------------------------------------------------------------
// Replays the Monte Carlo run session by session so the "1000 iterations"
// stop being abstract. The draws come from the SAME seeded run that produced
// the headline probabilities — the engine computes all 1000 instantly (<1ms,
// in the browser, on every edit); this component only reveals them slowly.
// ---------------------------------------------------------------------------
function LiveSim({ t, draws, bounds, composite, top }) {
  const [open, setOpen] = useState(false)
  const [n, setN] = useState(0) // sessions revealed so far
  const [playing, setPlaying] = useState(false)
  const total = draws.length

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setN((v) => {
        const next = Math.min(total, v + 9)
        if (next >= total) setPlaying(false)
        return next
      })
    }, 40)
    return () => clearInterval(id)
  }, [playing, total])

  // A new prediction (inputs changed) invalidates a half-played run.
  useEffect(() => { setN(0); setPlaying(false) }, [draws])

  const start = () => {
    setOpen(true)
    setN(0)
    setPlaying(true)
  }

  const seen = draws.slice(0, n)
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 }
  for (const d of seen) counts[d.grade]++
  const last = n > 0 ? draws[n - 1] : null
  const done = n >= total

  return (
    <div style={{ borderRadius: 12, background: fill(0.03), border: `1px solid ${fill(0.08)}`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
        <button
          onClick={playing ? () => setPlaying(false) : start}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Manrope',sans-serif", background: t.hexA(t.accent, 0.14), border: `1px solid ${t.hexA(t.accent, 0.5)}`, color: 'var(--ink)' }}
        >
          {playing ? '⏸ Pause' : n > 0 && !done ? '▶ Resume' : `▶ Watch the ${total.toLocaleString()} sessions run`}
        </button>
        {n > 0 && (
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13 }}>
            Session {n.toLocaleString()} / {total.toLocaleString()}
          </span>
        )}
        {done && (
          <span style={{ fontSize: 11.5, color: t.OK, fontWeight: 700 }}>
            ✓ finished — P({top.grade}) = {Math.round((counts[top.grade] / total) * 100)}%, same as the headline (same seeded draws)
          </span>
        )}
        {n === 0 && (
          <span style={{ fontSize: 11.5, color: sub(0.5) }}>
            The engine already ran all of them instantly — this replays the exact same draws slowly.
          </span>
        )}
      </div>

      {open && n > 0 && (
        <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* the current draw, spelled out */}
          {last && (
            <div style={{ padding: '9px 12px', borderRadius: 10, background: '#FFFFFF', border: `1px solid ${fill(0.1)}`, fontSize: 12, lineHeight: 1.6, color: sub(0.7) }}>
              <strong style={{ color: 'var(--ink)' }}>Session #{n}:</strong>{' '}
              paper difficulty shifts every boundary <strong style={{ color: last.shift >= 0 ? '#B87514' : t.OK }}>{last.shift >= 0 ? '+' : ''}{last.shift}%</strong>{' '}
              (a 7 needs {fmtPct(Number(bounds[7]) + last.shift)}%, a 6 needs {fmtPct(Number(bounds[6]) + last.shift)}%) ·
              exam-day draw around M̂ {fmtPct(composite)}% lands on <strong style={{ color: 'var(--ink)' }}>{last.score}%</strong>{' '}
              → <strong style={{ color: gradeColor(t, last.grade) }}>grade {last.grade}</strong>
            </div>
          )}

          {/* accumulating tallies */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[7, 6, 5, 4, 3, 2, 1].map((g) => {
              const c = counts[g]
              const pct = n ? (c / n) * 100 : 0
              if (c === 0 && !done) return null
              if (c === 0) return null
              return (
                <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 12, width: 14, color: gradeColor(t, g) }}>{g}</span>
                  <div style={{ flex: 1, height: 14, borderRadius: 999, background: fill(0.06), overflow: 'hidden' }}>
                    <div style={{ width: `${(c / total) * 100}%`, height: '100%', borderRadius: 999, background: t.hexA(gradeColor(t, g), 0.75), transition: 'width .04s linear' }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: sub(0.55), width: 130, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>
                    {c.toLocaleString()} session{c === 1 ? '' : 's'} · {Math.round(pct)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
