// GET /api/macro — [PHASE-12.2] FRED real-yield bundle.
//
// Returns the macro yields gold actually responds to:
//   - DFII10 (10Y TIPS yield, real yield)
//   - T10YIE (10Y breakeven inflation expectation)
//   - DFII5 (5Y TIPS, optional)
//   - T5YIFR (5Y5Y forward inflation expectation, optional)
//
// All four come from FRED's free public CSV download. No API key.
// Per-series fetches run in parallel; partial failures degrade the
// payload but never crash the route. Failure of all four returns a
// FALLBACK with empty fields and meta.source='mock' so the UI
// surfaces a "DONNÉES SIMULÉES" badge.
//
// Caching: 1-hour Next.js revalidate (FRED updates daily; 1h is
// plenty fresh and reduces outbound calls on a long-running
// dashboard).

import { NextResponse } from 'next/server'
import { fetchFredSeries } from '@/lib/macroFred'
import type { MacroYields } from '@/lib/types'

// Per-route cache hint (matches /api/technicals posture).
export const revalidate = 3600

// FALLBACK matches the live shape but carries meta.source='mock'
// so the UI can show the simulation badge.
const FALLBACK: MacroYields = {
  meta: { source: 'mock' },
}

export async function GET() {
  try {
    const [realYield10y, breakeven10y, realYield5y, fwdInflation5y5y] =
      await Promise.all([
        fetchFredSeries('DFII10'),
        fetchFredSeries('T10YIE'),
        fetchFredSeries('DFII5'),
        fetchFredSeries('T5YIFR'),
      ])

    // [PHASE-12.2] Provenance — 'live' if everything came back,
    // 'partial' if at least one series failed, 'mock' if all four
    // failed (in which case we still ship empty MacroYields rather
    // than throwing a 500).
    const successes = [realYield10y, breakeven10y, realYield5y, fwdInflation5y5y].filter(
      Boolean
    ).length
    const source: 'live' | 'partial' | 'mock' =
      successes === 4 ? 'live' : successes > 0 ? 'partial' : 'mock'

    const data: MacroYields = { meta: { source } }
    if (realYield10y) data.realYield10y = realYield10y
    if (breakeven10y) data.breakeven10y = breakeven10y
    if (realYield5y) data.realYield5y = realYield5y
    if (fwdInflation5y5y) data.fwdInflation5y5y = fwdInflation5y5y

    return NextResponse.json(data)
  } catch (err) {
    // [SECURITY L1] Log only the message; full error objects can
    // leak internal request paths.
    console.error(
      '[/api/macro] fetch failed:',
      err instanceof Error ? err.message : 'unknown'
    )
    return NextResponse.json(FALLBACK, { status: 200 })
  }
}
