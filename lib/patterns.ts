// lib/patterns.ts — server-side candlestick + structure pattern
// detection. Reads ChartCandle[] for a given timeframe and returns
// any patterns observed in the last few candles.
//
// All detection is intentionally simple and deterministic — these
// rules are documented in the [SPRINT-2] spec, not learned. The
// goal is to surface the same trader-visible patterns that show
// up on the chart so the analyze prompt can cite them.
//
// SERVER-SIDE ONLY. Imported by /api/technicals/route.ts. No
// runtime cost worth caching — patterns are recomputed each fetch
// (every ~60s on the 1H endpoint).

import type {
  ChartCandle,
  DetectedPattern,
  PatternName,
  PatternDirection,
  PatternSignificance,
  Timeframe,
} from '@/lib/types'

// We only care about patterns on the very recent candles. Older
// patterns have already played out — surfacing them would be noise.
const RECENT_CANDLES = 3

// Sliding window for structure patterns (HH/HL, double top/bottom).
const STRUCTURE_LOOKBACK = 20

// HH/HL needs at least 6 candles to call a sequence "stair-step".
const STAIRSTEP_LENGTH = 6

// Two swing lows / highs are considered "the same level" for
// double-top/bottom purposes if within this percentage of each
// other. 0.3% for gold (~$10 on a $3300 price).
const DOUBLE_TOLERANCE_PCT = 0.3

// One detection input — collapses the per-pattern rule plumbing.
interface DetectArgs {
  candles: ChartCandle[]
  timeframe: Timeframe
  detectedAt: string
}

// Body / wick decomposition for a single candle. All values in USD.
interface CandleParts {
  bodySize: number       // |close - open|
  upperWick: number      // high - max(open, close)
  lowerWick: number      // min(open, close) - low
  totalRange: number     // high - low
  isBullish: boolean     // close > open
  isBearish: boolean     // close < open
}

// Decompose a candle into parts used by the rules below. Defensive
// against zero-range "doji-flat" candles by clamping bodySize and
// totalRange to non-negative.
function decompose(c: ChartCandle): CandleParts {
  const bodySize = Math.abs(c.close - c.open)
  const upperWick = Math.max(0, c.high - Math.max(c.open, c.close))
  const lowerWick = Math.max(0, Math.min(c.open, c.close) - c.low)
  const totalRange = Math.max(0, c.high - c.low)
  return {
    bodySize,
    upperWick,
    lowerWick,
    totalRange,
    isBullish: c.close > c.open,
    isBearish: c.close < c.open,
  }
}

// Build a DetectedPattern with consistent fields. The `description`
// is human-readable copy that flows into tooltips and the analyze
// user message; keep it concise and trader-vocabulary.
function makePattern(
  name: PatternName,
  direction: PatternDirection,
  significance: PatternSignificance,
  description: string,
  args: DetectArgs
): DetectedPattern {
  return {
    pattern: name,
    timeframe: args.timeframe,
    direction,
    significance,
    description,
    detectedAt: args.detectedAt,
  }
}

// ─── Single-candle patterns ──────────────────────────────────────

// Hammer: bullish reversal off a downtrend. Long lower wick (>= 2x
// body), tiny upper wick (<= 0.1x body), body in upper 30% of the
// range. Signals buyers stepped in after a sell-off intra-candle.
function detectHammer(c: ChartCandle): boolean {
  const p = decompose(c)
  if (!p.isBullish) return false
  if (p.bodySize === 0) return false
  if (p.lowerWick < 2 * p.bodySize) return false
  if (p.upperWick > 0.1 * p.bodySize) return false
  // Body sits in upper 30% — bottom of body is at >= 70% of range.
  const bodyBottomPct = (Math.min(c.open, c.close) - c.low) / p.totalRange
  return bodyBottomPct >= 0.7
}

// Shooting star: mirror of hammer. Bearish reversal at top of a
// rally. Long upper wick, tiny lower wick, body in lower 30%.
function detectShootingStar(c: ChartCandle): boolean {
  const p = decompose(c)
  if (!p.isBearish) return false
  if (p.bodySize === 0) return false
  if (p.upperWick < 2 * p.bodySize) return false
  if (p.lowerWick > 0.1 * p.bodySize) return false
  const bodyTopPct = (Math.max(c.open, c.close) - c.low) / p.totalRange
  return bodyTopPct <= 0.3
}

// Doji: indecision. Body is <= 10% of total range. Direction is
// neutral — the breakout direction follows.
function detectDoji(c: ChartCandle): boolean {
  const p = decompose(c)
  if (p.totalRange === 0) return false
  return p.bodySize / p.totalRange <= 0.1
}

// Marubozu: strong conviction. Almost no wicks (<5% of body each
// side). Bullish or bearish based on direction.
function detectMarubozu(c: ChartCandle): 'BULLISH' | 'BEARISH' | null {
  const p = decompose(c)
  if (p.bodySize === 0) return null
  if (p.upperWick > 0.05 * p.bodySize) return null
  if (p.lowerWick > 0.05 * p.bodySize) return null
  if (p.isBullish) return 'BULLISH'
  if (p.isBearish) return 'BEARISH'
  return null
}

