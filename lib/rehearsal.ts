// lib/rehearsal.ts — [PHASE-6] pre-trade rehearsal stats.
//
// Before the trader fires, the copilot pulls the last N times a
// similar setup printed and shows the verdict: how many wins,
// how many losses, average path-favorable %. The point isn't to
// dictate "take this trade" — the trader still decides — but to
// give a data-driven base rate ("last 5 LONDON_CONTINUATION:
// 4 wins, 1 loss, avg favorable 78%") instead of a gut-feel
// guess.
//
// Pure read over the analysis history maintained by lib/history.
// All client-side. The Phase 1 path replay produces clean
// outcome data; without that fix this surface would inherit the
// stop-then-target false positives that polluted the legacy
// classifier.
//
// Match strategy (in order of preference):
//   1. Same detectedSetup + same recommendation direction.
//      Highest signal — implies the same playbook + same side.
//   2. Same recommendation + same session (London/NY etc).
//      Coarser; used when no setup match exists.
// Records older than 60 days are excluded — gold's regime drifts
// and very old samples carry less predictive weight.

import { getHistory } from '@/lib/history'
import type {
  AnalysisHistoryRecord,
  AnalysisResult,
  Recommendation,
  SetupName,
} from '@/lib/types'

// Minimum sample size before the rehearsal line is shown. Below
// this the number is too noisy to inform a decision; the UI
// renders an onboarding hint instead.
const MIN_SAMPLES = 3

// Lookback horizon — records older than this are excluded so
// regime drift doesn't bias the base rate.
const LOOKBACK_MS = 60 * 24 * 3600 * 1000

// What the UI receives. `accuracy` is null when the sample is
// too small (< MIN_SAMPLES decided outcomes); the UI renders a
// "not enough data" hint in that case rather than a 0% that
// would mislead the reader.
export interface RehearsalStats {
  matchKind: 'SETUP' | 'SESSION_REC' | 'NONE'
  matchLabel: string                  // human-readable match descriptor
  totalSamples: number                // matched records, decided + open
  decidedSamples: number              // HIT_TARGET + HIT_STOP only
  wins: number
  losses: number
  accuracy: number | null             // 0..100, null when decidedSamples < MIN_SAMPLES
  avgFavorablePct: number | null      // avg pathMaxFavorable as % of target distance
}

// Compute path-favorable as a percentage of the trade's
// target distance. 100% = price reached target; 50% = price
// went halfway; values can exceed 100 when overshoot, can be
// negative when adverse.
function favorablePct(r: AnalysisHistoryRecord): number | null {
  if (r.pathMaxFavorable === undefined) return null
  const entryNum = parseFloat(r.entry)
  const targetNum = parseFloat(r.target)
  if (!Number.isFinite(entryNum) || !Number.isFinite(targetNum)) return null
  const span = targetNum - entryNum
  if (span === 0) return null
  if (r.recommendation === 'LONG') {
    return ((r.pathMaxFavorable - entryNum) / span) * 100
  }
  if (r.recommendation === 'SHORT') {
    return ((entryNum - r.pathMaxFavorable) / -span) * 100
  }
  return null
}

// Filter records to those eligible for rehearsal stats.
// Excludes: legacy outcomes (stop-then-target false positives),
// records older than LOOKBACK_MS, FLAT recommendations (no
// trade was taken).
function eligibleRecords(): AnalysisHistoryRecord[] {
  const all = getHistory()
  const cutoff = Date.now() - LOOKBACK_MS
  return all.filter((r) => {
    if (r.legacyOutcome) return false
    if (r.recommendation === 'FLAT') return false
    return new Date(r.generatedAt).getTime() >= cutoff
  })
}

// Build the stats block from a list of matched records.
function summarize(
  records: AnalysisHistoryRecord[],
  matchKind: RehearsalStats['matchKind'],
  matchLabel: string
): RehearsalStats {
  const decided = records.filter(
    (r) => r.hitOutcome === 'HIT_TARGET' || r.hitOutcome === 'HIT_STOP'
  )
  const wins = decided.filter((r) => r.hitOutcome === 'HIT_TARGET').length
  const losses = decided.filter((r) => r.hitOutcome === 'HIT_STOP').length
  const accuracy =
    decided.length >= MIN_SAMPLES
      ? Math.round((wins / decided.length) * 100)
      : null

  // Average favorable% over all matched records (decided + open)
  // since pathMaxFavorable is recorded for every replay-resolved
  // record, not just the terminal ones.
  const favs: number[] = []
  for (const r of records) {
    const f = favorablePct(r)
    if (f !== null && Number.isFinite(f)) favs.push(f)
  }
  const avgFavorablePct =
    favs.length >= MIN_SAMPLES
      ? Math.round(favs.reduce((a, b) => a + b, 0) / favs.length)
      : null

  return {
    matchKind,
    matchLabel,
    totalSamples: records.length,
    decidedSamples: decided.length,
    wins,
    losses,
    accuracy,
    avgFavorablePct,
  }
}

// Public entry — returns stats matching the current analysis or
// a NONE-tagged empty block when there's no history yet. Pass
// the active session string (caller has it from getCurrentSession)
// so the Tier-2 fallback can match on it.
export function computeRehearsal(
  current: AnalysisResult,
  session: string
): RehearsalStats {
  // Skip work for FLAT — there's no trade to rehearse.
  if (current.recommendation === 'FLAT') {
    return {
      matchKind: 'NONE',
      matchLabel: '——',
      totalSamples: 0,
      decidedSamples: 0,
      wins: 0,
      losses: 0,
      accuracy: null,
      avgFavorablePct: null,
    }
  }

  const records = eligibleRecords()
  const direction: Recommendation = current.recommendation

  // Tier 1 — match by detectedSetup + direction. Most specific.
  if (current.detectedSetup) {
    const setup: SetupName = current.detectedSetup
    const matches = records.filter(
      (r) => r.detectedSetup === setup && r.recommendation === direction
    )
    if (matches.length > 0) {
      return summarize(matches, 'SETUP', setupShortLabel(setup, direction))
    }
  }

  // Tier 2 — match by recommendation + session. Coarser fallback.
  // session strings share the same form (London / Tokyo /
  // NY/London Overlap / New York / Off-hours) on history records
  // and on the live snapshot — both come from getCurrentSession.
  const sessionMatches = records.filter(
    (r) => r.recommendation === direction && r.session === session
  )
  if (sessionMatches.length > 0) {
    return summarize(
      sessionMatches,
      'SESSION_REC',
      `${direction} ${session.toUpperCase()}`
    )
  }

  return {
    matchKind: 'NONE',
    matchLabel: '——',
    totalSamples: 0,
    decidedSamples: 0,
    wins: 0,
    losses: 0,
    accuracy: null,
    avgFavorablePct: null,
  }
}

// Short French label for the matched setup + direction, used in
// the rehearsal line ("Derniers FAUX-BREAK LONDRES LONG : ..."
// would be too long; we render "FAUX-BREAK LONDRES LONG" in
// the chip-style label only).
function setupShortLabel(setup: SetupName, dir: Recommendation): string {
  const setupShort: Record<SetupName, string> = {
    LONDON_FALSE_BREAK: 'FX-BRK LDN',
    LONDON_CONTINUATION: 'CONT. LDN',
    NY_OVERLAP_TREND: 'TREND NY/LDN',
    FOMC_FADE: 'FADE FOMC',
    ASIAN_RANGE_BREAKOUT: 'BRK ASIE',
    EMA20_PULLBACK: 'PULLBACK EMA20',
  }
  return `${setupShort[setup]} ${dir}`
}
