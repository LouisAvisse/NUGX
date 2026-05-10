// useThesisHealth — passive watchdog over the active analysis.
//
// Today's only continuous monitor is useAlerts, which fires when
// price crosses invalidationLevel. That's structurally LATE: by
// the time invalidation crosses, the trader is already wrong.
// useThesisHealth runs the same cadence (price tick + technicals
// refresh, ~10-60s) and detects EARLIER weakness signs:
//
//   1. MACD_FLIP    — MACD cross opposite to the trade direction
//   2. RSI_EXIT     — RSI leaves the band that supported the bias
//   3. EMA20_BREAK  — price prints past EMA20 against the position
//
// When ≥2 of 3 fire we transition to WEAKENING and raise a
// WARNING alert (using the same lib/alerts.ts storage as
// invalidation alerts so the existing AlertBanner picks it up).
// Below 2, we stay INTACT — single-signal noise (e.g. a brief RSI
// dip) shouldn't pull the trader out of a valid setup.
//
// Dedupe: per-analysis key in alertFiredRef, mirroring useAlerts.
// One WEAKENING alert per analysis lifetime; repeat ticks no-op.
//
// CLIENT-ONLY. Runs on every render — the work is cheap (three
// boolean checks) and React's batching keeps it free.

'use client'

import { useEffect, useMemo, useRef } from 'react'
import { createAlert } from '@/lib/alerts'
import { parsePrice } from '@/lib/utils'
import type {
  AnalysisResult,
  TechnicalIndicators,
  ThesisHealth,
  ThesisWeaknessSignal,
} from '@/lib/types'

interface UseThesisHealthParams {
  lastAnalysis: AnalysisResult | null
  currentPrice: number | null
  technicals: TechnicalIndicators | null
}

// RSI thresholds — chosen tighter than the standard 30/70 zones
// because we're detecting "support gone", not "extreme reached".
// LONG bias supported while RSI ≥ 45; SHORT bias supported while
// RSI ≤ 55. Crossing past these is the early "momentum left the
// trade" tell.
const RSI_LONG_FLOOR = 45
const RSI_SHORT_CEILING = 55

export function useThesisHealth({
  lastAnalysis,
  currentPrice,
  technicals,
}: UseThesisHealthParams): ThesisHealth {
  // Per-analysis dedupe so we raise WEAKENING at most once per
  // analysis lifetime. Cleared when generatedAt changes.
  const alertFiredRef = useRef<Set<string>>(new Set())
  const lastAnalysisIdRef = useRef<string | null>(null)

  // Compute the live status. useMemo so the object identity is
  // stable across renders that don't change the underlying data —
  // matters because consumers (chip in AnalysisPanel) put this
  // in JSX and we don't want needless re-renders.
  const health = useMemo<ThesisHealth>(() => {
    if (!lastAnalysis) return { status: 'INACTIVE', signals: [] }
    if (lastAnalysis.recommendation === 'FLAT')
      return { status: 'INACTIVE', signals: [] }
    if (!technicals) return { status: 'INTACT', signals: [] }

    // BROKEN check first — if invalidation is already crossed, the
    // chip should reflect that even though useAlerts owns the
    // CRITICAL alert. We don't raise a duplicate here.
    const invalidationPrice = parsePrice(lastAnalysis.invalidationLevel)
    if (currentPrice && invalidationPrice > 0) {
      const broken =
        lastAnalysis.recommendation === 'LONG'
          ? currentPrice <= invalidationPrice
          : currentPrice >= invalidationPrice
      if (broken) return { status: 'BROKEN', signals: [] }
    }

    const isLong = lastAnalysis.recommendation === 'LONG'
    const signals: ThesisWeaknessSignal[] = []

    // 1. MACD cross against position. Uses the indicator's
    // already-classified macdCross enum from lib/technicals.ts.
    if (isLong && technicals.macdCross === 'BEARISH_CROSS') {
      signals.push('MACD_FLIP')
    } else if (!isLong && technicals.macdCross === 'BULLISH_CROSS') {
      signals.push('MACD_FLIP')
    }

    // 2. RSI exits supporting band. We don't know the RSI at
    // analysis time without a snapshot field, so we use the
    // current value vs. fixed thresholds — good enough as an
    // "is momentum still on this side" check.
    if (isLong && technicals.rsi < RSI_LONG_FLOOR) {
      signals.push('RSI_EXIT')
    } else if (!isLong && technicals.rsi > RSI_SHORT_CEILING) {
      signals.push('RSI_EXIT')
    }

    // 3. EMA20 break opposite to the position.
    if (isLong && technicals.priceVsEma20 === 'BELOW') {
      signals.push('EMA20_BREAK')
    } else if (!isLong && technicals.priceVsEma20 === 'ABOVE') {
      signals.push('EMA20_BREAK')
    }

    // 2-of-3 rule. A single weakness is normal noise on a 1H
    // setup; two simultaneous weaknesses is a real degradation.
    const status = signals.length >= 2 ? 'WEAKENING' : 'INTACT'
    return { status, signals }
  }, [lastAnalysis, currentPrice, technicals])

  // Side effect: raise a WARNING alert the first time we see
  // WEAKENING for this analysis. The existing AlertBanner reads
  // active alerts from storage and surfaces them — no UI changes
  // needed beyond filing the alert.
  useEffect(() => {
    if (!lastAnalysis) return

    // Reset dedupe when the analysis changes.
    if (lastAnalysisIdRef.current !== lastAnalysis.generatedAt) {
      lastAnalysisIdRef.current = lastAnalysis.generatedAt
      alertFiredRef.current.clear()
    }

    if (health.status !== 'WEAKENING') return

    const key = `${lastAnalysis.generatedAt}-thesis-weakening`
    if (alertFiredRef.current.has(key)) return
    alertFiredRef.current.add(key)

    const labels: Record<ThesisWeaknessSignal, string> = {
      MACD_FLIP: 'MACD inversé',
      RSI_EXIT: 'RSI hors zone',
      EMA20_BREAK: 'cassure EMA20',
    }
    const reasons = health.signals.map((s) => labels[s]).join(' + ')

    createAlert({
      severity: 'WARNING',
      message: `⚠ THÈSE EN AFFAIBLISSEMENT — ${reasons}. Réévaluer avant que l'invalidation soit touchée.`,
      priceAtTrigger: currentPrice ?? 0,
      analysisId: lastAnalysis.generatedAt,
    })
  }, [health, lastAnalysis, currentPrice])

  return health
}
