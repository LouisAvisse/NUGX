// lib/copy.ts — single source of truth for visible UI copy.
//
// The dashboard renders raw AnalysisResult enum values (BULLISH /
// BEARISH / NEUTRAL / HIGH / MEDIUM / LOW) and other trader
// vocabulary directly from the type system. That's fine for
// trader-universal tokens (LONG / SHORT / FLAT, MACD, RSI, EMA),
// but it leaks English into a French-localized panel for the
// less-universal labels (BULLISH, HIGH confidence, MIXED flow,
// etc.).
//
// The audit's F-82 finding consolidates these leaks; this file
// is the centralization. Components import the display helpers
// instead of switching on the enum themselves.
//
// Conventions:
//   - Keep enum values in lib/types.ts in their canonical English
//     form (BULLISH/HIGH/etc). Cards / API / localStorage / Claude
//     all read those raw forms — translation happens at render.
//   - Trader-universal tokens stay English everywhere
//     (LONG/SHORT/FLAT, MACD, RSI, ATR, EMA20, swingHigh, ticker
//     symbols). French-translating those would HURT readability
//     for the audience.
//   - When in doubt, translate the noun-phrase label
//     ("CALIBRATION" → keep, "outcomes" → "résultats") but keep
//     the technical token ("MACD bullish cross" → cross stays).

import type {
  Bias,
  Confidence,
  EntryType,
  MarketCondition,
} from '@/lib/types'

// ─────────────────────────────────────────────────────────────────
// Bias / Confidence — visible in the COPILOT card header,
// calibration badges, news flow, and 8-signal grid.
// ─────────────────────────────────────────────────────────────────

// Long form for the bias badge in the recommendation block
// (BULLISH → HAUSSIER). Used wherever the badge has room.
export function displayBias(b: Bias): string {
  if (b === 'BULLISH') return 'HAUSSIER'
  if (b === 'BEARISH') return 'BAISSIER'
  return 'NEUTRE'
}

// Short form for the 8-signal grid where horizontal space is
// tight (BULL/BEAR/NEUT). Symmetric in length so the dot grid
// stays aligned.
export function displaySignalShort(b: Bias): string {
  if (b === 'BULLISH') return 'HAUS'
  if (b === 'BEARISH') return 'BAIS'
  return 'NEUT'
}

// Confidence label — used in the COPILOT header line and the
// calibration card row badges.
export function displayConfidence(c: Confidence): string {
  if (c === 'HIGH') return 'HAUTE'
  if (c === 'MEDIUM') return 'MOYENNE'
  return 'BASSE'
}

// ─────────────────────────────────────────────────────────────────
// Trend / Market Condition — used by chart alignment chips and
// the COPILOT market-condition badge.
// ─────────────────────────────────────────────────────────────────

// Compact 5-char form used by the chart's alignment strip (4H /
// 1H / 15M chips). Keeps the strip readable at 8px.
export function displayTrendShort(trend: string): string {
  if (trend === 'UPTREND') return 'HAUS'
  if (trend === 'DOWNTREND') return 'BAIS'
  return 'RANGE'
}

// Long-form market-condition label used in the COPILOT badge.
// Mirrors the existing marketConditionDisplay() inline in
// AnalysisPanel; centralised here for consistency.
export function displayMarketCondition(c: MarketCondition): string {
  if (c === 'TRENDING_UP') return '▲ TENDANCE'
  if (c === 'TRENDING_DOWN') return '▼ TENDANCE'
  if (c === 'BREAKOUT_WATCH') return '◎ BREAKOUT'
  return '◆ RANGE'
}

// Entry-type display string for the AGGRESSIVE / IDEAL / WAIT
// badge under the recommendation. Matches the existing copy in
// AnalysisPanel; kept here so future localizations land in one
// file.
export function displayEntryType(t: EntryType): string {
  if (t === 'IDEAL') return '● ENTRÉE IDÉALE'
  if (t === 'AGGRESSIVE') return '◐ ENTRÉE AGRESSIVE'
  return '○ ATTENDRE SETUP'
}

// ─────────────────────────────────────────────────────────────────
// Session display — translates the SessionName "Off-hours" to a
// French label. Other session names stay in their canonical form
// (Tokyo / London / NY/London Overlap / New York are
// trader-universal proper nouns). The rest of the app reads
// session.name in its enum form for routing logic; this helper
// only affects display.
// ─────────────────────────────────────────────────────────────────

export function displaySession(name: string): string {
  if (name === 'Off-hours') return 'Hors-session'
  return name
}

// ─────────────────────────────────────────────────────────────────
// Flat string map for misc visible copy. Pulled out of components
// so the audit's F-82 list can collapse to a single search.
// ─────────────────────────────────────────────────────────────────

export const T = {
  // PriceBar
  unavailable: 'INDISPONIBLE',

  // NewsFeed flow verdict
  flowBullish: 'FLUX HAUSSIER',
  flowBearish: 'FLUX BAISSIER',
  flowMixed: 'MITIGÉ',

  // Chart legend / alignment
  chartEntry: 'ENTR.',
  chartStop: 'STOP',
  chartTarget: 'OBJ.',
  chartUpdating: 'MAJ…',
  chartAligned: '● ALIGNÉ',
  chartPatternsSingular: 'MOTIF',
  chartPatternsPlural: 'MOTIFS',

  // Calibration card
  calibrationOutcomes: 'résultats',
  calibrationOutcomesNeeded: 'résultats nécessaires',
  calibrationInsightAllNull: 'Plus de données nécessaires par niveau de confiance.',
  calibrationInsightHighLow:
    "⚠ Précision système sous 50% en confiance HAUTE. Revoir les conditions de trade et n'envisager que les setups 8/8 jusqu'à amélioration.",
  calibrationInsightHighUnderMedium:
    '⚠ Confiance HAUTE sous-performe MOYENNE — réduire la taille des positions sur les signaux haute confiance.',
  calibrationInsightOk:
    'La confiance HAUTE performe comme attendu.',

  // Data-source badge — surfaced in PriceBar when meta.source is
  // 'partial' or 'mock' (F-90). Kept compact so the chip doesn't
  // crowd the bar.
  badgeMock: 'DONNÉES SIMULÉES',
  badgePartial: 'DONNÉES PARTIELLES',
} as const
