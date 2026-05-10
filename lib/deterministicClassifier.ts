// lib/deterministicClassifier.ts — [PHASE-12.8] pure-TS signal classifier.
//
// Today the LLM is asked to do arithmetic — score 8 signals as
// BULLISH/BEARISH/NEUTRAL from a snapshot of numbers Claude can
// see explicitly in the user message. That's wasted tokens: the
// classification is deterministic; we can do it server-side and
// hand the result to Claude as a starting suggestion.
//
// This module produces a complete SignalBreakdown from an
// AnalysisRequest using transparent rules:
//
//   trend     — based on `trend` field + EMA20/50 alignment
//   momentum  — based on rsi + rsiZone (45/55 band logic)
//   macd      — based on macdHistogram sign + macdCross
//   dxy       — based on dxyChangePct sign (inverse correlation)
//   us10y     — based on us10yChangePct sign (inverse correlation)
//   session   — based on sessionIsHighVolatility flag
//   news      — based on newsBullishCount vs newsBearishCount
//   calendar  — based on clearToTrade flag
//
// The route can either:
//
//   (a) Send this breakdown to Claude as a "deterministic
//       suggestion" so the model only has to adjudicate edge
//       cases instead of re-computing arithmetic — cuts output
//       tokens because the schema's signals[] block can shorten.
//   (b) Skip the LLM entirely on cold-cache / outage and serve
//       this breakdown directly through the mock builder — same
//       result quality as before, $0 cost.
//
// Pure function. No I/O.

import type {
  AnalysisRequest,
  Bias,
  SignalBreakdown,
} from '@/lib/types'

// Trend classification mirrors lib/technicals.classifyTrend but
// reads the already-classified `trend` field on the request.
// Fallback to EMA-alignment heuristic if `trend` is empty.
function trendBias(req: AnalysisRequest): Bias {
  if (req.trend === 'UPTREND') return 'BULLISH'
  if (req.trend === 'DOWNTREND') return 'BEARISH'
  // RANGING / unknown — fall back to price-vs-EMA20.
  if (req.priceVsEma20 === 'ABOVE' && req.priceVsEma50 === 'ABOVE')
    return 'BULLISH'
  if (req.priceVsEma20 === 'BELOW' && req.priceVsEma50 === 'BELOW')
    return 'BEARISH'
  return 'NEUTRAL'
}

// RSI > 55 with bullish trend, or fresh recovery from oversold,
// reads BULLISH. Mirror for BEARISH. 45..55 is the indecision
// band — explicitly NEUTRAL.
function momentumBias(req: AnalysisRequest): Bias {
  const rsi = req.rsi
  if (rsi >= 55 && req.trend === 'UPTREND') return 'BULLISH'
  if (rsi <= 45 && req.trend === 'DOWNTREND') return 'BEARISH'
  if (rsi <= 30) return 'BULLISH'    // oversold reversion candidate
  if (rsi >= 70) return 'BEARISH'    // overbought reversion
  return 'NEUTRAL'
}

// MACD direction + recent cross. A fresh cross dominates the
// histogram sign; absent a cross, histogram > 0 → bullish.
function macdBias(req: AnalysisRequest): Bias {
  if (req.macdCross === 'BULLISH_CROSS') return 'BULLISH'
  if (req.macdCross === 'BEARISH_CROSS') return 'BEARISH'
  if (req.macdHistogram > 0.05) return 'BULLISH'
  if (req.macdHistogram < -0.05) return 'BEARISH'
  return 'NEUTRAL'
}

// DXY inverse correlation: rising dollar = bearish gold.
function dxyBias(req: AnalysisRequest): Bias {
  if (req.dxyChangePct < -0.05) return 'BULLISH'  // dollar weakening
  if (req.dxyChangePct > 0.05) return 'BEARISH'   // dollar strengthening
  return 'NEUTRAL'
}

// US10Y inverse correlation: rising yields = bearish gold.
function us10yBias(req: AnalysisRequest): Bias {
  if (req.us10yChangePct < -0.5) return 'BULLISH'  // yields falling
  if (req.us10yChangePct > 0.5) return 'BEARISH'   // yields rising
  return 'NEUTRAL'
}

// Session bias = whether the current session is a high-conviction
// trading window. NY/London Overlap = strongest; off-hours =
// explicitly NEUTRAL (risk-on without volume).
function sessionBias(req: AnalysisRequest): Bias {
  if (!req.sessionIsHighVolatility) return 'NEUTRAL'
  // High-vol session aligned with the trend = same direction.
  if (req.trend === 'UPTREND') return 'BULLISH'
  if (req.trend === 'DOWNTREND') return 'BEARISH'
  return 'NEUTRAL'
}

// News sentiment from the bullish/bearish headline counts. Tie
// or single-headline-difference reads NEUTRAL — we want a clear
// majority before voting.
function newsBias(req: AnalysisRequest): Bias {
  const bull = req.newsBullishCount ?? 0
  const bear = req.newsBearishCount ?? 0
  const lead = Math.abs(bull - bear)
  if (lead < 2) return 'NEUTRAL'
  return bull > bear ? 'BULLISH' : 'BEARISH'
}

// Calendar gate: closed → NEUTRAL (downstream rules force FLAT
// independently). Open → align with trend.
function calendarBias(req: AnalysisRequest): Bias {
  if (!req.clearToTrade) return 'NEUTRAL'
  if (req.trend === 'UPTREND') return 'BULLISH'
  if (req.trend === 'DOWNTREND') return 'BEARISH'
  return 'NEUTRAL'
}

// Compose: AnalysisRequest → SignalBreakdown. One call, one
// breakdown. The route can use it as input to scoring.computeWeightedConfluence
// without going through the LLM.
export function classifySignals(req: AnalysisRequest): SignalBreakdown {
  return {
    trend: trendBias(req),
    momentum: momentumBias(req),
    macd: macdBias(req),
    dxy: dxyBias(req),
    us10y: us10yBias(req),
    session: sessionBias(req),
    news: newsBias(req),
    calendar: calendarBias(req),
  }
}