// ─── Two-candle patterns ─────────────────────────────────────────

// Bullish engulfing: prior bear candle, current bull candle, current
// body fully wraps prior body. Strong reversal at lows.
function detectBullishEngulfing(prev: ChartCandle, curr: ChartCandle): boolean {
  const pp = decompose(prev)
  const cp = decompose(curr)
  if (!pp.isBearish || !cp.isBullish) return false
  // Body engulfment, not full wick — open below prior close, close
  // above prior open.
  return curr.open <= prev.close && curr.close >= prev.open
}

// Bearish engulfing: mirror of bullish.
function detectBearishEngulfing(prev: ChartCandle, curr: ChartCandle): boolean {
  const pp = decompose(prev)
  const cp = decompose(curr)
  if (!pp.isBullish || !cp.isBearish) return false
  return curr.open >= prev.close && curr.close <= prev.open
}

// Inside bar: current candle's high/low fully inside prior. Marks
// compression — breakout direction follows. Direction is neutral.
function detectInsideBar(prev: ChartCandle, curr: ChartCandle): boolean {
  return curr.high < prev.high && curr.low > prev.low
}

// ─── Structure patterns (multi-candle) ───────────────────────────

// Higher highs + higher lows over the last N candles. Strong bull
// trend continuation. Each successive candle's high is strictly
// higher than the previous, AND each successive low is strictly
// higher than the previous.
function detectHigherHighsHigherLows(window: ChartCandle[]): boolean {
  if (window.length < STAIRSTEP_LENGTH) return false
  const slice = window.slice(-STAIRSTEP_LENGTH)
  for (let i = 1; i < slice.length; i++) {
    if (slice[i].high <= slice[i - 1].high) return false
    if (slice[i].low <= slice[i - 1].low) return false
  }
  return true
}

// Mirror — strict lower highs + lower lows.
function detectLowerHighsLowerLows(window: ChartCandle[]): boolean {
  if (window.length < STAIRSTEP_LENGTH) return false
  const slice = window.slice(-STAIRSTEP_LENGTH)
  for (let i = 1; i < slice.length; i++) {
    if (slice[i].high >= slice[i - 1].high) return false
    if (slice[i].low >= slice[i - 1].low) return false
  }
  return true
}

// Double-bottom forming: two recent swing lows within tolerance,
// with a higher swing between them, and the most recent price
// trending back up off the second low. Signals an exhaustion of
// sellers at a level.
function detectDoubleBottomForming(window: ChartCandle[]): boolean {
  if (window.length < 10) return false
  const slice = window.slice(-STRUCTURE_LOOKBACK)
  // Find the two lowest lows in the slice and require them to be
  // separated by at least 3 candles, with a higher pivot between
  // them. Simple version: take the 2 lowest, check separation.
  const indexed = slice.map((c, i) => ({ low: c.low, i }))
  indexed.sort((a, b) => a.low - b.low)
  const [first, second] = indexed
  if (!first || !second) return false
  if (Math.abs(first.i - second.i) < 3) return false
  // Lows must be within tolerance of each other.
  const pctDiff = Math.abs(first.low - second.low) / Math.max(first.low, 1) * 100
  if (pctDiff > DOUBLE_TOLERANCE_PCT) return false
  // Higher peak between them.
  const lo = Math.min(first.i, second.i)
  const hi = Math.max(first.i, second.i)
  const between = slice.slice(lo + 1, hi)
  const maxBetween = Math.max(...between.map((c) => c.high))
  if (maxBetween <= Math.max(first.low, second.low) * 1.001) return false
  // Latest candle must be the second low or after, AND moving up.
  const latestIdx = slice.length - 1
  if (latestIdx < hi) return false
  const latest = slice[latestIdx]
  return latest.close > slice[hi].low
}

// Mirror — double top forming.
function detectDoubleTopForming(window: ChartCandle[]): boolean {
  if (window.length < 10) return false
  const slice = window.slice(-STRUCTURE_LOOKBACK)
  const indexed = slice.map((c, i) => ({ high: c.high, i }))
  indexed.sort((a, b) => b.high - a.high)
  const [first, second] = indexed
  if (!first || !second) return false
  if (Math.abs(first.i - second.i) < 3) return false
  const pctDiff = Math.abs(first.high - second.high) / Math.max(first.high, 1) * 100
  if (pctDiff > DOUBLE_TOLERANCE_PCT) return false
  const lo = Math.min(first.i, second.i)
  const hi = Math.max(first.i, second.i)
  const between = slice.slice(lo + 1, hi)
  const minBetween = Math.min(...between.map((c) => c.low))
  if (minBetween >= Math.min(first.high, second.high) * 0.999) return false
  const latestIdx = slice.length - 1
  if (latestIdx < hi) return false
  const latest = slice[latestIdx]
  return latest.close < slice[hi].high
}

// ─── Public entry point ──────────────────────────────────────────

