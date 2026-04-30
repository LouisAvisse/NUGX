// GET /api/technicals — XAU/USD technical indicators on 1H candles
// PLUS raw OHLCV + EMA series for the GoldChart panel.
//
// Pulls ~30 days of hourly candles for GC=F via yahoo-finance2,
// passes the close/high/low arrays + current spot to
// computeIndicators in lib/technicals.ts, AND ships the raw
// candle array + three EMA series back to the client so the
// Lightweight Charts panel never has to recompute indicators in
// the browser.
//
// SERVER-SIDE ONLY (yahoo-finance2 + technicalindicators).
// Failure handling: any error returns FALLBACK with HTTP 200 so
// the client never crashes; SignalsPanel TECHNICAL section just
// shows its "——" placeholders, GoldChart renders an empty chart.

import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
import { EMA } from 'technicalindicators'
import { computeIndicators } from '@/lib/technicals'
import type {
  ChartCandle,
  ChartLinePoint,
  ChartSeries,
  TechnicalIndicators,
  TechnicalsResponse,
} from '@/lib/types'

// Single shared instance — same pattern as /api/signals.
const yahooFinance = new YahooFinance()

// Stable, typed safe-default. RSI 50, trend RANGING, all bands
// at zero — the panel treats these as "unknown" / "no signal".
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

// Empty chart payload — GoldChart simply renders nothing.
const FALLBACK_CHART: ChartSeries = {
  candles: [],
  ema20: [],
  ema50: [],
  ema200: [],
}

const FALLBACK: TechnicalsResponse = {
  indicators: FALLBACK_INDICATORS,
  chart: FALLBACK_CHART,
}

// Minimal candle shape we read from the chart() response. yahoo-
// finance2's typed return narrows weirdly through the library's
// option overloads, so we cast through `unknown` to a tight
// shape we control.
interface YahooCandle {
  date: Date | string | number
  open?: number
  high?: number
  low?: number
  close?: number
  volume?: number
}

// 30 days of history. EMA200 needs 200 readings; 30 × 24 = 720
// hourly candles is plenty of headroom.
const HISTORY_DAYS = 30

// Convert Yahoo's date (Date | ISO string | epoch ms number) to
// the UTCTimestamp form Lightweight Charts expects (seconds
// since epoch, integer).
function toUtcSeconds(d: Date | string | number): number {
  return Math.floor(new Date(d).getTime() / 1000)
}

// Pair an EMA value array with its corresponding candle times.
// `EMA.calculate({ period, values })` returns N - period + 1
// values (no output until enough history exists), so the i-th
// EMA value lines up with the (i + period - 1)-th candle.
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

export async function GET() {
  try {
    const period2 = new Date()
    const period1 = new Date(period2.getTime() - HISTORY_DAYS * 24 * 3600 * 1000)

    // chart() with interval '1h' returns a `quotes` array of
    // candle objects. We pass through unknown because the library
    // types narrow into a discriminated union we don't need.
    //
    // Symbol note: Yahoo's spot ticker `XAUUSD=X` doesn't return
    // hourly chart data ("No data found, symbol may be delisted").
    // `GC=F` is the COMEX gold futures continuous contract — it
    // tracks XAU/USD spot tightly (sub-1% basis on most days) and
    // has reliable 1H candles. Using it for indicator math is the
    // standard approach.
    const result = (await yahooFinance.chart('GC=F', {
      period1,
      period2,
      interval: '1h',
    })) as unknown as { quotes?: YahooCandle[] }

    const quotes = result.quotes ?? []
    if (quotes.length === 0) {
      throw new Error('No candle data returned from chart()')
    }

    // Drop any candle that's missing a required OHLC field (rare
    // but happens around session boundaries). Chronological order
    // is preserved.
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

    if (cleaned.length === 0) {
      throw new Error('All candles missing OHLC fields')
    }

    // Build the raw candle series first — single source of truth
    // for both the chart payload AND the indicator math below.
    // De-duplicate timestamps (Yahoo occasionally returns two
    // candles at the same hour around DST transitions); keep the
    // last one. Lightweight Charts requires strictly ascending,
    // unique times or it throws.
    const seen = new Set<number>()
    const candles: ChartCandle[] = []
    for (const q of cleaned) {
      const time = toUtcSeconds(q.date)
      // Last-write-wins on duplicate times: replace the prior
      // candle in place rather than appending.
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

    const closes = candles.map((c) => c.close)
    const highs = candles.map((c) => c.high)
    const lows = candles.map((c) => c.low)
    const last = candles[candles.length - 1]

    // Spot price + day high/low — we use the last candle's close
    // as spot and compute the day range from candles dated within
    // the last 24 hours. The /api/price endpoint has a fresher
    // spot, but routes can't easily call each other server-side
    // without internal HTTP, and the candle close is close enough
    // for indicator math (the consumer-side hook can mix in the
    // live spot for display).
    const price = last.close

    // Day range from candles in the last 24 hours.
    const cutoffSec = Math.floor(period2.getTime() / 1000) - 24 * 3600
    const dayCandles = candles.filter((c) => c.time >= cutoffSec)
    const dayHigh = dayCandles.length
      ? Math.max(...dayCandles.map((c) => c.high))
      : last.high
    const dayLow = dayCandles.length
      ? Math.min(...dayCandles.map((c) => c.low))
      : last.low

    // Indicators (used by SignalsPanel + AnalysisPanel buildRequest).
    const indicators = computeIndicators({
      closes,
      highs,
      lows,
      price,
      dayHigh,
      dayLow,
    })

    // EMA series for the GoldChart overlay. Computed once here so
    // the client doesn't import technicalindicators.
    const ema20Values = EMA.calculate({ period: 20, values: closes })
    const ema50Values = EMA.calculate({ period: 50, values: closes })
    const ema200Values = EMA.calculate({ period: 200, values: closes })

    const chart: ChartSeries = {
      candles,
      ema20: alignEmaToCandles(ema20Values, candles, 20),
      ema50: alignEmaToCandles(ema50Values, candles, 50),
      ema200: alignEmaToCandles(ema200Values, candles, 200),
    }

    const response: TechnicalsResponse = { indicators, chart }
    return NextResponse.json(response)
  } catch (err) {
    console.error('[/api/technicals] fetch failed:', err)
    return NextResponse.json(FALLBACK, { status: 200 })
  }
}
