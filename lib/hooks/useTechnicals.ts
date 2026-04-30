// useTechnicals — polls /api/technicals every 60 seconds.
// Returns the latest TechnicalIndicators snapshot AND the raw
// chart series (OHLCV candles + EMA20/50/200 line points) for
// the GoldChart panel, plus loading/error/lastUpdated state.
//
// Used by:
//   - SignalsPanel TECHNICAL section          (indicators only)
//   - AnalysisPanel.buildRequest              (indicators only)
//   - GoldChart                               (chart series)
//
// Same `window.fetch` shadowing convention as the other hooks
// (the inner async helper is named `fetch` to mirror its siblings).
//
// Cadence: 60s. Indicator math is computed from 1H candles; the
// values shift slowly relative to spot price so polling faster
// than 60s is wasted bandwidth. Chart candles update at the same
// cadence — the most recent candle on the chart trails real-time
// by up to a minute, but the embedded TradingView iframe in
// GoldChart's bottom strip handles live tick watching.

import { useState, useEffect } from 'react'
import type {
  ChartCandle,
  ChartLinePoint,
  TechnicalIndicators,
  TechnicalsResponse,
} from '@/lib/types'

interface UseTechnicalsReturn {
  indicators: TechnicalIndicators | null
  chartCandles: ChartCandle[]
  ema20Series: ChartLinePoint[]
  ema50Series: ChartLinePoint[]
  ema200Series: ChartLinePoint[]
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

export function useTechnicals(): UseTechnicalsReturn {
  const [indicators, setIndicators] = useState<TechnicalIndicators | null>(null)
  const [chartCandles, setChartCandles] = useState<ChartCandle[]>([])
  const [ema20Series, setEma20Series] = useState<ChartLinePoint[]>([])
  const [ema50Series, setEma50Series] = useState<ChartLinePoint[]>([])
  const [ema200Series, setEma200Series] = useState<ChartLinePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function fetch() {
    try {
      const res = await window.fetch('/api/technicals')
      if (!res.ok) throw new Error('Failed to fetch technicals')
      const json = (await res.json()) as TechnicalsResponse
      setIndicators(json.indicators)
      setChartCandles(json.chart.candles)
      setEma20Series(json.chart.ema20)
      setEma50Series(json.chart.ema50)
      setEma200Series(json.chart.ema200)
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

  return {
    indicators,
    chartCandles,
    ema20Series,
    ema50Series,
    ema200Series,
    loading,
    error,
    lastUpdated,
  }
}
