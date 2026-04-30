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

import { useSignals } from '@/lib/hooks/useSignals'
import { getCurrentSession } from '@/lib/session'
import { formatPct, changeColor } from '@/lib/utils'

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

export default function SignalsPanel() {
  const { data, loading, error } = useSignals()
  const session = getCurrentSession()

  const dxy = data?.dxy
  const us10y = data?.us10y

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
        <span style={labelStyle}>DXY</span>
        <div style={rightSideStyle}>
          {showSkeleton ? (
            <CellSkeletons />
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* US10Y row */}
      <div style={rowStyle}>
        <span style={labelStyle}>US 10Y</span>
        <div style={rightSideStyle}>
          {showSkeleton ? (
            <CellSkeletons />
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* SPREAD row — static. */}
      <div style={rowStyle}>
        <span style={labelStyle}>SPREAD</span>
        <div style={rightSideStyle}>
          <span style={{ color: '#e5e5e5', fontSize: '11px' }}>0.35</span>
        </div>
      </div>

      {/* SESSION VOL row — pure session-driven, no fetch. */}
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
