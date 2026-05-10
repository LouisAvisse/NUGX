// lib/positionSizing.ts — [PHASE-12.4] position-sizing calculator.
//
// The single most-frequent retail blow-up vector is over-sizing.
// A trader picks an entry / stop / target from the AI panel and
// then guesses the lot size — usually too high, usually right
// before a stop-out.
//
// This module computes the correct size from three inputs:
//
//   accountSize  — USD balance
//   riskPct      — % of account willing to lose on this trade
//                  (e.g. 0.5 = half a percent — pro standard)
//   stopDistance — abs(entry − stop) in USD per ounce
//
//   maxLossUsd  = accountSize × riskPct/100
//   ouncesIdeal = maxLossUsd / stopDistance
//
//                              (1 standard XAU/USD lot = 100 oz)
//                              (1 mini lot              =  10 oz)
//                              (1 micro lot             =   1 oz)
//
// Pure math, no I/O. Tunables (accountSize, riskPct) come from
// useTraderProfile (localStorage) so the calculator is sticky
// across sessions.

import type { TradeDirection } from '@/lib/types'

// Tunables persisted in localStorage. Defaults are sensible
// out-of-the-box (10k account, 0.5% per trade).
export interface TraderProfile {
  accountSize: number      // USD
  riskPct: number          // 0..100, typically 0.25..2
}

export const DEFAULT_TRADER_PROFILE: TraderProfile = {
  accountSize: 10_000,
  riskPct: 0.5,
}

// Result of a single position-size computation. Multiple lot
// granularities are returned so the trader can pick the broker's
// supported size without re-doing the math.
export interface PositionSizing {
  // Inputs replayed back so the consumer can verify what produced
  // the numbers (especially useful in the journal).
  accountSize: number
  riskPct: number
  entry: number
  stop: number
  direction: TradeDirection

  // Distance from entry to stop in USD per ounce — the per-ounce
  // risk cost. Always positive.
  stopDistance: number

  // The dollar amount you're willing to lose on this trade.
  maxLossUsd: number

  // Implied position size in ounces (continuous). Round down to
  // your broker's smallest lot size.
  ouncesIdeal: number

  // Rounded sizes at the three common lot granularities. Each is
  // floor()'ed so you don't accidentally over-size.
  standardLots: number     // 100 oz units
  miniLots: number         // 10 oz units
  microLots: number        // 1 oz units (some brokers offer 0.1, ignored)

  // The ACTUAL loss you'd take if the stop hit, given the rounded
  // lot you chose. Always ≤ maxLossUsd. Surfaces "your real risk
  // is $42.50 even though you set 0.5% = $50".
  actualRiskAtMicro: number   // microLots × stopDistance
  actualRiskAtMini: number    // miniLots × 10 × stopDistance
  actualRiskAtStandard: number // standardLots × 100 × stopDistance
}

// Parse a level string from AnalysisResult into a number. The
// model emits ranges like "3281-3284"; we take the midpoint of
// the first two numbers, or the first number if only one is
// present. Returns null when the string is "——" or unparseable
// so consumers can hide the calculator entry until the analysis
// has produced real prices.
export function parseLevelString(s: string | undefined | null): number | null {
  if (!s || typeof s !== 'string') return null
  // Capture the first 1-2 floats in the string.
  const matches = s.match(/-?\d+(?:\.\d+)?/g)
  if (!matches || matches.length === 0) return null
  const a = Number(matches[0])
  if (!Number.isFinite(a)) return null
  if (matches.length < 2) return a
  const b = Number(matches[1])
  if (!Number.isFinite(b)) return a
  return (a + b) / 2
}

// Compute position sizing from the inputs. Returns null when the
// inputs are degenerate (zero stop distance, non-positive
// account, etc.) — consumers should display a "set up your
// profile" placeholder in that case.
export function computePositionSizing(args: {
  profile: TraderProfile
  entry: number
  stop: number
  direction: TradeDirection
}): PositionSizing | null {
  const { profile, entry, stop, direction } = args

  if (!Number.isFinite(profile.accountSize) || profile.accountSize <= 0) return null
  if (!Number.isFinite(profile.riskPct) || profile.riskPct <= 0) return null
  if (!Number.isFinite(entry) || entry <= 0) return null
  if (!Number.isFinite(stop) || stop <= 0) return null

  const stopDistance = Math.abs(entry - stop)
  if (stopDistance <= 0) return null

  // [SAFETY] Direction-stop sanity. If the user passes a LONG
  // with stop > entry (or SHORT with stop < entry), the math
  // still produces a number but it's nonsensical. Return null so
  // the panel surfaces a "stop on wrong side of entry" warning
  // rather than a confidently-wrong lot size.
  if (direction === 'LONG' && stop >= entry) return null
  if (direction === 'SHORT' && stop <= entry) return null

  const maxLossUsd = (profile.accountSize * profile.riskPct) / 100
  const ouncesIdeal = maxLossUsd / stopDistance

  const standardLots = Math.floor(ouncesIdeal / 100)
  const miniLots = Math.floor(ouncesIdeal / 10)
  const microLots = Math.floor(ouncesIdeal)

  return {
    accountSize: profile.accountSize,
    riskPct: profile.riskPct,
    entry,
    stop,
    direction,
    stopDistance,
    maxLossUsd,
    ouncesIdeal,
    standardLots,
    miniLots,
    microLots,
    actualRiskAtMicro: microLots * stopDistance,
    actualRiskAtMini: miniLots * 10 * stopDistance,
    actualRiskAtStandard: standardLots * 100 * stopDistance,
  }
}
