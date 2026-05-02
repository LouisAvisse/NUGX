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
// [PHASE-8] Optional vix/jpy/oil/btc are omitted so the UI
// renders only the canonical DXY + US10Y rows during outage
// (matches pre-Phase-8 behaviour).
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

// [PHASE-8] Wrapper around fetchTicker that returns null on
// failure so a single ticker outage doesn't drag down the rest
// of the response. Used for the optional macro expansions
// (VIX/JPY/oil/BTC) — DXY and US10Y are still hard-required
// (their absence triggers the route-level fallback).
async function fetchTickerOptional(
  symbol: string
): Promise<SignalItem | null> {
  try {
    const item = await fetchTicker(symbol)
    if (!Number.isFinite(item.price) || item.price <= 0) return null
    return item
  } catch (err) {
    console.error(
      `[/api/signals] optional ${symbol} failed:`,
      err instanceof Error ? err.message : 'unknown'
    )
    return null
  }
}

export async function GET() {
  try {
    // [PHASE-8] All six fetches in parallel. Two REQUIRED
    // (dxy + us10y) and four OPTIONAL (vix, jpy, oil, btc).
    // Optional failures don't take down the route; they drop to
    // null and the UI hides the corresponding row.
    const [dxy, us10y, vix, jpy, oil, btc] = await Promise.all([
      fetchTicker('DX-Y.NYB'),       // required: US Dollar Index
      fetchTicker('^TNX'),           // required: CBOE 10Y yield
      fetchTickerOptional('^VIX'),   // optional: risk-off proxy
      fetchTickerOptional('JPY=X'),  // optional: USD/JPY safe-haven
      fetchTickerOptional('CL=F'),   // optional: WTI front-month
      fetchTickerOptional('BTC-USD'),// optional: risk-on proxy
    ])

    const data: MarketSignals = { dxy, us10y }
    if (vix) data.vix = vix
    if (jpy) data.jpy = jpy
    if (oil) data.oil = oil
    if (btc) data.btc = btc
    return NextResponse.json(data)
  } catch (err) {
    // [SECURITY L1] Log the message only — full SDK errors leak
    // internal node_modules paths.
    console.error(
      '[/api/signals] fetch failed:',
      err instanceof Error ? err.message : 'unknown'
    )
    return NextResponse.json(FALLBACK, { status: 200 })
  }
}
