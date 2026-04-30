// SignalsPanel — middle slot of the right column.
//
// Displays the four macro signals that matter for an XAU/USD
// trader, in fixed order:
//   Row 1  DXY            — US Dollar Index level + intraday %
//   Row 2  US 10Y         — 10-year Treasury yield + intraday %
//   Row 3  SPREAD         — bid/ask spread (static "0.35" for now)
//   Row 4  SESSION VOL    — HIGH only during NY/London Overlap
//
// Inverse-correlation tint:
//   DXY and US10Y both move OPPOSITE to gold most days. So the
//   `value` cell is colored with the *inverse* of the change sign:
//   a positive (bullish dollar / yield) move shows the value in
//   red because that's bearish for gold; a negative move shows
//   the value in green. The accompanying `changePct` cell still
//   uses the direct sign tint via changeColor() so the trader can
//   see both perspectives in one glance.
//
// Data sources:
//   - useSignals (polls /api/signals every 60s) → DXY + US10Y
//   - getCurrentSession (UTC-hour math)         → vol flag for row 4

'use client'

import { useSignals } from '@/lib/hooks/useSignals'
import { getCurrentSession } from '@/lib/session'
import { formatPct, changeColor } from '@/lib/utils'

// Inverse-of-sign tint for the *value* of DXY / US10Y rows.
// > 0 → bearish for gold → red ; < 0 → bullish for gold → green.
function inverseValueColor(change: number): string {
  if (change > 0) return '#f87171'
  if (change < 0) return '#4ade80'
  return '#e5e5e5'
}

// Reused for every loading-state cell so widths stay stable when
// the first /api/signals tick arrives.
const PLACEHOLDER = '——'

// Shared row chrome — extracted as constants (not a component) so
// each row's content stays inline and obvious in the JSX.
const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  height: '22px',
}
const labelStyle: React.CSSProperties = {
  color: '#666666',
  fontSize: '10px',
  textTransform: 'uppercase',
}
const rightSideStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  gap: '8px',
  alignItems: 'baseline',
}

export default function SignalsPanel() {
  const { data } = useSignals()
  // Re-evaluated on every render so the SESSION VOL row updates
  // automatically when the trader rolls into the next session.
  const session = getCurrentSession()

  // Optional-chained — both will be undefined until the first
  // fetch settles. The narrowing checks below switch the
  // affected cells to the loading placeholder.
  const dxy = data?.dxy
  const us10y = data?.us10y

  // "UPD HH:MM" once data has loaded, "UPDATING..." beforehand.
  // No timeZone option here — uses the trader's local wall clock,
  // which is what they want for a "last updated" footer.
  const upd = data
    ? `UPD ${new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })}`
    : 'UPDATING...'

  return (
    <div
      style={{
        background: '#111111',
        border: '1px solid #222222',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      {/* Panel header — small, muted, with a hairline divider below. */}
      <div
        style={{
          color: '#444444',
          fontSize: '9px',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          borderBottom: '1px solid #222222',
          paddingBottom: '6px',
          marginBottom: '2px',
        }}
      >
        MARKET SIGNALS
      </div>

      {/* Row 1 — DXY (no $ sign; index level via toFixed(2)). */}
      <div style={rowStyle}>
        <span style={labelStyle}>DXY</span>
        <div style={rightSideStyle}>
          <span
            style={{
              color: dxy ? inverseValueColor(dxy.change) : '#333333',
              fontSize: '11px',
            }}
          >
            {dxy ? dxy.price.toFixed(2) : PLACEHOLDER}
          </span>
          <span
            style={{
              color: dxy ? changeColor(dxy.change) : '#333333',
              fontSize: '10px',
            }}
          >
            {dxy ? formatPct(dxy.changePct) : PLACEHOLDER}
          </span>
        </div>
      </div>

      {/* Row 2 — US 10Y (yield in percent, suffixed with "%"). */}
      <div style={rowStyle}>
        <span style={labelStyle}>US 10Y</span>
        <div style={rightSideStyle}>
          <span
            style={{
              color: us10y ? inverseValueColor(us10y.change) : '#333333',
              fontSize: '11px',
            }}
          >
            {us10y ? `${us10y.price.toFixed(2)}%` : PLACEHOLDER}
          </span>
          <span
            style={{
              color: us10y ? changeColor(us10y.change) : '#333333',
              fontSize: '10px',
            }}
          >
            {us10y ? formatPct(us10y.changePct) : PLACEHOLDER}
          </span>
        </div>
      </div>

      {/* Row 3 — SPREAD (static placeholder until a real source lands). */}
      <div style={rowStyle}>
        <span style={labelStyle}>SPREAD</span>
        <div style={rightSideStyle}>
          <span style={{ color: '#e5e5e5', fontSize: '11px' }}>0.35</span>
        </div>
      </div>

      {/* Row 4 — SESSION VOL — pure session-driven, no fetch needed. */}
      <div style={rowStyle}>
        <span style={labelStyle}>SESSION VOL</span>
        <div style={rightSideStyle}>
          <span
            style={{
              color: session.isHighVolatility ? '#fbbf24' : '#888888',
              fontSize: '11px',
            }}
          >
            {session.isHighVolatility ? 'HIGH' : 'NORMAL'}
          </span>
        </div>
      </div>

      {/* UPD footer — hairline divider + last-update marker. */}
      <div
        style={{
          borderTop: '1px solid #222222',
          marginTop: '4px',
          paddingTop: '6px',
          color: '#333333',
          fontSize: '9px',
        }}
      >
        {upd}
      </div>
    </div>
  )
}
