// BottomBar — fixed footer of the dashboard.
//
// Single horizontal row of stat blocks separated by 1px dividers,
// with the last block (UPDATED time + LIVE dot) anchored to the
// far right via margin-left:auto.
//
// Order (left → right):
//   OPEN, PREV, CHG, H, L, 52W H, 52W L, UPDATED ●
//
// 52W H / 52W L are static for now — the GoldPrice contract in
// lib/types.ts doesn't carry 52-week extremes and gold-api.com
// doesn't return them either. Kept hardcoded so the layout reads
// complete; will be wired to a real source in a later commit.
//
// Data source:
//   - useGoldPrice (polls /api/price every 30s) → open, prevClose,
//     change, changePct, high, low, lastUpdated.

'use client'

import { useEffect, useState } from 'react'
import { useGoldPrice } from '@/lib/hooks/useGoldPrice'
import { formatPrice, formatPct, changeColor } from '@/lib/utils'
import Tooltip from '@/components/Tooltip'

const PLACEHOLDER = '——'

// Shared block layout — applied to every stat container.
const blockStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '0 14px',
}

// Tiny uppercase label tone shared by every stat.
const labelStyle: React.CSSProperties = {
  color: '#444444',
  fontSize: '8px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  flexShrink: 0,
}

// Value cell — fixed font-size + flex-shrink so dividers don't
// collapse under width pressure.
const valueStyle: React.CSSProperties = {
  fontSize: '10px',
  flexShrink: 0,
}

// 1px × 16px hairline; reused between every stat block.
function Divider() {
  return (
    <div
      style={{
        width: '1px',
        height: '16px',
        background: '#222222',
        flexShrink: 0,
      }}
    />
  )
}

export default function BottomBar() {
  const { data, lastUpdated } = useGoldPrice()

  // Fade-in once on the first successful price tick. After that
  // hasLoaded stays true so the bar doesn't re-animate on every
  // poll.
  const [hasLoaded, setHasLoaded] = useState(false)
  useEffect(() => {
    if (data && !hasLoaded) setHasLoaded(true)
  }, [data, hasLoaded])

  // 24h HH:MM:SS, defaults to the trader's local zone (no timeZone
  // option here — the spec wants raw local time).
  const updatedText = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : PLACEHOLDER

  return (
    <>
      <div
        className={hasLoaded ? 'fade-in' : ''}
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 0,
          background: 'transparent',
          overflow: 'hidden',
        }}
      >
        {/* OPEN */}
        <div style={blockStyle}>
          <Tooltip
            content="Today's opening price for gold. Compare with current price to gauge intraday direction. Price above open = buyers in control today."
          >
            <span style={labelStyle}>OPEN</span>
          </Tooltip>
          <span
            style={{
              ...valueStyle,
              color: data ? '#e5e5e5' : '#333333',
            }}
          >
            {data ? formatPrice(data.open) : PLACEHOLDER}
          </span>
        </div>
        <Divider />

        {/* PREV CLOSE */}
        <div style={blockStyle}>
          <Tooltip content="Yesterday's closing price. The difference between PREV and current price is today's total move so far.">
            <span style={labelStyle}>PREV</span>
          </Tooltip>
          <span
            style={{
              ...valueStyle,
              color: data ? '#e5e5e5' : '#333333',
            }}
          >
            {data ? formatPrice(data.prevClose) : PLACEHOLDER}
          </span>
        </div>
        <Divider />

        {/* DAY CHANGE — formatPrice(change) + parenthesized pct,
            colored by direct sign tint via changeColor. */}
        <div style={blockStyle}>
          <Tooltip content="Today's price change in dollars and percentage from yesterday's close. Positive = gold up on the day. Negative = gold down on the day.">
            <span style={labelStyle}>CHG</span>
          </Tooltip>
          <span
            style={{
              ...valueStyle,
              color: data ? changeColor(data.change) : '#333333',
            }}
          >
            {data
              ? `${formatPrice(data.change)} (${formatPct(data.changePct)})`
              : PLACEHOLDER}
          </span>
        </div>
        <Divider />

        {/* DAY HIGH */}
        <div style={blockStyle}>
          <span style={labelStyle}>H</span>
          <span
            style={{
              ...valueStyle,
              color: data ? '#4ade80' : '#333333',
            }}
          >
            {data ? formatPrice(data.high) : PLACEHOLDER}
          </span>
        </div>
        <Divider />

        {/* DAY LOW */}
        <div style={blockStyle}>
          <span style={labelStyle}>L</span>
          <span
            style={{
              ...valueStyle,
              color: data ? '#f87171' : '#333333',
            }}
          >
            {data ? formatPrice(data.low) : PLACEHOLDER}
          </span>
        </div>
        <Divider />

        {/* 52W H — static placeholder until a real 52-week source lands. */}
        <div style={blockStyle}>
          <Tooltip content="Highest gold price in the past 52 weeks. A major resistance level — if current price approaches this, expect selling pressure and potential reversal.">
            <span style={labelStyle}>52W H</span>
          </Tooltip>
          <span style={{ ...valueStyle, color: '#4ade80' }}>$3,500.00</span>
        </div>
        <Divider />

        {/* 52W L — static placeholder until a real 52-week source lands. */}
        <div style={blockStyle}>
          <Tooltip
            position="left"
            content="Lowest gold price in the past 52 weeks. A major support level — if current price approaches this, expect buying interest and potential bounce."
          >
            <span style={labelStyle}>52W L</span>
          </Tooltip>
          <span style={{ ...valueStyle, color: '#f87171' }}>$2,287.00</span>
        </div>
        <Divider />

        {/* UPDATED + LIVE dot — anchored to the right edge via marginLeft:auto.
            The dot pulses green to mark the dashboard as live. */}
        <div style={{ ...blockStyle, marginLeft: 'auto' }}>
          <span style={labelStyle}>UPDATED</span>
          <span
            style={{
              ...valueStyle,
              color: lastUpdated ? '#444444' : '#333333',
            }}
          >
            {updatedText}
          </span>
        </div>
        <span
          className="pulse"
          style={{ color: '#4ade80', fontSize: '8px', marginLeft: '8px' }}
        >
          ●
        </span>
      </div>
    </>
  )
}
