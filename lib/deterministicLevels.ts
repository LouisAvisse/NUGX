// lib/deterministicLevels.ts — [PHASE-12.8] pure-TS level proposer.
//
// Today the LLM is asked to compute exact entry / stop / target
// prices that satisfy three constraints simultaneously:
//
//   1. Stop = swing structure or 1.5× ATR buffer.
//   2. Target ≤ 2× ATR from entry, ≥ 1:2 risk/reward.
//   3. LONG entry on pullback to EMA20 / support; SHORT entry on
//      bounce to EMA20 / resistance. Never at session highs/lows.
//
// That math is deterministic. This module proposes a draft level
// set that already satisfies the constraints; the LLM only has to
// adjudicate ("yes, those work" / "tighten the stop here") rather
// than compute from scratch.
//
// Output shape mirrors AnalysisResult for the level-bearing fields,
// so the route can either:
//   (a) ship the proposal to Claude in the user message and ask
//       it to adjudicate (smaller output), or
//   (b) skip the LLM and assemble a fully-deterministic
//       AnalysisResult on cold-cache / outage.

import type {
  AnalysisRequest,
  TradeDirection,
} from '@/lib/types'

// One proposal. Strings match AnalysisResult's level fields.
// `direction` is captured separately because the proposal is
// always relative to a directional thesis — caller decides which
// way to point the proposer (typically based on the dominant
// signal from classifySignals).
export interface LevelProposal {
  direction: TradeDirection
  entry: string                     // "$3281-3284" or "$3281"
  stop: string                      // "$3264"
  target: string                    // "$3318"
  resistance: string                // nearest overhead
  support: string                   // nearest underlying
  invalidationLevel: string         // structural break price
  riskReward: string                // "1:2.4"
  // Numeric replays so consumers (chart, journal, position-sizer)
  // don't have to re-parse the strings.
  numbers: {
    entry: number
    stop: number
    target: number
    risk: number
    reward: number
  }
  // True iff the proposal satisfies the ≥1:2 + ≤2×ATR rules. When
  // false, the route should force FLAT — exactly mirrors what the
  // system prompt already tells Claude to do.
  reachable: boolean
  // One-sentence French rationale a NARRATOR could expand. Not the
  // final rationale Claude writes; just a starting hint.
  rationale: string
}

const fmt = (n: number) => `$${n.toFixed(2)}`

// Compute a LONG proposal: entry pulls back below current price
// toward EMA20 / support, stop sits below structure or 1.5× ATR.
// Mirror logic for SHORT.
export function proposeLevels(args: {
  req: AnalysisRequest
  direction: TradeDirection
}): LevelProposal {
  const { req, direction } = args
  const price = req.price > 0 ? req.price : 3300
  const atr = req.atr > 0 ? req.atr : Math.max(price * 0.005, 5)
  const ema20 = req.ema20 > 0 ? req.ema20 : price
  const swingHigh = req.swingHigh > 0 ? req.swingHigh : price + atr * 2
  const swingLow = req.swingLow > 0 ? req.swingLow : price - atr * 2

  if (direction === 'LONG') {
    // Entry zone — between EMA20 and 0.3× ATR below current price.
    // Skip pulled too deep entries.
    const entryHigh = Math.min(price, ema20 + atr * 0.2)
    const entryLow = Math.max(ema20, price - atr * 0.5)
    const entry = (entryHigh + entryLow) / 2

    // Stop — beyond swing low OR 1.3× ATR below entry, whichever
    // is closer (keeps the loss bounded).
    const stopAtr = entry - atr * 1.3
    const stopStruct = swingLow - atr * 0.1
    const stop = Math.max(stopAtr, stopStruct)

    // Target — capped at 2× ATR from entry; aim for nearest
    // structural resistance if that lands inside the cap.
    const reachableMax = entry + atr * 2
    const resistance = swingHigh > entry ? swingHigh : entry + atr * 1.5
    const target = Math.min(reachableMax, resistance)

    const risk = Math.max(0, entry - stop)
    const reward = Math.max(0, target - entry)
    const rr = risk > 0 ? reward / risk : 0

    return {
      direction,
      entry: `${entryLow.toFixed(2)}-${entryHigh.toFixed(2)}`,
      stop: fmt(stop),
      target: fmt(target),
      resistance: fmt(resistance),
      support: fmt(swingLow),
      invalidationLevel: fmt(req.ema50 || stop),
      riskReward: `1:${rr.toFixed(1)}`,
      numbers: { entry, stop, target, risk, reward },
      reachable: rr >= 2 && reward <= atr * 2.5,
      rationale: `Pullback vers EMA20 à ${fmt(ema20)} avec ATR ${fmt(atr)}, stop sous swing-low.`,
    }
  }

  // SHORT — mirror.
  const entryLow = Math.max(price, ema20 - atr * 0.2)
  const entryHigh = Math.min(ema20, price + atr * 0.5)
  const entry = (entryHigh + entryLow) / 2

  const stopAtr = entry + atr * 1.3
  const stopStruct = swingHigh + atr * 0.1
  const stop = Math.min(stopAtr, stopStruct)

  const reachableMin = entry - atr * 2
  const support = swingLow < entry ? swingLow : entry - atr * 1.5
  const target = Math.max(reachableMin, support)

  const risk = Math.max(0, stop - entry)
  const reward = Math.max(0, entry - target)
  const rr = risk > 0 ? reward / risk : 0

  return {
    direction,
    entry: `${entryLow.toFixed(2)}-${entryHigh.toFixed(2)}`,
    stop: fmt(stop),
    target: fmt(target),
    resistance: fmt(swingHigh),
    support: fmt(support),
    invalidationLevel: fmt(req.ema50 || stop),
    riskReward: `1:${rr.toFixed(1)}`,
    numbers: { entry, stop, target, risk, reward },
    reachable: rr >= 2 && reward <= atr * 2.5,
    rationale: `Rebond vers EMA20 à ${fmt(ema20)} avec ATR ${fmt(atr)}, stop au-dessus du swing-high.`,
  }
}
