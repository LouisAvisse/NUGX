// GET /api/technicals — multi-timeframe XAU/USD technical
// indicators + chart series + detected patterns.
//
// [SPRINT-2] expansion. The route now fetches three timeframes
// in parallel and runs pattern detection on each:
//
//   15M (5 days, 15m interval) — entry timing precision
//   1H  (60 days, 1h interval) — trade direction + setup,
//                                drives the canonical
//                                TechnicalIndicators snapshot
//   4H  (90 days, 1h aggregated 4× → 4h) — broad trend filter
//
// Yahoo's chart endpoint exposes 15m and 1h intervals natively
// but NOT 4h, so we fetch 1h history at the 4H lookback and
// bucket it into 4-hour candles server-side. This keeps the
// data source consistent (GC=F COMEX gold futures) across all
// three views.
//
// Each timeframe's fetch is wrapped in its own try/catch — one
// failed timeframe leaves the others usable. Pattern detection
// runs over the latest candles per TF and is deduplicated so the
// chart isn't cluttered with the same signal three times.
//
// SERVER-SIDE ONLY (yahoo-finance2 + technicalindicators).
// Cached 60s server-side via Next.js route revalidation so rapid
// client refreshes don't hammer Yahoo.
//
// Failure handling: any unrecoverable error returns FALLBACK with
// HTTP 200 so the client never crashes. Per-timeframe failures
// degrade gracefully to empty TimeframeCandles bundles.

import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
import { EMA, RSI, MACD } from 'technicalindicators'
import { computeIndicators } from '@/lib/technicals'
import { detectPatterns, dedupePatterns } from '@/lib/patterns'
import type {
  ChartCandle,
  ChartLinePoint,
  ChartSeries,
  ChartSeriesPoint,
  DetectedPattern,
  MacdCross,
  RsiZone,
  TechnicalIndicators,
  TechnicalsResponse,
  Timeframe,
  TimeframeCandles,
  Trend,
} from '@/lib/types'

// Cache the route response for 60 seconds. Lightweight Charts
// data shifts slowly (1H candle close updates once an hour) so
// rapid client polls during a session re-hit the cache instead
// of round-tripping to Yahoo.
export const revalidate = 60

const yahooFinance = new YahooFinance()

// ─── Fallbacks ──────────────────────────────────────────────────

const FALLBACK_INDICATORS: TechnicalIndicators = {
  ema20: 0,
  ema50: 0,
  ema200: 0,
  rsi: 50,
  rsiZone: 'NEUTRAL',
  macd: 0,
  macdSignal: 0,
  macdHistogram: 0,
  macdCross: 'NONE',
  atr: 0,
  bbUpper: 0,
  bbLower: 0,
  swingHigh: 0,
  swingLow: 0,
  trend: 'RANGING',
  dayRangePct: 50,
  priceVsEma20: 'ABOVE',
  priceVsEma50: 'ABOVE',
  priceVsEma200: 'ABOVE',
}

const FALLBACK_CHART: ChartSeries = {
  candles: [],
  ema20: [],
  ema50: [],
  ema200: [],
}

// Empty TimeframeCandles bundle — used when an individual TF
// fetch fails. Indicators all read as "no signal" so consumers
// can detect and skip the section gracefully.
function emptyTimeframe(timeframe: Timeframe): TimeframeCandles {
  return {
    timeframe,
    candles: [],
    ema20Series: [],
    ema50Series: [],
    indicators: {
      ema20: 0,
      ema50: 0,
      rsi: 50,
      macd: 0,
      macdHistogram: 0,
      macdCross: 'NONE',
      trend: 'RANGING',
      rsiZone: 'NEUTRAL',
    },
  }
}

const FALLBACK: TechnicalsResponse = {
  indicators: FALLBACK_INDICATORS,
  chart: FALLBACK_CHART,
  tf15m: emptyTimeframe('15M'),
  tf1h: emptyTimeframe('1H'),
  tf4h: emptyTimeframe('4H'),
  patterns: [],
}

// Yahoo's typed return narrows weirdly through option overloads,
// so we cast through unknown to a tight shape we control.
interface YahooCandle {
  date: Date | string | number
  open?: number
  high?: number
  low?: number
  close?: number
  volume?: number
}

function toUtcSeconds(d: Date | string | number): number {
  return Math.floor(new Date(d).getTime() / 1000)
}

// Pair an EMA value array with its corresponding candle times.
// Same alignment math as before — moved here to share between
// the 1H legacy series and the per-TF series.
function alignEmaToCandles(
  values: number[],
  candles: ChartCandle[],
  period: number
): ChartLinePoint[] {
  const offset = period - 1
  const out: ChartLinePoint[] = []
  for (let i = 0; i < values.length; i++) {
    const candle = candles[i + offset]
    if (!candle) continue
    out.push({ time: candle.time, value: values[i] })
  }
  return out
}

