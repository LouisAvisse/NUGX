// lib/calibrationLoop.ts — [PHASE-10] derive personalized signal
// weights from the trader's own outcome data.
//
// The Phase 1 path replay produces clean outcomes; Phase 2 stores
// the SignalBreakdown that each analysis was scored against.
// Together they answer: "across this trader's last N decided
// trades, how predictive is each signal?". Phase 10 takes that
// question and turns its answer into the actual weights used by
// the scoring engine.
//
// MVP fit: per-signal lift, NOT full logistic regression.
//   For each signal, compute:
//     winRateAligned   = HIT_TARGET / decided  when the signal
//                          DIRECTION matched the trade direction
//                          (BULLISH for LONG, BEARISH for SHORT)
//     winRateBaseline  = HIT_TARGET / decided  across all decided
//                          trades regardless of signal alignment
//     lift             = winRateAligned / winRateBaseline
//   Renormalize so the total still sums to 10 (to keep the UI's
//   X.X / 10 display stable). Signals with very low alignment
//   counts fall back to their default weight.
//
// Why not full logistic regression: at the scale of "single
// trader's history" (50-500 records), a logistic fit is
// over-parameterized and easily overfits. Per-signal lift is
// transparent, robust to small N, and easy to debug.
// Future enhancement: a real fit once N >> 200, gated by a
// cross-validation step.
//
// Pure read over getHistory(). Client-only. Returns either:
//   { calibrated: false, reason, sampleSize }     ← use defaults
//   { calibrated: true, weights, sampleSize, ... }← use derived

import { getHistory } from '@/lib/history'
import type { AnalysisHistoryRecord, Bias } from '@/lib/types'
import { DEFAULT_WEIGHTS, WEIGHTS_TOTAL, type Weights } from '@/lib/scoring'

// Minimum decided outcomes (HIT_TARGET + HIT_STOP) before we
// even attempt a calibration. Below this the lift numbers are
// pure noise. 30 is a pragmatic floor — about 6-10 weeks of
// active gold day-trading.
const MIN_DECIDED_OUTCOMES = 30

// Minimum aligned-direction outcomes per signal before its lift
// is trusted; below this we keep the default weight for that
// signal so a fluke doesn't dominate the score.
const MIN_PER_SIGNAL = 10

export interface CalibrationResult {
  calibrated: boolean
  reason?: 'NOT_ENOUGH_DATA' | 'NO_HISTORY'
  sampleSize: number
  weights: Weights
  // Per-signal raw lift values, exposed so the UI / debug can
  // show "trend lift 1.32x" if useful. Keys match Weights.
  perSignalLift?: Partial<Record<keyof Weights, number>>
  lastFitAt: string
}

// Decided records eligible for calibration:
//   - Has a path-replay outcome (HIT_TARGET or HIT_STOP)
//   - Not legacy (pre-Phase-1)
//   - Has a populated signals breakdown
//   - Recommendation is LONG or SHORT (FLAT records were not
//     traded; we don't include them in the per-signal counts)
function eligibleDecided(): AnalysisHistoryRecord[] {
  return getHistory().filter(
    (r) =>
      !r.legacyOutcome &&
      (r.recommendation === 'LONG' || r.recommendation === 'SHORT') &&
      (r.hitOutcome === 'HIT_TARGET' || r.hitOutcome === 'HIT_STOP')
  )
}

// For a given signal key + record, was the signal ALIGNED with
// the trade direction? LONG trade aligned-bullish → BULLISH;
// SHORT trade aligned-bullish → BEARISH (because BEARISH supports
// a SHORT). Returns null when the record's signals breakdown is
// missing (older pre-Phase-10 records).
function signalAligned(
  r: AnalysisHistoryRecord,
  key: keyof Weights
): boolean | null {
  if (!r.signals) return null
  const direction: Bias = r.signals[key]
  if (direction === 'NEUTRAL') return false
  if (r.recommendation === 'LONG') return direction === 'BULLISH'
  if (r.recommendation === 'SHORT') return direction === 'BEARISH'
  return null
}

