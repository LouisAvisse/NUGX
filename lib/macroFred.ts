// lib/macroFred.ts — [PHASE-12.2] FRED public CSV client.
//
// Gold is a real-yield asset. Nominal 10Y (already in /api/signals
// via Yahoo's ^TNX) is a proxy at best — the actual driver is the
// 10Y TIPS yield (DFII10) and the 10Y breakeven inflation
// expectation (T10YIE = nominal − real). Both are published daily
// by the St. Louis Fed.
//
// FRED's HTML graph endpoints expose a public CSV download URL:
//
//   https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFII10
//
// No API key required. The CSV is small (~3 lines per business
// day, multi-year history truncated server-side via cosd/coed).
// Format:
//
//   observation_date,DFII10
//   2024-12-30,1.95
//   2024-12-31,1.98
//
// Missing observations come back as `.` (FRED's null marker).
// We filter those out and return only the latest valid pair so
// the route can compute a 1-day change.

import type { MacroYieldItem } from '@/lib/types'

// FRED series IDs the dashboard reads. Values flow into MacroYields.
export type FredSeries =
  | 'DFII10'   // 10Y TIPS yield — real yield, gold's primary driver
  | 'T10YIE'   // 10Y breakeven inflation (nominal − real)
  | 'DFII5'    // 5Y TIPS yield
  | 'T5YIFR'   // 5Y5Y forward inflation expectation

// ~30 day window. Plenty for "latest" + "previous" while keeping
// the CSV download tiny. The window slides as the route is called.
const LOOKBACK_DAYS = 30

// One parsed (date, value) row. `value` is the float; rows where
// FRED reports `.` (missing observation) are filtered before
// consumers see them.
interface Observation {
  date: string   // YYYY-MM-DD
  value: number
}

// FRED CSV download URL for a single series, scoped to the last
// LOOKBACK_DAYS so we don't pull years of history. cosd = "starting
// observation date" (YYYY-MM-DD).
function fredUrl(series: FredSeries): string {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - LOOKBACK_DAYS)
  const cosd = start.toISOString().slice(0, 10)
  return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}&cosd=${cosd}`
}

// Parse FRED's CSV into a clean Observation[]. Tolerates the CSV
// header (always "observation_date,<SERIES_ID>") and skips rows
// where the value is `.` (FRED's null) or fails Number parsing.
function parseFredCsv(csv: string): Observation[] {
  const lines = csv.trim().split(/\r?\n/)
  // Skip header. Defensive: if a row lacks two columns, skip it.
  const out: Observation[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length < 2) continue
    const date = cols[0].trim()
    const raw = cols[1].trim()
    if (!date || !raw || raw === '.') continue
    const value = Number(raw)
    if (!Number.isFinite(value)) continue
    out.push({ date, value })
  }
  return out
}

// Fetch one FRED series. 1-hour Next cache because FRED updates
// daily — 1h granularity is plenty fresh and dramatically reduces
// outbound calls when the dashboard is left open.
//
// Failure handling: any error (network, parse, empty CSV) returns
// null. The route fans out and assembles whatever did succeed.
export async function fetchFredSeries(
  series: FredSeries
): Promise<MacroYieldItem | null> {
  try {
    const res = await fetch(fredUrl(series), {
      // Next.js fetch caching — revalidate hourly. Reduces request
      // count on a tool that's left open all day.
      next: { revalidate: 3600 },
      // 8s upper bound keeps a slow FRED endpoint from blocking
      // the whole macro fan-out.
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) {
      console.error(
        `[macroFred] ${series} non-OK HTTP ${res.status}`
      )
      return null
    }
    const text = await res.text()
    const obs = parseFredCsv(text)
    if (obs.length < 2) return null
    const latest = obs[obs.length - 1]
    const prev = obs[obs.length - 2]
    const change = latest.value - prev.value
    // Yields can sit near zero; use the magnitude of the latest
    // value as the denominator and guard against divide-by-zero.
    const denom = Math.abs(latest.value) > 0.01 ? latest.value : 1
    const changePct = (change / denom) * 100
    return {
      value: latest.value,
      change,
      changePct,
      observedAt: latest.date,
    }
  } catch (err) {
    console.error(
      `[macroFred] ${series} fetch failed:`,
      err instanceof Error ? err.message : 'unknown'
    )
    return null
  }
}
