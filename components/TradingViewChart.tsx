// TradingViewChart — center panel of the dashboard. The filename
// stays "TradingViewChart" so existing imports across the project
// don't churn, but the component itself is now GoldChart: a
// vertically split panel.
//
// Layout (top → bottom):
//   1. TOP — 70%      Our own Lightweight Charts candlestick chart
//                     fed by useTechnicals (1H GC=F candles + EMA
//                     20/50/200 + volume histogram). AI level lines
//                     overlaid via createPriceLine when the `levels`
//                     prop is populated by AnalysisPanel.
//   2. BOTTOM — 30%   TradingView iframe at 5-minute interval for
//                     live tick watching. Toolbars hidden so the
//                     small height is mostly chart.
//
// Why split? The Lightweight Charts panel gives us full control:
// AI-drawn levels, our own indicator overlays, our exact color
// palette. The TradingView strip below preserves the live-tick
// feel a trader gets from a real-time pro chart without sacrificing
// the AI integration.
//
// Lightweight Charts v5 API:
//   chart.addSeries(SeriesDefinition, options)
//   The series definitions (CandlestickSeries / LineSeries /
//   HistogramSeries) are imported as runtime values.
//
// SSR safety: lightweight-charts is browser-only (it touches
// `window` / `document`). We dynamic-import it inside an effect
// so the module never enters the server bundle.

'use client'

import { useEffect, useRef, useState } from 'react'
import { useTechnicals } from '@/lib/hooks/useTechnicals'
import type { ChartLevels } from '@/lib/types'
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  Time,
} from 'lightweight-charts'

interface GoldChartProps {
  levels?: ChartLevels
}

// 5-minute TradingView iframe — live ticker beneath the main
// chart. Top + side toolbars hidden so we keep as much chart as
// possible at 30% panel height.
const TV_IFRAME_SRC =
  'https://www.tradingview.com/widgetembed/' +
  '?symbol=XAUUSD' +
  '&interval=5' +
  '&theme=dark' +
  '&style=1' +
  '&locale=en' +
  '&timezone=Europe%2FParis' +
  '&hide_side_toolbar=1' +
  '&hide_top_toolbar=1' +
  '&allow_symbol_change=0' +
  '&withdateranges=0' +
  '&hide_legend=1' +
  '&saveimage=0' +
  '&toolbarbg=111111'

// EMA palette — must match the colors used in the chart series
// options below so the legend swatches read truthfully.
const COLOR_EMA20 = '#60a5fa'
const COLOR_EMA50 = '#f97316'
const COLOR_EMA200 = '#6b7280'

// AI-level palette — entry blue, stop red, target green; support
// + resistance use red/green dotted; swing high/low use a muted
// grey with no axis label so they don't crowd the price scale.
const COLOR_ENTRY = '#60a5fa'
const COLOR_STOP = '#f87171'
const COLOR_TARGET = '#4ade80'
const COLOR_RESISTANCE = '#f87171'
const COLOR_SUPPORT = '#4ade80'
const COLOR_SWING = '#444444'

// LineStyle enum literals from lightweight-charts. Inlined as
// numeric constants so we don't need to load the runtime module
// just to read the enum at module scope.
//   Solid = 0, Dotted = 1, Dashed = 2, LargeDashed = 3, SparseDotted = 4
const LINE_STYLE_DOTTED = 1
const LINE_STYLE_DASHED = 2