// Drop incomplete OHLC candles + de-dupe + sort. Lightweight
// Charts requires strictly ascending unique timestamps.
function cleanAndSort(quotes: YahooCandle[]): ChartCandle[] {
  const cleaned = quotes.filter(
    (q): q is YahooCandle & {
      open: number
      high: number
      low: number
      close: number
    } =>
      typeof q.open === 'number' &&
      typeof q.high === 'number' &&
      typeof q.low === 'number' &&
      typeof q.close === 'number'
  )
  const seen = new Set<number>()
  const candles: ChartCandle[] = []
  for (const q of cleaned) {
    const time = toUtcSeconds(q.date)
    if (seen.has(time)) {
      const idx = candles.findIndex((c) => c.time === time)
      if (idx >= 0) {
        candles[idx] = {
          time,
          open: q.open,
          high: q.high,
          low: q.low,
          close: q.close,
          volume: q.volume ?? 0,
        }
      }
      continue
    }
    seen.add(time)
    candles.push({
      time,
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.volume ?? 0,
    })
  }
  candles.sort((a, b) => a.time - b.time)
  return candles
}

// Yahoo doesn't expose a 4h interval, so we aggregate 1h candles
// into 4h buckets server-side. Buckets are aligned to the UTC
// hour grid (00:00, 04:00, 08:00, 12:00, 16:00, 20:00) so the 4H
// candles match what the trader sees on TradingView.
function bucketTo4H(hourly: ChartCandle[]): ChartCandle[] {
  if (hourly.length === 0) return []
  const buckets = new Map<number, ChartCandle>()
  for (const c of hourly) {
    // Floor to nearest 4-hour boundary in UTC seconds.
    const bucketStart = Math.floor(c.time / (4 * 3600)) * (4 * 3600)
    const existing = buckets.get(bucketStart)
    if (!existing) {
      buckets.set(bucketStart, {
        time: bucketStart,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })
    } else {
      // Keep the bucket's first open, last close, max high, min low,
      // sum of volume — standard OHLCV aggregation.
      existing.high = Math.max(existing.high, c.high)
      existing.low = Math.min(existing.low, c.low)
      existing.close = c.close
      existing.volume += c.volume
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time)
}

// Trend / RSI zone / MACD cross helpers — duplicated from
// lib/technicals.ts so the per-TF lightweight indicator block
// doesn't need the full TechnicalIndicators surface.
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

function detectMacdCross(
  series: { MACD?: number; signal?: number }[]
): MacdCross {
  if (series.length < 2) return 'NONE'
  const prev = series[series.length - 2]
  const curr = series[series.length - 1]
  const a = prev.MACD, b = prev.signal, c = curr.MACD, d = curr.signal
  if (a === undefined || b === undefined || c === undefined || d === undefined) return 'NONE'
  if (a <= b && c > d) return 'BULLISH_CROSS'
  if (a >= b && c < d) return 'BEARISH_CROSS'
  return 'NONE'
}

// Build a TimeframeCandles bundle from a candle history. Computes
// EMA20/50 series + scalar indicator readings (EMA20, EMA50, RSI,
// MACD histogram + cross, trend, rsiZone). Used per timeframe.
function buildTimeframe(
  timeframe: Timeframe,
  candles: ChartCandle[]
): TimeframeCandles {
  if (candles.length === 0) return emptyTimeframe(timeframe)

  const closes = candles.map((c) => c.close)
  const ema20Values = EMA.calculate({ period: 20, values: closes })
  const ema50Values = EMA.calculate({ period: 50, values: closes })
  const ema20Series: ChartSeriesPoint[] = alignEmaToCandles(ema20Values, candles, 20)
  const ema50Series: ChartSeriesPoint[] = alignEmaToCandles(ema50Values, candles, 50)

  // Scalar reads — last value of each, with safe fallback.
  const ema20 = ema20Values[ema20Values.length - 1] ?? 0
  const ema50 = ema50Values[ema50Values.length - 1] ?? 0
  const rsi = RSI.calculate({ period: 14, values: closes }).pop() ?? 50

  const macdSeries = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  })
  const macdLatest = macdSeries[macdSeries.length - 1] ?? { MACD: 0, signal: 0, histogram: 0 }

  const price = closes[closes.length - 1] ?? 0

  return {
    timeframe,
    candles,
    ema20Series,
    ema50Series,
    indicators: {
      ema20,
      ema50,
      rsi,
      macd: macdLatest.MACD ?? 0,
      macdHistogram: macdLatest.histogram ?? 0,
      macdCross: detectMacdCross(macdSeries),
      trend: classifyTrend(price, ema20, ema50),
      rsiZone: classifyRsiZone(rsi),
    },
  }
}

