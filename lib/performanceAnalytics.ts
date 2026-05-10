// lib/performanceAnalytics.ts — [PHASE-12.5] PnL analytics.
//
// Computes the metrics the user-facing MEMORY tab should expose
// once enough closed trades exist:
//
//   expectancy        — average $ won per trade ($)
//   profitFactor      — gross win $ / gross loss $
//   winRate           — closed wins / closed total (0..1)
//   avgWin / avgLoss  — average winner / loser $ amount
//   payoffRatio       — avgWin / |avgLoss|
//   rMultiples        — distribution of (P&L / risk) per trade
//   maxDrawdownAbs    — peak-to-trough $ in the cumulative equity
//   maxDrawdownPct    — same, but relative to the running peak
//   timeOfDayBuckets  — win-rate per UTC hour bucket
//   sharpeAnnualized  — Sharpe ratio of trade-level returns,
//                       annualized assuming 252 trading days
//
// Pure functions — no React, no I/O. The caller (the MEMORY tab,
// or a standalone PerformanceCard) is responsible for collecting
// the JournalEntry[] from localStorage and rendering whatever
// fields are non-null.

import type { JournalEntry, TradeDirection } from '@/lib/types'

const LOT_OUNCES = 100  // matches lib/journal.ts

// One closed trade reduced to the numbers analytics care about.
interface ClosedTrade {
  id: string
  direction: TradeDirection
  entry: number
  exit: number
  stop: number
  target: number
  pnl: number          // (exit - entry) × dir × 100
  rMultiple: number    // pnl / max-loss-at-stop
  closedAt: string     // ISO 8601
  session: string
}

// Output of the analytics pass. Each field is null when the
// sample is too small or the math is degenerate (e.g. profit
// factor with zero losers); the UI should hide the corresponding
// chip in those cases rather than show "0" or "Infinity".
export interface PerformanceSummary {
  totalClosed: number
  totalWins: number
  totalLosses: number
  winRate: number | null
  expectancy: number | null
  profitFactor: number | null
  avgWin: number | null
  avgLoss: number | null
  payoffRatio: number | null
  totalPnl: number
  maxDrawdownAbs: number
  maxDrawdownPct: number | null
  rMultiples: number[]                      // signed R per trade
  maxConsecutiveLosses: number
  maxConsecutiveWins: number
  // 24 buckets, hour 0..23 (UTC). Each carries count + winRate.
  // Buckets with < 3 trades report winRate=null so a single
  // outlier doesn't paint the whole hour green/red.
  timeOfDayBuckets: { hour: number; count: number; winRate: number | null }[]
  // Sharpe — null when total < 5 or stdDev is 0. Annualized.
  sharpeAnnualized: number | null
  generatedAt: string
}

// Reduce a JournalEntry to a ClosedTrade. Returns null when the
// entry isn't yet closed or any required field is missing.
function toClosedTrade(e: JournalEntry): ClosedTrade | null {
  if (typeof e.exitPrice !== 'number' || !Number.isFinite(e.exitPrice)) return null
  if (typeof e.closedAt !== 'string') return null
  const dirSign = e.direction === 'LONG' ? 1 : -1
  const pnl = (e.exitPrice - e.entry) * dirSign * LOT_OUNCES
  // Risk = abs(entry - stop) * 100 oz. R-multiple = pnl / risk.
  const riskUnit = Math.abs(e.entry - e.stop) * LOT_OUNCES
  const rMultiple = riskUnit > 0 ? pnl / riskUnit : 0
  return {
    id: e.id,
    direction: e.direction,
    entry: e.entry,
    exit: e.exitPrice,
    stop: e.stop,
    target: e.target,
    pnl,
    rMultiple,
    closedAt: e.closedAt,
    session: e.session,
  }
}

// Count consecutive same-sign streaks. Returns the longest run
// of WINS (pnl > 0) and LOSSES (pnl ≤ 0) anywhere in the series.
function streaks(trades: ClosedTrade[]): { maxWin: number; maxLoss: number } {
  let maxWin = 0
  let maxLoss = 0
  let runWin = 0
  let runLoss = 0
  for (const t of trades) {
    if (t.pnl > 0) {
      runWin++
      runLoss = 0
      if (runWin > maxWin) maxWin = runWin
    } else {
      runLoss++
      runWin = 0
      if (runLoss > maxLoss) maxLoss = runLoss
    }
  }
  return { maxWin, maxLoss }
}

