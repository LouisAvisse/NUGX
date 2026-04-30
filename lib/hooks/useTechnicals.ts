// useTechnicals — polls /api/technicals every 60 seconds.
// Returns the latest TechnicalIndicators snapshot plus loading,
// error, and lastUpdated state. Used by SignalsPanel TECHNICAL
// section + AnalysisPanel buildRequest. Same `window.fetch`
// shadowing convention as the other hooks (the inner async
// helper is named `fetch` to mirror its siblings).
//
// Cadence: 60s. Indicator math is computed from 1H candles; the
// values shift slowly relative to spot price so polling faster
// than 60s is wasted bandwidth.

import { useState, useEffect } from 'react'
import type { TechnicalIndicators } from '@/lib/types'

interface UseTechnicalsReturn {
  indicators: TechnicalIndicators | null
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

export function useTechnicals(): UseTechnicalsReturn {
  const [indicators, setIndicators] = useState<TechnicalIndicators | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function fetch() {
    try {
      const res = await window.fetch('/api/technicals')
      if (!res.ok) throw new Error('Failed to fetch technicals')
      const json = await res.json()
      setIndicators(json)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      setError('Technicals unavailable')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch()
    const interval = setInterval(fetch, 60_000)
    return () => clearInterval(interval)
  }, [])

  return { indicators, loading, error, lastUpdated }
}