// Run every detector and return any patterns observed in the last
// RECENT_CANDLES. Single-candle and two-candle patterns are checked
// per-candle in that recent window; structure patterns are checked
// once over the larger lookback.
export function detectPatterns(args: DetectArgs): DetectedPattern[] {
  const { candles } = args
  if (candles.length < 2) return []

  const out: DetectedPattern[] = []

  // Single-candle + two-candle patterns over the last RECENT_CANDLES.
  // Walk forward so the most recent pattern (if any) is reported last.
  const startIdx = Math.max(1, candles.length - RECENT_CANDLES)
  for (let i = startIdx; i < candles.length; i++) {
    const curr = candles[i]
    const prev = candles[i - 1]

    if (detectHammer(curr)) {
      out.push(makePattern('HAMMER', 'BULLISH', 'HIGH',
        `Hammer on ${args.timeframe} — long lower wick rejection, bullish reversal candle`, args))
    }
    if (detectShootingStar(curr)) {
      out.push(makePattern('SHOOTING_STAR', 'BEARISH', 'HIGH',
        `Shooting star on ${args.timeframe} — long upper wick rejection, bearish reversal`, args))
    }
    if (detectDoji(curr)) {
      out.push(makePattern('DOJI', 'NEUTRAL', 'MEDIUM',
        `Doji on ${args.timeframe} — indecision, breakout direction pending`, args))
    }
    const marubozu = detectMarubozu(curr)
    if (marubozu === 'BULLISH') {
      out.push(makePattern('BULLISH_MARUBOZU', 'BULLISH', 'MEDIUM',
        `Bullish marubozu on ${args.timeframe} — strong conviction buy candle`, args))
    } else if (marubozu === 'BEARISH') {
      out.push(makePattern('BEARISH_MARUBOZU', 'BEARISH', 'MEDIUM',
        `Bearish marubozu on ${args.timeframe} — strong conviction sell candle`, args))
    }

    if (detectBullishEngulfing(prev, curr)) {
      out.push(makePattern('BULLISH_ENGULFING', 'BULLISH', 'HIGH',
        `Bullish engulfing on ${args.timeframe} — strong reversal candle, body fully wraps prior`, args))
    }
    if (detectBearishEngulfing(prev, curr)) {
      out.push(makePattern('BEARISH_ENGULFING', 'BEARISH', 'HIGH',
        `Bearish engulfing on ${args.timeframe} — strong reversal candle, body fully wraps prior`, args))
    }
    if (detectInsideBar(prev, curr)) {
      out.push(makePattern('INSIDE_BAR', 'NEUTRAL', 'MEDIUM',
        `Inside bar on ${args.timeframe} — compression, breakout pending`, args))
    }
  }

  // Structure patterns scan the larger window once.
  if (detectHigherHighsHigherLows(candles)) {
    out.push(makePattern('HIGHER_HIGH_HIGHER_LOW', 'BULLISH', 'HIGH',
      `Stair-step uptrend on ${args.timeframe} — ${STAIRSTEP_LENGTH} consecutive higher highs and higher lows`, args))
  }
  if (detectLowerHighsLowerLows(candles)) {
    out.push(makePattern('LOWER_HIGH_LOWER_LOW', 'BEARISH', 'HIGH',
      `Stair-step downtrend on ${args.timeframe} — ${STAIRSTEP_LENGTH} consecutive lower highs and lower lows`, args))
  }
  if (detectDoubleBottomForming(candles)) {
    out.push(makePattern('DOUBLE_BOTTOM_FORMING', 'BULLISH', 'HIGH',
      `Double bottom forming on ${args.timeframe} — twin lows holding, bullish reversal candidate`, args))
  }
  if (detectDoubleTopForming(candles)) {
    out.push(makePattern('DOUBLE_TOP_FORMING', 'BEARISH', 'HIGH',
      `Double top forming on ${args.timeframe} — twin highs capping, bearish reversal candidate`, args))
  }

  return out
}

// Deduplicate detected patterns across timeframes. When the same
// PatternName fires on multiple TFs we only keep the highest one
// (4H > 1H > 15M) so the chart and prompt aren't cluttered with
// the same signal three times. The kept entry's description is
// rewritten to note multi-TF confirmation.
const TF_PRIORITY: Record<Timeframe, number> = { '4H': 3, '1H': 2, '15M': 1 }

export function dedupePatterns(all: DetectedPattern[]): DetectedPattern[] {
  // Group by PatternName, pick the highest-priority TF per group.
  const byName = new Map<PatternName, DetectedPattern[]>()
  for (const p of all) {
    const list = byName.get(p.pattern) ?? []
    list.push(p)
    byName.set(p.pattern, list)
  }
  const out: DetectedPattern[] = []
  for (const [, list] of byName) {
    list.sort((a, b) => TF_PRIORITY[b.timeframe] - TF_PRIORITY[a.timeframe])
    const top = list[0]
    if (list.length > 1) {
      const otherTfs = list.slice(1).map((p) => p.timeframe).join(', ')
      out.push({
        ...top,
        description: `${top.description} (also confirmed on ${otherTfs})`,
      })
    } else {
      out.push(top)
    }
  }
  return out
}
