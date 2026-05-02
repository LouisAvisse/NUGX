// lib/calibration.ts — confidence calibration computed from
// stored analysis history. The trader's HIGH-confidence analyses
// SHOULD outperform their MEDIUM ones; if they don't, the
// AnalysisPanel surfaces a warning so the trader can adjust.
//
// CLIENT-ONLY (reads via lib/history.ts which uses
// localStorage). Pure function — call directly each render; the
// computation is cheap and reading from storage is synchronous.

import { getHistory } from '@/lib/history'
import type {
  AnalysisHistoryRecord,
  ConfidenceCalibration,
  TradeOutcome,
} from '@/lib/types'

// Minimum decided outcomes per confidence bucket before we
// surface an accuracy number. With fewer than 3 outcomes the
// number is too noisy to be meaningful — show "——" instead.
const MIN_BUCKET_OUTCOMES = 3

// Threshold for `isCalibrated` — the bar at which the calibration
// card is allowed to render its three rows. Below this we hold
// back and show the progress-bar onboarding state instead.
const MIN_CALIBRATED_OUTCOMES = 10

// [PHASE-1] Map a record's outcome to a tri-state.
//
// Reads ONLY the path-based hitOutcome — legacy outcome2H/4H
// fields are ignored because their classifier was structurally
// broken (false positives on stop-then-target paths).
// legacyOutcome=true records are excluded so the accuracy %
// reflects only post-fix data. The MIN_CALIBRATED_OUTCOMES gate
// below keeps the card in onboarding state until enough fresh
// outcomes accumulate.
function getOutcome(r: AnalysisHistoryRecord): 'correct' | 'incorrect' | null {
  if (r.legacyOutcome) return null
  const outcome: TradeOutcome | undefined = r.hitOutcome
  if (outcome === 'HIT_TARGET') return 'correct'
  if (outcome === 'HIT_STOP') return 'incorrect'
  return null
}

// Per-bucket accuracy. Returns null when we don't have enough
// decided outcomes — distinct from "0%" which would mislead the
// reader. Caller renders "——" for null.
function calcAccuracy(records: AnalysisHistoryRecord[]): number | null {
  const decided = records.filter((r) => getOutcome(r) !== null)
  if (decided.length < MIN_BUCKET_OUTCOMES) return null
  const correct = decided.filter((r) => getOutcome(r) === 'correct').length
  return Math.round((correct / decided.length) * 100)
}

export function computeCalibration(): ConfidenceCalibration {
  const history = getHistory()
  // [PHASE-1] Records "with outcome" = records the path-based
  // replay has resolved. Legacy point-in-time records are
  // excluded — they exist in storage but their classifier was
  // broken; counting them inflates the denominator while
  // contributing nothing to the numerator (getOutcome returns
  // null on legacyOutcome). This matches PersonalPatterns.
  const withOutcome = history.filter(
    (r) => r.hitOutcome !== undefined && !r.legacyOutcome
  )

  const high = withOutcome.filter((r) => r.confidence === 'HIGH')
  const medium = withOutcome.filter((r) => r.confidence === 'MEDIUM')
  const low = withOutcome.filter((r) => r.confidence === 'LOW')

  return {
    totalRecords: history.length,
    recordsWithOutcome: withOutcome.length,
    highConfidenceAccuracy: calcAccuracy(high),
    mediumConfidenceAccuracy: calcAccuracy(medium),
    lowConfidenceAccuracy: calcAccuracy(low),
    isCalibrated: withOutcome.length >= MIN_CALIBRATED_OUTCOMES,
    lastUpdated: new Date().toISOString(),
  }
}
