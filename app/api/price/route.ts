// GET /api/price — XAU/USD spot snapshot with derived OHLC.
//
// [F-01 FIX] gold-api.com returns ONLY the live spot price; it
// emits no change / high / low / open / prev_close / timestamp
// fields. The previous version of this route mapped fields that
// don't exist in the upstream response, so every PriceBar /
// BottomBar / page-title cell that read change/H/L/open/prevClose
// silently displayed zeros — including the AnalysisRequest sent
// to Claude. The dashboard was running with structurally broken
// inputs.
//
// Two-source design:
//   1. gold-api.com  — live spot ($XAU). Free, no key, no rate
//                      limit, sub-second response. Best source
//                      for a fresh tick.
//   2. yahoo-finance2 GC=F 1h candles — last 2 calendar days,
//                      used to derive OHLC structure (today's
//                      open / high / low + previous-day close).
//
// Composing the two gives the dashboard real change% / session
// high / session low without losing the gold-api freshness.
//
// Failure handling:
//   - gold-api OK + Yahoo OK   → meta.source = 'live'
//   - gold-api OK + Yahoo fail → meta.source = 'partial' (spot
//                                only; OHLC zeros)
//   - gold-api fail + Yahoo OK → use Yahoo last close as spot,
//                                meta.source = 'partial'
//   - both fail                → FALLBACK with meta.source = 'mock'
//
// SERVER-SIDE ONLY (yahoo-finance2). Cached only by the hook
// polling cadence — no Next data cache (fresh tick every 30s).

import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
import type { GoldPrice } from '@/lib/types'

const yahooFinance = new YahooFinance()

// Stable, typed fallback. price=0 is the explicit "do not act"
// signal; the AnalysisPanel now guards on price > 0 before
// auto-triggering (F-35).
const FALLBACK: GoldPrice = {
  price: 0,
  change: 0,
  changePct: 0,
  high: 0,
  low: 0,
  open: 0,
  prevClose: 0,
  timestamp: Date.now(),
  meta: { source: 'mock' },
}

// [SECURITY L5] Tight numeric bounds. gold-api quotes USD/oz in
// the low thousands, so 1e6 catches any unit confusion. The
// change/percent bounds are loose enough to admit legitimate
// intra-day swings without rejecting real data.
const PRICE_MAX = 1_000_000

function safeNum(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= min && n <= max ? n : 0
}

// Yahoo's chart() returns weakly-typed quotes; we narrow through
// `unknown` to a tight shape we control. Same trick as
// /api/technicals.
interface YahooCandle {
  date: Date | string | number
  open?: number
  high?: number
  low?: number
  close?: number
  volume?: number
}

// Fetch the last 2 days of 1h candles for GC=F. 2 days is the
// minimum window that guarantees we span both today (for OHLC)
// and the previous trading day (for prevClose). Anything shorter
// risks an empty "previous day" set after a weekend.
async function fetchRecentCandles(): Promise<YahooCandle[]> {
  const period2 = new Date()
  const period1 = new Date(period2.getTime() - 2 * 24 * 3600 * 1000)
  const result = (await yahooFinance.chart('GC=F', {
    period1,
    period2,
    interval: '1h',
  })) as unknown as { quotes?: YahooCandle[] }
  return (result.quotes ?? []).filter(
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
}

// Compute the 4 OHLC structure fields from a candle array. Today
// and yesterday are anchored to UTC so the boundary is unambiguous
// regardless of the trader's local timezone (matches the rest of
// the app — getCurrentSession uses UTC).
//
// Returns prevClose = the most recent candle BEFORE today's UTC
// midnight. Returns open = first candle on or after today's UTC
// midnight. Returns high/low = max/min over today's candles. If
// "today" has no candles yet (very early UTC morning, weekend),
// fall back to yesterday's last close for everything.
interface OhlcDerived {
  open: number
  high: number
  low: number
  prevClose: number
}

function deriveOhlc(candles: YahooCandle[]): OhlcDerived | null {
  if (candles.length === 0) return null

  // UTC midnight of today.
  const now = new Date()
  const todayMidnightUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  )

  // Coerce each candle's date to ms-epoch for comparison.
  const withTs = candles.map((c) => ({
    ...c,
    ms: new Date(c.date).getTime(),
  }))

  const todays = withTs.filter((c) => c.ms >= todayMidnightUtc)
  const earlier = withTs.filter((c) => c.ms < todayMidnightUtc)

  // prevClose = last candle's close before today (yesterday's
  // final hour). When the market has been quiet for a day or two
  // and we have no "earlier than today" candles at all, fall back
  // to the very first candle in the dataset.
  const prevCloseSrc = earlier.length > 0
    ? earlier[earlier.length - 1]
    : withTs[0]
  const prevClose = prevCloseSrc.close as number

  // No candles yet for today — the session is so fresh (or
  // weekend) that we can't compute today's open/high/low. Fall
  // back to prevClose for those so the UI shows a flat "no
  // movement yet today" view rather than zeros.
  if (todays.length === 0) {
    return { open: prevClose, high: prevClose, low: prevClose, prevClose }
  }

  const open = todays[0].open as number
  const high = Math.max(...todays.map((c) => c.high as number))
  const low = Math.min(...todays.map((c) => c.low as number))

  return { open, high, low, prevClose }
}

