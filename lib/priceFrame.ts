// lib/priceFrame.ts — [FIX] align futures candles to spot frame.
//
// The dashboard ships three price feeds:
//   1. gold-api.com spot XAU         → live ticker, AI snapshot
//   2. Yahoo GC=F (gold futures)     → 15m/1h/4h candles for chart + technicals
//   3. TradingView iframe XAUUSD     → embedded chart (forex broker spot)
//
// (1) and (3) are spot prices; (2) is futures. Front-month
// futures sit ~$25-40 above spot due to contango, which means
// when the dashboard renders:
//
//   live ticker:        $4615 (spot)
//   AI entry:           $4605 (spot — Claude reasoned off spot)
//   candle close:       $4644 (futures)  ← +$30 mismatch
//
// The trader sees the AI entry $40 below the latest candle and
// reasonably wonders why. The fix is to subtract the basis
// (futures - spot) from every futures candle before rendering,
// so the candles read in spot frame and align with everything
// else on the dashboard.
//
// Basis isn't truly constant — it varies as futures roll and
// contango shifts — but over a single trading session the drift
// is small (~$1-3) and well below trader perceptual threshold.
// We compute basis from the most recent futures close vs current
// spot, apply it uniformly, and accept the small approximation.
//
// Used by:
//   /api/price       — basis-corrects yahoo OHLC fields
//   /api/technicals  — basis-corrects all timeframe candles
//   /api/replay      — basis-corrects 5m candles
//
// CLIENT-CALLABLE BUT SERVER-PREFERRED. Each route imports the
// helpers below and applies them server-side so the response
// the client receives is already in spot frame.

// gold-api.com endpoint — same constants used by /api/price.
// Free, no key, no rate limit. Returns USD/oz spot. Fail-soft —
// callers fall back to "no correction" when this is unreachable.
const GOLD_API_URL = 'https://api.gold-api.com/price/XAU'

// Tight bounds on plausible spot price so an upstream error
// doesn't propagate a wild basis to the chart.
const SPOT_MIN = 100
const SPOT_MAX = 100_000

// Tight bounds on plausible basis. Real-world contango on COMEX
// gold rarely exceeds $80 in any direction; a value outside this
// range almost certainly indicates a bad data source and we
// should skip correction rather than corrupt the candles.
const BASIS_MAX_ABS = 80

// Fetch current spot XAU. Returns null on any failure so the
// caller can decide whether to skip correction or use a stale
// value. Cheap (single fetch, no auth, ~150ms typical).
export async function fetchSpotXau(): Promise<number | null> {
  try {
    const res = await fetch(GOLD_API_URL, {
      next: { revalidate: 0 },
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const raw = (await res.json()) as { price?: unknown }
    const n = typeof raw.price === 'number' ? raw.price : Number(raw.price)
    if (!Number.isFinite(n) || n < SPOT_MIN || n > SPOT_MAX) return null
    return n
  } catch {
    return null
  }
}

// Compute the basis from the most recent futures close + the
// current spot price. Returns 0 (no correction) when either
// input is missing or the resulting basis is implausibly large.
//
// basis = futuresLastClose - spotPrice
// spot-equivalent candle = futures candle - basis
export function computeBasis(
  futuresLastClose: number | null,
  spotPrice: number | null
): number {
  if (futuresLastClose === null || spotPrice === null) return 0
  if (!Number.isFinite(futuresLastClose) || !Number.isFinite(spotPrice)) return 0
  if (futuresLastClose <= 0 || spotPrice <= 0) return 0
  const basis = futuresLastClose - spotPrice
  if (Math.abs(basis) > BASIS_MAX_ABS) return 0
  return basis
}

// Generic candle shape — only the four OHLC fields move when we
// shift frames. Time / volume / etc. pass through unchanged.
// Generics let each route use its own narrower candle type
// without re-defining this helper per call site.
export interface CandleLike {
  open?: number
  high?: number
  low?: number
  close?: number
}

// Apply a basis shift to one candle. Returns a new object with
// the four OHLC fields shifted; passes other fields through via
// the spread. Skips fields that aren't finite numbers (some
// upstreams emit nulls / NaN on missing data).
export function shiftCandle<T extends CandleLike>(
  candle: T,
  basis: number
): T {
  if (basis === 0) return candle
  const out: T = { ...candle }
  if (typeof candle.open === 'number' && Number.isFinite(candle.open)) {
    out.open = candle.open - basis
  }
  if (typeof candle.high === 'number' && Number.isFinite(candle.high)) {
    out.high = candle.high - basis
  }
  if (typeof candle.low === 'number' && Number.isFinite(candle.low)) {
    out.low = candle.low - basis
  }
  if (typeof candle.close === 'number' && Number.isFinite(candle.close)) {
    out.close = candle.close - basis
  }
  return out
}

// Apply a basis shift to a whole array. Helper that exists so
// route code reads `shiftCandles(candles, basis)` instead of
// re-typing the .map every time.
export function shiftCandles<T extends CandleLike>(
  candles: T[],
  basis: number
): T[] {
  if (basis === 0) return candles
  return candles.map((c) => shiftCandle(c, basis))
}
