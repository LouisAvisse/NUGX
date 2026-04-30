// GET /api/signals — DXY + US10Y macro signals.
// Mock implementation: returns a hardcoded MarketSignals payload.
// Real implementation will use yahoo-finance2 (server-side only,
// per architecture rules in .claude/context.md) to fetch ^DXY and
// ^TNX, then map to the same shape. `: MarketSignals` keeps the
// mock honest against lib/types.ts.

import { NextResponse } from 'next/server'
import type { MarketSignals } from '@/lib/types'

export async function GET() {
  const mock: MarketSignals = {
    dxy:   { price: 104.23, change: -0.12, changePct: -0.11 },
    us10y: { price:   4.28, change:  0.03, changePct:  0.71 },
  }
  return NextResponse.json(mock)
}
