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
import { getCurrentSession } from '@/lib/session'
import { formatPrice, formatChange, formatPct, changeColor } from '@/lib/utils'
import type { GoldPrice, SessionName } from '@/lib/types'
import Tooltip from '@/components/Tooltip'

// Props lifted from app/page.tsx so the live price hook only
// runs once at the page root (used both for the dynamic browser
// title and this bar). `isLeftOpen` / `isRightOpen` drive the
// side-column visibility from the toggle chips that live INSIDE
// the bar (the columns can vanish completely as drawers rather
// than collapse to a 28px strip).
interface PriceBarProps {
  data: GoldPrice | null
  loading: boolean
  error: string | null
  isLeftOpen: boolean
  isRightOpen: boolean
  onLeftToggle: () => void
  onRightToggle: () => void
  // On mobile the layout flips to vertical stack and drawers
  // are forced visible — the toggle chips become meaningless.
  // Hide them when isMobile is true.
  isMobile?: boolean
}

function sessionColor(name: SessionName): string {
  if (name === 'NY/London Overlap') return '#fbbf24'
  if (name === 'London' || name === 'New York') return '#60a5fa'
  if (name === 'Tokyo') return '#b0b0b0'
  return '#888888'
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

export default function PriceBar({
  data,
  loading,
  error,
  isLeftOpen,
  isRightOpen,
  onLeftToggle,
  onRightToggle,
  isMobile = false,
}: PriceBarProps) {
  const session = getCurrentSession()

  const [hoverLeft, setHoverLeft] = useState(false)
  const [hoverRight, setHoverRight] = useState(false)

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
        {/* 0. NUGX BRAND — product wordmark anchoring the left
            edge. Bright #f5f5f5, slightly heavier weight, large
            letter-spacing so it reads as a logo, not a label.
            Vertical divider follows to separate brand from data. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span
            style={{
              color: '#f5f5f5',
              fontSize: '15px',
              fontWeight: 600,
              letterSpacing: '0.18em',
              fontFeatureSettings: '"ss01"',
            }}
          >
            NUGX
          </span>
          <div
            style={{
              width: '1px',
              height: '20px',
              background: '#222222',
            }}
          />
        </div>

        {/* 1. SYMBOL — both lines wrapped in tooltips with the
            ISO-code / spot-price explanations from the spec. */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Tooltip
            position="bottom"
            content="XAU is the ISO code for gold. USD is US Dollar. This shows the cost of one troy ounce of gold in dollars on the spot market."
          >
            <span
              style={{
                color: '#888888',
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              XAU/USD
            </span>
          </Tooltip>
          <Tooltip
            position="bottom"
            content="Spot price = current market price for immediate delivery. Different from futures which settle at a later date. This is the real-time trading price."
          >
            <span style={{ color: '#666666', fontSize: '8px' }}>OR SPOT</span>
          </Tooltip>
        </div>

        {/* 2. PRICE — three states. Error wins over loading wins
            over normal so a recovered fetch shows real data.
            flashClass is set by the useEffect above to flash-green/
            flash-red on each tick that changes the price. */}
        <div
          className={flashClass}
          style={{
            color: data && !error ? '#e5e5e5' : '#888888',
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
            <span style={{ color: '#666666', fontSize: '12px' }}>
              {PLACEHOLDER}
            </span>
          ) : loading && !data ? (
            <Skeleton width={80} height={12} />
          ) : (
            <span
              style={{
                color: data ? changeColor(data.change) : '#888888',
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
          <Tooltip
            position="bottom"
            content="Session high — the highest price gold has reached today. Acts as intraday resistance. A breakout above this level is a bullish signal."
          >
            <span style={{ color: '#888888', fontSize: '9px' }}>H</span>
          </Tooltip>
          {error ? (
            <span style={{ color: '#666666', fontSize: '11px' }}>
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
          <Tooltip
            position="bottom"
            content="Session low — the lowest price gold has reached today. Acts as intraday support. A breakdown below this level is a bearish signal."
          >
            <span style={{ color: '#888888', fontSize: '9px' }}>L</span>
          </Tooltip>
          {error ? (
            <span style={{ color: '#666666', fontSize: '11px' }}>
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
          <Tooltip
            position="bottom"
            content="Gold trades 23h/day across global sessions. Tokyo (00-07 UTC): low volume. London (07-12 UTC): high volume. NY/London overlap (12-16 UTC): peak volume, best for day trading. New York (16-21 UTC): high volume, US-driven."
          >
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
          </Tooltip>
        </div>

        {/* Panel toggle chips — anchored to the right via
            marginLeft:auto. Hidden on mobile because the layout
            flips to a vertical stack and both panels are
            forced visible. Each toggle reads its panel's state
            from a prop and shows it via fg/border contrast:
            bright + filled bg when visible, transparent + muted
            when hidden. */}
        <div
          style={{
            marginLeft: 'auto',
            display: isMobile ? 'none' : 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <button
            className="terminal-btn"
            onClick={onLeftToggle}
            onMouseEnter={() => setHoverLeft(true)}
            onMouseLeave={() => setHoverLeft(false)}
            aria-pressed={isLeftOpen}
            aria-label={isLeftOpen ? 'Hide news + calendar' : 'Show news + calendar'}
            style={{
              background: isLeftOpen ? '#161616' : 'transparent',
              border: `1px solid ${
                isLeftOpen ? '#3a3a3a' : hoverLeft ? '#444444' : '#222222'
              }`,
              color: isLeftOpen ? '#f5f5f5' : hoverLeft ? '#c5c5c5' : '#888888',
              fontFamily: 'var(--font-sans)',
              fontSize: '9px',
              padding: '4px 10px',
              cursor: 'pointer',
              letterSpacing: '0.1em',
            }}
          >ACTUS</button>

          <button
            className="terminal-btn"
            onClick={onRightToggle}
            onMouseEnter={() => setHoverRight(true)}
            onMouseLeave={() => setHoverRight(false)}
            aria-pressed={isRightOpen}
            aria-label={isRightOpen ? 'Hide copilot' : 'Show copilot'}
            style={{
              background: isRightOpen ? '#161616' : 'transparent',
              border: `1px solid ${
                isRightOpen ? '#3a3a3a' : hoverRight ? '#444444' : '#222222'
              }`,
              color: isRightOpen ? '#f5f5f5' : hoverRight ? '#c5c5c5' : '#888888',
              fontFamily: 'var(--font-sans)',
              fontSize: '9px',
              padding: '4px 10px',
              cursor: 'pointer',
              letterSpacing: '0.1em',
            }}
          >COPILOTE</button>

        </div>

        {/* 10. LIVE indicator */}
        <Tooltip
          position="left"
          content="Price refreshes every 30 seconds from gold-api.com. During market hours this reflects the real spot price."
        >
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <span
              className="pulse"
              style={{ color: '#4ade80', fontSize: '8px' }}
            >
              ●
            </span>
            <span
              style={{
                color: '#888888',
                fontSize: '9px',
                letterSpacing: '0.1em',
              }}
            >DIRECT</span>
          </span>
        </Tooltip>
      </div>

    </>
  )
}
