// useSignals — polls /api/signals every 60 seconds.
// Returns the latest MarketSignals (DXY + US10Y) plus loading and
// error state. Used by SignalsPanel (consumer added in a later
// commit). Cadence is slower than price because macro signals do
// not move on the same tick frequency as gold spot.
//
// Same `fetch` shadowing convention as useGoldPrice: the inner
// helper uses `window.fetch` to avoid accidental self-recursion.

import { useState, useEffect } from 'react'
import type { MarketSignals } from '@/lib/types'

interface UseSignalsReturn {
  data: MarketSignals | null
  loading: boolean
  error: string | null
}

export function useSignals(): UseSignalsReturn {
  const [data, setData] = useState<MarketSignals | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetch() {
    try {
      const res = await window.fetch('/api/signals')
      if (!res.ok) throw new Error('Failed to fetch signals')
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (e) {
      setError('Signals unavailable')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Initial fetch then every 60s.
    fetch()
    const interval = setInterval(fetch, 60_000)
    return () => clearInterval(interval)
  }, [])

  return { data, loading, error }
}
