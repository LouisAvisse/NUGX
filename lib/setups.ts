// lib/setups.ts — [PHASE-2] named setup detection.
//
// Generic confluence ("5 of 8 signals BULLISH → LONG") works for
// average market conditions but misses the high-edge setups
// experienced traders actually wait for. A single-named setup
// carries far more information than a confluence count: it
// implies an entry rule, a stop placement convention, and a
// historical baseline for win rate.
//
// Phase 2 ships DETECTION only — when a snapshot matches one of
// the six named setups we surface the name as a chip on the
// analysis card and record it on the AnalysisHistoryRecord so
// future phases (rehearsal, calibration loop) can compute
// per-setup statistics. Phase 4 will extend this to override
// entry/stop/target with setup-specific templates.
//
// Detection runs server-side in /api/analyze before the Anthropic
// call. The result feeds back into Claude's prompt as a hint
// (so the rationale references the named setup) and into the
// response payload as `detectedSetup`.

import type { AnalysisRequest, SetupName } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────
// Each detector returns a confidence score 0-1 (how strongly the
// snapshot matches the setup) plus a one-line French rationale
// that the UI can show in the chip's tooltip. We pick the
// highest-scoring setup above a threshold; ties are broken by
// the order in DETECTORS (more specific setups first).
//
// A score of 0 means "doesn't match"; the threshold below
// (MIN_CONFIDENCE) decides how confident we need to be before
// surfacing the chip.
// ─────────────────────────────────────────────────────────────────
export interface SetupMatch {
  name: SetupName
  confidence: number
  rationale: string
}

const MIN_CONFIDENCE = 0.6

// London false break — first 30 minutes of London (07:00-07:30
// UTC) where price commonly spikes one direction then reverses.
// Detector fires when we're in that window AND the 15M trend
// disagrees with the 1H — the early reversal signature.
function detectLondonFalseBreak(req: AnalysisRequest): SetupMatch | null {
  if (req.session !== 'London') return null
  const utcHour = new Date().getUTCHours()
  const utcMinute = new Date().getUTCMinutes()
  const inWindow = utcHour === 7 && utcMinute < 30
  if (!inWindow) return null
  const tfDisagree = req.tf15m.trend !== req.trend && req.tf15m.trend !== 'RANGING'
  return {
    name: 'LONDON_FALSE_BREAK',
    confidence: tfDisagree ? 0.85 : 0.65,
    rationale:
      "Première demi-heure de Londres — pic directionnel typique avant inversion. Attendre la confirmation après 07:30 UTC.",
  }
}

// London continuation — established trend on 4H, confirming on
// 1H, in the bulk of the London session (07:30-12:00 UTC). The
// classic "trend started in Asia, continues through London"
// playbook.
//
// [PHASE-11.1 finding] 50-day backtest (March 14 → May 3 2026)
// showed this setup at 29% accuracy / -0.14R per trade across
// 103 trades — systematic negative expectancy in chop regimes.
// I tested suppressing the chip but the result was WORSE: the
// chip's existence was acting as a soft warning the trader could
// use via the what-if explorer to avoid these setups. Hiding it
// removed information. Detector kept intact; future work should
// flip the chip palette to RED when historical accuracy < 40%
// (turn it from "high confidence" into "documented anti-edge").
function detectLondonContinuation(req: AnalysisRequest): SetupMatch | null {
  if (req.session !== 'London') return null
  const utcHour = new Date().getUTCHours()
  const utcMinute = new Date().getUTCMinutes()
  if (utcHour === 7 && utcMinute < 30) return null   // false-break window
  const tfAligned =
    req.tf4h.trend === req.trend &&
    req.trend !== 'RANGING' &&
    req.tf15m.trend !== 'RANGING'
  if (!tfAligned) return null
  return {
    name: 'LONDON_CONTINUATION',
    confidence: 0.8,
    rationale:
      "Tendance alignée 4H/1H/15M en pleine session de Londres — setup de continuation à haute probabilité.",
  }
}

