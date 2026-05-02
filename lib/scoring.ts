// lib/scoring.ts — [PHASE-2] weighted confluence scoring.
//
// The legacy confluenceScore is a count-based 0-8 integer: each
// of the 8 signals (trend, momentum, MACD, DXY, US10Y, session,
// news, calendar) contributes equally. Two structural problems:
//
//   1. Correlation blindness. trend + momentum + MACD all fire
//      together when price is moving — that's one phenomenon
//      counted three times. Real independent dimensions are
//      closer to 4 (tape, macro, structure, context).
//   2. Equal weighting. The 4H trend should dominate everything
//      in gold day trading, but it currently shares a unit with
//      the news-sentiment count.
//
// This module computes a weighted score 0-10 from the same
// SignalBreakdown the legacy 0-8 reads. Output is purely
// additive: server-side we keep populating confluenceScore for
// backward compatibility with stored history records, and we
// add a parallel weightedConfluence for the UI.
//
// Default weights are derived from gold-trading literature, not
// from the user's personal data — Phase 10 (calibration loop)
// replaces these with empirical weights once enough clean
// outcomes accumulate. Until then, defaults are a sensible
// prior.
//
// Weights total to ~10 so the resulting score reads naturally
// as "X.X out of 10" in the UI.

import type { Bias, SignalBreakdown } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────
// Weights — total = 10 by construction.
//
// Tape (3): trend + momentum + MACD collapse to ~one independent
// "tape is moving" signal in correlated markets, so they share
// a 3-point bucket weighted internally. trend dominates because
// the higher-timeframe direction is the highest-leverage filter
// for gold day trading.
//
// Macro (3): DXY and US10Y are heavily correlated (both proxies
// for "real yields"). Together they get 3 points; individually
// each gets 1.5 so a single-direction macro print contributes
// half-weight.
//
// Structure (1.5): news sentiment carries some signal but is
// fragile (priced in fast, reverses on rumor). Half-weight.
//
// Context (2.5): session + calendar gate when trading is
// productive. Calendar is a hard gate (handled separately by
// the FLAT-on-blocked rule); the 1.0 weight here lets clearToTrade
// = true contribute to confluence rather than just preventing
// loss. Session weight 1.5 favors high-volume sessions
// (London / NY/London overlap) which deliver the bulk of gold's
// daily range.
// ─────────────────────────────────────────────────────────────────
export interface Weights {
  trend: number
  momentum: number
  macd: number
  dxy: number
  us10y: number
  session: number
  news: number
  calendar: number
}

export const DEFAULT_WEIGHTS: Weights = {
  trend: 1.5,
  momentum: 0.75,
  macd: 0.75,
  dxy: 1.5,
  us10y: 1.5,
  session: 1.5,
  news: 1.5,
  calendar: 1.0,
}

// Total of all default weights — used as the denominator so the
// score reads as a 0-10 max. Computed once at module load.
export const WEIGHTS_TOTAL = Object.values(DEFAULT_WEIGHTS).reduce(
  (a, b) => a + b,
  0
)

// Output of the scoring engine. `score` and `max` are floats
// rounded to one decimal so the UI renders "7.4 / 10" cleanly.
// `dominant` is the direction that won the weighted vote — the
// recommendation system uses it as a sanity check against
// Claude's own output.
export interface WeightedConfluence {
  score: number                    // 0..max — the dominant side's weighted total
  max: number                      // sum of all weights, currently 10.0
  dominant: Bias                   // BULLISH | BEARISH | NEUTRAL
  bullishWeight: number            // raw bullish total (pre-dominance)
  bearishWeight: number            // raw bearish total
}

// ─────────────────────────────────────────────────────────────────
// Compute the weighted score from a SignalBreakdown.
//
// Each signal contributes its full weight to BULLISH or BEARISH
// based on its direction; NEUTRAL contributes nothing. The
// dominant side wins; the score is that side's total. Ties
// resolve to NEUTRAL (the recommendation defaults to FLAT in
// this case and the catalyst should explain why).
// ─────────────────────────────────────────────────────────────────
export function computeWeightedConfluence(
  signals: SignalBreakdown,
  weights: Weights = DEFAULT_WEIGHTS
): WeightedConfluence {
  let bullish = 0
  let bearish = 0
  for (const key of Object.keys(weights) as (keyof Weights)[]) {
    const direction = signals[key]
    const w = weights[key]
    if (direction === 'BULLISH') bullish += w
    else if (direction === 'BEARISH') bearish += w
  }

  // Round both to one decimal so display + math agree.
  const round1 = (n: number) => Math.round(n * 10) / 10
  const bullishR = round1(bullish)
  const bearishR = round1(bearish)
  const max = round1(WEIGHTS_TOTAL)

  let dominant: Bias = 'NEUTRAL'
  let score = 0
  if (bullishR > bearishR) {
    dominant = 'BULLISH'
    score = bullishR
  } else if (bearishR > bullishR) {
    dominant = 'BEARISH'
    score = bearishR
  } else {
    dominant = 'NEUTRAL'
    // For a tie the score reads as the tied total — the UI then
    // pairs it with the NEUTRAL palette so it's clear neither
    // side is winning.
    score = bullishR
  }

  return {
    score,
    max,
    dominant,
    bullishWeight: bullishR,
    bearishWeight: bearishR,
  }
}
