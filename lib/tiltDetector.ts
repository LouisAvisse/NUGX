// lib/tiltDetector.ts — [PHASE-7] anti-tilt heuristics.
//
// "Tilt" is the single biggest cause of retail account
// blow-ups: a trader takes a loss, gets emotional, sizes up
// the next trade to "win it back", takes another loss, sizes up
// again. Three losses on tilt eats more capital than a month
// of disciplined wins. The desk pro has a senior watching them
// who'll say "step away for an hour"; the retail trader has
// nobody.
//
// This module surfaces tilt signals to the UI:
//   - Recent-streak: how many of the last 5 trades were losses?
//   - Overtrading:   how many trades in the last hour?
//   - Revenge size:  did the trader size up after a loss?
//
// Pure read over the journal + path-replay history. No mutation,
// no notification — the UI consumes the result and decides how
// loudly to present it (a discreet chip in normal cases, a
// warning banner when multiple signals fire).

import { getEntries, calculatePnL } from '@/lib/journal'
import type { JournalEntry } from '@/lib/types'

// Lookback for the "rolling" win-rate metric. 20 trades chosen
// because that's roughly a week of active gold day-trading at
// 3-5 trades/day — recent enough to reflect current edge,
// long enough to drown out single-trade variance.
const ROLLING_WINDOW = 20

// Streak thresholds. STREAK_LOSSES_WARN fires the warning chip;
// STREAK_LOSSES_BLOCK suggests the trader actively step away.
const STREAK_LOSSES_WARN = 3
const STREAK_LOSSES_BLOCK = 4

// Overtrading window — N trades opened in the last
// OVERTRADING_WINDOW_MIN minutes. Tuned for gold day-trading
// where 4 trades in an hour is plenty; more is impulsive.
const OVERTRADING_WINDOW_MIN = 60
const OVERTRADING_THRESHOLD = 5

// Revenge-sizing detection — if the user closed a losing trade
// and then opened the NEXT trade with a stop further from entry
// (i.e. a wider implied risk), that's a classic revenge pattern.
// We compare absolute |entry - stop| as a rough size proxy
// since the journal doesn't carry explicit lot sizes.
const REVENGE_SIZE_RATIO = 1.5

export type TiltSignal =
  | 'STREAK_LOSSES'
  | 'OVERTRADING'
  | 'REVENGE_SIZE'

export interface TiltState {
  hasTilt: boolean                 // any signal fired
  shouldStepAway: boolean          // STREAK_LOSSES_BLOCK or 2+ signals
  signals: TiltSignal[]            // active signals
  rollingWinRate: number | null    // 0..100 over last ROLLING_WINDOW closed
  rollingDecided: number           // count of decided trades in window
  recentLossStreak: number         // current losing streak (0 = no loss tail)
  reason: string                   // French summary for the UI
}

// Sort closed trades newest-first so the streak iteration
// reads naturally as "most recent first".
function closedNewestFirst(entries: JournalEntry[]): JournalEntry[] {
  return entries
    .filter((e) => e.exitPrice !== undefined && e.closedAt)
    .sort(
      (a, b) =>
        new Date(b.closedAt as string).getTime() -
        new Date(a.closedAt as string).getTime()
    )
}