// NY/London overlap trend — peak liquidity window with a clear
// direction. Best session for full-size positions when
// clearToTrade is true.
//
// [PHASE-11.1 finding] 50-day backtest showed this setup at 27%
// accuracy / -0.20R per trade across 88 trades — the worst
// expectancy of any named setup in the test window. Same chop-
// regime issue as LONDON_CONTINUATION (see comment there). Chip
// kept active because suppressing it actually hurt overall
// expectancy by removing the soft-warning signal. Future work:
// drive chip color from historical per-setup accuracy.
function detectNyOverlapTrend(req: AnalysisRequest): SetupMatch | null {
  if (req.session !== 'NY/London Overlap') return null
  if (!req.clearToTrade) return null
  if (req.trend === 'RANGING') return null
  const tfBacks = req.tf4h.trend === req.trend
  return {
    name: 'NY_OVERLAP_TREND',
    confidence: tfBacks ? 0.88 : 0.7,
    rationale:
      "Overlap NY/Londres — liquidité maximale et tendance établie. Position pleine recommandée si clearToTrade.",
  }
}

// FOMC fade — high-impact event recently passed, news sentiment
// has flipped vs the day's trend. Signature: clearToTrade is
// true (event over) AND nextEventMinutes is null OR > 90 (no
// imminent risk) AND news bullish/bearish counts disagree with
// the price trend direction.
function detectFomcFade(req: AnalysisRequest): SetupMatch | null {
  if (!req.clearToTrade) return null
  if (req.nextEventMinutes !== null && req.nextEventMinutes < 90) return null
  // Recent high-impact event mention via warningMessage. The
  // /api/calendar route emits a warning string when an event
  // just passed. Without that, we can't reliably distinguish a
  // fade from any random reversal — bail.
  const recentEvent =
    req.warningMessage !== null &&
    /fomc|cpi|nfp|rate/i.test(req.warningMessage)
  if (!recentEvent) return null
  const newsBullish = req.newsBullishCount > req.newsBearishCount
  const priceUp = req.changePct > 0
  const fade = newsBullish !== priceUp
  if (!fade) return null
  return {
    name: 'FOMC_FADE',
    confidence: 0.75,
    rationale:
      "Événement majeur récent — sentiment news inverse à l'action prix. Setup de fade post-événement.",
  }
}

// Asian range breakout — Tokyo session typically consolidates;
// a break of the daily range with momentum gives the first
// directional setup of the day. Signature: Tokyo session, ATR
// < 10 (tight range), MACD cross fresh.
function detectAsianRangeBreakout(req: AnalysisRequest): SetupMatch | null {
  if (req.session !== 'Tokyo') return null
  if (req.atr >= 10) return null   // range must be tight
  const macdFresh =
    req.macdCross === 'BULLISH_CROSS' || req.macdCross === 'BEARISH_CROSS'
  if (!macdFresh) return null
  return {
    name: 'ASIAN_RANGE_BREAKOUT',
    confidence: 0.7,
    rationale:
      "Range serré sur Tokyo + croisement MACD frais — premier breakout directionnel de la journée.",
  }
}

// EMA20 pullback — generic continuation pattern that fires in
// any session when price pulls back to EMA20 with the trend
// still intact. Lower confidence than session-specific setups
// but the most common.
function detectEma20Pullback(req: AnalysisRequest): SetupMatch | null {
  if (req.trend === 'RANGING') return null
  const distance = Math.abs(req.price - req.ema20)
  const close = distance < req.atr * 0.3
  if (!close) return null
  const trendIntact =
    (req.trend === 'UPTREND' &&
      req.priceVsEma50 === 'ABOVE' &&
      req.rsi > 40 &&
      req.rsi < 65) ||
    (req.trend === 'DOWNTREND' &&
      req.priceVsEma50 === 'BELOW' &&
      req.rsi < 60 &&
      req.rsi > 35)
  if (!trendIntact) return null
  return {
    name: 'EMA20_PULLBACK',
    confidence: 0.7,
    rationale:
      "Prix en retest de l'EMA20 avec tendance intacte et RSI dans la zone neutre — entrée de continuation classique.",
  }
}

// Order matters — more specific setups checked first so they
// win over the generic EMA20_PULLBACK on ties.
const DETECTORS: Array<(req: AnalysisRequest) => SetupMatch | null> = [
  detectLondonFalseBreak,
  detectLondonContinuation,
  detectNyOverlapTrend,
  detectFomcFade,
  detectAsianRangeBreakout,
  detectEma20Pullback,
]

// ─────────────────────────────────────────────────────────────────
// Public — pick the best-matching setup, or null if no detector
// scored above MIN_CONFIDENCE.
// ─────────────────────────────────────────────────────────────────
export function detectSetup(req: AnalysisRequest): SetupMatch | null {
  let best: SetupMatch | null = null
  for (const detector of DETECTORS) {
    const match = detector(req)
    if (!match) continue
    if (match.confidence < MIN_CONFIDENCE) continue
    if (!best || match.confidence > best.confidence) {
      best = match
    }
  }
  return best
}

