// lib/session.ts — trading session detection.
// Maps the current UTC hour onto one of the five named sessions
// from .claude/context.md > Session logic, and flags whether the
// trader is inside the NY/London overlap (the only window where
// `isHighVolatility` is true). Pure function, no I/O — safe to
// call from a render path or a hook.

import type { TradingSession, SessionName } from '@/lib/types'

// Session bands (UTC, half-open ranges — `[start, end)`):
//   00:00–07:00  Tokyo
//   07:00–12:00  London
//   12:00–16:00  NY/London Overlap   ← high volatility
//   16:00–21:00  New York
//   21:00–24:00  Off-hours
// [PHASE-11] Optional `at` argument lets the backtest harness
// resolve the session for a HISTORICAL timestamp. Live callers
// (PriceBar, AnalysisPanel etc.) keep the no-arg signature and
// get the current session — same behaviour as before.
export function getCurrentSession(at?: Date): TradingSession {
  // Use UTC so the result is the same on the trader's machine and
  // the server (avoids timezone drift between SSR and client).
  const utcHour = (at ?? new Date()).getUTCHours()

  let name: SessionName
  let isHighVolatility: boolean

  if (utcHour >= 0 && utcHour < 7) {
    name = 'Tokyo'
    isHighVolatility = false
  } else if (utcHour >= 7 && utcHour < 12) {
    name = 'London'
    isHighVolatility = false
  } else if (utcHour >= 12 && utcHour < 16) {
    // NY and London desks both active — the spec calls this out as
    // the highest-volatility window, surfaced as a flag in the UI.
    name = 'NY/London Overlap'
    isHighVolatility = true
  } else if (utcHour >= 16 && utcHour < 21) {
    name = 'New York'
    isHighVolatility = false
  } else {
    // 21:00–24:00 UTC — markets thin, lowest priority for analysis.
    name = 'Off-hours'
    isHighVolatility = false
  }

  return { name, isHighVolatility }
}
