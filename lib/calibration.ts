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

// Map a record's outcome to a tri-state correct/incorrect/null.
// Prefer 4H over 2H for the verdict; OPEN + INCONCLUSIVE return
// null and are excluded from accuracy math.
function getOutcome(r: AnalysisHistoryRecord): 'correct' | 'incorrect' | null {
  const outcome: TradeOutcome | undefined = r.outcome4H ?? r.outcome2H
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
  // Records "with outcome" = records the checker has touched at
  // least once (even if the verdict is OPEN/INCONCLUSIVE). This
  // matches PersonalPatterns.totalWithOutcome semantics so the
  // two surfaces use the same denominator.
  const withOutcome = history.filter(
    (r) => r.outcome4H !== undefined || r.outcome2H !== undefined
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
