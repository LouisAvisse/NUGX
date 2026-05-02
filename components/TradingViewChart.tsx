// TradingViewChart — center panel of the dashboard. The filename
// stays "TradingViewChart" so existing imports across the project
// don't churn, but the component itself is now GoldChart: a
// vertically split panel with a multi-timeframe switcher.
//
// Layout (top → bottom):
//   1. LEGEND BAR     22px       Timeframe switcher (15M|1H|4H),
//                                EMA + AI level swatches, pattern
//                                count, loading marker.
//   2. ALIGNMENT STRIP 16px      Trend per TF (4H | 1H | 15M) +
//                                "● ALIGNED" badge when all three
//                                point the same direction.
//   3. CHART (top 70%)           Lightweight Charts candlestick
//                                + 3 EMAs + volume + AI lines +
//                                pattern markers. Series data is
//                                swapped on activeTimeframe change.
//   4. TV STRIP (bottom 30%)     TradingView iframe at 5-minute
//                                interval for live tick watching.
//
// [SPRINT-3] additions:
//   • `activeTimeframe` state — '15M' | '1H' | '4H', drives which
//     of the per-TF candle bundles from useTechnicals feeds the
//     chart series.
//   • Pattern markers — `createSeriesMarkers` plugin instance is
//     created once on mount, then setMarkers() is called whenever
//     patterns or activeTimeframe change. Bullish arrows below
//     bars in green, bearish arrows above bars in red, neutral
//     circles below in amber.
//   • Trend alignment strip — three small badges + an ALIGNED
//     indicator when all three TFs agree.
//   • EMA200 only on 1H — the per-TF bundles only carry EMA20/50,
//     and the canonical EMA200 series is computed once for 1H.
//     On 15M/4H the EMA200 line is cleared (setData([])) so the
//     chart doesn't render a stale line.
//
// AI level lines, the TradingView strip below, and the
// dynamic-import + ResizeObserver wiring are unchanged from the
// SPRINT-0 baseline.
//
// Lightweight Charts v5 API:
//   chart.addSeries(SeriesDefinition, options)
//   createSeriesMarkers(series, markers) — plugin returning an
//     ISeriesMarkersPluginApi with setMarkers([]).
//
// SSR safety: lightweight-charts is browser-only (it touches
// `window` / `document`). We dynamic-import it inside an effect
// so the module never enters the server bundle.

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Tooltip from '@/components/Tooltip'
import { useTechnicals } from '@/lib/hooks/useTechnicals'
import type {
  ChartCandle,
  ChartLevels,
  ChartLinePoint,
  DetectedPattern,
  PatternName,
  Timeframe,
} from '@/lib/types'
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  SeriesMarker,
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

// Marker palette — green/red/amber to match the design system.
const COLOR_BULL = '#4ade80'
const COLOR_BEAR = '#f87171'
const COLOR_NEUTRAL = '#fbbf24'

// LineStyle enum literals from lightweight-charts. Inlined as
// numeric constants so we don't need to load the runtime module
// just to read the enum at module scope.
//   Solid = 0, Dotted = 1, Dashed = 2, LargeDashed = 3, SparseDotted = 4
const LINE_STYLE_DOTTED = 1
const LINE_STYLE_DASHED = 2

// Short labels for pattern markers. Spec-driven — keep the
// abbreviations terse so they don't crowd the chart.
const PATTERN_ABBREV: Record<PatternName, string> = {
  BULLISH_ENGULFING: 'ENG↑',
  BEARISH_ENGULFING: 'ENG↓',
  HAMMER: 'HAM',
  SHOOTING_STAR: 'SS',
  INSIDE_BAR: 'IB',
  DOJI: 'DOJI',
  BULLISH_MARUBOZU: 'MRZ↑',
  BEARISH_MARUBOZU: 'MRZ↓',
  HIGHER_HIGH_HIGHER_LOW: 'HH/HL',
  LOWER_HIGH_LOWER_LOW: 'LH/LL',
  DOUBLE_TOP_FORMING: 'DBL↓',
  DOUBLE_BOTTOM_FORMING: 'DBL↑',
}

// Trend → color for the alignment strip. RANGING reads as muted
// grey because no directional bias.
function trendColor(trend: string | undefined): string {
  if (trend === 'UPTREND') return COLOR_BULL
  if (trend === 'DOWNTREND') return COLOR_BEAR
  return '#888888'
}

