// GET /api/technicals — XAU/USD technical indicators on 1H candles.
//
// Pulls ~30 days of hourly candles for XAUUSD=X via yahoo-finance2,
// passes the close/high/low arrays + current spot to
// computeIndicators in lib/technicals.ts, and returns the full
// TechnicalIndicators payload from lib/types.ts.
//
// SERVER-SIDE ONLY (yahoo-finance2 + technicalindicators).
// Failure handling: any error returns FALLBACK with HTTP 200 so
// the client never crashes; SignalsPanel TECHNICAL section just
// shows its "——" placeholders.

import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
import { computeIndicators } from '@/lib/technicals'
import type { TechnicalIndicators } from '@/lib/types'

// Single shared instance — same pattern as /api/signals.
const yahooFinance = new YahooFinance()

// Stable, typed safe-default. RSI 50, trend RANGING, all bands
// at zero — the panel treats these as "unknown" / "no signal".
const FALLBACK: TechnicalIndicators = {
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
    // but happens around session boundaries). chronological order
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

    const closes = cleaned.map((q) => q.close)
    const highs = cleaned.map((q) => q.high)
    const lows = cleaned.map((q) => q.low)
    const last = cleaned[cleaned.length - 1]

    // Spot price + day high/low — we use the last candle's close
    // as spot and compute the day range from candles dated within
    // the last 24 hours. The /api/price endpoint has a fresher
    // spot, but routes can't easily call each other server-side
    // without internal HTTP, and the candle close is close enough
    // for indicator math (the consumer-side hook can mix in the
    // live spot for display).
    const price = last.close

    // Day range from candles in the last 24 hours.
    const cutoff = period2.getTime() - 24 * 3600 * 1000
    const dayCandles = cleaned.filter(
      (q) => new Date(q.date).getTime() >= cutoff
    )
    const dayHigh = dayCandles.length
      ? Math.max(...dayCandles.map((q) => q.high))
      : last.high
    const dayLow = dayCandles.length
      ? Math.min(...dayCandles.map((q) => q.low))
      : last.low

    const indicators = computeIndicators({
      closes,
      highs,
      lows,
      price,
      dayHigh,
      dayLow,
    })

    return NextResponse.json(indicators)
  } catch (err) {
    console.error('[/api/technicals] fetch failed:', err)
    return NextResponse.json(FALLBACK, { status: 200 })
  }
}
