// GET /api/replay — fetch 5-min candles between an analysis's
// generatedAt and generatedAt+horizonMinutes for path-based
// outcome classification.
//
// [PHASE-1] Replaces the point-in-time outcome check that lived
// in lib/history.ts. The old code compared LIVE PRICE at +2H and
// +4H against entry/stop/target — false positive whenever price
// touched the stop and then mean-reverted to the target before
// +4H. The fix is to walk the full candle path; the route
// returns raw candles and lib/history.ts owns the classifier
// (so stop/target parsing logic stays in one place).
//
// Request:
//   GET /api/replay?generatedAt=<ISO>&horizonMinutes=<60..480>
//
// Response (always HTTP 200, fail-soft):
//   {
//     candleCount: number,         // candles.length post-clean
//     candles: { time, high, low, close }[],
//     windowStart: ISO,
//     windowEnd:   ISO,            // min(now, generatedAt + horizonMinutes)
//     truncated:   boolean,        // true when period2 capped at now
//     bufferOk:    boolean,        // true when (now - generatedAt) >= horizonMinutes + 30min
//   }
//
// Why bufferOk: Yahoo's 5m feed lags realtime by ~15-30min. The
// client only writes a final hitOutcome when bufferOk=true,
// otherwise a record younger than the buffer would resolve
// against an incomplete tail of candles. Below the buffer the
// route returns whatever candles exist anyway (useful for early
// preview / debugging) but the client treats them as provisional.

import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
import {
  computeBasis,
  fetchSpotXau,
  shiftCandles,
} from '@/lib/priceFrame'

const yahooFinance = new YahooFinance()

// Yahoo's typed return narrows weirdly through option overloads,
// so we cast through unknown to a tight shape we control. Same
// pattern as /api/technicals.
interface YahooCandle {
  date: Date | string | number
  open?: number
  high?: number
  low?: number
  close?: number
  volume?: number
}

// Trimmed candle shape returned to the client. We don't ship
// open/volume — replayPath only needs high/low/close.
interface ReplayCandle {
  time: number   // unix seconds, strictly increasing
  high: number
  low: number
  close: number
}

interface ReplayResponse {
  candleCount: number
  candles: ReplayCandle[]
  windowStart: string
  windowEnd: string
  truncated: boolean
  bufferOk: boolean
}

// Bounds on horizonMinutes — 1h floor, 8h ceiling. The Phase 1
// caller asks for 240 (4h); the wider range is here for future
// scenarios (mid-day "how did this trade play out so far?" probe).
const HORIZON_MIN = 60
const HORIZON_MAX = 480
const HORIZON_DEFAULT = 240

// Buffer past the horizon before we consider candles complete —
// Yahoo's 5m feed typically lags realtime by 15-30min. 30min is
// the generous side; better to wait an extra tick than persist
// an outcome computed against a truncated candle path.
const COMPLETION_BUFFER_MS = 30 * 60 * 1000

