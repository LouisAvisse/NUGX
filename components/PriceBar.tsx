// PriceBar — top bar of the dashboard.
//
// Layout (left → right, gap 16px, full 48px tall):
//   1. SYMBOL block        XAU/USD / GOLD SPOT
//   2. PRICE block         current spot, 20px
//   3. CHANGE block        +12.30 (+0.38%) tinted by sign
//   4. divider             1px × 20px, #222
//   5. HIGH block          H / session high (green)
//   6. LOW block           L / session low  (red)
//   7. divider             1px × 20px, #222
//   8. SESSION block       optional pulsing dot + session name
//   9. LIVE indicator      pushed to the right via margin-left:auto
//
// Data sources:
//   - useGoldPrice (polls /api/price every 30s) → price/change/high/low
//   - getCurrentSession (pure UTC-hour math)    → session name + flag
//
// Loading state: while `data` is null, PRICE / CHANGE / HIGH / LOW
// all show "——" in tertiary #444 so the layout doesn't shift when
// numbers arrive.

'use client'

import { useGoldPrice } from '@/lib/hooks/useGoldPrice'
import { getCurrentSession } from '@/lib/session'
import { formatPrice, formatChange, formatPct, changeColor } from '@/lib/utils'
import type { SessionName } from '@/lib/types'

// Map a session name to its label color per the design system.
// Overlap → amber (highest urgency), London + NY → blue (active
// prime hours), Tokyo → muted, Off-hours → tertiary (deprioritized).
function sessionColor(name: SessionName): string {
  if (name === 'NY/London Overlap') return '#fbbf24'
  if (name === 'London' || name === 'New York') return '#60a5fa'
  if (name === 'Tokyo') return '#888888'
  return '#444444' // Off-hours
}

// Reusable placeholder string for any field that's still loading.
// Two em-dashes read clearly as "no value yet" without shifting
// the bar's width perceptibly.
const PLACEHOLDER = '——'

export default function PriceBar() {
  const { data } = useGoldPrice()
  // Session is recomputed on every render — cheap, and it keeps
  // the highlighted band in sync as the trader rolls into the
  // next session over the course of the day.
  const session = getCurrentSession()

  return (
    <>
      {/* Inline keyframes — scoped to this component. The .pulse
          class is reused by both the high-vol session dot and the
          LIVE indicator, so defining it once here keeps the bar
          self-contained. */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1 }
          50% { opacity: 0.2 }
        }
        .pulse { animation: pulse 1.5s infinite }
      `}</style>

      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '16px',
          background: 'transparent',
        }}
      >
        {/* 1. SYMBOL — column: ticker on top, descriptor below. */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              color: '#444444',
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            XAU/USD
          </span>
          <span style={{ color: '#333333', fontSize: '8px' }}>
            GOLD SPOT
          </span>
        </div>

        {/* 2. PRICE — single line, the visual focal point of the bar. */}
        <div
          style={{
            color: data ? '#e5e5e5' : '#444444',
            fontSize: '20px',
            fontWeight: 500,
          }}
        >
          {data ? formatPrice(data.price) : PLACEHOLDER}
        </div>

        {/* 3. CHANGE — column wrapper holding a single inline value
            (kept as a column for layout consistency with neighbors).
            Color is dynamic so a glance tells the trader the side. */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              color: data ? changeColor(data.change) : '#444444',
              fontSize: '12px',
            }}
          >
            {data
              ? `${formatChange(data.change)} (${formatPct(data.changePct)})`
              : PLACEHOLDER}
          </span>
        </div>

        {/* 4. Divider. */}
        <div
          style={{ width: '1px', height: '20px', background: '#222222' }}
        />

        {/* 5. HIGH — column: label H / session high in green. */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#444444', fontSize: '9px' }}>H</span>
          <span style={{ color: '#4ade80', fontSize: '11px' }}>
            {data ? formatPrice(data.high) : PLACEHOLDER}
          </span>
        </div>

        {/* 6. LOW — column: label L / session low in red. */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#444444', fontSize: '9px' }}>L</span>
          <span style={{ color: '#f87171', fontSize: '11px' }}>
            {data ? formatPrice(data.low) : PLACEHOLDER}
          </span>
        </div>

        {/* 7. Divider. */}
        <div
          style={{ width: '1px', height: '20px', background: '#222222' }}
        />

        {/* 8. SESSION — column wrapper around an inline-flex line so
            the optional pulsing dot and the name share one row. */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              color: sessionColor(session.name),
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {/* High-volatility marker — only shows during the
                NY/London overlap window (12:00–16:00 UTC). */}
            {session.isHighVolatility && (
              <span className="pulse" style={{ color: '#fbbf24' }}>●</span>
            )}
            {session.name}
          </span>
        </div>

        {/* 9. LIVE indicator — single line, anchored to the right via
            margin-left:auto so it always sits at the bar's far edge
            no matter how wide the rest of the content is. */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span
            className="pulse"
            style={{ color: '#4ade80', fontSize: '8px' }}
          >
            ●
          </span>
          <span
            style={{
              color: '#444444',
              fontSize: '9px',
              letterSpacing: '0.1em',
            }}
          >
            LIVE
          </span>
        </div>
      </div>
    </>
  )
}
