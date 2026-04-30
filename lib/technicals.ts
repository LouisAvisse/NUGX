// lib/technicals.ts — server-side indicator computation.
//
// Pure function: takes a candle history (close/high/low arrays in
// chronological order, oldest first) and the current spot price,
// and returns the full TechnicalIndicators payload from
// lib/types.ts. Uses the `technicalindicators` npm package
// installed in [#25] for EMA / RSI / MACD / ATR / Bollinger
// bands; everything else (trend classification, RSI zone, swing
// high/low, day-range %, MACD cross detection, EMA-vs-price
// flags) is derived inline.
//
// SERVER-SIDE ONLY. Imported by /api/technicals/route.ts. Never
// import in a client component — the technicalindicators package
// is heavy and pulls in dependencies that don't belong in the
// browser bundle.

import {
  EMA,
  RSI,
  MACD,
  ATR,
  BollingerBands,
} from 'technicalindicators'
import type {
  TechnicalIndicators,
  MacdCross,
  Trend,
  RsiZone,
  PriceVsEma,
} from '@/lib/types'

// Last value of an array, or `fallback` when empty. Each
// technicalindicators method returns an array (one value per
// candle that had enough history); we only care about the most
// recent reading.
function last<T>(arr: T[], fallback: T): T {
  return arr.length > 0 ? arr[arr.length - 1] : fallback
}

// EMA20/50 + price → trend. UPTREND: EMA20 above EMA50 AND price
// above EMA20 (full bullish stack). DOWNTREND: mirror. Anything
// else is RANGING.
function classifyTrend(price: number, ema20: number, ema50: number): Trend {
  if (ema20 > ema50 && price > ema20) return 'UPTREND'
  if (ema20 < ema50 && price < ema20) return 'DOWNTREND'
  return 'RANGING'
}

function classifyRsiZone(rsi: number): RsiZone {
  if (rsi >= 70) return 'OVERBOUGHT'
  if (rsi <= 30) return 'OVERSOLD'
  return 'NEUTRAL'
}

function priceVs(price: number, ema: number): PriceVsEma {
  return price >= ema ? 'ABOVE' : 'BELOW'
}

// MACD cross detection — looks at the last two MACD readings.
// A bullish cross is when the MACD line was below signal on the
// previous candle and is above signal on the current candle.
// Bearish cross is the mirror. Otherwise NONE.
function detectMacdCross(
  macdSeries: { MACD?: number; signal?: number }[]
): MacdCross {
  if (macdSeries.length < 2) return 'NONE'
  const prev = macdSeries[macdSeries.length - 2]
  const curr = macdSeries[macdSeries.length - 1]
  const prevMacd = prev.MACD
  const prevSig = prev.signal
  const currMacd = curr.MACD
  const currSig = curr.signal
  if (
    prevMacd === undefined ||
    prevSig === undefined ||
    currMacd === undefined ||
    currSig === undefined
  ) {
    return 'NONE'
  }
  if (prevMacd <= prevSig && currMacd > currSig) return 'BULLISH_CROSS'
  if (prevMacd >= prevSig && currMacd < currSig) return 'BEARISH_CROSS'
  return 'NONE'
}

// Where current price sits in today's high-low range, 0..100.
// Returns 50 (mid) if the range is degenerate (high == low).
function dayRangePosition(price: number, dayHigh: number, dayLow: number): number {
  const range = dayHigh - dayLow
  if (!Number.isFinite(range) || range <= 0) return 50
  const pct = ((price - dayLow) / range) * 100
  return Math.max(0, Math.min(100, pct))
}

// Number of recent candles used for swing high / swing low.
// 20 hours of 1H data ≈ one trading day, matches the spec.
const SWING_LOOKBACK = 20

interface ComputeArgs {
  closes: number[]   // close prices, oldest first
  highs: number[]    // candle highs, same length as closes
  lows: number[]     // candle lows,  same length as closes
  price: number      // current spot (may be more recent than the last close)
  dayHigh: number    // session high so far (from /api/price)
  dayLow: number     // session low  so far (from /api/price)
}

// Main entry. Returns a complete TechnicalIndicators object even
// when the input is too short for EMA200 — the affected fields
// fall back to 0 / NEUTRAL and the consumer (Claude or the panel)
// treats those as "unknown".
export function computeIndicators(args: ComputeArgs): TechnicalIndicators {
  const { closes, highs, lows, price, dayHigh, dayLow } = args

  const ema20 = last(EMA.calculate({ period: 20, values: closes }), 0)
  const ema50 = last(EMA.calculate({ period: 50, values: closes }), 0)
  const ema200 = last(EMA.calculate({ period: 200, values: closes }), 0)

  const rsi = last(RSI.calculate({ period: 14, values: closes }), 50)

  // MACD with the standard 12/26/9 settings. The library expects
  // SimpleMAOscillator + SimpleMASignal flags; we want the EMA-
  // smoothed variant (the textbook MACD), so both are false.
  const macdSeries = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  })
  const macdLatest = macdSeries[macdSeries.length - 1] ?? {
    MACD: 0,
    signal: 0,
    histogram: 0,
  }

  const atr = last(
    ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }),
    0
  )

  const bbSeries = BollingerBands.calculate({
    period: 20,
    values: closes,
    stdDev: 2,
  })
  const bbLatest = bbSeries[bbSeries.length - 1] ?? {
    upper: 0,
    lower: 0,
    middle: 0,
    pb: 0,
  }

  // Swing high / low — last 20 candles. Fall back to dayHigh/dayLow
  // if the history is shorter than the lookback window.
  const swingSlice = Math.min(SWING_LOOKBACK, closes.length)
  const swingHigh =
    swingSlice > 0 ? Math.max(...highs.slice(-swingSlice)) : dayHigh
  const swingLow =
    swingSlice > 0 ? Math.min(...lows.slice(-swingSlice)) : dayLow

  return {
    ema20,
    ema50,
    ema200,

    rsi,
    rsiZone: classifyRsiZone(rsi),

    macd: macdLatest.MACD ?? 0,
    macdSignal: macdLatest.signal ?? 0,
    macdHistogram: macdLatest.histogram ?? 0,
    macdCross: detectMacdCross(macdSeries),

    atr,
    bbUpper: bbLatest.upper,
    bbLower: bbLatest.lower,

    swingHigh,
    swingLow,

    trend: classifyTrend(price, ema20, ema50),
    dayRangePct: dayRangePosition(price, dayHigh, dayLow),
    priceVsEma20: priceVs(price, ema20),
    priceVsEma50: priceVs(price, ema50),
    priceVsEma200: priceVs(price, ema200),
  }
}