export default function GoldChart({ levels }: GoldChartProps) {
  const technicals = useTechnicals()

  // Active timeframe — drives candle / EMA / marker data.
  // Default '1H' matches the previous single-TF behaviour so
  // first paint looks identical to before SPRINT-3.
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('1H')

  // Outer wrapper — the page lays this out at flex:1 in the
  // middle row, so we fill 100% of whatever it gives us.
  // Inner refs:
  //   chartContainerRef — the div the lightweight chart attaches
  //                       to (top section, below the strips).
  //   chartRef          — the IChartApi instance.
  //   *SeriesRef        — handles to each series so per-data
  //                       useEffects can call setData() without
  //                       re-creating the chart.
  //   priceLinesRef     — refs to every active createPriceLine
  //                       call so we can clear them all when the
  //                       `levels` prop changes.
  //   markersRef        — handle to the createSeriesMarkers plugin
  //                       so setMarkers() can be called as patterns
  //                       / active timeframe change.
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const ema20Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const ema50Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const ema200Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)

  // Tracks which timeframe was most recently auto-framed via
  // fitContent(). When this differs from the active TF the data
  // effect calls fitContent once and updates the ref; on every
  // subsequent 60-second technicals poll the ref already matches
  // so we leave the user's pan/zoom alone. Without this the chart
  // would snap back to fitContent every minute and erase the
  // user's manual zoom.
  const framedTimeframeRef = useRef<Timeframe | null>(null)

  // Gates the data-update effects below until the chart instance
  // exists (the dynamic import is async, so the chart isn't ready
  // on first render).
  const [chartReady, setChartReady] = useState(false)

  // ─────────────────────────────────────────────────────────────
  // Active per-TF data — picks the right candle/EMA bundle from
  // useTechnicals based on activeTimeframe. The 1H branch keeps
  // using the canonical chart payload (which carries EMA200) so
  // the 1H view has its full historical EMA200 line; 15M / 4H
  // fall back to the per-TF bundle (EMA20/50 only).
  // ─────────────────────────────────────────────────────────────
  const activeData = useMemo<{
    candles: ChartCandle[]
    ema20: ChartLinePoint[]
    ema50: ChartLinePoint[]
    ema200: ChartLinePoint[]
  }>(() => {
    if (activeTimeframe === '1H') {
      return {
        candles: technicals.chartCandles,
        ema20: technicals.ema20Series,
        ema50: technicals.ema50Series,
        ema200: technicals.ema200Series,
      }
    }
    const bundle = activeTimeframe === '15M' ? technicals.tf15m : technicals.tf4h
    return {
      candles: bundle?.candles ?? [],
      ema20: bundle?.ema20Series ?? [],
      ema50: bundle?.ema50Series ?? [],
      // Per-TF bundles don't carry EMA200 — clear the line on
      // 15M/4H to avoid showing stale 1H data.
      ema200: [],
    }
  }, [
    activeTimeframe,
    technicals.chartCandles,
    technicals.ema20Series,
    technicals.ema50Series,
    technicals.ema200Series,
    technicals.tf15m,
    technicals.tf4h,
  ])

  // Patterns filtered to the active timeframe. Markers are only
  // shown for the timeframe currently displayed — switching TFs
  // swaps the marker set.
  const activePatterns = useMemo<DetectedPattern[]>(
    () => technicals.patterns.filter((p) => p.timeframe === activeTimeframe),
    [technicals.patterns, activeTimeframe]
  )

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

        // Markers plugin — created once with an empty array, then
        // updated via setMarkers() whenever patterns or activeTF
        // change. v5 moved markers out of the series API into this
        // standalone plugin.
        const markers = lwc.createSeriesMarkers(candleSeries, [])

        chartRef.current = chart
        candleSeriesRef.current = candleSeries
        volumeSeriesRef.current = volumeSeries
        ema20Ref.current = ema20
        ema50Ref.current = ema50
        ema200Ref.current = ema200
        markersRef.current = markers

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
      // chart.remove() also disposes every attached series + plugin,
      // so we don't need to remove series / markers individually.
      chart?.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
      ema20Ref.current = null
      ema50Ref.current = null
      ema200Ref.current = null
      priceLinesRef.current = []
      markersRef.current = null
      framedTimeframeRef.current = null
      setChartReady(false)
    }
  }, [])

  // ─────────────────────────────────────────────────────────────
  // Push candle data when it arrives / changes — now keyed off
  // activeData so a timeframe switch swaps the chart contents.
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const series = candleSeriesRef.current
    if (!chartReady || !series) return
    if (activeData.candles.length === 0) return
    series.setData(
      activeData.candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    )
    // Only auto-fit on initial load and on timeframe switch —
    // not on every 60-second technicals poll. setData preserves
    // the visible range on its own; fitContent on each refresh
    // would snap the chart back to "show everything" and erase
    // any manual zoom the user just applied.
    if (framedTimeframeRef.current !== activeTimeframe) {
      framedTimeframeRef.current = activeTimeframe
      chartRef.current?.timeScale().fitContent()
    }
  }, [chartReady, activeData.candles, activeTimeframe])

  // Volume bars colored per candle (green tint on up-bars, red on
  // down-bars). Per-point `color` overrides the series default.
  useEffect(() => {
    const series = volumeSeriesRef.current
    if (!chartReady || !series) return
    if (activeData.candles.length === 0) return
    series.setData(
      activeData.candles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? '#1a2e1a' : '#2e1a1a',
      }))
    )
  }, [chartReady, activeData.candles])

  useEffect(() => {
    const series = ema20Ref.current
    if (!chartReady || !series) return
    series.setData(
      activeData.ema20.map((p) => ({ time: p.time as Time, value: p.value }))
    )
  }, [chartReady, activeData.ema20])

  useEffect(() => {
    const series = ema50Ref.current
    if (!chartReady || !series) return
    series.setData(
      activeData.ema50.map((p) => ({ time: p.time as Time, value: p.value }))
    )
  }, [chartReady, activeData.ema50])

  // EMA200 — on 15M / 4H this resolves to []; setData([]) clears
  // the line, leaving the legend swatch faded so the trader knows
  // EMA200 isn't in play on those timeframes.
  useEffect(() => {
    const series = ema200Ref.current
    if (!chartReady || !series) return
    series.setData(
      activeData.ema200.map((p) => ({ time: p.time as Time, value: p.value }))
    )
  }, [chartReady, activeData.ema200])

  // ─────────────────────────────────────────────────────────────
  // Pattern markers — refreshed when patterns or activeTimeframe
  // changes. Markers are placed on the most recent candle of the
  // active TF (lib/patterns.ts only fires on the last 3 candles
  // so this approximation is accurate to ±a couple bars).
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const plugin = markersRef.current
    if (!chartReady || !plugin) return

    if (activeData.candles.length === 0 || activePatterns.length === 0) {
      plugin.setMarkers([])
      return
    }

    const lastTime = activeData.candles[activeData.candles.length - 1].time as Time

    const markers: SeriesMarker<Time>[] = activePatterns.map((p) => {
      // Bullish patterns → green up-arrow below the bar.
      // Bearish patterns → red down-arrow above the bar.
      // Neutral patterns → amber circle below the bar.
      if (p.direction === 'BULLISH') {
        return {
          time: lastTime,
          position: 'belowBar',
          color: COLOR_BULL,
          shape: 'arrowUp',
          text: PATTERN_ABBREV[p.pattern] ?? p.pattern,
        }
      }
      if (p.direction === 'BEARISH') {
        return {
          time: lastTime,
          position: 'aboveBar',
          color: COLOR_BEAR,
          shape: 'arrowDown',
          text: PATTERN_ABBREV[p.pattern] ?? p.pattern,
        }
      }
      return {
        time: lastTime,
        position: 'belowBar',
        color: COLOR_NEUTRAL,
        shape: 'circle',
        text: PATTERN_ABBREV[p.pattern] ?? p.pattern,
      }
    })

    plugin.setMarkers(markers)
  }, [chartReady, activeData.candles, activePatterns])

  // ─────────────────────────────────────────────────────────────
  // AI level price lines — drawn / cleared whenever `levels`
  // changes OR the timeframe changes (a TF switch destroys the
  // visible price-line state from the user's perspective only;
  // the lines themselves are still attached to the same candle
  // series, so we re-create them to keep them in sync).
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
  }, [chartReady, levels, activeTimeframe])

  // Whether the chart legend should advertise AI levels — only
  // show those swatches once an analysis has populated them.
  const hasEntry =
    typeof levels?.entry === 'number' && Number.isFinite(levels.entry)
  const hasStop =
    typeof levels?.stop === 'number' && Number.isFinite(levels.stop)
  const hasTarget =
    typeof levels?.target === 'number' && Number.isFinite(levels.target)

  // Trend per timeframe — used by the alignment strip. Falls back
  // to 'RANGING' when a per-TF bundle is null (still loading).
  const trend15 = technicals.tf15m?.indicators.trend ?? 'RANGING'
  const trend1h = technicals.tf1h?.indicators.trend ?? technicals.indicators?.trend ?? 'RANGING'
  const trend4h = technicals.tf4h?.indicators.trend ?? 'RANGING'

  // All three pointing the same direction is the strongest
  // technical signal the dashboard can surface — call it out.
  const allUp = trend15 === 'UPTREND' && trend1h === 'UPTREND' && trend4h === 'UPTREND'
  const allDown = trend15 === 'DOWNTREND' && trend1h === 'DOWNTREND' && trend4h === 'DOWNTREND'
  const aligned = allUp || allDown
  const alignedColor = allUp ? COLOR_BULL : allDown ? COLOR_BEAR : '#888888'

  // Timeframe button — extracted so the three buttons share style.
  // Active TF: bright text + bottom border underline.
  // Inactive TF: muted text, no border. Both transparent bg.
  function TfButton({ tf }: { tf: Timeframe }) {
    const isActive = activeTimeframe === tf
    return (
      <button
        type="button"
        onClick={() => setActiveTimeframe(tf)}
        style={{
          background: 'transparent',
          border: 'none',
          borderBottom: isActive ? '1px solid #e5e5e5' : 'none',
          color: isActive ? '#e5e5e5' : '#444444',
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          padding: '0 8px',
          letterSpacing: '0.1em',
          cursor: 'pointer',
          // Match the legend bar height so the underline sits on
          // the strip's bottom border line.
          height: '22px',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        {tf}
      </button>
    )
  }

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
        {/* Legend bar — timeframe switcher on the left, then the
            symbol+TF label, EMA swatches, AI level swatches, and
            (right-anchored) pattern count + loading marker. */}
        <div
          data-section="gold-chart-legend"
          style={{
            height: '22px',
            minHeight: '22px',
            background: '#0d0d0d',
            borderBottom: '1px solid #161616',
            display: 'flex',
            alignItems: 'center',
            padding: '0 4px 0 4px',
            gap: '12px',
            fontSize: '9px',
            letterSpacing: '0.08em',
          }}
        >
          <div data-section="gold-chart-tf-switcher" style={{ display: 'flex', alignItems: 'center' }}>
            <TfButton tf="15M" />
            <TfButton tf="1H" />
            <TfButton tf="4H" />
          </div>
          <span style={{ color: '#444444', paddingLeft: '4px' }}>
            XAUUSD · {activeTimeframe}
          </span>
          <span style={{ color: COLOR_EMA20 }}>● EMA20</span>
          <span style={{ color: COLOR_EMA50 }}>● EMA50</span>
          {/* EMA200 is only meaningful on 1H — fade the swatch on
              other timeframes so the trader sees at a glance that
              the line isn't drawn there. */}
          <span style={{ color: activeTimeframe === '1H' ? COLOR_EMA200 : '#222222' }}>
            ● EMA200
          </span>
          {activePatterns.length > 0 && (
            <Tooltip
              position="bottom"
              content="Candlestick patterns detected on this timeframe. Arrows show pattern location on the candles. Bullish patterns shown below candles in green, bearish above in red, neutral (compression) as amber circles."
            >
              <span style={{ color: COLOR_NEUTRAL }}>
                ● {activePatterns.length} PATTERN{activePatterns.length > 1 ? 'S' : ''}
              </span>
            </Tooltip>
          )}
          {hasEntry && <span style={{ color: COLOR_ENTRY }}>┄ ENTRY</span>}
          {hasStop && <span style={{ color: COLOR_STOP }}>┄ STOP</span>}
          {hasTarget && <span style={{ color: COLOR_TARGET }}>┄ TARGET</span>}
          {technicals.loading && (
            <span style={{ marginLeft: 'auto', color: '#333333', letterSpacing: '0.12em' }}>
              UPDATING...
            </span>
          )}
        </div>

        {/* Trend alignment strip — three TF badges + an ALIGNED
            indicator when all three agree. Sits between the legend
            bar and the chart canvas; same dark bg, thin separator. */}
        <div
          data-section="gold-chart-alignment"
          style={{
            height: '16px',
            minHeight: '16px',
            background: '#0d0d0d',
            borderBottom: '1px solid #161616',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: '12px',
            fontSize: '8px',
            letterSpacing: '0.1em',
          }}
        >
          <span style={{ color: trendColor(trend4h) }}>
            4H: {trend4h.replace('TREND', '')}
          </span>
          <span style={{ color: trendColor(trend1h) }}>
            1H: {trend1h.replace('TREND', '')}
          </span>
          <span style={{ color: trendColor(trend15) }}>
            15M: {trend15.replace('TREND', '')}
          </span>
          {aligned && (
            <Tooltip
              position="bottom"
              content="All three timeframes (4H, 1H, 15M) show the same trend direction. This is a high-conviction confluence signal — the strongest technical setup the system can identify."
            >
              <span style={{ color: alignedColor, fontWeight: 500 }}>● ALIGNED</span>
            </Tooltip>
          )}
        </div>

        {/* The chart container — Lightweight Charts attaches its
            canvas here. flex:1 + minHeight:0 so it shrinks to
            fit the remaining vertical space inside the 70%
            section after the two strips above. */}
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
