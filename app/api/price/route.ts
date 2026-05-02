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

    // [SECURITY L5] Range-check every numeric field. gold-api.com
    // is a public, unauthenticated upstream; a poisoned response
    // (price = -1e9, timestamp = 9e15, NaN, string, etc.) would
    // otherwise propagate into the chart, the AI prompt, and the
    // ATR/level math the trader sees. A field that fails the
    // sanity check falls back to 0 — same posture as the missing-
    // field case the original code already handled with `?? 0`.
    //
    // PRICE_MAX (1e6) is generous: gold-api quotes USD/oz in the
    // low thousands, so 1e6 catches any unit confusion. The
    // change/percent bounds are similarly loose to avoid rejecting
    // legitimate intra-day swings.
    const PRICE_MAX = 1_000_000
    const safeNum = (v: unknown, min: number, max: number): number => {
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) && n >= min && n <= max ? n : 0
    }
    // Timestamp is seconds-since-epoch from gold-api; we multiply
    // by 1000 below. Bound to a 100-year window so a corrupted
    // value can't produce an invalid Date downstream.
    const tsMin = 0
    const tsMax = 4_102_444_800 // year 2100 in unix seconds

    const data: GoldPrice = {
      price: safeNum(raw.price, 0, PRICE_MAX),
      change: safeNum(raw.ch, -PRICE_MAX, PRICE_MAX),
      changePct: safeNum(raw.chp, -1000, 1000),
      high: safeNum(raw.high, 0, PRICE_MAX),
      low: safeNum(raw.low, 0, PRICE_MAX),
      open: safeNum(raw.open, 0, PRICE_MAX),
      prevClose: safeNum(raw.prev_close, 0, PRICE_MAX),
      timestamp: safeNum(raw.timestamp, tsMin, tsMax) * 1000,
    }

    return NextResponse.json(data)
  } catch (err) {
    // [SECURITY L1] Log only the message — full error objects
    // can leak internal node_modules paths.
    console.error(
      '[/api/price] fetch failed:',
      err instanceof Error ? err.message : 'unknown'
    )
    return NextResponse.json(FALLBACK, { status: 200 })
  }
}
