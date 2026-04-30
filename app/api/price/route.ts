// GET /api/price — XAU/USD spot snapshot.
// Will fetch from gold-api.com (free, no key, no rate limit) and
// return a GoldPrice payload (see lib/types.ts). Placeholder
// returns { ok: true } so the route exists and 200s during the
// scaffold phase.

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ ok: true })
}
