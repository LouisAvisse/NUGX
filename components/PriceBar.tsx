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
//   9. JOURNAL button      (margin-left:auto) opens the slide-in
//                          trade journal overlay
//  10. LIVE indicator      pulsing green dot + LIVE label
//
// Data sources:
//   - useGoldPrice (polls /api/price every 30s) → price/change/high/low
//   - getCurrentSession (pure UTC-hour math)    → session name + flag

'use client'

import { useState } from 'react'
import { useGoldPrice } from '@/lib/hooks/useGoldPrice'
import { getCurrentSession } from '@/lib/session'
import { formatPrice, formatChange, formatPct, changeColor } from '@/lib/utils'
import type { SessionName } from '@/lib/types'
import JournalPanel from '@/components/JournalPanel'

// Map a session name to its label color per the design system.
function sessionColor(name: SessionName): string {
  if (name === 'NY/London Overlap') return '#fbbf24'
  if (name === 'London' || name === 'New York') return '#60a5fa'
  if (name === 'Tokyo') return '#888888'
  return '#444444' // Off-hours
}

const PLACEHOLDER = '——'

export default function PriceBar() {
  const { data } = useGoldPrice()
  const session = getCurrentSession()

  // Journal overlay state — owned here for now. The keyboard-
  // shortcuts commit will lift this to app/page.tsx so `J`/`ESC`
  // can drive it globally.
  const [isJournalOpen, setIsJournalOpen] = useState(false)

  // Hover state for the JOURNAL button — inline `:hover` isn't
  // available with style={{}} so we track a boolean.
  const [hoverJournal, setHoverJournal] = useState(false)

  return (
    <>
      {/* Inline keyframes — scoped to this component. */}
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
        {/* 1. SYMBOL */}
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
          <span style={{ color: '#333333', fontSize: '8px' }}>GOLD SPOT</span>
        </div>

        {/* 2. PRICE */}
        <div
          style={{
            color: data ? '#e5e5e5' : '#444444',
            fontSize: '20px',
            fontWeight: 500,
          }}
        >
          {data ? formatPrice(data.price) : PLACEHOLDER}
        </div>

        {/* 3. CHANGE */}
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

        {/* 4. Divider */}
        <div style={{ width: '1px', height: '20px', background: '#222222' }} />

        {/* 5. HIGH */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#444444', fontSize: '9px' }}>H</span>
          <span style={{ color: '#4ade80', fontSize: '11px' }}>
            {data ? formatPrice(data.high) : PLACEHOLDER}
          </span>
        </div>

        {/* 6. LOW */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#444444', fontSize: '9px' }}>L</span>
          <span style={{ color: '#f87171', fontSize: '11px' }}>
            {data ? formatPrice(data.low) : PLACEHOLDER}
          </span>
        </div>

        {/* 7. Divider */}
        <div style={{ width: '1px', height: '20px', background: '#222222' }} />

        {/* 8. SESSION */}
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
            {session.isHighVolatility && (
              <span className="pulse" style={{ color: '#fbbf24' }}>
                ●
              </span>
            )}
            {session.name}
          </span>
        </div>

        {/* 9. JOURNAL button — anchored right via marginLeft:auto so the
            LIVE indicator that follows still ends up on the far edge. */}
        <button
          onClick={() => setIsJournalOpen(true)}
          onMouseEnter={() => setHoverJournal(true)}
          onMouseLeave={() => setHoverJournal(false)}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: `1px solid ${hoverJournal ? '#444444' : '#222222'}`,
            color: hoverJournal ? '#e5e5e5' : '#444444',
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            padding: '3px 8px',
            cursor: 'pointer',
            letterSpacing: '0.1em',
          }}
        >
          JOURNAL
        </button>

        {/* 10. LIVE indicator */}
        <div
          style={{
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

      {/* Slide-in journal overlay — rendered inline so PriceBar
          owns the open/close state. The panel uses position:fixed
          so it overlays the dashboard rather than displacing it. */}
      <JournalPanel
        isOpen={isJournalOpen}
        onClose={() => setIsJournalOpen(false)}
      />
    </>
  )
}
