// POST /api/backtest — [PHASE-11] backtest harness endpoint.
//
// Wraps lib/backtest/runner so the trader can run a historical
// validation by hitting the route. Takes a date range, runs the
// scoring + setup detection + path replay against historical
// candles, returns aggregated stats.
//
// Request body:
//   {
//     startISO?: string,        // default: 14d ago
//     endISO?: string,          // default: now
//     evaluationIntervalMin?: number   // default: 60 (one per hour)
//   }
//
// Response: BacktestReport (lib/backtest/runner). Always HTTP 200
// on validation failure → empty report with totalCandles=0; the
// route never throws to the client (matches /api/replay posture).
//
// SERVER-SIDE ONLY (uses yahoo-finance2). Cached server-side via
// Next.js: each unique (startISO, endISO) pair runs once and then
// reuses the result for an hour — backtests are idempotent over
// closed candles, no point re-running them.

import { NextResponse } from 'next/server'
import {
  DEFAULT_LOOKBACK_DAYS,
  runBacktest,
  type BacktestReport,
} from '@/lib/backtest/runner'

// Hard caps to protect the route from a runaway request.
// 60 days of 5m candles ≈ 17,280 bars; 90 days hits Yahoo's
// 5m lookback ceiling and risks empty payloads.
const MAX_WINDOW_DAYS = 60
const MIN_INTERVAL_MIN = 15

function emptyReport(start: string, end: string): BacktestReport {
  return {
    windowStart: start,
    windowEnd: end,
    basis: 0,
    totalCandles: 0,
    trades: [],
    overall: {
      count: 0,
      decided: 0,
      wins: 0,
      losses: 0,
      accuracy: null,
      avgRR: null,
      avgFavorablePct: null,
    },
    bySetup: {},
    bySession: {},
    byScoreBucket: {},
  }
}

export async function POST(request: Request) {
  // Parse body — fail-soft to defaults so a malformed request
  // still produces a useful answer.
  let body: {
    startISO?: string
    endISO?: string
    evaluationIntervalMin?: number
  }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  // Default window: last 14 days. Caps at MAX_WINDOW_DAYS to
  // protect against a runaway "give me the last year" request.
  const now = Date.now()
  const defaultStart = new Date(
    now - DEFAULT_LOOKBACK_DAYS * 24 * 3600 * 1000
  ).toISOString()
  const startISO = body.startISO ?? defaultStart
  const endISO = body.endISO ?? new Date(now).toISOString()

  // Validate the range.
  const startMs = Date.parse(startISO)
  const endMs = Date.parse(endISO)
  if (
    Number.isNaN(startMs) ||
    Number.isNaN(endMs) ||
    endMs <= startMs
  ) {
    return NextResponse.json(emptyReport(startISO, endISO), { status: 200 })
  }
  const widthDays = (endMs - startMs) / (24 * 3600 * 1000)
  if (widthDays > MAX_WINDOW_DAYS) {
    return NextResponse.json(
      {
        ...emptyReport(startISO, endISO),
        error: `window exceeds ${MAX_WINDOW_DAYS} day cap`,
      },
      { status: 200 }
    )
  }

  const interval = Math.max(
    MIN_INTERVAL_MIN,
    Number(body.evaluationIntervalMin) || 60
  )

  try {
    const report = await runBacktest({
      startISO,
      endISO,
      evaluationIntervalMin: interval,
    })
    return NextResponse.json(report, { status: 200 })
  } catch (err) {
    // [SECURITY L1] Log only the message string. Backtests can
    // hit Yahoo rate limits or produce huge intermediate arrays
    // that throw OOM in dev; never echo the full error.
    console.error(
      '[/api/backtest] failed:',
      err instanceof Error ? err.message : 'unknown'
    )
    return NextResponse.json(emptyReport(startISO, endISO), { status: 200 })
  }
}
