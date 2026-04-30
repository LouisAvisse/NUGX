// GET /api/price — XAU/USD spot snapshot.
//
// Fetches https://api.gold-api.com/price/XAU on every request
// (the gold-api.com endpoint is free, requires no key, has no
// rate limit, and supports CORS) and reshapes the payload into
// the GoldPrice contract from lib/types.ts.
//
// Failure handling: any thrown error is caught and the route
// returns FALLBACK with HTTP 200 — the client never crashes,
// it just displays zeros until the next poll succeeds.

import { NextResponse } from 'next/server'
import type { GoldPrice } from '@/lib/types'

// Stable, typed fallback. Same shape as a successful response
// so the consumer code does not have to special-case errors.
const FALLBACK: GoldPrice = {
  price: 0,
  change: 0,
  changePct: 0,
  high: 0,
  low: 0,
  open: 0,
  prevClose: 0,
  timestamp: Date.now(),
}

export async function GET() {
  try {
    const res = await fetch('https://api.gold-api.com/price/XAU', {
      // Disable Next's data cache — the hook polls every 30s and
      // wants a fresh response every time.
      next: { revalidate: 0 },
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      throw new Error(`gold-api responded ${res.status}`)
    }

    const raw = await res.json()

    // Map gold-api.com field names → GoldPrice. Each `?? 0`
    // guards against missing fields (e.g. fresh trading day).
    // gold-api returns `timestamp` in seconds; multiply by 1000
    // to match JS Date.now() / new Date().getTime() convention.
    const data: GoldPrice = {
      price: raw.price ?? 0,
      change: raw.ch ?? 0,
      changePct: raw.chp ?? 0,
      high: raw.high ?? 0,
      low: raw.low ?? 0,
      open: raw.open ?? 0,
      prevClose: raw.prev_close ?? 0,
      timestamp: (raw.timestamp ?? 0) * 1000,
    }

    return NextResponse.json(data)
  } catch (err) {
    // Log server-side; the client receives a clean fallback.
    console.error('[/api/price] fetch failed:', err)
    return NextResponse.json(FALLBACK, { status: 200 })
  }
}
