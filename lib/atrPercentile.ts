// lib/atrPercentile.ts — [PHASE-12.3] ATR volatility regime.
//
// The 14-period ATR already lives in TechnicalIndicators (1H), but
// the absolute number is hard to read without context — is $18 of
// 1H ATR high, normal, or low for gold? The answer changes month
// to month.
//
// This module computes the percentile rank of the latest ATR(14)
// against the prior 90 days of 1H ATR observations. The output is
// a 0..100 percentile + a coarse regime label:
//
//   LOW    — current ATR sits in the bottom 25% of the 90d window
//   NORMAL — middle 50%
//   HIGH   — top 25%
//   EXTREME — top 5% (Fed surprise / war headline / FOMC blowout)
//
// Pros use this to size positions — half-size during EXTREME
// regimes, full size during NORMAL, fade entries during LOW.
//
// SERVER-SIDE ONLY — imported by /api/technicals/route.ts.

import { ATR } from 'technicalindicators'
import type { ChartCandle } from '@/lib/types'

// Coarse buckets surfaced as a chip in the SignalsPanel. The 25/75/95
// thresholds are documented above.
export type AtrRegime = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME'

export interface AtrSummary {
  current: number       // latest ATR(14) value, USD
  percentile: number    // 0..100 — rank within the 90d window
  regime: AtrRegime
  windowDays: number    // how many days of history backed the rank
}

// 90 calendar days ≈ 90 × 24 = 2160 1H candles. The route fetches
// up to 60 days of 1H by default; we use whatever we get, which
// gives ~1440 ATR observations on a full payload — plenty for a
// stable percentile estimate.
const TARGET_DAYS = 90
const MIN_OBSERVATIONS = 50  // fewer than this → no regime call

function classifyRegime(percentile: number): AtrRegime {
  if (percentile >= 95) return 'EXTREME'
  if (percentile >= 75) return 'HIGH'
  if (percentile <= 25) return 'LOW'
  return 'NORMAL'
}

// Rank `value` against `series` — returns 0..100. Series doesn't
// need to be sorted; we count how many entries fall below value.
function rankOf(value: number, series: number[]): number {
  if (series.length === 0) return 0
  let below = 0
  for (const s of series) if (s < value) below++
  return Math.round((below / series.length) * 100)
}

// Compute ATR(14) percentile + regime from a 1H candle history.
// Returns null when the history is too short for a reliable rank
// (consumer can hide the chip in that case).
export function computeAtrSummary(candles: ChartCandle[]): AtrSummary | null {
  if (candles.length < MIN_OBSERVATIONS + 14) return null

  const highs = candles.map((c) => c.high)
  const lows = candles.map((c) => c.low)
  const closes = candles.map((c) => c.close)

  const atrSeries = ATR.calculate({
    period: 14,
    high: highs,
    low: lows,
    close: closes,
  })
  if (atrSeries.length < MIN_OBSERVATIONS) return null

  const current = atrSeries[atrSeries.length - 1]
  if (!Number.isFinite(current)) return null

  const percentile = rankOf(current, atrSeries)
  // Days in the rank window — `closes.length` 1H candles ≈ N/24 days.
  const windowDays = Math.min(TARGET_DAYS, Math.floor(closes.length / 24))

  return {
    current,
    percentile,
    regime: classifyRegime(percentile),
    windowDays,
  }
}
