// ===========================================================================
// Predicted-grade (PG) co-pilot engine.
//
//   M̂ₛ = w₁·IAₛ + w₂·Mockₛ + Trendₛ + εstudent
//
// then a Monte Carlo simulation maps the composite percentage onto the IB 1–7
// scale by testing it against RANDOMLY SHIFTED grade boundaries (IB boundaries
// move every session), producing a probability per grade instead of a single
// number. Pure module — no React, no DOM — so every step is unit-testable.
//
// IMPORTANT: the per-subject calibration below (boundaries, moderation drift,
// IA weights, sigmas) is REALISTIC DUMMY DATA. A school should replace it with
// its own IBO accuracy reports and 5–10 years of boundary history. The output
// is advisory: the IBO requires the submitted PG to be the teacher's own
// professional judgement.
// ===========================================================================

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// ---------------------------------------------------------------------------
// Deterministic randomness — a student's prediction must not jitter between
// renders, so the Monte Carlo engine is seeded from the row's own inputs.
// ---------------------------------------------------------------------------
function hashStr(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Standard normal draw (Box–Muller).
function gauss(rng) {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ---------------------------------------------------------------------------
// DUMMY per-subject calibration. bounds = historical MEAN raw-% boundary for
// each grade; drift = the school's historical IA moderation drift (negative =
// the IBO usually moderates this department down); iaWeight = the IA's share
// of the final grade in %.
// ---------------------------------------------------------------------------
export const GENERIC_PRESET = {
  bounds: { 7: 74, 6: 62, 5: 50, 4: 38, 3: 26, 2: 14 },
  iaWeight: 25,
  drift: -4,
}

export const SUBJECT_PRESETS = {
  'Mathematics AA HL': { bounds: { 7: 71, 6: 59, 5: 47, 4: 36, 3: 25, 2: 15 }, iaWeight: 20, drift: -3.5 },
  'Mathematics AA SL': { bounds: { 7: 75, 6: 63, 5: 51, 4: 39, 3: 27, 2: 15 }, iaWeight: 20, drift: -3.5 },
  'Mathematics AI HL': { bounds: { 7: 72, 6: 60, 5: 48, 4: 37, 3: 26, 2: 15 }, iaWeight: 20, drift: -3 },
  'Mathematics AI SL': { bounds: { 7: 74, 6: 62, 5: 50, 4: 38, 3: 26, 2: 14 }, iaWeight: 20, drift: -3 },
  'Physics HL': { bounds: { 7: 70, 6: 58, 5: 46, 4: 36, 3: 26, 2: 16 }, iaWeight: 20, drift: -8.3 },
  'Physics SL': { bounds: { 7: 72, 6: 60, 5: 48, 4: 38, 3: 28, 2: 18 }, iaWeight: 20, drift: -5 },
  'Chemistry HL': { bounds: { 7: 72, 6: 60, 5: 48, 4: 37, 3: 26, 2: 16 }, iaWeight: 20, drift: -6 },
  'Chemistry SL': { bounds: { 7: 73, 6: 61, 5: 49, 4: 38, 3: 27, 2: 17 }, iaWeight: 20, drift: -6 },
  'Biology HL': { bounds: { 7: 72, 6: 60, 5: 49, 4: 38, 3: 27, 2: 16 }, iaWeight: 20, drift: -5.5 },
  'Biology SL': { bounds: { 7: 73, 6: 61, 5: 50, 4: 39, 3: 28, 2: 17 }, iaWeight: 20, drift: -5.5 },
  'Economics HL': { bounds: { 7: 76, 6: 64, 5: 53, 4: 42, 3: 31, 2: 20 }, iaWeight: 30, drift: -2.5 },
  'Economics SL': { bounds: { 7: 75, 6: 63, 5: 52, 4: 41, 3: 30, 2: 19 }, iaWeight: 30, drift: -2.5 },
  'English A HL': { bounds: { 7: 77, 6: 66, 5: 55, 4: 44, 3: 33, 2: 22 }, iaWeight: 30, drift: -4 },
  'English A SL': { bounds: { 7: 76, 6: 65, 5: 54, 4: 43, 3: 32, 2: 21 }, iaWeight: 30, drift: -4 },
  'Other (generic)': GENERIC_PRESET,
}

export const ENGINE = {
  runs: 1000,
  examSigma: 3.0, // ε execution noise on exam day (σ, in raw %)
  boundarySigma: 3.5, // how far a session's boundaries historically swing (σ, in raw %)
}

// ---------------------------------------------------------------------------
// Mockₛ — recency-weighted timed-mock signal. The most recent sit tells you
// the most; the DP1 baseline still anchors against a lucky final mock.
// ---------------------------------------------------------------------------
const RECENCY_WEIGHTS = { 1: [1], 2: [0.35, 0.65], 3: [0.15, 0.35, 0.5] }

export function weightedMocks(mocks) {
  const m = (mocks || []).filter((x) => Number.isFinite(x))
  if (!m.length) return null
  let w = RECENCY_WEIGHTS[m.length]
  if (!w) {
    // >3 mocks: geometric recency weighting
    w = m.map((_, i) => Math.pow(1.6, i))
    const s = w.reduce((a, b) => a + b, 0)
    w = w.map((x) => x / s)
  }
  return m.reduce((s, x, i) => s + x * w[i], 0)
}

// ---------------------------------------------------------------------------
// Trendₛ — learning-trajectory bonus/penalty. Least-squares slope across the
// mock series, damped by half and capped at ±5%: a rising student isn't
// anchored to their DP1 baseline, but one good paper can't add 15%.
// ---------------------------------------------------------------------------
export function trendBonus(mocks) {
  const m = (mocks || []).filter((x) => Number.isFinite(x))
  if (m.length < 2) return 0
  const n = m.length
  const mx = (n - 1) / 2
  const my = m.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (i - mx) * (m[i] - my)
    sxx += (i - mx) * (i - mx)
  }
  const slope = sxx ? sxy / sxx : 0
  return clamp(slope * 0.5, -5, 5)
}

// ---------------------------------------------------------------------------
// The full pipeline for one student × subject row.
// Input row: { student, subject, iaScore, iaMax, iaWeightPct, driftPct,
//              mocks: number[] (raw %, oldest→newest), epsilonPct, bounds? }
// Returns null when there is no usable evidence at all.
// ---------------------------------------------------------------------------
export function predictStudent(row) {
  const mocks = (row.mocks || []).map(Number).filter((x) => Number.isFinite(x) && x > 0 && x <= 100)
  const iaScore = Number(row.iaScore)
  const iaMax = Number(row.iaMax)
  const hasIA = Number.isFinite(iaScore) && Number.isFinite(iaMax) && iaMax > 0 && iaScore >= 0
  const iaPct = hasIA ? clamp((iaScore / iaMax) * 100, 0, 100) : null

  const drift = Number.isFinite(Number(row.driftPct)) ? Number(row.driftPct) : 0
  const iaCal = iaPct == null ? null : clamp(iaPct + drift, 0, 100)
  const mockAvg = weightedMocks(mocks)
  if (iaCal == null && mockAvg == null) return null

  // w₁/w₂ — the IA's official share of the subject grade; whatever evidence is
  // missing hands its weight to the other signal.
  const wIA = iaCal == null ? 0 : mockAvg == null ? 1 : clamp((Number(row.iaWeightPct) || 20) / 100, 0, 1)
  const wMock = 1 - wIA
  const trend = trendBonus(mocks)
  const eps = Number.isFinite(Number(row.epsilonPct)) ? Number(row.epsilonPct) : 0

  const composite = clamp(wIA * (iaCal ?? 0) + wMock * (mockAvg ?? iaCal ?? 0) + trend + eps, 0, 100)

  // --- Monte Carlo: test the composite against 1000 simulated sessions ------
  // Each iteration draws (a) one session-difficulty shift applied to every
  // boundary (an easy paper raises them all together) and (b) one exam-day
  // execution draw for the student.
  const bounds = row.bounds || GENERIC_PRESET.bounds
  const bSig = Number(row.boundarySigma) > 0 ? Number(row.boundarySigma) : ENGINE.boundarySigma
  const eSig = Number(row.examSigma) > 0 ? Number(row.examSigma) : ENGINE.examSigma
  const rng = mulberry32(hashStr(JSON.stringify([row.student, row.subject, composite, mocks, drift, eps])))

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 }
  for (let i = 0; i < ENGINE.runs; i++) {
    const shift = gauss(rng) * bSig
    const score = composite + gauss(rng) * eSig
    let g = 1
    for (let k = 7; k >= 2; k--) {
      if (score >= Number(bounds[k]) + shift) { g = k; break }
    }
    counts[g]++
  }

  const probs = {}
  for (let g = 1; g <= 7; g++) probs[g] = counts[g] / ENGINE.runs
  const ranked = [7, 6, 5, 4, 3, 2, 1].map((g) => ({ grade: g, p: probs[g] })).sort((a, b) => b.p - a.p)
  const top = ranked[0]
  const second = ranked[1]

  return {
    composite: Math.round(composite * 100) / 100,
    iaPct: iaPct == null ? null : Math.round(iaPct * 10) / 10,
    iaCal: iaCal == null ? null : Math.round(iaCal * 10) / 10,
    drift,
    mockAvg: mockAvg == null ? null : Math.round(mockAvg * 100) / 100,
    mocksUsed: mocks,
    trend: Math.round(trend * 100) / 100,
    eps,
    wIA,
    wMock,
    probs,
    top,
    second,
    // The doc's guard against over-upgrading: never submit a grade the
    // simulation is <60% sure of without a human decision.
    flagged: top.p < 0.6,
  }
}
