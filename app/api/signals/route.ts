// GET /api/signals — DXY + US10Y macro signals.
// Will use the yahoo-finance2 npm package (server-side only) to
// fetch ^DXY and ^TNX, then return a MarketSignals payload (see
// lib/types.ts). Placeholder returns { ok: true } during scaffold.

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ ok: true })
}
