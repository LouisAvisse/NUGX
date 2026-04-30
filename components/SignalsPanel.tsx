// SignalsPanel — middle slot of the right column.
//
// Renders four rows: DXY, US 10Y, SPREAD (static), SESSION VOL.
// Inverse-correlation tint on DXY/US10Y values per the macro
// rule (rising dollar / yields = bearish for gold = red value).
//
// Three render modes:
//   loading (no data)  → shimmer skeletons in value cells
//   error              → "SIGNAL ERROR" banner; rows show "——"
//   data               → real values + pct change
// Skeleton + pulse keyframes live in app/globals.css.

'use client'

import { useEffect, useRef, useState } from 'react'
import { useSignals } from '@/lib/hooks/useSignals'
import { getCurrentSession } from '@/lib/session'
import { formatPct, changeColor } from '@/lib/utils'
import Tooltip from '@/components/Tooltip'

function inverseValueColor(change: number): string {
  if (change > 0) return '#f87171'
  if (change < 0) return '#4ade80'
  return '#e5e5e5'
}

const PLACEHOLDER = '——'

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

// Two-bar shimmer used to placehold the value + pct cells.
function CellSkeletons() {
  return (
    <>
      <div
        className="shimmer"
        style={{
          width: '60px',
          height: '10px',
          background: '#1a1a1a',
          borderRadius: '2px',
        }}
      />
      <div
        className="shimmer"
        style={{
          width: '40px',
          height: '8px',
          background: '#1a1a1a',
          borderRadius: '2px',
        }}
      />
    </>
  )
}

// Flash hook — same pattern as PriceBar's price flash. Returns
// the current flash class string (briefly 'flash-green' /
// 'flash-red', then cleared) for the watched value.
function usePriceFlash(value: number | undefined): string {
  const prevRef = useRef<number | null>(null)
  const [flashClass, setFlashClass] = useState('')
  useEffect(() => {
    if (value === undefined || value === null) return
    if (prevRef.current === null) {
      prevRef.current = value
      return
    }
    if (value > prevRef.current) {
      setFlashClass('flash-green')
    } else if (value < prevRef.current) {
      setFlashClass('flash-red')
    }
    prevRef.current = value
    const timer = setTimeout(() => setFlashClass(''), 600)
    return () => clearTimeout(timer)
  }, [value])
  return flashClass
}

export default function SignalsPanel() {
  const { data, loading, error } = useSignals()
  const session = getCurrentSession()

  const dxy = data?.dxy
  const us10y = data?.us10y

  // Flash classes for the DXY and US10Y value cells.
  const dxyFlash = usePriceFlash(dxy?.price)
  const us10yFlash = usePriceFlash(us10y?.price)

  // Show "UPD HH:MM" once we have a successful fetch, else
  // either UPDATING (loading) or "——" (error).
  const upd = data
    ? `UPD ${new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })}`
    : error
      ? PLACEHOLDER
      : 'UPDATING...'

  // True for the "show skeletons" branch — no data yet AND
  // we're still pre-error (errors collapse into the rows-with-
  // dashes branch below).
  const showSkeleton = !data && loading && !error

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
      {/* Header. */}
      <div
        style={{
          borderBottom: '1px solid #222222',
          paddingBottom: '6px',
          marginBottom: '2px',
        }}
      >
        <Tooltip
          position="right"
          content="Key macro indicators that drive gold price. Watch for confluence — when multiple signals agree, the trade signal is stronger."
        >
          <span
            style={{
              color: '#444444',
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            MARKET SIGNALS
          </span>
        </Tooltip>
      </div>

      {/* Optional error banner — rendered only when the signals
          fetch has surfaced an error string. */}
      {error && (
        <div
          style={{
            color: '#f87171',
            fontSize: '9px',
            paddingBottom: '4px',
          }}
        >
          SIGNAL ERROR
        </div>
      )}

      {/* DXY row */}
      <div style={rowStyle}>
        <Tooltip
          position="right"
          content="US Dollar Index — measures USD strength vs 6 major currencies. Gold and DXY are inversely correlated. DXY falling = bullish for gold. DXY rising = bearish. Most important macro signal for gold traders."
        >
          <span style={labelStyle}>DXY</span>
        </Tooltip>
        <div style={rightSideStyle}>
          {showSkeleton ? (
            <CellSkeletons />
          ) : (
            <>
              <span
                className={dxyFlash}
                style={{
                  color: dxy ? inverseValueColor(dxy.change) : '#333333',
                  fontSize: '11px',
                  padding: '1px 4px',
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
            </>
          )}
        </div>
      </div>

      {/* US10Y row */}
      <div style={rowStyle}>
        <Tooltip
          position="right"
          content="US 10-Year Treasury yield. Gold pays no interest, so rising yields make bonds more attractive vs gold. Yield rising = bearish for gold. Yield falling = bullish."
        >
          <span style={labelStyle}>US 10Y</span>
        </Tooltip>
        <div style={rightSideStyle}>
          {showSkeleton ? (
            <CellSkeletons />
          ) : (
            <>
              <span
                className={us10yFlash}
                style={{
                  color: us10y ? inverseValueColor(us10y.change) : '#333333',
                  fontSize: '11px',
                  padding: '1px 4px',
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
            </>
          )}
        </div>
      </div>

      {/* SPREAD row — static. */}
      <div style={rowStyle}>
        <Tooltip
          position="right"
          content="Bid-ask spread in dollars — the cost to enter and exit a gold trade. Lower is better. Widens during low liquidity (off-hours, major news events)."
        >
          <span style={labelStyle}>SPREAD</span>
        </Tooltip>
        <div style={rightSideStyle}>
          <span style={{ color: '#e5e5e5', fontSize: '11px' }}>0.35</span>
        </div>
      </div>

      {/* SESSION VOL row — pure session-driven, no fetch. */}
      <div style={rowStyle}>
        <Tooltip
          position="right"
          content="Expected volume level for current session. HIGH during NY/London overlap (12-16 UTC) when both markets are active. Higher volume means more reliable price action and tighter spreads."
        >
          <span style={labelStyle}>SESSION VOL</span>
        </Tooltip>
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

      {/* UPD footer. */}
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
