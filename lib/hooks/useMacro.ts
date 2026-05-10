// useMacro — [PHASE-12.2] polls /api/macro every 10 minutes.
//
// Returns the latest MacroYields (10Y real yield, 10Y breakeven,
// optional 5Y / 5Y5Y forward) plus loading and error state. FRED
// updates daily, so a 10-minute poll is intentionally conservative
// — it just keeps the dashboard fresh after long idle periods
// without thrashing the upstream.
//
// Same `window.fetch` shadowing convention as useSignals.

import { useState, useEffect } from 'react'
import type { MacroYields } from '@/lib/types'

interface UseMacroReturn {
  data: MacroYields | null
  loading: boolean
  error: string | null
}

export function useMacro(): UseMacroReturn {
  const [data, setData] = useState<MacroYields | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchMacro() {
    try {
      const res = await window.fetch('/api/macro')
      if (!res.ok) throw new Error('Failed to fetch macro yields')
      const json = (await res.json()) as MacroYields
      setData(json)
      setError(null)
    } catch {
      setError('Macro yields unavailable')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMacro()
    const interval = setInterval(fetchMacro, 600_000) // 10 minutes
    return () => clearInterval(interval)
  }, [])

  return { data, loading, error }
}
