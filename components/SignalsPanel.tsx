// SignalsPanel — middle slot of the right column.
//
// Two sections inside one panel:
//
//   MACRO     — DXY, US 10Y, SPREAD (static), SESSION VOL.
//                Inverse-correlation tint on DXY/US10Y values
//                (rising dollar / yields = bearish for gold = red).
//
//   TECHNICAL — RSI(14) + OB/OS badge, MACD histogram + cross
//                badge, TREND, EMA STACK chip, ATR(14) + vol
//                context, BB BAND position, DAY RANGE progress bar.
//                Uses /api/technicals via useTechnicals.
//
// Three render modes:
//   loading (no data)  → shimmer skeletons in value cells
//   error              → "SIGNAL ERROR" banner; rows show "——"
//   data               → real values + pct change
// Skeleton + pulse keyframes live in app/globals.css.

'use client'

import { useEffect, useRef, useState } from 'react'
import { useSignals } from '@/lib/hooks/useSignals'
import { useTechnicals } from '@/lib/hooks/useTechnicals'
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

// Style for the small section labels ("MACRO" / "TECHNICAL")
// that sit above each block.
const sectionLabelStyle: React.CSSProperties = {
  color: '#333333',
  fontSize: '8px',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
}

// Single shimmer bar — used for skeleton placeholders in the
// TECHNICAL rows.
function Shim({ width, height }: { width: string; height: number }) {
  return (
    <div
      className="shimmer"
      style={{
        width,
        height: `${height}px`,
        background: '#1a1a1a',
        borderRadius: '2px',
      }}
    />
  )
}

// ATR → volatility context tier label.
function atrContext(atr: number): { text: string; color: string } {
  if (atr > 25) return { text: 'HIGH VOL', color: '#f87171' }
  if (atr > 15) return { text: 'NORMAL', color: '#888888' }
  return { text: 'LOW VOL', color: '#4ade80' }
}

// Color for DAY RANGE fill — extended (>70%) red, mid muted, low (<30%) green.
function dayRangeFillColor(pct: number): string {
  if (pct > 70) return '#f87171'
  if (pct < 30) return '#4ade80'
  return '#888888'
}

