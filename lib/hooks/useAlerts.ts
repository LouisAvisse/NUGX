// useAlerts — watches the latest analysis result + live gold
// price for invalidation crossings and fires WARNING/CRITICAL
// alerts. Returns the active alerts list plus dismiss helpers.
//
// Deduplication strategy: a Set in a ref tracks per-analysis
// alert keys (`${generatedAt}-warning`, `${generatedAt}-invalidation`)
// so the same alert doesn't fire twice during the lifetime of a
// single analysis. localStorage persists alerts across reloads,
// so on mount we re-seed the Set with keys from any stored
// alerts whose analysisId matches the current analysis — without
// this, opening the app after a previous analysis already
// triggered would re-fire the same alert.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createAlert,
  dismissAlert as dismissAlertInStorage,
  dismissAll as dismissAllInStorage,
  getActiveAlerts,
} from '@/lib/alerts'
import type { AnalysisResult, InvalidationAlert } from '@/lib/types'

interface UseAlertsParams {
  lastAnalysis: AnalysisResult | null
  currentPrice: number | null
}

interface UseAlertsReturn {
  activeAlerts: InvalidationAlert[]
  dismiss: (id: string) => void
  dismissAll: () => void
}

// Warning band — within this percent of invalidation = WARNING.
// Keep tight for gold (0.5% of $3300 ≈ $16) so the banner only
// fires when the cross is genuinely imminent.
const WARNING_BAND_PCT = 0.5

// Refresh cadence for the active-alerts state. The price-cross
// detector itself runs synchronously on every render where
// currentPrice changes; this interval just picks up dismiss
// state changes (e.g. dismissed in another tab).
const REFRESH_INTERVAL_MS = 10 * 1000

// Parse a level string the way AnalysisPanel + lib/history.ts
// do — first finite number wins. "3280-3285" → 3280, "above
// 3300" → 3300, "——" → NaN.
function parseFirstNumber(s: string | undefined): number {
  if (!s || s === '——') return NaN
  const m = s.match(/-?\d+(?:\.\d+)?/)
  if (!m) return NaN
  return parseFloat(m[0])
}

export function useAlerts({
  lastAnalysis,
  currentPrice,
}: UseAlertsParams): UseAlertsReturn {
  const [activeAlerts, setActiveAlerts] = useState<InvalidationAlert[]>([])

  // alertFiredRef tracks `${generatedAt}-warning|invalidation`
  // keys for the lifetime of the component. Cleared on each new
  // analysis (different generatedAt) so a fresh thesis can fire
  // its own alerts. Persisted alerts re-seed this on mount.
  const alertFiredRef = useRef<Set<string>>(new Set())

  // Track which analysis we last saw — when generatedAt changes,
  // wipe the fired Set + dismiss prior alerts (the thesis that
  // generated them is no longer the active one).
  const lastAnalysisIdRef = useRef<string | null>(null)

  // Refresh active-alerts state from storage. Called on mount,
  // on every detected cross, and on a 10s interval (so dismiss
  // state changes propagate).
  const refresh = useCallback(() => {
    setActiveAlerts(getActiveAlerts())
  }, [])

  // Initial load + interval refresh.
  useEffect(() => {
    refresh()
    const i = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(i)
  }, [refresh])

  // On mount: re-seed alertFiredRef with keys from any stored
  // alerts that match the current analysis. Without this, opening
  // the app after a prior alert already fired would re-fire it
  // on the first price tick.
  useEffect(() => {
    if (!lastAnalysis) return
    const stored = getActiveAlerts()
    for (const a of stored) {
      if (a.analysisId === lastAnalysis.generatedAt) {
        alertFiredRef.current.add(`${a.analysisId}-${a.severity.toLowerCase()}`)
      }
    }
  }, [lastAnalysis])

  // The price-cross detector. Runs whenever currentPrice or
  // lastAnalysis changes. The full body is a no-op when there
  // isn't a tradeable thesis (FLAT / no levels / unparseable).
  useEffect(() => {
    if (!lastAnalysis || !currentPrice) return
    if (lastAnalysis.recommendation === 'FLAT') return

    const invalidationPrice = parseFirstNumber(lastAnalysis.invalidationLevel)
    if (!Number.isFinite(invalidationPrice) || invalidationPrice === 0) return

    // New analysis detected — wipe per-thesis state. We track by
    // generatedAt because that's the natural unique id of an
    // analysis (assigned server-side, never reused).
    if (lastAnalysisIdRef.current !== lastAnalysis.generatedAt) {
      lastAnalysisIdRef.current = lastAnalysis.generatedAt
      // Auto-dismiss any prior active alerts so the banner clears.
      // The new analysis can fire fresh alerts as price moves.
      dismissAllInStorage()
      alertFiredRef.current.clear()
    }

    const isLong = lastAnalysis.recommendation === 'LONG'
    const crossed = isLong
      ? currentPrice <= invalidationPrice
      : currentPrice >= invalidationPrice

    const distancePct =
      Math.abs((currentPrice - invalidationPrice) / invalidationPrice) * 100
    const inWarningBand = distancePct <= WARNING_BAND_PCT && !crossed

    const criticalKey = `${lastAnalysis.generatedAt}-critical`
    const warningKey = `${lastAnalysis.generatedAt}-warning`

    if (crossed && !alertFiredRef.current.has(criticalKey)) {
      alertFiredRef.current.add(criticalKey)
      const direction = isLong ? 'LONG' : 'SHORT'
      const cmp = isLong ? 'fell below' : 'rose above'
      createAlert({
        severity: 'CRITICAL',
        message: `${direction} thesis invalidated — price ${cmp} $${invalidationPrice.toFixed(2)}.`,
        priceAtTrigger: currentPrice,
        analysisId: lastAnalysis.generatedAt,
      })
      refresh()
      return
    }

    if (inWarningBand && !alertFiredRef.current.has(warningKey)) {
      alertFiredRef.current.add(warningKey)
      createAlert({
        severity: 'WARNING',
        message: `Price within ${distancePct.toFixed(2)}% of invalidation ($${invalidationPrice.toFixed(2)}).`,
        priceAtTrigger: currentPrice,
        analysisId: lastAnalysis.generatedAt,
      })
      refresh()
    }
  }, [lastAnalysis, currentPrice, refresh])

  const dismiss = useCallback(
    (id: string) => {
      dismissAlertInStorage(id)
      refresh()
    },
    [refresh]
  )

  const dismissAll = useCallback(() => {
    dismissAllInStorage()
    refresh()
  }, [refresh])

  return { activeAlerts, dismiss, dismissAll }
}