// Try to fetch the live spot from gold-api.com. Returns null on
// any failure so the caller can fall back to Yahoo's last close.
async function fetchSpot(): Promise<number | null> {
  try {
    const res = await fetch('https://api.gold-api.com/price/XAU', {
      next: { revalidate: 0 },
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const raw = await res.json()
    const price = safeNum(raw?.price, 0, PRICE_MAX)
    return price > 0 ? price : null
  } catch {
    return null
  }
}

export async function GET() {
  // Fire both fetches in parallel — the slowest of the two sets
  // total wall time. Promise.allSettled so a single failure
  // doesn't take down the route.
  const [spotResult, candlesResult] = await Promise.allSettled([
    fetchSpot(),
    fetchRecentCandles(),
  ])

  const spot = spotResult.status === 'fulfilled' ? spotResult.value : null
  const candles =
    candlesResult.status === 'fulfilled' ? candlesResult.value : []

  // Derive OHLC structure from candles. Returns null when the
  // Yahoo fetch was empty.
  const ohlc = deriveOhlc(candles)

  // Pick the spot price: prefer gold-api, fall back to the latest
  // Yahoo candle close.
  let livePrice = spot
  if (livePrice === null && candles.length > 0) {
    livePrice = candles[candles.length - 1].close as number
  }

  // Both sources failed — return FALLBACK with mock provenance.
  if (livePrice === null || livePrice <= 0) {
    console.error('[/api/price] both upstreams failed — returning FALLBACK')
    return NextResponse.json(FALLBACK, { status: 200 })
  }

  // Range-guard the live price one last time before composing.
  livePrice = safeNum(livePrice, 0, PRICE_MAX)

  // Compose the response. When OHLC is missing (Yahoo failed but
  // gold-api worked) we ship the spot only with zero-filled
  // structure fields and meta.source='partial' so the UI can
  // surface a "DONNÉES SIMULÉES" badge.
  if (!ohlc) {
    const data: GoldPrice = {
      price: livePrice,
      change: 0,
      changePct: 0,
      high: 0,
      low: 0,
      open: 0,
      prevClose: 0,
      timestamp: Date.now(),
      meta: { source: 'partial' },
    }
    return NextResponse.json(data)
  }

  // Both sources up — full provenance.
  const change = livePrice - ohlc.prevClose
  const changePct = ohlc.prevClose > 0 ? (change / ohlc.prevClose) * 100 : 0

  // The derived `high`/`low` reflect the candles only; if the
  // live spot is more extreme than the candle window (which lags
  // up to 1h), extend the bounds so the UI doesn't show
  // price > high or price < low.
  const high = Math.max(ohlc.high, livePrice)
  const low = Math.min(ohlc.low, livePrice)

  // Mark partial when either source was a fallback (gold-api
  // missed but Yahoo gave us spot) — the trader sees the badge
  // even though data is mostly real.
  const fullyLive =
    spotResult.status === 'fulfilled' && spotResult.value !== null &&
    candlesResult.status === 'fulfilled' && candles.length > 0

  const data: GoldPrice = {
    price: livePrice,
    change: safeNum(change, -PRICE_MAX, PRICE_MAX),
    changePct: safeNum(changePct, -1000, 1000),
    high: safeNum(high, 0, PRICE_MAX),
    low: safeNum(low, 0, PRICE_MAX),
    open: safeNum(ohlc.open, 0, PRICE_MAX),
    prevClose: safeNum(ohlc.prevClose, 0, PRICE_MAX),
    timestamp: Date.now(),
    meta: { source: fullyLive ? 'live' : 'partial' },
  }

  return NextResponse.json(data)
}
