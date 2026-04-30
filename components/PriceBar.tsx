// PriceBar — top bar of the dashboard.
//
// Layout (left → right, gap 16px, full 48px tall):
//   1. SYMBOL block        XAU/USD / GOLD SPOT
//   2. PRICE block         current spot, 20px (or skeleton / "UNAVAILABLE")
//   3. CHANGE block        +12.30 (+0.38%) tinted by sign
//   4. divider             1px × 20px, #222
//   5. HIGH block          H / session high (green)
//   6. LOW block           L / session low  (red)
//   7. divider             1px × 20px, #222
//   8. SESSION block       optional pulsing dot + session name
//   9. JOURNAL button      (margin-left:auto) opens the journal overlay
//  10. LIVE indicator      pulsing green dot + LIVE label
//
// Render branches on the useGoldPrice hook state:
//   loading (no data yet)   → shimmering skeleton bars in PRICE/CHG/H/L
//   error                   → "UNAVAILABLE" red in PRICE; "——" in CHG/H/L
//   data                    → real values
// pulse + shimmer keyframes live in app/globals.css now — no
// component-local <style> tag any more.

'use client'

import { useEffect, useRef, useState } from 'react'
import { useGoldPrice } from '@/lib/hooks/useGoldPrice'
import { getCurrentSession } from '@/lib/session'
import { formatPrice, formatChange, formatPct, changeColor } from '@/lib/utils'
import type { SessionName } from '@/lib/types'
import JournalPanel from '@/components/JournalPanel'

function sessionColor(name: SessionName): string {
  if (name === 'NY/London Overlap') return '#fbbf24'
  if (name === 'London' || name === 'New York') return '#60a5fa'
  if (name === 'Tokyo') return '#888888'
  return '#444444'
}

const PLACEHOLDER = '——'

// Reusable shimmer bar — width/height per call site.
function Skeleton({ width, height }: { width: number; height: number }) {
  return (
    <div
      className="shimmer"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        background: '#1a1a1a',
        borderRadius: '2px',
      }}
    />
  )
}

export default function PriceBar() {
  const { data, loading, error } = useGoldPrice()
  const session = getCurrentSession()

  const [isJournalOpen, setIsJournalOpen] = useState(false)
  const [hoverJournal, setHoverJournal] = useState(false)

  // Price flash — when a new tick's price differs from the last,
  // tint the price block green or red for ~600ms. The first
  // observed price seeds the ref without flashing (no baseline
  // to compare against).
  const prevPriceRef = useRef<number | null>(null)
  const [flashClass, setFlashClass] = useState('')
  useEffect(() => {
    const next = data?.price
    if (next === undefined || next === null) return
    if (prevPriceRef.current === null) {
      prevPriceRef.current = next
      return
    }
    if (next > prevPriceRef.current) {
      setFlashClass('flash-green')
    } else if (next < prevPriceRef.current) {
      setFlashClass('flash-red')
    }
    prevPriceRef.current = next
    const timer = setTimeout(() => setFlashClass(''), 600)
    return () => clearTimeout(timer)
  }, [data?.price])

  return (
    <>
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

        {/* 2. PRICE — three states. Error wins over loading wins
            over normal so a recovered fetch shows real data.
            flashClass is set by the useEffect above to flash-green/
            flash-red on each tick that changes the price. */}
        <div
          className={flashClass}
          style={{
            color: data && !error ? '#e5e5e5' : '#444444',
            fontSize: '20px',
            fontWeight: 500,
            padding: '2px 6px',
          }}
        >
          {error ? (
            <span style={{ color: '#f87171', fontSize: '11px' }}>
              UNAVAILABLE
            </span>
          ) : loading && !data ? (
            <Skeleton width={120} height={20} />
          ) : data ? (
            formatPrice(data.price)
          ) : (
            PLACEHOLDER
          )}
        </div>

        {/* 3. CHANGE */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {error ? (
            <span style={{ color: '#333333', fontSize: '12px' }}>
              {PLACEHOLDER}
            </span>
          ) : loading && !data ? (
            <Skeleton width={80} height={12} />
          ) : (
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
          )}
        </div>

        {/* 4. Divider */}
        <div style={{ width: '1px', height: '20px', background: '#222222' }} />

        {/* 5. HIGH */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#444444', fontSize: '9px' }}>H</span>
          {error ? (
            <span style={{ color: '#333333', fontSize: '11px' }}>
              {PLACEHOLDER}
            </span>
          ) : loading && !data ? (
            <Skeleton width={60} height={11} />
          ) : (
            <span style={{ color: '#4ade80', fontSize: '11px' }}>
              {data ? formatPrice(data.high) : PLACEHOLDER}
            </span>
          )}
        </div>

        {/* 6. LOW */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#444444', fontSize: '9px' }}>L</span>
          {error ? (
            <span style={{ color: '#333333', fontSize: '11px' }}>
              {PLACEHOLDER}
            </span>
          ) : loading && !data ? (
            <Skeleton width={60} height={11} />
          ) : (
            <span style={{ color: '#f87171', fontSize: '11px' }}>
              {data ? formatPrice(data.low) : PLACEHOLDER}
            </span>
          )}
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

        {/* 9. JOURNAL button */}
        <button
          className="terminal-btn"
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
          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <span className="pulse" style={{ color: '#4ade80', fontSize: '8px' }}>
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

      <JournalPanel
        isOpen={isJournalOpen}
        onClose={() => setIsJournalOpen(false)}
      />
    </>
  )
}
