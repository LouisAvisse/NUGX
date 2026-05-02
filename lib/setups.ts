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