// Fetch a single timeframe from Yahoo. Wrapped in try/catch so a
// per-TF failure returns an empty bundle without taking down the
// whole route. The 4H timeframe is special — it fetches 1h and
// aggregates because Yahoo doesn't expose 4h directly.
async function fetchTimeframe(
  timeframe: Timeframe
): Promise<{ candles: ChartCandle[] }> {
  try {
    const period2 = new Date()

    let period1: Date
    let interval: '15m' | '1h'

    switch (timeframe) {
      case '15M':
        period1 = new Date(period2.getTime() - 5 * 24 * 3600 * 1000)
        interval = '15m'
        break
      case '1H':
        period1 = new Date(period2.getTime() - 60 * 24 * 3600 * 1000)
        interval = '1h'
        break
      case '4H':
        // Fetch 1h history then aggregate. 90 days of 1h ≈ 2160
        // candles → ~540 4H candles, far more than the 50+ minimum
        // required by the spec.
        period1 = new Date(period2.getTime() - 90 * 24 * 3600 * 1000)
        interval = '1h'
        break
    }

    const result = (await yahooFinance.chart('GC=F', {
      period1,
      period2,
      interval,
    })) as unknown as { quotes?: YahooCandle[] }

    const quotes = result.quotes ?? []
    if (quotes.length === 0) return { candles: [] }

    const candles = cleanAndSort(quotes)
    if (timeframe === '4H') return { candles: bucketTo4H(candles) }
    return { candles }
  } catch (err) {
    console.error(`[/api/technicals] ${timeframe} fetch failed:`, err)
    return { candles: [] }
  }
}

export async function GET() {
  try {
    // Fire all three fetches in parallel — total wall time ≈ the
    // slowest single fetch instead of the sum.
    const [r15, r1h, r4h] = await Promise.all([
      fetchTimeframe('15M'),
      fetchTimeframe('1H'),
      fetchTimeframe('4H'),
    ])

    // The 1H bundle drives the canonical TechnicalIndicators
    // snapshot (trend/RSI zone/ATR/Bollinger/swing high-low/etc)
    // that pre-existing consumers — SignalsPanel + AnalysisPanel
    // — rely on. If 1H failed entirely we fall through to FALLBACK.
    if (r1h.candles.length === 0) {
      console.error('[/api/technicals] 1H fetch returned no candles — using FALLBACK')
      return NextResponse.json(FALLBACK, { status: 200 })
    }

    const candles1h = r1h.candles
    const closes1h = candles1h.map((c) => c.close)
    const highs1h = candles1h.map((c) => c.high)
    const lows1h = candles1h.map((c) => c.low)
    const last = candles1h[candles1h.length - 1]
    const price = last.close

    const cutoffSec = Math.floor(Date.now() / 1000) - 24 * 3600
    const dayCandles = candles1h.filter((c) => c.time >= cutoffSec)
    const dayHigh = dayCandles.length
      ? Math.max(...dayCandles.map((c) => c.high))
      : last.high
    const dayLow = dayCandles.length
      ? Math.min(...dayCandles.map((c) => c.low))
      : last.low

    const indicators = computeIndicators({
      closes: closes1h,
      highs: highs1h,
      lows: lows1h,
      price,
      dayHigh,
      dayLow,
    })

    // Legacy 1H chart payload — preserves the existing GoldChart
    // contract so the chart component keeps rendering even before
    // SPRINT-3 wires up the timeframe switcher.
    const ema20Values = EMA.calculate({ period: 20, values: closes1h })
    const ema50Values = EMA.calculate({ period: 50, values: closes1h })
    const ema200Values = EMA.calculate({ period: 200, values: closes1h })
    const chart: ChartSeries = {
      candles: candles1h,
      ema20: alignEmaToCandles(ema20Values, candles1h, 20),
      ema50: alignEmaToCandles(ema50Values, candles1h, 50),
      ema200: alignEmaToCandles(ema200Values, candles1h, 200),
    }

    // Per-TF bundles — consumed by SPRINT-3 chart switcher and
    // SPRINT-4 prompt enrichment.
    const tf15m = buildTimeframe('15M', r15.candles)
    const tf1h = buildTimeframe('1H', candles1h)
    const tf4h = buildTimeframe('4H', r4h.candles)

    // Pattern detection — run on each TF, then deduplicate so the
    // same pattern detected on multiple TFs collapses to one entry
    // (highest TF wins, others noted in description).
    const detectedAt = new Date().toISOString()
    const allPatterns: DetectedPattern[] = [
      ...detectPatterns({ candles: r15.candles, timeframe: '15M', detectedAt }),
      ...detectPatterns({ candles: candles1h, timeframe: '1H', detectedAt }),
      ...detectPatterns({ candles: r4h.candles, timeframe: '4H', detectedAt }),
    ]
    const patterns = dedupePatterns(allPatterns)

    const response: TechnicalsResponse = {
      indicators,
      chart,
      tf15m,
      tf1h,
      tf4h,
      patterns,
    }
    return NextResponse.json(response)
  } catch (err) {
    console.error('[/api/technicals] fetch failed:', err)
    return NextResponse.json(FALLBACK, { status: 200 })
  }
}