export default function SignalsPanel() {
  const { data, loading, error } = useSignals()
  const technicals = useTechnicals()
  const session = getCurrentSession()

  const dxy = data?.dxy
  const us10y = data?.us10y
  const ind = technicals.indicators

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

  // Mirror flag for the TECHNICAL section — same logic but
  // against the technicals hook so the two sections can be in
  // different states (e.g. macro fetched but technicals still
  // loading).
  const showTechSkeleton =
    !ind && technicals.loading && !technicals.error

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

      {/* MACRO section header — small muted label above the
          DXY/US10Y/SPREAD/SESSION VOL rows. */}
      <div style={{ ...sectionLabelStyle, marginBottom: '4px' }}>
        MACRO
      </div>

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

      {/* TECHNICAL section header. */}
      <div
        style={{
          ...sectionLabelStyle,
          marginTop: '8px',
          marginBottom: '4px',
        }}
      >
        TECHNICAL
      </div>

      {/* RSI 14 — value tinted by zone, OB/OS suffix badge. */}
      <div style={rowStyle}>
        <Tooltip
          position="right"
          content="Relative Strength Index over 14 periods. 0-100 momentum scale. ≥70 = OVERBOUGHT (potential reversal down). ≤30 = OVERSOLD (potential reversal up). 40-60 = neutral."
        >
          <span style={labelStyle}>RSI 14</span>
        </Tooltip>
        <div style={rightSideStyle}>
          {showTechSkeleton ? (
            <Shim width="60px" height={10} />
          ) : ind ? (
            <>
              <span
                style={{
                  color:
                    ind.rsiZone === 'OVERBOUGHT'
                      ? '#f87171'
                      : ind.rsiZone === 'OVERSOLD'
                        ? '#4ade80'
                        : '#e5e5e5',
                  fontSize: '11px',
                }}
              >
                {ind.rsi.toFixed(1)}
              </span>
              {ind.rsiZone === 'OVERBOUGHT' && (
                <span style={{ color: '#f87171', fontSize: '8px' }}>OB</span>
              )}
              {ind.rsiZone === 'OVERSOLD' && (
                <span style={{ color: '#4ade80', fontSize: '8px' }}>OS</span>
              )}
            </>
          ) : (
            <span style={{ color: '#333333', fontSize: '11px' }}>
              {PLACEHOLDER}
            </span>
          )}
        </div>
      </div>

      {/* MACD — histogram + cross badge. */}
      <div style={rowStyle}>
        <Tooltip
          position="right"
          content="MACD histogram = MACD line minus signal line. Positive and growing = bullish momentum. Negative and shrinking = bearish. A fresh cross is one of the strongest gold day-trading entry signals."
        >
          <span style={labelStyle}>MACD</span>
        </Tooltip>
        <div style={rightSideStyle}>
          {showTechSkeleton ? (
            <Shim width="60px" height={10} />
          ) : ind ? (
            <>
              <span
                style={{
                  color:
                    ind.macdHistogram > 0
                      ? '#4ade80'
                      : ind.macdHistogram < 0
                        ? '#f87171'
                        : '#888888',
                  fontSize: '11px',
                }}
              >
                {ind.macdHistogram.toFixed(3)}
              </span>
              {ind.macdCross === 'BULLISH_CROSS' && (
                <span style={{ color: '#4ade80', fontSize: '8px' }}>
                  ✕ BULL
                </span>
              )}
              {ind.macdCross === 'BEARISH_CROSS' && (
                <span style={{ color: '#f87171', fontSize: '8px' }}>
                  ✕ BEAR
                </span>
              )}
            </>
          ) : (
            <span style={{ color: '#333333', fontSize: '11px' }}>
              {PLACEHOLDER}
            </span>
          )}
        </div>
      </div>

      {/* TREND — UPTREND green / DOWNTREND red / RANGING muted. */}
      <div style={rowStyle}>
        <Tooltip
          position="right"
          content="Overall 1H trend based on EMA20 vs EMA50 alignment plus price position. UPTREND: price + EMA20 above EMA50. DOWNTREND: mirror. RANGING: mixed. Trade WITH the trend for best results."
        >
          <span style={labelStyle}>TREND</span>
        </Tooltip>
        <div style={rightSideStyle}>
          {showTechSkeleton ? (
            <Shim width="70px" height={10} />
          ) : ind ? (
            <span
              style={{
                color:
                  ind.trend === 'UPTREND'
                    ? '#4ade80'
                    : ind.trend === 'DOWNTREND'
                      ? '#f87171'
                      : '#888888',
                fontSize: '11px',
              }}
            >
              {ind.trend}
            </span>
          ) : (
            <span style={{ color: '#333333', fontSize: '11px' }}>
              {PLACEHOLDER}
            </span>
          )}
        </div>
      </div>

      {/* EMA STACK — compact "20▲ 50▲" badges showing price vs each EMA. */}
      <div style={rowStyle}>
        <Tooltip
          position="right"
          content="Exponential Moving Averages — short (20h) and medium (50h) trend tone. Price above both = bullish structure. EMA20 crossing EMA50 = trend change. For LONG entries, wait for a pullback to EMA20."
        >
          <span style={labelStyle}>EMA 20/50</span>
        </Tooltip>
        <div style={{ ...rightSideStyle, gap: '4px' }}>
          {showTechSkeleton ? (
            <Shim width="60px" height={9} />
          ) : ind ? (
            <>
              <span
                style={{
                  color: ind.priceVsEma20 === 'ABOVE' ? '#4ade80' : '#f87171',
                  fontSize: '9px',
                }}
              >
                20{ind.priceVsEma20 === 'ABOVE' ? '▲' : '▼'}
              </span>
              <span
                style={{
                  color: ind.priceVsEma50 === 'ABOVE' ? '#4ade80' : '#f87171',
                  fontSize: '9px',
                }}
              >
                50{ind.priceVsEma50 === 'ABOVE' ? '▲' : '▼'}
              </span>
            </>
          ) : (
            <span style={{ color: '#333333', fontSize: '9px' }}>
              {PLACEHOLDER}
            </span>
          )}
        </div>
      </div>

      {/* ATR 14 — value + volatility context badge. */}
      <div style={rowStyle}>
        <Tooltip
          position="right"
          content="Average True Range (14) — current volatility in dollars. Use to size stops: stop = entry ± 1-1.5 × ATR. Higher ATR means wider stops needed but also bigger potential moves."
        >
          <span style={labelStyle}>ATR 14</span>
        </Tooltip>
        <div style={rightSideStyle}>
          {showTechSkeleton ? (
            <Shim width="60px" height={10} />
          ) : ind ? (
            (() => {
              const ctx = atrContext(ind.atr)
              return (
                <>
                  <span style={{ color: '#888888', fontSize: '11px' }}>
                    ${ind.atr.toFixed(2)}
                  </span>
                  <span style={{ color: ctx.color, fontSize: '8px' }}>
                    {ctx.text}
                  </span>
                </>
              )
            })()
          ) : (
            <span style={{ color: '#333333', fontSize: '11px' }}>
              {PLACEHOLDER}
            </span>
          )}
        </div>
      </div>

      {/* BB BAND — where price sits vs Bollinger upper / lower. */}
      <div style={rowStyle}>
        <Tooltip
          position="right"
          content="Bollinger Bands (20, 2σ). Price above upper = overextended, likely to mean-revert. Below lower = oversold, likely to bounce. Inside = normal range. Squeeze = volatility breakout coming."
        >
          <span style={labelStyle}>BB BAND</span>
        </Tooltip>
        <div style={rightSideStyle}>
          {showTechSkeleton ? (
            <Shim width="80px" height={9} />
          ) : ind && data ? (
            (() => {
              // We don't have the live spot in this hook, but we
              // do have BB upper/lower and the current macro
              // signals don't include price. Fallback: derive
              // position by comparing the latest indicator's
              // EMA20 (a proxy for "current") against the bands.
              // This approximates "where price is now". For an
              // exact read once useGoldPrice is wired in here,
              // swap to goldPrice.data.price.
              const reference = ind.ema20
              if (reference === 0)
                return (
                  <span style={{ color: '#888888', fontSize: '9px' }}>
                    INSIDE BANDS
                  </span>
                )
              if (reference > ind.bbUpper)
                return (
                  <span style={{ color: '#f87171', fontSize: '9px' }}>
                    ABOVE UPPER
                  </span>
                )
              if (reference < ind.bbLower)
                return (
                  <span style={{ color: '#4ade80', fontSize: '9px' }}>
                    BELOW LOWER
                  </span>
                )
              return (
                <span style={{ color: '#888888', fontSize: '9px' }}>
                  INSIDE BANDS
                </span>
              )
            })()
          ) : (
            <span style={{ color: '#333333', fontSize: '9px' }}>
              {PLACEHOLDER}
            </span>
          )}
        </div>
      </div>

      {/* DAY RANGE — thin progress bar + numeric %. */}
      <div style={{ paddingTop: '2px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '4px',
          }}
        >
          <Tooltip
            position="right"
            content="Where current price sits within today's high-low range. 0% = at the day low, 100% = at the day high. Above 70% means gold is extended (risky for new longs). Below 30% means room to run."
          >
            <span style={labelStyle}>DAY RANGE</span>
          </Tooltip>
          <span
            style={{
              color: '#444444',
              fontSize: '8px',
            }}
          >
            {showTechSkeleton ? '——' : ind ? `${ind.dayRangePct.toFixed(0)}%` : PLACEHOLDER}
          </span>
        </div>
        {/* Progress bar. */}
        <div
          style={{
            width: '100%',
            height: '3px',
            background: '#1e1e1e',
            borderRadius: '1px',
            overflow: 'hidden',
          }}
        >
          {ind && !showTechSkeleton && (
            <div
              style={{
                width: `${Math.max(0, Math.min(100, ind.dayRangePct))}%`,
                height: '100%',
                background: dayRangeFillColor(ind.dayRangePct),
                borderRadius: '1px',
              }}
            />
          )}
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