// Empty payload helper — used on error / missing params /
// invalid timestamps. HTTP 200 keeps the client side simple
// (matches /api/technicals + /api/news posture).
function emptyPayload(
  windowStart: string,
  windowEnd: string,
  bufferOk: boolean,
  truncated: boolean
): ReplayResponse {
  return {
    candleCount: 0,
    candles: [],
    windowStart,
    windowEnd,
    truncated,
    bufferOk,
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const generatedAtRaw = url.searchParams.get('generatedAt') ?? ''
  const horizonRaw = url.searchParams.get('horizonMinutes') ?? ''

  // Parse + validate generatedAt. Anything unparseable returns
  // an empty payload rather than a 400 — the checker just retries
  // on the next 5min tick, no client-side error handling needed.
  const generatedAt = new Date(generatedAtRaw)
  if (Number.isNaN(generatedAt.getTime())) {
    const nowIso = new Date().toISOString()
    return NextResponse.json(
      emptyPayload(nowIso, nowIso, false, true),
      { status: 200 }
    )
  }

  // Clamp horizonMinutes to [HORIZON_MIN, HORIZON_MAX]; default
  // to HORIZON_DEFAULT when missing or non-numeric.
  const horizonParsed = Number(horizonRaw)
  const horizonMinutes = Number.isFinite(horizonParsed)
    ? Math.max(HORIZON_MIN, Math.min(HORIZON_MAX, Math.round(horizonParsed)))
    : HORIZON_DEFAULT

  const period1 = generatedAt
  const horizonEnd = new Date(period1.getTime() + horizonMinutes * 60 * 1000)
  const now = new Date()
  // Cap period2 at now — Yahoo will reject future timestamps.
  const period2 = horizonEnd.getTime() > now.getTime() ? now : horizonEnd
  const truncated = period2.getTime() < horizonEnd.getTime()

  // bufferOk: only true when the analysis is older than horizon +
  // buffer. The client gates outcome writes on this flag.
  const ageMs = now.getTime() - period1.getTime()
  const bufferOk =
    ageMs >= horizonMinutes * 60 * 1000 + COMPLETION_BUFFER_MS

  const windowStart = period1.toISOString()
  const windowEnd = period2.toISOString()

  // Reject zero-length windows up front (e.g. generatedAt in the
  // future, or generatedAt === now). Yahoo would error or return
  // an empty array; short-circuiting here is cleaner.
  if (period2.getTime() <= period1.getTime()) {
    return NextResponse.json(
      emptyPayload(windowStart, windowEnd, bufferOk, truncated),
      { status: 200 }
    )
  }

  try {
    // [FIX] Run yahoo + spot fetch in parallel — total wall-time
    // is the slower of the two instead of the sum. The spot
    // fetch is ~150ms typical so the cost is amortised.
    const [chartResult, spot] = await Promise.all([
      yahooFinance.chart('GC=F', {
        period1,
        period2,
        interval: '5m',
      }) as unknown as Promise<{ quotes?: YahooCandle[] }>,
      fetchSpotXau(),
    ])

    const quotes = chartResult.quotes ?? []

    // Drop quotes missing OHLC fields, dedupe by timestamp, sort
    // strictly ascending. Same minimum guarantees as
    // /api/technicals' cleanAndSort but tighter: replayPath only
    // reads high/low/close so we ship just those.
    const seen = new Set<number>()
    const futuresCandles: ReplayCandle[] = []
    for (const q of quotes) {
      if (
        typeof q.high !== 'number' ||
        typeof q.low !== 'number' ||
        typeof q.close !== 'number'
      ) {
        continue
      }
      const time = Math.floor(new Date(q.date).getTime() / 1000)
      if (!Number.isFinite(time) || seen.has(time)) continue
      seen.add(time)
      futuresCandles.push({ time, high: q.high, low: q.low, close: q.close })
    }
    futuresCandles.sort((a, b) => a.time - b.time)

    // [FIX] Basis-correct candles to spot frame so replayPath
    // compares them against entry/stop/target — which Claude
    // computed off SPOT — in the same reference frame. Without
    // this every futures wick is ~$30 above what the AI's level
    // strings imply, producing systematic HIT_TARGET on LONGs
    // and HIT_STOP on SHORTs even when nothing happened.
    const lastFuturesClose =
      futuresCandles.length > 0
        ? futuresCandles[futuresCandles.length - 1].close
        : null
    const basis = computeBasis(lastFuturesClose, spot)
    const candles = shiftCandles(futuresCandles, basis)

    const payload: ReplayResponse = {
      candleCount: candles.length,
      candles,
      windowStart,
      windowEnd,
      truncated,
      bufferOk,
    }
    return NextResponse.json(payload, { status: 200 })
  } catch (err) {
    // [SECURITY L1] Log only the message so the SDK error object
    // doesn't leak internal node_modules paths into stdout.
    console.error(
      '[/api/replay] yahoo fetch failed:',
      err instanceof Error ? err.message : 'unknown'
    )
    return NextResponse.json(
      emptyPayload(windowStart, windowEnd, bufferOk, truncated),
      { status: 200 }
    )
  }
}
