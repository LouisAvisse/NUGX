// lib/utils.ts — shared formatters and color helpers used across
// PriceBar, AnalysisPanel, SignalsPanel, NewsFeed, BottomBar.
// Keep helpers pure and dependency-free so any component can import
// without dragging in side effects.

// Format a number as a gold price: $3,285.40
// Intl.NumberFormat handles thousands separators and rounding so
// every panel displays the same canonical price string.
export function formatPrice(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// Format a percentage change: +0.38% or -0.21%
// Forces a leading + on positive values so the sign is always
// visible (Number.toFixed only adds - for negatives).
export function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

// Format a change value with sign: +12.30 or -8.50
// Same +/- convention as formatPct, used for absolute price moves.
export function formatChange(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}`
}

// Format an ISO string to readable time: 14:32
// Pinned to Europe/Paris (the trader's local zone, per the
// TradingView widget config in .claude/context.md) and 24h format
// so timestamps line up with the chart.
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Paris',
  })
}

// Format an ISO string to readable date+time: Apr 30, 14:32
// Used by NewsFeed and the "last analysis at" line in BottomBar
// when the timestamp may be older than today.
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Paris',
  })
}

// Returns color string for a numeric change value.
// Maps to the design system tones from .claude/context.md:
//   positive → bull green, negative → bear red, zero → muted.
export function changeColor(value: number): string {
  if (value > 0) return '#4ade80'
  if (value < 0) return '#f87171'
  return '#888888'
}

// Returns color for bias/recommendation.
// BULLISH → bull green, BEARISH → bear red, NEUTRAL → amber.
// Matches the SignalsPanel/AnalysisPanel badge palette.
export function biasColor(bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL'): string {
  if (bias === 'BULLISH') return '#4ade80'
  if (bias === 'BEARISH') return '#f87171'
  return '#fbbf24'
}
