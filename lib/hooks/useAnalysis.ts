// useAnalysis — manual + auto-trigger Claude analysis caller.
// Unlike the other three hooks this one does NOT auto-fetch on
// mount and does NOT poll the route on its own. Instead it
// exposes `trigger(req)` so the AnalysisPanel can fire an
// analysis on demand (button click) or when the auto countdown
// reaches zero (handled by the panel, not here).
//
// `secondsUntilNext` is a 30-minute countdown that ticks down
// every second and resets to 30:00 every time `trigger` succeeds.
// The panel renders this as the "next analysis in HH:MM" timer
// and decides whether to auto-fire when it hits 0.

import { useState, useEffect, useCallback } from 'react'
import type { AnalysisResult, AnalysisRequest } from '@/lib/types'

interface UseAnalysisReturn {
  data: AnalysisResult | null
  loading: boolean
  error: string | null
  secondsUntilNext: number
  trigger: (req: AnalysisRequest) => Promise<void>
}

// 30 minutes, expressed in seconds — matches the auto-trigger
// cadence in .claude/context.md > Analysis behavior.
const AUTO_INTERVAL = 30 * 60

export function useAnalysis(): UseAnalysisReturn {
  const [data, setData] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secondsUntilNext, setSecondsUntilNext] = useState(AUTO_INTERVAL)

  // POST /api/analyze with the AnalysisRequest body. Memoized so
  // consumers can put it in their own deps without thrashing.
  const trigger = useCallback(async (req: AnalysisRequest) => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      if (!res.ok) throw new Error('Analysis failed')
      const json = await res.json()
      setData(json)
      // Successful analysis → reset the countdown to a full window.
      setSecondsUntilNext(AUTO_INTERVAL)
    } catch (e) {
      setError('Analysis unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  // 1 Hz countdown. When it hits zero we wrap back to AUTO_INTERVAL
  // — the panel watches the value and decides when to call
  // `trigger` again, so this hook does not fire requests on its own.
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsUntilNext(prev => {
        if (prev <= 1) return AUTO_INTERVAL
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return { data, loading, error, secondsUntilNext, trigger }
}
