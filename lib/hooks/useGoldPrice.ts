// useGoldPrice — polls /api/price every 30 seconds.
// Returns the latest GoldPrice snapshot plus loading/error/
// lastUpdated state. Used by PriceBar and BottomBar (consumers
// added in later commits — wiring is intentionally not done yet).
//
// Implementation note: the inner async helper is named `fetch`,
// which shadows the global. We deliberately call `window.fetch`
// instead of `fetch` inside it so the call is unambiguously the
// browser API and not a recursive call to ourselves. A future
// reader who renames or simplifies this should keep that in mind.

import { useState, useEffect } from 'react'
import type { GoldPrice } from '@/lib/types'

interface UseGoldPriceReturn {
  data: GoldPrice | null      // latest snapshot, null until first response
  loading: boolean            // true on the very first request only
  error: string | null        // human-readable error message, null when healthy
  lastUpdated: Date | null    // wall-clock time of the last successful fetch
}

export function useGoldPrice(): UseGoldPriceReturn {
  const [data, setData] = useState<GoldPrice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // One round-trip to /api/price. Defined inside the hook so it
  // closes over the setters; called by useEffect for the initial
  // load and by setInterval for every subsequent tick.
  async function fetch() {
    try {
      const res = await window.fetch('/api/price')
      if (!res.ok) throw new Error('Failed to fetch price')
      const json = await res.json()
      setData(json)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      setError('Price unavailable')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Fire once immediately so the UI gets data without waiting
    // 30s, then poll on a 30s cadence per the spec.
    fetch()
    const interval = setInterval(fetch, 30_000)
    return () => clearInterval(interval)
  }, [])

  return { data, loading, error, lastUpdated }
}