// Cumulative equity curve → peak-to-trough drawdown.
// Returns the absolute $ drop and the percent drop relative to
// the running peak. Percent is null when the running peak is 0
// (cold-start case).
function drawdown(
  trades: ClosedTrade[]
): { abs: number; pct: number | null } {
  if (trades.length === 0) return { abs: 0, pct: null }
  let peak = 0
  let trough = 0
  let cumulative = 0
  let maxAbs = 0
  let maxPct = 0
  let sawPositivePeak = false
  for (const t of trades) {
    cumulative += t.pnl
    if (cumulative > peak) {
      peak = cumulative
      trough = cumulative
      if (peak > 0) sawPositivePeak = true
    }
    if (cumulative < trough) trough = cumulative
    const drop = peak - cumulative
    if (drop > maxAbs) maxAbs = drop
    if (peak > 0) {
      const pct = drop / peak
      if (pct > maxPct) maxPct = pct
    }
  }
  return {
    abs: maxAbs,
    pct: sawPositivePeak ? maxPct * 100 : null,
  }
}

// 24-bucket time-of-day histogram. Buckets with < 3 trades report
// winRate=null so a 1-of-1 hour doesn't paint as 100%.
function timeOfDay(
  trades: ClosedTrade[]
): { hour: number; count: number; winRate: number | null }[] {
  const buckets: { count: number; wins: number }[] = Array.from(
    { length: 24 },
    () => ({ count: 0, wins: 0 })
  )
  for (const t of trades) {
    const d = new Date(t.closedAt)
    const h = d.getUTCHours()
    if (h < 0 || h > 23) continue
    buckets[h].count++
    if (t.pnl > 0) buckets[h].wins++
  }
  return buckets.map((b, hour) => ({
    hour,
    count: b.count,
    winRate: b.count >= 3 ? b.wins / b.count : null,
  }))
}

// Sharpe of trade-level returns ($ pnl, treated as iid).
// Annualized via × sqrt(252) — the standard approximation when
// trades are roughly daily. Returns null when sample is too
// small or stdDev is zero.
function sharpe(trades: ClosedTrade[]): number | null {
  if (trades.length < 5) return null
  const pnls = trades.map((t) => t.pnl)
  const mean = pnls.reduce((s, p) => s + p, 0) / pnls.length
  const variance =
    pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length
  const std = Math.sqrt(variance)
  if (std === 0) return null
  return (mean / std) * Math.sqrt(252)
}

// Main entry. Reduces JournalEntry[] (open + closed) to a
// PerformanceSummary. Open entries are silently skipped.
export function computePerformance(
  entries: JournalEntry[]
): PerformanceSummary {
  const trades = entries
    .map(toClosedTrade)
    .filter((t): t is ClosedTrade => t !== null)
    // Sort by closedAt so cumulative-equity math runs in order.
    .sort((a, b) => a.closedAt.localeCompare(b.closedAt))

  const wins = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl <= 0)
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)

  const grossWin = wins.reduce((s, t) => s + t.pnl, 0)
  const grossLoss = -losses.reduce((s, t) => s + t.pnl, 0) // sign-flipped to positive

  const winRate = trades.length > 0 ? wins.length / trades.length : null
  const avgWin = wins.length > 0 ? grossWin / wins.length : null
  const avgLoss = losses.length > 0 ? -grossLoss / losses.length : null

  const payoffRatio =
    avgWin !== null && avgLoss !== null && avgLoss !== 0
      ? avgWin / Math.abs(avgLoss)
      : null

  // Expectancy — pure $ per trade. Equivalent to totalPnl/N for
  // the realized series, but expressed conceptually as
  // (winRate × avgWin) − ((1-winRate) × |avgLoss|).
  const expectancy =
    trades.length > 0 ? totalPnl / trades.length : null

  const profitFactor =
    grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? null : null

  const dd = drawdown(trades)
  const sk = streaks(trades)

  return {
    totalClosed: trades.length,
    totalWins: wins.length,
    totalLosses: losses.length,
    winRate,
    expectancy,
    profitFactor,
    avgWin,
    avgLoss,
    payoffRatio,
    totalPnl,
    maxDrawdownAbs: dd.abs,
    maxDrawdownPct: dd.pct,
    rMultiples: trades.map((t) => t.rMultiple),
    maxConsecutiveWins: sk.maxWin,
    maxConsecutiveLosses: sk.maxLoss,
    timeOfDayBuckets: timeOfDay(trades),
    sharpeAnnualized: sharpe(trades),
    generatedAt: new Date().toISOString(),
  }
}
