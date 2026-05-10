// useCot — [PHASE-12.2] polls /api/cot once per hour.
//
// CFTC publishes COT (Commitments of Traders) once per week,
// Friday afternoon ET, for the prior Tuesday. A 1-hour poll is
// generous — it just keeps the dashboard fresh after the weekly
// release without burning Socrata quota.
//
// The endpoint itself caches 12h server-side (Next revalidate),
// so most polls are local cache hits.

import { useState, useEffect } from 'react'
import type { CotPositioning } from '@/lib/types'

interface UseCotReturn {
  data: CotPositioning | null
  loading: boolean
  error: string | null
}

export function useCot(): UseCotReturn {
  const [data, setData] = useState<CotPositioning | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchCot() {
    try {
      const res = await window.fetch('/api/cot')
      if (!res.ok) throw new Error('Failed to fetch COT')
      const json = (await res.json()) as CotPositioning
      setData(json)
      setError(null)
    } catch {
      setError('COT unavailable')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCot()
    const interval = setInterval(fetchCot, 3_600_000) // 1 hour
    return () => clearInterval(interval)
  }, [])

  return { data, loading, error }
}
