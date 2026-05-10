// lib/vwap.ts — [PHASE-12.3] anchored VWAP computation.
//
// Volume-Weighted Average Price anchored at a specific UTC second.
// Standard formula:
//
//   VWAP[t] = Σ(typicalPrice × volume) / Σ(volume)        (cumulative)
//   typicalPrice = (high + low + close) / 3
//
// Two anchors that matter for gold day trading:
//
//   - London open  (07:00 UTC of the current calendar day)
//   - NY open      (13:30 UTC — cash open; we use 13:00 UTC as the
//                   anchor for cleaner alignment to the hourly grid)
//
// Anchored VWAP is the institutional intraday reference: long
// candidates set up above the relevant session VWAP, shorts set
// up below it. Mid-session reclaims of VWAP are tradeable in their
// own right.
//
// Computed from 15M candles (smallest TF the route fetches), so
// a London-open VWAP gets ~24 samples by NY open, which is plenty
// for a useful average.
//
// SERVER-SIDE ONLY — imported by /api/technicals/route.ts.

import type { ChartCandle } from '@/lib/types'

// One VWAP series anchored at a known UTC second. Returned to the
// chart so it can render the running VWAP line; `latest` is the
// scalar read for the SignalsPanel chip / AnalysisRequest.
export interface AnchoredVwap {
  anchor: 'LONDON_OPEN' | 'NY_OPEN'
  // ISO timestamp of the anchor (the UTC start of the session
  // window for the current day) — used in tooltips so the user
  // knows what "VWAP" they're looking at.
  anchorAt: string
  // Per-candle VWAP series — same time field as ChartCandle for
  // direct overlay. Empty when the anchor lies in the future
  // (e.g. before 07:00 UTC today, no London VWAP yet).
  series: { time: number; value: number }[]
  // Latest scalar — the single number worth chipping into the
  // SignalsPanel. 0 if the series is empty.
  latest: number
}

// UTC seconds of the most-recent London open (07:00 UTC). If the
// current UTC time is before today's 07:00, returns yesterday's
// 07:00 — but we then filter to today's window before computing,
// so the series ends up empty (the anchor lies in the future for
// today's session).
function londonOpenUtcSec(now: Date): number {
  const d = new Date(now)
  d.setUTCHours(7, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

// UTC seconds of the most-recent NY open (13:00 UTC, the rounded
// equivalent of cash 13:30). Same caveat as londonOpenUtcSec.
function nyOpenUtcSec(now: Date): number {
  const d = new Date(now)
  d.setUTCHours(13, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

// Compute one anchored VWAP from a candle history + anchor second.
// Returns the running cumulative VWAP for every candle whose time
// is >= anchorSec. Candles with zero or missing volume contribute
// the typical price weighted by 0 — i.e. they don't shift the
// cumulative average but they keep the time grid aligned.
function computeAnchoredVwap(
  candles: ChartCandle[],
  anchorSec: number,
  anchor: 'LONDON_OPEN' | 'NY_OPEN'
): AnchoredVwap {
  // Anchor lies in the future (or no candles) → empty series.
  const nowSec = Math.floor(Date.now() / 1000)
  if (anchorSec > nowSec || candles.length === 0) {
    return {
      anchor,
      anchorAt: new Date(anchorSec * 1000).toISOString(),
      series: [],
      latest: 0,
    }
  }

  let sumPv = 0    // Σ(typicalPrice × volume)
  let sumV = 0     // Σ(volume)
  const out: { time: number; value: number }[] = []

  for (const c of candles) {
    if (c.time < anchorSec) continue
    const tp = (c.high + c.low + c.close) / 3
    // Volume can be 0 or missing for some bars (Yahoo's GC=F
    // night session) — guard against divide-by-zero.
    const v = Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 0
    sumPv += tp * v
    sumV += v
    if (sumV > 0) {
      out.push({ time: c.time, value: sumPv / sumV })
    } else {
      // Pre-volume samples — fall back to typical price so the
      // series renders continuously rather than punching a gap.
      out.push({ time: c.time, value: tp })
    }
  }

  return {
    anchor,
    anchorAt: new Date(anchorSec * 1000).toISOString(),
    series: out,
    latest: out.length > 0 ? out[out.length - 1].value : 0,
  }
}

// Compose the bundle for /api/technicals: London + NY anchored
// VWAPs from the 15M candle history. Both are returned
// unconditionally; an unactivated anchor (e.g. NY open at 09:00
// UTC) just ships an empty `series` and 0 `latest`.
export function computeSessionVwaps(candles15m: ChartCandle[]): {
  london: AnchoredVwap
  ny: AnchoredVwap
} {
  const now = new Date()
  const london = computeAnchoredVwap(
    candles15m,
    londonOpenUtcSec(now),
    'LONDON_OPEN'
  )
  const ny = computeAnchoredVwap(
    candles15m,
    nyOpenUtcSec(now),
    'NY_OPEN'
  )
  return { london, ny }
}
