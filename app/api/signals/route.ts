// GET /api/signals — DXY + US10Y macro signals.
//
// Fetches both quotes from Yahoo Finance via the
// `yahoo-finance2` npm package (added in #2). The package is
// SERVER-SIDE ONLY per the architecture rules in
// .claude/context.md — never import it in a client component
// or the build will break.
//
// Failure handling: any thrown error returns FALLBACK with
// HTTP 200 so the client never crashes; SignalsPanel just
// displays its "——" loading placeholders.
//
// yahoo-finance2 v3 broke the v2 default singleton: the default
// export is now the YahooFinance class, which must be
// instantiated. We create one module-level instance and reuse it
// across requests.

import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
import type { MarketSignals, SignalItem } from '@/lib/types'

// Single shared instance for this route.
const yahooFinance = new YahooFinance()

// Stable, typed fallback. Same shape as a successful response.
const FALLBACK: MarketSignals = {
  dxy: { price: 0, change: 0, changePct: 0 },
  us10y: { price: 0, change: 0, changePct: 0 },
}

// One Yahoo Finance ticker → SignalItem. The yahoo-finance2 v3
// types narrow `quote()`'s return into a discriminated union that
// TypeScript can't resolve here, so we cast through `unknown` to
// a minimal shape we read from. Each `?? 0` guards a missing field.
async function fetchTicker(symbol: string): Promise<SignalItem> {
  const quote = (await yahooFinance.quote(symbol)) as unknown as {
    regularMarketPrice?: number
    regularMarketChange?: number
    regularMarketChangePercent?: number
  }
  return {
    price: quote?.regularMarketPrice ?? 0,
    change: quote?.regularMarketChange ?? 0,
    changePct: quote?.regularMarketChangePercent ?? 0,
  }
}

export async function GET() {
  try {
    // Promise.all so both fetches run in parallel — total
    // latency is the slower of the two, not the sum.
    const [dxy, us10y] = await Promise.all([
      fetchTicker('DX-Y.NYB'), // US Dollar Index
      fetchTicker('^TNX'),     // CBOE 10-Year Treasury Note Yield
    ])

    const data: MarketSignals = { dxy, us10y }
    return NextResponse.json(data)
  } catch (err) {
    console.error('[/api/signals] fetch failed:', err)
    return NextResponse.json(FALLBACK, { status: 200 })
  }
}
