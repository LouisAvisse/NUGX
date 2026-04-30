// GET /api/price — XAU/USD spot snapshot.
// Mock implementation: returns a hardcoded GoldPrice payload so the
// dashboard can render real shapes before gold-api.com is wired in.
// Real implementation will fetch gold-api.com (free, no key, no
// rate limit) and shape the response identically. The TypeScript
// `: GoldPrice` annotation guarantees the mock can never drift from
// the contract in lib/types.ts — any field rename will break the build.

import { NextResponse } from 'next/server'
import type { GoldPrice } from '@/lib/types'

export async function GET() {
  const mock: GoldPrice = {
    price: 3285.40,
    change: 12.30,
    changePct: 0.38,
    high: 3301.00,
    low: 3271.50,
    open: 3273.10,
    prevClose: 3273.10,
    timestamp: Date.now(), // fresh server time on every request
  }
  return NextResponse.json(mock)
}