// All open trades — used by the overtrading + revenge checks
// (they care about RECENT entries, not just closed ones).
function openedNewestFirst(entries: JournalEntry[]): JournalEntry[] {
  return entries.slice().sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

function isLoss(entry: JournalEntry): boolean {
  return calculatePnL(entry) < 0
}

// Compute the contiguous loss streak from the most recent trade
// backward. Stops at the first non-losing trade.
function computeLossStreak(closed: JournalEntry[]): number {
  let n = 0
  for (const e of closed) {
    if (isLoss(e)) n++
    else break
  }
  return n
}

// Compute rolling win-rate over up to ROLLING_WINDOW closed
// trades. Returns null when fewer than 5 decided — too noisy
// otherwise. Definition: profit > 0 = win; profit <= 0 = loss
// (breakevens count as losses to discourage marginal trades).
function computeRollingWinRate(
  closed: JournalEntry[]
): { rate: number | null; decided: number } {
  const window = closed.slice(0, ROLLING_WINDOW)
  if (window.length < 5) return { rate: null, decided: window.length }
  const wins = window.filter((e) => calculatePnL(e) > 0).length
  return { rate: Math.round((wins / window.length) * 100), decided: window.length }
}

// Was the most-recent OPEN trade sized up after a recent loss?
// Compares |entry - stop| of the newest open vs the most-recent
// closed losing trade. If the open's risk-distance is at least
// REVENGE_SIZE_RATIO times the loser's, flag revenge sizing.
function detectRevengeSize(
  opened: JournalEntry[],
  closed: JournalEntry[]
): boolean {
  const newestOpen = opened.find((e) => e.exitPrice === undefined)
  const recentLoser = closed.find((e) => isLoss(e))
  if (!newestOpen || !recentLoser) return false
  const openRisk = Math.abs(newestOpen.entry - newestOpen.stop)
  const loserRisk = Math.abs(recentLoser.entry - recentLoser.stop)
  if (loserRisk === 0) return false
  // The loser must be recent (last 4h) for this to count as a
  // reaction, not a coincidence.
  const loserAge =
    Date.now() - new Date(recentLoser.closedAt as string).getTime()
  if (loserAge > 4 * 3_600_000) return false
  return openRisk / loserRisk >= REVENGE_SIZE_RATIO
}

// How many trades has the user OPENED in the last hour?
function countRecentOpens(entries: JournalEntry[]): number {
  const cutoff = Date.now() - OVERTRADING_WINDOW_MIN * 60_000
  return entries.filter((e) => new Date(e.createdAt).getTime() >= cutoff).length
}

// ─────────────────────────────────────────────────────────────────
// Public entry — returns the tilt state for the UI to consume.
// ─────────────────────────────────────────────────────────────────
export function computeTiltState(): TiltState {
  const entries = getEntries()
  const closed = closedNewestFirst(entries)
  const opened = openedNewestFirst(entries)

  const lossStreak = computeLossStreak(closed)
  const wr = computeRollingWinRate(closed)
  const overtradeCount = countRecentOpens(entries)
  const revenge = detectRevengeSize(opened, closed)

  const signals: TiltSignal[] = []
  if (lossStreak >= STREAK_LOSSES_WARN) signals.push('STREAK_LOSSES')
  if (overtradeCount >= OVERTRADING_THRESHOLD) signals.push('OVERTRADING')
  if (revenge) signals.push('REVENGE_SIZE')

  const shouldStepAway =
    lossStreak >= STREAK_LOSSES_BLOCK || signals.length >= 2

  // Build a single French sentence summarizing the state — the
  // UI can render this verbatim. Order matters: most severe
  // signal first.
  let reason: string
  if (shouldStepAway) {
    reason =
      lossStreak >= STREAK_LOSSES_BLOCK
        ? `${lossStreak} pertes consécutives — faire une pause d'au moins une heure avant de retrader.`
        : 'Plusieurs signaux de tilt actifs — faire une pause avant la prochaine entrée.'
  } else if (signals.includes('STREAK_LOSSES')) {
    reason = `${lossStreak} pertes d'affilée — vigilance, réduire la taille jusqu'au prochain gain.`
  } else if (signals.includes('OVERTRADING')) {
    reason = `${overtradeCount} trades dans la dernière heure — risque d'overtrading.`
  } else if (signals.includes('REVENGE_SIZE')) {
    reason =
      "Position ouverte plus large qu'une perte récente — vérifier que ce n'est pas un revenge trade."
  } else {
    reason = 'Aucun signe de tilt — exécution disciplinée.'
  }

  return {
    hasTilt: signals.length > 0,
    shouldStepAway,
    signals,
    rollingWinRate: wr.rate,
    rollingDecided: wr.decided,
    recentLossStreak: lossStreak,
    reason,
  }
}