export default function GoldChart({ levels }: GoldChartProps) {
  const technicals = useTechnicals()

  // Outer wrapper — the page lays this out at flex:1 in the
  // middle row, so we fill 100% of whatever it gives us.
  // Inner refs:
  //   chartContainerRef — the div the lightweight chart attaches
  //                       to (top section, below the legend bar).
  //   chartRef          — the IChartApi instance.
  //   *SeriesRef        — handles to each series so per-data
  //                       useEffects can call setData() without
  //                       re-creating the chart.
  //   priceLinesRef     — refs to every active createPriceLine
  //                       call so we can clear them all when the
  //                       `levels` prop changes.
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const ema20Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const ema50Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const ema200Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])

  // Gates the data-update effects below until the chart instance
  // exists (the dynamic import is async, so the chart isn't ready
  // on first render).
  const [chartReady, setChartReady] = useState(false)

  // ─────────────────────────────────────────────────────────────
  // Mount: dynamic-import lightweight-charts, build chart + series
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = chartContainerRef.current
    if (!container) return

    let disposed = false
    let chart: IChartApi | undefined
    let resizeObserver: ResizeObserver | undefined

    import('lightweight-charts')
      .then((lwc) => {
        // Effect cleanup may have run while the dynamic import was
        // resolving — bail before touching the DOM.
        if (disposed || !chartContainerRef.current) return
        const liveContainer = chartContainerRef.current

        chart = lwc.createChart(liveContainer, {
          layout: {
            background: { type: lwc.ColorType.Solid, color: '#0d0d0d' },
            textColor: '#888888',
            fontFamily: 'monospace',
            fontSize: 10,
          },
          grid: {
            vertLines: { color: '#161616' },
            horzLines: { color: '#161616' },
          },
          crosshair: {
            vertLine: { color: '#333333', width: 1 },
            horzLine: { color: '#333333', width: 1 },
          },
          rightPriceScale: {
            borderColor: '#222222',
            // Leave bottom 20% of the price scale empty so the
            // overlay volume series has room to paint without
            // overlapping the candles.
            scaleMargins: { top: 0.05, bottom: 0.2 },
          },
          timeScale: {
            borderColor: '#222222',
            timeVisible: true,
            secondsVisible: false,
          },
          width: liveContainer.clientWidth,
          height: liveContainer.clientHeight,
        })

        const candleSeries = chart.addSeries(lwc.CandlestickSeries, {
          upColor: '#4ade80',
          downColor: '#f87171',
          borderUpColor: '#4ade80',
          borderDownColor: '#f87171',
          wickUpColor: '#4ade80',
          wickDownColor: '#f87171',
        })

        // Volume on its own overlay scale at the bottom 15% of
        // the chart. priceScaleId='' creates an overlay scale
        // that doesn't compete with the candles for vertical room.
        const volumeSeries = chart.addSeries(lwc.HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: '',
          color: '#1a2e1a',
        })
        volumeSeries.priceScale().applyOptions({
          scaleMargins: { top: 0.85, bottom: 0 },
        })

        const ema20 = chart.addSeries(lwc.LineSeries, {
          color: COLOR_EMA20,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        const ema50 = chart.addSeries(lwc.LineSeries, {
          color: COLOR_EMA50,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        const ema200 = chart.addSeries(lwc.LineSeries, {
          color: COLOR_EMA200,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })

        chartRef.current = chart
        candleSeriesRef.current = candleSeries
        volumeSeriesRef.current = volumeSeries
        ema20Ref.current = ema20
        ema50Ref.current = ema50
        ema200Ref.current = ema200

        // Resize the chart whenever the container resizes — the
        // page's middle row is flex:1 so this fires on window
        // resize, drawer toggles, and breakpoint flips.
        resizeObserver = new ResizeObserver(() => {
          if (!chart || !chartContainerRef.current) return
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          })
        })
        resizeObserver.observe(liveContainer)

        setChartReady(true)
      })
      .catch((err) => {
        console.error('[GoldChart] Failed to load lightweight-charts', err)
      })

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      // chart.remove() also disposes every attached series, so
      // we don't need to remove series individually.
      chart?.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
      ema20Ref.current = null
      ema50Ref.current = null
      ema200Ref.current = null
      priceLinesRef.current = []
      setChartReady(false)
    }
  }, [])

  // ─────────────────────────────────────────────────────────────
  // Push candle data when it arrives / changes.
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const series = candleSeriesRef.current
    if (!chartReady || !series) return
    if (technicals.chartCandles.length === 0) return
    series.setData(
      technicals.chartCandles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    )
    // Auto-fit the visible range to the data on the first load.
    chartRef.current?.timeScale().fitContent()
  }, [chartReady, technicals.chartCandles])

  // Volume bars colored per candle (green tint on up-bars, red on
  // down-bars). Per-point `color` overrides the series default.
  useEffect(() => {
    const series = volumeSeriesRef.current
    if (!chartReady || !series) return
    if (technicals.chartCandles.length === 0) return
    series.setData(
      technicals.chartCandles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? '#1a2e1a' : '#2e1a1a',
      }))
    )
  }, [chartReady, technicals.chartCandles])

  useEffect(() => {
    const series = ema20Ref.current
    if (!chartReady || !series) return
    if (technicals.ema20Series.length === 0) return
    series.setData(
      technicals.ema20Series.map((p) => ({ time: p.time as Time, value: p.value }))
    )
  }, [chartReady, technicals.ema20Series])

  useEffect(() => {
    const series = ema50Ref.current
    if (!chartReady || !series) return
    if (technicals.ema50Series.length === 0) return
    series.setData(
      technicals.ema50Series.map((p) => ({ time: p.time as Time, value: p.value }))
    )
  }, [chartReady, technicals.ema50Series])

  useEffect(() => {
    const series = ema200Ref.current
    if (!chartReady || !series) return
    if (technicals.ema200Series.length === 0) return
    series.setData(
      technicals.ema200Series.map((p) => ({ time: p.time as Time, value: p.value }))
    )
  }, [chartReady, technicals.ema200Series])

  // ─────────────────────────────────────────────────────────────
  // AI level price lines — drawn / cleared whenever `levels`
  // changes. Uses createPriceLine on the candlestick series so
  // labels appear on the right price axis.
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const series = candleSeriesRef.current
    if (!chartReady || !series) return

    // Clear every existing price line. removePriceLine is the
    // documented way to detach a line in v5; series.priceLines
    // is read-only so we keep our own array of refs.
    for (const line of priceLinesRef.current) {
      series.removePriceLine(line)
    }
    priceLinesRef.current = []

    if (!levels) return

    function addLine(
      price: number | undefined,
      color: string,
      style: number,
      title: string
    ) {
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
        return
      }
      // series is checked above — TS narrowing doesn't follow
      // through the closure, hence the non-null assertion.
      const line = series!.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: style,
        axisLabelVisible: title !== '',
        title,
      })
      priceLinesRef.current.push(line)
    }

    addLine(levels.entry, COLOR_ENTRY, LINE_STYLE_DASHED, 'ENTRY')
    addLine(levels.stop, COLOR_STOP, LINE_STYLE_DASHED, 'STOP')
    addLine(levels.target, COLOR_TARGET, LINE_STYLE_DASHED, 'TARGET')
    addLine(levels.resistance, COLOR_RESISTANCE, LINE_STYLE_DOTTED, 'RES')
    addLine(levels.support, COLOR_SUPPORT, LINE_STYLE_DOTTED, 'SUP')
    addLine(levels.swingHigh, COLOR_SWING, LINE_STYLE_DOTTED, '')
    addLine(levels.swingLow, COLOR_SWING, LINE_STYLE_DOTTED, '')
  }, [chartReady, levels])

  // Whether the chart legend should advertise AI levels — only
  // show those swatches once an analysis has populated them.
  const hasEntry =
    typeof levels?.entry === 'number' && Number.isFinite(levels.entry)
  const hasStop =
    typeof levels?.stop === 'number' && Number.isFinite(levels.stop)
  const hasTarget =
    typeof levels?.target === 'number' && Number.isFinite(levels.target)

  return (
    <div
      data-section="gold-chart-root"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#0d0d0d',
        overflow: 'hidden',
      }}
    >
      {/* ── TOP 70% — Lightweight Charts price panel ────────── */}
      <div
        data-section="gold-chart-top"
        style={{
          flex: '0 0 70%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Thin legend bar above the chart canvas. */}
        <div
          data-section="gold-chart-legend"
          style={{
            height: '22px',
            minHeight: '22px',
            background: '#0d0d0d',
            borderBottom: '1px solid #161616',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: '14px',
            fontSize: '9px',
            letterSpacing: '0.08em',
          }}
        >
          <span style={{ color: '#444444' }}>XAUUSD · 1H</span>
          <span style={{ color: COLOR_EMA20 }}>● EMA20</span>
          <span style={{ color: COLOR_EMA50 }}>● EMA50</span>
          <span style={{ color: COLOR_EMA200 }}>● EMA200</span>
          {hasEntry && (
            <span style={{ color: COLOR_ENTRY }}>┄ ENTRY</span>
          )}
          {hasStop && (
            <span style={{ color: COLOR_STOP }}>┄ STOP</span>
          )}
          {hasTarget && (
            <span style={{ color: COLOR_TARGET }}>┄ TARGET</span>
          )}
          {technicals.loading && (
            <span
              style={{
                marginLeft: 'auto',
                color: '#333333',
                letterSpacing: '0.12em',
              }}
            >
              UPDATING...
            </span>
          )}
        </div>

        {/* The chart container — Lightweight Charts attaches its
            canvas here. flex:1 + minHeight:0 so it shrinks to
            fit the remaining vertical space inside the 70%
            section. */}
        <div
          ref={chartContainerRef}
          data-section="gold-chart-canvas"
          style={{
            flex: 1,
            minHeight: 0,
            width: '100%',
            background: '#0d0d0d',
          }}
        />
      </div>

      {/* ── BOTTOM 30% — TradingView live ticker ────────────── */}
      <div
        data-section="gold-chart-tv-strip"
        style={{
          flex: '0 0 30%',
          minHeight: 0,
          borderTop: '1px solid #222222',
          background: '#0d0d0d',
          position: 'relative',
        }}
      >
        {/* Tiny LIVE label overlaid top-left, doesn't intercept
            mouse events so the chart stays interactive. */}
        <span
          style={{
            position: 'absolute',
            top: '4px',
            left: '8px',
            color: '#333333',
            fontSize: '8px',
            letterSpacing: '0.12em',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        >
          LIVE · TRADINGVIEW
        </span>
        <iframe
          src={TV_IFRAME_SRC}
          title="TradingView XAUUSD live chart"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            background: '#0d0d0d',
          }}
          allowFullScreen
          scrolling="no"
        />
      </div>
    </div>
  )
}
