// lib/pivots.ts — [PHASE-12.3] daily pivot computation.
//
// Two formulas, both pure functions of the prior day's OHLC:
//
//   Classical pivots (the universal floor-trader pivot):
//     P  = (H + L + C) / 3
//     R1 = 2P − L          S1 = 2P − H
//     R2 = P + (H − L)     S2 = P − (H − L)
//     R3 = H + 2(P − L)    S3 = L − 2(H − P)
//
//   Camarilla pivots (intraday mean-reversion levels):
//     R4 = C + (H−L) × 1.1/2     S4 = C − (H−L) × 1.1/2
//     R3 = C + (H−L) × 1.1/4     S3 = C − (H−L) × 1.1/4
//     R2 = C + (H−L) × 1.1/6     S2 = C − (H−L) × 1.1/6
//     R1 = C + (H−L) × 1.1/12    S1 = C − (H−L) × 1.1/12
//
// "Prior day" is computed in UTC — the day-boundary reset matches
// what most institutional desks use (rather than the trader's
// local timezone, which would flip the level set mid-session for
// some users).
//
// SERVER-SIDE ONLY — imported by /api/technicals/route.ts.

import type { ChartCandle } from '@/lib/types'

// One full set of classical floor-trader pivots.
// Pivot is the central reference; R1/S1 are the standard intraday
// targets, R2/S2 are extended targets, R3/S3 are extreme.
export interface ClassicalPivots {
  pivot: number
  r1: number
  r2: number
  r3: number
  s1: number
  s2: number
  s3: number
}

// One full set of Camarilla pivots. Every level is symmetrical
// about the prior close; R3/S3 are the highest-probability mean-
// reversion zones (the level pros watch first).
export interface CamarillaPivots {
  r1: number
  r2: number
  r3: number
  r4: number
  s1: number
  s2: number
  s3: number
  s4: number
}

// Bundled output — the prior session OHLC plus both pivot sets.
// The prior-day OHLC is included for transparency so the UI can
// label the pivots ("based on yesterday's H $X / L $Y / C $Z").
export interface DailyPivots {
  priorHigh: number
  priorLow: number
  priorClose: number
  classical: ClassicalPivots
  camarilla: CamarillaPivots
}

// Compute pivots from prior-day H/L/C. Pure math, no I/O.
export function computePivots(
  high: number,
  low: number,
  close: number
): DailyPivots {
  const range = high - low
  const pivot = (high + low + close) / 3

  const classical: ClassicalPivots = {
    pivot,
    r1: 2 * pivot - low,
    s1: 2 * pivot - high,
    r2: pivot + range,
    s2: pivot - range,
    r3: high + 2 * (pivot - low),
    s3: low - 2 * (high - pivot),
  }

  const factor = range * 1.1
  const camarilla: CamarillaPivots = {
    r1: close + factor / 12,
    r2: close + factor / 6,
    r3: close + factor / 4,
    r4: close + factor / 2,
    s1: close - factor / 12,
    s2: close - factor / 6,
    s3: close - factor / 4,
    s4: close - factor / 2,
  }

  return {
    priorHigh: high,
    priorLow: low,
    priorClose: close,
    classical,
    camarilla,
  }
}

// Derive the prior session's OHLC from a 1H candle history.
// "Prior session" = the 24-hour UTC window ending at the most
// recent UTC midnight that has fully completed.
//
// Returns null when the history doesn't span the prior UTC day —
// in that case the route ships pivots:null and the UI hides the
// pivot lines.
export function priorSessionOhlcUtc(
  candles: ChartCandle[]
): { high: number; low: number; close: number } | null {
  if (candles.length === 0) return null

  // Most-recent fully-elapsed UTC day boundary.
  const now = new Date()
  const todayMidnightSec =
    Math.floor(now.getTime() / 1000) -
    (now.getUTCHours() * 3600 +
      now.getUTCMinutes() * 60 +
      now.getUTCSeconds())
  const yesterdayStartSec = todayMidnightSec - 24 * 3600

  // Filter candles into the prior UTC day window.
  const priorDay = candles.filter(
    (c) => c.time >= yesterdayStartSec && c.time < todayMidnightSec
  )
  if (priorDay.length === 0) return null

  let high = -Infinity
  let low = Infinity
  for (const c of priorDay) {
    if (c.high > high) high = c.high
    if (c.low < low) low = c.low
  }
  // Close = the latest candle in the prior-day window.
  const last = priorDay[priorDay.length - 1]
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null
  return { high, low, close: last.close }
}

// Composer: hourly history → DailyPivots | null. Single entry point
// for the route; encapsulates the prior-day window logic so the
// route doesn't have to know about UTC math.
export function computeDailyPivots(candles: ChartCandle[]): DailyPivots | null {
  const ohlc = priorSessionOhlcUtc(candles)
  if (!ohlc) return null
  return computePivots(ohlc.high, ohlc.low, ohlc.close)
}
