// useCalendar — polls /api/calendar every 60 seconds.
//
// Returns the latest CalendarResponse plus loading + error state.
// Used by CalendarPanel + AnalysisPanel buildRequest. The 60s
// cadence is deliberate: minutesUntil drifts by 1 every minute
// (it's a wall-clock countdown), so a 60s tick keeps the panel's
// "in 23 minutes" copy reasonably fresh between fetches without
// hammering the upstream feed (the route caches it for 1 hour at
// the Next layer; only the freshness math runs every minute).
//
// Same window.fetch shadowing convention as the other hooks.

import { useState, useEffect } from 'react'
import type { CalendarResponse } from '@/lib/types'

interface UseCalendarReturn {
  data: CalendarResponse | null
  loading: boolean
  error: string | null
}

export function useCalendar(): UseCalendarReturn {
  const [data, setData] = useState<CalendarResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetch() {
    try {
      const res = await window.fetch('/api/calendar')
      if (!res.ok) throw new Error('Failed to fetch calendar')
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (e) {
      setError('Calendar unavailable')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch()
    // Every 60s — keeps minutesUntil fresh enough that the panel
    // never shows stale "in N minutes" copy by more than ~1 min.
    const interval = setInterval(fetch, 60_000)
    return () => clearInterval(interval)
  }, [])

  return { data, loading, error }
}