// French display name for the chip. Centralised here so
// translations don't drift between the chip and tooltips.
export function displaySetupName(name: SetupName): string {
  switch (name) {
    case 'LONDON_FALSE_BREAK':
      return 'FAUX-BREAK LONDRES'
    case 'LONDON_CONTINUATION':
      return 'CONTINUATION LONDRES'
    case 'NY_OVERLAP_TREND':
      return 'TENDANCE NY/LDN'
    case 'FOMC_FADE':
      return 'FADE POST-FOMC'
    case 'ASIAN_RANGE_BREAKOUT':
      return 'BREAKOUT ASIE'
    case 'EMA20_PULLBACK':
      return 'PULLBACK EMA20'
  }
}

// [PHASE-11.2] Per-setup historical accuracy stats.
//
// Phase 11.1 backtests showed two of the named setups
// (LONDON_CONTINUATION, NY_OVERLAP_TREND) carrying negative
// expectancy in this market regime. Phase 11.1's first attempt
// — suppressing those chips — actually hurt overall edge by
// hiding information the trader was using. The right fix is to
// invert the framing: keep the chip visible, but color it
// according to the trader's OWN historical accuracy on that
// setup. A green chip means "your data says this setup wins";
// red means "your data says this setup loses, fade or skip";
// amber/blue means "not enough data yet to know".
//
// Pure read over getHistory(). Excludes legacyOutcome records
// (pre-Phase-1 false positives) and OPEN/INCONCLUSIVE outcomes.
// Returns null accuracy when fewer than MIN_SAMPLES decided —
// same convention as Phase 6 rehearsal so a tiny sample never
// drives the chip color.
const SETUP_ACCURACY_MIN_SAMPLES = 5

export interface SetupAccuracy {
  setup: SetupName
  decided: number
  wins: number
  losses: number
  accuracy: number | null      // 0..100, null when decided < MIN_SAMPLES
}

export function computeSetupAccuracy(
  setup: SetupName,
  records: import('@/lib/types').AnalysisHistoryRecord[]
): SetupAccuracy {
  const matching = records.filter(
    (r) =>
      r.detectedSetup === setup &&
      !r.legacyOutcome &&
      (r.hitOutcome === 'HIT_TARGET' || r.hitOutcome === 'HIT_STOP')
  )
  const wins = matching.filter((r) => r.hitOutcome === 'HIT_TARGET').length
  const losses = matching.filter((r) => r.hitOutcome === 'HIT_STOP').length
  const decided = wins + losses
  const accuracy =
    decided >= SETUP_ACCURACY_MIN_SAMPLES
      ? Math.round((wins / decided) * 100)
      : null
  return { setup, decided, wins, losses, accuracy }
}

// Chip palette for one setup, derived from its historical
// accuracy. Three bands map to the existing app palette:
//   GREEN   (≥ 55%)  — historical winner; trade with conviction
//   AMBER   (40–55%) — coin flip; rely on other signals
//   RED     (< 40%)  — anti-edge; setup tends to fail in your tape
// When accuracy is null (sample < MIN_SAMPLES), keep the
// pre-Phase-11.2 blue chip — no data yet to override the default.
export type SetupChipTone = 'NEUTRAL' | 'WIN' | 'MIXED' | 'LOSE'

export function setupChipTone(stats: SetupAccuracy): SetupChipTone {
  if (stats.accuracy === null) return 'NEUTRAL'
  if (stats.accuracy >= 55) return 'WIN'
  if (stats.accuracy >= 40) return 'MIXED'
  return 'LOSE'
}

// CSS palette for each tone. Mirrors the bull/bear/amber/info
// palette established by NewsFeed impact badges and AnalysisPanel
// confluence colours so the chip reads in the same visual
// language as the rest of the dashboard.
export const SETUP_CHIP_PALETTE: Record<
  SetupChipTone,
  { color: string; background: string; border: string }
> = {
  NEUTRAL: { color: '#60a5fa', background: '#0a1420', border: '1px solid #1a2a3a' },
  WIN:     { color: '#4ade80', background: '#0a1a0a', border: '1px solid #1a3a1a' },
  MIXED:   { color: '#fbbf24', background: '#1a1500', border: '1px solid #3a2e00' },
  LOSE:    { color: '#f87171', background: '#1a0a0a', border: '1px solid #3a1a1a' },
}
