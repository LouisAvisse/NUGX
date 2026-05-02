// useTechnicals — polls /api/technicals every 60 seconds.
// Returns the latest TechnicalIndicators snapshot AND the raw
// chart series (OHLCV candles + EMA20/50/200 line points) for
// the GoldChart panel, plus loading/error/lastUpdated state.
//
// [SPRINT-2] expansion. Now also exposes per-timeframe candle
// bundles (tf15m, tf4h) and the detected patterns array. The
// canonical 1H bundle stays accessible via `indicators` /
// `chartCandles` / `ema20Series` etc. so existing consumers
// (SignalsPanel TECHNICAL section + AnalysisPanel.buildRequest +
// GoldChart) work unchanged. New consumers — SPRINT-3 chart
// switcher and SPRINT-4 prompt enrichment — read tf15m, tf4h,
// patterns directly.
//
// Used by:
//   - SignalsPanel TECHNICAL section          (indicators only)
//   - AnalysisPanel.buildRequest              (indicators + tf15m + tf4h + patterns)
//   - GoldChart                               (chart series + per-TF bundles + patterns)
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
  DetectedPattern,
  TechnicalIndicators,
  TechnicalsResponse,
  TimeframeCandles,
} from '@/lib/types'

interface UseTechnicalsReturn {
  indicators: TechnicalIndicators | null
  chartCandles: ChartCandle[]
  ema20Series: ChartLinePoint[]
  ema50Series: ChartLinePoint[]
  ema200Series: ChartLinePoint[]

  // [SPRINT-2] Multi-timeframe bundles. `null` until the first
  // successful fetch; callers should defensive-check before
  // reading nested fields. tf1h is also exposed for callers that
  // want the per-TF shape consistently across all three.
  tf15m: TimeframeCandles | null
  tf1h: TimeframeCandles | null
  tf4h: TimeframeCandles | null

  // Detected candlestick + structure patterns, deduplicated across
  // timeframes. Empty array (not null) so callers can `.map` /
  // `.filter` without a null check.
  patterns: DetectedPattern[]

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
  const [tf15m, setTf15m] = useState<TimeframeCandles | null>(null)
  const [tf1h, setTf1h] = useState<TimeframeCandles | null>(null)
  const [tf4h, setTf4h] = useState<TimeframeCandles | null>(null)
  const [patterns, setPatterns] = useState<DetectedPattern[]>([])
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
      // New SPRINT-2 fields are optional in the type during the
      // SPRINT-1 landing; default to safe values when absent so
      // we never write `undefined` into hook state.
      setTf15m(json.tf15m ?? null)
      setTf1h(json.tf1h ?? null)
      setTf4h(json.tf4h ?? null)
      setPatterns(json.patterns ?? [])
      setLastUpdated(new Date())
      setError(null)
    } catch {
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
    tf15m,
    tf1h,
    tf4h,
    patterns,
    loading,
    error,
    lastUpdated,
  }
}