// Compute per-signal lift across the eligible records. Returns
// the raw lift per signal (1.0 = baseline, > 1 = positive
// predictor, < 1 = negative). Signals with too few aligned
// observations report null.
function computePerSignalLift(
  records: AnalysisHistoryRecord[]
): Partial<Record<keyof Weights, number>> {
  const baselineWins = records.filter((r) => r.hitOutcome === 'HIT_TARGET').length
  const baselineDecided = records.length
  const baselineRate = baselineDecided > 0 ? baselineWins / baselineDecided : 0
  if (baselineRate === 0) return {}

  const out: Partial<Record<keyof Weights, number>> = {}
  for (const key of Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[]) {
    let alignedWins = 0
    let alignedTotal = 0
    for (const r of records) {
      const aligned = signalAligned(r, key)
      if (aligned !== true) continue
      alignedTotal++
      if (r.hitOutcome === 'HIT_TARGET') alignedWins++
    }
    if (alignedTotal < MIN_PER_SIGNAL) continue
    const alignedRate = alignedWins / alignedTotal
    out[key] = alignedRate / baselineRate
  }
  return out
}

// Build the final weights vector by scaling each default weight
// by its lift (when the lift is trusted), then renormalizing so
// the total stays at WEIGHTS_TOTAL. Signals with no trusted lift
// keep their default weight.
function applyLift(
  lift: Partial<Record<keyof Weights, number>>
): Weights {
  // Phase 1: scale each default weight by its lift (1.0 when no
  // trusted lift exists for that key).
  const scaled: Weights = { ...DEFAULT_WEIGHTS }
  for (const key of Object.keys(scaled) as (keyof Weights)[]) {
    const factor = lift[key] ?? 1.0
    // Clamp the factor to [0.5, 2.0] to prevent a tiny sample's
    // outlier from blowing up the weighting; the conservative
    // band still lets calibration shift weights meaningfully
    // without becoming destabilizing.
    const clamped = Math.max(0.5, Math.min(2.0, factor))
    scaled[key] = scaled[key] * clamped
  }
  // Renormalize so total sums to WEIGHTS_TOTAL — keeps the UI's
  // X.X / 10 display stable and lets us swap calibrated vs
  // default weights without changing the displayed max.
  const total = Object.values(scaled).reduce((a, b) => a + b, 0)
  if (total === 0) return DEFAULT_WEIGHTS
  const norm = WEIGHTS_TOTAL / total
  const out = {} as Weights
  for (const key of Object.keys(scaled) as (keyof Weights)[]) {
    out[key] = Math.round(scaled[key] * norm * 100) / 100
  }
  return out
}

// ─────────────────────────────────────────────────────────────────
// Public — compute the current calibration state.
// ─────────────────────────────────────────────────────────────────
export function computeCalibrationLoop(): CalibrationResult {
  const records = eligibleDecided()
  if (records.length === 0) {
    return {
      calibrated: false,
      reason: 'NO_HISTORY',
      sampleSize: 0,
      weights: DEFAULT_WEIGHTS,
      lastFitAt: new Date().toISOString(),
    }
  }
  if (records.length < MIN_DECIDED_OUTCOMES) {
    return {
      calibrated: false,
      reason: 'NOT_ENOUGH_DATA',
      sampleSize: records.length,
      weights: DEFAULT_WEIGHTS,
      lastFitAt: new Date().toISOString(),
    }
  }

  const lift = computePerSignalLift(records)
  // No trusted lift on any signal yet (signals breakdown not
  // persisted on records pre-extension). Return default weights
  // but tag as calibrated=true so the UI can surface the
  // "calibrated on N=X trades" provenance line — calibration
  // becomes meaningful once a future phase persists signals.
  if (Object.keys(lift).length === 0) {
    return {
      calibrated: true,
      sampleSize: records.length,
      weights: DEFAULT_WEIGHTS,
      perSignalLift: {},
      lastFitAt: new Date().toISOString(),
    }
  }

  const weights = applyLift(lift)
  return {
    calibrated: true,
    sampleSize: records.length,
    weights,
    perSignalLift: lift,
    lastFitAt: new Date().toISOString(),
  }
}

// Provenance copy for the UI — French summary the AnalysisPanel
// renders under the weighted score when calibration is active.
export function calibrationProvenance(result: CalibrationResult): string | null {
  if (!result.calibrated) {
    if (result.reason === 'NOT_ENOUGH_DATA') {
      return `Calibrage : ${result.sampleSize}/${MIN_DECIDED_OUTCOMES} résultats recueillis.`
    }
    return null
  }
  if (Object.keys(result.perSignalLift ?? {}).length === 0) {
    return `Pondérations par défaut · ${result.sampleSize} résultats stockés.`
  }
  return `Pondérations calibrées sur ${result.sampleSize} de vos résultats.`
}
